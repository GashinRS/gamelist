import { readFile, writeFile, mkdir, rename, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { sectionOf, statusesFor, platforms, normalizePlatform } from '../web/collection-model.js';
import { defaultGuide } from '../web/profile.js';
import { editionGroup } from '../web/physical.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, 'data/collection.json');
export const STATUSES = ['playing', 'completed', 'backlog', 'on-hold', 'dropped'];
export const load = async () => JSON.parse(await readFile(DATA, 'utf8'));
export const uid = () => randomUUID();
export function safeURL(value) {
  if (!value) return '';
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}
export function assetPath(value) {
  return typeof value === 'string' && /^assets\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(value);
}
function string(value, max = 1000) { return typeof value === 'string' ? value.slice(0, max) : ''; }
function metadataRecord(r) {
  if (!r || typeof r !== 'object') return null;
  return { id: string(String(r.id || ''), 40), title: string(r.title, 300), url: safeURL(r.url),
    summary: string(r.summary, 12000), released: string(r.released, 20),
    developers: (Array.isArray(r.developers) ? r.developers : []).map(x => string(x, 200)).slice(0, 30),
    genres: (Array.isArray(r.genres) ? r.genres : []).map(x => string(x, 100)).slice(0, 30),
    safety: string(r.safety, 30), cover: assetPath(r.cover) ? r.cover : null };
}
export function cleanMetadata(m) {
  if (!m || typeof m !== 'object') return null;
  return { igdb: metadataRecord(m.igdb), vndb: metadataRecord(m.vndb),
    coverPolicy: ['safe', 'sensitive', 'unrated', 'missing', 'not-rated'].includes(m.coverPolicy) ? m.coverPolicy : 'missing',
    fetchedAt: string(m.fetchedAt, 40), coverHidden: m.coverHidden === true, matchNote: string(m.matchNote, 1000),
    candidates: (Array.isArray(m.candidates) ? m.candidates : []).slice(0, 30).map(c => ({ provider: string(c.provider, 10), id: string(String(c.id), 40), title: string(c.title, 300), url: safeURL(c.url) })) };
}
export function normalizeDate(value) {
  const s = string(value, 10).replace(/-00-00$/, '').replace(/-00$/, '');
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(s) || s.startsWith('0000')) return '';
  const [year, month, day] = s.split('-').map(Number);
  if (month != null && (month < 1 || month > 12)) return '';
  if (day != null && (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate())) return '';
  return s;
}
export function cleanGame(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid game record.');
  const title = string(input.title, 300).trim();
  if (!title) throw new Error('A game title is required.');
  if (input.section != null && !['games', 'live-service'].includes(input.section)) throw new Error('Invalid collection section.');
  if (input.status === 'wishlist') input = {...input, status:'backlog'};
  const section = sectionOf(input);
  const platform = normalizePlatform(input.platform);
  if (platform && !platforms.includes(platform)) throw new Error('Choose a platform from the Played on list.');
  if (!Object.hasOwn(statusesFor(section), input.status)) throw new Error(`Invalid status for ${title}.`);
  const copies = (Array.isArray(input.copies) ? input.copies : []).filter(c => c.format !== 'digital').map(c => {
    if (c.format !== 'physical') throw new Error('Only physical copies are tracked.');
    return {
      id: string(c.id, 100) || uid(), format: c.format, ownership: c.ownership === 'wishlist' ? 'wishlist' : 'owned',
      edition: string(c.edition, 200) || 'Standard edition',
      editionType: editionGroup(c),
      platform: normalizePlatform(string(c.platform, 100)), region: string(c.region, 100), language: string(c.language, 100),
      storefront: string(c.storefront, 100), releaseUrl: safeURL(c.releaseUrl), notes: string(c.notes, 4000),
      photos: (Array.isArray(c.photos) ? c.photos : []).map(p => {
        if (!assetPath(p.src)) throw new Error('Photos must be local assets uploaded through the editor.');
        return { src: p.src, caption: string(p.caption, 500), publish: p.publish === true };
      })
    };
  });
  const metadata = cleanMetadata(input.metadata);
  let cover = input.cover && assetPath(input.cover.src)
    ? { src: input.cover.src, publish: input.cover.publish === true,
      origin: ['igdb','vndb','manual'].includes(input.cover.origin) ? input.cover.origin : 'manual', sfwOverride: input.cover.sfwOverride === true } : null;
  if (metadata && (metadata.coverHidden || ['sensitive', 'unrated'].includes(metadata.coverPolicy)) && !(cover?.origin === 'manual' && cover.sfwOverride)) cover = null;
  const sources = {};
  for (const key of ['hltb', 'igdb', 'vndb']) if (safeURL(input.sources?.[key])) sources[key] = safeURL(input.sources[key]);
  return {
    id: string(input.id, 100) || uid(), title, section, status: input.status,
    platform,
    startedOn: normalizeDate(input.startedOn),
    completedOn: normalizeDate(input.completedOn),
    playedStorefront: string(input.playedStorefront, 100),
    playtime: string(input.playtime, 30),
    rating: input.rating !== '' && input.rating != null && Number.isFinite(Number(input.rating))
      ? Math.min(10, Math.max(1, Number(input.rating))) : null,
    notes: string(input.notes, 10000), sources, cover, copies, metadata
  };
}
export function validate(data) {
  if (data.version !== 1 || !Array.isArray(data.games)) throw new Error('Expected a version 1 collection.');
  const games = data.games.map(cleanGame);
  if (new Set(games.map(g => g.id)).size !== games.length) throw new Error('Duplicate game IDs.');
  const gameIds = new Set(games.map(g=>g.id));
  const bundles = (Array.isArray(data.bundles) ? data.bundles : []).map(b=>{
    const copy = cleanGame({title:'Bundle',status:'backlog',copies:[{...b,format:'physical'}]}).copies[0];
    const contents = (Array.isArray(b.contents) ? b.contents : []).map(item=>{
      if (item.gameId && !gameIds.has(item.gameId)) throw new Error('A bundle links to a game that is not in the collection.');
      const label = string(item.label,300).trim();
      if (!item.gameId && !label) throw new Error('An unlinked bundle item needs a title.');
      return {gameId:item.gameId || '',label,sourceUrl:safeURL(item.sourceUrl)};
    });
    if(!contents.length) throw new Error('Add at least one game to the bundle.');
    if(new Set(contents.map(i=>i.gameId+'\0'+i.label)).size!==contents.length) throw new Error('Duplicate included game in bundle.');
    const art = cleanGame({title:b.edition || 'Release',status:'backlog',cover:b.cover,metadata:b.metadata});
    return {...copy,contents,cover:art.cover,metadata:art.metadata};
  });
  if(new Set(bundles.map(b=>b.id)).size!==bundles.length) throw new Error('Duplicate bundle IDs.');
  return { version: 1, profile: { picture: assetPath(data.profile?.picture) ? data.profile.picture : '', favorites: Object.fromEntries(['story','gameplay','soundtrack','artstyle','cast'].map(key=>[key,[...new Set((Array.isArray(data.profile?.favorites?.[key])?data.profile.favorites[key]:[]).map(title=>string(title,300).trim()).filter(Boolean))].slice(0,5)])), hardware: string(data.profile?.hardware, 10000), name: string(data.profile?.name, 100) || 'Gashin', title: string(data.profile?.title, 100) || 'Games', bio: string(data.profile?.bio ?? 'Games I’ve played and collected.', 2000), scoreIntro: string(data.profile?.scoreIntro ?? 'My scores reflect how much I enjoyed a game, rather than an attempt to rate it objectively.', 2000), scoringGuide: string(data.profile?.scoringGuide ?? defaultGuide, 10000) }, importInfo: data.importInfo || null, games, bundles };
}
export async function save(data) {
  const clean = validate(data);
  await mkdir(path.join(ROOT, 'backups'), { recursive: true });
  await copyFile(DATA, path.join(ROOT, 'backups', `${Date.now()}-${uid()}.json`));
  const tmp = `${DATA}.${uid()}.tmp`;
  await writeFile(tmp, JSON.stringify(clean, null, 2) + '\n');
  await rename(tmp, DATA);
  return clean;
}
export function publicCollection(data) {
  const clean = validate(data);
  for (const b of clean.bundles) {
    b.photos = b.photos.filter(p=>p.publish);
    if (!b.cover?.publish) b.cover = null;
    if (b.metadata) { delete b.metadata.candidates; for (const p of ['igdb','vndb']) if (b.metadata[p]) delete b.metadata[p].cover; }
  }
  for (const g of clean.games) {
    if (!g.cover?.publish) g.cover = null;
    for (const c of g.copies) c.photos = c.photos.filter(p => p.publish);
    if (g.metadata) {
      delete g.metadata.candidates;
      for (const p of ['igdb', 'vndb']) if (g.metadata[p]) delete g.metadata[p].cover;
    }
  }
  return clean;
}
