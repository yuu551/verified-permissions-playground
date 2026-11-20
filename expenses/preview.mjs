import init, * as cedar from '@cedar-policy/cedar-wasm/web'
import { Hono } from 'hono'
import { expenseService } from './service.mjs'
import { profiles, sampleReports } from './fixtures.mjs'
import { scopes } from './model.mjs'
import owner from './policies/owner.cedar'
import author from './policies/author.cedar'
import manager from './policies/manager.cedar'
import finance from './policies/finance.cedar'
import settle from './policies/settle.cedar'
const ready = init()
const database = new Promise((resolve, reject) => {
  const open = indexedDB.open('folio-expense-demo', 1)
  open.onupgradeneeded = () => {
    const store = open.result.createObjectStore('reports', { keyPath: 'id' })
    open.result.createObjectStore('files')
    for (const report of sampleReports({ alice: 'alice', ben: 'ben', chika: 'chika' }))
      store.put(report)
  }
  open.onsuccess = () => resolve(open.result)
  open.onerror = () => reject(open.error)
})
const read = async (table, method, ...args) => {
  const db = await database
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(table)
      .objectStore(table)
      [method](...args)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
const store = {
  member: async (sub) => profiles[sub],
  report: (id) => read('reports', 'get', id),
  async list(key, after) {
    const rows = (await read('reports', 'getAll')).filter(
      (r) => scopes(r).includes(key) && (!after || r.id > after),
    )
    return { reports: rows.slice(0, 16), after: rows.length > 16 ? rows[15].id : null }
  },
  async save(m, old, r, requestId, bytes) {
    const db = await database
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['reports', 'files'], 'readwrite'),
        rows = tx.objectStore('reports'),
        req = rows.get(r.id)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(Error('stale'))
      req.onsuccess = () => {
        if (req.result?.revision !== old?.revision) {
          tx.abort()
          return
        }
        rows.put(r)
        if (bytes) tx.objectStore('files').put({ revision: r.receipt.revision, bytes }, r.id)
      }
    })
  },
  async receipt(id, meta) {
    const f = await read('files', 'get', id)
    return f?.revision === meta.revision ? f.bytes : null
  },
}
const app = new Hono()
app.use('*', async (c, next) => {
  const sub = c.req.header('X-Demo-User')
  if (!Object.hasOwn(profiles, sub)) return c.json({ error: 'Sign in required' }, 401)
  c.set('sub', sub)
  c.set('displayName', profiles[sub].name)
  c.set('requestId', crypto.randomUUID())
  await next()
})
app.onError((e, c) =>
  c.json(
    { error: e.message === 'stale' ? 'stale' : 'unavailable' },
    e.message === 'stale' ? 409 : 503,
  ),
)
app.route(
  '/api/spend',
  expenseService({
    store,
    engine: {
      async isAuthorized(req, entities) {
        await ready
        const result = cedar.isAuthorized({
          ...req,
          entities,
          policies: { staticPolicies: { owner, author, manager, finance, settle } },
        })
        if (result.type !== 'success' || result.response.diagnostics.errors.length)
          throw Error('authorization unavailable')
        return {
          type: result.response.decision,
          authorizerInfo: {
            principalUid: req.principal,
            determiningPolicies: result.response.diagnostics.reason,
          },
        }
      },
    },
  }),
)
export function request(path, sub, init) {
  return app.request(path, { ...init, headers: { ...init.headers, 'X-Demo-User': sub } })
}
