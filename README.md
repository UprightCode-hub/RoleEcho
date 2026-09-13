# RoleEcho — Chrome Extension v1.3

Automatically warns you when a job posting you're looking at is one you've
already seen before — across tabs, across job boards, even when the title
or company name has been slightly reworded or reposted by a staffing
agency. No clicking required — it just watches silently and only speaks up
when it finds a real duplicate.

Built by **Wisdom Ekwugha**.

Project: **RoleEcho**

GitHub: repository link coming after initialization  
LinkedIn: [Wisdom Ekwugha](https://www.linkedin.com/in/wisdom-ekwugha)

Status: v1.3 implementation. The extension includes duplicate detection,
site confirmation, application counting, dashboard reporting, and the
onboarding flow. **Live Chrome testing is still required** before relying on
it with real job applications. See `PROJECT_STRUCTURE.md` for the current
file map and `job-dedup-extension-CONTEXT.md` for design decisions.

## This is not on the Chrome Web Store

This extension is distributed as source only — you load it directly into
Chrome yourself. No store listing, no review process, no cost.

## Installing it

1. Download or clone this repository.
2. Go to `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (toggle, top right of the page).
4. Click **Load unpacked** and select this project's folder.
5. On first install, a setup tab opens automatically. It asks for
   permission to check page content, then walks you through turning on
   **Allow User Scripts** on this extension's own **Details** page — this
   is required because the extension uses Chrome's on-demand
   script-injection API; without it, the extension loads but silently
   detects nothing.

That's it — no sign-in, no account, no configuration required to start.

## What v1.3 includes

- Hybrid detection across all URLs, with fast handling for known job hosts.
- Fuzzy duplicate matching across job boards and tabs.
- User-confirmed trust decisions for unfamiliar job sites.
- LinkedIn Easy Apply and Advanced Apply volume counting.
- Popup status/history and a full dashboard for tracked postings, activity,
  site trust, settings, and application totals.
- Local-only storage; no account, server, analytics, or Web Store dependency.

## License

MIT — see `LICENSE`. In plain terms: free to use, modify, and share,
including for your own projects, as long as the original copyright notice
stays attached. No warranty is provided.

## Support

This is free and will stay free. If it is useful to you, support and
feedback are welcome.

## Contributing

Issues and pull requests are welcome — especially reports of job sites
where detection doesn't work correctly.

## Where things stand technically

- `content-scripts/matching.js` — normalization, tokenizing, fuzzy matching
- `background.js` — storage, the duplicate decision, tab-lineage tracking
- `content-scripts/sniffer.js` — cheap on-every-page job-posting check
- `content-scripts/engine.js` — extraction + HUD, injected on demand only
- `onboarding/` — one-time consent screen + guided permissions walkthrough
- `popup/` — toolbar status, recent activity, backup, and dashboard entry point
- `dashboard/` — overview, application totals, activity, postings, trust, and settings
- `manifest.json` — version 1.3, permissions, host permissions, and branding

See `PROJECT_STRUCTURE.md` for how the pieces fit together, and
`job-dedup-extension-CONTEXT.md` for the design decisions and deferred work.
