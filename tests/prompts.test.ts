import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeconstructPrompt,
  buildDictionaryBuildPrompt,
  buildHypothesisPrompt,
  buildInterpreterPrompt
} from '../src/lib/prompts';

const base = {
  heard: 'i nee dat',
  draft: 'I need that',
  coverage: 0.67,
  rules: [{ ruleName: 'Coda deletion', condition: "'nee' where 'need' is required", action: "restore 'need'" }],
  entries: [{ word: 'dat', definition: 'that' }, { word: 'wa', definition: 'what / water' }],
  verifiedPairs: [{ sound: 'i nee a hell', meaning: 'I need some help' }]
};

test('interpreter prompt carries the heard text, the draft, the rules, the entries and real examples', () => {
  const p = buildInterpreterPrompt(base);
  assert.match(p, /WHAT WAS HEARD: "i nee dat"/);
  assert.match(p, /DRAFT FROM HIS RULES AND DICTIONARY ONLY: "I need that"/);
  assert.match(p, /explains 67% of the words/);
  assert.match(p, /Coda deletion: when 'nee' where 'need' is required -> restore 'need'/);
  assert.match(p, /"dat" = "that"/);
  assert.match(p, /"wa" = "what \/ water"/);
  assert.match(p, /"i nee a hell" -> "I need some help"/);
  assert.match(p, /Reply with JSON only/);
  assert.match(p, /"candidates"/);
});

test('interpreter prompt ranks evidence and forbids inventing requests', () => {
  const p = buildInterpreterPrompt(base);
  assert.ok(p.indexOf('verified example that matches') < p.indexOf('Keep every meaning from his verified words'));
  assert.ok(p.indexOf('Keep every meaning from his verified words') < p.indexOf('Apply his grammar rules'));
  assert.match(p, /Never repeat the raw transcript/);
  assert.match(p, /do not turn unclear sounds into "I need help"/);
});

test('interpreter prompt says so when nothing matched, and survives quotes and newlines in input', () => {
  const p = buildInterpreterPrompt({ ...base, heard: 'say "hi"\nthere', rules: [], entries: [], verifiedPairs: [], coverage: 0 });
  assert.match(p, /\(none confirmed yet\)/);
  assert.match(p, /no dictionary entry matched/);
  assert.match(p, /WHAT WAS HEARD: "say \\"hi\\" there"/);
  assert.match(p, /explains 0% of the words/);
});

test('interpreter prompt only shows past confirmations that have both halves', () => {
  const p = buildInterpreterPrompt({ ...base, pastConfirmations: [{ heard: 'gimme dat', confirmed: 'Give me that' }, { heard: 'x' }] });
  assert.match(p, /heard "gimme dat" -> he confirmed "Give me that"/);
  assert.doesNotMatch(p, /heard "x"/);
});

test('hypothesis prompt is grounded in the evidence it is given', () => {
  const p = buildHypothesisPrompt({
    patternName: 'Final consonant deletion',
    patternKey: 'coda_deletion',
    supported: [{ spoken: 'i nee dat', intended: 'I need that', note: "'nee' -> 'need'" }],
    counter: [{ spoken: 'hell no', intended: 'hell no' }]
  });
  assert.match(p, /PATTERN UNDER TEST: Final consonant deletion  \[coda_deletion\]/);
  assert.match(p, /follow the pattern \(1\)/);
  assert.match(p, /"i nee dat" -> "I need that"/);
  assert.match(p, /contradict it or mark its boundary \(1\)/);
  assert.match(p, /ONLY this evidence/);
  assert.match(p, /"hypothesis"/);
});

test('hypothesis prompt handles an empty side', () => {
  const p = buildHypothesisPrompt({ patternName: 'x', patternKey: 'k', supported: [], counter: [] });
  assert.match(p, /\(0\):\n- \(none\)/);
});

test('dictionary prompts demand grounded, minimal entries', () => {
  const d = buildDictionaryBuildPrompt('i nee a hell', 'I need some help');
  assert.match(d, /HE SAID: "i nee a hell"/);
  assert.match(d, /copied exactly from what he said/);
  assert.match(d, /leave it out instead of guessing/);
  const x = buildDeconstructPrompt('mom gimme dat', 'Mom, give me that', 'sounds blended');
  assert.match(x, /HE SAID: "mom gimme dat"/);
  assert.match(x, /NOTES FROM HIS FAMILY: "sounds blended"/);
  assert.match(buildDeconstructPrompt('a', 'b'), /NOTES FROM HIS FAMILY: "none"/);
});
