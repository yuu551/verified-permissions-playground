import { serve } from '@hono/node-server'
import { localApp } from './local-app.mjs'
serve(
  { fetch: localApp().fetch, hostname: '127.0.0.1', port: Number(process.env.PORT || 4173) },
  ({ port }) => console.log('Policy playground: http://127.0.0.1:' + port),
)
