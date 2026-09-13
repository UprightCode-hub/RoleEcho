# RoleEcho

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-red.svg)](LICENSE-APACHE-2.0)

RoleEcho is a privacy-first Chrome extension for high-volume job searching.
It remembers the job postings you visit and warns you when a repost, agency
mirror, or slightly reworded listing is one you have already seen.

It is built by [Wisdom Ekwugha](https://www.linkedin.com/in/wisdom-ekwugha).

[GitHub repository](https://github.com/UprightCode-hub/RoleEcho) | [Project issues](https://github.com/UprightCode-hub/RoleEcho/issues)

> **RoleEcho is dual-licensed under the MIT License or Apache License 2.0.**
> You may choose either license when using, copying, modifying, publishing,
> distributing, sublicensing, or selling the software. See [`LICENSE`](LICENSE)
> and [`LICENSE-APACHE-2.0`](LICENSE-APACHE-2.0) for the complete terms. There
> are no paid license fees or restrictions on commercial use.

## Why it exists

When a job search involves dozens of tabs, the same role can appear on
LinkedIn, Google results, an ATS, and an agency site. RoleEcho handles that
repetition quietly so the searcher can spend attention on new opportunities.

## What it does

- Detects job postings across common job boards, ATS platforms, and custom career pages.
- Matches reposts using normalized titles, company names, abbreviations, and fuzzy similarity.
- Suppresses false duplicate warnings within the same tab and its application flow.
- Shows a small warning only when a genuinely unrelated tab matches an earlier posting.
- Counts LinkedIn Easy Apply separately from external Advanced Apply submissions.
- Provides a popup for current-tab status and a dashboard for history, postings, trust decisions, and totals.

## Privacy by design

- No account, server, analytics, or remote job database.
- Job titles, company names, and activity records stay in Chrome local storage.
- Content checks require explicit consent during setup.
- Unfamiliar job-shaped sites can ask for confirmation before being watched.
- The extension does not track application outcomes, messages, interviews, or offers.

## Install from source

RoleEcho is currently distributed as an open-source unpacked extension rather
than through the Chrome Web Store.

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the RoleEcho folder.
5. Complete the setup tab. Chrome 138 and newer also require **Allow User Scripts** on RoleEcho's Details page.

The setup page explains the permission and walks through the required toggle.
No account or additional configuration is required.

## How to use it

1. Browse job postings normally.
2. RoleEcho records a new posting silently.
3. Repeated or similar postings show a duplicate warning in the page corner.
4. Use the toolbar popup to see the current tab's status.
5. Open the dashboard to review activity, tracked postings, site trust, and application totals. The dashboard's Settings tab also has an About section (version, repository, license, creator credit) and an optional Support section.

LinkedIn Easy Apply is counted only after the application reaches its sent
confirmation. Applications that open an external form are counted as
Advanced Apply. Abandoned forms are not intended to count.

## Development

The extension has three runtime layers:

- `content-scripts/sniffer.js` performs a cheap page check.
- `background.js` owns storage, duplicate decisions, tab lineage, and application totals.
- `content-scripts/engine.js` extracts job information and renders the in-page warning.

The pure matching layer can be tested without Chrome:

```text
node tests/matching.test.js
```

Live behavior still needs real Chrome testing because `chrome.userScripts`
depends on the Developer mode and Allow User Scripts settings. See
`PROJECT_STRUCTURE.md` for the file map and `job-dedup-extension-CONTEXT.md`
for the detailed design decisions.

## Known limitations

- LinkedIn's DOM changes over time, so title and company extraction is tested against live pages rather than a stable public API.
- Some third-party Apply popups do not expose enough tab lineage to distinguish them from ordinary child links.
- This tool counts observed application volume; it does not manage application stages or outcomes.
- CSV/Excel export is planned for a later release.

## Support and contribution

RoleEcho is free and open source. Bug reports, job-site compatibility reports,
pull requests, and thoughtful feedback are welcome through
[GitHub Issues](https://github.com/UprightCode-hub/RoleEcho/issues).

RoleEcho does not have a confirmed donation channel yet, so no donation link
is published here or in the extension. A real GitHub Sponsors, Ko-fi, or Buy
Me a Coffee link will be added once one exists — the dashboard's Support
section already reserves a spot for it. Donations will never be required to
use the extension.

## License

**RoleEcho is dual-licensed under MIT or Apache-2.0.** Choose the license that
fits your use: [MIT](LICENSE) or [Apache License 2.0](LICENSE-APACHE-2.0).