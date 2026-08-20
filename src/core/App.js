import { CatmullRomCurve3, Vector3, MathUtils } from 'three';

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

import { HUD, LoadingScreen } from '../ui/HUD.js';
import { Editor } from '../ui/Editor.js';

import { settings, ELEMENTS, applySettings } from '../config/settings.js';
import {
  RANGES,
  SPELLWRIGHT_COLOR_PATHS,
  enginePath,
  validateSpellSettings
} from '../config/spell-contract.js';

/**
 * Application root: owns every subsystem and the frame loop.
 *
 * The wiring is deliberately one-directional — App builds the systems, hands
 * each ability a context object of the shared services, and then does nothing
 * but order the per-frame updates. No subsystem reaches back into App.
 */
export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.time = new Time();
    this.elapsed = 0;
    this.paused = false;
    this._raf = 0;
    // A bind replay owns the stage only until its first fully composited
    // impact frame has been captured. Keeping this explicit makes it
    // impossible for an ambient or manual cast to leak into that portrait.
    this._portraitCapture = null;
    // The opening page is allowed one quiet, non-recorded house-spell loop so
    // the stage feels inhabited before a visitor acts. Any intentional input
    // retires it permanently; it must never pollute a visitor's cast history
    // or a deterministic bind replay.
    this._arrivalCastTimer = 0;
    this._arrivalRetired = false;

    /* ---- core ---- */
    this.renderer = new Renderer(canvas);
    this.rig = new CameraRig(canvas);
    this.camera = this.rig.camera;

    this.environment = new Environment(this.renderer, this.camera);
    this.scene = this.environment.scene;

    /* ---- world ---- */
    this.ground = new Ground(this.environment);
    this.dust = new DustMotes();
    this.stageAnchor = new Vector3();

    this.scene.add(this.ground.mesh, this.dust.points);
    this.dust.setPixelRatio(this.renderer.gl.getPixelRatio());

    /* ---- shared VFX services ---- */
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

    /* ---- input ---- */
    this.input = new InputManager(canvas);
    this.handInput = new HandInput(this.input, {
      onElement: (element) => this.selectElement(element),
      onStatus: (message) => {
        this.hud?.showToast(message);
        window.dispatchEvent(new CustomEvent('grimoire:input-status', { detail: { message } }));
      }
    });
    this.pathDrawer = new PathDrawer(this.camera);
    this.scene.add(this.pathDrawer.object3D);

    /* ---- post ---- */
    this.post = new PostProcessing(this.renderer, this.scene, this.camera);

    /* ---- UI ---- */
    this.loading = new LoadingScreen();
    this.hud = new HUD(document.getElementById('hud'));
    this.editor = new Editor({
      onClear: () => this.clearEffects(),
      onToast: (message) => this.hud.showToast(message)
    });

    this._bindEvents();
    this._bindGrimoireEvents();
    settings.mode = 'cast';
    this.selectElement(ELEMENTS[0]);

    this._focusPoint = new Vector3();
  }

  /* ------------------------------------------------------------------ */

  _bindEvents() {
    this.renderer.onResize((width, height, pixelRatio) => {
      this.rig.resize(width, height);
      this.post.setSize(width, height, pixelRatio);
      this.dust.setPixelRatio(pixelRatio);
    });

    this.input.on('draw:start', (pointer) => {
      if (this._portraitCapture) return;
      this._retireArrivalSpellLoop();
      this.pathDrawer.begin(pointer);
    });
    this.input.on('draw:move', (pointer) => this.pathDrawer.move(pointer));
    this.input.on('draw:end', () => this.pathDrawer.end());

    this.input.on('element', (index) => {
      this._retireArrivalSpellLoop();
      this.selectElement(ELEMENTS[index]);
    });
    this.input.on('action', (action) => this._handleAction(action));

    // Every finished stroke becomes a spell. The Grimoire is first-person
    // magic, so the stage never switches into the foundation's walk mode.
    this.pathDrawer.on('cast', (curve, _points, _count, length) => {
      if (this._portraitCapture) return;
      this.abilities.cast(curve);
      this._recordCast(length);
    });

    this.hud.onSelect = (element) => {
      this._retireArrivalSpellLoop();
      this.selectElement(element);
    };
  }

  _bindGrimoireEvents() {
    this._onGrimoireSelect = (event) => {
      if (this._portraitCapture) return;
      this._retireArrivalSpellLoop();
      const requested = event.detail?.element;
      this.selectElement(requested === 'air' ? 'wind' : requested);
    };
    this._onGrimoirePatch = (event) => {
      if (this._portraitCapture) return;
      this._retireArrivalSpellLoop();
      const patch = event.detail?.patch ?? event.detail;
      if (!patch || typeof patch !== 'object') return;
      this._applyFlatPatch(patch);
      this.editor.refresh();
      this.hud.showToast('The spell shifts in your hand.');
    };
    this._onGrimoireLoad = (event) => {
      if (this._portraitCapture) return;
      this._retireArrivalSpellLoop();
      const spell = event.detail?.spell;
      if (!spell?.settings) return;
      const snapshot = structuredClone(spell.settings);
      // The render foundation names this block `wind`; the public document model
      // calls it `air`. Translate only at the boundary and keep live bindings.
      if (snapshot.air && !snapshot.wind) {
        snapshot.wind = snapshot.air;
        delete snapshot.air;
      }
      applySettings(snapshot);
      this.activeSpell = spell;
      this.editor.refresh();
      this.hud.showToast(`${spell.name} is in your hand.`);
    };
    this._onGrimoireDials = () => {
      if (!this._portraitCapture) {
        this._retireArrivalSpellLoop();
        this.editor.toggle();
      }
    };
    this._onGrimoireAttune = () => {
      if (!this._portraitCapture) {
        this._retireArrivalSpellLoop();
        void this.handInput.start();
      }
    };
    this._onGrimoireStopHands = () => this.handInput.stop();
    this._onGrimoireOnboardingEarth = () => {
      if (this._portraitCapture) return;
      this._retireArrivalSpellLoop();
      this.abilities.select('earth');
      this.hud.setElement('earth');
      const path = new CatmullRomCurve3([
        new Vector3(-2.2, 0.02, 1.15), new Vector3(-.82, 0.02, .46),
        new Vector3(.72, 0.02, -.2), new Vector3(2.05, 0.02, .36)
      ]);
      this.abilities.cast(path, 'earth');
      this._recordCast(path.getLength());
    };
    this._onGrimoirePortrait = (event) => {
      const requestId = event.detail?.requestId;
      if (typeof requestId !== 'string' || !requestId) return;
      if (this._portraitCapture) {
        this._failPortraitCapture(requestId, 'A portrait replay is already in progress.');
        return;
      }

      this._retireArrivalSpellLoop();

      const publicElement = event.detail?.element;
      const element = publicElement === 'air' ? 'wind' : publicElement;
      if (!ELEMENTS.includes(element)) {
        this._failPortraitCapture(requestId, 'The portrait did not name an element.');
        return;
      }

      // The UI sends the exact snapshot it will later bind. Validate it at the
      // renderer boundary, then keep reapplying it during the short replay so
      // a live dial can never make the portrait and persisted page disagree.
      const checked = validateSpellSettings(event.detail?.settings);
      if (!checked.ok) {
        this._failPortraitCapture(requestId, 'The portrait settings were incomplete.');
        return;
      }
      const snapshot = structuredClone(checked.value);
      snapshot.wind = snapshot.air;
      delete snapshot.air;

      const resumePaused = this.paused;
      const inputEnabled = this.input.enabled;
      this.paused = false;
      this.input.enabled = false;
      this.clearEffects({ preservePortrait: true });
      applySettings(snapshot);
      this.abilities.select(element);
      this.hud.setElement(element);

      const path = new CatmullRomCurve3([
        new Vector3(-2.4, 0.02, 1.2), new Vector3(-.7, 0.02, .1),
        new Vector3(.85, 0.02, -.25), new Vector3(2.1, 0.02, .5)
      ]);
      const ability = this.abilities.cast(path, element);
      if (!ability) {
        this.paused = resumePaused;
        this.input.enabled = inputEnabled;
        this._failPortraitCapture(requestId, 'The portrait replay could not begin.');
        return;
      }
      this._portraitCapture = { ability, requestId, snapshot, resumePaused, inputEnabled, impactReached: false };
    };

    window.addEventListener('grimoire:select', this._onGrimoireSelect);
    window.addEventListener('grimoire:patch', this._onGrimoirePatch);
    window.addEventListener('grimoire:load-spell', this._onGrimoireLoad);
    window.addEventListener('grimoire:toggle-dials', this._onGrimoireDials);
    window.addEventListener('grimoire:attune', this._onGrimoireAttune);
    window.addEventListener('grimoire:stop-hands', this._onGrimoireStopHands);
    window.addEventListener('grimoire:onboarding-earth', this._onGrimoireOnboardingEarth);
    window.addEventListener('grimoire:portrait', this._onGrimoirePortrait);
  }

  _applyFlatPatch(patch) {
    for (const [path, value] of Object.entries(patch)) {
      if (typeof path !== 'string' || path.length > 120) continue;
      const range = RANGES[path];
      const isSpellwrightColor = SPELLWRIGHT_COLOR_PATHS.includes(path);
      if (!range && !isSpellwrightColor) continue;
      const parts = enginePath(path).split('.');
      let target = settings;
      for (let index = 0; index < parts.length - 1; index++) {
        if (!Object.prototype.hasOwnProperty.call(target, parts[index])) {
          target = null;
          break;
        }
        target = target[parts[index]];
      }
      const leaf = parts.at(-1);
      if (!target || !leaf || !Object.prototype.hasOwnProperty.call(target, leaf)) continue;
      const current = target[leaf];
      if (typeof current === 'number' && typeof value === 'number' && Number.isFinite(value) && range) target[leaf] = MathUtils.clamp(value, range.min, range.max);
      if (isSpellwrightColor && typeof current === 'string' && typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) target[leaf] = value;
      if (typeof current === 'boolean' && typeof value === 'boolean') target[leaf] = value;
    }
  }

  _onAbilityImpact(ability) {
    if (!this._portraitCapture || this._portraitCapture.ability !== ability) return;
    // The post stack has not rendered yet. Mark the frame now, then notify the
    // binding UI immediately after it has composited this impact to the canvas.
    this._portraitCapture.impactReached = true;
  }

  _flushPortraitCapture() {
    const capture = this._portraitCapture;
    if (!capture?.impactReached) return;
    this._portraitCapture = null;
    this.paused = capture.resumePaused;
    this.input.enabled = capture.inputEnabled;
    window.dispatchEvent(new CustomEvent('grimoire:portrait-impact', {
      detail: { requestId: capture.requestId }
    }));
  }

  _failPortraitCapture(requestId, message) {
    window.dispatchEvent(new CustomEvent('grimoire:portrait-failed', {
      detail: { requestId, message }
    }));
  }

  _cancelPortraitCapture(message = 'The portrait replay was interrupted.') {
    const capture = this._portraitCapture;
    if (!capture) return;
    this._portraitCapture = null;
    this.paused = capture.resumePaused;
    this.input.enabled = capture.inputEnabled;
    this._failPortraitCapture(capture.requestId, message);
  }

  _recordCast(pathLength) {
    const element = this.abilities.selected === 'wind' ? 'air' : this.abilities.selected;
    const activeSpell = this.activeSpell?.element === element ? this.activeSpell : null;
    if (!activeSpell) this.activeSpell = null;
    window.dispatchEvent(new CustomEvent('grimoire:cast', { detail: { element, pathLength, spellId: activeSpell?._id } }));
    const speed = Math.max(0.1, (settings[this.abilities.selected]?.speed ?? 8) * settings.global.speed);
    void fetch('/api/casts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventId: crypto.randomUUID(), ...(activeSpell?._id ? { spellId: activeSpell._id } : {}), element, pathLenM: pathLength, travelMs: Math.round(pathLength / speed * 1000), client: { input: this.handInput.active ? 'hands' : this.input.lastPointerType, deviceClass: window.innerWidth < 700 ? 'mobile' : 'desktop' } })
    }).catch(() => undefined);
  }

  _handleAction(action) {
    if (this._portraitCapture) return;
    this._retireArrivalSpellLoop();
    const index = ELEMENTS.indexOf(this.abilities.selected);
    switch (action) {
      case 'nextElement':
        this.selectElement(ELEMENTS[(index + 1) % ELEMENTS.length]);
        break;
      case 'prevElement':
        this.selectElement(ELEMENTS[(index - 1 + ELEMENTS.length) % ELEMENTS.length]);
        break;
      case 'toggleHelp':
        this.hud.toggleHelp();
        break;
      case 'toggleEditor':
        this.editor.toggle();
        break;
      case 'clear':
        this.clearEffects();
        this.hud.showToast('Effects cleared');
        break;
      case 'togglePause':
        this.paused = !this.paused;
        this.hud.showToast(this.paused ? 'Paused' : 'Resumed');
        break;
      case 'toggleMode':
      case 'togglePose':
        break;
      default:
        break;
    }
  }

  selectElement(element, force = false) {
    if (this._portraitCapture && !force) return;
    if (!element) return;
    this.abilities.select(element);
    const publicElement = element === 'wind' ? 'air' : element;
    if (this.activeSpell?.element && this.activeSpell.element !== publicElement) this.activeSpell = null;
    this.hud.setElement(element);
    window.dispatchEvent(new CustomEvent('grimoire:selected', { detail: { element: publicElement } }));
  }

  clearEffects({ preservePortrait = false } = {}) {
    if (!preservePortrait) {
      this._cancelPortraitCapture();
      this._retireArrivalSpellLoop();
    }
    this.abilities.clear();
    this.particles.reset();
    this.decals.clear();
    this.bursts.clear();
    this.lights.reset();
    this.shake.reset();
    this.flash.reset();
    this.pathDrawer.trail.hide();
  }

  /* ------------------------------------------------------------------ */

  /** Compose the procedural stage, warm shaders, then start the loop. */
  async load() {
    this.loading.setProgress(0.05, 'Composing the stage…');
    await this.environment.loadProceduralEnvironment();
    frame.uEnvMap.value = this.environment.equirect;

    this.loading.setProgress(0.56, 'Warming the elements…');
    this.abilities.warm();
    this.loading.setProgress(0.85, 'Compiling shaders…');
    // Compile everything up front so the first cast never stutters.
    await this.renderer.gl.compileAsync(this.scene, this.camera);

    this.loading.setProgress(1, 'Ready');
    this.loading.hide();

    this.start();
  }

  start() {
    this.time.reset();
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this.frame();
    };
    this._raf = requestAnimationFrame(loop);
    this._startArrivalSpellLoop();
  }

  stop() {
    cancelAnimationFrame(this._raf);
    this._retireArrivalSpellLoop();
  }

  _startArrivalSpellLoop() {
    if (this._arrivalRetired || this._arrivalCastTimer) return;
    const schedule = (delay) => {
      this._arrivalCastTimer = window.setTimeout(() => {
        this._arrivalCastTimer = 0;
        if (this._arrivalRetired) return;
        // Keep the welcome effect unobtrusive, and never write it to the
        // cast API. This is presentation, not a visitor action.
        if (!document.hidden && !this._portraitCapture && this.abilities.active.length < 3) {
          const path = new CatmullRomCurve3([
            new Vector3(-3.5, 0.02, 1.85), new Vector3(-1.55, 0.02, .8),
            new Vector3(.25, 0.02, -.32), new Vector3(2.55, 0.02, .42)
          ]);
          this.abilities.cast(path, 'fire');
        }
        if (!this._arrivalRetired) schedule(13_000);
      }, delay);
    };
    schedule(900);
  }

  _retireArrivalSpellLoop() {
    this._arrivalRetired = true;
    if (this._arrivalCastTimer) window.clearTimeout(this._arrivalCastTimer);
    this._arrivalCastTimer = 0;
  }

  /* ------------------------------------------------------------------ */

  frame() {
    const gl = this.renderer.gl;
    gl.info.reset();

    // The capture state owns a validated copy of the settings tree. Apply it
    // before every replay frame so the portrait is a faithful image of the
    // snapshot that will be stored in the spell document.
    if (this._portraitCapture) applySettings(this._portraitCapture.snapshot);

    const raw = this.time.tick();
    const dt = this.paused ? 0 : raw * settings.global.timeScale;
    this.elapsed += dt;

    /* ---- shared uniforms ---- */
    frame.uTime.value = this.elapsed;
    frame.uDelta.value = dt;
    frame.uShaderIntensity.value = settings.global.shaderIntensity;
    frame.uGlobalGlow.value = settings.global.glow;
    frame.uCameraNear.value = this.camera.near;
    frame.uCameraFar.value = this.camera.far;

    /* ---- simulation ---- */
    this.renderer.syncSettings();
    this.environment.setFocus(this.stageAnchor.x, this.stageAnchor.z);
    this.environment.update();

    this.ground.update(this.elapsed);
    this.dust.update(this.elapsed, this.stageAnchor);

    this.pathDrawer.update(raw); // the preview keeps animating while paused
    this.abilities.update(dt);
    this.particles.flush();
    this.decals.update(dt);
    this.bursts.update(dt);
    this.lights.update(dt);

    /* ---- camera ---- */
    const focus = this.abilities.focus;
    if (focus) this.rig.lookAt(focus.position, MathUtils.clamp(1 - focus.u * 0.4, 0, 1));
    this.rig.setAnchor(this.stageAnchor.x, 0, this.stageAnchor.z);
    this.shake.update(raw);
    this.flash.update(raw);
    this.rig.update(raw);

    /* ---- render ---- */
    // Exactly one cascade shadow update per frame (see Renderer).
    gl.shadowMap.needsUpdate = true;
    this.post.sync(this.elapsed, this.flash);
    this.post.render();
    this._flushPortraitCapture();

    this.hud.update(raw, () => ({
      particles: this.particles.countLive(this.elapsed),
      calls: gl.info.render.calls,
      abilities: this.abilities.active.length
    }));
  }

  /* ------------------------------------------------------------------ */

  dispose() {
    this.stop();
    this._cancelPortraitCapture('The stage closed before its portrait was captured.');
    this.input.dispose();
    this.handInput.dispose();
    this.pathDrawer.dispose();
    this.abilities.dispose();
    this.particles.dispose();
    this.decals.dispose();
    this.bursts.dispose();
    this.lights.dispose();
    this.ground.dispose();
    this.dust.dispose();
    this.post.dispose();
    this.environment.dispose();
    this.editor.dispose();
    this.rig.dispose();
    this.renderer.dispose();
    window.removeEventListener('grimoire:select', this._onGrimoireSelect);
    window.removeEventListener('grimoire:patch', this._onGrimoirePatch);
    window.removeEventListener('grimoire:load-spell', this._onGrimoireLoad);
    window.removeEventListener('grimoire:toggle-dials', this._onGrimoireDials);
    window.removeEventListener('grimoire:attune', this._onGrimoireAttune);
    window.removeEventListener('grimoire:stop-hands', this._onGrimoireStopHands);
    window.removeEventListener('grimoire:onboarding-earth', this._onGrimoireOnboardingEarth);
    window.removeEventListener('grimoire:portrait', this._onGrimoirePortrait);
  }
}
