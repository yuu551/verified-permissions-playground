const app = document.querySelector('#app'),
  notice = document.querySelector('#notice')
notice.className = 'notice'
const client = document.querySelector('meta[name=client]').content,
  region = document.querySelector('meta[name=region]').content
const preview = client === 'browser-preview'
let language = localStorage.getItem('folio.lang') === 'ja' ? 'ja' : 'en'
let person = sessionStorage.getItem('folio.demo') || 'alice',
  token = '',
  me = null,
  rows = [],
  report = null,
  box = 'mine',
  screen = 'list',
  filter = '',
  query = '',
  message = '',
  entryId = '',
  timer,
  busy = false
const t = (en, ja) => (language === 'ja' ? ja : en)
const words = {
  mine: ['My reports', '自分の申請'],
  review: ['Approvals', '承認待ち'],
  finance: ['Reimbursements', '経理の精算一覧'],
  draft: ['Draft', '下書き'],
  submitted: ['In review', '承認待ち'],
  returned: ['Returned', '差し戻し'],
  approved: ['Approved', '承認済み'],
  paid: ['Reimbursed', '精算済み'],
  employee: ['Employee', '申請者'],
  manager: ['Manager', '上長'],
  travel: ['Transport', '交通費'],
  meals: ['Meals', '飲食費'],
  lodging: ['Lodging', '宿泊費'],
  supplies: ['Supplies', '消耗品費'],
  software: ['Software', 'ソフトウェア'],
  other: ['Other', 'その他'],
  create: ['Created', '作成'],
  edit: ['Updated', '明細を更新'],
  attach: ['Receipt attached', '領収書を添付'],
  submit: ['Submitted', '申請'],
  approve: ['Approved', '承認'],
  return: ['Returned', '差し戻し'],
  pay: ['Reimbursement recorded', '精算を記録'],
}
const word = (k) => t(...(words[k] ?? [k, k]))
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  )
const value = (id) => document.getElementById(id)?.value ?? ''
const date = (s) =>
  new Intl.DateTimeFormat(language === 'ja' ? 'ja-JP' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(s))
const yen = (n) => '¥' + new Intl.NumberFormat('en-US').format(n)
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
const cats = ['travel', 'meals', 'lodging', 'supplies', 'software', 'other']
const states = ['draft', 'submitted', 'returned', 'approved', 'paid']
const roleName = (k) => (k === 'finance' ? t('Finance', '経理') : word(k))
const people = { alice: 'Alice', ben: 'Ben', chika: 'Chika' }
const roles = { alice: 'employee', ben: 'manager', chika: 'finance' }
function flash(text) {
  clearTimeout(timer)
  notice.textContent = text
  timer = setTimeout(() => (notice.textContent = ''), 5000)
}
function button(action, label, cls = '', data = '') {
  return (
    '<button type="button" class="' +
    cls +
    '" data-act="' +
    action +
    '" data-value="' +
    escape(data) +
    '">' +
    escape(label) +
    '</button>'
  )
}
function picker(label, items, caption = '') {
  return (
    '<details class="picker"><summary>' +
    escape(label) +
    '</summary><div class="choices">' +
    (caption ? '<small>' + escape(caption) + '</small>' : '') +
    items +
    '</div></details>'
  )
}
function badge(state) {
  return '<span class="badge ' + state + '">' + escape(word(state)) + '</span>'
}
async function api(path, options = {}, binary = false) {
  const init = {
    ...options,
    headers: { ...(options.body && { 'Content-Type': 'application/json' }), ...options.headers },
  }
  const url = '/api/spend' + path
  const response = preview
    ? await (await import('./expense-preview.js')).request(url, person, init)
    : await fetch(url, { ...init, headers: { ...init.headers, Authorization: 'Bearer ' + token } })
  if (!response.ok) {
    if (response.status === 401) {
      token = ''
      me = null
      report = null
      rows = []
      render()
    }
    const data = await response.json().catch(() => ({}))
    const messages = {
      attachment: t(
        'Choose a PDF, JPEG or PNG up to 1.5 MiB.',
        '1.5 MiB 以下の PDF・JPEG・PNG を選んでください。',
      ),
      date: t(
        'Check the expense date. Future dates are unavailable.',
        '利用日は今日以前の日付を入力してください。',
      ),
    }
    const explanation =
      messages[data.error] ??
      {
        400: t('Check the entered values.', '入力内容を確認してください。'),
        403: t(
          'You no longer have access to this report or action.',
          'この申請または操作へのアクセス権がありません。',
        ),
        409: t(
          'This report changed. Reopen it before trying again.',
          '申請が更新されました。一覧から開き直してください。',
        ),
        401: t('Sign in again.', 'もう一度ログインしてください。'),
      }[response.status] ??
      t(
        'Could not complete the request. Try again.',
        '処理できませんでした。もう一度お試しください。',
      )
    const requestId = response.headers.get('x-request-id')
    throw Error(
      explanation + (requestId ? ' (' + t('Request', 'リクエスト') + ' ' + requestId + ')' : ''),
    )
  }
  return binary ? response.blob() : response.json()
}
function header() {
  const account = !me
    ? ''
    : preview
      ? picker(
          me.name,
          Object.entries(people)
            .map(([id, name]) => button('person', name + ' · ' + roleName(roles[id]), '', id))
            .join(''),
          t('Browser demo', 'ブラウザーデモ'),
        )
      : picker(me.name, button('logout', t('Sign out', 'ログアウト')), roleName(me.role))
  return (
    '<header class="top"><div class="bar"><span class="brand"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3l2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1v18l-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1zM8 8h8M8 12h8M8 16h4"/></svg>' +
    t('Expenses', '経費精算') +
    '</span><div class="right">' +
    button('lang', t('日本語', 'English'), 'lang') +
    account +
    '</div></div></header>'
  )
}
function login() {
  return (
    '<section class="login"><h1>' +
    t('Sign in', 'ログイン') +
    '</h1><form id="signin"><label class="field">' +
    t('Username', 'ユーザー名') +
    '<input name="username" autocomplete="username" required></label><label class="field">' +
    t('Password', 'パスワード') +
    '<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">' +
    t('Sign in', 'ログイン') +
    '</button></form></section>'
  )
}
function nav() {
  const boxes =
    me.role === 'manager'
      ? ['review', 'mine']
      : me.role === 'finance'
        ? ['finance', 'mine']
        : ['mine']
  return boxes.length < 2
    ? ''
    : '<nav class="nav" aria-label="' +
        t('Inboxes', '申請一覧') +
        '">' +
        boxes
          .map(
            (k) =>
              '<button data-act="box" data-value="' +
              k +
              '" ' +
              (box === k ? 'aria-current="page"' : '') +
              '>' +
              escape(word(k)) +
              '</button>',
          )
          .join('') +
        '</nav>'
}
function list() {
  const options =
    button('filter', t('All statuses', 'すべての状態'), '', '') +
    states.map((k) => button('filter', word(k), '', k)).join('')
  return (
    nav() +
    '<div class="heading"><h1>' +
    word(box) +
    '</h1>' +
    (box === 'mine' ? button('new', t('New report', '申請を作成'), 'primary') : '') +
    '</div><div class="tools"><input id="search" type="search" aria-label="' +
    t('Search reports', '申請を検索') +
    '" placeholder="' +
    t('Search reports', '申請を検索') +
    '" value="' +
    escape(query) +
    '">' +
    picker(filter ? word(filter) : t('All statuses', 'すべての状態'), options) +
    '</div><div id="results">' +
    table() +
    '</div>'
  )
}
function table() {
  const visible = rows.filter(
    (r) =>
      (!filter || r.state === filter) &&
      (r.title + ' ' + r.ownerName).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  if (!visible.length)
    return (
      '<p class="empty">' +
      (query || filter
        ? t('No matching reports.', '条件に合う申請はありません。')
        : box === 'review'
          ? t('No reports awaiting approval.', '承認待ちの申請はありません。')
          : box === 'finance'
            ? t('No reimbursements yet.', '精算対象の申請はありません。')
            : t(
                'No reports yet. Create your first report.',
                '申請はまだありません。最初の申請を作成してください。',
              )) +
      '</p>'
    )
  return (
    '<table class="table"><thead><tr><th>' +
    t('Report', '件名') +
    '</th><th>' +
    t('Status', '状態') +
    '</th><th class="when">' +
    t('Updated', '更新日') +
    '</th><th class="amount">' +
    t('Amount', '金額') +
    '</th></tr></thead><tbody>' +
    visible
      .map(
        (r) =>
          '<tr><td>' +
          button('open', r.title, 'open', r.id) +
          (box !== 'mine' ? '<small>' + escape(r.ownerName) + '</small>' : '') +
          '</td><td>' +
          badge(r.state) +
          '</td><td class="when">' +
          date(r.updated) +
          '</td><td class="amount">' +
          yen(r.total) +
          '</td></tr>',
      )
      .join('') +
    '</tbody></table>'
  )
}
const back = () => button('list', '← ' + word(box), 'link back')
function detail() {
  const r = report,
    editable = r.owner === me.sub && r.team === me.team && ['draft', 'returned'].includes(r.state)
  const reviewer =
    me.role === 'manager' && r.owner !== me.sub && r.team === me.team && r.state === 'submitted'
  const finance =
    me.role === 'finance' && r.owner !== me.sub && r.approver !== me.sub && r.state === 'approved'
  const reason =
    r.state === 'returned' ? r.history.findLast((e) => e.operation === 'return')?.comment : ''
  const controls = editable
    ? '<div class="section"><div class="actions">' +
      button('submit', t('Submit report', '申請する'), 'primary') +
      button('edit', t('Edit report', '編集')) +
      '</div></div>'
    : reviewer || finance
      ? '<form id="decision" class="section"><label class="field">' +
        (finance ? t('Payment reference', '精算番号') : t('Reason for return', '差し戻し理由')) +
        '<textarea name="comment" maxlength="400" ' +
        (finance ? 'required' : '') +
        '></textarea></label><div class="actions">' +
        (finance
          ? '<button class="primary" value="pay">' +
            t('Record reimbursement', '精算を記録') +
            '</button>'
          : '<button type="button" data-act="approve" class="primary">' +
            t('Approve', '承認する') +
            '</button><button value="return">' +
            t('Return for changes', '差し戻す') +
            '</button>') +
        '</div></form>'
      : ''
  const receipts =
    '<section class="section"><h2>' +
    t('Receipt', '領収書') +
    '</h2>' +
    (r.receipt
      ? button('download', r.receipt.name, 'link')
      : '<p class="muted">' + t('No receipt attached.', '領収書は添付されていません。') + '</p>') +
    (editable
      ? '<label class="field file">' +
        t('Attach PDF, JPEG or PNG · up to 1.5 MiB', 'PDF・JPEG・PNG を添付（1.5 MiB まで）') +
        '<input type="file" id="receipt" accept="application/pdf,image/jpeg,image/png"></label>'
      : '') +
    '</section>'
  return (
    back() +
    '<div class="heading"><div><h1>' +
    escape(r.title) +
    '</h1><p class="muted">' +
    escape(r.ownerName) +
    ' · ' +
    badge(r.state) +
    '</p></div></div>' +
    (reason
      ? '<p class="reason">' +
        t('Reason for return', '差し戻し理由') +
        ' — ' +
        escape(reason) +
        '</p>'
      : '') +
    '<div class="report"><div><p class="description">' +
    escape(r.note) +
    '</p><section class="section"><h2>' +
    t('Expense items', '明細') +
    '</h2><table class="table"><thead><tr><th>' +
    t('Merchant', '支払先') +
    '</th><th>' +
    t('Date', '利用日') +
    '</th><th class="amount">' +
    t('Amount', '金額') +
    '</th></tr></thead><tbody>' +
    r.lines
      .map(
        (l) =>
          '<tr><td>' +
          escape(l.merchant) +
          '<small>' +
          word(l.category) +
          '</small></td><td>' +
          date(l.date) +
          '</td><td class="amount">' +
          yen(l.amount) +
          '</td></tr>',
      )
      .join('') +
    '</tbody></table><p class="total">' +
    t('Total', '合計') +
    '<span>' +
    yen(r.total) +
    '</span></p></section>' +
    receipts +
    controls +
    '</div><section class="section"><h2>' +
    t('Activity', '履歴') +
    '</h2><ol class="history">' +
    r.history
      .toReversed()
      .map(
        (e) =>
          '<li>' +
          word(e.operation) +
          '<small>' +
          escape(e.actor) +
          ' · ' +
          date(e.at) +
          '</small>' +
          (e.comment ? '<p>' + escape(e.comment) + '</p>' : '') +
          '</li>',
      )
      .join('') +
    '</ol></section></div>'
  )
}
let draft = null
const lineDefault = () => ({ date: today(), category: 'travel', merchant: '', amount: '' })
function form() {
  const row = (line, i) =>
    '<div class="line"><label class="field">' +
    t('Date', '利用日') +
    '<input type="date" name="date" max="' +
    today() +
    '" required value="' +
    escape(line.date) +
    '"></label><label class="field">' +
    t('Merchant', '支払先') +
    '<input name="merchant" maxlength="100" required value="' +
    escape(line.merchant) +
    '"></label><div class="field"><span>' +
    t('Category', '費目') +
    '</span>' +
    picker(
      word(line.category),
      cats.map((cat) => button('category', word(cat), '', i + '-' + cat)).join(''),
    ) +
    '<input type="hidden" name="category" value="' +
    escape(line.category) +
    '"></div><label class="field">' +
    t('Amount (JPY)', '金額（円）') +
    '<input type="number" name="amount" min="1" max="99999999" step="1" required value="' +
    escape(line.amount) +
    '"></label>' +
    (draft.lines.length > 1 ? button('remove', t('Remove', '削除'), 'remove', i) : '') +
    '</div>'
  return (
    '<div class="entry">' +
    back() +
    '<div class="heading"><h1>' +
    (!report ? t('New report', '申請を作成') : t('Edit report', '申請を編集')) +
    '</h1></div><form id="entry"><label class="field">' +
    t('Report title', '件名') +
    '<input name="title" required maxlength="100" value="' +
    escape(draft.title) +
    '"></label><label class="field">' +
    t('Business purpose', '利用目的') +
    '<textarea name="note" maxlength="1200">' +
    escape(draft.note) +
    '</textarea></label><section class="section"><h2>' +
    t('Expense items', '明細') +
    '</h2><div id="lines">' +
    draft.lines.map(row).join('') +
    '</div>' +
    (draft.lines.length < 20 ? button('add', t('Add item', '明細を追加'), 'link add') : '') +
    '</section><div class="actions"><button class="primary">' +
    t('Save report', '保存する') +
    '</button>' +
    button('cancel', t('Cancel', 'キャンセル')) +
    '</div></form></div>'
  )
}
function readForm() {
  const f = document.getElementById('entry')
  if (!f) return
  draft = {
    title: f.elements.title.value,
    note: f.elements.note.value,
    lines: [...f.querySelectorAll('.line')].map((line) =>
      Object.fromEntries(
        [...line.querySelectorAll('input')].map((el) => [
          el.name,
          el.name === 'amount' && el.value ? Number(el.value) : el.value,
        ]),
      ),
    ),
  }
}
const reportRoute = () => /^#report\/([0-9a-f-]{36})$/i.exec(location.hash)?.[1]
function setRoute(id) {
  const hash = id ? '#report/' + id : ''
  if (location.hash !== hash)
    history.pushState(null, '', location.pathname + location.search + hash)
}
async function openReport(id) {
  report = await api('/reports/' + id)
  screen = 'detail'
  render()
  window.scrollTo(0, 0)
}
function render() {
  document.documentElement.lang = language
  document.title = t('Expense reports', '経費精算')
  app.innerHTML =
    header() +
    '<main>' +
    (!me
      ? preview
        ? '<p class="pending">' + t('Opening reports…', '申請を読み込み中…') + '</p>'
        : login()
      : screen === 'list'
        ? list()
        : screen === 'detail'
          ? detail()
          : form()) +
    '<p role="alert" class="error">' +
    escape(message) +
    '</p></main>'
  app.setAttribute('aria-busy', 'false')
}
async function inbox() {
  const batch = []
  let after = null
  do {
    const page = await api(
      '/reports?box=' + box + (after ? '&after=' + encodeURIComponent(after) : ''),
    )
    batch.push(...page.reports)
    after = page.after
  } while (after)
  rows = batch.sort((a, b) => b.updated.localeCompare(a.updated))
  report = null
  screen = 'list'
  render()
}
async function start() {
  const target = reportRoute()
  me = await api('/me')
  box = me.role === 'manager' ? 'review' : me.role === 'finance' ? 'finance' : 'mine'
  query = filter = ''
  await inbox()
  if (target) await openReport(target)
}
async function run(fn) {
  if (busy) return
  busy = true
  message = ''
  app.inert = true
  app.setAttribute('aria-busy', 'true')
  try {
    await fn()
  } catch (e) {
    message = e.message
    const area = app.querySelector('.error')
    if (area) area.textContent = message
    else render()
  } finally {
    busy = false
    app.inert = false
    app.setAttribute('aria-busy', 'false')
  }
}
async function mutate(op, payload = {}) {
  report = await api('/reports/' + report.id + '/' + op, {
    method: 'POST',
    headers: { 'If-Match': '"' + report.revision + '"' },
    body: JSON.stringify(payload),
  })
  if (op === 'approve' || op === 'return' || op === 'pay') {
    setRoute()
    await inbox()
  } else {
    screen = 'detail'
    render()
  }
  flash(word(op))
}
app.addEventListener('input', (e) => {
  if (e.target.id === 'search') {
    query = e.target.value
    document.getElementById('results').innerHTML = table()
  }
})
app.addEventListener('change', (e) => {
  if (e.target.id !== 'receipt' || !e.target.files[0]) return
  const file = e.target.files[0]
  run(async () => {
    if (file.size > 1536 * 1024)
      throw Error(t('Maximum receipt size is 1.5 MiB.', '領収書は 1.5 MiB までです。'))
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    await mutate('receipt', { name: file.name, type: file.type, data })
    flash(word('attach'))
  })
})
document.addEventListener('click', (e) => {
  for (const el of document.querySelectorAll('details[open]'))
    if (!el.contains(e.target)) el.open = false
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape')
    for (const el of document.querySelectorAll('details[open]')) {
      el.open = false
      el.querySelector('summary').focus()
    }
})
app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]')
  if (!b) return
  const act = b.dataset.act,
    v = b.dataset.value
  run(async () => {
    if (act === 'lang') {
      readForm()
      language = language === 'en' ? 'ja' : 'en'
      localStorage.setItem('folio.lang', language)
      return render()
    }
    if (act === 'person' || act === 'logout') {
      setRoute()
      me = null
      token = ''
      rows = []
      report = draft = null
      screen = 'list'
      render()
      if (act === 'person') {
        person = v
        sessionStorage.setItem('folio.demo', v)
        await start()
      }
      return
    }
    if (act === 'box' || act === 'list') {
      setRoute()
      if (act === 'box') box = v
      filter = query = ''
      return inbox()
    }
    if (act === 'filter') {
      filter = v
      return render()
    }
    if (act === 'open') {
      await openReport(v)
      setRoute(v)
      return
    }
    if (act === 'edit' || act === 'new') {
      if (act === 'new') report = null
      entryId = report?.id ?? crypto.randomUUID()
      draft = report ? structuredClone(report) : { title: '', note: '', lines: [lineDefault()] }
      screen = 'entry'
      render()
      document.querySelector('[name=title]').focus()
      return
    }
    if (act === 'cancel') {
      if (report) {
        screen = 'detail'
        return render()
      }
      return inbox()
    }
    if (['add', 'remove', 'category'].includes(act)) {
      readForm()
      if (act === 'add') draft.lines.push(lineDefault())
      if (act === 'remove') draft.lines.splice(Number(v), 1)
      if (act === 'category') {
        const [i, cat] = v.split('-')
        draft.lines[i].category = cat
      }
      return render()
    }
    if (act === 'submit' || act === 'approve') return mutate(act)
    if (act === 'download') {
      const blob = await api('/reports/' + report.id + '/receipt', {}, true),
        url = URL.createObjectURL(blob),
        a = document.createElement('a')
      a.href = url
      a.download = report.receipt.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    }
  })
})
app.addEventListener('submit', (e) => {
  e.preventDefault()
  const f = e.target
  run(async () => {
    if (f.id === 'signin') {
      const auth = await fetch('https://cognito-idp.' + region + '.amazonaws.com/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
        },
        body: JSON.stringify({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: client,
          AuthParameters: {
            USERNAME: f.elements.username.value,
            PASSWORD: f.elements.password.value,
          },
        }),
      })
      const response = await auth.json()
      if (!auth.ok || !response.AuthenticationResult?.IdToken)
        throw Error(
          t(
            'Sign-in failed. Check your username and password.',
            'ログインできませんでした。ユーザー名とパスワードを確認してください。',
          ),
        )
      token = response.AuthenticationResult.IdToken
      await start()
      return
    }
    if (f.id === 'entry') {
      readForm()
      if (report) await mutate('edit', draft)
      else {
        report = await api('/reports', {
          method: 'POST',
          body: JSON.stringify({ ...draft, id: entryId }),
        })
        setRoute(report.id)
        screen = 'detail'
        render()
        flash(t('Draft saved', '下書きを保存しました'))
      }
    }
    if (f.id === 'decision') {
      const comment = f.elements.comment.value.trim()
      if (!comment)
        throw Error(
          t('Enter a reason for returning the report.', '差し戻し理由を入力してください。'),
        )
      await mutate(e.submitter.value, { comment })
    }
  })
})
window.addEventListener('popstate', () => {
  if (me)
    run(async () => {
      await inbox()
      const id = reportRoute()
      if (id) await openReport(id)
    })
})
render()
if (preview) run(start)
