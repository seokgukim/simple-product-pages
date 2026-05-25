# Simple Product Pages

A small static Vue 3 + Vite + TypeScript site that builds product pages from materials fetched from a Google Drive at build time. The build-time generator downloads/extracts assets into `public/data` and emits `src/generated-products.ts` so the final site is fully static and can be deployed to GitHub Pages.

Key features
- Build-time material fetch (Google Drive), with HTML fallback for public folders
- Incremental sync: skips unchanged files using size/md5 and prunes stale top-level product dirs
- Safe generator (execFileSync, sanitized filenames)
- Uses pnpm and Vite; configured for GitHub Pages deployment via Actions

Requirements
- Node.js 20+ (recommended)
- pnpm (tested with v11+)
- `unzip` / `tar` available in PATH for archive extraction (CI runners usually have these)

Quickstart (local)
1. Install

```sh
pnpm install --frozen-lockfile
```

2. Fetch materials (optional — generator runs automatically as predev/prebuild):

```sh
pnpm run fetch-materials
```

3. Run dev server (predev runs before this):

```sh
pnpm run dev
```

4. Build (runs prebuild generator automatically):

```sh
pnpm run build
```

Notes:
- If you prefer to run an explicit fetch and then a build without triggering the prebuild hook twice, run `pnpm run fetch-materials` followed by:

```sh
pnpm run build-only
```

Preview the production build:

```sh
pnpm run preview
```

(Do NOT open `dist/index.html` with `file://` — that causes browser CORS errors. Serve over HTTP or use `pnpm run preview`.)

CI / GitHub Actions
- Workflow: `.github/workflows/build.yml` (uses pnpm)
- The build step runs the prebuild generator (see `prebuild` script in `package.json`).
- Repository settings: add these as repo variables/secrets for the generator to fetch Drive contents:
  - `GOOGLE_DRIVE_SHARED_ENDPOINT` (required to fetch from Drive during CI)
  - `GOOGLE_DRIVE_API_KEY` (optional — for Drive API)
  - `GOOGLE_DRIVE_ACCESS_TOKEN` (optional — OAuth bearer token)
  - Optionally set `VITE_BASE_URL` / `BASE_URL` for Pages subpath deployments

Deployment to GitHub Pages
- The included workflow builds the site and uploads/deploys to Pages. Ensure `VITE_BASE_URL` is set correctly for project sites (e.g. `/your-repo-name/`) or the repo is configured as a user/org site.

How the generator works
- `scripts/generate-data.mjs` downloads/extracts assets into `public/data` and then runs `scripts/generate-products.mjs`.
- `generate-products.mjs` scans `public/data` and emits `src/generated-products.ts` (used by the app as static data).
- Incremental sync: when Drive API metadata includes `size` and `md5Checksum`, the generator skips downloading files that match size or md5; it also prunes top-level product directories that no longer exist in Drive.
- Fallbacks: if Drive API listing fails the script tries HTML parsing of shared folders; if a single archive/link is provided it will download and extract (archive fallback does a full extract).

Security & limits
- Filenames are sanitized before writing to disk to avoid path/unsafe characters.
- The generator uses `execFileSync` and `process.execPath` to avoid shell injection when invoking local Node child processes.
- If `GOOGLE_DRIVE_SHARED_ENDPOINT` is not set, the generator will attempt to restore backup assets from `public/data/assets` or write a default `title.txt` and still run the product generation step.

Troubleshooting
- CORS when opening built files locally: serve over HTTP (use `pnpm run preview` or deploy to Pages).
- Missing `unzip`/`tar` -> CI extraction fails; install these in the runner or use a runner that has them.
- Downloads fail due to permissions: provide `GOOGLE_DRIVE_ACCESS_TOKEN` or make the Drive folder public; HTML fallback for public folders is less reliable.

Important files
- `scripts/generate-data.mjs` — downloader, extractor, incremental sync
- `scripts/generate-products.mjs` — scans `public/data` and emits `src/generated-products.ts`
- `src/generated-products.ts` — generated product list used by the app
- `vite.config.ts` — configures Vite `base` using `VITE_BASE_URL` / `import.meta.env.BASE_URL`
- `.github/workflows/build.yml` — CI: runs build and deploys to GitHub Pages

Contributing
- Changes are kept local until you push. When committing a change that should be attributed, use the repository's co-author trailer shown in the project guidelines.

If you want, commit & push these changes and trigger the workflow — I can help or run it for you.