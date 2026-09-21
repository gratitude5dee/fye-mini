'use client';

import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { HOUSE_SEED_SPELLS } from '../src/config/house-spells';
import { TO_ENGINE, TO_UI } from '../src/state/events.js';
import { isPersistent, read as readPreferences, write as persistPreferences } from '../src/state/preferences.js';
import { useDialog } from './useDialog';
import './grimoire-stage.css';

type ElementId = 'fire' | 'water' | 'earth' | 'air';
type InputState = 'idle' | 'requesting' | 'ready' | 'tracking' | 'fallback' | 'unavailable';
type RitePhase = 'free' | 'open' | 'present' | 'draw' | 'resolve' | 'close';
type RiteState = {
  phase: RitePhase;
  lineIndex: number;
  lineCount: number;
  attemptsLeft: number;
  ward: boolean[];
  elements: string[];
  persistent: boolean;
};

const IDLE_RITE: RiteState = {
  phase: 'free', lineIndex: 0, lineCount: 0, attemptsLeft: 0, ward: [], elements: [], persistent: true
};
type Dial = { label: string; path: string; min: number; max: number; step: number; value: number };

/**
 * The one place an element's name and colour are written.
 *
 * There were three, and they disagreed — this list, `ELEMENT_META` in the
 * engine's settings, and the accent map inside `HandInput` — on both the hex
 * values and the words. Anything that needs either reads it from here.
 */
const ELEMENTS: Array<{ id: ElementId; label: string; sigil: string; color: string }> = [
  { id: 'fire', label: 'Fire', sigil: '✦', color: '#ff6a3c' },
  { id: 'water', label: 'Water', sigil: '◒', color: '#3fb8c9' },
  { id: 'earth', label: 'Stone', sigil: '◆', color: '#c6a372' },
  { id: 'air', label: 'Wind', sigil: '⌁', color: '#bfe8df' }
];

const INTRO_ART = '/intro/elemental-montage.png';
const INTRO_PANELS = [
  { id: 'fire', title: 'Fire' },
  { id: 'water', title: 'Water' },
  { id: 'earth', title: 'Stone' },
  { id: 'air', title: 'Wind' }
] as const;

const DIALS: Record<ElementId, Dial[]> = {
  fire: [
    { label: 'Pace', path: 'fire.speed', min: 4, max: 26, step: .1, value: 11.5 },
    { label: 'Flame', path: 'fire.flameHeight', min: .5, max: 4.5, step: .05, value: 1.84 },
    { label: 'Glow', path: 'fire.glow', min: .2, max: 7, step: .1, value: 3.06 }
  ],
  water: [
    { label: 'Pace', path: 'water.speed', min: 3, max: 24, step: .1, value: 7.5 },
    { label: 'Crest', path: 'water.crest', min: .5, max: 4, step: .05, value: 1.5 },
    { label: 'Glow', path: 'water.glow', min: .1, max: 6, step: .1, value: .8 }
  ],
  earth: [
    { label: 'Pace', path: 'earth.speed', min: 2, max: 20, step: .1, value: 6 },
    { label: 'Rise', path: 'earth.riseHeight', min: .3, max: 4, step: .05, value: 1.68 },
    { label: 'Glow', path: 'earth.glow', min: .1, max: 5, step: .1, value: 1.38 }
  ],
  air: [
    { label: 'Pace', path: 'air.speed', min: 4, max: 32, step: .1, value: 14 },
    { label: 'Ribbon', path: 'air.ribbonWidth', min: .1, max: 4, step: .05, value: 2.1 },
    { label: 'Glow', path: 'air.glow', min: .1, max: 6, step: .1, value: 1.35 }
  ]
};

/** Display name for an element id, so a raw lowercase key never reaches the page. */
const labelOf = (id: string) => ELEMENTS.find((entry) => entry.id === id)?.label ?? id;

function emit(name: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function GrimoireStage() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [introVisible, setIntroVisible] = useState(true);
  const [stageReady, setStageReady] = useState(false);
  const [element, setElement] = useState<ElementId>('air');
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const [handsOpen, setHandsOpen] = useState(false);
  const [inputState, setInputState] = useState<InputState>('idle');
  const [inputStatus, setInputStatus] = useState('Enable your camera only when you are ready.');
  const [rideArmed, setRideArmed] = useState(false);
  const [lastCast, setLastCast] = useState('Draw a path, pinch to cast, or use the cast key.');
  const [dialValues, setDialValues] = useState<Record<string, number>>({});
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [rite, setRite] = useState<RiteState>(IDLE_RITE);

  const currentElement = ELEMENTS.find((entry) => entry.id === element) ?? ELEMENTS[3];

  /**
   * What the world is saying, if it is saying anything.
   *
   * Derived from the Rite's state rather than held alongside it, so the words
   * on screen can never disagree with the stones on the ground.
   */
  const riteMessage = (() => {
    if (rite.phase === 'free') return null;
    if (rite.phase === 'close') {
      const dark = rite.ward.filter((lit) => !lit).length;
      if (dark === 0) return 'The Ward is whole.';
      return `${dark === 1 ? 'One stone' : `${dark} stones`} stayed dark. The Rite still ends.`;
    }
    const wants = rite.elements.map((id) => labelOf(id)).join(' or ');
    return wants ? `Reach the stones. ${wants} answers here.` : 'Reach the stones.';
  })();
  const activeDials = DIALS[element];

  useEffect(() => {
    const preferences = readPreferences();
    setIntroVisible(!preferences.introSeen);
    setElement(preferences.element as ElementId);
    setDialValues(preferences.dials);
    setStorageAvailable(isPersistent());
  }, []);

  useEffect(() => {
    // The renderer is deliberately imported only after this client component
    // has mounted, so the canvas and HUD exist before the imperative stage
    // claims them. The module's boot function publishes `grimoire:ready`.
    void import('../src/main.js');
  }, []);

  useEffect(() => {
    const ready = () => setStageReady(true);
    const inputStatusListener = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; state?: InputState }>).detail;
      setInputStatus(detail?.message ?? 'Hand input is ready.');
      setInputState(detail?.state ?? 'tracking');
    };
    const rideStatusListener = (event: Event) => setRideArmed(Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active));
    const castListener = (event: Event) => {
      const castElement = (event as CustomEvent<{ element?: ElementId }>).detail?.element;
      const label = ELEMENTS.find((entry) => entry.id === castElement)?.label ?? 'Element';
      setLastCast(`${label} released. The caster is recovering.`);
    };
    window.addEventListener(TO_UI.READY, ready);
    window.addEventListener(TO_UI.INPUT_STATUS, inputStatusListener);
    window.addEventListener(TO_UI.RIDE_STATUS, rideStatusListener);
    const riteListener = (event: Event) => {
      const detail = (event as CustomEvent<RiteState>).detail;
      if (detail) setRite(detail);
    };
    window.addEventListener(TO_UI.CAST_COMPLETE, castListener);
    window.addEventListener(TO_UI.RITE_STATE, riteListener);
    return () => {
      window.removeEventListener(TO_UI.READY, ready);
      window.removeEventListener(TO_UI.INPUT_STATUS, inputStatusListener);
      window.removeEventListener(TO_UI.RIDE_STATUS, rideStatusListener);
      window.removeEventListener(TO_UI.CAST_COMPLETE, castListener);
      window.removeEventListener(TO_UI.RITE_STATE, riteListener);
    };
  }, []);

  // Preferences hydrate after the renderer module begins loading. Replay the
  // selected element once it reports readiness so the visible HUD and the
  // active Three.js ability can never drift apart.
  useEffect(() => {
    if (stageReady) emit(TO_ENGINE.SELECT, { element });
  }, [element, stageReady]);

  const closeHands = useCallback(() => setHandsOpen(false), []);
  const closeWorkshop = useCallback(() => setWorkshopOpen(false), []);

  const dismissIntro = () => {
    persistPreferences({ introSeen: true });
    setIntroVisible(false);
  };

  useEffect(() => {
    if (!introVisible) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(dismissIntro, reduceMotion ? 900 : 7600);
    return () => window.clearTimeout(timer);
  }, [introVisible]);

  const introRef = useDialog<HTMLElement>(introVisible, dismissIntro);
  const handsRef = useDialog<HTMLElement>(handsOpen, closeHands);
  const workshopRef = useDialog<HTMLElement>(workshopOpen, closeWorkshop);

  const selectElement = (next: ElementId) => {
    setElement(next);
    persistPreferences({ element: next });
    emit(TO_ENGINE.SELECT, { element: next });
  };

  const adjustDial = (dial: Dial, value: number) => {
    const next = { ...dialValues, [dial.path]: value };
    setDialValues(next);
    persistPreferences({ dials: next });
    emit(TO_ENGINE.PATCH, { patch: { [dial.path]: value } });
  };

  const choosePreset = (preset: typeof HOUSE_SEED_SPELLS[number]) => {
    selectElement(preset.element as ElementId);
    emit(TO_ENGINE.PATCH, { patch: preset.settingsPatch });
    setLastCast(`${preset.name} is prepared locally. Draw to release it.`);
  };

  const enableHands = () => {
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      setInputState('unavailable');
      setInputStatus('Touch casting is ready. Mobile never requests your camera.');
      return;
    }
    if (!stageReady) {
      setInputStatus('The stage is still waking. Try again in a moment.');
      return;
    }
    setInputState('requesting');
    setInputStatus('Requesting camera permission…');
    emit(TO_ENGINE.ATTUNE);
  };

  const stopHands = () => {
    emit(TO_ENGINE.STOP_HANDS);
    setHandsOpen(false);
    setInputState('idle');
    setInputStatus('Pointer casting is ready.');
  };

  return (
    <main className="grimoire-stage" style={{ '--accent': currentElement.color } as CSSProperties}>
      <div className="grimoire-stage__surface" ref={surfaceRef}>
        <canvas id="viewport" aria-label="Elemental casting stage with an animated caster" />
        <div id="loader" className="loader" aria-live="polite">
          <div className="loader__inner">
            <div className="loader__sigil"><span className="sigil sigil--fire" /><span className="sigil sigil--water" /><span className="sigil sigil--earth" /><span className="sigil sigil--air" /></div>
            <h1 className="loader__title">The Living Grimoire</h1>
            <div className="loader__bar"><i id="loader-fill" /></div>
            <p className="loader__status" id="loader-status">Preparing the caster…</p>
          </div>
        </div>
        <div id="hud" className="hud" aria-live="polite" />

        <header className="stage-header">
          <div className="wordmark"><span>Local elemental stage</span><strong>Living Grimoire</strong></div>
          <div className="header-actions">
            <button className="quiet-button" onClick={() => { setWorkshopOpen(false); setHandsOpen(true); }} aria-expanded={handsOpen}>Hand mode</button>
            <button className="quiet-button" onClick={() => { setHandsOpen(false); setWorkshopOpen(true); }} aria-expanded={workshopOpen}>Workshop</button>
          </div>
        </header>

        <section className="stage-message" aria-live="polite">
          <span className="stage-message__dot" />
          {riteMessage ?? lastCast}
        </section>

        {rite.phase !== 'free' && <section className="ward-readout" aria-label="The Ward">
          <ol className="ward-stones">
            {rite.ward.map((lit, index) => <li
              key={index}
              className={`${lit ? 'is-lit' : ''} ${index === rite.lineIndex && rite.phase !== 'close' ? 'is-current' : ''}`}
              aria-label={`Line ${index + 1}: ${lit ? 'answered' : 'dark'}`}
            />)}
          </ol>
          {rite.phase !== 'close' && <span className="ward-attempts">
            {rite.attemptsLeft} {rite.attemptsLeft === 1 ? 'try' : 'tries'}
          </span>}
        </section>}

        <section className="stage-hud" aria-label="Casting controls">
          <div className="element-selector" role="group" aria-label="Choose an element">
            {ELEMENTS.map((entry) => <button key={entry.id} data-element={entry.id} className={entry.id === element ? 'is-active' : ''} aria-pressed={entry.id === element} onClick={() => selectElement(entry.id)}>
              <i>{entry.sigil}</i><span>{entry.label}</span>
            </button>)}
          </div>
          <button className="cast-button" disabled={!stageReady} onClick={() => emit(TO_ENGINE.CAST)}><span>{stageReady ? 'Cast' : 'Waking'}</span><b>{currentElement.label}</b></button>
          <button
            className={`ride-button ${rite.phase !== 'free' ? 'is-armed' : ''}`}
            onClick={() => emit(TO_ENGINE.RITE, { action: rite.phase === 'free' ? 'begin' : 'aside' })}
          >{rite.phase === 'free' ? 'Begin a Rite' : 'Set the Rite aside'}</button>
          <button className={`ride-button ${rideArmed ? 'is-armed' : ''}`} onClick={() => emit(TO_ENGINE.RIDE)} aria-pressed={rideArmed}>{rideArmed ? 'Draw air ride' : 'Ride a path'}</button>
        </section>
      </div>

      {introVisible && <section className="intro" role="dialog" aria-modal="true" aria-label="Elemental introduction" ref={introRef} tabIndex={-1}>
        <img className="intro__art" src={INTRO_ART} alt="" />
        <div className="intro__panels" aria-hidden="true">
          {INTRO_PANELS.map((panel, index) => <figure key={panel.id} className={`intro__panel intro__panel--${panel.id}`} style={{ '--panel-index': index } as CSSProperties}><figcaption>{panel.title}</figcaption></figure>)}
        </div>
        <div className="intro__copy"><p>Four forces. One hand.</p><h1>Become the motion.</h1><span>Camera frames and landmarks stay in this browser.</span></div>
        <button className="intro__skip" onClick={dismissIntro}>Skip intro</button>
      </section>}

      {handsOpen && <section className="side-sheet" role="dialog" aria-modal="true" aria-labelledby="hands-title" ref={handsRef} tabIndex={-1}>
        <button className="sheet-close" onClick={closeHands} aria-label="Close hand input panel">×</button>
        <p className="eyebrow">Camera-first desktop input</p><h2 id="hands-title">Cast with your hands.</h2>
        <p className="sheet-copy">Enable the camera with the button below. The live mirror and landmarks are processed in this browser only; no video, frames, or landmarks are saved.</p>
        <div className={`input-health input-health--${inputState}`}><i /><span>{inputStatus}</span></div>
        <ol className="gesture-guide"><li><b>1</b><span><strong>Calibrate</strong> Hold an open palm until the ring fills.</span></li><li><b>2</b><span><strong>Choose</strong> Fist = stone · two fingers = water · horns = fire · open hand = wind.</span></li><li><b>3</b><span><strong>Release</strong> Pinch thumb to index, draw, then open.</span></li></ol>
        <div className="sheet-actions"><button className="cast-button" onClick={enableHands}>{inputState === 'ready' || inputState === 'tracking' ? 'Calibrate pose' : 'Enable hands'}</button>{(inputState === 'ready' || inputState === 'tracking' || inputState === 'requesting') && <button className="quiet-button" onClick={stopHands}>Use pointer instead</button>}</div>
      </section>}

      {workshopOpen && <section className="side-sheet workshop" role="dialog" aria-modal="true" aria-labelledby="workshop-title" ref={workshopRef} tabIndex={-1}>
        <button className="sheet-close" onClick={closeWorkshop} aria-label="Close local workshop">×</button>
        <p className="eyebrow">Local workshop</p><h2 id="workshop-title">Shape the next cast.</h2>
        <p className="sheet-copy">These presets and dials only change this browser’s live stage. Nothing is uploaded or bound to an account.</p>
        {!storageAvailable && <p className="sheet-copy">This browser is not keeping site data, so your element and dials will not be here next time. Casting is unaffected.</p>}
        <div className="preset-grid" aria-label="Local spell presets">{HOUSE_SEED_SPELLS.map((preset) => <button key={preset.slug} onClick={() => choosePreset(preset)} data-element={preset.element}><small>{labelOf(preset.element)}</small><strong>{preset.name}</strong></button>)}</div>
        <fieldset className="local-dials"><legend>{currentElement.label} dials</legend>{activeDials.map((dial) => {
          const value = dialValues[dial.path] ?? dial.value;
          return <label key={dial.path}><span>{dial.label}</span><output>{value.toFixed(dial.step >= 1 ? 0 : 1)}</output><input type="range" min={dial.min} max={dial.max} step={dial.step} value={value} onChange={(event) => adjustDial(dial, Number(event.target.value))} /></label>;
        })}</fieldset>
      </section>}
    </main>
  );
}
