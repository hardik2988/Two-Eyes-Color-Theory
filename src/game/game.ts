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

export type Mode = 'attract' | 'playing' | 'paused' | 'ended'
/** Kept for the retained results UI while the colour-theory challenges are built in later stages. */
export type Hint = 'move' | 'look' | 'jump' | 'dash' | 'cores'
export type Compass = { angle: number; distance: number; rise: number }

/** One persistent room and one renderer: no duplicate scenes are created for a different viewpoint. */
export class Game {
  mode: Mode = 'attract'
  reducedMotion = false
  helpVisible = false
  perspective: Perspective = 'aria'
  note = ''
  focusedTarget: StudioTarget | null = null
  private readonly physics: Physics
  private readonly world: StudioWorld
  private readonly player: FirstPersonController
  private readonly raycaster = new THREE.Raycaster()
  private readonly center = new THREE.Vector2(0, 0)
  private time = 0
  private noteTime = 0

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
  ) {
    this.physics = new Physics(CONFIG.exploration.gravity)
    this.world = new StudioWorld(this.physics, renderer)
    this.player = new FirstPersonController(this.physics, this.world.spawn, window.innerWidth / Math.max(1, window.innerHeight))
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
    this.perspective = 'aria'
    this.renderer.setVisionMode('aria', true)
    this.helpVisible = showControls
    this.focusedTarget = null
    this.note = ''
    this.noteTime = 0
    this.mode = 'playing'
    this.input.endFrame()
    this.input.takeLook()
  }

  pause(): void {
    if (this.mode === 'playing') this.mode = 'paused'
  }

  resume(): void {
    if (this.mode !== 'paused') return
    this.mode = 'playing'
    this.input.endFrame()
    this.input.takeLook()
  }

  toTitle(): void {
    this.mode = 'attract'
    this.perspective = 'aria'
    this.renderer.setVisionMode('aria', true)
    this.focusedTarget = null
    this.note = ''
    this.helpVisible = false
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
    this.perspective = this.perspective === 'aria' ? 'kai' : 'aria'
    this.player.setPerspective(this.perspective, this.reducedMotion)
    this.renderer.setVisionMode(this.perspective, this.reducedMotion)
    this.audio.play('ui')
  }

  step(dt: number): void {
    const interact = this.input.consume('interact')
    const toggleHelp = this.input.consume('hint')
    const switchView = this.input.consume('vision')
    if (this.mode !== 'playing') {
      this.renderer.updateVision(dt)
      return
    }
    if (switchView) this.switchPerspective()
    if (toggleHelp) this.helpVisible = !this.helpVisible
    if (interact) this.examine()
    this.player.step(dt, { x: this.input.move.x, y: this.input.move.y, sprint: this.input.held('sprint') })
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
      this.note = 'Look toward a paint tin, canvas or door to examine it.'
      this.noteTime = 3.2
      this.audio.play('ui')
      return
    }
    this.note = this.focusedTarget.detail
    this.noteTime = 7
    this.audio.play('ui')
  }
}
