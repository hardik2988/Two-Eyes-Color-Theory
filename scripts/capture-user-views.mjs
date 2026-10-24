import { chromium } from 'playwright'

async function run() {
  const launchArgs = ['--ignore-gpu-blocklist', '--enable-webgl']
  const browser = await chromium.launch({ args: launchArgs }).catch(async () => chromium.launch({ args: launchArgs, channel: 'msedge' }))
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  console.log('1. Navigating to preview server...')
  await page.goto('http://localhost:4173')
  await page.waitForFunction(() => document.querySelector('.screen-boot')?.classList.contains('is-active') === false, undefined, { timeout: 10000 })

  await page.getByRole('button', { name: 'Enter the studio' }).click()
  await page.waitForFunction(() => window.__game?.game?.mode === 'playing', undefined, { timeout: 10000 })
  await page.waitForTimeout(1500)

  // 1. User View 1: Cardboard Box stack and Ficus plant near mixing bench
  await page.evaluate(() => {
    const game = window.__game.game
    // Position player to see the stack at (-1.8, 3.6)
    game.player.position.set(-0.4, 0.72, 2.6)
    game.player.yaw = -2.1
    game.player.pitch = -0.1
    game.render(0, 1/60)
  })
  await page.waitForTimeout(600)
  await page.screenshot({ path: '.work/previews/fixed-user-boxes-and-plant-1.png' })
  console.log('   Saved .work/previews/fixed-user-boxes-and-plant-1.png')

  // 2. User View 2: Southeast corner plant and wooden crate
  await page.evaluate(() => {
    const game = window.__game.game
    // Position player to see the tropical plant at (7.2, 5.8)
    game.player.position.set(5.5, 0.72, 4.4)
    game.player.yaw = 0.8
    game.player.pitch = -0.05
    game.render(0, 1/60)
  })
  await page.waitForTimeout(600)
  await page.screenshot({ path: '.work/previews/fixed-user-corner-plant-2.png' })
  console.log('   Saved .work/previews/fixed-user-corner-plant-2.png')

  await browser.close()
  console.log('✓ Successfully captured user comparison views!')
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
