# Architecture

## Stack
Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind 4, shadcn/ui (Radix), Dexie (IndexedDB), Supabase (Postgres, Auth, Realtime), Vercel. Shipped as an installable PWA.

## Event flow
```
Scorer's phone
  tap ──▶ appendEvents ──▶ IndexedDB (events + match row + summary, one transaction)
                                │
                                ├──▶ screen re-renders from the store (Dexie liveQuery)
                                └──▶ requestSync ──▶ outbox loop ──▶ push_match_events RPC
                                                                       │ one transaction
                                                                       ├─ match_events rows
                                                                       └─ trigger ──▶ realtime.send
                                                                            on private topic match:<id>
Viewer (/m/<code>, no sign-in)
  server render from get_live_match
     ├─ Realtime broadcast on match:<id> ──┐
     └─ polling /api/m/<code>/events ──────┴──▶ merge ──▶ replay ──▶ screen
        (CDN-cached, fallback and catch-up)
```
- **One engine.** `src/lib/scoring` is pure TypeScript: `replay(events)` returns the whole `MatchState` (score, scorecards, partnerships, commentary, prompts, result). The scoring screen, the live page, the share text and the image routes all call it. There is no second copy of the cricket logic.
- **Append-only.** Undo and edit are new events (`undo` voids events, `correct` replaces a ball's details). Order is by `seq` only. `at` is the phone's clock and informational.
- **The phone is the source of truth while scoring.** A ball is shown only after its IndexedDB transaction commits. `appendEvents` assigns `seq` inside that transaction, so values are unique and gap-free per match even with two tabs open.
- **The outbox is the unsynced tail** of the events table: events with `seq` above the match's `syncedSeq`. There is no second queue. The loop runs after every ball, on `online`, when the page becomes visible, and on a retry timer (2 s, doubling to 60 s). It pushes batches of 50. After a network failure the next batch for that match is halved (never below 10), and a successful push brings it back to 50, so a backlog still moves on a slow 2G link. Every Supabase request from the phone gives up after 20 s plus 1 s per KB of request body, so a hung push counts as a network error and its balls stay pending. A call that sets its own signal is not given that limit: take-over downloads allow 120 s per page of 1000 events. A failed push is sorted by whether retrying can help. A request that never completed, a timeout (408), 429 and any 5xx (gateway errors, a schema cache reload) are network errors, and 401 (expired token, no session) is "not signed in"; both retry on the loop's backoff. Only a refusal the server would repeat (`invalid_event`, `too_many_events`, `quota_exceeded` or a constraint violation, status 400 or 409) holds that match back for 15 minutes between tries while other matches keep syncing. Any other unexpected error retries on the loop's backoff too. Balls are never dropped or changed. The RPC returns the server's last `seq`, the phone stores it as `syncedSeq`, and the chip says "Synced" when `syncedSeq` equals `lastSeq`, "Saved on phone" otherwise.
- **Match code.** Eight characters from `abcdefghjkmnpqrstuvwxyz23456789`, made on the phone. On a collision (`code_taken`) the phone makes a new one once and retries.
- **Local store.** Dexie database `cricket-scorer`, version 2: `matches`, `events` (key `[matchId+seq]`), `meta` (device id, pending claim, orphaned balls), `team` (the cached team: squad, seasons, upcoming fixtures and this account's role) and `squadOutbox` (squad players added on the phone and not yet uploaded).

## Events
Twelve types. Every event also carries `id` (client UUID), `seq` and `at`.

| Type | Fields |
|---|---|
| `match_created` | `title`, `teams` (A, B names), `rules`, `toss` (winner, bat or bowl) |
| `player_added` | `player` (id, name, team) |
| `innings_started` | `innings` (1 or 2), `battingTeam`, `striker`, `nonStriker`, `bowler` |
| `delivery` | `striker`, `nonStriker`, `bowler`, `kind` (legal, wide, noball), `runs`, `runsAs` (bat, bye, legbye), `boundary`, `penalty`, `wicket` (`kind`, `playerOut`, `fielderName`, and an optional `fielderId` when the fielder is a squad player) |
| `batter_in` | `player` |
| `bowler_changed` | `player` |
| `strike_swapped` | none |
| `retired` | `player`, `how` (hurt or out) |
| `settings_changed` | optional `oversPerInnings`, `playersPerSide`, `target` |
| `innings_ended` | `innings`, `reason` (overs, all_out, target, manual) |
| `undo` | `targets`: ids of the events it voids |
| `correct` | `target`: id of the event it replaces, `patch` |

Each delivery records who was on strike, at the other end and bowling. The scorer's record is the truth; the engine never recomputes past balls' players. Rules never block: they produce warnings and prompts.

## Wire shapes
- **Push (client to server): nested.** `push_match_events(p_match, p_device, p_events)` takes events as `{ id, seq, at, type, payload }`, with every other field under `payload` (`toWire` in `src/lib/sync/wire.ts`). `p_match` is the header: `id`, `code`, `title`, `teamA`, `teamB`, `rules`, `status`, `summary`, and for a team match a `team` block (`id`, `side`, `fixtureId`, `record`).
- **Reads and broadcasts (server to client): flat.** `match_event_json` rebuilds `payload || { id, seq, at, type }`, the same shape as the in-app `MatchEvent`. `get_live_match`, `get_live_events`, `get_owner_events` and the Realtime trigger all use it, so the viewer and the take-over code use the events as they come.

## Security model
- **RLS on every table, and no table writes.** `matches`, `match_events` and `match_claims` have RLS on. `insert`, `update`, `delete` and `truncate` are revoked from `anon` and `authenticated`. Events can never be changed or removed.
- **Security-definer RPCs** (`set search_path = ''`) are the only way in. Internal helpers (`match_event_json`, `match_events_after`, the broadcast trigger function) have no grants.
  - Scoring and ownership: `push_match_events`, `take_over_scoring`, `get_owner_events`, `create_claim_token` and `claim_matches`, granted to `authenticated` only. Guests count as authenticated, but `claim_matches` also needs a Google user.
  - Viewing: `get_live_match` and `get_live_events` (anyone), which only return matches with visibility `link`, looked up by code. Matches cannot be listed.
- **Owner reads.** The only policies on the app's tables let an owner read their own matches and events, which powers the account page.
- **No secret key.** The app has no `SUPABASE_SECRET_KEY`. The browser and the server both use the publishable key; protection comes from RLS and the RPCs. The server reads live matches as `anon`.
- **One scoring device per match.** `matches.scoring_device` is the phone's device id, set by its first push. A push from any other device is refused with `scoring_moved`, even under the same account. A push by anyone but the owner is refused with `not_owner`. Both mark the local match blocked: read-only, "Not synced — scoring moved to another phone".
- **Pushes are safe to repeat.** An event already stored is skipped by id, a different event at a stored `seq` is rejected, and the loop stops at a gap. The RPC returns the server's last `seq`, so the phone resends from there.
- **Limits** (see the deployment doc): 20 new matches per owner per 24 hours, `seq` up to 5000, 500 events per call, 4 KB per payload and per `rules`, 8 KB per `summary`.
- **Realtime cannot be spoofed.** The trigger broadcasts on the private topic `match:<match id>`. The only policy on `realtime.messages` is `match_topic_read`, a select policy for `anon` and `authenticated` on topics of `link` matches. Nobody has an insert policy, so no client can send to a topic. "Allow public access" is off in Realtime settings.
- **Guest identity** is a Supabase anonymous session, created quietly when a shell page loads online (with a Turnstile token if a site key is set).
- **Claim tokens.** "Keep your matches" calls `create_claim_token` while still a guest. Only the token's hash is stored, and it expires after an hour. Creating a token first deletes the caller's earlier tokens and every expired one, so old tokens never pile up. The token waits in `meta` until the Google user's session exists, then `claim_matches` moves the guest's matches to that user. The sync loop tries a pending claim before it pushes anything.
- **Take-over.** `take_over_scoring` (owner only, needs a connection) points the match at the new phone's device id. The phone then replaces its local copy with the server's events. If it already held unsynced local events for that match, they are saved in `meta` under `orphaned:<match id>` first. The old phone's next push is refused, its match is blocked, and its unsynced balls stay in its IndexedDB. Nothing is deleted anywhere.

## Offline and PWA
- **Precached shell.** The hand-written service worker (`src/app/sw.js/route.ts`, served uncached) precaches `/`, `/new`, `/score`, `/offline`, the manifest, the icons and every `/_next/static/` file those pages reference. A missing script or stylesheet fails the install, so a worker never goes live half-cached. Scoring screens are client-rendered pages with the match id in the query (`/score?m=<id>`), so the cache holds a fixed set of URLs.
- **Fetch rules.** Same-origin GETs only. Static files and icons are cache-first. A navigation to a shell page is answered from the cache whatever its query. Any other navigation goes to the network and falls back to `/offline`. API calls, `/m/*` and `/account` are never cached.
- **Team pages.** `/team` and `/team/join` are network-only like `/account`: no guest session, no sync loop, no worker. The public pages `/t/<code>` and `/t/<code>/p/<player>` are server-rendered, never sign in and never install the worker. An e2e check reads the build manifest to make sure their browser code holds no Dexie, supabase-js, Turnstile or scoring code.
- **Per-page mounting.** `PwaRegister` is on `/`, `/new`, `/score` and `/offline`. `GuestSession` (anonymous sign-in plus the sync loop) is on `/`, `/new` and `/score`. When the loop finds no session and the phone is online it starts a sign-in, one at a time, so a failed first sign-in is retried on the loop's backoff, but never sooner than 60 s after the last failure (the `online` event tries again at once). `/account` is network-only: it has no guest session or sync loop. Live pages (`/m/*`, `/api/m/*`) never sign in and never install the worker, so spectators download little.
- **Updates.** Cache names carry a version (`VERCEL_DEPLOYMENT_ID`). A new worker waits, a toast offers "Reload", and only then does it take over. `experimental.useOffline` makes Next retry failed navigations when the connection returns.
- **Shell pages link to each other with plain `<a href>`** so those navigations are real loads the worker can answer. The scoring pages do not load code lazily, because lazy chunks are not precached.

## Live viewing
- The page (`/m/<code>`) is rendered on the server from `get_live_match`, so the first paint already has the score.
- In the browser, `@supabase/realtime-js` is loaded on demand and joins `match:<id>` as a private channel with the publishable key. Each broadcast event is merged in.
- Merging dedupes by id, sorts by `seq` and applies only the contiguous prefix, so duplicates, out-of-order events and gaps never double-count or skip a ball.
- Polling `/api/m/<code>/events?after=<seq>` is the fallback and the catch-up. It starts when the channel is not subscribed within 5 seconds, when a gap appears or when a fetch fails, and runs every `NEXT_PUBLIC_POLL_MS` while the page is visible. The viewer also fetches once every time the channel subscribes. That catch-up carries a unique `fresh` parameter so it skips the CDN, because a copy cached before the subscription could hide the last ball; the route ignores the parameter, and ordinary polls stay cacheable. The route returns up to 1000 events per call with `Cache-Control: public, s-maxage=<LIVE_CACHE_SECONDS>, stale-while-revalidate=10`, so the CDN absorbs most of the load.
- **Share images.** `/m/<code>/card` (1080 by 1350, shared as a file) and `/m/<code>/opengraph-image` (1200 by 630, the WhatsApp preview) are drawn on the server by `next/og` from the synced events, with bundled Noto Sans and Noto Naskh Arabic fonts. On the scoring screen the share sheet first flushes the phone's outbox (up to 5 seconds), so the image is current. Both are posters: the two teams' colour panels split by a gold diagonal, giant scores, a gold result banner, the top three performers, and floodlights, crowd and confetti drawn as inline SVG (see "Team look and posters").
- **The live page header** (`LiveHero`) shows both teams in their colours with the logo or initials, the score, a LIVE badge or the result, and the batters at the crease, with photos for squad players. A four, a six or a wicket that arrives while the page is open flashes a 1.2-second burst. A win drops confetti once; in a team match, only when the team wins. Both are CSS only and off under reduced motion.

## Team page
- **One team per owner.** The tables are:
  - `teams`: code, name, home ground, time zone (default `Asia/Karachi`).
  - `squad_players`: keyed by `(team_id, id)`; the id is made on the phone.
  - `seasons`.
  - `fixtures`: their `notes` are private.
  - `team_scorers`: with the scorer's Google display name, saved when they accept an invite and shown only to the owner. Their email is never stored or shown.
  - `team_invites`: hashed one-time tokens that expire after 7 days.

  Creating a team and accepting an invite both need a Google account. Any Google user can call `create_team`, once.
- **Players are squad ids.** A team match uses each squad id as the player id in `player_added`, so the engine adds up runs and wickets by id unchanged. A wicket can carry `fielderId` for a catch, run-out or stumping by a squad player. Opponents stay typed names. If the scorer types the exact name of an active squad player who wasn't ticked into the XI, as a batter, bowler or opener, that player is recorded under his squad id and added to the match's XI, so his figures count. A typed substitute fielder still doesn't count.
- **Record flow.**
  ```
  /new ("My team is playing") ──▶ LocalMatch.team { id, side, fixtureId, xi }
  scoring ──▶ events ──▶ push: matchRecord(state, side, xi, playedAt) ──▶ matches.player_stats
  /t/<code> ──▶ get_team_page (cached 60 s) ──▶ aggregateTeamStats ──▶ record, leaderboards, player totals
  ```
  - The phone works out each player's figures for the match with the same engine (`matchRecord`). Every push sends that record with the header, like `summary`, and an edit to a past ball sends a new one.
  - The public page adds up these small records (`aggregateTeamStats`) and never replays balls.
  - Player of the match points are worked out on the page from the raw figures, so a change to the formula also applies to past matches.
- **Squad outbox.** "Add to squad" at the ground writes the player to the cached team and to `squadOutbox`. The sync loop uploads the outbox with `upsert_squad_players` on its own backoff, separate from the balls, so a squad problem never holds up a match. A guest session never uploads, drops or clears team data.
- **Which matches count.**
  - Finished matches count as W, L or T.
  - Matches the owner marks No result count as NR, and their figures still count.
  - Matches in progress show as Live and count nowhere until they finish or are marked No result.
  - A match counts in the season whose dates include the day it was played, in the team's time zone.
- **RPCs.** All are security definer with `search_path = ''`, and `anon` and `authenticated` have no table writes.
  - Owner only: `update_team` (name, home ground, time zone), `upsert_season`, `upsert_fixture`, `set_potm`, `set_result_override`, `create_scorer_invite`, `remove_scorer`, and the team look: `set_team_colour`, `set_team_logo`, `set_player_photo`.
  - Owner or scorer: `upsert_squad_players` (a scorer can add players but not change them) and `get_my_team`.
  - Google users: `accept_scorer_invite`.
  - Anyone: `get_team_page(code)`. It returns the team (with its colour and logo version), squad (with photo versions), seasons, fixtures without notes, and up to 500 link-visible team matches with their record, Player of the match and No result. It never returns events. `get_live_match(code)` adds a `team` block for a team match: code, name, colour, logo version, side, Player of the match, No result, the XI and the photo versions of XI players.
- **`push_match_events` and teams.**
  - A push with a `team` block links the match to that team when the caller owns the team or scores for it.
  - A push from someone who is no longer a member, such as a removed scorer, still syncs, but the match isn't linked, so no ball is lost.
  - A push without the block keeps the existing link.
  - Linking a fixture marks it played.
  - A record over 16 KB is stored as empty: the match still syncs, but its figures don't count.
- **Limits per team:** 60 squad players, 300 fixtures, 30 seasons, 10 scorers and 5 open invites. Names can be up to 40 characters, grounds 60 and fixture notes 280.

## Team look and posters
- **Brand.** The owner picks one of 10 palette colours (`src/lib/brand/palette.ts`; each has a base, dark, light and text shade) and uploads a logo and player photos on `/team`. A team without a colour, and every opponent, gets one from a stable hash of its name. Without a picture, or when a picture won't load, an initials circle in the team colour stands in. An unknown colour is refused by `set_team_colour` with `invalid_colour`.
- **Pictures.** The phone centre-crops and resizes each picture before upload (`src/lib/media/prepare-image.ts`): logo 512 px, photo 384 px, JPEG at quality 0.82, refused above 300 KB. Photos are decoded with `imageOrientation: "from-image"`, so a portrait phone photo stays upright. They go to the public Storage bucket `team-media` at `teams/<team code>/logo-<v>.jpg` and `teams/<team code>/players/<player id>-<v>.jpg`.
  - The version number is part of the file name, so each new picture has a new address and can be cached for a year (`cacheControl: 31536000`). A version is never reused, even after a remove: `nextPictureVersion` takes the larger of the current version plus one and the seconds since 1 January 2026, which still fits a database `int` for decades.
  - `replaceTeamPicture` uploads the new file, saves the new version with the RPC, then deletes the old file. If the save is refused, it deletes the new file and the old picture stays. If the save's answer is lost (a network error), it keeps both files, because the save may have gone through. An extra file costs little; a version pointing at a deleted file would show a broken picture. An upload Storage refuses as too big (413) or not allowed (403, for example the picture limit) gets its own message instead of the connection one.
  - Storage policies on `storage.objects` let a signed-in (not anonymous) owner select, insert, update and delete only under `teams/<their team code>/`, checked through the definer helper `owned_team_code()`. Storage's `remove()` deletes only rows the caller can select, so the select policy is what makes deletes work. Anyone can read the files through the public bucket URL. The bucket allows only `image/jpeg`, up to 307200 bytes. The insert policy also caps a team at 100 pictures, counted by the definer helper `owned_team_media_count()` (`20261028000009_team_media_limits.sql`).
- **Posters.** Image routes, all drawn with `next/og`:
  - `/m/<code>/card` and `/m/<code>/opengraph-image`: the result poster and preview for every match.
  - `/t/<code>/opengraph-image`: the team colour, logo, record and leaders with photos.
  - `/m/<code>/poster/<player id>` (1080 by 1350, `public, s-maxage=60`): a player's big photo, a headline badge (Player of the match, Hundred, Fifty, Five wickets, Hat-trick, Three wickets, in that order), giant figures, team colour, logo and opponent. Only squad players in that match's XI get one, and only once the match is finished or marked No result. Anything else is a 404.

  Satori needs absolute image addresses and fails the whole image when one does not load, so the server fetches each picture first (`embedImages`: 3-second timeout, `image/*` only) and passes data URLs. A picture that does not load falls back to initials. `loadSharedMatch` takes a picker and fetches only the photos an image draws: none for the preview, our side's top performers for the result poster, and the one player for a player poster. The result banner's trophy shows only for a win.
- **One Player of the match rule.** The owner's pick wins when that player was in the XI; otherwise the points formula picks from the XI (`potmFromState`, `matchPotm`). The posters, live page and team page all use it, and an owner's No result shows as No result everywhere.
- **Effects.** Count-ups on the record tiles, confetti on a win and bursts on the live page are CSS keyframes plus a small IntersectionObserver, with no animation library. `effectsEnabled` turns them off when the phone asks for reduced motion, and numbers are always rendered in full first. A record number already on screen when the page loads keeps its value and pulses once; only a number scrolled into view later counts up from 0, so nobody sees a number they have read drop to 0.
- **Badges.** Player totals add `hundreds`, `threeFors`, `fiveFors` and `hatTricks`. The player page shows a player's badges, and the team page's Milestones section lists every player who has one. Like fifties and hundreds, the three-for badge counts hauls of three or four wickets, so a five-for isn't counted twice. A hat-trick is three legal balls in a row by one bowler in one innings, each a wicket credited to the bowler. Wides and no-balls in between don't break the run; a run-out does. The match record stores `bowling.hatTricks` only when it is above 0, so records stay version 1 and older ones still read.

## App frame
- **Tab bar.** `TabBar` (`src/components/app/tab-bar.tsx`) lives once in the root layout. It has five slots: Home `/`, My team `/team`, a raised gold + for New match `/new`, Stats, and Account `/account`.
  - `showsTabBar` (`src/lib/app/frame.ts`) hides it on `/new`, `/score`, `/team/join`, `/auth/*` and `/offline`, so match setup and scoring keep the whole screen.
  - `tabForPath` marks the active tab: `/t/**` makes Stats active, and `/m/<code>` shows the bar with no tab active.
  - Stats goes to your own team's page, otherwise the last team page you opened, otherwise `/team`. The codes live in `localStorage` (`cricket-scorer:my-team`, written by Home and `/team`; `cricket-scorer:last-team`, written by `/t/**`). A `cricket-scorer:team-codes` window event updates the tab on the same page.
  - The bar never reads IndexedDB, so the public pages' bundles stay free of Dexie and supabase-js.
  - `body:has([data-tab-bar])` sets `--tab-bar-space` and pads the page, so content never sits under the bar. `.app-screen` fills the height above it.
- **Top bar.** Each screen renders `AppBar` (`src/components/app/app-bar.tsx`): navy `#1b2340`, the title in `<bdi>`, an optional back or close link, and actions on the right (`ShareLinkButton` shares the page link natively, falling back to copying it; `InstallIcon`). It's sticky and padded for the status-bar safe area.
- **Navigation** stays as ordinary links, so the offline service worker works as before. Screen changes use cross-document View Transitions (`@view-transition { navigation: auto }`) where the browser supports them, off under reduced motion. `.press` gives tappable things a small press-down.
- **Install.** One module-level listener keeps the browser's install prompt (`useInstallPrompt`) and feeds three shapes: a card on Home (Not now hides it for 14 days, `cricket-scorer:install-dismissed`), a row on Account, and an icon in the top bar. iPhone users get the Add to Home Screen steps in a bottom sheet.
- **Full screen.** The manifest's `background_color` (splash) and the light `theme-color` are navy. iPhone uses `statusBarStyle: "black"`, so nothing sits under the status bar.
- **Screens.**
  - **Home:** your team badge in the top bar, **Live now** (in progress or at the innings break) and **Recent** match cards. A team match shows a W/L/T/NR pill from the team's side, using the summary's `winner`.
  - **New match:** the top bar with a close link. The form itself is the scoring code's and is unchanged.
  - **My team:** sections chosen by `?section=` (Squad, Fixtures, Results and Settings for an owner; Squad and Fixtures for a scorer). Switching uses client navigation, so back returns to the previous section. Players and fixtures are added and edited in bottom sheets (`form-sheet.tsx`).
  - **Account:** a profile header with the Google name (never the email) or "Guest on this phone", the install row, and an Appearance switch (Auto, Light, Dark) on `next-themes`.

## Folders
| Path | What |
|---|---|
| `src/lib/scoring` | The pure engine: replay, undo and corrections, stats, prompts, rules (no DOM, no clock, no randomness) |
| `src/lib/local`, `src/lib/sync` | IndexedDB store, outbox loop, wire format |
| `src/lib/identity` | Guest session, Google sign-in and claim, take-over |
| `src/lib/team` | Team logic: the per-match record, Player of the match points, seasons, totals and leaderboards (pure), plus the phone cache and outbox (`local.ts`), the RPC calls (`remote.ts`) and the public page parser (`page-data.ts`) |
| `src/lib/live`, `src/lib/share`, `src/lib/i18n` | Viewer feed and merge, share text and summary, the message catalog |
| `src/lib/app`, `src/components/app` | The app frame: tab and section rules, Stats target, install dismissal, Home sections and pills; the tab bar, top bar, share button and team badge |
| `src/lib/brand`, `src/lib/media` | Team palette and picture addresses; picture crop and resize on the phone |
| `src/components/art`, `src/components/effects` | Inline SVG cricket artwork shared by pages and posters; confetti, count-up and the reduced-motion check |
| `src/server` | Server-only code: live reads, the cached team page read (`team.ts`) and image rendering |
| `src/app` | Routes; `src/components` and `src/hooks` hold the UI (`components/team` is the owner page, `components/team-page` the public page) |
| `supabase/migrations` | Tables, RLS, RPCs and the Realtime trigger and policy; `supabase/setup-all.sql` is every migration in one file for a new project |

## Tests
| Layer | Where | Command |
|---|---|---|
| Unit (vitest) | `tests/unit`: the engine (golden match, fast-check properties), local store on fake IndexedDB, sync loop, live feed and merge, identity, share text, the service worker script, route handlers, team records, stats and page sections, form validation, the palette, hat-tricks, posters (rendered to PNG in `%TEMP%/cricket-posters`) and live bursts | `npm test` |
| Database (vitest + PGlite) | `tests/integration`: every migration on in-process Postgres with stand-ins for the Supabase auth and Realtime schemas, run as each kind of caller | `npm test` |
| End to end (Playwright, desktop Edge and Pixel 7) | `tests/e2e`: the production build on port 3200 with placeholder Supabase values, and a stub for sync | `npx playwright test` |
| End to end with a backend | The backend tests in `live.spec.ts` and `share.spec.ts`, all of `offline-sync.spec.ts`, and the team page render test in `team-page.spec.ts` (which also needs `E2E_TEAM_CODE`, a team made by hand) need a real development Supabase project in `.env.local` | `E2E_BACKEND=1 npx playwright test` |

Backend specs are skipped unless `E2E_BACKEND=1`. The PGlite stand-in for Realtime only records the broadcast, so delivery and the Realtime policy are checked on a real project (see `docs/DEPLOYMENT.md`).
