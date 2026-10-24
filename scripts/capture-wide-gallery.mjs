import { chromium } from 'playwright'

async function run() {
  const launchArgs = ['--ignore-gpu-blocklist', '--enable-webgl']
  const browser = await chromium.launch({ args: launchArgs }).catch(async () => chromium.launch({ args: launchArgs, channel: 'msedge' }))
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  await page.goto('http://localhost:4173')
  await page.waitForFunction(() => document.querySelector('.screen-boot')?.classList.contains('is-active') === false, undefined, { timeout: 10000 })

  await page.getByRole('button', { name: 'Enter the studio' }).click()
  await page.waitForFunction(() => window.__game?.game?.mode === 'playing', undefined, { timeout: 10000 })
  await page.waitForTimeout(1000)

  // Wide gallery wall panorama from Z = 3.6
  await page.evaluate(() => {
    const g = window.__game.game
    g.player.reset({ x: 0, y: 0.72, z: 3.8 })
    g.player.yaw = Math.PI // Face South (+Z)
    g.player.pitch = 0.0
  })
  await page.waitForTimeout(600)
  await page.screenshot({ path: '.work/previews/28-gallery-wide-panorama.png' })
  console.log('Saved .work/previews/28-gallery-wide-panorama.png')

  await browser.close()
}

run().catch(console.error)
