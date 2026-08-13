'use client';

import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from 'react';
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
  settings?: Record<string, unknown>;
};

type LoreDraft = { names: string[]; lore: string; tags: string[] };

const ELEMENTS: Array<{ id: ElementId; sigil: string; label: string; color: string }> = [
  { id: 'fire', sigil: 'ᛉ', label: 'Ember', color: '#FF6A3C' },
  { id: 'water', sigil: '◒', label: 'Tide', color: '#3FB8C9' },
  { id: 'earth', sigil: '◇', label: 'Stone', color: '#A08A63' },
  { id: 'air', sigil: '⌁', label: 'Gale', color: '#BFE8DF' }
];

const HOUSE_SPELLS: Spell[] = [
  {
    slug: 'moon-whip', name: 'Moon Whip', element: 'water',
    incantation: 'a thin cold arc of moonlit water that snaps at the end',
    lore: 'Cut from a low tide beneath a cloudless moon, this narrow lash keeps its silence until the final crack. It favors a sure hand and leaves pale foam where it has passed.',
    tags: ['cold', 'precise', 'lunar'],
    genome: { pace: .72, mass: .21, chaos: .28, radiance: .69, menace: .34 }, stats: { casts: 148 }
  },
  {
    slug: 'cinderwake', name: 'Cinderwake', element: 'fire',
    incantation: 'a low, hungry flame that hugs the ground and detonates twice',
    lore: 'It runs close to the floor, red at its teeth and gold at its heart. The second answer arrives just as the first ember begins to settle.',
    tags: ['hungry', 'low', 'double-strike'],
    genome: { pace: .61, mass: .44, chaos: .63, radiance: .81, menace: .72 }, stats: { casts: 212 }
  },
  {
    slug: 'terrace-of-the-patient-king', name: 'Terrace of the Patient King', element: 'earth',
    incantation: 'a slow, wide paving that ends in a tall tower',
    lore: 'Stone rises in deliberate syllables, each plate bearing the memory of the one below it. At the end, a quiet column waits for the world to speak first.',
    tags: ['steady', 'wide', 'regal'],
    genome: { pace: .24, mass: .88, chaos: .22, radiance: .33, menace: .49 }, stats: { casts: 97 }
  },
  {
    slug: 'sparrow-gale', name: 'Sparrow Gale', element: 'air',
    incantation: 'a quick, light spiral that scatters leaves and is gone',
    lore: 'A small wind with a bird’s sudden nerve. It takes the loose things first, then slips through the fingers of anyone who thinks to hold it.',
    tags: ['quick', 'light', 'restless'],
    genome: { pace: .91, mass: .11, chaos: .55, radiance: .46, menace: .18 }, stats: { casts: 126 }
  }
];

function event(name: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
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

export function GrimoireStage() {
  const [element, setElement] = useState<ElementId>('fire');
  const [view, setView] = useState<'stage' | 'grimoire' | 'almanac'>('stage');
  const [attunement, setAttunement] = useState(true);
  const [spellwrightOpen, setSpellwrightOpen] = useState(true);
  const [incantation, setIncantation] = useState('a low, hungry flame that hugs the ground and detonates twice');
  const [reply, setReply] = useState('Name what the fire is becoming.');
  const [isCrafting, setIsCrafting] = useState(false);
  const [spells, setSpells] = useState<Spell[]>(HOUSE_SPELLS);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loreDraft, setLoreDraft] = useState<LoreDraft | null>(null);
  const [bindStatus, setBindStatus] = useState('');
  const [selectedSpell, setSelectedSpell] = useState<Spell | null>(null);
  const [castCount, setCastCount] = useState(0);
  const [analytics, setAnalytics] = useState<{ totalCasts?: number; elementShare?: Array<{ element: string; casts: number }>; trending?: Spell[] }>({});

  const shownSpells = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return spells;
    return spells.filter((spell) => [spell.name, spell.incantation, spell.lore, ...spell.tags].join(' ').toLowerCase().includes(normalized));
  }, [query, spells]);

  useEffect(() => {
    let current = true;
    void import('../src/main.js').catch(() => current && setReply('The stage needs a clearer sky. Refresh to summon it again.'));
    const onCast = () => setCastCount((count) => count + 1);
    window.addEventListener('grimoire:cast', onCast);
    return () => {
      current = false;
      window.removeEventListener('grimoire:cast', onCast);
    };
  }, []);

  useEffect(() => {
    const onSelected = (event: Event) => {
      const next = (event as CustomEvent<{ element?: ElementId }>).detail?.element;
      if (next) setElement(next);
    };
    window.addEventListener('grimoire:selected', onSelected);
    return () => window.removeEventListener('grimoire:selected', onSelected);
  }, []);

  useEffect(() => {
    if (view !== 'almanac') return;
    void fetch('/api/almanac')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setAnalytics(data))
      .catch(() => setAnalytics({}));
  }, [view]);

  const selectElement = (next: ElementId) => {
    setElement(next);
    event('grimoire:select', { element: next });
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
      const response = await fetch('/api/lore', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ incantation, element, settings: settingsModule.snapshotSpellSettings() })
      });
      if (!response.ok) throw new Error();
      const draft = await response.json() as LoreDraft;
      setLoreDraft(draft);
      setBindStatus('Choose the page title.');
    } catch {
      setBindStatus('The Lorekeeper is resting. Try again in a moment.');
    }
  };

  const finishBind = async (name: string) => {
    setBindStatus('Binding your spell into the book…');
    try {
      const settingsModule = await import('../src/config/spell-contract.js');
      const benderId = localStorage.getItem('living-grimoire.bender-id') ?? crypto.randomUUID();
      localStorage.setItem('living-grimoire.bender-id', benderId);
      const response = await fetch('/api/spells', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, incantation, element, lore: loreDraft?.lore, tags: loreDraft?.tags, benderId, settings: settingsModule.snapshotSpellSettings() })
      });
      if (!response.ok) throw new Error();
      const { spell } = await response.json() as { spell: Spell };
      setSpells((existing) => [spell, ...existing.filter((entry) => entry.slug !== spell.slug)]);
      setLoreDraft(null);
      setBindStatus(`${spell.name} answers from the Grimoire.`);
      setView('grimoire');
    } catch {
      setBindStatus('The binding could not reach Atlas. Your live spell remains safe on stage.');
    }
  };

  const search = async (nextQuery: string) => {
    setQuery(nextQuery);
    if (!nextQuery.trim()) return;
    setSearching(true);
    try {
      const response = await fetch(`/api/spells?q=${encodeURIComponent(nextQuery)}&element=${element}`);
      if (!response.ok) throw new Error();
      const data = await response.json() as { spells?: Spell[] };
      if (data.spells?.length) setSpells(data.spells);
    } catch {
      // The local house pages remain a graceful fallback while a new Atlas project is being prepared.
    } finally {
      setSearching(false);
    }
  };

  const loadSpell = (spell: Spell) => {
    setSelectedSpell(spell);
    selectElement(spell.element);
    event('grimoire:load-spell', { spell });
    setReply(`${spell.name} is now in your hand.`);
    setView('stage');
  };

  const startHands = () => {
    setAttunement(false);
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
          <button key={entry.id} className={element === entry.id ? 'is-active' : ''} style={{ '--accent': entry.color } as CSSProperties} onClick={() => selectElement(entry.id)}>
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
          <p className="spellwright__reply">{reply}</p>
          <div className="spellwright__actions">
            <button className="quiet-button" onClick={() => event('grimoire:toggle-dials')}>Reveal the dials <kbd>G</kbd></button>
            <button className="bind-button" onClick={beginBind}>Bind this spell</button>
          </div>
          {bindStatus && <p className="bind-status">{bindStatus}</p>}
          {loreDraft && <div className="name-choice"><span>Choose its name</span>{loreDraft.names.map((name) => <button key={name} onClick={() => finishBind(name)}>{name}</button>)}</div>}
        </div>
      </aside>

      {view === 'grimoire' && <aside className="book-drawer" aria-label="The Grimoire">
        <div className="book-drawer__head"><div><p className="eyebrow">The book is open</p><h2>Cast what calls to you.</h2></div><button onClick={() => setView('stage')} aria-label="Close grimoire">×</button></div>
        <label className="search-field"><span>⌕</span><input value={query} onChange={(event) => void search(event.target.value)} placeholder="Find by name or meaning" aria-label="Search the Grimoire" /></label>
        <p className="search-note">{searching ? 'Listening for distant pages…' : query && !shownSpells.length ? 'Nothing answers to that name. These are near in spirit.' : 'Keyword and meaning, bound together.'}</p>
        <div className="spell-list">
          {shownSpells.map((spell) => <button className="spell-card" key={spell.slug} onClick={() => loadSpell(spell)}><CanvasMark spell={spell} /><span className="spell-card__body"><small>{spell.element}</small><strong>{spell.name}</strong><em>{spell.lore}</em><Genome genome={spell.genome} /><span>{spell.stats?.casts ?? 0} casts · {spell.tags.slice(0, 2).join(' · ')}</span></span></button>)}
        </div>
      </aside>}

      {view === 'almanac' && <aside className="almanac" aria-label="The Almanac">
        <div className="book-drawer__head"><div><p className="eyebrow">A living record</p><h2>The Almanac</h2></div><button onClick={() => setView('stage')} aria-label="Close almanac">×</button></div>
        <div className="almanac__total"><span>Casts remembered</span><strong>{analytics.totalCasts ?? castCount}</strong><em>the stage keeps counting</em></div>
        <section><p>Element share</p>{(analytics.elementShare?.length ? analytics.elementShare : ELEMENTS.map((entry, index) => ({ element: entry.id, casts: [42, 31, 18, 24][index] }))).map((entry) => <div className="meter" key={entry.element}><span>{entry.element}</span><i style={{ width: `${Math.min(100, entry.casts / Math.max(1, analytics.totalCasts ?? 115) * 100)}%` }} /><b>{entry.casts}</b></div>)}</section>
        <section><p>Trending pages</p>{(analytics.trending?.length ? analytics.trending : spells.slice(0, 3)).map((spell) => <button className="almanac-spell" key={spell.slug} onClick={() => loadSpell(spell)}><CanvasMark spell={spell} compact /><span><strong>{spell.name}</strong><em>{spell.stats?.casts ?? 0} castings</em></span></button>)}</section>
      </aside>}

      {attunement && <section className="attunement" aria-modal="true" role="dialog" aria-label="Attune to the stage"><div className="attunement__sigil">✦</div><p className="eyebrow">First attunement</p><h1>Show your hands.</h1><p>Your hands are read on your device. No video ever leaves it.</p><div><button className="bind-button" onClick={startHands}>Begin attunement</button><button className="quiet-button" onClick={() => setAttunement(false)}>Use a humbler wand</button></div></section>}
    </main>
  );
}
