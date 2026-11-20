import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { FetchError, JwksValidationError } from 'aws-jwt-verify/error'
import { createAuthorizer, bearerTokenPrincipal } from 'hono-verified-permissions'
import { user, document, action, entities } from './model.mjs'
import { conflict, publish, snapshot, membership, createDraft } from './store.mjs'

export function workspace({ db, config, verifier, engine, page, log = console.log }) {
  const app = new Hono()
  app.get('/', (c) => c.html(page))
  app.use('/api/*', async (c, next) => {
    const requestId = randomUUID()
    c.set('requestId', requestId)
    c.header('X-Request-Id', requestId)
    c.header('Cache-Control', 'no-store')
    const start = Date.now()
    await next()
    log({
      event: 'document-request',
      requestId,
      actor: c.var.sub,
      document: c.var.documentId,
      operation: c.req.method,
      status: c.res.status,
      durationMs: Date.now() - start,
      policies: c.var.authorizerInfo?.determiningPolicies,
    })
  })
  app.use('/api/*', async (c, next) => {
    const token = bearerTokenPrincipal(c)
    if (!token) return c.json({ error: 'Sign in required' }, 401)
    try {
      const identity = await verifier.verify(token.id)
      c.set('sub', identity.sub)
    } catch (error) {
      if (error instanceof FetchError || error instanceof JwksValidationError) throw error
      return c.json({ error: 'Sign in required' }, 401)
    }
    await next()
  })
  app.onError((error, c) => {
    if (conflict(error))
      return c.json({ error: 'Access or document changed. Read the document again.' }, 409)
    return c.json({ error: 'Service unavailable' }, 503)
  })
  const route = '/api/documents/:id'
  const authorize = createAuthorizer({ engine, principal: (c) => user(c.var.sub) })
  app.use(route, async (c, next) => {
    const id = c.req.param('id')
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) return c.json({ error: 'Invalid reference' }, 400)
    c.set('documentId', id)
    const { member, doc } = await snapshot(db, config.State, c.var.sub, id)
    if (!member || !doc) return c.json({ error: 'Forbidden' }, 403)
    c.set('member', member)
    c.set('doc', doc)
    await next()
  })
  const check = (operation) =>
    authorize({
      action: action(operation),
      resource: (c) => document(c.var.doc.id),
      entities: (c) => entities(c.var.sub, c.var.member, c.var.doc),
    })
  app.post(
    '/api/documents',
    bodyLimit({ maxSize: 32_768 }),
    async (c, next) => {
      const member = await membership(db, config, c.var.sub)
      if (!member) return c.json({ error: 'Forbidden' }, 403)
      const input = await c.req.json().catch(() => null)
      if (
        typeof input?.title !== 'string' ||
        !input.title.trim() ||
        input.title.length > 160 ||
        typeof input.body !== 'string' ||
        !input.body.trim() ||
        input.body.length > 6000
      )
        return c.json({ error: 'Enter a title (1–160) and body (1–6000).' }, 400)
      const id = 'draft-' + randomUUID()
      c.set('documentId', id)
      c.set('member', member)
      c.set('doc', {
        id,
        pk: 'DOC#' + id,
        owner: c.var.sub,
        team: member.team,
        published: false,
        revision: 1,
        title: input.title.trim(),
        body: input.body.trim(),
      })
      await next()
    },
    check('create'),
    async (c) => {
      const doc = c.var.doc
      await createDraft(db, config, c.var.member, doc, c.var.requestId)
      return c.json(
        { id: doc.id, title: doc.title, body: doc.body, revision: 1, published: false },
        201,
      )
    },
  )
  app.get(route, check('read'), (c) => {
    const { id, title, body, published, revision } = c.var.doc
    return c.json({ id, title, body, published, revision })
  })
  app.post(route, check('publish'), async (c) => {
    const revision = c.req.header('If-Match')
    if (revision === undefined)
      return c.json({ error: 'Supply the document revision in If-Match.' }, 428)
    if (revision !== '"' + c.var.doc.revision + '"')
      return c.json({ error: 'Document changed.' }, 412)
    await publish(db, config, c.var.member, c.var.doc, c.var.requestId)
    return c.json({ published: true, revision: c.var.doc.revision + 1 })
  })
  return app
}
