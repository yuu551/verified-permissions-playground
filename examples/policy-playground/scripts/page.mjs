import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8')
export const policies = {
  published: read('../policies/published.cedar'),
  embargo: read('../policies/embargo.cedar'),
}

export function renderPage(config) {
  return read('../web/index.html')
    .replace('/* APP_STYLE */', () => read('../web/style.css'))
    .replace('/* APP_CONFIG */', () =>
      JSON.stringify({ ...config, policies }).replaceAll('<', '\\u003c'),
    )
    .replace('/* APP_CODE */', () => read('../web/app.js'))
}
