import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import cedar from '@cedar-policy/cedar-wasm/nodejs'
import {
  entities,
  userUid,
  reportUid,
  actionUid,
  fields,
  receiptBytes,
} from '../../expenses/model.mjs'
import { profiles, sampleReports } from '../../expenses/fixtures.mjs'
const policies = {
  staticPolicies: Object.fromEntries(
    ['owner', 'author', 'manager', 'finance', 'settle'].map((k) => [
      k,
      readFileSync(new URL('../../expenses/policies/' + k + '.cedar', import.meta.url), 'utf8'),
    ]),
  ),
}
const reports = sampleReports({ alice: 'alice', ben: 'ben', chika: 'chika' })
for (const [sub, state, op, expected, override = {}] of [
  ['alice', 'draft', 'edit', 'allow'],
  ['alice', 'submitted', 'edit', 'deny'],
  ['alice', 'submitted', 'approve', 'deny', { expenseRole: 'manager' }],
  ['ben', 'submitted', 'approve', 'allow'],
  ['ben', 'submitted', 'return', 'allow'],
  ['ben', 'submitted', 'approve', 'deny', { team: 'finance' }],
  ['ben', 'draft', 'view', 'deny'],
  ['chika', 'submitted', 'view', 'deny'],
  ['chika', 'approved', 'view', 'allow'],
  ['chika', 'approved', 'pay', 'allow'],
  ['ben', 'approved', 'pay', 'deny', { expenseRole: 'finance' }],
  ['alice', 'approved', 'pay', 'deny', { expenseRole: 'finance' }],
  ['alice', 'draft', 'view', 'deny', { role: 'none' }],
  ['chika', 'paid', 'pay', 'deny'],
]) {
  test([sub, state, op, expected, JSON.stringify(override)].join(' '), () => {
    const member = { ...profiles[sub], sub, ...override },
      r = reports.find((r) => r.state === state)
    const result = cedar.isAuthorized({
      principal: userUid(sub),
      action: actionUid(op),
      resource: reportUid(r.id),
      context: {},
      entities: entities(member, r),
      policies,
    })
    assert.deepEqual(result.response.diagnostics.errors, [])
    assert.equal(result.response.decision, expected)
  })
}
test('server recalculates totals and checks expense dates, amounts and receipt signatures', () => {
  const r = reports[0]
  assert.equal(fields({ ...r, total: 1 }).total, r.total)
  for (const change of [
    { date: '2025-02-30' },
    { amount: -100 },
    { amount: 0.1 },
    { category: 'fake' },
  ])
    assert.throws(() => fields({ ...r, lines: [{ ...r.lines[0], ...change }] }))
  assert.throws(() => receiptBytes(btoa('not-a-pdf'), 'application/pdf'))
})
