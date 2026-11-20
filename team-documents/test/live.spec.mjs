import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { config, trialFolder } from '../config.mjs'
import { dataClient } from '../store.mjs'

test('two signed-in employees hand off a new document', async ({ browser }) => {
  const settings = config()
  if (!settings.ExpiresUTC) throw Error('Use the temporary stack for this drill.')
  const { accounts } = JSON.parse(
    readFileSync(trialFolder + '/accounts-' + settings.Pool + '.json'),
  )
  const contexts = []
  let id
  async function login(person) {
    const ctx = await browser.newContext()
    contexts.push(ctx)
    const page = await ctx.newPage()
    await page.goto(settings.Url)
    await page.locator('[name=username]').fill(accounts[person].username)
    await page.locator('[name=password]').fill(accounts[person].password)
    await page.locator('#login button').click()
    await expect(page.locator('#open')).toBeVisible()
    await expect(page.locator('#panel')).toBeHidden()
    return page
  }
  try {
    const [alice, ben] = await Promise.all([login('alice'), login('ben')])
    await alice.locator('#compose summary').click()
    await alice.locator('[name=title]').fill('Operations handoff')
    await alice.locator('[name=body]').fill('Synthetic handoff checklist.')
    await alice.locator('#draft button').click()
    await expect(alice.locator('#status')).toHaveText('HTTP 201')
    id = await alice.locator('#ref').inputValue()
    await ben.locator('#ref').fill(id)
    await ben.locator('#open button').click()
    await expect(ben.locator('#status')).toContainText('403')
    await alice.locator('#publish').click()
    await expect(alice.locator('#version')).toContainText('Published')
    await ben.locator('#open button').click()
    await expect(ben.locator('#body')).toHaveText('Synthetic handoff checklist.')
    await ben.locator('#locale').click()
    await expect(ben.locator('h1')).toHaveText('チームの文書')
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
    if (id)
      await dataClient({ region: settings.Region }).send(
        new DeleteCommand({ TableName: settings.State, Key: { pk: 'DOC#' + id } }),
      )
  }
})
