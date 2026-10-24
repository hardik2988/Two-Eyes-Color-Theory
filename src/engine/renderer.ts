import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { DEUTERANOPIA_SHADER } from './color-vision'
import { LENS_SHADER } from './lens-shader'
import type { Quality } from './save'

type Preset = { pixelRatio: number; shadows: boolean; shadowMap: number; bloom: boolean; antialias: boolean }
export const QUALITY_PRESETS: Record<Quality, Preset> = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 512, bloom: false, antialias: false },
  medium: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, bloom: false, antialias: true },
  high: { pixelRatio: 2.0, shadows: true, shadowMap: 2048, bloom: true, antialias: true },
  ultra: { pixelRatio: 2.0, shadows: true, shadowMap: 4096, bloom: true, antialias: true },
}

/** Pick a starting quality from device hints; the player can override it in Settings. */
export function suggestQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse || cores <= 4) return 'medium'
  return 'high'
}

/**
 * Owns the WebGL renderer, the post-processing chain and resize handling.
 * Color-vision transform is guaranteed to execute as the final stage of the pipeline
 * after tone mapping, bloom, and lens vignette so lighting never distorts the medical matrix.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer
  private composer?: EffectComposer
  private bloom?: UnrealBloomPass
  private readonly lensPass: ShaderPass
  private readonly visionPass: ShaderPass
  private visionStrength_ = 0
  private visionTarget = 0
  private preset: Preset
  private scene?: THREE.Scene
  private camera?: THREE.PerspectiveCamera
  private frameCount = 0
  private lastFpsCheck = performance.now()
  private lowFpsCounter = 0
  private onAutoReduce?: (newQuality: Quality) => void

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.preset = QUALITY_PRESETS[quality]
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: this.preset.antialias, powerPreference: 'high-performance' })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 0.85
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap

    this.lensPass = new ShaderPass(LENS_SHADER)
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

  setAutoReduceCallback(cb: (newQuality: Quality) => void): void {
    this.onAutoReduce = cb
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
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio, 2.0))
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

    // 1. Base 3D Scene Render Pass
    this.composer.addPass(new RenderPass(scene, camera))

    // 2. High-Quality Ground Truth Ambient Occlusion (Contact shadows under props, benches, boxes)
    if (this.preset.shadows) {
      const gtao = new GTAOPass(scene, camera, size.x, size.y)
      gtao.output = GTAOPass.OUTPUT.Default
      gtao.blendIntensity = 0.85
      gtao.updateGtaoMaterial({
        radius: 0.35,
        distanceFallOff: 1.0,
        scale: 1.0,
      })
      this.composer.addPass(gtao)
    }

    // 3. Optical Bloom (High threshold, subtle highlight glow on sunbeams & lighting)
    if (this.preset.bloom) {
      this.bloom = new UnrealBloomPass(size, 0.16, 0.18, 0.95)
      this.composer.addPass(this.bloom)
    }

    // 4. ACES Filmic Tone Mapping and sRGB output encoding
    this.composer.addPass(new OutputPass())

    // 5. Subtle Architectural Lens Vignette and Microscopic Film Grain
    this.composer.addPass(this.lensPass)

    // 6. FINAL PASS: Color-Vision Simulation (Applied LAST so post-processing never corrupts deuteranopia matrix)
    this.composer.addPass(this.visionPass)

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

    // Adaptive Performance Monitor (60 FPS target, auto-reduce quality if below ~50 FPS for sustained period)
    this.frameCount++
    const now = performance.now()
    if (now - this.lastFpsCheck >= 1000) {
      const fps = (this.frameCount * 1000) / (now - this.lastFpsCheck)
      this.frameCount = 0
      this.lastFpsCheck = now

      if (fps < 48 && this.gl.shadowMap.enabled) {
        this.lowFpsCounter++
        if (this.lowFpsCounter >= 3) {
          this.lowFpsCounter = 0
          this.onAutoReduce?.('medium')
        }
      } else {
        this.lowFpsCounter = Math.max(0, this.lowFpsCounter - 1)
      }
    }

    this.lensPass.uniforms.uTime.value = performance.now() * 0.001
    this.ensureComposer(scene, camera).render()
  }
}
