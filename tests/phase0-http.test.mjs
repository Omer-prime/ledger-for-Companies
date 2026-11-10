import assert from 'node:assert/strict'
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
    const sale = { rows: [{ type: 'sale', productId, date: '2025-01-03', qty: 7, meta: { stockAfter: 10000 } }] }
    const saleKeys = [crypto.randomUUID(), crypto.randomUUID()]
    const outcomes = await Promise.all(saleKeys.map(key => request('inventory/sales/bulk', { method: 'POST', cookie, body: sale, key })))
    assert.deepEqual(outcomes.map(response => response.status).sort(), [201, 409])
    const winner = outcomes.findIndex(response => response.status === 201)
    const posted = await outcomes[winner].json()
    const retry = await request('inventory/sales/bulk', { method: 'POST', cookie, body: sale, key: saleKeys[winner] })
    assert.deepEqual(await retry.json(), posted)
    assert.equal(await db.collection('inventorymovements').countDocuments({ eventId: posted.eventId }), 1)
    assert.equal((await request('inventory/sales/bulk', { method: 'POST', cookie, body: sale })).status, 409)
    const newSale = { rows: [{ ...sale.rows[0], qty: 1, partyId: String(new mongoose.Types.ObjectId()) }] }
    assert.equal((await request('inventory/sales/bulk', { method: 'POST', cookie, body: newSale })).status, 400)
    const purchase = { rows: [{ type: 'purchase', productId, date: '2025-01-03', qty: 4, rate: 5, waste: 2 }] }
    assert.equal((await request('inventory/purchases/bulk', { method: 'POST', cookie, body: purchase })).status, 201)
    for (const adjustment of [{ direction: 'increase', rate: 5 }, { direction: 'decrease' }]) {
      const body = { rows: [{ type: 'adjustment', productId, date: '2025-01-03', qty: 1, reason: 'Fixture correction', ...adjustment }] }
      assert.equal((await request('inventory/adjustments/bulk', { method: 'POST', cookie, body })).status, 201)
    }
    assert.equal((await request('products/' + productId, { method: 'DELETE', cookie })).status, 200)
    assert.ok((await db.collection('accounts').findOne({ _id: new mongoose.Types.ObjectId(productId) })).archivedAt)
    assert.equal((await request('inventory/sales/bulk', { method: 'POST', cookie, body: { rows: [{ ...sale.rows[0], qty: 1 }] } })).status, 400)
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
