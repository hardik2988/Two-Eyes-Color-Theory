import { chromium } from 'playwright'

async function run() {
  const launchArgs = ['--ignore-gpu-blocklist', '--enable-webgl']
  const browser = await chromium.launch({ args: launchArgs }).catch(async () => chromium.launch({ args: launchArgs, channel: 'msedge' }).catch(() => chromium.launch({ args: launchArgs, channel: 'chrome' })))
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()

  console.log('1. Navigating to preview server...')
  await page.goto('http://localhost:4173')
  await page.waitForFunction(() => document.querySelector('.screen-boot')?.classList.contains('is-active') === false, undefined, { timeout: 10000 })
  console.log('   Boot screen cleared.')

  // Enter studio
  const enterBtn = page.getByRole('button', { name: 'Enter the studio' })
  await enterBtn.click()
  await page.waitForFunction(() => window.__game?.game?.mode === 'playing', undefined, { timeout: 10000 })
  console.log('2. Entered Studio. Starting puzzle validation...')

  // LEVEL 1: Subtractive Paint Mixing
  console.log('3. Validating Level 1: Paint Mixing Bench...')
  // Wait for interaction prompt to acquire the paint tins
  await page.waitForFunction(() => document.querySelector('.studio-interact')?.hidden === false, undefined, { timeout: 8000 })
  const promptText = await page.locator('.studio-interact').innerText()
  console.log(`   Focused target: ${promptText.replace(/\n/g, ' ')}`)

  await page.keyboard.press('e')
  await page.waitForSelector('#puzzle-overlay:not(.is-hidden)', { timeout: 5000 })
  const titleL1 = await page.locator('.puzzle-title').innerText()
  console.log(`   Workbench opened: "${titleL1}"`)

  // Select Ultramarine and Cadmium Lemon
  await page.locator('.pigment-card').filter({ hasText: 'Ultramarine' }).click()
  await page.locator('.pigment-card').filter({ hasText: 'Cadmium Lemon' }).click()
  
  // Submit solution
  await page.locator('[data-action="puzzle-submit"]').click()
  await page.waitForSelector('.puzzle-feedback:not([hidden])')
  const fb1 = await page.locator('.puzzle-feedback').innerText()
  console.log(`   Level 1 Result: "${fb1}"`)

  // Verify progression: level 1 is solved
  const l1Solved = await page.evaluate(() => window.__game.game.puzzles.paintMixing.isComplete)
  if (!l1Solved) throw new Error('Level 1 failed to register as solved!')
  console.log('   ✓ Level 1 (Paint Mixing) solved and recorded!')

  // Click "Proceed to Next Station →" to close workbench and return to studio
  await page.locator('[data-action="puzzle-submit"]').click()
  await page.waitForFunction(() => document.querySelector('#puzzle-overlay')?.classList.contains('is-hidden'))

  // Verify that mouse is not stuck and can view 360 degrees
  const beforeYaw = await page.evaluate(() => window.__game.game.player.yaw)
  await page.evaluate(() => {
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 120, movementY: 0, bubbles: true }))
    window.__game.game.render(0, 1 / 60)
  })
  await page.waitForTimeout(60)
  const afterYaw = await page.evaluate(() => window.__game.game.player.yaw)
  const isPlaying = await page.evaluate(() => window.__game.game.mode === 'playing')
  if (!isPlaying) throw new Error('Game was paused unexpectedly after closing installation 1!')
  if (Math.abs(afterYaw - beforeYaw) < 0.05) throw new Error(`Mouse look is stuck after installation 1 (${beforeYaw} -> ${afterYaw})!`)
  console.log(`   ✓ 360° Mouse look verified active after Installation 1 (${beforeYaw.toFixed(2)} -> ${afterYaw.toFixed(2)})`)

  // Check objective banner updated to Station 2
  const obj2 = await page.locator('.hud-objective-text').innerText()
  console.log(`   HUD Objective updated to: "${obj2}"`)

  // LEVEL 2: Value Easel
  console.log('4. Validating Level 2: Value Easel...')
  await page.evaluate(() => {
    const easel = window.__game.game.world.targets.find(t => t.id === 'value-station')
    window.__game.game.focusedTarget = easel
    window.__game.game.examine()
  })
  await page.waitForSelector('#puzzle-overlay:not(.is-hidden)', { timeout: 5000 })
  const titleL2 = await page.locator('.puzzle-title').innerText()
  console.log(`   Workbench opened: "${titleL2}"`)

  // Select Tone (which matches 48% luminance of the reference)
  await page.locator('.value-card').filter({ hasText: 'Tone' }).click()
  await page.locator('[data-action="puzzle-submit"]').click()
  await page.waitForSelector('.puzzle-feedback:not([hidden])')
  const fb2 = await page.locator('.puzzle-feedback').innerText()
  console.log(`   Level 2 Result: "${fb2}"`)

  const l2Solved = await page.evaluate(() => window.__game.game.puzzles.value.isComplete)
  if (!l2Solved) throw new Error('Level 2 failed to register as solved!')
  console.log('   ✓ Level 2 (Value Easel) solved and recorded!')

  await page.locator('[data-action="puzzle-close"]').click()
  await page.waitForFunction(() => document.querySelector('#puzzle-overlay')?.classList.contains('is-hidden'))

  // Check objective banner updated to Station 3
  const obj3 = await page.locator('.hud-objective-text').innerText()
  console.log(`   HUD Objective updated to: "${obj3}"`)

  // LEVEL 3: Harmony Gallery Wall
  console.log('5. Validating Level 3: Harmony Gallery Wall...')
  await page.evaluate(() => {
    const gallery = window.__game.game.world.targets.find(t => t.id === 'harmonies')
    window.__game.game.focusedTarget = gallery
    window.__game.game.examine()
  })
  await page.waitForSelector('#puzzle-overlay:not(.is-hidden)', { timeout: 5000 })
  const titleL3 = await page.locator('.puzzle-title').innerText()
  console.log(`   Workbench opened: "${titleL3}"`)

  // Arrange into target order: mono, analogous, comp, split
  await page.evaluate(() => {
    const p = window.__game.game.puzzles.harmonies
    p.paintings.find(x => x.harmonyType === 'monochromatic').slot = 0
    p.paintings.find(x => x.harmonyType === 'analogous').slot = 1
    p.paintings.find(x => x.harmonyType === 'complementary').slot = 2
    p.paintings.find(x => x.harmonyType === 'split-complementary').slot = 3
  })
  await page.locator('[data-action="puzzle-submit"]').click()
  await page.waitForSelector('.puzzle-feedback:not([hidden])')
  const fb3 = await page.locator('.puzzle-feedback').innerText()
  console.log(`   Level 3 Result: "${fb3}"`)

  const l3Solved = await page.evaluate(() => window.__game.game.puzzles.harmonies.isComplete)
  if (!l3Solved) throw new Error('Level 3 failed to register as solved!')
  console.log('   ✓ Level 3 (Gallery Wall) solved and recorded!')

  await page.locator('[data-action="puzzle-close"]').click()
  await page.waitForFunction(() => document.querySelector('#puzzle-overlay')?.classList.contains('is-hidden'))

  // Check objective banner updated to Station 4
  const obj4 = await page.locator('.hud-objective-text').innerText()
  console.log(`   HUD Objective updated to: "${obj4}"`)

  // LEVEL 4: Final Exhibition Vault
  console.log('6. Validating Level 4: Final Vault Door...')
  await page.evaluate(() => {
    const vault = window.__game.game.world.targets.find(t => t.id === 'vault-door')
    window.__game.game.focusedTarget = vault
    window.__game.game.examine()
  })
  await page.waitForSelector('#puzzle-overlay:not(.is-hidden)', { timeout: 5000 })
  const titleL4 = await page.locator('.puzzle-title').innerText()
  console.log(`   Workbench opened: "${titleL4}"`)

  // Enter code 4 8 2 9
  await page.locator('.vault-key[data-key="4"]').click()
  await page.locator('.vault-key[data-key="8"]').click()
  await page.locator('.vault-key[data-key="2"]').click()
  await page.locator('.vault-key[data-key="9"]').click()

  await page.locator('[data-action="puzzle-submit"]').click()
  await page.waitForSelector('.puzzle-feedback:not([hidden])')
  const fb4 = await page.locator('.puzzle-feedback').innerText()
  console.log(`   Level 4 Result: "${fb4}"`)

  const l4Solved = await page.evaluate(() => window.__game.game.puzzles.vault.isComplete)
  if (!l4Solved) throw new Error('Level 4 failed to register as solved!')
  console.log('   ✓ Level 4 (Vault Door) solved and recorded!')

  // Click proceed / wait for completion modal
  await page.locator('[data-action="puzzle-submit"]').click()
  await page.waitForSelector('[data-screen="results"].is-active', { timeout: 5000 })
  const quote = await page.locator('.completion-quote').innerText()
  console.log(`7. Exhibition Climax Screen Active! Ending Quote: "${quote}"`)

  await page.screenshot({ path: '.work/previews/21-full-gameplay-completion.png' })
  console.log('   ✓ Saved completion screenshot to .work/previews/21-full-gameplay-completion.png')

  await browser.close()
  console.log('SUCCESS: All 4 levels verified end-to-end!')
}

run().catch(err => {
  console.error('Verification failed:', err)
  process.exit(1)
})
