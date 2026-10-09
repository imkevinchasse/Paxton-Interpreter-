import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDraftToCandidates,
  applyGrammarRules,
  buildLexicon,
  decodeUtterance,
  evaluatePattern,
  evidenceCeiling,
  fallbackConfidence,
  findExactPair,
  findRelatedPairs,
  honorsEntry,
  introducedWords,
  lexKey,
  primaryMeaning,
  routeConfidence,
  sanitizeCandidates,
  summarizeUsage,
  tokenize,
  resolveAcousticPhonetics,
  type GrammarRuleLike
} from '../src/lib/decoder';

const rule = (over: Partial<GrammarRuleLike> & { id: string; ruleName: string }): GrammarRuleLike => ({
  status: 'confirmed',
  enabled: true,
  ...over
});

const SEED_RULES: GrammarRuleLike[] = [
  rule({ id: 'coda', ruleName: 'Terminal /d/ & /t/ Alveolar Plosive Deletion (Coda Truncation)', patternType: 'consonant_deletion' }),
  rule({ id: 'art', ruleName: "Intrusive Indefinite Article 'a' before Mass Nouns & Verbal Predicates", patternType: 'intrusive_article' }),
  rule({ id: 'bam', ruleName: "Medial Cluster Reduction in Compound Entities ('ba-man' -> 'Batman')", patternType: 'word_merging' }),
  rule({ id: 'th', ruleName: "Interdental Fricative Stopping ('dis / dat' -> 'this / that')", patternType: 'consonant_deletion' }),
  rule({ id: 'dus', ruleName: "Negative Auxiliary Contraction Reduction ('dussin' -> 'doesn't')", patternType: 'word_merging' })
];

const DICT = [
  { word: 'i nee a hell', definition: 'I need some help', type: 'phrase' },
  { word: 'wa is dis', definition: 'what is this', type: 'phrase' },
  { word: 'dussin', definition: "doesn't", type: 'word' },
  { word: 'wa', definition: 'what / water', type: 'word' },
  { word: 'yeyo', definition: 'yellow', type: 'word' },
  { word: 'gimme', definition: 'give me', type: 'word' },
  { word: 'dat', definition: 'that', type: 'word' },
  { word: 'nee', definition: 'need', type: 'word' }
];

const decode = (text: string, rules = SEED_RULES, dict: any[] = DICT, xref: any[] = []) =>
  decodeUtterance(text, { lexicon: buildLexicon(dict, xref), rules });

test('exact dictionary phrase wins and is not re-mangled by grammar rules', () => {
  const r = decode('i nee a hell');
  assert.equal(r.decoded, 'I need some help');
  assert.equal(r.coverage, 1);
});

test('phrase entry still applies when a grammar rule would have rewritten the text first', () => {
  // old pipeline ran rules first, so the phrase "i nee a hell" could never match afterwards
  const r = decode('i nee a hell wit dis');
  assert.equal(r.decoded, 'I need some help wit this');
});

test('correct English "a" is left alone', () => {
  assert.equal(decode('i need a drink').decoded, 'I need a drink');
  assert.equal(decode('i want a cookie').decoded, 'I want a cookie');
});

test('intrusive "a" is repaired with the right verb form', () => {
  assert.equal(decode('i wan a play').decoded, 'I want to play');
  assert.equal(decode('go a sleep').decoded, 'Go to sleep');
  assert.equal(decode('he nee a hell').decoded, 'He need some help');
});

test('ambiguous definitions are never spoken literally', () => {
  assert.equal(primaryMeaning('what / water'), 'what');
  assert.equal(decode('wa').decoded, 'What');
});

test('substring false positives are gone ("nee" must not hit "knee")', () => {
  assert.equal(decode('my knee hurts', [], DICT).decoded, 'My knee hurts');
  assert.equal(decode('my knee hurts', SEED_RULES, DICT).decoded, 'My knee hurts');
});

test('hyphenated words and trailing punctuation survive', () => {
  assert.equal(decode('ba-man movie').decoded, 'Batman movie');
  assert.equal(decode('wa is dis?').decoded, 'What is this?');
});

test('replacement text containing $ is inserted literally', () => {
  const lex = buildLexicon([{ word: 'money', definition: '$5 and $& more' }], []);
  const r = decodeUtterance('money please', { lexicon: lex, rules: [] });
  assert.equal(r.decoded, '$5 and $& more please');
});

test('output of a dictionary replacement is not translated a second time', () => {
  const lex = buildLexicon(
    [
      { word: 'hell', definition: 'help' },
      { word: 'help', definition: 'assistance' }
    ],
    []
  );
  assert.equal(decodeUtterance('hell', { lexicon: lex, rules: [] }).decoded, 'Help');
});

test('dictionary beats cross-reference; pending cross-reference entries are ignored', () => {
  const lex = buildLexicon(
    [{ word: 'dat', definition: 'that one' }],
    [
      { phonetic: 'dat', meaning: 'OLD', inDictionary: true, approved: true },
      { phonetic: 'pending', meaning: 'nope', inDictionary: false, approved: true },
      { phonetic: 'rejected', meaning: 'nope', inDictionary: true, approved: false },
      { phonetic: 'extra', meaning: 'synced', inDictionary: true, approved: true }
    ]
  );
  const m = new Map(lex.map(e => [lexKey(e.word), e.definition]));
  assert.equal(m.get('dat'), 'that one');
  assert.equal(m.has('pending'), false);
  assert.equal(m.has('rejected'), false);
  assert.equal(m.get('extra'), 'synced');
});

test('entries with missing words do not crash lexicon building', () => {
  assert.doesNotThrow(() => buildLexicon([{ definition: 'x' }, { word: null, definition: 'y' }, null as any], [{}, null as any]));
});

test('data-driven (user taught) rules apply, but only when confirmed and enabled', () => {
  const custom = rule({ id: 'u1', ruleName: 'User fix', patternType: 'custom', match: 'yeyo car', replacement: 'yellow car' });
  assert.equal(applyGrammarRules('see yeyo car now', [custom]).text, 'see yellow car now');
  assert.equal(applyGrammarRules('see yeyo car now', [{ ...custom, status: 'testing' }]).text, 'see yeyo car now');
  assert.equal(applyGrammarRules('see yeyo car now', [{ ...custom, enabled: false }]).text, 'see yeyo car now');
  assert.equal(applyGrammarRules('see yeyo carpet', [custom]).text, 'see yeyo carpet');
});

test('each seeded rule reports itself instead of the first consonant rule swallowing the rest', () => {
  const r = applyGrammarRules('dis dussin work nee', SEED_RULES);
  const ids = r.applied.map(a => a.ruleId).sort();
  assert.deepEqual(ids, ['coda', 'dus', 'th']);
  assert.equal(r.text, "this doesn't work need");
});

test('coverage reflects how much of the utterance is actually explained', () => {
  assert.equal(decode('wa is dis').coverage, 1);
  const partial = decode('i nee a hell zzz');
  assert.ok(partial.coverage > 0.5 && partial.coverage < 1, `coverage ${partial.coverage}`);
  assert.equal(decode('completely unknown words', SEED_RULES, []).coverage, 0);
});

test('confidence: unsupported guesses can never reach auto-speak', () => {
  assert.ok(evidenceCeiling(0) < 0.88);
  assert.ok(evidenceCeiling(1) >= 0.88);
  assert.ok(fallbackConfidence(1) >= 0.88);
  assert.ok(fallbackConfidence(0.5) < 0.88);
});

test('routing is consistent with the configured threshold', () => {
  assert.equal(routeConfidence(0.5, 0.78), 'clarification');
  assert.equal(routeConfidence(0.8, 0.78), 'choice');
  assert.equal(routeConfidence(0.9, 0.78), 'auto');
  assert.equal(routeConfidence(0.9, 0.95), 'clarification');
  assert.equal(routeConfidence(0.96, 0.95), 'auto');
});

test('training pair lookup is word based, not substring based', () => {
  const pairs = [
    { sound: 'a', meaning: 'x' },
    { sound: 'i nee a hell', meaning: 'I need some help' },
    { sound: 'dussin work', meaning: "doesn't work" }
  ];
  assert.equal(findExactPair('I Nee A Hell!', pairs)?.meaning, 'I need some help');
  assert.equal(findExactPair('nee a', pairs), undefined);
  const related = findRelatedPairs('mom i nee a hell now', pairs);
  assert.deepEqual(related.map(p => p.sound), ['i nee a hell']);
  assert.deepEqual(findRelatedPairs('banana', pairs), []);
});

test('candidate cleanup drops blanks / duplicates and re-ids', () => {
  const c = sanitizeCandidates([
    { id: 'X', text: 'I need help', probability: 0.9 },
    { id: 'X', text: 'i need help', probability: 0.5 },
    { id: 'Q', text: '   ', probability: 0.2 },
    { id: 'Z', text: 'I want help', probability: 0.9 }
  ]);
  assert.deepEqual(c.map(x => x.id), ['A', 'B']);
  assert.ok(c.reduce((a, x) => a + x.probability, 0) <= 1.0001);
});

test('tokenizer keeps punctuation out of the match key', () => {
  assert.equal(lexKey('  Wa  is   DIS?! '), 'wa is dis');
  assert.equal(tokenize("don't").length, 1);
});

test('pattern evidence only comes from real pairs (nothing is invented)', () => {
  for (const key of ['intrusive_a', 'coda_deletion', 'th_stopping', 'dussin', 'baman']) {
    const e = evaluatePattern(key, []);
    assert.equal(e.supported.length + e.counter.length, 0, key);
  }
  const unrelated = evaluatePattern('coda_deletion', [{ sound: 'hello there', meaning: 'hello there' }]);
  assert.equal(unrelated.supported.length + unrelated.counter.length, 0);
});

test('pattern evidence is scored per pattern, not per pattern type', () => {
  // "dat" is evidence for th_stopping only; "nee" for coda_deletion only.
  const dat = [{ sound: 'gimme dat', meaning: 'give me that' }];
  assert.equal(evaluatePattern('th_stopping', dat).supported.length, 1);
  assert.equal(evaluatePattern('coda_deletion', dat).supported.length, 0);
  const nee = [{ sound: 'i nee dat', meaning: 'I need that' }];
  assert.equal(evaluatePattern('coda_deletion', nee).supported.length, 1);
});

test('pattern evidence counts contradicting pairs as counter-examples', () => {
  // The dussin rule always outputs "doesn't", so an intended "don't" counts against it.
  const e = evaluatePattern('dussin', [
    { sound: 'dussin work', meaning: "doesn't work" },
    { sound: 'no no no dussin want', meaning: "no, I don't want that" }
  ]);
  assert.equal(e.supported.length, 1);
  assert.deepEqual(e.counter.map(c => c.spoken), ['no no no dussin want']);
  // Intrusive "a": keeping "a help" is a counter-example, a preserved countable "a" is support.
  assert.equal(evaluatePattern('intrusive_a', [{ sound: 'i nee a hell', meaning: 'I need a help' }]).counter.length, 1);
  assert.equal(evaluatePattern('intrusive_a', [{ sound: 'i wan a cookie', meaning: 'I want a cookie' }]).supported.length, 1);
});

test('a match/replacement rule does what it says and ignores its type dropdown', () => {
  const custom = rule({
    id: 'c1',
    ruleName: 'Bwoo is blue',
    patternType: 'consonant_deletion', // legacy default of the add-rule form; must not trigger nee/hell/dis/dat
    match: 'bwoo',
    replacement: 'blue'
  });
  assert.equal(applyGrammarRules('bwoo dis nee', [custom]).text, 'blue dis nee');
  assert.equal(applyGrammarRules('bwoo', [{ ...custom, enabled: false }]).text, 'bwoo');
});

test('a model answer that keeps verified meanings stays on top and the draft is still offered', () => {
  const matched = [{ word: 'nee', definition: 'need' }, { word: 'dat', definition: 'that' }];
  const model = sanitizeCandidates([{ text: 'I need that please', probability: 0.8 }]);
  const out = applyDraftToCandidates(model, 'I need that', matched, 0.6);
  assert.equal(out.candidates[0].text, 'I need that please');
  assert.equal(out.draftLeads, false);
  assert.deepEqual(out.violated, []);
  assert.ok(out.candidates.some(c => c.text === 'I need that'), 'draft must always be a candidate');
});

test('a model answer that drops a verified meaning cannot stay on top', () => {
  const matched = [{ word: 'nee', definition: 'need' }, { word: 'dat', definition: 'that' }];
  const model = sanitizeCandidates([{ text: 'I want water', probability: 0.95 }, { text: 'Water please', probability: 0.03 }]);
  const out = applyDraftToCandidates(model, 'I need that', matched, 0.6);
  assert.equal(out.candidates[0].text, 'I need that');
  assert.equal(out.draftLeads, true);
  assert.deepEqual(out.violated, ['nee', 'dat']);
  assert.ok(out.candidates.length <= 3);
  assert.ok(out.candidates.every((c, i) => c.id === String.fromCharCode(65 + i)));
});

test('draft merging is a no-op when nothing was decoded', () => {
  const model = sanitizeCandidates([{ text: 'Hello', probability: 0.5 }]);
  assert.deepEqual(applyDraftToCandidates(model, 'hello', [], 0).candidates, model);
});

test('ambiguous entries are honoured by either of their meanings', () => {
  assert.equal(honorsEntry('I want water', { definition: 'what / water' }), true);
  assert.equal(honorsEntry('What is this', { definition: 'what / water' }), true);
  assert.equal(honorsEntry('I want juice', { definition: 'what / water' }), false);
  assert.equal(honorsEntry("Mom, give me that", { definition: 'Mom, give me that' }), true);
});

test('usage summary reports where an answer came from', () => {
  const lexicon = buildLexicon([{ word: 'nee', definition: 'need' }], []);
  const hit = decodeUtterance('i nee dat', { lexicon, rules: [] });
  const miss = decodeUtterance('hello there', { lexicon, rules: [] });
  assert.equal(summarizeUsage({ verifiedPair: true, llmUsed: false, decoded: hit }).source, 'verified_pair');
  assert.equal(summarizeUsage({ verifiedPair: false, llmUsed: false, decoded: hit }).source, 'dictionary_rules');
  assert.equal(summarizeUsage({ verifiedPair: false, llmUsed: true, decoded: hit }).source, 'llm_assisted');
  assert.equal(summarizeUsage({ verifiedPair: false, llmUsed: true, decoded: miss }).source, 'llm_only');
  assert.equal(summarizeUsage({ verifiedPair: false, llmUsed: false, decoded: miss }).source, 'unmatched');
  assert.equal(summarizeUsage({ verifiedPair: false, llmUsed: false, decoded: hit }).dictionaryEntriesUsed, 1);
});

test('a dictionary entry beats a built-in rule for the same word (editing the dictionary changes the output)', () => {
  const th = rule({ id: 'th', ruleName: 'Interdental fricative stopping', patternKey: 'th_stopping' });
  const coda = rule({ id: 'coda', ruleName: 'Terminal deletion', patternKey: 'coda_deletion' });
  const stock = buildLexicon([{ word: 'dat', definition: 'that' }, { word: 'nee', definition: 'need' }], []);
  const edited = buildLexicon([{ word: 'dat', definition: 'that one' }, { word: 'nee', definition: 'need' }], []);
  assert.equal(decodeUtterance('i nee dat', { lexicon: stock, rules: [th, coda] }).decoded, 'I need that');
  assert.equal(decodeUtterance('i nee dat', { lexicon: edited, rules: [th, coda] }).decoded, 'I need that one');
  // ...and the dictionary is reported as used, not hidden behind the rule.
  const used = decodeUtterance('i nee dat', { lexicon: stock, rules: [th, coda] });
  assert.deepEqual(used.matchedEntries.map(e => e.word).sort(), ['dat', 'nee']);
});

test('rules still handle what the dictionary does not define', () => {
  const th = rule({ id: 'th', ruleName: 'Interdental fricative stopping', patternKey: 'th_stopping' });
  const intrusive = rule({ id: 'a', ruleName: 'Intrusive article', patternKey: 'intrusive_a' });
  const lex = buildLexicon([{ word: 'nee', definition: 'need' }, { word: 'hell', definition: 'help' }], []);
  const out = decodeUtterance('he nee a hell dis', { lexicon: lex, rules: [th, intrusive] });
  assert.equal(out.decoded, 'He need some help this');
  assert.deepEqual(out.appliedRules.map(r => r.ruleId).sort(), ['a', 'th']);
});

test('words introduced by rules are reported, skipping little function words', () => {
  const r = applyGrammarRules('i nee a hell', [rule({ id: 'a', ruleName: 'Intrusive article', patternKey: 'intrusive_a' }), rule({ id: 'c', ruleName: 'Terminal deletion', patternKey: 'coda_deletion' })]);
  assert.deepEqual(introducedWords(r.applied), ['need', 'help']);
  assert.deepEqual(introducedWords([]), []);
});

test('a model answer that ignores what a rule produced loses the top slot', () => {
  const model = sanitizeCandidates([{ text: 'I want water', probability: 0.95 }]);
  const out = applyDraftToCandidates(model, 'I need that', [], 0.6, ['need', 'that']);
  assert.equal(out.candidates[0].text, 'I need that');
  assert.equal(out.draftLeads, true);
  assert.deepEqual(out.violated, ['need', 'that']);
  // harmless rephrasing that keeps the content words is fine
  const ok = sanitizeCandidates([{ text: 'I need that please', probability: 0.9 }]);
  assert.equal(applyDraftToCandidates(ok, 'I need that', [], 0.6, ['need', 'that']).draftLeads, false);
});

test('resolveAcousticPhonetics decodes atypical speech phrases without failing to echo raw input', () => {
  const result = resolveAcousticPhonetics('Iwa foo I hunry. No ha lunsh');
  assert.ok(result.decoded.toLowerCase().includes('want food'));
  assert.ok(result.decoded.toLowerCase().includes('hungry'));
  assert.ok(result.decoded.toLowerCase().includes('lunch'));
  // a sound-alike guess must never be confident enough to auto-speak
  assert.ok(result.confidence > 0.3 && result.confidence < 0.78);
  assert.ok(result.candidates.length >= 2);
  // Must NOT be the raw phonetic string
  assert.notEqual(result.decoded.toLowerCase(), 'iwa foo i hunry. no ha lunsh');
});

test('evaluatePattern supports dynamic custom pattern checks', () => {
  const customChecks = [
    { trigger: /\bfoo\b/i, expect: /\bfood\b/i, note: "'foo' -> 'food'" }
  ];
  const pairs = [
    { sound: 'iwa foo', meaning: 'I want food' },
    { sound: 'foo is goo', meaning: 'food is good' },
    { sound: 'foo bar', meaning: 'something else' }
  ];
  const ev = evaluatePattern('dyn_foo_food', pairs, customChecks);
  assert.equal(ev.supported.length, 2);
  assert.equal(ev.counter.length, 1);
});
