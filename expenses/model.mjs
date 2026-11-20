export const categories = ['travel', 'meals', 'lodging', 'supplies', 'software', 'other']
export const states = ['draft', 'submitted', 'returned', 'approved', 'paid']
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const actionUid = (id) => ({ type: 'Spend::Action', id })
export const userUid = (id) => ({ type: 'Spend::User', id })
export const reportUid = (id) => ({ type: 'Spend::Report', id })
export function roleOf(member) {
  if (!member || member.role === 'none') return 'none'
  return member.expenseRole ?? 'employee'
}
export function entities(member, r) {
  return [
    { uid: userUid(member.sub), attrs: { role: roleOf(member), team: member.team }, parents: [] },
    {
      uid: reportUid(r.id),
      attrs: {
        state: r.state,
        team: r.team,
        owner: { __entity: userUid(r.owner) },
        approver: { __entity: userUid(r.approver ?? r.owner) },
      },
      parents: [],
    },
  ]
}
export function fields(input) {
  if (typeof input?.title !== 'string' || !input.title.trim() || input.title.length > 100)
    throw Error('title')
  if (typeof input.note !== 'string' || input.note.length > 1200) throw Error('note')
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 20)
    throw Error('items')
  const lines = input.lines.map((line) => {
    if (
      !line ||
      typeof line.merchant !== 'string' ||
      !line.merchant.trim() ||
      line.merchant.length > 100
    )
      throw Error('merchant')
    if (!categories.includes(line.category)) throw Error('category')
    const iso = line.date
    if (
      typeof iso !== 'string' ||
      !/^\d{4}-\d\d-\d\d$/.test(iso) ||
      !Number.isFinite(Date.parse(iso)) ||
      new Date(iso + 'T00:00:00Z').toISOString().slice(0, 10) !== iso ||
      iso > new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
    )
      throw Error('date')
    if (!Number.isSafeInteger(line.amount) || line.amount < 1 || line.amount > 99999999)
      throw Error('amount')
    return {
      date: iso,
      category: line.category,
      merchant: line.merchant.trim(),
      amount: line.amount,
    }
  })
  return {
    title: input.title.trim(),
    note: input.note.trim(),
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
  }
}
export function scopes(r) {
  const keys = ['MINE#' + r.owner]
  if (r.state === 'submitted') keys.push('REVIEW#' + r.team)
  if (['approved', 'paid'].includes(r.state)) keys.push('FINANCE')
  return keys
}
export function summary(r) {
  const { id, title, total, state, ownerName, updated, team, revision } = r
  return { id, title, total, state, ownerName, updated, team, revision }
}
export function appendEvent(r, actor, operation, comment, when = new Date().toISOString()) {
  const entry = { operation, actor: actor.name, at: when, comment }
  return {
    ...r,
    updated: when,
    revision: r.revision + 1,
    history: [...(r.history ?? []), entry].slice(-40),
  }
}
export const fileLimit = 1536 * 1024
export function receiptBytes(data, type) {
  if (typeof data !== 'string' || data.length > Math.ceil(fileLimit / 3) * 4 || !data.length)
    throw Error('attachment')
  const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0))
  if (bytes.length > fileLimit) throw Error('attachment')
  const matches =
    (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (type === 'image/png' && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) ||
    (type === 'application/pdf' && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-')
  if (!matches) throw Error('attachment')
  return bytes
}
