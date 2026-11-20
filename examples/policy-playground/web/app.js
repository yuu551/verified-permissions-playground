'use strict'
const $ = (id) => document.getElementById(id)
const local = config.mode === 'browser' || config.mode === 'local'
const repo = 'https://github.com/yuu551/verified-permissions-playground/blob/main/examples/policy-playground/'
const labels = {
  en: {
    title: 'Policy playground',
    documents: 'Documents',
    connection: 'Connection',
    runtime: 'Runtime',
    response: 'Response',
    guide: 'Team guide',
    release: 'Release draft',
    notes: 'Personal notes',
    backend: 'Backend',
    identity: 'Identity',
    send: 'Send request',
    source: 'Route source',
    policies: 'Cedar policies',
    deploy: 'Deploy with CDK',
    signin: 'Sign in',
    signout: 'Sign out',
    username: 'Username',
    password: 'Password',
    accountHelp: 'Use the reader created with npm run demo:user.',
    webAccountHelp: 'Use the reader created with npm run web:user.',
    browser: 'In browser',
    local: 'Local server',
    aws: 'AWS REST API',
    browserNote: 'Hono and Cedar run in this browser. The CDK example also includes FastAPI.',
    localNote: 'Hono and Cedar run on the local server. The CDK example also includes FastAPI.',
    webFunction: 'Lambda Web Function',
    webFunctionNote: 'The Hono server verifies your Cognito ID token and asks Verified Permissions for a decision.',
    awsNote: 'API Gateway checks the Cognito ID token. Both backends use the same policy store.',
    reader: 'Demo reader',
    guest: 'Anonymous',
    signed: 'Signed-in reader',
    pending: 'No response yet',
    allowed: 'Allowed',
    denied: 'Forbidden',
    unauthorized: 'Unauthenticated',
    unknown: 'Request failed',
    loading: 'Sending…',
    permit: 'The sample permits a reader to open this document.',
    forbid: 'Both files apply to the release draft. The embargo overrides the permit.',
    implicit: 'Neither file grants access to personal notes.',
    noauth: 'Send a reader identity to access this route.',
    failure: 'The request could not be completed.',
    invalid: 'Sign-in failed. Check the reader credentials and try again.',
  },
  ja: {
    title: '文書のアクセス権を試す',
    documents: '文書',
    connection: '接続設定',
    runtime: '実行環境',
    response: '応答',
    guide: 'チームガイド',
    release: 'リリース草稿',
    notes: '個人メモ',
    backend: 'バックエンド',
    identity: 'ユーザー',
    send: 'リクエストを送る',
    source: 'ルートの実装',
    policies: 'Cedar ポリシー',
    deploy: 'CDK でデプロイ',
    signin: 'サインイン',
    signout: 'サインアウト',
    username: 'ユーザー名',
    password: 'パスワード',
    accountHelp: 'npm run demo:user で作成したユーザーを使ってください。',
    webAccountHelp: 'npm run web:user で作成したユーザーを使ってください。',
    browser: 'ブラウザー',
    local: 'ローカルサーバー',
    aws: 'AWS REST API',
    browserNote:
      'この画面ではブラウザー内で Hono と Cedar を実行します。CDK のサンプルでは FastAPI も試せます。',
    localNote:
      'Hono と Cedar はローカルサーバーで動いています。CDK のサンプルでは FastAPI も試せます。',
    webFunction: 'Lambda Web Function',
    webFunctionNote: 'Hono が Cognito の ID トークンを検証し、文書を閲覧できるか Verified Permissions に問い合わせます。',
    awsNote:
      'API Gateway が Cognito の ID トークンを検証します。どちらのバックエンドも同じポリシーストアを使います。',
    reader: 'デモユーザー',
    guest: '匿名',
    signed: '認証済みユーザー',
    pending: '未送信',
    allowed: '閲覧を許可',
    denied: '閲覧を拒否',
    unauthorized: '未認証',
    unknown: 'リクエスト失敗',
    loading: '送信中…',
    permit: 'この文書は閲覧ポリシーで許可されています。',
    forbid: '草稿には両方のポリシーが適用されます。明示的な禁止が優先されます。',
    implicit: '個人メモの閲覧を許可するポリシーはありません。',
    noauth: 'このルートの閲覧には認証が必要です。',
    failure: 'リクエストを完了できませんでした。',
    invalid: 'サインインできませんでした。ユーザー名とパスワードを確認してください。',
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
  const code = $('policy-code')
  code.replaceChildren()
  for (const part of config.policies[value]
    .trim()
    .split(/(\/\/[^\n]*|"(?:[^"\\]|\\.)*"|\b(?:permit|forbid|when|is)\b)/)) {
    let style
    if (part.startsWith('//')) style = 'comment'
    else if (part.startsWith('"')) style = 'literal'
    else if (['permit', 'forbid', 'when', 'is'].includes(part)) style = 'keyword'
    if (style) {
      const token = document.createElement('span')
      token.className = style
      token.textContent = part
      code.append(token)
    } else {
      code.append(part)
    }
  }
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
  $('explanation').textContent = last ? t(explain) : ''
  $('explanation').hidden = !last
  $('document-title').textContent = t(doc())
  $('decision').parentElement.dataset.outcome = state
  $('status-code').textContent = status ? 'HTTP ' + status : ''
  $('endpoint').textContent = '/' + route()
  $('payload').hidden = !last
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
  $('mode').textContent = t(config.mode)
  $('policy-note').textContent = t(config.mode + 'Note')
  $('language').textContent = language === 'en' ? '日本語' : 'English'
  const identity = $('identity').value || 'reader'
  $('identity').replaceChildren(
    new Option(t(local ? 'reader' : 'signed'), 'reader'),
    new Option(t('guest'), 'guest'),
  )
  $('identity').value = identity
  $('backend').disabled = config.mode !== 'aws'
  $('account').hidden = local
  $('login').textContent = t(token ? 'signout' : 'signin')
  $('account-status').textContent = reader
  showPolicy(policy)
  renderResult()
}
if (config.mode === 'webFunction') {
  document.querySelector('[data-i=accountHelp]').dataset.i = 'webAccountHelp'
  document.querySelector('[data-i=deploy]').hash = 'deploy-hono-on-lambda-web-functions'
}
$('backend').add(new Option(local ? 'Hono · Cedar' : 'Hono', 'hono'))
if (config.mode === 'aws') $('backend').add(new Option('FastAPI', 'fastapi'))
$('language').onclick = () => {
  language = language === 'en' ? 'ja' : 'en'
  localStorage.setItem('avp-language', language)
  render()
}
$('documents').onchange = clearResult
$('backend').onchange = clearResult
$('identity').onchange = clearResult
for (const name of Object.keys(config.policies)) $(name).onclick = () => showPolicy(name)
async function sendRequest() {
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
$('send').onclick = sendRequest
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
if (local) sendRequest()
