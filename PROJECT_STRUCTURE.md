# Project Structure — RoleEcho (Chrome Extension)

Read `job-dedup-extension-CONTEXT.md` first for the full reasoning and
decision history. This file is just the map of where each piece of that
plan lives in actual code.

Every file below is part of the v1.3 implementation. Live Chrome testing is
still required because the extension depends on `chrome.userScripts`.

```
job-dedup-extension/
├── manifest.json                 Permissions, host permissions, real
│                                  name/description (no longer TODO)
├── background.js                 Service worker — owns all storage, the
│                                  duplicate decision, tab-lineage tracking,
│                                  application statistics, and dashboard messages
├── content-scripts/
│   ├── sniffer.js                 Runs on ~every page. Cheap check: "is
│   │                               this a job posting?" Reports back.
│   ├── engine.js                  Extraction (JSON-LD → OG meta → DOM/
│   │                               Shadow-DOM) + HUD. Injected on demand.
│   └── matching.js                Pure logic, no DOM/Chrome APIs.
│                                   Normalize, tokenize, fuzzy-match.
├── onboarding/
│   ├── onboarding.html             One-time consent screen + guided
│   │                                Developer Mode / Allow User Scripts
│   │                                walkthrough, Chrome-version-aware
│   └── onboarding.js               Wires consent to storage, probes
│                                    chrome.userScripts availability
├── popup/
│   ├── popup.html                  Toolbar popup layout and controls
│   └── popup.js                    Status, history, backup, clear, dashboard link
├── dashboard/
│   ├── dashboard.html              Overview, applications, activity, postings,
│   │                                trust, and settings panels
│   └── dashboard.js                Dashboard data, tabs, sorting, trust, and actions
├── icons/
│   ├── icon16.png, icon48.png, icon128.png   Real icons (not placeholders)
├── job-dedup-extension-CONTEXT.md  Full design history and decisions
├── README.md                       Human install/testing instructions
└── LICENSE                         MIT — Wisdom Ekwugha
```

## Execution contexts, at a glance

Three different Chrome execution contexts are in play, and mixing them up
is the easiest way to introduce a bug:

- **`background.js`** — service worker. No DOM. Owns `chrome.storage`.
  Not always running (Chrome kills it after ~30s idle).
- **`sniffer.js`** — a normal declared content script (isolated world).
  Uses regular `chrome.runtime.sendMessage` / `onMessage`.
- **`engine.js` + `matching.js`** — injected into a `USER_SCRIPT` world via
  `chrome.userScripts.execute()`. Cannot touch `chrome.storage` or most
  `chrome.*` APIs — only `chrome.runtime.onUserScriptMessage`.
- **`onboarding.html`/`onboarding.js`** — a full, ordinary extension page
  (opened via `chrome.tabs.create`). Unlike the other three, it has direct
  access to `chrome.storage` and `chrome.tabs` — no messaging needed.

## Current release notes

- Release: `1.3`
- Author: Wisdom Ekwugha
- Distribution: source-only, loaded unpacked in Chrome; not on the Chrome Web Store.
- The dashboard and application-count wiring are present in this workspace.
- The update checker is not implemented yet.
- GitHub and LinkedIn URLs still need to be added when the final profile and
  repository URLs are known.
- The extension has not yet been tested against a real "Load unpacked" install.
- The onboarding "Open chrome://extensions" button's direct-navigation
  path hasn't been empirically confirmed to work in a live Chrome install
  (a clipboard-copy fallback exists either way — see `onboarding.js`).
- Known accepted v1 gap (not a bug): third-party "Apply" popups not
  tracked as a child tab could still falsely flag as a duplicate.
