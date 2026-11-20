import { documentApp } from '../api/hono/documents.mjs'

export function previewApp(cedar, policies) {
  const engine = {
    async isAuthorized(request) {
      const answer = cedar.isAuthorized({
        ...request,
        entities: [],
        policies: { staticPolicies: policies },
      })
      if (answer.type !== 'success' || answer.response.diagnostics.errors.length) {
        throw new Error('Cedar evaluation failed')
      }
      return {
        type: answer.response.decision,
        authorizerInfo: {
          principalUid: request.principal,
          determiningPolicies: answer.response.diagnostics.reason,
        },
      }
    },
  }
  const app = documentApp(engine, (c) =>
    c.req.header('X-Preview-User') === 'reader' ? { type: 'Demo::User', id: 'local-reader' } : null,
  )
  return app
}
