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
  private reducedMotion_ = false
  get reducedMotion(): boolean {
    return this.reducedMotion_
  }
  set reducedMotion(val: boolean) {
    this.reducedMotion_ = val
    if (this.player) this.player.reducedMotion = val
  }
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

  readonly physics: Physics
  readonly world: StudioWorld
  readonly player: FirstPersonController
  private readonly raycaster = new THREE.Raycaster()
  private readonly center = new THREE.Vector2(0, 0)
  private time = 0
  private noteTime = 0
  private footstepAccumulator = 0

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
    const g = this.guidance
    if (this.vaultOpening || this.puzzles.vault.isComplete) {
      return 'Exhibition Complete · Vault Unlocked · Walk inside to finish'
    }
    return `Installation 0${g.level}: ${g.title} · ${g.targetName} (${g.arrow} ${g.distance.toFixed(1)}m ${g.direction})`
  }

  get guidance(): {
    level: number
    total: number
    title: string
    targetName: string
    distance: number
    direction: string
    arrow: string
  } {
    const targetPos = new THREE.Vector3(0, 0.72, 3.05)
    let level = 1
    let title = 'Subtractive Pigment Mixing'
    let targetName = 'Mixing Bench'

    if (this.puzzles.harmonies.state === 'completed') {
      level = 4
      title = 'The Exhibition Vault'
      targetName = 'Vault Door'
      targetPos.set(0, 0.72, -7.0)
    } else if (this.puzzles.value.state === 'completed') {
      level = 3
      title = 'Gallery Wall Colour Harmonies'
      targetName = 'Gallery Curator Stand'
      targetPos.set(0, 0.72, 6.35)
    } else if (this.puzzles.paintMixing.state === 'completed') {
      level = 2
      title = 'Value & Saturation Easel'
      targetName = 'Value Easel'
      targetPos.set(-3.25, 0.72, 0.55)
    }

    const playerPos = this.player.position
    const dx = targetPos.x - playerPos.x
    const dz = targetPos.z - playerPos.z
    const distance = Math.hypot(dx, dz)

    const camDir = new THREE.Vector3()
    this.player.camera.getWorldDirection(camDir)
    const forwardAngle = Math.atan2(camDir.x, camDir.z)
    const targetAngle = Math.atan2(dx, dz)
    let diff = targetAngle - forwardAngle
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2

    let arrow = '▲'
    let direction = 'Ahead'
    const deg = (diff * 180) / Math.PI
    if (Math.abs(deg) <= 28) {
      arrow = '▲'
      direction = 'Ahead'
    } else if (deg > 28 && deg < 115) {
      arrow = '▶'
      direction = 'Turn Right'
    } else if (deg < -28 && deg > -115) {
      arrow = '◀'
      direction = 'Turn Left'
    } else {
      arrow = '▼'
      direction = 'Behind'
    }

    return { level, total: 4, title, targetName, distance, direction, arrow }
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
    this.audio.stopMusic()
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
      this.world.setTargetHover(this.focusedTarget)
    } else if (this.mode === 'puzzle') {
      this.player.syncCamera()
      this.world.setTargetHover(null)
    } else if (this.mode === 'attract') {
      const camera = this.player.camera
      const sway = this.reducedMotion ? 0 : Math.sin(this.time * 0.16) * 0.08
      camera.position.set(sway, 2.05, 7.2)
      camera.rotation.set(-0.06, 0, 0, 'YXZ')
      camera.lookAt(0, 1.72, -4.1)
      this.focusedTarget = null
      this.world.setTargetHover(null)
    }
    this.world.update(this.time, frameSeconds)
    this.renderer.render(this.world.scene, this.player.camera)
  }

  private cachedRoots: THREE.Object3D[] = []

  private getTargetRoots(): THREE.Object3D[] {
    if (this.cachedRoots.length !== this.world.targets.length) {
      this.cachedRoots = this.world.targets.map(t => t.object)
    }
    return this.cachedRoots
  }

  private findTarget(): StudioTarget | null {
    this.player.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(this.center, this.player.camera)
    const hits = this.raycaster.intersectObjects(this.getTargetRoots(), true)
    for (const hit of hits) {
      if (hit.distance > 8.5) break
      let current: THREE.Object3D | null = hit.object
      while (current) {
        const target = current.userData.interaction as StudioTarget | undefined
        if (target) {
          const isTooFar = hit.distance > 5.2

          // Dynamic interaction prompt label reflecting puzzle state & distance
          if (target.id === 'paint-tins') {
            if (isTooFar) {
              target.label = 'Paint tins · Subtractive Mixing Bench [Move closer to interact]'
            } else {
              target.label = this.puzzles.paintMixing.isComplete
                ? 'Paint tins · Installation 01 (Solved) [E to Review]'
                : 'Paint tins · Subtractive Mixing Bench [E — Begin Paint Mixing]'
            }
          } else if (target.id === 'value-station') {
            if (this.puzzles.paintMixing.state !== 'completed') {
              target.label = 'Installation 02 · [Installation locked — Complete Paint Mixing first]'
            } else if (isTooFar) {
              target.label = 'Installation 02 · Value Easel [Move closer to interact]'
            } else if (this.puzzles.value.isComplete) {
              target.label = 'Installation 02 · Value Easel (Completed) [E to Review]'
            } else {
              target.label = 'Installation 02 · Value Easel [E — Begin Value Challenge]'
            }
          } else if (target.id === 'harmonies') {
            if (this.puzzles.value.state !== 'completed') {
              target.label = 'Installation 03 · [Installation locked — Complete Value Challenge first]'
            } else if (isTooFar) {
              target.label = 'Installation 03 · Gallery Wall [Move closer to interact]'
            } else if (this.puzzles.harmonies.isComplete) {
              target.label = 'Installation 03 · Gallery Wall (Completed) [E to Review]'
            } else {
              target.label = 'Installation 03 · Gallery Wall [E — Begin Colour Harmony Challenge]'
            }
          } else if (target.id === 'vault-door') {
            if (this.puzzles.harmonies.state !== 'completed') {
              target.label = 'Installation 04 · [Installation locked — Complete all 3 installations first]'
            } else if (this.vaultOpening || this.puzzles.vault.isComplete) {
              target.label = 'Installation 04 · Exhibition Vault (Unlocked) [Walk Inside]'
            } else if (isTooFar) {
              target.label = 'Installation 04 · Exhibition Vault [Move closer to interact]'
            } else {
              target.label = 'Installation 04 · Exhibition Vault [E — Open Vault Keypad]'
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

    if (this.focusedTarget.label.includes('Move closer to interact')) {
      this.note = 'You are too far away. Move closer to interact [E].'
      this.noteTime = 3.5
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

  hintStage: number = 0

  showCurrentHint(): { stage: number; total: number; title: string; text: string } {
    const currentPuzzle = this.puzzles.currentPuzzle
    const stageTitles = ['Objective', 'Colour Theory Principle', 'Actionable Clue', 'Guided Solution']
    const stage = this.hintStage % 4
    const text = currentPuzzle.getHint(stage)
    const result = {
      stage: stage + 1,
      total: 4,
      title: stageTitles[stage],
      text,
    }
    this.hintStage = (this.hintStage + 1) % 4
    this.note = `[HINT ${result.stage}/4 · ${result.title.toUpperCase()}] ${text}`
    this.noteTime = 9
    this.audio.play('ui')
    return result
  }

  private onTimeExpired(): void {
    this.note = "TIME EXPIRED! The 15-minute studio exhibition has concluded. Use 'Restart' to try again."
    this.noteTime = 10
    this.audio.play('lose')
  }
}
