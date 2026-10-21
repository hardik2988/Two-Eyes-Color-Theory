import { describe, expect, it } from 'vitest'
import { DEUTERANOPIA_MATRIX_ROWS, DEUTERANOPIA_SHADER, simulateDeuteranopia } from '../src/engine/color-vision'

const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('deuteranopia view simulation', () => {
  it('keeps neutral ramps neutral and preserves white luminance', () => {
    for (const value of [0, 0.18, 0.5, 0.82, 1]) {
      const mapped = simulateDeuteranopia([value, value, value])
      for (const channel of mapped) expect(channel).toBeCloseTo(value, 5)
    }
  })

  it('compresses red/green separation without making colour the only game signal', () => {
    const original = distance([1, 0, 0], [0, 1, 0])
    const simulated = distance(simulateDeuteranopia([1, 0, 0]), simulateDeuteranopia([0, 1, 0]))
    expect(simulated).toBeLessThan(original * 0.6)
    expect(simulateDeuteranopia([0, 0, 1])[2]).toBeGreaterThan(0.9)
  })

  it('uses one explicit 3×3 matrix and a single blendable shader pass', () => {
    expect(DEUTERANOPIA_MATRIX_ROWS).toHaveLength(3)
    expect(DEUTERANOPIA_MATRIX_ROWS.every(row => row.length === 3)).toBe(true)
    expect(DEUTERANOPIA_SHADER.fragmentShader).toContain('mix(source, simulated, clamp(uStrength, 0.0, 1.0))')
    expect(DEUTERANOPIA_SHADER.fragmentShader).toContain('isnan(value) || isinf(value)')
    expect(DEUTERANOPIA_SHADER.fragmentShader).toContain('return clamp(value, 0.0, 12.0)')
    expect(DEUTERANOPIA_SHADER.uniforms.uStrength.value).toBe(0)
  })
})
