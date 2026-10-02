import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT, load, save, cleanGame, uid } from './lib.mjs';
import { parseImport, mergeImport } from './importer.mjs';
import { build } from './build.mjs';
import { enrichGame, readMappings } from './enrich.mjs';
import { fetchEditionCover } from './edition-cover.mjs';
const manage = process.argv.includes('--manage');
const port = Number(process.env.PORT || (manage ? 4174 : 4173));
const host = `127.0.0.1:${port}`;
const origin = `http://${host}`;
const token = randomBytes(32).toString('hex');
let writing = false;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
async function body(req) {
  let text = ''; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 18 * 1024 * 1024) throw new Error('Upload exceeds 18 MB.'); text += chunk; }
  return JSON.parse(text);
}
const server = http.createServer(async (req, res) => {
  const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
  try {
    if (req.headers.host !== host) return send(403, { error: 'Use the printed localhost URL.' });
    const pathname = decodeURIComponent(new URL(req.url, origin).pathname);
    if (pathname.startsWith('/api/')) {
      if (!manage) return send(404, { error: 'Read-only preview.' });
      if ((req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Local requests only.' });
      if (req.method === 'GET' && pathname === '/api/session') return send(200, { token });
      if (req.method === 'GET' && pathname === '/api/collection') return send(200, await load());
      if (req.method !== 'POST' || req.headers['x-editor-token'] !== token) return send(403, { error: 'Reopen the local editor.' });
      if (writing) return send(409, { error: 'Another save is in progress. Please try again.' });
      writing = true;
      try {
        const input = await body(req);
        if (pathname === '/api/edition-cover') return send(200, await fetchEditionCover(input));
        if (pathname === '/api/bundle') {
          const collection = await load(); collection.bundles ||= [];
          const index = collection.bundles.findIndex(b=>b.id===input.id);
          if(index<0) collection.bundles.push(input); else collection.bundles[index]=input;
          return send(200, await save(collection));
        }
        if (pathname === '/api/profile') {
          const collection = await load(); collection.profile = { ...collection.profile, ...input };
          return send(200, await save(collection));
        }
        if (pathname === '/api/enrich') {
          const collection = await load(); const index = collection.games.findIndex(g => g.id === input.id);
          if (index < 0) throw new Error('Save the game before fetching metadata.');
          const enriched = await enrichGame(collection.games[index], { refresh: input.refresh === true, mappings: await readMappings() });
          const latest = await load(); const currentIndex = latest.games.findIndex(g => g.id === input.id);
          if (currentIndex < 0) throw new Error('Game no longer exists.');
          latest.games[currentIndex] = enriched;
          return send(200, await save(latest));
        }
        if (pathname === '/api/game') {
          const collection = await load(); const game = cleanGame(input);
          const index = collection.games.findIndex(g => g.id === game.id);
          if (index < 0) collection.games.push(game); else collection.games[index] = game;
          return send(200, await save(collection));
        }
        if (pathname === '/api/import') {
          const parsed = parseImport(input.text, input.format);
          const result = mergeImport(await load(), parsed.games);
          if (input.preview) return send(200, { added: result.added, duplicates: result.duplicates, skipped: parsed.skipped, titles: parsed.games.slice(0, 8).map(g => g.title) });
          return send(200, { collection: await save(result.collection), added: result.added, duplicates: result.duplicates, skipped: parsed.skipped });
        }
        if (pathname === '/api/image') {
          if (typeof input.data !== 'string' || !input.data.startsWith('data:image/jpeg;base64,')) throw new Error('Upload a processed JPEG.');
          const bytes = Buffer.from(input.data.split(',')[1], 'base64');
          if (bytes.length > 12 * 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new Error('Invalid JPEG.');
          const asset = `assets/${uid()}.jpg`;
          await mkdir(path.join(ROOT, 'assets'), { recursive: true });
          await writeFile(path.join(ROOT, asset), bytes);
          return send(200, { src: asset, publish: false });
        }
        if (pathname === '/api/build') { await build(); return send(200, { message: 'Build ready in dist/. Commit and push to publish on GitHub Pages.' }); }
        return send(404, { error: 'Unknown operation.' });
      } finally { writing = false; }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'Method not allowed.' });
    const base = path.join(ROOT, manage ? 'web' : 'dist');
    let filename;
    if (manage && pathname.startsWith('/assets/')) filename = path.resolve(ROOT, '.' + pathname);
    else filename = path.resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
    const allowed = manage && pathname.startsWith('/assets/') ? path.join(ROOT, 'assets') : base;
    if (!filename.startsWith(allowed + path.sep)) return send(403, { error: 'Invalid path.' });
    let content;
    try { content = await readFile(filename); }
    catch (error) {
      if (manage && pathname.startsWith('/assets/') && /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(path.basename(filename))) content = await readFile(path.join(ROOT, 'public-assets', path.basename(filename)));
      else throw error;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (e) { send(e.code === 'ENOENT' ? 404 : 400, { error: e.code === 'ENOENT' ? 'File not found. Run npm run build for the public preview.' : e.message }); }
});
server.listen(port, '127.0.0.1', () => console.log(`${manage ? 'Local editor' : 'Public preview'}: ${origin}`));
server.on('error', e => { console.error(e.message); process.exitCode = 1; });
