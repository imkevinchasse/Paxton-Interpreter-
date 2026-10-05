/**
 * Shared decoding logic for Paxton's speech.
 *
 * Pure functions only (no I/O, no globals) so the interpreter, the grammar
 * "test phrase" endpoint and the cross-reference tester all behave identically
 * and can be unit tested.
 *
 * Pipeline used by decodeUtterance():
 *   1. Multi-word dictionary phrases (exact, user-verified idioms) - longest match wins,
 *      and the matched span is protected from every later step.
 *   2. Single-word dictionary entries. A specific entry beats a general rule, so a word the user defined is
 *      never rewritten by a rule first (editing "dat" in the dictionary must change what is said).
 *   3. Grammar rulebook (confirmed + enabled rules only) on whatever the dictionary did not explain.
 */

export const AUTO_ACCEPT_CONFIDENCE = 0.88;
/** Best confidence we allow when nothing in the dictionary / rulebook / training data backs the answer. */
export const UNSUPPORTED_CONFIDENCE_CAP = 0.8;

// ─────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SENT_OPEN = '';
const SENT_CLOSE = '';
const SENT_RE = /(\d+)/g;

export interface Token {
  raw: string;
  lead: string;
  core: string;
  trail: string;
  /** lower-cased core with curly apostrophes normalised. Empty for punctuation-only / protected tokens. */
  norm: string;
}

export function tokenize(text: string): Token[] {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw): Token => {
      if (raw.includes(SENT_OPEN)) return { raw, lead: '', core: raw, trail: '', norm: '' };
      const m = raw.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su);
      const lead = m?.[1] ?? '';
      const core = m?.[2] ?? raw;
      const trail = m?.[3] ?? '';
      return { raw, lead, core, trail, norm: core.toLowerCase().replace(/[‘’]/g, "'") };
    });
}

/** Canonical form used to compare words / phrases: lower-case, punctuation-trimmed, single spaced. */
export function lexKey(text: unknown): string {
  if (typeof text !== 'string') return '';
  return tokenize(text)
    .map(t => t.norm)
    .filter(Boolean)
    .join(' ');
}

/** "what / water" -> "what". Ambiguous definitions must never be spoken literally. */
export function primaryMeaning(definition: string): string {
  const first = String(definition ?? '').split(/\s+\/\s+/)[0].trim();
  return first || String(definition ?? '').trim();
}

export function alternativeMeanings(definition: string): string[] {
  return String(definition ?? '')
    .split(/\s+\/\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(1);
}

/** Capitalise the sentence start and the pronoun "I". */
export function polish(text: string): string {
  let t = String(text ?? '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\bi\b/g, 'I');
  t = t.replace(/^([^\p{L}\p{N}]*)(\p{L})/u, (_m, a: string, b: string) => a + b.toUpperCase());
  return t;
}

// ─────────────────────────────────────────────────────────────
// Lexicon (dictionary) handling
// ─────────────────────────────────────────────────────────────

export interface LexiconEntry {
  word: string;
  definition: string;
  type?: string;
  source: 'dictionary' | 'cross_reference';
}

/**
 * Merge the active dictionary with cross-reference entries into one lexicon.
 *
 * - The dictionary is the source of truth. If a word exists in both places the dictionary wins,
 *   so editing a dictionary entry actually changes interpreter behaviour.
 * - Cross-reference entries only count when they are flagged inDictionary (synced) and not
 *   explicitly un-approved. Pending suggestions never leak into live interpretation.
 * - Within one source the first entry wins (lists are stored newest-first).
 */
export function buildLexicon(dictionary: any[], crossReference: any[]): LexiconEntry[] {
  const byKey = new Map<string, LexiconEntry>();

  for (const d of dictionary || []) {
    const key = lexKey(d?.word);
    const def = typeof d?.definition === 'string' ? d.definition.trim() : '';
    if (!key || !def || byKey.has(key)) continue;
    byKey.set(key, { word: String(d.word).trim(), definition: def, type: d.type, source: 'dictionary' });
  }

  for (const c of crossReference || []) {
    if (c?.inDictionary !== true || c?.approved === false) continue;
    const key = lexKey(c?.phonetic);
    const def = typeof c?.meaning === 'string' ? c.meaning.trim() : '';
    if (!key || !def || byKey.has(key)) continue;
    byKey.set(key, { word: String(c.phonetic).trim(), definition: def, type: c.type, source: 'cross_reference' });
  }

  return [...byKey.values()];
}

interface LexiconIndex {
  map: Map<string, LexiconEntry>;
  maxLen: number;
}

function buildIndex(lexicon: LexiconEntry[]): LexiconIndex {
  const map = new Map<string, LexiconEntry>();
  let maxLen = 1;
  for (const e of lexicon) {
    const key = lexKey(e.word);
    if (!key || map.has(key)) continue;
    map.set(key, e);
    maxLen = Math.max(maxLen, key.split(' ').length);
  }
  return { map, maxLen };
}

interface ScanResult {
  /** Output pieces in order; `entry` is set when the piece came from a dictionary hit. */
  pieces: { text: string; entry?: LexiconEntry; n: number }[];
  matched: LexiconEntry[];
  coveredTokens: number;
}

/** Greedy longest-match over token n-grams. Word-boundary safe by construction (works on tokens, not substrings). */
function scan(tokens: Token[], index: LexiconIndex, minN: number, maxN: number): ScanResult {
  const pieces: ScanResult['pieces'] = [];
  const matched: LexiconEntry[] = [];
  let coveredTokens = 0;
  let i = 0;

  while (i < tokens.length) {
    let hit: { entry: LexiconEntry; n: number } | null = null;
    const top = Math.min(maxN, index.maxLen, tokens.length - i);

    for (let n = top; n >= minN && !hit; n--) {
      const window = tokens.slice(i, i + n);
      if (window.some(t => !t.norm)) continue;
      const entry = index.map.get(window.map(t => t.norm).join(' '));
      if (entry) hit = { entry, n };
    }

    if (hit) {
      const first = tokens[i];
      const last = tokens[i + hit.n - 1];
      pieces.push({
        text: `${first.lead}${primaryMeaning(hit.entry.definition)}${last.trail}`,
        entry: hit.entry,
        n: hit.n
      });
      if (!matched.includes(hit.entry)) matched.push(hit.entry);
      coveredTokens += hit.n;
      i += hit.n;
    } else {
      pieces.push({ text: tokens[i].raw, n: 1 });
      i += 1;
    }
  }

  return { pieces, matched, coveredTokens };
}

// ─────────────────────────────────────────────────────────────
// Grammar rules
// ─────────────────────────────────────────────────────────────

export interface GrammarRuleLike {
  id: string;
  ruleName: string;
  patternType?: string;
  patternKey?: string;
  hypothesis?: string;
  action?: string;
  status?: string;
  enabled?: boolean;
  /** Data-driven rule: replace this spoken word/phrase ... */
  match?: string;
  /** ... with this meaning. */
  replacement?: string;
}

export interface AppliedRule {
  ruleId: string;
  ruleName: string;
  action: string;
  reason: string;
  before: string;
  after: string;
}

/** Replace a whole word / phrase (hyphen and apostrophe safe), never touching substrings of longer words. */
export function replacePhrase(text: string, match: string, replacement: string): string {
  const parts = String(match ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegExp);
  if (parts.length === 0) return text;
  const re = new RegExp(`(?<![\\p{L}\\p{N}'-])${parts.join('\\s+')}(?![\\p{L}\\p{N}'-])`, 'giu');
  return text.replace(re, () => replacement);
}

// "a" is only treated as intrusive when it sits between a (reduced) verb and a complement that
// cannot take "a" in correct English. Countable nouns ("a drink", "a cookie") are left alone.
const INTRUSIVE_HELP = /\b(nee|need|wan|want|wanna)\s+a\s+(?:hell|help)\b/gi;
const INTRUSIVE_VERB = /\b(nee|need|wan|want|go|went)\s+a\s+(sleep|play|eat|pee|swim|ride|run|work)\b/gi;

function normaliseVerb(v: string): string {
  const l = v.toLowerCase();
  if (l === 'nee') return 'need';
  if (l === 'wan' || l === 'wanna') return 'want';
  return l;
}

const BUILTIN_OPS: Record<string, (s: string) => string> = {
  intrusive_a: s =>
    s
      .replace(INTRUSIVE_HELP, (_m, v: string) => `${normaliseVerb(v)} some help`)
      .replace(INTRUSIVE_VERB, (_m, v: string, c: string) => `${normaliseVerb(v)} to ${c.toLowerCase()}`)
      .replace(/\ba\s+hell\b/gi, 'some help'),

  coda_deletion: s =>
    s
      .replace(/\bnee\b/gi, 'need')
      .replace(/\bgoo\b/gi, 'good')
      .replace(/\bhell\b/gi, 'help'),

  th_stopping: s =>
    s
      .replace(/\bwa\s+is\s+dis\b/gi, 'what is this')
      .replace(/\bdis\b/gi, 'this')
      .replace(/\bdat\b/gi, 'that'),

  dussin: s => s.replace(/\bdussin\b/gi, "doesn't"),

  baman: s => s.replace(/\bba-man\b/gi, 'Batman').replace(/\bspi-man\b/gi, 'Spiderman')
};

/** Which built-in behaviours does this rule stand for? Explicit patternKey > name inference > legacy patternType. */
export function builtinKeysForRule(rule: GrammarRuleLike): string[] {
  if (rule.patternKey && BUILTIN_OPS[rule.patternKey]) return [rule.patternKey];
  // An explicit match/replacement rule does exactly what it says, not whatever its type dropdown implies.
  if (rule.match && rule.replacement) return [];

  const name = String(rule.ruleName || '').toLowerCase();
  if (/ba-man|compound|medial cluster/.test(name)) return ['baman'];
  if (/dussin|negative auxiliary|contraction/.test(name)) return ['dussin'];
  if (/interdental|fricative|\bdis\b|\bdat\b/.test(name)) return ['th_stopping'];
  if (/intrusive|article/.test(name)) return ['intrusive_a'];
  if (/alveolar|coda|terminal|plosive|deletion/.test(name)) return ['coda_deletion'];

  switch (rule.patternType) {
    case 'intrusive_article':
      return ['intrusive_a'];
    case 'consonant_deletion':
      return ['coda_deletion', 'th_stopping'];
    case 'word_merging':
      return ['dussin', 'baman'];
    default:
      return [];
  }
}

export function isRuleActive(rule: GrammarRuleLike): boolean {
  return rule?.status === 'confirmed' && rule.enabled !== false;
}

// ─────────────────────────────────────────────────────────────
// Evidence for a built-in pattern, measured against the verified training pairs
// ─────────────────────────────────────────────────────────────

export interface PatternEvidenceItem {
  spoken: string;
  intended: string;
  note: string;
}

export interface PatternEvidence {
  supported: PatternEvidenceItem[];
  counter: PatternEvidenceItem[];
}

interface PatternCheck {
  /** Spoken side contains this: the rule would fire. */
  trigger: RegExp;
  /** Intended side must contain this for the rule to have been right. */
  expect: RegExp;
  note: string;
}

const PATTERN_CHECKS: Record<string, PatternCheck[]> = {
  coda_deletion: [
    { trigger: /\bnee\b/, expect: /\bneed\b/, note: "'nee' -> 'need'" },
    { trigger: /\bgoo(?:h)?\b/, expect: /\bgood\b/, note: "'goo' -> 'good'" },
    { trigger: /\bhell\b/, expect: /\bhelp\b/, note: "'hell' -> 'help'" }
  ],
  th_stopping: [
    { trigger: /\bdis\b/, expect: /\bthis\b/, note: "'dis' -> 'this'" },
    { trigger: /\bdat\b/, expect: /\bthat\b/, note: "'dat' -> 'that'" }
  ],
  // The rule always outputs "doesn't", so an intended "don't" is evidence against it.
  dussin: [{ trigger: /\bdussin\b/, expect: /\bdoesn't\b|\bdoes not\b/, note: "'dussin' -> 'doesn't'" }],
  baman: [{ trigger: /\b(?:ba|spi)-man\b/, expect: /\b(?:batman|spiderman|spider-man)\b/, note: "'ba-man' -> 'Batman'" }]
};

const evidenceNorm = (x: unknown) => String(x ?? '').toLowerCase().replace(/[‘’]/g, "'");

/**
 * How well does a built-in pattern agree with what the user actually verified?
 * Only real pairs count. Nothing is invented, so a pattern with no data behind it
 * comes back with zero supporting examples and cannot be confirmed.
 */
export function evaluatePattern(
  key: string,
  pairs: { sound?: string; meaning?: string }[]
): PatternEvidence {
  const supported: PatternEvidenceItem[] = [];
  const counter: PatternEvidenceItem[] = [];

  const nonGlobal = (re: RegExp) => new RegExp(re.source, 'i');

  for (const pair of pairs || []) {
    const spoken = String(pair?.sound ?? '');
    const intended = String(pair?.meaning ?? '');
    const s = evidenceNorm(spoken);
    const m = evidenceNorm(intended);
    if (!s.trim() || !m.trim()) continue;

    if (key === 'intrusive_a') {
      const hit = s.match(nonGlobal(INTRUSIVE_HELP)) || s.match(nonGlobal(INTRUSIVE_VERB));
      if (hit) {
        const last = hit[0].trim().split(/\s+/).pop() || '';
        const noun = last === 'hell' ? 'help' : last;
        const kept = new RegExp(`\\ba\\s+${escapeRegExp(noun)}\\b`).test(m);
        (kept ? counter : supported).push({
          spoken,
          intended,
          note: kept ? `Intended meaning kept "a ${noun}"` : `Intrusive "a" dropped before "${noun}"`
        });
      } else if (/\ba\s+(?:cookie|toy|ball|car|cup|book|drink)\b/.test(s) && /\ba\s+(?:cookie|toy|ball|car|cup|book|drink)\b/.test(m)) {
        supported.push({ spoken, intended, note: "Countable noun correctly keeps 'a'" });
      }
      continue;
    }

    const checks = PATTERN_CHECKS[key];
    if (!checks) continue;
    const fired = checks.filter(c => c.trigger.test(s));
    if (fired.length === 0) continue;

    const failed = fired.filter(c => !c.expect.test(m));
    if (failed.length === 0) {
      supported.push({ spoken, intended, note: fired.map(c => c.note).join(', ') });
    } else {
      counter.push({ spoken, intended, note: `Intended meaning did not match ${failed.map(c => c.note).join(', ')}` });
    }
  }

  return { supported, counter };
}

export function applyGrammarRules(
  text: string,
  rules: GrammarRuleLike[]
): { text: string; applied: AppliedRule[] } {
  let current = text;
  const applied: AppliedRule[] = [];

  for (const rule of rules || []) {
    if (!isRuleActive(rule)) continue;
    const before = current;

    for (const key of builtinKeysForRule(rule)) {
      current = BUILTIN_OPS[key](current);
    }
    if (rule.match && rule.replacement) {
      current = replacePhrase(current, rule.match, rule.replacement);
    }

    if (current !== before) {
      applied.push({
        ruleId: rule.id,
        ruleName: rule.ruleName,
        action: rule.action || '',
        reason: rule.hypothesis || '',
        before,
        after: current
      });
    }
  }

  return { text: current, applied };
}

// ─────────────────────────────────────────────────────────────
// Full decode
// ─────────────────────────────────────────────────────────────

export interface DecodeResult {
  original: string;
  /** Text after dictionary phrases and words plus grammar rules (same as `decoded`; kept for the Phase 3 view). */
  ruleTransformedText: string;
  /** Final, polished sentence. */
  decoded: string;
  appliedRules: AppliedRule[];
  /** Dictionary entries that were actually used (phrases and words). */
  matchedEntries: LexiconEntry[];
  /** 0..1: share of the spoken tokens that a dictionary entry or rule explained. */
  coverage: number;
  totalTokens: number;
}

function multisetRemoved(before: string[], after: string[]): number {
  const counts = new Map<string, number>();
  for (const t of after) counts.set(t, (counts.get(t) || 0) + 1);
  let removed = 0;
  for (const t of before) {
    const c = counts.get(t) || 0;
    if (c > 0) counts.set(t, c - 1);
    else removed++;
  }
  return removed;
}

export function decodeUtterance(
  text: string,
  opts: { lexicon: LexiconEntry[]; rules: GrammarRuleLike[] }
): DecodeResult {
  const original = String(text ?? '').trim();
  const originalTokens = tokenize(original);
  const totalTokens = originalTokens.filter(t => t.norm).length;
  const index = buildIndex(opts.lexicon || []);

  // 1) Multi-word phrases, protected from everything that follows.
  const protectedSpans: string[] = [];
  const phraseScan = scan(originalTokens, index, 2, index.maxLen);
  const phraseText = phraseScan.pieces
    .map(p => {
      if (!p.entry) return p.text;
      protectedSpans.push(p.text);
      return `${SENT_OPEN}${protectedSpans.length - 1}${SENT_CLOSE}`;
    })
    .join(' ');

  // 2) Single-word dictionary entries (specific beats general).
  const wordScan = scan(tokenize(phraseText), index, 1, 1);
  let wordCovered = 0;
  const wordMatched: LexiconEntry[] = [];
  const wordText = wordScan.pieces
    .map(p => {
      if (p.entry) {
        wordCovered += 1;
        if (!wordMatched.includes(p.entry)) wordMatched.push(p.entry);
      }
      return p.text;
    })
    .join(' ');

  // 3) Grammar rules on what the dictionary did not already explain (intrusive "a", unknown compounds, ...).
  const ruled = applyGrammarRules(wordText, opts.rules);
  let ruleExplained = 0;
  for (const r of ruled.applied) {
    ruleExplained += multisetRemoved(
      tokenize(r.before).map(t => t.norm).filter(Boolean),
      tokenize(r.after).map(t => t.norm).filter(Boolean)
    );
  }

  const restore = (s: string) => s.replace(SENT_RE, (_m, i: string) => protectedSpans[Number(i)] ?? '');

  const explained = Math.min(totalTokens, phraseScan.coveredTokens + ruleExplained + wordCovered);

  return {
    original,
    ruleTransformedText: polish(restore(ruled.text)),
    decoded: polish(restore(ruled.text)),
    appliedRules: ruled.applied,
    matchedEntries: [...phraseScan.matched, ...wordMatched.filter(e => !phraseScan.matched.includes(e))],
    coverage: totalTokens > 0 ? explained / totalTokens : 0,
    totalTokens
  };
}

// ─────────────────────────────────────────────────────────────
// Training-pair lookup
// ─────────────────────────────────────────────────────────────

function containsSequence(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** True when `needle` appears in `haystack` as a contiguous run of whole words (case / punctuation ignored). */
export function containsPhrase(haystack: unknown, needle: unknown): boolean {
  const n = tokenize(String(needle ?? '')).map(t => t.norm).filter(Boolean);
  const h = tokenize(String(haystack ?? '')).map(t => t.norm).filter(Boolean);
  return containsSequence(h, n);
}

/** A user-verified utterance that matches the input word for word (case / punctuation / spacing ignored). */
export function findExactPair<T extends { sound?: string }>(text: string, pairs: T[]): T | undefined {
  const key = lexKey(text);
  if (!key) return undefined;
  return (pairs || []).find(p => lexKey(p?.sound) === key);
}

/**
 * Training pairs that overlap the input on whole words. Substring matching ("a" inside everything)
 * is deliberately not used: a pair must appear as a contiguous word sequence in the input, or the
 * input must appear as one inside the pair. Single-word overlaps need >= 3 letters.
 */
export function findRelatedPairs<T extends { sound?: string }>(text: string, pairs: T[], max = 3): T[] {
  const input = tokenize(text).map(t => t.norm).filter(Boolean);
  if (input.length === 0) return [];
  const out: T[] = [];
  for (const p of pairs || []) {
    const snd = tokenize(p?.sound ?? '').map(t => t.norm).filter(Boolean);
    if (snd.length === 0) continue;
    const long = snd.length >= 2 || snd[0].length >= 3;
    const inputLong = input.length >= 2 || input[0].length >= 3;
    if ((long && containsSequence(input, snd)) || (inputLong && containsSequence(snd, input))) {
      out.push(p);
      if (out.length >= max) break;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Candidates & confidence
// ─────────────────────────────────────────────────────────────

export interface CandidateOut {
  id: string;
  text: string;
  probability: number;
}

/** Clean up LLM (or fallback) candidates: drop blanks and duplicates, clamp probabilities, re-id A/B/C. */
export function sanitizeCandidates(raw: any[], max = 3): CandidateOut[] {
  const seen = new Set<string>();
  const cleaned: { text: string; probability: number }[] = [];

  (Array.isArray(raw) ? raw : []).forEach((c, idx) => {
    const t = String(c?.text ?? '').trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) return;
    seen.add(key);
    const p = typeof c?.probability === 'number' && isFinite(c.probability) ? c.probability : idx === 0 ? 0.6 : 0.1;
    cleaned.push({ text: t, probability: Math.min(1, Math.max(0, p)) });
  });

  const top = cleaned.slice(0, max);
  const sum = top.reduce((a, c) => a + c.probability, 0);
  const scale = sum > 1 ? 1 / sum : 1;

  return top.map((c, i) => ({
    id: String.fromCharCode(65 + i),
    text: c.text,
    probability: Math.round(c.probability * scale * 1000) / 1000
  }));
}

/**
 * Highest confidence we are willing to report given how much of the utterance our own
 * dictionary / rulebook actually explained. Keeps an unsupported LLM guess from auto-speaking.
 */
export function evidenceCeiling(coverage: number): number {
  const c = Math.min(1, Math.max(0, coverage));
  return UNSUPPORTED_CONFIDENCE_CAP + (0.98 - UNSUPPORTED_CONFIDENCE_CAP) * c;
}

/** Confidence for the offline (no LLM) path, driven purely by coverage. */
export function fallbackConfidence(coverage: number): number {
  const c = Math.min(1, Math.max(0, coverage));
  return Math.round((0.62 + 0.3 * c) * 1000) / 1000;
}

export type RouteMode = 'auto' | 'choice' | 'clarification';

export function routeConfidence(confidence: number, threshold: number): RouteMode {
  if (confidence < threshold) return 'clarification';
  if (confidence >= Math.max(AUTO_ACCEPT_CONFIDENCE, threshold)) return 'auto';
  return 'choice';
}

// ─────────────────────────────────────────────────────────────
// Making sure the dictionary and rulebook are actually used
// ─────────────────────────────────────────────────────────────

/** Does this sentence keep a dictionary entry's verified meaning (or one of its listed alternatives)? */
export function honorsEntry(sentence: string, entry: { definition: string }): boolean {
  const meanings = [primaryMeaning(entry.definition), ...alternativeMeanings(entry.definition)];
  return meanings.some(m => containsPhrase(sentence, m));
}

const FUNCTION_WORDS = new Set(['a', 'an', 'the', 'some', 'to', 'of', 'is', 'are', 'am', 'do', 'does', 'did', 'be']);

/**
 * Content words the grammar rules put into the sentence (need, that, Batman ...). A model answer that does not
 * contain them has ignored the rulebook. Little function words (some, to, a) are skipped so harmless rephrasing
 * ("I need help" for "I need some help") is not treated as a violation.
 */
export function introducedWords(applied: { before: string; after: string }[]): string[] {
  const out: string[] = [];
  for (const r of applied || []) {
    const before = new Map<string, number>();
    for (const t of tokenize(r.before)) if (t.norm) before.set(t.norm, (before.get(t.norm) || 0) + 1);
    for (const t of tokenize(r.after)) {
      if (!t.norm) continue;
      const left = before.get(t.norm) || 0;
      if (left > 0) before.set(t.norm, left - 1);
      else if (!FUNCTION_WORDS.has(t.norm) && !out.includes(t.norm)) out.push(t.norm);
    }
  }
  return out;
}

export interface DraftMergeResult {
  candidates: CandidateOut[];
  /** True when the model's top answer dropped a verified meaning, so the dictionary/rule decode now leads. */
  draftLeads: boolean;
  /** Verified entries the model's original top answer failed to keep. */
  violated: string[];
}

/**
 * A model answer must never silently override Paxton's verified dictionary.
 *  - If the top candidate keeps every matched entry's meaning, it stays on top (the model completed the sentence).
 *  - If it drops one, the deterministic draft takes the top slot and the model's answers become alternatives.
 *  - Either way the draft is always offered as a candidate, so the user can pick it.
 */
export function applyDraftToCandidates(
  candidates: CandidateOut[],
  draft: string,
  matched: { word: string; definition: string }[],
  coverage: number,
  /** Words the grammar rules introduced (see introducedWords): the model's answer must keep them too. */
  required: string[] = [],
  max = 3
): DraftMergeResult {
  const draftKey = lexKey(draft);
  if (!draftKey || coverage <= 0) return { candidates, draftLeads: false, violated: [] };

  const raw = candidates.map(c => ({ text: c.text, probability: c.probability }));
  const top = raw[0];
  const violated = top
    ? [
        ...matched.filter(e => !honorsEntry(top.text, e)).map(e => e.word),
        ...required.filter(w => !containsPhrase(top.text, w))
      ]
    : [];
  const has = raw.some(c => lexKey(c.text) === draftKey);

  if (violated.length > 0 || !top) {
    const rest = raw.filter(c => lexKey(c.text) !== draftKey).map(c => ({ ...c, probability: Math.min(c.probability, 0.1) }));
    const prior = raw.find(c => lexKey(c.text) === draftKey)?.probability ?? 0;
    return {
      candidates: sanitizeCandidates([{ text: draft, probability: Math.max(0.8, prior) }, ...rest], max),
      draftLeads: true,
      violated
    };
  }

  if (has) return { candidates, draftLeads: lexKey(top.text) === draftKey, violated: [] };

  const kept = raw.slice(0, Math.max(1, max - 1));
  return {
    candidates: sanitizeCandidates([...kept, { text: draft, probability: 0.08 }], max),
    draftLeads: false,
    violated: []
  };
}

export interface UsageSummary {
  source: 'verified_pair' | 'dictionary_rules' | 'llm_assisted' | 'llm_only' | 'unmatched';
  dictionaryEntriesUsed: number;
  rulesApplied: number;
  /** 0..1 share of the heard words the dictionary / rulebook explained. */
  coverage: number;
  draft: string;
  /** The dictionary/rule decode replaced a model answer that contradicted it. */
  draftOverrodeModel: boolean;
}

/** One honest line about where an answer came from, so the app can show that the rulebook/dictionary were used. */
export function summarizeUsage(args: {
  verifiedPair: boolean;
  llmUsed: boolean;
  decoded: DecodeResult;
  draftOverrodeModel?: boolean;
}): UsageSummary {
  const { decoded } = args;
  const used = decoded.matchedEntries.length > 0 || decoded.appliedRules.length > 0;
  const source: UsageSummary['source'] = args.verifiedPair
    ? 'verified_pair'
    : args.llmUsed
      ? used ? 'llm_assisted' : 'llm_only'
      : used ? 'dictionary_rules' : 'unmatched';
  return {
    source,
    dictionaryEntriesUsed: decoded.matchedEntries.length,
    rulesApplied: decoded.appliedRules.length,
    coverage: Math.round(decoded.coverage * 1000) / 1000,
    draft: decoded.decoded,
    draftOverrodeModel: Boolean(args.draftOverrodeModel)
  };
}
