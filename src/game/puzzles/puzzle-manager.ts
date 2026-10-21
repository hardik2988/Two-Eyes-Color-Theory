import type { IPuzzle, PuzzleId } from './types'
import { PaintMixingPuzzle } from './paint-mixing'
import { ValuePuzzle } from './value-puzzle'
import { HarmonyPuzzle } from './harmony-puzzle'
import { VaultPuzzle } from './vault-puzzle'

export class PuzzleManager {
  readonly paintMixing = new PaintMixingPuzzle()
  readonly value = new ValuePuzzle()
  readonly harmonies = new HarmonyPuzzle()
  readonly vault = new VaultPuzzle()

  readonly list: IPuzzle[]

  currentPuzzleIndex: number = 0 // 0 = paint-mixing, 1 = value, 2 = harmonies, 3 = vault
  activePuzzleId: PuzzleId | null = null

  constructor() {
    this.list = [this.paintMixing, this.value, this.harmonies, this.vault]
    this.syncStates()
  }

  get currentPuzzle(): IPuzzle {
    return this.list[this.currentPuzzleIndex]
  }

  get completedCount(): number {
    return this.list.filter(p => p.isComplete).length
  }

  get isAllCompleted(): boolean {
    return this.completedCount === 4
  }

  get completedIndices(): number[] {
    const indices: number[] = []
    this.list.forEach((p, idx) => {
      if (p.isComplete) indices.push(idx + 1)
    })
    return indices
  }

  syncStates(): void {
    // Sequential progression: puzzle N is available only when N-1 is complete
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i]
      if (p.isComplete) {
        p.state = 'completed'
      } else if (i === 0 || this.list[i - 1].isComplete) {
        if (p.state !== 'active') p.state = 'available'
      } else {
        p.state = 'locked'
      }
    }

    // Determine current index to first uncompleted puzzle
    const nextUncompleted = this.list.findIndex(p => !p.isComplete)
    this.currentPuzzleIndex = nextUncompleted >= 0 ? nextUncompleted : 3
  }

  loadProgress(completedPuzzleNumbers: number[], currentPuzzleNum: number = 1): void {
    for (const num of completedPuzzleNumbers) {
      const idx = num - 1
      if (idx >= 0 && idx < this.list.length) {
        this.list[idx].state = 'completed'
      }
    }
    this.syncStates()
    if (currentPuzzleNum >= 1 && currentPuzzleNum <= 4) {
      this.currentPuzzleIndex = currentPuzzleNum - 1
    }
  }

  openPuzzle(id: PuzzleId): boolean {
    const puzzle = this.list.find(p => p.id === id)
    if (!puzzle || puzzle.state === 'locked') return false
    this.activePuzzleId = id
    if (puzzle.state !== 'completed') puzzle.state = 'active'
    return true
  }

  closeActivePuzzle(): void {
    if (this.activePuzzleId) {
      const p = this.list.find(p => p.id === this.activePuzzleId)
      if (p && p.state === 'active') p.state = 'available'
      this.activePuzzleId = null
    }
  }

  onPuzzleSolved(id: PuzzleId): void {
    const puzzle = this.list.find(p => p.id === id)
    if (puzzle) {
      puzzle.state = 'completed'
    }
    this.syncStates()
  }

  resetAll(): void {
    this.paintMixing.reset()
    this.value.reset()
    this.harmonies.reset()
    this.vault.reset()
    this.paintMixing.state = 'available'
    this.value.state = 'locked'
    this.harmonies.state = 'locked'
    this.vault.state = 'locked'
    this.currentPuzzleIndex = 0
    this.activePuzzleId = null
  }
}
