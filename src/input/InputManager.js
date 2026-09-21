import { Vector2 } from 'three';
import { EventEmitter } from '../utils/EventEmitter.js';

/**
 * Normalises pointer + keyboard input into a small event vocabulary.
 *
 * Events: `draw:start`, `draw:move`, `draw:end`, `element`, `action`.
 * Pointer events that begin on top of DOM UI (the editor, the HUD) are ignored
 * so dragging a slider never starts drawing a path.
 */
export class InputManager extends EventEmitter {
  constructor(domElement) {
    super();
    this.dom = domElement;
    this.pointer = new Vector2(); // NDC
    this.isDrawing = false;
    this.lastPointerType = 'mouse';
    this.keys = new Set();
    this.enabled = true;

    /**
     * Continuous channels a hand supplies and a pointer cannot.
     *
     * They live on the shared input object rather than on `HandInput` so that
     * everything downstream keeps treating the two sources as one. With a
     * pointer they stay at their defaults, and every element behaves exactly as
     * it always has.
     */
    this.lift = 0;
    this.spread = 0;
    /**
     * Element for the next accepted sample, as an index into `ELEMENTS`, or -1
     * for "whatever is selected".
     *
     * Written by the off hand while a stroke is live, and by the keyboard when
     * a digit is *held* mid-drag — the same thing, reached two ways, which is
     * the point: hands are not uniquely capable here, they are uninterrupted.
     */
    this.elementIndex = -1;

    this._bind();
  }

  _bind() {
    this.dom.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    this.dom.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  _updatePointer(event) {
    this.pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
  }

  _onPointerDown = (event) => {
    if (!this.enabled) return;
    if (event.button !== 0) return; // left button draws; right orbits
    if (event.target !== this.dom) return; // started on UI

    this._updatePointer(event);
    this.lastPointerType = event.pointerType === 'touch' ? 'touch' : 'mouse';
    this.isDrawing = true;
    this.dom.setPointerCapture?.(event.pointerId);
    this.emit('draw:start', this.pointer);
  };

  _onPointerMove = (event) => {
    this._updatePointer(event);
    if (this.isDrawing) this.emit('draw:move', this.pointer);
  };

  _onPointerUp = (event) => {
    if (!this.isDrawing) return;
    this._updatePointer(event);
    this.isDrawing = false;
    this.dom.releasePointerCapture?.(event.pointerId);
    this.emit('draw:end', this.pointer);
  };

  _onKeyDown = (event) => {
    if (event.repeat) return;
    const target = event.target;
    if (target && ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'].includes(target.tagName || '') || target?.isContentEditable) return;

    this.keys.add(event.code);

    // The stage owns locomotion keys.  Preventing their browser defaults keeps
    // Space from scrolling a page out from under a grounded jump.
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) event.preventDefault();

    switch (event.code) {
      // A digit pressed on its own selects. A digit *held* while a stroke is
      // live writes the element channel instead, so one unbroken line can be
      // fire to the gate and earth over the rubble — the same thing the off
      // hand does, reached from the keyboard. Hands are not uniquely capable
      // here; they are uninterrupted.
      case 'Digit1': this._digit(0); break;
      case 'Digit2': this._digit(1); break;
      case 'Digit3': this._digit(2); break;
      case 'Digit4': this._digit(3); break;
      case 'KeyQ':
        this.emit('action', 'prevElement');
        break;
      case 'KeyE':
        this.emit('action', 'nextElement');
        break;
      case 'KeyH':
        this.emit('action', 'toggleHelp');
        break;
      case 'KeyG':
        this.emit('action', 'toggleEditor');
        break;
      case 'KeyC':
        this.emit('action', 'clear');
        break;
      case 'KeyP':
        this.emit('action', 'togglePause');
        break;
      case 'KeyT':
        this.emit('action', 'togglePose');
        break;
      case 'KeyM':
        this.emit('action', 'toggleMode');
        break;
      default:
        break;
    }
  };

  _digit(index) {
    if (this.isDrawing) this.elementIndex = index;
    else this.emit('element', index);
  }

  _onKeyUp = (event) => {
    this.keys.delete(event.code);
  };

  _onBlur = () => this.keys.clear();

  dispose() {
    this.dom.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.clear();
  }
}
