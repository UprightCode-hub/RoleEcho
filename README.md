# RoleEcho

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-red.svg)](LICENSE-APACHE-2.0)

RoleEcho is a privacy-first Chrome extension for job seekers who want to detect duplicate job postings, reposted listings, and repeated opportunities while searching across job boards, ATS platforms, and company career pages.

It helps you avoid wasting time on the same role shown again under a slightly different title, company variant, or reposted listing. The extension works locally in the browser, tracks what you have already seen, and warns you only when a current tab appears to match an earlier posting.

Built by [Wisdom Ekwugha](https://www.linkedin.com/in/wisdom-ekwugha).

[GitHub repository](https://github.com/UprightCode-hub/RoleEcho) | [Issues](https://github.com/UprightCode-hub/RoleEcho/issues) | [Project documentation](PROJECT_STRUCTURE.md)

> RoleEcho is dual-licensed under the MIT License or Apache License 2.0. You may choose either license for use, modification, distribution, and commercial use. See [LICENSE](LICENSE) and [LICENSE-APACHE-2.0](LICENSE-APACHE-2.0).

## Why duplicate job detection matters

High-volume job searching often means opening many tabs and revisiting the same opportunity across multiple sites. A role can appear again on LinkedIn, an ATS, a company careers page, an agency mirror, or a reposted listing with minor wording differences.

That creates a common set of problems:

- wasted time reviewing the same job twice
- repeated applications to the same position
- difficulty remembering whether a posting was already seen or applied to
- fragmented job search across multiple boards and career sites
- missed time to focus on genuinely new opportunities

RoleEcho is designed for that exact problem: to quietly identify when a tab looks like a duplicate or repost of something already encountered.

## What RoleEcho does

- detects duplicate and reposted job listings across common job boards, ATS pages, and custom career pages
- normalizes job titles and company names before comparing listings
- matches similar postings even when wording, capitalization, abbreviations, or company naming differs
- suppresses false duplicate warnings inside the same tab or application flow
- shows a small in-page notice when a genuinely different tab appears to be a repeat
- tracks recent activity and seen postings in a local dashboard
- counts observed application activity separately for LinkedIn Easy Apply and external Advanced Apply flows

## Key features

- Duplicate job detection: compares new job pages against earlier listings already seen in the browser.
- Reposted job spotting: catches jobs that look like the same role reappearing with minor text changes.
- Title and company normalization: strips noise, expands common abbreviations, and reduces differences caused by formatting.
- Similarity matching: uses normalized title and company comparison logic rather than a simple exact-string check.
- Same-tab and same-flow protection: avoids warning on the same job page or on tabs opened as part of the same application path.
- Local-only processing: no external backend, no remote job database, and no account required.
- Toolbar popup and dashboard: shows current tab status, recent history, tracked postings, confidence/trust decisions, and summary stats.
- Privacy-first onboarding: asks for consent before scanning job-page content and explains required Chrome setup.

## How RoleEcho works

RoleEcho follows a straightforward detection pipeline:

1. A lightweight content script checks whether a page looks like a job posting.
2. If it appears relevant, the background service injects the full detection logic for that tab.
3. The page is inspected for structured job data such as JSON-LD, meta tags, or DOM text.
4. The title and company are normalized to reduce noise and handle common abbreviations.
5. RoleEcho compares the extracted job data to previously seen postings in browser local storage.
6. Similarity is calculated using normalized title and company signals, with a guard against obvious false positives.
7. If the match looks genuine and the tab is unrelated, the user sees a duplicate warning instead of silently losing track of the listing.

This is designed to be lightweight and local to the browser. The project does not rely on a remote service to determine whether jobs are duplicates.

## Privacy and data handling

RoleEcho is deliberately local-first.

- There is no user account or backend service required for the core duplicate-detection workflow.
- The extension stores job metadata in Chrome local storage.
- Relevant data includes seen posting records, activity history, muted entries, and site trust decisions.
- The extension asks for consent before checking job-page content.
- The project does not require any external database or cloud processing to work.
- The extension does not track offers, interviews, messages, or full application outcomes.

The privacy model is intentionally narrow: it records enough data to recognize repeated listings and provide a local dashboard, while keeping the complete workflow in the browser.

## Use cases

RoleEcho is meant for realistic work patterns in job search:

- finding the same job posted on multiple job boards or ATS sites
- recognizing a reposted role with a new title or slightly different wording
- avoiding repeated review of the same opening during a broad search
- checking whether a role has already been seen in another tab or window
- keeping a local record of positions already encountered without a separate service

## Demo

This repository does not currently include screenshots, GIFs, or a recorded demo in the project itself. A screenshot of the in-page duplicate warning and the dashboard would be the most useful addition for first-time visitors, but no demo assets are being invented here.

## Installation

RoleEcho is distributed as source code and is meant to be installed as an unpacked extension in Chromium-based browsers.

### Prerequisites

- Chrome, Edge, Brave, Vivaldi, or another Chromium-based browser
- a local copy of this repository on your machine
- Developer mode enabled in the browser extensions page
- the Chrome User Scripts permission enabled for RoleEcho

### Install from source

#### Option 1: Clone with Git

```bash
git clone https://github.com/UprightCode-hub/RoleEcho.git
```

This creates a local RoleEcho folder that you can load directly in the browser.

#### Option 2: Download and extract the ZIP

1. Open the [RoleEcho GitHub repository](https://github.com/UprightCode-hub/RoleEcho).
2. Select Code, then Download ZIP.
3. Extract the archive to a folder on your computer.
4. Make sure the extracted folder contains files such as `manifest.json`, `background.js`, `content-scripts`, `popup`, and `dashboard`.

### Load the extension in Chrome

1. Open `chrome://extensions` in Chrome.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select the RoleEcho folder that contains `manifest.json`.
5. Pin the extension from the puzzle-piece menu if you want quick access to the popup.

### Enable User Scripts

This is required for RoleEcho to inject its job-page detection logic.

- On Chrome versions before 138, Developer mode is typically enough.
- On Chrome 138 and newer, you may also need to open the RoleEcho extension details page and enable Allow User Scripts.

The onboarding flow in this project explains the setup process and can be reopened if needed.

## How to use it

1. Search for jobs as usual.
2. Open normal job-listing pages or company career pages.
3. RoleEcho monitors page content and records jobs it recognizes.
4. If a new tab appears to match a previously seen listing, the extension shows a subtle warning.
5. Use the popup to see the current tab status and recent activity.
6. Open the dashboard to review tracked postings, history, trust settings, and application totals.

## Architecture

RoleEcho is composed of a few clear runtime layers:

- background service worker: owns storage, duplicate decision logic, tab lineage tracking, and application counters
- sniffer content script: runs on many pages and performs a cheap “does this look like a job page?” check
- matching engine: normalizes and compares job titles and company names using local logic
- injected page script: extracts job data from structured metadata or the DOM and renders the in-page warning
- popup and dashboard: gives users a quick status view and a fuller local history of tracked postings and settings
- onboarding flow: guides the user through consent and the Chrome User Scripts permission required for this project

This architecture keeps the duplicate-detection logic local to the browser and minimizes unnecessary work on unrelated pages.

## Project structure

```text
RoleEcho/
├── background.js
├── CHANGELOG.md
├── content-scripts/
│   ├── engine.js
│   ├── matching.js
│   └── sniffer.js
├── dashboard/
│   ├── dashboard.html
│   └── dashboard.js
├── icons/
├── LICENSE
├── LICENSE-APACHE-2.0
├── manifest.json
├── onboarding/
│   ├── onboarding.html
│   └── onboarding.js
├── popup/
│   ├── popup.html
│   └── popup.js
├── PROJECT_STRUCTURE.md
├── README.md
├── tests/
│   └── matching.test.js
└── job-dedup-extension-CONTEXT.md
```

## Testing

The project includes a dependency-free test for the core matching logic:

```bash
node tests/matching.test.js
```

This verifies normalization, abbreviation handling, requisition-code stripping, and similarity calculations without requiring a full Chrome runtime.

Live behavior still needs real browser testing because the extension depends on Chrome-specific APIs and the User Scripts permission.

## Contributing

Contributions are welcome if they improve compatibility, detection quality, or the user experience without broadening the project beyond its current scope.

Ways to contribute:

- report a job-site compatibility issue
- improve detection logic for known posting patterns
- suggest a clearer privacy or setup flow
- polish the extension UI or dashboard
- add test coverage for matching cases

Open an issue or submit a pull request through the repository.

## Search intent and frequently asked questions

### How can I detect duplicate job postings?

RoleEcho is designed to detect repeated job listings by comparing normalized job titles and company names across pages you have already visited. It is especially helpful when the same role shows up again with slight wording differences.

### How can I tell if a job has been reposted?

If the extension sees a current job page that looks similar to an earlier one, it will surface a warning in the page and record the match in the local history. This is useful for repeated listings, reposts, or agency mirrors.

### How can I avoid seeing the same job listing repeatedly?

RoleEcho reduces that problem by tracking seen postings in the browser and alerting you when a new page appears to be a duplicate or obvious repost.

### Is there a Chrome extension for detecting duplicate jobs?

RoleEcho is a source-code Chrome extension focused on this use case. It is not published to the Chrome Web Store in this repository and is installed as an unpacked extension.

### How can job seekers track repeated job listings?

RoleEcho stores recent activity and tracked postings locally in the browser and surfaces them in the popup and dashboard.

## Roadmap and limitations

This project is intentionally focused on a single problem: duplicate and reposted job detection.

Known limitations in the current implementation:

- live browser behavior depends on Chrome permissions such as User Scripts
- LinkedIn page structure can change without notice
- some third-party application popups may not expose enough tab lineage to distinguish them from ordinary child links
- the extension tracks observed application volume; it does not manage manual job-tracking stages or outcomes
- CSV or Excel export is not part of the current codebase

## Star this project

If RoleEcho is useful to your workflow, consider giving the repository a star. It helps more people discover the project, supports the continued development of a practical job-search utility, and makes the project easier to find through GitHub and search engines.

You are not required to star the project, and there is no obligation to do so — just consider it if the extension helps you avoid duplicate job applications and repeated listings.

## External links

- [GitHub repository](https://github.com/UprightCode-hub/RoleEcho)
- [Issues](https://github.com/UprightCode-hub/RoleEcho/issues)
- [Wisdom Ekwugha on LinkedIn](https://www.linkedin.com/in/wisdom-ekwugha)
- [Project structure](PROJECT_STRUCTURE.md)
- [Change log](CHANGELOG.md)

## License

RoleEcho is dual-licensed under the MIT License and the Apache License 2.0. Choose the license that fits your use:

- [MIT](LICENSE)
- [Apache License 2.0](LICENSE-APACHE-2.0)

## Recommended GitHub repository description

Privacy-first Chrome extension for detecting duplicate and reposted job listings across job boards, ATS pages, and company career sites.

## Recommended GitHub topics

- chrome-extension
- job-search
- job-search-tool
- job-board
- duplicate-detection
- web-extension
- javascript
- privacy
- productivity
- recruitment
- browser-extension
- career-tool
- ats
- job-listings
- job-tracker

## Recommended SEO and search phrases

This README is intentionally aligned with searches such as:

- duplicate job postings
- duplicate job listings
- duplicate jobs
- reposted jobs
- job repost detector
- duplicate job posting detector
- job listing duplicate detector
- detecting duplicate job listings
- avoiding duplicate job applications
- repeated job postings
- job search tools
- job search Chrome extension
- Chrome extension for job seekers
- detecting the same job across job boards
- detecting reposted jobs
- duplicate jobs across job boards
- job application productivity
- job application tools

## Additional note

The project would benefit from a real screenshot or short GIF showing the in-page duplicate warning and the dashboard. That visual material is not currently in the repository, and it is best added only when it reflects an actual, working Chrome session rather than a mockup.

