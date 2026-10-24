import fs from 'node:fs'
import path from 'node:path'

const filePath = path.resolve('src/game/studio-world.ts')

// We will construct the new studio-world.ts with extreme visual realism
const code = `import * as THREE from 'three'
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
 * Ultra-Realistic Daylight Art Studio & Luxury Architectural Exhibition Gallery.
 * Features photorealistic PBR materials (French White Oak plank floor, Venetian lime plaster,
 * fluted walnut acoustic batten wall, travertine limestone, champagne bronze, brushed brass),
 * dramatic natural sunlight with soft shadows, 4 museum-grade fine art oil paintings with
 * canvas weave and engraved brass placards, wooden fine-art shipping crates, cardboard boxes,
 * artist oil paint tubes, palettes, brushes, books, and studio props.
 */
export class StudioWorld {
  readonly scene = new THREE.Scene()
  readonly spawn = v3(0, 0.72, 5.8)
  readonly targets: StudioTarget[] = []
  readonly objectiveBeacon: THREE.Group
  readonly floorWaypointRing: THREE.Group
  private beaconTargetPos = new THREE.Vector3(0, 1.45, 3.05)
  private floorRingTargetPos = new THREE.Vector3(0, 0.02, 3.05)
  private mixingCanvasMat?: THREE.MeshStandardMaterial
  private keyLight?: THREE.DirectionalLight
  private readonly dust: THREE.Points
  private readonly dustPosition: THREE.BufferAttribute
  private readonly environment: THREE.Texture

  // Physically based materials
  private mats!: {
    wall: THREE.MeshStandardMaterial
    wallDark: THREE.MeshStandardMaterial
    woodSlat: THREE.MeshStandardMaterial
    travertine: THREE.MeshStandardMaterial
    trim: THREE.MeshStandardMaterial
    brass: THREE.MeshStandardMaterial
    champagneBronze: THREE.MeshStandardMaterial
    wood: THREE.MeshStandardMaterial
    darkWood: THREE.MeshStandardMaterial
    canvas: THREE.MeshStandardMaterial
    clearGlass: THREE.MeshStandardMaterial
    skylightGlass: THREE.MeshStandardMaterial
    blackSteel: THREE.MeshStandardMaterial
    leaf: THREE.MeshStandardMaterial
    pottery: THREE.MeshStandardMaterial
    cardboard: THREE.MeshStandardMaterial
    crate: THREE.MeshStandardMaterial
  }

  constructor(readonly physics: Physics, renderer: Renderer) {
    // Elegant warm gallery ambient background
    this.scene.background = new THREE.Color(0xf1ece1)
    this.scene.fog = new THREE.Fog(0xf0ebe0, 24, 52)

    // HDRI Ambient Environment Reflections
    const room = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(renderer.gl)
    this.environment = pmrem.fromScene(room, 0.04).texture
    this.scene.environment = this.environment
    this.scene.environmentIntensity = 0.48
    pmrem.dispose()

    this.initMaterials()
    this.addDaylightLighting()
    this.buildRoom()
    this.buildFurniture()
    this.buildStudioProps()

    this.dust = this.createDaylightMotes()
    this.dustPosition = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute

    // 3D Objective Waypoint Beacon (Architectural gold gyro diamond)
    this.objectiveBeacon = new THREE.Group()
    const beaconMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18),
      new THREE.MeshStandardMaterial({
        color: 0xfdf0d5,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.85,
        roughness: 0.2,
        metalness: 0.6,
      }),
    )
    beaconMarker.position.y = 0.14
    this.objectiveBeacon.add(beaconMarker)

    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      emissive: 0x78350f,
      roughness: 0.25,
      metalness: 0.85,
    })
    const gyroRing1 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.016, 12, 36), ringMat)
    gyroRing1.rotation.x = Math.PI / 2
    this.objectiveBeacon.add(gyroRing1)

    const gyroRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.014, 12, 36), ringMat)
    gyroRing2.rotation.y = Math.PI / 3
    this.objectiveBeacon.add(gyroRing2)

    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.002, 0.24, 12), ringMat)
    pin.position.y = -0.12
    this.objectiveBeacon.add(pin)
    this.objectiveBeacon.position.copy(this.beaconTargetPos)
    this.scene.add(this.objectiveBeacon)

    // Glowing Floor Projection Waypoint Ring
    this.floorWaypointRing = new THREE.Group()
    const floorOuter = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.025, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    )
    floorOuter.rotation.x = Math.PI / 2
    this.floorWaypointRing.add(floorOuter)

    const floorInner = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.015, 8, 36),
      new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    )
    floorInner.rotation.x = Math.PI / 2
    this.floorWaypointRing.add(floorInner)

    const floorDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.35, 24),
      new THREE.MeshBasicMaterial({ color: 0xfef3c7, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
    )
    floorDisc.rotation.x = -Math.PI / 2
    this.floorWaypointRing.add(floorDisc)

    this.floorWaypointRing.position.copy(this.floorRingTargetPos)
    this.scene.add(this.floorWaypointRing)

    // Ensure all target child meshes are flagged for raycasting
    for (const target of this.targets) {
      target.object.traverse(child => {
        child.userData.interaction = target
      })
    }
  }

  private initMaterials(): void {
    const plasterTex = this.createPlasterTexture()
    const travertineTex = this.createTravertineTexture()
    const woodSlatTex = this.createWoodSlatTexture()
    const cardboardTex = this.createCardboardTexture()
    const crateTex = this.createCrateTexture()

    this.mats = {
      wall: new THREE.MeshStandardMaterial({
        map: plasterTex,
        roughness: 0.88,
        metalness: 0.01,
      }),
      wallDark: new THREE.MeshStandardMaterial({
        map: plasterTex,
        color: 0xe2dcd0,
        roughness: 0.85,
        metalness: 0.02,
      }),
      woodSlat: new THREE.MeshStandardMaterial({
        map: woodSlatTex,
        roughness: 0.45,
        metalness: 0.04,
      }),
      travertine: new THREE.MeshStandardMaterial({
        map: travertineTex,
        roughness: 0.68,
        metalness: 0.04,
      }),
      trim: new THREE.MeshStandardMaterial({ color: 0x242b33, roughness: 0.32, metalness: 0.8 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.22, metalness: 0.9 }),
      champagneBronze: new THREE.MeshStandardMaterial({ color: 0xc8b28a, roughness: 0.3, metalness: 0.84 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x8a6245, roughness: 0.5, metalness: 0.02 }),
      darkWood: new THREE.MeshStandardMaterial({ color: 0x36281e, roughness: 0.54, metalness: 0.04 }),
      canvas: new THREE.MeshStandardMaterial({ color: 0xfdfaf5, roughness: 0.94, metalness: 0.0 }),
      clearGlass: new THREE.MeshStandardMaterial({
        color: 0xe8f4fc,
        roughness: 0.08,
        metalness: 0.1,
        transparent: true,
        opacity: 0.32,
      }),
      skylightGlass: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xebf5fb,
        emissiveIntensity: 0.85,
        roughness: 0.18,
      }),
      blackSteel: new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.38, metalness: 0.7 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x1e492b, roughness: 0.55, metalness: 0.04 }),
      pottery: new THREE.MeshStandardMaterial({ color: 0xba6a4e, roughness: 0.78, metalness: 0.02 }),
      cardboard: new THREE.MeshStandardMaterial({
        map: cardboardTex,
        roughness: 0.82,
        metalness: 0.01,
      }),
      crate: new THREE.MeshStandardMaterial({
        map: crateTex,
        roughness: 0.72,
        metalness: 0.02,
      }),
    }
  }

  setObjectiveStation(stationId: string): void {
    if (stationId === 'paint-mixing') {
      this.beaconTargetPos.set(0, 1.45, 3.05)
      this.floorRingTargetPos.set(0, 0.02, 3.05)
      this.objectiveBeacon.visible = true
      this.floorWaypointRing.visible = true
    } else if (stationId === 'value') {
      this.beaconTargetPos.set(-3.25, 1.6, 0.55)
      this.floorRingTargetPos.set(-3.25, 0.02, 0.55)
      this.objectiveBeacon.visible = true
      this.floorWaypointRing.visible = true
    } else if (stationId === 'harmonies') {
      this.beaconTargetPos.set(0, 1.4, 6.35)
      this.floorRingTargetPos.set(0, 0.02, 6.35)
      this.objectiveBeacon.visible = true
      this.floorWaypointRing.visible = true
    } else if (stationId === 'vault') {
      this.beaconTargetPos.set(0, 1.65, -7.0)
      this.floorRingTargetPos.set(0, 0.02, -7.0)
      this.objectiveBeacon.visible = true
      this.floorWaypointRing.visible = true
    } else {
      this.objectiveBeacon.visible = false
      this.floorWaypointRing.visible = false
    }
    this.floorWaypointRing.position.copy(this.floorRingTargetPos)
  }

  setPaletteMixedColor(hex: string): void {
    if (this.mixingCanvasMat) {
      this.mixingCanvasMat.color.set(hex)
    }
  }

  private currentHoverTarget: StudioTarget | null = null

  setTargetHover(target: StudioTarget | null): void {
    if (this.currentHoverTarget === target) return
    this.currentHoverTarget = target
    // Clean, non-destructive hover state (the game already highlights with 3D beacons, floor decals, reticle, and HUD)
  }

  update(time: number, delta: number): void {
    if (this.objectiveBeacon.visible) {
      this.objectiveBeacon.rotation.y += delta * 1.5
      this.objectiveBeacon.position.x = this.beaconTargetPos.x
      this.objectiveBeacon.position.z = this.beaconTargetPos.z
      this.objectiveBeacon.position.y = this.beaconTargetPos.y + Math.sin(time * 3.0) * 0.06
    }
    if (this.floorWaypointRing.visible) {
      this.floorWaypointRing.position.x = this.floorRingTargetPos.x
      this.floorWaypointRing.position.z = this.floorRingTargetPos.z
      this.floorWaypointRing.rotation.y += delta * 0.4
      const pulse = 1 + Math.sin(time * 2.8) * 0.05
      this.floorWaypointRing.scale.set(pulse, 1, pulse)
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
    // Balanced realistic daylight sky & ground bounce
    const skyFill = new THREE.HemisphereLight(0xe6f2ff, 0xfbf1de, 0.55)
    this.scene.add(skyFill)

    const ambient = new THREE.AmbientLight(0xfffaee, 0.22)
    this.scene.add(ambient)

    // Warm natural sun streaming through large floor-to-ceiling West windows
    const sun = new THREE.DirectionalLight(0xfff5e0, 2.6)
    this.keyLight = sun
    sun.position.set(-8.8, 9.5, -3.0)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -11
    sun.shadow.camera.right = 11
    sun.shadow.camera.top = 9
    sun.shadow.camera.bottom = -9
    sun.shadow.bias = -0.00018
    sun.shadow.normalBias = 0.024
    this.scene.add(sun)

    // Recessed architectural spotlights over stations
    this.addTrackSpot(0, 5.4, 3.05, 0, 0.88, 3.05) // Over mixing bench
    this.addTrackSpot(-3.25, 5.4, 0.55, -3.25, 1.35, 0.55) // Over value easel
    this.addTrackSpot(6.85, 5.4, -0.25, 6.85, 1.8, -0.25) // Over shelf
    this.addTrackSpot(0, 5.4, -6.5, 0, 1.9, -7.15) // Over vault door
  }

  private addTrackSpot(x: number, y: number, z: number, tx: number, ty: number, tz: number): void {
    const light = new THREE.SpotLight(0xffeed6, 16, 9, Math.PI / 6, 0.45, 1.8)
    light.position.set(x, y, z)
    light.target.position.set(tx, ty, tz)
    this.scene.add(light)
    this.scene.add(light.target)

    const fixture = new THREE.Group()
    fixture.position.set(x, y, z)
    this.mesh(fixture, new THREE.CylinderGeometry(0.04, 0.06, 0.14, 12), this.mats.blackSteel, [0, -0.07, 0])
    this.scene.add(fixture)
  }

  private buildRoom(): void {
    // 1. Natural French White Oak Plank Flooring (High resolution PBR texture)
    this.box('Studio floor', v3(18, 0.36, 15), v3(0, -0.18, 0), this.floorMaterial(), true)

    // 2. Ivory Architectural Ceiling with Recessed Light Channels
    this.box('Ceiling', v3(18, 0.28, 15), v3(0, 5.58, 0), this.mats.wallDark, false)

    // 3. Perimeter Walls with Venetian Plaster Finish
    this.box('North wall (Vault Feature Wall)', v3(18, 5.6, 0.38), v3(0, 2.8, -7.5), this.mats.travertine, true)
    this.box('South wall (Curator Gallery)', v3(18, 5.6, 0.38), v3(0, 2.8, 7.5), this.mats.wall, true)
    this.box('West wall (Window Wall)', v3(0.38, 5.6, 15), v3(-9, 2.8, 0), this.mats.wall, true)
    this.box('East wall (Window Wall)', v3(0.38, 5.6, 15), v3(9, 2.8, 0), this.mats.wall, true)

    // Solid Wood Ceiling Trusses
    for (const z of [-4.5, -1.5, 1.5, 4.5]) {
      this.box('Ceiling timber beam', v3(17.6, 0.22, 0.2), v3(0, 5.38, z), this.mats.darkWood, false)
    }

    // Architectural Trim & Baseboards
    for (const x of [-8.77, 8.77]) {
      this.box('Baseboard', v3(0.06, 0.22, 14.2), v3(x, 0.11, 0), this.mats.trim, false)
      this.box('Crown cornice', v3(0.12, 0.14, 14.2), v3(x, 5.48, 0), this.mats.trim, false)
    }
    for (const z of [-7.27, 7.27]) {
      this.box('Baseboard', v3(17.2, 0.22, 0.06), v3(0, 0.11, z), this.mats.trim, false)
      this.box('Crown cornice', v3(17.2, 0.14, 0.12), v3(0, 5.48, z), this.mats.trim, false)
    }

    // Floor-to-ceiling Architectural Windows with Daylight Glass
    for (const z of [-4.35, 0, 4.35]) {
      // West window apertures
      this.box('Daylight window', v3(0.04, 3.8, 3.1), v3(-8.79, 2.7, z), this.mats.skylightGlass, false)
      this.box('Window frame vertical', v3(0.08, 3.85, 0.08), v3(-8.73, 2.7, z - 1.5), this.mats.blackSteel, false)
      this.box('Window frame vertical', v3(0.08, 3.85, 0.08), v3(-8.73, 2.7, z + 1.5), this.mats.blackSteel, false)
      this.box('Window frame mid', v3(0.06, 0.06, 3.0), v3(-8.73, 2.7, z), this.mats.blackSteel, false)
      this.box('Window sill', v3(0.24, 0.08, 3.2), v3(-8.7, 0.78, z), this.mats.wood, false)

      // East window apertures
      this.box('Daylight window', v3(0.04, 3.8, 3.1), v3(8.79, 2.7, z), this.mats.skylightGlass, false)
      this.box('Window frame vertical', v3(0.08, 3.85, 0.08), v3(8.73, 2.7, z - 1.5), this.mats.blackSteel, false)
      this.box('Window frame vertical', v3(0.08, 3.85, 0.08), v3(8.73, 2.7, z + 1.5), this.mats.blackSteel, false)
      this.box('Window frame mid', v3(0.06, 0.06, 3.0), v3(8.73, 2.7, z), this.mats.blackSteel, false)
      this.box('Window sill', v3(0.24, 0.08, 3.2), v3(8.7, 0.78, z), this.mats.wood, false)
    }

    // Realistic architectural daylight sunbeam shafts streaming from West windows
    const sunbeamMat = new THREE.MeshBasicMaterial({
      color: 0xfff6e4,
      transparent: true,
      opacity: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    for (const z of [-4.35, 0, 4.35]) {
      const beamGeo = new THREE.PlaneGeometry(2.9, 5.2)
      const beam = new THREE.Mesh(beamGeo, sunbeamMat)
      beam.position.set(-6.2, 2.2, z)
      beam.rotation.set(0.08, Math.PI / 2, 0.42)
      this.scene.add(beam)
    }

    // The Exit Vault Door (Installation 04)
    this.addVault()

    // South Wall: The 4 Colour Harmonies Gallery Wall (Installation 03)
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

  /** Populates the studio with realistic artist props, wooden crates, cardboard boxes, and supplies */
  private buildStudioProps(): void {
    // 1. Wooden Fine-Art Shipping Crates
    this.addShippingCrate(this.scene, v3(-7.2, 0.45, -3.2), v3(1.1, 0.9, 0.8), 0.12, 'TWO EYES ART · LOT 01')
    this.addShippingCrate(this.scene, v3(-6.9, 1.25, -3.15), v3(0.85, 0.7, 0.75), -0.08, 'EYESEE HANDLING')
    this.addShippingCrate(this.scene, v3(6.8, 0.45, 3.8), v3(1.2, 0.9, 0.85), -0.22, 'PIGMENTS & OILS · 04')
    this.addShippingCrate(this.scene, v3(5.6, 0.35, -5.8), v3(1.0, 0.7, 0.7), 0.35, 'VAULT ARCHIVE · 02')

    // 2. Corrugated Cardboard Packaging Boxes
    this.addCardboardBox(this.scene, v3(-1.8, 0.28, 3.6), v3(0.65, 0.55, 0.55), 0.18, false)
    this.addCardboardBox(this.scene, v3(-1.75, 0.78, 3.65), v3(0.52, 0.45, 0.48), -0.14, false)
    this.addCardboardBox(this.scene, v3(7.1, 0.28, 1.9), v3(0.7, 0.55, 0.6), 0.05, false)
    this.addCardboardBox(this.scene, v3(5.2, 0.25, 6.2), v3(0.6, 0.5, 0.5), -0.32, false)
    this.addCardboardBox(this.scene, v3(-4.8, 0.25, -6.2), v3(0.55, 0.5, 0.5), 0.25, false)

    // 3. Stretched Artist Canvases Leaning on Walls
    this.addLeaningCanvases(this.scene, v3(-5.8, 0, 7.25), 0)
    this.addLeaningCanvases(this.scene, v3(-8.72, 0, -1.8), Math.PI / 2)

    // 4. Stacks of Fine Art Reference Books
    this.addBookStack(this.scene, v3(3.8, 0.54, 4.8), 4)
    this.addBookStack(this.scene, v3(6.85, 1.84, -0.6), 5)
    this.addBookStack(this.scene, v3(6.85, 2.79, 0.5), 3)

    // 5. Drawing Mannequin & Blueprint Tubes
    this.addDrawingMannequin(this.scene, v3(6.85, 2.79, -0.85))
    this.addBlueprintTubeBin(this.scene, v3(6.85, 0, 2.2))

    // 6. Classical Plaster Sculpture Bust in window bay
    this.addPlasterBust(this.scene, v3(-7.2, 0, -0.2))
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

    // Painter's wiping rag draped over bench front
    const rag = this.mesh(this.scene, new THREE.BoxGeometry(0.35, 0.24, 0.04), new THREE.MeshStandardMaterial({
      color: 0xded2c0,
      roughness: 0.9,
    }), [0.95, 0.78, z - 0.62])
    rag.rotation.x = 0.08

    // Palette & mixing surface
    const palette = new THREE.Group()
    palette.position.set(-1.25, 0.98, z - 0.1)
    this.scene.add(palette)
    const palMat = new THREE.MeshStandardMaterial({ map: this.createPaletteTexture(), roughness: 0.45 })
    this.mesh(palette, new THREE.BoxGeometry(0.88, 0.04, 0.52), palMat, [0, 0, 0])

    // Live subtractive mixing swatch on palette
    this.mixingCanvasMat = new THREE.MeshStandardMaterial({ color: 0xd4cebe, roughness: 0.55 })
    this.mesh(palette, new THREE.BoxGeometry(0.38, 0.045, 0.28), this.mixingCanvasMat, [-0.16, 0.02, 0])

    // Target swatch display on bench
    this.mesh(palette, new THREE.BoxGeometry(0.24, 0.03, 0.16), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.55 }), [0.28, 0.03, 0])

    // Brush jars with assorted artist brushes
    const jar = new THREE.Group()
    jar.position.set(1.4, 0.98, z + 0.15)
    this.scene.add(jar)
    this.mesh(jar, new THREE.CylinderGeometry(0.12, 0.14, 0.32, 16), this.mats.brass, [0, 0.16, 0])
    for (let i = 0; i < 7; i++) {
      const b = this.mesh(jar, new THREE.CylinderGeometry(0.008, 0.016, 0.68, 6), this.mats.wood, [-0.06 + i * 0.02, 0.48, (i % 2) * 0.025])
      b.rotation.z = (i - 3) * 0.08
    }

    // Artist crumpled oil paint tubes on bench
    const tubeColors = [0x1d4ed8, 0xeab308, 0xb91c1c, 0xf8fafc, 0x15803d, 0x78350f]
    for (let i = 0; i < tubeColors.length; i++) {
      const tx = 0.5 + (i % 3) * 0.22
      const tz = z - 0.28 + Math.floor(i / 3) * 0.18
      const tube = new THREE.Group()
      tube.position.set(tx, 0.98, tz)
      tube.rotation.y = (i * 0.45)
      this.scene.add(tube)
      this.mesh(tube, new THREE.CylinderGeometry(0.022, 0.028, 0.16, 10), new THREE.MeshStandardMaterial({
        color: 0xc8cdd2,
        roughness: 0.35,
        metalness: 0.65,
      }), [0, 0.02, 0])
      this.mesh(tube, new THREE.CylinderGeometry(0.014, 0.014, 0.03, 8), new THREE.MeshStandardMaterial({
        color: tubeColors[i],
        roughness: 0.4,
      }), [0, 0.1, 0])
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

      const bodyMat = new THREE.MeshStandardMaterial({ color: canColors[i], roughness: 0.42, metalness: 0.28 })
      this.mesh(can, new THREE.CylinderGeometry(0.205, 0.22, 0.48, 24), bodyMat, [0, 0.25, 0])
      this.mesh(can, new THREE.CylinderGeometry(0.213, 0.213, 0.045, 24), this.mats.brass, [0, 0.504, 0])
      this.mesh(can, new THREE.CylinderGeometry(0.208, 0.208, 0.035, 24), this.mats.brass, [0, 0.02, 0])

      // High-resolution Embossed Label Shield
      const face = this.mesh(can, new THREE.PlaneGeometry(0.18, 0.22), this.mats.canvas, [0, 0.26, 0.214])
      const labelMat = new THREE.MeshBasicMaterial({ color: 0x003049, side: THREE.DoubleSide })

      if (i === 0) {
        // Circle (Cobalt Blue)
        this.mesh(face, new THREE.CircleGeometry(0.065, 20), labelMat, [0, 0, 0.012])
      } else if (i === 1) {
        // Triangle (Cadmium Lemon)
        const shape = new THREE.Shape()
        shape.moveTo(0, 0.08); shape.lineTo(0.075, -0.06); shape.lineTo(-0.075, -0.06); shape.closePath()
        this.mesh(face, new THREE.ShapeGeometry(shape), labelMat, [0, 0, 0.012])
      } else if (i === 2) {
        // Square (Alizarin Crimson)
        this.mesh(face, new THREE.PlaneGeometry(0.12, 0.12), labelMat, [0, 0, 0.012])
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

    // Architectural wooden studio A-frame easel
    for (const dx of [-0.48, 0.48]) {
      const leg = this.mesh(object, new THREE.BoxGeometry(0.08, 2.45, 0.09), this.mats.wood, [dx, 1.2, 0.02])
      leg.rotation.z = dx * 0.15
    }
    this.mesh(object, new THREE.BoxGeometry(0.08, 2.3, 0.09), this.mats.wood, [0, 1.15, -0.38]).rotation.z = -0.08
    this.box('Easel ledge', v3(1.25, 0.09, 0.22), v3(-3.25, 1.35, 0.55), this.mats.brass, false)

    // Stretched canvas on easel showing value study painting
    const studyTex = this.createValueStudyTexture()
    const studyMat = new THREE.MeshStandardMaterial({ map: studyTex, roughness: 0.85 })
    this.mesh(object, new THREE.BoxGeometry(1.15, 1.45, 0.06), this.mats.darkWood, [0, 2.25, 0.06])
    this.mesh(object, new THREE.BoxGeometry(1.05, 1.35, 0.02), studyMat, [0, 2.25, 0.1])

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

    // ─── 1. Architectural Dark Walnut Fluted Wood Batten Feature Wall ───────
    // Fills South Wall backdrop behind the paintings with vertical slats and warm LED cove lighting
    const featureWall = new THREE.Mesh(
      new THREE.BoxGeometry(16.8, 5.4, 0.08),
      this.mats.woodSlat,
    )
    featureWall.position.set(0, 2.7, 7.32)
    this.scene.add(featureWall)

    // Warm LED Cove Strip Lights (Top & Bottom)
    const topCove = new THREE.Mesh(
      new THREE.BoxGeometry(16.5, 0.04, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xffe8ba }),
    )
    topCove.position.set(0, 5.25, 7.28)
    this.scene.add(topCove)

    const botCove = new THREE.Mesh(
      new THREE.BoxGeometry(16.5, 0.04, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xffe8ba }),
    )
    botCove.position.set(0, 0.25, 7.28)
    this.scene.add(botCove)

    // ─── 2. Centerpiece Interactive Curator Podium at X=0, Z=6.35 ─────────
    const podium = new THREE.Group()
    podium.position.set(0, 0, -0.85) // World Z = 7.2 - 0.85 = 6.35 (in front of South Wall)
    podium.rotation.y = Math.PI // Faces player approaching from north
    object.add(podium)

    // Travertine Plinth Base
    this.mesh(podium, new THREE.BoxGeometry(1.4, 0.94, 0.75), this.mats.travertine, [0, 0.47, 0])
    // Polished Brass Trim Bands
    this.mesh(podium, new THREE.BoxGeometry(1.44, 0.05, 0.79), this.mats.brass, [0, 0.025, 0])
    this.mesh(podium, new THREE.BoxGeometry(1.44, 0.06, 0.79), this.mats.brass, [0, 0.94, 0])

    // Angled Museum Curator Lectern tilted toward player
    const lectern = new THREE.Group()
    lectern.position.set(0, 0.97, 0.05)
    lectern.rotation.x = Math.PI / 6
    podium.add(lectern)

    // Gilded Catalogue Book / Tablet Display
    this.mesh(lectern, new THREE.BoxGeometry(1.05, 0.03, 0.55), this.mats.darkWood, [0, 0, 0])
    this.mesh(lectern, new THREE.BoxGeometry(0.96, 0.02, 0.48), this.mats.brass, [0, 0.02, 0])

    // Interactive Brass Wheel Diagram on Lectern
    const wheelStand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 24), this.mats.brass)
    wheelStand.position.set(0, 0.04, 0)
    lectern.add(wheelStand)

    // Dedicated Task Downlight onto the Lectern
    const taskLight = new THREE.SpotLight(0xffeedd, 9, 5, Math.PI / 4, 0.5)
    taskLight.position.set(0, 3.8, 6.1)
    taskLight.target = podium
    this.scene.add(taskLight)
    this.scene.add(taskLight.target)

    // Solid Rapier physics collider for the podium so player cannot walk through it
    this.physics.addStaticBox(v3(0, 0.47, 6.35), v3(1.4, 0.94, 0.75))

    podium.traverse(child => {
      child.userData.interaction = target
    })

    // ─── 3. Center Architectural Gallery Plaque & Relief at X=0 ──────────
    const centerPanel = new THREE.Group()
    centerPanel.position.set(0, 0, -0.02)
    centerPanel.rotation.y = Math.PI // Faces player
    object.add(centerPanel)

    // Sleek Walnut & Brass Backing Board for the Center Plaque
    this.mesh(centerPanel, new THREE.BoxGeometry(1.6, 1.8, 0.04), this.mats.darkWood, [0, 2.15, 0])
    this.mesh(centerPanel, new THREE.BoxGeometry(1.48, 1.68, 0.015), this.mats.champagneBronze, [0, 2.15, 0.025])

    // Central Colour Wheel Brass Relief Disc
    const wheelRelief = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 32), this.mats.brass)
    wheelRelief.rotation.x = Math.PI / 2
    wheelRelief.position.set(0, 2.45, 0.038)
    centerPanel.add(wheelRelief)

    // Curator Plaque with Title
    this.mesh(centerPanel, new THREE.BoxGeometry(1.3, 0.24, 0.015), this.mats.brass, [0, 1.85, 0.038])

    // Upper Gallery Archival Plaque
    this.mesh(centerPanel, new THREE.BoxGeometry(2.4, 0.26, 0.02), this.mats.brass, [0, 3.55, 0.038])

    centerPanel.traverse(child => {
      child.userData.interaction = target
    })

    // ─── 4. The 4 Framed Museum Masterpiece Paintings Facing the Room ────
    const xOffsets = [-5.1, -1.7, 1.7, 5.1]
    const harmoniesConfig: Array<{
      type: 'monochromatic' | 'analogous' | 'complementary' | 'split-complementary'
      title: string
      harmony: string
    }> = [
      { type: 'monochromatic', title: 'Nocturne in Ultramarine', harmony: '0° Monochromatic · Single Hue' },
      { type: 'analogous', title: 'Nordic Fjord & Pine Mist', harmony: '30° Analogous · Adjacent Hues' },
      { type: 'complementary', title: 'Sunset Over Solstice Waters', harmony: '180° Complementary · Polar Opposites' },
      { type: 'split-complementary', title: 'Harmonic Equilibrium', harmony: '150°/210° Split-Complementary' },
    ]

    for (let i = 0; i < 4; i++) {
      const cfg = harmoniesConfig[i]
      this.addGalleryPainting(object, xOffsets[i], 2.65, -0.04, cfg.type, cfg.title, cfg.harmony, target)

      // Individual warm painting spotlight
      const spot = new THREE.SpotLight(0xffeedd, 14, 7, Math.PI / 5, 0.45)
      spot.position.set(xOffsets[i], 5.1, 5.2)
      this.scene.add(spot)
      const spotTarget = new THREE.Object3D()
      spotTarget.position.set(xOffsets[i], 2.65, 7.2)
      this.scene.add(spotTarget)
      spot.target = spotTarget
    }

    // ─── 5. Architectural Museum Viewing Bench (Gallery East Alcove) ──────
    const bench = new THREE.Group()
    bench.position.set(3.4, 0, 4.8)
    this.scene.add(bench)
    this.mesh(bench, new THREE.BoxGeometry(2.4, 0.08, 0.7), this.mats.darkWood, [0, 0.46, 0])
    for (const bx of [-1.0, 1.0]) {
      for (const bz of [-0.25, 0.25]) {
        this.mesh(bench, new THREE.CylinderGeometry(0.035, 0.035, 0.44, 16), this.mats.brass, [bx, 0.22, bz])
      }
    }
    this.physics.addStaticBox(v3(3.4, 0.25, 4.8), v3(2.4, 0.5, 0.7))

    // ─── 6. Suspended Architectural Lighting Track ────────────────────────
    this.box('Gallery light track', v3(11.2, 0.06, 0.06), v3(0, 5.1, 5.2), this.mats.trim, false)
    for (const tx of [-4.5, -1.5, 0, 1.5, 4.5]) {
      this.mesh(object, new THREE.CylinderGeometry(0.045, 0.045, 0.16, 16), this.mats.brass, [tx, 5.0, 5.2 - 7.2])
    }
  }

  /** Mounts an individual framed museum fine-art oil painting with canvas weave and brass placard */
  private addGalleryPainting(
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    type: 'monochromatic' | 'analogous' | 'complementary' | 'split-complementary',
    title: string,
    harmony: string,
    target: StudioTarget,
  ): void {
    const p = new THREE.Group()
    p.position.set(x, y, z)
    // Rotate 180 degrees so front face of canvas faces INTO the room (-Z)
    p.rotation.y = Math.PI
    parent.add(p)

    const w = 1.35
    const h = 1.75
    const frameDepth = 0.08

    // 1. Outer Dark American Walnut Moulding Frame
    this.mesh(p, new THREE.BoxGeometry(w + 0.16, h + 0.16, frameDepth), this.mats.darkWood, [0, 0, -frameDepth / 2])

    // 2. Inner Champagne Bronze Bevel Slip
    this.mesh(p, new THREE.BoxGeometry(w + 0.04, h + 0.04, frameDepth + 0.01), this.mats.champagneBronze, [0, 0, -frameDepth / 2])

    // 3. Off-White Museum Cotton Mat Border
    this.mesh(p, new THREE.BoxGeometry(w, h, 0.01), this.mats.canvas, [0, 0, 0.005])

    // 4. Fine Art Canvas with CanvasTexture
    const artTexture = this.createArtworkTexture(type)
    const artMat = new THREE.MeshStandardMaterial({
      map: artTexture,
      roughness: 0.78,
      metalness: 0.02,
    })
    this.mesh(p, new THREE.BoxGeometry(w - 0.18, h - 0.22, 0.015), artMat, [0, 0, 0.012])

    // 5. Engraved Brass Museum Placard Underneath
    const placardTex = this.createPlacardTexture(title, harmony, 'Oil on Belgian Linen · 120 × 160 cm')
    const placardMat = new THREE.MeshStandardMaterial({
      map: placardTex,
      roughness: 0.35,
      metalness: 0.85,
    })
    this.mesh(p, new THREE.BoxGeometry(0.72, 0.18, 0.02), placardMat, [0, -h / 2 - 0.18, 0.01])

    // 6. Brass Picture Light Sconce Arching Overhead with Downward Warm Glow
    const sconceArm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 12), this.mats.brass)
    sconceArm1.rotation.x = Math.PI / 3
    sconceArm1.position.set(-0.16, h / 2 + 0.12, 0.14)
    p.add(sconceArm1)

    const sconceArm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 12), this.mats.brass)
    sconceArm2.rotation.x = Math.PI / 3
    sconceArm2.position.set(0.16, h / 2 + 0.12, 0.14)
    p.add(sconceArm2)

    const sconceHead = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.58, 16), this.mats.brass)
    sconceHead.rotation.z = Math.PI / 2
    sconceHead.position.set(0, h / 2 + 0.22, 0.24)
    p.add(sconceHead)

    // Tag every child mesh for interaction raycasting
    p.traverse(child => {
      child.userData.interaction = target
    })
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
    this.mesh(keypadMount, new THREE.BoxGeometry(0.26, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0x003049 }), [0, 0.14, 0.08])

    // 8 Locking bolt cylinders
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

  // ─── Studio Props Implementations ──────────────────────────────────────

  /** Adds a wooden fine-art transport shipping crate with metal brackets and stencil markings */
  private addShippingCrate(parent: THREE.Object3D, center: THREE.Vector3, size: THREE.Vector3, rotY: number, _label: string): void {
    const crate = new THREE.Group()
    crate.position.copy(center)
    crate.rotation.y = rotY
    parent.add(crate)

    // Main box body with slatted crate texture
    this.mesh(crate, new THREE.BoxGeometry(size.x, size.y, size.z), this.mats.crate, [0, 0, 0])

    // Dark iron corner reinforcements
    const cornerMat = this.mats.blackSteel
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const cx = (size.x / 2 - 0.04) * sx
          const cy = (size.y / 2 - 0.04) * sy
          const cz = (size.z / 2 - 0.04) * sz
          this.mesh(crate, new THREE.BoxGeometry(0.08, 0.08, 0.08), cornerMat, [cx, cy, cz])
        }
      }
    }

    // Wooden edge batten trim
    const battenMat = this.mats.darkWood
    for (const sx of [-1, 1]) {
      this.mesh(crate, new THREE.BoxGeometry(0.06, size.y, 0.06), battenMat, [(size.x / 2 - 0.03) * sx, 0, size.z / 2 - 0.03])
      this.mesh(crate, new THREE.BoxGeometry(0.06, size.y, 0.06), battenMat, [(size.x / 2 - 0.03) * sx, 0, -size.z / 2 + 0.03])
    }

    this.physics.addStaticBox(center, size)
  }

  /** Adds a realistic kraft cardboard box with packaging tape and shipping label */
  private addCardboardBox(parent: THREE.Object3D, center: THREE.Vector3, size: THREE.Vector3, rotY: number, _hasOpenLid: boolean): void {
    const box = new THREE.Group()
    box.position.copy(center)
    box.rotation.y = rotY
    parent.add(box)

    this.mesh(box, new THREE.BoxGeometry(size.x, size.y, size.z), this.mats.cardboard, [0, 0, 0])

    // Clear / brown packaging tape strip running across center top seam
    const tapeMat = new THREE.MeshStandardMaterial({
      color: 0xb58b56,
      roughness: 0.35,
      metalness: 0.1,
    })
    this.mesh(box, new THREE.BoxGeometry(size.x + 0.01, 0.01, 0.08), tapeMat, [0, size.y / 2 + 0.005, 0])

    this.physics.addStaticBox(center, size)
  }

  /** Adds a cluster of stretched artist canvases leaning against a wall */
  private addLeaningCanvases(parent: THREE.Object3D, base: THREE.Vector3, rotY: number): void {
    const cluster = new THREE.Group()
    cluster.position.copy(base)
    cluster.rotation.y = rotY
    parent.add(cluster)

    const sizes = [
      { w: 1.4, h: 1.8, d: 0.06, tilt: -0.12, offsetZ: 0 },
      { w: 1.2, h: 1.5, d: 0.05, tilt: -0.15, offsetZ: 0.12 },
      { w: 0.9, h: 1.2, d: 0.04, tilt: -0.18, offsetZ: 0.22 },
    ]

    for (let i = 0; i < sizes.length; i++) {
      const s = sizes[i]
      const canvasGroup = new THREE.Group()
      canvasGroup.position.set((i - 1) * 0.32, s.h / 2, s.offsetZ)
      canvasGroup.rotation.x = s.tilt
      cluster.add(canvasGroup)

      // Wooden stretcher frame
      this.mesh(canvasGroup, new THREE.BoxGeometry(s.w, s.h, s.d), this.mats.wood, [0, 0, 0])
      // Stretched raw linen canvas backing
      this.mesh(canvasGroup, new THREE.BoxGeometry(s.w - 0.08, s.h - 0.08, 0.01), this.mats.canvas, [0, 0, -s.d / 2 - 0.005])
    }
  }

  /** Stacks of hardcover art reference monographs */
  private addBookStack(parent: THREE.Object3D, center: THREE.Vector3, count: number): void {
    const bookColors = [0x780000, 0x003049, 0x669bbc, 0x3d2f24, 0xb91c1c]
    const titles = ['Interaction of Color', 'Theory of Colours', 'De Stijl', 'Bauhaus 1919-1933', 'Modernist Palette']
    for (let i = 0; i < count; i++) {
      const b = new THREE.Group()
      b.position.set(center.x, center.y + i * 0.052, center.z)
      b.rotation.y = (i * 0.08) - 0.15
      parent.add(b)

      const coverMat = new THREE.MeshStandardMaterial({
        map: this.createBookCoverTexture(titles[i % titles.length], bookColors[i % bookColors.length]),
        roughness: 0.6,
      })
      this.mesh(b, new THREE.BoxGeometry(0.38, 0.048, 0.52), coverMat, [0, 0, 0])
      // White paper page block
      this.mesh(b, new THREE.BoxGeometry(0.36, 0.044, 0.5), new THREE.MeshStandardMaterial({
        color: 0xfbf8ee,
        roughness: 0.9,
      }), [0.01, 0, 0])
    }
  }

  /** Articulated wooden artist drawing mannequin */
  private addDrawingMannequin(parent: THREE.Object3D, pos: THREE.Vector3): void {
    const m = new THREE.Group()
    m.position.copy(pos)
    parent.add(m)

    const woodMat = this.mats.wood
    const brassMat = this.mats.brass

    // Base stand and metal support rod
    this.mesh(m, new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), woodMat, [0, 0.01, 0])
    this.mesh(m, new THREE.CylinderGeometry(0.006, 0.006, 0.42, 8), brassMat, [0, 0.21, 0])

    // Torso, head, pelvis
    this.mesh(m, new THREE.SphereGeometry(0.038, 12, 10), woodMat, [0, 0.22, 0]) // pelvis
    this.mesh(m, new THREE.CylinderGeometry(0.042, 0.036, 0.14, 12), woodMat, [0, 0.32, 0]) // chest
    this.mesh(m, new THREE.SphereGeometry(0.032, 12, 10), woodMat, [0, 0.43, 0]) // head

    // Limbs in expressive pose
    const leftArm = this.mesh(m, new THREE.CylinderGeometry(0.012, 0.01, 0.12, 8), woodMat, [-0.07, 0.32, 0.04])
    leftArm.rotation.z = 0.6
    const rightArm = this.mesh(m, new THREE.CylinderGeometry(0.012, 0.01, 0.12, 8), woodMat, [0.07, 0.34, -0.04])
    rightArm.rotation.z = -0.8
  }

  /** Classical plaster sculpture bust on travertine pedestal in window bay */
  private addPlasterBust(parent: THREE.Object3D, pos: THREE.Vector3): void {
    const g = new THREE.Group()
    g.position.copy(pos)
    parent.add(g)

    // Travertine architectural pedestal
    this.mesh(g, new THREE.BoxGeometry(0.55, 1.1, 0.55), this.mats.travertine, [0, 0.55, 0])
    this.mesh(g, new THREE.BoxGeometry(0.62, 0.08, 0.62), this.mats.brass, [0, 1.14, 0])

    // Plaster bust sculpture
    const plasterMat = new THREE.MeshStandardMaterial({
      color: 0xf5f2eb,
      roughness: 0.92,
      metalness: 0.0,
    })
    const bust = new THREE.Group()
    bust.position.set(0, 1.18, 0)
    g.add(bust)

    // Torso shoulders
    this.mesh(bust, new THREE.BoxGeometry(0.42, 0.24, 0.22), plasterMat, [0, 0.12, 0])
    // Neck
    this.mesh(bust, new THREE.CylinderGeometry(0.08, 0.09, 0.16, 16), plasterMat, [0, 0.28, 0])
    // Head with classical proportions
    this.mesh(bust, new THREE.SphereGeometry(0.14, 20, 16), plasterMat, [0, 0.45, 0])

    this.physics.addStaticBox(v3(pos.x, 0.55, pos.z), v3(0.55, 1.1, 0.55))
  }

  /** Brass umbrella container with rolled blueprints and mailing tubes */
  private addBlueprintTubeBin(parent: THREE.Object3D, pos: THREE.Vector3): void {
    const bin = new THREE.Group()
    bin.position.copy(pos)
    parent.add(bin)

    this.mesh(bin, new THREE.CylinderGeometry(0.22, 0.22, 0.65, 20), this.mats.brass, [0, 0.325, 0])

    // Assorted rolled blueprints and mailing tubes
    for (let i = 0; i < 5; i++) {
      const tube = this.mesh(bin, new THREE.CylinderGeometry(0.038, 0.038, 0.95, 12), this.mats.cardboard, [
        Math.cos(i * 1.25) * 0.1,
        0.55,
        Math.sin(i * 1.25) * 0.1,
      ])
      tube.rotation.z = (i - 2) * 0.08
    }
  }

  // ─── Procedural High-Resolution Texture Generators ─────────────────────

  private createPlasterTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#f7f4ec'
    ctx.fillRect(0, 0, 1024, 1024)

    // Subtle Venetian plaster trowel strokes
    for (let i = 0; i < 280; i++) {
      const x = Math.random() * 1024
      const y = Math.random() * 1024
      const r = 40 + Math.random() * 90
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      const alpha = 0.015 + Math.random() * 0.025
      const isLight = Math.random() > 0.5
      grad.addColorStop(0, isLight ? \`rgba(255, 255, 255, \${alpha})\` : \`rgba(215, 205, 190, \${alpha})\`)
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(4, 3)
    tex.anisotropy = 8
    return tex
  }

  private createTravertineTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#eee7da'
    ctx.fillRect(0, 0, 1024, 1024)

    // Ashlar stone block courses
    const rowH = 256
    for (let y = 0; y < 1024; y += rowH) {
      // Horizontal mortar joint
      ctx.fillStyle = 'rgba(120, 110, 95, 0.45)'
      ctx.fillRect(0, y, 1024, 3)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.fillRect(0, y + 3, 1024, 1.5)

      // Vertical staggered joints
      const colW = 512
      const xOff = (y / rowH) % 2 === 0 ? 0 : 256
      for (let x = xOff; x < 1024; x += colW) {
        ctx.fillStyle = 'rgba(120, 110, 95, 0.45)'
        ctx.fillRect(x, y, 3, rowH)
      }

      // Natural sedimentary limestone striations
      for (let py = y + 8; py < y + rowH - 8; py += 12) {
        ctx.fillStyle = \`rgba(195, 185, 170, \${0.12 + Math.sin(py * 0.1) * 0.06})\`
        ctx.fillRect(0, py, 1024, 4 + Math.random() * 6)
      }
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(2, 2)
    tex.anisotropy = 8
    return tex
  }

  private createWoodSlatTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 512
    const ctx = canvas.getContext('2d')!

    // Dark acoustic background groove
    ctx.fillStyle = '#141210'
    ctx.fillRect(0, 0, 1024, 512)

    // Vertical dark American walnut timber battens
    const slatW = 48
    const grooveW = 16
    const step = slatW + grooveW

    for (let x = 0; x < 1024; x += step) {
      // Base walnut tone
      ctx.fillStyle = '#3a2a1d'
      ctx.fillRect(x, 0, slatW, 512)

      // Wood grain lines
      for (let gx = x + 3; gx < x + slatW - 3; gx += 4) {
        ctx.fillStyle = 'rgba(40, 26, 16, 0.35)'
        ctx.fillRect(gx, 0, 1.5, 512)
      }

      // Slat edge highlight and shadow bevel
      ctx.fillStyle = 'rgba(255, 235, 210, 0.18)'
      ctx.fillRect(x, 0, 1.5, 512)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fillRect(x + slatW - 2, 0, 2, 512)
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(3, 1)
    tex.anisotropy = 8
    return tex
  }

  private createCardboardTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!

    // Kraft paper brown
    ctx.fillStyle = '#c7a274'
    ctx.fillRect(0, 0, 512, 512)

    // Corrugated horizontal fluting lines
    ctx.fillStyle = 'rgba(120, 85, 45, 0.08)'
    for (let y = 0; y < 512; y += 4) {
      ctx.fillRect(0, y, 512, 1.5)
    }

    // White courier delivery label with barcode
    ctx.fillStyle = '#f8f8f8'
    ctx.fillRect(40, 60, 240, 160)
    ctx.strokeStyle = '#222'
    ctx.strokeRect(40, 60, 240, 160)

    ctx.fillStyle = '#111'
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText('PRIORITY FREIGHT', 55, 88)
    ctx.font = '11px sans-serif'
    ctx.fillText('TWO EYES FINE ART ARCHIVE', 55, 110)
    ctx.fillText('DEST: GALLERY LEVEL 1', 55, 126)

    // Barcode lines
    for (let bx = 55; bx < 250; bx += Math.floor(Math.random() * 5) + 3) {
      ctx.fillRect(bx, 142, Math.random() > 0.5 ? 2.5 : 1.2, 55)
    }

    // Red "FRAGILE / THIS SIDE UP" sticker
    ctx.fillStyle = '#b91c1c'
    ctx.fillRect(320, 70, 150, 140)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('FRAGILE', 395, 110)
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText('HANDLE WITH CARE', 395, 134)
    ctx.fillText('▲ THIS SIDE UP ▲', 395, 160)
    ctx.textAlign = 'left'

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }

  private createCrateTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!

    // Light pine timber
    ctx.fillStyle = '#cfb997'
    ctx.fillRect(0, 0, 512, 512)

    // Horizontal plank slats
    const plankH = 102
    for (let y = 0; y < 512; y += plankH) {
      ctx.fillStyle = 'rgba(70, 50, 30, 0.4)'
      ctx.fillRect(0, y, 512, 3)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
      ctx.fillRect(0, y + 3, 512, 1.5)

      // Wood grain
      for (let py = y + 4; py < y + plankH - 4; py += 5) {
        ctx.fillStyle = 'rgba(110, 85, 55, 0.08)'
        ctx.fillRect(0, py, 512, 1.5)
      }
    }

    // Black stencilled markings
    ctx.fillStyle = 'rgba(20, 20, 20, 0.75)'
    ctx.font = 'bold 28px sans-serif'
    ctx.fillText('TWO EYES · ARCHIVE', 45, 180)
    ctx.font = 'bold 18px sans-serif'
    ctx.fillText('LOT 04 / EXHIBITION ART', 45, 215)
    ctx.fillText('KEEP DRY  ☂  ▲▲', 45, 250)

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }

  private createPaletteTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!

    // Polished cherry wood palette
    ctx.fillStyle = '#7a4b2c'
    ctx.fillRect(0, 0, 512, 512)

    // Wood grain
    for (let y = 0; y < 512; y += 4) {
      ctx.fillStyle = 'rgba(60, 30, 15, 0.15)'
      ctx.fillRect(0, y, 512, 1.5)
    }

    // Authentic paint dollops arranged around the perimeter
    const swatches = [
      { color: '#1d4ed8', x: 80, y: 80, r: 24 },
      { color: '#0d9488', x: 160, y: 70, r: 22 },
      { color: '#15803d', x: 240, y: 65, r: 25 },
      { color: '#eab308', x: 320, y: 70, r: 24 },
      { color: '#ea580c', x: 400, y: 85, r: 22 },
      { color: '#b91c1c', x: 430, y: 160, r: 26 },
      { color: '#be185d', x: 440, y: 240, r: 24 },
      { color: '#f8fafc', x: 420, y: 320, r: 28 },
      { color: '#0f172a', x: 380, y: 400, r: 24 },
    ]

    for (const s of swatches) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fillStyle = s.color
      ctx.fill()
      // Glossy specular highlight on wet paint dollop
      ctx.beginPath()
      ctx.arc(s.x - 5, s.y - 6, s.r * 0.35, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
      ctx.fill()
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  private createValueStudyTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 640
    const ctx = canvas.getContext('2d')!

    // Classical artist value study on toned linen ground
    ctx.fillStyle = '#6b7280'
    ctx.fillRect(0, 0, 512, 640)

    // Classical plaster sphere showing core shadow, cast shadow, and highlight
    const sphereGrad = ctx.createRadialGradient(200, 240, 20, 256, 300, 160)
    sphereGrad.addColorStop(0, '#ffffff') // Specular highlight
    sphereGrad.addColorStop(0.35, '#cbd5e1') // Halftone
    sphereGrad.addColorStop(0.75, '#334155') // Core shadow
    sphereGrad.addColorStop(0.92, '#64748b') // Reflected light
    sphereGrad.addColorStop(1, '#0f172a') // Occlusion
    ctx.beginPath()
    ctx.arc(256, 300, 140, 0, Math.PI * 2)
    ctx.fillStyle = sphereGrad
    ctx.fill()

    // Cast shadow on pedestal
    ctx.beginPath()
    ctx.ellipse(320, 440, 140, 36, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)'
    ctx.fill()

    // 5-Step Value Ramp Comparator along bottom
    const ramp = ['#0f172a', '#334155', '#64748b', '#cbd5e1', '#f8fafc']
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = ramp[i]
      ctx.fillRect(76 + i * 72, 530, 68, 54)
      ctx.strokeStyle = '#ffffff'
      ctx.strokeRect(76 + i * 72, 530, 68, 54)
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  private createBookCoverTexture(title: string, colorHex: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 256
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#' + colorHex.toString(16).padStart(6, '0')
    ctx.fillRect(0, 0, 512, 256)

    // Book spine crease
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.fillRect(110, 0, 8, 256)

    // Embossed gold foil title on front cover
    ctx.fillStyle = '#f5d77f'
    ctx.font = 'bold 24px Georgia, serif'
    ctx.fillText(title, 145, 95)
    ctx.font = 'italic 16px Georgia, serif'
    ctx.fillText('Fine Art Monograph Series', 145, 135)
    ctx.font = '12px sans-serif'
    ctx.fillText('EYESEE ARCHITECTURAL PRESS', 145, 210)

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  private createPlacardTexture(title: string, harmony: string, medium: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 160
    const ctx = canvas.getContext('2d')!

    // Polished museum brass plate
    ctx.fillStyle = '#d4af37'
    ctx.fillRect(0, 0, 512, 160)

    // Outer engraved border
    ctx.strokeStyle = '#5a4510'
    ctx.lineWidth = 3
    ctx.strokeRect(8, 8, 496, 144)

    // Museum typography
    ctx.fillStyle = '#1c1708'
    ctx.font = 'bold 24px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.fillText(title, 256, 48)

    ctx.fillStyle = '#4a380e'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(harmony.toUpperCase(), 256, 82)

    ctx.font = 'italic 13px Georgia, serif'
    ctx.fillText(medium, 256, 115)

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  /** Generates high-resolution museum fine-art oil painting masterpieces for the gallery wall */
  private createArtworkTexture(type: 'monochromatic' | 'analogous' | 'complementary' | 'split-complementary'): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1280
    const ctx = canvas.getContext('2d')!

    if (type === 'monochromatic') {
      // ▮ 0° Monochromatic: "Nocturne in Ultramarine"
      // Moonlit ocean sea storm painted in rich Cobalt Blue, Prussian Blue, and Ice Tints
      const bg = ctx.createLinearGradient(0, 0, 0, 1280)
      bg.addColorStop(0, '#04091a')
      bg.addColorStop(0.35, '#0c1b3f')
      bg.addColorStop(0.55, '#1e3a8a')
      bg.addColorStop(0.85, '#172554')
      bg.addColorStop(1, '#080f24')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, 1024, 1280)

      // Dramatic moonlit sea storm clouds
      for (let i = 0; i < 18; i++) {
        const cx = 100 + Math.random() * 824
        const cy = 80 + Math.random() * 380
        const cr = 90 + Math.random() * 160
        const cgrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, cr)
        cgrad.addColorStop(0, 'rgba(59, 130, 246, 0.28)')
        cgrad.addColorStop(0.6, 'rgba(30, 58, 138, 0.18)')
        cgrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
        ctx.fillStyle = cgrad
        ctx.beginPath()
        ctx.arc(cx, cy, cr, 0, Math.PI * 2)
        ctx.fill()
      }

      // Luminous full moon with atmospheric halo
      const moonGrad = ctx.createRadialGradient(512, 280, 20, 512, 280, 260)
      moonGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)')
      moonGrad.addColorStop(0.18, 'rgba(224, 242, 254, 0.95)')
      moonGrad.addColorStop(0.45, 'rgba(147, 197, 253, 0.45)')
      moonGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = moonGrad
      ctx.beginPath()
      ctx.arc(512, 280, 260, 0, Math.PI * 2)
      ctx.fill()

      // Ocean horizon & breaking swells
      const horizonY = 620
      const seaGrad = ctx.createLinearGradient(0, horizonY, 0, 1280)
      seaGrad.addColorStop(0, '#0c1d4a')
      seaGrad.addColorStop(0.5, '#1e40af')
      seaGrad.addColorStop(1, '#050c1f')
      ctx.fillStyle = seaGrad
      ctx.fillRect(0, horizonY, 1024, 660)

      // Shimmering moonbeam light path reflecting down the ocean waves
      for (let y = horizonY; y < 1280; y += 8) {
        const spread = ((y - horizonY) / 660) * 280 + 35
        ctx.fillStyle = \`rgba(224, 242, 254, \${0.45 - (y - horizonY) * 0.00035})\`
        ctx.fillRect(512 - spread / 2 + Math.sin(y * 0.1) * 15, y, spread, 4)
      }

      // Rhythmic crashing ocean wave crests & white sea spray
      const waves = [690, 780, 890, 1020, 1160]
      for (let i = 0; i < waves.length; i++) {
        const wy = waves[i]
        ctx.beginPath()
        ctx.moveTo(0, wy)
        for (let x = 0; x <= 1024; x += 40) {
          ctx.lineTo(x, wy + Math.sin(x * 0.015 + i * 1.5) * (26 + i * 8))
        }
        ctx.lineTo(1024, 1280)
        ctx.lineTo(0, 1280)
        ctx.closePath()
        ctx.fillStyle = \`rgba(15, 30, 75, \${0.7 + i * 0.06})\`
        ctx.fill()

        // White foam edge
        ctx.beginPath()
        ctx.moveTo(0, wy)
        for (let x = 0; x <= 1024; x += 40) {
          ctx.lineTo(x, wy + Math.sin(x * 0.015 + i * 1.5) * (26 + i * 8))
        }
        ctx.strokeStyle = 'rgba(224, 242, 254, 0.72)'
        ctx.lineWidth = 3.5 + i * 1.2
        ctx.stroke()
      }
    } else if (type === 'analogous') {
      // ≋ 30° Analogous: "Nordic Fjord & Pine Mist"
      // Luminous landscape transition from Deep Emerald Pine (150°) to Teal Water (180°) and Cerulean Alpine Sky (210°)
      const bg = ctx.createLinearGradient(0, 0, 0, 1280)
      bg.addColorStop(0, '#0284c7')
      bg.addColorStop(0.3, '#0d9488')
      bg.addColorStop(0.55, '#14b8a6')
      bg.addColorStop(0.75, '#047857')
      bg.addColorStop(1, '#064e3b')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, 1024, 1280)

      // Layered mountain ridge silhouettes in teal/cerulean haze
      const ridges = [
        { y: 380, color: '#0f766e', amp: 90 },
        { y: 520, color: '#115e59', amp: 110 },
        { y: 660, color: '#044e47', amp: 75 },
      ]
      for (const r of ridges) {
        ctx.beginPath()
        ctx.moveTo(0, r.y)
        for (let x = 0; x <= 1024; x += 60) {
          ctx.lineTo(x, r.y + Math.sin(x * 0.008 + r.amp) * r.amp - Math.cos(x * 0.016) * 35)
        }
        ctx.lineTo(1024, 1280)
        ctx.lineTo(0, 1280)
        ctx.closePath()
        ctx.fillStyle = r.color
        ctx.fill()
      }

      // Crystalline turquoise glacial fjord water
      const lakeY = 740
      const lakeGrad = ctx.createLinearGradient(0, lakeY, 0, 1280)
      lakeGrad.addColorStop(0, '#0d9488')
      lakeGrad.addColorStop(0.4, '#14b8a6')
      lakeGrad.addColorStop(0.7, '#0f766e')
      lakeGrad.addColorStop(1, '#064e3b')
      ctx.fillStyle = lakeGrad
      ctx.fillRect(0, lakeY, 1024, 540)

      // Emerald pine tree silhouettes in foreground
      for (let tx = 0; tx < 1024; tx += 48) {
        const th = 180 + Math.sin(tx * 0.05) * 60 + Math.random() * 40
        ctx.fillStyle = '#022c22'
        ctx.beginPath()
        ctx.moveTo(tx, 1280)
        ctx.lineTo(tx + 24, 1280 - th)
        ctx.lineTo(tx + 48, 1280)
        ctx.closePath()
        ctx.fill()
      }
    } else if (type === 'complementary') {
      // ↔ 180° Complementary: "Sunset Over Solstice Waters"
      // Turner-style fiery Molten Vermilion/Amber Sunset (30°) vs Deep Cobalt Navy Waters (210°)
      const bg = ctx.createLinearGradient(0, 0, 0, 680)
      bg.addColorStop(0, '#7c2d12')
      bg.addColorStop(0.25, '#c2410c')
      bg.addColorStop(0.5, '#ea580c')
      bg.addColorStop(0.78, '#f59e0b')
      bg.addColorStop(0.96, '#fef08a')
      bg.addColorStop(1, '#ffffff')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, 1024, 680)

      // Radiant setting sun on the horizon
      const sunGrad = ctx.createRadialGradient(512, 670, 20, 512, 670, 280)
      sunGrad.addColorStop(0, '#ffffff')
      sunGrad.addColorStop(0.25, '#fef08a')
      sunGrad.addColorStop(0.65, '#ea580c')
      sunGrad.addColorStop(1, 'rgba(124, 45, 18, 0)')
      ctx.fillStyle = sunGrad
      ctx.beginPath()
      ctx.arc(512, 670, 280, 0, Math.PI, true)
      ctx.fill()

      // Deep polar opposite Cobalt Navy / Indigo ocean water
      const seaY = 675
      const seaGrad = ctx.createLinearGradient(0, seaY, 0, 1280)
      seaGrad.addColorStop(0, '#172554')
      seaGrad.addColorStop(0.35, '#1e3a8a')
      seaGrad.addColorStop(0.75, '#1d4ed8')
      seaGrad.addColorStop(1, '#0f172a')
      ctx.fillStyle = seaGrad
      ctx.fillRect(0, seaY, 1024, 605)

      // Shimmering molten gold path of sunlight reflected across indigo swells
      for (let y = seaY; y < 1280; y += 6) {
        const spread = ((y - seaY) / 605) * 360 + 50
        ctx.fillStyle = \`rgba(251, 191, 36, \${0.75 - (y - seaY) * 0.0006})\`
        ctx.fillRect(512 - spread / 2 + Math.sin(y * 0.08) * 20, y, spread, 3)
      }
    } else {
      // ▲ 150°/210° Split-Complementary: "Harmonic Equilibrium"
      // Museum-grade modernist architectural composition (Cobalt Blue vs Saffron Ochre & Terracotta)
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, 1024, 1280)

      // Textured raw canvas ground
      ctx.fillStyle = '#1e293b'
      ctx.fillRect(60, 60, 904, 1160)

      // Dynamic Bauhaus geometric cantilevered shapes
      // 1. Saffron Ochre semi-arch
      ctx.fillStyle = '#eab308'
      ctx.beginPath()
      ctx.arc(512, 460, 320, 0, Math.PI)
      ctx.fill()

      // 2. Cobalt Blue bold angled polygon
      ctx.fillStyle = '#1d4ed8'
      ctx.beginPath()
      ctx.moveTo(180, 720)
      ctx.lineTo(880, 350)
      ctx.lineTo(790, 960)
      ctx.closePath()
      ctx.fill()

      // 3. Terracotta Coral architectural block
      ctx.fillStyle = '#ea580c'
      ctx.beginPath()
      ctx.rect(260, 310, 190, 530)
      ctx.fill()

      // 4. Gilded gold foil circle accent
      ctx.beginPath()
      ctx.arc(512, 530, 95, 0, Math.PI * 2)
      ctx.strokeStyle = '#f8fafc'
      ctx.lineWidth = 26
      ctx.stroke()
    }

    // Fine Belgian linen fabric weave texture overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.028)'
    for (let y = 0; y < 1280; y += 3) ctx.fillRect(0, y, 1024, 1)
    for (let x = 0; x < 1024; x += 3) ctx.fillRect(x, 0, 1, 1280)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
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
    canvas.width = 2048
    canvas.height = 1024
    const ctx = canvas.getContext('2d')!

    // Base warm French White Oak tone
    ctx.fillStyle = '#e2d5bd'
    ctx.fillRect(0, 0, 2048, 1024)

    const plankHeight = 128
    for (let y = 0; y < 1024; y += plankHeight) {
      // Subtle tonal variation between different planks
      const plankTone = ((y / plankHeight) % 4) * 5 - 8
      ctx.fillStyle = \`rgba(\${226 + plankTone}, \${213 + plankTone}, \${189 + plankTone}, 0.38)\`
      ctx.fillRect(0, y, 2048, plankHeight)

      // Beveled plank seam shadow and highlight
      ctx.fillStyle = 'rgba(75, 55, 35, 0.45)'
      ctx.fillRect(0, y, 2048, 3)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
      ctx.fillRect(0, y + 3, 2048, 1.5)

      // Staggered vertical plank end joints
      const xOffset = ((y / plankHeight) % 3) * 680 + 340
      for (let x = xOffset; x < 2048; x += 1024) {
        ctx.fillStyle = 'rgba(75, 55, 35, 0.45)'
        ctx.fillRect(x % 2048, y, 3, plankHeight)
      }

      // Fine organic wood grain fibers & growth rings
      for (let py = y + 4; py < y + plankHeight - 4; py += 3) {
        ctx.beginPath()
        ctx.strokeStyle = \`rgba(130, 105, 78, \${0.08 + Math.sin(py * 0.15) * 0.04})\`
        ctx.lineWidth = 1.1
        ctx.moveTo(0, py + Math.sin(py * 0.04) * 4)
        for (let x = 64; x <= 2048; x += 64) {
          ctx.lineTo(x, py + Math.sin((x + py) * 0.02) * 3)
        }
        ctx.stroke()
      }

      // Organic wood knots
      if ((y / plankHeight) % 2 === 0) {
        const kx = ((y * 7) % 1800) + 120
        const ky = y + plankHeight / 2
        ctx.beginPath()
        ctx.ellipse(kx, ky, 22, 10, 0.1, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(95, 68, 45, 0.25)'
        ctx.fill()
      }
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(4, 4)
    texture.anisotropy = 8
    texture.generateMipmaps = true

    return new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xfbf6ee,
      roughness: 0.32,
      metalness: 0.02,
    })
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
`

fs.writeFileSync(filePath, code, 'utf-8')
console.log('Successfully wrote photorealistic studio-world.ts')
