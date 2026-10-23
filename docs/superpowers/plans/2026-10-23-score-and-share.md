# Score & Share Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship a free, offline-first cricket scoring PWA for Pakistan. A guest scores ball by ball on a phone with no signal. Spectators follow a live link and share via WhatsApp.

**Architecture:**
- Every match action is an append-only event.
- A pure TypeScript engine (`src/lib/scoring`) replays events into scorecards. The same engine runs on the scorer's phone, the live page and the image routes.
- Events are written to IndexedDB (Dexie) first.
- An outbox pushes them to Supabase through security-definer RPCs.
- Viewers get updates by Realtime broadcast on a private per-match topic, falling back to CDN-cached polling.
- A hand-written service worker precaches the scoring shell (`/`, `/new`, `/score`).

**Tech Stack:**
- Next 16.4.2, React 19.3.0, TypeScript, Tailwind 4, shadcn (`radix-nova`).
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`).
- Dexie 4, `dexie-react-hooks`, `@marsidev/react-turnstile`.
- Testing: vitest, `fake-indexeddb`, PGlite, fast-check, Playwright.
- Hosting: Vercel (`bom1`).

**Spec:** `docs/superpowers/specs/2026-10-23-score-and-share-design.md`. Read it before any task. This plan argues from it.

**Reference project:** `D:\Projects\family-home`. "Copy X from family-home" means copy the file, then rename brand strings and remove logic this app doesn't use.

## Global Constraints

**Versions:** pin `next@16.4.2`, `react@19.3.0` and `react-dom@19.3.0`, the same as family-home. Node `>=20.9.0`.

**Before writing any Next code:** read `node_modules/next/dist/docs/`. The `AGENTS.md` block says so; keep that block.

**The scoring engine (`src/lib/scoring/**`) is pure:**
- No DOM, no `Date`, no `Math.random`, no `crypto`.
- No imports from outside `src/lib/scoring`.
- No user-facing English. It returns structured data; English lives in `src/lib/i18n`.

**Events:**
- Events are append-only everywhere, both on the phone and in Postgres. Undo and edit are new events.
- Ordering is by `seq` only. `at` is informational.

**Saving a ball:**
- A ball is shown on screen only after its IndexedDB transaction commits.
- `record()` awaits the write before the UI changes.

**Rules never block:** they warn or ask. The only things that may block are structural:
- no striker or bowler chosen yet
- no innings in progress

**Language:**
- All UI copy comes from `t()` in `src/lib/i18n`.
- Use only direction-neutral Tailwind (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`, `text-start`). No `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`.

**Copy the spec fixes exactly:**
- `"Saved on phone"`
- `"Synced"`
- `"All out — end innings, or add a player?"`
- `"Balls not yet synced from the other phone won't be included."`
- `"Not synced — scoring moved to another phone"`
- Commentary format `"11.4 Hamza to Ali, FOUR"`

**Live viewers never sign in.** `/m/*` and `/api/m/*` must not call `signInAnonymously`.

**Supabase keys:** no `SUPABASE_SECRET_KEY` usage at launch. The server uses only the publishable key. Security comes from RLS and security-definer RPCs.

**Free-tier tuning:**
- `NEXT_PUBLIC_POLL_MS` (default `5000`).
- `LIVE_CACHE_SECONDS` (default `2`), used as `s-maxage` on the polling route.

**Match code:** 8 characters from `abcdefghjkmnpqrstuvwxyz23456789`. Regex `^[a-hjkmnp-z2-9]{8}$`.

**Commits:** imperative plain English, as in family-home ("Add scoring engine core"). Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Checks after every task:**
- `npm run lint`
- `npm run typecheck`
- `npm test`

From Task 13 onward, also run `npm run build`.

## Owner prerequisites (before Task 17's backend e2e)

The repo owner creates these; the implementer can't:
- A **dev Supabase project** in the Mumbai region, with:
  - anonymous sign-ins on
  - CAPTCHA off, or Turnstile with the test secret `1x0000000000000000000000000000000AA`
  - the Google provider configured
- A `.env.local` file holding:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `NEXT_PUBLIC_SITE_URL=http://localhost:3100`
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` (optional)

Run `npx supabase db push` against that project. Backend e2e specs run only when `E2E_BACKEND=1`.

## Review Focus

These five inputs and failure modes are the ones the spec implies and real users will hit first. Each line is pinned by a test in the task named.

1. **Phone dies or tab closes mid-write.** A ball is either fully stored (event, `lastSeq` and summary) or not at all; never half. **Task 10:** `appendEvents is atomic when replay throws`.
2. **The same match is open in two tabs.** Concurrent writes still get unique, gap-free `seq` values, and both tabs show the same state. **Task 10:** `concurrent appendEvents get unique contiguous seq`. **Task 15** uses `useLiveQuery`, so every tab re-renders from the store.
3. **IndexedDB is unavailable or full** (private mode, blocked storage, quota). The app says so clearly before anyone starts scoring, instead of losing balls. **Task 10:** `checkStorage reports unavailable IndexedDB`. **Task 14** renders the error on `/new`.
4. **Urdu-script, emoji or 40-character names** in teams and players. The UI truncates instead of overflowing, and the image routes still return a PNG with Arabic-script glyphs. **Task 18:** e2e `card renders Urdu and long names`, with a Noto Naskh Arabic font bundled.
5. **Duplicate or out-of-order events at a viewer.** Realtime and polling can both deliver the same event, or skip one. The viewer never double-counts or misses a ball. **Task 17:** `mergeEvents dedupes by id, sorts by seq, reports gaps`.

---

## File map

| Area | Files |
|---|---|
| Engine (pure) | `src/lib/scoring/{types,rules,replay,draft,prompts,undo,stats,dismissals,index}.ts` |
| Copy | `src/lib/i18n/{en,index,cricket}.ts` |
| Sharing | `src/lib/share/{summary,text}.ts` |
| Phone storage | `src/lib/local/{db,matches,code}.ts` |
| Sync | `src/lib/sync/{wire,push,sync}.ts` |
| Identity | `src/lib/identity/{guest,google,takeover}.ts` |
| Live | `src/lib/live/{merge,use-live-events}.ts`, `src/server/live.ts` |
| Supabase clients | `src/lib/supabase/browser.ts`, `src/server/supabase/{server,public}.ts` |
| DB | `supabase/migrations/20261023000001_matches.sql`, `…0002_rpc.sql`, `…0003_realtime.sql` |
| Pages | `src/app/{page,new/page,score/page,account/page,offline/page}.tsx`, `src/app/m/[code]/{page,opengraph-image}.tsx`, `src/app/m/[code]/card/route.tsx`, `src/app/api/m/[code]/events/route.ts`, `src/app/auth/callback/route.ts` |
| PWA | `src/app/{manifest.ts,sw.js/route.ts,icon.tsx,apple-icon.tsx}`, `src/app/icons/{192,512,maskable-512}/route.tsx`, `src/components/pwa/*` |
| UI | `src/components/scoring/*`, `src/components/scorecard/scorecard.tsx`, `src/components/sync-chip.tsx`, `src/components/guest-session.tsx`, `src/hooks/use-match.ts` |
| Tests | `tests/helpers/match.ts`, `tests/unit/**`, `tests/integration/{db.ts,database.test.ts}`, `tests/e2e/*.spec.ts` |

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `components.json`, `vitest.config.mts`, `playwright.config.ts`, `.gitignore`, `.vercelignore`, `vercel.json`, `.env.example`, `AGENTS.md`, `README.md`, `.claude/launch.json`
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (placeholder), `src/lib/env.ts`, `src/lib/supabase/browser.ts`, `src/lib/utils.ts`, `src/lib/i18n/{en,index}.ts`
- Test: `tests/unit/i18n.test.ts`

**Interfaces:**
- Produces:
  - `publicEnv` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY?`, `NEXT_PUBLIC_POLL_MS` coerced to a number, default 5000).
  - `createSupabaseBrowser()`.
  - `t(key: MessageKey, vars?: Record<string, string | number>): string`, where `MessageKey = keyof typeof en`.

- [ ] **Step 1: Copy the config from family-home.**
  - `package.json`:
    - Keep these scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `test:e2e`.
    - Drop `postinstall` and `import:workbook`.
    - Dependencies are family-home's, minus `@react-pdf/renderer`, `exceljs`, `tesseract.js`, `@tesseract.js-data/eng`, `web-push`, `recharts`, `react-day-picker`, `cmdk`, `cn`.
    - Add `dexie@^4`, `dexie-react-hooks`, `@marsidev/react-turnstile`.
    - Dev dependencies: add `fake-indexeddb`. Drop `msw`, `@types/web-push`, `tsx`.
  - `next.config.ts`:
    - Copy it without `cacheComponents`, `partialPrefetching`, `serverExternalPackages` and `experimental.serverActions`.
    - In the CSP, add `https://challenges.cloudflare.com` to `script-src` and `frame-src`. Keep the Supabase `https` + `wss` hosts.
  - `vercel.json` is `{ "framework": "nextjs", "regions": ["bom1"] }`.
  - `.env.example` lists `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_POLL_MS=5000` and `LIVE_CACHE_SECONDS=2`.
  - `.claude/launch.json` is family-home's, renamed `cricket-scorer-prod-preview`, with `cwd` set to `D:\Projects\cricket-scorer`.

- [ ] **Step 2: Root layout.**
  - Copy family-home's `layout.tsx` and `globals.css` theme: next-themes, sonner `Toaster` top-center, `viewportFit: "cover"`, light and dark `themeColor`.
  - Set `lang="en"` and `dir="ltr"`.
  - Do **not** set `robots: noindex`. Live pages should be shareable.

- [ ] **Step 3: Write the failing test** `tests/unit/i18n.test.ts`

```ts
it("interpolates variables", () => {
  expect(t("sync.saved")).toBe("Saved on phone");
  expect(t("sync.synced")).toBe("Synced");
  expect(t("prompt.allOut")).toBe("All out — end innings, or add a player?");
});
```

- [ ] **Step 4: Implement `en.ts` and `t()`.** `en` is a flat `as const` object of dotted keys. `t` replaces `{name}` placeholders.

- [ ] **Step 5: Verify.**
  - Run `npm install`, then `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Expected: all pass.
  - `npm run dev`: the placeholder home page renders.

- [ ] **Step 6: Commit** "Scaffold Next 16 app from family-home conventions".

---

### Task 2: Engine core — types, rules, legal balls, strike, overs

**Files:**
- Create: `src/lib/scoring/{types,rules,replay,draft,prompts,stats,index}.ts`, `tests/helpers/match.ts`
- Test: `tests/unit/scoring/core.test.ts`

**Interfaces:**
- Produces: all of the types below, plus these functions:

| Function | Notes |
|---|---|
| `defaultRules(ballType: BallType, overs: number): Rules` | |
| `bowlerQuota(rules: Rules): number` | `Math.ceil(oversPerInnings / 5)` |
| `replay(events: readonly MatchEvent[]): MatchState` | Throws `EngineError` for structural impossibilities: a delivery with no innings in progress, or an innings started twice. |
| `currentInnings(state): InningsState \| null` | |
| `deliveryDraft(state: MatchState, input: BallInput): EventDraft` | Fills `striker`/`nonStriker`/`bowler` from state. `penalty` = `rules.wideRuns` for a wide, `rules.noBallRuns` for a no-ball, else 0. `runsAs` defaults to `"bat"`; for wides it's stored but ignored. `wicket.playerOut` defaults to the striker. Throws `EngineError` if there's no striker or bowler. |
| `nextPrompt(state): Prompt \| null` | |
| `formatOvers(legalBalls: number, ballsPerOver: number): string` | |

```ts
// src/lib/scoring/types.ts — these shapes are the wire format. Do not rename fields after Task 9 ships.
export type TeamSide = "A" | "B";
export type BallType = "tape" | "tennis" | "hard" | "custom";
export type Rules = {
  ballType: BallType; oversPerInnings: number; ballsPerOver: 6 | 8;
  playersPerSide: Record<TeamSide, number>;
  wideRuns: number; wideRebowled: boolean; noBallRuns: number;
  freeHit: boolean; lbw: boolean; lastManStands: boolean;
};
export type Player = { id: string; name: string; team: TeamSide };
export type DismissalKind = "bowled" | "caught" | "lbw" | "run_out" | "stumped" | "hit_wicket" | "other";
export type Wicket = { kind: DismissalKind; playerOut: string; fielderName: string | null };
export type BallKind = "legal" | "wide" | "noball";
export type RunsAs = "bat" | "bye" | "legbye";
export type CorrectionPatch = {
  kind?: BallKind; runs?: number; runsAs?: RunsAs; boundary?: boolean; penalty?: number;
  wicket?: { kind: DismissalKind; fielderName: string | null };
};
export type EventDraft =
  | { type: "match_created"; title: string; teams: Record<TeamSide, { name: string }>; rules: Rules; toss: { winner: TeamSide; choice: "bat" | "bowl" } }
  | { type: "player_added"; player: Player }
  | { type: "innings_started"; innings: 1 | 2; battingTeam: TeamSide; striker: string; nonStriker: string; bowler: string }
  | { type: "delivery"; striker: string; nonStriker: string | null; bowler: string; kind: BallKind; runs: number; runsAs: RunsAs; boundary: boolean; penalty: number; wicket: Wicket | null }
  | { type: "batter_in"; player: string }
  | { type: "bowler_changed"; player: string }
  | { type: "strike_swapped" }
  | { type: "retired"; player: string; how: "hurt" | "out" }
  | { type: "settings_changed"; oversPerInnings?: number; playersPerSide?: Partial<Record<TeamSide, number>>; target?: number | null }
  | { type: "innings_ended"; innings: 1 | 2; reason: "overs" | "all_out" | "target" | "manual" }
  | { type: "undo"; targets: string[] }
  | { type: "correct"; target: string; patch: CorrectionPatch };
export type MatchEvent = EventDraft & { id: string; seq: number; at: string };
export type DeliveryEvent = Extract<MatchEvent, { type: "delivery" }>;
export type BallInput = { runs: number; boundary?: boolean; kind?: BallKind; runsAs?: RunsAs;
  wicket?: { kind: DismissalKind; playerOut?: string; fielderName?: string | null } };

export type Extras = { wides: number; noBalls: number; byes: number; legByes: number };
export type BatterLine = { playerId: string; runs: number; balls: number; fours: number; sixes: number; dots: number;
  out: { kind: DismissalKind | "retired_out"; bowler: string | null; fielderName: string | null } | null; retiredHurt: boolean };
export type BowlerLine = { playerId: string; legalBalls: number; runs: number; wickets: number; wides: number; noBalls: number; maidens: number; dots: number };
export type FallOfWicket = { wicket: number; runs: number; legalBalls: number; playerId: string };
export type Partnership = { batters: [string, string | null]; runs: number; balls: number };
export type BallChip = { eventId: string; label: string };
export type OverSummary = { index: number; bowler: string; runs: number; wickets: number; balls: BallChip[] };
export type CommentaryItem = { eventId: string; ballLabel: string; bowler: string; batter: string; kind: BallKind;
  runs: number; runsAs: RunsAs; boundary: boolean; penalty: number; freeHit: boolean; wicket: Wicket | null };
export type InningsState = {
  number: 1 | 2; battingTeam: TeamSide; bowlingTeam: TeamSide;
  runs: number; wickets: number; legalBalls: number; extras: Extras;
  striker: string | null; nonStriker: string | null; bowler: string | null;
  batting: BatterLine[]; bowling: BowlerLine[]; fallOfWickets: FallOfWicket[];
  partnerships: Partnership[]; overs: OverSummary[]; commentary: CommentaryItem[];
  freeHit: boolean; ended: null | "overs" | "all_out" | "target" | "manual";
};
export type Result =
  | { kind: "won_by_runs"; winner: TeamSide; runs: number }
  | { kind: "won_by_wickets"; winner: TeamSide; wickets: number; ballsLeft: number }
  | { kind: "tie" };
export type Warning = { eventId: string } & (
  | { kind: "consecutive_overs"; bowler: string }
  | { kind: "bowler_quota"; bowler: string; quota: number }
  | { kind: "strike_mismatch" });
export type Prompt =
  | { kind: "start_innings"; innings: 1 | 2 } | { kind: "choose_batter" } | { kind: "choose_bowler" }
  | { kind: "all_out" } | { kind: "innings_over"; reason: "overs" | "target" };
export type MatchState = {
  title: string; teams: Record<TeamSide, { name: string }>; rules: Rules;
  toss: { winner: TeamSide; choice: "bat" | "bowl" } | null; players: Record<string, Player>;
  innings: InningsState[]; target: number | null;
  status: "setup" | "in_progress" | "innings_break" | "complete";
  result: Result | null; warnings: Warning[];
};
```

**Engine rules covered in this task:**

**Legal ball:**
- The innings, bowler and batter `balls`/`legalBalls` all add 1.
- If `runsAs` is `"bat"`: the batter and the bowler are charged the runs. A boundary adds to `fours` or `sixes` when `runs` is 4 or 6.
- If `runsAs` is `"bye"` or `"legbye"`: the runs go to `extras.byes` or `extras.legByes`. The bowler is not charged.
- Dots:
  - Batter `dots` add 1 when the runs off the bat are 0.
  - Bowler `dots` add 1 when the bowler is charged nothing on a legal ball.

**Strike:**
- Swap when `runs` is odd.
- At the end of an over (`legalBalls % ballsPerOver === 0` after a legal ball), swap again and set `bowler = null`.

**Maiden:** a completed over in which that bowler was charged 0. Byes and leg-byes don't spoil a maiden.

**Other events:**
- `bowler_changed` sets `bowler`. A bowler can change mid-over; each bowler is credited only with their own balls.
- `strike_swapped` swaps the two ends.
- `OverSummary.bowler` is the bowler of the first ball in that over.

**`formatOvers`:**
- `(70,6) → "11.4"`
- `(72,6) → "12"`
- `(0,6) → "0"`

**`TestMatch` (`tests/helpers/match.ts`):**
- Constructor: `new TestMatch(opts?: { rules?: Partial<Rules>; overs?: number; teams?: [string,string]; toss?; openers?: [string,string]; bowler?: string })`.
- Defaults: `defaultRules("tape", 10)`, Lions (A) v Tigers (B), A wins the toss and bats, openers Ali and Usman, bowler Hamza.
- It generates ids/seq/at itself: ids `e1`, `e2`, …; player ids `p-<name>`.
- Members: `events`, `state`, `inn`, `id(name)`, `ball(input)`, `over(runs: number[])`, `bowler(name)`, `batter(name)`, `push(draft)`, `undo()`, `correct(eventId, patch)`, `endInnings(reason)`, `startInnings2(openers, bowler)`.
  - `bowler(name)` and `batter(name)` add a `player_added` event first if the name is new.

- [ ] **Step 1: Write the failing tests** `tests/unit/scoring/core.test.ts`

```ts
it("defaults by ball type", () => {
  expect(defaultRules("tape", 10)).toMatchObject({ ballsPerOver: 6, lbw: false, freeHit: true, wideRuns: 1, noBallRuns: 1, wideRebowled: true, lastManStands: false, playersPerSide: { A: 11, B: 11 } });
  expect(defaultRules("hard", 20).lbw).toBe(true);
  expect(bowlerQuota(defaultRules("tape", 10))).toBe(2);
});
it("status is setup before innings_started and prompts innings 1", () => { /* replay([match_created]) */ expect(nextPrompt(s)).toEqual({ kind: "start_innings", innings: 1 }); });
it("credits runs off the bat and rotates strike on odd runs", () => {
  const m = new TestMatch(); m.ball({ runs: 1 });
  expect(m.inn.runs).toBe(1); expect(m.inn.striker).toBe(m.id("Usman"));
});
it("byes and leg byes go to extras and not to the bowler", () => {
  const m = new TestMatch(); m.ball({ runs: 2, runsAs: "bye" }); m.ball({ runs: 1, runsAs: "legbye" });
  expect(m.inn.extras).toMatchObject({ byes: 2, legByes: 1 }); expect(bowlerLine(m, "Hamza").runs).toBe(0);
});
it("ends the over after 6 legal balls, swaps strike, clears bowler, records a maiden", () => {
  const m = new TestMatch(); m.over([0, 0, 0, 0, 0, 0]);
  expect(m.inn.striker).toBe(m.id("Usman")); expect(m.inn.bowler).toBeNull();
  expect(nextPrompt(m.state)).toEqual({ kind: "choose_bowler" }); expect(bowlerLine(m, "Hamza").maidens).toBe(1);
});
it("counts boundaries", () => { const m = new TestMatch(); m.ball({ runs: 4, boundary: true }); m.ball({ runs: 6, boundary: true });
  expect(batterLine(m, "Ali")).toMatchObject({ runs: 10, fours: 1, sixes: 1, balls: 2 }); });
it("orders by seq, not array order", () => { const m = new TestMatch(); m.over([1, 2, 3]);
  expect(replay([...m.events].reverse())).toEqual(m.state); });
it("formats overs", () => { expect(formatOvers(70, 6)).toBe("11.4"); expect(formatOvers(72, 6)).toBe("12"); expect(formatOvers(0, 6)).toBe("0"); });
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/scoring/core.test.ts`. Expected: FAIL (the modules don't exist).
- [ ] **Step 3: Implement the types, `defaultRules`, `bowlerQuota`, `replay` (handling the event types listed above), `deliveryDraft`, `nextPrompt` (`start_innings` / `choose_bowler` only for now), `formatOvers`, and `TestMatch`.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "Add scoring engine core".

---

### Task 3: Engine — wides, no-balls, free hits

**Files:**
- Modify: `src/lib/scoring/replay.ts`
- Test: `tests/unit/scoring/extras.test.ts`

**Interfaces:**
- Consumes: Task 2 types, `TestMatch`.
- Produces: `InningsState.freeHit` (true when the next ball is a free hit).

**Rules:**

**Wide** (`kind: "wide"`):
- `extras.wides` and the bowler's runs both add `penalty + runs`. Bowler `wides` adds 1.
- It's not a ball faced.
- It counts as a legal ball only when `rules.wideRebowled === false`.
- Strike swaps when `runs` is odd.

**No-ball** (`kind: "noball"`):
- `extras.noBalls` and the bowler's runs both add `penalty`. Bowler `noBalls` adds 1.
- The batter's `balls` adds 1 (a no-ball counts as a ball faced). It does not count towards the over.
- Runs off the bat go to the batter and the bowler.
- Byes or leg-byes go to `extras.byes`/`legByes` and are not charged to the bowler.

**Free hit:**
- After a no-ball with `rules.freeHit`, `freeHit` is true.
- A wide or another no-ball keeps it true.
- A legal ball clears it.

- [ ] **Step 1: Write the failing tests**

```ts
it("wide adds penalty, not a ball", () => { const m = new TestMatch(); m.ball({ kind: "wide", runs: 0 });
  expect(m.inn).toMatchObject({ runs: 1, legalBalls: 0, extras: { wides: 1 } });
  expect(bowlerLine(m, "Hamza")).toMatchObject({ runs: 1, wides: 1 }); expect(batterLine(m, "Ali").balls).toBe(0); });
it("wide with odd runs run swaps strike", () => { const m = new TestMatch(); m.ball({ kind: "wide", runs: 1 });
  expect(m.inn.runs).toBe(2); expect(m.inn.striker).toBe(m.id("Usman")); });
it("wide counts as a ball when not re-bowled", () => { const m = new TestMatch({ rules: { wideRebowled: false } });
  m.ball({ kind: "wide", runs: 0 }); expect(m.inn.legalBalls).toBe(1); });
it("no-ball six off the bat", () => { const m = new TestMatch(); m.ball({ kind: "noball", runs: 6, boundary: true });
  expect(m.inn).toMatchObject({ runs: 7, legalBalls: 0, freeHit: true, extras: { noBalls: 1 } });
  expect(batterLine(m, "Ali")).toMatchObject({ runs: 6, balls: 1, sixes: 1 }); expect(bowlerLine(m, "Hamza")).toMatchObject({ runs: 7, noBalls: 1 }); });
it("no-ball byes are not charged to the bowler", () => { const m = new TestMatch(); m.ball({ kind: "noball", runs: 2, runsAs: "bye" });
  expect(m.inn.extras).toMatchObject({ noBalls: 1, byes: 2 }); expect(bowlerLine(m, "Hamza").runs).toBe(1); });
it("free hit carries over a wide and clears after a legal ball", () => { const m = new TestMatch();
  m.ball({ kind: "noball", runs: 0 }); m.ball({ kind: "wide", runs: 0 }); expect(m.inn.freeHit).toBe(true);
  m.ball({ runs: 0 }); expect(m.inn.freeHit).toBe(false); });
it("no free hit when the rule is off", () => { const m = new TestMatch({ rules: { freeHit: false } }); m.ball({ kind: "noball", runs: 0 }); expect(m.inn.freeHit).toBe(false); });
it("uses the penalty recorded on the event", () => { const m = new TestMatch({ rules: { noBallRuns: 2 } }); m.ball({ kind: "noball", runs: 0 }); expect(m.inn.runs).toBe(2); });
```

- [ ] **Step 2: Run** and see it fail. **Step 3: Implement.** **Step 4: Run** and see it pass.
- [ ] **Step 5: Commit** "Score wides, no-balls and free hits".

---

### Task 4: Engine — wickets, new batters, retirements, last man stands

**Files:**
- Modify: `src/lib/scoring/replay.ts`, `src/lib/scoring/prompts.ts`
- Create: `src/lib/scoring/dismissals.ts`
- Test: `tests/unit/scoring/wickets.test.ts`

**Interfaces:**
- Produces: `availableDismissals(state: MatchState, kind: BallKind): (DismissalKind | "retired_hurt" | "retired_out")[]`. It returns them in this order: bowled, caught, lbw, run_out, stumped, hit_wicket, other, retired_hurt, retired_out. Then it filters:
  - `lbw` only when `rules.lbw` is on.
  - On a **free hit**: only `run_out`, `other`, `retired_hurt`, `retired_out`.
  - On a **wide**: only `stumped`, `run_out`, `hit_wicket`, `other`, plus the retirements.
  - On a **no-ball**: only `run_out`, `other`, plus the retirements.

**Rules:**

**Which wickets count:**
- Every dismissal adds 1 to wickets.
- The bowler is credited for bowled, caught, lbw, stumped and hit_wicket.
- `run_out` and `other` are not credited to the bowler.

**Strike and ends after a wicket:**
- On a wicket ball, apply the run swap first, then vacate the end of `wicket.playerOut`.
- **Caught** (2022 Laws): vacate the striker's end, so the new batter takes strike.
- If an over ends on a wicket ball, the over-end swap still applies, and the empty end moves too.
- `batter_in` fills the empty end: the striker's end first if it's empty, otherwise the non-striker's.

**Retirements:**
- `retired` with `how: "hurt"`:
  - Not a wicket. Sets `retiredHurt = true` and vacates that end.
  - If the same player comes back in with `batter_in`, `retiredHurt` goes back to false and their line continues.
- `retired` with `how: "out"`: a wicket with `out.kind = "retired_out"` and `bowler: null`, and a fall-of-wickets entry.

**Fall of wickets and partnerships:**
- Fall of wickets records the innings runs and legal balls at that moment.
- Partnerships:
  - Count every run, including extras, and legal balls.
  - A new partnership starts when a batter comes in.
  - The partnerships always add up to the innings total.

**All out:**
- All out is reached when `wickets >= playersPerSide[battingTeam] - 1`, or `wickets >= playersPerSide` with last man stands.
- At that point `nextPrompt` is `{ kind: "all_out" }`. It never ends the innings on its own.

**Last man stands:**
- When `wickets === playersPerSide - 1`, the remaining batter becomes the striker and `nonStriker = null`. There's no `choose_batter` prompt.
- Strike never swaps while one end is empty.

**`nextPrompt` order:**
1. `all_out`
2. `choose_batter` (an end is empty and it isn't a last-man-stands lone batter)
3. `choose_bowler`

- [ ] **Step 1: Write the failing tests**

```ts
it("bowled credits the bowler and asks for a batter", () => { const m = new TestMatch(); m.ball({ runs: 0, wicket: { kind: "bowled" } });
  expect(m.inn.wickets).toBe(1); expect(bowlerLine(m, "Hamza").wickets).toBe(1);
  expect(batterLine(m, "Ali").out).toEqual({ kind: "bowled", bowler: m.id("Hamza"), fielderName: null });
  expect(nextPrompt(m.state)).toEqual({ kind: "choose_batter" }); expect(m.inn.fallOfWickets[0]).toMatchObject({ wicket: 1, runs: 0, legalBalls: 1 }); });
it("run out of the non-striker after one run", () => { const m = new TestMatch();
  m.ball({ runs: 1, wicket: { kind: "run_out", playerOut: m.id("Ali") } }); m.batter("Saad");
  expect(m.inn.runs).toBe(1); expect(m.inn.striker).toBe(m.id("Usman")); expect(m.inn.nonStriker).toBe(m.id("Saad")); expect(bowlerLine(m, "Hamza").wickets).toBe(0); });
it("new batter takes strike after a catch", () => { const m = new TestMatch(); m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain" } }); m.batter("Saad"); expect(m.inn.striker).toBe(m.id("Saad")); });
it("caught on the last ball of the over", () => { const m = new TestMatch(); m.over([0, 0, 0, 0, 0]); m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain" } }); m.batter("Saad");
  expect(m.inn.striker).toBe(m.id("Usman")); expect(m.inn.nonStriker).toBe(m.id("Saad")); });
it("retired hurt is not a wicket and can return", () => { /* retired hurt Ali, batter Saad, ..., wicket, batter Ali */ expect(m.inn.wickets).toBe(1); expect(batterLine(m, "Ali").retiredHurt).toBe(false); });
it("retired out is a wicket without bowler credit", () => { /* ... */ expect(batterLine(m, "Ali").out).toMatchObject({ kind: "retired_out", bowler: null }); });
it("partnerships sum to the total", () => { /* mixed balls incl. extras and a wicket */ expect(sum(m.inn.partnerships.map((p) => p.runs))).toBe(m.inn.runs); });
it("asks rather than ends when all out", () => { const m = new TestMatch({ rules: { playersPerSide: { A: 3, B: 3 } } });
  m.ball({ runs: 0, wicket: { kind: "bowled" } }); m.batter("Saad"); m.ball({ runs: 0, wicket: { kind: "bowled" } });
  expect(nextPrompt(m.state)).toEqual({ kind: "all_out" }); expect(m.inn.ended).toBeNull(); });
it("last man stands bats alone without rotating", () => { const m = new TestMatch({ rules: { playersPerSide: { A: 3, B: 3 }, lastManStands: true } });
  m.ball({ runs: 0, wicket: { kind: "bowled" } }); m.batter("Saad"); m.ball({ runs: 0, wicket: { kind: "bowled" } });
  expect(nextPrompt(m.state)).toBeNull(); expect(m.inn.nonStriker).toBeNull();
  const lone = m.inn.striker; m.ball({ runs: 1 }); expect(m.inn.striker).toBe(lone); });
it("free hit allows only run out and other", () => { const m = new TestMatch(); m.ball({ kind: "noball", runs: 0 });
  expect(availableDismissals(m.state, "legal")).toEqual(["run_out", "other", "retired_hurt", "retired_out"]); });
it("wide allows stumping", () => { const m = new TestMatch({ rules: { lbw: true } }); expect(availableDismissals(m.state, "wide")).toEqual(["stumped", "run_out", "hit_wicket", "other", "retired_hurt", "retired_out"]); });
```

In the last-man-stands test, both wickets fall in the first over (balls 1 and 2), so the next prompt is `null`.

- [ ] **Step 2: Run** and see it fail. **Step 3: Implement.** **Step 4: Run** and see it pass.
- [ ] **Step 5: Commit** "Score wickets, retirements and last man stands".

---

### Task 5: Engine — innings flow, target, result, settings, warnings

**Files:**
- Modify: `src/lib/scoring/replay.ts`, `src/lib/scoring/prompts.ts`
- Test: `tests/unit/scoring/flow.test.ts`

**Interfaces:**
- Produces: `MatchState.status`, `target`, `result` and `warnings` filled in, and `nextPrompt` complete.

**Rules:**

**Prompts:**
- `nextPrompt` returns `{ kind: "innings_over", reason: "overs" }` when `legalBalls >= oversPerInnings * ballsPerOver`.
- It returns `reason: "target"` in innings 2 when `runs >= target`.
- These come before the batter and bowler prompts. `all_out` comes before both of them.
- The UI auto-appends `innings_ended` for `innings_over`; for `all_out` it asks first.

**Innings and match status:**
- `innings_ended` for innings 1 sets status `innings_break`. Unless a `settings_changed.target` was set, the target becomes innings-1 runs + 1. The next prompt is `start_innings 2`.
- `innings_started` for innings 2 sets `bowlingTeam` to the other side.
- `innings_ended` for innings 2 sets status `complete` and fills `result`:
  - Chase reached: `won_by_wickets`. Wickets = `playersPerSide[B] - 1 - wickets`, or `playersPerSide - wickets` with last man stands. `ballsLeft = overs*bpo - legalBalls`.
  - `runs === target - 1`: `tie`.
  - Otherwise: `won_by_runs` with margin `target - 1 - runs`.

**`settings_changed`:** applies from that event on.
- `oversPerInnings` replaces the overs.
- `playersPerSide` merges per team.
- `target` (a number) replaces the target.

**Warnings (from `bowler_changed`, keyed by that event's id):**
- `consecutive_overs`: the new bowler bowled the previous completed over.
- `bowler_quota`: the bowler has already bowled at least `bowlerQuota(rules)` full overs.

- [ ] **Step 1: Write the failing tests**

```ts
it("prompts innings over when overs are done", () => { const m = new TestMatch({ overs: 1 }); m.over([1, 1, 1, 1, 1, 1]);
  expect(nextPrompt(m.state)).toEqual({ kind: "innings_over", reason: "overs" }); });
it("sets the target and asks for innings 2", () => { /* overs 1, score 6, endInnings("overs") */ expect(m.state).toMatchObject({ status: "innings_break", target: 7 }); expect(nextPrompt(m.state)).toEqual({ kind: "start_innings", innings: 2 }); });
it("chase reached gives won by wickets with balls left", () => { /* overs 1; inn1 6; inn2: 4b, 4b */ expect(nextPrompt(m.state)).toEqual({ kind: "innings_over", reason: "target" });
  m.endInnings("target"); expect(m.state.result).toEqual({ kind: "won_by_wickets", winner: "B", wickets: 10, ballsLeft: 4 }); expect(m.state.status).toBe("complete"); });
it("defended total gives won by runs", () => { /* inn1 6, inn2 2 all overs */ expect(m.state.result).toEqual({ kind: "won_by_runs", winner: "A", runs: 4 }); });
it("tie", () => { /* inn1 6, inn2 6 */ expect(m.state.result).toEqual({ kind: "tie" }); });
it("overs can be cut mid-innings", () => { const m = new TestMatch({ overs: 10 }); m.push({ type: "settings_changed", oversPerInnings: 1 });
  m.over([0, 0, 0, 0, 0, 0]); expect(nextPrompt(m.state)).toEqual({ kind: "innings_over", reason: "overs" }); });
it("adding a player clears the all-out prompt", () => { /* pps 3, two wickets */ m.push({ type: "settings_changed", playersPerSide: { A: 4 } }); expect(nextPrompt(m.state)).toEqual({ kind: "choose_batter" }); });
it("manual target is used for the result", () => { /* settings_changed target 50 at innings break; inn2 makes 30 */ expect(m.state.result).toEqual({ kind: "won_by_runs", winner: "A", runs: 19 }); });
it("innings can be ended by hand mid-over", () => { /* endInnings("manual") after 3 balls */ expect(m.state.status).toBe("innings_break"); });
it("warns on consecutive overs and quota", () => { /* Hamza over 1, Hamza over 2 */ expect(m.state.warnings).toContainEqual(expect.objectContaining({ kind: "consecutive_overs", bowler: m.id("Hamza") }));
  /* Hamza 2 overs in a 10-over match, then bowler(Hamza) again */ expect(m.state.warnings).toContainEqual(expect.objectContaining({ kind: "bowler_quota", quota: 2 })); });
```

- [ ] **Step 2: Run** and see it fail. **Step 3: Implement.** **Step 4: Run** and see it pass.
- [ ] **Step 5: Commit** "Handle innings flow, results and mid-match settings".

---

### Task 6: Engine — undo and edit a past ball

**Files:**
- Create: `src/lib/scoring/undo.ts`
- Modify: `src/lib/scoring/replay.ts`
- Test: `tests/unit/scoring/undo.test.ts`

**Interfaces:**
- Produces:
  - `undoTargets(events: readonly MatchEvent[]): string[]`
  - `canCorrect(event: MatchEvent, patch: CorrectionPatch): boolean`

**Rules:**

**How `replay` handles undo and corrections:**
1. Sort by `seq`.
2. Void every id named in a non-voided `undo.targets`. Undo and correct events can't themselves be targeted.
3. For each target, apply the **latest** `correct` patch over the original delivery: replace `kind`/`runs`/`runsAs`/`boundary`/`penalty`; for `wicket`, replace `kind` and `fielderName` but keep `playerOut`.
4. Fold the remaining events.

**`undoTargets`:**
- The anchor is the latest non-voided event of type `delivery`, `retired`, `innings_ended`, `innings_started`, `settings_changed`.
- Return the anchor plus every later non-voided event, except `player_added`, `undo` and `correct`.
- Never return `match_created`. Return `[]` if there's no anchor.

**`canCorrect`:**
- True only for a `delivery`, and only when the patch neither adds a wicket to a ball without one nor removes one.
- `runs` must be between 0 and 9 and `penalty` between 0 and 5.

**Strike mismatch warning:**
- After a correction, later deliveries keep their recorded `striker`/`bowler`. Stats credit the **event's** recorded players, never the state's.
- When a delivery's recorded striker differs from the state's expected striker, push `{ kind: "strike_mismatch", eventId }`.

- [ ] **Step 1: Write the failing tests**

```ts
it("undo restores the previous state exactly", () => { const m = new TestMatch(); m.over([1, 4]); const before = m.state; m.ball({ runs: 2 }); m.undo(); expect(m.state).toEqual(before); });
it("undo removes a wicket together with the incoming batter", () => { const m = new TestMatch(); m.ball({ runs: 0, wicket: { kind: "bowled" } }); m.batter("Saad"); m.undo();
  expect(m.inn.wickets).toBe(0); expect(m.inn.striker).toBe(m.id("Ali")); });
it("undo twice steps back two deliveries", () => { const m = new TestMatch(); m.over([1, 2, 3]); m.undo(); m.undo(); expect(m.inn.runs).toBe(1); });
it("undoTargets never includes match_created or player_added", () => { /* fresh TestMatch: anchor is innings_started */ expect(targets).not.toContain(createdId); });
it("correcting runs updates totals and flags strike mismatch", () => { const m = new TestMatch(); const e = m.ball({ runs: 1 }); m.ball({ runs: 0 });
  m.correct(e.id, { runs: 2 }); expect(m.inn.runs).toBe(2); expect(m.state.warnings).toContainEqual(expect.objectContaining({ kind: "strike_mismatch" })); });
it("legal to wide removes a legal ball", () => { const m = new TestMatch(); const e = m.ball({ runs: 0 }); m.correct(e.id, { kind: "wide", penalty: 1 }); expect(m.inn.legalBalls).toBe(0); });
it("latest correction wins", () => { /* correct runs 2 then 3 */ expect(m.inn.runs).toBe(3); });
it("cannot add or remove a wicket by editing", () => { expect(canCorrect(plainBall, { wicket: { kind: "bowled", fielderName: null } })).toBe(false);
  expect(canCorrect(wicketBall, { wicket: { kind: "caught", fielderName: "Zain" } })).toBe(true); expect(canCorrect(inningsStarted, { runs: 1 })).toBe(false); });
```

- [ ] **Step 2: Run** and see it fail. **Step 3: Implement.** **Step 4: Run** and see it pass.
- [ ] **Step 5: Commit** "Add undo and past-ball edits to the engine".

---

### Task 7: Stats, ball labels, commentary and English formatting

**Files:**
- Modify: `src/lib/scoring/stats.ts`, `src/lib/scoring/replay.ts` (fill `overs[].balls` and `commentary`)
- Create: `src/lib/i18n/cricket.ts`, `src/lib/share/summary.ts`
- Test: `tests/unit/scoring/stats.test.ts`, `tests/unit/i18n-cricket.test.ts`

**Interfaces:**
- Produces, in `stats.ts`:
  - `strikeRate(runs, balls): number`
  - `economy(runs, legalBalls, bpo): number`
  - `runRate(runs, legalBalls, bpo): number`
  - `requiredRunRate(needed, ballsLeft, bpo): number | null`
  - `dotBallPct(inn): number`
  - `boundaryPct(inn): number`
  - `chipLabel(d: DeliveryEvent): string`
  - All rates are rounded to 2 decimals with `Math.round(x * 100) / 100`. Economy and run rate are computed as `runs * bpo / balls`.
- Produces, in `cricket.ts`:
  - `formatCommentary(item, players): string`
  - `formatResult(result, teams): string`
  - `formatScoreLine(inn, state): string`
- Produces, in `summary.ts`: `summarize(state): MatchSummary = { title; teams: [string, string]; status: MatchState["status"]; lines: string[]; result: string | null }`.

**Rules:**

**Ball labels:**

| Ball | Label |
|---|---|
| Legal, runs off the bat | `"0"`…`"6"` |
| Any wicket | `"W"` |
| Wide | `"wd"` when the total is 1, otherwise `"<total>wd"` |
| No-ball | `"nb"` with no runs, otherwise `"<runs>nb"` |
| Bye | `"<n>b"` |
| Leg-bye | `"<n>lb"` |

**Commentary ball number** (`CommentaryItem.ballLabel`):
- For a legal ball, it is `` `${Math.floor((lb-1)/bpo)}.${((lb-1)%bpo)+1}` ``, using `lb` after the increment.
- For a wide or no-ball, use `lb = legalBalls + 1`.
- So the first legal ball and a wide before it are both `"0.1"`, and the 6th legal ball is `"0.6"`.

**Stat definitions:**
- `dotBallPct`: legal balls with 0 total runs, divided by legal balls, times 100.
- `boundaryPct`: runs from boundaries off the bat, divided by total runs, times 100.
- Both return 0 when the denominator is 0.

**English formats:**

| Function | Output |
|---|---|
| `formatResult` | `"Lions won by 23 runs"`, `"Lions won by 1 run"`, `"Tigers won by 4 wickets (12 balls left)"`, `"Match tied"` |
| `formatScoreLine` | `"Lions 87/3 (11.4 ov)"`. A finished full innings shows `"(20 ov)"`. |
| `formatCommentary` outcomes | `"no run"`, `"1 run"`, `"2 runs"`, `"FOUR"`, `"SIX"`, `"wide"`, `"no ball"`, `"OUT"`. Other wording is the builder's choice; Urdu will reuse the structured item. |

- [ ] **Step 1: Write the failing tests**

```ts
expect(strikeRate(34, 22)).toBe(154.55); expect(economy(19, 16, 6)).toBe(7.13); expect(runRate(87, 70, 6)).toBe(7.46);
expect(requiredRunRate(64, 50, 6)).toBe(7.68); expect(requiredRunRate(10, 0, 6)).toBeNull();
expect(formatCommentary({ ballLabel: "11.4", bowler: "p-Hamza", batter: "p-Ali", kind: "legal", runs: 4, runsAs: "bat", boundary: true, penalty: 0, freeHit: false, wicket: null, eventId: "x" }, players)).toBe("11.4 Hamza to Ali, FOUR");
expect(formatResult({ kind: "won_by_runs", winner: "A", runs: 1 }, teams)).toBe("Lions won by 1 run");
expect(formatResult({ kind: "won_by_wickets", winner: "B", wickets: 4, ballsLeft: 12 }, teams)).toBe("Tigers won by 4 wickets (12 balls left)");
it("labels and commentary numbering", () => { const m = new TestMatch(); m.ball({ kind: "wide", runs: 0 }); m.ball({ runs: 1 });
  expect(m.inn.overs[0].balls.map((b) => b.label)).toEqual(["wd", "1"]); expect(m.inn.commentary.map((c) => c.ballLabel)).toEqual(["0.1", "0.1"]); });
```

- [ ] **Step 2: Run** and see it fail. **Step 3: Implement.** **Step 4: Run** and see it pass.
- [ ] **Step 5: Commit** "Add scoring stats, commentary and English formatting".

---

### Task 8: Golden match and property tests

**Files:**
- Test: `tests/unit/scoring/golden.test.ts`, `tests/unit/scoring/properties.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–7.

**Golden match** (2 overs, tape defaults, 11 a side):

**Innings 1 — Lions.** Openers Ali and Usman.

Over 1, bowled by Hamza:
1. 1 run
2. 4 (boundary)
3. wide, no runs
4. 0
5. no-ball, 6 off the bat (boundary)
6. 2 (free hit)
7. 0
8. Usman bowled

Saad comes in.

Over 2, bowled by Bilal:
1. 1 leg-bye
2. 3 runs
3. Ali caught by Zain

Kamran comes in.

4. 6 (boundary)
5. 2 byes
6. 1 run

End innings 1 (overs).

**Innings 2 — Tigers.** Openers Zain and Faisal; Usman bowls 6, 6, 6, 6, 4, 1. End innings 2 (target).

- [ ] **Step 1: Write the golden test.** Expected values:
  - **Innings 1 totals:** runs 28, wickets 2, legal balls 12, extras `{ wides: 1, noBalls: 1, byes: 2, legByes: 1 }`.
  - **Batters (runs and balls):** Ali 1 (3), Usman 12 (6), Saad 3 (1), Kamran 7 (3). The 13 balls faced are 12 legal balls plus the no-ball.
  - **Bowlers:**
    - Hamza: legal balls 6, runs 15, wickets 1, wides 1, no-balls 1, dots 3.
    - Bilal: legal balls 6, runs 10, wickets 1, dots 3.
  - **Fall of wickets:** `[{ wicket: 1, runs: 15, legalBalls: 6, playerId: Usman }, { wicket: 2, runs: 19, legalBalls: 9, playerId: Ali }]`.
  - **Partnership runs:** `[15, 4, 9]`.
  - **Rates:** `dotBallPct` 33.33, `boundaryPct` 57.14.
  - **Target:** 29.
  - **Result:** `{ kind: "won_by_wickets", winner: "B", wickets: 10, ballsLeft: 6 }`.
- [ ] **Step 2: Write the fast-check properties.**
  - Use a `TestMatch`-driven generator of up to 150 random `BallInput`s:
    - runs 0–6
    - kind weighted towards legal
    - runsAs random
    - about 5% wickets, picked from `availableDismissals`
  - The generator resolves prompts automatically: a new batter for `choose_batter`, a new bowler for `choose_bowler`, `endInnings` for `innings_over`/`all_out`.
  - **Properties:**
    - `runs === sum(batting.runs) + sum(extras)`.
    - `legalBalls <= oversPerInnings * ballsPerOver`.
    - `replay(shuffle(events))` equals `replay(events)`.
    - Appending one ball and then `undo()` deep-equals the state before.
    - The state after `correct(e, patch)` equals `replay` of the events with `e` replaced by the patched event. Use `canCorrect`-valid patches only.
- [ ] **Step 3: Run** `npx vitest run tests/unit/scoring`. Expected: PASS. Fix the engine, not the test, if a property fails.
- [ ] **Step 4: Commit** "Pin the engine with a golden match and properties".

---

### Task 9: Supabase schema, RPCs, RLS and Realtime

**Files:**
- Create: `supabase/migrations/20261023000001_matches.sql`, `20261023000002_rpc.sql`, `20261023000003_realtime.sql`
- Create: `tests/integration/db.ts` (copy family-home's, then extend it)
- Test: `tests/integration/database.test.ts`

**Interfaces:**
- Produces these SQL objects, used by Tasks 11, 12, 17 and 19:

**Tables:**
- `public.matches`:
  - `id uuid pk`
  - `code text unique check (code ~ '^[a-hjkmnp-z2-9]{8}$')`
  - `owner_id uuid not null references auth.users on delete cascade`
  - `scoring_device uuid not null`
  - `title text` (≤120), `team_a text` / `team_b text` (1–40)
  - `rules jsonb`
  - `status text check in ('in_progress','complete')`
  - `visibility text default 'link' check in ('link','private')`
  - `summary jsonb default '{}'`
  - `last_seq int default 0`
  - `created_at`, `updated_at`
- `public.match_events`:
  - `id uuid pk`
  - `match_id uuid references matches on delete cascade`
  - `seq int > 0`
  - `type text`, checked against the 12 event types
  - `payload jsonb`, with `octet_length(payload::text) <= 4096`
  - `client_at timestamptz`, `created_at`
  - `unique (match_id, seq)`
- `public.match_claims`: `token_hash text pk`, `from_user uuid`, `expires_at timestamptz`.

**RPCs:** all `security definer set search_path = ''`. `revoke execute … from public`, then grant as listed. Error messages are exact (`raise exception '<code>'`).

| RPC | Grant | Behaviour |
|---|---|---|
| `push_match_events(p_match jsonb, p_device uuid, p_events jsonb) returns int` | authenticated | `p_match = { id, code, title, teamA, teamB, rules, status, summary }`.<br>Errors: `not_signed_in`, `not_owner`, `scoring_moved`, `code_taken`, `invalid_event`, `too_many_events` (> 500).<br>Inserts the match if it's new (owner = `auth.uid()`, `scoring_device = p_device`); otherwise updates `status`/`summary`/`updated_at`.<br>Inserts events in `seq` order: skips any whose id already exists; stops (no error) at the first `seq <> last_seq + 1`; raises `invalid_event` if the same `(match, seq)` exists with a different id.<br>Returns `last_seq`. |
| `take_over_scoring(p_match uuid, p_device uuid) returns int` | authenticated | Owner only (`not_owner`). Sets `scoring_device` and returns `last_seq`. |
| `create_claim_token() returns text` | authenticated | Token = two `gen_random_uuid()` values joined. Stores `sha256(token)` with `from_user = auth.uid()`, expiring in 1 hour. |
| `claim_matches(p_token text) returns int` | authenticated | The caller must not be anonymous (`auth.jwt()->>'is_anonymous'`), and the token must be valid and unexpired; otherwise `claim_invalid`.<br>Moves `from_user`'s matches to `auth.uid()`, deletes the token, and returns the number moved. |
| `get_live_match(p_code text) returns jsonb` | anon, authenticated | `{ match: { id, code, title, teamA, teamB, status, updatedAt }, events: [...] }`, or `null` unless `visibility = 'link'`. |
| `get_live_events(p_code text, p_after int) returns jsonb` | anon, authenticated | Events with `seq > p_after`, ordered, limit 1000. Returns `[]` for an unknown or private match. |

Each event in the JSON is `{ id, seq, at, type, ...payload }`, using `client_at` for `at`.

**RLS:**
- RLS is on for all three tables.
- `matches_owner_read`: select to authenticated, `owner_id = (select auth.uid())`.
- `match_events_owner_read`: select via the owning match.
- No other policies.
- `revoke insert, update, delete on matches, match_events, match_claims from anon, authenticated`.

**Realtime:**
- An `after insert` trigger on `match_events` calls `realtime.send(<event json>, 'event', 'match:' || match_id, true)`.
- Helper `public.match_topic_readable(topic text) returns boolean` (security definer): true when the match exists with `visibility = 'link'`.
- Policy `match_topic_read on realtime.messages for select to anon, authenticated using (public.match_topic_readable(realtime.topic()))`.
- No insert policy, so nobody can broadcast.

**`tests/integration/db.ts`:** family-home's stub, plus:
- A `realtime` schema:
  - `realtime.messages(id bigserial, topic text, extension text default 'broadcast', event text, payload jsonb, private boolean, inserted_at timestamptz default now())` with RLS enabled.
  - `realtime.topic()` reads `current_setting('realtime.topic', true)`.
  - `realtime.send(payload, event, topic, private)` inserts as security definer.
  - Grant usage on the schema, and select and insert on the table, to anon and authenticated.
- `Actor` becomes `{ sub: string; anonymous?: boolean } | "service" | "anon"`, with `is_anonymous` put into the claims.
- Drop the storage stub, which isn't needed.

- [ ] **Step 1: Write the failing tests.** Each is an `it` with its key assertion:
  - `push creates the match and returns last_seq` → `3`; the row has `owner_id = A`, `scoring_device = D1`.
  - `re-push is idempotent` → still `3`, `count(*) = 3`.
  - `push stops at a gap` → pushing seq 5 returns `3`; count is still 3.
  - `stranger cannot push` → `expectDbError(..., /not_owner/)`.
  - `second device is rejected until it takes over` → `/scoring_moved/`. Then `take_over_scoring` from D2; D2 can push; D1 gets `/scoring_moved/`.
  - `anon cannot push` → `/permission denied|not_signed_in/`.
  - `invalid type and too many events` → `/invalid_event/`, `/too_many_events/`.
  - `events cannot be updated or deleted` → as the owner, `update`/`delete` gives `/permission denied/`.
  - `no direct inserts` → as authenticated, inserting into matches gives `/permission denied/`.
  - `matches cannot be enumerated` → anon `select count(*) from matches` = 0; the owner sees 1.
  - `live reads` → anon `get_live_match(code)` has 3 events; `get_live_events(code, 2)` has seq `[3]`; after setting `visibility = 'private'` (as service), `get_live_match` is null.
  - `realtime` → after a push, `realtime.messages` has a row with topic `match:<id>`. Anon with `realtime.topic` set can select it. Anon insert into `realtime.messages` gives an RLS error. When the match is private, the select returns 0.
  - `claim moves only the right guest's matches` → anon user G (`anonymous: true`) pushes 2 matches and creates a token; user B claims → `2`, owners are B. Reusing the token, or claiming as an anonymous caller, gives `/claim_invalid/`. An expired token (set `expires_at` in the past as service) gives `/claim_invalid/`.
  - `code collision` → a different match id with the same code gives `/code_taken/`.
- [ ] **Step 2: Run** `npx vitest run tests/integration`. Expected: FAIL (no migrations yet).
- [ ] **Step 3: Write the three migrations.** Use family-home's RLS loop and its helper style (`security definer set search_path = ''`, `(select auth.uid())`).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "Add match tables, scoring RPCs, RLS and realtime topic".

---

### Task 10: Phone storage (Dexie) and recording events

**Files:**
- Create: `src/lib/local/{db,matches,code}.ts`
- Test: `tests/unit/local/matches.test.ts`, which starts with `import "fake-indexeddb/auto"`

**Interfaces:**

**Types:**
- `LocalMatch = { id; code; createdAt; updatedAt; lastSeq: number; syncedSeq: number; syncState: "pending" | "synced" | "blocked"; blockedReason: "scoring_moved" | "not_owner" | null; summary: MatchSummary; rules: Rules; teams: [string, string]; title: string }`
- `StoredEvent = MatchEvent & { matchId: string }`
- `MatchSetup = { title?: string; teams: [string, string]; rules: Rules; toss: { winner: TeamSide; choice: "bat" | "bowl" }; striker: string; nonStriker: string; bowler: string }` (the last three are names)

**Database:**
- `class LocalDb extends Dexie` with the tables `matches` (`"id, code, updatedAt"`), `events` (`"[matchId+seq], id, matchId"`) and `meta` (`"key"`).
- `getLocalDb(): LocalDb` is a singleton.
- `checkStorage(): Promise<{ ok: true } | { ok: false; reason: "unavailable" | "quota" }>`.
  - `"unavailable"`: `indexedDB` is missing, or opening the database throws.
  - `"quota"`: `navigator.storage.estimate()` reports usage above 95% of quota.
- `requestPersist(): Promise<boolean>`.

**Functions:**

| Function | Behaviour |
|---|---|
| `newMatchCode(): string` | Uses `crypto.getRandomValues`. |
| `CODE_RE` | The code regex. |
| `createLocalMatch(db, setup): Promise<LocalMatch>` | Appends `match_created`, three `player_added`, and `innings_started` (innings 1; batting team from the toss). The default title is `"<A> vs <B>"`. |
| `appendEvents(db, matchId, drafts: EventDraft[]): Promise<MatchEvent[]>` | One `rw` transaction over `matches` and `events`:<br>1. Read `lastSeq`.<br>2. Assign `seq` (`lastSeq + i + 1`), `id` (`crypto.randomUUID()`) and `at` (ISO now).<br>3. `replay` all events including the new ones (this throws for structural errors, which aborts the transaction).<br>4. Write the events, plus `lastSeq`, `summary` (`summarize`), `updatedAt` and `syncState: "pending"` unless `"blocked"`. |
| `loadEvents(db, matchId): Promise<MatchEvent[]>` | |
| `getDeviceId(db): Promise<string>` | Stored in `meta` under `deviceId`. |
| `recentPlayerNames(db, limit = 50): Promise<string[]>` | Distinct names from `player_added` events, most recent first. |

- [ ] **Step 1: Write the failing tests:**
  - `createLocalMatch writes setup events` → event types `["match_created","player_added","player_added","player_added","innings_started"]`, `lastSeq` 5, `CODE_RE.test(code)`.
  - `appendEvents assigns contiguous seq and updates summary` → seq `[6, 7]`, and `summary.lines[0]` is `"Lions 1/0 (0.1 ov)"` after one single.
  - `concurrent appendEvents get unique contiguous seq` → `Promise.all` of two appends of two balls each gives seqs `[6, 7, 8, 9]` (Review Focus 2).
  - `appendEvents is atomic when replay throws` → appending a `delivery` draft to a match with no innings rejects with `EngineError`; the event count and `lastSeq` are unchanged (Review Focus 1).
  - `checkStorage reports unavailable IndexedDB` → with `globalThis.indexedDB` deleted, the result is `{ ok: false, reason: "unavailable" }` (Review Focus 3).
  - `getDeviceId is stable` → two calls return the same uuid.
  - `recentPlayerNames` → distinct, most recent first, and respects `limit`.
- [ ] **Step 2: Run** and see it fail. **Step 3: Implement.** **Step 4: Run** and see it pass.
- [ ] **Step 5: Commit** "Store matches and events on the phone".

---

### Task 11: Sync outbox

**Files:**
- Create: `src/lib/sync/{wire,push,sync}.ts`
- Test: `tests/unit/sync/sync.test.ts` (`fake-indexeddb`, fake `PushFn`)

**Interfaces:**

**Wire format:**
- `toWire(e: MatchEvent): { id; seq; at; type; payload }`
- `fromWire(w): MatchEvent`
- They must round-trip.

**`PushFn`:**
```ts
type PushFn = (a: { match: { id; code; title; teamA; teamB; rules; status: "in_progress" | "complete"; summary }; device: string; events: MatchEvent[] })
  => Promise<{ ok: true; lastSeq: number } | { ok: false; error: "network" | "not_signed_in" | "not_owner" | "scoring_moved" | "code_taken" | "unknown" }>;
```

**Functions:**
- `match.status` is `"complete"` when `MatchState.status === "complete"`, otherwise `"in_progress"`.
- `supabasePush(client): PushFn` calls `rpc("push_match_events", { p_match, p_device, p_events: events.map(toWire) })`. Map a fetch failure to `"network"`, and the exception message to the error code.
- `syncMatch(db, matchId, push, opts?: { claim?: () => Promise<void> }): Promise<"synced" | "pending" | "blocked">`:
  - Push from `syncedSeq + 1` in batches of 200 until `syncedSeq === lastSeq`.
  - Set `syncedSeq` to the returned `lastSeq`. If the server's value is lower, resend from there, at most 3 rounds.
  - On `scoring_moved` or `not_owner`: set `syncState: "blocked"` and `blockedReason`. Never delete events.
  - On `code_taken`: set a new code with `newMatchCode()` and retry once.
  - On `network`/`not_signed_in`: leave the state `"pending"`.
- `syncAll(db, push, opts)`:
  - If `meta.pendingClaim` exists, run `opts.claim()` first, and skip pushing until it succeeds.
  - Then run `syncMatch` for every match that isn't blocked and has `syncedSeq < lastSeq`.
- `nextDelay(attempt: number): number` returns `Math.min(60000, 2000 * 2 ** attempt)`.
- `startSyncLoop({ db, push, claim, isReady }): () => void`:
  - Runs on `online`, on `visibilitychange` to visible, and on demand via the exported `requestSync()`.
  - Uses a backoff timer while anything is pending.
  - Returns a stop function.

- [ ] **Step 1: Write the failing tests:**
  - `round-trips wire format`.
  - `pushes unsynced events in order and marks synced`: the fake records the seqs it receives; expect `[1..5]` and `syncState` `"synced"`.
  - `network error keeps events pending`.
  - `scoring_moved blocks without deleting`: events are still there and `blockedReason` is `"scoring_moved"`.
  - `resends from server lastSeq`: the fake returns 2 on the first call.
  - `batches of 200`: 450 events take 3 calls.
  - `code_taken regenerates the code once`.
  - `claim runs before any push`: the call order is `["claim", "push"]`, and if the claim throws, push is never called.
  - `nextDelay`: `[0, 1, 2, 5, 10].map(nextDelay)` equals `[2000, 4000, 8000, 60000, 60000]`.
- [ ] **Step 2: Run** and see it fail. **Step 3: Implement.** **Step 4: Run** and see it pass.
- [ ] **Step 5: Commit** "Sync phone events to Supabase through an outbox".

---

### Task 12: Guest identity, Google sign-in, claim and take-over

**Files:**
- Create: `src/lib/identity/{guest,google,takeover}.ts`, `src/server/supabase/server.ts` (copy from family-home), `src/server/env.ts` (copy, keeping only what's used), `src/app/auth/callback/route.ts`, `src/components/guest-session.tsx`
- Test: `tests/unit/identity/identity.test.ts` (a fake client built from `vi.fn()`, plus `fake-indexeddb`)

**Interfaces:**

| Function | Behaviour |
|---|---|
| `ensureGuestSession(client, getCaptchaToken?: () => Promise<string>): Promise<"existing" \| "created" \| "offline">` | If `getSession()` returns a session, does nothing. If offline, returns `"offline"`. Otherwise calls `signInAnonymously({ options: { captchaToken } })`. |
| `startGoogleSignIn(client, db, siteUrl): Promise<void>` | If the current user `is_anonymous` and there's at least one local match: `rpc("create_claim_token")`, then store `meta.pendingClaim = token`. Then `signInWithOAuth({ provider: "google", options: { redirectTo: \`${siteUrl}/auth/callback?next=/account\` } })`. |
| `completeClaim(client, db): Promise<number>` | If `pendingClaim` is set and the user isn't anonymous: `rpc("claim_matches", { p_token })`, then clear `pendingClaim`. Returns the count. On `claim_invalid`, clears the token and returns 0. |
| `takeOverScoring(client, db, matchId): Promise<void>` | `rpc("take_over_scoring", { p_match, p_device })`. Selects `match_events` for the match ordered by `seq`. Writes the events and a `LocalMatch` with `syncedSeq = lastSeq = max seq` and `syncState: "synced"` in one transaction. |

**Auth callback route:** `/auth/callback?code&next` runs `exchangeCodeForSession(code)` with the cookie server client, then redirects to `next` (only relative paths are allowed).

**`<GuestSession/>`:**
- Mounted on `/`, `/new` and `/score` only.
- When online with no session, it renders an invisible Turnstile (if `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set) and calls `ensureGuestSession`.
- Then it starts `startSyncLoop` with `isReady` = session present, and claim = `completeClaim`.
- Spec deviation, decided here: one flow (claim token, then OAuth, then claim) covers both "original phone" and "new phone". The outcome the spec promises (everything carries over) is the same, and it avoids a second Google round trip when `linkIdentity` fails.

- [ ] **Step 1: Write the failing tests:**
  - `does nothing with an existing session`.
  - `returns offline without calling Supabase` (`navigator.onLine = false`).
  - `creates a claim token only for anonymous users with matches`: the call order is `["rpc:create_claim_token", "signInWithOAuth"]`, and `redirectTo` ends with `/auth/callback?next=/account`.
  - `completeClaim clears the token on success and on claim_invalid`.
  - `takeOverScoring writes server events locally as synced`.
- [ ] **Step 2: Run** and see it fail. **Step 3: Implement.** **Step 4: Run** and see it pass.
- [ ] **Step 5: Commit** "Add guest sessions, Google sign-in and scoring take-over".

---

### Task 13: PWA shell and service worker

**Files:**
- Create:
  - `src/app/manifest.ts`, `src/app/icon.tsx`, `src/app/apple-icon.tsx`, `src/app/icons/{192,512,maskable-512}/route.tsx` (copy from family-home and rebrand)
  - `src/app/sw.js/route.ts`
  - `src/components/pwa/{pwa-register,install-app}.tsx` (copy)
  - `src/app/offline/page.tsx`
- Test: `tests/e2e/pwa.spec.ts`

**Interfaces:**
- Produces: `SHELL_PATHS = ["/", "/new", "/score"]`, exported from `src/app/sw.js/shell.ts` so Task 20 can reuse it.

**Rules (adapted from family-home's `sw.js/route.ts`):**

**Install and activate:**
- Cache names are `cs-static-<VERSION>` and `cs-shell-<VERSION>`.
- Install precaches `SHELL_PATHS`, `/offline`, `/manifest.webmanifest` and the icons. It then scrapes `/_next/static/...` URLs from the HTML of **all** shell pages into the static cache.
- `skipWaiting` happens only on the `SKIP_WAITING` message. Never call it automatically, because the scorer may be mid-match.

**Fetch handling:**
- **Navigations** to a shell path are cache-first from `cs-shell` using `ignoreSearch: true`, so `/score?m=…` is served by `/score`. If the cache misses, use the network.
- **Other navigations** go to the network, falling back to `/offline`.
- **`/_next/static` and `/icons`** are cache-first, with runtime fill.
- **Cross-origin requests** (Supabase) are never handled.

**Other requirements:**
- Shell pages must be statically rendered. `/score` reads `m` with `useSearchParams` inside `<Suspense>`.
- Links between shell pages use plain `<a href>`, so offline navigation always goes through the service worker.
- Manifest: `id: "/"`, `start_url: "/"`, `display: "standalone"`, plus a "New match" shortcut to `/new`.

- [ ] **Step 1: Write the failing e2e** `tests/e2e/pwa.spec.ts`, using `next start -p 3100` with placeholder env:
  - `manifest is installable`: name, `start_url "/"`, and icons 192/512.
  - `service worker is served uncached`: the `cache-control` header contains `no-store`.
  - `scoring shell loads offline`: visit `/`, wait for `navigator.serviceWorker.ready`, `context.setOffline(true)`, `goto("/score?m=unknown")` → the response body is the score shell, not the offline page (assert on a `data-testid="score-shell"`).
- [ ] **Step 2: Run** `npm run build`, then `npx playwright test tests/e2e/pwa.spec.ts --project=mobile`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add a minimal `src/app/score/page.tsx` with the test id; Task 15 fills it in.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** "Precache the scoring shell for offline use".

---

### Task 14: Home and new-match screens

**Files:**
- Create: `src/app/page.tsx`, `src/app/new/page.tsx`, `src/components/scoring/new-match-form.tsx`, `src/components/storage-error.tsx`
- Test: `tests/e2e/new-match.spec.ts`

**Interfaces:**
- Consumes: `checkStorage`, `requestPersist`, `createLocalMatch`, `recentPlayerNames`, `defaultRules`.

**Rules:**

**Home (`/`):**
- A primary "New match" button.
- A list of local matches from `useLiveQuery(db.matches.orderBy("updatedAt").reverse())`, showing the summary lines and a "Saved on phone" or "Synced" chip. Each item links to `/score?m=<id>`.
- "Keep your matches", which links to `/account`.

**New match (`/new`), one screen:**
- Team A and B names.
- Ball type as a segmented control: tape (the default), tennis, hard, custom.
- Overs: chips T10, T20, 50, plus a custom number from 1 to 100.
- Collapsible "Rules": balls per over (6/8), players per side for A and B (2–15), wide runs, wide re-bowled, no-ball runs, free hit, LBW, last man stands.
- Toss winner (A/B) and the choice (bat/bowl).
- Striker, non-striker and opening bowler, using a datalist from `recentPlayerNames`.
- Changing the ball type re-applies `defaultRules` for fields the user hasn't touched.

**Validation (zod, in `src/lib/validation/match-setup.ts`):**
- Names are trimmed and 1–40 characters.
- Openers are distinct.
- Overs are between 1 and 100.

**On submit:** `requestPersist()`, then `createLocalMatch`, then `location.assign("/score?m=<id>")`.

**Storage error:** if `checkStorage()` is not ok, `/new` shows `<StorageError/>` ("This browser can't save matches. Open in Chrome, or turn off private browsing.") instead of the form (Review Focus 3).

**Layout:** long and Urdu names truncate with `truncate` / `min-w-0`, with no horizontal scroll at 360px wide.

- [ ] **Step 1: Write the failing e2e:**
  - `start a match with defaults`: fill only the two teams and the three player names, then tap Start → the URL matches `/score?m=`, and the header shows `0/0`.
  - `long and Urdu names don't overflow`: use the team name `"لاہور قلندرز"` and a 40-character player name; then `document.documentElement.scrollWidth <= innerWidth`.
  - `storage error is shown`: run `page.addInitScript(() => { delete (window as any).indexedDB })`, then the storage error text is visible.
- [ ] **Step 2: Run** and see it fail. **Step 3: Implement.** **Step 4: Run** and see it pass.
- [ ] **Step 5: Commit** "Add home and new match screens".

---

### Task 15: Scoring screen (layout B)

**Files:**
- Create:
  - `src/hooks/use-match.ts`
  - `src/app/score/page.tsx`
  - `src/components/scoring/{score-header,this-over,extras-toggles,run-pad,wicket-sheet,batter-sheet,bowler-sheet,start-innings-sheet,all-out-dialog}.tsx`
  - `src/components/sync-chip.tsx`
- Test: `tests/e2e/scoring.spec.ts`

**Interfaces:**
- Produces: `useMatch(matchId: string): { local: LocalMatch | undefined; events: MatchEvent[]; state: MatchState | null; prompt: Prompt | null; record(drafts: EventDraft[]): Promise<void> }`.
  - `events` comes from `useLiveQuery`, and `state` is `replay(events)`.
  - `record` awaits `appendEvents`, then calls `requestSync()`, then shows a toast for any new `warnings` whose `eventId` is among the appended ones.

**Layout B:**

**Header:**
- The score, e.g. `87/3 (11.4)`.
- Batters with runs and balls, and `*` on the striker.
- The bowler's figures `O-M-R-W`.
- CRR, and RRR plus "need X from Y" in innings 2.
- A "FREE HIT" badge when `freeHit` is true.
- `<SyncChip/>`.

**This over:** the ball chips from the current `OverSummary`.

**Extras toggles:**
- Chips for Wide, No-ball, Bye and Leg-bye.
- Wide and No-ball are mutually exclusive. Bye and Leg-bye are mutually exclusive. Wide plus Bye/Leg-bye is not allowed.
- All toggles reset after each recorded ball.

**Run pad:**
- A 3×2 grid: 0, 1, 2, 3, 4, 6. The 4 and 6 buttons mean `boundary: true`.
- "More" opens 5, 7, and "4 run (not boundary)".
- Each tap records `deliveryDraft(state, { runs, boundary, kind, runsAs })`.

**Wicket button:**
- Opens `<WicketSheet/>`, which lists `availableDismissals(state, currentKind)`.
- For run out, it asks which batter and how many runs were completed.
- Caught, run out and stumped take an optional fielder name.
- Retired hurt or out records a `retired` event instead of a delivery.

**Undo:** `record([{ type: "undo", targets: undoTargets(events) }])`. It's disabled only when there are no targets.

**Prompts, driven by `prompt`:**
- `choose_batter`: `<BatterSheet/>` offers retired-hurt players who can return first, then a name input with a datalist. It records `player_added` if the player is new, then `batter_in`.
- `choose_bowler`: `<BowlerSheet/>` lists previous bowlers first, then the name input. It records `player_added?` then `bowler_changed`.
- `start_innings`: `<StartInningsSheet/>` asks for two openers and a bowler. It records `player_added*` then `innings_started`.
- `innings_over`: auto-records `innings_ended` with that reason, and a toast with an "Undo" action.
  - **Exception:** if the latest non-voided `undo` voided an `innings_ended`, don't auto-record. Show an "End innings" button instead, so undoing doesn't loop.
- `all_out`: `<AllOutDialog/>` shows "All out — end innings, or add a player?". End records `innings_ended("all_out")`. Add records `settings_changed` with `playersPerSide[team] + 1`.

**Match complete:** a result banner using `formatResult`.

**Blocked match:**
- If `local.syncState === "blocked"`, show the banner "Not synced — scoring moved to another phone".
- The pad becomes read-only. Events stay.

**`<SyncChip/>`:**
- "Saved on phone" when `syncedSeq < lastSeq`, otherwise "Synced".
- In red with the blocked text when the match is blocked.

**Test ids:** `data-testid` on each run button (`run-0`…`run-6`), the toggles, `wicket`, `undo` and `score`.

- [ ] **Step 1: Write the failing e2e** (no backend):
  - `scores an over with extras`:
    - Tap the golden over: 1, 4, Wide+0, 0, No-ball+6, 2, 0, then Wicket → bowled.
    - Expect `score` to be `"15/1 (1)"` and the batter sheet to show. After a batter is chosen, the bowler sheet shows.
  - `toggles reset after a ball`.
  - `wicket asks for the next batter and the batter takes strike after a catch`.
  - `undo removes the last ball`.
  - `same bowler twice shows a warning but is allowed`.
  - `all out asks and add player continues`.
  - `two tabs stay in step`: open `/score?m=<id>` in two pages of one context, score in page 1, and page 2's `score` updates (Review Focus 2).
  - `scores offline and survives reload`: `setOffline(true)`, score 3 balls, `reload()`, and the score is intact.
- [ ] **Step 2: Run** and see it fail. **Step 3: Implement.** **Step 4: Run** and see it pass.
- [ ] **Step 5: Commit** "Add the layout B scoring screen".

---

### Task 16: Match menu, edit a past ball, scorecard

**Files:**
- Create: `src/components/scoring/{match-menu,edit-ball-sheet,settings-sheet}.tsx`, `src/components/scorecard/scorecard.tsx`
- Test: `tests/e2e/scoring-menu.spec.ts`

**Interfaces:**
- Produces: `<Scorecard state={MatchState} />`. It's a pure view, also used by Task 17.
  - It shows per innings: batting (R, B, 4s, 6s, SR, dismissal text), extras, total, bowling (O, M, R, W, Econ, wd, nb), fall of wickets, partnerships, over-by-over totals, dot % and boundary %.
  - Dismissal text: `"c Zain b Bilal"`, `"b Hamza"`, `"run out (Zain)"`, `"st Zain b Bilal"`, `"lbw b X"`, `"hit wicket b X"`, `"retired out"`, `"retired hurt"`, `"not out"`.

**Menu items:**

| Item | Records |
|---|---|
| Swap strike | `strike_swapped` |
| Change bowler | `bowler_changed`, mid-over |
| Retire batter | `retired` |
| Match settings | `settings_changed`: overs, players for A and B, target (innings 2 only) |
| End innings | `innings_ended("manual")`, after a confirm |
| Scorecard | a vaul drawer with `<Scorecard/>` |
| Share | Task 18 |

**Edit a past ball:**
- Tapping any chip in the over list opens `<EditBallSheet/>`, with fields for runs, kind, runs-as, boundary, and the wicket kind and fielder (only if the ball has a wicket).
- Save is enabled when `canCorrect(event, patch)` is true, and records `correct`.

- [ ] **Step 1: Write the failing e2e:**
  - `edit a past ball`: score 1, 0, 0; edit the first ball to 2 → `score` reads `"2/0 (0.3)"`, and a strike-mismatch toast is shown.
  - `cut overs mid-innings`: set overs to 1, score 6 balls, and the innings ends.
  - `scorecard shows dismissal text`: caught by Zain → `"c Zain b Hamza"`.
- [ ] **Step 2: Run** and see it fail. **Step 3: Implement.** **Step 4: Run** and see it pass.
- [ ] **Step 5: Commit** "Add the match menu, ball edits and scorecard".

---

### Task 17: Live page with Realtime and polling fallback

**Files:**
- Create:
  - `src/server/supabase/public.ts` (`createSupabasePublic()`: no cookies, publishable key, `persistSession: false`)
  - `src/server/live.ts`
  - `src/app/m/[code]/page.tsx`
  - `src/app/api/m/[code]/events/route.ts`
  - `src/lib/live/{merge,use-live-events}.ts`
  - `src/components/live/live-view.tsx`
- Test: `tests/unit/live/merge.test.ts`, `tests/e2e/live.spec.ts` (backend only)

**Interfaces:**
- `type LiveMatchHeader = { id: string; code: string; title: string; teamA: string; teamB: string; status: "in_progress" | "complete"; updatedAt: string }`.
- `getLiveMatch(code): Promise<{ match: LiveMatchHeader; events: MatchEvent[] } | null>` and `getLiveEvents(code, after): Promise<MatchEvent[]>`, both via the RPCs from Task 9.
- `mergeEvents(current: MatchEvent[], incoming: MatchEvent[]): { events: MatchEvent[]; gap: boolean }`: dedupes by `id`, sorts by `seq`, and sets `gap` when the seqs aren't contiguous from 1.
- `useLiveEvents(matchId, code, initial): MatchEvent[]`:
  1. Subscribe to `supabase.channel("match:" + matchId, { config: { private: true } }).on("broadcast", { event: "event" }, …)`.
  2. If it isn't `SUBSCRIBED` within 5 s, or it errors or closes: poll `/api/m/<code>/events?after=<maxSeq>` every `NEXT_PUBLIC_POLL_MS` while `document.visibilityState === "visible"`.
  3. On `gap`, fetch once from `after = last contiguous seq`.

**Events route:**
- Returns `{ events }` with `Cache-Control: public, s-maxage=${LIVE_CACHE_SECONDS}, stale-while-revalidate=10`.
- Returns 404 for an unknown or private code.

**Page:**
- A server component: `getLiveMatch`, or `notFound()`.
- Renders `<LiveView initial…/>`, which replays and shows the header, this over, the last 12 commentary lines (`formatCommentary`), and a Scorecard tab.
- `generateMetadata` sets the title to the score line.
- No `GuestSession` and no anonymous sign-in on this page.
- Keep it light: the `/m/*` client bundle must not import Dexie, Turnstile or `src/components/scoring/*`.
- `LIVE_CACHE_SECONDS` is read through `src/server/env.ts` (default 2).

- [ ] **Step 1: Write the failing unit tests** (Review Focus 5):
  - `mergeEvents dedupes by id, sorts by seq, reports gaps`: merging `[1, 2]` with `[3, 2, 5]` gives seqs `[1, 2, 3, 5]` and `gap: true`; merging `[1, 2]` with `[3]` gives `gap: false`.
- [ ] **Step 2: Write the backend e2e** `live.spec.ts`, skipped unless `E2E_BACKEND=1`:
  - `viewer sees balls live`: the scorer page scores 2 balls, then waits for "Synced". The viewer context opens `/m/<code>` and sees `2/0` or the right score. The scorer scores another ball; the viewer updates within 10 s without a reload.
  - `polling fallback`: in the viewer, `page.routeWebSocket(/realtime/, ws => ws.close())`. The scorer scores a ball, and the viewer updates within `NEXT_PUBLIC_POLL_MS + 5 s`.
  - `unknown code is 404`.
- [ ] **Step 3: Run** the unit tests and see them fail. **Step 4: Implement.** **Step 5: Run** the unit tests (PASS), and the backend e2e when the owner prerequisites exist (PASS).
- [ ] **Step 6: Commit** "Add the live match page with realtime and polling".

---

### Task 18: WhatsApp sharing, link preview image, scorecard image

**Files:**
- Create:
  - `src/lib/share/text.ts`
  - `src/components/share/share-buttons.tsx`
  - `src/app/m/[code]/opengraph-image.tsx`
  - `src/app/m/[code]/card/route.tsx`
  - `src/assets/fonts/` with Noto Sans and Noto Naskh Arabic, regular and bold `.ttf` files, downloaded from the `google/fonts` GitHub repo (OFL licence; keep `OFL.txt`)
- Test: `tests/unit/share/text.test.ts`, `tests/e2e/share.spec.ts` (backend only)

**Interfaces:**
- `buildShareText(state: MatchState, url: string): string`.
- `<ShareButtons code state/>`: "Share on WhatsApp" and "Share scorecard image".
  - Both call `requestSync()` and wait up to 5 s for "Synced" first.
  - The WhatsApp button uses `navigator.share({ text })` when available, otherwise `https://wa.me/?text=${encodeURIComponent(text)}`.
  - The image button fetches `/m/<code>/card`, then uses `navigator.share({ files: [File] })` when `canShare` says files are supported, otherwise downloads `scorecard-<code>.png`.
- The OpenGraph image is 1200×630: title, score lines, and result or "LIVE".
- The card is a 1080×1350 PNG with both innings: batters `name R (B)`, bowlers `name O-M-R-W`, and the result.
- Both image routes load the bundled fonts via `readFile`. Add `outputFileTracingIncludes` for `src/assets/fonts/**` in `next.config.ts`.

**Exact share text** (lines joined with `\n`):
- In progress, innings 1: `"Lions vs Tigers\nLions 87/3 (11.4 ov)\nLive: <url>"`
- In progress, innings 2: `"Lions vs Tigers\nLions 150/6 (20 ov)\nTigers 87/3 (11.4 ov), need 64 from 50 balls\nLive: <url>"`
- Complete: `"Lions vs Tigers\nLions won by 23 runs\nLions 150/6 (20 ov)\nTigers 127/9 (20 ov)\nScorecard: <url>"`

- [ ] **Step 1: Write the failing unit tests:** the three exact strings above, built with `TestMatch`. Use small overs and the matching numbers, or construct the state directly, and assert the format.
- [ ] **Step 2: Write the backend e2e:**
  - `card renders Urdu and long names` (Review Focus 4): a match with the team `"لاہور قلندرز"` and a 40-character player name gives `GET /m/<code>/card` → 200 and `image/png`. `GET /m/<code>/opengraph-image` → 200.
  - `WhatsApp fallback link`: stub `navigator.share` as undefined → the button's `href` starts with `https://wa.me/?text=`.
- [ ] **Step 3: Run** and see it fail. **Step 4: Implement.** **Step 5: Run** and see it pass.
- [ ] **Step 6: Commit** "Share matches to WhatsApp with score images".

---

### Task 19: Account page — keep your matches and take over

**Files:**
- Create: `src/app/account/page.tsx`, `src/components/account/{your-matches,take-over-dialog}.tsx`
- Test: `tests/e2e/account.spec.ts` (signed-out behaviour only; Google sign-in is checked by hand)

**Interfaces:**
- Consumes: `startGoogleSignIn`, `completeClaim`, `takeOverScoring`.

**Rules:**

**`/account`** is network-only.
- **Guest:** shows "Sign in with Google to keep your matches" and a button that calls `startGoogleSignIn`.
- **Signed in (not anonymous):**
  - On mount, runs `completeClaim` and shows a toast "Moved N matches to your account" if N > 0.
  - Lists `matches` where `owner_id = auth.uid()` (owner RLS): title, summary lines, status.
  - Each match has "Open live page" (`/m/<code>`).
  - An unfinished match whose `scoring_device` isn't this device has "Take over scoring". Its confirm dialog body is exactly "Balls not yet synced from the other phone won't be included."
  - On confirm: `takeOverScoring`, then `location.assign("/score?m=<id>")`.

- [ ] **Step 1: Write the failing e2e** `account shows Google sign-in for guests`.
- [ ] **Step 2: Implement.** **Step 3: Run** and see it pass.
- [ ] **Step 4: Manual check, done by the owner on the dev project:**
  - Score on phone A as a guest, then sign in with Google: the matches are kept.
  - Sign in on phone B and take over: B scores.
  - Phone A shows the blocked banner on its next sync.
- [ ] **Step 5: Commit** "Add the account page with match claim and take-over".

---

### Task 20: End-to-end offline flow, deployment docs

**Files:**
- Create: `tests/e2e/offline-sync.spec.ts` (backend only), `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md`
- Modify: `README.md`

- [ ] **Step 1: Write the backend e2e** `full offline match syncs and streams` (Pixel 7):
  1. Create a match and score 1 over online; wait for "Synced".
  2. `setOffline(true)`. Score 2 overs, reload, and check the state is intact.
  3. `setOffline(false)`. Wait for "Synced".
  4. A new viewer context on `/m/<code>` shows `(3)` overs and the same total.
  5. Score one more ball; the viewer updates.
- [ ] **Step 2: Run** `E2E_BACKEND=1 npx playwright test --project=mobile`. Expected: PASS.

- [ ] **Step 3: Write `docs/DEPLOYMENT.md`**, numbered like family-home's:
  1. Create the Supabase project in Mumbai.
  2. Auth: enable anonymous sign-ins; enable the Turnstile CAPTCHA with the secret; set the Google provider; set the Site URL and redirect `https://<domain>/auth/callback`.
  3. `npx supabase link`, then `npx supabase db push`.
  4. Create the Vercel project (region `bom1`) and add the env vars from `.env.example`.
  5. Deploy.
  6. Post-deploy checks:
     - the manifest
     - the service worker headers
     - an offline reload of `/score`
     - a live link on a second phone
     - the WhatsApp preview image
  7. Free-tier watchpoints: Realtime connections and messages, Vercel requests and bandwidth, no backups. Upgrade before real traction.

- [ ] **Step 4: Write `docs/ARCHITECTURE.md`:** the event flow (phone, then IndexedDB, then outbox, then RPC, then Realtime/poll, then viewer), the event types table, the security model (RLS and RPCs), and the test layers. Update `README.md` with the develop and check commands.

- [ ] **Step 5: Final checks.**
  - Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npx playwright test`.
  - Expected: all pass, with the backend specs skipped unless `E2E_BACKEND=1`.

- [ ] **Step 6: Commit** "Add offline sync e2e and deployment docs".

- [ ] **Step 7: Manual launch check, done by the owner:** score a full 10-over tape-ball match on a budget Android phone in airplane mode, reconnect, and follow the live link from another phone.
