import { Vector2 } from 'three';

const INSET = 0.15;
const PINCH_DOWN = 0.32;
const PINCH_UP = 0.48;
const DROPOUT_GRACE_MS = 120;
const POSE_HOLD_MS = 450;

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
    this._raf = 0;
    this._stream = null;
    this._landmarker = null;
    this._video = null;
    this._canvas = null;
    this._context = null;
  }

  async start() {
    if (this.active) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.onStatus?.('The spirits accept a humbler wand.');
      return;
    }

    try {
      this._createMirror();
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      this._video.srcObject = this._stream;
      await this._video.play();

      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm');
      this._landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 1
      });
      this.active = true;
      this.lastFrameAt = performance.now();
      this._loop();
      this.onStatus?.('Your hand is read here, and nowhere else.');
    } catch (error) {
      console.warn('[HandInput] camera or tracker unavailable', error);
      this.stop();
      this.onStatus?.('The spirits accept a humbler wand.');
    }
  }

  _createMirror() {
    if (this._video) return;
    const mirror = document.createElement('div');
    mirror.className = 'hand-mirror';
    mirror.innerHTML = '<video muted playsinline></video><canvas aria-hidden="true"></canvas><span>Seeking your hand…</span>';
    document.body.append(mirror);
    this._video = mirror.querySelector('video');
    this._canvas = mirror.querySelector('canvas');
    this._context = this._canvas.getContext('2d');
    this._label = mirror.querySelector('span');
    this._mirror = mirror;
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
        this.onStatus?.('Tracking slowed. Your mouse is ready.');
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

    // A compact One-Euro-inspired smoother: at low speed it removes tremor;
    // on fast travel it moves nearly with the fingertip to preserve latency.
    const speed = this.pointer.distanceTo(this.filtered) * 60;
    const alpha = clamp(0.16 + speed * 0.04, 0.16, 0.8);
    if (!this.filtered.lengthSq()) this.filtered.copy(this.pointer);
    this.filtered.lerp(this.pointer, alpha);

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

    if (!this.isDrawing) this._trackPose(landmarks, now);
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
    if (!four.some(Boolean)) next = 'earth';
    else if (fingers.thumb && four.every(Boolean)) next = 'wind';
    else if (fingers.index && fingers.middle && !fingers.ring && !fingers.pinky) next = 'water';
    else if (fingers.index && fingers.pinky && !fingers.middle && !fingers.ring) next = 'fire';

    if (next !== this.pose) {
      this.pose = next;
      this.poseStartedAt = now;
      this.poseTriggered = false;
    }
    if (next && !this.poseTriggered && now - this.poseStartedAt >= POSE_HOLD_MS) {
      this.poseTriggered = true;
      this.onElement?.(next);
      this.onStatus?.(`${next === 'wind' ? 'Gale' : next[0].toUpperCase() + next.slice(1)} answers your pose.`);
    }
  }

  _resetPose() {
    this.pose = null;
    this.poseStartedAt = 0;
    this.poseTriggered = false;
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
    ctx.fillStyle = '#bfe8df';
    for (const point of landmarks) {
      ctx.beginPath();
      ctx.arc((1 - point.x) * width, point.y * height, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  stop() {
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
    this._mirror = null;
    this._video = null;
    this._canvas = null;
    this._context = null;
  }

  dispose() {
    this.stop();
  }
}
