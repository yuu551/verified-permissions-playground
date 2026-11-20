import { AVPAuthorizationEngine } from '@verifiedpermissions/authorization-clients-js'
import { bearerTokenPrincipal } from 'hono-verified-permissions'
import { documentApp } from './documents.mjs'

export function cloudApp(storeId) {
  return documentApp(
    new AVPAuthorizationEngine({
      policyStoreId: storeId,
      callType: 'identityToken',
    }),
    bearerTokenPrincipal,
  )
}
