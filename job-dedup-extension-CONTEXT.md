# RoleEcho — Chrome Extension — Handoff v2

**Read this whole file before responding to anything else.** This supersedes
any earlier CONTEXT.md — it contains everything from that file PLUS
decisions made during actual build. All decisions below are FINAL unless
marked OPEN. Do not re-litigate them. If genuinely unclear, ask — but check
this file first.

## Who's building this
Python developer, <1yr pro experience. Reads JS fine, can't confidently
write it from scratch. Uses VS Code + a "Codex" agent in-editor as an
alternative/complement. Wants: minimal-but-real comments (not line-by-line),
production-ready code, incremental builds (one file at a time, don't
generate everything at once), and to be told plainly whenever something
isn't fully understood or something newly-found conflicts with an earlier
decision.

## The problem / product
During high-volume job search (30+ tabs normal), same job posting often
reappears (repost, staffing-agency mirror, new req code). Tool silently
warns when the current tab is a duplicate of one already seen. Single
purpose only — NOT a userscript-manager, NOT a job-tracker/CRM (manual
application-stage tracking is still explicitly rejected, see original
reasoning below). **UPDATE:** a dashboard showing the tool's own passive
data (jobs seen, duplicates caught, site trust list) is implemented —
see the v1.3 section. This is narrower than the job-tracker
concept that was rejected: no manual status/notes/stages, just a fuller
view of data the tool already collects. The job-tracker/CRM rejection
itself still stands.

## Reference implementation
Original Tampermonkey userscript "RoleEcho" v2.5 (~500 lines,
full source has been read in full by the assistant). Its logic (extraction,
normalization, fuzzy matching) is the source of truth for that layer and
has already been ported almost verbatim into `content-scripts/matching.js`.

## Architecture (final, in order reasoned through)
1. ~~No permanent "learned site" list — always re-check page content
   live, every load.~~ **SUPERSEDED, see "v1.3 planning" section below.**
   The reasoning here (an auto-learned list is "a way to be wrong") only
   applied to the extension guessing and remembering on its own. A
   user-confirmed yes/no list (only written when the user is actually
   asked, and only for the ambiguous cases that reach that point) is a
  different thing and is implemented in the current workspace.
2. Hardcoded named-domain list (ported from original @match list) kept
   ONLY as a perf shortcut — on these domains, skip the sniffer and inject
   the engine immediately. Never a gate; unlisted sites work fully via the
   sniffer. **Implemented in background.js as `KNOWN_JOB_HOSTS`.**
3. Sniffer + on-demand injection: a tiny content script runs on ~all pages,
   does a plain substring check for `"JobPosting"` inside any
   `<script type="application/ld+json">` block BEFORE attempting
   `JSON.parse`. On a hit, sends
   `chrome.runtime.sendMessage({ type: 'JOB_PAGE_DETECTED' })` and stops —
   no extraction, no storage, single responsibility. Background worker
   injects the full engine into that tab on demand, tracking "already
   injected" per tab ID to avoid double-injection (e.g. an SPA route change
   re-triggering the sniffer on the same loaded page).
4. Injection API: `chrome.userScripts` (NOT `chrome.scripting.
   executeScript`) — this is the API Chrome built for on-demand
   userscript-manager-style execution. Confirmed against official Chrome
   docs (chrome 120+, MV3):
   - Real gotcha, must be documented for the end user, cannot be automated
     away: they must manually flip a toggle before `chrome.userScripts`
     works at all.
     - **Chrome < 138:** the global "Developer mode" toggle at
       `chrome://extensions`. (Same toggle is already required just to use
       "Load unpacked" at all, since this project isn't going on the Web
       Store — so on older Chrome, installing it and enabling userScripts
       are the same one step.)
     - **Chrome 138+:** a separate, per-extension "Allow User Scripts"
       toggle on that extension's own details page — in ADDITION to
       Developer mode still being required for the Load-unpacked install
       itself.
     - Detect availability with a try/catch probe
       (`chrome.userScripts.getScripts()` throws if unavailable) rather
       than assuming a Chrome version.
   - **NEWLY DISCOVERED, not in the original design doc — important:**
     code running inside the `USER_SCRIPT` execution world (i.e.
     `engine.js` once injected) CANNOT call `chrome.storage` or most other
     `chrome.*` extension APIs directly. It can only use messaging
     (`chrome.runtime.sendMessage`/`connect`), and only after
     `chrome.userScripts.configureWorld({ messaging: true })` has been
     called — and those messages are NOT received via the normal
     `chrome.runtime.onMessage`; they arrive via the dedicated
     `chrome.runtime.onUserScriptMessage` / `onUserScriptConnect` handlers.
     **Consequence: background.js must own ALL storage reads/writes.
     engine.js will have to ask background.js for everything (duplicate
     lookups, recording a new job, tab-lineage checks) via messages — it
     cannot read chrome.storage.local itself.** This resolves what was
     previously an open question (did tab-lineage logic live in
     background.js or engine.js? — answer: background.js, definitively,
     not just "leaning that way").
   - For actually injecting into one already-identified tab (as opposed to
     registering for all future matching page loads), use
     `chrome.userScripts.execute({ target: { tabId }, js: [...],
     world: 'USER_SCRIPT', injectImmediately: true })` (Chrome 135+) — a
     better fit than `register()` for this on-demand-into-one-tab pattern.
     `register()` is for scripts that should auto-run on future matched
     page loads, which isn't what's needed here.
5. Storage: `chrome.storage.local` for anything that must survive browser
   restarts (job records once built, the one-time consent flag).
   `chrome.storage.session` for anything tab-ID-keyed (tab IDs are
   meaningless after a browser restart anyway) — used for the
   "already-injected" tab map and the opener/tab-lineage map. This is a
   refinement over the original doc's "just use storage.local for
   everything" — flagged and explained, not silently changed.
   `chrome.storage.local.get()`/`.set()` are Promises — must be awaited.
6. Duplicate-warning suppression is tab-lineage based, not timer-based
   (fixes a real false-positive bug in the original script — e.g. false
   "duplicate" warnings mid multi-step application forms or after a
   sign-in redirect). If a title+company match belongs to the SAME TAB or
   a tab opened BY that tab (Chrome's `openerTabId`), NEVER warn, no matter
   how many internal reloads/redirects happen. Only warn on a genuinely
   different, unrelated tab. Known accepted v1 gap: some third-party
   "Apply" popups aren't tracked as a child tab and could still falsely
   flag — deferred, not blocking v1.
7. Timestamp display in the HUD is pure information, orthogonal to the
   warn/don't-warn decision — never conflate the two systems.
8. Consent: single one-time prompt at install (`onboarding.html`), asking
   permission to check page content. Not framed as "building a site list."
   **Implemented in background.js as a gate:** `injectEngine()` checks a
   `jds_consent_granted` flag in `chrome.storage.local` before doing
  anything, and does nothing until it's `true`. `onboarding.js` writes
  that flag when the user answers the consent prompt.
9. Fuzzy matching (Jaccard + containment, 60/40 title/company weighting,
   abbreviation expansion, requisition-code stripping, confidential-company
   handling) ports from the original script essentially unchanged — already
   done, see Build Status.

## Explicitly rejected (do not re-suggest without new reasoning)
- Forking Tampermonkey/Violentmonkey wholesale — their screen-reading logic
  is entangled with a much larger system (script store, sandboxing for
  arbitrary strangers' scripts, options UI) not cleanly separable. Only
  specific patterns (e.g. `chrome.userScripts` usage) are borrowed.
- Forking existing job-tracker extensions (JobTracker, jlog, JobMatchAI,
  etc.) — different interaction model (manual click-to-save logger vs.
  automatic silent content-based detector).
- A persistent **auto-learned** (self-guessed, unconfirmed) job-site
  list — still rejected. **Superseded in one narrow sense:** see "v1.3
  planning" — a **user-confirmed** yes/no site list (opt-in per site,
  reversible) is different from this and is implemented in the current
  workspace.
- Timer-based duplicate-warning suppression.
- A general-purpose userscript-manager platform.

## Distribution & licensing (confirmed, still current)
MIT, open source. NOT published to the Chrome Web Store — distributed as
source via "Load unpacked." Explicitly not a commercial product ever;
donations welcome, never requested/paywalled. Attribution matters for
portfolio/resume purposes — the project is authored by Wisdom Ekwugha.
LinkedIn: `https://www.linkedin.com/in/wisdom-ekwugha`. The GitHub URL will
be added after the repository is initialized.
NOTE: user verbally floated, then explicitly walked back, an idea of maybe
publishing to the Web Store later + adding donations once more polished.
Not a decision — current plan (source-only, no Store) stands. Don't build
toward Web Store requirements unless the user firmly says so.

## Deferred to later (not v1 — don't let scope drift back here)
Offline snapshot backup of listing text; CSV/JSON export of seen-jobs list;
`chrome.storage.sync` for cross-device sync; tracking which applications
got a reply. All explicitly parked to avoid drifting back toward the
job-tracker/dashboard product category that was already ruled out as a
fork target. **NOTE:** "counting total applications submitted" is no
longer deferred — see the "v1.3 — application-count tracking" section
below for the decided, narrower version of it (auto-observed volume
counting only, no outcome tracking). Excel export of those logs, however,
IS still deferred, to v1.4+ — see the same section.

## BUILD STATUS (as of this handoff)
- [x] `content-scripts/matching.js` — COMPLETE. Pure functions only (no
      Chrome APIs, no DOM, no storage — safe to unit-test standalone).
      Ported verbatim: normalization, tokenizing, req-code stripping,
      Jaccard/containment/bestSimilarity, confidential-company patterns,
      abbreviation table. Deliberately excludes `findDuplicate`/
      `recordJob` — those need storage/state and belong wherever the
      storage-owning logic ends up (now known to be background.js, per
      decision #4's new discovery above).
- [x] `manifest.json` — permissions/host_permissions/content_scripts
      correct. `name`/`description` are filled in and shipped
      ("Warns you when a job posting tab is a duplicate..."). `action`
      (popup) and `clipboardWrite` added in v1.1.0; `scripting` dropped
      as unused. The release version is now `1.3`.
- [x] `background.js` — COMPLETE for its current scope:
      - Calls `configureWorld({messaging:true})` defensively on startup/
        install (survives the toggle being off without crashing).
      - Opens `onboarding.html` on first install.
      - Listens for the sniffer's `JOB_PAGE_DETECTED` message → injects
        engine via `chrome.userScripts.execute()`.
      - Known-host shortcut via `chrome.tabs.onUpdated` (status
        'complete' + hostname match) → injects immediately, no sniffer
        wait.
      - Per-tab "already injected" tracking in `chrome.storage.session`;
        correctly reset on a real navigation (`changeInfo.url` present),
        left alone on SPA route changes (so re-injection doesn't happen
        and a duplicate HUD doesn't appear from the same page).
      - Tab-opener lineage recorded in `chrome.storage.session`
        (`chrome.tabs.onCreated`'s `openerTabId`), cleaned up on
        `chrome.tabs.onRemoved`.
      - `injectEngine()` gated on the `jds_consent_granted` flag.
      - The request/response message bridge for duplicate lookup,
        recording, tab-lineage decisions, mute actions, and site trust is
        implemented through `chrome.runtime.onUserScriptMessage`.
- [x] `content-scripts/sniffer.js` — COMPLETE for its scope. Cheap
      substring check before any `JSON.parse`; sends one message on a hit.
      SPA-awareness implemented as a lightweight `location.href` poll (1s
      interval) + one delayed re-check (500ms) after a URL change — NOT a
      persistent `MutationObserver`, to keep it cheap on every page
      visited. This specific approach was a judgment call, not something
      explicitly pinned down in the original design — flagged to the user
      as such; open to revisiting if it misses real cases.
- [x] `content-scripts/engine.js` — COMPLETE. Extracts (JSON-LD → OG meta →
      DOM/Shadow-DOM heuristic, ported from the original script),
      normalizes/tokenizes via JDSMatching, sends ONE `CHECK_JOB` message
      to background.js per detected page, and renders the HUD only if
      told `duplicate: true`. Owns no storage and no duplicate-decision
      logic itself — background.js does both, per decision #4's resolved
      open question. HUD's "Close this tab" button messages background.js
      (`CLOSE_TAB`) rather than calling `window.close()` directly — a
      plain page script can't close a tab it didn't open itself; the
      original Tampermonkey script's `@grant window.close` special
      permission has no extension equivalent, so this had to route through
      chrome.tabs.remove() in background.js instead.
      MutationObserver + fallback poller + SPA href-poll all ported
      unchanged (none of that was Tampermonkey-specific).
- [x] `background.js` — EXTENDED beyond the prior handoff: added the
      request/response message bridge engine.js needs. Loads matching.js
      via `importScripts()` (see below), owns job-record storage
      (`jds_records_v1` in storage.local, 60-day TTL pruning on each
      check), runs the actual duplicate-matching (`findMatch`, a port of
      the original `findDuplicate`), and applies the tab-lineage
      warn/don't-warn decision by walking the opener-chain map built
      earlier. `chrome.runtime.onUserScriptMessage` (NOT the regular
      `onMessage`) is the listener for engine.js's messages — the sniffer
      still uses regular `onMessage` since it's a normal declared content
      script, not a USER_SCRIPT-world injection. Also handles `CLOSE_TAB`.
- [x] `content-scripts/matching.js` — MODIFIED from the prior handoff:
      **cannot use ES `export`/`import` at all.** Neither content scripts
      nor `chrome.userScripts`-injected scripts can be declared as ES
      modules — there's no such option for them. Rewritten as a plain
      classic script wrapped in an IIFE that assigns everything to
      `globalThis.JDSMatching`. Loaded identically in two different
      places: `importScripts('content-scripts/matching.js')` in
      background.js (classic service worker, not a module), and as the
      first file in the same `js: [...]` array passed to
      `chrome.userScripts.execute()` for engine.js (both files land in
      the same USER_SCRIPT-world global scope, in order). Same logic,
      genuinely shared, no bundler needed. Function bodies unchanged from
      the original port.
- [x] `onboarding/onboarding.html` + `onboarding.js` — COMPLETE. Writes
      `jds_consent_granted` on yes/no. Renders a Chrome-version-aware
      guide (shows the separate "Allow User Scripts" step only on
      Chrome 138+, detected via UA sniff, falls back to showing both
      steps if version can't be parsed). "Check again" probes
      `chrome.userScripts.getScripts()` in a try/catch rather than
      trusting the version check alone. `chrome://extensions` open
      falls back to clipboard-copy if `tabs.create` on a chrome:// URL
      is blocked (not yet empirically confirmed against a live Chrome
  install either way — only real browser usage will confirm this
  path). After userScripts is confirmed, onboarding explains that
  pinning RoleEcho is optional for detection but useful for popup and
  dashboard access, gives the three manual pin steps, and provides an
  "I've pinned RoleEcho" confirmation before revealing the close action.
- [x] Icons (16/48/128px) — real, designed icons in place.
- [ ] Decision: publish to Chrome Web Store vs. personal load-unpacked
      only — current plan is load-unpacked only; a Web-Store-later idea
      was floated and walked back (see Distribution section) — not
      resolved either way, not blocking.

## v1.1.0 — visibility fix (no popup/badge existed before this)
Nothing about this extension was visible before this version — no
toolbar badge, no popup, nothing but the in-page HUD when a duplicate was
actually found. There was no way to tell "watching," "recorded," or
"not doing anything on this page" apart. Added:
- **Toolbar badge**, set per-tab from `background.js`: a grey dot while
  the engine is scanning ("watching"), a green check once a job is
  recorded as new, a red "!" when a duplicate is found, no badge when the
  page isn't a matched job-posting URL at all. Purely presentational —
  `setTabState()` never feeds back into the duplicate-matching logic.
- **`popup/popup.html` + `popup.js`** (new folder): a real popup replacing
  what Tampermonkey's extension-icon dropdown gave for free. Shows current
  tab's status card (watching/recorded/duplicate/inactive), total tracked
  count, and buttons for the same two commands the original userscript
  exposed via `GM_registerMenuCommand` — clear all data, and copy a JSON
  backup to the clipboard (via `navigator.clipboard`, since a popup has a
  real user-gesture context, unlike engine.js's USER_SCRIPT world).
- `background.js` gained a `GET_STATUS`/`CLEAR_RECORDS`/`GET_BACKUP`
  message API over regular `onMessage` (not `onUserScriptMessage` — the
  popup is an ordinary extension page, same messaging tier as
  onboarding.js).
- `manifest.json`: added `"action"` (default_popup), dropped the unused
  `"scripting"` permission, added `"clipboardWrite"` for the backup button.

## v1.2.0 — calmer UX + mute + history
- Toolbar badge for "watching" removed entirely (kept as internal state
  for the popup, just renders no badge) — a grey dot flickering across
  30+ tabs during a job search is noise per Chrome/Firefox's own badge
  guidance, not signal.
- HUD dot changed from alarm-red to amber — a repost isn't an emergency.
- New "Ignore this listing" mute button on the HUD → `MUTE_MATCH` message
  → stored in `jds_muted_ids` (separate from job records, so muting
  survives the record itself being overwritten by a later revisit).
- Capped recent-activity history (`jds_history`, last 20, popup shows 5)
  so the popup isn't limited to "current tab + total count."
- Accessibility: off-screen `aria-live` region + `role="alertdialog"` on
  the HUD.
- `popup.js` gained a history panel + empty state on top of the v1.1
  status card.

## v1.2.1 — race-condition fixes (found during testing, not by inspection)
1. `injectEngine()` could fire twice for the same tab before the first
   call's "already injected" flag write landed (sniffer's
   `JOB_PAGE_DETECTED` racing the known-host `onUpdated` shortcut) →
   double-injection into the same persistent USER_SCRIPT world →
   `const JDSMatching` "already declared" throw. Fixed with a
   synchronous `injectionInFlight` guard before any `await`.
2. `configureWorld({messaging:true})` was only called fire-and-forget at
   install — `execute()` could create a tab's USER_SCRIPT world before
   messaging was actually enabled, leaving `engine.js`'s
   `sendMessage` silently undefined. Fixed by awaiting
   `configureUserScriptWorld()` inside `injectEngine()`, right before
   `execute()`.
   Also added the `#muted-note`/`#empty-state`/`#history-panel`/
   `#history-list` markup that popup.js (v1.2.0) already expected but
   popup.html hadn't gained yet — this was throwing "Cannot read
   properties of null (reading 'style')" every time the popup opened.

## Testing constraint (flagged during handoff review)
This is a `chrome.userScripts`-based MV3 extension — it cannot be
meaningfully tested outside a real Chrome install. An AI assistant
reading the source can catch logic errors, stale docs, and structural
issues, but cannot execute the extension, trigger the
Developer-mode/Allow-User-Scripts toggle, or observe real
console/runtime errors. All functional verification (does the sniffer
actually fire, does injection race under real network timing, does the
onboarding guide render right on a given Chrome version) has to happen
via actual browser usage, not code review. Treat code-review findings
as "worth checking for," not as "confirmed working" or "confirmed
broken" until tried live.

## v1.3 — tiered detection, user-confirmed trust list, dashboard
Implemented in the current workspace. The decisions below document the
behavior that the current code is intended to preserve.

**Problem addressed:** detection covers known hosts, machine-readable
`JobPosting` pages, job-related URLs, and ambiguous job-shaped pages that
reach the confirmation flow. Custom career pages are no longer excluded
solely because their URL lacks a job keyword.

**Decision — three detection tiers, in order:**
1. **Self-labeled pages** — page already embeds machine-readable
   JobPosting data (schema.org JSON-LD, the same thing Google reads).
   Works silently, no popup, nothing site-related stored — only the job
   posting itself gets recorded, same as today.
2. **`KNOWN_JOB_HOSTS`** — unchanged, still just a perf shortcut.
3. **Ambiguous pages** — page looks job-shaped (has a heading, maybe a
   company name) but has no machine-readable label. Only this tier can
   ever show a "is this a job site?" popup, and only this tier ever
   writes anything about the *site itself* (as opposed to the job
   posting) to storage.
- **Why removing the URL-keyword allowlist doesn't cost anything:**
  `host_permissions` is already `<all_urls>` — the keyword list was
  never reducing the permission footprint, only skipping a cheap
  substring scan on non-job pages. Tier 1/2 need no keyword filter at
  all once the manifest's `content_scripts.matches` is `<all_urls>`.

- **Decision — user-confirmed site list, not auto-learned:** when tier 3
  asks and the user answers, that answer (yes/no) is stored. A "no"
  means never ask about that site again. This is explicitly NOT the
  "auto-learned list" rejected in the original Architecture section —
  the difference is consent: nothing is guessed and remembered on its
  own, only what the user was actually asked and actually answered.
  **Why this matters enough to be its own decision:** repeatedly asking
  about a site the user already said "no" to would make the tool feel
  untrustworthy/naggy over time — explicitly named as a risk to avoid,
  not just a nice-to-have.
- **Decision — this list is small by construction, not a browsing log:**
  a page that never looks job-shaped (tier 3 never triggers) is never
  asked about and never written down. The list only ever contains sites
  that were actually flagged as ambiguous AND actually answered.
- **Decision — single toggle, default on:** "Ask me about sites I
  visit." Off = tier 3 goes fully quiet (no popups, nothing new
  asked/stored); tiers 1 and 2 are unaffected by this toggle since they
  never needed to ask anything. Lives in the dashboard (see below).

**Decision — dashboard, scope:**
- New standalone page (`dashboard/dashboard.html` + `dashboard.js`),
  opened as its own full browser tab via `chrome.tabs.create()` from a
  button in the popup. It does NOT render inside the popup itself — the
  popup stays small; the dashboard is a real page because a
  history/records/site-list view doesn't fit a popup-sized surface.
- Sections: Overview (totals — jobs seen, duplicates caught, muted
  count), Recent activity (the full history log, not just the popup's
  5-item slice), Tracked postings (company+title+date-seen list, sortable
  — passive, nothing to fill in), Site trust list (the tier-3 yes/no
  decisions, reviewable/reversible), Settings (the ask-me-about-sites
  toggle + existing clear-all/backup buttons, relocated here from the
  popup since the dashboard has room and the popup doesn't need to
  duplicate them).
- **Explicitly NOT included, reaffirmed by the user:** no manual
  application status/stage field, no notes, no reminders, no follow-up
  tracking. This is what keeps it "a window into the detector's own
  data," not the job-tracker/CRM already rejected above. Reasoning given:
  most people already get application updates by email, not by manually
  updating a status field, so a manual-tracking layer wouldn't get used
  and isn't worth building.

**Decision — popup keeps a short history, dashboard has the full one:**
popup keeps a compact list (4 most recent entries) with a "See dashboard
for full history" link/label under it, rather than removing history from
the popup entirely. Not an OPEN item anymore.

**Parking lot — raised as product-manager-style ideas, explicitly NOT
decided or being built, kept here only so they aren't lost:**
- Optional periodic email report/digest to the user (weekly summary of
  activity).
- A "monitor and suggest" feature — the system watching usage patterns
  and offering suggestions to improve the user's applications. Vague on
  purpose at this stage; would need real scoping before it's a decision.
- General UX-improvement pass — raised as a gap (not yet actually
  designed) — deliberately deferred so as not to open multiple large
  threads in the same pass and risk hitting context limits.

## v1.3 — application-count tracking, update checker, design pass
Application counting, the design pass, and the update checker are implemented
in the current workspace. The update checker remains disabled until the real
GitHub repository owner and name replace its placeholders.
This section supersedes the
"counting total applications submitted" line in "Deferred to later" below
for the specific, narrow feature described here — that Deferred item is
NOT fully reversed, see the Excel-export note at the end of this section.

**Why this doesn't reopen the job-tracker/CRM rejection:** everything here
is auto-observed counting, bucketed by time and by detection type. No
manual per-application entry, no status/stage/notes, no outcome tracking
(interviews, offers, replies). The user does paid job-application work for
clients and needs accurate logs of application volume for his own
records — this is a volume/activity counter, not a tracker of any single
application's fate.

**Decision — Easy Apply vs. Advanced Apply, mutually exclusive:**
- On LinkedIn, while viewing an individual job-posting page (NOT the jobs
  feed / search-results page), an application defaults to **Easy Apply**.
- If clicking Apply opens a new tab (the posting tab becomes the
  `openerTabId` parent — reusing the tab-lineage map already built for
  duplicate suppression, see Architecture #6/#4), that same application is
  **reclassified to Advanced Apply**, not double-counted. Easy Apply and
  Advanced Apply are mutually exclusive per application; the applications
  total increments exactly once either way.
- All non-LinkedIn sites default to Advanced Apply. No Easy-Apply-style
  in-page detection is attempted anywhere except LinkedIn job-posting
  pages.
- **RESOLVED:** requires reaching the "Application sent" confirmation
  state inside the modal, not just opening it — avoids counting an
  opened-then-abandoned modal. `engine.js` now sends `APPLY_CONFIRMED`
  when its LinkedIn success heuristic detects that state.

**BUILD STATUS for this section:**
- [x] `background.js` — daily/platform storage maps, `getApplicationStats()`
      aggregation, pending-application tracking (mark on new posting,
      finalize-as-advanced on child tab open via existing openerTabId
      lineage, finalize-as-easy on `APPLY_CONFIRMED`), dashboard payload
      extended, clear-all wipes the new storage. Syntax-checked, not yet
      run in a live browser (same testing constraint as everything else
      in this file).
- [x] `content-scripts/engine.js` — detects LinkedIn's Easy Apply modal
  reaching its success/"Application sent" state and sends
  `APPLY_CONFIRMED`, limited to individual LinkedIn job pages.
- [x] `dashboard/dashboard.html` — markup DONE (v1.3.2/v1.3.3): renders
      `app-total-day/week/month/lifetime`, per-bucket easy/advanced
      breakdown, `app-most-active-day`, `app-most-visited-platform` — all
      the element IDs `getApplicationStats()`'s payload would need to
      populate. `dashboard.js` reads the payload and writes the values into
      these elements.
- [x] `popup/popup.html` — visual/layout pass DONE (v1.3.0, see design-pass
      entry below). The separate content question — whether the popup
      needs its own small applications summary at all — is still
      undecided, unchanged from before.
- [x] Layout/spacing/hierarchy redesign pass (dashboard + popup +
      onboarding) — DONE for all three HTML/CSS files: dashboard.html
      (v1.3.2 layout rethink + v1.3.3 glass-consistency fix), popup.html
      (v1.3.0), onboarding.html (v1.3.0). See the design-pass entry below
      for what changed. The required element IDs and generated class names
      remain compatible with dashboard.js, popup.js, and onboarding.js.
- [x] In-extension update checker — `background.js` uses a 12-hour
  `chrome.alarms` check, compares the remote GitHub manifest version
  numerically with the installed version, caches the result in local
  storage, and exposes it through the existing popup/dashboard responses.
  Popup and dashboard render an update banner without downloading or
  replacing files. It is intentionally inactive while the repository
  owner/name remain placeholders.

**Decision — time buckets, calendar-aligned with a lifetime total:**
- Day resets at 12 AM local time.
- Week resets Sunday→Saturday (not Monday-start).
- Month resets on the calendar month boundary.
- Each bucket accumulates as its period progresses (e.g. Mon+Tue totals
  visible mid-week) and zeroes out at its own boundary, independently of
  the others.
- A lifetime total is always shown alongside day/week/month — buckets do
  not replace it.
- Duplicated listings (already-existing "duplicates caught" counter) stay
  excluded from all application-count totals, per the earlier session's
  decision — unchanged.

**Decision — two new dashboard stats:**
- **Most-active day** — the single day (so far, within whatever period
  makes sense once built) with the highest application count.
- **Most-visited platform** — pure visit-frequency count across ATS/job
  platforms (Greenhouse, Lever, LinkedIn, Workday, etc.) — whichever one
  the user's applications land on most often. Explicitly NOT an
  outcome/success measure (no interview/offer/reply data exists anywhere
  in this tool) — purely "which platform showed up most while counting."

**Decision — design direction, layout-only, not color:**
The approved palette (`--paper`/`--ink`/`--amber`/`--ok`/`--alert`, per
onboarding.html and already used in dashboard.html) stays as-is — no
further color discussion needed. "Intentional and modern" refers
specifically to layout, spacing, type hierarchy, arrangement, and
information density reading as a 2026-era product rather than dated —
covering the dashboard (must not look sparse/empty — the new stats give
it enough real content), the popup (must feel as premium/polished as the
dashboard, not like an older, separate UI), and onboarding (plain-language
explanation of why Developer Mode / Load Unpacked is required, framed as
normal rather than alarming).

**Decision — no-Web-Store update problem, solved with an in-extension
update checker (not by revisiting Web Store publishing):**
Load Unpacked has zero built-in update delivery — users are frozen on
whatever version they installed until they notice a new one exists and
manually reinstall it. Rejected batching-everything-into-rare-huge-releases
as the only fix, since it would force donations, the future v1.4 export
feature, and any bug fix to all ship together. **Chosen approach:** the
extension periodically fetches the raw `manifest.json` from the project's
GitHub repo, compares its `"version"` field against the installed one, and
shows a small "update available" banner (popup and/or dashboard) linking
to the repo if a newer version exists. No Chrome Web Store involvement, no
new distribution channel — just makes an existing update visible instead
of silent. GitHub is the confirmed hosting location for this repo.
Reopening Web Store publishing was explicitly considered and declined
again.

**Decision — Excel export of application logs: deferred to v1.4+, not
this version.** This is the one place the "Deferred to later" line on
CSV/JSON export genuinely still applies, reaffirmed rather than reversed:
the user wants it eventually (download logs as a working Excel
spreadsheet, useful for his own client-facing records) but agreed it adds
too much scope/complexity to bundle into v1.3 alongside everything else
above. Explicitly parked as a named future version, not lost track of.

## v1.3 — design pass complete: dashboard, popup, onboarding (glass + layout)
Closes out the "Layout/spacing/hierarchy redesign pass" item above. Two
things were fixed together across all three files this time — dashboard
needed two separate passes to get both right; popup and onboarding got
both from the start:

**1. Layout/hierarchy rethink** (per the earlier "rethink it please"
decision): identical equal-weight cards replaced with real hierarchy on
whichever element is actually the point of that screen.
- Dashboard Overview: one large hero number (duplicates caught) with
  postings-seen/muted as smaller supporting readouts beside it, not
  three equal cards.
- Dashboard Applications: lifetime total is the anchor; day/week/month
  became a compact comparison strip, not four equal cards.
- Popup: the status card (what happened on THIS tab) is now the
  dominant element; the tracked-count row is a small de-emphasized
  inline readout underneath it, not its own full-width bordered stat box.
- Onboarding: the circle-and-connector step indicator was replaced with
  a single slim two-segment progress bar (label underneath each
  segment) — same `data-state="done"/"active"/"pending"` attribute
  onboarding.js already sets, same two `<li>` IDs, purely a CSS change.

**2. Glass applied consistently, including to interactive states:**
dashboard.html's first glass pass (v1.3.2) only glassed the static
surfaces — cards, tab bar, hero — and left the ACTIVE/hover states
(selected tab, button hover, the settings toggle) as flat solid
`var(--ink)`, which read as a flat black chip sitting inside an
otherwise-glassy tab bar. Fixed in dashboard.html v1.3.3, and built
correctly from the start in popup.html/onboarding.html v1.3.0: those
states now use a translucent ink tint (`rgba(23,24,27,0.85)`, a new
`--ink-glass` variable) with their own `backdrop-filter` blur, instead
of switching to a fully opaque fill on selection/hover/press. No color
values were reopened — same locked `--ink`/`--paper`/`--amber`/`--ok`/
`--alert` hexes everywhere; `--ink-glass` is a translucency of the
existing `--ink`, not a new color.

All three files also picked up the same fixed ambient color-wash
background (`body::before`, built only from the existing amber/ok/alert
tints at low opacity) so the glass blur has real content behind it to
refract — this was already in dashboard.html and is now in popup.html
and onboarding.html too, so all three read as one consistent surface
rather than the dashboard looking more "finished" than the other two.

Every element ID and every JS-generated class name (`.status-card.ok`,
`.hist-item`, `.hist-dot.alert`, `#progress-rail` li IDs, `#guide-status`,
etc.) was left exactly as-is — this was a CSS-only pass across all three
files; the existing JavaScript contracts remain compatible after the
update-checker and onboarding pin-step additions.

## Historical note: v1.0.1 coverage fix
At that stage, `manifest.json`'s `content_scripts.matches` was `<all_urls>`, with
`sniffer.js` gating on a literal `"JobPosting"` substring inside JSON-LD
before signaling background.js. That silently missed every job page
without JobPosting schema outside the named `KNOWN_JOB_HOSTS` — i.e. most
smaller companies' custom career pages, which the original userscript's
`@match` list (generic `*job*`/`*career*`/`*apply*`/etc. keyword patterns)
was specifically designed to catch. Fixed by copying the original
`@match` list verbatim into `content_scripts.matches` (userscript `@match`
and extension match patterns are the same spec) and removing the JSON-LD
gate from `sniffer.js` entirely — it now just signals on every matched
page/route, exactly as broad as the original, and relies on `engine.js`'s
extraction chain to silently no-op on any false-positive URL match, same
as the original script always did. Also restored `caaclubgroup.ca` to
`KNOWN_JOB_HOSTS`, dropped by mistake during the initial port.

## How to resume this project in a new conversation
1. Attach/paste this file in full. It is self-contained — the original
   userscript source is not required to be re-attached unless deep
   verification against it is needed again (its full logic is already
   captured in `matching.js` and summarized above).
2. Inspect the current versions of the runtime files and run the syntax
  checks before making changes. Dashboard, popup, and onboarding scripts
  are present in the workspace.
3. The remaining planned v1.3 feature is the in-extension update checker;
  the other major work is live Chrome testing and release polish.
4. Do NOT re-ask anything already answered above. Do flag anything that
   seems to conflict with a decision here rather than silently overriding
   it or silently going along with it.