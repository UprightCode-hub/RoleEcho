/**
 * FILE: content-scripts/matching.js
 * RoleEcho v1.3 — ported from the original Tampermonkey
 * userscript. Pure functions only — no Chrome APIs, no DOM, no storage.
 *
 * Loaded as a plain classic script (NOT an ES module) in two different
 * places: background.js via importScripts(), and inside the injected
 * USER_SCRIPT world alongside engine.js. Neither context supports
 * import/export syntax, so everything is exposed on one shared object,
 * globalThis.JDSMatching, instead.
 */

const JDSMatching = (() => {

const TITLE_ONLY_THRESHOLD = 0.85;
const COMPANY_MATCH_MIN = 0.55;
const TITLE_MATCH_MIN = 0.6;
const COMBINED_THRESHOLD = 0.75;
const COMPANY_WEIGHT = 0.4;
const TITLE_WEIGHT = 0.6;

const NOISE_PHRASES = [
  'remote', 'hybrid', 'onsite', 'on site', 'on-site', 'in office', 'in-office',
  'full time', 'full-time', 'part time', 'part-time', 'contract', 'contractor',
  'temporary', 'temp', 'internship', 'intern', 'w2', 'w-2', '1099',
  'urgent', 'urgently hiring', 'hiring now', 'apply now', 'new', 'sponsored',
  'work from home', 'wfh'
];

const COMPANY_SUFFIXES = new Set([
  'inc', 'incorporated', 'llc', 'ltd', 'limited', 'corp', 'corporation',
  'co', 'gmbh', 'plc', 'srl', 'sa', 'pty', 'pte', 'group', 'holdings', 'companies'
]);

const CONFIDENTIAL_COMPANY_PATTERNS = [
  /\bconfidential\b/, /\bundisclosed\b/, /\bstealth\b/, /\banonymous\b/,
  /\bname withheld\b/, /\bour client\b/, /\bclient confidential\b/,
  /\bprivate company\b/, /\bcompany withheld\b/, /\bfinancial tech firm\b/
];

function isConfidentialCompany(normCompany) {
  return CONFIDENTIAL_COMPANY_PATTERNS.some(re => re.test(normCompany));
}

const TITLE_ABBREVIATIONS = {
  sr: 'senior', jr: 'junior', fe: 'frontend', be: 'backend',
  swe: 'software engineer', sde: 'software development engineer',
  eng: 'engineer', engr: 'engineer', dev: 'developer', devs: 'developers',
  mgr: 'manager', ux: 'user experience', ui: 'user interface',
  qa: 'quality assurance', hr: 'human resources', ops: 'operations',
  mle: 'machine learning engineer', ml: 'machine learning', ai: 'artificial intelligence',
  mktg: 'marketing', coord: 'coordinator', assoc: 'associate', exec: 'executive',
  vp: 'vice president', cto: 'chief technology officer', ceo: 'chief executive officer',
  cfo: 'chief financial officer'
};

function stripEmojis(str) {
  return str.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expandAbbreviations(s) {
  for (const abbr in TITLE_ABBREVIATIONS) {
    const re = new RegExp('\\b' + abbr + '\\b', 'g');
    s = s.replace(re, TITLE_ABBREVIATIONS[abbr]);
  }
  return s;
}

function normalizeCompany(raw) {
  let s = stripEmojis(raw || '').toLowerCase();
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  s = s.replace(/^\s*the\s+/, '');
  const words = s.split(/\s+/).filter(w => w && !COMPANY_SUFFIXES.has(w));
  return words.join(' ').trim();
}

function normalizeTitle(raw) {
  let s = stripEmojis(raw || '').toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  s = s.replace(/[^\p{L}\p{N}\s-]/gu, ' ');
  s = s.replace(/(\s|^)-+/g, ' ').replace(/-+(\s|$)/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = expandAbbreviations(s);
  for (const phrase of NOISE_PHRASES) {
    const re = new RegExp('\\b' + escapeRegex(phrase) + '\\b', 'g');
    s = s.replace(re, ' ');
  }
  return s.replace(/\s+/g, ' ').trim();
}

function isReqCodeToken(w) {
  return /^\d{4,}$/.test(w) || /^[a-z]{1,5}\d{3,8}$/.test(w);
}

function tokenize(s) {
  return new Set(s.split(' ').filter(w => w.length > 1 && !isReqCodeToken(w)));
}

function jaccard(setA, setB) {
  if (!setA.size && !setB.size) return 1;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function containment(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  return intersection / Math.min(setA.size, setB.size);
}

function bestSimilarity(setA, setB) {
  return Math.max(jaccard(setA, setB), containment(setA, setB));
}

return {
  TITLE_ONLY_THRESHOLD, COMPANY_MATCH_MIN, TITLE_MATCH_MIN,
  COMBINED_THRESHOLD, COMPANY_WEIGHT, TITLE_WEIGHT,
  isConfidentialCompany, stripEmojis, escapeRegex, expandAbbreviations,
  normalizeCompany, normalizeTitle, isReqCodeToken, tokenize,
  jaccard, containment, bestSimilarity
};

})();

if (typeof globalThis !== 'undefined') globalThis.JDSMatching = JDSMatching;
