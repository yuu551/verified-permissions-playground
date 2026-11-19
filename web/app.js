'use strict'
const $ = (id) => document.getElementById(id)
const local = config.mode !== 'aws'
const repo = 'https://github.com/yuu551/verified-permissions-playground/blob/main/'
const labels = {
  en: {
    title: 'Document access lab',
    intro: 'Choose a document, send a request, and see what the Cedar policies allow.',
    request: 'Request',
    response: 'Response',
    document: 'Document',
    guide: 'Team guide',
    release: 'Release draft',
    notes: 'Personal notes',
    backend: 'Backend',
    identity: 'Identity',
    send: 'Send request',
    source: 'View implementation ↗',
    policies: 'Cedar policies',
    signin: 'Sign in',
    signout: 'Sign out',
    username: 'Username',
    password: 'Password',
    accountHelp: 'Use the reader created with npm run demo:user.',
    browser: 'Browser Cedar',
    browserNote:
      'This demo runs Hono and Cedar in your browser. Deploy the CDK sample to compare Hono and FastAPI on AWS.',
    preview: 'Local Cedar',
    aws: 'AWS · REST API',
    reader: 'Demo reader',
    guest: 'Anonymous',
    signed: 'Signed-in reader',
    pending: 'Ready to evaluate',
    hint: 'Send a request to see the HTTP response.',
    allowed: 'Allowed',
    denied: 'Forbidden',
    unauthorized: 'Unauthenticated',
    unknown: 'Request failed',
    loading: 'Evaluating…',
    permit: 'The read policy permits this document.',
    forbid: 'The embargo policy forbids the release draft, even with a matching permit.',
    implicit: 'No policy permits access to personal notes.',
    noauth: 'The request needs a reader identity.',
    failure: 'The service could not complete this request.',
    localNote:
      'Local mode uses the Hono route and the Cedar engine on your computer. Deploy to compare both backends with Verified Permissions.',
    awsNote:
      'Both backends use this policy store. API Gateway verifies the Cognito ID token before invoking either backend.',
    invalid: 'Sign-in failed. Check the reader credentials and try again.',
    required: 'Sign in first or choose Anonymous.',
  },
  ja: {
    title: '文書のアクセス権を試す',
    intro: '文書を選んでリクエストを送り、Cedar ポリシーによる許可・拒否を確認できます。',
    request: 'リクエスト',
    response: 'レスポンス',
    document: '文書',
    guide: 'チームガイド',
    release: 'リリース草稿',
    notes: '個人メモ',
    backend: 'バックエンド',
    identity: 'ユーザー',
    send: 'リクエストを送る',
    source: '実装を見る ↗',
    policies: 'Cedar ポリシー',
    signin: 'サインイン',
    signout: 'サインアウト',
    username: 'ユーザー名',
    password: 'パスワード',
    accountHelp: 'npm run demo:user で作成したユーザーでサインインしてください。',
    browser: 'ブラウザー Cedar',
    browserNote:
      'このデモはブラウザー内で Hono と Cedar を実行します。CDK でデプロイすると Hono と FastAPI を AWS で比較できます。',
    preview: 'ローカル Cedar',
    aws: 'AWS · REST API',
    reader: 'デモユーザー',
    guest: '匿名',
    signed: '認証済みユーザー',
    pending: '判定待ち',
    hint: 'リクエストを送ると HTTP の応答が表示されます。',
    allowed: '閲覧を許可',
    denied: '閲覧を拒否',
    unauthorized: '未認証',
    unknown: 'リクエスト失敗',
    loading: '判定中…',
    permit: '閲覧ポリシーがこの文書を許可しました。',
    forbid: '閲覧を許可するポリシーもありますが、草稿には明示的な禁止が適用されます。',
    implicit: '個人メモの閲覧を許可するポリシーはありません。',
    noauth: '閲覧にはユーザーの認証が必要です。',
    failure: 'サービスから判定を取得できませんでした。',
    localNote:
      'ローカルでは Hono と手元の Cedar エンジンを使います。AWS にデプロイすると、両方のバックエンドで Verified Permissions の判定を試せます。',
    awsNote:
      '両方のバックエンドで同じポリシーストアを使います。API Gateway は Cognito の ID トークンを検証してからバックエンドを呼び出します。',
    invalid: 'サインインできませんでした。ユーザー名とパスワードを確認してください。',
    required: 'サインインするか、匿名を選んでください。',
  },
}
let language = localStorage.getItem('avp-language') === 'ja' ? 'ja' : 'en'
let policy = 'published',
  token = '',
  reader = '',
  last = null,
  sequence = 0
const t = (key) => labels[language][key]
const doc = () => document.querySelector('input[name=doc]:checked').value
const route = () => $('backend').value + '/documents/' + doc()
function showPolicy(value) {
  policy = value
  for (const name of Object.keys(config.policies))
    $(name).setAttribute('aria-pressed', String(name === value))
  $('policy-code').textContent = config.policies[value].trim()
}
function renderResult() {
  const status = last?.status
  const state = !last
    ? 'pending'
    : status === 200
      ? 'allowed'
      : status === 403
        ? 'denied'
        : status === 401
          ? 'unauthorized'
          : 'unknown'
  const explain = !last
    ? 'hint'
    : status === 200
      ? 'permit'
      : status === 403
        ? doc() === 'release'
          ? 'forbid'
          : doc() === 'notes'
            ? 'implicit'
            : 'failure'
        : status === 401
          ? 'noauth'
          : 'failure'
  $('decision').textContent = t(state)
  $('explanation').textContent = t(explain)
  $('signal').textContent = {
    pending: '·',
    allowed: '✓',
    denied: '×',
    unauthorized: '–',
    unknown: '!',
  }[state]
  $('status-code').textContent = status ? 'HTTP ' + status : 'HTTP'
  $('endpoint').textContent = 'GET /' + route()
  $('payload').textContent = last ? JSON.stringify(last.body, null, 2) : ''
  $('source').href =
    repo + ($('backend').value === 'fastapi' ? 'api/fastapi/handler.py' : 'api/hono/documents.mjs')
}
function clearResult() {
  sequence++
  last = null
  $('send').disabled = false
  renderResult()
}
function render() {
  document.documentElement.lang = language
  for (const el of document.querySelectorAll('[data-i]')) el.textContent = t(el.dataset.i)
  $('mode').textContent = t(config.mode === 'browser' ? 'browser' : local ? 'preview' : 'aws')
  $('policy-note').textContent = t(
    config.mode === 'browser' ? 'browserNote' : local ? 'localNote' : 'awsNote',
  )
  $('language').textContent = language === 'en' ? '日本語' : 'English'
  const identity = $('identity').value || 'reader'
  $('identity').replaceChildren(
    new Option(t(local ? 'reader' : 'signed'), 'reader'),
    new Option(t('guest'), 'guest'),
  )
  $('identity').value = identity
  $('account').hidden = local
  $('login').textContent = t(token ? 'signout' : 'signin')
  $('account-status').textContent = reader
  showPolicy(policy)
  renderResult()
}
$('backend').add(new Option(local ? 'Hono · Cedar' : 'Hono', 'hono'))
if (!local) $('backend').add(new Option('FastAPI', 'fastapi'))
$('language').onclick = () => {
  language = language === 'en' ? 'ja' : 'en'
  localStorage.setItem('avp-language', language)
  render()
}
$('documents').onchange = clearResult
$('backend').onchange = clearResult
$('identity').onchange = clearResult
for (const name of Object.keys(config.policies)) $(name).onclick = () => showPolicy(name)
$('send').onclick = async () => {
  if (!local && $('identity').value === 'reader' && !token) {
    $('dialog').showModal()
    return
  }
  const ticket = ++sequence
  $('send').disabled = true
  $('decision').textContent = t('loading')
  const headers = {}
  if ($('identity').value === 'reader') {
    if (local) headers['X-Preview-User'] = 'reader'
    else headers.Authorization = 'Bearer ' + token
  }
  try {
    const res =
      config.mode === 'browser'
        ? await (await import('./engine.js')).evaluate(route(), headers, config.policies)
        : await fetch(location.pathname.replace(/\/$/, '') + '/' + route(), {
            headers,
            cache: 'no-store',
          })
    const body = await res.json()
    if (ticket !== sequence) return
    last = { status: res.status, body }
    if (res.status === 403 && doc() === 'release') showPolicy('embargo')
    if (res.status === 200 || doc() === 'notes') showPolicy('published')
  } catch {
    if (ticket === sequence) last = { status: 0, body: { error: t('failure') } }
  } finally {
    if (ticket === sequence) {
      $('send').disabled = false
      renderResult()
    }
  }
}
$('login').onclick = () => {
  if (token) {
    token = ''
    reader = ''
    clearResult()
    render()
  } else $('dialog').showModal()
}
$('close').onclick = () => $('dialog').close()
$('dialog').addEventListener('close', () => {
  $('password').value = ''
  $('auth-error').textContent = ''
})
$('credentials').onsubmit = async (event) => {
  event.preventDefault()
  const button = event.submitter
  button.disabled = true
  const username = $('username').value
  try {
    const res = await fetch('https://cognito-idp.' + config.region + '.amazonaws.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: config.clientId,
        AuthParameters: { USERNAME: username, PASSWORD: $('password').value },
      }),
    })
    const body = await res.json()
    if (!res.ok || !body.AuthenticationResult?.IdToken) throw Error()
    token = body.AuthenticationResult.IdToken
    reader = username
    $('identity').value = 'reader'
    $('dialog').close()
    clearResult()
    render()
  } catch {
    $('auth-error').textContent = t('invalid')
  } finally {
    $('password').value = ''
    button.disabled = false
  }
}
render()
