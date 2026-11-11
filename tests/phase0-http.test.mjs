import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import mongoose from 'mongoose'
import { hashPassword } from '../src/lib/password.ts'

const origin = 'http://127.0.0.1:37172'
const uri = 'mongodb://127.0.0.1:37171/?replicaSet=phase0&directConnection=true'
const dbName = 'oarlinks_phase0_fixture'

test('Phase 0 HTTP and replica-set acceptance rehearsal', async () => {
  const connection = await mongoose.createConnection(uri, { dbName, serverSelectionTimeoutMS: 5000 }).asPromise()
  const db = connection.db
  const users = db.collection('users')
  const sessions = db.collection('auth_sessions')
  const attempts = db.collection('auth_attempts')
  const transactions = db.collection('transactions')
  const pass = 'fixture-only long password'
  const legacy = 'fixture-only legacy password'
  const admin = 'phase0-admin@example.test'
  const member = 'phase0-member@example.test'
  const jar = name => '__Host-ledger_session=' + name
  async function request(path, { method = 'GET', cookie, body, requestOrigin = origin, key = crypto.randomUUID() } = {}) {
    const headers = { Origin: requestOrigin }
    if (method === 'POST' && path.startsWith('inventory/')) headers['Idempotency-Key'] = key
    if (cookie) headers.Cookie = cookie
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    return fetch(origin + '/api/' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  }
  const login = (email, password, options) => request('auth/login', { method: 'POST', body: { email, password }, ...options })
  const cookieOf = response => response.headers.get('set-cookie')?.split(';')[0]

  try {
    const hello = await db.admin().command({ hello: 1 })
    assert.equal(hello.setName, 'phase0')
    assert.equal(hello.isWritablePrimary, true)
    assert.deepEqual(await db.listCollections().toArray(), [], 'A fresh disposable database is required')
    await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    await attempts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    await users.createIndex({ email: 1 }, { unique: true })
    for (const collection of [sessions, attempts]) {
      assert.ok((await collection.indexes()).some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0))
    }

    const passwordHash = await hashPassword(pass)
    const fixtureSession = await connection.startSession()
    let legacyRow
    let memberId
    try {
      await fixtureSession.withTransaction(async () => {
        await users.insertOne({ email: admin, role: 'superadmin', passwordHash }, { session: fixtureSession })
        memberId = (await users.insertOne({ email: member, role: 'accountant', password: legacy }, { session: fixtureSession })).insertedId
        const account = (await db.collection('accounts').insertOne({ name: 'Fixture account', type: 'party' }, { session: fixtureSession })).insertedId
        legacyRow = { _id: new mongoose.Types.ObjectId(), account, date: new Date('2025-01-01'), debit: 12, credit: 0 }
        await transactions.insertOne(legacyRow, { session: fixtureSession })
      })
    } finally {
      await fixtureSession.endSession()
    }

    assert.equal((await request('transactions/search')).status, 401)
    assert.equal((await request('transactions/search', { cookie: 'ledger_auth=' + Buffer.from(JSON.stringify({ email: admin, role: 'superadmin' })).toString('base64') })).status, 401)
    assert.equal((await request('transactions/search', { cookie: jar('a'.repeat(64)) })).status, 401)
    assert.equal((await login(admin, pass, { requestOrigin: 'https://unrelated.example.test' })).status, 403)
    assert.equal((await login(member, legacy)).status, 401)
    assert.equal((await login(admin, { malformed: true })).status, 400)
    const authenticated = await login(admin, pass)
    assert.equal(authenticated.status, 200)
    assert.match(authenticated.headers.get('set-cookie'), /HttpOnly/i)
    assert.match(authenticated.headers.get('set-cookie'), /Secure/i)
    assert.match(authenticated.headers.get('set-cookie'), /SameSite=Lax/i)
    const cookie = cookieOf(authenticated)
    const listed = await request('users', { cookie })
    assert.equal(listed.status, 200)
    assert.ok((await listed.json()).every(user => !('password' in user) && !('passwordHash' in user)))
    assert.equal((await request('users', { method: 'POST', cookie, body: { email: 'elevated@example.test', password: pass, role: 'superadmin' } })).status, 400)
    const created = await request('users', { method: 'POST', cookie, body: { email: 'new@example.test', password: pass, role: 'admin' } })
    assert.equal(created.status, 201)
    assert.ok(!JSON.stringify(await created.json()).includes('password'))
    const stored = await users.findOne({ email: 'new@example.test' })
    assert.match(stored.passwordHash, /^scrypt-v1\$/)
    assert.equal(stored.password, undefined)
    const delegated = cookieOf(await login('new@example.test', pass))
    assert.ok(delegated)
    assert.equal((await request('users', { method: 'POST', cookie: delegated, body: { email: 'peer@example.test', password: pass, role: 'admin' } })).status, 403)

    const resetPassword = 'fixture-only replacement password'
    const resetHash = await hashPassword(resetPassword)
    await users.updateOne({ _id: memberId }, { $set: { passwordHash: resetHash }, $unset: { password: '' } })
    assert.equal((await users.findOne({ _id: memberId })).password, undefined)
    const memberCookie = cookieOf(await login(member, resetPassword))
    assert.ok(memberCookie)
    assert.equal((await request('users', { cookie: memberCookie })).status, 403)
    const settingsPath = 'business-settings'
    assert.equal((await request(settingsPath)).status, 401)
    assert.equal((await request(settingsPath, { cookie: memberCookie })).status, 403)
    const defaults = await (await request(settingsPath, { cookie })).json()
    assert.equal(defaults.revision, 0)
    assert.equal(defaults.settings.profile.name, 'Your business')
    const demo = JSON.parse(await readFile(new URL('./fixtures/business-settings-demo.json', import.meta.url), 'utf8'))
    const put = (revision, settings, options = {}) => request(settingsPath, {
      method: 'PUT', cookie, body: { revision, settings }, ...options,
    })
    assert.equal((await put(0, demo, { cookie: memberCookie })).status, 403)
    assert.equal((await put(0, demo, { requestOrigin: 'https://unrelated.example.test' })).status, 403)
    assert.equal((await put(0, { ...demo, extra: true })).status, 400)
    assert.equal((await put(0, demo)).status, 200)

    const next = { ...demo, invoice: { ...demo.invoice, copies: 2 } }
    const concurrent = await Promise.all([put(1, next), put(1, next, { cookie: delegated })])
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409])
    assert.deepEqual((await (await request(settingsPath + '?revision=1', { cookie })).json()).settings, demo)
    assert.deepEqual((await (await request(settingsPath, { cookie })).json()).settings, next)
    assert.equal((await request(settingsPath + '?revision=99', { cookie })).status, 404)
    assert.equal(await db.collection('business_settings').countDocuments(), 2)
    const postWarehouse = (body, options = {}) => request('warehouse', { method: 'POST', cookie, body, ...options })
    const unit = 'm'
    const party = String(legacyRow.account)
    const receipt = { kind: 'receipt', reference: 'LOT-500', supplierId: party, fabric: 'Greige cotton', unit, quantity: '500', minorPerMeter: 1000 }
    assert.equal((await request('warehouse')).status, 401)
    assert.equal((await postWarehouse(receipt, { cookie: memberCookie })).status, 403)
    assert.equal((await postWarehouse(receipt, { requestOrigin: 'https://unrelated.example.test' })).status, 403)
    assert.equal((await postWarehouse({ ...receipt, unit: 'yd', quantity: '0.000001' })).status, 400)
    assert.equal((await postWarehouse(receipt)).status, 201)
    const receiptReplay = await postWarehouse(receipt)
    assert.equal(receiptReplay.status, 200)
    assert.deepEqual(await receiptReplay.json(), { eventId: receipt.kind + ':' + receipt.reference, replayed: true })
    const dispatch = { kind: 'dispatch', reference: 'DYE-300', processorId: party, lotId: receipt.reference, unit, quantity: '300' }
    assert.equal((await postWarehouse(dispatch)).status, 201)
    const dispatchReplay = await postWarehouse(dispatch)
    assert.equal(dispatchReplay.status, 200)
    assert.deepEqual(await dispatchReplay.json(), { eventId: dispatch.kind + ':' + dispatch.reference, replayed: true })
    assert.equal((await postWarehouse({ ...dispatch, quantity: '299' })).status, 409)
    const warehouseLots = db.collection('warehouse_lots')
    assert.equal((await warehouseLots.findOne({ _id: receipt.reference })).balances.greige, 200000000)
    const returned = { kind: 'return', reference: 'RETURN-180', jobId: dispatch.reference, unit, dyed: '180', damaged: '0', rejected: '0', lost: '0' }
    assert.equal((await postWarehouse(returned)).status, 201)
    const returnedReplay = await postWarehouse(returned)
    assert.equal(returnedReplay.status, 200)
    assert.deepEqual(await returnedReplay.json(), { eventId: returned.kind + ':' + returned.reference, replayed: true })
    assert.equal((await postWarehouse({ ...returned, dyed: '181' })).status, 409)
    assert.equal((await postWarehouse({ ...returned, reference: 'TOO-MUCH', dyed: '121' })).status, 409)
    assert.equal((await db.collection('warehouse_dye_jobs').findOne({ _id: dispatch.reference })).outstandingUm, 120000000)

    const concurrentDispatches = await Promise.all(['RACE-A', 'RACE-B'].map(reference =>
      postWarehouse({ ...dispatch, reference, quantity: '150' })))
    assert.deepEqual(concurrentDispatches.map(result => result.status).sort(), [201, 409])
    const winningJob = concurrentDispatches[0].status === 201 ? 'RACE-A' : 'RACE-B'
    const concurrentReturns = await Promise.all(['RETURN-A', 'RETURN-B'].map(reference =>
      postWarehouse({ ...returned, reference, jobId: winningJob, dyed: '100' })))
    assert.deepEqual(concurrentReturns.map(result => result.status).sort(), [201, 409])
    assert.equal((await postWarehouse({ ...returned, reference: 'RETURN-EXCEPTIONS', jobId: winningJob,
      dyed: '40', damaged: '4', rejected: '3', lost: '3', reason: 'Fixture quality inspection' })).status, 201)

    const warehouseEvents = db.collection('warehouse_movements')
    const warehouseJobs = db.collection('warehouse_dye_jobs')
    const beforeRejectedWrites = {
      lots: await warehouseLots.find().sort({ _id: 1 }).toArray(),
      jobs: await warehouseJobs.find().sort({ _id: 1 }).toArray(),
      events: await warehouseEvents.countDocuments(),
    }
    const rollbackCommands = [
      { ...receipt, reference: 'ROLLBACK-RECEIPT' },
      { ...dispatch, reference: 'ROLLBACK-DISPATCH', quantity: '1' },
      { ...returned, reference: 'ROLLBACK-RETURN', dyed: '1' },
    ]
    // Reject the last write after each operation has already changed balances inside its transaction.
    await db.command({
      collMod: 'warehouse_movements',
      validator: { _id: { $nin: rollbackCommands.map(body => body.kind + ':' + body.reference) } },
    })
    try {
      for (const body of rollbackCommands) assert.equal((await postWarehouse(body)).status, 503)
    } finally {
      await db.command({ collMod: 'warehouse_movements', validator: {} })
    }
    assert.deepEqual(await warehouseLots.find().sort({ _id: 1 }).toArray(), beforeRejectedWrites.lots)
    assert.deepEqual(await warehouseJobs.find().sort({ _id: 1 }).toArray(), beforeRejectedWrites.jobs)
    assert.equal(await warehouseEvents.countDocuments(), beforeRejectedWrites.events)

    const lotBefore = await warehouseLots.findOne({ _id: receipt.reference })
    assert.equal((await put(2, { ...next, measurements: { ...next.measurements, lengthUnit: 'yd' }, localization: { ...next.localization, currency: 'USD' } })).status, 200)
    assert.deepEqual(await warehouseLots.findOne({ _id: receipt.reference }), lotBefore)
    const warehouseData = await (await request('warehouse', { cookie })).json()
    assert.equal(warehouseData.outstandingJobs, 1)
    assert.equal(warehouseData.balances.find(balance => balance._id.stage === 'greige').um, '50000000')
    assert.equal(warehouseData.balances.find(balance => balance._id.stage === 'greige').valueNumerator, '50000000000')
    const reconciled = { greige: 0, processor: 0, dyed: 0, damaged: 0, rejected: 0, lost: 0 }
    for (const movement of await db.collection('warehouse_movements').find({ lotId: receipt.reference }).toArray()) {
      assert.equal(movement.revision, 2)
      for (const leg of movement.legs) {
        if (leg.from !== 'supplier') reconciled[leg.from] -= leg.um
        reconciled[leg.to] += leg.um
      }
    }
    assert.deepEqual(reconciled, lotBefore.balances)
    assert.deepEqual(Object.fromEntries(warehouseData.balances.map(balance => [balance._id.stage, Number(balance.um)])), reconciled)
    assert.equal(warehouseData.jobs.reduce((sum, job) => sum + job.outstandingUm, 0), reconciled.processor)
    assert.equal(Object.values(reconciled).reduce((sum, um) => sum + um, 0), 500000000)
    assert.deepEqual(await transactions.findOne({ _id: legacyRow._id }), legacyRow)

    assert.equal((await request('transactions/search', { cookie: memberCookie })).status, 200)
    assert.equal((await request('transactions', { method: 'POST', cookie: memberCookie, requestOrigin: 'https://unrelated.example.test', body: {} })).status, 403)
    assert.equal((await request('transactions', { method: 'POST', cookie: memberCookie, body: { accountId: String(legacyRow.account), date: '2025-01-02', debit: 4, description: 'Fixture printable row' } })).status, 201)
    for (const method of ['PATCH', 'DELETE']) {
      assert.equal((await request('transactions/' + legacyRow._id, { method, cookie })).status, 409)
    }
    assert.equal((await request('dev/seed', { method: 'POST', cookie })).status, 404)
    assert.deepEqual(await transactions.findOne({ _id: legacyRow._id }), legacyRow)
    const product = await request('products', { method: 'POST', cookie, body: { name: 'Fixture fabric', unit: 'm' } })
    assert.equal(product.status, 201)
    const productId = (await product.json())._id
    const opening = { rows: [{ productId, date: '2025-01-01', qty: 10, avgCost: 5 }] }
    assert.equal((await request('inventory/opening/bulk', { method: 'POST', cookie: memberCookie, body: opening })).status, 403)
    assert.equal((await request('inventory/opening/bulk', { method: 'POST', cookie, body: opening })).status, 200)
    const summary = await request('inventory/summary?productId=' + productId, { cookie })
    assert.equal(summary.status, 200)
    assert.deepEqual(await summary.json(), { qty: 10, value: 50, avg: 5 })
    assert.equal((await request('inventory/opening/bulk', { method: 'POST', cookie, body: opening })).status, 409)
    const sale = { documentNumber: 'SALE-FIXTURE-1', rows: [{ type: 'sale', productId, date: '2025-01-03', qty: 7, meta: { stockAfter: 10000 } }] }
    const saleKeys = [crypto.randomUUID(), crypto.randomUUID()]
    const outcomes = await Promise.all(saleKeys.map((key, index) => request('inventory/sales/bulk', { method: 'POST', cookie, body: { ...sale, documentNumber: 'SALE-FIXTURE-' + (index + 1) }, key })))
    assert.deepEqual(outcomes.map(response => response.status).sort(), [201, 409])
    const winner = outcomes.findIndex(response => response.status === 201)
    const posted = await outcomes[winner].json()
    const retry = await request('inventory/sales/bulk', { method: 'POST', cookie, body: { ...sale, documentNumber: 'SALE-FIXTURE-' + (winner + 1) }, key: saleKeys[winner] })
    assert.deepEqual(await retry.json(), posted)
    assert.equal(await db.collection('inventorymovements').countDocuments({ eventId: posted.eventId }), 1)
    const documentNumber = 'sale-fixture-' + (winner + 1)
    const crossUserReplay = await request('inventory/sales/bulk', { method: 'POST', cookie: delegated, body: { ...sale, documentNumber } })
    assert.deepEqual(await crossUserReplay.json(), posted)
    assert.equal((await request('inventory/sales/bulk', { method: 'POST', cookie: delegated, body: { documentNumber, rows: [{ ...sale.rows[0], qty: 1 }] } })).status, 409)
    assert.equal((await request('inventory/sales/bulk', { method: 'POST', cookie, body: { ...sale, documentNumber: 'SALE-FIXTURE-OVERSELL' } })).status, 409)
    const newSale = { documentNumber: 'SALE-UNKNOWN-PARTY', rows: [{ ...sale.rows[0], qty: 1, partyId: String(new mongoose.Types.ObjectId()) }] }
    assert.equal((await request('inventory/sales/bulk', { method: 'POST', cookie, body: newSale })).status, 400)
    const purchase = { documentNumber: 'PURCHASE-FIXTURE-1', rows: [{ type: 'purchase', productId, date: '2025-01-03', qty: 4, rate: 5, waste: 2 }] }
    const purchases = await Promise.all([cookie, delegated].map(sessionCookie =>
      request('inventory/purchases/bulk', { method: 'POST', cookie: sessionCookie, body: purchase })))
    assert.deepEqual(purchases.map(result => result.status), [201, 201])
    const [firstPurchase, secondPurchase] = await Promise.all(purchases.map(result => result.json()))
    assert.deepEqual(firstPurchase, secondPurchase)
    assert.equal(await db.collection('inventorymovements').countDocuments({ eventId: firstPurchase.eventId }), 2)
    const reusedKey = await request('inventory/sales/bulk', {
      method: 'POST', cookie, key: saleKeys[winner], body: { ...sale, documentNumber: 'SALE-DIFFERENT-KEY-ALIAS' },
    })
    assert.equal(reusedKey.status, 409)
    for (const adjustment of [{ direction: 'increase', rate: 5 }, { direction: 'decrease' }]) {
      const body = { rows: [{ type: 'adjustment', productId, date: '2025-01-03', qty: 1, reason: 'Fixture correction', ...adjustment }] }
      assert.equal((await request('inventory/adjustments/bulk', { method: 'POST', cookie, body })).status, 201)
    }
    assert.equal((await request('products/' + productId, { method: 'DELETE', cookie })).status, 200)
    assert.ok((await db.collection('accounts').findOne({ _id: new mongoose.Types.ObjectId(productId) })).archivedAt)
    assert.equal((await request('inventory/sales/bulk', { method: 'POST', cookie, body: { documentNumber: 'SALE-ARCHIVED-PRODUCT', rows: [{ ...sale.rows[0], qty: 1 }] } })).status, 400)
    assert.equal((await (await request('inventory/summary?productId=' + productId, { cookie })).json()).qty, 5)

    const historical = Array.from({ length: 2003 }, () => ({
      account: legacyRow.account, date: new Date('2024-01-01'), debit: 2, credit: 1,
    }))
    const category = await request('categories', { method: 'POST', cookie, body: { name: 'Fixture category' } })
    assert.equal(category.status, 201)
    const categoryId = (await category.json())._id
    historical[0].meta = { categoryId }
    await transactions.insertMany(historical)
    assert.equal((await request('categories/' + categoryId, { method: 'DELETE', cookie })).status, 200)
    assert.ok((await db.collection('ledgercategories').findOne({ _id: new mongoose.Types.ObjectId(categoryId) })).archivedAt)
    const archivedReport = await (await request('transactions/search?categoryId=' + categoryId, { cookie })).json()
    assert.equal(archivedReport.totalRows, 1)
    assert.equal((await request('transactions', { method: 'POST', cookie, body: { accountId: String(legacyRow.account), categoryId, debit: 1 } })).status, 400)
    assert.equal((await request('transactions/bulk', { method: 'POST', cookie, body: { categoryId, rows: [{ partyId: String(legacyRow.account), date: '2025-01-01', debit: 1 }] } })).status, 400)
    assert.equal((await request('transactions', { method: 'POST', cookie, body: { accountId: productId, debit: 1 } })).status, 400)
    assert.equal((await request('transactions/bulk', { method: 'POST', cookie, body: { rows: [{ partyId: productId, date: '2025-01-01', debit: 1 }] } })).status, 400)
    const report = await (await request('transactions/search?limit=2000&from=2024-01-01&to=2024-01-01', { cookie })).json()
    assert.equal(report.rows.length, 2000)
    assert.equal(report.totalRows, 2003)
    assert.deepEqual(report.totals, { debit: 4006, credit: 2003 })
    const lastPage = await (await request('transactions/search?limit=2000&page=2&from=2024-01-01&to=2024-01-01', { cookie })).json()
    assert.equal(lastPage.rows.length, 3)
    assert.deepEqual(lastPage.totals, report.totals)

    await db.command({ collMod: 'transactions', validator: { description: 'allowed-fixture-value' } })
    try {
      const failure = await request('transactions', {
        method: 'POST', cookie,
        body: { accountId: String(legacyRow.account), debit: 1, description: 'fixture-confidential-driver-marker' },
      })
      assert.equal(failure.status, 503)
      assert.deepEqual(await failure.json(), { error: 'Service unavailable' })
    } finally {
      await db.command({ collMod: 'transactions', validator: {} })
    }



    assert.equal((await request('auth/logout', { method: 'POST', cookie })).status, 200)
    assert.equal((await request('transactions/search', { cookie })).status, 401)
    await users.updateOne({ _id: memberId }, { $set: { disabled: true } })
    assert.equal((await request('transactions/search', { cookie: memberCookie })).status, 401)
    await users.updateOne({ _id: memberId }, { $set: { disabled: false } })
    assert.equal((await request('transactions/search', { cookie: memberCookie })).status, 200)
    await sessions.updateMany({}, { $set: { expiresAt: new Date(0) } })
    assert.equal((await request('transactions/search', { cookie: memberCookie })).status, 401)
    const blocked = 'throttle@example.test'
    for (let i = 0; i < 10; i++) assert.equal((await login(blocked, pass)).status, 401)
    assert.equal((await login(blocked, pass)).status, 429)
  } finally {
    await connection.close()
  }
})
