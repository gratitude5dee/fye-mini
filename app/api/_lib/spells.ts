import { type Document } from 'mongodb';

export function slugify(value: string) {
  const stem = value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 52);
  return stem || 'untitled-spell';
}

export function spellForClient(document: Document) {
  const { _id, embedding, creator, updatedAt, createdAt, schemaVersion, ...spell } = document;
  return { _id: _id?.toString(), ...spell };
}

export function spellSearchText(spell: { name: string; incantation: string; lore: string; tags: string[] }) {
  return [spell.name, spell.incantation, spell.lore, ...spell.tags].join('\n');
}

export function paletteFor(element: string) {
  return {
    fire: ['#ff6a3c', '#ffbf58', '#5b170f'],
    water: ['#3fb8c9', '#c8f3fb', '#164b70'],
    earth: ['#a08a63', '#d5b78c', '#35291e'],
    air: ['#bfe8df', '#f3fffd', '#41666a']
  }[element] ?? ['#efe7d8', '#bcb0a0', '#1d1a16'];
}
