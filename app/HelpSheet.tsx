'use client';

import { useDialog } from './useDialog';

/**
 * Everything the product does, in one place, written as rules rather than keys.
 *
 * The reference sandboxes this descends from take the same line: their help
 * panel lists the bindings and then spends as many rows on the things a player
 * would otherwise have to discover by losing — which casts are aimed with a
 * circle, that any cast reaching a target one-shots it, that pausing still
 * applies editor changes. Those notes are the useful half.
 *
 * So the sections below lead with what is true and put the key beside it. The
 * things worth knowing here are that only fire crosses a hazard on its own,
 * that a raised hand crosses with anything, that missing costs an attempt but
 * quietly widens the target, and that a Rite always ends even with a stone
 * dark.
 */

type Props = { onClose: () => void; open: boolean };

const ELEMENT_ROWS: Array<[string, string, string]> = [
  ['Fire', '1', 'Flies. The only element that crosses a hazard on its own.'],
  ['Water', '2', 'Rides a swell just off the ground. Will not clear a hazard.'],
  ['Stone', '3', 'Hugs the ground.'],
  ['Wind', '4', 'Hugs the ground, and travels fastest.']
];

const KEY_ROWS: Array<[string, string]> = [
  ['1 – 4', 'Choose an element. Works mid-stroke.'],
  ['Q / E', 'Cycle elements.'],
  ['M', 'Arm the ride for your next stroke.'],
  ['H or ?', 'Open and close this.'],
  ['G', 'Open the live editor.'],
  ['P', 'Pause. The editor keeps working.'],
  ['C', 'Clear every effect in flight.'],
  ['T', 'Seat the caster.'],
  ['Escape', 'Close any panel.'],
  ['Right-drag', 'Orbit. Scroll to zoom.']
];

export function HelpSheet({ onClose, open }: Props) {
  const ref = useDialog<HTMLElement>(open, onClose);
  if (!open) return null;

  return (
    <section className="side-sheet help-sheet" role="dialog" aria-modal="true" aria-labelledby="help-title" ref={ref} tabIndex={-1}>
      <button className="sheet-close" onClick={onClose} aria-label="Close help">×</button>
      <p className="eyebrow">How this works</p>
      <h2 id="help-title">Draw the line.</h2>

      <h3>The Rite</h3>
      <p className="sheet-copy">
        Rings light on the ground. Draw one line that passes through every ring without touching a hazard — the
        filled violet regions. There is no shape to copy: any line that does the job is right.
      </p>
      <ul className="help-notes">
        <li>Three attempts per line. Each miss quietly widens the rings.</li>
        <li>A stone lights for every line you answer, and may honestly stay dark. The Rite ends either way.</li>
        <li>Rings are drawn at exactly the size they are measured at. What you see is the target.</li>
        <li>Today&rsquo;s Rite is the same for everyone who opens it.</li>
      </ul>

      <h3>The elements</h3>
      <dl className="help-rows">
        {ELEMENT_ROWS.map(([name, key, note]) => (
          <div key={name}><dt><kbd>{key}</kbd> {name}</dt><dd>{note}</dd></div>
        ))}
      </dl>

      <h3>Casting with your hands</h3>
      <p className="sheet-copy">
        Desktop only, and never required. Everything below works with a pointer except the lift, which is the
        reason hands are here at all.
      </p>
      <p className="sheet-copy">After two pointer successes, FYE offers hand casting in the dock. It explains the
        local-only camera use before the browser asks, and <strong>Not now</strong> leaves pointer casting unchanged.</p>
      <ul className="help-notes">
        <li><strong>Wake it.</strong> Hold an open palm until the ring fills. Nothing casts before that.</li>
        <li><strong>Draw.</strong> Pinch thumb to finger, move, then open.</li>
        <li><strong>Lift.</strong> Raise your hand mid-stroke and the line leaves the ground, so any element can
          cross a hazard. A pointer is flat by construction and cannot do this.</li>
        <li><strong>Spread</strong> your fingers to widen the cast.</li>
        <li><strong>Rest.</strong> Lower your hand. Raise it to go on.</li>
        <li>Your camera never leaves this tab, and nothing is recorded.</li>
      </ul>

      <h3>Riding</h3>
      <p className="sheet-copy">
        Press <kbd>M</kbd> or <strong>Ride a path</strong>, then draw. Instead of casting, the caster leaps to the
        head of your line, folds onto an air scooter and rides it, banking into the turns, then dismounts.
      </p>

      <h3>The Workshop</h3>
      <p className="sheet-copy">
        Twelve presets and per-element dials. They change this browser&rsquo;s stage only — nothing is uploaded,
        and no preset can reach the rules of the Rite.
      </p>

      <h3>Keys</h3>
      <dl className="help-rows help-rows--keys">
        {KEY_ROWS.map(([key, note]) => (
          <div key={key}><dt><kbd>{key}</kbd></dt><dd>{note}</dd></div>
        ))}
      </dl>
    </section>
  );
}
