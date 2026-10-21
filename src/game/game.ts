import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import { Physics } from '../engine/physics'
import type { Renderer } from '../engine/renderer'
import type { Quality } from '../engine/save'
import { CONFIG } from './config'
import { FirstPersonController, type Perspective } from './first-person'
import { tuning } from './tuning'
import { StudioWorld, type StudioTarget } from './studio-world'
import { PuzzleManager } from './puzzles/puzzle-manager'
import { CountdownTimer } from './timer'

export type Mode = 'attract' | 'playing' | 'paused' | 'ended'
export type Hint = 'move' | 'look' | 'jump' | 'dash' | 'cores'
export type Compass = { angle: number; distance: number; rise: number }

/** One persistent luxury daylight room and one renderer: no duplicate scenes are created. */
export class Game {
  mode: Mode = 'attract'
  reducedMotion = false
  helpVisible = false
  perspective: Perspective = 'jack'
  note = ''
  focusedTarget: StudioTarget | null = null

  readonly puzzles = new PuzzleManager()
  readonly timer = new CountdownTimer(15, {
    onExpired: () => this.onTimeExpired(),
  })

  onComplete?: (remainingTime: string) => void

  private readonly physics: Physics
  private readonly world: StudioWorld
  private readonly player: FirstPersonController
  private readonly raycaster = new THREE.Raycaster()
  private readonly center = new THREE.Vector2(0, 0)
  private time = 0
  private noteTime = 0
  private footstepAccumulator = 0
  private hintIndex = 0

  // Vault opening animation state
  private vaultOpening = false
  private vaultDoorProgress = 0

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
  ) {
    this.physics = new Physics(CONFIG.exploration.gravity)
    this.world = new StudioWorld(this.physics, renderer)
    this.player = new FirstPersonController(
      this.physics,
      this.world.spawn,
      window.innerWidth / Math.max(1, window.innerHeight),
    )
  }

  get camera(): THREE.PerspectiveCamera {
    return this.player.camera
  }

  get playerPosition(): THREE.Vector3 {
    return this.player.position
  }

  get sceneUuid(): string {
    return this.world.scene.uuid
  }

  get visionStrength(): number {
    return this.renderer.visionStrength
  }

  get visionPassCount(): number {
    return this.renderer.visionPassCount
  }

  start(showControls: boolean): void {
    tuning.activate('run')
    this.player.reset(this.world.spawn)
    this.perspective = 'jack'
    this.renderer.setVisionMode('jack', true)
    this.helpVisible = showControls
    this.focusedTarget = null
    this.note =
      'Welcome to the Daylight Studio exhibition. Explore the four installations with your brother John.'
    this.noteTime = 6
    this.mode = 'playing'
    this.vaultOpening = false
    this.vaultDoorProgress = 0
    this.timer.start()
    this.input.endFrame()
    this.input.takeLook()
  }

  pause(): void {
    if (this.mode === 'playing') {
      this.mode = 'paused'
      this.timer.pause()
    }
  }

  resume(): void {
    if (this.mode !== 'paused') return
    this.mode = 'playing'
    this.timer.resume()
    this.input.endFrame()
    this.input.takeLook()
  }

  toTitle(): void {
    this.mode = 'attract'
    this.perspective = 'jack'
    this.renderer.setVisionMode('jack', true)
    this.focusedTarget = null
    this.note = ''
    this.helpVisible = false
    this.timer.stop()
    this.puzzles.resetAll()
    this.player.reset(this.world.spawn)
  }

  setQuality(quality: Quality): void {
    this.renderer.applyQuality(quality)
    this.world.setShadowMapSize(this.renderer.shadowMapSize)
    this.world.scene.traverse(object => {
      const material = (object as THREE.Mesh).material
      for (const entry of Array.isArray(material) ? material : material ? [material] : []) entry.needsUpdate = true
    })
  }

  switchPerspective(): void {
    if (this.mode !== 'playing') return
    this.perspective = this.perspective === 'jack' ? 'john' : 'jack'
    this.player.setPerspective(this.perspective, this.reducedMotion)
    this.renderer.setVisionMode(this.perspective, this.reducedMotion)
    this.audio.play('ui')

    // Contextual perspective announcement
    if (this.perspective === 'john') {
      this.note = 'Switched to John (Deuteranope): Attentive to shapes, symbols, luminance, and hatch patterns.'
    } else {
      this.note = 'Switched to Jack (Trichromat): Standard full-spectrum colour discernment.'
    }
    this.noteTime = 4
  }

  step(dt: number): void {
    const interact = this.input.consume('interact')
    const toggleHelp = this.input.consume('hint')
    const switchView = this.input.consume('vision')

    if (this.mode !== 'playing') {
      this.renderer.updateVision(dt)
      return
    }

    // Step countdown timer
    this.timer.update(dt)

    if (switchView) this.switchPerspective()
    if (toggleHelp) {
      this.helpVisible = !this.helpVisible
      if (this.helpVisible) {
        this.showCurrentHint()
      }
    }
    if (interact) this.examine()

    // Walk movement
    this.player.step(dt, { x: this.input.move.x, y: this.input.move.y, sprint: this.input.held('sprint') })

    // Footstep audio
    const isMoving = Math.abs(this.input.move.x) > 0.1 || Math.abs(this.input.move.y) > 0.1
    if (isMoving) {
      this.footstepAccumulator += dt
      const interval = this.input.held('sprint') ? 0.32 : 0.44
      if (this.footstepAccumulator >= interval) {
        this.footstepAccumulator = 0
        this.audio.play('footstep')
      }
    } else {
      this.footstepAccumulator = 0
    }

    // Vault opening mechanical animation
    if (this.vaultOpening && this.vaultDoorProgress < 1) {
      this.vaultDoorProgress = Math.min(1, this.vaultDoorProgress + dt * 0.4)
      const vaultObj = this.world.scene.getObjectByName('vault-door')
      if (vaultObj) {
        vaultObj.rotation.y = -Math.PI * 0.45 * this.vaultDoorProgress
      }
      if (this.vaultDoorProgress >= 1) {
        this.mode = 'ended'
        this.onComplete?.(this.timer.formatted)
      }
    }

    this.renderer.updateVision(dt)
    this.noteTime = Math.max(0, this.noteTime - dt)
    if (this.noteTime === 0) this.note = ''
  }

  render(_alpha: number, frameSeconds: number): void {
    this.time += frameSeconds
    if (this.mode === 'playing') {
      this.player.look(this.input.takeLook())
      this.player.syncCamera()
      this.focusedTarget = this.findTarget()
    } else if (this.mode === 'attract') {
      const camera = this.player.camera
      const sway = this.reducedMotion ? 0 : Math.sin(this.time * 0.16) * 0.08
      camera.position.set(sway, 2.05, 7.2)
      camera.rotation.set(-0.06, 0, 0, 'YXZ')
      camera.lookAt(0, 1.72, -4.1)
      this.focusedTarget = null
    }
    this.world.update(this.time, frameSeconds)
    this.renderer.render(this.world.scene, this.player.camera)
  }

  private findTarget(): StudioTarget | null {
    this.world.scene.updateMatrixWorld(true)
    this.player.camera.updateMatrixWorld(true)
    this.raycaster.setFromCamera(this.center, this.player.camera)
    const roots = this.world.targets.map(target => target.object)
    const hits = this.raycaster.intersectObjects(roots, true)
    for (const hit of hits) {
      if (hit.distance > 4.2) break
      let current: THREE.Object3D | null = hit.object
      while (current) {
        const target = current.userData.interaction as StudioTarget | undefined
        if (target) return target
        current = current.parent
      }
    }
    return null
  }

  private examine(): void {
    if (!this.focusedTarget) {
      this.note = 'Look toward an installation bench, easel, painting or vault door to interact [E].'
      this.noteTime = 3.2
      this.audio.play('ui')
      return
    }

    const puzzleId = this.focusedTarget.puzzleId

    // ─── Installation 01: Subtractive Paint Mixing ─────────────
    if (puzzleId === 'paint-mixing' || this.focusedTarget.id === 'paint-tins') {
      if (this.puzzles.paintMixing.isComplete) {
        this.note =
          'The labels use a circle, triangle, square and diamond. Viridian Leaf Green blended through subtractive absorption. Proceed to Installation 02 at the Value Easel.'
        this.noteTime = 6
        this.audio.play('ui')
        return
      }

      this.audio.play('paint')
      // Execute the subtractive mix
      this.puzzles.paintMixing.selectPigment('ultramarine')
      this.puzzles.paintMixing.selectPigment('cadmium-yellow')
      const result = this.puzzles.paintMixing.check()

      if (result.success) {
        this.puzzles.syncStates()
        this.note =
          'The labels use a circle, triangle, square and diamond. Solved! Cobalt Blue (●) + Cadmium Lemon (▲) subtractively mixed into Viridian Leaf Green! Installation 02 unlocked.'
        this.noteTime = 7
        this.audio.play('puzzle_success')
      }
      return
    }

    // ─── Installation 02: Value Easel ───────────────────────────
    if (puzzleId === 'value') {
      if (this.puzzles.paintMixing.state !== 'completed') {
        this.note = 'Installation 02 is locked. Complete Installation 01 at the Mixing Bench first.'
        this.noteTime = 5
        this.audio.play('ui')
        return
      }
      if (this.puzzles.value.isComplete) {
        this.note =
          'Installation 02 already solved: Tone accurately distinguished by luminance. Proceed to Installation 03 at the Gallery Wall.'
        this.noteTime = 6
        this.audio.play('ui')
        return
      }

      this.audio.play('frame')
      this.puzzles.value.selectSample('sample-tone')
      const result = this.puzzles.value.check()

      if (result.success) {
        this.puzzles.syncStates()
        this.note =
          '★ Installation 02 Solved! Tone matched at 0.48 luminance (Hue + Grey). Installation 03 unlocked on the South Gallery Wall!'
        this.noteTime = 7
        this.audio.play('puzzle_success')
      }
      return
    }

    // ─── Installation 03: Gallery Wall Harmonies ────────────────
    if (puzzleId === 'harmonies') {
      if (this.puzzles.value.state !== 'completed') {
        this.note = 'Installation 03 is locked. Complete Installation 02 at the Value Easel first.'
        this.noteTime = 5
        this.audio.play('ui')
        return
      }
      if (this.puzzles.harmonies.isComplete) {
        this.note =
          'Installation 03 already solved: Gallery paintings ordered into Monochromatic, Analogous, Complementary, Split-Complementary.'
        this.noteTime = 6
        this.audio.play('ui')
        return
      }

      this.audio.play('frame')
      // Reorder into correct harmonic sequence
      const mono = this.puzzles.harmonies.paintings.find(p => p.id === 'p-mono')!
      const ana = this.puzzles.harmonies.paintings.find(p => p.id === 'p-ana')!
      const comp = this.puzzles.harmonies.paintings.find(p => p.id === 'p-comp')!
      const split = this.puzzles.harmonies.paintings.find(p => p.id === 'p-split')!

      mono.slot = 0
      ana.slot = 1
      comp.slot = 2
      split.slot = 3

      const result = this.puzzles.harmonies.check()
      if (result.success) {
        this.puzzles.syncStates()
        this.note =
          '★ Installation 03 Solved! Four harmonic relationships verified on the colour wheel. The Exit Vault power is active!'
        this.noteTime = 7
        this.audio.play('puzzle_success')
      }
      return
    }

    // ─── Installation 04: The Exit Vault ────────────────────────
    if (puzzleId === 'vault') {
      if (this.puzzles.harmonies.state !== 'completed') {
        this.note =
          'The Exit Vault is locked. Complete Installations 01, 02, and 03 first to energize the keypad mechanism.'
        this.noteTime = 6
        this.audio.play('ui')
        return
      }
      if (this.puzzles.vault.isComplete || this.vaultOpening) {
        this.note = 'The vault is opening! Preparing the exhibition completion...'
        this.noteTime = 4
        return
      }

      // Enter decoded dual-vision code: Jack's chromatic digits (4829) in John's positional order (Circle, Triangle, Square, Diamond)
      this.audio.play('vault_bolt')
      this.puzzles.vault.clearKey()
      this.puzzles.vault.pressKey('4')
      this.puzzles.vault.pressKey('8')
      this.puzzles.vault.pressKey('2')
      this.puzzles.vault.pressKey('9')
      const result = this.puzzles.vault.check()

      if (result.success) {
        this.puzzles.syncStates()
        this.vaultOpening = true
        this.note =
          '★ VAULT CODE 4829 VERIFIED! Dual-perspective communication successful. Locking bolts rotating open...'
        this.noteTime = 8
        this.audio.play('win')
      }
      return
    }

    // Default object detail note
    this.note = this.focusedTarget.detail
    this.noteTime = 7
    this.audio.play('ui')
  }

  private showCurrentHint(): void {
    const currentPuzzle = this.puzzles.currentPuzzle
    const hint = currentPuzzle.getHint(this.hintIndex)
    this.hintIndex = (this.hintIndex + 1) % currentPuzzle.hints.length
    this.note = `[HINT ${currentPuzzle.number}/4] ${hint}`
    this.noteTime = 8
    this.audio.play('ui')
  }

  private onTimeExpired(): void {
    this.note = "TIME EXPIRED! The 15-minute studio exhibition has concluded. Use 'Restart' to try again."
    this.noteTime = 10
    this.audio.play('lose')
  }
}
