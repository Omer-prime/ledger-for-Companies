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

    await page.getByRole('link', { name: 'Business Settings', exact: true }).click()
    await page.waitForURL(origin + '/admin/business-settings')
    await page.reload()
    const settingsLink = page.getByRole('link', { name: 'Business Settings', exact: true })
    assert.equal(await settingsLink.getAttribute('aria-current'), 'page')
    await settingsLink.scrollIntoViewIfNeeded()
    const businessName = page.getByLabel('Business name', { exact: true })
    await businessName.waitFor()
    assert.equal(await businessName.inputValue(), 'M AZEEM FABRICS')
    await page.getByLabel('Currency code').fill('PKR')
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
    await page.getByRole('heading', { name: 'Fabric Warehouse', exact: true }).waitFor()
    await page.getByText('DYE-300', { exact: true }).first().waitFor()
    const warehouseScreenshots = process.env.PHASE2A_SCREENSHOTS
    if (warehouseScreenshots) await page.screenshot({ path: warehouseScreenshots + '/warehouse-desktop.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    await page.getByRole('button', { name: 'Receive dyed fabric' }).click()
    await page.locator('input[name=jobId]').waitFor()
    if (warehouseScreenshots) await page.screenshot({ path: warehouseScreenshots + '/warehouse-mobile.png', fullPage: true })
    const warehouseReference = page.locator('input[name=reference]')
    const warehouseJob = page.locator('input[name=jobId]')
    const dyedLength = page.getByLabel('dyed length', { exact: true })
    const postDocument = page.getByRole('button', { name: 'Save warehouse document', exact: true })
    await warehouseReference.fill('BROWSER-RETURN-10')
    await warehouseJob.fill('DYE-300')
    await page.locator('input[name=lost]').fill('600')
    assert.equal(await page.locator('input[name=reason]').evaluate(input => input.validity.valueMissing), true)
    await page.locator('input[name=lost]').fill('0')
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
    await page.getByText('Posting could not be confirmed. Retry with the SAME document reference and values; do not make a new reference.', { exact: true }).waitFor()
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
    await page.getByRole('link', { name: 'Allocate for cutting' }).click()
    await page.getByRole('heading', { name: 'Finished inventory', exact: true }).waitFor()
    await page.getByText('THAAN-C1', { exact: true }).waitFor()
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
    await page.getByLabel('Available dyed lot').selectOption('LOT-500')
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
    await page.getByText('Standard thaan: 4 suits of one grade.', { exact: true }).waitFor()
    assert.equal(await page.locator('input[name=targetSuits]').count(), 0)
    assert.equal(await page.getByLabel('Packed grade').count(), 1)
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
    await page.getByRole('heading', { name: 'Customer statements' }).waitFor()
    await page.getByRole('link', { name: 'Customer Statements' }).waitFor()
    await page.getByRole('button', { name: 'Today', exact: true }).click()
    const expectedDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    assert.equal(await page.locator('input[type=date]').first().inputValue(), expectedDay)
    await page.locator('input[type=date]').first().fill('2025-01-01')
    await page.locator('input[type=date]').last().fill('2025-01-31')
    await page.locator('select').first().selectOption({ label: 'Fixture account (party)' })
    await page.getByText('Fixture idempotent ledger row', { exact: true }).waitFor()
    const statementScreenshots = process.env.PHASE2A_SCREENSHOTS
    if (statementScreenshots) await page.screenshot({ path: statementScreenshots + '/customer-statement-desktop.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    if (statementScreenshots) await page.screenshot({ path: statementScreenshots + '/customer-statement-mobile.png', fullPage: true })
    await page.setViewportSize({ width: 1280, height: 720 })
    for (const [paper, width, height] of [['A4', 595, 842], ['A5', 420, 595]]) {
      await page.getByLabel('Print size').selectOption(paper)
      const pdf = Buffer.from(await page.pdf({ preferCSSPageSize: true })).toString('latin1')
      const mediaBox = pdf.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/)
      assert.ok(mediaBox, paper + ' page box missing')
      assert.ok(Math.abs(Number(mediaBox[1]) - width) < 4 && Math.abs(Number(mediaBox[2]) - height) < 4, paper + ': ' + mediaBox[0])
    }
    await page.getByRole('button', { name: 'Print', exact: true }).click()
    await page.locator('body[data-print-called=yes]').waitFor()

    await page.goto(origin + '/admin/shop-setup')
    await page.getByRole('heading', { name: 'Set up your shop' }).waitFor()
    await page.getByRole('link', { name: /financial accounts and approval/ }).click()
    await page.getByRole('button', { name: 'Create Cash on hand' }).click()
    await page.getByText(/Cash on hand is available to select/).waitFor()
    await page.goto(origin + '/admin/opening-stock')
    await page.getByLabel(/Batch reference/).fill('BROWSER-SINGLE')
    await page.getByLabel('Physical count date').fill('2025-01-02')
    await page.getByLabel(/Stock identifier/).fill('BROWSER-LOOSE')
    await page.locator('select').filter({has:page.locator('option[value=loose]')}).selectOption('loose')
    await page.getByLabel('Fabric', {exact:true}).fill('Linen')
    await page.locator('select[name=grade]').selectOption('A')
    await page.getByLabel('Length per suit (m)').fill('6')
    await page.getByLabel(/Total historical cost/).fill('800')
    await page.getByLabel(/Optional selling price/).fill('1500')
    await page.getByLabel('Source description').fill('Fixture stock count')
    await page.getByRole('button',{name:'Stage item'}).click()
    for(const [kind,id] of [['full','BROWSER-FULL'],['partial','BROWSER-PART']]){
      await page.locator('select').filter({has:page.locator('option[value=loose]')}).selectOption(kind)
      await page.getByLabel(/Stock identifier/).fill(id)
      await page.getByLabel('Fabric',{exact:true}).fill('Cotton')
      await page.locator('select[name=grade]').selectOption('A')
      if(kind==='partial') await page.getByLabel('Suit count').fill('2')
      await page.getByLabel('Length per suit (m)').fill('6')
      await page.getByLabel(/Total historical cost/).fill('2400')
      await page.getByLabel('Source description').fill('Fixture stock count')
      if(kind==='partial'){
        await page.getByLabel('Suit count').fill('4')
        assert.equal(await page.getByLabel('Suit count').evaluate(input=>input.validity.rangeOverflow),true)
        await page.getByLabel('Suit count').fill('2')
        await page.locator('select[name=grade]').selectOption('')
        assert.equal(await page.locator('select[name=grade]').evaluate(input=>input.validity.valueMissing),true)
        await page.locator('select[name=grade]').selectOption('A')
      }
      await page.getByRole('button',{name:'Stage item'}).click()
    }
    await page.getByRole('button',{name:'Preview batch'}).click()
    await page.getByRole('row').filter({hasText:'BROWSER-FULL'}).getByText('24',{exact:true}).waitFor()
    await page.getByRole('row').filter({hasText:'BROWSER-PART'}).getByText('12',{exact:true}).waitFor()
    const single=page.getByRole('row').filter({hasText:'BROWSER-LOOSE'})
    await single.getByText('800.00',{exact:true}).waitFor()
    await single.getByText('1,500.00',{exact:true}).waitFor()
    await page.getByRole('button',{name:'Edit BROWSER-FULL',exact:true}).click()
    await page.getByLabel(/Stock identifier/).fill('BROWSER-FULL-FINAL')
    await page.getByRole('button',{name:'Update staged item'}).click()
    await page.getByRole('row').filter({hasText:'BROWSER-PART'}).getByRole('button',{name:'Remove',exact:true}).click()
    assert.equal(await page.getByRole('cell',{name:'BROWSER-FULL',exact:true}).count(),0)
    assert.equal(await page.getByRole('cell',{name:'BROWSER-PART',exact:true}).count(),0)
    await page.getByRole('button',{name:'Preview batch'}).click()
    await page.getByRole('heading',{name:/Review BROWSER-SINGLE/}).waitFor()
    const loseOpening=async route=>{
      if(route.request().method()!=='POST') return route.continue()
      assert.equal((await route.fetch()).status(),201)
      await route.abort()
    }
    await page.route('**/api/opening-stock',loseOpening)
    await page.getByRole('button',{name:'Confirm batch'}).click()
    await page.getByRole('button',{name:'Retry same batch'}).waitFor()
    await page.unroute('**/api/opening-stock',loseOpening)
    await page.getByRole('button',{name:'Retry same batch'}).click()
    await page.getByText(/BROWSER-SINGLE.*Pending Verification/).waitFor()
    await page.setViewportSize({width:390,height:844})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true)
    await page.setViewportSize({width:1280,height:720})
    await page.getByRole('button',{name:'Import CSV'}).click()
    await page.getByLabel(/Batch reference/).fill('BROWSER-OPENING')
    await page.getByLabel('Physical count date').fill('2025-01-02')
    await page.getByLabel('CSV rows').fill('identifier,kind,fabric,design,size,grade,suits,meters,costPkr,sellingPricePkr,source,evidence\nSHOP-001,full,Cotton,Blue,,A,4,6,2400,,Fixture opening count,Invoice 123')
    await page.getByRole('button', {name:'Preview import'}).click()
    await page.getByRole('row').filter({hasText:'SHOP-001'}).getByText('2,400.00',{exact:true}).waitFor()
    await page.getByRole('button', {name:'Confirm import'}).click()
    await page.getByText(/BROWSER-OPENING.*Pending Verification/).waitFor()
    const batchPanel=page.locator('#verify > div').filter({hasText:'BROWSER-SINGLE'})
    await batchPanel.getByLabel('Count and cost evidence').fill('Fixture inventory count and invoice')
    await batchPanel.getByRole('button',{name:'Verify physical count and historical costs'}).click()
    await batchPanel.getByText(/Count and Cost Verified/).waitFor()

    // A disposable posted document exercises the actual POS print buttons.
    const printConnection = await mongoose.createConnection('mongodb://127.0.0.1:37171/?replicaSet=phase0&directConnection=true', {
      dbName: (process.env.OARLINKS_TEST_RUN && /^[a-z0-9]{1,16}$/.test(process.env.OARLINKS_TEST_RUN) ? 'oarlinks_disposable_' + process.env.OARLINKS_TEST_RUN + '_phase0' : 'oarlinks_disposable_release_1114_phase0'), serverSelectionTimeoutMS: 5000,
    }).asPromise()
    try {
      const savedBatch=await printConnection.db.collection('textile_thaans').find({'opening.reference':'BROWSER-SINGLE'}).sort({_id:1}).toArray()
      assert.deepEqual(savedBatch.map(item=>[item._id,item.suits,item.opening.costPaisa]),[
        ['BROWSER-FULL-FINAL',4,240000],['BROWSER-LOOSE',1,80000],
      ])
      const keys = ['cash','bank','receivables','revenue','finishedInventory','cogs']
      const accounts = Object.fromEntries(keys.map(key => [key, new mongoose.Types.ObjectId()]))
      await printConnection.db.collection('accounts').insertMany(keys.map(key => ({ _id: accounts[key], name: 'Browser GL ' + key, type: 'gl' })))
      await page.goto(origin+'/admin/checkout')
      await page.getByRole('checkbox',{name:/MOBILE-THAAN/}).waitFor()
      assert.equal(await page.getByRole('checkbox',{name:/BROWSER-LOOSE/}).count(),0)
      await page.goto(origin+'/admin/financial-setup')
      for(const key of keys) await page.locator('select[name="'+key+'"]').selectOption(String(accounts[key]))
      await page.getByRole('button',{name:'Review and confirm approval'}).click()
      const attestations=page.locator('#pos-accounting input[type=checkbox]')
      assert.equal(await attestations.count(),2)
      assert.equal(await attestations.first().isChecked(),false)
      await page.getByLabel('Owner/accountant approval reference').fill('Browser fixture approval')
      await page.locator('textarea[name=orders]').fill('MOBILE-CUT')
      await page.locator('textarea[name=opening]').fill('BROWSER-SINGLE')
      await attestations.first().check()
      await attestations.last().check()
      await page.getByRole('button',{name:'Approve POS posting'}).click()
      await page.getByText('POS accounting approved.',{exact:true}).waitFor()
      await page.goto(origin + '/admin/checkout')
      await page.getByRole('checkbox',{name:/BROWSER-LOOSE/}).waitFor()
      assert.equal(await page.getByRole('checkbox',{name:/SHOP-001/}).count(),0)
      await page.getByLabel('Document number').fill('BROWSER-WALKIN')
      await page.getByRole('checkbox', { name: /BROWSER-FULL-FINAL/ }).check()
      await page.getByLabel('Total sale amount (PKR)', { exact: true }).fill('3000')
      const loseConfirmation = async route => {
        if (route.request().method() !== 'POST') return route.continue()
        assert.equal((await route.fetch()).status(), 201)
        await route.abort()
      }
      await page.route('**/api/checkout', loseConfirmation)
      await page.getByRole('button', { name: 'Complete Sale' }).click()
      await page.getByText(/Response lost. Retry with the SAME reference/).waitFor()
      await page.unroute('**/api/checkout', loseConfirmation)
      await page.getByRole('button', { name: 'Complete Sale' }).click()
      await page.getByText(/already posted. No duplicate/).waitFor()
      const record = await printConnection.db.collection('checkout_documents').findOne({ _id: 'sale:BROWSER-WALKIN' })
      assert.equal(record.items[0].totalUm, 6000000)
      assert.equal(record.items[0].costPaisa, 60000)
      const journal=await printConnection.db.collection('journal_entries').findOne({_id:record.journalId})
      assert.deepEqual(journal.lines.map(line=>[line.accountId,line.debitPaisa,line.creditPaisa]),[
        [String(accounts.cash),300000,0],[String(accounts.revenue),0,300000],
        [String(accounts.cogs),60000,0],[String(accounts.finishedInventory),0,60000],
      ])
      const report = await page.evaluate(async () => (await fetch('/api/checkout')).json())
      assert.equal(report.totals.cashReceived, 3000)
      assert.ok(report.dailyDocuments.some(doc => doc.reference === 'BROWSER-WALKIN'))
      assert.equal(report.thaans.find(thaan=>thaan.id==='BROWSER-FULL-FINAL')?.suits,3)
      assert.equal(report.thaans.find(thaan=>thaan.id==='BROWSER-FULL-FINAL')?.totalUm,18000000)
      assert.ok(report.thaans.some(thaan=>thaan.id==='MOBILE-THAAN'))
      await page.getByRole('checkbox',{name:/BROWSER-FULL-FINAL.*3 suits left/}).waitFor()
      await page.getByRole('button',{name:'Print Daily Report'}).waitFor()
      assert.equal(await printConnection.db.collection('transactions').countDocuments({ 'meta.source': record._id }), 0)
    } finally {
      await printConnection.close()
    }
    await page.goto(origin + '/admin/checkout')
    const printCases = [
      ['a4', 'Print Receipt', 210, 297],
      ['a5', 'Print Receipt', 148, 210],
      ['thermal', 'Print Receipt', 80, 200],
      ['sticker', 'Sticker BROWSER-FULL-FINAL', 50, 30],
    ]
    for (const [paper, button, mmWidth, mmHeight] of printCases) {
      await page.getByLabel('Print paper').selectOption(paper)
      const [popup] = await Promise.all([
        page.waitForEvent('popup'), page.getByRole('button', { name: button, exact: true }).first().click(),
      ])
      await popup.locator('body[data-print-called=yes]').waitFor()
      if (paper === 'sticker') {
        assert.ok(await popup.locator('svg rect').count() > 20)
        await popup.getByText('BROWSER-FULL-FINAL', { exact: true }).waitFor()
      } else {
        await popup.getByText('SALE RECEIPT', { exact: true }).waitFor()
        await popup.getByText(/Operator: phase0-admin/).waitFor()
      }
      const pdf = await popup.pdf({ preferCSSPageSize: true, printBackground: true })
      const raw = pdf.toString('latin1')
      const box = /\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/.exec(raw)
      assert.ok(box, 'PDF media box missing')
      assert.ok(Math.abs(Number(box[1]) - mmWidth * 72 / 25.4) < 2)
      assert.ok(Math.abs(Number(box[2]) - mmHeight * 72 / 25.4) < 2)
      assert.equal((raw.match(/\/Type\s*\/Page\b/g) ?? []).length, 1, 'Fixture print fits one page')
      await popup.close()
    }

    await page.getByLabel('Buyer').selectOption('registered')
    await page.getByLabel('Registered customer').selectOption({label:'Fixture account'})
    await page.getByLabel('Document number').fill('BROWSER-PART-PAID')
    await page.getByRole('checkbox',{name:/BROWSER-FULL-FINAL/}).check()
    await page.getByLabel('Sale type').selectOption('partial')
    await page.getByLabel('Total sale amount (PKR)',{exact:true}).fill('3000')
    await page.getByLabel('Payment now (PKR)',{exact:true}).fill('1000')
    await page.getByRole('button',{name:'Complete Sale'}).click()
    await page.getByRole('row').filter({hasText:'BROWSER-PART-PAID'}).waitFor()
    await page.getByRole('checkbox',{name:/BROWSER-FULL-FINAL.*2 suits left/}).waitFor()
    const dayReport=await page.evaluate(async()=> (await fetch('/api/checkout')).json())
    assert.equal(dayReport.totals.saleTotal,6000)
    assert.equal(dayReport.totals.cashReceived,4000)
    assert.equal(dayReport.totals.newUdhar,2000)
    const balances=await page.evaluate(async day=>(await fetch('/api/pos-accounting?date='+day)).json(),dayReport.day)
    assert.equal(balances.journal.reduce((sum,line)=>sum+BigInt(line.debitPaisa)-BigInt(line.creditPaisa),BigInt(0)),BigInt(0))

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
      dbName: (process.env.OARLINKS_TEST_RUN && /^[a-z0-9]{1,16}$/.test(process.env.OARLINKS_TEST_RUN) ? 'oarlinks_disposable_' + process.env.OARLINKS_TEST_RUN + '_phase0' : 'oarlinks_disposable_release_1114_phase0'), serverSelectionTimeoutMS: 5000,
    }).asPromise()
    await connection.db.collection('auth_sessions').updateMany({}, { $set: { expiresAt: new Date(0) } })
    await page.goto(origin + '/admin/inventory')
    await page.waitForURL(origin + '/admin/login')
    await login('phase0-member@example.test', 'fixture-only replacement password')
    assert.equal(await page.evaluate(async () => (await fetch('/api/users')).status), 403)
    assert.equal(await page.evaluate(async () => (await fetch('/api/opening-stock')).status), 403)
    assert.equal(await page.evaluate(async () => (await fetch('/api/pos-accounting',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status),403)
    assert.equal(await page.evaluate(async () => (await fetch('/api/pos-accounting', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 1, approval: null }),
    })).status), 403)
    assert.equal(await page.getByRole('link', { name: 'Business Settings', exact: true }).count(), 0)
    await page.goto(origin + '/admin/business-settings')
    await page.waitForURL(origin + '/admin')
  } finally {
    await connection?.close()
    await browser?.close()
    proxy.closeAllConnections()
    await new Promise(resolve => proxy.close(resolve))
  }
})
