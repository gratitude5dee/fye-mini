import { Vector2 } from 'three';

const INSET = 0.15;
const PINCH_DOWN = 0.32;
const PINCH_UP = 0.48;
const DROPOUT_GRACE_MS = 120;
const POSE_HOLD_MS = 450;
const DOCK_DWELL_MS = 400;
const ONE_EURO = { minCutoff: 1.2, beta: 0.02, dCutoff: 1.0 };
const HAND_CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * A client-only MediaPipe source that speaks the same draw event vocabulary as
 * InputManager. The stage never receives frames: it only receives landmark
 * coordinates already calculated in this browser tab.
 */
export class HandInput {
  constructor(input, { onElement, onStatus } = {}) {
    this.input = input;
    this.onElement = onElement;
    this.onStatus = onStatus;
    this.pointer = new Vector2();
    this.filtered = new Vector2();
    this.active = false;
    this.isDrawing = false;
    this.lastHandAt = 0;
    this.lastFrameAt = 0;
    this.frameCount = 0;
    this.pose = null;
    this.poseStartedAt = 0;
    this.poseTriggered = false;
    this.dockElement = null;
    this.dockStartedAt = 0;
    this.dockTriggered = false;
    this._raf = 0;
    this._stream = null;
    this._landmarker = null;
    this._video = null;
    this._canvas = null;
    this._context = null;
    this._filter = null;
    this._delegate = null;
    // Starting a camera and compiling the tracker are both asynchronous. Keep
    // one owner for that work so a double-click cannot acquire two streams,
    // and make a pending start cancellable when the visitor skips the ritual.
    this._startPromise = null;
    this._startAttempt = 0;
    this._onElementAccent = (event) => this._setAccent(event.detail?.element);
    window.addEventListener('grimoire:selected', this._onElementAccent);
  }

  async start() {
    if (this.active || this._startPromise) return this._startPromise;
    const attempt = ++this._startAttempt;
    this._startPromise = this._start(attempt);
    try {
      await this._startPromise;
    } finally {
      if (attempt === this._startAttempt) this._startPromise = null;
    }
  }

  async _start(attempt) {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.onStatus?.('Camera input is not available here. Pointer casting is ready.', 'unavailable');
      return;
    }

    try {
      this._createMirror();
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      if (attempt !== this._startAttempt) {
        this._stream.getTracks().forEach((track) => track.stop());
        this._stream = null;
        return;
      }
      this._video.srcObject = this._stream;
      await this._video.play();
      if (attempt !== this._startAttempt) return;

      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm');
      const options = {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
        },
        runningMode: 'VIDEO',
        numHands: 1
      };
      try {
        this._landmarker = await HandLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { ...options.baseOptions, delegate: 'GPU' }
        });
        this._delegate = 'GPU';
      } catch (gpuError) {
        // GPU acceleration is preferable, but a browser with an unavailable
        // WebGL delegate can still track hands accurately on the CPU.
        console.warn('[HandInput] GPU tracker unavailable; retrying on CPU', gpuError);
        if (attempt !== this._startAttempt) return;
        this._landmarker = await HandLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { ...options.baseOptions, delegate: 'CPU' }
        });
        this._delegate = 'CPU';
      }
      if (attempt !== this._startAttempt) {
        this._landmarker?.close?.();
        this._landmarker = null;
        return;
      }
      this.active = true;
      this.lastFrameAt = performance.now();
      this._loop();
      this.onStatus?.(`Hand tracking is ready (${this._delegate}). Video stays in this browser.`, 'ready');
    } catch (error) {
      if (attempt !== this._startAttempt) return;
      console.warn('[HandInput] camera or tracker unavailable', error);
      this.stop();
      this.onStatus?.('Camera permission or hand tracking was unavailable. Pointer casting is ready.', 'fallback');
    }
  }

  _createMirror() {
    if (this._video) return;
    const mirror = document.createElement('div');
    mirror.className = 'hand-mirror';
    mirror.innerHTML = '<video muted playsinline></video><canvas aria-hidden="true"></canvas><i aria-hidden="true"></i><span>Seeking your hand…</span>';
    document.body.append(mirror);
    this._video = mirror.querySelector('video');
    this._canvas = mirror.querySelector('canvas');
    this._context = this._canvas.getContext('2d');
    this._label = mirror.querySelector('span');
    this._ring = mirror.querySelector('i');
    this._mirror = mirror;
    this._setAccent('air');
  }

  _setAccent(element) {
    const colors = { fire: '#ff6a3c', water: '#3fb8c9', earth: '#a08a63', air: '#bfe8df', wind: '#bfe8df' };
    this._mirror?.style.setProperty('--hand-accent', colors[element] ?? colors.air);
  }

  _smoothPoint(next, now) {
    const alpha = (cutoff, delta) => {
      const tau = 1 / (2 * Math.PI * cutoff);
      return 1 / (1 + tau / delta);
    };
    if (!this._filter) {
      this._filter = { raw: next.clone(), value: next.clone(), derivative: new Vector2(), at: now };
      return next.clone();
    }
    const delta = clamp((now - this._filter.at) / 1000, 1 / 240, 0.1);
    const derivative = next.clone().sub(this._filter.raw).multiplyScalar(1 / delta);
    this._filter.derivative.lerp(derivative, alpha(ONE_EURO.dCutoff, delta));
    const cutoff = ONE_EURO.minCutoff + ONE_EURO.beta * this._filter.derivative.length();
    this._filter.value.lerp(next, alpha(cutoff, delta));
    this._filter.raw.copy(next);
    this._filter.at = now;
    return this._filter.value;
  }

  _loop = () => {
    if (!this.active || !this._landmarker || !this._video) return;
    const now = performance.now();
    let result;
    try {
      result = this._landmarker.detectForVideo(this._video, now);
    } catch (error) {
      console.warn('[HandInput] tracker frame failed', error);
    }
    this.frameCount++;
    if (result?.landmarks?.[0]) this._process(result.landmarks[0], now);
    else this._handleDropout(now);
    this._drawMirror(result?.landmarks?.[0]);

    // If the tracker cannot keep a usable cadence, return control to mouse
    // input instead of making a gesture feel sticky or late.
    if (now - this.lastFrameAt >= 3000) {
      const fps = this.frameCount / ((now - this.lastFrameAt) / 1000);
      this.lastFrameAt = now;
      this.frameCount = 0;
      if (fps < 15) {
        this.onStatus?.('Tracking slowed, so pointer casting is ready.', 'fallback');
        this.stop();
        return;
      }
    }
    this._raf = requestAnimationFrame(this._loop);
  };

  _process(landmarks, now) {
    this.lastHandAt = now;
    this._label.textContent = 'Hand found';
    this._mirror.classList.add('is-tracking');

    const rawX = 1 - landmarks[8].x;
    const rawY = landmarks[8].y;
    this.pointer.set(
      clamp((rawX - INSET) / (1 - INSET * 2), 0, 1) * 2 - 1,
      -(clamp((rawY - INSET) / (1 - INSET * 2), 0, 1) * 2 - 1)
    );

    // One-Euro filtering gives a steady idle cursor without making a fast
    // fingertip feel delayed. Values match the documented starting tune.
    this.filtered.copy(this._smoothPoint(this.pointer, now));

    const handScale = Math.max(.0001, distance(landmarks[0], landmarks[9]));
    const pinchRatio = distance(landmarks[4], landmarks[8]) / handScale;
    if (!this.isDrawing && pinchRatio < PINCH_DOWN) {
      this.isDrawing = true;
      this.input.emit('draw:start', this.filtered);
    } else if (this.isDrawing && pinchRatio > PINCH_UP) {
      this.isDrawing = false;
      this.input.emit('draw:end', this.filtered);
    }
    if (this.isDrawing) this.input.emit('draw:move', this.filtered);

    if (!this.isDrawing) {
      this._trackPose(landmarks, now);
      this._trackDock(rawX, rawY, now);
    }
    else this._resetPose();
  }

  _handleDropout(now) {
    this._mirror?.classList.remove('is-tracking');
    if (this._label) this._label.textContent = 'Seeking your hand…';
    this._resetPose();
    if (this.isDrawing && now - this.lastHandAt > DROPOUT_GRACE_MS) {
      this.isDrawing = false;
      this.input.emit('draw:end', this.filtered);
    }
  }

  _trackPose(landmarks, now) {
    const isExtended = (tip, pip) => distance(landmarks[tip], landmarks[0]) > distance(landmarks[pip], landmarks[0]);
    const fingers = {
      thumb: isExtended(4, 3), index: isExtended(8, 6), middle: isExtended(12, 10), ring: isExtended(16, 14), pinky: isExtended(20, 18)
    };
    const four = [fingers.index, fingers.middle, fingers.ring, fingers.pinky];
    let next = null;
    // A closed fist is four fingers curled AND the thumb in. Without the thumb
    // term a thumbs-up reads as a fist and silently selects stone.
    if (!four.some(Boolean) && !fingers.thumb) next = 'earth';
    else if (fingers.thumb && four.every(Boolean)) next = 'wind';
    else if (fingers.index && fingers.middle && !fingers.ring && !fingers.pinky) next = 'water';
    else if (fingers.index && fingers.pinky && !fingers.middle && !fingers.ring) next = 'fire';

    if (next !== this.pose) {
      this.pose = next;
      this.poseStartedAt = now;
      this.poseTriggered = false;
    }
    if (next && this._ring) {
      this._ring.style.setProperty('--hold', `${Math.min(1, (now - this.poseStartedAt) / POSE_HOLD_MS)}`);
      this._mirror?.classList.add('is-pose');
    } else {
      this._mirror?.classList.remove('is-pose');
    }
    if (next && !this.poseTriggered && now - this.poseStartedAt >= POSE_HOLD_MS) {
      this.poseTriggered = true;
      this.onElement?.(next);
      this.onStatus?.(`${next === 'wind' ? 'Gale' : next[0].toUpperCase() + next.slice(1)} answers your pose.`, 'tracking');
    }
  }

  _trackDock(rawX, rawY, now) {
    const target = document.elementFromPoint(rawX * window.innerWidth, rawY * window.innerHeight)?.closest?.('[data-element]');
    const next = target?.dataset?.element ?? null;
    if (next !== this.dockElement) {
      this.dockElement = next;
      this.dockStartedAt = now;
      this.dockTriggered = false;
    }
    if (next && !this.dockTriggered && now - this.dockStartedAt >= DOCK_DWELL_MS) {
      this.dockTriggered = true;
      this.onElement?.(next === 'air' ? 'wind' : next);
      this.onStatus?.(`${next[0].toUpperCase() + next.slice(1)} rests in your hand.`, 'tracking');
    }
  }

  _resetPose() {
    this.pose = null;
    this.poseStartedAt = 0;
    this.poseTriggered = false;
    this.dockElement = null;
    this.dockStartedAt = 0;
    this.dockTriggered = false;
    this._mirror?.classList.remove('is-pose');
  }

  _drawMirror(landmarks) {
    if (!this._canvas || !this._context || !this._video) return;
    const width = this._video.videoWidth || 320;
    const height = this._video.videoHeight || 240;
    if (this._canvas.width !== width) {
      this._canvas.width = width;
      this._canvas.height = height;
    }
    const ctx = this._context;
    ctx.clearRect(0, 0, width, height);
    if (!landmarks) return;
    ctx.strokeStyle = getComputedStyle(this._mirror).getPropertyValue('--hand-accent') || '#bfe8df';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    for (const [from, to] of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo((1 - landmarks[from].x) * width, landmarks[from].y * height);
      ctx.lineTo((1 - landmarks[to].x) * width, landmarks[to].y * height);
      ctx.stroke();
    }
    ctx.fillStyle = ctx.strokeStyle;
    for (const point of landmarks) {
      ctx.beginPath();
      ctx.arc((1 - point.x) * width, point.y * height, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  stop() {
    // Invalidate a pending getUserMedia / dynamic-import sequence before
    // tearing down current resources. A late permission result then closes its
    // own stream instead of resurrecting the mirror after the user skipped.
    this._startAttempt++;
    this._startPromise = null;
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this.isDrawing) this.input.emit('draw:end', this.filtered);
    this.isDrawing = false;
    this.active = false;
    this._landmarker?.close?.();
    this._landmarker = null;
    this._stream?.getTracks().forEach((track) => track.stop());
    this._stream = null;
    this._mirror?.remove();
    // Hot reloads and interrupted browser permission flows can leave a mirror
    // from an instance that no longer owns a stream. It never needs to survive
    // a stop: remove any such orphan so pointer fallback is visually clean.
    document.querySelectorAll('.hand-mirror').forEach((mirror) => mirror.remove());
    this._mirror = null;
    this._video = null;
    this._canvas = null;
    this._context = null;
    this._filter = null;
    this._delegate = null;
  }

  dispose() {
    this.stop();
    window.removeEventListener('grimoire:selected', this._onElementAccent);
  }
}
