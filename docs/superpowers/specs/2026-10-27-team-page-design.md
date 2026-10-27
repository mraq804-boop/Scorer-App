# Team page — squad, fixtures, seasons, stats and rankings (design)

## Context

The "Score & share" launch is built and deployed: guests score matches ball by ball offline, sync to Supabase, and share a live link. Every match stands alone, though. Players are typed in as names per match, so the app can't add up a player's runs or wickets across matches.

The owner runs **one team** and wants a **public team page**. Anyone with the link can see the team's fixtures, results, player stats and leaderboards, and only the owner edits.

The owner asked whether the free Supabase plan can handle this. **Yes.** One team's season is tiny: about 100 matches × ~400 ball events is roughly 40,000 rows, a few MB of the free plan's 500 MB. All stats are worked out from balls already recorded, so nothing extra has to be typed.

## What the owner decided

| Decision | Choice |
|---|---|
| Who sees it | **Public team page.** Anyone with the link can view it; only the owner edits. |
| Scope | **Only my team.** One team; opponents stay typed names with no stats. |
| Recognising players | **Saved squad.** The owner keeps a squad list; at match start they tap their playing players in, so stats add up exactly. |
| Rankings | Top run scorers and wicket takers, **plus** more batting, more bowling, fielding, and Player of the match / MVP. |
| Player of the match | **Points formula suggests, owner can override.** The season MVP table uses the same points. |
| Results | **Every team match is scored in the app**, so there's no manual result entry. |
| Seasons | **Named seasons the owner sets**, such as "Winter 2026", with start and end dates. |
| Layout | The sketched team page looked right: team record, next fixtures, recent results, season/all-time switch, leaderboards, and a player card. |
| Other scorers | **The owner can add scorers.** A teammate given scoring rights can score team matches on their own phone, and those matches count for the team. |
| Unfinished or abandoned matches | **The owner can mark a match "No result."** It shows NR and is neither a win nor a loss, but its runs and wickets still count in player stats. Ties show T. |

## Goals, non-goals, anti-goals

**Goals**
- The owner sets up the team once: name, home ground, squad and seasons. After that, the owner keeps fixtures up to date.
- When the owner starts a match for the team, they tap the playing players from the squad. From then on every run, wicket and catch counts for that player, with nothing extra to enter.
- Anyone with the team link sees, on a cheap phone:
  - the team's record and next fixtures;
  - recent results, each linking to that match's live or scorecard page;
  - leaderboards for this season or all time;
  - a page for each player.
- Player of the match is suggested automatically for every team match, and the owner can override it.

**Non-goals (this round)**
- More than one team per owner.
- Stats for opposition players.
- Tournaments or points tables.
- Entering results by hand.
- Player photos.
- Notifications.
- Counting matches scored before this feature into the team's stats.

**Anti-goals**
- **The team feature must never block scoring.** The squad and upcoming fixtures are kept on the phone, so a match can start with no signal. If the phone has never loaded the squad, scoring still works with typed names; that match just doesn't count for the team.
- **Never lose a ball.** Nothing here changes how balls are stored or synced.
- **The public page shows only names, roles and cricket stats.** No phone numbers or other personal details.
- **The public page must stay light.** It's server-rendered, with no scoring code, phone storage or sign-in code on it.

## How it works

### 1. Owner and team
- **Creating the team needs Google sign-in** (*my call*). A team must outlive a lost phone, and guest sessions can be lost. Scoring itself still never needs sign-in.
- One team per owner account.
- The team gets a short public code, giving a link like `/t/<code>`. The code uses the same 8-character alphabet as match codes.
- **Scorers** (*my call* on how):
  - **Inviting:** the owner creates a one-time invite link that expires after 7 days and sends it on WhatsApp. The teammate opens it, signs in with Google, and becomes a scorer. Nobody's email address is ever shown.
  - **Removing:** the owner can remove a scorer at any time.
  - **What a scorer can do:** load the squad onto their phone, start and score team matches (including from a fixture), and add a new player to the squad at the ground.
  - **What only the owner can do:** edit fixtures, seasons, scorers, Player of the match and "No result."
  - **Who owns the match:** the scorer's own account, as today. It counts for the team because it is linked to the team.
  - **Taking over scoring:** unchanged; it still works only between phones on the same account.
- **The team's time zone** is saved when the team is created (default `Asia/Karachi`). It's used to show fixture times and to decide which season a match belongs to.
- Team management happens on a new owner page, **`/team`**, which works online only, like `/account`. It covers:
  - creating the team (name, home ground);
  - the squad: add, edit, and mark a player inactive (history is kept);
  - seasons: name, start date, end date;
  - fixtures: date and time, opponent, ground, home or away, overs, notes, and status scheduled, played or cancelled;
  - choosing Player of the match per completed match;
  - marking a match **No result**, or clearing that mark;
  - inviting and removing scorers;
  - the public link with a WhatsApp share.

### 2. Players are recognised by squad ID
- Each squad player has a permanent ID.
- When a team match starts, the owner's side uses those IDs as the players' IDs in the match's `player_added` events. Batting and bowling lines are already keyed by player ID, so the existing engine works unchanged and stats add up across matches.
- Opposition players keep typed names with fresh per-match IDs, as today.
- **New player at the ground:** "Add to squad" works offline (*my call*). It creates the squad player on the phone with a new ID and uploads it the next time the phone syncs, before that match's balls.

### 3. Fielders become identifiable
- Wickets gain an optional `fielderId` alongside `fielderName`. Old events without it still replay exactly as before.
- When the owner's team is fielding, the wicket sheet offers the playing squad to pick the catcher, run-out fielder or keeper. When the other side is fielding, the fielder stays free text.
- Caught-and-bowled counts as a catch for the bowler.
- This is the only change to the engine and event format. It adds one optional field, keeps the engine pure, and keeps every existing golden and property test unchanged.

### 4. Starting a match for the team
- **On `/new`:** when the phone has a cached team, a "My team is playing" switch appears, on by default. With it on:
  - side A is the team's name;
  - the owner ticks the playing players from the squad;
  - the openers and opening bowler are picked from those players;
  - the opponent side stays typed.
- **From a fixture:** "Start match" on a fixture pre-fills the opponent, overs and ground, and links the match to that fixture.
- **During scoring:** the batter and bowler sheets list the team's playing players first, so every pick uses the squad ID.
- **Stored on the match:** the local match records the team ID, which side is the team, and the fixture ID if any.

### 5. Where the stats come from (*my call*)
- **The phone works out each player's figures for the match** from the event list, using the same engine.
  - A new pure function, `matchPlayerStats(state, teamSide)`, returns per-player batting, bowling and fielding figures plus Player of the match points.
  - Those figures go to the server with each sync, stored on the match row as `player_stats`.
  - This follows the existing `summary` pattern: only the match owner can write it, so trusting their phone is fine. Edits to past balls recompute it on the next sync.
- **The team page adds up these small per-match records** rather than replaying every ball, using a new pure function, `aggregateTeamStats`.
  - About 100 matches is roughly 300 KB of data, against megabytes if every event were fetched for every page view.
  - Results are cached for about 60 seconds.
- **No SQL copy of the cricket rules and no secret key.** The engine remains the single source of truth.

### 6. Stats, leaderboards and Player of the match
- **Batting:** matches, innings, not outs, runs, balls, 4s and 6s, highest score (with \*), 30s and 50s, average (runs divided by dismissals) and strike rate.
- **Bowling:** overs, maidens, runs, wickets, economy, best figures (most wickets, then fewest runs) and dot balls.
- **Fielding:** catches, run-outs and stumpings.
- **Leaderboards:** most runs, most wickets, highest score, most 6s, most 4s, best average, best strike rate, best economy, best figures, most maidens, most dots, most catches, most run-outs and stumpings, MVP points, and Player of the match awards.
- **Minimum thresholds** (*my call*, kept as named constants and easy to change):
  - batting average needs at least 3 innings;
  - strike rate needs at least 30 balls;
  - economy needs at least 10 overs.
- **Player of the match points** (*my call*, kept as named constants):
  - 1 per run, +1 per four, +2 per six;
  - +10 for a 30, +20 for a 50;
  - 20 per wicket, +10 per maiden, +1 per dot ball;
  - 10 per catch, run-out or stumping.
- **Choosing Player of the match:** the suggestion is the team player with the most points in that match. The owner can override it on `/team`. The season MVP table adds up points across the season.
- **Seasons:** a match counts in the season whose dates include the day it was played, in the team's time zone. If two seasons overlap, the one that started later wins. "All time" covers every team match.
- **Which matches count:**
  - **Finished matches** count in the record as W, L or T, and in all stats.
  - **No-result matches** count as NR in the record, not a win or loss. Their runs and wickets still count, and Player of the match still applies.
  - **Matches still in progress** appear in Recent results as "Live", linking to the live page. They're left out of the record, stats and Player of the match until they finish or are marked No result (*my call*).
- **Matches played** counts every player ticked into the playing XI, including those who didn't bat or bowl (*my call*).
- **Player of the match points are worked out on the page** from the stored raw figures, so changing the formula updates past matches too (*my call*).
- **Inactive squad players** still appear on all-time leaderboards and player pages (*my call*).

### 7. Public pages (server-rendered, light)
- **`/t/<code>`** follows the agreed sketch:
  - header with team name, ground, and played/won/lost for the selected season;
  - next fixtures;
  - recent results, each with a W or L pill, linking to `/m/<code>`;
  - a season switch, made of plain links such as `?season=<id>` or `all`;
  - leaderboards showing the top 5 each, grouped as Batting, Bowling, Fielding and MVP.
- **`/t/<code>/p/<playerId>`:** a player card with batting, bowling and fielding totals for the season or all time, plus a match-by-match list.
- **WhatsApp:** a share button and a link-preview image showing the team name and the top 3 run scorers and wicket takers (*my call*; it reuses the existing image route setup).
- **Constraints:** no scoring code, no phone storage, and no sign-in on these pages. All copy goes through `t()`, names are wrapped in `<bdi>`, and the layout uses direction-neutral classes.

### 8. Database (Supabase, new migration)
**New tables** (RLS on, owner reads, no direct table writes):
- **`teams`:** id, owner_id, code (unique), name, home_ground, time_zone.
- **`team_scorers`:** team_id, user_id, added_at. Scorers are always signed in with Google, never anonymous.
- **`team_invites`:** team_id, a hashed one-time token, and an expiry. Same pattern as the existing claim tokens.
- **`squad_players`:** id (made on the client), team_id, name of at most 40 characters, role (batter, bowler, all-rounder, keeper, or null), active, created_at.
- **`seasons`:** id, team_id, name, starts_on, ends_on.
- **`fixtures`:** id, team_id, starts_at, opponent, ground, home_away, overs, notes, status, match_id.

**`matches` gains:** `team_id`, `team_side` (`A`/`B`), `fixture_id`, `player_stats` (jsonb, size-capped like `summary`), `potm_player_id`, and `result_override` (null or `no_result`). The match stores raw figures plus the list of players in the XI, not points.

**`fixtures`:** the `notes` field is private and never returned to the public page (*my call*).

**New server functions**, all security-definer with ownership checks, following the existing pattern:
- **Owner only:** `create_team`, `upsert_season`, `upsert_fixture`, `set_potm`, `set_result_override`, `create_scorer_invite`, `remove_scorer`.
- **Owner or scorer:** `upsert_squad_players` (batch, idempotent by ID), `get_my_team` (returns the team, squad, seasons and upcoming fixtures, with the role of the person asking).
- **Signed in with Google, not as a guest:** `accept_scorer_invite(token)`.
- `get_team_page(code)`, public. It returns the team, active squad, seasons, non-cancelled fixtures, and each `link`-visible team match with its result summary, `player_stats` and Player of the match. It never returns events.

**`push_match_events` extension:**
- It accepts `teamId`, `teamSide`, `fixtureId` and `playerStats` in `p_match`.
- It checks that the caller is the team's owner or one of its scorers.
- Linking a fixture marks it played.

**Free-tier limits:** at most 60 squad players, 300 fixtures and 30 seasons per team, with size caps on text fields.

**Rollout:** applied as a new numbered migration, and `supabase/setup-all.sql` is regenerated.

### 9. On the phone (Dexie version 2)
- **A cached copy of the team:** team, squad, seasons and upcoming fixtures. It refreshes whenever `/`, `/new` or `/team` load with signal.
- **New fields on the local match:** `teamId`, `teamSide` and `fixtureId`.
- **A squad outbox** for players added offline. The sync loop pushes squad additions before any match events that use them.
- **Each push includes `playerStats` for team matches.** The phone recomputes it from replay, the same way it already does `summary`.

## Free-tier check

| Resource | Use | Free limit |
|---|---|---|
| Database | One team for years: about 40k events in total, plus tiny team, squad and fixture rows | 500 MB |
| Data transfer | The team page fetches about 300 KB of per-match stats and is cached for 60 s | 5 GB a month |
| Realtime | Unchanged | — |

Supabase's free plan handles this comfortably.

## Left to the builder
- Exact screen layouts for `/team` and the player page. Follow the sketch and the existing app's style.
- Copy wording.
- The 30s and 50s cut-offs for short formats.
- How the season switch is styled.
- The preview image's layout.
- How the owner page edits fixtures: inline or in a sheet.

## After approval
1. Save this design as `docs/superpowers/specs/2026-10-27-team-page-design.md` in the repo and commit it.
2. Write the step-by-step implementation plan with `superpowers:writing-plans`.
3. Build it the same way as the launch: subagent-driven, with a review after each task.

## Verification (how the build will be proven)
- **Unit tests:**
  - `matchPlayerStats` on the golden match, re-scored with squad IDs: Ali 1 (3), Usman 12 (6), Hamza 1 wicket, Zain's catch counted when `fielderId` is set.
  - `aggregateTeamStats`:
    - totals, averages with not-outs, minimum thresholds and best figures;
    - season boundaries in the team's time zone, and overlapping seasons;
    - Player of the match points and overrides;
    - W, L, T and NR in the record, with No-result matches still counted in stats;
    - live matches left out.
  - An engine test that `fielderId` is carried through, and that old events without it replay unchanged. The existing property tests still pass.
- **Database tests (PGlite):**
  - Only the owner can create or edit the team, seasons, fixtures, Player of the match, No result and scorers.
  - Scorers can add squad players and push team matches; strangers can't.
  - Invites are single-use, expire, and can't be accepted by guest accounts.
  - Anonymous users can't create a team.
  - `get_team_page` returns no events and no private matches.
  - Pushing a team match as a non-owner is rejected.
  - Linking a fixture marks it played.
  - The quotas are enforced.
- **Browser tests (phone profile):**
  - Start a team match offline from the cached squad, including adding a new player, score it, and sync.
  - The team page shows the result and the updated leaderboards.
  - The player page totals are correct.
  - A Player of the match override shows up.
  - Sign-in (Google) steps use the existing test-backend approach. Real Google sign-in remains a manual check for the owner.
- **Manual check:** create the real team, squad and a season on the deployed site. Score a short match at the ground and confirm the public page updates.
