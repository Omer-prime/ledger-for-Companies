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
    await page.getByLabel('Document reference').fill('BROWSER-RETURN-10')
    await page.getByLabel('Dyeing job reference').fill('DYE-300')
    await page.getByLabel('dyed length', { exact: true }).fill('10')
    await page.getByRole('button', { name: 'Post document', exact: true }).click()
    await page.getByText('Warehouse document posted.', { exact: true }).waitFor()
    await page.getByText(/110 m outstanding/).waitFor()
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
