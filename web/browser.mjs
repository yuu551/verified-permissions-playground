import init, * as cedar from '@cedar-policy/cedar-wasm/web'
import { previewApp } from './preview.mjs'

const ready = init()
export async function evaluate(route, headers, policies) {
  await ready
  return previewApp(cedar, policies).request('/' + route, { headers })
}
