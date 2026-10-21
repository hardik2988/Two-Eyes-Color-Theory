import type { Audio } from '../engine/audio'
import type { I18n } from '../engine/i18n'
import type { Input } from '../engine/input'
import { insertScore, type Locale, type Quality, type SaveData, type SaveStore } from '../engine/save'
import { CONFIG } from '../game/config'
import type { Compass, Hint } from '../game/game'
import type { Perspective } from '../game/first-person'
import { formatClock, stars, type RunState } from '../game/rules'
import type { IPuzzle } from '../game/puzzles/types'
import { PaintMixingPuzzle, STUDIO_PIGMENTS, mixPigments } from '../game/puzzles/paint-mixing'
import { ValuePuzzle } from '../game/puzzles/value-puzzle'
import { HarmonyPuzzle } from '../game/puzzles/harmony-puzzle'
import { VaultPuzzle } from '../game/puzzles/vault-puzzle'

export type Screen = 'boot' | 'title' | 'hud' | 'pause' | 'settings' | 'leaderboard' | 'results' | 'puzzle'

export type UiActions = {
  play(): void
  resume(): void
  restart(): void
  quit(): void
  settings(patch: Partial<SaveData>): void
  puzzleAction?(action: string, payload?: unknown): void
  closePuzzle?(): void
}

const ICON = {
  core: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1 21 12 12 23 3 12Z" fill="currentColor"/><path d="M12 1 21 12H3Z" fill="#fff" opacity=".35"/></svg>',
  cell: '<svg viewBox="0 0 20 30" aria-hidden="true"><rect x="6" y="0" width="8" height="4" rx="1.5" fill="currentColor"/><rect x="1.5" y="4" width="17" height="25" rx="4" fill="none" stroke="currentColor" stroke-width="3"/><rect class="fill" x="5" y="8" width="10" height="17" rx="2" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6Z" fill="currentColor"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 20 12 15 4 20Z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor"/><rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor"/></svg>',
}

/** Glyphs for control hints, per input method. */
const GLYPH = {
  keyboard: { keys: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', jump: '<kbd class="wide">Space</kbd>', dash: '<kbd>F</kbd>', select: '<kbd>Enter</kbd>', back: '<kbd>Esc</kbd>' },
  gamepad: { keys: '<kbd class="round">L</kbd>', stickR: '<kbd class="round">R</kbd>', jump: '<kbd class="round a">A</kbd>', dash: '<kbd class="round x">X</kbd>', select: '<kbd class="round a">A</kbd>', back: '<kbd class="round b">B</kbd>' },
}

/**
 * DOM game UI: title, HUD, pause, settings, results and leaderboard as HTML/CSS layered over the
 * canvas. Every screen is keyboard-, gamepad- and touch-navigable; text comes from i18n keys and
 * re-renders on language change.
 */
export class Ui {
  screen: Screen = 'boot'
  private readonly root: HTMLElement
  private readonly stack: Screen[] = []
  private hudCache = new Map<string, string>()
  private hintKey: Hint | null = null
  private navRepeat = 0
  private lastRun?: RunState
  private savedRank = -1
  private stormShown = false
  private lastMethod = ''
  private activePerspective: Perspective = 'jack'

  constructor(
    private readonly i18n: I18n,
    private readonly save: SaveStore,
    private readonly audio: Audio,
    private readonly input: Input,
    private readonly actions: UiActions,
  ) {
    this.root = document.getElementById('ui')!
    this.root.innerHTML = this.template()
    this.root.dataset.siteTab = 'play'
    this.root.addEventListener('click', e => this.onClick(e))
    this.root.addEventListener('click', e => this.onSiteClick(e))
    this.root.addEventListener('input', e => this.onInput(e))
    this.root.addEventListener('focusin', e => {
      if ((e.target as HTMLElement).matches('.btn, .seg button, .toggle')) this.audio.play('ui')
    })
    window.addEventListener('keydown', e => this.onKey(e))
    i18n.onChange(() => this.translate())
    this.translate()
    this.refreshSettings()
  }

  // ─── screens ────────────────────────────────────────────────────────────

  show(screen: Screen): void {
    this.stack.length = 0
    this.setScreen(screen)
  }

  showCompletion(remainingFormatted: string): void {
    const timeEl = this.root.querySelector<HTMLElement>('.modal-completion .r-time')
    if (timeEl) timeEl.textContent = remainingFormatted
    this.show('results')
  }

  /** Open an overlay screen (settings, leaderboard) that returns to the current one on Back. */
  push(screen: Screen): void {
    this.stack.push(this.screen)
    this.setScreen(screen)
  }

  back(): void {
    if (this.isPuzzleOpen) {
      this.closePuzzle()
      return
    }
    const prev = this.stack.pop()
    if (prev) this.setScreen(prev)
    else if (this.screen === 'pause') this.actions.resume()
  }

  activePuzzle: IPuzzle | null = null
  onPuzzleSolved?: (puzzleId: string) => void
  onPuzzleClosed?: () => void

  get isPuzzleOpen(): boolean {
    const overlay = this.root.querySelector<HTMLElement>('#puzzle-overlay')
    return Boolean(overlay && !overlay.classList.contains('is-hidden') && this.activePuzzle)
  }

  openPuzzle(puzzle: IPuzzle, perspective: Perspective): void {
    this.activePuzzle = puzzle
    this.activePerspective = perspective
    this.renderPuzzleDialog()
    const overlay = this.q<HTMLElement>('#puzzle-overlay')
    if (overlay) overlay.classList.remove('is-hidden')
    document.exitPointerLock?.()
  }

  closePuzzle(): void {
    this.activePuzzle = null
    const overlay = this.q<HTMLElement>('#puzzle-overlay')
    if (overlay) overlay.classList.add('is-hidden')
    this.actions.resume()
    this.onPuzzleClosed?.()
  }

  private setScreen(screen: Screen): void {
    this.screen = screen
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-screen]')) {
      const active = el.dataset.screen === screen || (el.dataset.screen === 'hud' && (screen === 'pause' || screen === 'results' || (screen === 'settings' && this.stack.includes('pause'))))
      el.classList.toggle('is-active', active)
      el.setAttribute('aria-hidden', String(!active))
    }
    this.root.dataset.activeScreen = screen
    if (screen === 'title') this.renderBest()
    if (screen === 'leaderboard') this.renderLeaderboard()
    if (screen === 'hud') this.stormShown = false
    // Focus the first control so keyboard and gamepad players can act immediately.
    requestAnimationFrame(() => {
      const first = this.navItems()[0]
      if (first && this.input.method !== 'touch') first.focus({ preventScroll: true })
      else (document.activeElement as HTMLElement | null)?.blur?.()
    })
  }

  setBootProgress(progress: number): void {
    const bar = this.q<HTMLElement>('.boot-bar i')
    bar.style.transform = `scaleX(${Math.max(0.04, Math.min(1, progress))})`
  }

  updateStudioHud(
    target: { label: string; detail: string } | null,
    note: string,
    showControls: boolean,
    perspective: Perspective,
    timerFormatted?: string,
    objectiveText?: string,
  ): void {
    this.activePerspective = perspective
    const view = this.q<HTMLElement>('.studio-vision')
    if (view && view.dataset.view !== perspective) {
      view.dataset.view = perspective
      view.setAttribute('aria-label', this.i18n.t(`studio.vision.${perspective}`))
    }
    const prompt = this.q<HTMLElement>('.studio-interact')
    if (prompt) {
      prompt.hidden = target === null
      if (target) this.q('.studio-interact-label').textContent = target.label
    }
    const help = this.q<HTMLElement>('.studio-controls')
    if (help) help.hidden = !showControls
    const notice = this.q<HTMLElement>('.studio-note')
    if (notice) {
      notice.hidden = !note
      if (notice.textContent !== note) notice.textContent = note
    }
    if (timerFormatted) {
      const clock = this.root.querySelector<HTMLElement>('.hud-timer-clock')
      if (clock && clock.textContent !== timerFormatted) clock.textContent = timerFormatted
    }
    if (objectiveText) {
      const objEl = this.root.querySelector<HTMLElement>('.hud-objective-text')
      if (objEl && objEl.textContent !== objectiveText) objEl.textContent = objectiveText
      const studioObjP = this.root.querySelector<HTMLElement>('.studio-objective p')
      if (studioObjP && studioObjP.textContent !== objectiveText) studioObjP.textContent = objectiveText
    }
  }

  // ─── HUD ────────────────────────────────────────────────────────────────

  updateHud(run: RunState, compass: Compass | null): void {
    this.set('cores', `${run.collected}<small>/${run.total}</small>`)
    this.set('score', run.score.toLocaleString(this.i18n.locale))
    this.set('clock', formatClock(run.timeLeft))
    const low = run.timeLeft <= CONFIG.drones.rageAt
    this.q('.hud-clock').classList.toggle('is-low', low)
    if (low && !this.stormShown && run.phase === 'playing') {
      this.stormShown = true
      this.banner(this.i18n.t('hud.storm'))
    }
    const cells = this.q('.hud-cells')
    if (cells.childElementCount !== CONFIG.run.lives) {
      cells.innerHTML = `<span class="hud-cell">${ICON.cell}</span>`.repeat(CONFIG.run.lives)
    }
    for (const [i, cell] of this.qa('.hud-cell').entries()) cell.classList.toggle('is-empty', i >= run.lives)

    const combo = this.q('.hud-combo')
    combo.classList.toggle('is-active', run.combo > 1)
    if (run.combo > 1) {
      if (this.set('combo', `×${run.combo}`)) {
        combo.classList.remove('pop')
        void combo.offsetWidth
        combo.classList.add('pop')
      }
      this.q<HTMLElement>('.hud-combo-bar i').style.transform = `scaleX(${run.comboTimer / CONFIG.score.comboWindow})`
    }

    const compassEl = this.q<HTMLElement>('.hud-compass')
    compassEl.classList.toggle('is-hidden', !compass)
    if (compass) {
      this.q<HTMLElement>('.hud-compass-arrow').style.transform = `rotate(${-compass.angle}rad)`
      this.set('distance', this.i18n.t('hud.nearest', { m: Math.round(compass.distance) }))
      compassEl.dataset.rise = compass.rise > 2 ? 'up' : compass.rise < -2 ? 'down' : ''
    }
  }

  popup(text: string, at: { x: number; y: number }, kind: 'score' | 'hurt'): void {
    const el = document.createElement('div')
    el.className = `popup popup-${kind}`
    el.textContent = text
    el.style.left = `${at.x}px`
    el.style.top = `${at.y}px`
    this.q('.popups').append(el)
    el.addEventListener('animationend', () => el.remove())
  }

  hurt(): void {
    const v = this.q('.hurt-vignette')
    v.classList.remove('flash')
    void (v as HTMLElement).offsetWidth
    v.classList.add('flash')
  }

  hint(hint: Hint | null): void {
    this.hintKey = hint
    this.renderHint()
  }

  private renderHint(): void {
    const el = this.root.querySelector<HTMLElement>('.hint')
    if (!el) return
    const hint = this.hintKey
    if (!hint) {
      el.classList.remove('is-active')
      return
    }
    const method = this.input.method
    const glyph = method === 'gamepad' ? GLYPH.gamepad : GLYPH.keyboard
    const key = hint === 'cores' ? 'hint.cores' : `hint.${hint}.${method === 'touch' && hint === 'look' ? 'keyboard' : method}`
    const vars = { keys: glyph.keys, stick: hint === 'look' ? GLYPH.gamepad.stickR : GLYPH.gamepad.keys, key: hint === 'dash' ? glyph.dash : glyph.jump }
    el.querySelector('span')!.innerHTML = this.i18n.t(key, vars)
    el.classList.add('is-active')
  }

  private banner(text: string): void {
    const el = this.q('.banner')
    el.textContent = text
    el.classList.remove('show')
    void (el as HTMLElement).offsetWidth
    el.classList.add('show')
  }

  // ─── results ────────────────────────────────────────────────────────────

  showResults(run: RunState): void {
    this.lastRun = run
    this.savedRank = -1
    const won = run.phase === 'won'
    const el = this.q('[data-screen="results"]')
    el.classList.toggle('is-won', won)
    const titleKey = won ? 'results.won' : run.loseReason === 'time' ? 'results.lost.time' : 'results.lost.lives'
    this.q('.results-title').setAttribute('data-i18n', titleKey)
    const n = stars(run)
    for (const [i, s] of this.qa('.results-stars .star').entries()) {
      s.classList.toggle('is-on', i < n)
      ;(s as HTMLElement).style.animationDelay = `${0.35 + i * 0.22}s`
    }
    const coreScore = run.score - run.timeBonus - run.lifeBonus
    const fmt = (v: number) => v.toLocaleString(this.i18n.locale)
    this.q('.r-cores').textContent = `${run.collected} / ${run.total}`
    this.q('.r-core-score').textContent = fmt(coreScore)
    this.q('.r-time').textContent = formatClock(run.elapsed)
    this.q('.r-time-bonus').textContent = `+${fmt(run.timeBonus)}`
    this.q('.r-life-bonus').textContent = `+${fmt(run.lifeBonus)}`
    this.q('.r-total').textContent = fmt(run.score)
    const best = this.save.data.leaderboard[0]?.score ?? 0
    this.q('.results-best').classList.toggle('is-active', !run.unranked && run.score > best && run.score > 0)
    const form = this.q('.results-save')
    form.classList.toggle('is-hidden', run.unranked || run.score <= 0 || insertScore(this.save.data.leaderboard, this.entry(run)).rank < 0)
    form.classList.remove('is-saved')
    this.q<HTMLInputElement>('.results-name').value = this.save.data.playerName
    this.q('.results-rank').textContent = ''
    this.translate()
    this.show('results')
  }

  private entry(run: RunState) {
    return { name: this.q<HTMLInputElement>('.results-name')?.value.trim().slice(0, 16) || this.save.data.playerName, score: run.score, seconds: Math.round(run.elapsed), at: Date.now() }
  }

  private saveScore(): void {
    if (!this.lastRun || this.lastRun.unranked || this.savedRank >= 0) return
    const entry = this.entry(this.lastRun)
    const { board, rank } = insertScore(this.save.data.leaderboard, entry)
    this.save.update({ leaderboard: board, playerName: entry.name })
    this.savedRank = rank
    this.q('.results-save').classList.add('is-saved')
    this.q('.results-rank').textContent = rank >= 0 ? this.i18n.t('results.rank', { rank: rank + 1 }) : ''
    this.audio.play('ui')
  }

  private renderLeaderboard(): void {
    const list = this.q('.board')
    const board = this.save.data.leaderboard
    if (board.length === 0) {
      list.innerHTML = `<li class="board-empty">${this.i18n.t('leaderboard.empty')}</li>`
      return
    }
    list.innerHTML = board
      .map((e, i) => `<li class="${i === this.savedRank ? 'is-me' : ''}"><b>${i + 1}</b><span class="board-name"></span><span>${formatClock(e.seconds)}</span><em>${e.score.toLocaleString(this.i18n.locale)}</em></li>`)
      .join('')
    // Names are player-entered text: assign via textContent, never innerHTML.
    list.querySelectorAll('.board-name').forEach((el, i) => (el.textContent = board[i].name))
  }

  private renderBest(): void {
    const best = this.save.data.leaderboard[0]?.score ?? 0
    const el = this.q('.title-best')
    el.classList.toggle('is-hidden', best <= 0)
    el.textContent = this.i18n.t('menu.best', { score: best.toLocaleString(this.i18n.locale) })
  }

  // ─── settings ───────────────────────────────────────────────────────────

  /** Re-read the save into the Settings controls (call after changing settings outside the UI). */
  refreshSettings(): void {
    const d = this.save.data
    this.q<HTMLInputElement>('[name="musicVolume"]').value = String(d.musicVolume)
    this.q<HTMLInputElement>('[name="sfxVolume"]').value = String(d.sfxVolume)
    this.q<HTMLInputElement>('[name="sensitivity"]').value = String(d.sensitivity)
    for (const t of this.qa<HTMLButtonElement>('.toggle')) {
      const on = d[t.dataset.setting as 'muted' | 'invertY' | 'reducedMotion' | 'untimedMode'] === true
      t.setAttribute('aria-pressed', String(on))
      t.querySelector('span')!.setAttribute('data-i18n', on ? 'settings.on' : 'settings.off')
    }
    for (const b of this.qa<HTMLButtonElement>('.seg button')) {
      const key = b.parentElement!.dataset.setting as 'quality' | 'locale'
      const current = key === 'locale' ? this.i18n.locale : d.quality
      b.setAttribute('aria-pressed', String(b.dataset.value === current))
    }
    for (const r of this.qa<HTMLInputElement>('input[type="range"]')) r.style.setProperty('--fill', `${((Number(r.value) - Number(r.min)) / (Number(r.max) - Number(r.min))) * 100}%`)
    this.translate()
  }

  // ─── events ─────────────────────────────────────────────────────────────

  private onClick(e: MouseEvent): void {
    // Interactive Puzzle Controls Routing
    const pigmentBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-pigment]')
    if (pigmentBtn && this.activePuzzle instanceof PaintMixingPuzzle) {
      const pid = pigmentBtn.dataset.pigment!
      this.activePuzzle.selectPigment(pid)
      this.audio.play('paint')
      this.renderPuzzleDialog()
      return
    }

    const clearBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-action="clear-palette"]')
    if (clearBtn && this.activePuzzle instanceof PaintMixingPuzzle) {
      this.activePuzzle.clearSelection()
      this.audio.play('ui')
      this.renderPuzzleDialog()
      return
    }

    const valueBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-sample]')
    if (valueBtn && this.activePuzzle instanceof ValuePuzzle) {
      const sid = valueBtn.dataset.sample!
      this.activePuzzle.selectSample(sid)
      this.audio.play('frame')
      this.renderPuzzleDialog()
      return
    }

    const swapBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-swap-dir]')
    if (swapBtn && this.activePuzzle instanceof HarmonyPuzzle) {
      const dir = Number(swapBtn.dataset.swapDir)
      const slot = Number(swapBtn.dataset.slot)
      const targetSlot = slot + dir
      if (targetSlot >= 0 && targetSlot <= 3) {
        const p1 = this.activePuzzle.paintings.find(p => p.slot === slot)
        const p2 = this.activePuzzle.paintings.find(p => p.slot === targetSlot)
        if (p1 && p2) {
          p1.slot = targetSlot
          p2.slot = slot
          this.audio.play('frame')
          this.renderPuzzleDialog()
        }
      }
      return
    }

    const vaultBtn = (e.target as HTMLElement).closest<HTMLElement>('.vault-key')
    if (vaultBtn && this.activePuzzle instanceof VaultPuzzle) {
      const key = vaultBtn.dataset.key!
      if (key === 'clear') this.activePuzzle.clearKey()
      else if (key === 'backspace') this.activePuzzle.deleteKey()
      else this.activePuzzle.pressKey(key)
      this.audio.play('ui')
      this.renderPuzzleDialog()
      return
    }

    const puzzleCloseBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-action="puzzle-close"]')
    if (puzzleCloseBtn) {
      this.closePuzzle()
      return
    }

    const puzzleSubmitBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-action="puzzle-submit"]')
    if (puzzleSubmitBtn) {
      this.testPuzzleSolution()
      return
    }

    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action], .toggle, .seg button')
    if (!target) return
    this.audio.unlock()
    if (target.matches('.toggle')) {
      const key = target.dataset.setting as 'muted' | 'invertY' | 'reducedMotion' | 'untimedMode'
      this.actions.settings({ [key]: !this.save.data[key] })
      this.refreshSettings()
      this.audio.play('ui')
      return
    }
    if (target.matches('.seg button')) {
      const key = target.parentElement!.dataset.setting
      if (key === 'quality') this.actions.settings({ quality: target.dataset.value as Quality })
      if (key === 'locale') this.actions.settings({ locale: target.dataset.value as Locale })
      this.refreshSettings()
      this.audio.play('ui')
      return
    }
    const action = target.dataset.action
    switch (action) {
      case 'play': this.actions.play(); break
      case 'resume': this.actions.resume(); break
      case 'restart': this.actions.restart(); break
      case 'quit': this.actions.quit(); break
      case 'settings': this.push('settings'); break
      case 'leaderboard': this.push('leaderboard'); break
      case 'back': this.back(); break
      case 'preview': {
        const dialog = this.q<HTMLElement>('.preview-dialog')
        dialog.hidden = false
        dialog.querySelector<HTMLButtonElement>('[data-preview-action="close"]')?.focus()
        break
      }
      case 'save-score': this.saveScore(); break
      case 'pause': window.dispatchEvent(new CustomEvent('game:pause')); break
    }
  }

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement
    if (el.type !== 'range') return
    el.style.setProperty('--fill', `${((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100}%`)
    this.actions.settings({ [el.name]: Number(el.value) } as Partial<SaveData>)
  }

  private onSiteClick(e: MouseEvent): void {
    const target = e.target as HTMLElement
    const tab = target.closest<HTMLButtonElement>('[data-site-tab]')
    if (tab) {
      const value = tab.dataset.siteTab
      if (!value) return
      this.root.dataset.siteTab = value
      for (const button of this.qa<HTMLButtonElement>('[data-site-tab]')) {
        button.setAttribute('aria-current', String(button === tab))
      }
      this.audio.play('ui')
      return
    }
    const action = target.closest<HTMLButtonElement>('[data-preview-action]')?.dataset.previewAction
    if (action === 'briefing') {
      const dialog = this.q<HTMLElement>('.preview-dialog')
      dialog.hidden = false
      dialog.querySelector<HTMLButtonElement>('[data-preview-action="close"]')?.focus()
    } else if (action === 'close') {
      this.q<HTMLElement>('.preview-dialog').hidden = true
    }
    if (action) this.audio.play('ui')
  }

  private onKey(e: KeyboardEvent): void {
    const dialog = this.root.querySelector<HTMLElement>('.preview-dialog')
    if (e.code === 'Escape' && dialog && !dialog.hidden) {
      e.preventDefault()
      dialog.hidden = true
      this.root.querySelector<HTMLButtonElement>('[data-preview-action="briefing"]')?.focus()
      return
    }
    if (this.screen === 'hud' || this.screen === 'boot') return
    const typing = (e.target as HTMLElement).matches?.('input[type="text"]')
    if ((e.code === 'Escape' || (e.code === 'Backspace' && !typing)) && this.screen !== 'title') {
      // The pause toggle in main.ts owns Escape on the pause screen itself.
      if (this.screen !== 'pause' && this.screen !== 'results') {
        e.preventDefault()
        // Escape is also the pause toggle; consume it so leaving Settings doesn't resume the run.
        this.input.consume('pause')
        this.back()
      }
      return
    }
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault()
      this.moveFocus(e.code === 'ArrowDown' ? 1 : -1)
    }
  }

  /** Per-frame gamepad menu navigation (keyboard uses native focus + onKey). */
  frame(frameSeconds: number): void {
    if (this.input.method !== this.lastMethod) {
      this.lastMethod = this.input.method
      this.renderPrompts()
      this.renderHint()
    }
    if (this.screen === 'hud' || this.screen === 'boot') return
    if (this.input.method !== 'gamepad') {
      this.input.consume('confirm')
      this.input.consume('back')
      return
    }
    const y = this.input.move.y
    const x = this.input.move.x
    this.navRepeat = Math.max(0, this.navRepeat - frameSeconds)
    const active = document.activeElement as HTMLElement | null
    if (Math.abs(y) > 0.6 && this.navRepeat <= 0) {
      this.moveFocus(y < 0 ? 1 : -1)
      this.navRepeat = 0.22
    } else if (Math.abs(x) > 0.6 && this.navRepeat <= 0 && active?.matches('input[type="range"]')) {
      const r = active as HTMLInputElement
      r.value = String(Number(r.value) + Math.sign(x) * Number(r.step || 0.1))
      r.dispatchEvent(new Event('input', { bubbles: true }))
      this.navRepeat = 0.12
    } else if (Math.abs(x) > 0.6 && this.navRepeat <= 0 && active?.parentElement?.matches('.seg')) {
      const sib = (Math.sign(x) > 0 ? active.nextElementSibling : active.previousElementSibling) as HTMLElement | null
      sib?.focus()
      this.navRepeat = 0.22
    } else if (Math.abs(y) < 0.3 && Math.abs(x) < 0.3) {
      this.navRepeat = 0
    }
    if (this.input.consume('confirm')) active?.click()
    if (this.input.consume('back') && this.screen !== 'title') this.back()
  }

  private navItems(): HTMLElement[] {
    const screen = this.q(`[data-screen="${this.screen}"]`)
    return [...screen.querySelectorAll<HTMLElement>('[data-nav]')].filter(el => el.offsetParent !== null && !el.closest('.is-hidden'))
  }

  private moveFocus(dir: 1 | -1): void {
    const items = this.navItems()
    if (items.length === 0) return
    // Buttons inside one segmented control count as a single row.
    const rows: HTMLElement[][] = []
    for (const el of items) {
      const seg = el.parentElement?.matches('.seg') ? el.parentElement : null
      const last = rows[rows.length - 1]
      if (seg && last && last[0].parentElement === seg) last.push(el)
      else rows.push([el])
    }
    const current = rows.findIndex(r => r.includes(document.activeElement as HTMLElement))
    const next = rows[(current + dir + rows.length) % rows.length]
    ;(next.find(el => el.getAttribute('aria-pressed') === 'true') ?? next[0]).focus()
  }

  // ─── helpers ────────────────────────────────────────────────────────────

  private translate(): void {
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = this.i18n.t(el.dataset.i18n!)
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-i18n-label]')) el.setAttribute('aria-label', this.i18n.t(el.dataset.i18nLabel!))
    for (const el of this.root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) el.placeholder = this.i18n.t(el.dataset.i18nPlaceholder!)
    const view = this.root.querySelector<HTMLElement>('.studio-vision')
    if (view) {
      view.dataset.view = this.activePerspective
      view.setAttribute('aria-label', this.i18n.t(`studio.vision.${this.activePerspective}`))
    }
    this.renderPrompts()
    this.renderHint()
    if (this.screen === 'title') this.renderBest()
    if (this.screen === 'leaderboard') this.renderLeaderboard()
    this.hudCache.clear()
    document.title = this.i18n.t('game.title')
  }

  /** Bottom-bar button prompts follow the active input method. */
  renderPrompts(): void {
    const g = this.input.method === 'gamepad' ? GLYPH.gamepad : GLYPH.keyboard
    const html = this.input.method === 'touch' ? '' : `<span>${g.select} ${this.i18n.t('prompt.select')}</span><span>${g.back} ${this.i18n.t('prompt.back')}</span>`
    for (const el of this.qa('.prompts')) el.innerHTML = html
  }

  /** Update a HUD text slot only when it changed; returns true if it did. */
  private set(slot: string, html: string): boolean {
    if (this.hudCache.get(slot) === html) return false
    this.hudCache.set(slot, html)
    this.q(`[data-slot="${slot}"]`).innerHTML = html
    return true
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.root.querySelector<T>(sel)!
  }

  private qa<T extends HTMLElement = HTMLElement>(sel: string): T[] {
    return [...this.root.querySelectorAll<T>(sel)]
  }

  private renderPuzzleDialog(): void {
    if (!this.activePuzzle) return
    const p = this.activePuzzle
    const kicker = this.q<HTMLElement>('.puzzle-kicker')
    const title = this.q<HTMLElement>('.puzzle-title')
    const desc = this.q<HTMLElement>('.puzzle-desc')
    const mount = document.getElementById('puzzle-mount')
    const submitBtn = this.q<HTMLButtonElement>('[data-action="puzzle-submit"]')

    if (kicker) kicker.textContent = p.subtitle
    if (title) title.textContent = p.title
    if (desc) desc.textContent = p.description
    if (submitBtn) {
      if (p.isComplete) {
        submitBtn.textContent = 'Proceed to Next Station →'
        submitBtn.classList.add('btn-success')
      } else {
        submitBtn.textContent = 'Test Solution'
        submitBtn.classList.remove('btn-success')
      }
    }

    if (!mount) return

    if (p.id === 'paint-mixing') {
      this.renderPaintMixingPuzzle(mount, p as PaintMixingPuzzle)
    } else if (p.id === 'value') {
      this.renderValuePuzzle(mount, p as ValuePuzzle)
    } else if (p.id === 'harmonies') {
      this.renderHarmonyPuzzle(mount, p as HarmonyPuzzle)
    } else if (p.id === 'vault') {
      this.renderVaultPuzzle(mount, p as VaultPuzzle)
    }
  }

  private renderPaintMixingPuzzle(mount: HTMLElement, puzzle: PaintMixingPuzzle): void {
    const pigments = STUDIO_PIGMENTS
    const currentMix = mixPigments(puzzle.selectedPigments)
    const isJohn = this.activePerspective === 'john'

    mount.innerHTML = `
      <div class="puzzle-perspective-banner">
        <span class="perspective-badge">OBSERVATION MODE: ${isJohn ? 'JOHN (DEUTERANOPE)' : 'JACK (TRICHROMAT)'}</span>
        <p class="perspective-tip">${isJohn 
          ? 'John detects shape marks (●, ▲, ■, ◆), reflectance brightness, and label codes.' 
          : 'Jack discriminates full-spectrum pigment hues: Blue, Yellow, Red, White.'}</p>
      </div>

      <div class="mixing-preview-row">
        <div class="preview-box">
          <span class="preview-box-label">Target Goal</span>
          <div class="preview-box-color" style="background: #15803d; color: #ffffff;">
            Viridian Leaf Green
          </div>
          <small style="font-size: 9.5px; color: var(--text-muted);">2 Primary Pigments</small>
        </div>
        <div class="preview-box">
          <span class="preview-box-label">Current Palette Mix</span>
          <div class="preview-box-color current-mix-color" style="background: ${currentMix.hex}; color: ${currentMix.rgb[1] > 0.6 || (currentMix.rgb[0] > 0.6 && currentMix.rgb[1] > 0.6) ? '#003049' : '#ffffff'};">
            ${currentMix.name}
          </div>
          <small class="mix-count-label" style="font-size: 9.5px; color: var(--text-muted);">${puzzle.selectedPigments.length} / 2 Pigments on Palette</small>
        </div>
      </div>

      <p class="mixing-prompt">Select canisters to add physical pigments to the mixing palette:</p>

      <div class="mixing-grid">
        ${pigments.map(p => {
          const isSelected = puzzle.selectedPigments.includes(p.id)
          return `
            <button type="button" class="pigment-card ${isSelected ? 'is-selected' : ''}" data-pigment="${p.id}">
              <div class="pigment-swatch" style="background: ${p.colorHex}; color: ${p.luminance < 0.6 ? '#ffffff' : '#1e242b'};">
                ${p.symbolChar}
              </div>
              <span class="pigment-name">${p.name}</span>
              <span class="pigment-symbol">${p.symbol.toUpperCase()} (${p.symbolChar})</span>
              <span class="pigment-lum">Value: ${(p.luminance * 100).toFixed(0)}%</span>
            </button>
          `
        }).join('')}
      </div>

      <div class="palette-btn-row">
        <button type="button" class="btn btn-small" data-action="clear-palette">Clear Palette</button>
      </div>

      <div class="puzzle-feedback" role="status" aria-live="polite" hidden></div>
    `
  }

  private renderValuePuzzle(mount: HTMLElement, puzzle: ValuePuzzle): void {
    const isJohn = this.activePerspective === 'john'
    const selected = puzzle.samples.find(s => s.id === puzzle.selectedSampleId)

    mount.innerHTML = `
      <div class="puzzle-perspective-banner">
        <span class="perspective-badge">OBSERVATION MODE: ${isJohn ? 'JOHN (DEUTERANOPE)' : 'JACK (TRICHROMAT)'}</span>
        <p class="perspective-tip">${isJohn
          ? 'John reads value contrast (luminance brightness). Tint, Tone, and Shade remain 100% distinguishable!'
          : 'Jack examines both saturation and luminance variation against the architectural study.'}</p>
      </div>

      <div class="mixing-preview-row">
        <div class="preview-box">
          <span class="preview-box-label">Reference Easel Study</span>
          <div class="preview-box-color" style="background: #475569; color: #ffffff;">
            Target: Muted Tone
          </div>
          <small style="font-size: 9.5px; color: var(--text-muted);">Target Luminance: 48% (Mid-Value)</small>
        </div>
        <div class="preview-box">
          <span class="preview-box-label">Your Selection</span>
          <div class="preview-box-color current-value-color" style="background: ${selected ? selected.hex : '#22252c'}; color: #ffffff;">
            ${selected ? selected.label : 'None Selected'}
          </div>
          <small style="font-size: 9.5px; color: var(--text-muted);">${selected ? `Luminance: ${(selected.luminance * 100).toFixed(0)}%` : 'Select a variation below'}</small>
        </div>
      </div>

      <!-- Luminance Ramp Comparator -->
      <div class="luminance-ramp-wrapper">
        <div class="luminance-ramp-header">
          <span>Luminance / Value Scale (John's Perception)</span>
          <span class="lum-match-badge">${selected ? (selected.type === 'tone' ? '✓ MATCH' : 'MISMATCH') : 'NO SELECTION'}</span>
        </div>
        <div class="luminance-ramp-bar">
          <div class="lum-marker lum-target" style="left: 48%;" title="Target: 48%">Target (48%)</div>
          ${selected ? `<div class="lum-marker lum-current" style="left: ${(selected.luminance * 100).toFixed(0)}%;">${selected.label}</div>` : ''}
        </div>
      </div>

      <p class="mixing-prompt">Select the variation matching the master reference study on the easel:</p>

      <div class="value-sample-grid">
        ${puzzle.samples.map(s => {
          const isSelected = s.id === puzzle.selectedSampleId
          return `
            <button type="button" class="value-card ${isSelected ? 'is-selected' : ''}" data-sample="${s.id}">
              <div class="value-swatch" style="background: ${s.hex};"></div>
              <div class="value-card-info">
                <strong>${s.label}</strong>
                <span>${s.description}</span>
                <small>Luminance: ${(s.luminance * 100).toFixed(0)}%</small>
              </div>
            </button>
          `
        }).join('')}
      </div>

      <div class="puzzle-feedback" role="status" aria-live="polite" hidden></div>
    `
  }

  private renderHarmonyPuzzle(mount: HTMLElement, puzzle: HarmonyPuzzle): void {
    const isJohn = this.activePerspective === 'john'
    const sorted = [...puzzle.paintings].sort((a, b) => a.slot - b.slot)

    mount.innerHTML = `
      <div class="puzzle-perspective-banner">
        <span class="perspective-badge">OBSERVATION MODE: ${isJohn ? 'JOHN (DEUTERANOPE)' : 'JACK (TRICHROMAT)'}</span>
        <p class="perspective-tip">${isJohn
          ? 'John detects geometric wheel angle marks and frame hatching symbols (▮, ≋, ↔, ▲).'
          : 'Jack verifies harmonic chord relationships across the 360° colour wheel.'}</p>
      </div>

      <div class="harmony-curator-plaque">
        <strong>Curator Plaque Sequence Rule:</strong>
        <p>Slot 1: Monochromatic (1 hue) → Slot 2: Analogous (30° neighbours) → Slot 3: Complementary (180° polar opposites) → Slot 4: Split-Complementary (150°/210° split wings)</p>
      </div>

      <div class="harmony-slots-grid">
        ${sorted.map((p, idx) => `
          <div class="harmony-card" data-painting="${p.id}">
            <div class="harmony-card-header">
              <span class="slot-num">Slot ${idx + 1}</span>
              <span class="harmony-icon">${p.iconChar}</span>
            </div>
            <div class="harmony-swatches">
              ${p.colorsHex.map(c => `<span style="background: ${c};"></span>`).join('')}
            </div>
            <strong>${p.title}</strong>
            <span class="harmony-type-label">${p.harmonyType.toUpperCase()}</span>
            <p class="artist-note">${p.artistNote}</p>
            <div class="harmony-nav-row">
              <button type="button" class="btn btn-small" data-swap-dir="-1" data-slot="${p.slot}" ${idx === 0 ? 'disabled' : ''}>◀ Left</button>
              <button type="button" class="btn btn-small" data-swap-dir="1" data-slot="${p.slot}" ${idx === 3 ? 'disabled' : ''}>Right ▶</button>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="puzzle-feedback" role="status" aria-live="polite" hidden></div>
    `
  }

  private renderVaultPuzzle(mount: HTMLElement, puzzle: VaultPuzzle): void {
    const isJohn = this.activePerspective === 'john'

    mount.innerHTML = `
      <div class="puzzle-perspective-banner">
        <span class="perspective-badge">OBSERVATION MODE: ${isJohn ? 'JOHN (DEUTERANOPE)' : 'JACK (TRICHROMAT)'}</span>
        <p class="perspective-tip">${isJohn
          ? 'John observes positional order symbols: Circle (●)=Pos 1, Triangle (▲)=Pos 2, Square (■)=Pos 3, Diamond (◆)=Pos 4.'
          : 'Jack observes chromatic numeral wavelengths painted in red-green contrast: 4, 8, 2, 9.'}</p>
      </div>

      <div class="vault-dossier-grid">
        <div class="dossier-card">
          <strong>Jack's Chromatic Numeral Clues</strong>
          <p>Numeral 4 · Numeral 8 · Numeral 2 · Numeral 9</p>
        </div>
        <div class="dossier-card">
          <strong>John's Sequence Position Marks</strong>
          <p>● Circle (1st) → ▲ Triangle (2nd) → ■ Square (3rd) → ◆ Diamond (4th)</p>
        </div>
      </div>

      <div class="vault-display">
        ${[0, 1, 2, 3].map(i => `
          <span class="vault-digit ${puzzle.currentCode[i] ? 'has-val' : ''}">
            ${puzzle.currentCode[i] || '_'}
          </span>
        `).join('')}
      </div>

      <div class="vault-keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `
          <button type="button" class="vault-key" data-key="${n}">${n}</button>
        `).join('')}
        <button type="button" class="vault-key vault-key-fn" data-key="clear">CLR</button>
        <button type="button" class="vault-key" data-key="0">0</button>
        <button type="button" class="vault-key vault-key-fn" data-key="backspace">⌫</button>
      </div>

      <div class="puzzle-feedback" role="status" aria-live="polite" hidden></div>
    `
  }

  private testPuzzleSolution(): void {
    if (!this.activePuzzle) return

    // If already complete, clicking submit proceeds to next installation
    if (this.activePuzzle.isComplete) {
      this.closePuzzle()
      return
    }

    const result = this.activePuzzle.check()
    const feedback = this.q<HTMLElement>('.puzzle-feedback')
    const submitBtn = this.q<HTMLButtonElement>('[data-action="puzzle-submit"]')

    if (feedback) {
      feedback.hidden = false
      feedback.textContent = result.message
      feedback.className = `puzzle-feedback ${result.success ? 'is-success' : 'is-error'}`
    }

    if (result.success) {
      this.audio.play('puzzle_success')
      if (submitBtn) {
        submitBtn.textContent = 'Proceed to Next Station →'
        submitBtn.classList.add('btn-success')
      }
      this.onPuzzleSolved?.(this.activePuzzle.id)
    } else {
      this.audio.play('ui')
    }
  }

  private template(): string {
    const range = (name: string, label: string, min: number, max: number, step: number) =>
      `<label class="row"><span data-i18n="${label}"></span><input data-nav type="range" name="${name}" min="${min}" max="${max}" step="${step}"></label>`
    const toggle = (setting: string, label: string) =>
      `<div class="row"><span data-i18n="${label}"></span><button data-nav class="toggle" data-setting="${setting}" aria-pressed="false"><i></i><span></span></button></div>`
    return /* html */ `
<section class="screen screen-boot is-active" data-screen="boot">
  <div class="boot-mark" aria-hidden="true"><svg viewBox="0 0 64 32"><path d="M2 16C10 4 22 4 30 16 22 28 10 28 2 16Z"/><circle cx="16" cy="16" r="4"/><path d="M34 16C42 4 54 4 62 16 54 28 42 28 34 16Z"/><circle cx="48" cy="16" r="4"/></svg></div>
  <div class="boot-logo" data-i18n="game.title"></div>
  <div class="boot-bar"><i></i></div>
  <div class="boot-label" data-i18n="boot.loading"></div>
</section>

<section class="screen screen-title" data-screen="title">
  <div class="title-vignette"></div>
  <header class="site-topbar">
    <div class="site-brand"><span class="site-brand-mark" aria-hidden="true">◈</span><span data-i18n="game.title"></span></div>
    <nav class="site-nav" aria-label="Primary">
      <button data-nav class="site-tab" data-site-tab="learn" aria-current="false" data-i18n="site.tab.learn"></button>
      <button data-nav class="site-tab" data-site-tab="colour" aria-current="false" data-i18n="site.tab.colour"></button>
      <button data-nav class="site-tab" data-site-tab="play" aria-current="true" data-i18n="site.tab.play"></button>
    </nav>
    <span class="site-edition" data-i18n="site.edition"></span>
  </header>
  <main class="site-pages">
    <section class="site-page site-page-learn" data-site-page="learn" aria-labelledby="learn-heading">
      <div class="site-copy">
        <p class="eyebrow"><span class="eyebrow-line"></span><span data-i18n="learn.kicker"></span></p>
        <h1 id="learn-heading" class="page-heading" data-i18n="learn.title"></h1>
        <p class="page-lede" data-i18n="learn.lede"></p>
        <div class="lesson-grid">
          <article class="lesson-card"><span class="lesson-number">01</span><h2 data-i18n="learn.lightTitle"></h2><p data-i18n="learn.lightCopy"></p><div class="swatch-row" aria-hidden="true"><i class="swatch swatch-red"></i><i class="swatch swatch-green"></i><i class="swatch swatch-blue"></i></div></article>
          <article class="lesson-card"><span class="lesson-number">02</span><h2 data-i18n="learn.pigmentTitle"></h2><p data-i18n="learn.pigmentCopy"></p><div class="swatch-row" aria-hidden="true"><i class="swatch swatch-cyan"></i><i class="swatch swatch-magenta"></i><i class="swatch swatch-yellow"></i></div></article>
          <article class="lesson-card"><span class="lesson-number">03</span><h2 data-i18n="learn.valueTitle"></h2><p data-i18n="learn.valueCopy"></p><div class="value-ramp" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></article>
        </div>
      </div>
    </section>
    <section class="site-page site-page-colour" data-site-page="colour" aria-labelledby="colour-heading">
      <div class="site-copy site-copy-narrow">
        <p class="eyebrow"><span class="eyebrow-line"></span><span data-i18n="colour.kicker"></span></p>
        <h1 id="colour-heading" class="page-heading" data-i18n="colour.title"></h1>
        <p class="page-lede" data-i18n="colour.lede"></p>
        <article class="access-card glass-panel">
          <span class="access-symbol" aria-hidden="true">◎</span>
          <div><h2 data-i18n="colour.ruleTitle"></h2><p data-i18n="colour.ruleCopy"></p></div>
        </article>
        <div class="access-signals"><span><i class="signal-shape signal-circle"></i><b data-i18n="colour.shape"></b></span><span><i class="signal-shape signal-lines"></i><b data-i18n="colour.pattern"></b></span><span><i class="signal-shape signal-light"></i><b data-i18n="colour.brightness"></b></span></div>
      </div>
    </section>
    <section class="site-page site-page-play" data-site-page="play" aria-label="Play Two Eyes">
      <div class="title-block">
        <p class="eyebrow"><span class="eyebrow-line"></span><span data-i18n="home.kicker"></span></p>
        <div class="logo">
          <span class="logo-gem" aria-hidden="true"><svg viewBox="0 0 64 32"><path d="M2 16C10 4 22 4 30 16 22 28 10 28 2 16Z"/><circle cx="16" cy="16" r="4"/><path d="M34 16C42 4 54 4 62 16 54 28 42 28 34 16Z"/><circle cx="48" cy="16" r="4"/></svg></span>
          <h1 class="logo-text" data-i18n="game.title"></h1>
        </div>
        <p class="tagline" data-i18n="game.tagline"></p>
        <p class="title-copy" data-i18n="home.copy"></p>
        <div class="menu menu-row site-actions">
          <button data-nav class="btn btn-primary" data-action="play"><span data-i18n="home.enter"></span></button>
          <button data-nav class="btn btn-quiet" data-action="preview"><span data-i18n="home.controls"></span></button>
          <button data-nav class="btn btn-quiet" data-action="settings"><span data-i18n="menu.settings"></span></button>
        </div>
      </div>
      <aside class="studio-card glass-panel">
        <div class="studio-card-top"><span class="studio-status-dot"></span><span data-i18n="home.cardKicker"></span><span class="studio-card-index">04 / 04</span></div>
        <h2 data-i18n="home.cardTitle"></h2>
        <p data-i18n="home.cardCopy"></p>
        <div class="perspective-list"><div><span class="perspective-index">J</span><span><b data-i18n="home.jackName"></b><small data-i18n="home.jackView"></small></span><span class="view-mark view-mark-open">●</span></div><div><span class="perspective-index">J</span><span><b data-i18n="home.johnName"></b><small data-i18n="home.johnView"></small></span><span class="view-mark view-mark-hatch">▧</span></div></div>
        <div class="studio-card-rule"><span data-i18n="home.cardFoot"></span><span>⌁</span></div>
        <div class="title-best is-hidden" aria-live="polite"></div>
      </aside>
    </section>
  </main>
  <section class="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-heading" hidden>
    <div class="preview-dialog-panel glass-panel"><span class="eyebrow-line"></span><p class="eyebrow" data-i18n="preview.kicker"></p><h2 id="preview-heading" data-i18n="preview.title"></h2><p data-i18n="preview.copy"></p><div class="preview-controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span data-i18n="preview.walk"></span></span><span><kbd>Mouse</kbd><span data-i18n="preview.look"></span></span><span><kbd>E</kbd><span data-i18n="preview.interact"></span></span><span><kbd>Tab</kbd><span data-i18n="preview.vision"></span></span><span><kbd>H</kbd><span data-i18n="preview.hint"></span></span><span><kbd>Shift</kbd><span data-i18n="preview.sprint"></span></span><span><kbd>Esc</kbd><span data-i18n="preview.pause"></span></span></div><button data-nav class="btn btn-small btn-primary" data-preview-action="close"><span data-i18n="menu.back"></span></button></div>
  </section>
  <footer class="bottom-bar"><div class="prompts"></div><small data-i18n="credits.fonts"></small></footer>
</section>

<section class="screen screen-hud" data-screen="hud">
  <div class="hud-objective glass-panel" aria-live="polite">
    <span class="hud-objective-badge">OBJECTIVE</span>
    <span class="hud-objective-text">Installation 01: The Mixing Bench · Subtractive Pigment Mixing</span>
  </div>
  <header class="studio-hud-top">
    <div class="studio-hud-left">
      <div class="studio-objective glass-panel"><span class="studio-objective-kicker" data-i18n="studio.stage"></span><strong data-i18n="studio.objective"></strong><p data-i18n="studio.objectiveCopy"></p></div>
      <aside class="studio-vision glass-panel" data-view="jack" role="status" aria-live="polite" aria-atomic="true">
        <span class="studio-vision-symbol" aria-hidden="true"></span>
        <span class="studio-vision-copy">
          <strong class="vision-jack vision-aria" data-i18n="studio.vision.jack"></strong>
          <strong class="vision-john vision-kai" data-i18n="studio.vision.john"></strong>
          <small data-i18n="studio.visionHint"></small>
          <em data-i18n="studio.visionDisclaimer"></em>
        </span>
      </aside>
    </div>
    <div class="studio-hud-right">
      <div class="hud-timer-badge">
        <span class="hud-timer-label">EXHIBITION TIME</span>
        <strong class="hud-timer-clock">15:00</strong>
      </div>
      <button class="hud-pause" data-action="pause" data-i18n-label="touch.pause">${ICON.pause}</button>
    </div>
  </header>
  <div class="studio-crosshair" aria-hidden="true"><i></i><b></b></div>
  <div class="studio-interact glass-panel" hidden aria-live="polite"><kbd>E</kbd><span><b class="studio-interact-label"></b><small data-i18n="studio.pressToExamine"></small></span></div>
  <div class="studio-note glass-panel" role="status" aria-live="polite" hidden></div>
  <aside class="studio-controls glass-panel" aria-label="Studio controls" hidden><strong data-i18n="studio.controlsTitle"></strong><p data-i18n="studio.controlsCopy"></p></aside>
  <div class="hud-puzzle-overlay is-hidden" id="puzzle-overlay" role="dialog" aria-modal="true">
    <div class="puzzle-dialog-panel glass-panel">
      <div class="puzzle-header">
        <span class="puzzle-kicker"></span>
        <h2 class="puzzle-title"></h2>
        <p class="puzzle-desc"></p>
      </div>
      <div class="puzzle-body" id="puzzle-mount"></div>
      <div class="puzzle-actions">
        <button data-nav class="btn btn-quiet" data-action="puzzle-close">Back to Studio</button>
        <button data-nav class="btn btn-primary" data-action="puzzle-submit">Test Solution</button>
      </div>
    </div>
  </div>
  <div class="touch">
    <div class="touch-stick"><i></i></div>
    <div class="touch-actions"><button class="touch-btn" data-touch="hint"><span data-i18n="touch.hint"></span></button><button class="touch-btn" data-touch="interact"><span data-i18n="touch.interact"></span></button><button class="touch-btn touch-vision" data-touch="vision" data-i18n-label="touch.vision"><span data-i18n="touch.vision"></span></button></div>
  </div>
</section>

<section class="screen screen-pause screen-modal" data-screen="pause">
  <div class="modal">
    <h2 class="modal-title" data-i18n="pause.title"></h2>
    <nav class="menu">
      <button data-nav class="btn btn-primary" data-action="resume"><span data-i18n="menu.continue"></span></button>
      <button data-nav class="btn" data-action="restart"><span data-i18n="menu.restart"></span></button>
      <button data-nav class="btn" data-action="settings"><span data-i18n="menu.settings"></span></button>
      <button data-nav class="btn" data-action="quit"><span data-i18n="menu.quit"></span></button>
    </nav>
  </div>
  <footer class="bottom-bar"><div class="prompts"></div></footer>
</section>

<section class="screen screen-settings screen-modal" data-screen="settings">
  <div class="modal modal-wide">
    <h2 class="modal-title" data-i18n="settings.title"></h2>
    <div class="settings-grid">
      <fieldset><legend data-i18n="settings.audio"></legend>
        ${range('musicVolume', 'settings.music', 0, 1, 0.05)}
        ${range('sfxVolume', 'settings.sfx', 0, 1, 0.05)}
        ${toggle('muted', 'settings.mute')}
      </fieldset>
      <fieldset><legend data-i18n="settings.controls"></legend>
        ${range('sensitivity', 'settings.sensitivity', 0.2, 3, 0.1)}
        ${toggle('invertY', 'settings.invertY')}
      </fieldset>
      <fieldset><legend data-i18n="settings.display"></legend>
        <div class="row"><span data-i18n="settings.quality"></span><div class="seg" data-setting="quality">
          <button data-nav data-value="low" data-i18n="settings.quality.low"></button><button data-nav data-value="medium" data-i18n="settings.quality.medium"></button><button data-nav data-value="high" data-i18n="settings.quality.high"></button><button data-nav data-value="ultra" data-i18n="settings.quality.ultra"></button>
        </div></div>
        ${toggle('reducedMotion', 'settings.reducedMotion')}
        ${toggle('untimedMode', 'settings.untimed')}
      </fieldset>
    </div>
    <nav class="menu menu-row"><button data-nav class="btn" data-action="back"><span data-i18n="menu.back"></span></button></nav>
  </div>
  <footer class="bottom-bar"><div class="prompts"></div></footer>
</section>

<section class="screen screen-leaderboard screen-modal" data-screen="leaderboard">
  <div class="modal">
    <h2 class="modal-title" data-i18n="leaderboard.title"></h2>
    <div class="board-head"><b>#</b><span></span><span data-i18n="leaderboard.time"></span><em data-i18n="leaderboard.score"></em></div>
    <ol class="board"></ol>
    <nav class="menu menu-row"><button data-nav class="btn" data-action="back"><span data-i18n="menu.back"></span></button></nav>
  </div>
  <footer class="bottom-bar"><div class="prompts"></div></footer>
</section>

<section class="screen screen-results screen-modal" data-screen="results">
  <div class="modal modal-wide modal-completion">
    <h2 class="results-title modal-title" data-i18n="results.won"></h2>
    <div class="completion-banner">
      <p class="completion-quote">“Colour is only one part of communication. Great design works for everyone.”</p>
    </div>
    <div class="completion-recap">
      <div class="recap-item">
        <b>1. Subtractive Light Absorption</b>
        <p>Physical pigments absorb light wavelengths: Blue + Yellow = Green. Never confuse pigment mixing with additive RGB screen light.</p>
      </div>
      <div class="recap-item">
        <b>2. Value (Luminance) Contrast</b>
        <p>Luminance contrast remains 100% legible across all color vision types. Tint adds white, tone adds grey, and shade adds black.</p>
      </div>
      <div class="recap-item">
        <b>3. Geometric Colour Harmonies</b>
        <p>Harmonies represent geometric angular relationships on the color wheel: monochromatic, analogous (30°), complementary (180°), and split-complementary.</p>
      </div>
      <div class="recap-item">
        <b>4. Multi-Channel Dual Encoding</b>
        <p>Never rely on colour alone: combine hue with shapes, hatching patterns, contrast, and explicit tactile cues.</p>
      </div>
    </div>
    <div class="row" style="margin: 16px 0; justify-content: space-around;">
      <div><span style="font-size: 10px; color: var(--text-dim); text-transform: uppercase;">Remaining Time:</span> <b class="r-time" style="font-size: 18px; color: var(--deep-space-blue); margin-left: 6px;">15:00</b></div>
      <div><span style="font-size: 10px; color: var(--text-dim); text-transform: uppercase;">Installations Unlocked:</span> <b style="font-size: 18px; color: var(--brick-red); margin-left: 6px;">4 / 4</b></div>
    </div>
    <nav class="menu menu-row" style="margin-top: 20px;">
      <button data-nav class="btn btn-primary" data-action="restart"><span data-i18n="results.retry"></span></button>
      <button data-nav class="btn" data-action="quit"><span data-i18n="results.title"></span></button>
    </nav>
  </div>
</section>`
  }
}
