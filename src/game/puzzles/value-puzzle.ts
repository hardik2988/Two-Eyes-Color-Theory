import type { IPuzzle, PuzzleId, PuzzleResult, PuzzleState } from './types'

export type VariationType = 'tint' | 'tone' | 'shade' | 'pure'

export interface ColorSample {
  id: string
  label: string
  type: VariationType
  description: string
  whitePercent: number
  greyPercent: number
  blackPercent: number
  hex: string
  luminance: number
}

/**
 * Base Hue: Architectural Prussian Blue (#004080 / HSL 210, 100%, 25%)
 * or Terracotta Ochre (#c05621)
 */
export class ValuePuzzle implements IPuzzle {
  readonly id: PuzzleId = 'value'
  readonly number = 2
  readonly title = 'Tint, Tone, Shade & Value Workstation'
  readonly subtitle = 'Installation 02 · The Value Easel'
  readonly description =
    'Value (relative luminance) is the most powerful accessibility dimension. Match the reference swatch by properly identifying how Tint (adding white), Tone (adding grey), and Shade (adding black) alter a hue.'
  readonly educationalSummary =
    'Hue describes the color family. Tint increases lightness by adding white. Shade decreases lightness by adding black. Tone desaturates by adding neutral grey. Even when red/green hue perception is altered by deuteranopia, value (luminance contrast) remains 100% perceptible and readable.'
  readonly hints = [
    'Observe the target swatch on the easel: note whether it is lighter than the pure hue (tint), softened/muted (tone), or darkened (shade).',
    'Switch to John with Tab: compare the luminance (grayscale brightness) against the value ramp on the workstation wall.',
    'The reference sample is a Tone (pure hue + 40% neutral grey) at 0.50 luminance.',
  ]

  state: PuzzleState = 'locked'

  // Current interactive adjustments
  selectedSampleId: string = ''
  sliderTint: number = 0 // 0 to 100
  sliderTone: number = 0 // 0 to 100
  sliderShade: number = 0 // 0 to 100

  // The target variation is a muted tone
  readonly targetType: VariationType = 'tone'
  readonly targetToneValue: number = 40
  readonly baseHueHex = '#1e3a8a' // Deep Navy

  readonly samples: ColorSample[] = [
    {
      id: 'sample-pure',
      label: 'Pure Hue',
      type: 'pure',
      description: 'Pure Spectral Hue: 100% saturation, unadulterated pigment.',
      whitePercent: 0,
      greyPercent: 0,
      blackPercent: 0,
      hex: '#1e3a8a',
      luminance: 0.22,
    },
    {
      id: 'sample-tint',
      label: 'Tint (Hue + White)',
      type: 'tint',
      description: 'Tint: High value, pastel luminance, lifted with titanium white.',
      whitePercent: 50,
      greyPercent: 0,
      blackPercent: 0,
      hex: '#93c5fd',
      luminance: 0.72,
    },
    {
      id: 'sample-tone',
      label: 'Tone (Hue + Grey)',
      type: 'tone',
      description: 'Tone: Moderate value, muted chroma, desaturated with mid-grey.',
      whitePercent: 0,
      greyPercent: 40,
      blackPercent: 0,
      hex: '#475569',
      luminance: 0.48,
    },
    {
      id: 'sample-shade',
      label: 'Shade (Hue + Black)',
      type: 'shade',
      description: 'Shade: Low value, deep and heavy, darkened with carbon black.',
      whitePercent: 0,
      greyPercent: 0,
      blackPercent: 60,
      hex: '#0f172a',
      luminance: 0.10,
    },
  ]

  get isComplete(): boolean {
    return this.state === 'completed'
  }

  selectSample(id: string): void {
    if (this.state === 'completed') return
    this.selectedSampleId = id
  }

  setAdjustment(tint: number, tone: number, shade: number): void {
    if (this.state === 'completed') return
    this.sliderTint = Math.min(100, Math.max(0, tint))
    this.sliderTone = Math.min(100, Math.max(0, tone))
    this.sliderShade = Math.min(100, Math.max(0, shade))
  }

  check(): PuzzleResult {
    if (this.state === 'locked') {
      return { success: false, message: 'This installation is locked. Solve Installation 01 first.' }
    }

    if (!this.selectedSampleId && this.sliderTone === 0) {
      return { success: false, message: 'Select the matching swatch or adjust the Tone control to match the easel sample.' }
    }

    const matchedSample = this.selectedSampleId === 'sample-tone'
    const matchedSliders = this.sliderTone >= 30 && this.sliderTone <= 50 && this.sliderTint <= 10 && this.sliderShade <= 10

    if (matchedSample || matchedSliders) {
      this.state = 'completed'
      return {
        success: true,
        completed: true,
        message: 'Correct! You correctly distinguished Tone from Tint and Shade. Installation 03 unlocked.',
      }
    }

    if (this.selectedSampleId === 'sample-tint' || this.sliderTint > 30) {
      return {
        success: false,
        message: 'Incorrect: That is a Tint (white added, higher luminance). The easel requires a desaturated Tone.',
      }
    }

    if (this.selectedSampleId === 'sample-shade' || this.sliderShade > 30) {
      return {
        success: false,
        message: 'Incorrect: That is a Shade (black added, lower luminance). The easel requires a balanced Tone.',
      }
    }

    return {
      success: false,
      message: 'Not quite matching the target swatch. Pay attention to how grey affects chroma versus white and black.',
    }
  }

  reset(): void {
    this.selectedSampleId = ''
    this.sliderTint = 0
    this.sliderTone = 0
    this.sliderShade = 0
    if (this.state !== 'completed' && this.state !== 'locked') {
      this.state = 'available'
    }
  }

  getHint(index: number): string {
    return this.hints[Math.min(index, this.hints.length - 1)]
  }
}
