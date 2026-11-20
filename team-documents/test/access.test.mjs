import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import cedar from '@cedar-policy/cedar-wasm/nodejs'
import { action, document, user, entities } from '../model.mjs'
import { workspace } from '../app.mjs'
import { sampleDocuments } from '../fixtures.mjs'
const read = (name) => readFileSync(new URL('../policies/' + name, import.meta.url), 'utf8')
const staticPolicies = Object.fromEntries(
  ['boundary', 'read', 'publish'].map((n) => [n, read(n + '.cedar')]),
)
const book = sampleDocuments('alice', 'chika')[1]
for (const [role, team, sub, published, op, expected] of [
  ['editor', 'design', 'alice', false, 'create', 'allow'],
  ['reader', 'design', 'alice', false, 'create', 'deny'],
  ['editor', 'design', 'alice', false, 'read', 'allow'],
  ['editor', 'design', 'alice', false, 'publish', 'allow'],
  ['reader', 'design', 'alice', false, 'publish', 'deny'],
  ['reader', 'design', 'ben', false, 'read', 'deny'],
  ['reader', 'design', 'ben', true, 'read', 'allow'],
  ['editor', 'finance', 'alice', false, 'publish', 'deny'],
  ['reader', 'finance', 'ben', true, 'read', 'deny'],
  ['none', 'design', 'alice', true, 'read', 'deny'],
  ['editor', 'design', 'alice', true, 'publish', 'deny'],
  ['unknown', 'design', 'alice', true, 'read', 'deny'],
])
  test([role, team, sub, published, op, expected].join(' / '), () => {
    const result = cedar.isAuthorized({
      principal: user(sub),
      action: action(op),
      resource: document(book.id),
      context: {},
      entities: entities(sub, { role, team }, { ...book, published }),
      policies: { staticPolicies },
    })
    assert.equal(result.type, 'success')
    assert.deepEqual(result.response.diagnostics.errors, [])
    assert.equal(result.response.decision, expected)
  })
test('dependency failure is logged by request ID and withholds the document', async () => {
  const records = []
  const app = workspace({
    db: {
      send: async () => {
        throw Error('unavailable')
      },
    },
    config: { State: 'test' },
    verifier: { verify: async () => ({ sub: 'alice' }) },
    log: (v) => records.push(v),
  })
  const res = await app.request('/api/documents/launch-notes', {
    headers: { Authorization: 'Bearer abc' },
  })
  assert.equal(res.status, 503)
  assert.deepEqual(await res.json(), { error: 'Service unavailable' })
  assert.equal(records[0].requestId, res.headers.get('x-request-id'))
  assert.equal(records[0].status, 503)
})
