export const user = (id) => ({ type: 'Work::User', id })
export const document = (id) => ({ type: 'Work::Document', id })
export const action = (id) => ({ type: 'Work::Action', id })

export function entities(sub, member, doc) {
  return [
    { uid: user(sub), attrs: { team: member.team, role: member.role }, parents: [] },
    {
      uid: document(doc.id),
      attrs: {
        team: doc.team,
        owner: { __entity: user(doc.owner) },
        published: doc.published,
      },
      parents: [],
    },
  ]
}
