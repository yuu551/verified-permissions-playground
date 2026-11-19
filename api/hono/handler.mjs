import { handle } from 'hono/aws-lambda'
import { AVPAuthorizationEngine } from '@verifiedpermissions/authorization-clients-js'
import { bearerTokenPrincipal } from 'hono-verified-permissions'
import { documentApp } from './documents.mjs'

function cloudApp(storeId) {
  return documentApp(
    new AVPAuthorizationEngine({
      policyStoreId: storeId,
      callType: 'identityToken',
    }),
    bearerTokenPrincipal,
  )
}

export const handler = handle(cloudApp(process.env.POLICY_STORE_ID))
