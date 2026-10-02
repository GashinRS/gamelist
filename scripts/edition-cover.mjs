import { enrichGame } from './enrich.mjs';

export async function fetchEditionCover(edition, services = {}) {
  const item = edition.contents?.[0] || {};
  const url = [edition.releaseUrl, item.sourceUrl].find(u => /^https?:\/\/(?:www\.)?vndb\.org\/[rv]\d+\/?$/.test(u || ''));
  let id = url?.match(/\/([rv]\d+)/)?.[1];
  if (id?.startsWith('r')) {
    const response = await (services.fetch || fetch)('https://api.vndb.org/kana/release', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({filters:['id','=',id],fields:'vns.id,vns.title',results:1}),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`VNDB release lookup failed (${response.status}).`);
    const vns = (await response.json()).results?.[0]?.vns || [];
    if (vns.length !== 1) throw new Error('This release contains multiple games or has no game match. Enter a VNDB game link to choose its cover.');
    id = vns[0].id;
  }
  const game = {id:edition.id,title:item.label || edition.edition,platform:edition.platform,sources:id?{vndb:`https://vndb.org/${id}`}:{}};
  const result = await (services.enrich || enrichGame)(game, {mappings:id?{[game.id]:{igdb:false}}:{}});
  if (!result.cover) throw new Error(['sensitive','unrated'].includes(result.metadata.coverPolicy)
    ? 'The database cover is hidden by the existing cover policy. Upload a suitable replacement instead.'
    : 'No confirmed cover found. Check the title or add a VNDB game/release link.');
  return {cover:result.cover,metadata:result.metadata};
}
