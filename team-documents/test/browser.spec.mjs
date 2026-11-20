import { test, expect } from '@playwright/test'
test('publish, switch teams, revoke and trace in the same browser session', async ({ page }) => {
  await page.goto('./')
  const account = async (person) => {
    await page.locator('#person').selectOption(person)
    await page.locator('#enter').click()
  }
  const open = async (id, status) => {
    await page.locator('#ref').fill(id)
    await page.locator('#open button').click()
    await expect(page.locator('#status')).toContainText('HTTP ' + status)
  }
  await account('ben')
  await open('launch-notes', 403)
  await account('alice')
  await open('launch-notes', 200)
  await page.locator('#publish').click()
  await expect(page.locator('#version')).toContainText('Published')
  await account('ben')
  await open('launch-notes', 200)
  await account('chika')
  await open('launch-notes', 403)
  await page.locator('#panel summary').click()
  await page.locator('[name=person]').selectOption('chika')
  await page.locator('[name=role]').selectOption('none')
  await page.locator('[name=reason]').fill('Access review')
  await page.locator('#change button').click()
  await expect(page.locator('#events')).toContainText('Access review')
  await open('forecast', 403)
  await page.locator('#locale').click()
  await expect(page.locator('h1')).toHaveText('チームの文書')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
