import { chromium } from 'playwright'

async function run() {
  const launchArgs = ['--ignore-gpu-blocklist', '--enable-webgl']
  const browser = await chromium.launch({ args: launchArgs }).catch(async () => chromium.launch({ args: launchArgs, channel: 'msedge' }))
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  // Track any console errors
  const consoleErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  console.log('1. Navigating to preview server...')
  await page.goto('http://localhost:4173')
  await page.waitForFunction(() => document.querySelector('.screen-boot')?.classList.contains('is-active') === false, undefined, { timeout: 10000 })

  // Enter studio
  await page.getByRole('button', { name: 'Enter the studio' }).click()
  await page.waitForFunction(() => window.__game?.game?.mode === 'playing', undefined, { timeout: 10000 })
  await page.waitForTimeout(1000)

  // 1. Deliverable: Entrance looking towards Mixing Bench (Jack - Standard Trichromatic)
  await page.screenshot({ path: '.work/previews/deliverable-jack-standard.png' })
  console.log('   Saved .work/previews/deliverable-jack-standard.png')

  // 2. Deliverable: Same view in John's perspective (Deuteranopia Simulation)
  await page.keyboard.press('Tab')
  await page.waitForTimeout(600)
  await page.screenshot({ path: '.work/previews/deliverable-john-deuteranopia.png' })
  console.log('   Saved .work/previews/deliverable-john-deuteranopia.png')

  // 3. Switch back to Jack and look at the Gallery Wall
  await page.keyboard.press('Tab')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const g = window.__game.game
    g.player.reset({ x: 0, y: 0.72, z: 4.0 })
    g.player.yaw = Math.PI // Face South (+Z)
    g.player.pitch = 0.0
  })
  await page.waitForTimeout(600)
  await page.screenshot({ path: '.work/previews/deliverable-gallery-jack.png' })
  console.log('   Saved .work/previews/deliverable-gallery-jack.png')

  // 4. Gallery wall in John's perspective
  await page.keyboard.press('Tab')
  await page.waitForTimeout(600)
  await page.screenshot({ path: '.work/previews/deliverable-gallery-john.png' })
  console.log('   Saved .work/previews/deliverable-gallery-john.png')

  // 5. Daylight Windows and Value Easel
  await page.keyboard.press('Tab')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const g = window.__game.game
    g.player.reset({ x: -1.2, y: 0.72, z: 2.2 })
    g.player.yaw = -Math.PI / 2 - 0.25 // Face West
    g.player.pitch = -0.05
  })
  await page.waitForTimeout(600)
  await page.screenshot({ path: '.work/previews/deliverable-windows-and-easel.png' })
  console.log('   Saved .work/previews/deliverable-windows-and-easel.png')

  console.log(`Console error count: ${consoleErrors.length}`)
  if (consoleErrors.length > 0) {
    console.error('Console errors:', consoleErrors)
  }

  await browser.close()
}

run().catch(console.error)
