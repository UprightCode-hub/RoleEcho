/**
 * FILE: onboarding/onboarding.js
 * Runs as a normal extension page (NOT a content script, NOT a
 * USER_SCRIPT-world injection) — full chrome.storage/chrome.tabs access,
 * no messaging needed. This is a different execution context from
 * engine.js/sniffer.js, which don't get that.
 *
 * Two jobs: (1) write the one-time consent flag background.js gates
 * everything on, (2) if consent is given, walk the user through the
 * Developer Mode / "Allow User Scripts" toggle chrome.userScripts needs —
 * Chrome can't be told to flip this itself, so this is guidance, not
 * automation.
 */

const CONSENT_KEY = 'jds_consent_granted'; // must match background.js exactly
const LOG_PREFIX = '[SeenDisJob]'; // matches background.js/engine.js's own warn prefix

const screenConsent = document.getElementById('screen-consent');
const screenDeclined = document.getElementById('screen-declined');
const screenGuide = document.getElementById('screen-guide');
const guideSteps = document.getElementById('guide-steps');
const guideStatus = document.getElementById('guide-status');
const btnCloseGuide = document.getElementById('btn-close-2');
const btnCheckAgain = document.getElementById('btn-check-again');
const btnReconsider = document.getElementById('btn-reconsider');
const consentError = document.getElementById('consent-error');
const railConsent = document.getElementById('progress-consent');
const railPermissions = document.getElementById('progress-permissions');
const pinStep = document.getElementById('pin-step');
const btnPinConfirm = document.getElementById('btn-pin-confirm');

function showConsentError(message) {
  consentError.textContent = message;
  consentError.classList.remove('hidden');
}

function clearConsentError() {
  consentError.textContent = '';
  consentError.classList.add('hidden');
}

function showScreen(el) {
  [screenConsent, screenDeclined, screenGuide].forEach(s => s.classList.add('hidden'));
  el.classList.remove('hidden');
}

async function closeThisTab() {
  // Same reasoning as the HUD's "Close this tab" button in engine.js: a
  // page can't reliably window.close() itself when opened via
  // chrome.tabs.create(). chrome.tabs.remove() always works here because
  // this file runs with full extension-page permissions, not a content
  // script's limited ones.
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id != null) await chrome.tabs.remove(tab.id);
  } catch (err) {
    console.warn(`${LOG_PREFIX} could not close onboarding tab:`, err);
  }
}

/* ---------------------------------------------------------------------
 * Chrome-version-aware guide content
 * ------------------------------------------------------------------- */
function getChromeMajorVersion() {
  const match = navigator.userAgent.match(/Chrome\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/* ---------------------------------------------------------------------
 * Locator diagrams — these are NOT screenshots of chrome://extensions
 * (that page is Chrome's own UI, not ours, and screenshots would go
 * stale the moment Chrome moves something). Instead these are flat
 * schematics, in our own tokens, that show roughly WHERE each toggle
 * lives — a shape and a position, not a pixel-accurate replica. Marked
 * "Illustrative" in the caption for exactly that reason.
 * ------------------------------------------------------------------- */
function devModeDiagramSVG() {
  return `
  <svg class="step-diagram-svg" viewBox="0 0 400 84" xmlns="http://www.w3.org/2000/svg"
       role="img" aria-label="Schematic of the chrome://extensions page with the Developer mode switch highlighted in the top-right corner">
    <rect x="1" y="1" width="398" height="82" rx="6" fill="var(--paper-hi)" stroke="var(--rule-strong)"/>
    <text x="14" y="24" font-family="var(--mono)" font-size="11" fill="var(--ink-faint)">chrome://extensions</text>
    <line x1="0" y1="34" x2="400" y2="34" stroke="var(--rule)"/>
    <text x="234" y="60" font-family="var(--sans)" font-size="12" font-weight="700" fill="var(--ink)" text-anchor="end">Developer mode</text>
    <rect x="240" y="42" width="60" height="32" rx="8" fill="none" stroke="var(--amber)" stroke-width="2"/>
    <rect x="248" y="48" width="34" height="18" rx="9" fill="var(--rule)"/>
    <circle cx="257" cy="57" r="7" fill="var(--ink-soft)"/>
  </svg>`;
}

function allowUserScriptsDiagramSVG() {
  return `
  <svg class="step-diagram-svg" viewBox="0 0 400 118" xmlns="http://www.w3.org/2000/svg"
       role="img" aria-label="Schematic of the SeenDisJob extension card with Details open and Allow User Scripts highlighted">
    <rect x="1" y="1" width="398" height="116" rx="6" fill="var(--paper-hi)" stroke="var(--rule-strong)"/>
    <rect x="14" y="14" width="20" height="20" rx="4" fill="var(--ink)"/>
    <text x="42" y="29" font-family="var(--sans)" font-size="13" font-weight="700" fill="var(--ink)">SeenDisJob</text>
    <rect x="330" y="12" width="58" height="22" rx="4" fill="none" stroke="var(--rule-strong)"/>
    <text x="359" y="27" font-family="var(--sans)" font-size="10.5" fill="var(--ink-soft)" text-anchor="middle">Details</text>
    <line x1="0" y1="46" x2="400" y2="46" stroke="var(--rule)"/>
    <text x="234" y="82" font-family="var(--sans)" font-size="12" font-weight="700" fill="var(--ink)" text-anchor="end">Allow User Scripts</text>
    <rect x="240" y="64" width="60" height="32" rx="8" fill="none" stroke="var(--amber)" stroke-width="2"/>
    <rect x="248" y="70" width="34" height="18" rx="9" fill="var(--rule)"/>
    <circle cx="257" cy="79" r="7" fill="var(--ink-soft)"/>
  </svg>`;
}

function renderGuideSteps() {
  const version = getChromeMajorVersion();
  // Unknown version (non-Chromium browser, or a UA string shape change) —
  // show both steps rather than guess wrong; harmless if the second one
  // turns out not to apply.
  const showSeparateToggle = version === null || version >= 138;

  const steps = [
    {
      text: `Turn on <b>Developer mode</b> (top-right switch on the
       <code>chrome://extensions</code> page) — required to load an unpacked
       extension at all, on any Chrome version.`,
      diagram: devModeDiagramSVG(),
    },
  ];
  if (showSeparateToggle) {
    steps.push({
      text: `Find <b>SeenDisJob</b> in the list, click <b>Details</b>,
       and turn on <b>Allow User Scripts</b>. This is a separate switch
       Chrome added in version 138 specifically for this API — Developer
       mode alone isn't enough anymore on your version.`,
      diagram: allowUserScriptsDiagramSVG(),
    });
  }

  guideSteps.innerHTML = steps
    .map((step, i) => `
      <div class="step">
        <div class="step-num">${i + 1}</div>
        <div class="step-body">
          <p>${step.text}</p>
          <div class="step-diagram">
            ${step.diagram}
            <p class="step-diagram-caption">Illustrative — the exact position can shift slightly between Chrome versions.</p>
          </div>
        </div>
      </div>`)
    .join('');
}

/* ---------------------------------------------------------------------
 * Pin-state detection — chrome.action.getUserSettings() (Chrome 91+)
 * exposes isOnToolbar directly, so we don't have to take the user's word
 * for it. Falls back to the manual "I've pinned it" confirmation (below)
 * on older Chrome versions where this API, or isOnToolbar specifically,
 * isn't available — detection failing open to the manual step, not
 * silently skipping it.
 * ------------------------------------------------------------------- */
async function isAlreadyPinned() {
  if (!chrome.action?.getUserSettings) return false;
  try {
    const settings = await chrome.action.getUserSettings();
    return settings?.isOnToolbar === true;
  } catch (err) {
    console.debug(`${LOG_PREFIX} could not read pin state:`, err);
    return false;
  }
}

function completePinStep() {
  pinStep.classList.add('hidden');
  btnCloseGuide.classList.remove('hidden');
}

// If the browser can tell us pinning already happened, react live —
// still purely additive: the manual btn-pin-confirm handler below is
// untouched and remains the fallback path.
if (chrome.action?.onUserSettingsChanged) {
  chrome.action.onUserSettingsChanged.addListener((settings) => {
    if (settings?.isOnToolbar && !pinStep.classList.contains('hidden')) {
      completePinStep();
    }
  });
}


async function probeUserScriptsEnabled() {
  try {
    await chrome.userScripts.getScripts(); // throws if the toggle is still off
    return true;
  } catch (err) {
    // Expected/routine while the user hasn't flipped the toggle yet —
    // logged at debug level so it doesn't look like a real failure, but
    // still visible if someone's actually digging through devtools.
    console.debug(`${LOG_PREFIX} userScripts not enabled yet:`, err);
    return false;
  }
}

async function handleCheckAgain() {
  const originalLabel = btnCheckAgain.textContent;
  btnCheckAgain.disabled = true;
  btnCheckAgain.textContent = 'Checking…';

  let enabled;
  try {
    enabled = await probeUserScriptsEnabled();
  } finally {
    btnCheckAgain.disabled = false;
    btnCheckAgain.textContent = originalLabel;
  }

  guideStatus.classList.add('show');
  if (enabled) {
    guideStatus.className = 'status show ok';
    guideStatus.textContent = "You're set — the extension can inject its detector now.";
    railPermissions.dataset.state = 'done';
    // Detection works either way — pinning is just for easy access to the
    // popup/dashboard. If the browser reports it's already pinned, skip
    // straight to done instead of asking the user to confirm it again.
    if (await isAlreadyPinned()) {
      completePinStep();
    } else {
      pinStep.classList.remove('hidden');
    }
  } else {
    guideStatus.className = 'status show pending';
    guideStatus.textContent = 'Not yet — still waiting on the toggle above.';
  }
}

/* ---------------------------------------------------------------------
 * "Open chrome://extensions" — extensions can't always navigate to
 * chrome:// URLs; this hasn't been empirically verified against a live
 * install, so a failure here falls back to copying the address instead
 * of leaving the button looking broken.
 * ------------------------------------------------------------------- */
async function openExtensionsPage() {
  const url = `chrome://extensions/?id=${chrome.runtime.id}`;
  try {
    await chrome.tabs.create({ url });
  } catch (err) {
    console.warn(`${LOG_PREFIX} could not open chrome://extensions directly:`, err);
    guideStatus.classList.add('show', 'pending');
    try {
      await navigator.clipboard.writeText(url);
      guideStatus.textContent = 'Chrome blocked opening that page directly — copied the address instead, paste it into a new tab.';
    } catch (clipboardErr) {
      console.warn(`${LOG_PREFIX} clipboard write also failed:`, clipboardErr);
      guideStatus.textContent = `Open this manually: ${url}`;
    }
  }
}

/* ---------------------------------------------------------------------
 * Wiring
 * ------------------------------------------------------------------- */
document.getElementById('btn-consent-yes').addEventListener('click', async () => {
  clearConsentError();
  try {
    await chrome.storage.local.set({ [CONSENT_KEY]: true });
  } catch (err) {
    console.warn(`${LOG_PREFIX} failed to write consent flag:`, err);
    showConsentError("Couldn't save that — check your connection and try again.");
    return; // stay on this screen rather than advance on an unsaved choice
  }
  railConsent.dataset.state = 'done';
  railPermissions.dataset.state = 'active';
  renderGuideSteps();
  showScreen(screenGuide);
});

document.getElementById('btn-consent-no').addEventListener('click', async () => {
  clearConsentError();
  try {
    await chrome.storage.local.set({ [CONSENT_KEY]: false });
  } catch (err) {
    console.warn(`${LOG_PREFIX} failed to write consent flag:`, err);
    showConsentError("Couldn't save that — check your connection and try again.");
    return;
  }
  railConsent.dataset.state = 'done';
  showScreen(screenDeclined);
});

// "Change your mind" — the declined screen used to be a dead end that
// told the user to reinstall the extension. This just re-shows the
// consent screen; clicking "Allow content checks" there writes the flag
// the normal way, same as the first run.
btnReconsider.addEventListener('click', () => {
  clearConsentError();
  railConsent.dataset.state = 'active';
  showScreen(screenConsent);
});

document.getElementById('btn-close-1').addEventListener('click', closeThisTab);
document.getElementById('btn-close-2').addEventListener('click', closeThisTab);
document.getElementById('btn-open-extensions').addEventListener('click', openExtensionsPage);
btnCheckAgain.addEventListener('click', handleCheckAgain);

/* ---------------------------------------------------------------------
 * Auto-recheck on return — most users flip the toggle on
 * chrome://extensions in another tab, then come back here rather than
 * clicking "Check again" themselves. Re-probe automatically once, when
 * this tab regains visibility/focus, but only while still waiting
 * (guide screen showing, pin step not yet revealed) and only if a probe
 * isn't already running — this is purely additive, the manual button
 * above still works exactly as before.
 * ------------------------------------------------------------------- */
let autoProbeInFlight = false;
async function maybeAutoRecheck() {
  const stillWaiting = !screenGuide.classList.contains('hidden')
    && pinStep.classList.contains('hidden');
  if (!stillWaiting || autoProbeInFlight) return;
  autoProbeInFlight = true;
  try {
    await handleCheckAgain();
  } finally {
    autoProbeInFlight = false;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') maybeAutoRecheck();
});
window.addEventListener('focus', maybeAutoRecheck);

// Pinning can't be automated (no Chrome API grants or simulates it) — this
// only records that the user says they've done it manually, then reveals
// the final close button. Onboarding is otherwise already functionally
// complete at this point (userScripts is confirmed enabled). Kept as the
// fallback path for browsers where isAlreadyPinned() can't detect it.
btnPinConfirm.addEventListener('click', completePinStep);