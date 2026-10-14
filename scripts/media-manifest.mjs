/**
 * Surfaces for generated media — the single list every fal-media fetch runs.
 *
 * `kind: 'image'` → openai/gpt-image-2.5/sunburst (text-to-image)
 * `kind: 'video'` → fal-ai/minimax/h3-max-turbo (image-to-video when `source`
 *                   names a file under public/, text-to-video otherwise)
 *
 * `source` is a repo-relative path inside public/ used as the first frame.
 * `out`   is the repo-relative destination under public/media/.
 *         Files first land in output/fal/media/ for review; a curated copy
 *         goes to public/ — see fal-media-fetch.mjs.
 */
export const JOBS = [
  {
    name: 'ritual-stage-still',
    kind: 'image',
    prompt:
      'An original serene ritual courtyard at dusk seen from a low doorway: a wide circular court of pale weathered stone, four carved elemental rune stones at the compass points, a shallow glowing sigil circle set into the paving, drifting incense mist, warm ember light, no people, no text, no symbols, atmospheric painterly-realistic game environment key art, cinematic, 16:9.',
    out: 'media/previews/ritual-stage.png'
  },
  {
    name: 'jade-citadel-preview',
    kind: 'video',
    source: 'world-priors/jade-citadel.jpg',
    prompt:
      'Slow ambient loop of the same citadel courtyard: waterfall mist drifts softly, tree branches sway gently in a light breeze, faint floating dust motes catch the light, camera holds completely still, no people appear, calm and seamless, subtle looping motion.',
    out: 'media/previews/jade-citadel.mp4'
  },
  {
    name: 'ember-basin-preview',
    kind: 'video',
    source: 'world-priors/ember-basin.jpg',
    prompt:
      'Slow ambient loop of the same volcanic basin city: recessed lava channels shimmer and glow with drifting heat haze, embers rise lazily, thin smoke drifts across rust-red peaks, camera holds completely still, no people appear, subtle looping motion.',
    out: 'media/previews/ember-basin.mp4'
  },
  {
    name: 'sky-sanctuary-preview',
    kind: 'video',
    source: 'world-priors/sky-sanctuary.jpg',
    prompt:
      'Slow ambient loop of the same alpine sanctuary: dawn mist flows gently through the terraces, clouds drift slowly below the refuge, a few banners stir in the wind, camera holds completely still, no people appear, subtle looping motion.',
    out: 'media/previews/sky-sanctuary.mp4'
  },
  {
    name: 'emerald-bay-preview',
    kind: 'video',
    source: 'world-priors/emerald-bay.jpg',
    prompt:
      'Slow ambient loop of the same island bay: mist lifts and drifts across the turquoise water, gentle ripples lap the rocky shore, limestone isles hold still in haze, camera holds completely still, no people appear, subtle looping motion.',
    out: 'media/previews/emerald-bay.mp4'
  },
  {
    name: 'ritual-stage-preview',
    kind: 'video',
    source: 'media/previews/ritual-stage.png',
    prompt:
      'Slow ambient loop of the same ritual courtyard: incense mist drifts across the carved stones, the sigil circle glows with a soft breathing pulse, ember light flickers gently, camera holds completely still, no people appear, subtle looping motion.',
    out: 'media/previews/ritual-stage.mp4'
  },
  ...[
    ['fire', 'a rising spiral of embers and fire ribbons', '#ff6a3c'],
    ['water', 'swirling ribbons of luminous water and mist', '#3fb8c9'],
    ['earth', 'floating shards of stone and sand orbiting slowly', '#c6a372'],
    ['air', 'spiraling wind currents with drifting leaves and streaks of light', '#bfe8df']
  ].map(([id, words, hex]) => ({
    name: `endcard-${id}`,
    kind: 'image',
    prompt: `Cinematic wide 16:9 end-card for an elemental fantasy game: a lone caster seen from behind at center, ${words} around them, dark charcoal background with deep vignette, ${hex} accent light, painterly, high contrast, generous empty space in the upper third, no text, no letters, no logos, no watermark.`,
    out: `media/intro/endcard-${id}.png`
  })),
  ...[
    ['fire', 'a rising spiral of embers and fire ribbons', '#ff6a3c'],
    ['water', 'swirling ribbons of luminous water and mist', '#3fb8c9'],
    ['earth', 'floating shards of stone and sand orbiting slowly', '#c6a372'],
    ['air', 'spiraling wind currents with drifting leaves and streaks of light', '#bfe8df']
  ].map(([id, words, hex]) => ({
    name: `ward-${id}-still`,
    kind: 'image',
    prompt: `Top-down cinematic view of a circular ritual ward on a dark stone floor, a ring of carved ward stones all ignited with ${words}, glowing sigil lines connecting the stones, ${hex} light, mystical, 16:9, no text, no letters, no logos.`,
    out: `media/rite/ward-${id}.png`
  })),
  ...[
    ['fire', '#ff6a3c'],
    ['water', '#3fb8c9'],
    ['earth', '#c6a372'],
    ['air', '#bfe8df']
  ].map(([id, hex]) => ({
    name: `ward-${id}-video`,
    kind: 'video',
    source: `media/rite/ward-${id}.png`,
    prompt: `The ward stones flare one after another and the sigil ring ignites, a soft column of ${hex} light rises from the center then settles into a calm steady glow; slow camera push-in; no text.`,
    out: `media/rite/ward-${id}.mp4`
  }))
];
