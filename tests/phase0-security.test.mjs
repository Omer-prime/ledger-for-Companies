import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { hashPassword, verifyPassword } from '../src/lib/password.ts'
import { POST as seed } from '../src/app/api/dev/seed/route.ts'

test('password hashes are salted and legacy plaintext never verifies', async () => {
  const password = 'disposable test password'
  const first = await hashPassword(password)
  const second = await hashPassword(password)
  assert.notEqual(first, second)
  assert.doesNotMatch(first, /disposable/)
  assert.equal(await verifyPassword(password, first), true)
  assert.equal(await verifyPassword('wrong', first), false)
  assert.equal(await verifyPassword(password, password), false)
})

test('disabled seed returns an empty 404', async () => {
  const response = seed()
  assert.equal(response.status, 404)
  assert.equal(await response.text(), '')
})

test('resource methods check permissions before handler work', async () => {
  const root = new URL('../src/app/api/', import.meta.url)
  let handlers = 0
  for (const entry of await readdir(root, { recursive: true })) {
    const path = entry.replaceAll('\\', '/')
    if (!path.endsWith('/route.ts') || /^(auth|dev)\//.test(path)) continue
    const source = await readFile(new URL(path, root), 'utf8')
    for (const method of source.matchAll(/export (?:async function |const \w+ = safeApi\(async function )(GET|POST|PUT|DELETE|PATCH)\([\s\S]*?\) \{\r?\n([^\r\n]+)/g)) {
      handlers++
      assert.match(method[2], /requirePermission\(|return immutable\(|return postInventory\(/, path + ' ' + method[1])
    }
  }
  assert.equal(handlers, 45)
})

test('mocked sessions reject forged tokens and enforce role and origin checks', async () => {
  const mocks = {
    'next/headers': 'export const cookies = async () => ({ get: name => ({ value: name === "ledger_auth" ? "legacy" : globalThis.testToken }) })',
    '@/lib/db': 'export const dbConnect = async () => ({ connection: { collection: () => ({ findOne: async () => globalThis.testSession }) } })',
    '@/models/User': 'export const User = { findById: () => ({ select: () => ({ lean: async () => globalThis.testUser }) }) }',
    zod: 'const chain = new Proxy(() => chain, { get: () => chain }); export const z = chain;',
  }
  const hook = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === '@/lib/auth') return next(new URL('../src/lib/auth.ts', import.meta.url).href, context)
      if (specifier === '@/lib/roles') return next(new URL('../src/lib/roles.ts', import.meta.url).href, context)
      if (Object.hasOwn(mocks, specifier)) return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(mocks[specifier]) }
      return next(specifier, context)
    },
  })
  try {
    const { getSession, digest } = await import('../src/lib/auth.ts')
    const { requirePermission } = await import('../src/lib/api-security.ts')
    assert.equal(await getSession(), null)
    globalThis.testToken = Buffer.from(JSON.stringify({ email: 'fixture@example.test', role: 'superadmin' })).toString('base64')
    assert.equal(await getSession(), null)
    globalThis.testToken = '1'.repeat(64)
    assert.equal(await getSession(), null)
    assert.equal((await requirePermission('read')).status, 401)

    globalThis.testUser = { email: 'fixture@example.test', role: 'accountant', passwordHash: 'mock hash' }
    globalThis.testSession = { userId: 'fixture', credentialVersion: digest(globalThis.testUser.passwordHash) }
    assert.equal(await requirePermission('read'), null)
    assert.equal((await requirePermission('members')).status, 403)
    assert.equal((await requirePermission('post', new Request('https://example.test'))).status, 403)

    globalThis.testUser.passwordHash = 'reset hash'
    assert.equal(await getSession(), null)
  } finally {
    delete globalThis.testToken
    delete globalThis.testUser
    delete globalThis.testSession
    hook.deregister()
  }
})
