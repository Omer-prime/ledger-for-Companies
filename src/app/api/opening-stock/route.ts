import { apiError, readBody, requirePermission, safeApi } from '@/lib/api-security'
import { getSession, digest } from '@/lib/auth'
import { dbConnect } from '@/lib/db'
import { openingCommand } from '@/lib/opening-stock'
import { defaultBusinessSettings } from '@/lib/business-settings'
import { posAccounting } from '@/lib/pos-accounting'
import { BusinessSettings } from '@/models/BusinessSettings'
import { textileProduction } from '@/models/TextileProduction'

class Invalid extends Error {}

export const GET = safeApi(async function GET() {
  const denied = await requirePermission('configure')
  if (denied) return denied
  const conn = (await dbConnect()).connection
  const { openingBatches } = textileProduction(conn)
  const revision = await posAccounting(conn).findOne({}, {sort:{_id:-1}})
  const batches = await openingBatches.find({}, {projection:{fingerprint:0,'verified.fingerprint':0}}).sort({_id:1}).limit(500).toArray()
  return Response.json(batches.map(batch=>({...batch, approved:revision?.approval?.capitalizedOpeningIds?.includes(batch._id) ?? false})), {headers:{'Cache-Control':'no-store'}})
})

export const POST = safeApi(async function POST(req: Request) {
  const denied = await requirePermission('configure', req)
  if (denied) return denied
  const actor = await getSession()
  if (!actor) return apiError(401, 'Unauthorized')
  const body = await readBody(req, openingCommand)
  if (!body) return apiError(400, 'Invalid opening stock document')
  const conn = (await dbConnect()).connection
  const { thaans, openingBatches } = textileProduction(conn)
  try {
    return await conn.transaction(async session=>{
      const prior = await openingBatches.findOne({_id:body.reference},{session})
      if (body.action==='verify') {
        if (!prior) throw new Invalid('Batch not found')
        const fingerprint = digest(JSON.stringify(body))
        if (prior.verified?.fingerprint===fingerprint) return Response.json({replayed:true})
        if (prior.verified) throw new Invalid('Verified batch is immutable')
        const items=await thaans.find({'opening.reference':body.reference},{session}).toArray()
        const costs=new Map(body.costs?.map(row=>[row.identifier,row.costPaisa]))
        if (costs.size!==(body.costs?.length??0) || [...costs.keys()].some(id=>!items.some(item=>item._id===id))) throw new Invalid('Invalid or duplicate cost reference')
        if (!items.length || items.some(item=>!costs.get(item._id) && !item.opening?.costPaisa)) throw new Invalid('Every item requires verified historical PKR cost')
        for(const item of items) if(costs.has(item._id)) await thaans.updateOne({_id:item._id},{ $set:{'opening.costPaisa':costs.get(item._id)} },{session})
        await openingBatches.updateOne({_id:prior._id},{ $set:{verified:{actor:actor.email,reference:body.verificationReference,at:new Date(),fingerprint}} },{session})
        return Response.json({verified:true})
      }
      const fingerprint=digest(JSON.stringify([body.reference,body.countDate,body.rows]))
      if(prior) {
        if(prior.fingerprint!==fingerprint) throw new Invalid('Batch reference was used with different contents')
        return Response.json({replayed:true})
      }
      const settings=await BusinessSettings.findOne().sort({_id:-1}).session(session).lean()
      const config=settings?.settings??defaultBusinessSettings
      const target=config.thaan.suitsPerThaan
      const taken=new Set((await thaans.find({_id:{$in:body.rows.map(row=>row.identifier)}},{session,projection:{_id:1}}).toArray()).map(row=>row._id))
      const seen=new Set<string>()
      const errors=body.rows.flatMap((row,i)=>{
        const problems=[]
        if(taken.has(row.identifier)||seen.has(row.identifier)) problems.push('identifier already used')
        seen.add(row.identifier)
        if(!config.grades.some(grade=>grade.enabled&&grade.code===row.grade)) problems.push('select an active grade')
        if(row.kind==='full'&&row.suits!==target || row.kind==='partial'&&row.suits>=target || row.kind==='loose'&&row.suits!==1) problems.push('suit count does not match package kind')
        return problems.length?[{row:i+1,error:problems.join('; ')}]:[]
      })
      if(errors.length||body.preview) return Response.json({errors, count:body.rows.length},{status:errors.length?400:200})
      const postedAt=new Date()
      await openingBatches.insertOne({_id:body.reference,countDate:body.countDate,actor:actor.email,postedAt,fingerprint},{session})
      await thaans.insertMany(body.rows.map(row=>({
        _id:row.identifier,orderId:'',lotId:'',batchId:body.reference,
        opening:{version:1 as const,reference:body.reference,kind:row.kind,fabric:row.fabric,design:row.design,size:row.size,
          costPaisa:row.costPaisa,sellingPricePaisa:row.sellingPricePaisa,source:row.source,evidence:row.evidence,countDate:body.countDate,currency:'PKR' as const},
        contents:[{grade:row.grade,label:config.grades.find(grade=>grade.code===row.grade)!.label,suits:row.suits}],
        suits:row.suits,targetSuits:target,defaultTargetSuits:target,defaultSuitLengthUm:row.suitLengthUm,
        suitLengthUm:row.suitLengthUm,totalUm:row.suits*row.suitLengthUm,revision:settings?._id??0,actor:actor.email,postedAt,
      })),{session})
      return Response.json({count:body.rows.length},{status:201})
    })
  } catch(error) {
    if(error instanceof Invalid) return apiError(409,error.message)
    if(typeof error==='object'&&error&&'code' in error&&error.code===11000) {
      if(body.action==='import') {
        const prior=await openingBatches.findOne({_id:body.reference})
        if(prior?.fingerprint===digest(JSON.stringify([body.reference,body.countDate,body.rows]))) return Response.json({replayed:true})
      }
      return apiError(409,'Batch or stock identifier already exists. Preview before retrying.')
    }
    throw error
  }
})
