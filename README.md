# Cricket Scorer

Offline-first cricket scoring app for the phone. Score a match with no signal, then share it live with a link once you are back online.

- Every ball is saved on the phone first, then synced to Supabase when a connection is available.
- Anyone with the match link can follow the score live. Viewers never sign in.
- Built with Next.js 16, Supabase and Vercel, as an installable PWA.

## Docs
- [Design spec](docs/superpowers/specs/2026-10-23-score-and-share-design.md)
- [Implementation plan](docs/superpowers/plans/2026-10-23-score-and-share.md)

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
