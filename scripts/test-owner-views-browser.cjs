/* Synthetic client-component proof. No auth, DB, or production requests.
 * PLAYWRIGHT_MODULE may point at a cached playwright-core installation. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { build } = require('esbuild')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core')
const output = path.resolve('docs/audits/owner-views-2026-11-16')
fs.mkdirSync(output, { recursive: true })

const baseInvoice = { id: '1', number: 'OPEN-SERVED', createdAt: '2026-11-16T08:00:00Z', branch: 'فرع تجريبي', table: '3', creator: 'موظف تجريبي', cashier: null, status: 'served', paymentStatus: 'unpaid', orderType: 'dine_in', notes: 'ملاحظة الطلب للعرض فقط', subtotal: '100.10', discount: '0.00', tax: '0.00', total: '100.10', paid: '69.80', remaining: '30.30', cancelledAt: null, cancelReason: null, isArchived: false, items: [{ id: 'item-1', productId: '1', name: 'قهوة تجريبية', quantity: 2, unitPrice: '50.05', lineTotal: '100.10', discountType: null, discountValue: '0', discountAmount: '0', eligibleForInvoiceDiscount: true, variantId: null, variantLabel: 'كبير', updatedAt: '2026-11-16T08:00:00Z', notes: 'بدون سكر', details: ['إضافة حليب'] }], payments: [] }
const fixtures = [
  baseInvoice,
  { ...baseInvoice, id: '2', number: 'OPEN-PARTIAL', status: 'preparing', total: '100.00', paid: '80.00', remaining: '20.00' },
  { ...baseInvoice, id: '3', number: 'PAID-TODAY', total: '100.10', paid: '100.10', remaining: '0.00', paymentStatus: 'paid' },
  { ...baseInvoice, id: '4', number: 'CANCELLED-TODAY', status: 'cancelled', total: '200.20', paid: '0.00', remaining: '200.20' },
  { ...baseInvoice, id: '5', number: 'ARCHIVED-TODAY', status: 'cancelled', isArchived: true, total: '400.40', remaining: '400.40' },
  { ...baseInvoice, id: '6', number: 'PAID-WEEK', createdAt: '2026-11-12T08:00:00Z', total: '50.50', paid: '50.50', remaining: '0.00' },
  { ...baseInvoice, id: '7', number: 'PAID-MONTH', createdAt: '2026-11-02T08:00:00Z', total: '60.60', paid: '60.60', remaining: '0.00' },
  { ...baseInvoice, id: '8', number: 'PAID-HISTORY', createdAt: '2026-10-01T08:00:00Z', total: '70.70', paid: '70.70', remaining: '0.00' },
  { ...baseInvoice, id: '9', number: 'PAID-FUTURE', createdAt: '2026-11-17T08:00:00Z', total: '80.80', paid: '80.80', remaining: '0.00' },
]
fs.writeFileSync(path.join(output, 'fixtures.json'), JSON.stringify(fixtures, null, 2))

async function main() {
  const css = await require('postcss')([require('tailwindcss')(require('../tailwind.config.ts').default || require('../tailwind.config.ts'))]).process(fs.readFileSync('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') })
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {OwnerOpenOrdersBoard} from './src/components/owner/owner-open-orders-board';
    import {OwnerInvoiceBoard} from './src/components/owner/owner-invoice-board';
    const invoices=${JSON.stringify(fixtures)}; const root=createRoot(document.getElementById('root'));
    window.renderBoard=(board,rows=invoices)=>root.render(<React.Fragment key={board}><main className="mx-auto max-w-7xl p-3"><div data-testid="board">{board==='orders'?<OwnerOpenOrdersBoard invoices={rows}/>:<OwnerInvoiceBoard invoices={rows} session={{role:'owner',name:'Owner',branchId:null}}/>}</div></main></React.Fragment>);
    window.refreshInvoices=()=>window.renderBoard('invoices',invoices.filter(invoice=>invoice.id!=='3'));
  ` }, bundle: true, write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'next-adapter', setup(builder) { builder.onResolve({ filter: /^next\/navigation$/ }, args => ({ path: args.path, namespace: 'fixture' })); builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const useRouter=()=>({refresh(){},push(){}})', loader: 'js' })) } }] })
  const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`
  const server = http.createServer((request, response) => { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(html) })
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.clock.install({ time: new Date('2026-11-16T10:00:00Z') })
  const checks = [], failures = [], errors = [], requests = [], exports = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const request = route.request()
    if (request.url().includes('/api/staff/invoices?')) { exports.push(request.url()); return route.abort() }
    if (!request.url().startsWith(origin)) { requests.push(request.url()); return route.abort() }
    if (request.url().includes('/api/')) { requests.push(`${request.method()} ${request.url()}`); return route.abort() }
    return route.continue()
  })
  async function check(name, run) { try { await run(); checks.push(name); console.log(`PASS ${name}`) } catch (error) { failures.push({ name, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`) } }
  async function fixture(board) { await page.goto(origin); await page.evaluate(board => window.renderBoard(board), board); await page.locator('[data-testid="board"]').waitFor(); await page.waitForTimeout(60) }
  const card = label => page.getByText(label, { exact: true }).locator('..')
  async function paidTab() { await page.getByRole('button', { name: 'مدفوعة', exact: true }).click() }
  async function expectAmount(label, amount) { assert.match(await card(label).innerText(), new RegExp(amount.replace('.', '\\.'))) }
  async function verifyExport(from, to) {
    const previous = exports.length
    await page.getByRole('button', { name: 'تصدير إكسيل (مدفوعة)', exact: true }).click()
    await page.waitForFunction(() => true)
    for (let attempt = 0; exports.length === previous && attempt < 20; attempt++) await page.waitForTimeout(25)
    assert.equal(exports.length, previous + 1)
    const params = new URL(exports.at(-1)).searchParams
    assert.equal(params.get('from'), from); assert.equal(params.get('to'), to)
  }
  try {
    await check('open orders include served and partial unpaid; exclude paid cancelled archived', async () => {
      await fixture('orders')
      for (const number of ['OPEN-SERVED', 'OPEN-PARTIAL']) assert.equal(await page.getByText(number, { exact: true }).count(), 1)
      for (const number of fixtures.slice(2).map(row => row.number)) assert.equal(await page.getByText(number, { exact: true }).count(), 0)
    })
    await check('order details are read-only; Escape restores trigger focus', async () => {
      const trigger = page.getByRole('button', { name: 'عرض تفاصيل الطلب OPEN-SERVED', exact: true })
      await trigger.click(); const dialog = page.getByRole('dialog'); await dialog.waitFor()
      for (const text of ['قهوة تجريبية', 'كبير', 'بدون سكر', 'إضافة حليب', 'ملاحظة الطلب للعرض فقط']) assert.ok((await dialog.innerText()).includes(text))
      assert.equal(await dialog.locator('input,select,textarea,[contenteditable="true"]').count(), 0)
      assert.equal(await dialog.getByRole('button').count(), 1)
      for (let index = 0; index < 4; index++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('dialog')), true) }
      await page.screenshot({ path: path.join(output, 'orders-detail-desktop.png'), fullPage: true })
      await page.keyboard.press('Escape'); await page.waitForTimeout(60)
      assert.equal(await page.getByRole('dialog').count(), 0)
      assert.equal(await trigger.evaluate(element => document.activeElement === element), true)
    })
    await check('both boards and order detail reflow at mobile and desktop widths', async () => {
      for (const width of [375, 1440]) for (const board of ['orders', 'invoices']) {
        await page.setViewportSize({ width, height: 1000 }); await fixture(board)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${board} overflow at ${width}`)
        await page.screenshot({ path: path.join(output, `${board}-${width}.png`), fullPage: true })
        if (board === 'orders') { await page.getByRole('button', { name: 'عرض تفاصيل الطلب OPEN-SERVED', exact: true }).click(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.screenshot({ path: path.join(output, `orders-detail-${width}.png`), fullPage: true }); await page.keyboard.press('Escape') }
      }
    })
    await check('invoice default today has four exclusive amounts and counts', async () => {
      await fixture('invoices')
      assert.equal(await page.getByLabel('من تاريخ إنشاء الفاتورة').inputValue(), '2026-11-16')
      await expectAmount('قيمة الفواتير المدفوعة', '100.10'); await expectAmount('القيمة الاسمية للفواتير الملغاة', '200.20'); await expectAmount('المتبقي على الفواتير المفتوحة', '50.30'); await expectAmount('القيمة الاسمية للفواتير المؤرشفة', '400.40')
      assert.match(await card('المتبقي على الفواتير المفتوحة').innerText(), /2 فاتورة/)
      for (const label of ['قيمة الفواتير المدفوعة', 'القيمة الاسمية للفواتير الملغاة', 'القيمة الاسمية للفواتير المؤرشفة']) assert.match(await card(label).innerText(), /1 فاتورة/)
    })
    await check('settled served invoice badge says paid; search leaves aggregates unchanged; day CSV matches range', async () => {
      await paidTab(); const row = page.getByRole('button').filter({ hasText: 'PAID-TODAY' })
      assert.match(await row.innerText(), /مدفوعة/); assert.doesNotMatch(await row.innerText(), /مفتوحة/)
      await page.getByPlaceholder('ابحث برقم الفاتورة أو المنشئ').fill('no-match')
      await expectAmount('قيمة الفواتير المدفوعة', '100.10')
      assert.equal(await page.getByText('PAID-TODAY', { exact: true }).count(), 0)
      await verifyExport('2026-11-16', '2026-11-16')
    })
    await check('last seven days filters cards and rows; CSV shares effective dates', async () => {
      await fixture('invoices'); await paidTab(); await page.getByRole('button', { name: 'آخر ٧ أيام', exact: true }).click()
      await expectAmount('قيمة الفواتير المدفوعة', '150.60')
      assert.equal(await page.getByText('PAID-WEEK', { exact: true }).count(), 1); assert.equal(await page.getByText('PAID-MONTH', { exact: true }).count(), 0)
      await verifyExport('2026-11-10', '2026-11-16')
    })
    await check('calendar month filters cards and rows; CSV shares effective dates', async () => {
      await fixture('invoices'); await paidTab(); await page.getByRole('button', { name: 'الشهر الحالي', exact: true }).click()
      await expectAmount('قيمة الفواتير المدفوعة', '211.20')
      assert.equal(await page.getByText('PAID-MONTH', { exact: true }).count(), 1); assert.equal(await page.getByText('PAID-HISTORY', { exact: true }).count(), 0)
      await verifyExport('2026-11-01', '2026-11-16')
    })
    await check('custom dates filter cards and rows; CSV shares explicit dates', async () => {
      await fixture('invoices'); await paidTab()
      await page.getByLabel('من تاريخ إنشاء الفاتورة').fill('2026-11-12'); await page.getByLabel('إلى تاريخ إنشاء الفاتورة').fill('2026-11-12')
      await expectAmount('قيمة الفواتير المدفوعة', '50.50')
      assert.equal(await page.getByText('PAID-WEEK', { exact: true }).count(), 1); assert.equal(await page.getByText('PAID-TODAY', { exact: true }).count(), 0)
      await verifyExport('2026-11-12', '2026-11-12')
    })
    await check('reversed and missing date ranges show error and block rows and CSV', async () => {
      await fixture('invoices'); await paidTab()
      await page.getByLabel('من تاريخ إنشاء الفاتورة').fill('2026-11-17')
      assert.ok(await page.getByRole('alert').isVisible()); assert.equal(await page.getByRole('button', { name: 'تصدير إكسيل (مدفوعة)', exact: true }).isDisabled(), true)
      assert.equal(await page.getByText('PAID-TODAY', { exact: true }).count(), 0)
      await page.getByLabel('من تاريخ إنشاء الفاتورة').fill('')
      assert.ok(await page.getByRole('alert').isVisible()); assert.equal(await page.getByRole('button', { name: 'تصدير إكسيل (مدفوعة)', exact: true }).isDisabled(), true)
      await page.screenshot({ path: path.join(output, 'invoice-invalid-range.png'), fullPage: true })
    })
    await check('all history restores older rows; CSV omits date bounds', async () => {
      await fixture('invoices'); await paidTab(); await page.getByRole('button', { name: 'كل التاريخ', exact: true }).click()
      await expectAmount('قيمة الفواتير المدفوعة', '362.70'); assert.equal(await page.getByText('PAID-HISTORY', { exact: true }).count(), 1)
      await verifyExport(null, null)
    })
    await check('incoming invoice refresh updates local rows and summary without resetting range', async () => {
      await fixture('invoices'); await paidTab()
      await page.evaluate(() => window.refreshInvoices())
      await page.waitForTimeout(60)
      await expectAmount('قيمة الفواتير المدفوعة', '0.00')
      assert.equal(await page.getByText('PAID-TODAY', { exact: true }).count(), 0)
      assert.equal(await page.getByLabel('من تاريخ إنشاء الفاتورة').inputValue(), '2026-11-16')
    })
    await check('no runtime errors or unexpected external/API requests', async () => { assert.deepEqual(errors, []); assert.deepEqual(requests, []) })
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ timestamp: new Date().toISOString(), fixtureClock: '2026-11-16T10:00:00Z', checks, failures, runtimeErrors: errors, unexpectedRequests: requests, interceptedExports: exports }, null, 2))
    await browser.close(); await new Promise(resolve => server.close(resolve))
  }
  if (failures.length) process.exitCode = 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
