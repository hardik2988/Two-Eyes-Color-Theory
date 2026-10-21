import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { initPhysics, Physics } from '../src/engine/physics'
import { CONFIG, DEFAULT_CONFIG } from '../src/game/config'
import { FirstPersonController, movementVelocity } from '../src/game/first-person'
import { tuning } from '../src/game/tuning'

const defaults = Object.fromEntries(tuning.controls.map(control => [control.id, control.default]))
afterEach(() => {
  tuning.apply(defaults)
  tuning.activate('run')
})

describe('first-person movement', () => {
  it('maps forward and strafe inputs to the current camera yaw', () => {
    expect(movementVelocity(0, 1, 0, 3).toArray()).toEqual([0, 0, -3])
    const turned = movementVelocity(0, 1, Math.PI / 2, 3)
    expect(turned.x).toBeCloseTo(-3)
    expect(turned.z).toBeCloseTo(0)
    expect(movementVelocity(1, 0, 0, 3).x).toBeCloseTo(3)
  })

  it('normalizes diagonal input so it does not move faster than straight input', () => {
    expect(movementVelocity(1, 1, 0, 4).length()).toBeCloseTo(4)
  })

  it('slides to a stop at a solid wall instead of passing through it', async () => {
    await initPhysics()
    const physics = new Physics(CONFIG.exploration.gravity)
    physics.addStaticBox(new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(10, 0.2, 10))
    physics.addStaticBox(new THREE.Vector3(0, 1.5, -1), new THREE.Vector3(8, 3, 0.2))
    const player = new FirstPersonController(physics, new THREE.Vector3(0, 0.72, 0), 16 / 9)
    try {
      for (let i = 0; i < 120; i += 1) player.step(1 / 60, { x: 0, y: 1, sprint: false })
      expect(player.position.z).toBeGreaterThan(-0.8)
      expect(player.position.z).toBeLessThan(0)
    } finally {
      physics.dispose()
    }
  })
})

describe('Three.js preview tuning', () => {
  it('validates a complete patch before committing and preserves source defaults', () => {
    const before = tuning.read()
    for (const patch of [
      { 'exploration.walkSpeed': 6.5, 'camera.fov': 89 },
      { 'exploration.walkSpeed': 3.2 },
      { 'exploration.walkSpeed': '4' },
      { 'exploration.walkSpeed': 5, 'exploration.sprintSpeed': 4 },
      { 'camera.fov': Infinity },
      { unknown: 4 },
    ]) {
      expect(() => tuning.apply(patch)).toThrow()
      expect(tuning.read()).toEqual(before)
    }
    tuning.apply({ 'exploration.walkSpeed': 4, 'exploration.sprintSpeed': 6 })
    expect(CONFIG.exploration.walkSpeed).toBe(4)
    expect(CONFIG.exploration.sprintSpeed).toBe(6)
    expect(DEFAULT_CONFIG.exploration.walkSpeed).toBe(3)
    const applied = tuning.read()
    tuning.apply({ 'exploration.walkSpeed': 4 })
    expect(tuning.read()).toEqual(applied)
  })

  it('changes movement consumed by the first-person controller immediately', () => {
    const before = movementVelocity(0, 1, 0, CONFIG.exploration.walkSpeed).length()
    tuning.apply({ 'exploration.walkSpeed': 4.5 })
    const after = movementVelocity(0, 1, 0, CONFIG.exploration.walkSpeed).length()
    expect(after).toBeGreaterThan(before)
    expect(after).toBeCloseTo(4.5)
  })

  it('updates the actual first-person camera projection without replacing the camera', async () => {
    await initPhysics()
    const physics = new Physics()
    const player = new FirstPersonController(physics, new THREE.Vector3(0, 0.72, 0), 16 / 9)
    const camera = player.camera
    try {
      const before = camera.projectionMatrix.clone()
      tuning.apply({ 'camera.fov': 86 })
      player.syncCamera()
      expect(player.camera).toBe(camera)
      expect(camera.fov).toBe(86)
      expect(camera.projectionMatrix.equals(before)).toBe(false)
    } finally {
      physics.dispose()
    }
  })
})

describe('ranked eligibility', () => {
  it('ignores camera cosmetics but latches live gameplay until a clean new run', () => {
    tuning.activate('run')
    tuning.apply({ 'camera.fov': 90 })
    expect(tuning.unranked).toBe(false)
    tuning.apply({ 'exploration.walkSpeed': 4 })
    expect(tuning.unranked).toBe(true)
    tuning.apply(defaults)
    expect(tuning.unranked).toBe(true)
    tuning.activate('run')
    expect(tuning.unranked).toBe(false)
  })
})
