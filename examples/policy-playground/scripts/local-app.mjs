import cedar from '@cedar-policy/cedar-wasm/nodejs'
import { policies, renderPage } from './page.mjs'
import { previewApp } from '../web/preview.mjs'

export function localApp() {
  const app = previewApp(cedar, policies)
  app.get('/', (c) => c.html(renderPage({ mode: 'local' })))
  return app
}
