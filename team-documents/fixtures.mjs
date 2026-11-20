export const people = {
  alice: { team: 'design', role: 'editor' },
  ben: { team: 'design', role: 'reader' },
  chika: { team: 'finance', role: 'editor' },
}
export function sampleDocuments(alice, chika) {
  return [
    {
      id: 'handbook',
      team: 'design',
      owner: alice,
      published: true,
      title: 'Design handbook',
      body: 'Before a customer interview, agree on a note-taker and a place to store the anonymized findings.',
    },
    {
      id: 'launch-notes',
      team: 'design',
      owner: alice,
      published: false,
      title: 'Launch notes',
      body: 'Draft for the launch review. The release owner will confirm the rollout window on Friday.',
    },
    {
      id: 'forecast',
      team: 'finance',
      owner: chika,
      published: true,
      title: 'Quarterly forecast',
      body: 'Finance review: the example forecast assumes two new projects next quarter.',
    },
  ]
}
