import { approvePosFixture } from './fixtures/pos-accounting.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { hashPassword } from '../src/lib/password.ts'

const uri='mongodb://127.0.0.1:37171/?replicaSet=phase0&directConnection=true'
const database='oarlinks_disposable_usability_suits'
const origin='http://127.0.0.1:37177'

// Requires a FRESH dedicated fixture DB. Never drops or cleans business databases.
test('POS integration: registered credit/cash/partial, walk-in, repayment, daily report, replay and stock',async()=>{
  assert.equal(process.env.MONGODB_DATABASE,database,'Refusing unexpected DB')
  assert.equal(process.env.MONGODB_URI,uri,'Refusing unexpected Mongo server')
  assert.equal(process.env.APP_ORIGIN,origin,'Refusing unexpected app origin')
  const conn=await mongoose.createConnection(uri,{dbName:database,serverSelectionTimeoutMS:7000}).asPromise()
  const db=conn.db
  const users=db.collection('users')
  const accounts=db.collection('accounts')
  const thaans=db.collection('textile_thaans')
  const docs=db.collection('checkout_documents')
  const cashbook=db.collection('checkout_receipts')
  const transactions=db.collection('transactions')
  try{
    const hello=await db.admin().command({hello:1})
    assert.equal(hello.setName,'phase0')
    assert.equal(hello.isWritablePrimary,true)
    assert.deepEqual(await db.listCollections().toArray(),[],'Fixture DB must be empty. Nothing was changed.')
    const email='pos-review-admin@example.test',password='pos fixture password only'
    await users.insertOne({email,role:'superadmin',passwordHash:await hashPassword(password),disabled:false})
    const customer=new mongoose.Types.ObjectId()
    await accounts.insertOne({_id:customer,type:'party',name:'Registered POS Customer',openingBalance:0,openingIsDebit:true})
    const factoryThaan=id=>({_id:id,orderId:'ORDER-POS',batchId:'BATCH-POS',lotId:'LOT-POS',contents:[{grade:'A',label:'Premium',suits:4}],suits:4,targetSuits:4,defaultTargetSuits:4,defaultSuitLengthUm:6000000,suitLengthUm:6000000,totalUm:24000000,revision:0,actor:email,postedAt:new Date()})
    await thaans.insertMany(['POS-T001','POS-T002','POS-T003','POS-T004','POS-S001','POS-S002'].map(factoryThaan))
    const send=(path,{method='GET',body,cookie}={})=>fetch(origin+'/api/'+path,{
      method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined,
    })
    const login=await send('auth/login',{method:'POST',body:{email,password}})
    assert.equal(login.status,200,'Admin login failed')
    const cookie=login.headers.get('set-cookie')?.split(';')[0]
    assert.ok(cookie?.startsWith('__Host-ledger_session='))
    const post=body=>send('checkout',{method:'POST',body,cookie})
    const day='2026-11-12',partyId=String(customer)
    const first={kind:'sale',reference:'POS-CREDIT-001',date:day,partyId,thaanIds:['POS-T001'],total:20000,paid:0}
    assert.equal((await post(first)).status,409,'Missing approval must block new posting')
    const mappings = await approvePosFixture(db, mongoose.Types.ObjectId, body => send('pos-accounting',{method:'PUT',body,cookie}))
    assert.equal((await post({...first,paid:first.total+1})).status,400)
    await db.collection('warehouse_lots').updateOne({_id:'LOT-POS'},{ $set:{minorPerMeter:0} })
    assert.equal((await post(first)).status,409,'Unknown or zero cost must block posting')
    assert.equal((await thaans.findOne({_id:'POS-T001'})).soldSuits,undefined)
    assert.equal(await docs.countDocuments(),0)
    await db.collection('warehouse_lots').updateOne({_id:'LOT-POS'},{ $set:{minorPerMeter:15000} })
    await db.createCollection('journal_entries',{validator:{reason:'blocked by fixture'}})
    assert.equal((await post({...first,paid:1000,method:'cash'})).status,503,'Journal failure must roll back stock and customer movement')
    assert.equal((await thaans.findOne({_id:'POS-T001'})).soldSuits,undefined)
    assert.equal(await transactions.countDocuments(),0)
    assert.equal(await cashbook.countDocuments(),0)
    assert.equal(await docs.countDocuments(),0)
    await db.command({collMod:'journal_entries',validator:{}})
    assert.equal((await post(first)).status,201)
    assert.equal((await post(first)).status,200,'Same document replay should not duplicate')
    const record = await docs.findOne({_id:'sale:'+first.reference})
    const journal = await db.collection('journal_entries').findOne({_id:record.journalId})
    assert.deepEqual(journal.lines, [
      {accountId:String(mappings.receivables),debitPaisa:2000000,creditPaisa:0},
      {accountId:String(mappings.revenue),debitPaisa:0,creditPaisa:2000000},
      {accountId:String(mappings.cogs),debitPaisa:360000,creditPaisa:0},
      {accountId:String(mappings.finishedInventory),debitPaisa:0,creditPaisa:360000},
    ])
    assert.equal((await post({...first,total:20001})).status,409,'Reused ref with different amount must fail')
    assert.equal((await post({...first,reference:'POS-DUPLICATE'})).status,409,'Sold thaan must not sell twice')
    const repayment={kind:'payment',reference:'POS-REPAY-001',date:day,partyId,amount:8000,method:'cash'}
    assert.equal((await post(repayment)).status,201)
    const paidSale={kind:'sale',reference:'POS-NAMED-CASH-001',date:day,partyId,thaanIds:['POS-T002'],total:5000,paid:5000,method:'cash'}
    assert.equal((await post(paidSale)).status,201)
    const partial={kind:'sale',reference:'POS-PARTIAL-001',date:day,partyId,thaanIds:['POS-T003'],total:10000,paid:4000,method:'bank'}
    assert.equal((await post(partial)).status,201)
    // No party creation required for a one-off buyer. Fully paid, cash register only.
    const walkIn={kind:'sale',reference:'POS-WALKIN-001',date:day,customerName:'Counter Buyer',thaanIds:['POS-T004'],total:3000,paid:3000,method:'cash'}
    assert.equal((await post(walkIn)).status,201)
    assert.equal((await post(walkIn)).status,200,'Walk-in retry should replay')
    assert.equal((await post({...walkIn,reference:'POS-WALKIN-BAD',paid:0,method:undefined})).status,400,'Walk-ins cannot buy on credit without a party account')
    assert.equal((await post({kind:'payment',reference:'POS-OVERPAY',date:day,partyId,amount:18001,method:'bank'})).status,409)

    // One suit from a packed four-suit thaan; the other three remain saleable.
    const oneSuit={kind:'sale',reference:'POS-ONE-SUIT',date:day,customerName:'One Suit Counter Buyer',
      lines:[{thaanId:'POS-S001',suits:1}],total:1500,paid:1500,method:'cash'}
    assert.equal((await post(oneSuit)).status,201)
    assert.equal((await post(oneSuit)).status,200,'Identical one-suit replay must be idempotent')
    assert.equal((await post({...oneSuit,reference:'POS-OVERSTOCK',lines:[{thaanId:'POS-S001',suits:4}]})).status,409,
      'Cannot sell four after one suit has left the thaan')
    const afterOne=await (await send('checkout?date='+day,{cookie})).json()
    const left=afterOne.thaans.find(t=>t.id==='POS-S001')
    assert.equal(left?.suits,3,'Three suits must remain available')
    assert.equal(left?.totalUm,18000000,'Remaining fabric must be exactly 18 m')
    assert.equal(await thaans.countDocuments({_id:'POS-S001',saleId:{$exists:true}}),0)
    assert.equal((await post({...oneSuit,reference:'POS-THREE-SUITS',lines:[{thaanId:'POS-S001',suits:3}],total:4500,paid:4500})).status,201)
    assert.equal((await post({...oneSuit,reference:'POS-FOURTH-TRY',lines:[{thaanId:'POS-S001',suits:1}]})).status,409)
    assert.equal(await thaans.countDocuments({_id:'POS-S001',soldSuits:4,saleId:{$exists:true}}),1)
    const singleReceipt=await docs.findOne({_id:'sale:POS-ONE-SUIT'})
    assert.deepEqual(singleReceipt.items.map(i=>[i.suits,i.totalUm]),[[1,6000000]],'Receipt must show 1 suit / 6m')
    // One separate partially sold thaan remains visible in the stock and production dashboards.
    const partialStock={kind:'sale',reference:'POS-OPEN-THAAN',date:day,customerName:'Single Suit Buyer',
      lines:[{thaanId:'POS-S002',suits:1}],total:1000,paid:1000,method:'cash'}
    assert.equal((await post(partialStock)).status,201)
    const stillOpen=await (await send('checkout?date='+day,{cookie})).json()
    assert.equal(stillOpen.thaans.find(t=>t.id==='POS-S002')?.suits,3)
    const reportResponse=await send('checkout?date='+day+'&partyId='+partyId,{cookie})
    assert.equal(reportResponse.status,200)
    const report=await reportResponse.json()
    assert.equal(report.due,18000,'20k udhar - 8k recovery + 6k partial = 18k; paid sales add zero receivable')
    const statementResponse = await send('transactions?accountId='+partyId+'&from='+day+'&to='+day,{cookie})
    assert.equal(statementResponse.status,200)
    const statement = await statementResponse.json()
    assert.equal(statement.opening,0)
    assert.equal(statement.closing,report.due)
    assert.equal(statement.rows.at(-1).runningBalance,report.due)
    const reconciliation = await (await send('pos-accounting?date='+day,{cookie})).json()
    const gl = new Map(reconciliation.journal.map(line=>[line._id, {
      debit: Number(line.debitPaisa), credit: Number(line.creditPaisa),
    }]))
    const net = key => { const row = gl.get(String(mappings[key])); return row.debit - row.credit }
    assert.equal([...gl.values()].reduce((sum,line)=>sum+line.debit-line.credit,0),0)
    assert.equal(net('receivables'),report.due*100)
    assert.equal(net('cash'),report.totals.cashReceived*100)
    assert.equal(net('bank'),report.totals.bankReceived*100)
    assert.equal(net('revenue'),-report.totals.saleTotal*100)
    const soldCost = report.dailyDocuments.reduce((sum,doc)=>sum+doc.costPaisa,0)
    assert.equal(net('cogs'),soldCost)
    assert.equal(net('finishedInventory'),-soldCost)
    assert.equal(report.thaans.length,1,'Three suits remain in one opened thaan')
    assert.equal(report.totals.sales,7)
    assert.equal(report.totals.walkInSales,4)
    assert.equal(report.totals.saleTotal,45000)
    assert.equal(report.totals.paidAtSale,19000,'Original 12k + 1.5k + 4.5k + 1k from suits')
    assert.equal(report.totals.paymentsAgainstDue,8000)
    assert.equal(report.totals.cashReceived,23000,'16k original cash + 7k suit sales')
    assert.equal(report.totals.bankReceived,4000)
    assert.equal(report.totals.newUdhar,26000,'20k credit + 6k partial')
    assert.equal(report.dailyCount,8)
    assert.equal(report.dailyDocuments.length,8)
    assert.ok(report.dailyDocuments.some(d=>d.walkIn&&d.partyName==='Counter Buyer'))
    assert.equal(report.receipts.length,7,'4 original receipts + 3 new suit receipts')
    assert.equal((await send('checkout?date=invalid',{cookie})).status,400)
    assert.equal(await docs.countDocuments(),8)
    assert.equal(await cashbook.countDocuments(),7)
    assert.equal(await thaans.countDocuments({saleId:{$exists:true}}),5)
    assert.equal(await transactions.countDocuments(),6,'Walk-in must not create anonymous receivable entries')
    const totals=await transactions.aggregate([{$group:{_id:null,debit:{$sum:'$debit'},credit:{$sum:'$credit'}}}]).toArray()
    assert.deepEqual([totals[0].debit,totals[0].credit],[35000,17000])
    const production=await send('textile-production',{cookie})
    assert.equal(production.status,200)
    const prod=await production.json()
    assert.equal(prod.totals.soldThaans,5)
    assert.equal(prod.totals.packedSuits,24)
    assert.equal(prod.totals.soldSuits,21,'Twenty fully sold suits + one suit from the opened thaan')
    assert.equal(prod.thaans.length,6,'Sold and opened historical thaans remain visible')
    assert.equal(prod.byGrade.A,3,'Three suits must remain on the opened A-grade thaan')
    // Concurrent counter operators cannot sell more suits than the thaan contains.
    await thaans.insertOne(factoryThaan('POS-RACE'))
    const raceBase={kind:'sale',date:day,customerName:'Concurrent Counter Buyer',
      lines:[{thaanId:'POS-RACE',suits:3}],total:3000,paid:3000,method:'cash'}
    const responses=await Promise.all([post({...raceBase,reference:'POS-RACE-A'}),post({...raceBase,reference:'POS-RACE-B'})])
    assert.equal(responses.filter(r=>r.status===201).length,1,'Only one counter may sell three suits from a four-suit thaan')
    assert.ok(responses.every(r=>[201,409,503].includes(r.status)))
    assert.equal((await thaans.findOne({_id:'POS-RACE'})).soldSuits,3,'Exactly three suits must be deducted')
    assert.equal(await docs.countDocuments({reference:{$in:['POS-RACE-A','POS-RACE-B']}}),1)

    // Historical mixed-grade thaan: partial sale cannot silently change grade attribution.
    await thaans.insertOne({...factoryThaan('POS-MIXED'),contents:[
      {grade:'B',label:'Grade B',suits:2},{grade:'C',label:'Grade C',suits:2},
    ]})
    const mixedBase={kind:'sale',reference:'POS-MIXED-PART',date:day,customerName:'Historical Counter',
      lines:[{thaanId:'POS-MIXED',suits:1}],total:1000,paid:1000,method:'cash'}
    assert.equal((await post(mixedBase)).status,409)
    assert.equal((await post({...mixedBase,reference:'POS-MIXED-ALL',lines:[{thaanId:'POS-MIXED',suits:4}],total:4000,paid:4000})).status,201)

    const guided=(role)=>send('pos-accounting',{method:'POST',cookie,body:{role,name:'DEMO guided '+role}})
    const guidedCash=await (await guided('cash')).json()
    assert.equal((await (await guided('cash')).json())._id,guidedCash._id)
    assert.equal(await accounts.countDocuments({'meta.posRole':'cash'}),1)
    const opening=(body)=>send('opening-stock',{method:'POST',body,cookie})
    const row={kind:'full',fabric:'Demo cotton',design:'Blue',size:'',grade:'A',suits:4,suitLengthUm:6000000,costPaisa:240000,source:'Fixture counted stock',evidence:'Fixture invoice'}
    const batch={action:'import',reference:'DEMO-OPEN',countDate:day,rows:[
      {...row,identifier:'OPEN-FULL'}, {...row,identifier:'OPEN-FULL2'}, {...row,identifier:'OPEN-PART',kind:'partial',suits:2,costPaisa:120000},
      {...row,identifier:'OPEN-LOOSE',kind:'loose',suits:1,costPaisa:60000},
    ]}
    assert.equal((await opening({...batch,preview:true,rows:[{...row,identifier:'INVALID',suits:3}]})).status,400)
    assert.equal((await opening({...batch,preview:true})).status,200)
    assert.equal(await thaans.countDocuments({'opening.reference':'DEMO-OPEN'}),0)
    assert.equal((await opening(batch)).status,201)
    assert.equal((await opening(batch)).status,200)
    const pendingInventory=await (await send('textile-production',{cookie})).json()
    assert.deepEqual(pendingInventory.availability.pendingOpening,{suits:11,um:'66000000'})
    assert.deepEqual(pendingInventory.availability.combined,pendingInventory.availability.manufactured)
    const sell=(ref,id,suits,extra={})=>post({kind:'sale',reference:ref,date:day,lines:[{thaanId:id,suits}],total:3000,paid:3000,method:'cash',...extra})
    assert.equal((await sell('OPEN-01','OPEN-LOOSE',1)).status,409)
    const config=await (await send('pos-accounting',{cookie})).json()
    assert.equal((await send('pos-accounting',{method:'PUT',cookie,body:{revision:config.revision,approval:{...config.approval,accounts:{...config.approval.accounts,bank:guidedCash._id}}}})).status,400)
    const approve=()=>send('pos-accounting',{method:'PUT',cookie,body:{revision:config.revision,approval:{...config.approval,capitalizedOpeningIds:['DEMO-OPEN']}}})
    assert.equal((await approve()).status,400)
    assert.equal((await opening({action:'verify',reference:'DEMO-OPEN',verificationReference:'Fixture count and cost confirmed'})).status,200)
    assert.equal((await approve()).status,200)
    assert.equal((await sell('OPEN-01','OPEN-LOOSE',1)).status,201)
    assert.equal((await sell('OPEN-02','OPEN-FULL',1)).status,201)
    assert.equal((await sell('OPEN-03','OPEN-FULL2',4)).status,201)
    assert.equal((await sell('OPEN-04','OPEN-PART',1,{partyId,paid:1000})).status,201)
    const remaining=await (await send('checkout?date='+day,{cookie})).json()
    assert.equal(remaining.thaans.find(item=>item.id==='OPEN-FULL').suits,3)
    assert.equal(remaining.thaans.find(item=>item.id==='OPEN-PART').suits,1)
    assert.equal(remaining.thaans.some(item=>['OPEN-LOOSE','OPEN-FULL2'].includes(item.id)),false)
    const sale=await docs.findOne({_id:'sale:OPEN-02'})
    assert.equal(sale.costPaisa,60000)
    const linked=await db.collection('journal_entries').findOne({_id:sale.journalId})
    assert.equal(linked.lines.reduce((sum,line)=>sum+line.debitPaisa-line.creditPaisa,0),0)
    assert.equal(await db.collection('journal_entries').countDocuments({'source.documentId':/^sale:OPEN-/}),4)
    const inventory=await (await send('textile-production',{cookie})).json()
    assert.deepEqual(inventory.availability.opening,{suits:4,um:'24000000'})
    assert.deepEqual(inventory.availability.pendingOpening,{suits:0,um:'0'})
    assert.equal(inventory.availability.combined.suits,inventory.availability.manufactured.suits+4)
    assert.equal(inventory.openingStock.find(item=>item._id==='OPEN-LOOSE').available,0)
    const race=await Promise.all([sell('OPEN-RACE1','OPEN-PART',1),sell('OPEN-RACE2','OPEN-PART',1)])
    assert.equal(race.filter(result=>result.status===201).length,1)
    assert.equal((await thaans.findOne({_id:'OPEN-PART'})).soldSuits,2)
  }finally{await conn.close()}
})
