import * as THREE from 'three'
import { RAPIER, type Physics } from '../engine/physics'
import { CONFIG } from './config'

export type WalkInput = { x: number; y: number; sprint: boolean }
export type Perspective = 'jack' | 'john'
export type AnyPerspective = Perspective | 'aria' | 'kai'
export type CameraViewOffset = Readonly<{ eye: number; side: number }>

export const CAMERA_VIEW_OFFSETS: Record<AnyPerspective, CameraViewOffset> = {
  jack: { eye: 0, side: -0.075 },
  john: { eye: -0.11, side: 0.075 },
  aria: { eye: 0, side: -0.075 },
  kai: { eye: -0.11, side: 0.075 },
}

export function cameraViewOffset(perspective: AnyPerspective): CameraViewOffset {
  return CAMERA_VIEW_OFFSETS[perspective] ?? CAMERA_VIEW_OFFSETS.jack
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
  reducedMotion = false
  /** Aim the opening reticle at a labelled tin rather than the gap between the four props. */
  yaw = 0.14
  pitch = -0.14
  private readonly velocity = new THREE.Vector3()
  private readonly eyeHeight = CONFIG.exploration.eyeHeight
  private eyeOffset = CAMERA_VIEW_OFFSETS.jack.eye
  private sideOffset = CAMERA_VIEW_OFFSETS.jack.side
  private targetEyeOffset = CAMERA_VIEW_OFFSETS.jack.eye
  private targetSideOffset = CAMERA_VIEW_OFFSETS.jack.side
  private walkTime = 0
  private idleTime = 0
  private bobY = 0
  private swayX = 0
  private rollZ = 0
  private currentFov = CONFIG.camera.fov
  private baseFov = CONFIG.camera.fov

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
    this.pitch = THREE.MathUtils.clamp(this.pitch - delta.y, -1.42, 1.35)
    this.syncCamera()
  }

  step(dt: number, input: WalkInput): void {
    const values = CONFIG.exploration
    const speed = input.sprint ? values.sprintSpeed : values.walkSpeed
    const wish = movementVelocity(input.x, input.y, this.yaw, speed)

    // Frame-rate independent velocity damping with acceleration curve
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, wish.x, values.acceleration, dt)
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, wish.z, values.acceleration, dt)
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

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z)

    // Dynamic Sprint FOV Kick (smooth lens expansion upon accelerating)
    const targetFov = (input.sprint && horizontalSpeed > 0.6 && !this.reducedMotion)
      ? CONFIG.camera.fov + 3.8
      : CONFIG.camera.fov
    this.currentFov = THREE.MathUtils.damp(this.currentFov, targetFov, 7.5, dt)
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov
      this.camera.updateProjectionMatrix()
    }

    // Ultra-smooth architectural head bob & natural gait sway
    if (!this.reducedMotion && grounded && horizontalSpeed > 0.25) {
      this.walkTime += dt * (input.sprint ? 12.5 : 8.5)
      const targetBob = Math.sin(this.walkTime) * 0.014
      const targetSway = Math.cos(this.walkTime * 0.5) * 0.008
      const targetRoll = Math.sin(this.walkTime * 0.5) * 0.0022
      this.bobY = THREE.MathUtils.damp(this.bobY, targetBob, 12, dt)
      this.swayX = THREE.MathUtils.damp(this.swayX, targetSway, 12, dt)
      this.rollZ = THREE.MathUtils.damp(this.rollZ, targetRoll, 12, dt)
    } else if (!this.reducedMotion && grounded) {
      // Subtle architectural idle breathing
      this.idleTime += dt
      const targetBob = Math.sin(this.idleTime * 1.6) * 0.0025
      const targetSway = Math.cos(this.idleTime * 0.8) * 0.0018
      this.bobY = THREE.MathUtils.damp(this.bobY, targetBob, 4, dt)
      this.swayX = THREE.MathUtils.damp(this.swayX, targetSway, 4, dt)
      this.rollZ = THREE.MathUtils.damp(this.rollZ, 0, 10, dt)
    } else {
      this.bobY = THREE.MathUtils.damp(this.bobY, 0, 12, dt)
      this.swayX = THREE.MathUtils.damp(this.swayX, 0, 12, dt)
      this.rollZ = THREE.MathUtils.damp(this.rollZ, 0, 12, dt)
    }

    this.advancePerspective(dt)
    this.syncCamera()
  }

  reset(spawn: THREE.Vector3): void {
    this.body.setTranslation({ x: spawn.x, y: spawn.y, z: spawn.z }, true)
    this.body.setNextKinematicTranslation({ x: spawn.x, y: spawn.y, z: spawn.z })
    this.position.copy(spawn)
    this.velocity.set(0, 0, 0)
    this.walkTime = 0
    this.idleTime = 0
    this.bobY = 0
    this.swayX = 0
    this.rollZ = 0
    this.currentFov = CONFIG.camera.fov
    this.camera.fov = CONFIG.camera.fov
    this.camera.updateProjectionMatrix()
    this.yaw = 0.14
    this.pitch = -0.14
    this.setPerspective('jack', true)
    this.syncCamera()
  }

  setPerspective(perspective: AnyPerspective, reducedMotion = false): void {
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
      at.x + Math.cos(this.yaw) * (this.sideOffset + this.swayX),
      at.y + this.eyeHeight + this.eyeOffset + this.bobY,
      at.z - Math.sin(this.yaw) * (this.sideOffset + this.swayX),
    )
    this.camera.rotation.set(this.pitch, this.yaw, this.rollZ, 'YXZ')
    if (this.baseFov !== CONFIG.camera.fov) {
      this.baseFov = CONFIG.camera.fov
      this.currentFov = CONFIG.camera.fov
      this.camera.fov = CONFIG.camera.fov
      this.camera.updateProjectionMatrix()
    }
  }
}
