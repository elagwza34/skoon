/* Run against a local dev server: node scripts/test-ui-ux-browser.cjs
 * Set PLAYWRIGHT_MODULE to an installed playwright-core path when it is not a
 * project dependency. The component harness never authenticates or writes data. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { build } = require('esbuild')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core')
const base = process.env.UI_TEST_URL || 'http://127.0.0.1:3100'
const output = path.resolve('docs/audits/ui-ux-2026-11-16/after')
fs.mkdirSync(output, { recursive: true })

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
  const context = await browser.newContext({ permissions: ['camera'], viewport: { width: 375, height: 900 } })
  const page = await context.newPage()
  const failures = []
  const checks = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  async function check(name, run) {
    try { await run(); checks.push(name); console.log(`PASS ${name}`) }
    catch (error) { failures.push({ name, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`) }
  }
  let css = ''
  await check('homepage reflows at phone, tablet, desktop and landscape sizes', async () => {
    for (const width of [375, 768, 1440, 844]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 900 })
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.getByRole('heading', { level: 1 }).waitFor()
      await page.waitForTimeout(300)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`)
      assert.equal(await page.locator('dialog').count(), 0, 'closed drawer should not exist')
      await page.screenshot({ path: path.join(output, `home-${width}.png`), fullPage: true })
    }
    for (const href of await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.href))) css += await (await page.request.get(href)).text()
  })
  await check('public drawer traps focus, closes with Escape and restores trigger', async () => {
    await page.setViewportSize({ width: 375, height: 900 })
    const trigger = page.getByRole('button', { name: 'فتح القائمة', exact: true })
    await trigger.click()
    await page.getByRole('dialog', { name: 'قائمة التنقل' }).waitFor()
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Tab')
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('dialog')), true)
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    assert.equal(await page.locator('dialog').count(), 0)
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
    assert.equal(await page.evaluate(() => document.body.style.overflow), '')
  })
  await check('gallery opens and dismisses with keyboard', async () => {
    const trigger = page.getByRole('button', { name: /^عرض الصورة:/ }).first()
    await trigger.focus(); await page.keyboard.press('Enter')
    await page.getByRole('dialog').waitFor()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
  })
  await check('guest scanner is public and starts a fake camera on the first click', async () => {
    await page.goto(`${base}/scan-qr`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.getByRole('heading', { name: 'مسح رمز QR' }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/scan-qr')
    assert.equal(await page.getByRole('link', { name: 'اختيار الطاولة بدون كاميرا' }).getAttribute('href'), '/select-table')
    await page.getByRole('button', { name: 'تشغيل الكاميرا' }).click()
    await page.getByRole('button', { name: 'إيقاف', exact: true }).waitFor({ timeout: 15000 })
    assert.equal(await page.locator('video').count(), 1)
    await page.getByRole('button', { name: 'إيقاف', exact: true }).click()
    await page.getByRole('button', { name: 'تشغيل الكاميرا' }).waitFor()
    await page.screenshot({ path: path.join(output, 'scanner-375.png'), fullPage: true })
  })
  await check('staff routes still require authentication', async () => {
    await page.goto(`${base}/kitchen`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    assert.equal(new URL(page.url()).pathname, '/login')
  })
  await check('reduced motion disables the persistent public animation', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    const duration = await page.locator('.animate-bounce').evaluate(el => getComputedStyle(el).animationDuration)
    assert.ok(parseFloat(duration) < 0.01)
  })
  await check('public layouts remain usable with larger text and light theme', async () => {
    await page.setViewportSize({ width: 375, height: 900 })
    await page.evaluate(() => { document.documentElement.classList.add('light'); document.documentElement.style.fontSize = '32px' })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: path.join(output, 'large-text-light.png'), fullPage: true })
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; document.documentElement.classList.remove('light') })
  })

  // Mount the real client components with fixture data, not production sessions.
  const bundle = await build({
    stdin: { contents: `
      import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
      import {Modal} from './src/components/ui/modal';
      import {Dropdown} from './src/components/ui/dropdown';
      import {Popover} from './src/components/ui/popover';
      import {MenuOrderView} from './src/components/menu/menu-order-view';
      import {KitchenBoard} from './src/components/kitchen/kitchen-board';
      import {OrderStatusTracker} from './src/components/order/order-status-tracker';
      import {TopbarSearch} from './src/components/layout/topbar-search';
      import {AreaChart} from './src/components/ui/chart';
      import {ThermalReceiptPreview} from './src/components/cashier/thermal-receipt-preview';
      const menu={table:{id:'1',number:'1',name:null,capacity:4,branchId:'1',branchName:'فرع تجريبي',token:'0123456789abcdef'},categories:[],products:[{id:'1',name:'قهوة تجريبية',price:'12.50',description:null,imagePath:null,categoryId:'1'}]};
      function DialogFixture(){const[open,setOpen]=useState(false),[nested,setNested]=useState(false);return <><button onClick={()=>setOpen(true)}>فتح النافذة</button>{open&&<Modal aria-label="النافذة الرئيسية" onClose={()=>setOpen(false)} className="fixed inset-0 bg-card p-8"><button onClick={()=>setNested(true)}>نافذة داخلية</button><button onClick={()=>setOpen(false)}>إغلاق الرئيسية</button>{nested&&<Modal aria-label="النافذة الداخلية" onClose={()=>setNested(false)} className="fixed inset-0 bg-card p-8"><button onClick={()=>setNested(false)}>إغلاق الداخلية</button></Modal>}</Modal>}</>}
      function DropdownFixture(){const[v,setV]=useState('a');return <><Dropdown ariaLabel="الفرع" value={v} onChange={setV} options={[{value:'a',label:'الأول'},{value:'b',label:'الثاني'},{value:'c',label:'الثالث'}]}/><output>{v}</output><button>بعد القائمة</button></>}
      function PopoverFixture(){return <Popover ariaLabel="لوحة التفاصيل" trigger={props=><button {...props}>التفاصيل</button>}>{close=><button onClick={close}>إغلاق التفاصيل</button>}</Popover>}
      function KitchenFixture(){const[orders,setOrders]=useState([]);window.mockRefresh=()=>{window.refreshCount=(window.refreshCount||0)+1;setOrders([])};return <KitchenBoard orders={orders}/>}
      const invoice={id:'fixture',number:'TEST-001',createdAt:'2026-11-16T12:00:00Z',branch:'فرع تجريبي',table:'1',creator:'موظف',cashier:'كاشير',status:'served',paymentStatus:'paid',subtotal:'12.50',discount:'0',tax:'0',total:'12.50',paid:'12.50',remaining:'0',cancelledAt:null,cancelReason:null,isArchived:false,items:[{id:'1',productId:'1',name:'قهوة تجريبية',quantity:1,unitPrice:'12.50',lineTotal:'12.50',discountType:null,discountValue:'0',discountAmount:'0',eligibleForInvoiceDiscount:true,variantId:null,variantLabel:null,updatedAt:'2026-11-16T12:00:00Z'}],payments:[{id:'1',method:'cash',amount:'12.50',createdAt:'2026-11-16T12:00:00Z',collector:'كاشير'}]};
      const root=createRoot(document.getElementById('root'));
      window.renderFixture=(name)=>root.render(<React.Fragment key={name}>{name==='modal'?<DialogFixture/>:name==='dropdown'?<DropdownFixture/>:name==='popover'?<PopoverFixture/>:name==='menu'?<MenuOrderView menu={menu}/>:name==='kitchen'?<KitchenFixture/>:name==='tracking'?<OrderStatusTracker id="fixture" orderNumber="fixture" initialStatus="new" branchName="فرع" tableNumber="1"/>:name==='search'?<TopbarSearch/>:name==='receipt'?<ThermalReceiptPreview invoice={invoice} onClose={()=>{}}/>:<AreaChart data={[{label:'الأول',value:12.50},{label:'الثاني',value:20}]}/>}</React.Fragment>);
    `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'next-fixture-adapters', setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|image|link)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), loader: 'jsx', contents: args.path === 'next/navigation'
        ? `const router={refresh:()=>window.mockRefresh?.(),push:(href)=>{window.lastNavigation=href}};export const useRouter=()=>router`
        : args.path === 'next/image' ? `import React from 'react';export default function Image({src,fill,priority,sizes,...props}){return <img src={src} {...props}/>}`
        : `import React from 'react';export default function Link(props){return <a {...props}/>} ` }))
    } }],
  })
  await page.route(`${base}/__ui_fixture`, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ar" dir="rtl"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>` }))
  await page.route('**/api/staff/notifications**', route => route.fulfill({ json: { notifications: [], unread: 0 } }))
  async function fixture(name) {
    await page.goto(`${base}/__ui_fixture`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(name => window.renderFixture(name), name)
    await page.waitForTimeout(100)
  }
  await check('nested dialogs restore focus and preserve the scroll lock', async () => {
    await fixture('modal')
    await page.getByRole('button', { name: 'فتح النافذة', exact: true }).click()
    await page.getByRole('button', { name: 'نافذة داخلية', exact: true }).click()
    await page.keyboard.press('Escape'); await page.waitForTimeout(50)
    assert.equal(await page.getByRole('dialog', { name: 'النافذة الرئيسية' }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'نافذة داخلية' }).evaluate(el => el === document.activeElement), true)
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
    await page.keyboard.press('Escape'); await page.waitForTimeout(50)
    assert.equal(await page.locator('dialog').count(), 0)
    assert.equal(await page.evaluate(() => document.body.style.overflow), '')
  })
  await check('dropdown arrow keys move actual focus and select the active item', async () => {
    await fixture('dropdown')
    await page.getByRole('button', { name: 'الفرع' }).focus(); await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
    assert.equal(await page.locator('output').textContent(), 'b')
    assert.equal(await page.getByRole('button', { name: 'الفرع' }).evaluate(el => el === document.activeElement), true)
  })
  await check('popover moves focus inside and restores focus with Escape', async () => {
    await fixture('popover')
    await page.getByRole('button', { name: 'التفاصيل', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'إغلاق التفاصيل' }).evaluate(el => el === document.activeElement), true)
    await page.keyboard.press('Escape'); await page.waitForTimeout(50)
    assert.equal(await page.getByRole('button', { name: 'التفاصيل', exact: true }).evaluate(el => el === document.activeElement), true)
  })
  await check('guest cart restores after reload, displays fractions and clears after confirmed success', async () => {
    await fixture('menu')
    await page.getByRole('button', { name: 'أضف', exact: true }).click()
    await page.getByRole('button', { name: 'فتح سلة الطلب' }).click()
    assert.match(await page.getByRole('dialog').innerText(), /12\.50/)
    await fixture('menu')
    await page.getByRole('button', { name: 'فتح سلة الطلب' }).click()
    assert.match(await page.getByRole('dialog').innerText(), /قهوة تجريبية/)
    await page.getByRole('button', { name: 'إرسال الطلب', exact: true }).click()
    assert.match(await page.getByRole('alert').innerText(), /اكتب اسمك/)
    let submissions = 0
    await page.route('**/api/public/orders', async route => { submissions++; await new Promise(resolve => setTimeout(resolve, 200)); await route.fulfill({ json: { id: 'fixture', orderNumber: 'fixture' } }) })
    await page.getByLabel('اسمك', { exact: false }).fill('عميل تجريبي')
    await page.getByRole('button', { name: 'إرسال الطلب', exact: true }).click()
    await page.waitForFunction(() => window.lastNavigation?.startsWith('/order/'))
    assert.equal(submissions, 1)
    assert.equal(await page.evaluate(() => localStorage.getItem('skoon-guest-cart:0123456789abcdef')), null)
  })
  await check('kitchen refreshes while idle and stops refreshing offline', async () => {
    await fixture('kitchen')
    await page.waitForFunction(() => window.refreshCount >= 1, { timeout: 12000 })
    await context.setOffline(true)
    await page.getByText('الاتصال منقطع', { exact: false }).waitFor()
    const count = await page.evaluate(() => window.refreshCount)
    await page.waitForTimeout(5200)
    assert.equal(await page.evaluate(() => window.refreshCount), count)
    await context.setOffline(false)
  })
  await check('tracking exposes stale requests and retries successfully', async () => {
    let failing = true
    await page.route('**/api/public/orders/fixture?*', route => failing ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { status: 'preparing' } }))
    await fixture('tracking')
    await page.getByRole('button', { name: 'إعادة الاتصال' }).waitFor()
    failing = false
    await page.getByRole('button', { name: 'إعادة الاتصال' }).click()
    await page.getByRole('heading', { name: 'جاري التحضير' }).waitFor()
  })
  await check('search ignores an older response and preserves the selected result URL', async () => {
    await page.route('**/api/staff/search?*', async route => {
      const q = new URL(route.request().url()).searchParams.get('q')
      if (q === 'old') await new Promise(resolve => setTimeout(resolve, 900))
      await route.fulfill({ json: { products: [{ id: '2', name: q === 'old' ? 'قديم' : 'جديد', price: '12.50' }], orders: [] } }).catch(() => {})
    })
    await fixture('search')
    const field = page.getByRole('combobox')
    await field.fill('old'); await page.waitForTimeout(400); await field.fill('new'); await page.waitForTimeout(1100)
    assert.equal(await page.getByText('قديم', { exact: true }).count(), 0)
    await page.getByRole('button', { name: /جديد/ }).click()
    assert.match(await page.evaluate(() => window.lastNavigation), /\/products\?q=.+&selected=2/)
  })
  await check('chart exact values are available without hover', async () => {
    await fixture('chart')
    await page.getByText('عرض بيانات الرسم في جدول').click()
    assert.match(await page.getByRole('table').innerText(), /12\.50/)
  })
  await check('native receipt dialog preserves 80mm and 58mm print layouts', async () => {
    for (const width of ['80mm', '58mm']) {
      await fixture('receipt')
      await page.getByLabel('عرض الورق').selectOption(width)
      await page.evaluate(() => { window.printed = false; window.print = () => { window.printed = true } })
      await page.getByRole('button', { name: 'طباعة', exact: true }).click()
      await page.waitForFunction(() => window.printed)
      await page.emulateMedia({ media: 'print' })
      const receipt = page.locator('[data-thermal-receipt]')
      assert.match(await receipt.innerText(), /12\.50/)
      const bounds = await receipt.boundingBox()
      assert.ok(bounds && bounds.width > 150 && bounds.width < 310)
      assert.equal(await receipt.evaluate(el => getComputedStyle(el).visibility), 'visible')
      await page.pdf({ path: path.join(output, `receipt-${width}.pdf`), width, height: '220mm', printBackground: true })
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
      await page.emulateMedia({ media: 'screen' })
    }
  })
  await browser.close()
  const result = { checks, failures, pageErrors: errors }
  fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify(result, null, 2))
  if (failures.length || errors.length) { console.error(JSON.stringify(result, null, 2)); process.exitCode = 1 }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
