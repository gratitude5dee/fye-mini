'use client';

import { type CSSProperties, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HOUSE_SEED_SPELLS, houseSpellForClient } from '../src/config/house-spells';
import './grimoire-stage.css';

type ElementId = 'fire' | 'water' | 'earth' | 'air';

type Spell = {
  _id?: string;
  slug: string;
  name: string;
  element: ElementId;
  incantation: string;
  lore: string;
  tags: string[];
  genome: Record<string, number>;
  portrait?: { imageUrl?: string; palette?: string[] };
  stats?: { casts?: number; remixes?: number };
  lineage?: { parentId?: string | null; rootId?: string; depth?: number };
  creator?: { handle?: string };
  settings?: Record<string, unknown>;
};

type LoreDraft = { draftId: string; names: string[]; lore: string; tags: string[]; portraitUrl?: string | null };
type BindingSnapshot = {
  incantation: string;
  incantationHistory: string[];
  element: ElementId;
  settings: Record<string, unknown>;
  parentId?: string;
};
type SpellDetail = { spell: Spell; ancestors: Spell[]; descendants: Spell[] };
type FeedSort = 'trending' | 'newest' | 'remixed';
type SpellSource = 'stage' | 'atlas' | 'hybrid';
type Almanac = {
  totalCasts: number | null;
  elementShare: Array<{ element: ElementId; casts: number }>;
  daily: Array<{ day: string; element: ElementId; casts: number }>;
  trending: Array<{ spell: Spell; casts: number }>;
  source: 'atlas' | 'stage';
};
type Dial = { path: string; label: string };

type RecognitionResultEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => RecognitionLike;

const VOICE_FEATURE_ENABLED = import.meta.env.VITE_VOICE_ENABLED !== 'false';

const ELEMENTS: Array<{ id: ElementId; sigil: string; label: string; color: string }> = [
  { id: 'fire', sigil: 'ᛉ', label: 'Ember', color: '#FF6A3C' },
  { id: 'water', sigil: '◒', label: 'Tide', color: '#3FB8C9' },
  { id: 'earth', sigil: '◇', label: 'Stone', color: '#A08A63' },
  { id: 'air', sigil: '⌁', label: 'Gale', color: '#BFE8DF' }
];

const ATTUNEMENT_KEY = 'living-grimoire-attunement-complete';
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('aria-hidden') && element.getClientRects().length > 0);
}

// The house shelf makes the offline stage feel intentional. As soon as Atlas
// answers, this is replaced by the stored pages and never used as analytics.
const HOUSE_SPELLS: Spell[] = HOUSE_SEED_SPELLS.map((spell) => houseSpellForClient(spell) as Spell);

const QUICK_DIALS: Record<ElementId, Dial[]> = {
  fire: [
    { path: 'global.speed', label: 'Pace' }, { path: 'global.glow', label: 'Glow' }, { path: 'trail.width', label: 'Trail' }, { path: 'fire.flameWidth', label: 'Body' },
    { path: 'fire.flameHeight', label: 'Height' }, { path: 'fire.flameTurbulence', label: 'Turbulence' }, { path: 'fire.emberRate', label: 'Embers' }, { path: 'fire.explosionSize', label: 'Detonation' }
  ],
  water: [
    { path: 'global.speed', label: 'Pace' }, { path: 'global.glow', label: 'Glow' }, { path: 'trail.width', label: 'Trail' }, { path: 'water.radius', label: 'Body' },
    { path: 'water.crest', label: 'Crest' }, { path: 'water.waveAmplitude', label: 'Wave' }, { path: 'water.foam', label: 'Foam' }, { path: 'water.splashSize', label: 'Impact' }
  ],
  earth: [
    { path: 'global.speed', label: 'Pace' }, { path: 'global.glow', label: 'Glow' }, { path: 'trail.width', label: 'Trail' }, { path: 'earth.crustWidth', label: 'Crust' },
    { path: 'earth.plateSize', label: 'Plates' }, { path: 'earth.rockSize', label: 'Rocks' }, { path: 'earth.riseHeight', label: 'Rise' }, { path: 'earth.towerHeight', label: 'Tower' }
  ],
  air: [
    { path: 'global.speed', label: 'Pace' }, { path: 'global.glow', label: 'Glow' }, { path: 'trail.width', label: 'Trail' }, { path: 'air.ribbonWidth', label: 'Ribbon' },
    { path: 'air.ribbonLength', label: 'Reach' }, { path: 'air.spiralRadius', label: 'Spiral' }, { path: 'air.turbulence', label: 'Turbulence' }, { path: 'air.tornadoHeight', label: 'Clap' }
  ]
};

function event(name: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function valueAtPath(source: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((cursor, key) => cursor && typeof cursor === 'object' ? (cursor as Record<string, unknown>)[key] : undefined, source);
}

async function capturePortrait(settings: Record<string, unknown>, element: ElementId) {
  const requestId = crypto.randomUUID();
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('grimoire:portrait-impact', onImpact);
      window.removeEventListener('grimoire:portrait-failed', onFailure);
    };
    const timeout = window.setTimeout(() => {
      finish();
      reject(new Error('The spell did not reach its bright moment.'));
    }, 7_000);
    const onImpact = (event: Event) => {
      if ((event as CustomEvent<{ requestId?: string }>).detail?.requestId !== requestId) return;
      finish();
      resolve();
    };
    const onFailure = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId?: string; message?: string }>).detail;
      if (detail?.requestId !== requestId) return;
      finish();
      reject(new Error(detail.message ?? 'The portrait replay could not continue.'));
    };
    window.addEventListener('grimoire:portrait-impact', onImpact);
    window.addEventListener('grimoire:portrait-failed', onFailure);
    event('grimoire:portrait', { requestId, settings, element });
  });
  // App only emits this after its post stack has drawn the matching impact
  // frame, so copying immediately preserves the actual hit rather than a
  // guessed travel duration or a later fading frame.
  const stage = document.querySelector<HTMLCanvasElement>('#viewport');
  if (!stage || !stage.width || !stage.height) return null;
  const scale = Math.min(1, 900 / Math.max(stage.width, stage.height));
  const portrait = document.createElement('canvas');
  portrait.width = Math.max(1, Math.round(stage.width * scale));
  portrait.height = Math.max(1, Math.round(stage.height * scale));
  portrait.getContext('2d')?.drawImage(stage, 0, 0, portrait.width, portrait.height);
  const blob = await new Promise<Blob | null>((resolve) => portrait.toBlob(resolve, 'image/webp', .8));
  if (!blob) return null;
  const response = await fetch('/api/portraits', { method: 'POST', headers: { 'content-type': 'image/webp' }, body: blob });
  if (!response.ok) return null;
  const result = await response.json() as { imageUrl?: string };
  return result.imageUrl ?? null;
}

function CanvasMark({ spell, compact = false }: { spell: Spell; compact?: boolean }) {
  const color = ELEMENTS.find((entry) => entry.id === spell.element)?.color ?? '#EFE7D8';
  return (
    <div className={`spell-mark ${compact ? 'spell-mark--compact' : ''}`} style={{ '--spell-color': color } as CSSProperties}>
      {spell.portrait?.imageUrl ? <img src={spell.portrait.imageUrl} alt="" /> : <span>{ELEMENTS.find((entry) => entry.id === spell.element)?.sigil}</span>}
    </div>
  );
}

function BinderSigil({ handle, element }: { handle?: string; element: ElementId }) {
  const label = handle || 'The First Binder';
  const letters = label.split(/\s+/).map((word) => word[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const turn = [...label].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 360, 17);
  const color = ELEMENTS.find((entry) => entry.id === element)?.color ?? '#BFE8DF';
  return <span className="binder-sigil" style={{ '--binder-color': color, '--binder-turn': `${turn}deg` } as CSSProperties} title={`${label}'s sigil`} aria-label={`${label}'s sigil`}><i>{letters}</i></span>;
}

function Genome({ genome }: { genome: Record<string, number> }) {
  const metrics = ['pace', 'mass', 'chaos', 'radiance', 'menace'];
  return (
    <div className="genome" aria-label="Spell genome">
      {metrics.map((metric) => (
        <span key={metric} title={`${metric}: ${Math.round((genome[metric] ?? 0) * 100)}%`}>
          <i style={{ width: `${Math.max(8, (genome[metric] ?? .1) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

function GenomeRadar({ genome }: { genome: Record<string, number> }) {
  const metrics = ['pace', 'mass', 'chaos', 'radiance', 'menace'];
  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / metrics.length);
    const radius = 45 * value;
    return `${50 + Math.cos(angle) * radius},${50 + Math.sin(angle) * radius}`;
  };
  const polygon = metrics.map((metric, index) => point(index, Math.max(0, Math.min(1, genome[metric] ?? 0)))).join(' ');
  const rings = [.25, .5, .75, 1];
  return (
    <div className="genome-radar" aria-label="Spell genome: pace, mass, chaos, radiance, and menace">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {rings.map((ring) => <polygon key={ring} className="genome-radar__ring" points={metrics.map((_, index) => point(index, ring)).join(' ')} />)}
        {metrics.map((_, index) => <line key={index} x1="50" y1="50" x2={point(index, 1).split(',')[0]} y2={point(index, 1).split(',')[1]} />)}
        <polygon className="genome-radar__shape" points={polygon} />
      </svg>
      <div className="genome-radar__labels">{metrics.map((metric) => <span key={metric}>{metric}</span>)}</div>
    </div>
  );
}

function ElementDonut({ entries, total }: { entries: Almanac['elementShare']; total: number }) {
  let cursor = 0;
  const bands = entries.map((entry) => {
    const start = cursor;
    cursor += entry.casts / Math.max(1, total) * 100;
    const color = ELEMENTS.find((item) => item.id === entry.element)?.color ?? '#efe7d8';
    return `${color} ${start}% ${cursor}%`;
  });
  return <div className="element-donut" style={{ '--donut': `conic-gradient(${bands.join(', ') || '#efe7d81b 0 100%'})` } as CSSProperties}><span><b>{total}</b><small>casts</small></span></div>;
}

function StackedDailyArea({ entries }: { entries: Almanac['daily'] }) {
  const days = [...new Set(entries.map((entry) => entry.day))].sort();
  const values = Object.fromEntries(ELEMENTS.map((entry) => [entry.id, days.map((day) => entries.find((item) => item.day === day && item.element === entry.id)?.casts ?? 0)])) as Record<ElementId, number[]>;
  const max = Math.max(1, ...days.map((_, index) => ELEMENTS.reduce((sum, entry) => sum + values[entry.id][index], 0)));
  const x = (index: number) => days.length < 2 ? 50 : index / (days.length - 1) * 100;
  const lower = days.map(() => 0);
  return <div className="daily-area" aria-label="Stacked castings by day and element"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img"><title>Castings by day, stacked by element</title>{ELEMENTS.map((entry) => {
    const top = values[entry.id].map((value, index) => lower[index] + value);
    const points = [...top.map((value, index) => `${x(index)},${100 - value / max * 92}`), ...lower.map((value, index) => `${x(lower.length - 1 - index)},${100 - lower[lower.length - 1 - index] / max * 92}`)].join(' ');
    for (let index = 0; index < lower.length; index++) lower[index] = top[index];
    return <polygon key={entry.id} points={points} fill={entry.color} />;
  })}</svg><div className="daily-area__legend">{ELEMENTS.map((entry) => <span key={entry.id} style={{ '--element': entry.color } as CSSProperties}>{entry.label}</span>)}</div></div>;
}

function LineageBranches({ parentId, nodes, onOpen, depth = 0 }: { parentId?: string; nodes: Spell[]; onOpen: (spell: Spell) => void; depth?: number }) {
  if (!parentId || depth > 12) return null;
  const children = nodes.filter((node) => node.lineage?.parentId === parentId);
  if (!children.length) return null;
  return <div className="lineage-tree__branches">{children.map((child) => <div className="lineage-tree__branch" key={child._id ?? child.slug}><button style={{ '--branch-indent': `${depth * 15}px` } as CSSProperties} onClick={() => onOpen(child)}>{child.name}</button><LineageBranches parentId={child._id} nodes={nodes} onOpen={onOpen} depth={depth + 1} /></div>)}</div>;
}

export function GrimoireStage() {
  const [element, setElement] = useState<ElementId>('fire');
  const [view, setView] = useState<'stage' | 'grimoire' | 'almanac'>('stage');
  const [attunement, setAttunement] = useState(() => {
    if (typeof window === 'undefined') return true;
    try { return window.localStorage.getItem(ATTUNEMENT_KEY) !== 'true'; } catch { return true; }
  });
  const [attunementStep, setAttunementStep] = useState<'ask' | 'trace' | 'pose'>('ask');
  const [stageReady, setStageReady] = useState(false);
  const [attunementQueued, setAttunementQueued] = useState(false);
  const [inputNotice, setInputNotice] = useState('');
  const [spellwrightOpen, setSpellwrightOpen] = useState(true);
  const [incantation, setIncantation] = useState('a low, hungry flame that hugs the ground and detonates twice');
  const [incantationHistory, setIncantationHistory] = useState<string[]>(['a low, hungry flame that hugs the ground and detonates twice']);
  const [reply, setReply] = useState('Name what the fire is becoming.');
  const [isCrafting, setIsCrafting] = useState(false);
  const [isBinding, setIsBinding] = useState(false);
  const [spells, setSpells] = useState<Spell[]>(HOUSE_SPELLS);
  const [spellSource, setSpellSource] = useState<SpellSource>('stage');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | ElementId>('all');
  const [sort, setSort] = useState<FeedSort>('trending');
  const [searching, setSearching] = useState(false);
  const [loreDraft, setLoreDraft] = useState<LoreDraft | null>(null);
  const [bindingSnapshot, setBindingSnapshot] = useState<BindingSnapshot | null>(null);
  const [bindStatus, setBindStatus] = useState('');
  const [customName, setCustomName] = useState('');
  const [selectedSpell, setSelectedSpell] = useState<Spell | null>(null);
  const [remixParent, setRemixParent] = useState<Spell | null>(null);
  const [spellDetail, setSpellDetail] = useState<SpellDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [analytics, setAnalytics] = useState<Almanac>({ totalCasts: null, elementShare: [], daily: [], trending: [], source: 'stage' });
  const [dialValues, setDialValues] = useState<Record<string, number>>({});
  const [dialRanges, setDialRanges] = useState<Record<string, { min: number; max: number; step: number }>>({});
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const queryVersion = useRef(0);
  const recognition = useRef<RecognitionLike | null>(null);
  const onboardingCastSent = useRef(false);
  const stageSurfaceRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  const finishAttunement = useCallback((notice = '') => {
    try { window.localStorage.setItem(ATTUNEMENT_KEY, 'true'); } catch { /* storage is optional */ }
    setAttunement(false);
    setAttunementQueued(false);
    if (notice) setInputNotice(notice);
  }, []);

  const activeModal = attunement && attunementStep === 'ask' ? 'attunement' : spellDetail ? 'spell' : null;

  useEffect(() => {
    if (!activeModal) return;
    const surface = stageSurfaceRef.current;
    const dialog = dialogRef.current;
    if (!surface || !dialog) return;

    const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    surface.setAttribute('inert', '');
    surface.setAttribute('aria-hidden', 'true');

    const focusFrame = window.requestAnimationFrame(() => {
      const [first] = focusableElements(dialog);
      (first ?? dialog).focus();
    });
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') {
        keyEvent.preventDefault();
        if (activeModal === 'spell') setSpellDetail(null);
        else finishAttunement('Attunement skipped. Your mouse and touch input are ready whenever you are.');
        return;
      }
      if (keyEvent.key !== 'Tab') return;
      const focusable = focusableElements(dialog);
      if (!focusable.length) {
        keyEvent.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (keyEvent.shiftKey && (current === first || !dialog.contains(current))) {
        keyEvent.preventDefault();
        last.focus();
      } else if (!keyEvent.shiftKey && (current === last || !dialog.contains(current))) {
        keyEvent.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown);
      surface.removeAttribute('inert');
      surface.removeAttribute('aria-hidden');
      window.requestAnimationFrame(() => {
        if (!surface.hasAttribute('inert') && restoreFocus?.isConnected) restoreFocus.focus();
      });
    };
  }, [activeModal, finishAttunement]);

  const shownSpells = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const semanticResults = Boolean(normalized && spellSource === 'hybrid');
    let results = semanticResults || !normalized
      ? spells
      : spells.filter((spell) => [spell.name, spell.incantation, spell.lore, ...spell.tags].join(' ').toLowerCase().includes(normalized));
    if (filter !== 'all') results = results.filter((spell) => spell.element === filter);
    // Atlas has already ranked a meaning search with reciprocal-rank fusion.
    // The offline shelf retains useful local filter/sort behavior instead.
    if (!semanticResults) {
      results = [...results].sort((left, right) => {
        if (sort === 'remixed') return (right.stats?.remixes ?? 0) - (left.stats?.remixes ?? 0);
        if (sort === 'trending') return (right.stats?.casts ?? 0) - (left.stats?.casts ?? 0);
        return 0;
      });
    }
    return results;
  }, [filter, query, sort, spellSource, spells]);

  useEffect(() => {
    let current = true;
    const onReady = () => current && setStageReady(true);
    const onInputStatus = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      if (!message || !current) return;
      setInputNotice(message);
      if (/humbler wand|mouse is ready/i.test(message)) finishAttunement(message);
    };
    window.addEventListener('grimoire:ready', onReady);
    window.addEventListener('grimoire:input-status', onInputStatus);
    if ((window as Window & { app?: unknown }).app) setStageReady(true);
    if (window.matchMedia?.('(pointer: coarse)').matches) finishAttunement('Touch casting is ready. This ritual never asks mobile visitors for a camera.');
    void import('../src/main.js').catch(() => current && setReply('The stage needs a clearer sky. Refresh to summon it again.'));
    void fetch('/api/identity').catch(() => undefined);
    return () => {
      current = false;
      window.removeEventListener('grimoire:ready', onReady);
      window.removeEventListener('grimoire:input-status', onInputStatus);
    };
  }, []);

  useEffect(() => {
    if (!stageReady || !attunementQueued) return;
    event('grimoire:attune');
    setAttunementQueued(false);
  }, [attunementQueued, stageReady]);

  useEffect(() => {
    const browser = window as Window & typeof globalThis & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    setVoiceAvailable(Boolean(VOICE_FEATURE_ENABLED && (browser.SpeechRecognition || browser.webkitSpeechRecognition)));
    return () => {
      recognition.current?.abort();
      recognition.current = null;
    };
  }, []);

  useEffect(() => {
    const onCast = (event: Event) => {
      const spellId = (event as CustomEvent<{ spellId?: string }>).detail?.spellId;
      setAttunementStep((step) => step === 'trace' ? 'pose' : step);
      if (!spellId) return;
      const increment = (spell: Spell) => spell._id === spellId ? { ...spell, stats: { ...spell.stats, casts: (spell.stats?.casts ?? 0) + 1 } } : spell;
      setSpells((current) => current.map(increment));
      setSpellDetail((current) => current && current.spell._id === spellId ? { ...current, spell: increment(current.spell) } : current);
    };
    window.addEventListener('grimoire:cast', onCast);
    return () => window.removeEventListener('grimoire:cast', onCast);
  }, []);

  useEffect(() => {
    const onSelected = (event: Event) => {
      const next = (event as CustomEvent<{ element?: ElementId }>).detail?.element;
      if (next) {
        setElement(next);
        if (next === 'earth' && attunementStep === 'pose' && !onboardingCastSent.current) {
          onboardingCastSent.current = true;
          event('grimoire:onboarding-earth');
          finishAttunement('Stone answers your first pose. Mouse and hand casting are both ready.');
        }
      }
    };
    window.addEventListener('grimoire:selected', onSelected);
    return () => window.removeEventListener('grimoire:selected', onSelected);
  }, [attunementStep]);

  useEffect(() => {
    if (view !== 'almanac') return;
    const loadAlmanac = () => void fetch('/api/almanac')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setAnalytics(data))
      .catch(() => setAnalytics({ totalCasts: null, elementShare: [], daily: [], trending: [], source: 'stage' }));
    loadAlmanac();
    const timer = window.setInterval(loadAlmanac, 60_000);
    return () => window.clearInterval(timer);
  }, [view]);

  useEffect(() => {
    let active = true;
    void import('../src/config/spell-contract.js').then((contract) => {
      if (!active) return;
      const snapshot = contract.snapshotSpellSettings() as Record<string, unknown>;
      const values = Object.fromEntries(QUICK_DIALS[element].map(({ path }) => [path, Number(valueAtPath(snapshot, path))]));
      setDialValues(values);
      setDialRanges(Object.fromEntries(QUICK_DIALS[element].map(({ path }) => [path, contract.RANGES[path]])));
    });
    return () => { active = false; };
  }, [element]);

  useEffect(() => {
    if (view !== 'grimoire') return;
    const controller = new AbortController();
    const version = ++queryVersion.current;
    const delay = window.setTimeout(() => {
      const parameters = new URLSearchParams({ sort });
      if (query.trim()) parameters.set('q', query.trim());
      if (filter !== 'all') parameters.set('element', filter);
      setSearching(true);
      void fetch(`/api/spells?${parameters.toString()}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((data: { spells?: Spell[]; source?: SpellSource }) => {
          if (version !== queryVersion.current || !active) return;
          if (data.source === 'stage') {
            setSpellSource('stage');
            return;
          }
          setSpells(data.spells ?? []);
          setSpellSource(data.source === 'hybrid' ? 'hybrid' : 'atlas');
        })
        .catch((error: unknown) => {
          if ((error as { name?: string }).name === 'AbortError' || version !== queryVersion.current || !active) return;
          setSpells(HOUSE_SPELLS);
          setSpellSource('stage');
        })
        .finally(() => { if (version === queryVersion.current && active) setSearching(false); });
    }, query.trim() ? 220 : 0);
    let active = true;
    return () => { active = false; controller.abort(); window.clearTimeout(delay); };
  }, [view, query, filter, sort]);

  const selectElement = (next: ElementId) => {
    if (isBinding) return;
    setElement(next);
    event('grimoire:select', { element: next });
  };

  const adjustDial = (path: string, value: number) => {
    if (isBinding) return;
    setDialValues((current) => ({ ...current, [path]: value }));
    event('grimoire:patch', { [path]: value });
  };

  const craft = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (isBinding || !incantation.trim()) return;
    setIsCrafting(true);
    setIncantationHistory((history) => [...new Set([...history, incantation.trim()])].filter(Boolean).slice(-20));
    try {
      const settingsModule = await import('../src/config/spell-contract.js');
      const response = await fetch('/api/spellwright', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ incantation, element, settings: settingsModule.snapshotSpellSettings() })
      });
      if (!response.ok) throw new Error('The quill went still.');
      const result = await response.json();
      event('grimoire:patch', result.patch);
      setDialValues((current) => ({ ...current, ...(result.patch ?? {}) }));
      setReply(result.reply ?? 'The spell has changed its mind.');
    } catch {
      setReply('The quill is quiet. The dials remain yours to turn.');
    } finally {
      setIsCrafting(false);
    }
  };

  const beginBind = async () => {
    if (isBinding) return;
    setIsBinding(true);
    setLoreDraft(null);
    setBindingSnapshot(null);
    setBindStatus('Capturing the bright moment…');
    try {
      const settingsModule = await import('../src/config/spell-contract.js');
      const boundIncantation = incantation.trim();
      const binding: BindingSnapshot = {
        incantation: boundIncantation,
        incantationHistory: [...new Set([...incantationHistory, boundIncantation])].filter(Boolean).slice(-20),
        element,
        settings: settingsModule.snapshotSpellSettings() as Record<string, unknown>,
        ...(remixParent?._id ? { parentId: remixParent._id } : {})
      };
      const portraitUrl = await capturePortrait(binding.settings, binding.element);
      if (!portraitUrl) throw new Error('The portrait gallery could not seal this impact. Try binding again in a moment.');
      const response = await fetch('/api/lore', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ incantation: binding.incantation, element: binding.element, settings: binding.settings })
      });
      if (!response.ok) throw new Error();
      const draft = await response.json() as LoreDraft;
      setLoreDraft({ ...draft, portraitUrl });
      setBindingSnapshot(binding);
      setCustomName('');
      setBindStatus('Choose the page title.');
    } catch (error) {
      setBindingSnapshot(null);
      setBindStatus(error instanceof Error && error.message ? error.message : 'The Lorekeeper is resting. Try again in a moment.');
    } finally {
      setIsBinding(false);
    }
  };

  const finishBind = async (name: string) => {
    const boundName = name.trim();
    if (isBinding || !boundName) {
      if (isBinding) return;
      setBindStatus('Give the page a name before binding it.');
      return;
    }
    setIsBinding(true);
    setBindStatus('Binding your spell into the book…');
    try {
      const settingsModule = await import('../src/config/spell-contract.js');
      const binding: BindingSnapshot = bindingSnapshot ?? {
        incantation: incantation.trim(),
        incantationHistory: [...new Set([...incantationHistory, incantation.trim()])].filter(Boolean).slice(-20),
        element,
        settings: settingsModule.snapshotSpellSettings() as Record<string, unknown>,
        ...(remixParent?._id ? { parentId: remixParent._id } : {})
      };
      const response = await fetch('/api/spells', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: boundName, incantation: binding.incantation, incantationHistory: binding.incantationHistory, element: binding.element, draftId: loreDraft?.draftId, portrait: { imageUrl: loreDraft?.portraitUrl ?? null }, ...(binding.parentId ? { parentId: binding.parentId } : {}), settings: binding.settings })
      });
      if (!response.ok) throw new Error();
      const { spell } = await response.json() as { spell: Spell };
      setSpells((existing) => [spell, ...existing.filter((entry) => entry.slug !== spell.slug)]);
      setLoreDraft(null);
      setBindingSnapshot(null);
      setBindStatus(`${spell.name} answers from the Grimoire.`);
      setSelectedSpell(spell);
      setRemixParent(null);
      selectElement(spell.element);
      event('grimoire:load-spell', { spell });
      setView('grimoire');
    } catch {
      setBindStatus('The binding could not reach Atlas. Your live spell remains safe on stage.');
    } finally {
      setIsBinding(false);
    }
  };

  const loadSpell = (spell: Spell) => {
    setSelectedSpell(spell);
    selectElement(spell.element);
    event('grimoire:load-spell', { spell });
    setReply(`${spell.name} is now in your hand.`);
    setSpellDetail(null);
    setView('stage');
  };

  const openSpellPage = async (spell: Spell) => {
    setDetailLoading(true);
    setSpellDetail({ spell, ancestors: [], descendants: [] });
    try {
      const response = await fetch(`/api/spells/${encodeURIComponent(spell.slug)}`);
      if (!response.ok) throw new Error();
      const page = await response.json() as SpellDetail;
      if (!page.spell?.slug) throw new Error();
      setSpellDetail({ spell: page.spell, ancestors: page.ancestors ?? [], descendants: page.descendants ?? [] });
    } catch {
      // A list-card remains a complete, useful page when a temporary offline
      // shelf cannot resolve its lineage yet.
      setSpellDetail({ spell, ancestors: [], descendants: [] });
    } finally {
      setDetailLoading(false);
    }
  };

  const beginRemix = (spell: Spell) => {
    setRemixParent(spell);
    setIncantation(spell.incantation);
    setIncantationHistory([spell.incantation]);
    event('grimoire:load-spell', { spell });
    selectElement(spell.element);
    setSpellDetail(null);
    setSpellwrightOpen(true);
    setView('stage');
    setReply(`${spell.name} leaves a branch open for your next variation.`);
  };

  const toggleVoice = () => {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    const browser = window as Window & typeof globalThis & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus('Dictation is not available in this browser.');
      return;
    }
    const engine = new Recognition();
    const beginning = incantation.trim();
    engine.lang = 'en-US';
    engine.continuous = false;
    engine.interimResults = true;
    engine.maxAlternatives = 1;
    engine.onresult = (result) => {
      const words: string[] = [];
      for (let index = 0; index < result.results.length; index++) {
        const transcript = result.results[index]?.[0]?.transcript?.trim();
        if (transcript) words.push(transcript);
      }
      if (words.length) setIncantation([beginning, words.join(' ')].filter(Boolean).join(beginning ? ' ' : ''));
    };
    engine.onerror = (event) => {
      setVoiceStatus(event.error === 'not-allowed' ? 'Microphone access was not granted.' : 'Dictation drifted away. You can keep writing by hand.');
    };
    engine.onend = () => {
      recognition.current = null;
      setVoiceListening(false);
    };
    recognition.current = engine;
    setVoiceListening(true);
    setVoiceStatus('Listening in your browser…');
    try {
      engine.start();
    } catch {
      recognition.current = null;
      setVoiceListening(false);
      setVoiceStatus('Dictation could not begin. Try the quill instead.');
    }
  };

  const startHands = () => {
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      finishAttunement('Touch casting is ready. This ritual never asks mobile visitors for a camera.');
      return;
    }
    setAttunementStep('trace');
    if (stageReady) event('grimoire:attune');
    else {
      setAttunementQueued(true);
      setInputNotice('The stage is waking. Your hand ritual will begin as soon as the scene is ready.');
    }
  };

  return (
    <main className="grimoire-stage">
      <div className="grimoire-stage__surface" ref={stageSurfaceRef}>
      <canvas id="viewport" aria-label="Elemental casting stage" />
      <div id="loader" className="loader" aria-live="polite">
        <div className="loader__inner">
          <div className="loader__sigil"><span className="sigil sigil--fire" /><span className="sigil sigil--water" /><span className="sigil sigil--earth" /><span className="sigil sigil--air" /></div>
          <h1 className="loader__title">The Living Grimoire</h1>
          <div className="loader__bar"><i id="loader-fill" /></div>
          <p className="loader__status" id="loader-status">Waking the elements…</p>
        </div>
      </div>
      <div id="hud" className="hud" aria-live="polite" />
      {inputNotice && <div className="input-notice" role="status"><span>{inputNotice}</span><button onClick={() => setInputNotice('')} aria-label="Dismiss input notice">×</button></div>}

      <header className="grimoire-topbar">
        <button className="wordmark" onClick={() => setView('stage')} aria-label="Return to the casting stage">
          <span>The Living</span><strong>Grimoire</strong>
        </button>
        <p className="stage-prompt">{selectedSpell ? `Holding ${selectedSpell.name}` : 'Show your hands.'}</p>
        <nav aria-label="Grimoire navigation">
          <button className={view === 'grimoire' ? 'is-active' : ''} aria-pressed={view === 'grimoire'} onClick={() => setView(view === 'grimoire' ? 'stage' : 'grimoire')}>Discover</button>
          <button className={view === 'almanac' ? 'is-active' : ''} aria-pressed={view === 'almanac'} onClick={() => setView(view === 'almanac' ? 'stage' : 'almanac')}>Almanac</button>
        </nav>
      </header>

      <div className="grimoire-element-dock" role="group" aria-label="Choose an element">
        {ELEMENTS.map((entry) => (
          <button key={entry.id} data-element={entry.id} disabled={isBinding} className={element === entry.id ? 'is-active' : ''} aria-pressed={element === entry.id} style={{ '--accent': entry.color } as CSSProperties} onClick={() => selectElement(entry.id)}>
            <span>{entry.sigil}</span>{entry.label}
          </button>
        ))}
      </div>

      <aside className={`spellwright ${spellwrightOpen ? 'is-open' : ''}`} aria-labelledby="spellwright-title">
        <button className="spellwright__tab" aria-expanded={spellwrightOpen} aria-controls="spellwright-panel" onClick={() => setSpellwrightOpen((open) => !open)}>{spellwrightOpen ? 'Close' : 'Spellwright'}</button>
        <div className="spellwright__inside" id="spellwright-panel" aria-hidden={!spellwrightOpen} inert={!spellwrightOpen}>
          <p className="eyebrow">The Spellwright</p>
          <h2 id="spellwright-title">Speak the shape you seek.</h2>
          <form onSubmit={craft}>
            <textarea value={incantation} disabled={isBinding} onChange={(event) => setIncantation(event.target.value)} rows={4} aria-label="Spell incantation" placeholder="A violet serpent of fire…" />
            <button type="submit" disabled={isCrafting || isBinding}>{isCrafting ? 'Writing…' : 'Alter the spell'}</button>
          </form>
          {voiceAvailable && <div className="voice-control"><button type="button" disabled={isBinding} className={voiceListening ? 'is-listening' : ''} onClick={toggleVoice} aria-pressed={voiceListening}>{voiceListening ? 'Stop dictation' : 'Dictate incantation'} <small>Beta</small></button><span role="status">{voiceStatus || 'Optional browser dictation.'}</span></div>}
          <p className="spellwright__reply">{reply}</p>
          <div className="spellwright__actions">
            <button className="quiet-button" disabled={isBinding} onClick={() => event('grimoire:toggle-dials')}>Full dials <kbd>G</kbd></button>
            <button className="bind-button" disabled={isBinding} onClick={beginBind}>{isBinding ? 'Binding…' : 'Bind this spell'}</button>
          </div>
          {remixParent && <p className="remix-note">Remixing from <b>{remixParent.name}</b> · <button onClick={() => setRemixParent(null)}>clear branch</button></p>}
          <fieldset className="quick-dials">
            <legend>{element} · eight living dials</legend>
            {QUICK_DIALS[element].map(({ path, label }) => {
              const range = dialRanges[path];
              const value = dialValues[path];
              return <label key={path}><b>{label}</b><input type="range" disabled={isBinding} min={range?.min ?? 0} max={range?.max ?? 1} step={range?.step ?? .01} value={Number.isFinite(value) ? value : range?.min ?? 0} onChange={(event) => adjustDial(path, Number(event.target.value))} /><em>{Number.isFinite(value) ? value.toFixed(range?.step && range.step >= 1 ? 0 : 2) : '—'}</em></label>;
            })}
          </fieldset>
          {bindStatus && <p className="bind-status" aria-live="polite">{bindStatus}</p>}
          {loreDraft && <div className="name-choice"><span>Choose its name</span>{loreDraft.names.map((name) => <button key={name} disabled={isBinding} onClick={() => finishBind(name)}>{name}</button>)}<form onSubmit={(event) => { event.preventDefault(); void finishBind(customName); }}><input value={customName} disabled={isBinding} onChange={(event) => setCustomName(event.target.value)} maxLength={56} placeholder="Or write your own name" aria-label="Your own spell name" /><button type="submit" disabled={isBinding || !customName.trim()}>Bind your own name</button></form></div>}
        </div>
      </aside>

      {view === 'grimoire' && <aside className="book-drawer" aria-labelledby="grimoire-title">
        <div className="book-drawer__head"><div><p className="eyebrow">The book is open</p><h2 id="grimoire-title">Cast what calls to you.</h2></div><button onClick={() => setView('stage')} aria-label="Close grimoire">×</button></div>
        <label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find by name or meaning" aria-label="Search the Grimoire" /></label>
        <div className="book-controls"><div role="group" aria-label="Discover filters">{(['all', ...ELEMENTS.map((entry) => entry.id)] as Array<'all' | ElementId>).map((entry) => <button key={entry} className={filter === entry ? 'is-active' : ''} aria-pressed={filter === entry} onClick={() => setFilter(entry)}>{entry === 'all' ? 'All' : entry}</button>)}</div><select value={sort} onChange={(event) => setSort(event.target.value as FeedSort)} aria-label="Sort spells"><option value="trending">Trending</option><option value="newest">Newest</option><option value="remixed">Most remixed</option></select></div>
        <p className="search-note">{searching ? 'Listening for distant pages…' : query && !shownSpells.length ? 'Nothing answers to that name — but these are near in spirit.' : 'Keyword and meaning, bound together.'}</p>
        <p className="sr-only" aria-live="polite">{searching ? 'Searching the Grimoire.' : `${shownSpells.length} spell${shownSpells.length === 1 ? '' : 's'} found.`}</p>
        <ul className="spell-list">
          {shownSpells.map((spell) => <li className="spell-card-wrap" key={spell.slug}><article><button className="spell-card" onClick={() => loadSpell(spell)} aria-label={`Load ${spell.name} for casting`}><CanvasMark spell={spell} /><span className="spell-card__body"><small>{spell.element}</small><strong>{spell.name}</strong><em>{spell.lore}</em><Genome genome={spell.genome} /><span>{spell.stats?.casts ?? 0} casts · {spell.tags.slice(0, 2).join(' · ')}</span></span></button><button className="spell-card__page" onClick={() => void openSpellPage(spell)} aria-label={`Read ${spell.name} spell page`}>Read page</button></article></li>)}
        </ul>
      </aside>}

      {view === 'almanac' && <aside className="almanac" aria-labelledby="almanac-title">
        <div className="book-drawer__head"><div><p className="eyebrow">A living record</p><h2 id="almanac-title">The Almanac</h2></div><button onClick={() => setView('stage')} aria-label="Close almanac">×</button></div>
        <div className="almanac__total"><span>Casts remembered · last 90 days</span><strong>{analytics.source === 'atlas' ? analytics.totalCasts ?? 0 : '—'}</strong><em>{analytics.source === 'atlas' ? analytics.totalCasts ? 'the book is listening' : 'The Almanac is early. Make the first mark.' : 'The Almanac wakes when Atlas is bound.'}</em></div>
        {analytics.source === 'atlas' && <>
          <section><p>Element share</p>{analytics.elementShare.length ? <div className="element-share"><ElementDonut entries={analytics.elementShare} total={analytics.totalCasts ?? 0} /><div>{analytics.elementShare.map((entry) => <div className="meter" key={entry.element}><span>{entry.element}</span><i style={{ width: `${Math.min(100, entry.casts / Math.max(1, analytics.totalCasts ?? 0) * 100)}%` }} /><b>{entry.casts}</b></div>)}</div></div> : <em className="almanac-empty">No element has been cast yet.</em>}</section>
          <section><p>Castings by day</p>{analytics.daily.length ? <StackedDailyArea entries={analytics.daily.slice(-112)} /> : <em className="almanac-empty">The first line appears with the first cast.</em>}</section>
          <section><p>Trending pages · seven days</p>{analytics.trending.length ? analytics.trending.map(({ spell, casts }) => <button className="almanac-spell" key={spell.slug} onClick={() => loadSpell(spell)}><CanvasMark spell={spell} compact /><span><strong>{spell.name}</strong><em>{casts} recent castings</em><i className="trending-bar" style={{ '--trend': `${casts / Math.max(1, analytics.trending[0]?.casts ?? 1) * 100}%`, '--element': ELEMENTS.find((item) => item.id === spell.element)?.color } as CSSProperties} /></span></button>) : <em className="almanac-empty">No pages are trending yet.</em>}</section>
        </>}
      </aside>}

      {attunement && attunementStep === 'trace' && <div className="ground-rune" aria-hidden="true"><span>⌁</span></div>}
      </div>

      {activeModal && <div className="modal-scrim" aria-hidden="true" />}
      {spellDetail && <aside className="spell-page" role="dialog" aria-modal="true" aria-labelledby="spell-page-title" aria-describedby="spell-page-incantation" ref={dialogRef} tabIndex={-1}>
        <div className="book-drawer__head"><div><p className="eyebrow">Bound page {detailLoading ? '· tracing lineage…' : ''}</p><h2 id="spell-page-title">{spellDetail.spell.name}</h2></div><button onClick={() => setSpellDetail(null)} aria-label="Close spell page">×</button></div>
        <div className="spell-page__hero"><CanvasMark spell={spellDetail.spell} /><div><small><BinderSigil handle={spellDetail.spell.creator?.handle} element={spellDetail.spell.element} /> {spellDetail.spell.element} · {spellDetail.spell.creator?.handle ?? 'The First Binder'}</small><p id="spell-page-incantation">{spellDetail.spell.incantation}</p><span>{spellDetail.spell.stats?.casts ?? 0} casts remembered</span></div></div>
        <section className="spell-page__lore" aria-labelledby="spell-page-lore"><p className="eyebrow" id="spell-page-lore">Lore</p><p>{spellDetail.spell.lore}</p><div>{spellDetail.spell.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section>
        <section className="spell-page__genome" aria-labelledby="spell-page-genome"><p className="eyebrow" id="spell-page-genome">Genome</p><GenomeRadar genome={spellDetail.spell.genome} /></section>
        <section className="lineage-tree" aria-labelledby="spell-page-lineage"><p className="eyebrow" id="spell-page-lineage">Lineage</p><div className="lineage-tree__path">{spellDetail.ancestors.length ? spellDetail.ancestors.map((ancestor) => <button key={ancestor.slug} onClick={() => void openSpellPage(ancestor)}>{ancestor.name}</button>) : <span>First known page</span>}<b>{spellDetail.spell.name}</b>{spellDetail.descendants.length ? <LineageBranches parentId={spellDetail.spell._id} nodes={spellDetail.descendants} onOpen={(branch) => void openSpellPage(branch)} /> : <span>No branches yet</span>}</div></section>
        <div className="spell-page__actions"><button className="quiet-button" onClick={() => loadSpell(spellDetail.spell)}>Load for casting</button><button className="bind-button" onClick={() => beginRemix(spellDetail.spell)}>Remix this page</button></div>
      </aside>}
      {attunement && <section className={`attunement ${attunementStep === 'ask' ? '' : 'attunement--guide'}`} aria-modal={attunementStep === 'ask' ? 'true' : undefined} role={attunementStep === 'ask' ? 'dialog' : undefined} aria-labelledby="attunement-title" ref={attunementStep === 'ask' ? dialogRef : undefined} tabIndex={attunementStep === 'ask' ? -1 : undefined}><div className="attunement__sigil">{attunementStep === 'pose' ? '◇' : attunementStep === 'trace' ? '⌁' : '✦'}</div><p className="eyebrow">First attunement · {attunementStep === 'ask' ? 'one' : attunementStep === 'trace' ? 'two' : 'three'} of three</p><h1 id="attunement-title">{attunementStep === 'ask' ? 'Show your hands.' : attunementStep === 'trace' ? 'Trace the first rune.' : 'Hold a fist for stone.'}</h1><p>{attunementStep === 'ask' ? 'Your hands are read on your device. No video ever leaves it.' : attunementStep === 'trace' ? 'Pinch thumb to index, draw one small line, then release.' : 'Hold the pose until the ring in your mirror closes.'}</p><div>{attunementStep === 'ask' ? <><button className="bind-button" onClick={startHands}>{stageReady ? 'Begin attunement' : 'Begin when the stage wakes'}</button><button className="quiet-button" onClick={() => finishAttunement('Your mouse and touch input are ready whenever you are.')}>Use a humbler wand</button></> : <button className="quiet-button" onClick={() => finishAttunement('Your mouse and touch input are ready whenever you are.')}>Skip the ritual</button>}</div></section>}
    </main>
  );
}
