import { chromium } from 'playwright'

async function debug() {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await browser.newPage()
  await page.goto('http://localhost:4173')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Enter the studio' }).click()
  await page.waitForTimeout(1000)
  await page.keyboard.press('e')
  await page.waitForSelector('#puzzle-overlay:not(.is-hidden)')
  await page.locator('.pigment-card').filter({ hasText: 'Ultramarine' }).click()
  await page.locator('.pigment-card').filter({ hasText: 'Cadmium Lemon' }).click()
  await page.locator('[data-action="puzzle-submit"]').click()
  await page.waitForTimeout(500)
  await page.locator('[data-action="puzzle-submit"]').click()
  await page.waitForTimeout(500)

  const state = await page.evaluate(() => ({
    mode: window.__game.game.mode,
    gameActive: window.__game.input.gameActive,
    method: window.__game.input.method,
    beforeYaw: window.__game.game.player.yaw
  }))
  console.log('State after close:', state)

  await page.evaluate(() => {
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 120, movementY: 0, bubbles: true }))
  })
  await page.waitForTimeout(100)

  const afterState = await page.evaluate(() => ({
    look: window.__game.input.look,
    afterYaw: window.__game.game.player.yaw
  }))
  console.log('After dispatch:', afterState)
  await browser.close()
}

debug().catch(console.error)
