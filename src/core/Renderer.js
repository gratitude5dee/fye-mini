import {
  WebGLRenderer,
  PCFShadowMap,
  ACESFilmicToneMapping,
  SRGBColorSpace
} from 'three';
import { settings } from '../config/settings.js';

/**
 * Thin wrapper around WebGLRenderer that owns canvas sizing, pixel-ratio
 * budgeting and the render-quality knobs the rest of the app never touches.
 */
export class Renderer {
  constructor(canvas) {
    this.gl = new WebGLRenderer({
      canvas,
      // Spark performs its own Gaussian accumulation. MSAA does not improve
      // splats and costs a material amount of fill rate on world scenes.
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
      // Portrait capture happens on the actual impact frame. Keeping that
      // frame available makes canvas.toBlob reliable across browsers.
      preserveDrawingBuffer: true
    });

    this.maxPixelRatio = 1.75;
    this.gl.setPixelRatio(this.targetPixelRatio());
    this.gl.setSize(window.innerWidth, window.innerHeight, false);

    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFShadowMap;
    // The frame renders the scene several times (depth prepass, distortion,
    // contact shadows, main pass). Automatic updates would rebuild the cascade
    // shadow maps for every one of them, so the app flags a single update per
    // frame instead.
    this.gl.shadowMap.autoUpdate = false;

    // Tone mapping is executed by the post pipeline's OutputPass, which reads
    // these two properties from the renderer.
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = settings.post.exposure;
    this.worldVisualMode = false;
    this.gl.outputColorSpace = SRGBColorSpace;

    this.gl.info.autoReset = false;

    this._onResize = null;
  }

  /** Cap the pixel ratio: 4K + heavy transparency is not worth the fill rate. */
  targetPixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
  }

  /**
   * Lower (or restore) the cap. Fill rate is the cheapest thing to give back on
   * a stage this transparent, so it is the first thing the quality ladder takes.
   */
  setPixelRatioCap(cap) {
    if (this.maxPixelRatio === cap) return;
    this.maxPixelRatio = cap;
    const next = this.targetPixelRatio();
    if (this.gl.getPixelRatio() === next) return;
    this.gl.setPixelRatio(next);
    this.gl.setSize(window.innerWidth, window.innerHeight, false);
    this._onResize?.(window.innerWidth, window.innerHeight, next);
  }

  get domElement() {
    return this.gl.domElement;
  }

  get size() {
    return this.gl.getSize({ width: 0, height: 0 });
  }

  onResize(callback) {
    this._onResize = callback;
    window.addEventListener('resize', this.handleResize, { passive: true });
  }

  handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gl.setPixelRatio(this.targetPixelRatio());
    this.gl.setSize(w, h, false);
    this._onResize?.(w, h, this.gl.getPixelRatio());
  };

  /** Called once per frame before rendering so the editor can drive exposure. */
  syncSettings() {
    // Marble splats already carry baked, high-key lighting. The cinematic
    // ritual stage can afford a brighter exposure, but applying it to that
    // source clips pale stone and water into a milky blur.
    this.gl.toneMappingExposure = this.worldVisualMode
      ? Math.min(settings.post.exposure, 0.72)
      : settings.post.exposure;
  }

  setWorldVisualMode(active) {
    this.worldVisualMode = Boolean(active);
  }

  dispose() {
    window.removeEventListener('resize', this.handleResize);
    this.gl.dispose();
  }
}
