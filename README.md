# Gashin’s game shelf

A static, GitHub Pages-ready collection with a local editor. No dependencies or hosted database. Requires Node.js 20 or newer.

## Start here

```powershell
npm run manage
```

Open **http://127.0.0.1:4174**. Import a completed list, add or edit games, record owned copies, and upload your own cover and edition photos. Changes save to `data/collection.json`; previous versions are backed up in ignored `backups/`.

**Current import status:** imported 158 completed games from `HLTB_Games_2026-09-28.csv` (192 total rows; 34 non-completed rows skipped). Platforms, completion dates, ratings, reviews/general notes, playtime, and played storefronts were preserved. Covers and metadata have subsequently been fetched from IGDB and VNDB. Current ownership and editions remain unspecified.

## Covers and metadata

The local `.env` file holds `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` from a confidential Twitch application. `.env.example` shows the blank format. `.env`, API response caches, and original images are ignored by Git; credentials never enter the public build. VNDB's public API needs no account.

```powershell
npm run enrich
npm run build
```

Enrichment searches both databases, caches responses locally, downloads matched covers, and prefers VNDB artwork for confirmed VNs. Descriptions, release dates, developers/companies, genres and source links are also saved. Only the selected cover enters the public build. Reruns reuse cached responses and images. Use `npm run enrich -- --refresh` to fetch updated metadata, or `npm run enrich -- --game "Clannad"` for one title. The offline build needs no credentials or API access.

In the editor, open a game and choose **Fetch from IGDB + VNDB**. This saves the current form and fetches its metadata. If a match is wrong or absent, select an unconfirmed candidate or paste an exact IGDB/VNDB game URL into Database links, then fetch again. Ambiguous titles stay unmatched rather than accepting the first search result. Advanced corrections live in `data/matches.json`, keyed by your collection title or game ID; use an `igdb` numeric ID, a `vndb` ID such as `v4`, or `false` to exclude a provider. Mapping IDs take precedence over ordinary saved links. `note` documents compilation/component mappings; `sensitive: true` blocks artwork after manual review. `work/enrichment-report.json` records each batch's results and errors.

VNDB main covers with any positive sexual/violence score, or no usable safety votes, are hidden. Neither that image nor an IGDB fallback is downloaded for the game. IGDB has no equivalent image-sensitivity flag in this integration; its artwork requires visual review. Existing hidden images are excluded from the next build, and may remain only in ignored local assets/backups. This is a conservative image policy, not a guarantee that all community ratings are correct.

To replace a hidden cover: **Edit game → Covers & metadata → Upload SFW cover replacement**, tick **This replacement is SFW** and **Publish this cover**, then save and build. Your manual replacement survives future metadata refreshes. **Hide cover** keeps the text placeholder even after a refresh. Physical-edition photos keep their separate publication controls.

The initial export combines several Pokémon version pairs. Those need a version choice before matching. LEGO City Undercover has a conflicting Nintendo 3DS platform in the export; Midnight Driver has no confirmed database match. Their placeholders can be replaced manually. Baldr Sky and Fata Morgana compilations use their base VN entry for artwork and explain that in the game details.

## Import completed games

In the editor, choose **Import completed list**. Upload CSV, TSV, JSON, or TXT, or paste one title per line. Review the detected titles and counts before importing.

Alternatively:

```powershell
npm run import -- "C:\path\to\completed.csv"
```

CSV accepts `Title`, `Name`, `Game`, `Game Name`, or `Game Title` as its title column (case/spacing insensitive), with optional `Platform`, `Game ID` / `HLTB ID`, and `Completed On` / `Date Completed` / `Date Complete`. Dates may be `YYYY-MM-DD`, `YYYY-MM`, or `YYYY`; HLTB unknown month/day values are retained at their known precision. If a `Status` or `List` column exists, only completed/complete/finished/beaten/100% rows are imported. With no status column, the file is treated as a completed-list export. JSON accepts an array or `{ "games": [...] }` using those same flat fields. TXT has one title per line.

The importer recognizes full HLTB exports with separate Playing/Backlog/Completed flags and only imports rows marked Completed. HLTB Review values are converted from 0–100 to 0–10; 0 means unrated. Review Notes and General Notes become public notes. Progress becomes playtime and Storefront becomes played-via information, not current ownership. The importer handles quoted commas and multiline CSV fields. It skips duplicates by normalized title or HLTB game URL and never overwrites existing records. This initial importer combines repeated playthroughs into one game. It does not preserve separate playthroughs or each completion-type timing field. Generic CSV/TXT imports leave ratings, playtime, and ownership unspecified. Check the review counts if your export uses other headings. It does not scrape the live HLTB site.

## Update and publish

```powershell
npm test
npm run build
npm run preview
```

Public preview: **http://127.0.0.1:4173**. Build is offline and produces `dist/`. You can also use **Build site** in the editor. The static version is read-only; editing always happens through `npm run manage`.

1. Create a public GitHub repository and push this project on the `main` branch.
2. Under **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
3. Run `npm run build` locally after editing, then commit `data/collection.json`, `public-assets/`, and any code changes; push.
4. The included `.github/workflows/pages.yml` builds and deploys the site. If your branch is not `main`, update the workflow trigger.

No API keys or GitHub tokens are needed in the website. Relative asset URLs support both `username.github.io` and `username.github.io/repository/`. Game details have shareable `#game=...` URLs. GitHub Pages gives hash routes the same HTML metadata; there are no per-game social preview images.

## How records work

**Physical collection** (`#section=physical`) shows one card per owned physical copy, independent of the Games and Live service lists. Its two edition filters are **Limited edition** and **Regular edition**. Collector’s editions belong under Limited edition; old Other/Standard types belong under Regular edition, while custom edition names are retained. Only physical copies are tracked; digital play does not require an ownership record. The main lists no longer have an ownership filter.

Use **Add physical copy** to choose an existing game, add a new game (defaulting to Backlog), or **Add multi-game bundle**. Each copy has its own edition name, platform, region, release URL, notes and photos. The first published photo becomes its showcase image; otherwise the game’s eligible cover or a bundle title placeholder is used. Only published photos appear on the card and in its gallery. Different editions of the same game remain separate cards.

Bundles are stored once in the collection's top-level `bundles` array and link to game IDs through `contents`. One box counts as one physical copy, regardless of the number of included games. Each linked game shows **Owned through** with a link back to the box. Scores, playtimes and completion statuses stay on games; bundle membership never changes them. All included content is treated as physically owned without distinguishing media types.

Edit the box through **Edit bundle & photos** to manage links, edition details and photos. For titles not yet in your list, enter a title and optional VNDB URL without choosing a game. Link a history entry later if you play it. Optional title labels let several named episodes link to one combined history entry without duplicating its statistics. The Odyssey Box is prefilled with six included titles: Muv-Luv, Alternative and The Day After 00–03. Those four episodes currently link to your existing combined Day After entry, so your original history remains intact. Box photos can be uploaded later.

**Played on** uses a fixed dropdown: Emulated, Mobile, Nintendo 3DS, Nintendo DS, Nintendo Switch, Nintendo Switch 2, PC, PlayStation 4 and PlayStation Vita (or Not recorded). Existing iOS entries are merged into Mobile. The allowed values live in `web/collection-model.js` and are validated when saving or importing.

Regular lists default to newest completion first. List view shows name, platform, status, score, recorded playtime and completion date. Click **Name**, **Score**, **Playtime** or **Completion date** to sort; click again to reverse. Missing values always go last. Partial dates retain their recorded precision. Live service omits the completion column and defaults to name sorting. The table scrolls horizontally on narrow screens.

**Games** and **Live service** are separate tabs. Use **Edit game → Collection** to move an entry; Live service allows only **Playing** and **Retired**. Existing imports stay in Games until you choose their section and status. Covers, ownership, photos and metadata stay attached. Completion dates are retained but hidden in Live service. Both sections have separate counts and filters. Regular lists sort by name, score or completion date in either direction; missing scores/dates always sort last.

The **Profile** tab shows total recorded playtime, mean score, separate status breakdowns, played-platform counts and a score histogram. Time totals include valid `hours:minutes:seconds` (or `hours:minutes`) entries only; absent times are not estimated. Average score excludes unrated entries, and each game contributes once to its played platform. These totals include both sections. Live service never contributes to the regular Completed count.

Use **Profile → Edit profile** in the local editor to change your name, bio, scoring introduction and scoring guide, then build. These fields are stored under `profile` in `data/collection.json`. The initial scoring text is a placeholder you can rewrite. Share `#section=profile`, `#section=games` or `#section=live-service` directly. Existing `#game=…` links still open the correct section. HLTB import identifiers are retained for deduplication but its links are no longer shown on the site.

- **Game:** one title, independent play status, optional played platform, completion date, rating, public notes, and source links.
- **Owned copy:** physical, edition type and custom name, platform, region, language, store, optional release URL, public notes, and its own photo gallery. Add several copies, even of the same edition.
- **Database links:** HLTB, IGDB, and VNDB links can coexist on a game; a copy can point to a VNDB release. Fetching metadata adds source links automatically.

Owning and completing are independent. No imported game is assumed owned. “No copies recorded” means ownership is unspecified, not necessarily that you don’t own it.

## Photos and publication

Uploaded images are resized to a maximum 1600 pixels and re-encoded as JPEG in the local browser before saving, removing embedded metadata. The editor accepts JPEG, PNG, and WebP. Transparent images get a dark background. Keep full-resolution originals separately; the app stores the resized image only. Provider covers are downloaded directly at the provider's cover resolution.

New manual photos and covers default to **not published**. Check **Publish** for each image you want to share, then save and build. Eligible fetched covers are selected for publication automatically. Unpublished images stay in ignored `assets/`. The build copies approved images to `public-assets/` for Git and `dist/assets/` for the website. Missing unpublished images on another computer do not block a public build.

`public-assets/` is generated: do not edit it directly. Unchecking Publish removes an image from future builds but cannot erase previously published copies or Git history. All game and copy notes are public, and the collection JSON is in your public repository; do not enter private purchase or account information.

GitHub’s sexual-content rules apply to both repository and website. Do not approve prohibited explicit covers or photos. A warning/blur does not override the policy. Use a safe alternative or the built-in text cover. See https://docs.github.com/en/site-policy/acceptable-use-policies/github-sexually-obscene-content . The site has a 1 GB GitHub Pages size limit; monitor photo growth.

## Files

```
data/collection.json     Your editable collection
web/                     Public interface and local editor UI
scripts/                 Local editor server, importer, build
assets/                  Local uploads (ignored)
public-assets/           Approved images to commit (generated)
dist/                    Published output (ignored)
backups/                 Automatic collection backups (ignored)
test/                    Import, publication, local API tests
```

The editor binds only to `127.0.0.1`. Host validation, Origin checks, and a per-session token guard local writes. It has no online authentication and should never be exposed as a public server. The public deployment contains no working write API. UI typography uses Google Fonts with system-font fallbacks; collection data and photos are served from your own site.

To restore a backup, stop the editor and copy a selected `backups/*.json` over `data/collection.json`, then restart. Photos are retained locally when detached from a game.

Bundle contents may have a title and source URL without a linked game. These owned titles do not enter play-history statistics; link them to a game later through Edit bundle & photos.
