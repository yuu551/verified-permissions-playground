import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createAuthorizer } from 'hono-verified-permissions'
import {
  actionUid,
  userUid,
  reportUid,
  entities,
  fields,
  scopes,
  summary,
  roleOf,
  uuidPattern,
  appendEvent,
  receiptBytes,
} from './model.mjs'
const invalid = (c, code) => c.json({ error: code }, 400)
export function expenseService({ store, engine }) {
  const api = new Hono()
  api.use('*', async (c, next) => {
    const member = await store.member(c.var.sub)
    if (!member || roleOf(member) === 'none') return c.json({ error: 'forbidden' }, 403)
    c.set('member', { ...member, sub: c.var.sub, name: c.var.displayName || c.var.sub })
    await next()
  })
  api.get('/me', (c) => {
    const m = c.var.member
    return c.json({ name: m.name, team: m.team, role: roleOf(m), sub: m.sub })
  })
  api.get('/reports', async (c) => {
    const m = c.var.member,
      box = c.req.query('box') ?? 'mine',
      after = c.req.query('after')
    if (after && !uuidPattern.test(after)) return invalid(c, 'cursor')
    const key =
      box === 'mine'
        ? 'MINE#' + m.sub
        : box === 'review' && roleOf(m) === 'manager'
          ? 'REVIEW#' + m.team
          : box === 'finance' && roleOf(m) === 'finance'
            ? 'FINANCE'
            : null
    if (!key) return c.json({ error: 'forbidden' }, 403)
    const page = await store.list(key, after)
    const selected = await Promise.all(
      page.reports
        .filter((r) => scopes(r).includes(key) && (box !== 'review' || r.owner !== m.sub))
        .map(async (r) => {
          const result = await engine.isAuthorized(
            {
              principal: userUid(m.sub),
              action: actionUid('view'),
              resource: reportUid(r.id),
              context: {},
            },
            entities(m, r),
          )
          if (result.type === 'deny') return null
          if (result.type !== 'allow') throw Error('authorization unavailable')
          return summary(r)
        }),
    )
    return c.json({ reports: selected.filter(Boolean), after: page.after })
  })
  const auth = createAuthorizer({ engine, principal: (c) => userUid(c.var.sub) })
  const check = (name) =>
    auth({
      action: actionUid(name),
      resource: (c) => reportUid(c.var.report.id),
      entities: (c) => entities(c.var.member, c.var.report),
    })
  api.post(
    '/reports',
    bodyLimit({ maxSize: 32768 }),
    async (c, next) => {
      const input = await c.req.json().catch(() => null)
      if (!uuidPattern.test(input?.id ?? '')) return invalid(c, 'reference')
      let values
      try {
        values = fields(input)
      } catch (e) {
        return invalid(c, e.message)
      }
      const m = c.var.member
      c.set('report', {
        ...values,
        id: input.id,
        owner: m.sub,
        ownerName: m.name,
        team: m.team,
        state: 'draft',
        revision: 0,
        history: [],
      })
      await next()
    },
    check('create'),
    async (c) => {
      const r = appendEvent(c.var.report, c.var.member, 'create', '')
      await store.save(c.var.member, null, r, c.var.requestId)
      return c.json(r, 201)
    },
  )
  const load = async (c, next) => {
    const id = c.req.param('id')
    if (!uuidPattern.test(id)) return invalid(c, 'reference')
    const r = await store.report(id)
    if (!r) return c.json({ error: 'forbidden' }, 403)
    c.set('report', r)
    c.set('documentId', id)
    await next()
  }
  api.get('/reports/:id', load, check('view'), (c) => c.json(c.var.report))
  const current = (c, next) =>
    c.req.header('If-Match') === '"' + c.var.report.revision + '"'
      ? next()
      : c.json({ error: 'stale' }, 409)
  for (const op of ['edit', 'submit', 'approve', 'return', 'pay']) {
    api.post(
      '/reports/:id/' + op,
      bodyLimit({ maxSize: 32768 }),
      load,
      check(op),
      current,
      async (c) => {
        const input = await c.req.json().catch(() => null)
        if (!input || typeof input !== 'object') return invalid(c, 'input')
        const old = c.var.report,
          m = c.var.member
        let r = { ...old },
          comment = ''
        if (op === 'edit') {
          try {
            Object.assign(r, fields(input))
          } catch (e) {
            return invalid(c, e.message)
          }
        } else {
          if (op === 'return' || op === 'pay') {
            if (
              typeof input.comment !== 'string' ||
              !input.comment.trim() ||
              input.comment.length > 400
            )
              return invalid(c, 'comment')
            comment = input.comment.trim()
          }
          r.state = { submit: 'submitted', approve: 'approved', return: 'returned', pay: 'paid' }[
            op
          ]
          if (op === 'approve') r.approver = m.sub
        }
        r = appendEvent(r, m, op, comment)
        await store.save(m, old, r, c.var.requestId)
        return c.json(r)
      },
    )
  }
  api.post(
    '/reports/:id/receipt',
    bodyLimit({ maxSize: 2_120_000 }),
    load,
    check('edit'),
    current,
    async (c) => {
      const input = await c.req.json().catch(() => null)
      if (typeof input?.name !== 'string' || !input.name.trim() || input.name.length > 120)
        return invalid(c, 'attachment')
      let bytes
      try {
        bytes = receiptBytes(input.data, input.type)
      } catch {
        return invalid(c, 'attachment')
      }
      const old = c.var.report
      const r = appendEvent(
        {
          ...old,
          receipt: {
            name: input.name.trim(),
            type: input.type,
            size: bytes.length,
            revision: old.revision + 1,
          },
        },
        c.var.member,
        'attach',
        '',
      )
      await store.save(c.var.member, old, r, c.var.requestId, bytes)
      return c.json(r)
    },
  )
  api.get('/reports/:id/receipt', load, check('view'), async (c) => {
    const r = c.var.report
    if (!r.receipt) return c.json({ error: 'attachment' }, 404)
    const bytes = await store.receipt(r.id, r.receipt)
    if (!bytes) return c.json({ error: 'stale' }, 409)
    return new Response(bytes, {
      headers: {
        'Content-Type': r.receipt.type,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'attachment',
        'Cache-Control': 'no-store',
      },
    })
  })
  return api
}
