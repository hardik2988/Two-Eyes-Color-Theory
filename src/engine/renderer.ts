import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { DEUTERANOPIA_SHADER } from './color-vision'
import type { Quality } from './save'

type Preset = {
  pixelRatio: number
  shadows: boolean
  shadowMap: number
  bloom: boolean
  gtao: boolean
  antialias: boolean
}

export const QUALITY_PRESETS: Record<Quality, Preset> = {
  low: { pixelRatio: 1.0, shadows: false, shadowMap: 512, bloom: false, gtao: false, antialias: false },
  medium: { pixelRatio: 1.0, shadows: true, shadowMap: 1024, bloom: true, gtao: false, antialias: false },
  high: { pixelRatio: 1.15, shadows: true, shadowMap: 1024, bloom: true, gtao: true, antialias: true },
  ultra: { pixelRatio: 1.35, shadows: true, shadowMap: 2048, bloom: true, gtao: true, antialias: true },
}

/** Pick a starting quality from device hints; defaults to medium on standard laptops for rock-solid 60 fps. */
export function suggestQuality(): Quality {
  if (typeof window === 'undefined') return 'medium'
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse || cores < 4) return 'low'
  if (cores < 8) return 'medium'
  return 'high'
}

/**
 * Owns the WebGL renderer, the post-processing chain and resize handling.
 * Unifies tone mapping, bloom, lens vignette, film grain, and Machado deuteranopia
 * simulation into an optimized single-pass post-processing pipeline.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer
  private composer?: EffectComposer
  private bloom?: UnrealBloomPass
  private smaaPass?: SMAAPass
  private readonly visionPass: ShaderPass
  private visionStrength_ = 0
  private visionTarget = 0
  private preset: Preset
  private scene?: THREE.Scene
  private camera?: THREE.PerspectiveCamera
  private frameCount = 0
  private lastFpsCheck = performance.now()
  private lowFpsCounter = 0
  private currentQuality: Quality
  private onAutoReduce?: (newQuality: Quality) => void

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.currentQuality = quality
    this.preset = QUALITY_PRESETS[quality]
    // Hardware antialias is disabled on canvas since post-processing composer manages output
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 0.8
    this.gl.shadowMap.type = THREE.PCFShadowMap

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
    this.visionTarget = mode === 'john' || mode === 'kai' ? 1 : 0
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
    this.currentQuality = quality
    this.preset = QUALITY_PRESETS[quality]
    this.gl.shadowMap.enabled = this.preset.shadows
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio, 1.75))
    this.bloom?.dispose()
    this.smaaPass?.dispose()
    this.composer?.dispose()
    this.composer = undefined
    this.bloom = undefined
    this.smaaPass = undefined
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

    // 2. High-Performance Half-Resolution Ground Truth Ambient Occlusion (High / Ultra only)
    if (this.preset.gtao) {
      const gtaoW = Math.max(256, Math.floor(size.x * 0.45))
      const gtaoH = Math.max(180, Math.floor(size.y * 0.45))
      const gtao = new GTAOPass(scene, camera, gtaoW, gtaoH)
      gtao.output = GTAOPass.OUTPUT.Default
      gtao.blendIntensity = 1.25
      gtao.pdSamples = this.currentQuality === 'ultra' ? 10 : 8
      gtao.pdRings = 2
      gtao.updateGtaoMaterial({
        radius: 0.5,
        distanceFallOff: 1.0,
        scale: 1.15,
      })
      this.composer.addPass(gtao)
    }

    // 3. Gentle Optical Bloom (Threshold 0.97: limited strictly to sun and window highlights)
    if (this.preset.bloom) {
      const bloomSize = new THREE.Vector2(Math.floor(size.x * 0.4), Math.floor(size.y * 0.4))
      this.bloom = new UnrealBloomPass(bloomSize, 0.12, 0.2, 0.97)
      this.composer.addPass(this.bloom)
    }

    // 4. ACES Filmic Tone Mapping and sRGB output encoding
    this.composer.addPass(new OutputPass())

    // 5. Subpixel Morphological Antialiasing (SMAA) (High / Ultra only)
    if (this.preset.antialias) {
      this.smaaPass = new SMAAPass()
      this.composer.addPass(this.smaaPass)
    }

    // 6. FINAL COMBINED PASS: Vignette + Microscopic Film Grain + Machado Deuteranopia Matrix
    this.composer.addPass(this.visionPass)

    this.composer.setSize(size.x, size.y)
    return this.composer
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.gl.setSize(w, h, false)
    this.composer?.setSize(w, h)
    this.smaaPass?.setSize(w, h)
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

    // Adaptive Performance Monitor (Target: stable 60 FPS, auto-reduce quality gracefully under sustained load)
    this.frameCount++
    const now = performance.now()
    if (now - this.lastFpsCheck >= 1000) {
      const fps = (this.frameCount * 1000) / (now - this.lastFpsCheck)
      this.frameCount = 0
      this.lastFpsCheck = now

      if (fps < 45) {
        this.lowFpsCounter++
        if (this.lowFpsCounter >= 2) {
          this.lowFpsCounter = 0
          if (this.currentQuality === 'ultra') this.onAutoReduce?.('high')
          else if (this.currentQuality === 'high') this.onAutoReduce?.('medium')
          else if (this.currentQuality === 'medium' && fps < 35) this.onAutoReduce?.('low')
        }
      } else {
        this.lowFpsCounter = Math.max(0, this.lowFpsCounter - 1)
      }
    }

    // Fast-path direct render on Low preset when standard trichromat vision is active
    if (!this.preset.bloom && !this.preset.gtao && !this.preset.antialias && this.visionStrength_ < 0.001) {
      this.gl.render(scene, camera)
      return
    }

    this.visionPass.uniforms.uTime.value = performance.now() * 0.001
    this.ensureComposer(scene, camera).render()
  }
}
