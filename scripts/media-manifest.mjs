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
  }
];
