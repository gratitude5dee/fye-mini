'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * Make an `aria-modal` element behave like one.
 *
 * The product shipped three elements carrying `role="dialog" aria-modal="true"`
 * — the opening and both side sheets — with no focus trap, no Escape, no focus
 * restoration and nothing marking the rest of the page inert. Assistive
 * technology was told they were modal; nothing about them was.
 *
 * Attach this to each one. It moves focus in, keeps Tab inside, closes on
 * Escape, hides the background from the accessibility tree, and puts focus back
 * where it came from — which matters most for the opening, since that is the
 * first thing a keyboard visitor meets.
 *
 * @param open whether the dialog is mounted and visible
 * @param onClose called on Escape; omit to make the dialog non-dismissable
 */
export function useDialog<T extends HTMLElement>(open: boolean, onClose?: () => void) {
  const ref = useRef<T>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    // Hide everything else from assistive technology. `inert` also blocks
    // pointer and focus, which is what makes the modality real rather than
    // announced. Siblings are recorded so a nested dialog cannot un-hide them.
    const hidden: HTMLElement[] = [];
    for (const sibling of Array.from(document.body.children)) {
      if (sibling === node || sibling.contains(node)) continue;
      const el = sibling as HTMLElement;
      if (el.hasAttribute('inert')) continue;
      el.setAttribute('inert', '');
      hidden.push(el);
    }

    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusables()[0];
    (first ?? node).focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const edge = event.shiftKey ? items[0] : items[items.length - 1];
      if (document.activeElement !== edge) return;
      event.preventDefault();
      (event.shiftKey ? items[items.length - 1] : items[0]).focus({ preventScroll: true });
    };

    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      for (const el of hidden) el.removeAttribute('inert');
      restoreTo.current?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  return ref;
}
