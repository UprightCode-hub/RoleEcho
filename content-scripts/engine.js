(function initializeRoleEchoEngine() {
if (globalThis.__ROLEECHO_ENGINE_INITIALIZED__) return;
globalThis.__ROLEECHO_ENGINE_INITIALIZED__ = true;

/**
 * FILE: content-scripts/engine.js
 * RoleEcho v1.3 — injected on demand by background.js,
 * once it has decided this tab is a genuine job-posting page.
 *
 * v1.2.0 UX changes (cosmetic only — no logic changes):
 *  1. HUD severity calmed: amber dot instead of alarm red. A repost is
 *     useful info, not an emergency — styling it like a security alert
 *     was cry-wolf-ing on something that happens constantly.
 *  2. "Ignore this listing" mute button added. Sends MUTE_MATCH to
 *     background.js so this exact company+title never triggers the HUD
 *     again. Handles intentional reposts and two similar roles at one
 *     company without having to dismiss every single time.
 *  3. Accessibility: an off-screen aria-live region announces the HUD
 *     appearance to screen readers; the HUD itself gets role="alertdialog"
 *     + aria-label so keyboard users know what landed.
 *
 * v1.3.0 — tier-3 site confirm popup:
 *  Extraction functions now tag which tier found the info (`source`:
 *  'jsonld' | 'meta' | 'dom'), sent to background.js as part of the
 *  CHECK_JOB payload. background.js uses that (plus KNOWN_JOB_HOSTS) to
 *  decide trust — this file doesn't decide trust itself, it only shows
 *  what background.js tells it to. If background.js responds
 *  `needsConfirm: true`, this file shows a small "is this a job site?"
 *  popup instead of running the duplicate check. The user's answer is
 *  sent back via SET_SITE_TRUST; on "yes," detection re-runs immediately
 *  so a genuine duplicate on this first visit isn't missed.
 *
 * v1.3.1 — LinkedIn Easy Apply detection (fills the gap background.js
 * was already waiting on — see its handleApplyConfirmed comment):
 *  1. Only ever attempted on an individual LinkedIn job-posting page
 *     (`/jobs/view/...`) — deliberately excludes the jobs feed and the
 *     search-results page (which shows a job in a side panel without
 *     navigating to /jobs/view/), per the decided scope in CONTEXT.md.
 *     No non-LinkedIn host is touched at all; every other site is
 *     Advanced Apply by definition and background.js already handles
 *     that half via tab-opener lineage.
 *  2. Detection reuses the existing duplicate-check MutationObserver
 *     instead of adding a second one — one extra cheap lookup per
 *     mutation batch, gated to return instantly on any non-LinkedIn
 *     page or once this page has already confirmed.
 *  3. Requires the modal to actually reach a success state ("your
 *     application was sent" / "application submitted"), not just be
 *     opened — an opened-then-abandoned Easy Apply modal must not count.
 *     Scoped to a LinkedIn Easy-Apply-shaped dialog first (by selector,
 *     falling back to a generic artdeco modal only if its own text also
 *     mentions Easy Apply / "Apply to"), then that dialog's text is
 *     checked for the success phrase — this two-step check exists so an
 *     unrelated LinkedIn dialog (e.g. a "message sent" toast) can't
 *     false-positive just because a success-sounding phrase appears
 *     somewhere else on the page.
 *  4. Sends one APPLY_CONFIRMED message (fire-and-forget — background.js
 *     doesn't need a reply here) the first time success is seen, then
 *     stays silent until the SPA route changes to a different job
 *     posting, same "reset on href change" pattern already used for
 *     lastProcessedKey.
 *  KNOWN GAP, matching this project's existing testing constraint:
 *  LinkedIn's Easy Apply modal markup isn't documented anywhere and
 *  changes without notice — the selectors/text patterns below are a
 *  best-effort heuristic, not verified against a live submission. Only
 *  real browser use will confirm whether it fires reliably; if it
 *  misses real submissions or false-positives, the fix is narrowing or
 *  widening EASY_APPLY_SUCCESS_RE / LINKEDIN_EASY_APPLY_MODAL_SELECTORS,
 *  not the surrounding wiring.
 */

const MSG_CHECK_JOB       = 'CHECK_JOB';
const MSG_APPLY_INTENT    = 'APPLY_INTENT';
const MSG_CLOSE_TAB       = 'CLOSE_TAB';
const MSG_MUTE_MATCH      = 'MUTE_MATCH';      // v1.2.0
const MSG_SET_SITE_TRUST  = 'SET_SITE_TRUST';  // v1.3.0
const MSG_APPLY_CONFIRMED = 'APPLY_CONFIRMED'; // v1.3.1 — LinkedIn Easy Apply success

const SCAN_DEBOUNCE_MS        = 600;
const FALLBACK_SCAN_WINDOW_MS = 15000;
const FALLBACK_SCAN_INTERVAL_MS = 1500;

const TITLE_SELECTORS = [
  '[data-testid*="job-title" i]', '[data-automation-id*="jobTitle" i]',
  '.job-title', '.jobTitle', '[class*="job-title" i]', '[class*="jobtitle" i]',
  '.posting-headline h2', '.app-title', 'h1', 'h2'
];

const COMPANY_SELECTORS = [
  '[data-testid*="company" i]', '[data-automation-id*="company" i]',
  '.company-name', '.companyName', '[class*="company-name" i]',
  '[class*="employer" i]', '.posting-categories .department', 'h3'
];

const LINKEDIN_TITLE_SELECTORS = [
  '.job-details-jobs-unified-top-card__job-title',
  '.jobs-unified-top-card__job-title',
  '[class*="jobs-unified-top-card__job-title"]',
  '[class*="job-details-jobs-unified-top-card__job-title"]',
  '[class*="top-card"] h1',
  'main h1'
];

const LINKEDIN_COMPANY_SELECTORS = [
  '.job-details-jobs-unified-top-card__company-name',
  '.jobs-unified-top-card__company-name',
  '[class*="jobs-unified-top-card__company-name"]',
  '[class*="job-details-jobs-unified-top-card__company-name"]',
  '[class*="top-card"] a[href*="/company/"]',
  'main a[href*="/company/"]',
  'a[href*="/company/"]'
];

/* ---------------------------------------------------------------------
 * Shadow-DOM-aware DOM queries
 * ------------------------------------------------------------------- */
function deepQueryAll(selector, root = document) {
  const results = [];
  (function walk(node) {
    if (!node.querySelectorAll) return;
    node.querySelectorAll(selector).forEach(el => results.push(el));
    node.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) walk(el.shadowRoot);
    });
  })(root);
  return results;
}

/* ---------------------------------------------------------------------
 * Extraction pipeline (tiered — most reliable first)
 * ------------------------------------------------------------------- */
function extractFromJsonLd() {
  const scripts = deepQueryAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let data;
    try { data = JSON.parse(script.textContent); } catch { continue; }
    const roots = Array.isArray(data) ? data : [data];
    for (const item of roots) {
      const nodes = item && item['@graph'] ? item['@graph'] : [item];
      for (const node of nodes) {
        if (!node) continue;
        const type = node['@type'];
        const isJobPosting = type === 'JobPosting' ||
          (Array.isArray(type) && type.includes('JobPosting'));
        if (isJobPosting && node.title) {
          let company = '';
          if (node.hiringOrganization) {
            company = typeof node.hiringOrganization === 'string'
              ? node.hiringOrganization
              : (node.hiringOrganization.name || '');
          }
          return { title: node.title, company, source: 'jsonld' };
        }
      }
    }
  }
  return null;
}

function extractFromMeta() {
  const ogTitle =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector('meta[name="twitter:title"]')?.content;
  const ogSite = document.querySelector('meta[property="og:site_name"]')?.content;
  if (ogTitle && ogTitle.trim().length > 3) {
    return { title: ogTitle.trim(), company: (ogSite || '').trim(), source: 'meta' };
  }
  return null;
}

function firstVisibleText(selectors, minimumLength) {
  for (const selector of selectors) {
    const element = deepQueryAll(selector).find(candidate => {
      const style = window.getComputedStyle(candidate);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    const text = element?.innerText?.replace(/\s+/g, ' ').trim();
    if (text && text.length >= minimumLength) return text;
  }
  return '';
}

function isPlausibleLinkedInTitle(text) {
  return text && text.length >= 3 &&
    !/^(?:\d+\s+)?notifications?$|^(?:home|my network|messaging|search|jobs)$/i.test(text);
}

function extractFromLinkedIn() {
  if (!/(^|\.)linkedin\.com$/i.test(location.hostname)) return null;
  let title = firstVisibleText(LINKEDIN_TITLE_SELECTORS, 3);
  if (!isPlausibleLinkedInTitle(title)) {
    const pageTitle = document.title.split('|')[0].replace(/\s+/g, ' ').trim();
    title = isPlausibleLinkedInTitle(pageTitle) ? pageTitle : '';
  }
  const company = firstVisibleText(LINKEDIN_COMPANY_SELECTORS, 2);
  return title ? { title, company, source: 'dom' } : null;
}

function extractFromDom() {
  let title = '', company = '';
  for (const sel of TITLE_SELECTORS) {
    const text = deepQueryAll(sel)[0]?.innerText?.trim();
    if (text && text.length > 3 && !/search results/i.test(text)) { title = text; break; }
  }
  for (const sel of COMPANY_SELECTORS) {
    const text = deepQueryAll(sel)[0]?.innerText?.trim();
    if (text && text.length > 1) { company = text; break; }
  }
  return title ? { title, company, source: 'dom' } : null;
}

function extractJobInfo() {
  const linkedIn = extractFromLinkedIn();
  if (linkedIn?.title && linkedIn?.company) return linkedIn;

  const structured = extractFromJsonLd();
  if (structured && (!/(^|\.)linkedin\.com$/i.test(location.hostname) ||
      isPlausibleLinkedInTitle(structured.title))) {
    if (!structured.company && linkedIn?.company) structured.company = linkedIn.company;
    if (!structured.title && linkedIn?.title) structured.title = linkedIn.title;
    return structured;
  }

  return linkedIn || extractFromMeta() || extractFromDom();
}

/* ---------------------------------------------------------------------
 * LinkedIn Easy Apply detection — v1.3.1
 * See the doc block at the top of this file for the full reasoning.
 * Fires APPLY_CONFIRMED at most once per page load (reset on SPA route
 * change, same pattern as lastProcessedKey below).
 * ------------------------------------------------------------------- */
const LINKEDIN_EASY_APPLY_MODAL_SELECTORS = [
  '.jobs-easy-apply-modal',
  '[data-test-modal-id="easy-apply-modal"]',
  '.artdeco-modal[role="dialog"]',
  '[role="dialog"]' // LinkedIn changes the modal class; text filtering below keeps this scoped
];

// Confirms a generic artdeco-modal match is really the Easy Apply flow
// and not some unrelated LinkedIn dialog, before it's trusted at all.
const EASY_APPLY_OPEN_HINT_RE = /easy apply|apply to /i;

// The actual success signal: the modal reaching its "sent" screen, not
// just being open. Kept loose-ish on purpose since LinkedIn's wording
// has changed before ("was sent" vs "has been sent" vs "submitted").
const EASY_APPLY_SUCCESS_RE =
  /application (was |has been )?sent|application submitted|your application was sent/i;

const APPLY_CONTROL_RE = /\b(apply|submit application|start application|continue application)\b/i;
const APPLY_CONTROL_SELECTOR = [
  'a', 'button', '[role="button"]', 'input[type="submit"]', 'input[type="button"]',
  '[aria-label*="apply" i]', '[data-testid*="apply" i]', '[data-control-name*="apply" i]'
].join(', ');

let easyApplyConfirmedForThisPage = false;

function getApplyControl(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  return path.find(node => {
    if (!(node instanceof Element) || !node.matches(APPLY_CONTROL_SELECTOR)) return false;
    const label = [
      node.innerText,
      node.getAttribute('aria-label'),
      node.getAttribute('title'),
      node.getAttribute('data-control-name'),
      node.value
    ].filter(Boolean).join(' ');
    return APPLY_CONTROL_RE.test(label);
  }) || null;
}

function reportApplyIntent(event) {
  if (!getApplyControl(event)) return;
  chrome.runtime.sendMessage({ type: MSG_APPLY_INTENT }).catch(() => {});
}

// Individual job-posting page only — deliberately excludes the feed and
// the search-results page (job details shown in a side panel there,
// without the URL ever becoming /jobs/view/...).
function isLinkedInJobPostingPage() {
  return /(^|\.)linkedin\.com$/.test(location.hostname) &&
    /^\/jobs\/view\//.test(location.pathname);
}

function findEasyApplyModal() {
  for (const sel of LINKEDIN_EASY_APPLY_MODAL_SELECTORS) {
    const candidates = document.querySelectorAll(sel);
    for (const el of candidates) {
      if (!EASY_APPLY_OPEN_HINT_RE.test(el.textContent || '')) {
        continue; // Ignore unrelated LinkedIn dialogs and overlays.
      }
      return el;
    }
  }
  return null;
}

// Cheap on every call: bails immediately unless on a qualifying page and
// not already confirmed, so it's safe to call from the existing
// duplicate-check MutationObserver rather than running a second one.
function checkEasyApplySuccess() {
  if (easyApplyConfirmedForThisPage) return;
  if (!isLinkedInJobPostingPage()) return;
  const modal = findEasyApplyModal();
  if (!modal) return;
  if (!EASY_APPLY_SUCCESS_RE.test(modal.textContent || '')) return;

  easyApplyConfirmedForThisPage = true;
  // Fire-and-forget — background.js's handleApplyConfirmed doesn't need
  // a reply, and a missing receiving end (e.g. extension reloaded mid-
  // session) shouldn't throw an unhandled rejection in the page console.
  chrome.runtime.sendMessage({ type: MSG_APPLY_CONFIRMED }).catch(() => {});
}

/* ---------------------------------------------------------------------
 * HUD overlay — v1.2.0: amber severity, mute button, accessibility
 * ------------------------------------------------------------------- */
function injectHudStyles() {
  if (document.getElementById('jds-hud-style')) return;
  const style = document.createElement('style');
  style.id = 'jds-hud-style';
  style.textContent = `
    #jds-hud {
      position: fixed; top: 16px; right: 16px; z-index: 2147483647; width: 320px;
      padding: 16px 18px 14px; border-radius: 14px;
      background: linear-gradient(135deg, rgba(20,18,10,0.93), rgba(45,35,10,0.93));
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 8px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.07);
      animation: jds-slide-in .3s ease-out;
    }
    @keyframes jds-slide-in {
      from { transform: translateX(24px); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
    #jds-hud .jds-title {
      display: flex; align-items: center; gap: 8px;
      font-weight: 700; font-size: 13.5px; margin-bottom: 8px;
    }
    #jds-hud .jds-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      background: #C68400;
      box-shadow: 0 0 7px 2px rgba(198,132,0,.45);
    }
    #jds-hud .jds-body {
      font-size: 12.5px; line-height: 1.45; opacity: .88;
      margin-bottom: 12px; word-break: break-word;
    }
    #jds-hud .jds-body b { color: #ffd166; font-weight: 600; }
    #jds-hud .jds-score {
      margin-top: 5px; font-size: 11px;
      opacity: .55; font-variant-numeric: tabular-nums;
    }
    #jds-hud .jds-actions { display: flex; gap: 7px; }
    #jds-hud .jds-actions button {
      flex: 1; border: none; border-radius: 8px;
      padding: 8px 10px; font-size: 12px; font-weight: 600;
      cursor: pointer; transition: opacity .15s ease;
    }
    #jds-hud .jds-actions button:hover { opacity: .82; }
    #jds-hud .jds-actions button:focus-visible {
      outline: 2px solid #ffd166; outline-offset: 2px;
    }
    #jds-hud .jds-close-tab { background: rgba(255,255,255,.20); color: #fff; }
    #jds-hud .jds-dismiss    { background: rgba(255,255,255,.10); color: #fff; }
    #jds-hud .jds-mute-row { margin-top: 9px; text-align: center; }
    #jds-hud .jds-mute {
      background: none; border: none; padding: 2px 6px;
      font-size: 11px; color: rgba(255,255,255,.42);
      cursor: pointer; text-decoration: underline;
      font-family: inherit;
    }
    #jds-hud .jds-mute:hover { color: rgba(255,255,255,.7); }
    #jds-hud .jds-mute:focus-visible {
      outline: 1px solid rgba(255,255,255,.5); outline-offset: 2px; border-radius: 3px;
    }
  `;
  document.documentElement.appendChild(style);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTimestamp(ts) {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}

function ensureAriaLive() {
  let el = document.getElementById('jds-aria-live');
  if (!el) {
    el = document.createElement('div');
    el.id = 'jds-aria-live';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    el.style.cssText =
      'position:absolute;width:1px;height:1px;overflow:hidden;' +
      'clip:rect(0,0,0,0);white-space:nowrap;pointer-events:none;';
    document.documentElement.appendChild(el);
  }
  return el;
}

function showDuplicateHud(match, freshTitle, freshCompany) {
  if (document.getElementById('jds-hud')) return;
  injectHudStyles();

  const ariaLive = ensureAriaLive();
  const seenDate  = formatTimestamp(match.timestamp);
  const company   = freshCompany || match.company || 'this company';
  const scoreLine = match.companySim === null
    ? `${Math.round(match.titleSim * 100)}% title match (company text unavailable)`
    : `${Math.round(match.companySim * 100)}% company · ${Math.round(match.titleSim * 100)}% title`;

  const hud = document.createElement('div');
  hud.id = 'jds-hud';
  hud.setAttribute('role', 'alertdialog');
  hud.setAttribute('aria-label', 'Duplicate job listing warning');
  hud.innerHTML = `
    <div class="jds-title"><span class="jds-dot" aria-hidden="true"></span>You've seen this listing</div>
    <div class="jds-body">
      <b>${escapeHtml(freshTitle)}</b> at <b>${escapeHtml(company)}</b>
      was already tracked on ${escapeHtml(seenDate)}.
      <div class="jds-score">${escapeHtml(scoreLine)}</div>
    </div>
    <div class="jds-actions">
      <button class="jds-close-tab">Close this tab</button>
      <button class="jds-dismiss">Dismiss</button>
    </div>
    <div class="jds-mute-row">
      <button class="jds-mute">Ignore this listing from now on</button>
    </div>`;
  document.documentElement.appendChild(hud);

  // Announce to screen readers
  ariaLive.textContent =
    `Duplicate job listing: ${freshTitle}${company ? ' at ' + company : ''}` +
    `, first seen ${seenDate}.`;

  hud.querySelector('.jds-close-tab').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: MSG_CLOSE_TAB });
  });

  hud.querySelector('.jds-dismiss').addEventListener('click', () => hud.remove());

  hud.querySelector('.jds-mute').addEventListener('click', () => {
    if (!match.id) { hud.remove(); return; }
    chrome.runtime.sendMessage({ type: MSG_MUTE_MATCH, id: match.id }, () => {
      hud.remove();
    });
  });
}

/* ---------------------------------------------------------------------
 * Tier-3 "is this a job site?" confirm popup — v1.3.0
 * Deliberately a separate, calmer element from the duplicate HUD: this
 * isn't a warning, it's a one-time question. Only ever shown when
 * background.js responds needsConfirm: true (ambiguous page, never
 * asked about this hostname before, and asking isn't turned off).
 * ------------------------------------------------------------------- */
function injectConfirmStyles() {
  if (document.getElementById('jds-confirm-style')) return;
  const style = document.createElement('style');
  style.id = 'jds-confirm-style';
  style.textContent = `
    #jds-confirm {
      position: fixed; top: 16px; right: 16px; z-index: 2147483647; width: 300px;
      padding: 14px 16px 12px; border-radius: 14px;
      background: linear-gradient(135deg, rgba(16,20,28,0.93), rgba(20,28,45,0.93));
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 8px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.07);
      animation: jds-slide-in .3s ease-out;
    }
    #jds-confirm .jds-c-title { font-weight: 700; font-size: 13px; margin-bottom: 6px; }
    #jds-confirm .jds-c-body {
      font-size: 12px; line-height: 1.4; opacity: .85; margin-bottom: 11px;
      word-break: break-word;
    }
    #jds-confirm .jds-c-actions { display: flex; gap: 7px; }
    #jds-confirm .jds-c-actions button {
      flex: 1; border: none; border-radius: 8px;
      padding: 7px 10px; font-size: 12px; font-weight: 600;
      cursor: pointer; transition: opacity .15s ease;
    }
    #jds-confirm .jds-c-actions button:hover { opacity: .82; }
    #jds-confirm .jds-c-actions button:focus-visible {
      outline: 2px solid #7db8ff; outline-offset: 2px;
    }
    #jds-confirm .jds-c-yes { background: #3a6fd8; color: #fff; }
    #jds-confirm .jds-c-no  { background: rgba(255,255,255,.12); color: #fff; }
  `;
  document.documentElement.appendChild(style);
}

function showSiteConfirmPopup(hostname) {
  if (document.getElementById('jds-confirm')) return;
  injectConfirmStyles();

  const popup = document.createElement('div');
  popup.id = 'jds-confirm';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', 'Confirm this is a job site');
  popup.innerHTML = `
    <div class="jds-c-title">Is this a job site?</div>
    <div class="jds-c-body">
      This page looks like it might be a job posting on <b>${escapeHtml(hostname)}</b>.
      Say yes to have RoleEcho watch this site for duplicates.
    </div>
    <div class="jds-c-actions">
      <button class="jds-c-yes">Yes, watch this site</button>
      <button class="jds-c-no">No</button>
    </div>`;
  document.documentElement.appendChild(popup);

  const answer = (trusted) => {
    chrome.runtime.sendMessage(
      { type: MSG_SET_SITE_TRUST, hostname, trusted },
      () => {
        popup.remove();
        if (trusted) {
          // Re-run immediately so a genuine duplicate on this first
          // visit isn't missed — this is a fresh check, not a repeat.
          lastProcessedKey = null;
          runDetection();
        }
      }
    );
  };

  popup.querySelector('.jds-c-yes').addEventListener('click', () => answer(true));
  popup.querySelector('.jds-c-no').addEventListener('click', () => answer(false));
}


/* ---------------------------------------------------------------------
 * Orchestration — unchanged from v1.0.0, except the payload gains
 * `source` and the response is checked for `needsConfirm` (v1.3.0)
 * ------------------------------------------------------------------- */
let lastProcessedKey = null;

async function runDetection() {
  try {
    const info = extractJobInfo();
    if (!info || !info.title) return;

    const titleNorm   = JDSMatching.normalizeTitle(info.title);
    const companyNorm = JDSMatching.normalizeCompany(info.company);
    if (!titleNorm) return;

    const dedupeKey = `${companyNorm}::${titleNorm}::${location.href}`;
    if (dedupeKey === lastProcessedKey) return;
    lastProcessedKey = dedupeKey;

    const titleTokens   = JDSMatching.tokenize(titleNorm);
    const companyTokens = JDSMatching.isConfidentialCompany(companyNorm)
      ? new Set()
      : JDSMatching.tokenize(companyNorm);

    const response = await chrome.runtime.sendMessage({
      type: MSG_CHECK_JOB,
      payload: {
        title:         info.title,
        company:       info.company,
        titleNorm,
        companyNorm,
        titleTokens:   Array.from(titleTokens),
        companyTokens: Array.from(companyTokens),
        url:           location.href,
        source:        info.source
      }
    });

    if (response?.needsConfirm) {
      showSiteConfirmPopup(response.hostname);
      return;
    }

    if (response?.duplicate) {
      showDuplicateHud(response.match, info.title, info.company);
    }
  } catch (err) {
    console.warn('[RoleEcho] scan error:', err);
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
const debouncedRun = debounce(runDetection, SCAN_DEBOUNCE_MS);

function init() {
  debouncedRun();
  checkEasyApplySuccess();
  document.addEventListener('click', reportApplyIntent, true);

  // Same observer drives both the duplicate check and Easy Apply
  // detection — checkEasyApplySuccess() is a no-op in one line unless
  // this is a LinkedIn job-posting page, so this costs nothing elsewhere.
  const observer = new MutationObserver(() => {
    debouncedRun();
    checkEasyApplySuccess();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  const startedAt = Date.now();
  const fallback = setInterval(() => {
    if (Date.now() - startedAt > FALLBACK_SCAN_WINDOW_MS) { clearInterval(fallback); return; }
    runDetection();
  }, FALLBACK_SCAN_INTERVAL_MS);

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      lastProcessedKey = null;
      easyApplyConfirmedForThisPage = false; // new job/page — allow a fresh confirmation
      debouncedRun();
      checkEasyApplySuccess();
    }
  }, 1000);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
} else {
  window.addEventListener('DOMContentLoaded', init);
}
})();