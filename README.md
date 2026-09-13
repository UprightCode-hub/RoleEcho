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

RoleEcho is currently distributed as source code. It is not published in the
Chrome Web Store, so you must install it as an **unpacked extension**. You do
not need Node.js, npm, Python, or a build step.

### Option A: Clone with Git

Use this option if Git is installed on your computer:

```bash
git clone https://github.com/UprightCode-hub/RoleEcho.git
```

The command creates a `RoleEcho` folder. Keep that folder somewhere you will
not delete, because the browser loads the extension directly from it.

### Option B: Download and unzip the project

1. Open the [RoleEcho repository](https://github.com/UprightCode-hub/RoleEcho)
	on GitHub.
2. Select **Code**, then **Download ZIP**.
3. Open your Downloads folder and extract the ZIP file. On Windows, right-click
	it and choose **Extract All**.
4. Open the extracted project folder. Select the folder that directly contains
	`manifest.json`, `background.js`, `content-scripts`, `popup`, and the other
	project folders. Do not select the ZIP file or an outer folder that only
	contains another `RoleEcho` folder.

### Load the unpacked extension

These steps use Chrome. Edge, Brave, Vivaldi, Opera, and other Chromium-based
browsers use an equivalent extensions page and support the same general
process. RoleEcho currently depends on the Chromium `chrome.userScripts` API;
Firefox is not a supported installation target at this time.

1. Open your browser's extensions page:
	- Chrome: enter `chrome://extensions` in the address bar.
	- Edge: enter `edge://extensions`.
	- Brave: enter `brave://extensions`.
	- Other Chromium browsers: open their Extensions page from the browser menu.
2. Turn on **Developer mode**. In Chrome and Edge, this switch is usually in
	the top-right corner.
3. Select **Load unpacked**.
4. Choose the extracted or cloned RoleEcho folder, the one containing
	`manifest.json`, and confirm.
5. Pin RoleEcho from the puzzle-piece **Extensions** menu if you want quick
	access to its popup. Pinning is optional for detection.

### Allow User Scripts

RoleEcho uses Chrome's User Scripts API to inspect detected job pages. The
browser must allow this before RoleEcho can work:

- **Chrome before version 138:** enabling **Developer mode** on the extensions
  page also enables the required User Scripts capability.
- **Chrome 138 and newer:** open RoleEcho's **Details** page from
  `chrome://extensions`, then turn on **Allow User Scripts**. Developer mode
  must still be enabled so the unpacked extension can remain installed.

Edge and other Chromium browsers may place this setting in a slightly
different location or use different wording. Look for **Allow User Scripts**
on RoleEcho's details or permissions page. The RoleEcho setup tab also checks
this setting and explains what is still needed.

## First launch and accessing RoleEcho

After loading the extension, RoleEcho opens its setup tab. Follow the prompts
to give consent for checking job-page content and confirm that User Scripts are
enabled. If you close the setup tab, open it again from the extension's details
page or reload the unpacked extension from the extensions page.

You can access the application in three ways:

- **Automatic detection:** visit a job posting in a normal browser tab. RoleEcho
  records the posting and shows a small warning in the page when it matches a
  posting already seen in an unrelated tab.
- **Toolbar popup:** select the pinned RoleEcho icon, or select RoleEcho from
  the puzzle-piece **Extensions** menu. The popup shows the current tab's
  status, tracked-posting count, and recent activity.
- **Dashboard:** open the RoleEcho popup from the toolbar, then select **Open
	dashboard**. The dashboard contains the full history, tracked postings, site
	trust decisions, application totals, and settings.

If the popup or dashboard does not appear, return to the extensions page and
make sure RoleEcho is enabled, the correct folder is loaded, and **Allow User
Scripts** is on. After changing source files, select **Reload** on the RoleEcho
card before testing again.

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