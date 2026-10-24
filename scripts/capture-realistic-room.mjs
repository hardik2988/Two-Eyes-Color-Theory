import { chromium } from 'playwright'

async function run() {
  const launchArgs = ['--ignore-gpu-blocklist', '--enable-webgl']
  const browser = await chromium.launch({ args: launchArgs }).catch(async () => chromium.launch({ args: launchArgs, channel: 'msedge' }))
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  console.log('1. Navigating to preview server...')
  await page.goto('http://localhost:4173')
  await page.waitForFunction(() => document.querySelector('.screen-boot')?.classList.contains('is-active') === false, undefined, { timeout: 10000 })

  // Enter studio
  await page.getByRole('button', { name: 'Enter the studio' }).click()
  await page.waitForFunction(() => window.__game?.game?.mode === 'playing', undefined, { timeout: 10000 })
  await page.waitForTimeout(1000)

  // 1. Initial view facing North towards Vault, mixing bench, crates
  await page.screenshot({ path: '.work/previews/24-realistic-studio-north.png' })
  console.log('   Saved .work/previews/24-realistic-studio-north.png')

  // 2. Turn around and look at South Gallery Wall (Installation 03)
  await page.evaluate(() => {
    const g = window.__game.game
    g.player.reset({ x: 0, y: 0.72, z: 5.4 })
    g.player.yaw = Math.PI // Face South (+Z)
    g.player.pitch = -0.05
  })
  await page.waitForTimeout(600)
  await page.screenshot({ path: '.work/previews/25-realistic-gallery-wall.png' })
  console.log('   Saved .work/previews/25-realistic-gallery-wall.png')

  // 3. Close up on Paintings and Curator Lectern
  await page.evaluate(() => {
    const g = window.__game.game
    g.player.reset({ x: -1.2, y: 0.72, z: 5.8 })
    g.player.yaw = Math.PI - 0.15
    g.player.pitch = 0.05
  })
  await page.waitForTimeout(600)
  await page.screenshot({ path: '.work/previews/26-paintings-close.png' })
  console.log('   Saved .work/previews/26-paintings-close.png')

  // 4. View of Value Easel and West Windows
  await page.evaluate(() => {
    const g = window.__game.game
    g.player.reset({ x: -1.5, y: 0.72, z: 2.0 })
    g.player.yaw = -Math.PI / 2 - 0.2 // Look West
    g.player.pitch = -0.08
  })
  await page.waitForTimeout(600)
  await page.screenshot({ path: '.work/previews/27-value-easel-and-windows.png' })
  console.log('   Saved .work/previews/27-value-easel-and-windows.png')

  await browser.close()
  console.log('Done capturing photorealistic screenshots!')
}

run().catch(console.error)
