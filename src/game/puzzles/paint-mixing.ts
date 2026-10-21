import type { IPuzzle, PuzzleId, PuzzleResult, PuzzleState } from './types'

export interface Pigment {
  id: string
  name: string
  symbol: 'circle' | 'triangle' | 'square' | 'diamond'
  symbolChar: string
  colorHex: string
  rgb: [number, number, number] // normalized 0..1
  reflectance: [number, number, number] // subtractive reflectance spectrum
  luminance: number // relative brightness for monochrome/deuteranopia cues
  description: string
}

export const STUDIO_PIGMENTS: Pigment[] = [
  {
    id: 'ultramarine',
    name: 'Cobalt Ultramarine',
    symbol: 'circle',
    symbolChar: '●',
    colorHex: '#1d4ed8',
    rgb: [0.11, 0.31, 0.85],
    reflectance: [0.15, 0.35, 0.95],
    luminance: 0.28,
    description: 'Deep blue pigment. Marked with circle symbol. Absorbs long red and amber wavelengths.',
  },
  {
    id: 'cadmium-yellow',
    name: 'Cadmium Lemon',
    symbol: 'triangle',
    symbolChar: '▲',
    colorHex: '#eab308',
    rgb: [0.92, 0.70, 0.03],
    reflectance: [0.95, 0.88, 0.12],
    luminance: 0.82,
    description: 'Luminous yellow pigment. Marked with triangle symbol. Absorbs short blue and violet wavelengths.',
  },
  {
    id: 'crimson',
    name: 'Alizarin Crimson',
    symbol: 'square',
    symbolChar: '■',
    colorHex: '#b91c1c',
    rgb: [0.73, 0.11, 0.11],
    reflectance: [0.92, 0.15, 0.22],
    luminance: 0.31,
    description: 'Rich red pigment. Marked with square symbol. Absorbs mid-spectrum green wavelengths.',
  },
  {
    id: 'titanium-white',
    name: 'Titanium White',
    symbol: 'diamond',
    symbolChar: '◆',
    colorHex: '#f8fafc',
    rgb: [0.97, 0.98, 0.99],
    reflectance: [0.98, 0.98, 0.98],
    luminance: 0.98,
    description: 'Opaque white base. Marked with diamond symbol. Raises value and lowers chromatic saturation.',
  },
]

/**
 * Subtractive spectral pigment mixing simulation (Beer-Lambert / subtractive absorption model).
 * Unlike additive RGB screens (where red + green = yellow light),
 * mixing physical pigments multiplies transmittance/reflectance: blue + yellow = green!
 */
export function mixPigments(selectedIds: string[]): { hex: string; rgb: [number, number, number]; name: string } {
  if (selectedIds.length === 0) {
    return { hex: '#d4cebe', rgb: [0.83, 0.81, 0.75], name: 'Raw Canvas' }
  }

  const pigments = selectedIds
    .map(id => STUDIO_PIGMENTS.find(p => p.id === id))
    .filter((p): p is Pigment => p !== undefined)

  if (pigments.length === 0) {
    return { hex: '#d4cebe', rgb: [0.83, 0.81, 0.75], name: 'Raw Canvas' }
  }

  if (pigments.length === 1) {
    return { hex: pigments[0].colorHex, rgb: pigments[0].rgb, name: pigments[0].name }
  }

  // Subtractive synthesis: reflectance is geometric mean of spectral absorption
  const rMult = pigments.reduce((acc, p) => acc * p.reflectance[0], 1) ** (1 / pigments.length)
  const gMult = pigments.reduce((acc, p) => acc * p.reflectance[1], 1) ** (1 / pigments.length)
  const bMult = pigments.reduce((acc, p) => acc * p.reflectance[2], 1) ** (1 / pigments.length)

  // Clamp & tone-correct for natural pigment saturation
  const scale = 1.08
  const r = Math.min(1, Math.max(0, rMult * scale))
  const g = Math.min(1, Math.max(0, gMult * scale))
  const b = Math.min(1, Math.max(0, bMult * scale))

  const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0')
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`

  // Classify resulting mixture
  const ids = [...selectedIds].sort()
  let name = 'Custom Mixture'
  if (ids.includes('ultramarine') && ids.includes('cadmium-yellow') && ids.length === 2) {
    name = 'Viridian Leaf Green'
  } else if (ids.includes('cadmium-yellow') && ids.includes('crimson') && ids.length === 2) {
    name = 'Warm Tangerine Orange'
  } else if (ids.includes('ultramarine') && ids.includes('crimson') && ids.length === 2) {
    name = 'Royal Imperial Violet'
  } else if (ids.includes('ultramarine') && ids.includes('cadmium-yellow') && ids.includes('titanium-white')) {
    name = 'Soft Sage Green Tint'
  }

  return { hex, rgb: [r, g, b], name }
}

export class PaintMixingPuzzle implements IPuzzle {
  readonly id: PuzzleId = 'paint-mixing'
  readonly number = 1
  readonly title = 'Subtractive Pigment Mixing'
  readonly subtitle = 'Installation 01 · The Mixing Bench'
  readonly description =
    'Reproduce the exhibition lock colour (Viridian Leaf Green). Digital screens use additive RGB light (Red + Green = Yellow), but artist pigments work by subtractive light absorption.'
  readonly educationalSummary =
    'In subtractive mixing, pigments absorb (subtract) light wavelengths. Blue absorbs red light; yellow absorbs blue light. The only wavelength both reflect back to our eyes is green. For deuteranopes like John, relying on canister shapes (● Circle + ▲ Triangle) and value contrast ensures reliable colour identification.'
  readonly hints = [
    'Check the exhibition plaque: you need to create a secondary Green hue from two primary pigments.',
    'Jack sees that Cobalt Blue and Cadmium Yellow will create green. John notes that the Circle (●) and Triangle (▲) canisters combine to produce the target.',
    'Select Cobalt Ultramarine (●) and Cadmium Lemon (▲) together, then test the blend.',
  ]

  state: PuzzleState = 'available'
  selectedPigments: string[] = []
  targetPigments = ['ultramarine', 'cadmium-yellow']
  targetName = 'Viridian Leaf Green'
  targetHex = '#15803d'

  get isComplete(): boolean {
    return this.state === 'completed'
  }

  selectPigment(id: string): void {
    if (this.state === 'completed') return
    const idx = this.selectedPigments.indexOf(id)
    if (idx >= 0) {
      this.selectedPigments.splice(idx, 1)
    } else {
      if (this.selectedPigments.length < 3) {
        this.selectedPigments.push(id)
      }
    }
  }

  clearSelection(): void {
    this.selectedPigments = []
  }

  check(): PuzzleResult {
    if (this.selectedPigments.length === 0) {
      return { success: false, message: 'Please select at least two pigments to mix on the palette.' }
    }

    const currentSorted = [...this.selectedPigments].sort()
    const targetSorted = [...this.targetPigments].sort()

    const isMatch =
      currentSorted.length === targetSorted.length &&
      currentSorted.every((val, idx) => val === targetSorted[idx])

    if (isMatch) {
      this.state = 'completed'
      return {
        success: true,
        completed: true,
        message: 'Perfect match! Subtractive absorption produced Viridian Leaf Green. Installation 02 unlocked.',
      }
    }

    // Informative incorrect feedback explaining subtractive principles
    if (currentSorted.includes('cadmium-yellow') && currentSorted.includes('crimson')) {
      return {
        success: false,
        message: 'Yellow and Red absorb blue and green, leaving warm Orange. The lock requires Green.',
      }
    }
    if (currentSorted.includes('ultramarine') && currentSorted.includes('crimson')) {
      return {
        success: false,
        message: 'Blue and Red absorb green and yellow, producing Violet. Try combining blue with yellow.',
      }
    }
    return {
      success: false,
      message: 'The resulting blend does not match the target hue. Review the pigment absorption principles.',
    }
  }

  reset(): void {
    this.selectedPigments = []
    if (this.state !== 'completed') {
      this.state = 'available'
    }
  }

  getHint(index: number): string {
    return this.hints[Math.min(index, this.hints.length - 1)]
  }
}
