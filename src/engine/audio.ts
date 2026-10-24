/**
 * Web Audio mixer with music and SFX buses. Browsers only allow audio after a user gesture, so
 * call `unlock()` from the first click/key press (the title screen does this).
 *
 * The starter ships no audio files: SFX are synthesized and the music is a generative ambient
 * pad. To use recorded assets, `load(url)` an AudioBuffer and `playBuffer()` it on either bus.
 */
export type Sfx =
  | 'pickup'
  | 'jump'
  | 'land'
  | 'hurt'
  | 'ui'
  | 'win'
  | 'lose'
  | 'dash'
  | 'footstep'
  | 'paint'
  | 'frame'
  | 'vault_bolt'
  | 'puzzle_success'
  | 'puzzle_fail'

export class Audio {
  readonly ctx: AudioContext
  private master: GainNode
  private music: GainNode
  private sfx: GainNode
  private musicTimer = 0
  private musicOn = false
  private buffers = new Map<string, AudioBuffer>()

  constructor() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.music = this.ctx.createGain()
    this.sfx = this.ctx.createGain()
    this.music.connect(this.master)
    this.sfx.connect(this.master)
    this.master.connect(this.ctx.destination)
  }

  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  /** Volumes in 0..1. */
  setVolumes(music: number, sfx: number, muted = false): void {
    const t = this.ctx.currentTime
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

  play(name: Sfx): void {
    if (this.ctx.state !== 'running') return
    const t = this.ctx.currentTime

    const tone = (freq: number, end: number, dur: number, type: OscillatorType, vol: number, delay = 0) => {
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.type = type
      o.frequency.setValueAtTime(freq, t + delay)
      o.frequency.exponentialRampToValueAtTime(Math.max(end, 20), t + delay + dur)
      g.gain.setValueAtTime(0.0001, t + delay)
      g.gain.linearRampToValueAtTime(vol, t + delay + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur)
      o.connect(g).connect(this.sfx)
      o.start(t + delay)
      o.stop(t + delay + dur + 0.05)
    }

    const noiseTap = (dur: number, filterFreq: number, vol: number, delay = 0) => {
      const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * dur))
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3))
      }
      const noise = this.ctx.createBufferSource()
      noise.buffer = buffer
      const filter = this.ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(filterFreq, t + delay)
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(vol, t + delay)
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur)
      noise.connect(filter).connect(g).connect(this.sfx)
      noise.start(t + delay)
    }

    switch (name) {
      case 'pickup':
        tone(880, 1320, 0.12, 'triangle', 0.28)
        tone(1320, 1760, 0.16, 'sine', 0.22, 0.05)
        break
      case 'jump':
        tone(280, 560, 0.14, 'triangle', 0.14)
        break
      case 'land':
        noiseTap(0.08, 220, 0.18)
        tone(140, 60, 0.09, 'sine', 0.2)
        break
      case 'hurt':
        tone(180, 80, 0.22, 'sawtooth', 0.18)
        break
      case 'ui':
        // Crisp haptic ceramic/glass micro-tap
        tone(784, 820, 0.035, 'triangle', 0.14)
        tone(1568, 1600, 0.025, 'sine', 0.08, 0.008)
        break
      case 'dash':
        tone(440, 160, 0.16, 'sawtooth', 0.08)
        noiseTap(0.14, 600, 0.12)
        break
      case 'footstep': {
        // Natural Scandinavian oak timber heel step with organic pitch variation
        const pitchVar = 0.94 + Math.random() * 0.12
        noiseTap(0.045, 340 * pitchVar, 0.09)
        tone(115 * pitchVar, 55 * pitchVar, 0.06, 'sine', 0.12)
        break
      }
      case 'paint':
        // Wet oil paint palette swirl & glass chime
        tone(440, 660, 0.14, 'sine', 0.16)
        tone(660, 880, 0.12, 'triangle', 0.12, 0.04)
        tone(1100, 1320, 0.1, 'sine', 0.08, 0.08)
        break
      case 'frame':
        // Museum frame alignment & brass mounting click
        noiseTap(0.06, 480, 0.12)
        tone(240, 160, 0.09, 'triangle', 0.18)
        tone(520, 480, 0.06, 'sine', 0.12, 0.03)
        break
      case 'vault_bolt':
        // Subterranean hydraulic lock bolt disengage and heavy metallic clank
        tone(55, 40, 0.45, 'sine', 0.35)
        noiseTap(0.18, 180, 0.28, 0.04)
        tone(160, 85, 0.32, 'sawtooth', 0.18, 0.06)
        tone(220, 110, 0.28, 'triangle', 0.16, 0.14)
        break
      case 'puzzle_success':
        // Lush C-major 9th acoustic chime resolution
        [523.25, 659.25, 783.99, 987.77, 1046.5].forEach((f, i) => {
          tone(f, f * 1.002, 0.48, 'triangle', 0.22, i * 0.075)
          tone(f * 2, f * 2, 0.32, 'sine', 0.08, i * 0.075 + 0.02)
        })
        break
      case 'puzzle_fail':
        [329.63, 293.66].forEach((f, i) => tone(f, f * 0.98, 0.26, 'sine', 0.18, i * 0.08))
        break
      case 'win':
        // Grand orchestral exhibition climax chord
        [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          tone(f, f * 1.001, 0.65, 'triangle', 0.2, i * 0.08)
          tone(f * 2, f * 2, 0.4, 'sine', 0.07, i * 0.08 + 0.02)
        })
        break
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.98, 0.4, 'sine', 0.22, i * 0.14))
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
