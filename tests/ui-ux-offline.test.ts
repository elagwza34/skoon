import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isPublicPath } from '../src/middleware'
import { GUEST_DRAFT_TTL, restoreGuestCart } from '../src/lib/guest-cart-draft'

test('guest entry is public without exposing similarly named or staff routes', () => {
  for (const path of ['/scan-qr', '/menu/0123456789abcdef', '/select-table', '/order-type']) assert.equal(isPublicPath(path), true, path)
  for (const path of ['/scan-qr-admin', '/orders', '/orderly', '/menu-admin', '/api/staff/orders', '/cashier', '/kitchen']) assert.equal(isPublicPath(path), false, path)
})

const products = [{ id: 'coffee', price: '12.50' }, { id: 'tea', price: '10.00' }]
const savedAt = 1_000_000_000
const draft = (overrides = {}) => JSON.stringify({ version: 1, token: 'table-a', savedAt, cart: [{ productId: 'coffee', qty: 2 }], prices: { coffee: '12.50' }, ...overrides })

test('guest draft restores current products and retains fractional prices outside storage authority', () => {
  assert.deepEqual(restoreGuestCart(draft(), 'table-a', products, savedAt + 100), { cart: [{ productId: 'coffee', qty: 2 }], changed: false })
  assert.equal(restoreGuestCart(draft({ prices: { coffee: '1.00' } }), 'table-a', products, savedAt + 100).changed, true)
})

test('guest draft cannot cross tables, outlive expiry, or accept a future timestamp', () => {
  for (const [token, now] of [['table-b', savedAt], ['table-a', savedAt + GUEST_DRAFT_TTL + 1], ['table-a', savedAt - 1]] as const) {
    assert.deepEqual(restoreGuestCart(draft(), token, products, now), { cart: [], changed: true })
  }
})

test('guest draft removes unavailable, duplicate, invalid lines and caps quantities', () => {
  const cart = [{ productId: 'missing', qty: 1 }, { productId: 'coffee', qty: 99 }, { productId: 'coffee', qty: 1 }, { productId: 'tea', qty: -1 }, null]
  assert.deepEqual(restoreGuestCart(draft({ cart }), 'table-a', products, savedAt), { cart: [{ productId: 'coffee', qty: 20 }], changed: true })
  assert.deepEqual(restoreGuestCart('malformed', 'table-a', products, savedAt), { cart: [], changed: true })
})

test('semantic filled text color pairs meet 4.5:1 in both themes', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')
  function rgb(hsl: string) {
    const [h, s, l] = hsl.split(/\s+/).map(Number)
    const a = s / 100 * Math.min(l / 100, 1 - l / 100)
    return [0, 8, 4].map(n => { const k = (n + h / 30) % 12; return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)) })
  }
  const luminance = (color: number[]) => color.reduce((sum, v, i) => sum + (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i], 0)
  for (const selector of [':root', '.light']) {
    const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0]
    const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([\d.]+ [\d.]+% [\d.]+%)/g)].map(match => [match[1], match[2].replaceAll('%', '')]))
    for (const role of ['primary', 'success', 'destructive', 'warning']) {
      const values = [tokens[role], tokens[`${role}-foreground`]].map(color => luminance(rgb(color))).sort((a, b) => a - b)
      assert.ok((values[1] + 0.05) / (values[0] + 0.05) >= 4.5, `${selector} ${role}`)
    }
  }
})
