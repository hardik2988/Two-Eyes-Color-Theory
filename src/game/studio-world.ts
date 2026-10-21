import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { Physics } from '../engine/physics'
import type { Renderer } from '../engine/renderer'

export type StudioTarget = {
  id: string
  label: string
  detail: string
  object: THREE.Group
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** One compact, self-contained room. Art direction deliberately uses primitive forms until GLB assets are supplied. */
export class StudioWorld {
  readonly scene = new THREE.Scene()
  readonly spawn = v3(0, 0.72, 5.8)
  readonly targets: StudioTarget[] = []
  private keyLight?: THREE.DirectionalLight
  private readonly dust: THREE.Points
  private readonly dustPosition: THREE.BufferAttribute
  private readonly environment: THREE.Texture
  private readonly mats = {
    wall: new THREE.MeshStandardMaterial({ color: 0x282532, roughness: 0.86 }),
    wallDark: new THREE.MeshStandardMaterial({ color: 0x171923, roughness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x665441, roughness: 0.48, metalness: 0.62 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc0a274, roughness: 0.3, metalness: 0.78 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x49372f, roughness: 0.6, metalness: 0.04 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x28242a, roughness: 0.57, metalness: 0.08 }),
    canvas: new THREE.MeshStandardMaterial({ color: 0xc9b99c, roughness: 0.9 }),
    midnightGlass: new THREE.MeshStandardMaterial({ color: 0x283850, emissive: 0x243756, emissiveIntensity: 0.65, roughness: 0.38, metalness: 0.12 }),
    ink: new THREE.MeshStandardMaterial({ color: 0x10131d, roughness: 0.52, metalness: 0.32 }),
  }

  constructor(readonly physics: Physics, renderer: Renderer) {
    this.scene.background = new THREE.Color(0x090b13)
    this.scene.fog = new THREE.Fog(0x11131d, 15, 34)
    const room = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(renderer.gl)
    this.environment = pmrem.fromScene(room, 0.04).texture
    this.scene.environment = this.environment
    this.scene.environmentIntensity = 0.26
    pmrem.dispose()
    this.addLighting()
    this.buildRoom()
    this.buildFurniture()
    this.dust = this.createDust()
    this.dustPosition = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute
  }

  update(time: number, delta: number): void {
    const positions = this.dustPosition.array as Float32Array
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] += Math.sin(time * 0.55 + i) * delta * 0.018
      if (positions[i + 1] > 4.95) positions[i + 1] = 1.2
    }
    this.dustPosition.needsUpdate = true
  }

  dispose(): void {
    this.environment.dispose()
  }

  setShadowMapSize(size: number): void {
    if (!this.keyLight) return
    this.keyLight.shadow.map?.dispose()
    this.keyLight.shadow.map = null
    this.keyLight.shadow.mapSize.set(size, size)
  }

  private addLighting(): void {
    const hemi = new THREE.HemisphereLight(0xc1c9e0, 0x201a22, 0.78)
    this.scene.add(hemi)
    const fill = new THREE.AmbientLight(0x6c7595, 0.2)
    this.scene.add(fill)

    const moon = new THREE.DirectionalLight(0x8fa9d0, 1.15)
    this.keyLight = moon
    moon.position.set(-5, 7, -4)
    moon.castShadow = true
    moon.shadow.mapSize.set(2048, 2048)
    moon.shadow.camera.left = -10
    moon.shadow.camera.right = 10
    moon.shadow.camera.top = 8
    moon.shadow.camera.bottom = -8
    moon.shadow.bias = -0.0003
    moon.shadow.normalBias = 0.025
    this.scene.add(moon)

    for (const [i, z] of [-4.1, 0, 4.1].entries()) {
      const x = i === 1 ? -0.9 : 2.5
      this.addPendant(x, 4.95, z)
    }
    this.addSconce(-8.72, 2.8, -2.4, Math.PI / 2)
    this.addSconce(-8.72, 2.8, 3.0, Math.PI / 2)
    this.addSconce(8.72, 2.8, -3.0, -Math.PI / 2)
    this.addSconce(8.72, 2.8, 2.4, -Math.PI / 2)
  }

  private addPendant(x: number, y: number, z: number): void {
    const fixture = new THREE.Group()
    fixture.position.set(x, y, z)
    this.scene.add(fixture)
    this.mesh(fixture, new THREE.CylinderGeometry(0.018, 0.018, 0.46, 8), this.mats.trim, [0, -0.24, 0])
    this.mesh(fixture, new THREE.CylinderGeometry(0.2, 0.4, 0.22, 24, 1, true), this.mats.darkWood, [0, -0.48, 0])
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffdeb0, emissive: 0xffbb73, emissiveIntensity: 2.2, roughness: 0.3 })
    this.mesh(fixture, new THREE.SphereGeometry(0.095, 16, 12), bulbMat, [0, -0.58, 0])
    const light = new THREE.PointLight(0xffcb91, 48, 10, 2)
    light.position.set(0, -0.63, 0)
    fixture.add(light)
  }

  private addSconce(x: number, y: number, z: number, rotationY: number): void {
    const group = new THREE.Group()
    group.position.set(x, y, z)
    group.rotation.y = rotationY
    this.scene.add(group)
    this.mesh(group, new THREE.BoxGeometry(0.12, 0.3, 0.15), this.mats.brass, [0, 0, 0])
    const glass = new THREE.MeshStandardMaterial({ color: 0xffd6a2, emissive: 0xffb96f, emissiveIntensity: 2.5, roughness: 0.3 })
    this.mesh(group, new THREE.SphereGeometry(0.11, 14, 10), glass, [0, 0.04, 0.13])
    const light = new THREE.PointLight(0xffbd7a, 24, 5.5, 2)
    light.position.set(0, 0, 0.3)
    group.add(light)
  }

  private buildRoom(): void {
    this.box('Studio floor', v3(18, 0.36, 15), v3(0, -0.18, 0), this.floorMaterial(), true)
    this.box('Ceiling', v3(18, 0.28, 15), v3(0, 5.58, 0), this.mats.wallDark, false)
    this.box('North wall', v3(18, 5.6, 0.38), v3(0, 2.8, -7.5), this.mats.wall, true)
    this.box('South wall', v3(18, 5.6, 0.38), v3(0, 2.8, 7.5), this.mats.wall, true)
    this.box('West wall', v3(0.38, 5.6, 15), v3(-9, 2.8, 0), this.mats.wall, true)
    this.box('East wall', v3(0.38, 5.6, 15), v3(9, 2.8, 0), this.mats.wall, true)

    for (const x of [-8.77, 8.77]) {
      this.box('Raised brass skirting', v3(0.06, 0.21, 14.1), v3(x, 0.13, 0), this.mats.trim, false)
      this.box('Crown moulding', v3(0.1, 0.12, 14.2), v3(x, 5.42, 0), this.mats.trim, false)
    }
    for (const z of [-7.27, 7.27]) {
      this.box('Raised brass skirting', v3(17.1, 0.21, 0.06), v3(0, 0.13, z), this.mats.trim, false)
      this.box('Crown moulding', v3(17.2, 0.12, 0.1), v3(0, 5.42, z), this.mats.trim, false)
    }

    // Glazed-looking night panels are intentionally set into the existing wall plane: no outside
    // model or texture is required for a coherent moonlit horizon in this placeholder milestone.
    for (const z of [-4.35, 0, 4.35]) {
      this.box('Moonlit window', v3(0.045, 2.12, 2.9), v3(-8.79, 3.52, z), this.mats.midnightGlass, false)
      this.box('Moonlit window', v3(0.045, 2.12, 2.9), v3(8.79, 3.52, z), this.mats.midnightGlass, false)
      for (const x of [-8.73, 8.73]) {
        this.box('Window mullion', v3(0.08, 2.16, 0.055), v3(x, 3.52, z), this.mats.trim, false)
        this.box('Window rail', v3(0.08, 0.055, 2.96), v3(x, 3.52, z), this.mats.trim, false)
      }
    }

    this.addVault()
    this.addPainting('Study in dusk', v3(-8.76, 2.55, -0.2), Math.PI / 2, 1.45, 1.9, [0x657a99, 0xc59a76, 0x333849])
    this.addPainting('Study in amber', v3(8.76, 2.55, -0.3), -Math.PI / 2, 1.55, 2.05, [0xa47d52, 0x5e6a70, 0xd0b487])
    this.addPainting('Quiet geometry', v3(0, 2.65, 7.29), Math.PI, 1.65, 1.7, [0x8b6462, 0x6c8090, 0xc0a274])
  }

  private buildFurniture(): void {
    this.addWorkbench()
    this.addPaintTins()
    this.addEasel()
    this.addShelf()
    this.addSideTableAndPalette()
    this.addPlant(-7.2, -5.7)
    this.addPlant(7.2, 5.9)
    this.addStool(2.4, 2.6)
    this.addStool(-1.9, -0.45)
  }

  private addWorkbench(): void {
    const x = 0
    const z = 3.05
    const top = v3(3.6, 0.16, 1.25)
    this.box('Workbench top', top, v3(x, 0.88, z), this.mats.wood, true)
    for (const dx of [-1.5, 1.5]) for (const dz of [-0.48, 0.48]) {
      this.box('Workbench leg', v3(0.13, 0.86, 0.13), v3(x + dx, 0.42, z + dz), this.mats.darkWood, true)
    }
    this.box('Workbench apron', v3(3.25, 0.24, 0.1), v3(x, 0.57, z - 0.55), this.mats.darkWood, true)
    this.box('Palette', v3(0.78, 0.065, 0.44), v3(-1.2, 1.01, z - 0.12), this.mats.canvas, false)
    for (const [i, color] of [0xb65d59, 0x708467, 0x647fa0, 0xc1a56e].entries()) {
      this.mesh(this.scene, new THREE.SphereGeometry(0.075, 12, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }), [-1.42 + i * 0.15, 1.06, z - 0.1])
    }
    this.box('Brush jar', v3(0.24, 0.34, 0.24), v3(1.35, 1.15, z + 0.12), this.mats.brass, false)
    for (let i = 0; i < 5; i += 1) {
      const brush = this.mesh(this.scene, new THREE.CylinderGeometry(0.014, 0.023, 0.72, 7), this.mats.wood, [1.28 + i * 0.035, 1.6, z + 0.13])
      brush.rotation.z = (i - 2) * 0.085
    }
  }

  private addPaintTins(): void {
    const object = new THREE.Group()
    object.position.set(0, 0, 3.05)
    this.scene.add(object)
    const target: StudioTarget = {
      id: 'paint-tins',
      label: 'Paint tins · four distinct marks',
      detail: 'The labels use a circle, triangle, square and diamond. Shape and brightness remain useful clues even when hues look alike.',
      object,
    }
    object.userData.interaction = target
    this.targets.push(target)

    const hues = [0xb65f59, 0x718765, 0x5f7e9f, 0xc0a16c]
    for (let i = 0; i < 4; i += 1) {
      const x = -1.15 + i * 0.76
      const can = new THREE.Group()
      can.position.set(x, 1.01, 0.03)
      object.add(can)
      const bodyMat = new THREE.MeshStandardMaterial({ color: hues[i], roughness: 0.43, metalness: 0.26 })
      this.mesh(can, new THREE.CylinderGeometry(0.205, 0.22, 0.48, 24), bodyMat, [0, 0.25, 0])
      this.mesh(can, new THREE.CylinderGeometry(0.213, 0.213, 0.045, 24), this.mats.brass, [0, 0.504, 0])
      this.mesh(can, new THREE.TorusGeometry(0.195, 0.018, 8, 24), this.mats.ink, [0, 0.055, 0])
      const label = new THREE.MeshStandardMaterial({ color: i === 1 ? 0x22252c : 0xe9dfc9, roughness: 0.72, metalness: 0.02 })
      const face = new THREE.Group()
      face.position.set(0, 0.25, 0.207)
      can.add(face)
      if (i === 0) this.mesh(face, new THREE.CircleGeometry(0.068, 20), label, [0, 0, 0.012])
      else if (i === 1) {
        const shape = new THREE.Shape()
        shape.moveTo(0, 0.085); shape.lineTo(0.08, -0.07); shape.lineTo(-0.08, -0.07); shape.closePath()
        this.mesh(face, new THREE.ShapeGeometry(shape), label, [0, 0, 0.012])
      } else if (i === 2) this.mesh(face, new THREE.BoxGeometry(0.12, 0.12, 0.025), label, [0, 0, 0.012])
      else {
        const shape = new THREE.Shape()
        shape.moveTo(0, 0.09); shape.lineTo(0.072, 0); shape.lineTo(0, -0.09); shape.lineTo(-0.072, 0); shape.closePath()
        this.mesh(face, new THREE.ShapeGeometry(shape), label, [0, 0, 0.012])
      }
      for (const child of can.children) child.userData.interaction = target
    }
  }

  private addEasel(): void {
    const object = new THREE.Group()
    object.position.set(-3.25, 0, 0.55)
    this.scene.add(object)
    const target: StudioTarget = {
      id: 'easel',
      label: 'Canvas on the easel',
      detail: 'Three layered shapes catch the warm light. In a later study, look for their value and the relationships between their hues.',
      object,
    }
    object.userData.interaction = target
    this.targets.push(target)
    for (const dx of [-0.48, 0.48]) {
      const leg = this.mesh(object, new THREE.BoxGeometry(0.08, 2.4, 0.09), this.mats.wood, [dx, 1.17, 0.02])
      leg.rotation.z = dx * 0.16
    }
    this.mesh(object, new THREE.BoxGeometry(0.08, 2.25, 0.09), this.mats.wood, [0, 1.12, -0.36]).rotation.z = -0.08
    this.box('Easel ledge', v3(1.15, 0.1, 0.22), v3(-3.25, 1.35, 0.55), this.mats.brass, false)
    this.addPaintingToGroup(object, v3(0, 2.28, 0.09), 1.0, 1.24, [0x758c9d, 0x917060, 0xc0a274])
    const stool = new THREE.Group()
    stool.position.set(-3.25, 0, 2.0)
    this.scene.add(stool)
    this.mesh(stool, new THREE.CylinderGeometry(0.48, 0.5, 0.18, 24), this.mats.darkWood, [0, 0.52, 0])
    for (const x of [-0.29, 0.29]) this.box('Easel stool leg', v3(0.09, 0.51, 0.09), v3(-3.25 + x, 0.26, 2.0), this.mats.wood, true)
    this.physics.addStaticCylinder(v3(-3.25, 0.52, 2.0), 0.48, 0.18)
  }

  private addShelf(): void {
    const x = 6.85
    const z = -0.25
    for (const y of [0.8, 1.75, 2.7, 3.65]) {
      this.box('Shelf board', v3(1.35, 0.12, 4.5), v3(x, y, z), this.mats.wood, true)
    }
    for (const dz of [-2.1, 2.1]) this.box('Shelf upright', v3(1.35, 3.8, 0.13), v3(x, 2.25, z + dz), this.mats.darkWood, true)
    for (const i of [0, 1, 2, 3]) {
      const y = 1.15 + (i % 2) * 0.95
      const zz = z - 1.35 + Math.floor(i / 2) * 1.35
      const jarMat = new THREE.MeshStandardMaterial({ color: [0x697f7a, 0x927b5b, 0x69728e, 0x8b625f][i], roughness: 0.27, metalness: 0.14 })
      this.mesh(this.scene, new THREE.CylinderGeometry(0.2, 0.23, 0.46, 18), jarMat, [x, y, zz])
      this.mesh(this.scene, new THREE.CylinderGeometry(0.12, 0.12, 0.07, 18), this.mats.brass, [x, y + 0.26, zz])
    }
  }

  private addSideTableAndPalette(): void {
    this.box('Side table top', v3(1.25, 0.15, 0.9), v3(3.8, 0.8, -2.05), this.mats.darkWood, true)
    for (const x of [3.35, 4.25]) for (const z of [-2.35, -1.75]) {
      this.box('Side table leg', v3(0.1, 0.77, 0.1), v3(x, 0.38, z), this.mats.wood, true)
    }
    const lamp = new THREE.Group()
    lamp.name = 'Adjustable work lamp'
    lamp.position.set(3.8, 0.87, -2.05)
    this.scene.add(lamp)
    this.mesh(lamp, new THREE.CylinderGeometry(0.26, 0.33, 0.12, 20), this.mats.brass, [0, 0.06, 0])
    this.mesh(lamp, new THREE.CylinderGeometry(0.035, 0.04, 0.58, 10), this.mats.ink, [0, 0.39, 0])
    this.mesh(lamp, new THREE.ConeGeometry(0.27, 0.3, 20, 1, true), this.mats.trim, [0, 0.68, 0])
    const bulb = new THREE.PointLight(0xffce95, 22, 4.4, 2)
    bulb.position.set(0, 0.61, 0)
    lamp.add(bulb)
    this.addTarget('work-lamp', 'Adjustable work lamp', 'A warm practical lamp shifts the way a pigment reads. Brightness and surface finish are clues as much as hue.', lamp)
    this.mesh(this.scene, new THREE.BoxGeometry(0.4, 0.06, 0.3), this.mats.canvas, [3.55, 0.91, -1.95])
  }

  private addPlant(x: number, z: number): void {
    const potMat = new THREE.MeshStandardMaterial({ color: 0x574743, roughness: 0.78 })
    this.mesh(this.scene, new THREE.CylinderGeometry(0.29, 0.37, 0.56, 18), potMat, [x, 0.28, z])
    const leaf = new THREE.MeshStandardMaterial({ color: 0x586b5a, roughness: 0.88 })
    for (let i = 0; i < 5; i += 1) {
      const a = (Math.PI * 2 * i) / 5
      const stem = this.mesh(this.scene, new THREE.ConeGeometry(0.12, 1.15, 9), leaf, [x + Math.cos(a) * 0.22, 0.98, z + Math.sin(a) * 0.22])
      stem.rotation.z = Math.sin(a) * 0.34
      stem.rotation.x = Math.cos(a) * 0.34
    }
  }

  private addStool(x: number, z: number): void {
    this.mesh(this.scene, new THREE.CylinderGeometry(0.42, 0.47, 0.16, 20), this.mats.wood, [x, 0.64, z])
    this.physics.addStaticCylinder(v3(x, 0.42, z), 0.44, 0.84)
    for (const dx of [-0.25, 0.25]) for (const dz of [-0.25, 0.25]) {
      this.box('Stool leg', v3(0.09, 0.56, 0.09), v3(x + dx, 0.3, z + dz), this.mats.darkWood, false)
    }
  }

  private addVault(): void {
    const object = new THREE.Group()
    object.position.set(0, 0, -7.18)
    this.scene.add(object)
    const target: StudioTarget = {
      id: 'vault-door',
      label: 'The sealed studio door',
      detail: 'The round lock is still dormant. The four colour-theory studies are reserved for the next puzzle milestone.',
      object,
    }
    object.userData.interaction = target
    this.targets.push(target)
    this.mesh(object, new THREE.BoxGeometry(2.55, 3.55, 0.28), this.mats.ink, [0, 1.88, 0])
    this.mesh(object, new THREE.BoxGeometry(2.24, 3.25, 0.085), new THREE.MeshStandardMaterial({ color: 0x30313a, roughness: 0.42, metalness: 0.72 }), [0, 1.88, 0.19])
    for (const x of [-1.25, 1.25]) this.mesh(object, new THREE.BoxGeometry(0.095, 3.6, 0.12), this.mats.brass, [x, 1.88, 0.18])
    for (const y of [0.1, 3.66]) this.mesh(object, new THREE.BoxGeometry(2.58, 0.09, 0.12), this.mats.brass, [0, y, 0.18])
    this.mesh(object, new THREE.CircleGeometry(0.78, 48), this.mats.ink, [0, 1.92, 0.26])
    const ring = this.mesh(object, new THREE.TorusGeometry(0.72, 0.085, 14, 52), this.mats.brass, [0, 1.92, 0.29])
    ring.rotation.z = Math.PI / 8
    this.mesh(object, new THREE.CircleGeometry(0.48, 32), new THREE.MeshStandardMaterial({ color: 0x343a47, roughness: 0.3, metalness: 0.65 }), [0, 1.92, 0.3])
    for (let i = 0; i < 8; i += 1) {
      const a = i * Math.PI / 4
      const pin = this.mesh(object, new THREE.SphereGeometry(0.055, 10, 8), this.mats.brass, [Math.cos(a) * 0.9, 1.92 + Math.sin(a) * 0.9, 0.32])
      pin.userData.interaction = target
    }
    this.physics.addStaticBox(v3(0, 1.9, -7.12), v3(2.6, 3.7, 0.44))
  }

  private addPainting(name: string, position: THREE.Vector3, rotationY: number, width: number, height: number, colors: number[]): void {
    const group = new THREE.Group()
    group.name = name
    group.position.copy(position)
    group.rotation.y = rotationY
    this.scene.add(group)
    this.addPaintingToGroup(group, v3(0, 0, 0), width, height, colors)
  }

  private addPaintingToGroup(parent: THREE.Group, center: THREE.Vector3, width: number, height: number, colors: number[]): void {
    const frameMat = this.mats.brass
    const z = center.z
    const bar = 0.085
    this.mesh(parent, new THREE.BoxGeometry(width + bar * 2, height + bar * 2, 0.12), this.mats.darkWood, [center.x, center.y, z])
    this.mesh(parent, new THREE.BoxGeometry(width, height, 0.035), this.mats.canvas, [center.x, center.y, z + 0.08])
    for (const x of [-1, 1]) this.mesh(parent, new THREE.BoxGeometry(bar, height + bar * 2, 0.1), frameMat, [center.x + x * (width + bar) / 2, center.y, z + 0.1])
    for (const y of [-1, 1]) this.mesh(parent, new THREE.BoxGeometry(width, bar, 0.1), frameMat, [center.x, center.y + y * (height + bar) / 2, z + 0.1])
    const paintMaterials = colors.map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, emissive: color, emissiveIntensity: 0.035 }))
    this.mesh(parent, new THREE.CircleGeometry(width * 0.24, 28), paintMaterials[0], [center.x - width * 0.18, center.y + height * 0.1, z + 0.115])
    const shape = new THREE.Shape()
    shape.moveTo(0, height * 0.27); shape.lineTo(width * 0.28, -height * 0.28); shape.lineTo(-width * 0.28, -height * 0.28); shape.closePath()
    this.mesh(parent, new THREE.ShapeGeometry(shape), paintMaterials[1], [center.x + width * 0.16, center.y - height * 0.03, z + 0.118])
    this.mesh(parent, new THREE.BoxGeometry(width * 0.24, height * 0.16, 0.025), paintMaterials[2], [center.x + width * 0.18, center.y + height * 0.3, z + 0.12])
  }

  private addTarget(id: string, label: string, detail: string, object: THREE.Object3D): void {
    const root = object instanceof THREE.Group ? object : object.parent
    if (!(root instanceof THREE.Group)) return
    const target: StudioTarget = { id, label, detail, object: root }
    root.userData.interaction = target
    this.targets.push(target)
  }

  private createDust(): THREE.Points {
    const points = new Float32Array(126 * 3)
    let seed = 83
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    for (let i = 0; i < points.length; i += 3) {
      points[i] = (rand() - 0.5) * 15.8
      points[i + 1] = 0.6 + rand() * 4.2
      points[i + 2] = (rand() - 0.5) * 12.5
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(points, 3))
    const material = new THREE.PointsMaterial({ color: 0xdac18d, size: 0.025, transparent: true, opacity: 0.32, depthWrite: false, sizeAttenuation: true })
    const dust = new THREE.Points(geometry, material)
    dust.name = 'Lamplight dust'
    this.scene.add(dust)
    return dust
  }

  private floorMaterial(): THREE.MeshStandardMaterial {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#38343a'
    ctx.fillRect(0, 0, 128, 128)
    let seed = 19
    for (let i = 0; i < 1800; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const x = seed & 127
      seed = (seed * 1664525 + 1013904223) >>> 0
      const y = seed & 127
      const shade = 35 + (seed & 31)
      ctx.fillStyle = `rgba(${shade}, ${shade - 3}, ${shade + 2}, ${0.025 + (seed % 10) / 200})`
      ctx.fillRect(x, y, 2, 2)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(5, 4)
    texture.anisotropy = 4
    return new THREE.MeshStandardMaterial({ map: texture, color: 0xb0a9a4, roughness: 0.88, metalness: 0.04 })
  }

  private box(name: string, size: THREE.Vector3, center: THREE.Vector3, material: THREE.Material, collide: boolean): THREE.Mesh {
    const mesh = this.mesh(this.scene, new THREE.BoxGeometry(size.x, size.y, size.z), material, [center.x, center.y, center.z])
    mesh.name = name
    if (collide) this.physics.addStaticBox(center, size)
    return mesh
  }

  private mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(position[0], position[1], position[2])
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
}
