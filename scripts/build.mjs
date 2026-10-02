import { mkdir, readFile, writeFile, cp, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, load, publicCollection } from './lib.mjs';
export async function build() {
  const data = publicCollection(await load());
  const out = path.join(ROOT, 'dist');
  // Fixed output directory only; never derive deletion targets from input.
  if (out !== path.resolve(ROOT, 'dist')) throw new Error('Invalid build directory.');
  await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, 'assets'), { recursive: true });
  await cp(path.join(ROOT, 'web'), out, { recursive: true });
  await writeFile(path.join(out, 'collection.json'), JSON.stringify(data));
  await writeFile(path.join(out, '.nojekyll'), '');
  const assets = new Set(data.games.flatMap(g => [g.cover?.src, ...g.copies.flatMap(c => c.photos.map(p => p.src))]).filter(Boolean));
  if(data.profile.picture) assets.add(data.profile.picture);
  for(const bundle of data.bundles) { if(bundle.cover?.src) assets.add(bundle.cover.src); for(const photo of bundle.photos) assets.add(photo.src); }
  // Only approved images enter the public repository. Original uploads stay ignored.
  const approved = path.join(ROOT, 'public-assets');
  const contents = [];
  for (const asset of assets) {
    let bytes;
    try { bytes = await readFile(path.join(ROOT, asset)); }
    catch { bytes = await readFile(path.join(approved, path.basename(asset))); }
    contents.push([asset, bytes]);
  }
  if (approved !== path.resolve(ROOT, 'public-assets')) throw new Error('Invalid image directory.');
  await rm(approved, { recursive: true, force: true });
  await mkdir(approved, { recursive: true });
  for (const [asset, bytes] of contents) {
    await writeFile(path.join(out, asset), bytes);
    await writeFile(path.join(approved, path.basename(asset)), bytes);
  }
  console.log(`Built ${data.games.length} games and ${assets.size} approved images → dist/`);
  if (!data.games.length) console.log('Collection is empty: import your completed list in the local editor. No sample games were added.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'scripts/build.mjs')) {
  build().catch(e => { console.error(e.message); process.exitCode = 1; });
}
