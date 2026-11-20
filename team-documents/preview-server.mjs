import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
const app = new Hono()
app.use('*', serveStatic({ root: 'build/pages' }))
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 4173 }, () =>
  console.log('http://127.0.0.1:4173/'),
)
