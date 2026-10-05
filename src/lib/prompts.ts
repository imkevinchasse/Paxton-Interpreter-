/**
 * Every prompt the server sends to a language model lives here.
 *
 * Pure functions (no I/O) so the wording is unit tested and the interpreter, the cross-reference tester and
 * the dictionary tools all brief the model the same way.
 *
 * House rules for these prompts:
 *  - Say who the speaker is and what the output is for (an assistive voice: a confident wrong sentence is worse
 *    than asking him to confirm).
 *  - Rank the evidence: verified examples > verified dictionary > grammar rules > the model's own inference.
 *  - Show real examples from the user's own verified pairs instead of generic ones.
 *  - Pin the output shape and say what must never be invented.
 */

export interface PromptRule {
  ruleName: string;
  condition?: string;
  action?: string;
  hypothesis?: string;
}

export interface PromptEntry {
  word: string;
  definition: string;
}

export interface PromptPair {
  sound?: string;
  meaning?: string;
}

const clip = (s: unknown, max = 160) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const q = (s: unknown) => JSON.stringify(clip(s));

const pairLines = (pairs: PromptPair[], max: number) =>
  pairs
    .filter(p => p?.sound && p?.meaning)
    .slice(0, max)
    .map(p => `- ${q(p.sound)} -> ${q(p.meaning)}`)
    .join('\n');

// ─────────────────────────────────────────────────────────────
// Live interpretation
// ─────────────────────────────────────────────────────────────

export interface InterpreterPromptInput {
  /** What the speech recognizer heard. */
  heard: string;
  /** Output of the deterministic decode (dictionary phrases -> rules -> dictionary words). */
  draft: string;
  /** 0..1 share of the heard words the dictionary / rulebook explained. */
  coverage: number;
  /** Confirmed + enabled rules only. */
  rules: PromptRule[];
  /** Dictionary entries that actually matched this utterance. */
  entries: PromptEntry[];
  /** Verified pairs most similar to the utterance (best first), then general examples. */
  verifiedPairs: PromptPair[];
  /** Sentences he confirmed in the past that resemble this one. */
  pastConfirmations?: { heard?: string; confirmed?: string }[];
  /** Time of day etc. Optional flavour only. */
  timeOfDay?: string;
}

export function buildInterpreterPrompt(input: InterpreterPromptInput): string {
  const pct = Math.round(Math.min(1, Math.max(0, input.coverage)) * 100);

  const rules = input.rules.length
    ? input.rules
        .slice(0, 12)
        .map(r => `- ${clip(r.ruleName, 90)}: when ${clip(r.condition || 'see name', 140)} -> ${clip(r.action || 'apply the rule', 140)}`)
        .join('\n')
    : '- (none confirmed yet)';

  const entries = input.entries.length
    ? input.entries
        .slice(0, 12)
        .map(e => `- ${q(e.word)} = ${q(e.definition)}`)
        .join('\n')
    : '- (no dictionary entry matched this utterance)';

  const examples = pairLines(input.verifiedPairs, 6) || '- (none yet)';

  const past = (input.pastConfirmations || [])
    .filter(p => p?.heard && p?.confirmed)
    .slice(0, 3)
    .map(p => `- heard ${q(p.heard)} -> he confirmed ${q(p.confirmed)}`)
    .join('\n');

  return `You are the interpreter for Paxton, a child with atypical speech. A speech recognizer produced a rough phonetic transcript of what he said. Work out the sentence he MEANT so a voice can say it aloud for him.
A wrong sentence spoken with confidence is worse than asking him to confirm, so be honest about how sure you are.

HOW PAXTON SPEAKS (verified by his family; trust these over ordinary English):
${rules}

HIS VERIFIED WORDS AND PHRASES (a "/" separates alternative meanings; choose by context):
${entries}

VERIFIED EXAMPLES (spoken -> meant):
${examples}
${past ? `\nSENTENCES HE CONFIRMED BEFORE THAT RESEMBLE THIS ONE:\n${past}\n` : ''}
WHAT WAS HEARD: ${q(input.heard)}
DRAFT FROM HIS RULES AND DICTIONARY ONLY: ${q(input.draft)}
The draft explains ${pct}% of the words. Words it did not explain are unchanged and may still be atypical.${input.timeOfDay ? `\nTime of day: ${input.timeOfDay}.` : ''}

HOW TO DECIDE (in this order of authority):
1. A verified example that matches what was heard wins.
2. Keep every meaning from his verified words and phrases. Do not swap them for your own guess.
3. Apply his grammar rules. Keep a countable "a" (a cookie, a ball); drop or convert it only where a rule says so.
4. Only for words nothing above covers, infer from the sounds and the sentence. Prefer the simplest, most common thing a child would say.

RULES FOR YOUR ANSWER:
- Start from the draft and fix only what it left unexplained. Write natural, grammatical, first-person speech, as short as what he said.
- Never repeat the raw transcript as the answer. Never invent a request the sounds do not support (do not turn unclear sounds into "I need help").
- If two readings are genuinely possible, give them as separate candidates instead of blending them.

CONFIDENCE (a number from 0 to 1 that you estimate):
- 0.90 or more only when every unusual word is covered by verified examples, words or rules.
- 0.75 to 0.89 when exactly one word or link is inferred.
- Below 0.70 when you are mostly guessing.

Reply with JSON only, no other text:
{"candidates":[{"id":"A","text":"<best sentence>","probability":<0-1>},{"id":"B","text":"<alternative reading>","probability":<0-1>},{"id":"C","text":"<another reading, optional>","probability":<0-1>}],"confidence":<0-1>}`;
}

// ─────────────────────────────────────────────────────────────
// Grammar hypothesis engine
// ─────────────────────────────────────────────────────────────

export interface HypothesisPromptInput {
  patternName: string;
  patternKey: string;
  supported: { spoken: string; intended: string; note?: string }[];
  counter: { spoken: string; intended: string; note?: string }[];
}

export function buildHypothesisPrompt(input: HypothesisPromptInput): string {
  const lines = (list: HypothesisPromptInput['supported'], max: number) =>
    list.length
      ? list
          .slice(0, max)
          .map(e => `- ${q(e.spoken)} -> ${q(e.intended)}${e.note ? `  (${clip(e.note, 80)})` : ''}`)
          .join('\n')
      : '- (none)';

  return `You are a speech-language pathologist studying the speech of a child named Paxton, who has Down syndrome. You are writing one entry for the rulebook his interpreter app uses to decode him.

PATTERN UNDER TEST: ${input.patternName}  [${input.patternKey}]

EVIDENCE FROM PAXTON'S OWN VERIFIED PAIRS (what he said -> what he meant):
Pairs that follow the pattern (${input.supported.length}):
${lines(input.supported, 8)}
Pairs that contradict it or mark its boundary (${input.counter.length}):
${lines(input.counter, 6)}

Write the entry using ONLY this evidence. Do not claim anything about examples that are not listed above, and do not mention research or other children.
- "hypothesis": two or three plain sentences on what the pattern is and the likely phonological reason.
- "condition": when the rule applies AND when it must not (use the contradicting pairs for the boundary).
- "action": one short imperative sentence the interpreter can follow.
- "confidence": 0 to 1, how strongly these examples support the pattern. Lower it when there are few examples or any contradiction.

Reply with JSON only, no other text:
{"hypothesis":"...","condition":"...","action":"...","confidence":0.0}`;
}

// ─────────────────────────────────────────────────────────────
// Dictionary tools
// ─────────────────────────────────────────────────────────────

export function buildDictionaryBuildPrompt(sound: string, meaning: string): string {
  return `You are building a phonetic dictionary for Paxton, a child with atypical speech. Each entry maps something he SAYS to the standard English he MEANT, so an interpreter can look words up later.

HE SAID: ${q(sound)}
HE MEANT: ${q(meaning)}

Create an entry for every word or short multi-word chunk whose sound differs from the standard word.
- "word" must be copied exactly from what he said (one word, or consecutive words that blend together such as "nee hell"). Do not use words he did not say.
- "definition" is the standard English for that same stretch only, never the whole sentence unless the whole sentence is a fixed idiom.
- Skip words that are already standard and unchanged. Skip any entry whose word and definition are identical.
- Keep each entry as small as it can be; prefer single words, and add a chunk only when the words must be read together.
- If you are not sure what a stretch means, leave it out instead of guessing.

Example. He said "i nee a hell", meant "I need some help":
[{"word":"nee","definition":"need","context":"i nee a hell"},{"word":"hell","definition":"help","context":"i nee a hell"},{"word":"a hell","definition":"some help","context":"i nee a hell"}]

Reply with a JSON array only, no markdown or explanation:
[{"word":"...","definition":"...","context":${q(sound)}}]`;
}

export function buildDeconstructPrompt(spoken: string, meant: string, notes?: string): string {
  return `You are a computational linguist helping build an interpreter for Paxton, a child with atypical speech.

HE SAID: ${q(spoken)}
HE MEANT: ${q(meant)}
NOTES FROM HIS FAMILY: ${q(notes || 'none')}

Break the pair into reusable pieces:
1. "deconstructedWords": each spoken word that differs from standard English: {"phonetic","meaning","partOfSpeech","confidence"}. "phonetic" must be a word he actually said. Skip unchanged words.
2. "connectedWords": two- or three-word chunks that must be read together because sounds blend, drop or link (for example "a hell" -> "some help"): {"phoneticNgram","meaning","patternNote"}. "phoneticNgram" must be consecutive words he actually said.
3. "llmReasoning": two sentences at most naming the processes involved (for example final consonant deletion, an intrusive "a", /th/ stopping).
Use only what the pair and notes support. If a piece is uncertain, lower its confidence instead of dropping the evidence or inventing a meaning.

Reply with JSON only, no other text:
{"deconstructedWords":[{"phonetic":"","meaning":"","partOfSpeech":"","confidence":0.9}],"connectedWords":[{"phoneticNgram":"","meaning":"","patternNote":""}],"llmReasoning":""}`;
}
