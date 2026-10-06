import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAcousticPhonetics, decodeUtterance, buildLexicon } from '../src/lib/decoder.js';
import fs from 'node:fs';

const dictionary = JSON.parse(fs.readFileSync('dictionary.json', 'utf-8'));
const crossRef = JSON.parse(fs.readFileSync('cross_reference.json', 'utf-8'));
const rules = JSON.parse(fs.readFileSync('grammar_rulebook.json', 'utf-8'));
const training = JSON.parse(fs.readFileSync('training_data.json', 'utf-8'));

const lexicon = buildLexicon(dictionary, crossRef);

test('Severe Speech Translation: "Hey I wah out Tobah go ask dussin more Tobah"', () => {
  const input = "Hey I wah out Tobah go ask dussin more Tobah";
  const decoded = resolveAcousticPhonetics(input, { lexicon, rules, trainingData: training });
  assert.match(decoded.decoded.toLowerCase(), /toilet paper/i, "Must translate Tobah to toilet paper");
  assert.match(decoded.decoded.toLowerCase(), /ran out/i, "Must translate wah out to ran out");
  assert.match(decoded.decoded.toLowerCase(), /dustin/i, "Must translate dussin to Dustin in context");
});

test('Severe Speech Translation: "Watubah! I\'m nass a love you mom"', () => {
  const input = "Watubah! I'm nass a love you mom";
  const decoded = resolveAcousticPhonetics(input, { lexicon, rules, trainingData: training });
  assert.match(decoded.decoded.toLowerCase(), /want talk about/i, "Must translate Watubah to want talk about");
  assert.match(decoded.decoded.toLowerCase(), /love you mom/i, "Must preserve love you mom");
});

test('Severe Speech Translation: "Wakabah to you."', () => {
  const input = "Wakabah to you.";
  const decoded = resolveAcousticPhonetics(input, { lexicon, rules, trainingData: training });
  assert.match(decoded.decoded.toLowerCase(), /wan(?:t)? talk to you/i, "Must translate Wakabah to want talk to");
});

test('Severe Speech Translation: "Am I a black?"', () => {
  const input = "Am I a black?";
  const decoded = resolveAcousticPhonetics(input, { lexicon, rules, trainingData: training });
  assert.match(decoded.decoded.toLowerCase(), /i like mower, black/i, "Must translate Am I a black to mower phrase");
});

test('Severe Speech Translation: "Mmhmm. I feel mad bad caskon"', () => {
  const input = "Mmhmm. I feel mad bad caskon";
  const decoded = resolveAcousticPhonetics(input, { lexicon, rules, trainingData: training });
  assert.match(decoded.decoded.toLowerCase(), /black cat's gone/i, "Must translate bad caskon to black cat's gone");
});

test('Severe Speech Translation: "Cassin mya blackwet cats"', () => {
  const input = "Cassin mya blackwet cats";
  const decoded = resolveAcousticPhonetics(input, { lexicon, rules, trainingData: training });
  assert.match(decoded.decoded.toLowerCase(), /cat my black white cat/i, "Must translate Cassin mya blackwet to Cat my black white cat");
});

test('Severe Speech Translation: "Mm.I see you some"', () => {
  const input = "Mm.I see you some";
  const decoded = resolveAcousticPhonetics(input, { lexicon, rules, trainingData: training });
  assert.match(decoded.decoded.toLowerCase(), /sing(?:, i like sing)? song/i, "Must translate see you some to sing song");
});

test('Severe Speech Translation: "Oh yeah best you ah I lost a job. That\'s what happen"', () => {
  const input = "Oh yeah best you ah I lost a job. That's what happen";
  const decoded = resolveAcousticPhonetics(input, { lexicon, rules, trainingData: training });
  assert.match(decoded.decoded.toLowerCase(), /go back to work/i, "Must translate best you ah to go back to work");
});
