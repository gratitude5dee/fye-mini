/**
 * Small, deterministic House portraits.
 *
 * The House shelf must still have distinct art before a browser has captured
 * a live spell or an object bucket has been configured. These are SVG plates
 * generated on demand by the application, rather than twelve checked-in
 * raster files: no third-party image host, binary asset, or runtime model is
 * needed to render a complete seed shelf.
 */
export const HOUSE_PORTRAIT_ROUTE = '/api/house-portraits';

const PORTRAITS = Object.freeze({
  cinderwake: {
    title: 'Cinderwake', element: 'fire', number: 'I', accent: '#ff6a3c', light: '#ffbf58', shadow: '#5b170f',
    motif: `<path d="M84 474C174 390 247 472 314 403c57-58 109-77 192-69" class="stroke thick"/><path d="M80 505c93-55 147 35 245-24 65-39 129-17 191-57" class="stroke fine"/><circle cx="159" cy="445" r="13" class="core"/><circle cx="393" cy="401" r="20" class="core"/><path d="M400 395c-21-61 27-100 3-157 62 47 80 106 26 168Z" class="solid"/>`
  },
  'sun-petal': {
    title: 'Sun-Petal', element: 'fire', number: 'II', accent: '#ffd476', light: '#fff3c9', shadow: '#743116',
    motif: `<g class="petals"><path d="M300 405C211 338 203 244 279 196c41 69 45 131 21 209Z"/><path d="M300 405c-15-105 36-164 117-165 2 80-32 132-117 165Z"/><path d="M300 405c72-87 157-78 207-11-71 39-135 37-207 11Z"/><path d="M300 405c87 57 80 146 13 204-40-68-42-132-13-204Z"/><path d="M300 405c-74 84-159 72-202 4 73-35 136-29 202-4Z"/><path d="M300 405c-94-45-92-133-34-193 48 64 53 127 34 193Z"/></g><circle cx="300" cy="405" r="43" class="core"/><circle cx="300" cy="405" r="14" fill="#100f0d"/>`
  },
  'vermilion-adder': {
    title: 'Vermilion Adder', element: 'fire', number: 'III', accent: '#ef4f4a', light: '#c976dc', shadow: '#531329',
    motif: `<path d="M87 544C112 285 435 535 427 294c-5-126-146-132-163-44-17 82 91 78 135 10" class="stroke thick"/><path d="M420 291l80-29-42 74Z" class="solid"/><circle cx="302" cy="306" r="10" class="core"/><path d="M133 551c72 45 146 35 210-7" class="stroke fine"/>`
  },
  'moon-whip': {
    title: 'Moon Whip', element: 'water', number: 'IV', accent: '#65d9ec', light: '#e1fbff', shadow: '#164b70',
    motif: `<path d="M126 267a156 156 0 1 0 227 215 122 122 0 1 1-227-215Z" class="solid"/><path d="M132 494c93-132 201-50 283-147 42-49 71-104 90-158" class="stroke thick"/><path d="M125 521c115-78 179 15 288-80" class="stroke fine"/><circle cx="478" cy="223" r="14" class="core"/>`
  },
  'harbor-bell': {
    title: 'Harbor Bell', element: 'water', number: 'V', accent: '#3fb8c9', light: '#c8f3fb', shadow: '#164b70',
    motif: `<path d="M300 221c-80 0-124 68-124 157v75h248v-75c0-89-44-157-124-157Z" class="solid"/><path d="M159 500c86 43 197 43 282 0M124 548c106 61 246 61 352 0M91 605c126 82 291 82 417 0" class="stroke fine"/><circle cx="300" cy="475" r="18" class="core"/><path d="M300 166v55" class="stroke thick"/>`
  },
  undertow: {
    title: 'Undertow', element: 'water', number: 'VI', accent: '#177d8c', light: '#9be6e4', shadow: '#123a55',
    motif: `<path d="M83 510c59-142 163-177 241-88 62 72 126 39 190-95-12 170-105 260-203 228-91-29-145 36-228 81Z" class="solid"/><path d="M99 542c90-32 145-93 207-50 72 49 142-2 190-89" class="stroke thick"/><path d="M119 593c134-6 187-89 252-50 57 34 100 17 145-22" class="stroke fine"/><circle cx="405" cy="346" r="18" class="core"/>`
  },
  'terrace-of-the-patient-king': {
    title: 'Terrace of the Patient King', element: 'earth', number: 'VII', accent: '#c9a46e', light: '#f0d3a1', shadow: '#35291e',
    motif: `<path d="m109 568 190-92 192 92-192 92Z" class="solid dim"/><path d="m151 477 148-72 148 72-148 72Z" class="solid"/><path d="m191 398 108-52 108 52-108 52Z" class="solid bright"/><path d="m268 346 31-112 32 112-32 14Z" class="solid"/><path d="M109 568v41l190 92 192-92v-41" class="stroke fine"/>`
  },
  'gravel-psalm': {
    title: 'Gravel Psalm', element: 'earth', number: 'VIII', accent: '#a08a63', light: '#d5b78c', shadow: '#35291e',
    motif: `<path d="m122 522 52-148 90 103-31 125ZM287 600l22-185 104 44 35 129ZM432 419l50-86 36 105-52 50ZM108 341l73-76 37 74-57 57Z" class="solid"/><path d="m83 607 63-37m45 84 72-39m60 37 59-53m41 17 84-27m-267-316 17 142m151 44 53 109" class="stroke fine"/><circle cx="335" cy="328" r="16" class="core"/>`
  },
  'basalt-procession': {
    title: 'Basalt Procession', element: 'earth', number: 'IX', accent: '#81735d', light: '#d6c79c', shadow: '#27231f',
    motif: `<path d="m265 573 36-282 37 282-37 52Z" class="solid"/><path d="m98 631 83-41 72 35-85 42Zm177-86 68-34 58 29-68 35Zm134-70 52-26 46 23-52 26Zm-257 91 23-59 54 24-24 59Zm74-89 22-55 48 23-22 55Z" class="solid dim"/><path d="M100 665h400" class="stroke fine"/><circle cx="301" cy="260" r="14" class="core"/>`
  },
  'sparrow-gale': {
    title: 'Sparrow Gale', element: 'air', number: 'X', accent: '#9eddd5', light: '#f3fffd', shadow: '#41666a',
    motif: `<path d="M111 493c65-175 237-206 337-95 80 89-4 212-164 161-119-37-126-133-45-181" class="stroke thick"/><path d="m319 407 118-109-58 118 115-23-104 58 86 60-126-19" class="stroke fine"/><path d="m131 304 60 54m-28-102 42 81m47-106 17 95" class="stroke fine"/><circle cx="298" cy="406" r="15" class="core"/>`
  },
  'whistling-door': {
    title: 'Whistling Door', element: 'air', number: 'XI', accent: '#bfe8df', light: '#f3fffd', shadow: '#41666a',
    motif: `<path d="M300 186c-103 0-186 97-186 219s83 219 186 219 186-97 186-219-83-219-186-219Z" class="stroke fine"/><path d="M300 232c-76 0-138 76-138 173s62 173 138 173 138-76 138-173-62-173-138-173Z" class="stroke thick"/><path d="M300 281c-49 0-89 54-89 124s40 124 89 124 89-54 89-124-40-124-89-124Z" class="stroke fine"/><path d="M300 343v123" class="stroke thick"/><circle cx="300" cy="405" r="18" class="core"/>`
  },
  'sky-lathe': {
    title: 'Sky Lathe', element: 'air', number: 'XII', accent: '#d8fffb', light: '#ffffff', shadow: '#4c7c81',
    motif: `<path d="M306 183c-99 73 105 88 3 152-103 64 99 94-3 159-101 64 100 79 4 148" class="stroke thick"/><path d="M274 183c99 73-105 88-3 152 103 64-99 94 3 159 101 64-100 79-4 148" class="stroke fine"/><path d="M246 174v463m108-463v463" class="stroke fine"/><circle cx="290" cy="410" r="26" class="core"/><circle cx="290" cy="410" r="8" fill="#100f0d"/>`
  }
});

export const HOUSE_PORTRAIT_SLUGS = Object.freeze(Object.keys(PORTRAITS));

function portraitFor(slug) {
  return typeof slug === 'string' && Object.hasOwn(PORTRAITS, slug) ? PORTRAITS[slug] : null;
}

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]);
}

/** Returns the public, immutable URL persisted on a House spell document. */
export function housePortraitUrl(slug) {
  return portraitFor(slug) ? `${HOUSE_PORTRAIT_ROUTE}/${slug}.svg` : null;
}

/**
 * Render an art-directed SVG plate for a House page. `null` is intentional
 * for unknown slugs so the HTTP route can return a real 404 rather than a
 * plausible portrait for an arbitrary path.
 */
export function housePortraitSvg(slug) {
  const portrait = portraitFor(slug);
  if (!portrait) return null;
  const id = `house-${slug}`;
  const title = escapeXml(`${portrait.title} — House ${portrait.element} spell portrait`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" role="img" aria-labelledby="${id}-title ${id}-description">
  <title id="${id}-title">${title}</title>
  <desc id="${id}-description">A deterministic, generated portrait plate for the House spell ${escapeXml(portrait.title)}.</desc>
  <defs>
    <linearGradient id="${id}-ground" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#100f0d"/><stop offset=".52" stop-color="${portrait.shadow}"/><stop offset="1" stop-color="#100f0d"/></linearGradient>
    <radialGradient id="${id}-halo"><stop stop-color="${portrait.light}" stop-opacity=".68"/><stop offset=".42" stop-color="${portrait.accent}" stop-opacity=".16"/><stop offset="1" stop-color="${portrait.shadow}" stop-opacity="0"/></radialGradient>
    <filter id="${id}-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="12"/></filter>
    <pattern id="${id}-grain" width="19" height="19" patternUnits="userSpaceOnUse"><path d="M2 3h1M12 7h1M6 15h1M17 17h1" stroke="${portrait.light}" stroke-opacity=".16"/></pattern>
  </defs>
  <style>.stroke{fill:none;stroke:${portrait.accent};stroke-linecap:round;stroke-linejoin:round}.thick{stroke-width:21}.fine{stroke:${portrait.light};stroke-width:4;opacity:.72}.solid{fill:${portrait.accent};fill-opacity:.84}.solid.dim{fill:${portrait.shadow};stroke:${portrait.accent};stroke-width:3}.solid.bright{fill:${portrait.light};fill-opacity:.88}.core{fill:${portrait.light};filter:url(#${id}-glow)}.petals{fill:${portrait.accent};fill-opacity:.73;stroke:${portrait.light};stroke-width:3;stroke-linejoin:round}</style>
  <rect width="600" height="800" fill="#100f0d"/>
  <rect width="600" height="800" fill="url(#${id}-ground)"/>
  <ellipse cx="300" cy="410" rx="272" ry="318" fill="url(#${id}-halo)"/>
  <rect x="22" y="22" width="556" height="756" rx="8" fill="none" stroke="${portrait.light}" stroke-opacity=".45"/>
  <rect x="30" y="30" width="540" height="740" rx="4" fill="url(#${id}-grain)" opacity=".48"/>
  <path d="M58 128H542M58 684H542" class="fine" stroke-dasharray="2 13"/>
  <text x="58" y="88" fill="${portrait.light}" fill-opacity=".85" font-family="Georgia, serif" font-size="18" letter-spacing="5">HOUSE / ${portrait.element.toUpperCase()}</text>
  <text x="542" y="88" text-anchor="end" fill="${portrait.light}" fill-opacity=".85" font-family="Georgia, serif" font-size="18">${portrait.number}</text>
  <g>${portrait.motif}</g>
  <text x="300" y="734" text-anchor="middle" fill="#efe7d8" font-family="Georgia, serif" font-size="33" letter-spacing="1">${escapeXml(portrait.title)}</text>
  <text x="300" y="760" text-anchor="middle" fill="${portrait.light}" fill-opacity=".72" font-family="Inter, Arial, sans-serif" font-size="11" letter-spacing="4">THE LIVING GRIMOIRE</text>
</svg>`;
}
