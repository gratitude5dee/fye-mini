const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const FLICK_WINDOW_MS = 80;

export function clampRect(rect, viewport, margin = 8) {
  const maxX = Math.max(margin, viewport.vw - rect.w - margin);
  const maxY = Math.max(margin, viewport.vh - rect.h - margin);
  return {
    ...rect,
    x: clamp(rect.x, margin, maxX),
    y: clamp(rect.y, margin, maxY)
  };
}

export function snapToEdge(rect, viewport, margin = 12) {
  const side = rect.x + rect.w / 2 < viewport.vw / 2 ? 'left' : 'right';
  const x = side === 'left' ? margin : Math.max(margin, viewport.vw - rect.w - margin);
  return { ...clampRect({ ...rect, x }, viewport, margin), side };
}

export function shouldDock({ dy, height, velocity }) {
  return dy > height * 0.28 || velocity > 0.55;
}

export function flickVelocity(samples, now) {
  if (!Array.isArray(samples) || !Number.isFinite(now)) return 0;
  const recent = samples.filter((sample) =>
    Number.isFinite(sample?.y) &&
    Number.isFinite(sample?.t) &&
    sample.t >= now - FLICK_WINDOW_MS &&
    sample.t <= now
  );
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const elapsed = last.t - first.t;
  return elapsed > 0 ? (last.y - first.y) / elapsed : 0;
}
