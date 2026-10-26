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
   - **Redirect URLs:** `https://<domain>/auth/callback`. On the development project, also add `http://localhost:3200/auth/callback`.
5. **Realtime → Settings:** turn **off** "Allow public access". Live updates use private channels only, and viewers join them with the publishable key.
6. **Apply the migrations** from this repo:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   This applies the three files in `supabase/migrations/`: tables and RLS, the RPCs, and the Realtime trigger and topic policy. Repeat `link` and `db push` for the other project.
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
- [ ] **A 500-event push finishes inside the statement timeout.** The app sends at most 200 events per call, but the RPC accepts 500 and runs one insert and one broadcast per event. Time it with a throwaway script and `node --env-file=.env.local push-500.mjs` (the development project must have CAPTCHA off):
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
Deploy from the Vercel dashboard or by pushing to the production branch. Then check the live site, with `<code>` from a match you scored:
- [ ] **Manifest:** `curl -s https://<domain>/manifest.webmanifest` returns `Cricket Scorer` with 192 and 512 icons, and Chrome's DevTools → Application → Manifest shows it installable.
- [ ] **Service worker headers:** `curl -sI https://<domain>/sw.js` shows `cache-control: no-cache, no-store, must-revalidate`, a JavaScript `content-type`, and `service-worker-allowed: /`.
- [ ] **Offline reload of `/score`:** on a phone, open the site, wait a few seconds for the install, start a match, switch to airplane mode, score a ball and reload. The scoring screen loads with the ball intact and says "Saved on phone". Turn the network back on and it says "Synced".
- [ ] **Live link on a second phone:** open `https://<domain>/m/<code>` on another phone. It shows the match without any sign-in, and each new ball appears within a few seconds.
- [ ] **WhatsApp preview image:** paste the live link into a WhatsApp chat. The preview shows the scorecard image, and `curl -sI https://<domain>/m/<code>/opengraph-image` returns a PNG. WhatsApp remembers previews per link, so test with a link it has not seen.
- [ ] **Share links use the real domain:** the WhatsApp text and the page's `og:image` start with `https://<domain>`, not `http://localhost:3200`.
- [ ] **Google sign-in:** the button on `/account` returns to `/account` with your matches listed. If it lands on the Site URL instead, Supabase rejected the redirect: widen the Redirect URL to `https://<domain>/**`.
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
- **Vercel requests and bandwidth:** polling is the main cost. The events route is cached at the CDN for `LIVE_CACHE_SECONDS` (default 2), so many viewers cost a few database reads. To spend less, raise `LIVE_CACHE_SECONDS` (runtime) or `NEXT_PUBLIC_POLL_MS` (build time, default 5000). The share card is rendered on every press.
- **No automatic backups** on the free plan. Take a `pg_dump` now and then (connection string under Project Settings → Database). The scorer's phone also keeps a full copy while a match is being scored.
- **Built-in limits** in `push_match_events`: 20 new matches per owner per 24 hours, `seq` up to 5000 per match, 500 events per push, 4 KB per event payload and per `rules`, 8 KB for `summary`. A push over a limit is refused and the match stays "Saved on phone", retrying with backoff. Nothing is lost.
- **Pausing:** Supabase pauses a free project after about a week without activity. This only matters before launch.
- **Vercel Hobby is for non-commercial use.** Move to Pro before adding paid features or ads.
