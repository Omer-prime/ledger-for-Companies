export async function approvePosFixture(db, ids, request) {
  const accounts = Object.fromEntries(['cash','bank','receivables','revenue','finishedInventory','cogs'].map(key => [key, new ids()]))
  await db.collection('accounts').insertMany(Object.entries(accounts).map(([key,_id]) => ({_id,name:'Fixture '+key,type:'gl'})))
  const approval = { accounts:Object.fromEntries(Object.entries(accounts).map(([k,v])=>[k,String(v)])),
    businessApprovalReference:'Disposable fixture approval', policy:'raw-material-length-v1', capitalizedOrderIds:['ORDER-POS'], reconciledAndCapitalized:true, noTaxDiscountsOrReturns:true }
  await db.collection('warehouse_lots').insertOne({_id:'LOT-POS',currency:'PKR',minorPerMeter:15000})
  await db.collection('textile_cutting_orders').insertOne({_id:'ORDER-POS',lotId:'LOT-POS',currency:'PKR',minorPerMeter:15000,unclassified:0,grades:{},completion:{batchId:'BATCH-POS',suitLengthUm:6000000}})
  const invalid = await request({revision:0, approval:{...approval,accounts:{...approval.accounts,bank:approval.accounts.cash}}})
  if (invalid.status !== 400) throw new Error('Duplicate GL mapping was not rejected')
  const missing = await request({revision:0, approval:{...approval,capitalizedOrderIds:['MISSING']}})
  if (missing.status !== 400) throw new Error('Missing capitalization order was not rejected')
  const response = await request({revision:0, approval})
  if (response.status !== 200) throw new Error('Fixture approval failed: '+response.status)
  return accounts
}
