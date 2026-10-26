import * as THREE from 'three'

/** Approximate full-severity deuteranopia matrix in linear RGB, following Machado et al. */
export const DEUTERANOPIA_MATRIX_ROWS = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
] as const

export type RGB = readonly [number, number, number]

export function createDeuteranopiaMatrix(): THREE.Matrix3 {
  return new THREE.Matrix3().set(
    ...DEUTERANOPIA_MATRIX_ROWS[0],
    ...DEUTERANOPIA_MATRIX_ROWS[1],
    ...DEUTERANOPIA_MATRIX_ROWS[2],
  )
}

/** CPU reference for unit tests; the shader also floors negative simulated light to zero. */
export function simulateDeuteranopia(rgb: RGB): [number, number, number] {
  const [r, g, b] = rgb
  return DEUTERANOPIA_MATRIX_ROWS.map(row => Math.max(0, row[0] * r + row[1] * g + row[2] * b)) as [
    number,
    number,
    number,
  ]
}

/**
 * Unified Final Post-Processing Pass:
 * Performs architectural lens vignette, microscopic film grain to eliminate banding,
 * and Machado deuteranopia simulation in a single pass without redundant framebuffer copies.
 */
export const DEUTERANOPIA_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uStrength: { value: 0 },
    uVisionMatrix: { value: createDeuteranopiaMatrix() },
    uVignetteDarkness: { value: 0.24 },
    uVignetteOffset: { value: 1.25 },
    uGrainAmount: { value: 0.007 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform mat3 uVisionMatrix;
    uniform float uVignetteDarkness;
    uniform float uVignetteOffset;
    uniform float uGrainAmount;
    uniform float uTime;
    varying vec2 vUv;

    float sanitizeChannel(float value) {
      if (isnan(value) || isinf(value)) return 0.0;
      return clamp(value, 0.0, 12.0);
    }

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 sampled = texture2D(tDiffuse, vUv);

      // 1. Subtle Architectural Lens Vignette
      vec2 coord = (vUv - 0.5);
      float dist = length(coord);
      float vignette = smoothstep(uVignetteOffset, uVignetteOffset - 0.55, dist);
      vec3 color = mix(sampled.rgb * (1.0 - uVignetteDarkness), sampled.rgb, vignette);

      // 2. Microscopic Analog Film Grain
      float noise = (rand(vUv + fract(uTime)) - 0.5) * uGrainAmount;
      color += noise;

      // 3. Color-Vision Pass: Machado Deuteranopia Simulation (Jack vs John)
      vec3 source = vec3(sanitizeChannel(color.r), sanitizeChannel(color.g), sanitizeChannel(color.b));
      if (uStrength > 0.001) {
        vec3 transformed = uVisionMatrix * source;
        vec3 simulated = vec3(sanitizeChannel(transformed.r), sanitizeChannel(transformed.g), sanitizeChannel(transformed.b));
        color = mix(source, simulated, clamp(uStrength, 0.0, 1.0));
      } else {
        color = source;
      }

      gl_FragColor = vec4(color, clamp(sanitizeChannel(sampled.a), 0.0, 1.0));
    }
  `,
}
