# Visual makeover — loud, CricHeroes-style looks for what friends see (design)

## Context

The app works and is live (https://scorer-app-nine.vercel.app), but what friends see when the owner shares a link on WhatsApp looks plain. The owner wants it visually exciting, like CricHeroes.

The owner reacted to three rounds of mockups:
- The first was "too plain".
- The second was still not enough: "even louder".
- The third was approved. It has stadium floodlights and a crowd silhouette, cricket artwork (stumps, bat, ball), confetti, a big player photo and giant numbers. The pages also get small celebration effects.

The goal: when a friend opens a link the owner shared, the first reaction is "wow".

## What the owner decided

| Decision | Choice |
|---|---|
| Who it's for | **Friends opening WhatsApp links**: the live match page, the team page, player pages and the shared images |
| Reference look | **CricHeroes** |
| What to add | All four: **player posters**, **team logo and player photos**, **result poster**, **badges and team colours** |
| Energy | **The loudest mockup**: floodlights, crowd, stumps, bat and ball art, confetti, giant numbers, big photos, plus **confetti and count-up effects on the pages** |
| Who uploads pictures | **Only the owner**: the team logo and every player photo, from `/team` |
| Live match page | **Included**: bold scoreboard with team colours and logos, plus a celebration burst on fours, sixes, wickets and the result |

## Goals, non-goals, anti-goals

**Goals**
- Every share image looks like a poster worth posting in a group chat:
  - the WhatsApp preview;
  - the result image;
  - the new player posters.
- The team page, player pages and live match page feel bold and alive: team colours, a logo, photos, big numbers, badges and short celebrations.
- The owner sets the team's look once on `/team`: a colour, a logo and player photos. Everything else is made automatically from scored matches.

**Non-goals (this round)**
- The scorer's own screens: `/score`, `/new` and the scoring sheets. The audience is friends, not the scorer. *(my call)*
- Logos or photos for opponents. They get a colour and initials.
- Photos uploaded by scorers or by players themselves.
- Animated video or GIF exports.

**Anti-goals**
- **Never slow or clutter scoring.** The scoring screen is untouched.
- **Public pages stay light on cheap phones and data packs:**
  - no new animation or graphics libraries;
  - photos are small WebP files that load lazily;
  - effects are CSS only and switch off when the phone asks for reduced motion.
- **The `/t/**` bundle guard still passes**: no Dexie, supabase-js, Turnstile or scoring code in public page bundles.
- **No personal data beyond what the owner chooses.** Photos are the only addition, and the owner can remove any of them. No emails or phone numbers, as before.
- **Stay on the free tier.** Supabase Storage holds 1 GB. A squad's photos are a few MB. Image URLs carry a version, so the CDN caches them for a long time.

## How it works

### 1. Artwork kit (shared)
- A small set of hand-made, flat SVG pieces lives in the repo:
  - floodlight towers and light beams;
  - a crowd silhouette and a pitch arc;
  - stumps with bails, a bat and a ball;
  - a trophy, a crown and a star;
  - confetti pieces.
- No stock images, so there are no licence questions. The same pieces serve the image routes (`next/og`) and the pages, as inline SVG.
- **Palette:** about 10 bold team colours, each paired with a light and a dark shade, so text on them is always readable. Gold accent `#e2a322` (HALDI) and the navy base `#1b2340` (INK) stay the brand. *(my call)*
- **Opponents:** a team without a set colour gets one from the palette, chosen by a stable hash of its name.

### 2. Team brand: colour, logo, photos
- **On `/team` (owner only):**
  - pick the team colour from the palette;
  - upload a logo;
  - upload a photo on each squad player's row;
  - remove the logo or any photo.
- **Processing on the phone:** the image is centre-cropped to a square and resized before upload: logo 512 px, photo 384 px, WebP, about 20–40 KB. Uploads over 300 KB are refused. The phone does this work to save data and storage. *(my call)*
- **Storage:** a public Supabase Storage bucket, `team-media`. Paths are `teams/<teamId>/logo.webp` and `teams/<teamId>/players/<playerId>.webp`.
  - Writes are allowed only for the team's owner, through storage RLS policies checked against `teams.owner_id`.
  - Anyone can read.
  - A version number in the stored path or URL busts the cache.
- **Database (new migration):**
  - `teams` gains `colour` (a palette key) and `logo_version`.
  - `squad_players` gains `photo_version`.
  - Owner-only RPCs: `set_team_colour`, `set_team_logo(version | null)` and `set_player_photo(player, version | null)`.
  - `get_my_team`, `get_team_page` and `get_live_match` return the colour, `logoUrl` and each player's `photoUrl`. `get_live_match` returns them only for team matches.
- **Fallback:** without a picture, an initials circle in the team colour.

### 3. Result poster and WhatsApp preview (every match)
- **Redraw `/m/<code>/card` (1080×1350) and `/m/<code>/opengraph-image` (1200×630)** in the loud style:
  - the two teams' colour panels split by a gold diagonal;
  - logos for a team match, initials otherwise;
  - giant scores and a gold result banner;
  - the top three performers;
  - floodlights and crowd behind, stumps, and confetti once the match is complete.
- **Matches still in progress:** the same style with a LIVE badge and the current chase.
- **Top performers:** picked with the existing Player of the match points formula (`src/lib/team/points.ts`). The figures are built from the match state for any match, with or without a team. They can come from either side. *(my call)*
- **Owner's saved choices win everywhere,** so a poster never disagrees with the team page. *(my call)*
  - **Player of the match:** the owner's pick (`potm_player_id`) is used first. If there's none, the formula picks, from squad players in the XI only. The same rule as `aggregateTeamStats` applies. The posters, live page and team page all use it.
  - **No result:** a match the owner marked No result shows "No result" on the poster and the live page, not a LIVE chase.
  - **What `get_live_match` returns:** it gains the team side, the brand, the owner's pick and No result, and a photo map for the team's XI.
- **Team link preview:** `/t/<code>/opengraph-image` also gets the loud redraw, in step 3, because it needs the brand fields. Player pages share it, as now. It shows the team colour, the logo, the record and the leaders with their photos. *(my call: the goal is "every share image")*

### 4. Player posters (team matches)
- **New image route `/m/<code>/poster/<playerId>` (1080×1350):**
  - the player's big photo;
  - a headline badge picked automatically, in this order: Player of the match, Hundred, Fifty, Five wickets, Hat-trick, Three wickets;
  - giant figures;
  - floodlights, crowd and confetti;
  - team colour, logo and the opponent.
- **Where to share one from:**
  - the live match page once the match is finished ("Share Player of the match");
  - the owner's results list;
  - each match row on a player's page.
- The images are made on demand and cached for 60 s, like the team image.
- **Who gets a poster:** only squad players who were in that match's XI. Anyone else gets a 404, including opponents, unknown ids and squad players who didn't play. Posters celebrate your team. *(my call)*

### 5. Page makeovers
- **Live match `/m/<code>`:**
  - a bold scoreboard header in team colours with logos;
  - giant runs/wickets;
  - photos of the batters at the crease when they're squad players;
  - a short CSS burst on a four, six, wicket and the result.

  Polling and realtime are unchanged.
- **Team page `/t/<code>`:**
  - a colour header with diagonal blocks and the logo;
  - big record tiles (Played, Won, Lost, NR);
  - a W/L form strip;
  - each leaderboard's leader shown as a crown card with a photo;
  - photos in leaderboard rows;
  - badge chips;
  - numbers that count up when they come into view.
- **Player page:**
  - a big photo header in the team colour;
  - a badge row: 50s, 100s, 5-fors, hat-tricks and Player of the match awards;
  - a "Share poster" link on each match row.
- **Effects:** confetti when a won result or a Player of the match card comes into view, once per visit. Count-ups and bursts are CSS keyframes plus a tiny observer, with no library. All of them respect `prefers-reduced-motion`.

### 6. Badges and stats
- **Badges:** 50s and 100s, 3-fors and 5-fors, hat-tricks, and Player of the match awards.
  - Most come from the existing per-match records.
  - Totals gain `hundreds`, `threeFors`, `fiveFors` and `hatTricks`.
- **Hat-tricks** need ball-by-ball detail, so the record gains an optional `hatTricks` count per bowler. `matchRecord` computes it from the innings deliveries:
  - three consecutive legal deliveries by the same bowler in one innings, each a wicket credited to the bowler (not a run-out);
  - wides and no-balls in between don't break the run;
  - the record stays `version: 1` and the field is optional, so old records count 0 and keep working.

## Order of work (each step ships on its own)
1. **Artwork kit and the loud result poster and preview.** No database change; the fastest visible win.
2. **Team brand.** Colour, logo and photos: a migration, the storage bucket and policies, and the `/team` upload UI.
3. **Page makeovers.** Team page, player page and live page, with effects, plus the loud team link preview.
4. **Player posters and badges.** Includes the hat-trick field.

## Left to the builder
- Exact layouts and spacing, and the palette hex values.
- Confetti and burst design, and how long they last (short).
- Badge icons and wording.
- How the crop works when an upload isn't square.

## Rollout notes
- The new migration(s) must be run in the Supabase SQL Editor **before** the deploy. `setup-all.sql` is regenerated.
- **Production deploys from `main`.** After merging, push `main`, as found on 2026-10-28.

## Verification
- **Unit tests:**
  - choosing the top performers;
  - choosing the headline badge;
  - hat-trick detection, with intervening wides and across overs, and a run-out not counting;
  - the palette and opponent-colour hash;
  - the new totals (`hundreds`, `fiveFors`, `hatTricks`);
  - image prep sizes (pure helpers).
- **Database tests (PGlite):**
  - only the owner sets colour, logo and photo versions;
  - `get_team_page` and `get_live_match` return the brand fields;
  - storage policy SQL is covered with a stand-in `storage.objects`.
- **Image routes:** 200 PNG for a seeded match through a stubbed loader. The 404 behaviour stays.
- **Browser tests:**
  - an owner sets a colour and uploads a logo and a photo, with storage stubbed through `page.route`;
  - the team page shows the colour and photos;
  - the effects are disabled under reduced motion;
  - the `/t/**` bundle guard still passes;
  - a new guard checks that `/m/[code]` gains no heavy libraries.
- **Manual on live:** share the team link and a match link on WhatsApp and look at the previews; open the posters on a cheap Android phone.
