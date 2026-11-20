import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { config, trialFolder } from '../config.mjs'
const live = process.env.TEAM_LIVE === '1'
test('employee corrects a returned expense, manager approves and finance records reimbursement', async ({
  browser,
  page,
}) => {
  test.setTimeout(150000)
  const settings = live ? config() : null
  if (live && !settings.ExpiresUTC) throw Error('Use the temporary stack for this test')
  const accounts = live
    ? JSON.parse(readFileSync(trialFolder + '/accounts-' + settings.Pool + '.json')).accounts
    : null
  const contexts = [],
    sessions = {}
  async function as(person) {
    if (live) {
      if (sessions[person]) {
        const p = sessions[person]
        if (person !== 'alice')
          await p
            .getByRole('button', {
              name: person === 'ben' ? 'Approvals' : 'Reimbursements',
              exact: true,
            })
            .click()
        return p
      }
      const ctx = await browser.newContext()
      contexts.push(ctx)
      const p = await ctx.newPage()
      await p.goto(settings.Url)
      await p.getByLabel('Username').fill(accounts[person].username)
      await p.getByLabel('Password').fill(accounts[person].password)
      await p.getByRole('button', { name: 'Sign in', exact: true }).click()
      sessions[person] = p
      return p
    }
    if (person === 'alice' && !(await page.locator('summary').count())) await page.goto('./')
    await expect(page.locator('header details')).toBeVisible()
    await page.locator('header summary').click()
    await page.locator('header .choices button[data-value="' + person + '"]').click()
    return page
  }
  const title = 'Sendai client visit · ' + crypto.randomUUID().slice(0, 6)
  try {
    let p = await as('alice')
    await p.getByRole('button', { name: 'New report' }).click()
    await p.getByLabel('Report title').fill(title)
    await p.getByLabel('Business purpose').fill('On-site planning meeting with the Sendai team.')
    await p.getByLabel('Merchant').fill('JR East')
    await p.getByLabel('Amount (JPY)').fill('22400')
    await p.getByRole('button', { name: 'Save report' }).click()
    await expect(p.getByRole('heading', { name: title })).toBeVisible()
    await p.getByRole('button', { name: 'Submit report' }).click()
    await expect(p.locator('.heading .badge')).toHaveText('In review')
    p = await as('ben')
    await p.getByRole('button', { name: title }).click()
    await p.getByLabel('Reason for return').fill('Please attach the train receipt.')
    await p.getByRole('button', { name: 'Return for changes' }).click()
    await expect(p.getByRole('heading', { name: 'Approvals' })).toBeVisible()
    p = await as('alice')
    if (live) await p.getByRole('button', { name: '← My reports' }).click()
    await p.getByRole('button', { name: title }).click()
    await expect(p.locator('.reason')).toContainText('train receipt')
    await p.getByRole('button', { name: 'Edit report' }).click()
    await p.getByLabel('Amount (JPY)').fill('22500')
    await p.getByRole('button', { name: 'Save report' }).click()
    await p.locator('#receipt').setInputFiles({
      name: 'train-receipt.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6V0AAAAASUVORK5CYII=',
        'base64',
      ),
    })
    await expect(p.getByRole('button', { name: 'train-receipt.png' })).toBeVisible()
    await p.getByRole('button', { name: 'Submit report' }).click()
    await expect(p.locator('.heading .badge')).toHaveText('In review')
    p = await as('ben')
    await p.getByRole('button', { name: title }).click()
    const download = p.waitForEvent('download')
    await p.getByRole('button', { name: 'train-receipt.png' }).click()
    expect((await download).suggestedFilename()).toBe('train-receipt.png')
    await p.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(p.getByRole('heading', { name: 'Approvals' })).toBeVisible()
    p = await as('chika')
    await p.getByRole('button', { name: title }).click()
    await p.getByLabel('Payment reference').fill('AP-SENDAI-0169')
    await p.getByRole('button', { name: 'Record reimbursement' }).click()
    await p.getByRole('button', { name: title }).click()
    await expect(p.locator('.heading .badge')).toHaveText('Reimbursed')
    await expect(p.locator('.total')).toContainText('¥22,500')
    await expect(p.locator('.history')).toContainText('AP-SENDAI-0169')
    await p.getByRole('button', { name: '日本語' }).click()
    await expect(p.locator('.heading .badge')).toHaveText('精算済み')
    await p.setViewportSize({ width: 390, height: 844 })
    expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})
test('list, keyboard search and mobile layout', async ({ page }) => {
  test.skip(live, 'preview interaction')
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'My reports' })).toBeVisible()
  if (process.env.EXPENSE_SCREENSHOTS)
    await page.screenshot({ path: '/private/tmp/expense-list.png' })
  const guide = page.locator('.demo-guide')
  await expect(guide.locator('p').first()).toBeHidden()
  await guide.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(guide).toContainText('Q4 design workshop')
  await expect(guide.locator('p').first()).toBeVisible()
  await page.keyboard.press('Enter')
  await page.getByLabel('Search reports').fill('Osaka')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('Search reports').fill('')
  await page.getByRole('button', { name: '日本語' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: '自分の申請' })).toBeVisible()
  await page.getByText('経費の申請から精算までを試す', { exact: true }).click()
  await expect(guide.locator('p').last()).toContainText('Chika')
  await expect(guide.locator('p').last()).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  if (process.env.EXPENSE_SCREENSHOTS) {
    await page.screenshot({ path: '/private/tmp/expense-mobile.png' })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: '/private/tmp/expense-dark.png' })
  }
})

test('a reopened report keeps its data and a stale editor cannot replace the newer revision', async ({
  page,
  context,
}) => {
  test.skip(live, 'uses one isolated browser demo database')
  await page.goto('./')
  await page.getByRole('button', { name: 'Osaka customer visit' }).click()
  await expect(page).toHaveURL(/#report\//)
  const second = await context.newPage()
  await second.goto(page.url())
  await expect(second.getByRole('heading', { name: 'Osaka customer visit' })).toBeVisible()
  for (const p of [page, second]) await p.getByRole('button', { name: 'Edit report' }).click()
  await page.getByLabel('Report title').fill('Osaka visit with the research team')
  await page.getByRole('button', { name: 'Save report' }).click()
  await expect(
    page.getByRole('heading', { name: 'Osaka visit with the research team' }),
  ).toBeVisible()
  await second.getByLabel('Report title').fill('Old title')
  await second.getByRole('button', { name: 'Save report' }).click()
  await expect(second.getByRole('alert')).toContainText('This report changed')
  await second.reload()
  await expect(
    second.getByRole('heading', { name: 'Osaka visit with the research team' }),
  ).toBeVisible()
})
