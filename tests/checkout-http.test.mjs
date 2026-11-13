import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { hashPassword } from '../src/lib/password.ts'

const uri='mongodb://127.0.0.1:37171/?replicaSet=phase0&directConnection=true'
const database='oarlinks_pos_acceptance_20261112'
const origin='http://127.0.0.1:37176'

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
    await thaans.insertMany(['POS-T001','POS-T002','POS-T003','POS-T004'].map(factoryThaan))
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
    assert.equal((await post(first)).status,201)
    assert.equal((await post(first)).status,200,'Same document replay should not duplicate')
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

    const reportResponse=await send('checkout?date='+day+'&partyId='+partyId,{cookie})
    assert.equal(reportResponse.status,200)
    const report=await reportResponse.json()
    assert.equal(report.due,18000,'20k udhar - 8k recovery + 6k partial = 18k; paid sales add zero receivable')
    assert.equal(report.thaans.length,0,'All four thaans should be sold')
    assert.equal(report.totals.sales,4)
    assert.equal(report.totals.walkInSales,1)
    assert.equal(report.totals.saleTotal,38000)
    assert.equal(report.totals.paidAtSale,12000,'5k named cash + 4k partial + 3k walk-in')
    assert.equal(report.totals.paymentsAgainstDue,8000)
    assert.equal(report.totals.cashReceived,16000,'8k old Udhar + 5k named cash + 3k walk-in')
    assert.equal(report.totals.bankReceived,4000)
    assert.equal(report.totals.newUdhar,26000,'20k credit + 6k partial')
    assert.equal(report.dailyCount,5)
    assert.equal(report.dailyDocuments.length,5)
    assert.ok(report.dailyDocuments.some(d=>d.walkIn&&d.partyName==='Counter Buyer'))
    assert.equal(report.receipts.length,4,'4 payment receipts, no receipt for full Udhar')
    assert.equal((await send('checkout?date=invalid',{cookie})).status,400)
    assert.equal(await docs.countDocuments(),5)
    assert.equal(await cashbook.countDocuments(),4)
    assert.equal(await thaans.countDocuments({saleId:{$exists:true}}),4)
    assert.equal(await transactions.countDocuments(),6,'Walk-in must not create anonymous receivable entries')
    const totals=await transactions.aggregate([{$group:{_id:null,debit:{$sum:'$debit'},credit:{$sum:'$credit'}}}]).toArray()
    assert.deepEqual([totals[0].debit,totals[0].credit],[35000,17000])
    const production=await send('textile-production',{cookie})
    assert.equal(production.status,200)
    const prod=await production.json()
    assert.equal(prod.totals.soldThaans,4)
    assert.equal(prod.totals.packedSuits,16)
    assert.equal(prod.thaans.length,4,'Sold historical thaans remain visible')
  }finally{await conn.close()}
})
