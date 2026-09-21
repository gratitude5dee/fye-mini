/**
 * Payload types for the React/engine seam.
 *
 * The constants are declared in `events.js` so both trees import one source.
 * These types exist so the TypeScript island cannot read a field the engine
 * never sends.
 */

export type ElementId = 'fire' | 'water' | 'earth' | 'air';
export type InputState = 'idle' | 'requesting' | 'ready' | 'tracking' | 'fallback' | 'unavailable';
export type TrackingState = 'seeking' | 'found' | 'lost';

export interface GrimoireEventMap {
  'grimoire:select': { element: ElementId };
  'grimoire:patch': { patch: Record<string, number | string> };
  'grimoire:attune': undefined;
  'grimoire:stop-hands': undefined;
  'grimoire:cast': undefined;
  'grimoire:ride': undefined;
  'grimoire:rite': { action: 'begin' | 'aside' };
  'grimoire:select-world': { world: unknown; silent?: boolean };
  'grimoire:home': undefined;

  'grimoire:ready': { app: unknown };
  'grimoire:input-status': {
    message?: string;
    state?: InputState;
    /** Present once the tracker publishes continuous state. */
    engaged?: boolean;
    wake?: number;
    pose?: ElementId | null;
    hold?: number;
    pinch?: number;
    lift?: number;
    spread?: number;
    dock?: ElementId | null;
    dockHold?: number;
    offHand?: ElementId | null;
    tracking?: TrackingState;
    delegate?: 'GPU' | 'CPU';
  };
  'grimoire:ride-status': { active: boolean };
  'grimoire:cast-complete': { element: ElementId; pathLength: number };
  'grimoire:selected': { element: ElementId };
  'grimoire:impact': { element: ElementId; x: number; z: number; u: number };
  'grimoire:rite-state': {
    phase: 'free' | 'open' | 'present' | 'draw' | 'resolve' | 'close';
    lineIndex: number;
    lineCount: number;
    attemptsLeft: number;
    ward: boolean[];
  };
  'grimoire:world-status': { state: 'loading' | 'ready' | 'failed'; world: string; title?: string };
  'grimoire:home-ready': undefined;
}

export const TO_ENGINE: Readonly<Record<string, keyof GrimoireEventMap>>;
export const TO_UI: Readonly<Record<string, keyof GrimoireEventMap>>;
export const EVENTS: Readonly<Record<string, keyof GrimoireEventMap>>;
export function emit<K extends keyof GrimoireEventMap>(name: K, detail?: GrimoireEventMap[K]): void;
export function on<K extends keyof GrimoireEventMap>(name: K, handler: (detail: GrimoireEventMap[K]) => void): () => void;
