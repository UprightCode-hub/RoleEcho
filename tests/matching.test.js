const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'content-scripts', 'matching.js'),
  'utf8'
);
const context = { console, globalThis: {} };
vm.runInNewContext(source, context, { filename: 'matching.js' });
const matching = context.globalThis.JDSMatching;

assert.ok(matching, 'matching.js should expose JDSMatching');
assert.doesNotThrow(
  () => vm.runInNewContext(source, context, { filename: 'matching.js' }),
  'matching.js should be safe to evaluate again in the same USER_SCRIPT world'
);

assert.equal(
  matching.normalizeCompany('The Acme, Inc.'),
  'acme',
  'company normalization removes articles, punctuation, and suffixes'
);
assert.equal(
  matching.normalizeTitle('Sr. Software Eng. (Remote) - JP01017'),
  'senior software engineer jp01017',
  'title normalization expands abbreviations and removes noise'
);
assert.equal(
  matching.normalizeTitle('Project Manager - JP01017'),
  'project manager jp01017',
  'title normalization preserves useful requisition text'
);
assert.deepEqual(
  [...matching.tokenize('project manager jp01017')],
  ['project', 'manager'],
  'tokenization ignores requisition-code tokens'
);
assert.equal(
  matching.isConfidentialCompany('our client'),
  true,
  'confidential company patterns are recognized'
);
assert.equal(
  matching.isConfidentialCompany('Emmaculate Global'),
  false,
  'ordinary companies are not marked confidential'
);

const first = matching.tokenize('senior project manager');
const repost = matching.tokenize('project manager senior');
const unrelated = matching.tokenize('backend software engineer');
assert.equal(
  matching.bestSimilarity(first, repost),
  1,
  'word-order changes should still match perfectly'
);
assert.ok(
  matching.bestSimilarity(first, unrelated) < 0.5,
  'unrelated titles should remain dissimilar'
);

console.log('matching.test.js: all assertions passed');
