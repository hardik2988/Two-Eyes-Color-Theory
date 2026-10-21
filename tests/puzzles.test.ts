import { describe, expect, it } from 'vitest'
import { PaintMixingPuzzle, mixPigments } from '../src/game/puzzles/paint-mixing'
import { ValuePuzzle } from '../src/game/puzzles/value-puzzle'
import { HarmonyPuzzle } from '../src/game/puzzles/harmony-puzzle'
import { VaultPuzzle } from '../src/game/puzzles/vault-puzzle'
import { PuzzleManager } from '../src/game/puzzles/puzzle-manager'
import { CountdownTimer } from '../src/game/timer'

describe('Puzzle 1 — Paint Mixing (Subtractive)', () => {
  it('mixes blue and yellow pigments subtractively into green', () => {
    const blend = mixPigments(['ultramarine', 'cadmium-yellow'])
    expect(blend.name).toBe('Viridian Leaf Green')
    // In subtractive absorption, blue + yellow yields green dominant
    expect(blend.rgb[1]).toBeGreaterThan(blend.rgb[0])
    expect(blend.rgb[1]).toBeGreaterThan(blend.rgb[2])
  })

  it('validates correct target pigments (Cobalt Blue + Cadmium Lemon)', () => {
    const puzzle = new PaintMixingPuzzle()
    puzzle.selectPigment('ultramarine')
    puzzle.selectPigment('cadmium-yellow')
    const result = puzzle.check()
    expect(result.success).toBe(true)
    expect(puzzle.isComplete).toBe(true)
  })

  it('rejects incomplete or wrong pigment combinations with educational feedback', () => {
    const puzzle = new PaintMixingPuzzle()
    puzzle.selectPigment('cadmium-yellow')
    puzzle.selectPigment('crimson')
    const result = puzzle.check()
    expect(result.success).toBe(false)
    expect(result.message).toContain('Orange')
  })
})

describe('Puzzle 2 — Tint, Tone, Shade & Value', () => {
  it('correctly discriminates Tone from Tint and Shade', () => {
    const puzzle = new ValuePuzzle()
    puzzle.state = 'available'
    puzzle.selectSample('sample-tint')
    expect(puzzle.check().success).toBe(false)

    puzzle.selectSample('sample-tone')
    const result = puzzle.check()
    expect(result.success).toBe(true)
    expect(puzzle.isComplete).toBe(true)
  })
})

describe('Puzzle 3 — Gallery Colour Harmonies', () => {
  it('verifies the order: Monochromatic, Analogous, Complementary, Split-Complementary', () => {
    const puzzle = new HarmonyPuzzle()
    puzzle.state = 'available'
    // Arrange into correct slots:
    // Slot 0: p-mono
    // Slot 1: p-ana
    // Slot 2: p-comp
    // Slot 3: p-split
    const mono = puzzle.paintings.find(p => p.id === 'p-mono')!
    const ana = puzzle.paintings.find(p => p.id === 'p-ana')!
    const comp = puzzle.paintings.find(p => p.id === 'p-comp')!
    const split = puzzle.paintings.find(p => p.id === 'p-split')!

    mono.slot = 0
    ana.slot = 1
    comp.slot = 2
    split.slot = 3

    const res = puzzle.check()
    expect(res.success).toBe(true)
    expect(puzzle.isComplete).toBe(true)
  })
})

describe('Puzzle 4 — The Exit Vault', () => {
  it('requires the dual-vision decoded code 4829', () => {
    const puzzle = new VaultPuzzle()
    puzzle.state = 'available'
    puzzle.pressKey('1')
    puzzle.pressKey('2')
    puzzle.pressKey('3')
    puzzle.pressKey('4')
    expect(puzzle.check().success).toBe(false)

    puzzle.pressKey('4')
    puzzle.pressKey('8')
    puzzle.pressKey('2')
    puzzle.pressKey('9')
    const res = puzzle.check()
    expect(res.success).toBe(true)
    expect(puzzle.isComplete).toBe(true)
    expect(puzzle.isUnlocked).toBe(true)
  })
})

describe('PuzzleManager — Sequential Progression', () => {
  it('enforces sequential unlocking', () => {
    const mgr = new PuzzleManager()
    expect(mgr.paintMixing.state).toBe('available')
    expect(mgr.value.state).toBe('locked')
    expect(mgr.harmonies.state).toBe('locked')
    expect(mgr.vault.state).toBe('locked')

    // Solve puzzle 1
    mgr.paintMixing.selectPigment('ultramarine')
    mgr.paintMixing.selectPigment('cadmium-yellow')
    mgr.paintMixing.check()
    mgr.syncStates()

    expect(mgr.paintMixing.state).toBe('completed')
    expect(mgr.value.state).toBe('available')
    expect(mgr.harmonies.state).toBe('locked')
  })
})

describe('CountdownTimer', () => {
  it('formats 15:00 and decrements accurately', () => {
    const timer = new CountdownTimer(15)
    expect(timer.formatted).toBe('15:00')
    timer.start()
    timer.update(60) // 1 minute passed
    expect(timer.formatted).toBe('14:00')
    expect(timer.progress).toBeCloseTo(1 / 15, 2)
  })

  it('supports untimed mode', () => {
    const timer = new CountdownTimer(15)
    timer.setUntimed(true)
    expect(timer.formatted).toContain('UNTIMED')
    timer.start()
    timer.update(100)
    expect(timer.remainingSeconds).toBe(900)
  })
})

describe('Progressive Hint System', () => {
  it('provides 4 progressive hints for all four installations', () => {
    const puzzles = [new PaintMixingPuzzle(), new ValuePuzzle(), new HarmonyPuzzle(), new VaultPuzzle()]
    for (const puzzle of puzzles) {
      expect(puzzle.hints.length).toBe(4)
      expect(puzzle.getHint(0).toLowerCase()).toContain('objective')
      expect(puzzle.getHint(1).toLowerCase()).toContain('colour theory')
      expect(puzzle.getHint(2).toLowerCase()).toContain('clue')
      expect(puzzle.getHint(3).toLowerCase()).toContain('solution')
    }
  })
})
