import { Hono } from 'hono'
import { createAuthorizer } from 'hono-verified-permissions'

export function documentApp(engine, principal) {
  const app = new Hono()
  const authorize = createAuthorizer({ engine, principal })
  app.get(
    '/hono/documents/:id',
    authorize({
      action: { type: 'Demo::Action', id: 'read' },
      resource: (c) => ({ type: 'Demo::Document', id: c.req.param('id') }),
    }),
    (c) => c.json({ document: c.req.param('id'), reader: c.var.authorizerInfo.principalUid.id }),
  )
  return app
}
