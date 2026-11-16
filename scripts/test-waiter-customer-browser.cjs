/* Actual waiter component with synthetic data and intercepted write requests. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { build } = require('esbuild')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core')
const output = path.resolve('docs/audits/waiter-customer-2026-11-16')
fs.mkdirSync(output, { recursive: true })
const table = { id: '1', number: '1', name: null, capacity: 4, openOrders: 0 }
const workspace = { currentRole: 'waiter', currentUserId: '11111111-1111-4111-8111-111111111111', branchId: '1', branchName: 'Test branch', employeeName: 'Test waiter', shift: { id: '1', openedAt: '2026-11-16T09:00:00Z' }, tables: [table], openOrders: [], categories: [{ id: '1', name: 'Test menu' }], products: [{ id: '11', name: 'Test coffee', price: '100.00', categoryId: '1', isAvailable: true, variants: [], modifierGroups: [] }], incomingHandovers: [], incomingTableTransfers: [], outgoingTableTransfers: [] }

async function main() {
  const css = await require('postcss')([require('tailwindcss')(require('../tailwind.config.ts').default || require('../tailwind.config.ts'))]).process(fs.readFileSync('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') })
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {WaiterTableWorkspace} from './src/components/waiter/waiter-table-workspace';
    window.Audio=class {play(){return Promise.resolve()}};
    createRoot(document.getElementById('root')).render(<WaiterTableWorkspace workspace={${JSON.stringify(workspace)}} table={${JSON.stringify(table)}}/>);
  ` }, bundle: true, write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'next-fixture', setup(builder) { builder.onResolve({ filter: /^next\/navigation$/ }, args => ({ path: args.path, namespace: 'fixture' })); builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const useRouter=()=>({refresh(){},push(){},replace(){}})', loader: 'js' })) } }] })
  const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`
  const server = http.createServer((_request, response) => { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(html) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) })
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } })
  const origin = `http://127.0.0.1:${server.address().port}`
  const errors = [], submitted = [], checks = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const request = route.request()
    if (request.url() === `${origin}/api/staff/pos/orders`) { submitted.push(request.postDataJSON()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '123', orderNumber: 'TEST-123' }) }) }
    if (request.url() === `${origin}/api/staff/orders/123/send`) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    if (!request.url().startsWith(origin)) return route.abort()
    return route.continue()
  })
  try {
    for (const [name, phone] of [['  Test customer  ', '  01012345678  '], ['', ''], ['Only name', ''], ['', '01012345678']]) {
      await page.goto(origin)
      await page.getByRole('button', { name: 'pos', exact: true }).click()
      await page.getByRole('button', { name: /Test coffee/ }).click()
      await page.getByRole('button', { name: /تفاصيل السلة/ }).click()
      const dialog = page.getByRole('dialog', { name: 'سلة الطلب', exact: true })
      await dialog.waitFor()
      const nameInput = dialog.getByRole('textbox', { name: 'اسم العميل (اختياري)', exact: true })
      const phoneInput = dialog.getByRole('textbox', { name: 'رقم الموبايل (اختياري)', exact: true })
      await nameInput.waitFor({ timeout: 3000 })
      assert.equal(await nameInput.getAttribute('required'), null)
      assert.equal(await phoneInput.getAttribute('required'), null)
      await nameInput.fill(name); await phoneInput.fill(phone)
      if (name && phone) {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
        await page.screenshot({ path: path.join(output, 'optional-customer-mobile.png'), fullPage: true })
      }
      const before = submitted.length
      await dialog.getByRole('button', { name: 'تأكيد الطلب وإرساله للمطبخ', exact: true }).click()
      await dialog.waitFor({ state: 'detached' })
      assert.equal(submitted.length, before + 1)
      const body = submitted.at(-1)
      assert.equal(body.customerName, name.trim() || undefined)
      assert.equal(body.customerPhone, phone.trim() || undefined)
      assert.equal(body.tableId, '1')
      assert.equal(body.items[0].productId, '11')
      checks.push(`optional customer name=${!!name} phone=${!!phone}`)
    }
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ synthetic: true, checks, runtimeErrors: errors, submitted }, null, 2))
    console.log(JSON.stringify({ passed: checks.length, runtimeErrors: errors.length }))
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
