import { chromium } from 'playwright'

async function test() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
    console.log(`[browser ${msg.type()}]`, msg.text())
  })
  page.on('pageerror', err => {
    errors.push(err.message)
    console.error('[pageerror]', err)
  })

  console.log('Navigating to http://localhost:4173...')
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  console.log('Console errors count:', errors.length)
  await browser.close()
  if (errors.length > 0) {
    process.exit(1)
  }
}

test().catch(err => {
  console.error(err)
  process.exit(1)
})
