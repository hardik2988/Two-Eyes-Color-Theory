import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { Physics } from '../engine/physics'
import type { Renderer } from '../engine/renderer'

export type StudioTarget = {
  id: string
  label: string
  detail: string
  object: THREE.Group
  puzzleId?: 'paint-mixing' | 'value' | 'harmonies' | 'vault'
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/**
 * Luxury Daylight Art Studio — Architectural Exhibition Space.
 * Features warm natural sunlight, large floor-to-ceiling windows, light Scandinavian oak flooring,
 * ivory/cream plaster walls, travertine stone accents, elegant furniture, realistic easels,
 * and 4 interactive colour-theory stations leading to the exit vault.
 */
export class StudioWorld {
  readonly scene = new THREE.Scene()
  readonly spawn = v3(0, 0.72, 5.8)
  readonly targets: StudioTarget[] = []
  readonly objectiveBeacon: THREE.Group
  private beaconTargetPos = new THREE.Vector3(0, 2.2, 3.05)
  private mixingCanvasMat?: THREE.MeshStandardMaterial
  private keyLight?: THREE.DirectionalLight
  private readonly dust: THREE.Points
  private readonly dustPosition: THREE.BufferAttribute
  private readonly environment: THREE.Texture

  // Premium physically based architectural materials
  private readonly mats = {
    wall: new THREE.MeshStandardMaterial({ color: 0xfcfaf5, roughness: 0.85, metalness: 0.01 }),
    wallDark: new THREE.MeshStandardMaterial({ color: 0xe8e2d5, roughness: 0.78, metalness: 0.02 }),
    travertine: new THREE.MeshStandardMaterial({ color: 0xede6d8, roughness: 0.72, metalness: 0.04 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x2b343d, roughness: 0.35, metalness: 0.75 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.88 }),
    champagneBronze: new THREE.MeshStandardMaterial({ color: 0xc8b28a, roughness: 0.32, metalness: 0.82 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x936a4c, roughness: 0.52, metalness: 0.02 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x3d2f24, roughness: 0.58, metalness: 0.04 }),
    canvas: new THREE.MeshStandardMaterial({ color: 0xfdfbf7, roughness: 0.92, metalness: 0.0 }),
    clearGlass: new THREE.MeshStandardMaterial({
      color: 0xe8f4fc,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.35,
    }),
    skylightGlass: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xebf5fb,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    }),
    blackSteel: new THREE.MeshStandardMaterial({ color: 0x1e242b, roughness: 0.42, metalness: 0.65 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x245432, roughness: 0.65, metalness: 0.02 }),
    pottery: new THREE.MeshStandardMaterial({ color: 0xba6a4e, roughness: 0.82, metalness: 0.02 }),
  }

  constructor(readonly physics: Physics, renderer: Renderer) {
    // Warm daylight architectural background & subtle atmosphere
    this.scene.background = new THREE.Color(0xf6f0e4)
    this.scene.fog = new THREE.Fog(0xf5eedf, 22, 48)

    // HDR Environment lighting
    const room = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(renderer.gl)
    this.environment = pmrem.fromScene(room, 0.04).texture
    this.scene.environment = this.environment
    this.scene.environmentIntensity = 0.65
    pmrem.dispose()

    this.addDaylightLighting()
    this.buildRoom()
    this.buildFurniture()
    this.dust = this.createDaylightMotes()
    this.dustPosition = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute

    // 3D Objective Waypoint Beacon (hovers and guides player to active installation)
    this.objectiveBeacon = new THREE.Group()
    const beaconRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.032, 16, 32),
      new THREE.MeshStandardMaterial({ color: 0xc1121f, emissive: 0x780000, roughness: 0.3, metalness: 0.5 }),
    )
    beaconRing.rotation.x = Math.PI / 2
    this.objectiveBeacon.add(beaconRing)

    const beaconMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16),
      new THREE.MeshStandardMaterial({ color: 0xfdf0d5, emissive: 0xc1121f, roughness: 0.2 }),
    )
    beaconMarker.position.y = 0.22
    this.objectiveBeacon.add(beaconMarker)

    this.objectiveBeacon.position.copy(this.beaconTargetPos)
    this.scene.add(this.objectiveBeacon)

    // Ensure all target child meshes are flagged for raycasting
    for (const target of this.targets) {
      target.object.traverse(child => {
        child.userData.interaction = target
      })
    }
  }

  setObjectiveStation(stationId: string): void {
    if (stationId === 'paint-mixing') {
      this.beaconTargetPos.set(0, 2.2, 3.05)
      this.objectiveBeacon.visible = true
    } else if (stationId === 'value') {
      this.beaconTargetPos.set(-3.25, 2.8, 0.55)
      this.objectiveBeacon.visible = true
    } else if (stationId === 'harmonies') {
      this.beaconTargetPos.set(0, 3.8, 7.15)
      this.objectiveBeacon.visible = true
    } else if (stationId === 'vault') {
      this.beaconTargetPos.set(0, 3.2, -7.0)
      this.objectiveBeacon.visible = true
    } else {
      this.objectiveBeacon.visible = false
    }
  }

  setPaletteMixedColor(hex: string): void {
    if (this.mixingCanvasMat) {
      this.mixingCanvasMat.color.set(hex)
    }
  }

  update(time: number, delta: number): void {
    // 3D Waypoint beacon bob and spin
    if (this.objectiveBeacon.visible) {
      this.objectiveBeacon.rotation.y += delta * 1.6
      this.objectiveBeacon.position.x = this.beaconTargetPos.x
      this.objectiveBeacon.position.z = this.beaconTargetPos.z
      this.objectiveBeacon.position.y = this.beaconTargetPos.y + Math.sin(time * 2.8) * 0.08
    }

    const positions = this.dustPosition.array as Float32Array
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] += Math.sin(time * 0.45 + i) * delta * 0.015
      if (positions[i + 1] > 5.1) positions[i + 1] = 0.8
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

  private addDaylightLighting(): void {
    // Balanced natural sky and ground bounce
    const skyFill = new THREE.HemisphereLight(0xe8f4ff, 0xfbf1df, 1.15)
    this.scene.add(skyFill)

    const ambient = new THREE.AmbientLight(0xfffaee, 0.42)
    this.scene.add(ambient)

    // Warm Sun streaming through the large East/West floor-to-ceiling windows
    const sun = new THREE.DirectionalLight(0xfff7e6, 2.2)
    this.keyLight = sun
    sun.position.set(-8.5, 9.2, -3.2)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -11
    sun.shadow.camera.right = 11
    sun.shadow.camera.top = 9
    sun.shadow.camera.bottom = -9
    sun.shadow.bias = -0.00025
    sun.shadow.normalBias = 0.02
    this.scene.add(sun)

    // Recessed architectural spotlights over stations
    this.addTrackSpot(0, 5.4, 3.05, 0, 0.88, 3.05) // Over mixing bench
    this.addTrackSpot(-3.25, 5.4, 0.55, -3.25, 1.35, 0.55) // Over value easel
    this.addTrackSpot(6.5, 5.4, -0.25, 6.5, 1.8, -0.25) // Over shelf
    this.addTrackSpot(0, 5.4, -6.5, 0, 1.9, -7.15) // Over vault door
  }

  private addTrackSpot(x: number, y: number, z: number, tx: number, ty: number, tz: number): void {
    const light = new THREE.SpotLight(0xffeed6, 18, 9, Math.PI / 6, 0.45, 1.8)
    light.position.set(x, y, z)
    light.target.position.set(tx, ty, tz)
    this.scene.add(light)
    this.scene.add(light.target)

    // Spotlight fixture
    const fixture = new THREE.Group()
    fixture.position.set(x, y, z)
    this.mesh(fixture, new THREE.CylinderGeometry(0.04, 0.06, 0.14, 12), this.mats.blackSteel, [0, -0.07, 0])
    this.scene.add(fixture)
  }

  private buildRoom(): void {
    // 1. Natural Scandinavian Oak Plank Flooring
    this.box('Studio floor', v3(18, 0.36, 15), v3(0, -0.18, 0), this.floorMaterial(), true)

    // 2. Ivory Architectural Ceiling with Recessed Light Channels
    this.box('Ceiling', v3(18, 0.28, 15), v3(0, 5.58, 0), this.mats.wallDark, false)

    // 3. Perimeter Walls
    this.box('North wall (Vault Feature Wall)', v3(18, 5.6, 0.38), v3(0, 2.8, -7.5), this.mats.travertine, true)
    this.box('South wall (Curator Gallery)', v3(18, 5.6, 0.38), v3(0, 2.8, 7.5), this.mats.wall, true)
    this.box('West wall (Window Wall)', v3(0.38, 5.6, 15), v3(-9, 2.8, 0), this.mats.wall, true)
    this.box('East wall (Window Wall)', v3(0.38, 5.6, 15), v3(9, 2.8, 0), this.mats.wall, true)

    // Architectural Trim & Baseboards
    for (const x of [-8.77, 8.77]) {
      this.box('Baseboard', v3(0.06, 0.2, 14.2), v3(x, 0.1, 0), this.mats.trim, false)
      this.box('Crown cornice', v3(0.12, 0.14, 14.2), v3(x, 5.48, 0), this.mats.trim, false)
    }
    for (const z of [-7.27, 7.27]) {
      this.box('Baseboard', v3(17.2, 0.2, 0.06), v3(0, 0.1, z), this.mats.trim, false)
      this.box('Crown cornice', v3(17.2, 0.14, 0.12), v3(0, 5.48, z), this.mats.trim, false)
    }

    // Floor-to-ceiling Architectural Windows with Daylight Glass
    for (const z of [-4.35, 0, 4.35]) {
      // West window apertures
      this.box('Daylight window', v3(0.04, 3.8, 3.1), v3(-8.79, 2.7, z), this.mats.skylightGlass, false)
      this.box('Window frame vertical', v3(0.08, 3.85, 0.08), v3(-8.73, 2.7, z - 1.5), this.mats.blackSteel, false)
      this.box('Window frame vertical', v3(0.08, 3.85, 0.08), v3(-8.73, 2.7, z + 1.5), this.mats.blackSteel, false)
      this.box('Window sill', v3(0.18, 0.08, 3.2), v3(-8.73, 0.78, z), this.mats.wood, false)

      // East window apertures
      this.box('Daylight window', v3(0.04, 3.8, 3.1), v3(8.79, 2.7, z), this.mats.skylightGlass, false)
      this.box('Window frame vertical', v3(0.08, 3.85, 0.08), v3(8.73, 2.7, z - 1.5), this.mats.blackSteel, false)
      this.box('Window frame vertical', v3(0.08, 3.85, 0.08), v3(8.73, 2.7, z + 1.5), this.mats.blackSteel, false)
      this.box('Window sill', v3(0.18, 0.08, 3.2), v3(8.73, 0.78, z), this.mats.wood, false)
    }

    // The Exit Vault Door
    this.addVault()

    // South Wall: The 4 Colour Harmonies Gallery Paintings (Installation 03)
    this.addHarmonyGalleryWall()
  }

  private buildFurniture(): void {
    // Installation 01: Subtractive Paint Mixing Bench
    this.addMixingBench()

    // Installation 02: Value, Tint, Tone & Shade Workstation
    this.addValueEaselWorkstation()

    // Studio Shelving and Storage
    this.addArchitecturalShelving()

    // Botanical accents & Sculptural Seating
    this.addFiddleLeafPlant(-7.2, -5.6)
    this.addMonsteraPlant(7.2, 5.8)
    this.addFiddleLeafPlant(7.2, -5.6)
    this.addArchitecturalBench(0, -1.8)
    this.addStool(-1.9, -0.45)
  }

  /** Installation 01: Subtractive Pigment Mixing Bench */
  private addMixingBench(): void {
    const x = 0
    const z = 3.05
    const topSize = v3(3.8, 0.16, 1.35)
    this.box('Mixing bench top', topSize, v3(x, 0.88, z), this.mats.darkWood, true)

    // Tapered solid wood legs
    for (const dx of [-1.65, 1.65]) {
      for (const dz of [-0.52, 0.52]) {
        this.box('Bench leg', v3(0.12, 0.86, 0.12), v3(x + dx, 0.42, z + dz), this.mats.wood, true)
      }
    }
    this.box('Bench apron', v3(3.4, 0.2, 0.08), v3(x, 0.6, z - 0.58), this.mats.darkWood, true)

    // Palette & mixing surface
    const palette = new THREE.Group()
    palette.position.set(-1.25, 0.98, z - 0.1)
    this.scene.add(palette)
    this.mesh(palette, new THREE.BoxGeometry(0.85, 0.04, 0.5), this.mats.canvas, [0, 0, 0])

    // Live subtractive mixing swatch on palette
    this.mixingCanvasMat = new THREE.MeshStandardMaterial({ color: 0xd4cebe, roughness: 0.6 })
    this.mesh(palette, new THREE.BoxGeometry(0.38, 0.045, 0.28), this.mixingCanvasMat, [-0.16, 0.02, 0])

    // Target swatch display on bench
    this.mesh(palette, new THREE.BoxGeometry(0.24, 0.03, 0.16), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 }), [0.28, 0.03, 0])

    // Brush jar with assorted artist brushes
    const jar = new THREE.Group()
    jar.position.set(1.4, 0.98, z + 0.15)
    this.scene.add(jar)
    this.mesh(jar, new THREE.CylinderGeometry(0.12, 0.14, 0.32, 16), this.mats.brass, [0, 0.16, 0])
    for (let i = 0; i < 6; i++) {
      const b = this.mesh(jar, new THREE.CylinderGeometry(0.01, 0.018, 0.68, 6), this.mats.wood, [-0.05 + i * 0.022, 0.48, (i % 2) * 0.02])
      b.rotation.z = (i - 2.5) * 0.07
    }

    // Interactive Paint Tins Target
    const object = new THREE.Group()
    object.position.set(0, 0, 3.05)
    this.scene.add(object)

    const target: StudioTarget = {
      id: 'paint-tins',
      label: 'Paint tins · four distinct marks',
      detail:
        'The labels use a circle, triangle, square and diamond. Combine Cobalt Blue (●) and Cadmium Lemon (▲) to produce Viridian Leaf Green.',
      object,
      puzzleId: 'paint-mixing',
    }
    object.userData.interaction = target
    this.targets.push(target)

    // The 4 Cans: Ultramarine Blue, Cadmium Lemon, Alizarin Crimson, Titanium White
    const canColors = [0x1d4ed8, 0xeab308, 0xb91c1c, 0xf8fafc]
    for (let i = 0; i < 4; i++) {
      const cx = -1.15 + i * 0.76
      const can = new THREE.Group()
      can.position.set(cx, 1.01, 0.03)
      object.add(can)

      const bodyMat = new THREE.MeshStandardMaterial({ color: canColors[i], roughness: 0.43, metalness: 0.26 })
      this.mesh(can, new THREE.CylinderGeometry(0.205, 0.22, 0.48, 24), bodyMat, [0, 0.25, 0])
      this.mesh(can, new THREE.CylinderGeometry(0.213, 0.213, 0.045, 24), this.mats.brass, [0, 0.504, 0])
      this.mesh(can, new THREE.TorusGeometry(0.195, 0.018, 8, 24), this.mats.trim, [0, 0.055, 0])

      // High-contrast shape label on the front
      const labelMat = new THREE.MeshStandardMaterial({ color: i === 1 || i === 3 ? 0x1e242b : 0xfcfaf5, roughness: 0.72, metalness: 0.02 })
      const face = new THREE.Group()
      face.position.set(0, 0.25, 0.207)
      can.add(face)

      if (i === 0) {
        // Circle (Cobalt Ultramarine)
        this.mesh(face, new THREE.CircleGeometry(0.068, 20), labelMat, [0, 0, 0.012])
      } else if (i === 1) {
        // Triangle (Cadmium Lemon)
        const shape = new THREE.Shape()
        shape.moveTo(0, 0.085); shape.lineTo(0.08, -0.07); shape.lineTo(-0.08, -0.07); shape.closePath()
        this.mesh(face, new THREE.ShapeGeometry(shape), labelMat, [0, 0, 0.012])
      } else if (i === 2) {
        // Square (Alizarin Crimson)
        this.mesh(face, new THREE.BoxGeometry(0.12, 0.12, 0.025), labelMat, [0, 0, 0.012])
      } else {
        // Diamond (Titanium White)
        const shape = new THREE.Shape()
        shape.moveTo(0, 0.09); shape.lineTo(0.072, 0); shape.lineTo(0, -0.09); shape.lineTo(-0.072, 0); shape.closePath()
        this.mesh(face, new THREE.ShapeGeometry(shape), labelMat, [0, 0, 0.012])
      }

      for (const child of can.children) child.userData.interaction = target
    }
  }

  /** Installation 02: Value, Tint, Tone, Shade Workstation */
  private addValueEaselWorkstation(): void {
    const object = new THREE.Group()
    object.position.set(-3.25, 0, 0.55)
    this.scene.add(object)

    const target: StudioTarget = {
      id: 'value-station',
      label: 'Installation 02 · The Value Easel',
      detail:
        'Press [E] to examine value gradations. Distinguish Tint (adding white), Tone (adding grey), and Shade (adding black) to match the reference study.',
      object,
      puzzleId: 'value',
    }
    object.userData.interaction = target
    this.targets.push(target)

    // Architectural wooden easel
    for (const dx of [-0.48, 0.48]) {
      const leg = this.mesh(object, new THREE.BoxGeometry(0.08, 2.45, 0.09), this.mats.wood, [dx, 1.2, 0.02])
      leg.rotation.z = dx * 0.15
    }
    this.mesh(object, new THREE.BoxGeometry(0.08, 2.3, 0.09), this.mats.wood, [0, 1.15, -0.38]).rotation.z = -0.08
    this.box('Easel ledge', v3(1.25, 0.09, 0.22), v3(-3.25, 1.35, 0.55), this.mats.brass, false)

    // Stretched canvas on easel showing value study swatches
    this.addPaintingToGroup(object, v3(0, 2.3, 0.08), 1.05, 1.3, [0x1e3a8a, 0x475569, 0x93c5fd])

    // Ergonomic studio stool
    const stool = new THREE.Group()
    stool.position.set(-3.25, 0, 1.95)
    this.scene.add(stool)
    this.mesh(stool, new THREE.CylinderGeometry(0.44, 0.46, 0.14, 24), this.mats.wood, [0, 0.52, 0])
    for (const dx of [-0.26, 0.26]) {
      this.box('Stool leg', v3(0.08, 0.5, 0.08), v3(-3.25 + dx, 0.25, 1.95), this.mats.darkWood, true)
    }
    this.physics.addStaticCylinder(v3(-3.25, 0.52, 1.95), 0.44, 0.14)
  }

  /** Installation 03: Curator Harmony Wall Paintings on South Wall */
  private addHarmonyGalleryWall(): void {
    const object = new THREE.Group()
    object.position.set(0, 0, 7.2)
    this.scene.add(object)

    const target: StudioTarget = {
      id: 'harmonies',
      label: 'Installation 03 · Gallery Wall Harmonies',
      detail:
        'Press [E] to arrange the 4 framed master paintings according to geometric wheel harmonies: Monochromatic → Analogous → Complementary → Split-Complementary.',
      object,
      puzzleId: 'harmonies',
    }
    object.userData.interaction = target
    this.targets.push(target)

    // Curator Plaque above the gallery wall
    this.box('Curator Plaque', v3(2.4, 0.35, 0.06), v3(0, 4.4, 7.32), this.mats.brass, false)

    // 4 Distinct framed paintings with color harmonies
    const xOffsets = [-4.8, -1.6, 1.6, 4.8]
    const harmonies = [
      { name: 'Painting 1 (Comp)', colors: [0x1e40af, 0xf97316, 0x334155] },
      { name: 'Painting 2 (Mono)', colors: [0x93c5fd, 0x2563eb, 0x1e293b] },
      { name: 'Painting 3 (Split)', colors: [0x1d4ed8, 0xeab308, 0xea580c] },
      { name: 'Painting 4 (Ana)', colors: [0x2563eb, 0x0d9488, 0x16a34a] },
    ]

    for (let i = 0; i < 4; i++) {
      const p = new THREE.Group()
      p.position.set(xOffsets[i], 2.6, 0.05)
      object.add(p)
      this.addPaintingToGroup(p, v3(0, 0, 0), 1.5, 1.9, harmonies[i].colors)

      // Individual painting spotlight
      const spot = new THREE.SpotLight(0xffeedd, 12, 7, Math.PI / 5, 0.4)
      spot.position.set(xOffsets[i], 5.1, 5.2)
      spot.target = p
      this.scene.add(spot)
      this.scene.add(spot.target)

      for (const child of p.children) child.userData.interaction = target
    }
  }

  /** Installation 04: The Exit Vault Door on North Wall */
  private addVault(): void {
    const object = new THREE.Group()
    object.position.set(0, 0, -7.18)
    this.scene.add(object)

    const target: StudioTarget = {
      id: 'vault-door',
      label: 'Installation 04 · The Exhibition Vault',
      detail:
        'Press [E] to access the vault keypad. Jack sees the hidden digits (4, 8, 2, 9); John sees the positional symbols (Circle, Triangle, Square, Diamond). Enter the master code.',
      object,
      puzzleId: 'vault',
    }
    object.userData.interaction = target
    this.targets.push(target)

    // Heavy luxury vault frame in brushed dark bronze and travertine
    this.mesh(object, new THREE.BoxGeometry(2.7, 3.7, 0.3), this.mats.blackSteel, [0, 1.88, 0])
    this.mesh(object, new THREE.BoxGeometry(2.4, 3.4, 0.1), this.mats.travertine, [0, 1.88, 0.16])

    // Solid champagne bronze door borders
    for (const x of [-1.3, 1.3]) {
      this.mesh(object, new THREE.BoxGeometry(0.12, 3.7, 0.15), this.mats.brass, [x, 1.88, 0.18])
    }
    for (const y of [0.08, 3.72]) {
      this.mesh(object, new THREE.BoxGeometry(2.72, 0.12, 0.15), this.mats.brass, [0, y, 0.18])
    }

    // Vault central rotary wheel mechanism
    this.mesh(object, new THREE.CircleGeometry(0.82, 48), this.mats.blackSteel, [0, 1.92, 0.24])
    const ring = this.mesh(object, new THREE.TorusGeometry(0.74, 0.08, 16, 52), this.mats.brass, [0, 1.92, 0.28])
    ring.rotation.z = Math.PI / 8
    this.mesh(object, new THREE.CircleGeometry(0.48, 32), this.mats.champagneBronze, [0, 1.92, 0.3])

    // Keypad pedestal mounted beside the vault door
    const keypadMount = new THREE.Group()
    keypadMount.position.set(1.75, 1.45, 0.18)
    object.add(keypadMount)
    this.mesh(keypadMount, new THREE.BoxGeometry(0.38, 0.55, 0.12), this.mats.blackSteel, [0, 0, 0])
    this.mesh(keypadMount, new THREE.BoxGeometry(0.32, 0.48, 0.04), this.mats.brass, [0, 0, 0.06])
    // Digital display strip
    this.mesh(keypadMount, new THREE.BoxGeometry(0.26, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0x003049 }), [0, 0.14, 0.08])

    // 4 Locking bolt cylinders
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      const pin = this.mesh(object, new THREE.SphereGeometry(0.055, 12, 10), this.mats.brass, [
        Math.cos(a) * 0.92,
        1.92 + Math.sin(a) * 0.92,
        0.31,
      ])
      pin.userData.interaction = target
    }

    this.physics.addStaticBox(v3(0, 1.9, -7.12), v3(2.8, 3.8, 0.44))
  }

  private addArchitecturalShelving(): void {
    const x = 6.85
    const z = -0.25
    for (const y of [0.8, 1.75, 2.7, 3.65]) {
      this.box('Shelf plank', v3(1.35, 0.09, 4.6), v3(x, y, z), this.mats.wood, true)
    }
    for (const dz of [-2.15, 2.15]) {
      this.box('Shelf upright', v3(1.35, 3.8, 0.1), v3(x, 2.25, z + dz), this.mats.darkWood, true)
    }
    // Decorative ceramic art vessels on shelves
    const vesselColors = [0x936a4c, 0xba6a4e, 0x669bbc, 0xd4af37]
    for (let i = 0; i < 4; i++) {
      const y = 1.05 + (i % 2) * 0.95
      const zz = z - 1.35 + Math.floor(i / 2) * 1.35
      const mat = new THREE.MeshStandardMaterial({ color: vesselColors[i], roughness: 0.35, metalness: 0.1 })
      this.mesh(this.scene, new THREE.CylinderGeometry(0.18, 0.22, 0.42, 18), mat, [x, y, zz])
    }
  }

  private addArchitecturalBench(x: number, z: number): void {
    this.box('Bench plank', v3(2.6, 0.12, 0.65), v3(x, 0.48, z), this.mats.wood, true)
    for (const dx of [-1.05, 1.05]) {
      this.box('Bench support', v3(0.1, 0.42, 0.58), v3(x + dx, 0.24, z), this.mats.blackSteel, true)
    }
  }

  private addStool(x: number, z: number): void {
    this.mesh(this.scene, new THREE.CylinderGeometry(0.4, 0.44, 0.14, 20), this.mats.wood, [x, 0.64, z])
    this.physics.addStaticCylinder(v3(x, 0.42, z), 0.42, 0.84)
    for (const dx of [-0.24, 0.24]) {
      for (const dz of [-0.24, 0.24]) {
        this.box('Stool leg', v3(0.08, 0.54, 0.08), v3(x + dx, 0.3, z + dz), this.mats.darkWood, false)
      }
    }
  }

  private addFiddleLeafPlant(x: number, z: number): void {
    const pot = this.mesh(this.scene, new THREE.CylinderGeometry(0.35, 0.44, 0.68, 20), this.mats.pottery, [x, 0.34, z])
    pot.castShadow = true
    this.physics.addStaticCylinder(v3(x, 0.34, z), 0.4, 0.68)

    // Architectural plant stems and broad sculptural leaves
    for (let i = 0; i < 7; i++) {
      const angle = (i * Math.PI * 2) / 7
      const height = 1.1 + (i % 3) * 0.25
      const leafGroup = new THREE.Group()
      leafGroup.position.set(x + Math.cos(angle) * 0.15, 0.68 + height * 0.4, z + Math.sin(angle) * 0.15)
      leafGroup.rotation.y = angle
      leafGroup.rotation.z = 0.35
      this.scene.add(leafGroup)

      // Broad oval leaf
      this.mesh(leafGroup, new THREE.ConeGeometry(0.24, 0.85, 8), this.mats.leaf, [0, 0.4, 0])
    }
  }

  private addMonsteraPlant(x: number, z: number): void {
    this.mesh(this.scene, new THREE.CylinderGeometry(0.38, 0.46, 0.72, 20), this.mats.pottery, [x, 0.36, z])
    this.physics.addStaticCylinder(v3(x, 0.36, z), 0.42, 0.72)

    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6
      const stem = this.mesh(this.scene, new THREE.CylinderGeometry(0.02, 0.03, 1.2, 8), this.mats.leaf, [
        x + Math.cos(angle) * 0.2,
        0.9,
        z + Math.sin(angle) * 0.2,
      ])
      stem.rotation.z = Math.sin(angle) * 0.4
      stem.rotation.x = Math.cos(angle) * 0.4
    }
  }

  private addPaintingToGroup(parent: THREE.Group, center: THREE.Vector3, width: number, height: number, colors: number[]): void {
    const frameMat = this.mats.champagneBronze
    const z = center.z
    const bar = 0.08
    this.mesh(parent, new THREE.BoxGeometry(width + bar * 2, height + bar * 2, 0.1), this.mats.darkWood, [center.x, center.y, z])
    this.mesh(parent, new THREE.BoxGeometry(width, height, 0.03), this.mats.canvas, [center.x, center.y, z + 0.06])

    // Fine champagne brass frame border
    for (const x of [-1, 1]) {
      this.mesh(parent, new THREE.BoxGeometry(bar, height + bar * 2, 0.08), frameMat, [center.x + (x * (width + bar)) / 2, center.y, z + 0.08])
    }
    for (const y of [-1, 1]) {
      this.mesh(parent, new THREE.BoxGeometry(width, bar, 0.08), frameMat, [center.x, center.y + (y * (height + bar)) / 2, z + 0.08])
    }

    // Abstract geometric artwork composition
    const paintMaterials = colors.map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.02 }))
    this.mesh(parent, new THREE.CircleGeometry(width * 0.24, 28), paintMaterials[0], [center.x - width * 0.18, center.y + height * 0.1, z + 0.09])
    const shape = new THREE.Shape()
    shape.moveTo(0, height * 0.26); shape.lineTo(width * 0.26, -height * 0.26); shape.lineTo(-width * 0.26, -height * 0.26); shape.closePath()
    this.mesh(parent, new THREE.ShapeGeometry(shape), paintMaterials[1], [center.x + width * 0.16, center.y - height * 0.02, z + 0.092])
    if (paintMaterials[2]) {
      this.mesh(parent, new THREE.BoxGeometry(width * 0.22, height * 0.15, 0.02), paintMaterials[2], [center.x + width * 0.18, center.y + height * 0.28, z + 0.094])
    }
  }

  private createDaylightMotes(): THREE.Points {
    const points = new Float32Array(140 * 3)
    let seed = 91
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    for (let i = 0; i < points.length; i += 3) {
      points[i] = (rand() - 0.5) * 16.0
      points[i + 1] = 0.8 + rand() * 4.2
      points[i + 2] = (rand() - 0.5) * 13.0
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(points, 3))
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.02,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      sizeAttenuation: true,
    })
    const motes = new THREE.Points(geometry, material)
    motes.name = 'Daylight motes'
    this.scene.add(motes)
    return motes
  }

  private floorMaterial(): THREE.MeshStandardMaterial {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')!

    // Light honey oak wood planks
    ctx.fillStyle = '#e8d7be'
    ctx.fillRect(0, 0, 256, 256)

    // Wood grain lines and subtle planks
    for (let y = 0; y < 256; y += 32) {
      ctx.fillStyle = 'rgba(168, 142, 110, 0.35)'
      ctx.fillRect(0, y, 256, 1.5) // plank border

      // Fine grain
      for (let x = 0; x < 256; x += 4) {
        const grainShade = Math.sin(x * 0.15 + y) * 8
        ctx.fillStyle = `rgba(${190 + grainShade}, ${165 + grainShade}, ${135 + grainShade}, 0.15)`
        ctx.fillRect(x, y + 2, 4, 28)
      }
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(6, 5)
    texture.anisotropy = 4
    return new THREE.MeshStandardMaterial({ map: texture, color: 0xf5ebd9, roughness: 0.44, metalness: 0.02 })
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
