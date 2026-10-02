import { cleanGame, uid } from './lib.mjs';

// RFC 4180-style reader: quoted commas, escaped quotes, multiline fields, BOM, CRLF.
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0];
  const sep = first.includes('\t') ? '\t' : ',';
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === sep || c === '\n')) {
      row.push(cell.replace(/\r$/, '')); cell = '';
      if (c === '\n') { if (row.some(v => v.trim())) rows.push(row); row = []; }
    } else cell += c;
  }
  if (quoted) throw new Error('Unclosed quoted field in CSV.');
  row.push(cell.replace(/\r$/, '')); if (row.some(v => v.trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (!headers.some(h => ['title', 'name', 'gamename', 'gametitle', 'game'].includes(h))) {
    throw new Error('CSV needs a Title, Name, Game, Game Name, or Game Title column. Alternatively paste one title per line.');
  }
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])));
}
export function parseImport(text, format = 'csv') {
  let rows;
  if (format === 'txt') rows = text.split(/\r?\n/).filter(s => s.trim()).map(title => ({ title }));
  else if (format === 'json') {
    const data = JSON.parse(text); rows = Array.isArray(data) ? data : data.games;
    if (!Array.isArray(rows)) throw new Error('JSON must be an array or contain a games array.');
  } else rows = parseCSV(text);
  let skipped = 0;
  const games = [];
  for (const original of rows) {
    const r = Object.fromEntries(Object.entries(original).map(([k, v]) => [k.toLowerCase().replace(/[^a-z0-9]/g, ''), v]));
    const title = r.title || r.gamename || r.gametitle || r.name || r.game;
    if (typeof title !== 'string' || !title.trim()) { skipped++; continue; }
    const isHLTBExport = 'completed' in r && 'playing' in r && 'backlog' in r;
    if (isHLTBExport && !['x', '1', 'true', 'yes'].includes(String(r.completed).trim().toLowerCase())) { skipped++; continue; }
    const status = String(r.status || r.list || '').toLowerCase().trim();
    if (status && !['completed', 'complete', 'finished', 'beaten', '100%'].includes(status)) { skipped++; continue; }
    const hltbId = r.gameid || r.hltbid;
    games.push(cleanGame({
      id: uid(), title: title.trim(), status: 'completed', platform: String(r.platform || r.playplatform || ''),
      startedOn: r.startedon || r.startdate || r.datestarted || '',
      completedOn: r.completedon || r.completiondate || r.datecompleted || r.datecomplete || '',
      playedStorefront: isHLTBExport ? String(r.storefront || '') : '',
      playtime: isHLTBExport ? exportPlaytime(r) : '',
      rating: isHLTBExport && Number(r.review) > 0 && Number(r.review) <= 100 ? Number(r.review) / 10 : null,
      notes: isHLTBExport ? [r.reviewnotes, r.generalnotes].filter(Boolean).join('\n\n') : '', cover: null, copies: [],
      sources: { hltb: /^\d+$/.test(String(hltbId)) ? `https://howlongtobeat.com/game/${hltbId}` : '' }
    }));
  }
  if (!games.length) throw new Error('No completed games found. Use an export of your completed list, or one title per line.');
  return { games, skipped, rows: rows.length };
}
export function exportPlaytime(row) {
  const valid = value => /^\d+:[0-5]\d:[0-5]\d$/.test(value || '');
  const seconds = value => value.split(':').map(Number).reduce((n, part)=>n*60+part, 0);
  // Use the highest recorded value; these categories are not additive.
  return ['progress','mainstory','mainsides','completionist','speedany','speed100'].map(k=>row[k]).filter(valid).sort((a,b)=>seconds(b)-seconds(a))[0] || '';
}
export function mergeImport(collection, incoming) {
  const titleKey = g => g.title.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const seenTitles = new Set(collection.games.map(titleKey));
  const seenURLs = new Set(collection.games.map(g => g.sources?.hltb).filter(Boolean));
  const added = []; let duplicates = 0;
  const games = collection.games.map(g=>({...g}));
  for (const game of incoming) {
    if (seenTitles.has(titleKey(game)) || (game.sources.hltb && seenURLs.has(game.sources.hltb))) {
      const existing = games.find(g=>titleKey(g)===titleKey(game) || (game.sources.hltb && g.sources?.hltb===game.sources.hltb));
      if (existing && !existing.playtime && game.playtime) existing.playtime=game.playtime;
      duplicates++; continue;
    }
    seenTitles.add(titleKey(game)); if (game.sources.hltb) seenURLs.add(game.sources.hltb); added.push(game);
  }
  return { collection: { ...collection, games: [...games, ...added], importInfo: { ...collection.importInfo, state: 'imported', importedAt: new Date().toISOString(), lastAdded: added.length } }, added: added.length, duplicates };
}
