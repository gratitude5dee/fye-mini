/**
 * The only worlds FYE's operator is allowed to ask Marble to create.
 *
 * These are not player prompts.  They deliberately live in source so the
 * Worker cannot be turned into an expensive public world-generation proxy.
 */
export const WORLD_PRIORS = Object.freeze([
  {
    slug: 'jade-citadel',
    title: 'Jade Citadel',
    summary: 'A quiet mountain court of pale stone, jade roofs, and falling water.',
    imagePath: '/world-priors/jade-citadel.jpg',
    prompt: 'An original serene mountain citadel with broad stone courtyards, pale halls, jade roofs, carved bridges, forested hills, clear morning light, no people, no signs, and a safe open landing court.'
  },
  {
    slug: 'ember-basin',
    title: 'Ember Basin',
    summary: 'A basalt city held between warm lava channels and rust-red peaks.',
    imagePath: '/world-priors/ember-basin.jpg',
    prompt: 'An original volcanic basin city of dark basalt terraces, angular vermilion halls, safe recessed lava channels, wide walkable central plaza, rust mountains, late-afternoon haze, no people, no signs.'
  },
  {
    slug: 'emerald-bay',
    title: 'Emerald Bay',
    summary: 'Mist lifts from a clear island bay and its weathered stone paths.',
    imagePath: '/world-priors/emerald-bay.jpg',
    prompt: 'An original protected turquoise island bay with steep emerald limestone isles, misty coves, weathered stone arches, a safe rocky shore and clear walking paths, no people, boats, signs, or symbols.'
  },
  {
    slug: 'sky-sanctuary',
    title: 'Sky Sanctuary',
    summary: 'A wind-carved alpine refuge above the clouds.',
    imagePath: '/world-priors/sky-sanctuary.jpg',
    prompt: 'An original high alpine sanctuary carved into pale cliffs with sky-blue tiled observatory roofs, open wind terraces, a simple circular stone court, needle peaks, calm dawn mist, no people, signs, or insignias.'
  }
]);

export const RITUAL_WORLD = Object.freeze({
  id: 'ritual-stage',
  slug: 'ritual-stage',
  title: 'Ritual Stage',
  summary: 'The original local casting ground.',
  imagePath: null,
  kind: 'ritual'
});

export const priorFor = (slug) => WORLD_PRIORS.find((world) => world.slug === slug) ?? null;
export const isWorldSlug = (slug) => Boolean(priorFor(slug));
