import { Group, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { LAYER, setLayerRecursive } from '../core/Layers.js';
import { disposeObject } from '../utils/dispose.js';

const _down = new Vector3(0, -1, 0);
const _origin = new Vector3();
const _delta = new Vector3();

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

/** Render and collision bridge for one approved Marble world at a time. */
export class WorldManager {
  constructor({ renderer, scene }) {
    this.renderer = renderer;
    this.scene = scene;
    this.gltf = new GLTFLoader();
    this.raycaster = new Raycaster();
    this.raycaster.far = 200;
    this.spark = new SparkRenderer({
      renderer: renderer.gl,
      sortRadial: true,
      lodSplatScale: 1,
      enableLod: true
    });
    this.spark.name = 'SparkWorldRenderer';
    this.spark.layers.set(LAYER.SPLAT);
    scene.add(this.spark);
    this.group = null;
    this.splat = null;
    this.collider = null;
    this.entry = null;
    this.loading = false;
    this._serial = 0;
  }

  get active() { return Boolean(this.entry); }

  _splatUrl(entry) {
    const constrained = typeof navigator !== 'undefined' &&
      ((navigator.deviceMemory ?? 8) <= 4 ||
        (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches));
    return constrained ? entry.splat100kUrl : (entry.splat500kUrl ?? entry.splat100kUrl);
  }

  async load(entry) {
    const serial = ++this._serial;
    this.loading = true;
    const group = new Group();
    group.name = `World:${entry.slug}`;
    group.rotation.x = Math.PI;
    group.scale.setScalar(number(entry.metricScaleFactor, 1));
    group.position.y = -number(entry.groundPlaneOffset, 0);

    try {
      const splat = new SplatMesh({
        url: this._splatUrl(entry),
        lod: true,
        editable: false,
        raycastable: false
      });
      splat.name = `Splats:${entry.slug}`;
      splat.layers.set(LAYER.SPLAT);
      group.add(splat);

      const gltf = await this.gltf.loadAsync(entry.colliderUrl);
      const collider = gltf.scene;
      const calibration = entry.colliderTransform ?? {};
      collider.position.set(number(calibration.x), number(calibration.y), number(calibration.z));
      collider.rotation.set(number(calibration.rx), number(calibration.ry), number(calibration.rz));
      collider.scale.set(number(calibration.scale, 1), number(calibration.scale, 1), number(calibration.scale, 1));
      setLayerRecursive(collider, LAYER.COLLIDER);
      collider.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = false;
        node.receiveShadow = false;
      });
      group.add(collider);
      await splat.initialized;

      if (serial !== this._serial) {
        splat.dispose?.();
        disposeObject(group);
        return false;
      }

      // Replacing a successful world must not invalidate this very load.  An
      // explicit user unload does invalidate in-flight work; this internal
      // disposal merely makes room for the next approved world.
      this._disposeCurrent();
      this.group = group;
      this.splat = splat;
      this.collider = collider;
      this.entry = entry;
      this.scene.add(group);
      return true;
    } catch (error) {
      if (serial === this._serial) {
        this.unload();
        console.warn('[WorldManager] world failed to load', entry.slug, error);
      }
      splatDispose(group);
      throw error;
    } finally {
      if (serial === this._serial) this.loading = false;
    }
  }

  _disposeCurrent() {
    if (this.group) this.scene.remove(this.group);
    this.splat?.dispose?.();
    if (this.group) disposeObject(this.group);
    this.group = null;
    this.splat = null;
    this.collider = null;
    this.entry = null;
  }

  unload() {
    this._serial++;
    this._disposeCurrent();
    this.loading = false;
  }

  /** Ground hit beneath a point. The local stage remains a level y=0 floor. */
  groundAt(point, out) {
    if (!this.collider) {
      out.set(point.x, 0, point.z);
      return true;
    }
    _origin.set(point.x, point.y + 40, point.z);
    this.raycaster.set(_origin, _down);
    const hit = this.raycaster.intersectObject(this.collider, true)[0];
    if (!hit) return false;
    out.copy(hit.point);
    return true;
  }

  /** Reject a step that intersects a wall at waist height. */
  canTraverse(from, to) {
    if (!this.collider) return true;
    _delta.copy(to).sub(from).setY(0);
    const distance = _delta.length();
    if (distance < 1e-4) return true;
    _origin.copy(from).setY(from.y + 0.9);
    this.raycaster.set(_origin, _delta.multiplyScalar(1 / distance));
    this.raycaster.far = distance + 0.18;
    const blocked = this.raycaster.intersectObject(this.collider, true).some((hit) => hit.distance < distance + 0.12);
    this.raycaster.far = 200;
    return !blocked;
  }

  projectRay(ray, out) {
    if (!this.collider) return null;
    this.raycaster.ray.copy(ray);
    const hit = this.raycaster.intersectObject(this.collider, true)[0];
    if (!hit) return null;
    out.copy(hit.point);
    return out;
  }

  isWithinRitualArea(position) {
    if (!this.entry?.ritualAnchor) return true;
    const anchor = this.entry.ritualAnchor;
    const dx = position.x - number(anchor.x);
    const dz = position.z - number(anchor.z);
    return dx * dx + dz * dz <= Math.pow(number(anchor.radius, 12), 2);
  }

  dispose() {
    this.unload();
    this.scene.remove(this.spark);
    this.spark.dispose?.();
  }
}

function splatDispose(group) {
  group.traverse((node) => node.dispose?.());
  disposeObject(group);
}
