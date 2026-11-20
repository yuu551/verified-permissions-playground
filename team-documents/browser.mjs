import init, * as cedar from '@cedar-policy/cedar-wasm/web'
import { Hono } from 'hono'
import { createAuthorizer } from 'hono-verified-permissions'
import { action, document, user, entities } from './model.mjs'
import { people, sampleDocuments } from './fixtures.mjs'
import policies from './policies/read.cedar'
import boundary from './policies/boundary.cedar'
import publish from './policies/publish.cedar'

const ready = init()
const members = structuredClone(people)
const docs = new Map(sampleDocuments('alice', 'chika').map((d) => [d.id, { ...d, revision: 1 }]))
export const audit = []
export function assign(person, team, role, reason) {
  if (
    !Object.hasOwn(members, person) ||
    !['design', 'finance'].includes(team) ||
    !['reader', 'editor', 'none'].includes(role) ||
    !reason.trim()
  )
    throw Error('Select an account, team and role and enter a reason.')
  members[person] = { team, role }
  audit.unshift({ person, team, role, reason })
}
const app = new Hono()
const authorize = createAuthorizer({
  principal: (c) => user(c.var.person),
  engine: {
    async isAuthorized(req, bag) {
      await ready
      const result = cedar.isAuthorized({
        ...req,
        entities: bag,
        policies: { staticPolicies: { read: policies, boundary, publish } },
      })
      if (result.type !== 'success' || result.response.diagnostics.errors.length)
        throw Error('Policy evaluation failed')
      return {
        type: result.response.decision,
        authorizerInfo: {
          principalUid: req.principal,
          determiningPolicies: result.response.diagnostics.reason,
        },
      }
    },
  },
})
const path = '/api/documents/:id'
app.use(path, async (c, next) => {
  c.header('X-Request-Id', crypto.randomUUID())
  const person = c.req.header('X-Demo-Identity'),
    doc = docs.get(c.req.param('id'))
  if (!Object.hasOwn(members, person)) return c.json({ error: 'Sign in required' }, 401)
  if (!doc) return c.json({ error: 'Forbidden' }, 403)
  c.set('person', person)
  c.set('doc', doc)
  await next()
})
function check(name) {
  return authorize({
    action: action(name),
    resource: (c) => document(c.var.doc.id),
    entities: (c) => entities(c.var.person, members[c.var.person], c.var.doc),
  })
}
app.post(
  '/api/documents',
  async (c, next) => {
    c.header('X-Request-Id', crypto.randomUUID())
    const person = c.req.header('X-Demo-Identity')
    if (!Object.hasOwn(members, person)) return c.json({ error: 'Sign in required' }, 401)
    const { title, body } = await c.req.json()
    if (!title?.trim() || title.length > 160 || !body?.trim() || body.length > 6000)
      return c.json({ error: 'Invalid draft' }, 400)
    c.set('person', person)
    c.set('doc', {
      id: 'draft-' + crypto.randomUUID(),
      team: members[person].team,
      owner: person,
      published: false,
      revision: 1,
      title,
      body,
    })
    await next()
  },
  check('create'),
  (c) => {
    const doc = c.var.doc
    docs.set(doc.id, doc)
    return c.json(doc, 201)
  },
)
app.get(path, check('read'), (c) => c.json(c.var.doc))
app.post(path, check('publish'), (c) => {
  const doc = c.var.doc
  if (c.req.header('If-Match') !== '"' + doc.revision + '"')
    return c.json({ error: 'Revision changed' }, 412)
  doc.published = true
  doc.revision++
  return c.json({ published: true, revision: doc.revision })
})
export function request(path, person, init) {
  return app.request(path, { ...init, headers: { ...init.headers, 'X-Demo-Identity': person } })
}
