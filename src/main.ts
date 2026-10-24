import './styles/main.css'
import { Audio } from './engine/audio'
import { I18n } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import type { Game } from './game/game'
import { TouchControls } from './ui/touch'
import { Ui } from './ui/ui'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()

  const i18n = new I18n('en')
  const input = new Input(canvas)
  const audio = new Audio()
  let game: Game | undefined
  let lockLostAt = 0

  const applySettings = (d: SaveData) => {
    input.sensitivity = d.sensitivity
    input.invertY = d.invertY
    audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted)
    if (game) game.reducedMotion = d.reducedMotion
  }

  const startRun = (tutorial: boolean) => {
    if (!game) return
    audio.unlock()
    audio.startMusic()
    game.start(tutorial)
    input.setGameActive(true)
    if (tutorial) save.update({ tutorialDone: true })
    ui.show('hud')
    loop.resetAccumulator()
    input.lockPointer()
  }
  const pause = () => {
    if (game?.mode !== 'playing') return
    game.pause()
    input.setGameActive(false)
    ui.show('pause')
    input.unlockPointer()
  }
  const resume = () => {
    if (game?.mode !== 'paused') return
    game.resume()
    input.setGameActive(true)
    ui.show('hud')
    loop.resetAccumulator()
    input.lockPointer()
  }

  const ui = new Ui(i18n, save, audio, input, {
    play: () => startRun(!save.data.tutorialDone),
    restart: () => startRun(false),
    resume,
    quit: () => {
      audio.stopMusic()
      game?.toTitle()
      input.setGameActive(false)
      ui.show('title')
      input.unlockPointer()
    },
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch)
      applySettings(save.data)
      if (patch.locale) i18n.set(patch.locale)
      if (qualityChanged) game?.setQuality(save.data.quality)
      if (patch.untimedMode !== undefined && game) game.timer.setUntimed(patch.untimedMode)
    },
  })
  ui.show('boot')
  applySettings(save.data)

  // Boot: the UI above is already on screen; three.js, Rapier (WASM) and the game load as a
  // separate chunk behind the progress bar. Preload models/textures here too (engine/assets.ts).
  let loaded = 0
  const track = <T>(p: Promise<T>): Promise<T> => p.then(v => (ui.setBootProgress(0.1 + (++loaded / 4) * 0.9), v))
  ui.setBootProgress(0.1)
  const [{ Game }, { Renderer, suggestQuality }, physics] = await Promise.all([
    track(import('./game/game')),
    track(import('./engine/renderer')),
    track(import('./engine/physics')),
    track(document.fonts.ready),
  ])
  await physics.initPhysics()
  if (firstRun) {
    save.update({ quality: suggestQuality() })
    ui.refreshSettings()
  }

  const renderer = new Renderer(canvas, save.data.quality)
  renderer.setAutoReduceCallback(newQuality => {
    save.update({ quality: newQuality })
    applySettings(save.data)
    game?.setQuality(newQuality)
    ui.refreshSettings()
  })

  // Dev-only FPS & Draw-call Performance Overlay (Toggle with ` or F3)
  const statsEl = document.createElement('div')
  statsEl.style.cssText = 'position:fixed;bottom:10px;right:10px;padding:6px 10px;background:rgba(0,48,73,0.88);color:#fdf0d5;font-family:monospace;font-size:11px;border-radius:4px;border:1px solid rgba(253,240,213,0.3);z-index:9999;pointer-events:none;display:none;'
  document.body.appendChild(statsEl)
  let statsVisible = false
  window.addEventListener('keydown', e => {
    if (e.key === '`' || e.key === 'F3') {
      statsVisible = !statsVisible
      statsEl.style.display = statsVisible ? 'block' : 'none'
    }
  })

  game = new Game(renderer, input, audio)
  game.reducedMotion = save.data.reducedMotion
  game.timer.setUntimed(save.data.untimedMode)
  game.onComplete = remainingTime => {
    input.setGameActive(false)
    input.unlockPointer()
    ui.showCompletion(remainingTime)
  }
  let ignorePointerLockChangeUntil = 0

  game.onOpenPuzzle = puzzle => {
    ignorePointerLockChangeUntil = performance.now() + 800
    input.unlockPointer()
    ui.openPuzzle(puzzle, g.perspective)
  }
  game.onPlayerMoved = () => {
    if (ui.isPuzzleOpen) {
      ui.closePuzzle()
    }
  }
  ui.onPuzzleSolved = puzzleId => {
    game?.onPuzzleSolved(puzzleId)
  }
  ui.onPuzzleClosed = () => {
    ignorePointerLockChangeUntil = performance.now() + 800
    if (game?.mode === 'puzzle') {
      game.resume()
    }
    input.setGameActive(true)
    input.lockPointer()
  }
  if (import.meta.env.DEV) {
    const [{ registerGameTuning }, { tuning }] = await Promise.all([
      import('../scripts/manus-tuning/adapter.js'), import('./game/tuning'),
    ])
    await registerGameTuning(tuning)
  }
  const g = game

  const loop = new GameLoop({
    step: dt => g.step(dt),
    render: (alpha, frameSeconds) => {
      input.update()
      if (input.consume('pause') && performance.now() - lockLostAt > 300) {
        if (g.mode === 'playing') pause()
        else if (g.mode === 'paused' && ui.screen === 'pause') resume()
      }
      ui.frame(frameSeconds)
      loop.paused = g.mode === 'paused'
      g.render(alpha, frameSeconds)
      if (statsVisible) {
        const info = renderer.gl.info
        statsEl.innerText = `FPS: ${Math.round(1 / Math.max(0.001, frameSeconds))} | Calls: ${info.render.calls} | Tris: ${info.render.triangles}`
      }
      if (g.mode === 'playing') ui.updateStudioHud(g.focusedTarget, g.note, g.helpVisible, g.perspective, g.timer.formatted, g.currentObjective)
    },
  })
  loop.start()

  document.addEventListener('pointerlockchange', () => {
    if (performance.now() < ignorePointerLockChangeUntil) return
    // Browsers release pointer lock on Escape without delivering the key: treat that as pause.
    if (!document.pointerLockElement && g.mode === 'playing' && !ui.isPuzzleOpen && input.method === 'keyboard') {
      lockLostAt = performance.now()
      pause()
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
  })
  window.addEventListener('game:pause', pause)
  window.addEventListener('click', e => {
    if (g.mode === 'playing' && !ui.isPuzzleOpen) {
      const target = e.target as HTMLElement | null
      if (!target?.closest('button, input, select, textarea, [data-nav]')) {
        input.lockPointer()
      }
    }
  })
  new TouchControls(document.getElementById('ui')!, input, () => g.mode === 'playing')

  window.setTimeout(() => ui.show('title'), 250)
  // Debug/test hook (read-only use): smoke tests inspect run state through it.
  ;(window as unknown as { __game: unknown }).__game = { game: g, ui, input, save }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

boot().catch(err => {
  console.error(err)
  const el = document.getElementById('ui')
  if (el) el.innerHTML = `<div class="fatal">Failed to start: ${String((err as Error)?.message ?? err).replace(/[<>&]/g, '')}</div>`
})
