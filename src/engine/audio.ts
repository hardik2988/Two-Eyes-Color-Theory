/**
 * Web Audio mixer with music and SFX buses. Browsers only allow audio after a user gesture, so
 * call `unlock()` from the first click/key press (the title screen and user inputs do this).
 *
 * Implements physical acoustic modeling (modal synthesis, resonant cavity filters,
 * multi-layer transients, and architectural gallery room reverberation) for organic,
 * hyper-realistic auditory feedback.
 */
export type Sfx =
  | 'pickup'
  | 'jump'
  | 'land'
  | 'hurt'
  | 'ui'
  | 'ui_hover'
  | 'slider'
  | 'win'
  | 'lose'
  | 'dash'
  | 'footstep'
  | 'paint'
  | 'paint_drop'
  | 'palette_scrape'
  | 'frame'
  | 'frame_slide'
  | 'easel_adjust'
  | 'vault_bolt'
  | 'keypad_press'
  | 'lens_flip'
  | 'station_focus'
  | 'puzzle_success'
  | 'puzzle_fail'

export class Audio {
  readonly ctx: AudioContext
  private master: GainNode
  private music: GainNode
  private sfx: GainNode
  private sfxDry: GainNode
  private reverb: ConvolverNode
  private reverbGain: GainNode
  private whiteNoiseBuf: AudioBuffer
  private pinkNoiseBuf: AudioBuffer
  private musicTimer = 0
  private musicOn = false
  private buffers = new Map<string, AudioBuffer>()
  private stepAlt = false

  constructor() {
    const AudioCtx =
      typeof window !== 'undefined'
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        : AudioContext
    this.ctx = new AudioCtx()
    this.master = this.ctx.createGain()
    this.music = this.ctx.createGain()
    this.sfx = this.ctx.createGain()
    this.sfxDry = this.ctx.createGain()
    this.reverbGain = this.ctx.createGain()

    // Bus routing: dry path and wet room reverb path both feed into SFX bus
    this.sfxDry.connect(this.sfx)
    this.reverbGain.connect(this.sfx)

    this.music.connect(this.master)
    this.sfx.connect(this.master)
    this.master.connect(this.ctx.destination)

    // Pre-generate noise buffers (1 second at native sample rate)
    const sr = this.ctx.sampleRate || 44100
    this.whiteNoiseBuf = this.ctx.createBuffer(1, sr, sr)
    const wData = this.whiteNoiseBuf.getChannelData(0)
    for (let i = 0; i < sr; i++) wData[i] = Math.random() * 2 - 1

    this.pinkNoiseBuf = this.ctx.createBuffer(1, sr, sr)
    const pData = this.pinkNoiseBuf.getChannelData(0)
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0
    for (let i = 0; i < sr; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.969 * b2 + white * 0.153852
      b3 = 0.8665 * b3 + white * 0.3104856
      b4 = 0.55 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.016898
      pData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
      b6 = white * 0.115926
    }

    // Pre-generate gallery acoustic impulse response (high-ceiling architectural space)
    const revDur = 1.0
    const revLen = Math.floor(sr * revDur)
    const revBuf = this.ctx.createBuffer(2, revLen, sr)
    const rL = revBuf.getChannelData(0)
    const rR = revBuf.getChannelData(1)
    for (let i = 0; i < revLen; i++) {
      const decay = Math.exp(-i / (sr * 0.28))
      rL[i] = (Math.random() * 2 - 1) * decay
      rR[i] = (Math.random() * 2 - 1) * decay
    }
    this.reverb = this.ctx.createConvolver()
    this.reverb.buffer = revBuf
    this.reverb.connect(this.reverbGain)
    this.reverbGain.gain.setValueAtTime(0.2, this.ctx.currentTime)
  }

  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  /** Volumes in 0..1. */
  setVolumes(music: number, sfx: number, muted = false): void {
    const t = this.ctx.currentTime
    this.music.gain.cancelScheduledValues(t)
    this.sfx.gain.cancelScheduledValues(t)
    this.music.gain.setTargetAtTime(muted ? 0 : music * 0.55, t, 0.05)
    this.sfx.gain.setTargetAtTime(muted ? 0 : sfx * 0.8, t, 0.05)
  }

  async load(url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(url)
    if (cached) return cached
    const data = await (await fetch(url)).arrayBuffer()
    const buffer = await this.ctx.decodeAudioData(data)
    this.buffers.set(url, buffer)
    return buffer
  }

  playBuffer(buffer: AudioBuffer, bus: 'music' | 'sfx' = 'sfx', loop = false): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = loop
    src.connect(bus === 'music' ? this.music : this.sfx)
    src.start()
    return src
  }

  private playTone(
    freq: number,
    endFreq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    opts?: {
      delay?: number
      filterFreq?: number
      filterType?: BiquadFilterType
      filterQ?: number
      reverb?: number
    },
  ): void {
    const t = this.ctx.currentTime + (opts?.delay ?? 0)
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(Math.max(20, freq), t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur)

    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.linearRampToValueAtTime(vol, t + Math.min(0.006, dur * 0.2))
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)

    let node: AudioNode = osc
    if (opts?.filterFreq) {
      const f = this.ctx.createBiquadFilter()
      f.type = opts.filterType ?? 'lowpass'
      f.frequency.setValueAtTime(opts.filterFreq, t)
      if (opts.filterQ) f.Q.setValueAtTime(opts.filterQ, t)
      node.connect(f)
      node = f
    }
    node.connect(gain)
    gain.connect(this.sfxDry)
    if (opts?.reverb) {
      const revSend = this.ctx.createGain()
      revSend.gain.setValueAtTime(opts.reverb, t)
      gain.connect(revSend).connect(this.reverb)
    }

    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  private playNoise(
    dur: number,
    filterFreq: number,
    vol: number,
    opts?: {
      delay?: number
      filterType?: BiquadFilterType
      filterQ?: number
      pink?: boolean
      reverb?: number
    },
  ): void {
    const t = this.ctx.currentTime + (opts?.delay ?? 0)
    const src = this.ctx.createBufferSource()
    src.buffer = opts?.pink ? this.pinkNoiseBuf : this.whiteNoiseBuf
    src.loop = true

    const filter = this.ctx.createBiquadFilter()
    filter.type = opts?.filterType ?? 'bandpass'
    filter.frequency.setValueAtTime(filterFreq, t)
    if (opts?.filterQ) filter.Q.setValueAtTime(opts.filterQ, t)

    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.linearRampToValueAtTime(vol, t + Math.min(0.004, dur * 0.25))
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)

    src.connect(filter).connect(gain)
    gain.connect(this.sfxDry)
    if (opts?.reverb) {
      const revSend = this.ctx.createGain()
      revSend.gain.setValueAtTime(opts.reverb, t)
      gain.connect(revSend).connect(this.reverb)
    }

    src.start(t)
    src.stop(t + dur + 0.05)
  }

  play(name: Sfx): void {
    if (this.ctx.state !== 'running') return

    switch (name) {
      case 'footstep': {
        // Real Scandinavian oak timber floor impact with alternating foot dynamics
        this.stepAlt = !this.stepAlt
        const p = (this.stepAlt ? 1.02 : 0.96) * (0.97 + Math.random() * 0.06)

        // Leather heel/sole strike transient (high-frequency filtered impact)
        this.playNoise(0.018, 1950 * p, 0.12, { filterType: 'bandpass', filterQ: 2.2, reverb: 0.18 })

        // Oak plank flexing resonance (cavity vibration)
        this.playTone(122 * p, 110 * p, 0.065, 'triangle', 0.18, { filterFreq: 320, reverb: 0.2 })
        this.playTone(240 * p, 215 * p, 0.045, 'sine', 0.09, { filterFreq: 450 })

        // Subfloor cavity thump (low body weight)
        this.playTone(74 * p, 46 * p, 0.042, 'sine', 0.16)

        // Subtle timber scuff
        this.playNoise(0.032, 1150 * p, 0.04, { filterType: 'bandpass', pink: true })
        break
      }

      case 'ui': {
        // Modern luxury ceramic/glass haptic tap (clean, snappy, non-tonal)
        this.playNoise(0.004, 2100, 0.1, { filterType: 'bandpass', filterQ: 2.0 })
        this.playTone(940, 880, 0.009, 'triangle', 0.06, { filterFreq: 1400 })
        break
      }

      case 'ui_hover': {
        // Ultra-subtle tactile micro-tick for UI element hover
        this.playNoise(0.002, 2800, 0.025, { filterType: 'bandpass', filterQ: 2.8 })
        break
      }

      case 'slider': {
        // Tactile notch detent click when sliding settings ranges
        this.playNoise(0.003, 1450, 0.04, { filterType: 'bandpass', filterQ: 2.2 })
        this.playTone(620, 580, 0.006, 'triangle', 0.03)
        break
      }

      case 'lens_flip': {
        // Mechanical optical lens turret / camera aperture snap (Jack <-> John vision toggle)
        // Shutter lever release
        this.playNoise(0.008, 3600, 0.09, { filterType: 'highpass' })
        this.playTone(850, 620, 0.015, 'sawtooth', 0.07, { filterFreq: 1200 })
        // Glass element rotation & click
        this.playNoise(0.014, 1650, 0.12, { delay: 0.022, filterType: 'bandpass', filterQ: 2.5 })
        this.playTone(2850, 2600, 0.018, 'sine', 0.08, { delay: 0.022, reverb: 0.15 })
        // Ball detent locking
        this.playTone(3200, 3100, 0.038, 'sine', 0.06, { delay: 0.036, reverb: 0.2 })
        this.playTone(380, 260, 0.032, 'triangle', 0.1, { delay: 0.036 })
        break
      }

      case 'paint':
      case 'paint_drop': {
        // Viscous wet oil pigment dollop and palette drop
        this.playNoise(0.02, 1750, 0.1, { filterType: 'bandpass', filterQ: 1.8, reverb: 0.12 })
        this.playTone(540, 240, 0.042, 'sine', 0.14)
        // Secondary droplet
        this.playTone(720, 380, 0.025, 'sine', 0.06, { delay: 0.028 })
        this.playNoise(0.016, 2200, 0.04, { delay: 0.028, filterType: 'bandpass' })
        break
      }

      case 'palette_scrape': {
        // Palette knife textured scrape across wooden palette
        this.playNoise(0.085, 2700, 0.09, { filterType: 'bandpass', filterQ: 1.6, pink: true, reverb: 0.15 })
        this.playTone(3100, 2700, 0.065, 'sine', 0.04, { filterFreq: 3400 })
        break
      }

      case 'easel_adjust': {
        // Wooden ratchet notch clack and easel peg seating
        this.playNoise(0.014, 1850, 0.08, { filterType: 'bandpass', filterQ: 2.4 })
        this.playTone(390, 340, 0.036, 'triangle', 0.15, { filterFreq: 750, reverb: 0.18 })
        this.playTone(860, 800, 0.028, 'sine', 0.08, { filterFreq: 1100 })
        break
      }

      case 'frame':
      case 'frame_slide': {
        // Velvet-backed hardwood frame sliding and solid mounting bracket lock
        this.playNoise(0.065, 880, 0.07, { filterType: 'bandpass', pink: true })
        this.playNoise(0.018, 1600, 0.09, { delay: 0.032, filterType: 'bandpass', filterQ: 2.0 })
        this.playTone(245, 190, 0.048, 'triangle', 0.16, { delay: 0.032, filterFreq: 500, reverb: 0.22 })
        this.playTone(540, 480, 0.038, 'sine', 0.1, { delay: 0.032, filterFreq: 850 })
        break
      }

      case 'keypad_press': {
        // Tactile mechanical keyboard switch clack
        this.playNoise(0.003, 3900, 0.11, { filterType: 'highpass' })
        this.playTone(490, 420, 0.014, 'triangle', 0.13, { filterFreq: 900 })
        this.playTone(2250, 2180, 0.018, 'sine', 0.04, { delay: 0.004, reverb: 0.15 })
        break
      }

      case 'vault_bolt': {
        // Subterranean multi-stage vault mechanism: precision tumblers + heavy bolt slide + massive resonant latch
        this.playNoise(0.008, 2800, 0.1, { filterType: 'bandpass', filterQ: 3.0 })
        this.playTone(2350, 2200, 0.016, 'sine', 0.08, { reverb: 0.25 })
        this.playNoise(0.008, 3400, 0.11, { delay: 0.032, filterType: 'bandpass', filterQ: 3.0 })
        this.playTone(3150, 3000, 0.016, 'sine', 0.09, { delay: 0.032, reverb: 0.25 })
        this.playNoise(0.01, 4100, 0.12, { delay: 0.068, filterType: 'bandpass', filterQ: 3.0 })
        this.playTone(4200, 4000, 0.018, 'sine', 0.1, { delay: 0.068, reverb: 0.3 })

        // Heavy bolt friction slide
        this.playNoise(0.2, 280, 0.18, { delay: 0.035, filterType: 'lowpass', pink: true })

        // Subterranean heavy steel latch disengagement
        this.playTone(44, 30, 0.42, 'sine', 0.35, { delay: 0.11, filterFreq: 180, reverb: 0.45 })
        this.playTone(125, 88, 0.24, 'triangle', 0.22, { delay: 0.11, filterFreq: 320, reverb: 0.35 })
        this.playTone(285, 210, 0.18, 'sawtooth', 0.12, { delay: 0.11, filterFreq: 450, reverb: 0.3 })
        break
      }

      case 'station_focus': {
        // Delicate acoustic focus shimmer when targeting an interactive workstation
        this.playTone(1175, 1175, 0.075, 'sine', 0.035, { reverb: 0.25 })
        this.playTone(587, 587, 0.065, 'sine', 0.02, { reverb: 0.2 })
        break
      }

      case 'puzzle_success': {
        // Museum-grade acoustic vibraphone & tubular chime chord with room resonance
        const chord = [
          { f: 349.23, vol: 0.22, delay: 0.0 }, // F4
          { f: 523.25, vol: 0.24, delay: 0.038 }, // C5
          { f: 698.46, vol: 0.22, delay: 0.076 }, // F5
          { f: 880.0, vol: 0.2, delay: 0.114 }, // A5
          { f: 1046.5, vol: 0.18, delay: 0.152 }, // C6
        ]
        chord.forEach(({ f, vol, delay }) => {
          this.playTone(f, f * 1.001, 0.95, 'sine', vol, { delay, reverb: 0.45 })
          this.playTone(f * 2.756, f * 2.756, 0.55, 'sine', vol * 0.35, { delay, reverb: 0.35 })
          this.playNoise(0.012, f * 2.2, vol * 0.28, { delay, filterType: 'bandpass', filterQ: 3.5 })
        })
        break
      }

      case 'puzzle_fail': {
        // Damped hardwood lock rejection thud
        this.playTone(125, 78, 0.045, 'triangle', 0.13, { filterFreq: 220 })
        this.playTone(88, 55, 0.055, 'sine', 0.15, { delay: 0.045 })
        this.playNoise(0.025, 650, 0.07, { delay: 0.045, filterType: 'bandpass' })
        break
      }

      case 'win': {
        // Grand orchestral gallery tubular chime celebration with long reverb decay
        const notes = [261.63, 392.0, 523.25, 659.25, 783.99, 987.77, 1046.5, 1318.51]
        notes.forEach((f, i) => {
          const delay = i * 0.068
          this.playTone(f, f * 1.001, 1.8, 'sine', 0.24, { delay, reverb: 0.55 })
          this.playTone(f * 2.756, f * 2.756, 0.85, 'sine', 0.08, { delay, reverb: 0.4 })
          this.playNoise(0.015, f * 2.0, 0.07, { delay, filterType: 'bandpass', filterQ: 4.0 })
        })
        break
      }

      case 'lose': {
        ;[440, 370, 311, 220].forEach((f, i) => {
          const delay = i * 0.14
          this.playTone(f, f * 0.98, 0.55, 'sine', 0.16, { delay, reverb: 0.3 })
        })
        break
      }

      case 'pickup':
        this.playTone(880, 880, 0.18, 'sine', 0.18, { reverb: 0.3 })
        this.playTone(1320, 1320, 0.22, 'sine', 0.15, { delay: 0.045, reverb: 0.35 })
        break

      case 'jump':
        this.playNoise(0.045, 520, 0.09, { filterType: 'bandpass', pink: true })
        this.playTone(180, 320, 0.08, 'sine', 0.12)
        break

      case 'land':
        this.playNoise(0.04, 750, 0.15, { filterType: 'bandpass' })
        this.playTone(95, 50, 0.08, 'sine', 0.22, { reverb: 0.25 })
        break

      case 'hurt':
        this.playTone(140, 60, 0.18, 'triangle', 0.16, { filterFreq: 300 })
        this.playNoise(0.06, 400, 0.12, { filterType: 'lowpass' })
        break

      case 'dash':
        this.playNoise(0.12, 600, 0.1, { filterType: 'bandpass', pink: true })
        this.playTone(320, 140, 0.12, 'sine', 0.08)
        break
    }
  }

  /** Generative ambient pad: lush neo-classical chords in a gallery acoustic space */
  startMusic(): void {
    if (this.musicOn) return
    this.musicOn = true
    if (this.ctx.state === 'running') {
      const t = this.ctx.currentTime
      this.music.gain.cancelScheduledValues(t)
      this.music.gain.setTargetAtTime(0.55, t, 0.1)
    }
    // Rich architectural neo-classical chord voicings: Am9 → Gmaj7 → Fmaj7(#11) → E7sus4
    const chords = [
      [220, 261.63, 329.63, 392.0, 493.88],
      [196, 246.94, 293.66, 392.0, 440.0],
      [174.61, 220.0, 261.63, 329.63, 370.0],
      [164.81, 220.0, 246.94, 329.63, 392.0],
    ]
    let bar = 0
    const schedule = () => {
      if (!this.musicOn) return
      const t = this.ctx.currentTime + 0.05
      const chord = chords[bar % chords.length]
      for (const f of chord) {
        for (const detune of [-5, 5]) {
          const o = this.ctx.createOscillator()
          const g = this.ctx.createGain()
          const filter = this.ctx.createBiquadFilter()
          filter.type = 'lowpass'
          filter.frequency.setValueAtTime(1150, t)

          o.type = 'sine'
          o.frequency.value = f / 2
          o.detune.value = detune
          g.gain.setValueAtTime(0.0001, t)
          g.gain.linearRampToValueAtTime(0.038, t + 1.4)
          g.gain.linearRampToValueAtTime(0.0001, t + 4.4)
          o.connect(filter).connect(g).connect(this.music)
          o.start(t)
          o.stop(t + 4.6)
        }
      }
      bar += 1
      this.musicTimer = window.setTimeout(schedule, 3700)
    }
    schedule()
  }

  stopMusic(): void {
    this.musicOn = false
    clearTimeout(this.musicTimer)
    if (this.ctx.state === 'running') {
      const t = this.ctx.currentTime
      this.music.gain.cancelScheduledValues(t)
      this.music.gain.setTargetAtTime(0, t, 0.05)
    }
  }
}
