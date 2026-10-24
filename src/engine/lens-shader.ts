import * as THREE from 'three'

/**
 * Architectural Lens Treatment:
 * Soft optical vignette and delicate microscopic film grain to eliminate banding in gradients.
 */
export const LENS_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignetteDarkness: { value: 0.35 },
    uVignetteOffset: { value: 1.15 },
    uGrainAmount: { value: 0.012 },
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
    uniform float uVignetteDarkness;
    uniform float uVignetteOffset;
    uniform float uGrainAmount;
    uniform float uTime;
    varying vec2 vUv;

    // Fast pseudo-random hash for fine-grain dispersion
    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // 1. Subtle Architectural Vignette
      vec2 coord = (vUv - 0.5) * (vec2(1.0, 1.0));
      float dist = length(coord);
      float vignette = smoothstep(uVignetteOffset, uVignetteOffset - 0.55, dist);
      color.rgb = mix(color.rgb * (1.0 - uVignetteDarkness), color.rgb, vignette);

      // 2. Microscopic Analog Film Grain (breaks banding on smooth plaster/sky gradients)
      float noise = (rand(vUv + fract(uTime)) - 0.5) * uGrainAmount;
      color.rgb += noise;

      gl_FragColor = color;
    }
  `,
}
