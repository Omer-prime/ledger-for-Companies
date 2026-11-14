import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import mongoose from 'mongoose'
import { hashPassword } from '../src/lib/password.ts'

const origin = 'http://127.0.0.1:37172'
const uri = 'mongodb://127.0.0.1:37171/?replicaSet=phase0&directConnection=true'
const dbName = 'oarlinks_disposable_release_1114_phase0'

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

    const acceptanceReceipt = { ...receipt, reference: 'MANUAL-GR-10000', quantity: '10000' }
    const acceptanceDispatch = { ...dispatch, reference: 'MANUAL-DYE-10000', lotId: acceptanceReceipt.reference, quantity: '10000' }
    const acceptanceReturn = {
      kind: 'return', reference: 'MANUAL-RET-10000', jobId: acceptanceDispatch.reference, unit,
      dyed: '9400', damaged: '0', rejected: '0', lost: '600',
    }
    assert.equal((await postWarehouse(acceptanceReceipt)).status, 201)
    assert.equal((await postWarehouse(acceptanceDispatch)).status, 201)
    assert.equal((await postWarehouse(acceptanceReturn)).status, 400)
    assert.equal((await warehouseJobs.findOne({ _id: acceptanceDispatch.reference })).outstandingUm, 10000000000)
    const acceptedReturn = { ...acceptanceReturn, reason: 'Fixture processing loss' }
    assert.equal((await postWarehouse(acceptedReturn)).status, 201)
    assert.equal((await postWarehouse(acceptedReturn)).status, 200)
    const acceptedLot = await warehouseLots.findOne({ _id: acceptanceReceipt.reference })
    assert.deepEqual(acceptedLot.balances, { greige: 0, processor: 0, dyed: 9400000000, damaged: 0, rejected: 0, lost: 600000000 })
    assert.equal((await warehouseJobs.findOne({ _id: acceptanceDispatch.reference })).outstandingUm, 0)
    const acceptedDashboard = await (await request('warehouse', { cookie })).json()
    assert.ok(!acceptedDashboard.jobs.some(job => job._id === acceptanceDispatch.reference))
    const returnedMovement = acceptedDashboard.events.find(event => event._id === 'return:' + acceptanceReturn.reference)
    assert.ok(returnedMovement.processor)
    assert.equal(returnedMovement.reason, acceptedReturn.reason)
    assert.equal(Object.values(reconciled).reduce((sum, um) => sum + um, 0), 500000000)

    const productionLot = 'PRODUCTION-LOT-180'
    assert.equal((await postWarehouse({ ...receipt, reference: productionLot, quantity: '180' })).status, 201)
    assert.equal((await postWarehouse({ ...dispatch, reference: 'PRODUCTION-DYE', lotId: productionLot, quantity: '180' })).status, 201)
    assert.equal((await postWarehouse({ ...returned, reference: 'PRODUCTION-DYED', jobId: 'PRODUCTION-DYE' })).status, 201)
    const production = (body, options = {}) => request('textile-production', { method: 'POST', cookie, body, ...options })
    const allocation = { kind: 'allocate', reference: 'CUT-A', lotId: productionLot, length: '180' }
    assert.equal((await request('textile-production')).status, 401)
    assert.equal((await production(allocation, { cookie: memberCookie })).status, 403)
    const cutting = db.collection('textile_cutting_orders')
    const packages = db.collection('textile_thaans')
    const movements = db.collection('textile_production_movements')
    const allocations = await Promise.all([allocation, { ...allocation, reference: 'CUT-B' }].map(body => production(body)))
    assert.deepEqual(allocations.map(result => result.status).sort(), [201, 409])
    const orderId = allocations[0].status === 201 ? 'CUT-A' : 'CUT-B'
    assert.equal((await production({ ...allocation, reference: orderId })).status, 200)
    assert.equal((await production({ ...allocation, reference: 'OVER-ALLOCATE', length: '1' })).status, 409)
    assert.equal((await warehouseLots.findOne({ _id: productionLot })).balances.dyed, 0)
    const completion = { kind: 'complete', reference: 'BATCH-29', orderId, suits: 29, quarantined: 0, returned: '0', offcuts: '0', waste: '6' }
    const beforeCompletion = await cutting.findOne({ _id: orderId })
    const beforeFailedAllocation = await warehouseLots.findOne({ _id: receipt.reference })
    await db.command({
      collMod: 'textile_production_movements',
      validator: { _id: { $nin: ['allocate:ROLLBACK-CUT', 'complete:ROLLBACK-BATCH'] } },
    })
    try {
      assert.equal((await production({ ...allocation, reference: 'ROLLBACK-CUT', lotId: receipt.reference, length: '1' })).status, 503)
      assert.equal((await production({ ...completion, reference: 'ROLLBACK-BATCH', suits: 28, returned: '6' })).status, 503)
    } finally {
      await db.command({ collMod: 'textile_production_movements', validator: {} })
    }
    assert.deepEqual(await warehouseLots.findOne({ _id: receipt.reference }), beforeFailedAllocation)
    assert.equal(await cutting.findOne({ _id: 'ROLLBACK-CUT' }), null)
    assert.deepEqual(await cutting.findOne({ _id: orderId }), beforeCompletion)
    assert.equal((await warehouseLots.findOne({ _id: productionLot })).balances.dyed, 0)
    assert.equal((await production({ ...completion, waste: '5' })).status, 400)
    assert.equal((await production(completion)).status, 201)
    assert.equal((await production(completion)).status, 200)
    assert.equal((await cutting.findOne({ _id: orderId })).completion.consumedUm, 180000000)
    assert.equal((await cutting.findOne({ _id: orderId })).unclassified, 29)

    for (const [grade, suits] of [['A', 16], ['B', 9], ['C', 4]]) {
      const body = { kind: 'grade', reference: 'GRADE-' + grade, orderId, grade, suits }
      assert.equal((await production(body)).status, 201)
      assert.equal((await production(body)).status, 200)
    }
    assert.equal((await production({ kind: 'grade', reference: 'OVER-GRADE', orderId, grade: 'A', suits: 1 })).status, 409)
    const latest = await (await request(settingsPath, { cookie })).json()
    latest.settings.grades = latest.settings.grades.map(grade => grade.code === 'B' ? { ...grade, label: 'Renamed', enabled: false } : grade)
    latest.settings.grades.push({ code: 'D', label: 'Special', enabled: true })
    latest.settings.thaan.metersPerSuit = 5
    assert.equal((await put(latest.revision, latest.settings)).status, 200)
    assert.equal((await production({ kind: 'grade', reference: 'DISABLED-B', orderId, grade: 'B', suits: 1 })).status, 400)
    const correction = { kind: 'regrade', reference: 'TO-D', orderId, from: 'A', grade: 'D', suits: 1, reason: 'Fixture inspection' }
    assert.equal((await production(correction)).status, 201)
    assert.equal((await production({ ...correction, reference: 'BACK-TO-A', from: 'D', grade: 'A' })).status, 201)

    const pack = (reference, contents, options = {}) => production({ kind: 'pack', reference, orderId, contents, ...options })
    const beforeRollback = await cutting.findOne({ _id: orderId })
    await db.command({ collMod: 'textile_production_movements', validator: { _id: { $ne: 'pack:ROLLBACK-THAAN' } } })
    try {
      assert.equal((await pack('ROLLBACK-THAAN', [{ grade: 'A', suits: 4 }])).status, 503)
    } finally {
      await db.command({ collMod: 'textile_production_movements', validator: {} })
    }
    assert.deepEqual(await cutting.findOne({ _id: orderId }), beforeRollback)
    assert.equal(await packages.countDocuments(), 0)
    assert.equal(await movements.countDocuments({ _id: 'pack:ROLLBACK-THAAN' }), 0)

    for (let index = 1; index <= 4; index++) assert.equal((await pack('THAAN-A' + index, [{ grade: 'A', suits: 4 }])).status, 201)
    for (let index = 1; index <= 2; index++) assert.equal((await pack('THAAN-B' + index, [{ grade: 'B', suits: 4 }])).status, 201)
    const beforePolicyRejections = await cutting.findOne({ _id: orderId })
    assert.equal((await pack('THAAN-MIXED', [{ grade: 'B', suits: 1 }, { grade: 'C', suits: 3 }])).status, 400)
    assert.equal((await pack('THAAN-OVERRIDE', [{ grade: 'B', suits: 1 }], { targetSuits: 1 })).status, 400)
    assert.deepEqual(await cutting.findOne({ _id: orderId }), beforePolicyRejections)
    assert.equal(await packages.countDocuments(), 6)
    assert.equal(await movements.countDocuments({ _id: { $in: ['pack:THAAN-MIXED', 'pack:THAAN-OVERRIDE'] } }), 0)
    assert.equal((await pack('THAAN-C1', [{ grade: 'C', suits: 4 }])).status, 201)
    const partial = [{ grade: 'B', suits: 1 }]
    const last = await Promise.all(['THAAN-LAST-A', 'THAAN-LAST-B'].map(ref => pack(ref, partial)))
    assert.deepEqual(last.map(result => result.status).sort(), [201, 409])
    const partialId = last[0].status === 201 ? 'THAAN-LAST-A' : 'THAAN-LAST-B'
    assert.equal((await pack(partialId, partial)).status, 200)
    assert.equal((await pack(partialId, [{ grade: 'C', suits: 1 }])).status, 409)
    assert.equal((await pack('OVER-PACK', partial)).status, 409)
    const partialThaan = await packages.findOne({ _id: partialId })
    assert.equal(partialThaan.suits, 1)
    assert.equal(partialThaan.targetSuits, 4)
    assert.deepEqual(partialThaan.contents, [{ grade: 'B', label: 'Standard', suits: 1 }])
    const finished = await (await request('textile-production', { cookie })).json()
    assert.deepEqual(finished.totals, { full: 7, partial: 1, nonstandard: 0, soldSuits: 0, soldThaans: 0, packedSuits: 29, unpacked: 0, pending: 0, quarantined: 0 })
    assert.deepEqual(finished.byGrade, { A: 16, B: 9, C: 4 })
    assert.deepEqual(finished.byLot, [{ lotId: productionLot, um: '174000000' }])
    // Simulate a record posted before the API stopped accepting operator targets.
    await packages.updateOne({ _id: partialId }, { $set: { targetSuits: 1 } })
    const withHistoricalOverride = await (await request('textile-production', { cookie })).json()
    assert.deepEqual(withHistoricalOverride.totals, finished.totals)
    assert.equal((await packages.findOne({ _id: partialId })).targetSuits, 1)
    await packages.updateOne({ _id: partialId }, { $set: { targetSuits: 4 } })
    const historicalB = await packages.findOne({ _id: 'THAAN-B1' })
    assert.equal(historicalB.contents[0].label, 'Standard')
    assert.equal(historicalB.suitLengthUm, 6000000)
    assert.equal(historicalB.defaultSuitLengthUm, 5000000)
    const packedLength = (await packages.find({ orderId }).toArray()).reduce((sum, thaan) => sum + thaan.totalUm, 0)
    const batch = (await cutting.findOne({ _id: orderId })).completion
    assert.equal(packedLength + batch.wasteUm + batch.returnedUm + batch.offcutsUm, 180000000)
    assert.equal(await movements.countDocuments({ 'document.kind': 'pack', orderId }), 8)
    assert.equal(finished.configuration.grades.some(grade => grade.code === 'B'), false)
    assert.equal((await put(latest.revision + 1, { ...latest.settings, thaan: { ...latest.settings.thaan, suitsPerThaan: 1 } })).status, 200)
    assert.equal((await pack(partialId, partial)).status, 200)
    const afterSettingChange = await (await request('textile-production', { cookie })).json()
    assert.equal(afterSettingChange.configuration.thaan.suitsPerThaan, 1)
    assert.deepEqual(afterSettingChange.totals, finished.totals)
    assert.deepEqual(await packages.findOne({ _id: partialId }), partialThaan)
    assert.equal((await put(latest.revision + 2, { ...next, localization: { ...next.localization, currency: 'USD' } })).status, 200)
    assert.deepEqual(await transactions.findOne({ _id: legacyRow._id }), legacyRow)

    assert.equal((await request('transactions/search', { cookie: memberCookie })).status, 200)
    assert.equal((await request('transactions', { method: 'POST', cookie: memberCookie, requestOrigin: 'https://unrelated.example.test', body: {} })).status, 403)
    assert.equal((await request('transactions', { method: 'POST', cookie: memberCookie, body: { accountId: String(legacyRow.account), date: '2025-01-02', debit: 4, description: 'Fixture printable row' } })).status, 201)
    for (const method of ['PATCH', 'DELETE']) {
      assert.equal((await request('transactions/' + legacyRow._id, { method, cookie })).status, 409)
    }
    assert.equal((await request('dev/seed', { method: 'POST', cookie })).status, 404)
    const unconfigured = await request('checkout', { method: 'POST', cookie, body: {
      kind: 'sale', reference: 'LIVE-GATE', date: '2025-01-02',
      lines: [{ thaanId: 'THAAN-A1', suits: 1 }], total: 300, paid: 300, method: 'cash',
    } })
    assert.equal(unconfigured.status, 409)
    assert.match((await unconfigured.json()).error, /general-ledger account mappings/)
    assert.equal(await db.collection('checkout_documents').countDocuments(), 0)

    const ledgerBatch = { rows: [{ partyId: String(legacyRow.account), date: '2025-01-02', debit: 2, description: 'Fixture idempotent ledger row' }] }
    const postBatch = () => fetch(origin + '/api/transactions/bulk', {
      method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json',
        'Idempotency-Key': 'd9990000-0000-4000-8000-000000000001' },
      body: JSON.stringify(ledgerBatch),
    })
    assert.equal((await postBatch()).status, 200)
    assert.equal((await (await postBatch()).json()).replayed, true)
    assert.equal(await transactions.countDocuments({ description: 'Fixture idempotent ledger row' }), 1)

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
    // Seed the limit in both possible windows so clock rollover cannot reset this fixture.
    const windowMs = 15 * 60 * 1000
    const window = Math.floor(Date.now() / windowMs)
    const blockedKey = createHash('sha256').update(blocked).digest('hex')
    await attempts.insertMany([window, window + 1].map(bucket => ({
      _id: bucket + ':' + blockedKey, count: 10, expiresAt: new Date((bucket + 1) * windowMs),
    })))
    assert.equal((await login(blocked, pass)).status, 429)
  } finally {
    await connection.close()
  }
})
