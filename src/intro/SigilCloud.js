import {
  Points,
  BufferGeometry,
  BufferAttribute,
  ShaderMaterial,
  AdditiveBlending,
  Color,
  Scene,
  Group
} from 'three';

/**
 * The sigil that assembles while the stage loads.
 *
 * A glyph rasterised to an offscreen canvas, sampled into points, and drawn as
 * a single additive `Points` cloud standing on the ritual ground. Scattered at
 * the start and crisp at the end, with the load's own progress driving the
 * convergence — so the progress bar is not a bar beside the picture, it *is*
 * the picture. There is nothing else to say about how far through it is.
 *
 * ## The motion
 *
 * The scattered state is a **noise-displaced** version of the assembled one,
 * not an explosion from the centre: each mote wanders within its own
 * neighbourhood and loses its structure rather than being flung outward. That
 * is what makes the re-assembly read as *something resolving* instead of
 * something being sucked in, and it is the thing to preserve if this is ever
 * retuned.
 *
 * Each mote carries its own phase, so the shape emerges unevenly — some of the
 * form is already legible while the rest is still dust. A uniform convergence
 * looks like a dissolve transition; a staggered one looks alive.
 *
 * ## Why it is in the engine, and why it is *not* in the scene
 *
 * The opening's whole conceit is that the renderer is genuinely running
 * underneath from the first frame — the black comes from the grade, not from a
 * panel in front of the scene. A loading animation drawn in CSS on top would
 * break exactly that.
 *
 * But it cannot live in the graded scene either, because the thing making the
 * stage black during the load *is* the grade: `post.gain` is 0, and a cloud
 * rendered before that pass is multiplied to nothing along with everything
 * else. So the cloud has its own scene and is drawn straight to the frame
 * buffer after the composer has finished. It is the loading screen; it is
 * legitimately not part of the world.
 *
 * That also means the bloom pass never sees it, so the glow is in the point
 * shader instead — a bright core inside a wide soft halo, which is what the
 * bloom would have produced and costs one extra `smoothstep`.
 */

/**
 * Motes.
 *
 * Tuned down from nine thousand: additive blending over a dense cloud sums to
 * white, and the sigil lost its colour and its texture both — it read as a
 * solid cut-out rather than as a swarm. The gaps between the motes are the
 * effect, so there have to be gaps.
 */
const COUNT = 5200;
/** Motes per pixel of rasterised ink. Constant density, varying count. */
const DENSITY = 1.3;
/** Pixels across the offscreen canvas the glyph is rasterised into. */
const RASTER = 150;

/** mulberry32, so a given glyph always scatters the same way. */
function rng(state) {
  let a = state >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SigilCloud {
  constructor() {
    const geometry = new BufferGeometry();
    // `position` is the assembled target. Everything animated hangs off it, so
    // the buffers are written once per glyph and never per frame.
    this.positions = new Float32Array(COUNT * 3);
    this.scatter = new Float32Array(COUNT * 3);
    this.seeds = new Float32Array(COUNT);

    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('aScatter', new BufferAttribute(this.scatter, 3));
    geometry.setAttribute('aSeed', new BufferAttribute(this.seeds, 1));
    // Every mote is inside the scatter volume, which is bigger than the glyph,
    // and the cloud is on screen for two seconds. Culling it is not worth the
    // bounding-sphere maintenance.
    geometry.boundingSphere = null;

    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // And no depth *test*. This is drawn after the composer, onto a frame
      // buffer whose depth is whatever the last fullscreen quad left there, so
      // testing against it hides the cloud completely. Nothing is supposed to
      // occlude the loading screen anyway.
      depthTest: false,
      blending: AdditiveBlending,
      fog: false,
      uniforms: {
        uAssemble: { value: 0 },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uSize: { value: 120 },
        uPixelRatio: { value: 1 },
        // Two hues, mixed per mote. One colour reads as a texture swatch; the
        // speckle is what makes it read as a swarm.
        uCool: { value: new Color('#bfe8df') },
        uWarm: { value: new Color('#ff6a3c') }
      },
      vertexShader: /* glsl */ `
        uniform float uAssemble;
        uniform float uTime;
        uniform float uSize;
        uniform float uPixelRatio;
        attribute vec3 aScatter;
        attribute float aSeed;
        varying float vSeed;
        varying float vHere;

        void main() {
          vSeed = aSeed;

          // Staggered: each mote has its own slice of the convergence, so the
          // shape resolves unevenly rather than fading in all at once.
          float delay = aSeed * 0.42;
          float t = clamp((uAssemble - delay) / (1.0 - delay), 0.0, 1.0);
          // Ease out, hard. A mote should arrive and settle, not coast in.
          float e = 1.0 - pow(1.0 - t, 3.0);
          vHere = e;

          vec3 p = mix(aScatter, position, e);

          // A small permanent drift, strongest while scattered, so the cloud is
          // never a still image even at rest.
          float wobble = mix(0.16, 0.014, e);
          p.x += sin(uTime * (0.6 + aSeed * 1.7) + aSeed * 31.0) * wobble;
          p.y += cos(uTime * (0.5 + aSeed * 1.3) + aSeed * 17.0) * wobble;
          p.z += sin(uTime * (0.4 + aSeed * 1.1) + aSeed * 53.0) * wobble;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uPixelRatio * (0.35 + aSeed * 0.85) / max(-mv.z, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        uniform vec3 uCool;
        uniform vec3 uWarm;
        varying float vSeed;
        varying float vHere;

        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          // Core plus halo: the bloom pass is downstream of the composer and
          // this is drawn after it, so the glow has to be in the point.
          float core = smoothstep(0.34, 0.02, d);
          float halo = smoothstep(0.5, 0.06, d) * 0.45;
          float mask = core + halo;
          // A minority of warm motes through a mostly cool cloud.
          vec3 tint = mix(uCool, uWarm, step(0.82, vSeed) * (0.35 + vSeed * 0.5));
          // Brighter once it has arrived: the assembled sigil should be the
          // brightest thing on the stage, and the dust before it should not.
          // Low per-mote, so a dozen overlapping motes build toward the hue
          // rather than clipping past it into white.
          float a = mask * uOpacity * (0.14 + vHere * 0.34);
          if (a < 0.003) discard;
          gl_FragColor = vec4(tint, a);
        }
      `
    });

    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.name = 'SigilCloud';
    // Set per glyph by `setGlyph`, so the *density* is constant rather than the
    // count. The diamond covers five times the ink the air mark does, and
    // giving both the same number of motes made one a swarm and the other a
    // solid white cut-out.
    geometry.setDrawRange(0, 0);

    // Its own scene, drawn after the composer. See the note above.
    this.group = new Group();
    this.group.add(this.points);
    this.scene = new Scene();
    this.scene.add(this.group);
    this.visible = false;
  }

  /**
   * Rasterise `glyph` and lay the motes out along it.
   *
   * Sampling a canvas rather than shipping a point list means any character
   * works — the four element sigils, a letter, anything a font has — without a
   * build step or an asset. Rejection-sampled against the rasterised alpha, so
   * the density follows the strokes and the counts stay even.
   *
   * @param {string} glyph
   * @param {{ height?: number, lift?: number, seed?: number }} [options]
   *   `height` in metres; `lift` is how far off the ground the glyph's base sits
   * @returns {boolean} whether a glyph could be sampled at all
   */
  setGlyph(glyph, { height = 8.6, lift = 0.7, seed = 0x9e3779b9 } = {}) {
    const raster = this._raster(glyph);
    if (!raster) return false;
    const { alpha, minX, maxX, minY, maxY } = raster;

    const next = rng(seed);
    // Scaled to the glyph's *ink*, not to its em box. The four sigils fill wildly
    // different fractions of their em — the air mark is a sliver of it — so
    // scaling by the canvas made one sigil a third the size of another and left
    // it floating halfway up, wherever its ink happened to sit.
    const inkW = Math.max(1, maxX - minX);
    const inkH = Math.max(1, maxY - minY);
    // Fit the *longer* side, so a wide mark and a tall one end up the same size
    // on screen. Normalising by height alone made the air sigil — which is wide
    // and short — run off both sides of the stage.
    const scale = height / Math.max(inkW, inkH);
    const midX = (minX + maxX) / 2;
    // Motes per pixel of ink, so every sigil reads with the same texture.
    const wanted = Math.max(900, Math.min(COUNT, Math.round(raster.ink * DENSITY)));
    let placed = 0;
    // Bounded: a glyph that covers very little of its own box would otherwise
    // spin here, and an almost-empty sigil is better than a hung tab.
    for (let attempt = 0; attempt < COUNT * 400 && placed < wanted; attempt++) {
      const fx = minX + next() * (inkW + 1);
      const fy = minY + next() * (inkH + 1);
      const px = Math.floor(fx);
      const py = Math.floor(fy);
      if (px > maxX || py > maxY || alpha[py * RASTER + px] < 140) continue;

      // Canvas y grows downward; the world's grows up. The ink's bottom edge
      // sits at `lift`, so every sigil stands on the ground the same way.
      //
      // Placed at the continuous sample, not at the pixel centre: rounding to
      // the raster put nine thousand motes onto a few thousand exact lattice
      // points, and a cloud on a visible grid reads as a halftone print rather
      // than as a swarm.
      const x = (fx - midX) * scale;
      const y = (maxY - fy) * scale + lift;
      // A little depth, so it is a slab of motes rather than a decal. Enough to
      // catch the light as the camera drifts, not enough to read as a volume.
      const z = (next() - 0.5) * height * 0.06;

      const i = placed * 3;
      this.positions[i] = x;
      this.positions[i + 1] = y;
      this.positions[i + 2] = z;

      // The scattered state: displaced from where it belongs, not flung from
      // the centre. Each mote keeps its neighbourhood and loses its structure.
      this.scatter[i] = x + (next() - 0.5) * height * 0.70;
      this.scatter[i + 1] = y + (next() - 0.5) * height * 0.58;
      this.scatter[i + 2] = z + (next() - 0.5) * height * 0.34;

      this.seeds[placed] = next();
      placed++;
    }

    const geometry = this.points.geometry;
    // Nothing past `placed` is drawn at all, so the unused tail of the buffers
    // never has to be cleaned up or reasoned about.
    geometry.setDrawRange(0, placed);
    geometry.getAttribute('position').needsUpdate = true;
    geometry.getAttribute('aScatter').needsUpdate = true;
    geometry.getAttribute('aSeed').needsUpdate = true;
    return placed > 0;
  }

  /**
   * @returns {{ alpha: Uint8ClampedArray, ink: number, minX: number,
   *   maxX: number, minY: number, maxY: number }|null} alpha and ink bounds
   */
  _raster(glyph) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = RASTER;
    canvas.height = RASTER;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Georgia because that is what the dock already draws these sigils in, so
    // the shape that assembles is the shape the player will go on clicking.
    ctx.font = `${Math.round(RASTER * 0.78)}px Georgia, "Times New Roman", serif`;
    ctx.fillText(glyph, RASTER / 2, RASTER / 2);
    const data = ctx.getImageData(0, 0, RASTER, RASTER).data;
    const alpha = new Uint8ClampedArray(RASTER * RASTER);
    let ink = 0;
    let minX = RASTER, maxX = 0, minY = RASTER, maxY = 0;
    for (let y = 0; y < RASTER; y++) {
      for (let x = 0; x < RASTER; x++) {
        const i = y * RASTER + x;
        alpha[i] = data[i * 4 + 3];
        if (alpha[i] < 140) continue;
        ink++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    // A font that has no glyph for this character draws nothing, or a tofu box.
    // Either way, refusing here is better than assembling a rectangle.
    if (ink <= RASTER * 2) return null;
    return { alpha, ink, minX, maxX, minY, maxY };
  }

  /** Paint the cloud in an element's own colours. */
  setAccent(cool, warm) {
    this.material.uniforms.uCool.value.set(cool);
    this.material.uniforms.uWarm.value.set(warm);
  }

  /**
   * @param {number} assemble 0 scattered, 1 crisp
   * @param {number} opacity  0 gone, 1 full
   */
  set(assemble, opacity) {
    const u = this.material.uniforms;
    u.uAssemble.value = assemble;
    u.uOpacity.value = opacity;
    this.visible = opacity > 0.002;
  }

  /**
   * Turn to face the camera, about the upright axis only.
   *
   * The glyph is a flat sampling of a rasterised character, so seen edge-on it
   * is a line. Billboarding the whole group would tilt it off the ground as the
   * camera pitches; yaw alone keeps it standing where it was placed.
   */
  faceCamera(camera) {
    this.group.rotation.y = Math.atan2(
      camera.position.x - this.group.position.x,
      camera.position.z - this.group.position.z
    );
  }

  /**
   * Draw straight to the frame buffer, over whatever the composer produced.
   *
   * `autoClear` off, or this would wipe the stage it is supposed to be sitting
   * in front of. Restored afterwards, because everything else in the frame
   * assumes it is on.
   */
  render(gl, camera) {
    if (!this.visible) return;
    const wasAutoClear = gl.autoClear;
    gl.autoClear = false;
    gl.render(this.scene, camera);
    gl.autoClear = wasAutoClear;
  }

  setPixelRatio(ratio) {
    this.material.uniforms.uPixelRatio.value = ratio;
  }

  update(elapsed) {
    this.material.uniforms.uTime.value = elapsed;
  }

  dispose() {
    this.group.remove(this.points);
    this.scene.remove(this.group);
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
