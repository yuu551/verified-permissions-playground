import { test, expect } from '@playwright/test'
import { readDeployment } from '../scripts/deployment.mjs'
import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'
import { createReader } from '../scripts/user.mjs'

const cloud = process.env.PLAYGROUND_AWS_OUTPUTS
const outputs = cloud && readDeployment(cloud)
let reader
test.beforeAll(async () => {
  if (cloud) reader = await createReader(outputs)
})
test.afterAll(async () => {
  if (!reader) return
  const client = new CognitoIdentityProviderClient({ region: outputs.Region })
  try {
    await client.send(
      new AdminDeleteUserCommand({ UserPoolId: outputs.PoolId, Username: reader.username }),
    )
  } finally {
    client.destroy()
  }
})

test('reader, anonymous, explicit forbid and default deny', async ({ page }) => {
  await page.goto('./')
  if (outputs?.backends.length === 1) {
    await expect(page.locator('#mode')).toHaveText('Lambda Web Function')
    await expect(page.locator('#backend option')).toHaveText(['Hono'])
    await expect(page.locator('a[data-i=deploy]')).toHaveAttribute('href', /#deploy-hono-on-lambda-web-functions$/)
  }
  if (!cloud) {
    await expect(page.locator('#status-code')).toHaveText('HTTP 200')
    await expect(page.locator('#endpoint')).toHaveText('/hono/documents/guide')
    await expect(page.locator('#payload')).toContainText('"document": "guide"')
  }
  if (cloud) {
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByLabel('Username', { exact: true }).fill(reader.username)
    await page.getByLabel('Password', { exact: true }).fill(reader.password)
    await page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  }
  for (const backend of outputs?.backends ?? ['hono']) {
    if (outputs?.backends.length > 1)
      await page.getByLabel('Backend', { exact: true }).selectOption(backend)
    for (const [id, status] of [
      ['guide', 200],
      ['release', 403],
      ['notes', 403],
    ]) {
      await page.locator('input[value="' + id + '"]').check()
      await page.getByRole('button', { name: 'Send request' }).click()
      await expect(page.locator('#status-code')).toHaveText('HTTP ' + status)
      if (status === 200)
        await expect(page.locator('#payload')).toContainText('"document": "guide"')
      if (id === 'release')
        await expect(page.locator('#embargo')).toHaveAttribute('aria-pressed', 'true')
    }
    await page.getByLabel('Identity', { exact: true }).selectOption('guest')
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.locator('#status-code')).toHaveText('HTTP 401')
    await page.getByLabel('Identity', { exact: true }).selectOption('reader')
  }
  await page.getByRole('button', { name: '日本語' }).click()
  await expect(page.getByRole('heading', { name: '文書のアクセス権を試す' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'リクエストを送る' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
