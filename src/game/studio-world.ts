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
 * Architectural Visualization Standard — Luxury Daylight Art Studio ("Daylight Studio").
 * Features photorealistic PBR materials (French White Oak plank floor with clearcoat and normal maps,
 * Venetian lime plaster, fluted dark walnut acoustic battens, travertine limestone ashlar,
 * transparent daylight architectural glass with garden sky panoramas beyond, champagne bronze),
 * soft natural sun with PCF soft shadows, 4 museum-grade fine art oil paintings with
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
    concrete: THREE.MeshStandardMaterial
    woodSlat: THREE.MeshStandardMaterial
    travertine: THREE.MeshStandardMaterial
    trim: THREE.MeshStandardMaterial
    brass: THREE.MeshStandardMaterial
    champagneBronze: THREE.MeshStandardMaterial
    wood: THREE.MeshStandardMaterial
    darkWood: THREE.MeshStandardMaterial
    canvas: THREE.MeshStandardMaterial
    clearGlass: THREE.MeshStandardMaterial
    windowGlass: THREE.MeshPhysicalMaterial
    blackSteel: THREE.MeshStandardMaterial
    leaf: THREE.MeshStandardMaterial
    pottery: THREE.MeshStandardMaterial
    cardboard: THREE.MeshStandardMaterial
    crate: THREE.MeshStandardMaterial
  }

  constructor(readonly physics: Physics, renderer: Renderer) {
    // Soft atmospheric daylight sky background
    this.scene.background = new THREE.Color(0xbddaf5)

    // 1. Initial PMREM RoomEnvironment for immediate synchronous display
    const room = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(renderer.gl)
    this.environment = pmrem.fromScene(room, 0.04).texture
    this.scene.environment = this.environment
    this.scene.environmentIntensity = 0.52
    pmrem.dispose()

    // 2. Real CC0 Poly Haven 4K sunny sky HDRI photograph with clouds, distant treeline, and real lighting
    if (typeof window !== 'undefined') {
      import('three/examples/jsm/loaders/RGBELoader.js')
        .then(({ RGBELoader }) => {
          new RGBELoader().load(
            '/environments/kloppenheim_02_4k.hdr',
            hdrTexture => {
              hdrTexture.mapping = THREE.EquirectangularReflectionMapping
              this.scene.background = hdrTexture
              this.scene.backgroundBlurriness = 0.035
              this.scene.environment = hdrTexture
              this.scene.environmentIntensity = 0.72
            },
            undefined,
            () => {
              new RGBELoader().load('/environments/kloppenheim_02_2k.hdr', hdr2k => {
                hdr2k.mapping = THREE.EquirectangularReflectionMapping
                this.scene.background = hdr2k
                this.scene.backgroundBlurriness = 0.035
                this.scene.environment = hdr2k
                this.scene.environmentIntensity = 0.72
              })
            },
          )
        })
        .catch(() => {})
    }

    this.initMaterials()
    this.addDaylightLighting()
    this.buildRoom()
    this.buildFurniture()
    this.buildStudioProps()
    this.loadGltfAssets()

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

    // Subtle Floor Projection Waypoint Ring (soft pulse, no white floor disc)
    this.floorWaypointRing = new THREE.Group()
    const floorOuter = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.02, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    )
    floorOuter.rotation.x = Math.PI / 2
    this.floorWaypointRing.add(floorOuter)

    const floorInner = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.012, 8, 36),
      new THREE.MeshBasicMaterial({ color: 0xb48b27, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    )
    floorInner.rotation.x = Math.PI / 2
    this.floorWaypointRing.add(floorInner)

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
    const plasterNormal = this.createPlasterNormal()
    const concreteTex = this.createConcreteTexture()
    const concreteNormal = this.createConcreteNormal()
    const travertineTex = this.createTravertineTexture()
    const woodSlatTex = this.createWoodSlatTexture()
    const woodSlatNormal = this.createWoodSlatNormal()
    const cardboardTex = this.createCardboardTexture()
    const crateTex = this.createCrateTexture()

    this.mats = {
      wall: new THREE.MeshStandardMaterial({
        map: plasterTex,
        normalMap: plasterNormal,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughness: 0.88,
        metalness: 0.01,
      }),
      wallDark: new THREE.MeshStandardMaterial({
        map: plasterTex,
        normalMap: plasterNormal,
        normalScale: new THREE.Vector2(0.35, 0.35),
        color: 0xe6e0d6,
        roughness: 0.85,
        metalness: 0.02,
      }),
      concrete: new THREE.MeshStandardMaterial({
        map: concreteTex,
        normalMap: concreteNormal,
        normalScale: new THREE.Vector2(0.65, 0.65),
        roughness: 0.84,
        metalness: 0.02,
      }),
      woodSlat: new THREE.MeshStandardMaterial({
        map: woodSlatTex,
        normalMap: woodSlatNormal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughness: 0.42,
        metalness: 0.04,
      }),
      travertine: new THREE.MeshStandardMaterial({
        map: travertineTex,
        roughness: 0.68,
        metalness: 0.04,
      }),
      trim: new THREE.MeshStandardMaterial({ color: 0x22272e, roughness: 0.28, metalness: 0.82 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.92 }),
      champagneBronze: new THREE.MeshStandardMaterial({ color: 0xc8b28a, roughness: 0.28, metalness: 0.86 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x8a6245, roughness: 0.48, metalness: 0.02 }),
      darkWood: new THREE.MeshStandardMaterial({ color: 0x36281e, roughness: 0.52, metalness: 0.04 }),
      canvas: new THREE.MeshStandardMaterial({ color: 0xfdfaf5, roughness: 0.94, metalness: 0.0 }),
      clearGlass: new THREE.MeshStandardMaterial({
        color: 0xe8f4fc,
        roughness: 0.08,
        metalness: 0.1,
        transparent: true,
        opacity: 0.32,
      }),
      windowGlass: new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.04,
        metalness: 0.02,
        transparent: true,
        opacity: 0.18,
        reflectivity: 0.85,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        envMapIntensity: 0.85,
      }),
      blackSteel: new THREE.MeshStandardMaterial({
        color: 0x2b3038,
        roughness: 0.28,
        metalness: 0.85,
        envMapIntensity: 0.80,
      }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x1e492b, roughness: 0.52, metalness: 0.04 }),
      pottery: new THREE.MeshStandardMaterial({ color: 0xba6a4e, roughness: 0.76, metalness: 0.02 }),
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

  setTargetHover(_target: StudioTarget | null): void {
    // Non-destructive hover state: preserves authentic wood, plaster, and bronze materials
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
      this.floorWaypointRing.rotation.y += delta * 0.35
      const pulse = 1 + Math.sin(time * 2.5) * 0.045
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
    // 1. Cool sky fill from above paired with warm wood floor bounce from below
    const skyFill = new THREE.HemisphereLight(0x7ea8db, 0x5a4635, 0.45)
    this.scene.add(skyFill)

    // 2. Strong warm directional sunlight matched to the sunny exterior sky
    const sun = new THREE.DirectionalLight(0xfff5e0, 2.3)
    this.keyLight = sun
    sun.position.set(-8.8, 9.5, -3.0)
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    sun.shadow.camera.left = -11
    sun.shadow.camera.right = 11
    sun.shadow.camera.top = 9
    sun.shadow.camera.bottom = -9
    sun.shadow.bias = -0.0001
    sun.shadow.normalBias = 0.024
    this.scene.add(sun)

    // 3. Warm daylight bounce light spilling from the West windows onto the floor and walls
    const windowBounce = new THREE.PointLight(0xffdfba, 1.15, 18, 1.6)
    windowBounce.position.set(-7.5, 2.2, 0)
    this.scene.add(windowBounce)

    const windowSpill = new THREE.DirectionalLight(0xffe4c2, 0.65)
    windowSpill.position.set(-9.0, 1.8, 0)
    windowSpill.target.position.set(0, 1.6, 0)
    this.scene.add(windowSpill)
    this.scene.add(windowSpill.target)

    // 4. Bright rim light glancing off objects, pillars, and easels near the window wall
    const rimLight = new THREE.DirectionalLight(0xfffaee, 1.1)
    rimLight.position.set(-9.2, 3.2, -0.6)
    rimLight.target.position.set(-2.0, 1.2, 0.6)
    this.scene.add(rimLight)
    this.scene.add(rimLight.target)

    // 5. Accent fill light illuminating the left foreground window frame so its edges and sheen are clearly readable
    const leftFrameLight = new THREE.PointLight(0xffeedb, 0.95, 8, 1.8)
    leftFrameLight.position.set(-7.8, 2.4, 4.2)
    this.scene.add(leftFrameLight)

    // 6. Recessed architectural spotlights over stations (soft warm gallery lighting with contact shadows)
    this.addTrackSpot(0, 5.4, 3.05, 0, 0.95, 2.95, true, 1.8, 0.55) // Over mixing bench (targeted cleanly on worktop, no floor blowout)
    this.addTrackSpot(-3.25, 5.4, 0.55, -3.25, 1.35, 0.55, true, 2.4, 0.7) // Over value easel
    this.addTrackSpot(6.85, 5.4, -0.25, 6.85, 1.8, -0.25, true, 2.4, 0.7) // Over shelf
    this.addTrackSpot(0, 5.4, -6.5, 0, 1.9, -7.15, true, 2.4, 0.7) // Over vault door
  }

  private addTrackSpot(
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number,
    castShadow = false,
    intensity = 2.4,
    penumbra = 0.7,
  ): void {
    const light = new THREE.SpotLight(0xffeed6, intensity, 9, Math.PI / 5, penumbra, 2.0)
    light.position.set(x, y, z)
    light.target.position.set(tx, ty, tz)
    if (castShadow) {
      light.castShadow = true
      light.shadow.mapSize.set(1024, 1024)
      light.shadow.bias = -0.00025
      light.shadow.normalBias = 0.02
    }
    this.scene.add(light)
    this.scene.add(light.target)

    const fixture = new THREE.Group()
    fixture.position.set(x, y, z)
    this.mesh(fixture, new THREE.CylinderGeometry(0.04, 0.06, 0.14, 12), this.mats.blackSteel, [0, -0.07, 0], false)
    this.scene.add(fixture)
  }

  private buildRoom(): void {
    // 1. Natural French White Oak Plank Flooring (Receives shadows, does not cast)
    this.box('Studio floor', v3(18, 0.36, 15), v3(0, -0.18, 0), this.floorMaterial(), true, false)

    // Real directional window sunlight patches across the oak floorboards
    this.addWindowSunlightPatches()

    // 2. Ivory Architectural Ceiling with Recessed Light Channels
    this.box('Ceiling', v3(18, 0.28, 15), v3(0, 5.58, 0), this.mats.wallDark, false, false)

    // 3. Perimeter Walls with Real Window Apertures
    this.box('North wall (Vault Feature Wall)', v3(18, 5.6, 0.38), v3(0, 2.8, -7.5), this.mats.wallDark, true, false)
    this.box('South wall (Curator Gallery)', v3(18, 5.6, 0.38), v3(0, 2.8, 7.5), this.mats.wall, true, false)

    // Architectural Window Walls (West and East) with real openings for daylight
    for (const sx of [-1, 1]) {
      const x = sx * 9
      const wallTag = sx < 0 ? 'West' : 'East'
      // Spandrel wall below sills
      this.box(`${wallTag} wall spandrel`, v3(0.38, 0.8, 15), v3(x, 0.4, 0), this.mats.wall, true, false)
      // Transom wall above windows
      this.box(`${wallTag} wall transom`, v3(0.38, 1.0, 15), v3(x, 5.1, 0), this.mats.wall, true, false)
      // Structural piers between window bays
      this.box(`${wallTag} pier north`, v3(0.38, 3.8, 1.7), v3(x, 2.7, -6.65), this.mats.wall, true, false)
      this.box(`${wallTag} pier mid-north`, v3(0.38, 3.8, 1.25), v3(x, 2.7, -2.175), this.mats.wall, true, false)
      this.box(`${wallTag} pier mid-south`, v3(0.38, 3.8, 1.25), v3(x, 2.7, 2.175), this.mats.wall, true, false)
      this.box(`${wallTag} pier south`, v3(0.38, 3.8, 1.7), v3(x, 2.7, 6.65), this.mats.wall, true, false)
    }

    // Solid Wood Ceiling Trusses
    for (const z of [-4.5, -1.5, 1.5, 4.5]) {
      this.box('Ceiling timber beam', v3(17.6, 0.22, 0.2), v3(0, 5.38, z), this.mats.darkWood, false, false)
    }

    // Architectural Trim & Baseboards
    for (const x of [-8.77, 8.77]) {
      this.box('Baseboard', v3(0.06, 0.22, 14.2), v3(x, 0.11, 0), this.mats.trim, false, false)
      this.box('Crown cornice', v3(0.12, 0.14, 14.2), v3(x, 5.48, 0), this.mats.trim, false, false)
    }
    for (const z of [-7.27, 7.27]) {
      this.box('Baseboard', v3(17.2, 0.22, 0.06), v3(0, 0.11, z), this.mats.trim, false, false)
      this.box('Crown cornice', v3(17.2, 0.14, 0.12), v3(0, 5.48, z), this.mats.trim, false, false)
    }

    // Floor-to-ceiling Architectural Windows with Daylight Glass (Defocussed real HDRI sky visible through glazing)
    for (const z of [-4.35, 0, 4.35]) {
      for (const sx of [-1, 1]) {
        const x = sx * 8.85
        // Real glass with subtle reflection
        this.box('Daylight window glass', v3(0.02, 3.8, 3.1), v3(x, 2.7, z), this.mats.windowGlass, false, false)
        // Architectural thick metal frames (chamfered dark steel with metallic sheen)
        this.box('Window frame vertical', v3(0.12, 3.85, 0.10), v3(x, 2.7, z - 1.55), this.mats.blackSteel, false, false)
        this.box('Window frame vertical', v3(0.12, 3.85, 0.10), v3(x, 2.7, z + 1.55), this.mats.blackSteel, false, false)
        this.box('Window frame center post', v3(0.10, 3.82, 0.08), v3(x, 2.7, z), this.mats.blackSteel, false, false)
        this.box('Window transom mid-rail', v3(0.10, 0.08, 3.1), v3(x, 2.7, z), this.mats.blackSteel, false, false)
        // Architectural beveled edge reveals catching light highlights
        this.box('Window frame inner bevel', v3(0.04, 3.85, 0.04), v3(x - sx * 0.05, 2.7, z - 1.55), this.mats.champagneBronze, false, false)
        this.box('Window frame inner bevel', v3(0.04, 3.85, 0.04), v3(x - sx * 0.05, 2.7, z + 1.55), this.mats.champagneBronze, false, false)
        // Architectural solid oak interior sill
        this.box('Window sill', v3(0.32, 0.08, 3.25), v3(x - sx * 0.1, 0.78, z), this.mats.darkWood, false, false)
      }
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

    // Botanical accents physics colliders (visual models loaded via photorealistic GLTF)
    this.physics.addStaticCylinder(v3(-7.2, 0.35, -5.6), 0.35, 0.7)
    this.physics.addStaticCylinder(v3(7.2, 0.35, -5.6), 0.35, 0.7)
    this.physics.addStaticCylinder(v3(7.2, 0.25, 5.8), 0.35, 0.5)
    this.physics.addStaticCylinder(v3(-7.2, 0.25, 5.8), 0.35, 0.5)
    this.addArchitecturalBench(0, -1.8)
    this.addStool(-1.9, -0.45)

    // Structural Architectural Columns with Classical Skirting & Chamfered Moulding
    this.addStructuralPillar(-4.5, 1.5)
    this.addStructuralPillar(4.5, 1.5)

    // Ground contact shadows grounding furniture and plants on the floor with strong dark occlusion
    this.addContactShadow(v3(0, 0, -1.8), new THREE.Vector2(2.7, 1.05), 0.82)
    this.addContactShadow(v3(-1.9, 0, -0.45), new THREE.Vector2(0.75, 0.75), 0.82)
    this.addContactShadow(v3(-4.5, 0, 1.5), new THREE.Vector2(1.35, 1.35), 0.86)
    this.addContactShadow(v3(4.5, 0, 1.5), new THREE.Vector2(1.35, 1.35), 0.86)
    this.addContactShadow(v3(-7.2, 0, -5.6), new THREE.Vector2(1.0, 1.0), 0.82)
    this.addContactShadow(v3(7.2, 0, -5.6), new THREE.Vector2(1.0, 1.0), 0.82)
    this.addContactShadow(v3(7.2, 0, 5.8), new THREE.Vector2(0.95, 0.95), 0.82)
    this.addContactShadow(v3(-7.2, 0, 5.8), new THREE.Vector2(0.95, 0.95), 0.82)
  }

  /** Populates the studio with realistic artist props, wooden crates, cardboard boxes, and supplies */
  private buildStudioProps(): void {
    // 1. Wooden Fine-Art Shipping Crates (Physics colliders; visual models loaded via GLTF)
    this.physics.addStaticBox(v3(-7.2, 0.35, -3.2), v3(1.0, 0.7, 0.8))
    this.physics.addStaticBox(v3(6.8, 0.25, 3.8), v3(1.0, 0.5, 0.6))
    this.physics.addStaticBox(v3(5.6, 0.25, -5.8), v3(1.0, 0.5, 0.6))

    // 2. Corrugated Cardboard Packaging Boxes (Physics colliders; visual models loaded via GLTF)
    this.physics.addStaticBox(v3(-1.8, 0.38, 3.6), v3(0.65, 0.75, 0.65))
    this.physics.addStaticBox(v3(7.1, 0.21, 1.9), v3(0.6, 0.42, 0.6))
    this.physics.addStaticBox(v3(5.2, 0.19, 6.2), v3(0.55, 0.38, 0.55))
    this.physics.addStaticBox(v3(-4.8, 0.18, -6.2), v3(0.5, 0.36, 0.5))

    // Strong dark contact shadows for props & storage
    this.addContactShadow(v3(-1.8, 0, 3.6), new THREE.Vector2(0.95, 0.95), 0.85)
    this.addContactShadow(v3(7.1, 0, 1.9), new THREE.Vector2(0.9, 0.9), 0.82)
    this.addContactShadow(v3(5.2, 0, 6.2), new THREE.Vector2(0.85, 0.85), 0.80)
    this.addContactShadow(v3(-4.8, 0, -6.2), new THREE.Vector2(0.85, 0.85), 0.80)
    this.addContactShadow(v3(-7.2, 0, -3.2), new THREE.Vector2(1.3, 1.05), 0.85)
    this.addContactShadow(v3(6.8, 0, 3.8), new THREE.Vector2(1.4, 1.05), 0.85)
    this.addContactShadow(v3(5.6, 0, -5.8), new THREE.Vector2(1.2, 0.95), 0.82)
    this.addContactShadow(v3(-7.2, 0, -0.2), new THREE.Vector2(0.95, 0.95), 0.85)

    // 3. Stretched Artist Canvases Leaning on Walls
    this.addLeaningCanvases(this.scene, v3(-5.8, 0, 6.95), 0)
    this.addLeaningCanvases(this.scene, v3(-8.72, 0, -1.8), Math.PI / 2)

    // 4. Stacks of Fine Art Reference Books
    this.addBookStack(this.scene, v3(3.8, 0.54, 4.8), 4)

    // 5. Blueprint Tube Bin
    this.addBlueprintTubeBin(this.scene, v3(6.85, 0, 2.2))

    // 6. Classical Plaster Sculpture Bust in window bay
    this.addPlasterBust(this.scene, v3(-7.2, 0, -0.2))

    // 7. Architectural White Archival Box Stack (Double-thickness museum board with separate telescoping lids)
    this.addArchivalBoxStack(this.scene, v3(7.1, 0, 1.9), 0.08)
  }

  private addArchivalBoxStack(parent: THREE.Object3D, basePos: THREE.Vector3, rotY: number): void {
    const stack = new THREE.Group()
    stack.position.copy(basePos)
    stack.rotation.y = rotY
    parent.add(stack)

    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xf5f3ec,
      roughness: 0.86,
      metalness: 0.0,
    })
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x242830,
      roughness: 0.38,
      metalness: 0.75,
    })

    // Bottom Box (Heavy archival linen storage box with telescoping lid)
    this.mesh(stack, new THREE.BoxGeometry(0.72, 0.32, 0.54), boxMat, [0, 0.16, 0])
    this.mesh(stack, new THREE.BoxGeometry(0.74, 0.06, 0.56), boxMat, [0, 0.33, 0])
    this.mesh(stack, new THREE.BoxGeometry(0.742, 0.015, 0.562), trimMat, [0, 0.305, 0])
    for (const cx of [-0.36, 0.36]) {
      for (const cz of [-0.27, 0.27]) {
        this.mesh(stack, new THREE.BoxGeometry(0.04, 0.06, 0.04), this.mats.brass, [cx, 0.33, cz])
      }
    }
    this.mesh(stack, new THREE.BoxGeometry(0.12, 0.05, 0.01), this.mats.brass, [0, 0.20, 0.272])

    // Top Box (nested with slight natural angle)
    const topBox = new THREE.Group()
    topBox.position.set(0.02, 0.36, -0.01)
    topBox.rotation.y = -0.06
    stack.add(topBox)

    this.mesh(topBox, new THREE.BoxGeometry(0.64, 0.28, 0.48), boxMat, [0, 0.14, 0])
    this.mesh(topBox, new THREE.BoxGeometry(0.66, 0.055, 0.50), boxMat, [0, 0.29, 0])
    this.mesh(topBox, new THREE.BoxGeometry(0.662, 0.014, 0.502), trimMat, [0, 0.268, 0])
    for (const cx of [-0.32, 0.32]) {
      for (const cz of [-0.24, 0.24]) {
        this.mesh(topBox, new THREE.BoxGeometry(0.035, 0.055, 0.035), this.mats.brass, [cx, 0.29, cz])
      }
    }
    this.mesh(topBox, new THREE.BoxGeometry(0.10, 0.045, 0.01), this.mats.brass, [0, 0.18, 0.242])
  }

  /** Installation 01: Subtractive Pigment Mixing Bench */
  private addMixingBench(): void {
    const x = 0
    const z = 3.05

    // Heavy solid architectural timber workbench top with bevelled chamfer edges
    this.box('Mixing bench slab', v3(3.8, 0.12, 1.35), v3(x, 0.88, z), this.mats.darkWood, true)
    // Upper chamfered rim
    this.mesh(this.scene, new THREE.BoxGeometry(3.84, 0.03, 1.39), this.mats.darkWood, [x, 0.945, z])
    // Lower bullnose reveal trim
    this.mesh(this.scene, new THREE.BoxGeometry(3.82, 0.02, 1.37), this.mats.trim, [x, 0.81, z])

    // Breadboard end caps (solid end-grain caps on both bench sides)
    for (const bx of [-1.89, 1.89]) {
      this.mesh(this.scene, new THREE.BoxGeometry(0.06, 0.15, 1.37), this.mats.wood, [x + bx, 0.88, z])
    }

    // Heavy joinery aprons with reveal grooves and brass reinforcement corner brackets
    for (const az of [-0.54, 0.54]) {
      this.box('Bench apron', v3(3.4, 0.18, 0.06), v3(x, 0.73, z + az), this.mats.darkWood, false)
    }
    for (const ax of [-1.65, 1.65]) {
      this.box('Bench end apron', v3(0.06, 0.18, 1.02), v3(x + ax, 0.73, z), this.mats.darkWood, false)
    }

    // Heavy square bevelled legs with brass shoe ferrules at the base
    for (const dx of [-1.65, 1.65]) {
      for (const dz of [-0.52, 0.52]) {
        // Main solid leg
        this.box('Bench leg', v3(0.14, 0.78, 0.14), v3(x + dx, 0.41, z + dz), this.mats.wood, true)
        // Brass shoe ferrule at floor contact
        this.mesh(this.scene, new THREE.BoxGeometry(0.15, 0.06, 0.15), this.mats.brass, [x + dx, 0.03, z + dz])
        // Leg top bracket collar
        this.mesh(this.scene, new THREE.BoxGeometry(0.16, 0.04, 0.16), this.mats.brass, [x + dx, 0.79, z + dz])
      }
    }

    // Bottom H-stretcher crossbars for realistic furniture stability
    this.box('Bench stretcher long', v3(3.3, 0.06, 0.06), v3(x, 0.22, z), this.mats.darkWood, false)
    for (const dx of [-1.65, 1.65]) {
      this.box('Bench stretcher cross', v3(0.06, 0.06, 1.04), v3(x + dx, 0.22, z), this.mats.darkWood, false)
    }

    // Ground contact shadows under bench footprint and legs
    this.addContactShadow(v3(x, 0, z), new THREE.Vector2(4.2, 1.6), 0.72)
    for (const dx of [-1.65, 1.65]) {
      for (const dz of [-0.52, 0.52]) {
        this.addContactShadow(v3(x + dx, 0, z + dz), new THREE.Vector2(0.42, 0.42), 0.88)
      }
    }

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
    // Real metal paint tins with rolled rims, recessed lid chime, glossy liquid paint, and wire bail handles
    const canColors = [0x1d4ed8, 0xeab308, 0xb91c1c, 0xf8fafc]
    const tinMat = new THREE.MeshStandardMaterial({
      color: 0xd6dbdf,
      roughness: 0.22,
      metalness: 0.88,
    })
    const bailMat = new THREE.MeshStandardMaterial({
      color: 0x8a929a,
      roughness: 0.32,
      metalness: 0.92,
    })

    for (let i = 0; i < 4; i++) {
      const cx = -1.15 + i * 0.76
      const can = new THREE.Group()
      can.position.set(cx, 0.96, 0.03) // Sits flush on bench top surface
      object.add(can)

      // 1. Wet liquid paint pool
      const paintLiquidMat = new THREE.MeshPhysicalMaterial({
        color: canColors[i],
        roughness: 0.04,
        metalness: 0.02,
        clearcoat: 0.95,
        clearcoatRoughness: 0.04,
      })

      // 2. Main cylindrical tin body
      this.mesh(can, new THREE.CylinderGeometry(0.20, 0.20, 0.44, 32), tinMat, [0, 0.22, 0])
      // Rolled upper chime rim
      const topChime = this.mesh(can, new THREE.TorusGeometry(0.202, 0.012, 12, 32), tinMat, [0, 0.44, 0])
      topChime.rotation.x = Math.PI / 2
      // Rolled bottom rim resting flush on table top
      const botChime = this.mesh(can, new THREE.TorusGeometry(0.201, 0.008, 12, 32), tinMat, [0, 0.008, 0])
      botChime.rotation.x = Math.PI / 2
      // Recessed lid chime ring
      this.mesh(can, new THREE.CylinderGeometry(0.185, 0.185, 0.04, 28), tinMat, [0, 0.42, 0])
      // Sunken pool of liquid wet paint
      const liquid = this.mesh(can, new THREE.CircleGeometry(0.178, 28), paintLiquidMat, [0, 0.405, 0])
      liquid.rotation.x = -Math.PI / 2

      // 3. Wire bail handle
      const bail = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.006, 8, 24, Math.PI), bailMat)
      bail.rotation.z = Math.PI
      bail.rotation.x = 0.35
      bail.position.set(0, 0.26, 0.05)
      can.add(bail)
      // Bail ear mounting lugs
      this.mesh(can, new THREE.BoxGeometry(0.018, 0.035, 0.035), tinMat, [-0.205, 0.26, 0])
      this.mesh(can, new THREE.BoxGeometry(0.018, 0.035, 0.035), tinMat, [0.205, 0.26, 0])

      // 4. Clean Embossed Label Shield on the front
      const labelBand = this.mesh(
        can,
        new THREE.CylinderGeometry(0.203, 0.203, 0.24, 32, 1, true, -Math.PI / 4, Math.PI / 2),
        new THREE.MeshStandardMaterial({
          color: 0xfbf8f1,
          roughness: 0.85,
          side: THREE.DoubleSide,
        }),
        [0, 0.22, 0],
      )
      labelBand.rotation.y = Math.PI

      const labelMat = new THREE.MeshBasicMaterial({ color: 0x003049, side: THREE.DoubleSide })

      if (i === 0) {
        // Circle (Cobalt Blue)
        this.mesh(can, new THREE.CircleGeometry(0.065, 24), labelMat, [0, 0.22, 0.205])
      } else if (i === 1) {
        // Triangle (Cadmium Lemon)
        const shape = new THREE.Shape()
        shape.moveTo(0, 0.08); shape.lineTo(0.075, -0.06); shape.lineTo(-0.075, -0.06); shape.closePath()
        this.mesh(can, new THREE.ShapeGeometry(shape), labelMat, [0, 0.22, 0.205])
      } else if (i === 2) {
        // Square (Alizarin Crimson)
        this.mesh(can, new THREE.PlaneGeometry(0.12, 0.12), labelMat, [0, 0.22, 0.205])
      } else {
        // Diamond (Titanium White)
        const shape = new THREE.Shape()
        shape.moveTo(0, 0.09); shape.lineTo(0.072, 0); shape.lineTo(0, -0.09); shape.lineTo(-0.072, 0); shape.closePath()
        this.mesh(can, new THREE.ShapeGeometry(shape), labelMat, [0, 0.22, 0.205])
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

    // Soft grounded contact shadows under easel and stool
    this.addContactShadow(v3(-3.25, 0, 0.55), new THREE.Vector2(1.3, 1.1), 0.65)
    this.addContactShadow(v3(-3.25, 0, 1.95), new THREE.Vector2(0.8, 0.8), 0.65)

    // Architectural wooden studio A-frame easel
    for (const dx of [-0.48, 0.48]) {
      const leg = this.mesh(object, new THREE.BoxGeometry(0.08, 2.45, 0.09), this.mats.wood, [dx, 1.2, 0.02])
      leg.rotation.z = dx * 0.15
    }
    this.mesh(object, new THREE.BoxGeometry(0.08, 2.3, 0.09), this.mats.wood, [0, 1.15, -0.38]).rotation.z = -0.08
    this.box('Easel ledge', v3(1.25, 0.09, 0.22), v3(-3.25, 1.35, 0.55), this.mats.brass, false)

    // Stretched canvas on easel showing value study painting (Slightly larger, deeper bevelled frame, glass reflection)
    const studyTex = this.createValueStudyTexture()
    const studyMat = new THREE.MeshStandardMaterial({
      map: studyTex,
      roughness: 0.88,
      metalness: 0.0,
      emissive: new THREE.Color(0x000000),
    })
    this.mesh(object, new THREE.BoxGeometry(1.28, 1.62, 0.10), this.mats.darkWood, [0, 2.25, 0.06])
    this.mesh(object, new THREE.BoxGeometry(1.20, 1.54, 0.02), this.mats.champagneBronze, [0, 2.25, 0.10])
    this.mesh(object, new THREE.BoxGeometry(1.16, 1.50, 0.02), studyMat, [0, 2.25, 0.115])

    // Picture glass reflection layer
    const easelGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.16, 1.50),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.14,
        roughness: 0.04,
        reflectivity: 0.85,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
      }),
    )
    easelGlass.position.set(0, 2.25, 0.126)
    object.add(easelGlass)

    // Overhead brass picture light fixture
    const easelSconce = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.52, 16), this.mats.brass)
    easelSconce.rotation.z = Math.PI / 2
    easelSconce.position.set(0, 3.12, 0.22)
    object.add(easelSconce)

    const easelLight = new THREE.SpotLight(0xffeed6, 1.8, 4.0, Math.PI / 4, 0.75, 2.0)
    easelLight.position.set(-3.25, 3.12, 0.77)
    const easelTarget = new THREE.Object3D()
    easelTarget.position.set(-3.25, 2.25, 0.65)
    this.scene.add(easelTarget)
    easelLight.target = easelTarget
    this.scene.add(easelLight)

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
    podium.position.set(0, 0, -0.85) // World Z = 7.2 - 0.85 = 6.35
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
    p.rotation.y = Math.PI // Faces room
    parent.add(p)

    const w = 1.55
    const h = 2.05
    const frameDepth = 0.14

    // 1. Deep Multi-Step American Walnut Moulding Frame
    this.mesh(p, new THREE.BoxGeometry(w + 0.20, h + 0.20, frameDepth), this.mats.darkWood, [0, 0, -frameDepth / 2])
    this.mesh(p, new THREE.BoxGeometry(w + 0.12, h + 0.12, frameDepth + 0.015), this.mats.trim, [0, 0, -frameDepth / 2])

    // 2. Inner Champagne Bronze Bevel Slip Fillet
    this.mesh(p, new THREE.BoxGeometry(w + 0.05, h + 0.05, frameDepth + 0.025), this.mats.champagneBronze, [0, 0, -frameDepth / 2])

    // 3. Off-White Museum Cotton Mat Border
    this.mesh(p, new THREE.BoxGeometry(w, h, 0.012), this.mats.canvas, [0, 0, 0.006])

    // 4. Fine Art Canvas with CanvasTexture (Pure passive reflection, zero light emission)
    const artTexture = this.createArtworkTexture(type)
    const artMat = new THREE.MeshStandardMaterial({
      map: artTexture,
      roughness: 0.88,
      metalness: 0.0,
      emissive: new THREE.Color(0x000000),
    })
    this.mesh(p, new THREE.BoxGeometry(w - 0.22, h - 0.26, 0.015), artMat, [0, 0, 0.015])

    // 4b. Low-Iron Museum Picture Glass Overlay (Thin realistic specular reflection of room & lights)
    const pictureGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.22, h - 0.26),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.16,
        roughness: 0.04,
        metalness: 0.02,
        reflectivity: 0.85,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        envMapIntensity: 0.85,
      }),
    )
    pictureGlass.position.set(0, 0, 0.025)
    p.add(pictureGlass)

    // 5. Engraved Brass Museum Placard Underneath
    const placardTex = this.createPlacardTexture(title, harmony, 'Oil on Belgian Linen · 135 × 185 cm')
    const placardMat = new THREE.MeshStandardMaterial({
      map: placardTex,
      roughness: 0.35,
      metalness: 0.85,
    })
    this.mesh(p, new THREE.BoxGeometry(0.82, 0.20, 0.02), placardMat, [0, -h / 2 - 0.20, 0.01])

    // 6. Brass Picture Light Fixture Arching Overhead with Soft Downward Illumination
    const sconceArm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 12), this.mats.brass)
    sconceArm1.rotation.x = Math.PI / 3
    sconceArm1.position.set(-0.20, h / 2 + 0.14, 0.16)
    p.add(sconceArm1)

    const sconceArm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 12), this.mats.brass)
    sconceArm2.rotation.x = Math.PI / 3
    sconceArm2.position.set(0.20, h / 2 + 0.14, 0.16)
    p.add(sconceArm2)

    const sconceHead = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.65, 16), this.mats.brass)
    sconceHead.rotation.z = Math.PI / 2
    sconceHead.position.set(0, h / 2 + 0.25, 0.26)
    p.add(sconceHead)

    // Dedicated soft picture light over each painting
    const picLight = new THREE.SpotLight(0xffeed8, 2.2, 4.5, Math.PI / 3.5, 0.75, 2.0)
    picLight.position.set(0, h / 2 + 0.25, 0.28)
    const picTarget = new THREE.Object3D()
    picTarget.position.set(0, 0, 0.02)
    p.add(picTarget)
    picLight.target = picTarget
    p.add(picLight)

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

    // Soft contact shadow at vault base
    this.addContactShadow(v3(0, 0, -7.05), new THREE.Vector2(2.8, 0.45), 0.65)

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

    // Solid Rapier physics collider matching the dual architectural bookcase bank
    this.physics.addStaticBox(v3(x, 1.03, z), v3(0.58, 2.06, 2.8))

    // Ground contact shadow under bookcase footprint
    this.addContactShadow(v3(x, 0, z), new THREE.Vector2(0.85, 3.0), 0.75)

    // Shelf internal ambient occlusion planes under each tier (soft shadow in recesses)
    const shelfAO = new THREE.MeshBasicMaterial({
      color: 0x0a0806,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    })
    for (const y of [0.38, 0.66, 0.94, 1.26, 1.64]) {
      const aoPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 2.7), shelfAO)
      aoPlane.rotation.x = Math.PI / 2
      aoPlane.position.set(x, y + 0.005, z)
      this.scene.add(aoPlane)
    }

    // Tier 1 (Y ≈ 0.10): Ceramic and glass pigment storage jars
    this.addPigmentJar(this.scene, v3(x, 0.1, z - 0.9), 0x936a4c)
    this.addPigmentJar(this.scene, v3(x, 0.1, z - 0.7), 0xba6a4e)
    this.addPigmentJar(this.scene, v3(x, 0.1, z - 0.5), 0x669bbc)
    this.addPigmentJar(this.scene, v3(x, 0.1, z + 0.4), 0x3d4a3e)
    this.addPigmentJar(this.scene, v3(x, 0.1, z + 0.6), 0xd4af37)

    // Tier 2 (Y ≈ 0.38): Upright reference books & monographs
    this.addUprightBookCluster(this.scene, v3(x, 0.38, z - 0.95), 8)
    this.addUprightBookCluster(this.scene, v3(x, 0.38, z + 0.55), 7)

    // Tier 3 (Y ≈ 0.66): Stacked monographs & art folios
    this.addBookStack(this.scene, v3(x, 0.66, z - 0.7), 4)
    this.addBookStack(this.scene, v3(x, 0.66, z + 0.7), 3)

    // Tier 4 (Y ≈ 0.94): Artist oil paint tubes lying on shelf
    this.addShelfPaintTubes(this.scene, v3(x, 0.94, z - 0.5))
    this.addUprightBookCluster(this.scene, v3(x, 0.94, z + 0.45), 6)

    // Tier 5 (Y ≈ 1.26): Artist drawing mannequin
    this.addDrawingMannequin(this.scene, v3(x, 1.26, z - 0.6))
    this.addPigmentJar(this.scene, v3(x, 1.26, z + 0.6), 0x8a7055)
    this.addPigmentJar(this.scene, v3(x, 1.26, z + 0.78), 0x2b3d4f)
  }

  private addUprightBookCluster(parent: THREE.Object3D, basePos: THREE.Vector3, count: number): void {
    const bookColors = [0x5c1d1d, 0x1e3a5f, 0x2d4a22, 0x3d2b1f, 0x4a3b32, 0x8c6d3b]
    const g = new THREE.Group()
    g.position.copy(basePos)
    parent.add(g)

    let currentZ = -(count * 0.038) / 2
    for (let i = 0; i < count; i++) {
      const h = 0.21 + (i % 3) * 0.025
      const depth = 0.17 + (i % 2) * 0.02
      const thickness = 0.032 + (i % 4) * 0.008
      const bookMat = new THREE.MeshStandardMaterial({
        color: bookColors[i % bookColors.length],
        roughness: 0.65,
        metalness: 0.02,
      })
      const book = this.mesh(g, new THREE.BoxGeometry(depth, h, thickness), bookMat, [0, h / 2, currentZ + thickness / 2])
      if (i === count - 1) {
        book.rotation.x = 0.12
      }
      currentZ += thickness + 0.004
    }
  }

  private addPigmentJar(parent: THREE.Object3D, pos: THREE.Vector3, color: number): void {
    const jar = new THREE.Group()
    jar.position.copy(pos)
    parent.add(jar)

    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.25,
      metalness: 0.05,
    })
    this.mesh(jar, new THREE.CylinderGeometry(0.045, 0.05, 0.14, 16), bodyMat, [0, 0.07, 0])
    this.mesh(jar, new THREE.CylinderGeometry(0.032, 0.042, 0.03, 16), bodyMat, [0, 0.155, 0])
    const corkMat = new THREE.MeshStandardMaterial({ color: 0xba956a, roughness: 0.9 })
    this.mesh(jar, new THREE.CylinderGeometry(0.032, 0.028, 0.032, 12), corkMat, [0, 0.178, 0])
  }

  private addShelfPaintTubes(parent: THREE.Object3D, basePos: THREE.Vector3): void {
    const colors = [0xb91c1c, 0x1d4ed8, 0xeab308, 0x15803d]
    for (let i = 0; i < colors.length; i++) {
      const tube = new THREE.Group()
      tube.position.set(basePos.x + (i % 2) * 0.05, basePos.y + 0.015, basePos.z + (i - 1.5) * 0.08)
      tube.rotation.y = (i * 0.4) - 0.2
      parent.add(tube)

      const body = this.mesh(tube, new THREE.CylinderGeometry(0.014, 0.018, 0.1, 10), new THREE.MeshStandardMaterial({
        color: 0xc8cdd2,
        roughness: 0.35,
        metalness: 0.65,
      }), [0, 0, 0])
      body.rotation.z = Math.PI / 2

      const cap = this.mesh(tube, new THREE.CylinderGeometry(0.009, 0.009, 0.02, 8), new THREE.MeshStandardMaterial({
        color: colors[i],
        roughness: 0.4,
      }), [0.06, 0, 0])
      cap.rotation.z = Math.PI / 2
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

  private addStructuralPillar(x: number, z: number): void {
    const pillar = new THREE.Group()
    pillar.position.set(x, 0, z)
    this.scene.add(pillar)

    // 1. Classical tiered plinth base with authentic architectural depth & shadow reveals
    this.mesh(pillar, new THREE.BoxGeometry(0.92, 0.12, 0.92), this.mats.concrete, [0, 0.06, 0])
    this.mesh(pillar, new THREE.BoxGeometry(0.84, 0.06, 0.84), this.mats.concrete, [0, 0.15, 0])
    this.mesh(pillar, new THREE.BoxGeometry(0.78, 0.04, 0.78), this.mats.champagneBronze, [0, 0.20, 0])
    this.mesh(pillar, new THREE.BoxGeometry(0.74, 0.06, 0.74), this.mats.concrete, [0, 0.25, 0])

    // 2. Bevelled architectural shaft with real chamfered corner edges
    this.mesh(pillar, new THREE.BoxGeometry(0.64, 4.8, 0.64), this.mats.concrete, [0, 2.68, 0])
    for (const cdx of [-0.315, 0.315]) {
      for (const cdz of [-0.315, 0.315]) {
        const chamfer = this.mesh(pillar, new THREE.BoxGeometry(0.04, 4.8, 0.04), this.mats.concrete, [cdx, 2.68, cdz])
        chamfer.rotation.y = Math.PI / 4
      }
    }

    // 3. Classical moulded capital with tiered entablature reveals
    this.mesh(pillar, new THREE.BoxGeometry(0.72, 0.06, 0.72), this.mats.concrete, [0, 5.11, 0])
    this.mesh(pillar, new THREE.BoxGeometry(0.80, 0.08, 0.80), this.mats.champagneBronze, [0, 5.18, 0])
    this.mesh(pillar, new THREE.BoxGeometry(0.88, 0.10, 0.88), this.mats.concrete, [0, 5.27, 0])
    this.mesh(pillar, new THREE.BoxGeometry(0.94, 0.14, 0.94), this.mats.darkWood, [0, 5.39, 0])

    // Solid Rapier physics collider
    this.physics.addStaticBox(v3(x, 2.7, z), v3(0.92, 5.4, 0.92))
  }

  // ─── Studio Props Implementations ──────────────────────────────────────

  private addLeaningCanvases(parent: THREE.Object3D, base: THREE.Vector3, rotY: number): void {
    const cluster = new THREE.Group()
    cluster.position.copy(base)
    cluster.rotation.y = rotY
    parent.add(cluster)

    const sizes = [
      { w: 1.3, h: 1.6, d: 0.05, tilt: -0.1, offsetZ: 0 },
      { w: 1.1, h: 1.35, d: 0.045, tilt: -0.12, offsetZ: 0.08 },
      { w: 0.85, h: 1.1, d: 0.04, tilt: -0.14, offsetZ: 0.15 },
    ]

    for (let i = 0; i < sizes.length; i++) {
      const s = sizes[i]
      const canvasGroup = new THREE.Group()
      canvasGroup.position.set((i - 1) * 0.28, s.h / 2, s.offsetZ)
      canvasGroup.rotation.x = s.tilt
      cluster.add(canvasGroup)

      this.mesh(canvasGroup, new THREE.BoxGeometry(s.w, s.h, s.d), this.mats.darkWood, [0, 0, 0])
      this.mesh(canvasGroup, new THREE.BoxGeometry(s.w - 0.03, s.h - 0.03, s.d + 0.002), this.mats.canvas, [0, 0, 0])
    }
  }

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
      this.mesh(b, new THREE.BoxGeometry(0.36, 0.044, 0.5), new THREE.MeshStandardMaterial({
        color: 0xfbf8ee,
        roughness: 0.9,
      }), [0.01, 0, 0])
    }
  }

  private addDrawingMannequin(parent: THREE.Object3D, pos: THREE.Vector3): void {
    const m = new THREE.Group()
    m.position.copy(pos)
    parent.add(m)

    const woodMat = this.mats.wood
    const brassMat = this.mats.brass

    this.mesh(m, new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), woodMat, [0, 0.01, 0])
    this.mesh(m, new THREE.CylinderGeometry(0.006, 0.006, 0.42, 8), brassMat, [0, 0.21, 0])
    this.mesh(m, new THREE.SphereGeometry(0.038, 12, 10), woodMat, [0, 0.22, 0])
    this.mesh(m, new THREE.CylinderGeometry(0.042, 0.036, 0.14, 12), woodMat, [0, 0.32, 0])
    this.mesh(m, new THREE.SphereGeometry(0.032, 12, 10), woodMat, [0, 0.43, 0])

    const leftArm = this.mesh(m, new THREE.CylinderGeometry(0.012, 0.01, 0.12, 8), woodMat, [-0.07, 0.32, 0.04])
    leftArm.rotation.z = 0.6
    const rightArm = this.mesh(m, new THREE.CylinderGeometry(0.012, 0.01, 0.12, 8), woodMat, [0.07, 0.34, -0.04])
    rightArm.rotation.z = -0.8
  }

  private addPlasterBust(parent: THREE.Object3D, pos: THREE.Vector3): void {
    const g = new THREE.Group()
    g.position.copy(pos)
    parent.add(g)

    this.mesh(g, new THREE.BoxGeometry(0.55, 1.1, 0.55), this.mats.travertine, [0, 0.55, 0])
    this.mesh(g, new THREE.BoxGeometry(0.62, 0.08, 0.62), this.mats.brass, [0, 1.14, 0])

    const plasterMat = new THREE.MeshStandardMaterial({
      color: 0xf5f2eb,
      roughness: 0.9,
      metalness: 0.0,
    })
    const bust = new THREE.Group()
    bust.position.set(0, 1.18, 0)
    g.add(bust)

    this.mesh(bust, new THREE.BoxGeometry(0.42, 0.24, 0.22), plasterMat, [0, 0.12, 0])
    this.mesh(bust, new THREE.CylinderGeometry(0.08, 0.09, 0.16, 16), plasterMat, [0, 0.28, 0])
    this.mesh(bust, new THREE.SphereGeometry(0.14, 20, 16), plasterMat, [0, 0.45, 0])

    this.physics.addStaticBox(v3(pos.x, 0.55, pos.z), v3(0.55, 1.1, 0.55))
  }

  private addBlueprintTubeBin(parent: THREE.Object3D, pos: THREE.Vector3): void {
    const bin = new THREE.Group()
    bin.position.copy(pos)
    parent.add(bin)

    this.mesh(bin, new THREE.CylinderGeometry(0.22, 0.22, 0.65, 20), this.mats.brass, [0, 0.325, 0])

    for (let i = 0; i < 5; i++) {
      const tube = this.mesh(bin, new THREE.CylinderGeometry(0.038, 0.038, 0.95, 12), this.mats.cardboard, [
        Math.cos(i * 1.25) * 0.1,
        0.55,
        Math.sin(i * 1.25) * 0.1,
      ])
      tube.rotation.z = (i - 2) * 0.08
    }
  }

  // ─── Procedural PBR Canvas Texture Generators ──────────────────────────

  private createPlasterTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const ctx = canvas.getContext('2d')!

    // Warm architectural museum plaster base (warm ivory tone)
    ctx.fillStyle = '#f5efe6'
    ctx.fillRect(0, 0, 1024, 1024)

    // Multi-frequency tonal variations (delicate trowel float and soft pigment gradations)
    for (let i = 0; i < 380; i++) {
      const x = Math.random() * 1024
      const y = Math.random() * 1024
      const r = 35 + Math.random() * 120
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      const alpha = 0.015 + Math.random() * 0.025
      const isLight = Math.random() > 0.45
      grad.addColorStop(0, isLight ? `rgba(255, 253, 248, ${alpha * 1.4})` : `rgba(215, 204, 190, ${alpha})`)
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Micro lime-wash stippling
    const imgData = ctx.getImageData(0, 0, 1024, 1024)
    const data = imgData.data
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 8
      data[i] = Math.min(255, Math.max(0, data[i] + noise))
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise))
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise))
    }
    ctx.putImageData(imgData, 0, 0)

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(3, 2)
    tex.anisotropy = 16
    return tex
  }

  private createPlasterNormal(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!

    const imgData = ctx.createImageData(512, 512)
    const data = imgData.data
    for (let i = 0; i < data.length; i += 4) {
      const nx = 128 + Math.round((Math.random() - 0.5) * 14)
      const ny = 128 + Math.round((Math.random() - 0.5) * 14)
      data[i] = nx
      data[i + 1] = ny
      data[i + 2] = 255
      data[i + 3] = 255
    }
    ctx.putImageData(imgData, 0, 0)

    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(6, 4)
    tex.anisotropy = 8
    return tex
  }

  private createConcreteTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const ctx = canvas.getContext('2d')!

    // Architectural board-formed honed concrete plaster
    ctx.fillStyle = '#e8e2d6'
    ctx.fillRect(0, 0, 1024, 1024)

    // Formwork seams and aggregate patches
    for (let y = 0; y < 1024; y += 256) {
      ctx.fillStyle = 'rgba(110, 100, 88, 0.22)'
      ctx.fillRect(0, y, 1024, 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
      ctx.fillRect(0, y + 2, 1024, 1)
    }

    for (let i = 0; i < 400; i++) {
      const x = Math.random() * 1024
      const y = Math.random() * 1024
      const r = 20 + Math.random() * 70
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      const alpha = 0.015 + Math.random() * 0.03
      grad.addColorStop(0, Math.random() > 0.5 ? `rgba(255, 255, 255, ${alpha})` : `rgba(160, 150, 138, ${alpha})`)
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Micro sand / aggregate grain
    const imgData = ctx.getImageData(0, 0, 1024, 1024)
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 12
      d[i] = Math.min(255, Math.max(0, d[i] + n))
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n))
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n))
    }
    ctx.putImageData(imgData, 0, 0)

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(1, 4)
    tex.anisotropy = 16
    return tex
  }

  private createConcreteNormal(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!

    const imgData = ctx.createImageData(512, 512)
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      const nx = 128 + Math.round((Math.random() - 0.5) * 18)
      const ny = 128 + Math.round((Math.random() - 0.5) * 18)
      d[i] = nx
      d[i + 1] = ny
      d[i + 2] = 255
      d[i + 3] = 255
    }
    ctx.putImageData(imgData, 0, 0)

    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(2, 6)
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

    const rowH = 256
    for (let y = 0; y < 1024; y += rowH) {
      ctx.fillStyle = 'rgba(120, 110, 95, 0.45)'
      ctx.fillRect(0, y, 1024, 3)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.fillRect(0, y + 3, 1024, 1.5)

      const colW = 512
      const xOff = (y / rowH) % 2 === 0 ? 0 : 256
      for (let x = xOff; x < 1024; x += colW) {
        ctx.fillStyle = 'rgba(120, 110, 95, 0.45)'
        ctx.fillRect(x, y, 3, rowH)
      }

      for (let py = y + 8; py < y + rowH - 8; py += 12) {
        ctx.fillStyle = `rgba(195, 185, 170, ${0.12 + Math.sin(py * 0.1) * 0.06})`
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

    ctx.fillStyle = '#141210'
    ctx.fillRect(0, 0, 1024, 512)

    const slatW = 48
    const grooveW = 16
    const step = slatW + grooveW

    for (let x = 0; x < 1024; x += step) {
      ctx.fillStyle = '#3a2a1d'
      ctx.fillRect(x, 0, slatW, 512)

      for (let gx = x + 3; gx < x + slatW - 3; gx += 4) {
        ctx.fillStyle = 'rgba(40, 26, 16, 0.35)'
        ctx.fillRect(gx, 0, 1.5, 512)
      }

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

  private createWoodSlatNormal(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 512
    const ctx = canvas.getContext('2d')!

    // Flat normal color (128, 128, 255)
    ctx.fillStyle = '#8080ff'
    ctx.fillRect(0, 0, 1024, 512)

    const slatW = 48
    const grooveW = 16
    const step = slatW + grooveW

    for (let x = 0; x < 1024; x += step) {
      // Left bevel edge (facing left: lower red, ~95, 128, 240)
      ctx.fillStyle = '#5f80f0'
      ctx.fillRect(x, 0, 3, 512)
      // Right bevel edge (facing right: higher red, ~160, 128, 240)
      ctx.fillStyle = '#a080f0'
      ctx.fillRect(x + slatW - 3, 0, 3, 512)
      // Deep groove
      ctx.fillStyle = '#8080c8'
      ctx.fillRect(x + slatW, 0, grooveW, 512)
    }

    const tex = new THREE.CanvasTexture(canvas)
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

    ctx.fillStyle = '#c59f70'
    ctx.fillRect(0, 0, 512, 512)

    // Corrugated horizontal fluting ridges
    for (let y = 0; y < 512; y += 4) {
      ctx.fillStyle = 'rgba(120, 85, 45, 0.12)'
      ctx.fillRect(0, y, 512, 1.5)
      ctx.fillStyle = 'rgba(255, 235, 205, 0.08)'
      ctx.fillRect(0, y + 2, 512, 1)
    }

    // Cardboard pulp fibers and paper flecks
    for (let i = 0; i < 350; i++) {
      const x = Math.random() * 512
      const y = Math.random() * 512
      const len = 3 + Math.random() * 6
      ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(90, 60, 30, 0.18)' : 'rgba(255, 245, 225, 0.15)'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + len, y + (Math.random() - 0.5) * 2)
      ctx.stroke()
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(2, 2)
    tex.anisotropy = 16
    return tex
  }

  private createShippingLabelTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 256
    const ctx = canvas.getContext('2d')!

    // Clean white matte adhesive shipping label
    ctx.fillStyle = '#f8f8f6'
    ctx.fillRect(0, 0, 512, 256)
    ctx.strokeStyle = '#222'
    ctx.lineWidth = 4
    ctx.strokeRect(6, 6, 500, 244)

    // Header bar
    ctx.fillStyle = '#111827'
    ctx.fillRect(8, 8, 496, 44)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillText('PRIORITY ART FREIGHT', 24, 38)

    // Archive Destination metadata
    ctx.fillStyle = '#1f2937'
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillText('TWO EYES ARCHIVE · GALLERY LEVEL 01', 24, 82)
    ctx.font = '13px monospace'
    ctx.fillText('TRACK: #TE-8842-EX-C', 24, 104)
    ctx.fillText('CONTENTS: OIL PIGMENTS & LINEN CANVASES', 24, 124)

    // Barcode lines
    ctx.fillStyle = '#111827'
    for (let x = 24; x < 320; x += Math.floor(Math.random() * 5) + 3) {
      const barW = Math.random() > 0.5 ? 3 : 1.5
      ctx.fillRect(x, 142, barW, 90)
    }

    // Red Hazard / Warning Stamp
    ctx.fillStyle = '#b91c1c'
    ctx.fillRect(344, 64, 150, 172)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('FRAGILE', 419, 102)
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillText('HANDLE WITH CARE', 419, 130)
    ctx.fillText('KEEP DRY', 419, 154)
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillText('▲ THIS SIDE UP ▲', 419, 198)
    ctx.textAlign = 'left'

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 16
    return tex
  }

  private createCrateTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#cfb997'
    ctx.fillRect(0, 0, 512, 512)

    const plankH = 102
    for (let y = 0; y < 512; y += plankH) {
      ctx.fillStyle = 'rgba(70, 50, 30, 0.4)'
      ctx.fillRect(0, y, 512, 3)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
      ctx.fillRect(0, y + 3, 512, 1.5)

      for (let py = y + 4; py < y + plankH - 4; py += 5) {
        ctx.fillStyle = 'rgba(110, 85, 55, 0.08)'
        ctx.fillRect(0, py, 512, 1.5)
      }
    }

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

    ctx.fillStyle = '#7a4b2c'
    ctx.fillRect(0, 0, 512, 512)

    for (let y = 0; y < 512; y += 4) {
      ctx.fillStyle = 'rgba(60, 30, 15, 0.15)'
      ctx.fillRect(0, y, 512, 1.5)
    }

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

    ctx.fillStyle = '#6b7280'
    ctx.fillRect(0, 0, 512, 640)

    const sphereGrad = ctx.createRadialGradient(200, 240, 20, 256, 300, 160)
    sphereGrad.addColorStop(0, '#ffffff')
    sphereGrad.addColorStop(0.35, '#cbd5e1')
    sphereGrad.addColorStop(0.75, '#334155')
    sphereGrad.addColorStop(0.92, '#64748b')
    sphereGrad.addColorStop(1, '#0f172a')
    ctx.beginPath()
    ctx.arc(256, 300, 140, 0, Math.PI * 2)
    ctx.fillStyle = sphereGrad
    ctx.fill()

    ctx.beginPath()
    ctx.ellipse(320, 440, 140, 36, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)'
    ctx.fill()

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

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.fillRect(110, 0, 8, 256)

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

    ctx.fillStyle = '#d4af37'
    ctx.fillRect(0, 0, 512, 160)

    ctx.strokeStyle = '#5a4510'
    ctx.lineWidth = 3
    ctx.strokeRect(8, 8, 496, 144)

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

  private createArtworkTexture(type: 'monochromatic' | 'analogous' | 'complementary' | 'split-complementary'): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1280
    const ctx = canvas.getContext('2d')!

    if (type === 'monochromatic') {
      const bg = ctx.createLinearGradient(0, 0, 0, 1280)
      bg.addColorStop(0, '#04091a')
      bg.addColorStop(0.35, '#0c1b3f')
      bg.addColorStop(0.55, '#1e3a8a')
      bg.addColorStop(0.85, '#172554')
      bg.addColorStop(1, '#080f24')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, 1024, 1280)

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

      const moonGrad = ctx.createRadialGradient(512, 280, 20, 512, 280, 260)
      moonGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)')
      moonGrad.addColorStop(0.18, 'rgba(224, 242, 254, 0.95)')
      moonGrad.addColorStop(0.45, 'rgba(147, 197, 253, 0.45)')
      moonGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = moonGrad
      ctx.beginPath()
      ctx.arc(512, 280, 260, 0, Math.PI * 2)
      ctx.fill()

      const horizonY = 620
      const seaGrad = ctx.createLinearGradient(0, horizonY, 0, 1280)
      seaGrad.addColorStop(0, '#0c1d4a')
      seaGrad.addColorStop(0.5, '#1e40af')
      seaGrad.addColorStop(1, '#050c1f')
      ctx.fillStyle = seaGrad
      ctx.fillRect(0, horizonY, 1024, 660)

      for (let y = horizonY; y < 1280; y += 8) {
        const spread = ((y - horizonY) / 660) * 280 + 35
        ctx.fillStyle = `rgba(224, 242, 254, ${0.45 - (y - horizonY) * 0.00035})`
        ctx.fillRect(512 - spread / 2 + Math.sin(y * 0.1) * 15, y, spread, 4)
      }

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
        ctx.fillStyle = `rgba(15, 30, 75, ${0.7 + i * 0.06})`
        ctx.fill()

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
      const bg = ctx.createLinearGradient(0, 0, 0, 1280)
      bg.addColorStop(0, '#0284c7')
      bg.addColorStop(0.3, '#0d9488')
      bg.addColorStop(0.55, '#14b8a6')
      bg.addColorStop(0.75, '#047857')
      bg.addColorStop(1, '#064e3b')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, 1024, 1280)

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

      const lakeY = 740
      const lakeGrad = ctx.createLinearGradient(0, lakeY, 0, 1280)
      lakeGrad.addColorStop(0, '#0d9488')
      lakeGrad.addColorStop(0.4, '#14b8a6')
      lakeGrad.addColorStop(0.7, '#0f766e')
      lakeGrad.addColorStop(1, '#064e3b')
      ctx.fillStyle = lakeGrad
      ctx.fillRect(0, lakeY, 1024, 540)

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
      const bg = ctx.createLinearGradient(0, 0, 0, 680)
      bg.addColorStop(0, '#7c2d12')
      bg.addColorStop(0.25, '#c2410c')
      bg.addColorStop(0.5, '#ea580c')
      bg.addColorStop(0.78, '#f59e0b')
      bg.addColorStop(0.96, '#fef08a')
      bg.addColorStop(1, '#ffffff')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, 1024, 680)

      const sunGrad = ctx.createRadialGradient(512, 670, 20, 512, 670, 280)
      sunGrad.addColorStop(0, '#ffffff')
      sunGrad.addColorStop(0.25, '#fef08a')
      sunGrad.addColorStop(0.65, '#ea580c')
      sunGrad.addColorStop(1, 'rgba(124, 45, 18, 0)')
      ctx.fillStyle = sunGrad
      ctx.beginPath()
      ctx.arc(512, 670, 280, 0, Math.PI, true)
      ctx.fill()

      const seaY = 675
      const seaGrad = ctx.createLinearGradient(0, seaY, 0, 1280)
      seaGrad.addColorStop(0, '#172554')
      seaGrad.addColorStop(0.35, '#1e3a8a')
      seaGrad.addColorStop(0.75, '#1d4ed8')
      seaGrad.addColorStop(1, '#0f172a')
      ctx.fillStyle = seaGrad
      ctx.fillRect(0, seaY, 1024, 605)

      for (let y = seaY; y < 1280; y += 6) {
        const spread = ((y - seaY) / 605) * 360 + 50
        ctx.fillStyle = `rgba(251, 191, 36, ${0.75 - (y - seaY) * 0.0006})`
        ctx.fillRect(512 - spread / 2 + Math.sin(y * 0.08) * 20, y, spread, 3)
      }
    } else {
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, 1024, 1280)

      ctx.fillStyle = '#1e293b'
      ctx.fillRect(60, 60, 904, 1160)

      ctx.fillStyle = '#eab308'
      ctx.beginPath()
      ctx.arc(512, 460, 320, 0, Math.PI)
      ctx.fill()

      ctx.fillStyle = '#1d4ed8'
      ctx.beginPath()
      ctx.moveTo(180, 720)
      ctx.lineTo(880, 350)
      ctx.lineTo(790, 960)
      ctx.closePath()
      ctx.fill()

      ctx.fillStyle = '#ea580c'
      ctx.beginPath()
      ctx.rect(260, 310, 190, 530)
      ctx.fill()

      ctx.beginPath()
      ctx.arc(512, 530, 95, 0, Math.PI * 2)
      ctx.strokeStyle = '#f8fafc'
      ctx.lineWidth = 26
      ctx.stroke()
    }

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
    const loader = new THREE.TextureLoader()
    const diff = loader.load('/textures/oak_wood_planks/oak_wood_planks_diff_1k.jpg')
    diff.colorSpace = THREE.SRGBColorSpace
    diff.wrapS = diff.wrapT = THREE.RepeatWrapping
    diff.repeat.set(6, 5)
    diff.anisotropy = 16

    const nor = loader.load('/textures/oak_wood_planks/oak_wood_planks_nor_gl_1k.jpg')
    nor.wrapS = nor.wrapT = THREE.RepeatWrapping
    nor.repeat.set(6, 5)
    nor.anisotropy = 16

    const rough = loader.load('/textures/oak_wood_planks/oak_wood_planks_rough_1k.jpg')
    rough.wrapS = rough.wrapT = THREE.RepeatWrapping
    rough.repeat.set(6, 5)
    rough.anisotropy = 16

    return new THREE.MeshStandardMaterial({
      map: diff,
      normalMap: nor,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: rough,
      roughness: 0.38,
      metalness: 0.0,
      envMapIntensity: 0.22,
    })
  }

  private createWindowLightPatchesTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const ctx = canvas.getContext('2d')!

    ctx.clearRect(0, 0, 1024, 1024)

    // Three architectural window bays with mullioned glass panes
    const bays = [
      { x: 120, w: 220, y: 160, h: 700 },
      { x: 400, w: 220, y: 160, h: 700 },
      { x: 680, w: 220, y: 160, h: 700 },
    ]

    for (const bay of bays) {
      const cols = 2
      const rows = 3
      const colW = (bay.w - 18) / cols
      const rowH = (bay.h - 24) / rows

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const px = bay.x + c * (colW + 18)
          const py = bay.y + r * (rowH + 12)

          const grad = ctx.createRadialGradient(
            px + colW / 2,
            py + rowH / 2,
            Math.min(colW, rowH) * 0.2,
            px + colW / 2,
            py + rowH / 2,
            Math.max(colW, rowH) * 0.75,
          )
          grad.addColorStop(0, 'rgba(255, 238, 195, 0.95)')
          grad.addColorStop(0.65, 'rgba(255, 220, 160, 0.75)')
          grad.addColorStop(0.9, 'rgba(255, 200, 130, 0.35)')
          grad.addColorStop(1, 'rgba(255, 185, 110, 0)')

          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.roundRect(px, py, colW, rowH, 8)
          ctx.fill()
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 16
    return tex
  }

  private addWindowSunlightPatches(): void {
    const tex = this.createWindowLightPatchesTexture()
    const geo = new THREE.PlaneGeometry(8.5, 7.0)
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.rotation.z = -0.32 // Angled across the room floor from the West windows
    mesh.position.set(-1.2, 0.002, 1.8)
    mesh.renderOrder = 1
    this.scene.add(mesh)
  }

  private contactShadowMat?: THREE.MeshBasicMaterial

  private getContactShadowMaterial(): THREE.MeshBasicMaterial {
    if (!this.contactShadowMat) {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const ctx = canvas.getContext('2d')!
      const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 64)
      grad.addColorStop(0, 'rgba(4, 3, 2, 0.98)')
      grad.addColorStop(0.35, 'rgba(6, 4, 3, 0.82)')
      grad.addColorStop(0.7, 'rgba(10, 8, 5, 0.38)')
      grad.addColorStop(1, 'rgba(12, 10, 6, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 128, 128)
      const tex = new THREE.CanvasTexture(canvas)
      this.contactShadowMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    }
    return this.contactShadowMat
  }

  private addContactShadow(pos: THREE.Vector3, size: THREE.Vector2, opacity = 0.75): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(size.x, size.y)
    const mat = this.getContactShadowMaterial().clone()
    mat.opacity = opacity
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(pos.x, 0.003, pos.z)
    mesh.renderOrder = 3
    this.scene.add(mesh)
    return mesh
  }

  private box(name: string, size: THREE.Vector3, center: THREE.Vector3, material: THREE.Material, collide: boolean, castShadow = true): THREE.Mesh {
    const mesh = this.mesh(this.scene, new THREE.BoxGeometry(size.x, size.y, size.z), material, [center.x, center.y, center.z], castShadow)
    mesh.name = name
    if (collide) this.physics.addStaticBox(center, size)
    return mesh
  }

  private mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], castShadow = true): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(position[0], position[1], position[2])
    mesh.castShadow = castShadow
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  private loadGltfAssets(): void {
    if (typeof window === 'undefined') return
    import('three/examples/jsm/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => {
        const loader = new GLTFLoader()

        // 1. Classical Roman Marble Bust Sculpture
        loader.load('/models/marble_bust_01/marble_bust_01_1k.gltf', gltf => {
          const model = gltf.scene
          model.position.set(-7.2, 1.18, -0.2)
          model.scale.set(0.65, 0.65, 0.65)
          model.traverse(child => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true
              child.receiveShadow = true
              const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
              if (m && m.map) {
                m.map.colorSpace = THREE.SRGBColorSpace
                m.map.anisotropy = 16
              }
            }
          })
          this.scene.add(model)
        })

        // 2. Real Botanical Potted Plants (Tall Ficus Tree)
        loader.load('/models/potted_plant_01/potted_plant_01_1k.gltf', gltf => {
          const plantLocations = [
            { pos: v3(-7.2, 0, -5.6), scale: 1.0, rotY: 0.2 },
            { pos: v3(7.2, 0, -5.6), scale: 1.05, rotY: -0.8 },
          ]
          for (const loc of plantLocations) {
            const clone = gltf.scene.clone(true)
            clone.position.copy(loc.pos)
            clone.scale.setScalar(loc.scale)
            clone.rotation.y = loc.rotY
            clone.traverse(child => {
              if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true
                child.receiveShadow = true
                const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
                if (m && m.map) {
                  m.map.colorSpace = THREE.SRGBColorSpace
                  m.map.anisotropy = 16
                }
              }
            })
            this.scene.add(clone)
          }
        })

        // 3. Real Botanical Tropical Broad-Leaf Potted Plants (Lush Monstera / Philodendron)
        loader.load('/models/potted_plant_02/potted_plant_02_1k.gltf', gltf => {
          const plantLocations = [
            { pos: v3(7.2, 0, 5.8), scale: 1.05, rotY: 0.4 },
            { pos: v3(-7.2, 0, 5.8), scale: 0.95, rotY: -0.6 },
          ]
          for (const loc of plantLocations) {
            const clone = gltf.scene.clone(true)
            clone.position.copy(loc.pos)
            clone.scale.setScalar(loc.scale)
            clone.rotation.y = loc.rotY
            clone.traverse(child => {
              if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true
                child.receiveShadow = true
                const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
                if (m && m.map) {
                  m.map.colorSpace = THREE.SRGBColorSpace
                  m.map.anisotropy = 16
                }
              }
            })
            this.scene.add(clone)
          }
        })

        // 4. Accent Greenery (Tabletop / Shelf Succulents)
        loader.load('/models/potted_plant_04/potted_plant_04_1k.gltf', gltf => {
          const accentLocations = [
            { pos: v3(6.85, 1.88, 0.4), scale: 1.2 },
            { pos: v3(0.9, 0.88, -4.9), scale: 0.95 },
          ]
          for (const loc of accentLocations) {
            const clone = gltf.scene.clone(true)
            clone.position.copy(loc.pos)
            clone.scale.setScalar(loc.scale)
            clone.traverse(child => {
              if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true
                child.receiveShadow = true
                const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
                if (m && m.map) {
                  m.map.colorSpace = THREE.SRGBColorSpace
                  m.map.anisotropy = 16
                }
              }
            })
            this.scene.add(clone)
          }
        })

        // 5. Realistic Wooden Fine-Art Shipping Crates (Zero Z-Fighting, authentic wood grain & joints)
        loader.load('/models/wooden_crate_01/wooden_crate_01_1k.gltf', gltf => {
          const crateConfigs = [
            { pos: v3(-7.2, 0, -3.2), scale: 1.15, rotY: 0.12 },
            { pos: v3(-7.15, 0.393, -3.18), scale: 0.95, rotY: -0.06 },
            { pos: v3(6.8, 0, 3.8), scale: 1.2, rotY: -0.22 },
            { pos: v3(5.6, 0, -5.8), scale: 1.1, rotY: 0.35 },
          ]
          for (const cfg of crateConfigs) {
            const clone = gltf.scene.clone(true)
            clone.position.copy(cfg.pos)
            clone.scale.setScalar(cfg.scale)
            clone.rotation.y = cfg.rotY
            clone.traverse(child => {
              if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true
                child.receiveShadow = true
                const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
                if (m && m.map) {
                  m.map.colorSpace = THREE.SRGBColorSpace
                  m.map.anisotropy = 16
                }
              }
            })
            this.scene.add(clone)
          }
        })

        // 6. Realistic Corrugated Cardboard Packaging Boxes (Proper elevation, zero clipping, crisp labels)
        loader.load('/models/cardboard_box_01/cardboard_box_01_1k.gltf', gltf => {
          const labelTex = this.createShippingLabelTexture()
          const labelMat = new THREE.MeshStandardMaterial({
            map: labelTex,
            roughness: 0.88,
            metalness: 0.0,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          })

          const boxConfigs = [
            // Realistic Stack at Gallery Left (resting cleanly on floor and stacked with 0 z-fighting)
            { pos: v3(-1.8, 0.220, 3.6), scale: v3(1.2, 1.2, 1.2), rotY: 0.18, hasLabel: true },
            { pos: v3(-1.78, 0.593, 3.62), scale: v3(1.0, 1.0, 1.0), rotY: -0.12, hasLabel: true },
            // Wall accents
            { pos: v3(5.2, 0.193, 6.2), scale: v3(1.05, 1.05, 1.05), rotY: -0.32, hasLabel: false },
            { pos: v3(-4.8, 0.183, -6.2), scale: v3(1.0, 1.0, 1.0), rotY: 0.25, hasLabel: false },
          ]
          for (const cfg of boxConfigs) {
            const clone = gltf.scene.clone(true)
            clone.position.copy(cfg.pos)
            clone.scale.copy(cfg.scale)
            clone.rotation.y = cfg.rotY
            clone.traverse(child => {
              if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true
                child.receiveShadow = true
                const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
                if (m && m.map) {
                  m.map.colorSpace = THREE.SRGBColorSpace
                  m.map.anisotropy = 16
                }
              }
            })

            if (cfg.hasLabel) {
              const label = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), labelMat)
              label.position.set(0.02, 0.0, 0.205)
              clone.add(label)
            }

            this.scene.add(clone)
          }
        })

        // 4. Architectural Wooden Bookshelf (Dual modular library bank)
        loader.load('/models/wooden_bookshelf_worn/wooden_bookshelf_worn_1k.gltf', gltf => {
          for (const dz of [-0.685, 0.685]) {
            const shelf = gltf.scene.clone(true)
            shelf.position.set(6.85, 0, -0.25 + dz)
            shelf.rotation.y = -Math.PI / 2
            shelf.scale.set(1.0, 1.0, 1.0)
            shelf.traverse(child => {
              if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true
                child.receiveShadow = true
                const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
                if (m && m.map) {
                  m.map.colorSpace = THREE.SRGBColorSpace
                  m.map.anisotropy = 16
                }
              }
            })
            this.scene.add(shelf)
          }
        })

        // 5. Studio Wooden Benches
        loader.load('/models/painted_wooden_bench/painted_wooden_bench_1k.gltf', gltf => {
          const benchLocations = [
            { pos: v3(3.4, 0, 4.8), rotY: 0, scale: 1.1 },
            { pos: v3(0, 0, -1.8), rotY: 0, scale: 1.15 },
          ]
          for (const loc of benchLocations) {
            const clone = gltf.scene.clone(true)
            clone.position.copy(loc.pos)
            clone.rotation.y = loc.rotY
            clone.scale.setScalar(loc.scale)
            clone.traverse(child => {
              if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true
                child.receiveShadow = true
                const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
                if (m && m.map) {
                  m.map.colorSpace = THREE.SRGBColorSpace
                  m.map.anisotropy = 16
                }
              }
            })
            this.scene.add(clone)
          }
        })

        // 6. Studio Wooden Stool
        loader.load('/models/wooden_stool_01/wooden_stool_01_1k.gltf', gltf => {
          const stool = gltf.scene
          stool.position.set(-3.25, 0, 1.95)
          stool.scale.setScalar(1.05)
          stool.traverse(child => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true
              child.receiveShadow = true
              const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
              if (m && m.map) {
                m.map.colorSpace = THREE.SRGBColorSpace
                m.map.anisotropy = 16
              }
            }
          })
          this.scene.add(stool)
        })
      })
      .catch(err => console.warn('GLTFLoader error:', err))
  }
}
