import * as THREE from 'three'
import { RAPIER, type Physics } from '../engine/physics'
import { CONFIG } from './config'

export type WalkInput = { x: number; y: number; sprint: boolean }
export type Perspective = 'aria' | 'kai'
export type CameraViewOffset = Readonly<{ eye: number; side: number }>

export const CAMERA_VIEW_OFFSETS: Record<Perspective, CameraViewOffset> = {
  aria: { eye: 0, side: -0.075 },
  kai: { eye: -0.11, side: 0.075 },
}

export function cameraViewOffset(perspective: Perspective): CameraViewOffset {
  return CAMERA_VIEW_OFFSETS[perspective]
}

/** Pure movement mapping shared by the controller and its orientation tests. */
export function movementVelocity(x: number, y: number, yaw: number, speed: number): THREE.Vector3 {
  const length = Math.hypot(x, y)
  const scale = length > 1 ? 1 / length : 1
  const rightX = Math.cos(yaw)
  const rightZ = -Math.sin(yaw)
  const forwardX = -Math.sin(yaw)
  const forwardZ = -Math.cos(yaw)
  return new THREE.Vector3((rightX * x + forwardX * y) * scale * speed, 0, (rightZ * x + forwardZ * y) * scale * speed)
}

/** First-person capsule controller with Rapier's slide-and-ground character movement. */
export class FirstPersonController {
  readonly camera: THREE.PerspectiveCamera
  readonly body: RAPIER.RigidBody
  readonly collider: RAPIER.Collider
  readonly controller: RAPIER.KinematicCharacterController
  readonly position = new THREE.Vector3()
  /** Aim the opening reticle at a labelled tin rather than the gap between the four props. */
  yaw = 0.14
  pitch = -0.14
  private readonly velocity = new THREE.Vector3()
  private readonly eyeHeight = CONFIG.exploration.eyeHeight
  private eyeOffset = CAMERA_VIEW_OFFSETS.aria.eye
  private sideOffset = CAMERA_VIEW_OFFSETS.aria.side
  private targetEyeOffset = CAMERA_VIEW_OFFSETS.aria.eye
  private targetSideOffset = CAMERA_VIEW_OFFSETS.aria.side

  constructor(private readonly physics: Physics, spawn: THREE.Vector3, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, aspect, 0.06, 45)
    this.camera.rotation.order = 'YXZ'
    this.position.copy(spawn)
    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z),
    )
    this.collider = physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.52, 0.2).setFriction(0),
      this.body,
    )
    this.controller = physics.world.createCharacterController(0.025)
    this.controller.setUp({ x: 0, y: 1, z: 0 })
    this.controller.setSlideEnabled(true)
    this.controller.setApplyImpulsesToDynamicBodies(false)
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4)
    this.controller.enableSnapToGround(0.16)
    this.syncCamera()
  }

  look(delta: { x: number; y: number }): void {
    this.yaw = THREE.MathUtils.euclideanModulo(this.yaw - delta.x + Math.PI, Math.PI * 2) - Math.PI
    this.pitch = THREE.MathUtils.clamp(this.pitch - delta.y, -0.92, 0.72)
    this.syncCamera()
  }

  step(dt: number, input: WalkInput): void {
    const values = CONFIG.exploration
    const speed = input.sprint ? values.sprintSpeed : values.walkSpeed
    const wish = movementVelocity(input.x, input.y, this.yaw, speed)
    const smoothing = 1 - Math.exp(-values.acceleration * dt)
    this.velocity.x += (wish.x - this.velocity.x) * smoothing
    this.velocity.z += (wish.z - this.velocity.z) * smoothing
    this.velocity.y = Math.max(-14, this.velocity.y + values.gravity * dt)

    const current = this.body.translation()
    this.controller.computeColliderMovement(this.collider, {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
      z: this.velocity.z * dt,
    })
    const movement = this.controller.computedMovement()
    const grounded = this.controller.computedGrounded()
    if (grounded && this.velocity.y < 0) this.velocity.y = 0
    const next = { x: current.x + movement.x, y: current.y + movement.y, z: current.z + movement.z }
    this.body.setNextKinematicTranslation(next)
    this.position.set(next.x, next.y, next.z)
    this.physics.step(dt)
    this.advancePerspective(dt)
    this.syncCamera()
  }

  reset(spawn: THREE.Vector3): void {
    this.body.setTranslation({ x: spawn.x, y: spawn.y, z: spawn.z }, true)
    this.body.setNextKinematicTranslation({ x: spawn.x, y: spawn.y, z: spawn.z })
    this.position.copy(spawn)
    this.velocity.set(0, 0, 0)
    this.yaw = 0.14
    this.pitch = -0.14
    this.setPerspective('aria', true)
    this.syncCamera()
  }

  setPerspective(perspective: Perspective, reducedMotion = false): void {
    const offset = cameraViewOffset(perspective)
    this.targetEyeOffset = offset.eye
    this.targetSideOffset = offset.side
    if (reducedMotion) {
      this.eyeOffset = offset.eye
      this.sideOffset = offset.side
    }
    this.syncCamera()
  }

  private advancePerspective(dt: number): void {
    const blend = 1 - Math.exp(-12 * Math.max(0, dt))
    this.eyeOffset += (this.targetEyeOffset - this.eyeOffset) * blend
    this.sideOffset += (this.targetSideOffset - this.sideOffset) * blend
    if (Math.abs(this.targetEyeOffset - this.eyeOffset) < 0.001) this.eyeOffset = this.targetEyeOffset
    if (Math.abs(this.targetSideOffset - this.sideOffset) < 0.001) this.sideOffset = this.targetSideOffset
  }

  syncCamera(): void {
    const at = this.body.translation()
    this.position.set(at.x, at.y, at.z)
    this.camera.position.set(
      at.x + Math.cos(this.yaw) * this.sideOffset,
      at.y + this.eyeHeight + this.eyeOffset,
      at.z - Math.sin(this.yaw) * this.sideOffset,
    )
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
    if (this.camera.fov !== CONFIG.camera.fov) {
      this.camera.fov = CONFIG.camera.fov
      this.camera.updateProjectionMatrix()
    }
  }
}
