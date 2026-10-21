import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { initPhysics, Physics } from '../src/engine/physics'
import { CONFIG } from '../src/game/config'
import { cameraViewOffset, FirstPersonController, movementVelocity } from '../src/game/first-person'

describe('studio first-person controller', () => {
  it('moves forward along the camera heading', () => {
    const forward = movementVelocity(0, 1, 0, 2.5)
    expect(forward.x).toBeCloseTo(0)
    expect(forward.z).toBeCloseTo(-2.5)
  })

  it('does not amplify diagonal speed', () => {
    expect(movementVelocity(1, 1, 0, 4).length()).toBeCloseTo(4)
  })

  it('assigns distinguishable eye and shoulder viewpoints to both siblings', () => {
    expect(cameraViewOffset('aria')).not.toEqual(cameraViewOffset('kai'))
    expect(cameraViewOffset('kai').eye).toBeLessThan(cameraViewOffset('aria').eye)
    expect(cameraViewOffset('kai').side).toBeGreaterThan(cameraViewOffset('aria').side)
  })

  it('keeps the kinematic capsule on its side of a solid wall', async () => {
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

  it('eases the camera between siblings without moving the Rapier capsule', async () => {
    await initPhysics()
    const physics = new Physics(CONFIG.exploration.gravity)
    physics.addStaticBox(new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(10, 0.2, 10))
    const player = new FirstPersonController(physics, new THREE.Vector3(0, 0.72, 0), 16 / 9)
    try {
      const bodyStart = player.position.clone()
      const cameraStart = player.camera.position.clone()
      player.setPerspective('kai')
      player.step(1 / 60, { x: 0, y: 0, sprint: false })
      const firstStep = player.camera.position.clone()
      expect(firstStep.distanceTo(cameraStart)).toBeGreaterThan(0.01)
      expect(firstStep.distanceTo(cameraStart)).toBeLessThan(0.3)

      for (let i = 0; i < 150; i += 1) player.step(1 / 60, { x: 0, y: 0, sprint: false })
      expect(player.camera.position.y - player.position.y).toBeCloseTo(CONFIG.exploration.eyeHeight + cameraViewOffset('kai').eye, 2)
      expect(player.position.x).toBeCloseTo(bodyStart.x, 3)
      expect(player.position.z).toBeCloseTo(bodyStart.z, 3)
    } finally {
      physics.dispose()
    }
  })
})
