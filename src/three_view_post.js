// balance-impact: none — post-processing for the Three.js explore-view prototype (#2042).
//
// The "HD" half of the HD-2D look: the pixel-art scene is rendered once into
// a float buffer with depth, then
//   1. blurred by distance from the focus plane (soft far corridor in
//      first-person, miniature-style near and far falloff in top-down),
//   2. bloomed, so flames and lit stone spill light,
//   3. darkened slightly toward the screen edges, and
//   4. tone-mapped to the screen.
import { DepthTexture, HalfFloatType, ShaderMaterial, Vector2, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const FULLSCREEN_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Each pixel is blurred by how far its depth is from the focus plane. Taps
// that are themselves in focus are weighted down so a sharp object does not
// smear into the soft area behind it.
const DEPTH_BLUR_FRAGMENT = /* glsl */`
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float focus;
  uniform float focusRange;
  uniform float blurSpan;
  uniform vec2 blurRadius;
  varying vec2 vUv;

  float blurAt(vec2 uv) {
    float viewZ = perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar);
    return clamp((abs(-viewZ - focus) - focusRange) / blurSpan, 0.0, 1.0);
  }

  void main() {
    float amount = blurAt(vUv);
    vec3 color = texture2D(tColor, vUv).rgb;
    if (amount > 0.02) {
      vec3 sum = color;
      float weight = 1.0;
      for (int i = 0; i < 14; i++) {
        float index = float(i);
        float angle = index * 2.39996323;
        float radius = sqrt((index + 0.5) / 14.0);
        vec2 uv = vUv + vec2(cos(angle), sin(angle)) * radius * amount * blurRadius;
        float tapWeight = 0.2 + blurAt(uv);
        sum += texture2D(tColor, uv).rgb * tapWeight;
        weight += tapWeight;
      }
      color = sum / weight;
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

class DepthBlurPass extends Pass {
  constructor(sceneTarget, camera) {
    super();
    this.camera = camera;
    this.material = new ShaderMaterial({
      uniforms: {
        tColor: { value: sceneTarget.texture },
        tDepth: { value: sceneTarget.depthTexture },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        focus: { value: 2 },
        focusRange: { value: 1.5 },
        blurSpan: { value: 3 },
        blurRadius: { value: new Vector2(0.006, 0.006) }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: DEPTH_BLUR_FRAGMENT
    });
    this.quad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer) {
    this.material.uniforms.cameraNear.value = this.camera.near;
    this.material.uniforms.cameraFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}

const VIGNETTE_SHADER = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.28 } },
  vertexShader: FULLSCREEN_VERTEX,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      float edge = smoothstep(0.32, 0.86, length(vUv - 0.5));
      gl_FragColor = vec4(color * (1.0 - strength * edge), 1.0);
    }
  `
};

export class ThreeViewPost {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.sceneTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthTexture: new DepthTexture(1, 1) });
    this.blur = new DepthBlurPass(this.sceneTarget, camera);
    // The threshold sits just above fully lit stone, so only flames, halos,
    // and stone right beside a torch bloom.
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.45, 0.5, 0.95);
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(this.blur);
    this.composer.addPass(this.bloom);
    this.vignette = new ShaderPass(VIGNETTE_SHADER);
    this.composer.addPass(this.vignette);
    this.composer.addPass(new OutputPass());
  }

  setSize(width, height, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.sceneTarget.setSize(Math.max(1, Math.round(width * pixelRatio)), Math.max(1, Math.round(height * pixelRatio)));
    this.aspect = width / Math.max(1, height);
    this.setFocus(this.focus);
  }

  /** `radius` is the full blur radius as a fraction of the screen height. */
  setFocus(focus = { distance: 2, range: 1.5, span: 3, radius: 0.006 }) {
    this.focus = focus;
    const uniforms = this.blur.material.uniforms;
    uniforms.focus.value = focus.distance;
    uniforms.focusRange.value = focus.range;
    uniforms.blurSpan.value = focus.span;
    uniforms.blurRadius.value.set(focus.radius / (this.aspect || 1), focus.radius);
  }

  /** How strongly bright things spill and how far the screen edges fall off. */
  setMood({ bloom, vignette }) {
    this.bloom.strength = bloom;
    this.vignette.uniforms.strength.value = vignette;
  }

  render() {
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.composer.render();
  }

  dispose() {
    this.composer.passes.forEach((pass) => pass.dispose?.());
    this.composer.dispose();
    this.sceneTarget.depthTexture?.dispose();
    this.sceneTarget.dispose();
  }
}
