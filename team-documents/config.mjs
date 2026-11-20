import { readFileSync } from 'node:fs'
export const trialFolder = '.team-trial'
export function config() {
  const stacks = JSON.parse(
    readFileSync(process.env.TEAM_OUTPUTS ?? trialFolder + '/outputs.json', 'utf8'),
  )
  const [name, outputs] = Object.entries(stacks)[0]
  if (!['VerifiedPermissionsTeamDocuments', 'VerifiedPermissionsTeamDocumentsTrial'].includes(name))
    throw new Error('Expected a team documents stack.')
  return Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k.replace(/Output$/, ''), v]))
}
