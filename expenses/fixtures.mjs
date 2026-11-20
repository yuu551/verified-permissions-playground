import { appendEvent, fields } from './model.mjs'
export const profiles = {
  alice: { name: 'Alice', team: 'design', role: 'editor', expenseRole: 'employee' },
  ben: { name: 'Ben', team: 'design', role: 'reader', expenseRole: 'manager' },
  chika: { name: 'Chika', team: 'finance', role: 'editor', expenseRole: 'finance' },
}
const samples = [
  [
    'Osaka customer visit',
    'draft',
    'Round trip to the customer research session in Osaka.',
    [
      ['JR Central', 'travel', 28740],
      ['Osaka Metro', 'travel', 580],
    ],
  ],
  [
    'Q4 design workshop',
    'returned',
    'Materials for the joint working session.',
    [
      ['Itoya', 'supplies', 6380],
      ['Print Square', 'supplies', 4800],
    ],
  ],
  [
    'Nagoya site visit',
    'submitted',
    'Field interviews with the installation team.',
    [
      ['JR Central', 'travel', 22600],
      ['Nagoya City Subway', 'travel', 540],
    ],
  ],
  [
    'Prototype review lunch',
    'approved',
    'Lunch for four during the prototype review.',
    [['Cafe Locale', 'meals', 6720]],
  ],
  [
    'Research transcription',
    'paid',
    'Transcription subscription for the October interviews.',
    [['Notta', 'software', 1980]],
  ],
]
export function sampleReports(ids, now = new Date()) {
  return samples.map(([title, state, note, items], i) => {
    const stamp = (n) => new Date(now.valueOf() - (i + 1) * 86400000 + n * 60000).toISOString()
    const lines = items.map(([merchant, category, amount]) => ({
      merchant,
      category,
      amount,
      date: stamp(0).slice(0, 10),
    }))
    const id = 'eb010000-0000-4000-8000-' + String(i + 1).padStart(12, '0')
    let r = {
      id,
      owner: ids.alice,
      ownerName: 'Alice',
      team: 'design',
      revision: 0,
      history: [],
      state: 'draft',
      ...fields({ title, note, lines }),
    }
    r = appendEvent(r, profiles.alice, 'create', '', stamp(0))
    if (state !== 'draft') {
      r.state = 'submitted'
      r = appendEvent(r, profiles.alice, 'submit', '', stamp(1))
    }
    if (state === 'returned') {
      r.state = state
      r = appendEvent(r, profiles.ben, 'return', 'Please attach the print shop receipt.', stamp(2))
    }
    if (['approved', 'paid'].includes(state)) {
      r.state = 'approved'
      r.approver = ids.ben
      r = appendEvent(r, profiles.ben, 'approve', '', stamp(2))
    }
    if (state === 'paid') {
      r.state = state
      r = appendEvent(r, profiles.chika, 'pay', 'AP-0168', stamp(3))
    }
    return r
  })
}
