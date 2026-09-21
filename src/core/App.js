import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';

import { Renderer } from './Renderer.js';
import { Time } from './Time.js';
import { CameraRig } from './CameraRig.js';
import { frame } from './FrameUniforms.js';

import { Environment } from '../world/Environment.js';
import { Ground } from '../world/Ground.js';
import { DustMotes } from '../world/DustMotes.js';
import { InputManager } from '../input/InputManager.js';
import { HandInput } from '../input/HandInput.js';
import { PathDrawer } from '../input/PathDrawer.js';
import { ParticleEngine } from '../particles/ParticleEngine.js';
import { LightPool } from '../effects/LightPool.js';
import { DecalSystem } from '../effects/GroundDecals.js';
import { BurstSystem } from '../effects/BurstSphere.js';
import { CameraShake } from '../effects/CameraShake.js';
import { ScreenFlash } from '../effects/ScreenFlash.js';
import { AbilityManager } from '../abilities/AbilityManager.js';
import { PostProcessing } from '../postprocessing/PostProcessing.js';
import { AssetLoader } from '../loaders/AssetLoader.js';
import { CharacterController } from '../animation/CharacterController.js';
import { WalkController } from '../animation/WalkController.js';
import { CasterPerformance } from '../animation/CasterPerformance.js';
import { HUD, LoadingScreen } from '../ui/HUD.js';
import { Editor } from '../ui/Editor.js';
import { settings, ELEMENTS } from '../config/settings.js';
import { RANGES, SPELLWRIGHT_COLOR_PATHS, enginePath } from '../config/spell-contract.js';
import { Rite } from '../game/Rite.js';
import { IntroDirector } from '../intro/IntroDirector.js';
import { SigilCloud } from '../intro/SigilCloud.js';
import { TO_ENGINE, TO_UI } from '../state/events.js';
import { QualityLadder } from './QualityLadder.js';
import { CalmMode } from './CalmMode.js';

/**
 * The mark each element assembles as, while the stage loads.
 *
 * The same glyphs the dock draws, in the same face, so what resolves out of the
 * dark is the thing the player will go on pressing. `warm` is the speckle
 * through the cloud rather than a second element: one flat colour reads as a
 * swatch, and the minority hue is what makes it read as a swarm.
 */
const SIGIL = {
  fire: { glyph: '\u2726', cool: '#ff6a3c', warm: '#ffd8a8' },
  water: { glyph: '\u25d2', cool: '#3fb8c9', warm: '#bfe8df' },
  earth: { glyph: '\u25c6', cool: '#c6a372', warm: '#ffe7bd' },
  air: { glyph: '\u2301', cool: '#bfe8df', warm: '#9ba9ff' },
  wind: { glyph: '\u2301', cool: '#bfe8df', warm: '#9ba9ff' }
};

/** Owns the local stage, input sources, caster performance, and effects. */
export class App {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.time = new Time();
    this.elapsed = 0;
    this.paused = false;
    this._raf = 0;
    this.rideNextStroke = false;
    this._shadowClock = 0;

    this.renderer = new Renderer(canvas);
    this.rig = new CameraRig(canvas);
    this.camera = this.rig.camera;
    this.environment = new Environment(this.renderer, this.camera);
    this.scene = this.environment.scene;
    this.assets = new AssetLoader();

    this.ground = new Ground(this.environment);
    this.dust = new DustMotes();
    // The mark that assembles while the stage loads. Beside the dust because it
    // is the same kind of thing — one additive Points cloud sharing its pixel
    // ratio and its clock — and because it has to exist before the first frame,
    // which is the frame the load begins on.
    this.sigil = new SigilCloud();
    this.stageAnchor = new Vector3();
    this.scene.add(this.ground.mesh, this.dust.points);
    this.dust.setPixelRatio(this.renderer.gl.getPixelRatio());
    this.sigil.setPixelRatio(this.renderer.gl.getPixelRatio());
    this._dressSigil(options.element);

    this.particles = new ParticleEngine(this.scene);
    this.lights = new LightPool(this.scene);
    this.decals = new DecalSystem(this.scene);
    this.bursts = new BurstSystem(this.scene);
    this.shake = new CameraShake(this.rig);
    this.flash = new ScreenFlash();
    this.abilities = new AbilityManager({
      scene: this.scene,
      camera: this.camera,
      environment: this.environment,
      particles: this.particles,
      lights: this.lights,
      decals: this.decals,
      bursts: this.bursts,
      shake: this.shake,
      flash: this.flash,
      onAbilityImpact: (ability) => this._onAbilityImpact(ability)
    });

    this.rite = new Rite({
      scene: this.scene, decals: this.decals, bursts: this.bursts,
      shake: this.shake, flash: this.flash, abilities: this.abilities,
      // The suggestion starts at the caster's feet, wherever they are.
      casterPosition: () => this.character?.position ?? this.stageAnchor,
      // How much ground the line in front of the player needs on screen. A
      // portrait phone sees a fraction of what a laptop does across, so this
      // is the difference between a waystone the player can draw to and one
      // they have to orbit to find.
      frameGround: (metres) => this.rig.requireGroundSpan(metres)
    });

    this.character = new CharacterController(this.environment);
    this.walk = null;
    this.caster = null;

    // Watches measured frame time and steps the stage down when it has to.
    // Constructed before the tracker, which reads its cadence every frame.
    this.quality = new QualityLadder({ renderer: this.renderer, environment: this.environment });
    // One switch the player owns, distinct from the ladder the machine owns.
    this.calm = new CalmMode();

    this.input = new InputManager(canvas);
    this.handInput = new HandInput(this.input, {
      // The tracker asks rather than being told, so a step that happens while
      // the camera is off is already in force when it comes back on.
      quality: this.quality,
      onElement: (element) => this.selectElement(element),
      onStatus: (message, state = 'notice') => {
        this.hud?.showToast(message);
        window.dispatchEvent(new CustomEvent(TO_UI.INPUT_STATUS, { detail: { message, state } }));
      },
      // Throttled inside the tracker, so this is safe to forward straight on.
      onState: (state) => window.dispatchEvent(new CustomEvent(TO_UI.INPUT_STATUS, { detail: state }))
    });
    this.pathDrawer = new PathDrawer(this.camera);
    this.scene.add(this.pathDrawer.object3D);

    this.post = new PostProcessing(this.renderer, this.scene, this.camera);
    this.loading = new LoadingScreen();
    this.hud = new HUD(document.getElementById('hud'));
    this.editor = new Editor({
      onClear: () => this.clearEffects(),
      onToast: (message) => this.hud.showToast(message)
    });

    // Constructed before the first frame so the stage is black from the very
    // first paint rather than flashing a lit scene and then fading in.
    this.intro = new IntroDirector({ rig: this.rig, sigil: this.sigil }, {
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      returning: Boolean(options.returning)
    });

    settings.mode = 'casting';
    this._bindEvents();
    this._bindGrimoireEvents();
    // The stage's opening element. Silent: nothing has been chosen yet.
    this.selectElement(options.element === 'air' ? 'wind' : (options.element ?? 'wind'), { announce: false });
  }

  _bindEvents() {
    this.renderer.onResize((width, height, pixelRatio) => {
      this.rig.resize(width, height);
      this.post.setSize(width, height, pixelRatio);
      this.dust.setPixelRatio(pixelRatio);
      this.sigil.setPixelRatio(pixelRatio);
    });

    this.input.on('draw:start', (pointer) => {
      this.caster?.setGesture('gather', { element: this.abilities.selected });
      // A new stroke starts from the selected element, whatever the off hand or
      // a held digit did during the last one.
      this.input.elementIndex = -1;
      this._carryChannels();
      this.pathDrawer.begin(pointer);
    });
    this.input.on('draw:move', (pointer) => {
      this.caster?.setGesture('aim', { element: this.abilities.selected });
      this._carryChannels();
      this.pathDrawer.move(pointer);
      const head = this.pathDrawer.samples.at(-1);
      if (head) this.rite.trackPointer(head.x, head.z);
    });
    this.input.on('draw:end', () => {
      this.caster?.setGesture('recovery', { element: this.abilities.selected });
      this.pathDrawer.end();
    });
    this.input.on('element', (index) => this.selectElement(ELEMENTS[index]));
    this.input.on('action', (action) => this._handleAction(action));

    this.pathDrawer.on('cancel', () => {
      // `cancel` has had no listener since the drawer was written, so a stroke
      // under `minPathLength` simply disappeared with no acknowledgement at all.
      this.caster?.setGesture('recovery', { element: this.abilities.selected });
      if (this.rite.active) this.hud.showToast('Longer. Draw it to the end.');
    });

    this.pathDrawer.on('cast', (curve, points, count, length, runs) => {
      if (this.rideNextStroke && this.walk?.begin(curve)) {
        this.rideNextStroke = false;
        this.caster?.setGesture('recovery', { element: 'wind' });
        window.dispatchEvent(new CustomEvent(TO_UI.RIDE_STATUS, { detail: { active: false } }));
        this.hud.showToast('The caster rides the current.');
        return;
      }
      // The stroke's own height profile, captured before the buffer is recycled.
      const strokeLift = this.pathDrawer.liftProfile();
      // One cast per element run. A stroke drawn with one element — every
      // pointer stroke, and every hand stroke where the off hand held still —
      // is one run, so this is the single-cast path it has always been.
      const cast = this._castRuns(curve, points, count, runs, strokeLift);
      // The abilities that actually flew are the ones asked how high they flew,
      // so a fire cast clears a hazard an earth cast cannot — no assumption
      // about the element, just its real altitude along the line.
      const strength = this.rite.judge(points, count, cast);
      // `intensity` has always been accepted here and never passed. A clean
      // solve makes the caster commit; a scrape makes them hesitate, and the
      // player reads the answer off the body before anything else resolves.
      this.caster?.setGesture('release', {
        // The element the caster's body commits to is the one the line ends
        // with: that is where their hand actually is when the stroke releases.
        element: cast[cast.length - 1]?.element ?? this.abilities.selected,
        intensity: .35 + strength * 1.25
      });
      this._recordCast(length);
    });

  }

  /**
   * Point the loading sigil at the element the player last held.
   *
   * A returning player's stage opens in their own colour, on their own mark. It
   * costs nothing - the preference is already read to select the element - and
   * it is the difference between a loading screen and *their* loading screen.
   * A first visit gets air, which is what the stage opens on anyway.
   */
  _dressSigil(element) {
    const meta = SIGIL[element] ?? SIGIL.air;
    if (!this.sigil.setGlyph(meta.glyph)) {
      // No glyph in any available font. Better a plain fade than a tofu box
      // assembling out of the dark with great ceremony.
      this.sigil.set(0, 0);
      return;
    }
    this.sigil.setAccent(meta.cool, meta.warm);
  }

  /**
   * Narrow a stroke's lift profile to one run of it.
   *
   * `liftProfile()` is a function of progress along the *whole* stroke, or null
   * for a flat one — every pointer stroke. A run flies along its own sub-curve
   * and is parameterised over that, so its height has to be looked up at the
   * corresponding point of the whole, or the second run of a line would read
   * its altitude from the wrong end of the profile.
   *
   * @returns {((u: number) => number)|null}
   */
  _liftOver(strokeLift, from, to, count) {
    if (!strokeLift) return null;
    const span = Math.max(1, count - 1);
    const last = Math.max(from, to - 1);
    return (u) => strokeLift((from + Math.min(1, Math.max(0, u)) * (last - from)) / span);
  }

  /**
   * Hand the per-sample channels to the drawer, just before a sample lands.
   *
   * Read here rather than pushed from the input, so the values recorded are the
   * ones in force at the moment of the sample rather than whenever the source
   * last happened to change. A pointer supplies neither and both fall back to
   * their defaults, which is what keeps pointer and hand indistinguishable
   * everywhere downstream.
   */
  _carryChannels() {
    this.pathDrawer.setLift(this.input.lift);
    const held = this.input.elementIndex;
    this.pathDrawer.setElementIndex(held >= 0 ? held : ELEMENTS.indexOf(this.abilities.selected));
  }

  /**
   * Fly each element run of a stroke, and report what flew where.
   *
   * A run is cast along its own sub-curve, so fire really does stop at the gate
   * and earth really does start there, rather than one cast being recoloured
   * halfway. The lift profile is sliced to match, because it is indexed over
   * the whole stroke and each run only owns part of it.
   *
   * @returns {Array<{ element: string, ability: object|null, from: number, to: number }>}
   */
  _castRuns(curve, points, count, runs, strokeLift) {
    // The common case, and the one that must stay free of work: one element,
    // one cast, the whole curve, the whole lift profile.
    if (!runs || runs.length <= 1) {
      const element = runs?.length === 1 ? ELEMENTS[runs[0].element] ?? this.abilities.selected : this.abilities.selected;
      const ability = this.abilities.cast(curve, element, { lift: strokeLift });
      return [{ element, ability, from: 0, to: count }];
    }

    const flown = [];
    for (const run of runs) {
      // A Catmull-Rom needs three points to curve; a two-point run is a
      // straight segment, which is what it looked like on screen anyway.
      const span = Math.max(2, run.to - run.from);
      const pts = [];
      for (let i = run.from; i < run.from + span && i < count; i++) pts.push(points[i].clone());
      if (pts.length < 2) continue;
      const sub = new CatmullRomCurve3(pts, false, 'catmullrom', settings.input.curveTension);
      sub.arcLengthDivisions = Math.max(64, pts.length * 8);
      const element = ELEMENTS[run.element] ?? this.abilities.selected;
      const to = run.from + pts.length;
      flown.push({
        element,
        ability: this.abilities.cast(sub, element, { lift: this._liftOver(strokeLift, run.from, to, count) }),
        from: run.from,
        to
      });
    }
    return flown;
  }

  _bindGrimoireEvents() {
    this._onGrimoireCalm = (event) => this.calm.set(Boolean(event.detail?.enabled));
    this._onGrimoireSelect = (event) => this.selectElement(event.detail?.element === 'air' ? 'wind' : event.detail?.element);
    this._onGrimoirePatch = (event) => {
      const patch = event.detail?.patch ?? event.detail;
      if (!patch || typeof patch !== 'object') return;
      this._applyFlatPatch(patch);
      this.editor.refresh();
      this.hud.showToast('The spell shifts in your hand.');
    };
    this._onGrimoireAttune = () => void this.handInput.start();
    this._onGrimoireStopHands = () => this.handInput.stop();
    this._onGrimoireCast = () => this._castStagePreview();
    this._onGrimoireSkipIntro = () => this.intro.skip();
    this._onGrimoireRite = (event) => {
      if (event.detail?.action === 'aside') this.rite.setAside();
      else this.rite.begin();
    };
    this._onGrimoireRide = () => {
      this.rideNextStroke = !this.rideNextStroke;
      window.dispatchEvent(new CustomEvent(TO_UI.RIDE_STATUS, { detail: { active: this.rideNextStroke } }));
      this.hud.showToast(this.rideNextStroke ? 'Draw a path for the air ride.' : 'Casting mode restored.');
    };
    window.addEventListener(TO_ENGINE.SELECT, this._onGrimoireSelect);
    window.addEventListener(TO_ENGINE.PATCH, this._onGrimoirePatch);
    window.addEventListener(TO_ENGINE.ATTUNE, this._onGrimoireAttune);
    window.addEventListener(TO_ENGINE.STOP_HANDS, this._onGrimoireStopHands);
    window.addEventListener(TO_ENGINE.CAST, this._onGrimoireCast);
    window.addEventListener(TO_ENGINE.RIDE, this._onGrimoireRide);
    window.addEventListener(TO_ENGINE.RITE, this._onGrimoireRite);
    window.addEventListener(TO_ENGINE.CALM, this._onGrimoireCalm);
    window.addEventListener(TO_ENGINE.SKIP_INTRO, this._onGrimoireSkipIntro);
  }

  _applyFlatPatch(patch) {
    for (const [path, value] of Object.entries(patch)) {
      if (typeof path !== 'string' || path.length > 120) continue;
      const range = RANGES[path];
      const isColor = SPELLWRIGHT_COLOR_PATHS.includes(path);
      if (!range && !isColor) continue;
      const parts = enginePath(path).split('.');
      let target = settings;
      for (const part of parts.slice(0, -1)) {
        if (!target || !Object.hasOwn(target, part)) { target = null; break; }
        target = target[part];
      }
      const leaf = parts.at(-1);
      if (!target || !leaf || !Object.hasOwn(target, leaf)) continue;
      if (typeof target[leaf] === 'number' && typeof value === 'number' && Number.isFinite(value) && range) {
        target[leaf] = MathUtils.clamp(value, range.min, range.max);
      }
      if (isColor && typeof target[leaf] === 'string' && typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) target[leaf] = value;
    }
  }

  _castStagePreview() {
    const path = new CatmullRomCurve3([
      new Vector3(-1.8, .02, .85), new Vector3(-.65, .02, .18),
      new Vector3(.68, .02, -.12), new Vector3(1.75, .02, .35)
    ]);
    this.caster?.setGesture('release', { element: this.abilities.selected });
    this.abilities.cast(path);
    this._recordCast(path.getLength());
  }

  /**
   * A cast reached the end of its path.
   *
   * `Ability._beginImpact` has always passed the instance here and the app has
   * always thrown it away. Keeping it is what lets a game layer resolve a hit
   * without reaching back into the ability pool.
   *
   * @param {import('../abilities/Ability.js').Ability} [ability]
   */
  _onAbilityImpact(ability) {
    this.caster?.setGesture('recovery', { element: this.abilities.selected });
    if (!ability) return;
    const element = ability.element === 'wind' ? 'air' : ability.element;
    window.dispatchEvent(new CustomEvent(TO_UI.IMPACT, {
      detail: { element, x: ability.position.x, z: ability.position.z, u: ability.u }
    }));
  }

  _recordCast(pathLength) {
    const element = this.abilities.selected === 'wind' ? 'air' : this.abilities.selected;
    // Casts are ephemeral: only the browser's visual stage receives this event.
    window.dispatchEvent(new CustomEvent(TO_UI.CAST_COMPLETE, { detail: { element, pathLength } }));
  }

  _handleAction(action) {
    const index = ELEMENTS.indexOf(this.abilities.selected);
    switch (action) {
      case 'nextElement': this.selectElement(ELEMENTS[(index + 1) % ELEMENTS.length]); break;
      case 'prevElement': this.selectElement(ELEMENTS[(index - 1 + ELEMENTS.length) % ELEMENTS.length]); break;
      case 'toggleEditor': this.editor.toggle(); break;
      case 'clear': this.clearEffects(); this.hud.showToast('Effects cleared.'); break;
      case 'togglePause': this.paused = !this.paused; this.hud.showToast(this.paused ? 'Paused.' : 'Resumed.'); break;
      // These three were bound in InputManager and had no case here, so H, T
      // and M were advertised and inert.
      // The panel is React's; the key is the engine's. Forwarding rather than
      // toggling `hud.toggleHelp()`, which reached for markup React has never
      // rendered and so did nothing at all.
      case 'toggleHelp': window.dispatchEvent(new CustomEvent(TO_UI.HELP)); break;
      case 'togglePose': {
        const seated = this.character.togglePose?.();
        this.hud.showToast(seated ? 'The caster sits.' : 'The caster stands.');
        break;
      }
      case 'toggleMode': {
        this.rideNextStroke = !this.rideNextStroke;
        window.dispatchEvent(new CustomEvent(TO_UI.RIDE_STATUS, { detail: { active: this.rideNextStroke } }));
        this.hud.showToast(this.rideNextStroke ? 'Draw the path you want to ride.' : 'Back to casting.');
        break;
      }
      default: break;
    }
  }

  /**
   * @param {string} element
   * @param {{ announce?: boolean }} [options] `announce: false` for a selection
   *   the player did not make — the one at boot, which used to put a toast over
   *   the opening saying the stage had chosen the element it always starts on.
   */
  selectElement(element, { announce = true } = {}) {
    if (!element) return;
    this.abilities.select(element);
    // `HUD.setElement` used to do this. Its card loop was a no-op over an empty
    // map, but this toast was real, and cutting the method without moving the
    // line would have silently deleted a visible behaviour.
    if (announce) {
      this.hud.showToast(`${element === 'wind' ? 'Gale' : element[0].toUpperCase() + element.slice(1)} selected`);
    }
    window.dispatchEvent(new CustomEvent(TO_UI.SELECTED, { detail: { element: element === 'wind' ? 'air' : element } }));
  }

  clearEffects() {
    this.abilities.clear();
    this.particles.reset();
    this.decals.clear();
    this.bursts.clear();
    this.lights.reset();
    this.shake.reset();
    this.flash.reset();
    this.pathDrawer.trail.hide();
  }

  async load() {
    // Reported to both: the DOM loader still owns the words, and the sigil takes
    // the number and turns it into the only progress indicator that is also the
    // thing you are waiting for.
    const report = (ratio, message) => {
      this.loading.setProgress(ratio, message);
      this.intro.onProgress(ratio);
    };
    report(.05, 'Calling the caster…');
    this.assets.onProgress((ratio, url) => {
      const message = url.includes('.fbx') ? 'Preparing the caster…' : 'Lighting the ritual ground…';
      report(.05 + ratio * .48, message);
    });
    const characterLoad = this.character.load(this.assets);
    const hdrLoad = this.assets.loadHDR('/hdri/spruit_sunrise.hdr');
    const [, hdr] = await Promise.all([characterLoad, hdrLoad]);
    await this.environment.loadEnvironment(hdr);
    this.scene.add(this.character.root);
    this.walk = new WalkController(this.character, {
      scene: this.scene, particles: this.particles, lights: this.lights,
      decals: this.decals, bursts: this.bursts, shake: this.shake
    });
    this.caster = new CasterPerformance(this.character);
    // The default camera sits on the rig's +Z side, so facing +Z keeps the
    // caster's performance readable instead of presenting their back.
    this.character.setFacing(0);
    frame.uEnvMap.value = this.environment.equirect;

    report(.62, 'Warming the elements…');
    this.abilities.warm();
    report(.85, 'Setting the performance…');
    await this.renderer.gl.compileAsync(this.scene, this.camera);
    report(1, 'Ready');
    // The stage is genuinely playable here: assets are loaded, pools are warm
    // and shaders are compiled. Announcing readiness before `hide()` — which
    // schedules a 220ms timeout into a 0.7s fade — is what stops the interface
    // spending most of a second insisting the stage is still waking while the
    // loader dissolves over a live scene.
    window.dispatchEvent(new CustomEvent(TO_UI.READY, { detail: { app: this } }));
    this.intro.onStageReady();
    this.loading.hide();
    this.start();
  }

  start() {
    this.time.reset();
    const loop = () => { this._raf = requestAnimationFrame(loop); this.frame(); };
    this._raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this._raf); }

  frame() {
    const gl = this.renderer.gl;
    gl.info.reset();
    const raw = this.time.tick();
    this.quality.sample(raw);
    const dt = this.paused ? 0 : raw * settings.global.timeScale;
    this.elapsed += dt;
    frame.uTime.value = this.elapsed;
    frame.uDelta.value = dt;
    frame.uShaderIntensity.value = settings.global.shaderIntensity;
    frame.uGlobalGlow.value = settings.global.glow;
    frame.uCameraNear.value = this.camera.near;
    frame.uCameraFar.value = this.camera.far;

    this.intro.update(raw);
    this.renderer.syncSettings();
    this.environment.setFocus(this.stageAnchor.x, this.stageAnchor.z);
    this.environment.update();
    this.ground.update(this.elapsed);
    this.dust.update(this.elapsed, this.stageAnchor);
    this.sigil.update(this.elapsed);
    this.sigil.faceCamera(this.camera);
    this.pathDrawer.update(raw);
    this.abilities.update(dt);
    this.character.update(dt);
    this.walk?.update(dt);
    this.caster?.update(dt, this.walk?.active);
    // After the abilities have stepped, so what is tested is what was just
    // drawn, and before the particles are uploaded for the frame.
    this.rite.update(dt);
    this.particles.flush();
    this.decals.update(dt);
    this.bursts.update(dt);
    this.lights.update(dt);

    const focus = this.abilities.focus;
    if (focus) this.rig.lookAt(focus.position, MathUtils.clamp(1 - focus.u * .4, 0, 1));
    this.rig.setAnchor(this.stageAnchor.x, 0, this.stageAnchor.z);
    this.shake.update(raw);
    this.flash.update(raw);
    this.rig.update(raw);
    // The sun is static and the caster barely moves, so re-rendering a 4096²
    // map sixty times a second buys nothing. Refresh at 15Hz, and immediately
    // whenever something that casts a shadow has actually moved.
    this._shadowClock += raw;
    if (this._shadowClock >= 1 / 15 || this.walk?.active) {
      this._shadowClock = 0;
      gl.shadowMap.needsUpdate = true;
    }
    this.post.sync(this.elapsed, this.flash);
    this.post.render();
    // After the composer, straight to the frame buffer: during the opening the
    // grade is at zero gain, and anything inside it is multiplied to black —
    // including the thing that is supposed to be the only light in the room.
    this.sigil.render(this.renderer.gl, this.camera);

  }

  dispose() {
    this.stop();
    this.input.dispose();
    this.handInput.dispose();
    this.pathDrawer.dispose();
    this.intro.dispose();
    this.rite.dispose();
    this.abilities.dispose();
    this.caster?.dispose();
    this.walk?.dispose();
    this.character.dispose();
    this.particles.dispose();
    this.decals.dispose();
    this.bursts.dispose();
    this.lights.dispose();
    this.ground.dispose();
    this.dust.dispose();
    this.sigil.dispose();
    this.post.dispose();
    this.environment.dispose();
    this.hud.dispose();
    this.editor.dispose();
    this.rig.dispose();
    this.renderer.dispose();
    window.removeEventListener(TO_ENGINE.SELECT, this._onGrimoireSelect);
    window.removeEventListener(TO_ENGINE.PATCH, this._onGrimoirePatch);
    window.removeEventListener(TO_ENGINE.ATTUNE, this._onGrimoireAttune);
    window.removeEventListener(TO_ENGINE.STOP_HANDS, this._onGrimoireStopHands);
    window.removeEventListener(TO_ENGINE.CAST, this._onGrimoireCast);
    window.removeEventListener(TO_ENGINE.RIDE, this._onGrimoireRide);
    window.removeEventListener(TO_ENGINE.RITE, this._onGrimoireRite);
    window.removeEventListener(TO_ENGINE.CALM, this._onGrimoireCalm);
    window.removeEventListener(TO_ENGINE.SKIP_INTRO, this._onGrimoireSkipIntro);
  }
}
