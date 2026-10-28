# Visual Makeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make everything friends see from a shared WhatsApp link loud and CricHeroes-style. That covers:
- the share images (result poster, previews, new player posters);
- the live match page;
- the team page and player pages.

They get team colours, a logo, player photos, cricket artwork, badges and short celebration effects.

**Architecture:**
- **Shared code:**
  - a pure brand module: palette, opponent colour hash, media URLs;
  - a flat SVG artwork kit shared by `next/og` image routes and pages;
  - pure poster logic (top performers, Player of the match, headline, hat-tricks) in `src/lib/team`.
- **One migration** adds:
  - team colour, logo and photo versions;
  - owner-only RPCs;
  - a public Storage bucket with owner-only write policies;
  - brand fields in `get_my_team`, `get_team_page` and `get_live_match`.
- **Uploads:** pictures are cropped and resized on the phone (JPEG), then uploaded with supabase-js Storage from `/team` only.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, `next/og` (Satori), Supabase Postgres, RLS and Storage, Dexie (unchanged), vitest, PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-visual-makeover-design.md`

## Global Constraints

- **Branch:** `feat/visuals`. Never commit `.env.local`. Stage files explicitly; no `git add -A`. Every commit ends with a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **The scorer's screens are untouched:** `/score`, `/new` and the scoring sheets.
- **No new dependencies.** No animation, graphics or confetti libraries. Effects are CSS keyframes plus a small observer.
- **Reduced motion:** every effect is off under `prefers-reduced-motion: reduce`, with no confetti, no bursts and no count-up. Numbers show their final value.
- **Purity:**
  - `src/lib/scoring/**` stays pure and unchanged. It may gain an export, but no behaviour change.
  - `src/lib/team/**` and `src/lib/brand/**` are pure: no DOM, no `Date.now`, no random, no English. Copy lives in `src/lib/i18n`.
- **Public pages (`/t/**` and `/m/**`)** never sign in. Their client bundles must not import Dexie, sync, identity, Turnstile, `src/components/scoring/*` or supabase-js.
- **Copy and layout:**
  - all copy goes through `t()`;
  - names go in `<bdi>` and truncate;
  - Tailwind classes are direction-neutral only;
  - Satori text goes through `imageText()`.
- **Brand constants:**
  - accent gold `#e2a322` (`HALDI`) and navy base `#1b2340` (`INK`);
  - a palette of 10 team colours, each `{ base, dark, light, on }`, with readable text on `base`;
  - an opponent without a set colour gets the palette entry at `hash(name) % 10`.
- **Pictures:**
  - JPEG at quality 0.82, centre-cropped square: logo 512 px, photo 384 px;
  - refuse a prepared file over 300 KB (`MAX_UPLOAD_BYTES = 307200`);
  - bucket `team-media`, public, `allowed_mime_types = {image/jpeg}`, `file_size_limit = 307200`;
  - paths `teams/<teamCode>/logo-<version>.jpg` and `teams/<teamCode>/players/<playerId>-<version>.jpg`;
  - uploads use `cacheControl: "31536000"`.
- **Owner only:** only the team owner sets the colour, logo and photos. The database enforces this for both the RPCs and the storage policies.
- **Player of the match rule, used everywhere:** the owner's pick (`potm_player_id`) if it's in the XI. Otherwise the top Player of the match points among the XI, breaking ties by runs, then by name. With zero points there's no pick.
- **Headline order:** Player of the match, Hundred (100+), Fifty (50–99), Five wickets, Hat-trick, Three wickets.
- **Hat-trick:** three consecutive legal deliveries by the same bowler in one innings, each a wicket credited to the bowler:
  - credited kinds are bowled, caught, lbw, stumped and hit wicket;
  - wides and no-balls don't break the run;
  - another bowler's balls in between don't break it;
  - a legal ball by that bowler without a credited wicket (including a run-out) resets it;
  - reaching 3 counts one hat-trick and resets the count.
- **Poster access:** posters exist only for squad players in that match's XI (`player_stats.xi`). Anyone else gets a 404.
- **Rollout:**
  - the new migration runs in the Supabase SQL Editor before the deploy;
  - `supabase/setup-all.sql` is regenerated in the same format;
  - production deploys from `main`.
- **Checks after every task:** `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` with the placeholder public env (`NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_placeholder_build_only NEXT_PUBLIC_SITE_URL=http://localhost:3200`). Also run the Playwright specs the task names (`--project=mobile`, port 3200).

## Decisions where this plan refines the spec (ledger these as rulings)

- **JPEG, not WebP.** The spec says WebP. iOS Safari before 14 can't encode WebP from a canvas, and Satori's WebP decoding is unproven. JPEG at 384–512 px is 25–45 KB. *If wrong:* change one constant.
- **Paths use the team code and put the version in the file name:** `logo-3.jpg`, not `logo.webp?v=3`. The code is already public, while the team id isn't. A versioned file name survives any CDN query-string handling. Replacing a picture deletes the old file as a best effort.

## Review Focus

1. **A team with no colour, logo or photos.** This covers new teams and matches scored before branding. Every image and page falls back to initials plus a hashed colour, and never shows a broken image or the text "null". Tests: `brand.test.ts "falls back to a hashed colour and initials"` (Task 1) and `posters render without any brand` (Task 3).
2. **Long and Urdu names on posters.** The name clips instead of overflowing, and RTL text renders. Test: `posters render a 40-character Urdu name` (Task 3).
3. **An upload where the file lands but the RPC fails, or the reverse.** The old picture stays and the page shows no broken image. A retry works. Test: `team-brand.spec "a failed save keeps the old logo"` (Task 5).
4. **Cheap phones and reduced motion.** No effect runs under reduced motion, and the `/m` and `/t` bundles gain no heavy libraries. Tests: `motion.test "reduced motion disables effects"` (Task 6) and the bundle guard for `/m/[code]` (Task 7).
5. **Matches that aren't a clean win.** In-progress, tied, No result and abandoned matches never show "won". In-progress shows LIVE and the chase. No result shows "No result". Test: `posterOutcome(...)` table (Task 2).

---

### Task 1: Brand module and artwork kit

**Files:**
- Create:
  - `src/lib/brand/palette.ts`
  - `src/lib/brand/media.ts`
  - `src/lib/brand/index.ts`
  - `src/components/art/cricket-art.tsx` (pure SVG React components, no hooks, no `"use client"`)
  - `src/lib/media/prepare-image.ts`
- Test: `tests/unit/brand/brand.test.ts`, `tests/unit/media/prepare-image.test.ts`

**Interfaces:**
- **Produces from `palette.ts`:**
  - `type TeamColour = { key: ColourKey; base: string; dark: string; light: string; on: string }`
  - `type ColourKey = "emerald" | "ocean" | "royal" | "violet" | "crimson" | "tangerine" | "magenta" | "teal" | "sky" | "charcoal"`
  - `COLOUR_KEYS: readonly ColourKey[]`
  - `isColourKey(value: unknown): value is ColourKey`
  - `colourFor(key: string | null | undefined, name: string): TeamColour` (the key if valid, else the hash)
  - `nameHash(name: string): number`, a djb2 hash over code points of the trimmed, lower-cased name
  - `initials(name: string): string` (up to 2 code points: the first letters of the first two words, upper-cased; `"?"` when empty)
- **Produces from `media.ts`:**
  - `logoPath(code: string, version: number): string` → `teams/<code>/logo-<v>.jpg`
  - `photoPath(code: string, playerId: string, version: number): string`
  - `mediaUrl(path: string): string` → `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/team-media/<path>`
  - `logoUrl(code: string, version: number | null | undefined): string | null`
  - `photoUrl(code: string, playerId: string, version: number | null | undefined): string | null`
  - `MEDIA_BUCKET = "team-media"`
- **Produces from `prepare-image.ts`:**
  - `squareCrop(width: number, height: number): { sx: number; sy: number; side: number }`
  - `LOGO_SIZE = 512`, `PHOTO_SIZE = 384`, `MAX_UPLOAD_BYTES = 307200`, `JPEG_QUALITY = 0.82`
  - `prepareImage(file: Blob, size: number): Promise<Blob>`, which crops and resizes with `createImageBitmap` and a canvas `toBlob("image/jpeg", JPEG_QUALITY)`, and throws `ImageTooLargeError` when the result is over `MAX_UPLOAD_BYTES`
- **Produces from `cricket-art.tsx`:** `Floodlights`, `Crowd`, `PitchArc`, `Stumps`, `Bat`, `Ball`, `Trophy`, `Crown` and `ConfettiPieces`. Each takes `{ width, height, colour? }`. They use only `svg`, `path`, `rect`, `circle`, `line` and `g` with `transform`, so Satori can render them.

- [ ] **Step 1: Failing tests.**
  - `colourFor("ocean", "x").key === "ocean"`.
  - `colourFor(null, "Kites")` equals `colourFor("bogus", " kites ")`. It is stable and ignores case and spacing.
  - Every palette entry's `on` is `#ffffff` or `INK`.
  - `initials("Lions Cricket Club") === "LC"`, `initials("بلال") === "ب"`, `initials("") === "?"`.
  - `logoUrl("abcd2345", 3)` ends with `/storage/v1/object/public/team-media/teams/abcd2345/logo-3.jpg`.
  - `logoUrl("abcd2345", null) === null`.
  - `squareCrop(800, 600)` equals `{ sx: 100, sy: 0, side: 600 }`, and `squareCrop(600, 900)` equals `{ sx: 0, sy: 150, side: 600 }`.
- [ ] **Step 2:** `npx vitest run tests/unit/brand tests/unit/media` → FAIL (modules missing). **Step 3:** implement. **Step 4:** PASS. **Step 5:** commit "Add the team brand palette, media paths and cricket artwork".

---

### Task 2: Poster logic: performers, Player of the match, headlines, hat-tricks, new totals

**Files:**
- Modify:
  - `src/lib/team/types.ts`: `PlayerMatchStats.bowling` gains `hatTricks?: number`. `PlayerTotals` gains `hundreds`, `threeFors`, `fiveFors` and `hatTricks`.
  - `src/lib/team/match-record.ts`: extract `playerFigures`; add hat-tricks.
  - `src/lib/team/aggregate.ts`: new totals. `pickPotm` uses `suggestedPotm`. `fifties` now counts 50–99 only.
  - `src/lib/team/index.ts`
- Create: `src/lib/team/hat-tricks.ts`, `src/lib/team/posters.ts`
- Test: `tests/unit/team/hat-tricks.test.ts` and `tests/unit/team/posters.test.ts`. Extend `tests/unit/team/aggregate.test.ts` and `match-record.test.ts`.

**Interfaces:**
- Consumes: `matchPoints` (`points.ts`), `MatchState` and `CommentaryItem` (`@/lib/scoring`).
- **Produces:**
  - `hatTricksIn(innings: InningsState): Map<string, number>`
  - `playerFigures(state: MatchState, side: TeamSide, playerIds: readonly string[]): PlayerMatchStats[]`. `matchRecord` uses it. A bowler's `hatTricks` key appears only when it's above 0, so existing records and tests stay byte-identical.
  - `suggestedPotm(record: TeamMatchRecord, nameOf: (id: string) => string): string | null`
  - `matchPotm(record: TeamMatchRecord, override: string | null, nameOf: (id: string) => string): string | null`. The override wins only if it's in `record.xi`.
  - `type Performer = { playerId: string; name: string; side: TeamSide; stats: PlayerMatchStats; points: number }`
  - `topPerformers(state: MatchState, limit = 3): Performer[]`. It covers both sides and ranks by points, then runs, then name. Players with zero points are skipped.
  - `type PosterHeadline = "potm" | "hundred" | "fifty" | "fiveWickets" | "hatTrick" | "threeWickets"`
  - `posterHeadline(stats: PlayerMatchStats, isPotm: boolean): PosterHeadline | null`
  - `type PosterOutcome = { kind: "live" } | { kind: "noResult" } | { kind: "tie" } | { kind: "won"; winner: TeamSide }`
  - `posterOutcome(state: MatchState, resultOverride: "no_result" | null): PosterOutcome`
  - `teamForm(matches: TeamPageMatch[], limit = 5): ("won" | "lost" | "tied" | "noResult")[]`. This is the newest-first form strip of counted matches.

- [ ] **Step 1: Failing tests (use `TestMatch` from `tests/helpers/match.ts`).**
  - **`hatTricksIn`:**
    - W, W, W by Hamza → 1.
    - W, wide, W, W → 1.
    - W at the end of an over, then the other bowler's over, then W, W → 1.
    - W, run-out, W, W → 0.
    - Six in a row → 2.
  - **`matchRecord`** for that innings gives `players[Hamza].bowling.hatTricks === 1`. A record with no hat-tricks has no `hatTricks` key.
  - **`posterHeadline`:**
    - `{ batting: 104 }` with `isPotm: false` → `"hundred"`;
    - 52 runs and 5 wickets → `"fifty"`;
    - 5 wickets and a hat-trick → `"fiveWickets"`;
    - `isPotm: true` → `"potm"`;
    - 12 runs → `null`.
  - **`matchPotm`:**
    - an override in the XI wins;
    - an override outside the XI falls back to the suggestion;
    - all-zero points → `null`.
  - **`topPerformers`:** an opponent can be in the top 3, and the order is points, then runs.
  - **`posterOutcome`:**
    - in progress → live;
    - a tie → tie;
    - `resultOverride: "no_result"` beats a won result → noResult.
  - **Totals:**
    - 104 runs counts in `hundreds` and not in `fifties`;
    - 5 wickets counts in `fiveFors` and `threeFors`;
    - `hatTricks` adds up.
  - **`teamForm`:** it ignores live matches and returns the newest 5.
- [ ] **Step 2:** `npx vitest run tests/unit/team` → FAIL. **Step 3:** implement. Update existing tests only where `fifties` changes meaning, and say so in the commit body. **Step 4:** PASS. The golden and property engine tests are untouched. **Step 5:** commit "Work out top performers, headlines, hat-tricks and milestone totals".

---

### Task 3: Loud result poster and match preview (no database change)

**Files:**
- Create: `src/server/share/poster-parts.tsx`, with the stage (navy background, floodlights, crowd, pitch arc, confetti layer), the team panel, the initials disc and the big number.
- Rewrite:
  - `src/server/share/scorecard-image.tsx`, renamed to `result-poster.tsx`: `ResultPoster({ state, code, brand })`;
  - `src/server/share/preview-image.tsx`: loud 1200×630.
- Modify:
  - `src/app/m/[code]/card/route.tsx`
  - `src/app/m/[code]/opengraph-image.tsx`
  - `src/server/share/match.ts`: `SharedMatch` gains `brand: MatchBrand`, which is `null`-safe until Task 4 supplies data.
  - `src/lib/i18n/en.ts`: poster copy. `share.image` becomes "Share result poster".
- Test: `tests/unit/share/posters.test.ts`. It renders through `next/og` `ImageResponse` in vitest (a `.ts` file using `createElement`) and asserts a PNG signature and the byte length.

**Interfaces:**
- Consumes: Task 1 (`colourFor`, `initials`, art) and Task 2 (`topPerformers`, `posterOutcome`, `matchPotm`).
- **Produces:**
  - `type MatchBrand = { side: TeamSide; colour: string | null; logoUrl: string | null; potmPlayerId: string | null; resultOverride: "no_result" | null; xi: string[]; photoUrlOf: (playerId: string) => string | null } | null`
  - `RESULT_POSTER_SIZE = { width: 1080, height: 1350 }`. `PREVIEW_SIZE` is unchanged.

**What the poster contains:**
- two team panels split by a gold diagonal, each with a logo or initials and a giant score;
- a gold result banner, or LIVE with the chase, or "No result", or "Match tied";
- the top 3 performers with initials or photos and figures, with a star on the team's Player of the match when the match is a team match;
- stumps and a bat behind the banner;
- confetti only when the outcome is `won`.

- [ ] **Step 1: Failing tests:**
  - `posters render without any brand` (a plain match, `brand: null`);
  - `posters render a 40-character Urdu name`;
  - `the preview renders for a match in progress`.

  Each produces a PNG, starting with bytes `89 50 4E 47`. Also write each PNG to the vitest temp directory so the executor can look at it.
- [ ] **Step 2:** FAIL (exports missing). **Step 3:** implement. Remove the old scorecard layout code; YAGNI. **Step 4:** PASS. `npx playwright test tests/e2e/share.spec.ts --project=mobile` passes after renaming the button label in the spec to "Share result poster". **Step 5:** commit "Redraw the match poster and preview in the loud style".

---

### Task 4: Database: brand columns, owner RPCs, storage bucket and policies, brand in reads

**Files:**
- Create: `supabase/migrations/20261028000008_team_brand.sql`
- Regenerate: `supabase/setup-all.sql`
- Modify: `tests/integration/db.ts`. The stub gains a `storage` schema:
  - `storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[])`;
  - `storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid)` with RLS on;
  - `storage.foldername(name text) returns text[]`, which splits on `/` and drops the last part;
  - `grant select, insert, update, delete on storage.objects to authenticated`.
- Test: `tests/integration/team-brand.test.ts`. Extend the grants lists in `teams.test.ts` and `database.test.ts`.

**Interfaces (SQL; every function is security definer with `search_path = ''`, revoke then grant):**
- **Columns:**
  - `teams.colour text check (colour in (<the 10 keys>))`
  - `teams.logo_version int check (logo_version > 0)`
  - `squad_players.photo_version int check (photo_version > 0)`
- **Owner-only RPCs (granted to `authenticated`, owner checked with `lock_owned_team()`):**
  - `set_team_colour(p_colour text) returns void`
  - `set_team_logo(p_version int) returns void` (null clears)
  - `set_player_photo(p_player uuid, p_version int) returns void`, which raises `not_team_owner` for a player of another team
- **Bucket:** `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('team-media','team-media',true,307200,'{image/jpeg}') on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types`
- **Policies on `storage.objects` for `authenticated`:** insert (with check), update (using and with check) and delete (using). Each requires all of:
  - `bucket_id = 'team-media'`;
  - `(storage.foldername(name))[1] = 'teams'`;
  - `(storage.foldername(name))[2] = (select t.code from public.teams t where t.owner_id = (select auth.uid()))`;
  - the JWT is not anonymous.

  There's no select policy; public bucket reads go through the CDN.
- **Reads** (redefine these from their latest versions, migrations 005 and 006):
  - `team_squad_json` adds `photoVersion` only when it isn't null, using `|| case … end`, so existing equality tests stay green.
  - `get_my_team` and `get_team_page`: the `team` object adds `colour` and `logoVersion`.
  - `get_live_match`: `match` adds `team`, which is null for plain matches. Otherwise it is `{ code, name, colour, logoVersion, side, potmPlayerId, resultOverride, xi: player_stats->'xi' or [], photos: { <playerId>: version } }` for squad players in the XI with a photo.

- [ ] **Step 1: Failing tests:**
  - only the owner sets the colour, logo and photo; a scorer, a stranger, a guest and anon are all refused;
  - an unknown colour violates the check constraint;
  - `set_player_photo` for another team's player → `not_team_owner`;
  - `get_team_page` returns `colour`, `logoVersion` and `photoVersion` for a player with a photo, and no `photoVersion` key without one;
  - `get_live_match` for a team match returns `team.side`, `xi`, `photos` and `potmPlayerId`, and `team: null` for a plain match;
  - **storage:** the owner can insert `teams/<code>/logo-1.jpg`; the same owner can't insert `teams/<otherCode>/logo-1.jpg`; a scorer and anon can't insert.
- [ ] **Step 2:** `npx vitest run tests/integration` → FAIL. **Step 3:** implement and regenerate `setup-all.sql`. **Step 4:** PASS (all integration tests). **Step 5:** commit "Store team colours, logos and player photos".

---

### Task 5: The owner sets the colour, logo and photos on `/team`

**Files:**
- Modify:
  - `src/lib/local/db.ts`: `CachedTeam` gains optional `colour?: ColourKey | null` and `logoVersion?: number | null`.
  - `src/lib/team/types.ts`: `SquadPlayer` gains optional `photoVersion?: number`. `TeamPageData.team` gains `colour` and `logoVersion`.
  - `src/lib/team/remote.ts`: `parseMyTeam` reads the new fields. Add `setTeamColour`, `setTeamLogo`, `setPlayerPhoto` and `uploadTeamImage(client, path, blob)` (Storage `upload` with `contentType: "image/jpeg"`, `cacheControl: "31536000"`, `upsert: false`).
  - `src/lib/team/page-data.ts`: reads the new fields.
  - `src/app/team/page.tsx`
  - `src/components/team/squad-editor.tsx`: a photo button per row (owner only).
- Create:
  - `src/components/team/brand-editor.tsx`: colour swatches, plus logo upload and remove;
  - `src/components/team/picture-input.tsx`: a file input, `prepareImage`, error copy and a preview.
- Test: `tests/unit/team/remote.test.ts` (extend), `tests/unit/team/page-data.test.ts` (extend), `tests/e2e/team-brand.spec.ts`.

**Interfaces:**
- Consumes: Task 1 (`logoPath`, `photoPath`, `prepareImage`, `LOGO_SIZE`, `PHOTO_SIZE`, `ImageTooLargeError`) and Task 4 (the RPC names and JSON keys).
- **Flow:**
  1. prepare the image;
  2. upload it to the new versioned path, at version current + 1;
  3. call the RPC with the new version;
  4. delete the old path as a best effort;
  5. call `refreshTeamCache`.

  If the upload fails, call nothing else. If the RPC fails after a successful upload, delete the new file as a best effort. The old picture stays either way.

- [ ] **Step 1: Failing tests:**
  - **remote:** the calls send `p_colour`, `p_version` and `p_player`; `parseMyTeam` keeps `colour` and `logoVersion`.
  - **e2e (`fakeAccount` plus `page.route` for `**/storage/v1/object/team-media/**`, `set_team_colour`, `set_team_logo` and `set_player_photo`):**
    - `an owner picks a colour and uploads a logo`: the upload goes to `teams/abcd2345/logo-1.jpg`, then `set_team_logo` is called with `{ p_version: 1 }`;
    - `an owner adds a player photo`: the path is `players/<ALI>-1.jpg`;
    - `a failed save keeps the old logo`: the RPC returns 500, an error is shown, and the existing `logo-2` image stays;
    - `a scorer sees no brand controls`.

  Use a small generated PNG as the uploaded file.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS: `npx playwright test tests/e2e/team-brand.spec.ts tests/e2e/team-owner.spec.ts --project=mobile`. **Step 5:** commit "Let the owner set the team colour, logo and player photos".

---

### Task 6: Team page and player page makeover, effects, loud team preview

**Files:**
- Create:
  - `src/components/effects/count-up.tsx` (client: `IntersectionObserver` plus `requestAnimationFrame`, 600 ms, final value under reduced motion)
  - `src/components/effects/confetti.tsx` (client: about 24 absolutely-positioned spans with CSS keyframes; fires once when in view; renders nothing under reduced motion)
  - `src/components/team-page/team-hero.tsx` (colour diagonal header, logo or initials, record tiles with `CountUp`, form strip)
  - `src/components/team-page/avatar.tsx` (photo `<img loading="lazy" decoding="async">` with an initials fallback; server-safe)
- Modify:
  - `src/components/team-page/team-sections.tsx`: each board's leader becomes a crown card with an avatar; rows get avatars; players get badge chips.
  - `src/components/team-page/player-sections.tsx`: a photo header and a badge row (50s, 100s, 5-fors, hat-tricks, Player of the match).
  - `src/app/t/[code]/page.tsx`
  - `src/app/t/[code]/p/[playerId]/page.tsx`
  - `src/server/share/team-image.tsx`: loud preview with colour, logo, record, and the leaders' photos and initials.
  - `src/app/globals.css`: keyframes `confetti-fall` and `pop-in`, plus a `@media (prefers-reduced-motion: reduce)` block that turns them off.
  - `src/lib/i18n/en.ts`
- Create: `src/components/effects/motion.ts` (pure): `effectsEnabled(matchMedia: ((query: string) => { matches: boolean }) | undefined): boolean`, which is false when it's undefined (server) or when `(prefers-reduced-motion: reduce)` matches. `CountUp`, `Confetti` and Task 7's `BallBurst` all gate on it.
- Test: `tests/unit/team/team-page-sections.test.ts` (extend), plus `tests/unit/effects/motion.test.ts`.

**Interfaces:**
- Consumes: Task 1 (`colourFor`, `initials`, `logoUrl`, `photoUrl`), Task 2 (`teamForm`, new totals) and Task 5 (`TeamPageData` brand fields).
- **Produces:**
  - `CountUp({ value: number; format?: "int" | "decimal" })`
  - `Confetti({ colours: string[] })`
  - `Avatar({ name: string; url: string | null; size: number; colour: TeamColour })`

- [ ] **Step 1: Failing tests (static render, plus the pure motion helper):**
  - `reduced motion disables effects`: `effectsEnabled(() => ({ matches: true }))` is false, `effectsEnabled(undefined)` is false, and `effectsEnabled(() => ({ matches: false }))` is true;
  - the static render of `CountUp` shows the final value;
  - the hero shows the team colour's `base` as an inline background and the logo `img` when `logoVersion` is set, and initials otherwise;
  - the form strip renders W, W, L in newest-first order;
  - the leader card shows a crown and an avatar;
  - the player header shows a badge with "2 fifties" and "1 hat-trick".
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS, plus the bundle guard (`tests/e2e/team-page.spec.ts`) stays green after a build. **Step 5:** commit "Give the team and player pages the loud look".

---

### Task 7: Live match page makeover and bursts

**Files:**
- Create:
  - `src/components/live/live-hero.tsx` (both teams' colour panels, logos or initials, giant score, batters at the crease with avatars for squad players)
  - `src/components/live/ball-burst.tsx` (client: shows "4", "6" or "Wicket" for 1.2 s when a new commentary item arrives after the first render; nothing under reduced motion)
- Modify:
  - `src/server/live.ts`: `LiveMatchHeader.team: LiveTeam | null`, where `LiveTeam = { code; name; colour: ColourKey | null; logoVersion: number | null; side: TeamSide; potmPlayerId: string | null; resultOverride: "no_result" | null; xi: string[]; photos: Record<string, number> }`. Validate the shape.
  - `src/components/live/live-view.tsx`: hero above the tabs. When the outcome is `won`, show `Confetti` once. When the match is complete and `matchPotm` gives a player, show a "Share Player of the match" link to the poster (Task 8). The link is hidden until Task 8 ships the route.
  - `src/server/share/match.ts`: fill `MatchBrand` from `LiveMatchHeader.team`.
- Test: `tests/e2e/live.spec.ts` (extend; no backend) and `tests/unit/live/live-hero.test.ts`.

**Interfaces:**
- Consumes: Task 4 (`get_live_match.team`) and Tasks 1, 2 and 6 (`Avatar`, `Confetti`, `colourFor`, `matchPotm`, `posterOutcome`).

- [ ] **Step 1: Failing tests:**
  - **unit:** `LiveHero` renders team colours from `team.colour`, falls back to a hashed colour for a plain match, and renders the batter avatar `img` for a squad batter with a photo.
  - **e2e, the bundle guard for `/m/[code]`:** the same module and code checks as `team-page.spec.ts`, plus no `realtime-js` in the entry chunks, since it loads on demand as now.
  - **unit:** `burstFor(previous: CommentaryItem | undefined, next: CommentaryItem | undefined): "four" | "six" | "wicket" | null` (pure, exported from `ball-burst.tsx`'s sibling `burst.ts`) returns `null` on the first render and for the same item; a boundary 4 → "four", a 6 → "six", a wicket → "wicket". `BallBurst` gates on `effectsEnabled`, from Task 6.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS: `npx playwright test tests/e2e/live.spec.ts tests/e2e/team-page.spec.ts --project=mobile`. **Step 5:** commit "Give the live match page team colours, photos and celebrations".

---

### Task 8: Player posters and share links

**Files:**
- Create:
  - `src/app/m/[code]/poster/[playerId]/route.tsx` (1080×1350 PNG, `cache-control: public, s-maxage=60`)
  - `src/server/share/player-poster.tsx`
  - `src/components/share/share-image-link.tsx` (client: fetch the PNG, `navigator.share({ files })`, falling back to download and open)
  - `src/lib/share/files.ts` (move `download` and `wasCancelled` out of `share-buttons.tsx` and reuse them there)
- Modify:
  - `src/components/live/live-view.tsx`: show the Task 7 link.
  - `src/components/team/match-outcomes.tsx`: a "Share poster" link for the chosen or suggested Player of the match.
  - `src/components/team-page/player-sections.tsx`: "Share poster" on each match row.
- Test: `tests/unit/share/posters.test.ts` (extend) and `tests/e2e/team-page.spec.ts` (extend).

**Interfaces:**
- Consumes: Task 2 (`playerFigures`, `posterHeadline`, `matchPotm`), Task 3 (poster parts) and Task 7 (`MatchBrand` from `loadSharedMatch`).
- **Route rules:**
  - 404 when the code is malformed, there's no match, it isn't a team match, the player isn't in `brand.xi`, or the match is in progress;
  - otherwise a PNG with the headline badge, big photo or initials, giant figures, team colour, logo and opponent.

- [ ] **Step 1: Failing tests:**
  - **unit:** `the player poster renders with and without a photo`; `posterHeadline` drives the badge text: "Player of the match", "Hundred", "Fifty" and so on.
  - **e2e (no backend):** `GET /m/not-a-code/poster/x` → 404.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** commit "Add player posters and share links".

---

### Task 9: Docs, rollout notes and full verification

**Files:**
- Modify:
  - `docs/ARCHITECTURE.md`: brand model, storage bucket and policies, poster routes, effects and reduced motion.
  - `docs/DEPLOYMENT.md`: run `20261028000008_team_brand.sql` before the deploy; Supabase **Storage** must be enabled, and the bucket is created by the migration; production deploys from `main`; post-deploy checks for a logo upload and a poster preview.
  - `README.md`: one line.

- [ ] **Step 1:** Make the docs accurate against the code: RPC names, paths, sizes.
- [ ] **Step 2:** Run lint, typecheck, `npm test`, the build and the full `npx playwright test` on both projects. Expect green, with backend specs skipped.
- [ ] **Step 3:** Commit "Document the visual makeover and its rollout".
- [ ] **Step 4 (owner, manual):**
  - run the migration;
  - deploy by pushing `main`;
  - on `/team`, set a colour and upload a logo and two photos;
  - share the team link and a finished match link in WhatsApp and look at the previews;
  - open a player poster on a cheap Android phone.
