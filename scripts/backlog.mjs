import { uid } from './lib.mjs';

export function removeBacklogGame(collection, id) {
  const game = collection.games.find(game => game.id === id);
  if (!game || game.status !== 'backlog' || game.section === 'live-service') throw new Error('Only saved backlog games can be removed here.');
  collection.bundles ||= [];
  const sourceUrl = game.sources?.vndb || game.sources?.igdb || '';
  for (const edition of collection.bundles) {
    for (const item of edition.contents) {
      if (item.gameId !== id) continue;
      item.gameId = '';
      item.label ||= game.title;
      item.sourceUrl ||= sourceUrl;
      if (edition.contents.length === 1) {
        edition.cover ||= game.cover;
        edition.metadata ||= game.metadata;
      }
    }
  }
  for (const copy of game.copies || []) {
    collection.bundles.push({ ...copy,
      id: collection.bundles.some(edition => edition.id === copy.id) ? uid() : copy.id,
      cover: game.cover, metadata: game.metadata,
      contents: [{ gameId: '', label: game.title, sourceUrl }]
    });
  }
  collection.games = collection.games.filter(game => game.id !== id);
  return collection;
}
