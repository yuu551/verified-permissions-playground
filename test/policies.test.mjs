import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localApp } from '../scripts/local-app.mjs'
const app = localApp()
for (const [id, status] of [
  ['guide', 200],
  ['release', 403],
  ['notes', 403],
]) {
  test(id, async () => {
    const res = await app.request('/hono/documents/' + id, {
      headers: { 'X-Preview-User': 'reader' },
    })
    assert.equal(res.status, status)
    if (status === 200) assert.deepEqual(await res.json(), { document: id, reader: 'local-reader' })
  })
}
test('a request without a preview identity is unauthenticated', async () => {
  assert.equal((await app.request('/hono/documents/guide')).status, 401)
})
