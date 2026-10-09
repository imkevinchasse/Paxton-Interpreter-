import test from 'node:test';
import assert from 'node:assert/strict';
import { guessUtterance, personalVocabFrom, soundDistance } from '../src/lib/phonetic.js';
import { resolveAcousticPhonetics, routeConfidence } from '../src/lib/decoder.js';

const lower = (s: string) => s.toLowerCase();

test('common speech-simplification processes are close in sound distance', () => {
  assert.ok(soundDistance('foo', 'food') < 0.5, 'final consonant deletion');
  assert.ok(soundDistance('hunry', 'hungry') < 0.5, 'cluster reduction');
  assert.ok(soundDistance('lunsh', 'lunch') < 0.5, 'sh for ch');
  assert.ok(soundDistance('wike', 'like') < 0.5, 'gliding');
  assert.ok(soundDistance('dis', 'this') < 0.5, 'stopping');
  assert.ok(soundDistance('foo', 'cat') > 1.5, 'unrelated words stay far apart');
});

test('guesses the first user phrase: Iwa foo I hunry. No ha lunsh', () => {
  const g = guessUtterance('Iwa foo I hunry. No ha lunsh');
  const t = lower(g.decoded);
  assert.ok(t.includes('want food'), t);
  assert.ok(t.includes('i am hungry'), t);
  assert.ok(t.includes('lunch'), t);
  assert.ok(g.confidence > 0 && g.confidence < 0.78);
});

test('guesses the second user phrase: Mah do guh. Booo awa nice boo. green boo', () => {
  // with only what he has verified before (his own words and meanings)
  const mine = personalVocabFrom(['Mom do good', 'book is a nice book', 'I want food']);
  const g = guessUtterance('Mah do guh. Booo awa nice boo. green boo', {
    personalWords: mine.words,
    personalBigrams: mine.bigrams
  });
  const t = lower(g.decoded);
  assert.ok(t.startsWith('mom do good'), t);
  assert.ok(t.includes('nice book'), t);
  assert.ok(t.includes('green book'), t);
  assert.ok(g.confidence < 0.78);
});

test('without any personal vocabulary the right words still appear among the options', () => {
  const g = guessUtterance('Mah do guh. Booo awa nice boo. green boo');
  const all = g.candidates.map(c => lower(c.text)).join(' | ');
  assert.ok(all.includes('mom'), all);
  assert.ok(all.includes('book'), all);
});

test('an unguessable utterance is not echoed back as an answer', () => {
  const g = guessUtterance('qzx zzz');
  assert.equal(g.confidence, 0);
  assert.deepEqual(g.candidates, []);
  const r = resolveAcousticPhonetics('qzx zzz');
  assert.equal(r.confidence, 0);
  assert.equal(r.decoded, 'qzx zzz');
});

test('already-standard speech is left alone', () => {
  const g = guessUtterance('I want water');
  assert.equal(g.changed, false);
  assert.equal(g.confidence, 0);
});

test('guessed answers always route to a confirmation question, never auto-speak', () => {
  for (const phrase of ['Iwa foo I hunry. No ha lunsh', 'Mah do guh. Booo awa nice boo. green boo', 'nee a hell']) {
    const r = resolveAcousticPhonetics(phrase);
    assert.notEqual(routeConfidence(r.confidence, 0.78), 'auto', phrase);
  }
});

test('words from his dictionary win over a sound-alike guess', () => {
  const r = resolveAcousticPhonetics('foo please', {
    lexicon: [{ word: 'foo', definition: 'football', id: 'x', kind: 'word' } as any]
  });
  assert.ok(lower(r.decoded).includes('football'), r.decoded);
});
