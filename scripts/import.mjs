import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { load, save } from './lib.mjs';
import { parseImport, mergeImport } from './importer.mjs';
const filename = process.argv[2];
if (!filename) { console.error('Usage: npm run import -- path/to/completed.csv (or .json / .txt)'); process.exitCode = 1; }
else {
  try {
    const parsed = parseImport(await readFile(filename, 'utf8'), path.extname(filename).slice(1));
    const result = mergeImport(await load(), parsed.games);
    await save(result.collection);
    console.log(`Added ${result.added} games; ${result.duplicates} duplicates; ${parsed.skipped} rows skipped. Existing edits and ownership preserved. Run npm run build next.`);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
