import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:https'
import { request } from 'node:http'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import mongoose from 'mongoose'

const origin = 'https://127.0.0.1:37173'
const sessionName = '__Host-ledger_session'

test('Chromium local HTTPS sessions, inventory PDF and both report print views', async () => {
  const { chromium } = await import(pathToFileURL(process.env.PHASE0_PLAYWRIGHT).href)
  const proxy = createServer({
    key: await readFile(process.env.PHASE0_TLS_KEY),
    cert: await readFile(process.env.PHASE0_TLS_CERT),
  }, (incoming, outgoing) => {
    const upstream = request({
      hostname: '127.0.0.1', port: 37172, path: incoming.url, method: incoming.method,
      headers: { ...incoming.headers, 'x-forwarded-proto': 'https' },
    }, response => {
      outgoing.writeHead(response.statusCode, response.headers)
      response.pipe(outgoing)
    })
    upstream.on('error', () => { outgoing.writeHead(502); outgoing.end() })
    incoming.pipe(upstream)
  })
  await new Promise((resolve, reject) => {
    proxy.once('error', reject)
    proxy.listen(37173, '127.0.0.1', resolve)
  })

  let browser
  let connection
  try {
    browser = await chromium.launch({ executablePath: process.env.PHASE0_CHROME, headless: true })
    const context = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true })
    await context.addInitScript(() => {
      window.print = () => { document.body.dataset.printCalled = 'yes' }
      const originalOpen = window.open
      window.open = (...args) => {
        const popup = originalOpen.apply(window, args)
        if (popup) popup.print = () => { popup.document.body.dataset.printCalled = 'yes' }
        return popup
      }
    })
    const page = await context.newPage()
    const login = async (email, password) => {
      await page.goto(origin + '/admin/login')
      await page.locator('input[type=email]').fill(email)
      await page.locator('input[type=password]').fill(password)
      await Promise.all([
        page.waitForURL(origin + '/admin'),
        page.getByRole('button', { name: 'Sign in', exact: true }).click(),
      ])
    }
    const authCookie = async () => (await context.cookies()).find(cookie => cookie.name === sessionName)
    await login('phase0-admin@example.test', 'fixture-only long password')
    const initial = await authCookie()
    assert.ok(initial?.secure && initial.httpOnly)
    assert.equal(initial.sameSite, 'Lax')
    assert.ok(initial.expires > Date.now() / 1000)

    assert.equal(await page.evaluate(async () => {
      const response = await fetch('/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Browser fixture fabric' }),
      })
      return response.status
    }), 201)

    for (const [kind, label, partyPlaceholder, qtyIndex] of [
      ['purchases', 'Purchase', 'Party…', 1],
      ['sales', 'Sales', 'Customer…', 0],
    ]) {
      await page.goto(origin + '/admin/' + kind)
      const document = page.getByLabel(label + ' document number')
      await document.fill('BROWSER-' + kind)
      const row = page.locator('table tbody tr').first()
      await row.getByPlaceholder(partyPlaceholder).fill('Fixture account')
      await page.getByRole('option', { name: 'Fixture account' }).click()
      await row.getByPlaceholder('Product…').fill('Browser fixture fabric')
      await page.getByRole('option', { name: 'Browser fixture fabric' }).click()
      const qty = row.locator('input[type=number]').nth(qtyIndex)
      await qty.fill('2')
      let posts = 0
      const onRequest = request => {
        if (request.method() === 'POST' && request.url().endsWith('/api/inventory/' + kind + '/bulk')) posts++
      }
      page.on('request', onRequest)
      await page.getByRole('button', { name: 'Save', exact: true }).evaluate(button => {
        button.click()
        button.click()
      })
      await page.getByText('Saved ✔', { exact: true }).waitFor()
      assert.equal(await document.inputValue(), '')
      assert.equal(await qty.inputValue(), '')
      assert.equal(posts, 1)
      page.off('request', onRequest)
    }

    await page.getByRole('link', { name: 'Business settings', exact: true }).click()
    await page.waitForURL(origin + '/admin/business-settings')
    await page.reload()
    const settingsLink = page.getByRole('link', { name: 'Business settings', exact: true })
    assert.equal(await settingsLink.getAttribute('aria-current'), 'page')
    await settingsLink.scrollIntoViewIfNeeded()
    const businessName = page.getByLabel('Business name', { exact: true })
    await businessName.waitFor()
    assert.equal(await businessName.inputValue(), 'M AZEEM FABRICS')
    await page.getByText('24 meters per thaan', { exact: true }).waitFor()
    await page.getByText(/1 meter = 1,000,000 \u00b5m/).waitFor()
    const screenshots = process.env.PHASE1_SCREENSHOTS
    if (screenshots) await page.screenshot({ path: screenshots + '/business-settings-desktop.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    if (screenshots) await page.screenshot({ path: screenshots + '/business-settings-mobile.png', fullPage: true })
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.getByRole('button', { name: 'Add grade' }).click()
    const grade = page.locator('#grades')
    await grade.getByLabel('Code').last().fill('D')
    await grade.getByLabel('Label').last().fill('Sample')
    await page.getByRole('button', { name: 'Add method' }).click()
    const methods = page.locator('#paymentMethods')
    await methods.getByLabel('Code').last().fill('MOBILE')
    await methods.getByLabel('Label').last().fill('Mobile wallet')
    await page.getByRole('button', { name: 'Save settings' }).click()
    await page.getByText('Settings saved.', { exact: true }).waitFor()
    await page.reload()
    await grade.getByLabel('Label').last().waitFor()
    assert.equal(await grade.getByLabel('Label').last().inputValue(), 'Sample')
    assert.equal(await methods.getByLabel('Label').last().inputValue(), 'Mobile wallet')

    await page.goto(origin + '/admin/warehouse')
    await page.getByRole('heading', { name: 'Warehouse', exact: true }).waitFor()
    await page.getByText('DYE-300', { exact: true }).first().waitFor()
    const warehouseScreenshots = process.env.PHASE2A_SCREENSHOTS
    if (warehouseScreenshots) await page.screenshot({ path: warehouseScreenshots + '/warehouse-desktop.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    await page.getByRole('button', { name: 'Record dyeing return' }).click()
    await page.getByLabel('Dyeing job reference').waitFor()
    if (warehouseScreenshots) await page.screenshot({ path: warehouseScreenshots + '/warehouse-mobile.png', fullPage: true })
    const warehouseReference = page.getByLabel('Document reference')
    const warehouseJob = page.getByLabel('Dyeing job reference')
    const dyedLength = page.getByLabel('dyed length', { exact: true })
    const postDocument = page.getByRole('button', { name: 'Post document', exact: true })
    await warehouseReference.fill('BROWSER-RETURN-10')
    await warehouseJob.fill('DYE-300')
    await dyedLength.fill('121')
    await postDocument.click()
    await page.getByText('Return exceeds outstanding fabric', { exact: true }).waitFor()
    assert.equal(await warehouseReference.inputValue(), 'BROWSER-RETURN-10')
    assert.equal(await warehouseJob.inputValue(), 'DYE-300')
    assert.equal(await dyedLength.inputValue(), '121')

    await dyedLength.fill('10')
    let posts = 0
    const interceptWarehouse = async route => {
      if (route.request().method() === 'GET' && posts === 2) {
        await route.fulfill({ status: 503 })
        return
      }
      if (route.request().method() === 'POST') {
        posts++
        if (posts === 1) {
          const committed = await route.fetch()
          assert.equal(committed.status(), 201)
          await route.abort()
          return
        }
        const replay = await route.fetch()
        assert.equal(replay.status(), 200)
        await route.fulfill({ response: replay })
        return
      }
      await route.continue()
    }
    await page.route('**/api/warehouse', interceptWarehouse)
    await postDocument.evaluate(button => {
      button.click()
      button.click()
    })
    await page.getByText('Posting could not be confirmed. Retry with the same document reference and values.', { exact: true }).waitFor()
    assert.equal(posts, 1)
    assert.equal(await warehouseReference.inputValue(), 'BROWSER-RETURN-10')
    assert.equal(await warehouseJob.inputValue(), 'DYE-300')
    assert.equal(await dyedLength.inputValue(), '10')

    await postDocument.click()
    await page.getByText('Document posted successfully, but warehouse data could not be refreshed.', { exact: true }).waitFor()
    assert.equal(posts, 2)
    assert.equal(await warehouseReference.inputValue(), '')
    await page.unroute('**/api/warehouse', interceptWarehouse)

    await warehouseReference.fill('BROWSER-RETURN-10')
    await warehouseJob.fill('DYE-300')
    await dyedLength.fill('10')
    await postDocument.click()
    await page.getByText('This document was already posted.', { exact: true }).waitFor()
    await page.getByText(/110 m outstanding/).waitFor()
    const failRefresh = route => route.request().method() === 'GET'
      ? route.fulfill({ status: 503 })
      : route.continue()
    await page.route('**/api/warehouse', failRefresh)
    await warehouseReference.fill('BROWSER-RETURN-NEW')
    await warehouseJob.fill('DYE-300')
    await dyedLength.fill('1')
    await postDocument.click()
    await page.getByText('Document posted successfully, but warehouse data could not be refreshed.', { exact: true }).waitFor()
    assert.equal(await warehouseReference.inputValue(), '')
    await page.unroute('**/api/warehouse', failRefresh)
    const outstanding = await page.evaluate(async () => {
      const data = await (await fetch('/api/warehouse')).json()
      return data.jobs.find(job => job._id === 'DYE-300').outstandingUm
    })
    assert.equal(outstanding, 109000000)

    await page.setViewportSize({ width: 1280, height: 720 })
    await page.getByRole('link', { name: 'Cutting and finished inventory' }).click()
    await page.getByRole('heading', { name: 'Finished inventory', exact: true }).waitFor()
    await page.getByText('THAAN-MIXED', { exact: true }).waitFor()
    const productionScreenshots = process.env.PHASE2B_SCREENSHOTS
    if (productionScreenshots) await page.screenshot({ path: productionScreenshots + '/production-desktop.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    const selectAction = name => page.getByRole('button', { name, exact: true }).click()
    const submitProduction = async () => {
      await page.getByRole('button', { name: 'Post document', exact: true }).click()
      await page.getByText('Production document posted.', { exact: true }).waitFor()
    }
    await page.getByLabel('Document reference').fill('MOBILE-CUT')
    await page.getByLabel('Dyed lot reference').fill('LOT-500')
    await page.getByLabel('Allocation (meters)').fill('6')
    await submitProduction()
    await selectAction('Complete cutting')
    await page.getByLabel('Document reference').fill('MOBILE-BATCH')
    await page.getByLabel('Cutting order reference').fill('MOBILE-CUT')
    await page.getByLabel('Usable suits').fill('1')
    await page.getByLabel('Actual suit length (meters)').fill('5.5')
    await page.getByLabel('Cutting waste (meters)').fill('0.5')
    await submitProduction()
    await selectAction('Grade suits')
    await page.getByLabel('Document reference').fill('MOBILE-GRADE')
    await page.getByLabel('Cutting order reference').fill('MOBILE-CUT')
    await page.locator('select[name=grade]').selectOption('A')
    await page.getByLabel('Suit count').fill('1')
    await submitProduction()
    await selectAction('Pack thaan')
    await page.getByLabel('Thaan number').fill('MOBILE-THAAN')
    await page.getByLabel('Cutting order reference').fill('MOBILE-CUT')
    await page.getByLabel('Packed grade').fill('A')
    await page.getByLabel('Packed suits').fill('1')
    await submitProduction()
    await page.getByText('MOBILE-THAAN', { exact: true }).waitFor()
    const mobileThaan = page.locator('li').filter({ hasText: 'MOBILE-THAAN' }).filter({ hasText: '5.5 m' })
    await mobileThaan.waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    if (productionScreenshots) await page.screenshot({ path: productionScreenshots + '/production-mobile.png', fullPage: true })
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(origin + '/admin/inventory')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()])
    assert.match(download.suggestedFilename(), /^inventory-.*\.pdf$/)
    assert.equal((await readFile(await download.path())).subarray(0, 5).toString(), '%PDF-')

    await page.goto(origin + '/ledger')
    await page.getByRole('button', { name: 'Print', exact: true }).click()
    await page.locator('body[data-print-called=yes]').waitFor()

    await page.goto(origin + '/admin/reports')
    await page.locator('input[type=date]').nth(0).fill('2025-01-01')
    await page.locator('input[type=date]').nth(1).fill('2025-01-31')
    await page.getByPlaceholder('Contains text…').fill('Fixture printable')
    await page.getByText('Fixture printable row', { exact: true }).waitFor()
    for (const [label, heading] of [
      [/Export Results/, 'Transactions Report'],
      [/Export Monthly Summary/, 'Monthly Summary'],
    ]) {
      const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: label }).click()])
      await popup.getByRole('heading', { name: heading }).waitFor()
      await popup.locator('body[data-print-called=yes]').waitFor()
      await popup.close()
    }

    await Promise.all([page.waitForURL(origin + '/admin/login'), page.locator('button[title="Sign out"]:visible').first().click()])
    assert.equal(await authCookie(), undefined)
    await login('phase0-admin@example.test', 'fixture-only long password')
    assert.notEqual((await authCookie()).value, initial.value)
    connection = await mongoose.createConnection('mongodb://127.0.0.1:37171/?replicaSet=phase0&directConnection=true', {
      dbName: 'oarlinks_phase0_fixture', serverSelectionTimeoutMS: 5000,
    }).asPromise()
    await connection.db.collection('auth_sessions').updateMany({}, { $set: { expiresAt: new Date(0) } })
    await page.goto(origin + '/admin/inventory')
    await page.waitForURL(origin + '/admin/login')
    await login('phase0-member@example.test', 'fixture-only replacement password')
    assert.equal(await page.evaluate(async () => (await fetch('/api/users')).status), 403)
    assert.equal(await page.getByRole('link', { name: 'Business settings', exact: true }).count(), 0)
    await page.goto(origin + '/admin/business-settings')
    await page.waitForURL(origin + '/admin')
  } finally {
    await connection?.close()
    await browser?.close()
    proxy.closeAllConnections()
    await new Promise(resolve => proxy.close(resolve))
  }
})
