# Game collection

A game collection website with a local editor for play history, physical editions, wishlists, profile favorites, and photos. The published site is read-only.

## Run and edit locally

Requires **Node.js 20 or newer**. From the project folder:

```powershell
npm run manage
```

Open **http://127.0.0.1:4174** to add and edit games, physical editions, and your profile. Changes save to `data/collection.json`; automatic backups are stored in `backups/`.

Use **Fetch from IGDB + VNDB** to find covers, or upload your own artwork. IGDB requires `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` in a local `.env` file; see `.env.example`. VNDB needs no credentials.

Select **Publish** for collection photos you want displayed. Save your changes, then click **Build site** to update the public output.

## Preview and publish

```powershell
npm run build
npm run preview
```

Open **http://127.0.0.1:4173** for the read-only preview.

To publish with GitHub Pages, select **GitHub Actions** under the repository's **Settings → Pages**. The included workflow builds and deploys pushes to `main`.

After editing, build before committing so the published images are updated:

```powershell
npm run build
git add .
git commit -m "Update collection"
git push
```

## Project files

- `data/collection.json` — collection and profile data.
- `web/` — website and editor interface.
- `scripts/` — local server and build tools.
- `public-assets/` — generated images included in Git.
- `assets/` — local uploads, excluded from Git.
- `dist/` — generated website, excluded from Git.
- `backups/` — automatic data backups, excluded from Git.

Keep `.env` private. Published collection data, notes, and selected images are public. Run `npm test` to check the project.

