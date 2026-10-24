import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { DEUTERANOPIA_SHADER } from './color-vision'
import type { Quality } from './save'

type Preset = { pixelRatio: number; shadows: boolean; shadowMap: number; bloom: boolean; antialias: boolean }
export const QUALITY_PRESETS: Record<Quality, Preset> = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 512, bloom: false, antialias: false },
  medium: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, bloom: false, antialias: true },
  high: { pixelRatio: 2, shadows: true, shadowMap: 2048, bloom: true, antialias: true },
  ultra: { pixelRatio: 2.25, shadows: true, shadowMap: 4096, bloom: true, antialias: true },
}

/** Pick a starting quality from device hints; the player can override it in Settings. */
export function suggestQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse || cores <= 4) return 'medium'
  return 'high'
}

/**
 * Owns the WebGL renderer, the optional post-processing chain and resize handling.
 * Scenes call `render(scene, camera)`; they never touch the composer directly.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer
  private composer?: EffectComposer
  private bloom?: UnrealBloomPass
  private readonly visionPass: ShaderPass
  private visionStrength_ = 0
  private visionTarget = 0
  private preset: Preset
  private scene?: THREE.Scene
  private camera?: THREE.PerspectiveCamera

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.preset = QUALITY_PRESETS[quality]
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: this.preset.antialias, powerPreference: 'high-performance' })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap
    this.visionPass = new ShaderPass(DEUTERANOPIA_SHADER)
    this.applyQuality(quality)
    window.addEventListener('resize', () => this.resize())
  }

  get shadowMapSize(): number {
    return this.preset.shadowMap
  }

  get visionStrength(): number {
    return this.visionStrength_
  }

  get visionPassCount(): number {
    return 1
  }

  setVisionMode(mode: 'jack' | 'john' | 'aria' | 'kai', reducedMotion = false): void {
    this.visionTarget = (mode === 'john' || mode === 'kai') ? 1 : 0
    if (reducedMotion) this.visionStrength_ = this.visionTarget
    this.visionPass.uniforms.uStrength.value = this.visionStrength_
  }

  updateVision(dt: number): void {
    const blend = 1 - Math.exp(-14 * Math.max(0, dt))
    this.visionStrength_ += (this.visionTarget - this.visionStrength_) * blend
    if (Math.abs(this.visionTarget - this.visionStrength_) < 0.001) this.visionStrength_ = this.visionTarget
    this.visionPass.uniforms.uStrength.value = this.visionStrength_
  }

  applyQuality(quality: Quality): void {
    this.preset = QUALITY_PRESETS[quality]
    this.gl.shadowMap.enabled = this.preset.shadows
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio))
    this.bloom?.dispose()
    this.composer?.dispose()
    this.composer = undefined
    this.bloom = undefined
    this.resize()
  }

  private ensureComposer(scene: THREE.Scene, camera: THREE.PerspectiveCamera): EffectComposer {
    if (this.composer && this.scene === scene && this.camera === camera) return this.composer
    this.scene = scene
    this.camera = camera
    const size = this.gl.getSize(new THREE.Vector2())
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    })
    this.composer = new EffectComposer(this.gl, target)
    this.composer.addPass(new RenderPass(scene, camera))
    // The single custom pass sanitizes source pixels and applies Kai's matrix before bloom.
    this.composer.addPass(this.visionPass)
    if (this.preset.bloom) {
      this.bloom = new UnrealBloomPass(size, 0.45, 0.3, 1.6)
      this.composer.addPass(this.bloom)
    }
    this.composer.addPass(new OutputPass())
    this.composer.setSize(size.x, size.y)
    return this.composer
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.gl.setSize(w, h, false)
    this.composer?.setSize(w, h)
    if (this.camera) {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    if (Math.abs(camera.aspect - w / h) > 1e-3) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    this.ensureComposer(scene, camera).render()
  }
}
