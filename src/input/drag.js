const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
