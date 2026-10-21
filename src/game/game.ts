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
import type { IPuzzle } from './puzzles/types'

export type Mode = 'attract' | 'playing' | 'paused' | 'ended' | 'puzzle'
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
  onOpenPuzzle?: (puzzle: IPuzzle) => void
  onPlayerMoved?: () => void

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

  get currentObjective(): string {
    if (this.vaultOpening || this.puzzles.vault.isComplete) {
      return 'Exhibition Complete · Vault Unlocked · Walk inside to finish'
    }
    if (this.puzzles.harmonies.state === 'completed') {
      return 'Installation 04: The Exhibition Vault · Decrypt Master Keypad'
    }
    if (this.puzzles.value.state === 'completed') {
      return 'Installation 03: South Gallery Wall · Order Colour Harmonies'
    }
    if (this.puzzles.paintMixing.state === 'completed') {
      return 'Installation 02: The Value Easel · Match Reference Tone'
    }
    return 'Installation 01: The Mixing Bench · Subtractive Pigment Mixing'
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
    this.world.setObjectiveStation('paint-mixing')
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
    if (this.mode !== 'paused' && this.mode !== 'puzzle') return
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
    this.world.setObjectiveStation('paint-mixing')
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
      this.onPlayerMoved?.()
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
    } else if (this.mode === 'puzzle') {
      this.player.syncCamera()
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
      if (hit.distance > 5.8) break
      let current: THREE.Object3D | null = hit.object
      while (current) {
        const target = current.userData.interaction as StudioTarget | undefined
        if (target) {
          // Dynamic interaction prompt label reflecting puzzle state
          if (target.id === 'paint-tins') {
            target.label = this.puzzles.paintMixing.isComplete
              ? 'Paint tins · Installation 01 (Solved) [E]'
              : 'Paint tins · Subtractive Mixing Bench [E to Mix]'
          } else if (target.id === 'value-station') {
            if (this.puzzles.paintMixing.state !== 'completed') {
              target.label = 'Installation 02 · Value Easel [Locked · Complete Inst. 01 first]'
            } else if (this.puzzles.value.isComplete) {
              target.label = 'Installation 02 · Value Easel (Solved) [E]'
            } else {
              target.label = 'Installation 02 · The Value Easel [E to Examine]'
            }
          } else if (target.id === 'harmonies') {
            if (this.puzzles.value.state !== 'completed') {
              target.label = 'Installation 03 · Gallery Wall [Locked · Complete Inst. 02 first]'
            } else if (this.puzzles.harmonies.isComplete) {
              target.label = 'Installation 03 · Gallery Wall (Solved) [E]'
            } else {
              target.label = 'Installation 03 · Gallery Wall Harmonies [E to Arrange]'
            }
          } else if (target.id === 'vault-door') {
            if (this.puzzles.harmonies.state !== 'completed') {
              target.label = 'Installation 04 · Exhibition Vault [Locked · Solve Inst. 01–03 first]'
            } else if (this.vaultOpening || this.puzzles.vault.isComplete) {
              target.label = 'Installation 04 · Exhibition Vault (Open)'
            } else {
              target.label = 'Installation 04 · Exhibition Vault [E to Decrypt Keypad]'
            }
          }
          return target
        }
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
      this.note = 'The labels use a circle, triangle, square and diamond. Opening Subtractive Mixing Bench...'
      this.noteTime = 5
      this.audio.play('paint')
      this.onOpenPuzzle?.(this.puzzles.paintMixing)
      return
    }

    // ─── Installation 02: Value Easel ───────────────────────────
    if (puzzleId === 'value' || this.focusedTarget.id === 'value-station') {
      if (this.puzzles.paintMixing.state !== 'completed') {
        this.note = 'Installation 02 is locked. Complete Installation 01 at the Mixing Bench first.'
        this.noteTime = 5
        this.audio.play('ui')
        return
      }
      this.note = 'Opening Installation 02: Value Easel Workstation...'
      this.noteTime = 5
      this.audio.play('frame')
      this.onOpenPuzzle?.(this.puzzles.value)
      return
    }

    // ─── Installation 03: Gallery Wall Harmonies ────────────────
    if (puzzleId === 'harmonies' || this.focusedTarget.id === 'harmonies') {
      if (this.puzzles.value.state !== 'completed') {
        this.note = 'Installation 03 is locked. Complete Installation 02 at the Value Easel first.'
        this.noteTime = 5
        this.audio.play('ui')
        return
      }
      this.note = 'Opening Installation 03: Gallery Wall Harmonies...'
      this.noteTime = 5
      this.audio.play('frame')
      this.onOpenPuzzle?.(this.puzzles.harmonies)
      return
    }

    // ─── Installation 04: The Exit Vault ────────────────────────
    if (puzzleId === 'vault' || this.focusedTarget.id === 'vault-door') {
      if (this.puzzles.harmonies.state !== 'completed') {
        this.note =
          'The Exit Vault is locked. Complete Installations 01, 02, and 03 first to energize the keypad mechanism.'
        this.noteTime = 6
        this.audio.play('ui')
        return
      }
      if (this.vaultOpening || this.puzzles.vault.isComplete) {
        this.note = 'The vault is open! Walk through the threshold to complete the exhibition.'
        this.noteTime = 4
        return
      }
      this.note = 'Accessing Installation 04: Vault Keypad...'
      this.noteTime = 5
      this.audio.play('vault_bolt')
      this.onOpenPuzzle?.(this.puzzles.vault)
      return
    }

    // Default object detail note
    this.note = this.focusedTarget.detail
    this.noteTime = 7
    this.audio.play('ui')
  }

  onPuzzleSolved(puzzleId: string): void {
    this.puzzles.syncStates()
    this.audio.play('puzzle_success')

    if (puzzleId === 'paint-mixing') {
      this.world.setObjectiveStation('value')
      this.world.setPaletteMixedColor('#15803d')
      this.note = '★ Installation 01 Solved! Viridian Leaf Green mixed. Proceed to Installation 02 at the Value Easel.'
      this.noteTime = 7
    } else if (puzzleId === 'value') {
      this.world.setObjectiveStation('harmonies')
      this.note = '★ Installation 02 Solved! Tone matched at 0.48 luminance. Proceed to Installation 03 at the South Gallery Wall.'
      this.noteTime = 7
    } else if (puzzleId === 'harmonies') {
      this.world.setObjectiveStation('vault')
      this.note = '★ Installation 03 Solved! Four harmonic chords aligned. Proceed to Installation 04 at the Exit Vault.'
      this.noteTime = 7
    } else if (puzzleId === 'vault') {
      this.vaultOpening = true
      this.world.setObjectiveStation('completed')
      this.note = '★ Vault Code 4829 Verified! Locking bolts rotating open...'
      this.noteTime = 8
      this.audio.play('win')
    }
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
