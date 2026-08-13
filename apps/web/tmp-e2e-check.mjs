import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3000'
const PASSWORD = 'TestPassw0rd!123'

function log(step, detail = '') {
  console.log(`\n=== ${step} ===${detail ? ' ' + detail : ''}`)
}

function wireDiagnostics(page, label) {
  page.on('console', (msg) => console.log(`[${label} console:${msg.type()}]`, msg.text()))
  page.on('pageerror', (err) => console.log(`[${label} pageerror]`, err.message))
  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.status() >= 400) {
      console.log(`[${label} http ${res.status()}]`, res.url())
    }
  })
}

async function loginAs(browser, email, label) {
  const context = await browser.newContext()
  const page = await context.newPage()
  wireDiagnostics(page, label)
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL(`${BASE}/dashboard`, { timeout: 15000 })
  return { context, page }
}

const browser = await chromium.launch()

try {
  log('Owner logs in')
  const owner = await loginAs(browser, 'claude-test-owner@example.com', 'owner')
  console.log('Owner reached dashboard:', owner.page.url())

  log('Owner sets up player profile')
  await owner.page.goto(`${BASE}/profile/edit`)
  await owner.page.getByLabel('Display name').fill('Claude Test Owner')
  await owner.page.getByRole('button', { name: 'Save' }).click()
  await owner.page.waitForSelector('text=Saved.', { timeout: 10000 })
  console.log('Owner profile saved')

  log('Owner creates a club')
  await owner.page.goto(`${BASE}/create-club`)
  await owner.page.waitForLoadState('networkidle')
  await owner.page.getByLabel('Name').fill('Claude Test Club 3')
  await owner.page.waitForTimeout(300)
  console.log('name value:', await owner.page.getByLabel('Name').inputValue())
  console.log('slug value:', await owner.page.getByLabel('Slug').inputValue())
  await owner.page.getByRole('button', { name: 'Create club' }).click()
  await owner.page.waitForTimeout(2000)
  const errorLocator = owner.page.locator('p[role="alert"]')
  if (await errorLocator.count()) {
    console.log('Create-club error message on page:', await errorLocator.textContent())
  }
  console.log('Current URL after create attempt:', owner.page.url())

  if (!/\/clubs\//.test(owner.page.url())) {
    throw new Error('Club creation did not navigate to a club page; see diagnostics above.')
  }

  const clubUrl = owner.page.url()
  console.log('Club created:', clubUrl)

  await owner.page.waitForSelector('text=Members', { timeout: 10000 })
  console.log('Owner sees roster:', await owner.page.locator('li').allTextContents())

  log('Member logs in')
  const member = await loginAs(browser, 'claude-test-member@example.com', 'member')
  console.log('Member reached dashboard:', member.page.url())

  log('Member sets up player profile')
  await member.page.goto(`${BASE}/profile/edit`)
  await member.page.getByLabel('Display name').fill('Claude Test Member')
  await member.page.getByRole('button', { name: 'Save' }).click()
  await member.page.waitForSelector('text=Saved.', { timeout: 10000 })
  console.log('Member profile saved')

  log('Member requests to join the club')
  await member.page.goto(clubUrl)
  await member.page.getByRole('button', { name: 'Request to join' }).click()
  await member.page.waitForSelector('text=Request sent', { timeout: 10000 })
  console.log('Join request sent')

  log('Owner approves the request')
  await owner.page.goto(clubUrl)
  await owner.page.waitForSelector('text=pending', { timeout: 10000 })
  await owner.page.getByRole('button', { name: 'Approve' }).click()
  await owner.page.waitForTimeout(1000)
  console.log('Owner roster after approval:', await owner.page.locator('li').allTextContents())

  log('Member confirms active membership and leaves')
  await member.page.goto(clubUrl)
  await member.page.waitForSelector('text=active', { timeout: 10000 })
  console.log('Member roster view:', await member.page.locator('li').allTextContents())
  await member.page.getByRole('button', { name: 'Leave club' }).click()
  await member.page.waitForTimeout(1000)
  console.log('Member left. Owner roster after leave:')
  await owner.page.reload()
  await owner.page.waitForSelector('text=Members', { timeout: 10000 })
  console.log(await owner.page.locator('li').allTextContents())

  log('ALL STEPS COMPLETED SUCCESSFULLY')
} catch (err) {
  console.error('\n!!! FAILED !!!')
  console.error(err)
  process.exitCode = 1
} finally {
  await browser.close()
}
