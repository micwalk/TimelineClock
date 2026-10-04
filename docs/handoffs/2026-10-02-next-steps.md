# Handoff: Next steps (everything except layout v2)

**Status (2026-10-02).** The DOM rewrite, Netlify prep and the touch/snapping fixes are
done and on branch `html-timeline`. Layout v2 has its own handoff:
[2026-10-02-layout-v2.md](./2026-10-02-layout-v2.md).

## 1. Hosting (owner is doing this next)

- `netlify.toml` is ready: tests gate the build, Node 22, SPA fallback, cache headers,
  security headers. Verified on a local production build: service worker active, app
  loads offline, no installability errors. Steps are in the README under "Deploying".
- **Branches:** `main` and `html-timeline` point at the same commit as of this handoff
  (fast-forwarded locally; nothing pushed). Netlify deploys `main`.
- **No git remote yet.** The owner will create the GitHub repo and push.
- License: MIT (`LICENSE`).
- Private dev-server hostnames don't belong in the repo: put them in `.env.local`
  (gitignored) as `DEV_ALLOWED_HOSTS=host1,host2`; `vite.config.ts` reads it.
- Agent instructions live in `AGENTS.md`.

## 2. Stopwatch / Timer / Alarm, and a general UX pass

Stopwatch and Timer buttons shipped 2026-10-04 (see AGENTS.md and the
[quick-create design](../superpowers/specs/2026-10-03-quick-create-design.md) status).
User journeys with tap counts and proposals (relative-to-instant tool, timer from an
instant, editing a timer's length): [user journeys](../ux/2026-10-04-user-journeys.md),
waiting on the owner's picks in its §4. Still open: a clearer countdown on the timer's live lane chip (it shows coarse "12m"),
"timer from the selected instant", natural-language quick add.

**What the owner asked for:** "I like your suggestion of stopwatch/timer/alarm buttons.
Want to do another UX pass in general." Earlier: "agreed with like 95%", but "some of the
UX/interaction changes I disagree with" (which ones was never said). **Propose, don't
assume.**

**The flow to optimize** (owner's cooking example): tap to record an instant as the rice
starts; later label it; make a 13-minute timer from it and mark it alarmed; later look
back ("it's been 20 min since rice"). Today that takes about six steps: double-tap Now,
select it, move the cursor +13m, double-tap the cursor, tap the bell. Target: tap the
instant → "+ timer" → 13m → alarm set.

**Candidate ideas from the first review (none approved yet):**
- Quick-create buttons: Stopwatch (an instant now plus a live span), Timer (a span ending
  at Now + duration, with an alarm at the end), Alarm (an instant at a time, with an alarm).
- "Relative to this instant": from a selected instant, + duration → a new alarmed instant.
- Natural-language quick add (`25m`, `tomorrow 8am`, `in 10m`; e.g. the `chrono-node`
  library) with preset chips (+5m, +10m, +25m, +1h).
- A drag handle on the Now line: drag right to create a timer.
- Cards for running timers and stopwatches with big countdowns (PRD "Active area").
- PRD keyboard shortcuts T/A/S/I conflict with the current I (zoom in), S (zoom out) and
  A (previous instant). Needs a decision.

The control bar wraps to two rows on phones; the UX pass should rethink it, and quick-create
buttons may replace some of its buttons.

## 3. Open items from Ideas.md
- "Alarm: fix off screen (what?!)": unclear; ask the owner.
- "editing": unclear scope (instant time editing? move mode exists).
- "Better infinite zoom (heights of bars)".
- "rendering of spans as just rectangles", "first class spans".

## 4. Reliability (PRD M2)
- Done 2026-10-03: installed apps pick up new versions (`services/pwaUpdate.ts`: checks on
  resume and hourly; reloads right after opening/resuming or in the background, never under
  a ringing alarm). Alarm notification clicks return to the window that rang and go to the
  alarm's instant (`public/sw-extras.js`, `services/notificationClicks.ts`).
- Alarms only ring while the page is open. Ringing with the app closed needs Web Push
  and a small backend; a Netlify Function plus scheduled pushes fits the hosting.
- Screen Wake Lock while a timer runs (PRD).

## 5. Tech debt
- **Unused dependencies:** `date-fns`, `date-fns-tz`, `framer-motion`, `@headlessui/react`,
  `react-hook-form`, `zod`, `idb`. Use them or remove them. Tailwind v4 is imported but
  no utility classes are used yet.
- **Storage** is localStorage; the PRD plans IndexedDB (`idb`).
- **No browser end-to-end tests in the repo.** Interaction checks were run with throwaway
  Puppeteer scripts (see below); consider adding Playwright.
- **Extreme zoom-out with hundreds of instants** draws a wall of chips; layout v2's
  clusters address it.

## 6. Verification recipe (Windows dev machine)

Useful for any agent working here:
- Headless Edge can't be launched by Puppeteer from the Bash tool (sandboxed). Start it
  from PowerShell instead:
  `Start-Process msedge.exe --headless=new --remote-debugging-port=9333 --user-data-dir=<scratch dir>`,
  then `puppeteer.connect({ browserURL: 'http://127.0.0.1:9333' })` (`puppeteer-core`
  installed in a scratch folder, not the repo).
- Touch: `page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })`
  and CDP `Input.dispatchTouchEvent`. On a 390px-wide screen the timeline ends around
  y≈330; touches below that hit the control bar.
- Performance: CDP `Performance.getMetrics` (`TaskDuration` delta over a window) gives
  main-thread busy %. Baselines with 40 instants at 1400×900: idle 0.3%, pan ~15%,
  zoom ~32% (the old canvas app: 64% / 44% / 96%).
- Git on this machine checks files out with CRLF line endings. Scripted find/replace must
  normalize `\r\n`, and bash double-quoted scripts must not contain backticks.
