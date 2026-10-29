# App look and feel: make it feel like a mobile app (design)

## Context

The app is live at https://scorer-app-nine.vercel.app with the CricHeroes-style posters and public pages, but the owner says the **look and feel should be like a mobile app**. Here is what feels like a website today, in the owner's words from the brainstorm:
- **No app navigation:** there are plain pages and links instead of an app's bottom tabs and top bar.
- **The browser bar shows:** it runs inside the browser instead of full screen with its own icon.
- **The screens look plain:** they read as web forms and lists.

A Play Store app was **not** asked for. The goal is that opening the app, or a link to it, feels like opening a cricket app on the phone.

## What the owner decided

| Decision | Choice |
|---|---|
| **Bottom tabs** | **Home** (your matches), **My team**, a raised gold **+** in the centre for a new match, **Team stats**, and **Account** |
| **Fifth tab** | **Team stats**: the public team page with results, leaderboards and Milestones. My team stays for squad, fixtures and settings. |
| **Friends' pages** (live match, team page and player page opened from WhatsApp) | **Top bar plus the tabs**, the same app frame as the owner's screens |
| **Scoring screen** | **No changes at all** |
| **Screens to redo** | **Home**, **New match setup**, **My team (owner)**, **Account** |
| **New match** | **Stays on one page** (no steps), in the new app look |
| **Sign out** | **Not now** |
| **Look** | As in the approved mockups: a navy top bar, a white tab bar with the raised gold +, cards, list rows with chevrons, section tabs on My team, and a profile header on Account |

## Goals, non-goals and anti-goals

**Goals**
- **One app frame everywhere except scoring and setup:**
  - a top bar with the screen's name, a back arrow on deeper screens, and actions such as share;
  - a bottom tab bar with five slots.
- **Home, New match, My team and Account look like app screens:**
  - cards, list rows and section tabs;
  - bottom sheets for the player and fixture forms;
  - big tap targets and the app's navy and gold.
- **Full screen.** Opened from the home-screen icon, the app runs without the browser bar. The status bar and splash screen match the app, and installing is easy to find.
- **It feels like an app to touch:**
  - press feedback on everything tappable;
  - smooth changes between screens;
  - no double-tap zoom delay.

**Non-goals**
- A Play Store or App Store app.
- **Any change to the scoring screen (`/score`)**, including its menu and sheets.
- New features or data. Every screen keeps what it does today; only the frame and layout change.
  - *(my call)* One small exception: an Appearance row (Auto, Light, Dark) on Account.
  - **No Sign out:** the owner decided "not now".

**Anti-goals**
- **Never slow match setup or scoring at the ground.**
  - New match stays one page, and the Start match button is always in reach.
  - Scoring is untouched.
- **Never break offline.** Home, New match and scoring must still open and work with no signal. The new frame must not need the network to draw.
- **Keep the public pages light.** The `/t/**` and `/m/[code]` bundle guards must still pass: no Dexie, supabase-js, Turnstile or scoring code.
- **No new UI or animation libraries.** Use Tailwind, the existing shadcn components and CSS.

## How it works

### 1. The app frame
- **Top bar (`AppBar`):**
  - navy (INK `#1b2340`) with white text and a gold accent;
  - the title, or a back arrow plus the title on deeper screens;
  - actions on the right (share, install);
  - sticky, and padded for the status-bar safe area.
- **Bottom tab bar (`TabBar`):**
  - fixed, on the card surface, padded for the home-indicator safe area;
  - five slots: Home `/`, My team `/team`, the raised gold **+** (`/new`), Stats, and Account `/account`;
  - the active tab comes from the current path;
  - screen content gets bottom padding so the bar never covers it.
- **Where the Stats tab goes:** your own team's page `/t/<code>` if you own or score for a team, otherwise the last team page you opened, otherwise `/team`.
  - *(my call)* The codes live in `localStorage`, written by `/team` and by each `/t/<code>` visit. The tab bar never reads IndexedDB (Dexie), so the public bundles stay light.
- **Navigation stays as ordinary links,** not a single-page rewrite. This keeps the offline service worker working as it does today.
  - *(my call)* Smoothness comes from cross-document View Transitions (`@view-transition { navigation: auto }`) in browsers that support them, turned off under reduced motion.

### 2. Which screens get what

| Screen | Top bar | Tab bar |
|---|---|---|
| Home `/` | Your team's badge and name (or the app name), plus an install icon | Yes |
| My team `/team` | "My team" with share | Yes |
| Account `/account` | "Account" | Yes |
| Live match `/m/<code>` | Back, the match title, share | Yes |
| Team page `/t/<code>` | Back, the team name, share | Yes, with Stats active |
| Player page `/t/<code>/p/<id>` | Back, the player's name, share | Yes, with Stats active |
| New match `/new` | ✕ close and "New match" | **No**: it has its own fixed Start match button |
| Scoring `/score` | **Unchanged** | **No**: the screen is untouched |
| Join a team, sign-in return, offline page | Simple top bar | No |

### 3. The four redone screens
- **Home:**
  - the top bar shows your team badge;
  - **Live now** holds matches in progress or at the innings break;
  - **Recent** holds everything else, as cards. A team match shows a W/L/T/NR pill from the team's side; a plain match shows no pill, only its result line. Each card has a chevron;
  - an **Install the app** card when not installed, dismissible for 14 days *(my call)*;
  - a first-time empty state that invites you to score your first match;
  - the old big New match button and the "Your team" and "Keep your matches" link cards go, because the tabs replace them;
  - the © AQ line stays at the bottom.
- **New match (one page):**
  - the form (`src/components/scoring/new-match-form.tsx`) and the pieces it shares with the scoring sheets (`rules-fields`, `team-xi-picker`, `name-field`) keep their look and behaviour, because scoring must not change;
  - the page gains the app top bar (✕ close, "New match") and an app-style card layout around the form, at the page level only;
  - the existing overs chips, the sticky Start button and the collapsed Rules stay.
- **My team:**
  - the top bar reads "My team", with share;
  - **section tabs:** Squad, Fixtures, Results (Player of the match and No result) and Settings (team look, name, ground, time zone, seasons, and scorers and invites);
  - the section is kept in the URL (`?section=`), so back works;
  - add and edit **player** and **fixture** open as **bottom sheets**, with floating **Add player** and **Add fixture** buttons;
  - team details, seasons, scorers and invites, and outcomes stay inline in their sections;
  - a scorer sees what they see today (squad and fixtures, no owner sections).
- **Account:**
  - a **profile header** with the Google name and initial, or "Guest on this phone";
  - **list rows:** your matches (claim and take-over as today), Install the app, Appearance (Auto, Light, Dark through the existing `next-themes` `ThemeProvider` and `setTheme`), and Sign in with Google when signed out;
  - **no Sign out.**

### 4. Friends' pages
- The live match, team page and player page get the app frame: the top bar and the tab bar.
- Their makeover content stays: posters, hero, Milestones and leaderboards. The live page's coloured hero keeps the scores, and the title moves to the top bar.
- The top-bar share shares the page link (native share, falling back to copying the link). The page's existing WhatsApp and poster buttons (`ShareButtons`, `ShareTeam`) stay where they are.
- A friend's **Home** tab shows matches on their own phone. With none, the empty state invites them to score their own match.

### 5. Full screen and install
- **Manifest:**
  - already `display: standalone`;
  - set `theme_color` and the light status-bar colour to navy so the Android status bar matches the top bar;
  - set `background_color` to navy so the splash screen matches *(my call)*.
- **iPhone:** `statusBarStyle: "black"`, a solid black strip above the content. Nothing sits under it, so `/score` isn't overlapped.
- **Install:**
  - the existing `InstallApp` (Android install prompt, iPhone steps) moves into the Home card, an Account row and a top-bar icon on friends' pages, shown only when installable and not yet installed;
  - limitation: a WhatsApp link may still open in the browser; Android Chrome can open it in the installed app, but that isn't guaranteed.

### 6. Feel
- **Press feedback:** tappable cards, rows and tabs darken or shrink slightly when pressed.
- **Touch behaviour:**
  - `touch-action: manipulation` removes the double-tap zoom delay;
  - no tap-highlight flash and no text selection on the frame;
  - `overscroll-behavior: none` on the page.
- **Loading:** skeleton placeholders instead of "Loading…" text where screens load data (My team, Account).
- **Reduced motion:** transitions and press animations turn off under reduced motion.

## Constraints
- **The scoring screen code doesn't change:** `src/app/score/**` and `src/components/scoring/**`.
- **Offline must keep working:**
  - the service worker's precache must include whatever the frame needs;
  - `pwa.spec.ts` and `offline-sync.spec.ts` must pass.
- **Bundle guards:** `tests/e2e/team-page.spec.ts` (for `/t/**`) and `tests/e2e/live.spec.ts` (for `/m/[code]`) must pass.
- **Keep working as today:** RTL (Urdu names), dark mode, and the © AQ line on Home, the team page, the player page and the live page.
- **Existing tests:** the e2e flows that use the old home links are updated to the tabs. `team-owner.spec.ts` changes only where the player and fixture forms move into sheets.

## Left to the builder
- Icons, spacing and exact shades within the navy and gold palette.
- The bottom-sheet component: reuse a shadcn Sheet or Drawer if one is present, otherwise a small CSS sheet.
- Transition style and skeleton shapes.
- Empty-state wording.
- How My team's sections are split into components.

## Rollout
- No database change. Merge to `main` and push; Vercel deploys from `main`.

## Verification
- **Unit tests:**
  - the Stats tab target (own team, then the last team viewed, then `/team`);
  - the active tab for each path;
  - which screens show the tab bar.
- **E2E, mobile project:**
  - the tab bar shows on Home, My team, Account, the live match, the team page and the player page;
  - it's hidden on `/new` and `/score`;
  - each tab goes to the right screen, and + opens New match;
  - My team's sections switch and back returns to the previous section;
  - New match still starts a match (existing specs);
  - scoring is unchanged (existing specs);
  - the offline reload of `/score` still works;
  - the bundle guards pass;
  - reduced motion turns off transitions.
- **Screenshots:** each redone screen at 375 px wide, light and dark, checked by eye.
- **Manual on live:** install on Android, open from the icon (full screen, navy status bar and splash), and open a WhatsApp match link.
