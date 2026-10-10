export const editionGroup = copy => ['limited','collectors'].includes(copy.editionType) ? 'limited' : 'standard';
export const physicalEntries = (games, bundles = []) => [
  ...games.flatMap(game => (game.copies || []).filter(copy=>copy.format==='physical').map(copy=>({game,copy}))),
  ...bundles.map(copy=>({copy,bundle:true,game:{id:'bundle-'+copy.id,title:copy.edition,copies:[],cover:copy.cover || null,metadata:copy.metadata || null},included:copy.contents.map(item=>({...item,game:games.find(g=>g.id===item.gameId)}))}))
];
export const physicalCopies = (games, bundles = []) => physicalEntries(games,bundles).filter(({copy})=>copy.ownership!=='wishlist');
export const bundlesForGame = (bundles, id) => (bundles || []).filter(b=>b.ownership!=='wishlist' && b.contents.some(i=>i.gameId===id));
export function gamePhysicalOwnership(game, bundles = []) {
  const linked = bundlesForGame(bundles, game.id);
  return {
    copies: [...(game.copies || []).filter(c=>c.format==='physical' && c.ownership!=='wishlist'),
      ...linked.filter(b=>b.contents.length===1).map(b=>({...b,editionId:b.id}))],
    bundles: linked.filter(b=>b.contents.length>1)
  };
}
export const ownershipBadges = (game, bundles = []) => {
  const copies = [...(game.copies || []), ...bundlesForGame(bundles, game.id)];
  return {physical: copies.some(c=>c.ownership!=='wishlist' && c.format==='physical'), limited: copies.some(c=>c.format==='physical' && editionGroup(c)==='limited')};
};
import { normalizeSearch } from './search.js';
export function findIncludedGame(games, item) {
  const linked=games.find(g=>g.id===item.gameId);
  if(linked)return linked;
  const vnId=String(item.sourceUrl||'').match(/vndb\.org\/(v\d+)/)?.[1];
  return games.find(g=>vnId && (g.metadata?.vndb?.id===vnId || String(g.sources?.vndb||'').match(/vndb\.org\/(v\d+)/)?.[1]===vnId)) ||
    games.find(g=>normalizeSearch(g.title)===normalizeSearch(item.label));
}
