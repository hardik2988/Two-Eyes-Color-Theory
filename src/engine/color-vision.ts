import * as THREE from 'three'

/** Approximate full-severity deuteranopia matrix in linear RGB, following Machado et al. */
export const DEUTERANOPIA_MATRIX_ROWS = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.011820, 0.042940, 0.968881],
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
  return DEUTERANOPIA_MATRIX_ROWS.map(row => Math.max(0, row[0] * r + row[1] * g + row[2] * b)) as [number, number, number]
}

/** A single post-process pass blends the one rendered scene between Aria and Kai's views. */
export const DEUTERANOPIA_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uStrength: { value: 0 },
    uVisionMatrix: { value: createDeuteranopiaMatrix() },
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
    varying vec2 vUv;
    float sanitizeChannel(float value) {
      if (isnan(value) || isinf(value)) return 0.0;
      return clamp(value, 0.0, 12.0);
    }
    void main() {
      vec4 sampled = texture2D(tDiffuse, vUv);
      vec3 source = vec3(sanitizeChannel(sampled.r), sanitizeChannel(sampled.g), sanitizeChannel(sampled.b));
      vec3 transformed = uVisionMatrix * source;
      vec3 simulated = vec3(sanitizeChannel(transformed.r), sanitizeChannel(transformed.g), sanitizeChannel(transformed.b));
      gl_FragColor = vec4(mix(source, simulated, clamp(uStrength, 0.0, 1.0)), clamp(sanitizeChannel(sampled.a), 0.0, 1.0));
    }
  `,
}
