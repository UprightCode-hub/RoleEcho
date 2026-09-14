/**
 * FILE: content-scripts/sniffer.js
 * SeenDisJob — runs on all ordinary web pages, but only signals
 * background.js when a page has a cheap job-shaped clue. Named job hosts
 * bypass this script through background.js's fast path.
 *
 * Unknown sites use three cheap clues: JobPosting JSON-LD, job-related URL
 * words, or a page with a heading plus several job-related terms. The last
 * case lets engine.js inspect custom career pages; its DOM source still goes
 * through the existing user-confirmation flow in background.js.
 */

const MSG_JOB_PAGE_DETECTED = 'JOB_PAGE_DETECTED';
const URL_POLL_MS = 1000;
const POST_NAV_CHECK_DELAY_MS = 500; // let SPA route content render before checking

const URL_HINTS = /(?:job|career|apply|talent|hiring|recruit|position|opening)/i;
const PAGE_HINTS = [
  'job description', 'responsibilities', 'qualifications', 'apply now',
  'employment type', 'salary', 'benefits'
];

function hasJobPostingJsonLd() {
  return Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    .some(script => /JobPosting/i.test(script.textContent || ''));
}

function hasJobShapedContent() {
  const heading = document.querySelector('h1, h2');
  if (!heading || !(heading.textContent || '').trim()) return false;
  const pageText = (document.body?.innerText || '').slice(0, 30000).toLowerCase();
  const matchingHints = PAGE_HINTS.filter(hint => pageText.includes(hint)).length;
  return matchingHints >= 2;
}

function isWorthChecking() {
  return URL_HINTS.test(location.href) || hasJobPostingJsonLd() || hasJobShapedContent();
}

function sendDetectionMessage() {
  try {
    const pending = chrome.runtime.sendMessage({ type: MSG_JOB_PAGE_DETECTED });
    pending?.catch(() => {}); // Extension may have been reloaded while this page stayed open.
  } catch (error) {
    // An invalidated extension context cannot be repaired from a content script.
  }
}

function reportJobPage() {
  if (isWorthChecking()) sendDetectionMessage();
}

reportJobPage();

// A full page load re-runs this script automatically; an SPA route change
// does not. background.js's per-tab injected-flag absorbs any repeat
// signal, so a simple href poll (no persistent MutationObserver) is enough.
let lastHref = location.href;
setInterval(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    setTimeout(reportJobPage, POST_NAV_CHECK_DELAY_MS);
  }
}, URL_POLL_MS);
