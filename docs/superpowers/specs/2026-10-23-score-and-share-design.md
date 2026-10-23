# Cricket Scorer — "Score & Share" launch design

Working name: **cricket-scorer** (easy to rename). Project folder: `D:\Projects\cricket-scorer`.

## Context

The goal is a free, public cricket scoring app for **Pakistan**, competing with CricHeroes. Scorers would pick it for four reasons:

1. **Faster, simpler scoring.** Fewer taps per ball and less clutter, and it **keeps working with no signal**.
2. **Free.** No paywalls on the things people need.
3. **Local formats come first.** Tape-ball, tennis-ball and custom street rules work properly.
4. **Built for Pakistan.** WhatsApp is the main way scores get shared, and the app runs on budget Android phones over patchy mobile data.

The full product list has about 70 features. **This document designs the first public launch, "Score & share"**, and lays out the rest as later phases. The launch must be good enough to put in front of real scorers.

People who use it:
- **Scorers** at the ground, often on cheap Android phones.
- **Captains and organizers.**
- **Spectators and family**, who mostly won't install anything. They open a link someone posted in a WhatsApp group.

## What you decided

| Decision | Choice |
|---|---|
| Audience | Public product, anyone can use it |
| First market | Pakistan |
| Stack | **Next.js + Supabase + Vercel, shipped as a PWA** (installable web app, no app store at launch) |
| Launch scope | **Score & share**: quick match setup, ball-by-ball scoring with undo, full scorecard, live link, WhatsApp sharing, guest scoring without sign-up |
| No signal at the ground | **Keep scoring and sync later.** Every ball saves on the phone first and uploads when signal returns. |
| Scoring screen | **Layout B, "runs first, extras as toggles"**: six big run buttons (0, 1, 2, 3, 4, 6), toggle chips for Wide, No-ball, Bye and Leg-bye that apply to the next tap, a big Wicket button, and Undo. A "5 / 7+" option sits behind a small "more" control. |
| Language | **English first**, built so Urdu can be added later without rework |
| Hosting at launch | **Free tiers** (Supabase Free + Vercel Hobby). The build has to work within free-tier limits. |
| Location | `D:\Projects` |

## Goals, non-goals, anti-goals

**Goals (launch)**
- A guest can open the app, set up a match and score the first ball in **under 60 seconds**, with no sign-up.
- A scorer can score a full tape-ball match on a budget Android phone **with mobile data off the whole time**. Nothing is lost, and everything syncs when signal returns.
- Spectators with the link see each ball **within a few seconds** of it syncing, on a cheap phone over 3G, without installing anything.
- One tap sends the live link and the result summary to WhatsApp.

**Non-goals (launch).** All of these are in later phases: saved teams and player profiles, career stats, tournaments, DLS/rain rules, Test-match multi-innings, PDF/CSV reports, roles and permissions, push notifications, subscriptions, Urdu, and app-store listings.

**Anti-goals.** Any of these would make the launch a failure even if it technically works:
- **Losing a ball.** The scoring screen must never drop or corrupt a recorded delivery, even if the phone dies, the tab is closed or storage is under pressure.
- **Refusing to record what actually happened.** Local cricket is messy. Rule checks (the same bowler bowling consecutive overs, a bowler over his quota, all out) **warn or ask, but never block**. *(My call, from your "local formats first".)*
- **Forcing sign-up** before someone can score.
- **Clutter or ads on the scoring screen.**
- **Heavy pages.** The live page must stay light and fast on cheap phones and slow networks.

## Launch features

**Match setup** (one screen, sensible defaults pre-filled):
- Team names.
- Ball type: tape, tennis, hard or custom.
- Overs: presets T10, T20 and 50-over, or a custom number. Each side bats one innings.
- Balls per over (6 by default, 8 allowed) and players per side. The two teams can have different numbers, since 9 against 10 happens.
- Local rule switches:
  - Wide value (default 1), and whether a wide is re-bowled.
  - No-ball value (default 1).
  - Free hit after a no-ball (on/off).
  - LBW allowed (on/off). Tape-ball usually turns it off.
  - Last man stands (on/off).
- Toss winner and their choice to bat or bowl.
- Opening batters and opening bowler. Players are **typed in as they come** (names only). Names already entered in this match, plus recent names on this phone, are offered as suggestions.

**Scoring (layout B):**
- Run buttons, plus the extras toggles: wide, no-ball, bye, leg-bye.
- **Wicket** opens a short dismissal picker: bowled, caught (with fielder), LBW (only if enabled), run out (which batter, runs completed, fielder), stumped, hit wicket, retired hurt (not out, can return), retired out, other.
- On a free hit, only dismissals allowed on a free hit can be chosen. Free hit carries over if the free-hit ball is itself a wide or no-ball.
- **Strike rotates automatically** on odd runs and at the end of the over. After a catch, the new batter takes strike (2022 Laws). The scorer can always swap strike by hand.
- At the end of each over, the app asks for the next bowler. Previous bowlers come first, or a new name can be typed. A warning appears if the same bowler bowls twice in a row.
- After a wicket, the app asks for the next batter.
- **Undo** steps back one delivery and can be repeated.
- **Edit a past ball** *(my call)*. Fixing a mistake from two overs ago is common.
  - An edit can change the runs, the extras type, and dismissal details (kind and fielder).
  - It **cannot add or remove a wicket**. For that, undo back to that ball.
  - Later balls keep the batters and bowler the scorer recorded at the time. The app warns if an edit makes the strike or over count inconsistent, but it never rewrites later balls.
- **Change settings partway through** *(my call)*: overs (e.g. "let's make it 8"), players per team (a late player joins), and a manually set target for the chase. Each change is recorded as an event at that moment.
- Simple automatic **commentary** for every ball, e.g. "11.4 Hamza to Ali, FOUR".
- An innings ends when the overs are done or the target is reached in the chase. The scorer can also end it by hand.
- **All out asks rather than ends** *(my call)*: "All out — end innings, or add a player?"
- The result is worked out automatically: won by X runs, won by Y wickets with Z balls left, or tie.

**Scorecard:**
- Batting (R, B, 4s, 6s, SR, dismissal).
- Bowling (O, M, R, W, Econ, wides, no-balls).
- Extras breakdown, fall of wickets, partnerships, over-by-over totals.
- Current and required run rate.
- Dot-ball % and boundary % (they come almost free from the same data).

**Live link and sharing:**
- **Live page** at `/m/<short-code>`, readable by anyone with the link:
  - Score, current batters and bowler, this over, commentary, and a tab with the full scorecard.
  - Updates arrive without refreshing (see "Sync and live updates" for how this works within free-tier limits).
- **WhatsApp button**: the Web Share API where available, otherwise a `wa.me` link. It sends a short score summary plus the link.
- **The link preview image shows the score.** The page has an OpenGraph image of the current scorecard, so pasting the link into WhatsApp shows the score.
- **"Share scorecard as image"** shares a PNG of the scorecard. *(My call — scorecard images are how scores travel in WhatsApp groups.)*

**Identity:**
- **Guest mode by default.** Supabase anonymous sign-in happens quietly in the background the first time the phone is online.
- **"Keep your matches"** *(my call — you didn't object when I played it back; without it, a lost phone loses everything)*. One "Sign in with Google" button, not a full accounts system:
  - **On the original phone**, it links Google to the guest identity, so everything carries over.
  - **On any other phone**, signing in shows a "Your matches" list loaded from the server. From there you can view and share any match, or **take over scoring** of an unfinished one. Taking over copies its events down onto that phone.
  - **Guest matches already on that phone** before sign-in get moved into the account. Supabase can't link a Google account that already belongs to another user, so this is a "claim these matches" step done while the guest session is still active.
  - **Only one phone scores a match at a time.** The match records which device is scoring it.
    - Pushes from any other device are rejected, even under the same account, so two phones can never clash over sequence numbers.
    - "Take over scoring" needs a connection and comes with a warning: "Balls not yet synced from the other phone won't be included."
    - If the old phone later comes online with unsynced balls, they stay on that phone, marked "not synced — scoring moved to another phone". They're never silently deleted.

## How it works

### 1. One scoring engine, used everywhere

A **pure TypeScript scoring engine** (`src/lib/scoring/`) takes the list of events for a match and works out everything: score, scorecards, partnerships, commentary, whose turn it is, and the result.

The scorer's phone, the live page and the image/OpenGraph routes all run **the same engine** on the same events. There is no second copy of the cricket logic anywhere.

### 2. Every action is an event that is never changed

Each match is an **append-only list of events**, each with a client-made UUID and a per-match sequence number. Event types include:
- match created and toss
- delivery
- new batter in
- bowler changed
- swap strike
- retire
- settings changed
- innings ended and match ended
- **undo**, which voids event N
- **correct**, which replaces event N's details

Undo and edit are **new events**, never deletions. That gives three benefits:
- Sync only ever appends, so there are no conflicts.
- Replaying the list always gives the same answer.
- There's a full history of changes for free, which later becomes "match audit history".

**Each delivery event records who was on strike, who was at the other end, and who was bowling** *(my call)*. The scorer's record is the truth. The engine suggests the next striker for the screen, but it never works out past balls' players again. This keeps edits safe and replays stable. It's also hard to change after launch, because synced events can never be changed.

**One scoring phone per match** (see "Keep your matches"). Several scorers working together on one match comes in a later phase.

### 3. Offline first: the phone is the source of truth while scoring

- Events are written to **IndexedDB** (via Dexie — *my call*) **before** the screen updates. The app calls `navigator.storage.persist()` so the browser is less likely to clear the data.
- An **outbox** pushes unsent events to Supabase whenever the phone is online. It runs:
  - after every ball
  - when the `online` event fires
  - when the app comes back into view
  - on a retry timer with backoff
- A small status chip shows **"Saved on phone"** or **"Synced."**
- The **service worker precaches the scoring app shell**: home, new match, and the score screen. Scoring then loads and works with no network, even after a reload.
  - Scorer screens are client-rendered pages whose match id is in the query string (for example `/score?m=<id>`). That way the service worker caches a fixed set of URLs.
  - This differs from family-home, whose service worker is deliberately network-only for private data.

### 4. Sync and live updates (Supabase)

**Tables:**
- **`matches`**: id (client UUID), short code, owner, the id of the device currently scoring it, team names, rules (jsonb), status, visibility (`link` at launch; `private` later), timestamps, and the last synced sequence number.
- **`match_events`**: id, match_id, sequence number, type, payload (jsonb), and the time it was created on the client. Each (match, sequence number) pair is unique.

**Writes:**
- All writes go through **security-definer RPCs**. There are no direct table writes.
- **`push_match_events(match, events[])`** handles scoring:
  - It creates the match if it's new, with the owner set to the signed-in user.
  - It rejects anyone except the owner, and any device other than the one currently scoring the match.
  - It inserts events with `on conflict (id) do nothing`, so re-pushing the same events is safe.
  - It rejects gaps in the sequence and returns the server's last sequence number.
- **`take_over_scoring(match)`** moves scoring to this device.
- **`claim_matches(from guest)`** moves guest matches into a signed-in account.
- Events can never be updated or deleted.

**Reads:**
- RLS lets anyone with the link read a match whose visibility is `link`.
- The owner can read all of their own matches.

**Live updates, built for free-tier limits.** Supabase Free allows about 200 live connections for the whole project, and Vercel Hobby has monthly request limits. So spectators get updates two ways, and both are built and tested:
1. **Live push first.** Viewers subscribe to new events for one match.
   - **Viewers must not be able to push fake updates to other viewers.** The suggested approach is a database trigger that broadcasts on a **private** Realtime topic per match. RLS on `realtime.messages` lets anyone read the topic but nobody write to it.
   - The builder may choose another approach that meets the same requirement.
2. **Cached polling as the fallback** when live push can't connect, for example because the connection cap is reached.
   - A small Vercel route returns the match's events after a given sequence number.
   - The CDN caches it for a couple of seconds, so a thousand viewers cost only a few database reads.
   - Viewers poll every few seconds while the page is visible, and pause when it's hidden.

Either way, if a viewer spots a gap in the sequence, they re-fetch.

**Hosting:** Vercel region `bom1` and the Supabase region in Mumbai, closest to Pakistan (same as family-home).

### 5. Sharing images

The OpenGraph image and the "share as image" PNG are made on the server by `next/og` from the synced events, using the same engine. Pressing share first flushes the outbox, so the image is up to date.

### 6. Ready for Urdu later

- All UI text lives in a message catalog (English only for now). The library choice is the builder's.
- Use direction-neutral Tailwind spacing (`ms-`/`me-`/`ps-`/`pe-`) so a right-to-left layout is cheap to add later.

## Conventions to copy from `D:\Projects\family-home`

- **Stack and versions:** Next 16, React 19, Tailwind 4, shadcn (`components.json` style `radix-nova`), `radix-ui`, sonner, zod, react-hook-form, lucide, next-themes, vitest, Playwright, PGlite, fast-check.
- **Next 16 instructions:** keep the `AGENTS.md` Next 16 block. Read `node_modules/next/dist/docs/` before writing code.
- **Layout:**
  - `src/app/<route>` with `page.tsx` and `actions.ts`.
  - `src/lib/` for pure, client-safe logic (the scoring engine lives here).
  - `src/server/` with `import "server-only"`.
  - `src/proxy.ts` (Next 16's replacement for middleware).
  - `@/*` points to `src/*`.
- **Supabase setup:**
  - Copy the client helper pattern: `src/lib/supabase/browser.ts`, `src/server/supabase/server.ts` and `admin.ts`.
  - Use the new key names `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`, and check env values with zod (`lib/env.ts`, `server/env.ts`).
- **Proxy:** it must let guests through. Scoring and live pages are public. Only a few pages, like account linking, need a session.
- **Database migrations:** `supabase/migrations/YYYYMMDDNNNNNN_name.sql`. Use a separate dev Supabase cloud project and `npx supabase db push`.
- **RLS conventions:** the RLS loop, `security definer set search_path = ''` helpers, `(select auth.uid())`, and `<table>_read`-style policy names.
- **Errors from server actions:** the `ActionResult<T>` and `dbError` pattern (`src/server/actions/result.ts`).
- **PWA pieces:**
  - `src/app/manifest.ts`.
  - Icon route handlers.
  - A hand-written service worker served by `src/app/sw.js/route.ts`, with cache names that include `VERCEL_DEPLOYMENT_ID`.
  - `components/pwa/pwa-register.tsx` (the "new version, reload" toast), the offline banner, and `install-app.tsx`.
- **Security headers:** the CSP and security headers in `next.config.ts`. The CSP must allow the Supabase `wss://` host.
- **Testing:**
  - The PGlite harness `tests/integration/db.ts`: Supabase stub, `as(db, actor, fn)`, `expectDbError`.
  - Folders `tests/unit/` and `tests/integration/`.
  - `tests/e2e/` with Playwright desktop and Pixel 7 projects run against `next start -p 3100`.

## Later phases (the rest of your list, in order)

1. **Launch: Score & share.** Everything in this document.
2. **Accounts, teams and players:**
   - Full sign-up and login.
   - Saved teams and squads, player profiles and photos, batting and bowling styles.
   - Captain, wicketkeeper, playing XI, substitutes and availability.
   - Career and head-to-head stats, player of the match.
   - Match templates; ground, date and officials.
   - Private matches, sharing permissions, handing scoring to another phone, backup and restore.
3. **Tournaments and leagues:**
   - Registration, fixtures, groups and knockouts.
   - Points table with NRR, leaders, player of the tournament.
   - Automatic standings, tournament-specific rules.
4. **Ground and umpire tools:**
   - Penalties and discipline, powerplays.
   - Rain interruptions and revised targets, DLS.
   - Abandonment, super over, Test and multi-innings matches.
   - Notes and umpire decisions.
5. **Reports and records:**
   - PDF and CSV exports, print views.
   - Team and player progress reports, season summaries.
   - Search and filter past matches.
   - Audit history view, already captured by the event log.
6. **Growth:**
   - Push notifications (web-push, as in family-home).
   - Urdu with right-to-left layout.
   - A Play Store listing via a Trusted Web Activity wrapper.
   - Subscriptions and usage limits with JazzCash/Easypaisa, if ever needed.

## Risks to know about

- **DLS licensing.** The official DLS resource tables are licensed (ICC). Phase 4 may need a licence or a published alternative such as par-score or VJD.
- **iOS PWA limits.** Safari can clear site data for web apps that aren't used for a while, and iPhone install and push support is weaker than Android's. The impact is low because the main users are on Android, and the sync-when-online design means synced matches are safe.
- **Free-tier limits** (you chose free tiers to start):
  - Supabase Free caps live connections at about 200, which is why the polling fallback exists.
  - Monthly quotas apply to Realtime messages, data transfer and Vercel requests. The poll interval and image caching should be tunable through environment variables.
  - **There are no automatic database backups.** While a match is being scored, the phone holds the source of truth. Before real traction, move to Supabase Pro or add a scheduled database dump to private storage.
  - Supabase pauses free projects after about a week of inactivity, which is only a concern before launch.
- **Vercel Hobby plan** is for non-commercial use. Move to Pro before adding any paid features or ads.
- **Anonymous sign-in abuse.** Enable Supabase's CAPTCHA option (Cloudflare Turnstile — *my call*) and rate limits on anonymous sign-ins.

## Left to the builder

- Exact screen layouts beyond layout B's structure, plus visual style and colours.
- How to phrase the commentary.
- The Dexie schema details and outbox retry timings.
- Short-code format.
- The Realtime mechanism, as long as the "no spoofing" rule holds.
- Which i18n library to use.
- Exact MCC Laws edge cases, such as byes off a no-ball and penalty attribution. Follow the current MCC Laws: the bowler is charged for wides, the no-ball penalty and runs off the bat; byes and leg-byes are not charged to the bowler.

## After approval: next steps

1. Create `D:\Projects\cricket-scorer`, `git init`, and save this design as `docs/superpowers/specs/2026-10-23-score-and-share-design.md`. Commit it.
2. Run `superpowers:writing-plans` to produce the step-by-step implementation plan for the launch phase.

## How the launch will be verified

- **Engine unit tests (vitest):**
  - Scripted "golden" matches give expected scorecards: wides, no-balls, free hits, run-outs off extras, last man stands, ties, chases.
  - **fast-check property tests:**
    - Total equals batters' runs plus extras.
    - Legal balls never exceed the over limit.
    - Replay always gives the same result.
    - Undoing the last event gets back exactly the previous state.
    - A correct-event matches a fresh replay.
  - **Settings-change cases:** overs cut partway through, a player added after all out, a manual target.
- **Database tests (PGlite):**
  - The owner can push; strangers can't.
  - Re-pushing the same events is harmless; sequence gaps are rejected.
  - Anyone can read `link` matches.
  - Nobody can update or delete events.
  - Nobody can broadcast to a match's live topic.
  - A second device under the same account is rejected until it takes over, and after a take-over the old device is rejected.
  - Claiming guest matches moves ownership only for the right guest.
- **End-to-end tests (Playwright, Pixel 7 profile):**
  1. Create a match and score an over.
  2. Go offline (`context.setOffline(true)`), score two more overs, and **reload while offline**. The app loads and the state is intact.
  3. Go back online. A second browser context on `/m/<code>` shows every ball, then receives the next ball live. Repeat with live push blocked, to prove the polling fallback works.
  4. Check the WhatsApp share text and the OpenGraph image.
- **Manual check:** score a full 10-over tape-ball match on a real budget Android phone in airplane mode, then reconnect and check the live link from another phone.
