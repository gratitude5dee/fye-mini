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

/** Owns the local stage, input sources, caster performance, and effects. */
export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.time = new Time();
    this.elapsed = 0;
    this.paused = false;
    this._raf = 0;
    this.rideNextStroke = false;

    this.renderer = new Renderer(canvas);
    this.rig = new CameraRig(canvas);
    this.camera = this.rig.camera;
    this.environment = new Environment(this.renderer, this.camera);
    this.scene = this.environment.scene;
    this.assets = new AssetLoader();

    this.ground = new Ground(this.environment);
    this.dust = new DustMotes();
    this.stageAnchor = new Vector3();
    this.scene.add(this.ground.mesh, this.dust.points);
    this.dust.setPixelRatio(this.renderer.gl.getPixelRatio());

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
      onAbilityImpact: () => this._onAbilityImpact()
    });

    this.character = new CharacterController(this.environment);
    this.walk = null;
    this.caster = null;

    this.input = new InputManager(canvas);
    this.handInput = new HandInput(this.input, {
      onElement: (element) => this.selectElement(element),
      onStatus: (message, state = 'notice') => {
        this.hud?.showToast(message);
        window.dispatchEvent(new CustomEvent('grimoire:input-status', { detail: { message, state } }));
      }
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

    settings.mode = 'casting';
    this._bindEvents();
    this._bindGrimoireEvents();
    this.selectElement('wind');
  }

  _bindEvents() {
    this.renderer.onResize((width, height, pixelRatio) => {
      this.rig.resize(width, height);
      this.post.setSize(width, height, pixelRatio);
      this.dust.setPixelRatio(pixelRatio);
    });

    this.input.on('draw:start', (pointer) => {
      this.caster?.setGesture('gather', { element: this.abilities.selected });
      this.pathDrawer.begin(pointer);
    });
    this.input.on('draw:move', (pointer) => {
      this.caster?.setGesture('aim', { element: this.abilities.selected });
      this.pathDrawer.move(pointer);
    });
    this.input.on('draw:end', () => {
      this.caster?.setGesture('recovery', { element: this.abilities.selected });
      this.pathDrawer.end();
    });
    this.input.on('element', (index) => this.selectElement(ELEMENTS[index]));
    this.input.on('action', (action) => this._handleAction(action));

    this.pathDrawer.on('cast', (curve, _points, _count, length) => {
      if (this.rideNextStroke && this.walk?.begin(curve)) {
        this.rideNextStroke = false;
        this.caster?.setGesture('recovery', { element: 'wind' });
        window.dispatchEvent(new CustomEvent('grimoire:ride-status', { detail: { active: false } }));
        this.hud.showToast('The caster rides the current.');
        return;
      }
      this.caster?.setGesture('release', { element: this.abilities.selected });
      this.abilities.cast(curve);
      this._recordCast(length);
    });

    this.hud.onSelect = (element) => this.selectElement(element);
  }

  _bindGrimoireEvents() {
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
    this._onGrimoireRide = () => {
      this.rideNextStroke = !this.rideNextStroke;
      window.dispatchEvent(new CustomEvent('grimoire:ride-status', { detail: { active: this.rideNextStroke } }));
      this.hud.showToast(this.rideNextStroke ? 'Draw a path for the air ride.' : 'Casting mode restored.');
    };
    window.addEventListener('grimoire:select', this._onGrimoireSelect);
    window.addEventListener('grimoire:patch', this._onGrimoirePatch);
    window.addEventListener('grimoire:attune', this._onGrimoireAttune);
    window.addEventListener('grimoire:stop-hands', this._onGrimoireStopHands);
    window.addEventListener('grimoire:cast', this._onGrimoireCast);
    window.addEventListener('grimoire:ride', this._onGrimoireRide);
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

  _onAbilityImpact() {
    this.caster?.setGesture('recovery', { element: this.abilities.selected });
  }

  _recordCast(pathLength) {
    const element = this.abilities.selected === 'wind' ? 'air' : this.abilities.selected;
    // Casts are ephemeral: only the browser's visual stage receives this event.
    window.dispatchEvent(new CustomEvent('grimoire:cast-complete', { detail: { element, pathLength } }));
  }

  _handleAction(action) {
    const index = ELEMENTS.indexOf(this.abilities.selected);
    switch (action) {
      case 'nextElement': this.selectElement(ELEMENTS[(index + 1) % ELEMENTS.length]); break;
      case 'prevElement': this.selectElement(ELEMENTS[(index - 1 + ELEMENTS.length) % ELEMENTS.length]); break;
      case 'toggleEditor': this.editor.toggle(); break;
      case 'clear': this.clearEffects(); this.hud.showToast('Effects cleared.'); break;
      case 'togglePause': this.paused = !this.paused; this.hud.showToast(this.paused ? 'Paused.' : 'Resumed.'); break;
      default: break;
    }
  }

  selectElement(element) {
    if (!element) return;
    this.abilities.select(element);
    this.hud.setElement(element);
    window.dispatchEvent(new CustomEvent('grimoire:selected', { detail: { element: element === 'wind' ? 'air' : element } }));
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
    this.loading.setProgress(.05, 'Calling the caster…');
    this.assets.onProgress((ratio, url) => {
      const message = url.includes('.fbx') ? 'Preparing the caster…' : 'Lighting the ritual ground…';
      this.loading.setProgress(.05 + ratio * .48, message);
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

    this.loading.setProgress(.62, 'Warming the elements…');
    this.abilities.warm();
    this.loading.setProgress(.85, 'Setting the performance…');
    await this.renderer.gl.compileAsync(this.scene, this.camera);
    this.loading.setProgress(1, 'Ready');
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
    const dt = this.paused ? 0 : raw * settings.global.timeScale;
    this.elapsed += dt;
    frame.uTime.value = this.elapsed;
    frame.uDelta.value = dt;
    frame.uShaderIntensity.value = settings.global.shaderIntensity;
    frame.uGlobalGlow.value = settings.global.glow;
    frame.uCameraNear.value = this.camera.near;
    frame.uCameraFar.value = this.camera.far;

    this.renderer.syncSettings();
    this.environment.setFocus(this.stageAnchor.x, this.stageAnchor.z);
    this.environment.update();
    this.ground.update(this.elapsed);
    this.dust.update(this.elapsed, this.stageAnchor);
    this.pathDrawer.update(raw);
    this.abilities.update(dt);
    this.character.update(dt);
    this.walk?.update(dt);
    this.caster?.update(dt, this.walk?.active);
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
    gl.shadowMap.needsUpdate = true;
    this.post.sync(this.elapsed, this.flash);
    this.post.render();
    this.hud.update(raw, () => ({
      particles: this.particles.countLive(this.elapsed), calls: gl.info.render.calls, abilities: this.abilities.active.length
    }));
  }

  dispose() {
    this.stop();
    this.input.dispose();
    this.handInput.dispose();
    this.pathDrawer.dispose();
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
    this.post.dispose();
    this.environment.dispose();
    this.editor.dispose();
    this.rig.dispose();
    this.renderer.dispose();
    window.removeEventListener('grimoire:select', this._onGrimoireSelect);
    window.removeEventListener('grimoire:patch', this._onGrimoirePatch);
    window.removeEventListener('grimoire:attune', this._onGrimoireAttune);
    window.removeEventListener('grimoire:stop-hands', this._onGrimoireStopHands);
    window.removeEventListener('grimoire:cast', this._onGrimoireCast);
    window.removeEventListener('grimoire:ride', this._onGrimoireRide);
  }
}
