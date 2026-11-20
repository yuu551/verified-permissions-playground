import { readFileSync } from 'node:fs'

export function readDeployment(file) {
  const stacks = JSON.parse(readFileSync(file, 'utf8'))
  if (stacks.VerifiedPermissionsWebFunction)
    return { ...stacks.VerifiedPermissionsWebFunction, backends: ['hono'] }
  if (stacks.VerifiedPermissionsPlayground)
    return { ...stacks.VerifiedPermissionsPlayground, backends: ['hono', 'fastapi'] }
  throw new Error('No playground stack in ' + file)
}
