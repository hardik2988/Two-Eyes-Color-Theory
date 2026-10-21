import type { IPuzzle, PuzzleId, PuzzleResult, PuzzleState } from './types'

export interface VaultClue {
  position: number // 1, 2, 3, 4
  digit: string // e.g. '4', '8', '2', '9'
  shape: 'circle' | 'triangle' | 'square' | 'diamond'
  hatchPattern: string
  jackClueText: string
  johnClueText: string
}

export class VaultPuzzle implements IPuzzle {
  readonly id: PuzzleId = 'vault'
  readonly number = 4
  readonly title = 'The Dual-Vision Vault'
  readonly subtitle = 'Installation 04 · The Exhibition Vault'
  readonly description =
    'Neither brother can open the vault alone. Jack reads the hidden digits through chromatic wavelength contrast; John reads the positional sequence through high-contrast geometric hatching. Combine their observations to enter the master code.'
  readonly educationalSummary =
    'True accessible design is not about compensating for a deficiency; it is about recognizing that different visual systems excel at different perceptual tasks. John’s visual system easily detects edge orientation, hatching, and pattern alignment, while Jack’s detects red/green wavelength differences. Together, they achieve complete communication.'
  readonly hints = [
    'Inspect the four plaque dials beside the heavy vault door.',
    'As Jack, note down the four chromatic digits revealed in red-green contrast (4, 8, 2, 9).',
    'Press Tab to switch to John: observe the geometric symbols (● Circle, ▲ Triangle, ■ Square, ◆ Diamond) indicating positions 1st, 2nd, 3rd, and 4th.',
    'Enter the code "4829" into the physical vault keypad.',
  ]

  state: PuzzleState = 'locked'
  currentCode: string = ''
  readonly correctCode: string = '4829'
  isUnlocked: boolean = false

  readonly clues: VaultClue[] = [
    {
      position: 1,
      digit: '4',
      shape: 'circle',
      hatchPattern: 'Vertical 90° hatch',
      jackClueText: 'Jack observes a red numeral "4" painted onto a deep green textured plaque.',
      johnClueText: 'John clearly detects the prominent Circle symbol (●) marked with 1 dot: Position 1.',
    },
    {
      position: 2,
      digit: '8',
      shape: 'triangle',
      hatchPattern: 'Diagonal 45° hatch',
      jackClueText: 'Jack observes a red numeral "8" embedded in the olive glaze.',
      johnClueText: 'John clearly detects the prominent Triangle symbol (▲) marked with 2 dots: Position 2.',
    },
    {
      position: 3,
      digit: '2',
      shape: 'square',
      hatchPattern: 'Horizontal 0° hatch',
      jackClueText: 'Jack observes a red numeral "2" printed over the emerald backdrop.',
      johnClueText: 'John clearly detects the prominent Square symbol (■) marked with 3 dots: Position 3.',
    },
    {
      position: 4,
      digit: '9',
      shape: 'diamond',
      hatchPattern: 'Crossed 135° hatch',
      jackClueText: 'Jack observes a red numeral "9" etched on the forest green plaque.',
      johnClueText: 'John clearly detects the prominent Diamond symbol (◆) marked with 4 dots: Position 4.',
    },
  ]

  get isComplete(): boolean {
    return this.state === 'completed'
  }

  pressKey(digit: string): void {
    if (this.state === 'completed' || this.isUnlocked) return
    if (this.currentCode.length < 4 && /^[0-9]$/.test(digit)) {
      this.currentCode += digit
    }
  }

  deleteKey(): void {
    if (this.state === 'completed' || this.isUnlocked) return
    this.currentCode = this.currentCode.slice(0, -1)
  }

  clearKey(): void {
    if (this.state === 'completed' || this.isUnlocked) return
    this.currentCode = ''
  }

  check(): PuzzleResult {
    if (this.state === 'locked') {
      return { success: false, message: 'The vault is locked. Complete Installations 01, 02, and 03 first.' }
    }

    if (this.currentCode.length !== 4) {
      return { success: false, message: 'Please enter a 4-digit code using the vault keypad.' }
    }

    if (this.currentCode === this.correctCode) {
      this.state = 'completed'
      this.isUnlocked = true
      return {
        success: true,
        completed: true,
        message: 'Master code verified! Vault locking bolts disengaging... Exhibition completed!',
      }
    }

    const entered = this.currentCode
    this.currentCode = ''
    return {
      success: false,
      message: `Code "${entered}" incorrect. Consult both Jack (digits) and John (position symbols).`,
    }
  }

  reset(): void {
    this.currentCode = ''
    if (this.state !== 'completed' && this.state !== 'locked') {
      this.state = 'available'
    }
  }

  getHint(index: number): string {
    return this.hints[Math.min(index, this.hints.length - 1)]
  }
}
