// Stage 3 browser smoke test: `pnpm build` must have completed first.
// Covers the retained site tabs, one-scene Aria/Kai transition, shader, studio interactions,
// collision-aware movement, mobile controls and browser/runtime errors.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const externalUrl = process.env.SMOKE_URL?.replace(/\/?$/, '/')
const url = externalUrl ?? `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? '.work/previews'
mkdirSync(out, { recursive: true })
let server
let browser
const guard = setTimeout(() => fail('timed out'), 120_000)

function cleanup() {
  clearTimeout(guard)
  try { server?.kill('SIGTERM') } catch {}
}
async function fail(message) {
  console.error(`smoke: FAIL — ${message}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('production preview server did not start')
}
async function openGame(context, errors) {
  const page = await context.newPage()
  page.on('console', message => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', error => errors.push(String(error)))
  page.on('response', response => response.status() >= 400 && errors.push(`HTTP ${response.status()} ${response.url()}`))
  await page.goto(url)
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 30_000 })
  await page.waitForFunction(() => document.documentElement.lang === 'en' && document.querySelector('#ui')?.dataset.activeScreen === 'title')
  await page.evaluate(async () => {
    await document.fonts.ready
    const display = getComputedStyle(document.querySelector('.logo-text')).fontFamily
    const body = getComputedStyle(document.querySelector('.site-nav .site-tab')).fontFamily
    if (!/georgia|times new roman/i.test(display)) throw new Error(`Unexpected serif display font: ${display}`)
    if (!body.includes('ManusCC0')) throw new Error(`Unexpected body font: ${body}`)
    if (![...document.fonts].some(face => face.family.replaceAll('"', '').replaceAll("'", '') === 'ManusCC0' && face.status === 'loaded')) {
      throw new Error('Bundled ManusCC0 body font did not load')
    }
  })
  await page.waitForTimeout(450)
  return page
}
async function selectTab(page, key) {
  await page.locator(`.site-nav .site-tab[data-site-tab="${key}"]`).click()
  await page.waitForFunction(value => {
    const section = document.querySelector(`[data-site-page="${value}"]`)
    return document.querySelector('#ui')?.dataset.siteTab === value
      && section
      && getComputedStyle(section).visibility === 'visible'
      && Number(getComputedStyle(section).opacity) > 0.95
  }, key, { timeout: 5_000 })
  const text = await page.locator(`[data-site-page="${key}"] h1`).innerText()
  if (!text.trim()) throw new Error(`${key} tab has no visible page heading`)
  console.log(`smoke: ${key} tab active`)
}
async function enterStudio(page, useTouch = false) {
  const enter = page.getByRole('button', { name: 'Enter the studio' })
  if (useTouch) {
    const bounds = await enter.boundingBox()
    if (!bounds) throw new Error('mobile start button has no visible bounds')
    await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  } else await enter.click()
  await page.waitForFunction(() => window.__game?.game?.mode === 'playing' && document.querySelector('[data-screen="hud"]')?.classList.contains('is-active'), undefined, { timeout: 10_000 })
  await page.waitForTimeout(200)
  const canvas = await page.locator('#game').evaluate(element => ({ width: element.width, height: element.height, webgl: Boolean(element.getContext('webgl2')) }))
  if (!canvas.width || !canvas.height || !canvas.webgl) throw new Error(`The Three.js canvas did not initialize: ${JSON.stringify(canvas)}`)
  console.log('smoke: entered first-person studio')
}

try {
  if (!externalUrl) server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: false })
  await waitForServer()
  const launchArgs = ['--ignore-gpu-blocklist', '--enable-webgl']
  browser = await chromium.launch({ args: launchArgs }).catch(async () => chromium.launch({ args: launchArgs, channel: 'msedge' }).catch(() => chromium.launch({ args: launchArgs, channel: 'chrome' })))
  const errors = []

  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' })
  const page = await openGame(desktop, errors)
  await page.screenshot({ path: `${out}/11-stage2-title-desktop.png` })
  await selectTab(page, 'learn')
  if (!(await page.locator('[data-site-page="learn"] h1').innerText()).includes('relationship')) throw new Error('Learn page copy did not load')
  await selectTab(page, 'colour')
  if (!(await page.locator('[data-site-page="colour"] h1').innerText()).includes('colour')) throw new Error('Colour Blind page copy did not load')
  await selectTab(page, 'play')

  await page.getByRole('button', { name: 'Controls' }).click()
  await page.waitForFunction(() => document.querySelector('.preview-dialog')?.hidden === false)
  const guide = await page.locator('.preview-dialog').innerText()
  if (!guide.includes('same studio') || (!guide.includes('switch sibling view') && !guide.includes('switch brother view')) || (!guide.includes('examine') && !guide.includes('interact'))) throw new Error('Stage 3 controls briefing is incomplete')
  await page.screenshot({ path: `${out}/12-stage2-controls-desktop.png` })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.querySelector('.preview-dialog')?.hidden === true)

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.waitForSelector('[data-screen="settings"].is-active')
  if (await page.locator('.seg[data-setting="quality"] button').count() !== 4) throw new Error('Low/Medium/High/Ultra settings are not all present')
  await page.locator('.seg[data-setting="quality"] [data-value="low"]').click()
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="title"].is-active')
  await enterStudio(page)
  const sceneUuid = await page.evaluate(() => window.__game.game.sceneUuid)
  const ariaCamera = await page.evaluate(() => window.__game.game.camera.position.toArray())
  const ariaState = await page.evaluate(() => ({ perspective: window.__game.game.perspective, strength: window.__game.game.visionStrength, passes: window.__game.game.visionPassCount }))
  if ((ariaState.perspective !== 'jack' && ariaState.perspective !== 'aria') || ariaState.strength > 0.01 || ariaState.passes !== 1) throw new Error(`Jack view did not start cleanly: ${JSON.stringify(ariaState)}`)
  const ariaHud = await page.locator('.studio-vision').innerText()
  if (!ariaHud.includes('JACK') && !ariaHud.includes('ARIA')) throw new Error('The HUD does not identify Jack as the active brother')
  await page.screenshot({ path: `${out}/17-stage3-aria-desktop.png` })
  await page.keyboard.press('Tab')
  await page.waitForFunction(() => (window.__game.game.perspective === 'john' || window.__game.game.perspective === 'kai') && window.__game.game.visionStrength > 0.98, undefined, { timeout: 8_000 })
  const kaiState = await page.evaluate(() => ({ sceneUuid: window.__game.game.sceneUuid, camera: window.__game.game.camera.position.toArray(), strength: window.__game.game.visionStrength, passes: window.__game.game.visionPassCount }))
  if (kaiState.sceneUuid !== sceneUuid || kaiState.passes !== 1) throw new Error(`John view changed the scene or duplicated its shader pass: ${JSON.stringify(kaiState)}`)
  if (Math.hypot(...kaiState.camera.map((value, i) => value - ariaCamera[i])) < 0.12) throw new Error('The sibling switch did not move the camera viewpoint')
  const kaiHud = await page.locator('.studio-vision').innerText()
  if (!kaiHud.includes('JOHN') && !kaiHud.includes('KAI')) throw new Error('The HUD did not announce John after switching')
  await page.screenshot({ path: `${out}/18-stage3-kai-desktop.png` })
  await page.keyboard.press('Tab')
  await page.waitForFunction(() => (window.__game.game.perspective === 'jack' || window.__game.game.perspective === 'aria') && window.__game.game.visionStrength < 0.01, undefined, { timeout: 8_000 })
  if (await page.evaluate(() => window.__game.game.sceneUuid) !== sceneUuid) throw new Error('Switching back to Jack replaced the continuous room scene')
  console.log('smoke: Jack/John switch, shader blend, camera offset and single-scene identity verified at Low')
  await page.waitForFunction(() => document.querySelector('.studio-interact')?.hidden === false, undefined, { timeout: 8_000 })
  const target = await page.locator('.studio-interact').innerText()
  if (!target.includes('Paint tins')) throw new Error(`Opening camera did not focus the shape-coded paint tins: ${target}`)
  await page.screenshot({ path: `${out}/13-stage2-studio-desktop.png` })
  await page.keyboard.press('e')
  await page.waitForFunction(() => (document.querySelector('.studio-note')?.textContent ?? '').includes('circle, triangle, square and diamond'), { timeout: 5_000 })
  await page.screenshot({ path: `${out}/14-stage2-examine-desktop.png` })

  await page.keyboard.press('h')
  await page.waitForFunction(() => window.__game.game.helpVisible === false)
  await page.keyboard.press('h')
  await page.waitForFunction(() => window.__game.game.helpVisible === true)
  const beforeForward = await page.evaluate(() => window.__game.game.playerPosition.z)
  await page.keyboard.down('w')
  await page.waitForTimeout(900)
  await page.keyboard.up('w')
  const afterForward = await page.evaluate(() => window.__game.game.playerPosition.z)
  if (beforeForward - afterForward < 0.4) throw new Error(`WASD forward movement did not move into the room (${beforeForward} -> ${afterForward})`)
  const beforeWall = await page.evaluate(() => window.__game.game.playerPosition.z)
  await page.keyboard.down('s')
  await page.waitForTimeout(2_100)
  await page.keyboard.up('s')
  const afterWall = await page.evaluate(() => window.__game.game.playerPosition.z)
  if (afterWall > 7.35 || afterWall < beforeWall) throw new Error(`Rapier did not hold the player inside the rear studio wall (${beforeWall} -> ${afterWall})`)
  console.log(`smoke: movement and wall collision verified (rear wall stop at z=${afterWall.toFixed(2)})`)

  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.waitForSelector('[data-screen="settings"].is-active')
  await page.locator('.seg[data-setting="quality"] [data-value="high"]').click()
  await page.getByRole('button', { name: 'Back' }).click()
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.getByRole('button', { name: 'Resume' }).click()
  await page.waitForFunction(() => window.__game.game.mode === 'playing')
  await page.keyboard.press('Tab')
  await page.waitForFunction(() => (window.__game.game.perspective === 'john' || window.__game.game.perspective === 'kai') && window.__game.game.visionStrength > 0.98, undefined, { timeout: 8_000 })
  const highState = await page.evaluate(() => ({ sceneUuid: window.__game.game.sceneUuid, strength: window.__game.game.visionStrength, passes: window.__game.game.visionPassCount }))
  if (highState.sceneUuid !== sceneUuid || highState.passes !== 1) throw new Error(`The High-quality John pipeline did not retain its one-scene/one-pass state: ${JSON.stringify(highState)}`)
  await page.screenshot({ path: `${out}/19-stage3-kai-high-desktop.png` })
  console.log('smoke: John shader verified after changing from Low to High quality')
  await desktop.close()

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' })
  const phonePage = await openGame(phone, errors)
  await selectTab(phonePage, 'play')
  const layout = await phonePage.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, buttonBottom: document.querySelector('[data-action="play"]').getBoundingClientRect().bottom, height: innerHeight }))
  if (layout.width > layout.viewport + 1) throw new Error(`horizontal overflow on mobile (${layout.width}px > ${layout.viewport}px)`)
  if (layout.buttonBottom > layout.height) throw new Error('mobile start button begins below the visible viewport')
  await phonePage.screenshot({ path: `${out}/15-stage2-play-mobile.png`, fullPage: true })
  await enterStudio(phonePage, true)
  if (!(await phonePage.locator('.touch-stick').isVisible()) || !(await phonePage.locator('[data-touch="interact"]').isVisible())) throw new Error('mobile joystick or examine button is not visible')
  if (!(await phonePage.locator('[data-touch="vision"]').isVisible())) throw new Error('mobile VIEW sibling-switch button is not visible')
  const phoneSceneUuid = await phonePage.evaluate(() => window.__game.game.sceneUuid)
  await phonePage.locator('[data-touch="vision"]').click()
  await phonePage.waitForFunction(() => (window.__game.game.perspective === 'john' || window.__game.game.perspective === 'kai') && window.__game.game.visionStrength > 0.98, undefined, { timeout: 8_000 })
  if (await phonePage.evaluate(() => window.__game.game.sceneUuid) !== phoneSceneUuid) throw new Error('mobile sibling switch replaced the continuous room')
  await phonePage.screenshot({ path: `${out}/20-stage3-kai-mobile.png`, fullPage: true })
  await phonePage.locator('[data-touch="vision"]').click()
  await phonePage.waitForFunction(() => (window.__game.game.perspective === 'jack' || window.__game.game.perspective === 'aria') && window.__game.game.visionStrength < 0.01, undefined, { timeout: 8_000 })
  await phonePage.locator('[data-touch="interact"]').click()
  await phonePage.waitForFunction(() => (document.querySelector('.studio-note')?.textContent ?? '').includes('circle, triangle, square and diamond'))
  await phonePage.locator('[data-touch="hint"]').click()
  await phonePage.waitForFunction(() => window.__game.game.helpVisible === false)
  const beforeTouchMove = await phonePage.evaluate(() => window.__game.game.playerPosition.z)
  const touchPoint = { x: 120, y: 700, id: 42 }
  await phonePage.evaluate(({ x, y, id }) => {
    const canvas = document.querySelector('#game')
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }))
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y - 34 }))
  }, touchPoint)
  await phonePage.waitForTimeout(350)
  const afterTouchMove = await phonePage.evaluate(() => window.__game.game.playerPosition.z)
  await phonePage.evaluate(({ x, y, id }) => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y - 34 })), touchPoint)
  if (beforeTouchMove - afterTouchMove < 0.2) throw new Error(`mobile joystick did not move the player (${beforeTouchMove} -> ${afterTouchMove})`)
  await phonePage.screenshot({ path: `${out}/16-stage2-studio-mobile.png`, fullPage: true })
  await phone.close()

  if (errors.length) throw new Error(`console/browser errors:\n  ${errors.join('\n  ')}`)
  await browser.close()
  cleanup()
  console.log(`smoke: OK — Stage 3 perspective switch, shader, room, movement, collision and mobile controls (${externalUrl ? 'Session Preview' : 'production preview'}); screenshots in ${out}/`)
} catch (error) {
  await fail(error?.message ?? String(error))
}
