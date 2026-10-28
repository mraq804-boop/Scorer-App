# Deployment (Supabase + Vercel)

Scores live on the scorer's phone first and sync to Supabase when there is signal, so nothing here depends on your PC. Supabase keeps the synced copy and Vercel serves the app. Use two Supabase projects: production, and a separate one for development and the Playwright backend specs.

## 1. Supabase
1. Create the project at <https://supabase.com/dashboard> in the **Mumbai (ap-south-1)** region, the closest to Pakistan. Create a second, separate project for development.
2. **Authentication → Sign In / Providers:**
   - Turn on **Allow anonymous sign-ins**. Guests score without an account.
   - Turn on **Google** and paste the client ID and secret from Google Cloud → Credentials. The Google OAuth client's authorized redirect URI is Supabase's own callback, `https://<project-ref>.supabase.co/auth/v1/callback`.
3. **Authentication → Attack Protection:** turn on **CAPTCHA** and choose **Cloudflare Turnstile**.
   - Create a Turnstile widget in Cloudflare for the production domain. Paste its **secret** here and set its **site key** as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel.
   - On the development project, leave CAPTCHA off, or use Cloudflare's test secret `1x0000000000000000000000000000000AA` with the test site key `1x00000000000000000000AA`.
   - Check **Authentication → Rate Limits** for anonymous sign-ins. Mobile carriers share IP addresses, so a low per-IP limit can stop guests getting a session at a busy ground. They can still score; the balls sync once a session exists.
4. **Authentication → URL Configuration:**
   - **Site URL:** `https://<domain>`
   - **Redirect URLs:** `https://<domain>/**`, plus one `/**` entry for every other host people open the app on (for example `https://www.<domain>/**` when both the apex and `www` serve the app, and `https://<project>.vercel.app/**` if that address is shared). Google sign-in returns to the host the page was opened on, at `/auth/callback?next=/account` (or `next=/team`, or `next=/team/join?token=…` from a scorer invite). A host missing from this list sends people to the Site URL instead, still signed out. On the development project, add `http://localhost:3200/**`.
5. **Realtime → Settings:** turn **off** "Allow public access". Live updates use private channels only, and viewers join them with the publishable key.
6. **Apply the migrations** from this repo:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   This applies the nine files in `supabase/migrations/`: tables and RLS, the RPCs, the Realtime trigger and topic policy, the claim-token clean-up, the team page (`20261027000005_teams.sql`), scorer names (`20261027000006_scorer_names.sql`), team editing (`20261027000007_update_team.sql`) the team look (`20261028000008_team_brand.sql`) and picture limits (`20261028000009_team_media_limits.sql`). Repeat `link` and `db push` for the other project.
   - **Without the CLI:** on a new project, paste all of `supabase/setup-all.sql` into **SQL Editor** and run it once. On a project that already runs the launch, run these in order there: `supabase/migrations/20261027000005_teams.sql`, `20261027000006_scorer_names.sql`, `20261027000007_update_team.sql`, `20261028000008_team_brand.sql` and `20261028000009_team_media_limits.sql`. Skip any you have already run.
   - **Order:** apply the team migrations **before** deploying the app that includes the team page. Taking over scoring reads the new `matches` columns and fails against an older database, and the team pages need the new RPCs.
   - **Team look (`20261028000008_team_brand.sql`):** run it **before** deploying the visual makeover. Without it, the Team look section on `/team` can't save a colour and uploads are refused. The public pages still work, in hashed colours and without pictures.
   - **Picture limits (`20261028000009_team_media_limits.sql`):** caps each team at 100 pictures and gives an unknown colour a clear `invalid_colour` error. The app doesn't depend on it, so it can run before or after the deploy; until it runs, there is no picture limit.
   - **Storage:** the team look uses Supabase **Storage**, which every project has. The migration creates the public `team-media` bucket (JPEG only, 300 KB per file) and its owner-only write policies, so there is nothing to click. Afterwards, check that **Storage → Buckets** lists `team-media` as public and that the `team_media_owner_*` policies are listed for `storage.objects`.
7. **Project Settings → API Keys:** copy the **Project URL** and the **Publishable** key. The app never uses the secret key, so do not put it anywhere.

## 2. Check the Supabase project before launch
The PGlite tests stub Realtime, so these four things are only proven on a real project. Put the **development** project's values in `.env.local`, rebuild (public env is baked in at build time), then:
```bash
npm run build
E2E_BACKEND=1 npx playwright test tests/e2e/live.spec.ts --project=mobile
```
- [ ] **An anonymous viewer can join the private `match:<id>` channel with the publishable key and receives broadcasts.** The `viewer sees balls live` spec blocks the polling route, so it only passes if a Realtime broadcast delivers the next ball.
- [ ] **`realtime.send` from the trigger delivers.** The same spec proves it. Failures inside the trigger are only logged as warnings and never fail the push, so also look for warnings from `realtime.send` under Logs → Postgres after a scoring session.
- [ ] **The `match_topic_read` policy on `realtime.messages` applies cleanly.** `db push` finishes without error, and the policy is listed under Authentication → Policies → `realtime.messages`.
- [ ] **A 500-event push finishes inside the statement timeout.** The app sends at most 50 events per call, but the RPC accepts 500 and runs one insert and one broadcast per event. Time it with a throwaway script and `node --env-file=.env.local push-500.mjs` (the development project must have CAPTCHA off):
  ```js
  import { createClient } from "@supabase/supabase-js";

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const { error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) throw signInError;

  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const code = Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  const match = { id: crypto.randomUUID(), code, title: "Load test", teamA: "A", teamB: "B", rules: {}, status: "in_progress", summary: {} };
  const events = Array.from({ length: 500 }, (_, i) => ({
    id: crypto.randomUUID(),
    seq: i + 1,
    at: new Date().toISOString(),
    type: "strike_swapped",
    payload: {},
  }));

  console.time("push 500");
  const { data, error } = await supabase.rpc("push_match_events", { p_match: match, p_device: crypto.randomUUID(), p_events: events });
  console.timeEnd("push 500");
  console.log(data, error);
  ```
  It should print `500 null`. Compare the time with the `authenticated` role's timeout: `select rolname, rolconfig from pg_roles where rolname in ('anon', 'authenticated');` in the SQL editor. If the push comes close to it, lower the client batch size (`BATCH_SIZE` in `src/lib/sync/sync.ts`) and the 500 cap in `push_match_events` together.

Run the other backend specs too: `E2E_BACKEND=1 npx playwright test --project=mobile` covers sharing, the scorecard images and the offline match. Never point `E2E_BACKEND` at the production project: it writes real matches.

## 3. Vercel
1. Push the repository to GitHub, then import it at <https://vercel.com/new>. The framework is detected as Next.js.
2. The function region is already `bom1` (Mumbai) in `vercel.json`. Confirm it under **Settings → Functions**.
3. Under **Settings → Environment Variables**, add every variable from `.env.example`. Production uses the production Supabase project. Preview uses the development project.
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL`: `https://<domain>` for Production. **Set it for Preview as well.** If it is unset, share links and the `og:image` URL point at `http://localhost:3200`. The value is baked in at build time, so a preview deployment shares links on whatever host you set here, not on its own URL.
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (leave empty where CAPTCHA is off)
   - `NEXT_PUBLIC_POLL_MS` and `LIVE_CACHE_SECONDS` (the tuning knobs in step 6)
4. Every `NEXT_PUBLIC_*` value, and the Content-Security-Policy that allows the Supabase host, is fixed at build time. **Redeploy after changing any of them.** `LIVE_CACHE_SECONDS` is read at runtime.
5. Other hosts: the service worker's cache name comes from `VERCEL_DEPLOYMENT_ID`, then `VERCEL_GIT_COMMIT_SHA`, then a timestamp taken when the server process starts. Off Vercel, set `VERCEL_DEPLOYMENT_ID` to one stable value per build, the same on every instance. Without it, each instance serves a different worker, and phones keep seeing "new version" updates and re-downloading the app.

## 4. Deploy and check
**Production deploys from `main`.** Merge the work into `main` and push it: Vercel builds every push to `main` for Production, and a push to any other branch only makes a preview. Then check the live site, with `<code>` from a match you scored:
- [ ] **Manifest:** `curl -s https://<domain>/manifest.webmanifest` returns `Cricket Scorer` with 192 and 512 icons, and Chrome's DevTools → Application → Manifest shows it installable.
- [ ] **Service worker headers:** `curl -sI https://<domain>/sw.js` shows `cache-control: no-cache, no-store, must-revalidate`, a JavaScript `content-type`, and `service-worker-allowed: /`.
- [ ] **Offline reload of `/score`:** on a phone, open the site, wait a few seconds for the install, start a match, switch to airplane mode, score a ball and reload. The scoring screen loads with the ball intact and says "Saved on phone". Turn the network back on and it says "Synced".
- [ ] **Live link on a second phone:** open `https://<domain>/m/<code>` on another phone. It shows the match without any sign-in, and each new ball appears within a few seconds.
- [ ] **WhatsApp preview image:** paste the live link into a WhatsApp chat. The preview shows the scorecard image, and `curl -sI https://<domain>/m/<code>/opengraph-image` returns a PNG. WhatsApp remembers previews per link, so test with a link it has not seen.
- [ ] **Share links use the real domain:** the WhatsApp text and the page's `og:image` start with `https://<domain>`, not `http://localhost:3200`.
- [ ] **Google sign-in:** on every host people use (apex, `www`, `vercel.app`), the button on `/account` returns to `/account` on that same host with your matches listed. If it lands on the Site URL instead, Supabase rejected the redirect: add that host's `/**` entry to the Redirect URLs.
- [ ] **Team page:** sign in with Google on `/team`, create the team, add a few squad players and a season, and add a fixture. Open the public link (`https://<domain>/t/<team code>`) in a private window: it shows the team without any sign-in.
- [ ] **Scorer invite:** on `/team`, tap **Invite a scorer** and open the link on a second phone signed in with another Google account. It says "You score for <team>", and that phone's `/new` offers "My team is playing".
- [ ] **A team match counts:** score a short team match from the squad, finish it, then reload `/t/<team code>` after a minute (the page is cached for 60 seconds). The result, the record and the leaderboards include it, and the player pages show the match. Choose a Player of the match on `/team` and check it shows.
- [ ] **Team preview image:** `curl -sI https://<domain>/t/<team code>/opengraph-image` returns a PNG, and a WhatsApp chat shows the team name with the top run scorers and wicket takers.
- [ ] **Team look:** on `/team`, choose a colour under **Team look**, upload a logo, and tap two players' circles in the squad to add photos. After a minute, the public team page shows the colour, the logo and the photos, and each picture's address starts with `https://<project-ref>.supabase.co/storage/v1/object/public/team-media/teams/<team code>/`. Then tap **Remove logo** and upload a logo again: it must save, and **Storage → team-media** must show only the new file for the logo.
- [ ] **Posters:** finish a team match, then on its live page tap **Share Player of the match**. The share sheet opens with the player's poster, or the PNG downloads where files can't be shared. A player's page offers **Share poster** on each match row. Paste the team link and the finished match link into a WhatsApp chat and check that both previews show the team colour and logo. Open a poster on a cheap Android phone and check that it loads quickly.
- [ ] **CDN caching of the polling route:** with two viewers on the live page, open DevTools → Network on one and read the response headers of `/api/m/<code>/events?after=<n>`. Expect `x-vercel-cache: HIT` on most polls. Use real viewers, not only `curl`: the page's own request uses fetch `cache: "no-cache"`. If every poll is a `MISS`, the CDN is not absorbing the load, and the fix is in `src/lib/live/feed.ts`.

## 5. Testing on a phone
Service workers and `crypto.randomUUID` only work in a secure context: HTTPS, or `localhost`. Opening `http://<lan-ip>:3200` from a phone will not work: the service worker never registers and starting a match fails. Use one of these:
- a Vercel preview deployment (HTTPS);
- USB debugging with `adb reverse tcp:3200 tcp:3200`, then open `http://localhost:3200` on the phone;
- an HTTPS tunnel to the local production build.

Test the production build, not `npm run dev`: the service worker is only registered in production.

## 6. Free-tier watchpoints
The launch runs on Supabase Free and Vercel Hobby. Check each dashboard's usage page now and then, and upgrade before real traction.
- **Supabase Realtime:** about 200 concurrent connections for the whole project, plus a monthly message quota. Each ball is one message per connected viewer. Viewers that cannot connect fall back to polling after 5 seconds, so hitting the cap slows updates instead of breaking them.
- **Vercel requests and bandwidth:** polling is the main cost. The events route is cached at the CDN for `LIVE_CACHE_SECONDS` (default 2), so many viewers cost a few database reads. To spend less, raise `LIVE_CACHE_SECONDS` (runtime) or `NEXT_PUBLIC_POLL_MS` (build time, default 5000). The share card is rendered on every press. Player posters and the team preview are cached for 60 seconds. Each render of a team match's image fetches only what it draws from Storage: the logo, plus up to three photos for the result poster or one for a player poster.
- **Supabase Storage:** 1 GB on the free plan. Logos and photos are about 20 to 40 KB each (300 KB at most), so a full squad is a few MB. Replacing a picture deletes the old file, and each team is capped at 100 pictures (about 30 MB at most).
- **No automatic backups** on the free plan. Take a `pg_dump` now and then (connection string under Project Settings → Database). The scorer's phone also keeps a full copy while a match is being scored.
- **Built-in limits** in `push_match_events`: 20 new matches per owner per 24 hours, `seq` up to 5000 per match, 500 events per push, 4 KB per event payload and per `rules`, 8 KB for `summary`. A push over a limit is refused and the match stays "Saved on phone"; the phone tries that match again every 15 minutes while other matches keep syncing. Nothing is lost.
- **Team limits:**
  - Each team can have 60 squad players, 300 fixtures, 30 seasons, 10 scorers and 5 open invites.
  - A match's player record can be up to 16 KB. A bigger one is stored as empty: the match still syncs, but its figures don't count.
  - The public team page reads up to 500 matches and caches the result for 60 seconds. One team's season is a few hundred KB, well inside the free tier.
- **Pausing:** Supabase pauses a free project after about a week without activity. This only matters before launch.
- **Vercel Hobby is for non-commercial use.** Move to Pro before adding paid features or ads.
