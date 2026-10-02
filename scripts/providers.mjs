import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from './lib.mjs';
const cacheDir = path.join(ROOT, 'work/metadata-cache');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let credentials, accessToken;
const lastCall = { igdb: 0, vndb: 0 };
export async function env() {
  if (credentials) return credentials;
  let text = ''; try { text = await readFile(path.join(ROOT, '.env'), 'utf8'); } catch {}
  credentials = { ...process.env };
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !credentials[m[1]]) credentials[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return credentials;
}
async function token() {
  if (accessToken && accessToken.expires > Date.now()) return accessToken.value;
  const e = await env();
  if (!e.IGDB_CLIENT_ID || !e.IGDB_CLIENT_SECRET) throw new Error('Set IGDB_CLIENT_ID and IGDB_CLIENT_SECRET in .env.');
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: e.IGDB_CLIENT_ID, client_secret: e.IGDB_CLIENT_SECRET, grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`Twitch authentication failed (${response.status}). Check the local credentials.`);
  const result = await response.json();
  accessToken = { value: result.access_token, expires: Date.now() + (result.expires_in - 120) * 1000 };
  return accessToken.value;
}
async function query(provider, body, refresh = false) {
  const key = createHash('sha256').update(provider + body).digest('hex');
  const filename = path.join(cacheDir, key + '.json');
  if (!refresh) { try { return JSON.parse(await readFile(filename, 'utf8')); } catch {} }
  for (let attempt = 0; attempt < 5; attempt++) {
    await pause(Math.max(0, lastCall[provider] + (provider === 'vndb' ? 1650 : 280) - Date.now()));
    const headers = provider === 'igdb'
      ? { 'Client-ID': (await env()).IGDB_CLIENT_ID, Authorization: `Bearer ${await token()}`, 'Content-Type': 'text/plain' }
      : { 'Content-Type': 'application/json' };
    lastCall[provider] = Date.now();
    let response;
    try { response = await fetch(provider === 'igdb' ? 'https://api.igdb.com/v4/games' : 'https://api.vndb.org/kana/vn', { method: 'POST', headers, body, signal: AbortSignal.timeout(30000) }); }
    catch { if (attempt === 4) throw new Error(`${provider.toUpperCase()} network request failed.`); await pause(2000 * (attempt + 1)); continue; }
    if (response.status === 401 && provider === 'igdb' && attempt < 4) { accessToken = null; continue; }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 4) throw new Error(`${provider.toUpperCase()} temporarily unavailable (${response.status}). Retry enrichment later.`);
      await pause(Math.min(60000, Math.max(5000 * (attempt + 1), Number(response.headers.get('retry-after')) * 1000 || 0))); continue;
    }
    if (!response.ok) throw new Error(`${provider.toUpperCase()} query failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
    const result = await response.json();
    await mkdir(cacheDir, { recursive: true }); await writeFile(filename, JSON.stringify(result));
    return result;
  }
}
export async function searchIGDB(title, id, refresh = false) {
  let filter = `search ${JSON.stringify(title)};`;
  if (id && /^\d+$/.test(String(id))) filter = `where id = ${Number(id)};`;
  else if (id) {
    const u = new URL(id);
    if (!['www.igdb.com', 'igdb.com'].includes(u.hostname) || !/^\/games\/[^/]+\/?$/.test(u.pathname)) throw new Error('Use an IGDB game page URL.');
    filter = `where slug = ${JSON.stringify(u.pathname.split('/')[2])};`;
  }
  return query('igdb', `fields name,slug,url,summary,first_release_date,cover.image_id,platforms.name,genres.name,involved_companies.company.name,alternative_names.name; ${filter} limit 30;`, refresh);
}
export async function searchVNDB(title, id, refresh = false) {
  const result = await query('vndb', JSON.stringify({ filters: id ? ['id', '=', id] : ['search', '=', title],
    fields: 'title,alttitle,titles.title,titles.latin,aliases,description,released,platforms,developers.name,image.url,image.sexual,image.violence,image.votecount', results: 30 }), refresh);
  return result.results;
}
export const normalizeTitle = s => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^\p{L}\p{N}]/gu, '');
export function matchCandidates(title, candidates, provider, platform = '') {
  const norm = normalizeTitle(title);
  const names = c => provider === 'igdb' ? [c.name, ...(c.alternative_names || []).map(a => a.name)]
    : [c.title, c.alttitle, ...(c.titles || []).flatMap(t => [t.title, t.latin])];
  const exact = candidates.filter(c => names(c).filter(Boolean).some(n => normalizeTitle(n) === norm));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1 && platform) {
    const matches = exact.filter(c => (c.platforms || []).some(p => {
      const name = typeof p === 'string' ? p : p.name;
      return normalizeTitle(name) === normalizeTitle(platform) || (platform === 'PC' && /^(PC|Windows|win)/i.test(name));
    }));
    if (matches.length === 1) return matches[0];
  }
  return null;
}
export function vnSafety(record) {
  if (!record?.image?.url) return 'missing';
  if (record.image.sexual > 0 || record.image.violence > 0) return 'sensitive';
  if (!(record.image.votecount > 0) || record.image.sexual == null || record.image.violence == null) return 'unrated';
  return 'safe';
}
export function summarize(record, provider) {
  if (!record) return null;
  return { id: String(record.id), title: record.name || record.title,
    url: provider === 'igdb' ? record.url : `https://vndb.org/${record.id}`,
    summary: record.summary || record.description || '',
    released: provider === 'igdb' ? (record.first_release_date ? new Date(record.first_release_date * 1000).toISOString().slice(0, 10) : '') : record.released || '',
    developers: provider === 'igdb' ? [...new Set((record.involved_companies || []).map(c => c.company?.name).filter(Boolean))] : (record.developers || []).map(d => d.name),
    genres: provider === 'igdb' ? (record.genres || []).map(g => g.name) : ['Visual novel'],
    safety: provider === 'vndb' ? vnSafety(record) : 'not-rated', cover: null };
}
export async function downloadCover(url, name) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !['images.igdb.com', 't.vndb.org'].includes(u.hostname)) throw new Error('Cover host is not allowed.');
  const response = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Cover download failed (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 12 * 1024 * 1024) throw new Error('Cover exceeds 12 MB.');
  const ext = bytes[0] === 255 && bytes[1] === 216 ? 'jpg' : bytes.subarray(1, 4).toString() === 'PNG' ? 'png' : bytes.subarray(8, 12).toString() === 'WEBP' ? 'webp' : '';
  if (!ext) throw new Error('Unsupported cover image format.');
  const asset = `assets/${name}-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.${ext}`;
  await mkdir(path.join(ROOT, 'assets'), { recursive: true }); await writeFile(path.join(ROOT, asset), bytes);
  return asset;
}
