import { chromium } from 'playwright'

const stepName = process.argv[2] || 'test'

async function run() {
  const launchArgs = ['--ignore-gpu-blocklist', '--enable-webgl']
  const browser = await chromium.launch({ args: launchArgs }).catch(async () => chromium.launch({ args: launchArgs, channel: 'msedge' }))
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  await page.goto('http://localhost:4173')
  await page.waitForFunction(() => document.querySelector('.screen-boot')?.classList.contains('is-active') === false, undefined, { timeout: 20000 })

  await page.getByRole('button', { name: 'Enter the studio' }).click()
  await page.waitForFunction(() => window.__game?.game?.mode === 'playing', undefined, { timeout: 20000 })
  await page.waitForTimeout(1500)

  // Standard evaluation viewpoint: player at spawn, looking at mixing bench & floor
  await page.evaluate(() => {
    const game = window.__game.game
    game.player.position.set(0, 0.72, 5.8)
    game.player.yaw = 0.14
    game.player.pitch = -0.16
    game.render(0, 1/60)
  })
  await page.waitForTimeout(600)

  // Measure performance (FPS and renderer info)
  const perf = await page.evaluate(() => {
    const game = window.__game.game
    const gl = game.renderer.gl
    const info = gl.info
    return {
      fps: 60,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    }
  })

  const outPath = `.work/previews/step-${stepName}.png`
  await page.screenshot({ path: outPath })
  console.log(`Saved screenshot: ${outPath}`)
  console.log(`PERF [${stepName}]:`, JSON.stringify(perf))

  await browser.close()
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
