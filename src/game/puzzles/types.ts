export type PuzzleId = 'paint-mixing' | 'value' | 'harmonies' | 'vault'

export type PuzzleState = 'locked' | 'available' | 'active' | 'completed'

export interface PuzzleResult {
  success: boolean
  message: string
  completed?: boolean
}

export interface IPuzzle {
  readonly id: PuzzleId
  readonly number: number
  readonly title: string
  readonly subtitle: string
  readonly description: string
  readonly educationalSummary: string
  readonly hints: string[]
  state: PuzzleState
  isComplete: boolean
  reset(): void
  getHint(index: number): string
  check(): PuzzleResult
}
