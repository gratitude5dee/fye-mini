'use client';

import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
type SpellDetail = { spell: Spell; ancestors: Spell[]; descendants: Spell[] };
type FeedSort = 'trending' | 'newest' | 'remixed';
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

// The house shelf makes the offline stage feel intentional. As soon as Atlas
// answers, this is replaced by the stored pages and never used as analytics.
const HOUSE_SPELLS: Spell[] = [
  { slug: 'cinderwake', name: 'Cinderwake', element: 'fire', incantation: 'a low, hungry flame that hugs the ground and detonates twice', lore: 'It runs close to the floor, red at its teeth and gold at its heart. The second answer arrives just as the first ember begins to settle.', tags: ['hungry', 'low', 'double-strike'], genome: { pace: .61, mass: .44, chaos: .63, radiance: .81, menace: .72 }, stats: { casts: 0 } },
  { slug: 'sun-petal', name: 'Sun-Petal', element: 'fire', incantation: 'a slow blossom of white-gold fire that opens at the end of the path', lore: 'A patient spark gathers its light until the path has ended, then unfolds in quiet white-gold layers. Its warmth lingers like a held breath finally released.', tags: ['white-gold', 'slow', 'blossom'], genome: { pace: .28, mass: .46, chaos: .19, radiance: .95, menace: .26 }, stats: { casts: 0 } },
  { slug: 'vermilion-adder', name: 'Vermilion Adder', element: 'fire', incantation: 'a fast violet-red serpent that strikes hard at the finish', lore: 'Violet light threads a red body that refuses to travel straight. At the last instant it gathers its heat, snaps forward, and leaves a thin ember-bright scar in the air.', tags: ['violet-red', 'serpent', 'striking'], genome: { pace: .91, mass: .31, chaos: .76, radiance: .7, menace: .83 }, stats: { casts: 0 } },
  { slug: 'moon-whip', name: 'Moon Whip', element: 'water', incantation: 'a thin cold arc of moonlit water that snaps at the end', lore: 'Cut from a low tide beneath a cloudless moon, this narrow lash keeps its silence until the final crack. It favors a sure hand and leaves pale foam where it has passed.', tags: ['cold', 'precise', 'lunar'], genome: { pace: .72, mass: .21, chaos: .28, radiance: .69, menace: .34 }, stats: { casts: 0 } },
  { slug: 'harbor-bell', name: 'Harbor Bell', element: 'water', incantation: 'a heavy, slow swell that rings out wide foam rings on impact', lore: 'A broad blue weight rolls forward without hurry, carrying the stillness of a harbor at dusk. When it lands, pale rings travel outward as if the water has remembered a distant bell.', tags: ['heavy', 'slow', 'foam'], genome: { pace: .2, mass: .85, chaos: .18, radiance: .48, menace: .41 }, stats: { casts: 0 } },
  { slug: 'undertow', name: 'Undertow', element: 'water', incantation: 'a deep teal surge that drags low and crowns tall', lore: 'Deep teal water stays close to the ground before rising into a bright, crowned finish. Its pull is steady rather than violent, the kind that asks loose things to follow.', tags: ['teal', 'low', 'crowned'], genome: { pace: .56, mass: .67, chaos: .46, radiance: .64, menace: .62 }, stats: { casts: 0 } },
  { slug: 'terrace-of-the-patient-king', name: 'Terrace of the Patient King', element: 'earth', incantation: 'a slow, wide paving that ends in a tall tower', lore: 'Stone rises in deliberate syllables, each plate bearing the memory of the one below it. At the end, a quiet column waits for the world to speak first.', tags: ['steady', 'wide', 'regal'], genome: { pace: .24, mass: .88, chaos: .22, radiance: .33, menace: .49 }, stats: { casts: 0 } },
  { slug: 'gravel-psalm', name: 'Gravel Psalm', element: 'earth', incantation: 'quick shallow plates that crack early and settle softly', lore: 'Small plates answer in a quick rhythm, splitting before their edges have found the ground. The dust settles sooner than expected, as though the earth has finished a familiar prayer.', tags: ['quick', 'shallow', 'soft'], genome: { pace: .68, mass: .39, chaos: .52, radiance: .27, menace: .28 }, stats: { casts: 0 } },
  { slug: 'basalt-procession', name: 'Basalt Procession', element: 'earth', incantation: 'narrow dark plates marching in file to a squat obelisk', lore: 'Dark slabs move one after another with no wasted motion. Their final obelisk is short, broad, and certain, a marker for a road that exists only while the spell is spoken.', tags: ['basalt', 'narrow', 'obelisk'], genome: { pace: .47, mass: .79, chaos: .31, radiance: .19, menace: .66 }, stats: { casts: 0 } },
  { slug: 'sparrow-gale', name: 'Sparrow Gale', element: 'air', incantation: 'a quick, light spiral that scatters leaves and is gone', lore: 'A small wind with a bird’s sudden nerve takes the loose things first, then slips through the fingers of anyone who thinks to hold it.', tags: ['quick', 'light', 'restless'], genome: { pace: .91, mass: .11, chaos: .55, radiance: .46, menace: .18 }, stats: { casts: 0 } },
  { slug: 'whistling-door', name: 'Whistling Door', element: 'air', incantation: 'a slow wide vortex that ends in a pressure clap', lore: 'The air opens gradually, a wide pale doorway turning on its own hinge. At the end it closes with a soft, startling clap that rearranges dust and attention alike.', tags: ['wide', 'vortex', 'pressure'], genome: { pace: .33, mass: .36, chaos: .57, radiance: .58, menace: .45 }, stats: { casts: 0 } },
  { slug: 'sky-lathe', name: 'Sky Lathe', element: 'air', incantation: 'a tight, fast helix that polishes the air white', lore: 'A tight helix cuts upward so quickly that its center turns white. It does not tear the sky; it burnishes it, leaving the stage briefly brighter than it was before.', tags: ['tight', 'fast', 'white'], genome: { pace: .95, mass: .19, chaos: .67, radiance: .85, menace: .39 }, stats: { casts: 0 } }
];

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

async function capturePortrait() {
  event('grimoire:portrait');
  await new Promise((resolve) => window.setTimeout(resolve, 650));
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

function LineageBranches({ parentId, nodes, onOpen, depth = 0 }: { parentId?: string; nodes: Spell[]; onOpen: (spell: Spell) => void; depth?: number }) {
  if (!parentId || depth > 12) return null;
  const children = nodes.filter((node) => node.lineage?.parentId === parentId);
  if (!children.length) return null;
  return <div className="lineage-tree__branches">{children.map((child) => <div className="lineage-tree__branch" key={child._id ?? child.slug}><button style={{ '--branch-indent': `${depth * 15}px` } as CSSProperties} onClick={() => onOpen(child)}>{child.name}</button><LineageBranches parentId={child._id} nodes={nodes} onOpen={onOpen} depth={depth + 1} /></div>)}</div>;
}

export function GrimoireStage() {
  const [element, setElement] = useState<ElementId>('fire');
  const [view, setView] = useState<'stage' | 'grimoire' | 'almanac'>('stage');
  const [attunement, setAttunement] = useState(true);
  const [attunementStep, setAttunementStep] = useState<'ask' | 'trace' | 'pose'>('ask');
  const [spellwrightOpen, setSpellwrightOpen] = useState(true);
  const [incantation, setIncantation] = useState('a low, hungry flame that hugs the ground and detonates twice');
  const [reply, setReply] = useState('Name what the fire is becoming.');
  const [isCrafting, setIsCrafting] = useState(false);
  const [spells, setSpells] = useState<Spell[]>(HOUSE_SPELLS);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | ElementId>('all');
  const [sort, setSort] = useState<FeedSort>('trending');
  const [searching, setSearching] = useState(false);
  const [loreDraft, setLoreDraft] = useState<LoreDraft | null>(null);
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

  const shownSpells = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return spells;
    return spells.filter((spell) => [spell.name, spell.incantation, spell.lore, ...spell.tags].join(' ').toLowerCase().includes(normalized));
  }, [query, spells]);

  useEffect(() => {
    let current = true;
    void import('../src/main.js').catch(() => current && setReply('The stage needs a clearer sky. Refresh to summon it again.'));
    void fetch('/api/identity').catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    const browser = window as Window & typeof globalThis & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    setVoiceAvailable(Boolean(VOICE_FEATURE_ENABLED && (browser.SpeechRecognition || browser.webkitSpeechRecognition)));
    return () => {
      recognition.current?.abort();
      recognition.current = null;
    };
  }, []);

  useEffect(() => {
    const onCast = () => setAttunementStep((step) => step === 'trace' ? 'pose' : step);
    window.addEventListener('grimoire:cast', onCast);
    return () => window.removeEventListener('grimoire:cast', onCast);
  }, []);

  useEffect(() => {
    const onSelected = (event: Event) => {
      const next = (event as CustomEvent<{ element?: ElementId }>).detail?.element;
      if (next) {
        setElement(next);
        if (next === 'earth' && attunementStep === 'pose') setAttunement(false);
      }
    };
    window.addEventListener('grimoire:selected', onSelected);
    return () => window.removeEventListener('grimoire:selected', onSelected);
  }, [attunementStep]);

  useEffect(() => {
    if (view !== 'almanac') return;
    void fetch('/api/almanac')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setAnalytics(data))
      .catch(() => setAnalytics({ totalCasts: null, elementShare: [], daily: [], trending: [], source: 'stage' }));
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
        .then((data: { spells?: Spell[]; source?: string }) => {
          if (version !== queryVersion.current || !active || data.source === 'stage') return;
          setSpells(data.spells ?? []);
        })
        .catch((error: unknown) => { if ((error as { name?: string }).name !== 'AbortError') return; })
        .finally(() => { if (version === queryVersion.current && active) setSearching(false); });
    }, query.trim() ? 220 : 0);
    let active = true;
    return () => { active = false; controller.abort(); window.clearTimeout(delay); };
  }, [view, query, filter, sort]);

  const selectElement = (next: ElementId) => {
    setElement(next);
    event('grimoire:select', { element: next });
  };

  const adjustDial = (path: string, value: number) => {
    setDialValues((current) => ({ ...current, [path]: value }));
    event('grimoire:patch', { [path]: value });
  };

  const craft = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (!incantation.trim()) return;
    setIsCrafting(true);
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
    setBindStatus('Capturing the bright moment…');
    try {
      const settingsModule = await import('../src/config/spell-contract.js');
      const portraitUrl = await capturePortrait();
      const response = await fetch('/api/lore', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ incantation, element, settings: settingsModule.snapshotSpellSettings() })
      });
      if (!response.ok) throw new Error();
      const draft = await response.json() as LoreDraft;
      setLoreDraft({ ...draft, portraitUrl });
      setCustomName('');
      setBindStatus(portraitUrl ? 'Choose the page title.' : 'Choose the page title. The portrait will remain a sigil until the gallery wakes.');
    } catch {
      setBindStatus('The Lorekeeper is resting. Try again in a moment.');
    }
  };

  const finishBind = async (name: string) => {
    const boundName = name.trim();
    if (!boundName) {
      setBindStatus('Give the page a name before binding it.');
      return;
    }
    setBindStatus('Binding your spell into the book…');
    try {
      const settingsModule = await import('../src/config/spell-contract.js');
      const response = await fetch('/api/spells', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: boundName, incantation, element, draftId: loreDraft?.draftId, portrait: { imageUrl: loreDraft?.portraitUrl ?? null }, ...(remixParent?._id ? { parentId: remixParent._id } : {}), settings: settingsModule.snapshotSpellSettings() })
      });
      if (!response.ok) throw new Error();
      const { spell } = await response.json() as { spell: Spell };
      setSpells((existing) => [spell, ...existing.filter((entry) => entry.slug !== spell.slug)]);
      setLoreDraft(null);
      setBindStatus(`${spell.name} answers from the Grimoire.`);
      setSelectedSpell(spell);
      setRemixParent(null);
      selectElement(spell.element);
      event('grimoire:load-spell', { spell });
      setView('grimoire');
    } catch {
      setBindStatus('The binding could not reach Atlas. Your live spell remains safe on stage.');
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
    setAttunementStep('trace');
    event('grimoire:attune');
  };

  return (
    <main className="grimoire-stage">
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

      <header className="grimoire-topbar">
        <button className="wordmark" onClick={() => setView('stage')} aria-label="Return to the casting stage">
          <span>The Living</span><strong>Grimoire</strong>
        </button>
        <p className="stage-prompt">{selectedSpell ? `Holding ${selectedSpell.name}` : 'Show your hands.'}</p>
        <nav aria-label="Grimoire navigation">
          <button className={view === 'grimoire' ? 'is-active' : ''} onClick={() => setView(view === 'grimoire' ? 'stage' : 'grimoire')}>Discover</button>
          <button className={view === 'almanac' ? 'is-active' : ''} onClick={() => setView(view === 'almanac' ? 'stage' : 'almanac')}>Almanac</button>
        </nav>
      </header>

      <div className="grimoire-element-dock" aria-label="Choose an element">
        {ELEMENTS.map((entry) => (
          <button key={entry.id} data-element={entry.id} className={element === entry.id ? 'is-active' : ''} style={{ '--accent': entry.color } as CSSProperties} onClick={() => selectElement(entry.id)}>
            <span>{entry.sigil}</span>{entry.label}
          </button>
        ))}
      </div>

      <aside className={`spellwright ${spellwrightOpen ? 'is-open' : ''}`} aria-label="Spellwright">
        <button className="spellwright__tab" onClick={() => setSpellwrightOpen((open) => !open)}>{spellwrightOpen ? 'Close' : 'Spellwright'}</button>
        <div className="spellwright__inside">
          <p className="eyebrow">The Spellwright</p>
          <h2>Speak the shape you seek.</h2>
          <form onSubmit={craft}>
            <textarea value={incantation} onChange={(event) => setIncantation(event.target.value)} rows={4} aria-label="Spell incantation" placeholder="A violet serpent of fire…" />
            <button type="submit" disabled={isCrafting}>{isCrafting ? 'Writing…' : 'Alter the spell'}</button>
          </form>
          {voiceAvailable && <div className="voice-control"><button type="button" className={voiceListening ? 'is-listening' : ''} onClick={toggleVoice} aria-pressed={voiceListening}>{voiceListening ? 'Stop dictation' : 'Dictate incantation'} <small>Beta</small></button><span>{voiceStatus || 'Optional browser dictation.'}</span></div>}
          <p className="spellwright__reply">{reply}</p>
          <div className="spellwright__actions">
            <button className="quiet-button" onClick={() => event('grimoire:toggle-dials')}>Full dials <kbd>G</kbd></button>
            <button className="bind-button" onClick={beginBind}>Bind this spell</button>
          </div>
          {remixParent && <p className="remix-note">Remixing from <b>{remixParent.name}</b> · <button onClick={() => setRemixParent(null)}>clear branch</button></p>}
          <div className="quick-dials" aria-label={`${element} quick dials`}>
            <span>Eight living dials</span>
            {QUICK_DIALS[element].map(({ path, label }) => {
              const range = dialRanges[path];
              const value = dialValues[path];
              return <label key={path}><b>{label}</b><input type="range" min={range?.min ?? 0} max={range?.max ?? 1} step={range?.step ?? .01} value={Number.isFinite(value) ? value : range?.min ?? 0} onChange={(event) => adjustDial(path, Number(event.target.value))} /><em>{Number.isFinite(value) ? value.toFixed(range?.step && range.step >= 1 ? 0 : 2) : '—'}</em></label>;
            })}
          </div>
          {bindStatus && <p className="bind-status">{bindStatus}</p>}
          {loreDraft && <div className="name-choice"><span>Choose its name</span>{loreDraft.names.map((name) => <button key={name} onClick={() => finishBind(name)}>{name}</button>)}<form onSubmit={(event) => { event.preventDefault(); void finishBind(customName); }}><input value={customName} onChange={(event) => setCustomName(event.target.value)} maxLength={56} placeholder="Or write your own name" aria-label="Your own spell name" /><button type="submit" disabled={!customName.trim()}>Bind your own name</button></form></div>}
        </div>
      </aside>

      {view === 'grimoire' && <aside className="book-drawer" aria-label="The Grimoire">
        <div className="book-drawer__head"><div><p className="eyebrow">The book is open</p><h2>Cast what calls to you.</h2></div><button onClick={() => setView('stage')} aria-label="Close grimoire">×</button></div>
        <label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find by name or meaning" aria-label="Search the Grimoire" /></label>
        <div className="book-controls" aria-label="Discover filters"><div>{(['all', ...ELEMENTS.map((entry) => entry.id)] as Array<'all' | ElementId>).map((entry) => <button key={entry} className={filter === entry ? 'is-active' : ''} onClick={() => setFilter(entry)}>{entry === 'all' ? 'All' : entry}</button>)}</div><select value={sort} onChange={(event) => setSort(event.target.value as FeedSort)} aria-label="Sort spells"><option value="trending">Trending</option><option value="newest">Newest</option><option value="remixed">Most remixed</option></select></div>
        <p className="search-note">{searching ? 'Listening for distant pages…' : query && !shownSpells.length ? 'Nothing answers to that name — but these are near in spirit.' : 'Keyword and meaning, bound together.'}</p>
        <div className="spell-list">
          {shownSpells.map((spell) => <button className="spell-card" key={spell.slug} onClick={() => void openSpellPage(spell)}><CanvasMark spell={spell} /><span className="spell-card__body"><small>{spell.element}</small><strong>{spell.name}</strong><em>{spell.lore}</em><Genome genome={spell.genome} /><span>{spell.stats?.casts ?? 0} casts · {spell.tags.slice(0, 2).join(' · ')}</span></span></button>)}
        </div>
      </aside>}

      {spellDetail && <aside className="spell-page" aria-label={`${spellDetail.spell.name} spell page`}>
        <div className="book-drawer__head"><div><p className="eyebrow">Bound page {detailLoading ? '· tracing lineage…' : ''}</p><h2>{spellDetail.spell.name}</h2></div><button onClick={() => setSpellDetail(null)} aria-label="Close spell page">×</button></div>
        <div className="spell-page__hero"><CanvasMark spell={spellDetail.spell} /><div><small>{spellDetail.spell.element} · {spellDetail.spell.creator?.handle ?? 'The First Binder'}</small><p>{spellDetail.spell.incantation}</p><span>{spellDetail.spell.stats?.casts ?? 0} casts remembered</span></div></div>
        <section className="spell-page__lore"><p className="eyebrow">Lore</p><p>{spellDetail.spell.lore}</p><div>{spellDetail.spell.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section>
        <section className="spell-page__genome"><p className="eyebrow">Genome</p><GenomeRadar genome={spellDetail.spell.genome} /></section>
        <section className="lineage-tree"><p className="eyebrow">Lineage</p><div className="lineage-tree__path">{spellDetail.ancestors.length ? spellDetail.ancestors.map((ancestor) => <button key={ancestor.slug} onClick={() => void openSpellPage(ancestor)}>{ancestor.name}</button>) : <span>First known page</span>}<b>{spellDetail.spell.name}</b>{spellDetail.descendants.length ? <LineageBranches parentId={spellDetail.spell._id} nodes={spellDetail.descendants} onOpen={(branch) => void openSpellPage(branch)} /> : <span>No branches yet</span>}</div></section>
        <div className="spell-page__actions"><button className="quiet-button" onClick={() => loadSpell(spellDetail.spell)}>Load for casting</button><button className="bind-button" onClick={() => beginRemix(spellDetail.spell)}>Remix this page</button></div>
      </aside>}

      {view === 'almanac' && <aside className="almanac" aria-label="The Almanac">
        <div className="book-drawer__head"><div><p className="eyebrow">A living record</p><h2>The Almanac</h2></div><button onClick={() => setView('stage')} aria-label="Close almanac">×</button></div>
        <div className="almanac__total"><span>Casts remembered · last 90 days</span><strong>{analytics.source === 'atlas' ? analytics.totalCasts ?? 0 : '—'}</strong><em>{analytics.source === 'atlas' ? analytics.totalCasts ? 'the book is listening' : 'The Almanac is early. Make the first mark.' : 'The Almanac wakes when Atlas is bound.'}</em></div>
        {analytics.source === 'atlas' && <>
          <section><p>Element share</p>{analytics.elementShare.length ? <div className="element-share"><ElementDonut entries={analytics.elementShare} total={analytics.totalCasts ?? 0} /><div>{analytics.elementShare.map((entry) => <div className="meter" key={entry.element}><span>{entry.element}</span><i style={{ width: `${Math.min(100, entry.casts / Math.max(1, analytics.totalCasts ?? 0) * 100)}%` }} /><b>{entry.casts}</b></div>)}</div></div> : <em className="almanac-empty">No element has been cast yet.</em>}</section>
          <section><p>Castings by day</p>{analytics.daily.length ? <div className="daily-bars">{analytics.daily.slice(-28).map((entry) => <span key={`${entry.day}-${entry.element}`} title={`${entry.element}: ${entry.casts}`} style={{ '--height': `${Math.min(100, 14 + entry.casts * 12)}%`, '--element': ELEMENTS.find((item) => item.id === entry.element)?.color } as CSSProperties} />)}</div> : <em className="almanac-empty">The first line appears with the first cast.</em>}</section>
          <section><p>Trending pages · seven days</p>{analytics.trending.length ? analytics.trending.map(({ spell, casts }) => <button className="almanac-spell" key={spell.slug} onClick={() => loadSpell(spell)}><CanvasMark spell={spell} compact /><span><strong>{spell.name}</strong><em>{casts} recent castings</em></span></button>) : <em className="almanac-empty">No pages are trending yet.</em>}</section>
        </>}
      </aside>}

      {attunement && <section className={`attunement ${attunementStep === 'ask' ? '' : 'attunement--guide'}`} aria-modal={attunementStep === 'ask' ? 'true' : undefined} role="dialog" aria-label="Attune to the stage"><div className="attunement__sigil">{attunementStep === 'pose' ? '◇' : attunementStep === 'trace' ? '⌁' : '✦'}</div><p className="eyebrow">First attunement · {attunementStep === 'ask' ? 'one' : attunementStep === 'trace' ? 'two' : 'three'} of three</p><h1>{attunementStep === 'ask' ? 'Show your hands.' : attunementStep === 'trace' ? 'Trace the first rune.' : 'Hold a fist for stone.'}</h1><p>{attunementStep === 'ask' ? 'Your hands are read on your device. No video ever leaves it.' : attunementStep === 'trace' ? 'Pinch thumb to index, draw one small line, then release.' : 'Hold the pose until the ring in your mirror closes.'}</p><div>{attunementStep === 'ask' ? <><button className="bind-button" onClick={startHands}>Begin attunement</button><button className="quiet-button" onClick={() => setAttunement(false)}>Use a humbler wand</button></> : <button className="quiet-button" onClick={() => setAttunement(false)}>Skip the ritual</button>}</div></section>}
    </main>
  );
}
