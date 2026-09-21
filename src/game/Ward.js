import {
  AdditiveBlending, Color, DoubleSide, Group, Mesh, MeshStandardMaterial,
  PlaneGeometry, ShaderMaterial, Vector3
} from 'three';

import { createTowerGeometry } from '../assets/ProceduralGeometry.js';
import { sharedUniforms } from '../core/FrameUniforms.js';
import { LAYER } from '../core/Layers.js';
import { settings } from '../config/settings.js';
import { getColor } from '../utils/color.js';
import { saturate } from '../utils/math.js';

/**
 * The problem, drawn on the ground, and the Ward that answers it.
 *
 * Three things live here: a ring at each waystone's accept radius, a region at
 * each hazard, and a standing stone per line of the Rite that lights when its
 * line is solved.
 *
 * Two rules shape all of it.
 *
 * **What you see is what is measured.** Every ring is drawn at exactly the
 * radius `resolveStroke` tests against, so the player is never guessing at a
 * tolerance. That is also why the ring's band is sized in *world metres*
 * remapped from UV rather than as a fraction of the quad: a 1.15m ring and a
 * 3m ring have the same visual weight, and the player reads distance rather
 * than perspective.
 *
 * **The stones take no point lights.** `LightPool` holds six, shared with every
 * cast, and `AbilityManager` already allows eight concurrent abilities, so
 * scenery that borrowed from that pool would starve the casts it exists to
 * frame. They are emissive instead: `post.bloomThreshold` is 0.72 against a
 * near-black stage, so a lit stone blooms for the cost of one uniform write.
 */

const RING_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * One quad, one signed distance field, everything in metres.
 *
 * `uRadius` is the tested radius and `uBand` is a thickness in metres, so the
 * band does not thin out as the ring grows. `uFill` separates a waystone (a
 * ring you aim for) from a hazard (a region you avoid) without a second shader.
 */
const RING_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uRadius;    // metres — the radius resolveStroke tests
  uniform float uBand;      // metres — constant thickness at any radius
  uniform float uFill;      // 0 = ring only, 1 = filled region
  uniform float uLit;       // 0..1 answered / clipped
  uniform float uPulse;     // breathing amplitude
  uniform vec3  uColor;
  uniform vec3  uColorLit;
  uniform float uGlobalGlow;
  varying vec2 vUv;

  void main() {
    // The quad spans 2*uRadius, so this maps UV straight into metres from centre.
    vec2 p = (vUv - 0.5) * 2.0 * uRadius;
    float d = length(p);
    if (d > uRadius) discard;

    vec3 color = mix(uColor, uColorLit, uLit);

    // The band sits on the boundary and keeps its metre thickness.
    float edge = 1.0 - smoothstep(0.0, uBand, abs(d - uRadius));
    float wash = uFill * (1.0 - smoothstep(uRadius * 0.2, uRadius, d)) * 0.30;

    // Ticks around the rim give the ring a direction to read against, and turn
    // slowly so a static layout still feels attended to.
    float angle = atan(p.y, p.x) + uTime * 0.08;
    float ticks = smoothstep(0.72, 1.0, abs(sin(angle * 12.0))) * edge * 0.45;

    float breath = 1.0 + sin(uTime * 2.0) * uPulse;
    float alpha = (edge * 0.85 + wash + ticks) * breath;
    alpha *= mix(0.55, 1.0, uLit);
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(color * (1.0 + uLit * 1.6) * uGlobalGlow, alpha);
  }
`;

const _tmp = new Vector3();

/** A ground marker: a waystone's accept ring, or a hazard's region. */
class Marker {
  constructor() {
    this.material = new ShaderMaterial({
      uniforms: sharedUniforms({
        uRadius: { value: 1 },
        uBand: { value: 0.12 },
        uFill: { value: 0 },
        uLit: { value: 0 },
        uPulse: { value: 0.04 },
        uColor: { value: new Color('#bfe8df') },
        uColorLit: { value: new Color('#ffffff') }
      }),
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 6;
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER.VFX);
    this.mesh.visible = false;
    this.lit = 0;
    this.target = 0;
  }

  place(x, z, radius, { fill = 0, color, colorLit, band = 0.12, pulse = 0.04 } = {}) {
    // The quad is sized to the tested radius, which is what keeps the shader's
    // UV-to-metres mapping honest.
    this.mesh.scale.set(radius * 2, radius * 2, 1);
    this.mesh.position.set(x, settings.trail.height * 0.5, z);
    const u = this.material.uniforms;
    u.uRadius.value = radius;
    u.uBand.value = band;
    u.uFill.value = fill;
    u.uPulse.value = pulse;
    if (color) u.uColor.value.copy(getColor(color));
    if (colorLit) u.uColorLit.value.copy(getColor(colorLit));
    this.mesh.visible = true;
    this.lit = 0;
    this.target = 0;
    u.uLit.value = 0;
  }

  update(dt) {
    if (!this.mesh.visible) return;
    if (this.lit !== this.target) {
      const step = dt * 4;
      this.lit = this.lit < this.target ? Math.min(this.target, this.lit + step) : Math.max(this.target, this.lit - step);
      this.material.uniforms.uLit.value = this.lit;
    }
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** One standing stone: dark until its line is solved, then emissive. */
class Stone {
  constructor(seed) {
    this.material = new MeshStandardMaterial({
      color: new Color('#2a3038'),
      roughness: 0.82,
      metalness: 0.05,
      emissive: new Color('#000000'),
      emissiveIntensity: 1
    });
    this.mesh = new Mesh(createTowerGeometry(seed), this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.layers.set(LAYER.WORLD);
    this.mesh.visible = false;
    this.lit = 0;
    this.target = 0;
    this._accent = new Color('#bfe8df');
  }

  /**
   * @param {number} height metres
   * @param {number} girth  metres across — kept well under the height, or the
   *   unit tower reads as a squat block rather than a standing stone
   */
  place(x, z, height, girth, accent) {
    this.mesh.position.set(x, 0, z);
    this.mesh.scale.set(girth, height, girth);
    // A ring of identical stones reads as a fence. A per-stone turn makes it a
    // circle of individuals, for the cost of one assignment.
    this.mesh.rotation.y = Math.atan2(x, z) * 1.7;
    this.mesh.visible = true;
    if (accent) this._accent.copy(getColor(accent));
    this.setLit(0, true);
  }

  setLit(value, immediate = false) {
    this.target = saturate(value);
    if (immediate) {
      this.lit = this.target;
      this._apply();
    }
  }

  update(dt) {
    if (!this.mesh.visible || this.lit === this.target) return;
    const step = dt * 2.2;
    this.lit = this.lit < this.target ? Math.min(this.target, this.lit + step) : Math.max(this.target, this.lit - step);
    this._apply();
  }

  _apply() {
    // Emissive only: no light is taken from the pool the casts depend on.
    //
    // Kept well under 1. `post.bloomThreshold` is 0.72 against a near-black
    // stage, so anything above about 0.4 blooms into a flat white lozenge with
    // no silhouette left — the stone stops reading as a stone. This is bright
    // enough to be unmistakable across the field and still keep its edges.
    this.material.emissive.copy(this._accent).multiplyScalar(this.lit * 0.34);
    this.material.color.setHex(0x2a3038).lerp(this._accent, this.lit * 0.22);
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** The ritual ground's game layer. */
export class Ward {
  /**
   * @param {THREE.Scene} scene
   * @param {number} [capacity] most waystones plus hazards a layout can hold
   */
  constructor(scene, capacity = 10) {
    this.group = new Group();
    this.group.name = 'Ward';
    scene.add(this.group);

    this.markers = Array.from({ length: capacity }, () => new Marker());
    for (const marker of this.markers) this.group.add(marker.mesh);

    /** One stone per line of the Rite. Sized on `setRite`. */
    this.stones = [];
    this.layout = null;
    this._waystoneCount = 0;
    this._hazardOffset = 0;
  }

  /**
   * Raise a ring of stones, one per line.
   *
   * Stones match lines, not elements. An earlier design gave each of four
   * elements two stones out of eight, which made the opening Rites unwinnable
   * by construction — one element could light at most two. One per line makes
   * the Ward a progress bar made of rock: it fills completely on a clean run,
   * and a dark stone is one specific line the player knows they fluffed.
   */
  setRite(lineCount, accent = '#bfe8df') {
    while (this.stones.length < lineCount) {
      const stone = new Stone(11 + this.stones.length * 7);
      this.group.add(stone.mesh);
      this.stones.push(stone);
    }
    const radius = settings.rite.fieldRadius * 1.55;
    for (let i = 0; i < this.stones.length; i++) {
      if (i >= lineCount) {
        this.stones[i].hide();
        continue;
      }
      const angle = (i / Math.max(1, lineCount)) * Math.PI * 2 - Math.PI / 2;
      // `createTowerGeometry` is a unit tower, so these are metres directly.
      // Tall and narrow: it has to stand over the caster and still let the
      // field be read past it.
      this.stones[i].place(Math.cos(angle) * radius, Math.sin(angle) * radius, 2.8, 0.62, accent);
    }
  }

  /** Put one line's problem on the ground. */
  setLayout(layout, accent = '#bfe8df') {
    this.layout = layout;
    for (const marker of this.markers) marker.hide();
    if (!layout) return;

    let slot = 0;
    for (const stone of layout.waystones) {
      if (slot >= this.markers.length) break;
      this.markers[slot++].place(stone.x, stone.z, stone.radius, {
        fill: 0, color: accent, colorLit: '#ffffff', band: 0.14, pulse: 0.05
      });
    }
    this._waystoneCount = slot;
    this._hazardOffset = slot;

    for (const hazard of layout.hazards) {
      if (slot >= this.markers.length) break;
      this.markers[slot++].place(hazard.x, hazard.z, hazard.radius, {
        // Hazards are filled and still. A region you must not enter should not
        // pulse for attention; it should sit there being in the way.
        fill: 1, color: '#7a4bd8', colorLit: '#ff5a4a', band: 0.2, pulse: 0
      });
    }
  }

  /** Light the rings the line actually reached, and flash any hazard it clipped. */
  showOutcome(outcome) {
    if (!outcome) return;
    for (let i = 0; i < this._waystoneCount; i++) {
      this.markers[i].target = outcome.reached[i] ? 1 : 0;
    }
    if (outcome.clipped >= 0) {
      const marker = this.markers[this._hazardOffset + outcome.clipped];
      if (marker) marker.target = 1;
    }
  }

  /** Reflect the Rite's ward state onto the stones. */
  showWard(ward) {
    for (let i = 0; i < this.stones.length; i++) {
      this.stones[i].setLit(ward?.[i] ? 1 : 0);
    }
  }

  /** Centre of the current problem, for framing. */
  focus(out = _tmp) {
    const stones = this.layout?.waystones ?? [];
    if (stones.length === 0) return out.set(0, 0, 0);
    let x = 0;
    let z = 0;
    for (const stone of stones) { x += stone.x; z += stone.z; }
    return out.set(x / stones.length, 0, z / stones.length);
  }

  update(dt) {
    for (const marker of this.markers) marker.update(dt);
    for (const stone of this.stones) stone.update(dt);
  }

  clear() {
    this.layout = null;
    for (const marker of this.markers) marker.hide();
    for (const stone of this.stones) stone.hide();
  }

  dispose() {
    for (const marker of this.markers) marker.dispose();
    for (const stone of this.stones) stone.dispose();
    this.markers.length = 0;
    this.stones.length = 0;
    this.group.parent?.remove(this.group);
  }
}
