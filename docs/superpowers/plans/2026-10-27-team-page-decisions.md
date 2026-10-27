# Team page: decisions made during the build, and what was left for later

This records the calls made on the owner's behalf while building [the plan](2026-10-27-team-page.md) against [the spec](../specs/2026-10-27-team-page-design.md). Each entry also says what it costs if the call turns out wrong.

## Decisions

### Syncing and the database
- **Fixture notes** are sent to the owner's and scorers' phones only. They never appear on public pages. *If wrong:* one unused field.
- **Player of the match and No result** are set by match code, because the public data identifies matches by code, not by internal id. *If wrong:* a small RPC change.
- **A scorer who has been removed** can still sync a match they were scoring. The match syncs, but it isn't linked to the team, so no ball is ever lost. *If wrong:* such matches need linking by hand.
- **Linking rules:**
  - A push without team details keeps the match's existing team link.
  - If a fixture is linked more than once, the latest push wins.
  - Someone who owns a team and also scores for another gets their own team on their phone.
  - There's no way to cancel an invite; at most 5 are open per team, and each expires after 7 days.

  *If wrong:* small RPC changes.
- **A match record over 16 KB** is stored as empty instead of failing the sync. **Duplicate players** in one squad upload are merged. *If wrong:* nothing; both are safer.
- **A removed scorer** can still update the score summary of matches already linked to the team, and there's no "unlink match" tool. The owner can still mark such a match No result. *If wrong:* an owner "unlink" tool is needed later.
- **Squad uploads** retry on their own timer, so they never slow down ball syncing. Adding a player at the ground starts a sync straight away. *If wrong:* one extra sync pass.
- **A guest session** (not signed in with Google) never clears the saved team and never drops squad players that haven't been sent yet. *If wrong:* a guest's phone keeps a stale team until a Google sign-in.
- **How the code reports team errors:**
  - Fetching the team reports typed errors, and "not a member" is a plain empty answer.
  - Changes return a success-or-error result.
  - Taking over scoring keeps the ids of XI players who didn't bat or bowl, with a blank name.

  *If wrong:* small code changes.
- **Branch:** the work was done on `feat/team-page` itself, with no separate worktree, because the live site deploys from `feat/score-and-share`. *If wrong:* nothing.
- **Scorer names** come from a second migration (`20261027000006_scorer_names.sql`), because the team migration had already been applied to the live project. *If wrong:* one more SQL file to run.

### Stats
- **Leaderboards:**
  - Leaderboards skip players with zero.
  - "Best figures" needs at least one wicket.
  - Player of the match only considers squad players who were in the XI. An override naming anyone else falls back to the suggestion.
  - A finished match with no result recorded counts as NR.

  *If wrong:* small changes to the totals.
- **Economy and the 10-over minimum** assume 6-ball overs, because the match record doesn't store balls per over yet. 8-ball matches are rare. *If wrong:* economy is slightly off for 8-ball matches.

### Starting and scoring a match
- **A fixture's ground** stays on the fixture. `/new` shows it, but it isn't copied into the match. *If wrong:* the ground needs adding to the match later.
- **Team A's player count** follows the number of ticked XI players, capped at 15, until the scorer changes it. Each side's count is remembered separately. *If wrong:* nothing.
- **Behaviour without Google sign-in:** a guest's squad uploads wait until a Google session exists, and the match form reads the saved team once when it opens. *If wrong:* minor inconvenience.
- **Substitute fielders:** when the team is fielding, the scorer can choose "Someone else" and type a fielder's name. Catches by substitutes don't count in squad stats. *If wrong:* nothing.
- **Typed names:**
  - A typed name that matches one XI player is recorded under that player's squad id.
  - A name that matches two players is refused with "pick from the list".
  - Edits always record a fielder id, or none.

  *If wrong:* small changes.

### The owner page and invites
- **Links:** the public team link and invite links use the site address (`NEXT_PUBLIC_SITE_URL`), like match links, so WhatsApp never gets a localhost link. *If wrong:* nothing.
- **Google sign-in** returns people to the page they started from: `/account`, `/team` or the invite link. *If wrong:* one parameter.
- **Not in the plan's file list:**
  - a "Your team" link on the home page, since `/team` was otherwise unreachable;
  - shared form parts;
  - a share-link component;
  - a shared Google sign-in card.

  *If wrong:* small moves.
- **Adding players on `/team`** happens directly online. Each form keeps one player id, so a retried add can't make duplicates. *If wrong:* nothing.
- **Fixtures:**
  - Times are entered and shown in the team's time zone, including daylight saving.
  - Overs are optional.
  - Scorers can see fixtures and start a match from one, but can't edit them.

  *If wrong:* small UI changes.
- **Player of the match:** the picker appears only for finished or No result matches. The suggestion ignores any override.
- **The invite page** joins automatically once the person is signed in. The single-use link is guarded against being used twice by a double load.

### The public page
- **The data is cached for 60 seconds** using Next's `unstable_cache`, because this project doesn't use Cache Components. Next skips caching anything over 2 MB. *If wrong:* switch to `"use cache"` later.
- **Display defaults:**
  - The default season is the one that includes today, in the team's time zone, otherwise all time.
  - The season links show "All time" first, then the newest season.
  - Recent results show the latest 10, with in-progress matches marked Live.
  - Empty leaderboards are hidden.
  - Dates are shown in the team's time zone.
  - Player pages reuse the team's preview image.

  *If wrong:* small UI changes.
- **Tests:**
  - The no-backend 404 test uses a malformed code, because checking a well-formed unknown code needs the database.
  - A test reads the build manifest to prove the public pages carry no scoring, storage or sign-in code.
  - The page sections have a render test with sample data.

### The final review
- **Fixed:**
  - Team A's player count froze when Team B's was changed first.
  - One malformed match record could take down the team pages.
  - The owner couldn't tell scorers apart; they now see the scorer's Google name, never the email.
- **Kept as earlier decisions:** everything the reviewer set aside (listed in the review).

## Left for later

### Most worth doing next
1. **A squad player who wasn't ticked into the XI loses that match's figures.** If a scorer forgets to tick someone and then types his name, his runs and wickets don't count. The fix is to offer "Use Bilal from the squad" and add him to the XI.
2. **The team's name, ground and time zone can't be edited** after the team is created, and seasons can't be deleted.

### From the final review
3. **Joining on a bad network:** if the join response is lost, retrying says the invite is invalid, although the person did join.
4. **The Player of the match picker** isn't locked while it saves. The results list doesn't refresh after a squad rename, and it lists every match.
5. **One invite per page load:** after the first link, the page has to be reloaded to make another.
6. **Inactive players** count toward the 60-player limit, and the "squad full" message asks you to remove someone, which isn't possible.
7. **The date a scorer was added** is shown in the phone's time zone, not the team's.
8. **A team match scored under a guest session** that finished syncing before a Google sign-in never links to the team.
9. **Owners and invites:** an owner opening their own invite sees "expired", and an owner can accept another team's invite that they can never use.
10. **The remove-scorer message** says their matches "still count", which is only true once those matches have finished syncing.
11. **`/team` needs the browser's storage (IndexedDB)** to load, so it fails in some private modes.
12. **Players with the same name** look identical on the public leaderboards.
13. **All-time stats** cover only the newest 500 matches.
14. **The public page against real data** is tested only when you name a team you made by hand (`E2E_TEAM_CODE`).

### From earlier tasks
- **Hardening and code quality:**
  - Engine corrections check for `fielderId` differently from new balls. This only matters if a patch ever sends an explicit `undefined`, which nothing does.
  - The season helper rebuilds its date formatter on every call, and throws on an invalid time zone.
- **Edge cases that are possible today:**
  - A Player of the match override naming a squad player outside the XI is accepted by the page logic. The server already blocks it.
  - A scorer's push can mark a cancelled or future fixture as played.
  - An old fixture keeps its match link after the match moves to another fixture.
  - Scorers can read the team owner's account id.
  - A scorer can add a player as inactive.
- **Free-tier use:** anyone with the public key can call the team page function directly, which returns up to about 12 MB.
- **Things that happen without any message:**
  - An oversized match record is dropped without telling the scorer.
  - Potm can point at a player who is no longer in the XI.
  - Players waiting to upload drop out of team stats until they land.
- **Things that briefly look wrong or run twice:**
  - A just-uploaded player can briefly disappear from the XI picker.
  - Taking over scoring shows blank names for XI players who didn't bat or bowl, until the team refreshes.
  - A refused one-player upload is sent twice.
  - Syncs that are triggered directly skip the squad retry timer.
- **Match setup gaps:**
  - In team mode, the setup check doesn't require squad openers and doesn't reject duplicate XI ids.
  - Played or cancelled fixtures still pre-fill `/new`.
  - The XI picker has no on-screen limit of 15; the limit only shows as an error on Start.
  - The saved team doesn't refresh when the phone comes back online, only on page load.
- **Scoring sheet gaps:**
  - A same-name non-XI player can make a typed name ambiguous even though he isn't listed.
  - Choosing "Someone else" and leaving it blank in the edit sheet clears an XI fielder.
  - The "{role} name" label is built by joining words, which may not translate well.
- **Test coverage gaps:**
  - Retired batters.
  - Changing the bowler in a team match.
  - Starting the second innings with "Someone else" on the bowling side.
  - Exactly 16 KB records.
  - The XI label helper.
