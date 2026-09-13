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
const LOG_PREFIX = '[RoleEcho]'; // matches background.js/engine.js's own warn prefix

const screenConsent = document.getElementById('screen-consent');
const screenDeclined = document.getElementById('screen-declined');
const screenGuide = document.getElementById('screen-guide');
const guideSteps = document.getElementById('guide-steps');
const guideStatus = document.getElementById('guide-status');
const btnCloseGuide = document.getElementById('btn-close-2');
const railConsent = document.getElementById('progress-consent');
const railPermissions = document.getElementById('progress-permissions');
const pinStep = document.getElementById('pin-step');
const btnPinConfirm = document.getElementById('btn-pin-confirm');

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

function renderGuideSteps() {
  const version = getChromeMajorVersion();
  // Unknown version (non-Chromium browser, or a UA string shape change) —
  // show both steps rather than guess wrong; harmless if the second one
  // turns out not to apply.
  const showSeparateToggle = version === null || version >= 138;

  const steps = [
    `Turn on <b>Developer mode</b> (top-right switch on the
     <code>chrome://extensions</code> page) — required to load an unpacked
     extension at all, on any Chrome version.`
  ];
  if (showSeparateToggle) {
    steps.push(
      `Find <b>RoleEcho</b> in the list, click <b>Details</b>,
       and turn on <b>Allow User Scripts</b>. This is a separate switch
       Chrome added in version 138 specifically for this API — Developer
       mode alone isn't enough anymore on your version.`
    );
  }

  guideSteps.innerHTML = steps
    .map((text, i) => `<div class="step"><div class="step-num">${i + 1}</div><p>${text}</p></div>`)
    .join('');
}

/* ---------------------------------------------------------------------
 * "Check again" — probe whether chrome.userScripts actually works yet
 * (per CONTEXT.md decision #4: detect via try/catch, don't assume version)
 * ------------------------------------------------------------------- */
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
  const enabled = await probeUserScriptsEnabled();
  guideStatus.classList.add('show');
  if (enabled) {
    guideStatus.className = 'status show ok';
    guideStatus.textContent = "You're set — the extension can inject its detector now.";
    railPermissions.dataset.state = 'done';
    // Detection works either way — pinning is just for easy access to the
    // popup/dashboard, so it's asked for here rather than gating anything.
    pinStep.classList.remove('hidden');
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
  try {
    await chrome.storage.local.set({ [CONSENT_KEY]: true });
  } catch (err) {
    console.warn(`${LOG_PREFIX} failed to write consent flag:`, err);
  }
  railConsent.dataset.state = 'done';
  railPermissions.dataset.state = 'active';
  renderGuideSteps();
  showScreen(screenGuide);
});

document.getElementById('btn-consent-no').addEventListener('click', async () => {
  try {
    await chrome.storage.local.set({ [CONSENT_KEY]: false });
  } catch (err) {
    console.warn(`${LOG_PREFIX} failed to write consent flag:`, err);
  }
  railConsent.dataset.state = 'done';
  showScreen(screenDeclined);
});

document.getElementById('btn-close-1').addEventListener('click', closeThisTab);
document.getElementById('btn-close-2').addEventListener('click', closeThisTab);
document.getElementById('btn-open-extensions').addEventListener('click', openExtensionsPage);
document.getElementById('btn-check-again').addEventListener('click', handleCheckAgain);

// Pinning can't be automated (no Chrome API grants or simulates it) — this
// only records that the user says they've done it manually, then reveals
// the final close button. Onboarding is otherwise already functionally
// complete at this point (userScripts is confirmed enabled).
btnPinConfirm.addEventListener('click', () => {
  pinStep.classList.add('hidden');
  btnCloseGuide.classList.remove('hidden');
});