# Cricket Scorer

Offline-first cricket scoring app for the phone. Score a match with no signal, then share it live with a link once you are back online.

- Every ball is saved on the phone first, then synced to Supabase when a connection is available.
- Anyone with the match link can follow the score live. Viewers never sign in.
- A team owner keeps a squad, fixtures and seasons on `/team`. Matches scored for the team add up into a public team page (`/t/<code>`) with results, player stats and leaderboards.
- The owner can give the team a colour, a logo and player photos. The live page, the team and player pages, and every share image use them, and each player gets a poster for each match.
- It looks and works like a phone app: a bottom tab bar (Home, My team, a gold + for a new match, Stats and Account), a navy top bar, and full screen once installed.
- Built with Next.js 16, Supabase and Vercel, as an installable PWA.

## Docs
- [Design spec](docs/superpowers/specs/2026-10-23-score-and-share-design.md)
- [Implementation plan](docs/superpowers/plans/2026-10-23-score-and-share.md)
- [Team page spec](docs/superpowers/specs/2026-10-27-team-page-design.md) and [plan](docs/superpowers/plans/2026-10-27-team-page.md)
- [Visual makeover spec](docs/superpowers/specs/2026-10-28-visual-makeover-design.md) and [plan](docs/superpowers/plans/2026-10-28-visual-makeover.md)
- [App look and feel spec](docs/superpowers/specs/2026-10-29-app-feel-design.md) and [plan](docs/superpowers/plans/2026-10-29-app-feel.md)
- [Architecture](docs/ARCHITECTURE.md): event flow, wire shapes, security model, offline design, tests
- [Deployment](docs/DEPLOYMENT.md): Supabase and Vercel setup, pre-launch and post-deploy checks, free-tier limits

## Develop
```bash
npm install
```
```bash
cp .env.example .env.local
```
Fill in `.env.local` with the dev Supabase project's values. Then:
```bash
npm run dev
```
The service worker is only registered in a production build, so offline behaviour needs `npm run build` and `npm start`.

## Check
```bash
npm run lint
```
```bash
npm run typecheck
```
```bash
npm test
```
```bash
npm run build
```
`npm run build` reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` when the code is first imported, and bakes every `NEXT_PUBLIC_*` value into the build. Use the real values from `.env.local`, or, with no project yet, build-only placeholders (PowerShell: `$env:NAME = "value"`):
```bash
export NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_placeholder_build_only
export NEXT_PUBLIC_SITE_URL=http://localhost:3200
```

## Preview and end-to-end tests
The production preview and the Playwright tests use port **3200** (family-home uses 3100).
```bash
npm run build
```
```bash
npm start -- -p 3200
```
```bash
npx playwright test
```
- `npx playwright test` starts `next start -p 3200` itself, or reuses a server already on that port. The server runs the last build, so rebuild after changing code or public env, and stop an old server first. Public env is baked in at build time, so build with the values in `playwright.config.ts` (`NEXT_PUBLIC_SITE_URL=http://localhost:3200`). A build made with a production `NEXT_PUBLIC_SITE_URL` fails the link checks.
- It runs a desktop Edge project and a Pixel 7 project. Set `E2E_CHANNEL` to use another browser channel (the default is `msedge`), or `E2E_BASE_URL` to test an already-running site.
- Specs that need Supabase are skipped unless `E2E_BACKEND=1`. They need a real development project in `.env.local` and a build made with it, and they write real matches: never run them against production.
```bash
E2E_BACKEND=1 npx playwright test --project=mobile
```

## Deploy
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Copyright
© 2026 AQ. All rights reserved. The bundled Noto fonts in `src/assets/fonts` keep their own licence (SIL Open Font License).
