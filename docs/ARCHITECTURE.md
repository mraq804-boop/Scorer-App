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
- **The outbox is the unsynced tail** of the events table: events with `seq` above the match's `syncedSeq`. There is no second queue. The loop runs after every ball, on `online`, when the page becomes visible, and on a retry timer (2 s, doubling to 60 s). It pushes batches of 200. The RPC returns the server's last `seq`, the phone stores it as `syncedSeq`, and the chip says "Synced" when `syncedSeq` equals `lastSeq`, "Saved on phone" otherwise.
- **Match code.** Eight characters from `abcdefghjkmnpqrstuvwxyz23456789`, made on the phone. On a collision (`code_taken`) the phone makes a new one once and retries.
- **Local store.** Dexie database `cricket-scorer`: `matches`, `events` (key `[matchId+seq]`) and `meta` (device id, pending claim, orphaned balls).

## Events
Twelve types. Every event also carries `id` (client UUID), `seq` and `at`.

| Type | Fields |
|---|---|
| `match_created` | `title`, `teams` (A, B names), `rules`, `toss` (winner, bat or bowl) |
| `player_added` | `player` (id, name, team) |
| `innings_started` | `innings` (1 or 2), `battingTeam`, `striker`, `nonStriker`, `bowler` |
| `delivery` | `striker`, `nonStriker`, `bowler`, `kind` (legal, wide, noball), `runs`, `runsAs` (bat, bye, legbye), `boundary`, `penalty`, `wicket` |
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
- **Push (client to server): nested.** `push_match_events(p_match, p_device, p_events)` takes events as `{ id, seq, at, type, payload }`, with every other field under `payload` (`toWire` in `src/lib/sync/wire.ts`). `p_match` is the header: `id`, `code`, `title`, `teamA`, `teamB`, `rules`, `status`, `summary`.
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
- **Per-page mounting.** `PwaRegister` is on `/`, `/new`, `/score` and `/offline`. `GuestSession` (anonymous sign-in plus the sync loop) is on `/`, `/new` and `/score`. `/account` is network-only: it has no guest session or sync loop. Live pages (`/m/*`, `/api/m/*`) never sign in and never install the worker, so spectators download little.
- **Updates.** Cache names carry a version (`VERCEL_DEPLOYMENT_ID`). A new worker waits, a toast offers "Reload", and only then does it take over. `experimental.useOffline` makes Next retry failed navigations when the connection returns.
- **Shell pages link to each other with plain `<a href>`** so those navigations are real loads the worker can answer. The scoring pages do not load code lazily, because lazy chunks are not precached.

## Live viewing
- The page (`/m/<code>`) is rendered on the server from `get_live_match`, so the first paint already has the score.
- In the browser, `@supabase/realtime-js` is loaded on demand and joins `match:<id>` as a private channel with the publishable key. Each broadcast event is merged in.
- Merging dedupes by id, sorts by `seq` and applies only the contiguous prefix, so duplicates, out-of-order events and gaps never double-count or skip a ball.
- Polling `/api/m/<code>/events?after=<seq>` is the fallback and the catch-up. It starts when the channel is not subscribed within 5 seconds, when a gap appears or when a fetch fails, and runs every `NEXT_PUBLIC_POLL_MS` while the page is visible. The viewer also fetches once every time the channel subscribes. That catch-up carries a unique `fresh` parameter so it skips the CDN, because a copy cached before the subscription could hide the last ball; the route ignores the parameter, and ordinary polls stay cacheable. The route returns up to 1000 events per call with `Cache-Control: public, s-maxage=<LIVE_CACHE_SECONDS>, stale-while-revalidate=10`, so the CDN absorbs most of the load.
- **Share images.** `/m/<code>/card` (1080 by 1350, shared as a file) and `/m/<code>/opengraph-image` (1200 by 630, the WhatsApp preview) are drawn on the server by `next/og` from the synced events, with bundled Noto Sans and Noto Naskh Arabic fonts. On the scoring screen the share sheet first flushes the phone's outbox (up to 5 seconds), so the image is current.

## Folders
| Path | What |
|---|---|
| `src/lib/scoring` | The pure engine: replay, undo and corrections, stats, prompts, rules (no DOM, no clock, no randomness) |
| `src/lib/local`, `src/lib/sync` | IndexedDB store, outbox loop, wire format |
| `src/lib/identity` | Guest session, Google sign-in and claim, take-over |
| `src/lib/live`, `src/lib/share`, `src/lib/i18n` | Viewer feed and merge, share text and summary, the message catalog |
| `src/server` | Server-only code: live reads and image rendering |
| `src/app` | Routes; `src/components` and `src/hooks` hold the UI |
| `supabase/migrations` | Tables, RLS, RPCs and the Realtime trigger and policy |

## Tests
| Layer | Where | Command |
|---|---|---|
| Unit (vitest) | `tests/unit`: the engine (golden match, fast-check properties), local store on fake IndexedDB, sync loop, live feed and merge, identity, share text, the service worker script, route handlers | `npm test` |
| Database (vitest + PGlite) | `tests/integration`: every migration on in-process Postgres with stand-ins for the Supabase auth and Realtime schemas, run as each kind of caller | `npm test` |
| End to end (Playwright, desktop Edge and Pixel 7) | `tests/e2e`: the production build on port 3200 with placeholder Supabase values, and a stub for sync | `npx playwright test` |
| End to end with a backend | The backend tests in `live.spec.ts` and `share.spec.ts`, and all of `offline-sync.spec.ts`, need a real development Supabase project in `.env.local` | `E2E_BACKEND=1 npx playwright test` |

Backend specs are skipped unless `E2E_BACKEND=1`. The PGlite stand-in for Realtime only records the broadcast, so delivery and the Realtime policy are checked on a real project (see `docs/DEPLOYMENT.md`).
