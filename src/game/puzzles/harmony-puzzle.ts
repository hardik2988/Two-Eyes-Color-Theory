import type { IPuzzle, PuzzleId, PuzzleResult, PuzzleState } from './types'

export type HarmonyType = 'monochromatic' | 'analogous' | 'complementary' | 'split-complementary'

export interface GalleryPainting {
  id: string
  title: string
  artistNote: string
  harmonyType: HarmonyType
  hues: number[] // angles on 360-degree color wheel
  colorsHex: string[]
  hatchPattern: 'vertical' | 'adjacent-stripes' | 'polar-opposite' | 'split-triangle'
  iconChar: string
  slot: number // 0, 1, 2, 3
}

export class HarmonyPuzzle implements IPuzzle {
  readonly id: PuzzleId = 'harmonies'
  readonly number = 3
  readonly title = 'Gallery Wall Colour Harmonies'
  readonly subtitle = 'Installation 03 · The Exhibition Wall'
  readonly description =
    'Arrange the four curator paintings into their correct harmonic sequence: Monochromatic, Analogous, Complementary, and Split-Complementary.'
  readonly educationalSummary =
    'Harmonies are geometric relationships on the colour wheel. Monochromatic uses 1 hue with varying value. Analogous uses adjacent neighbours (30° apart). Complementary pairs polar opposites (180° across). Split-Complementary pairs a base hue with the two neighbours of its complement (150°/210°). John relies on geometric wheel markers and geometric frame borders to verify angular spacing.'
  readonly hints = [
    'Objective: Visit the South Gallery Wall and arrange all four curator paintings into the harmonic sequence specified on the curator plaque.',
    'Colour Theory: Harmonies are geometric relationships on the 360° colour wheel. Monochromatic uses 1 hue with value steps. Analogous uses adjacent neighbours (30° apart). Complementary pairs polar opposites (180° across). Split-Complementary pairs a base hue with two neighbours of its complement (150°/210°).',
    'Actionable Clue: Read the curator plaque above the frames: Slot 1 must be Monochromatic, Slot 2 Analogous, Slot 3 Complementary, Slot 4 Split-Complementary. Use the ◀ Left and Right ▶ buttons to swap adjacent paintings.',
    'Guided Solution: Arrange the paintings in this exact order: 1. Solitude (Mono) → 2. Coastline (Analogous) → 3. Horizon Clash (Complementary) → 4. Equilibrium (Split-Complementary).',
  ]

  state: PuzzleState = 'locked'

  // 4 Paintings initially scrambled
  paintings: GalleryPainting[] = [
    {
      id: 'p-comp',
      title: 'Horizon Clash',
      artistNote: 'Polar opposites on the colour wheel (Cobalt Blue 210° and Amber Orange 30°). Maximum chromatic energy.',
      harmonyType: 'complementary',
      hues: [210, 30],
      colorsHex: ['#1e40af', '#f97316'],
      hatchPattern: 'polar-opposite',
      iconChar: '↔',
      slot: 0,
    },
    {
      id: 'p-mono',
      title: 'Solitude in Cobalt',
      artistNote: 'Single blue hue (210°) expressed across tint, tone, and deep shade.',
      harmonyType: 'monochromatic',
      hues: [210],
      colorsHex: ['#93c5fd', '#2563eb', '#1e293b'],
      hatchPattern: 'vertical',
      iconChar: '▮',
      slot: 1,
    },
    {
      id: 'p-split',
      title: 'Equilibrium',
      artistNote: 'Base hue Blue (210°) paired with Yellow-Orange (60°) and Red-Orange (0°). Softer balance than direct contrast.',
      harmonyType: 'split-complementary',
      hues: [210, 60, 0],
      colorsHex: ['#1d4ed8', '#eab308', '#ea580c'],
      hatchPattern: 'split-triangle',
      iconChar: '▲',
      slot: 2,
    },
    {
      id: 'p-ana',
      title: 'Verdant Coastline',
      artistNote: 'Three neighbours on the colour wheel: Blue (210°), Teal (180°), and Emerald Green (150°). Calming coherence.',
      harmonyType: 'analogous',
      hues: [210, 180, 150],
      colorsHex: ['#2563eb', '#0d9488', '#16a34a'],
      hatchPattern: 'adjacent-stripes',
      iconChar: '≋',
      slot: 3,
    },
  ]

  selectedSlot: number | null = null

  get isComplete(): boolean {
    return this.state === 'completed'
  }

  swapSlots(slotA: number, slotB: number): void {
    if (this.state === 'completed') return
    const paintingA = this.paintings.find(p => p.slot === slotA)
    const paintingB = this.paintings.find(p => p.slot === slotB)
    if (paintingA && paintingB) {
      paintingA.slot = slotB
      paintingB.slot = slotA
    }
  }

  selectSlotToSwap(slot: number): { swapped: boolean; from?: number; to?: number } {
    if (this.state === 'completed') return { swapped: false }
    if (this.selectedSlot === null) {
      this.selectedSlot = slot
      return { swapped: false, from: slot }
    }
    if (this.selectedSlot === slot) {
      this.selectedSlot = null
      return { swapped: false }
    }
    const from = this.selectedSlot
    this.swapSlots(from, slot)
    this.selectedSlot = null
    return { swapped: true, from, to: slot }
  }

  check(): PuzzleResult {
    if (this.state === 'locked') {
      return { success: false, message: 'This installation is locked. Complete Installation 02 first.' }
    }

    // Required order:
    // Slot 0: monochromatic
    // Slot 1: analogous
    // Slot 2: complementary
    // Slot 3: split-complementary
    const requiredOrder: HarmonyType[] = ['monochromatic', 'analogous', 'complementary', 'split-complementary']

    const currentOrder = [0, 1, 2, 3].map(slot => {
      const painting = this.paintings.find(p => p.slot === slot)
      return painting ? painting.harmonyType : null
    })

    const isCorrect = requiredOrder.every((req, idx) => currentOrder[idx] === req)

    if (isCorrect) {
      this.state = 'completed'
      return {
        success: true,
        completed: true,
        message: 'Magnificent! The gallery wall is harmonically ordered. The Exit Vault power has been activated!',
      }
    }

    return {
      success: false,
      message:
        'The current arrangement does not match the curator’s order (Monochromatic → Analogous → Complementary → Split-Complementary). Review the colour wheel geometric angles.',
    }
  }

  reset(): void {
    this.selectedSlot = null
    // Reset initial scrambled order
    this.paintings[0].slot = 0 // Horizon Clash (comp)
    this.paintings[1].slot = 1 // Solitude (mono)
    this.paintings[2].slot = 2 // Equilibrium (split)
    this.paintings[3].slot = 3 // Coastline (ana)
    if (this.state !== 'completed' && this.state !== 'locked') {
      this.state = 'available'
    }
  }

  getHint(index: number): string {
    return this.hints[Math.min(index, this.hints.length - 1)]
  }
}
