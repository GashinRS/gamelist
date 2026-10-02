import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, load, save } from './lib.mjs';
import { searchIGDB, searchVNDB, matchCandidates, summarize, downloadCover } from './providers.mjs';
async function exists(asset) { if (!asset) return false; try { await access(path.join(ROOT, asset)); return true; } catch { try { await access(path.join(ROOT, 'public-assets', path.basename(asset))); return true; } catch { return false; } } }
export async function enrichGame(game, options = {}) {
  const { refresh = false, mappings = {} } = options;
  const services = options.services || { searchIGDB, searchVNDB, downloadCover };
  const mapping = mappings[game.id] || mappings[game.title] || {};
  const igdbId = mapping.igdb ?? game.sources?.igdb ?? game.metadata?.igdb?.id;
  const vndbId = mapping.vndb ?? game.sources?.vndb?.match(/vndb\.org\/(v\d+)/)?.[1] ?? game.metadata?.vndb?.id;
  const igdbQuery = mapping.igdbQuery || game.title, vnQuery = mapping.vndbQuery || game.title;
  // Sequential requests keep VNDB's execution budget predictable. Response cache makes reruns cheap.
  const igdbCandidates = mapping.igdb === false ? [] : await services.searchIGDB(igdbQuery, igdbId, refresh);
  const vndbCandidates = mapping.vndb === false ? [] : await services.searchVNDB(vnQuery, vndbId, refresh);
  const igdb = igdbId ? igdbCandidates[0] : matchCandidates(game.title, igdbCandidates, 'igdb', game.platform);
  const vndb = vndbId ? vndbCandidates[0] : matchCandidates(game.title, vndbCandidates, 'vndb');
  const mi = summarize(igdb, 'igdb'), mv = summarize(vndb, 'vndb');
  const coverPolicy = mapping.sensitive === true ? 'sensitive' : mv?.safety || (mi ? 'not-rated' : 'missing');
  const hidden = ['sensitive', 'unrated'].includes(coverPolicy);
  const candidateList = [
    ...(!igdb ? igdbCandidates.slice(0, 10).map(c => ({ provider: 'igdb', id: c.id, title: c.name, url: c.url })) : []),
    ...(!vndb ? vndbCandidates.slice(0, 10).map(c => ({ provider: 'vndb', id: c.id, title: c.title, url: `https://vndb.org/${c.id}` })) : [])
  ];
  if (!hidden) {
    if (mi && igdb.cover?.image_id) {
      mi.cover = !refresh && String(game.metadata?.igdb?.id) === mi.id && await exists(game.metadata?.igdb?.cover) ? game.metadata.igdb.cover
        : await services.downloadCover(`https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${igdb.cover.image_id}.jpg`, `igdb-${igdb.id}`);
    }
    if (mv && mv.safety === 'safe') {
      mv.cover = !refresh && game.metadata?.vndb?.id === mv.id && await exists(game.metadata?.vndb?.cover) ? game.metadata.vndb.cover
        : await services.downloadCover(vndb.image.url, `vndb-${vndb.id}`);
    }
  }
  const metadata = { igdb: mi, vndb: mv, coverPolicy, coverHidden: game.metadata?.coverHidden === true,
    fetchedAt: new Date().toISOString(), candidates: candidateList, matchNote: mapping.note || '' };
  const sources = { ...game.sources }; if (mi) sources.igdb = mi.url; if (mv) sources.vndb = mv.url;
  if (mapping.igdb === false) delete sources.igdb;
  if (mapping.vndb === false) delete sources.vndb;
  // An existing manual cover is never replaced. A sensitive VN never silently falls back to IGDB.
  const selected = mv ? mv.cover : mi?.cover;
  const manual = game.cover && (!game.cover.origin || game.cover.origin === 'manual');
  const cover = manual ? game.cover : selected && !metadata.coverHidden && !hidden
    ? { src: selected, publish: true, origin: mv ? 'vndb' : 'igdb', sfwOverride: false } : null;
  return { ...game, sources, metadata, cover };
}
export async function readMappings() { try { return JSON.parse(await readFile(path.join(ROOT, 'data/matches.json'), 'utf8')); } catch { return {}; } }
async function main() {
  const args = process.argv.slice(2), refresh = args.includes('--refresh');
  const one = args.indexOf('--game'), only = one >= 0 ? args[one + 1] : '';
  const mappings = await readMappings(); const collection = await load();
  const report = []; let done = 0;
  for (const game of collection.games) {
    if (only && game.id !== only && game.title !== only) continue;
    try {
      const next = await enrichGame(game, { refresh, mappings });
      // Re-read before writing to preserve edits made in the local editor during a long batch.
      const latest = await load(), index = latest.games.findIndex(g => g.id === game.id);
      if (index < 0) continue;
      const current = latest.games[index];
      const manual = current.cover && (!current.cover.origin || current.cover.origin === 'manual');
      latest.games[index] = { ...current, sources: next.sources, metadata: { ...next.metadata, coverHidden: current.metadata?.coverHidden === true },
        cover: manual ? current.cover : next.cover };
      await save(latest);
      const item = { title: game.title, id: game.id, igdb: next.metadata.igdb?.id || null, vndb: next.metadata.vndb?.id || null,
        cover: next.cover?.origin || null, policy: next.metadata.coverPolicy, candidates: next.metadata.candidates };
      report.push(item); console.log(`${++done}/${collection.games.length} ${game.title}: IGDB ${item.igdb || 'unmatched'}, VNDB ${item.vndb || 'unmatched'}, cover ${item.policy}`);
    } catch (e) { report.push({ title: game.title, error: e.message }); console.log(`${++done}/${collection.games.length} ${game.title}: ${e.message}`); }
    await mkdir(path.join(ROOT, 'work'), { recursive: true });
    await writeFile(path.join(ROOT, 'work/enrichment-report.json'), JSON.stringify(report, null, 2));
  }
  const result = await load();
  console.log(JSON.stringify({ games: result.games.length, igdb: result.games.filter(g => g.metadata?.igdb).length,
    vndb: result.games.filter(g => g.metadata?.vndb).length, covers: result.games.filter(g => g.cover?.publish).length,
    hidden: result.games.filter(g => ['sensitive','unrated'].includes(g.metadata?.coverPolicy)).length, errors: report.filter(r => r.error).length }));
  if (report.some(r => r.error)) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'scripts/enrich.mjs')) main().catch(e => { console.error(e.message); process.exitCode = 1; });
