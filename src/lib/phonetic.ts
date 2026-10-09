/**
 * Offline sound-alike guesser.
 *
 * Whisper hands us spellings of what Paxton said ("foo", "hunry", "lunsh"). When nothing in his dictionary or
 * rulebook explains a word, this module proposes the ordinary English words that could have been spoken that way,
 * using general speech-simplification processes instead of word lists tied to particular sentences:
 *
 *   - final consonant deletion        foo -> food, ha -> have, boo -> book
 *   - cluster reduction               hunry -> hungry
 *   - vowel substitution / lengthening guh -> good
 *   - stopping, gliding, fronting, deaffrication (sh/ch, th, l/r, k/g)
 *   - words run together              iwa -> I + wa -> "I want"
 *
 * It is a weighted edit distance between the heard spelling and each known word, plus a small bonus for common
 * words, his own vocabulary and word pairs that often occur together. It is a guess, never a fact: callers must
 * keep its confidence below the auto-speak threshold.
 */
import { CORE_BIGRAMS, CORE_VOCAB } from './coreVocab';

export interface GuessOption {
  words: string[];
  /** Lower is better. Raw sound distance minus word-likelihood bonuses. */
  score: number;
  /** Raw sound distance only. */
  distance: number;
  kind: 'standard' | 'guess' | 'split' | 'unresolved';
  note: string;
}

export interface GuessedSentence {
  text: string;
  score: number;
}

export interface UtteranceGuess {
  decoded: string;
  candidates: { id: string; text: string; probability: number }[];
  /** 0..0.70. Never reaches the auto-speak threshold. 0 when nothing could be resolved. */
  confidence: number;
  /** Share of heard words that are ordinary English or were given a sound-alike. */
  coverage: number;
  explanations: string[];
  changed: boolean;
}

export interface GuessOptions {
  /** Words and meanings from his dictionary and verified pairs: they get a strong bonus. */
  personalWords?: string[];
  /** Extra word pairs seen in his verified meanings. */
  personalBigrams?: [string, string][];
  /** Maximum raw sound distance accepted for a guess. */
  maxDistance?: number;
}

// ───────────────────────────── spelling normalisation ─────────────────────────────

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const isVowel = (c: string) => VOWELS.has(c);

/** Collapse spelling noise so "booo", "boo" and "book" can be compared by sound. */
export function soundForm(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return '';
  w = w.replace(/(.)\1+/g, '$1');
  w = w
    .replace(/tch/g, 'C').replace(/ch/g, 'C').replace(/sh/g, 'S').replace(/th/g, 'T')
    .replace(/ng/g, 'N').replace(/ck/g, 'k').replace(/ph/g, 'f').replace(/wh/g, 'w')
    .replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/qu/g, 'kw').replace(/x/g, 'ks')
    .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k');
  if (w.length >= 3 && w.endsWith('e') && !isVowel(w[w.length - 2])) w = w.slice(0, -1);
  // a run of vowels is one vowel sound ("good" ~ "gud", "boo" ~ "bo")
  w = w.replace(/[aeiou]{2,}/g, m => m[0]);
  return w;
}

// ───────────────────────────── sound distance ─────────────────────────────

/** [spoken, intended] consonant changes that are common simplifications, so cheap. */
const PROCESS_SUBS = new Set([
  'd>T', 'f>T', 't>T', 's>T', 'v>T', 'w>l', 'w>r', 'y>l', 'l>r', 'w>v', 'f>v', 'b>v', 'd>v',
  't>k', 'd>g', 'n>N', 's>S', 'S>C', 't>C', 'd>j', 'S>j', 't>s', 'p>f', 'T>f', 'T>d', 'T>t', 'l>w', 'r>w'
]);
const CLOSE_VOWELS = new Set(['ao', 'ou', 'ei', 'au', 'ae', 'iu']);
const VOICING = new Set(['p>b', 'b>p', 't>d', 'd>t', 'k>g', 'g>k', 's>z', 'z>s', 'f>v', 'v>f']);

function subCost(spoken: string, intended: string): number {
  if (spoken === intended) return 0;
  const sv = isVowel(spoken);
  const iv = isVowel(intended);
  if (sv && iv) return CLOSE_VOWELS.has([spoken, intended].sort().join('')) ? 0.12 : 0.25;
  if (sv !== iv) return 1.3;
  const key = `${spoken}>${intended}`;
  if (PROCESS_SUBS.has(key)) return 0.22;
  if (VOICING.has(key)) return 0.32;
  return 1.1;
}

/** Cost of the intended word having a sound the child did not say. */
function missingCost(word: string, j: number): number {
  const c = word[j];
  if (isVowel(c)) return 0.25;
  const last = word.length - 1;
  const restAreConsonants = [...word.slice(j + 1)].every(x => !isVowel(x));
  if (j === last) return 0.3; // final consonant deletion
  if (restAreConsonants) return 0.25; // final cluster reduction
  if (j === 0) return 0.95; // initial sounds are rarely dropped entirely
  const prevCons = !isVowel(word[j - 1]);
  const nextCons = !isVowel(word[j + 1]);
  if (j === 1 && prevCons) return 0.4; // onset cluster ("bread" -> "bed")
  if (prevCons || nextCons) return 0.36; // medial cluster ("hungry" -> "hunry")
  return 0.55; // weak syllable / medial consonant
}

/** Cost of the heard spelling having a sound the intended word lacks. */
function extraCost(heard: string, i: number): number {
  const c = heard[i];
  if (isVowel(c)) return 0.15;
  if (c === 'h' && i === heard.length - 1) return 0.1;
  return 0.85;
}

export function soundDistance(heardRaw: string, wordRaw: string): number {
  const heard = soundForm(heardRaw);
  const word = soundForm(wordRaw);
  if (!heard || !word) return Infinity;
  const n = heard.length;
  const m = word.length;
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) d[i][0] = d[i - 1][0] + extraCost(heard, i - 1);
  for (let j = 1; j <= m; j++) d[0][j] = d[0][j - 1] + missingCost(word, j - 1);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(
        d[i - 1][j - 1] + subCost(heard[i - 1], word[j - 1]),
        d[i - 1][j] + extraCost(heard, i - 1),
        d[i][j - 1] + missingCost(word, j - 1)
      );
    }
  }
  return d[n][m];
}

/**
 * A guess must keep most of the consonants that were heard (allowing the usual simplifications). Without this,
 * short noises such as "zzz" would be matched to any word that is merely cheap to build.
 */
export function keepsConsonants(heardRaw: string, wordRaw: string): boolean {
  const cons = (w: string) => [...soundForm(w)].filter(c => !isVowel(c));
  let h = cons(heardRaw);
  if (soundForm(heardRaw).endsWith('h')) h = h.slice(0, -1);
  const w = cons(wordRaw);
  if (h.length === 0) return true;
  const dp: number[][] = Array.from({ length: h.length + 1 }, () => new Array(w.length + 1).fill(0));
  for (let i = 1; i <= h.length; i++) {
    for (let j = 1; j <= w.length; j++) {
      const same = subCost(h[i - 1], w[j - 1]) <= 0.22;
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1] + (same ? 1 : 0));
    }
  }
  return dp[h.length][w.length] >= Math.ceil(h.length * 0.6);
}

// ───────────────────────────── vocabulary ─────────────────────────────

interface VocabIndex {
  words: string[];
  forms: Map<string, string>;
  prior: Map<string, number>;
  known: Set<string>;
  bigrams: Map<string, number>;
}

const clean = (s: string) => s.toLowerCase().replace(/[^a-z']/g, '');

function buildIndex(opts: GuessOptions): VocabIndex {
  const words: string[] = [];
  const prior = new Map<string, number>();
  const known = new Set<string>();
  const add = (w: string, bonus: number) => {
    const k = clean(w);
    if (!k) return;
    if (!known.has(k)) {
      known.add(k);
      words.push(k);
    }
    prior.set(k, Math.max(prior.get(k) || 0, bonus));
  };
  CORE_VOCAB.forEach((w, i) => add(w, 0.2 * Math.max(0, 1 - i / 260)));
  for (const w of opts.personalWords || []) add(w, 0.25);
  const forms = new Map<string, string>();
  for (const w of words) forms.set(w, soundForm(w));
  const bigrams = new Map<string, number>();
  for (const [a, b] of CORE_BIGRAMS) bigrams.set(`${a} ${b}`, 0.4);
  for (const [a, b] of opts.personalBigrams || []) bigrams.set(`${clean(a)} ${clean(b)}`, 0.45);
  return { words, forms, prior, known, bigrams };
}

/** Words and word pairs from his verified meanings, for the personal bonus. */
export function personalVocabFrom(meanings: string[]): { words: string[]; bigrams: [string, string][] } {
  const words = new Set<string>();
  const bigrams: [string, string][] = [];
  for (const m of meanings) {
    const toks = String(m || '').toLowerCase().split(/\s+/).map(clean).filter(Boolean);
    toks.forEach(t => words.add(t));
    for (let i = 0; i + 1 < toks.length; i++) bigrams.push([toks[i], toks[i + 1]]);
  }
  return { words: [...words], bigrams };
}

// ───────────────────────────── per-word options ─────────────────────────────

function wordOptions(token: string, idx: VocabIndex, maxDistance: number): GuessOption[] {
  const key = clean(token);
  if (!key) return [{ words: [token], score: 0, distance: 0, kind: 'standard', note: '' }];
  if (idx.known.has(key)) {
    return [{ words: [key], score: 0, distance: 0, kind: 'standard', note: '' }];
  }

  const scored: GuessOption[] = [];
  for (const w of idx.words) {
    const wf = idx.forms.get(w)!;
    if (wf.length - soundForm(key).length > 3) continue;
    const dist = soundDistance(key, w);
    if (dist > maxDistance || !keepsConsonants(key, w)) continue;
    const bonus = idx.prior.get(w) || 0;
    scored.push({
      words: [w],
      score: dist - bonus,
      distance: dist,
      kind: 'guess',
      note: `"${token}" may be "${w}"`
    });
  }

  // Words run together: a short known word followed by something that sounds like another word.
  const tk = key.replace(/'/g, '');
  for (let cut = 1; cut < tk.length - 1; cut++) {
    const left = tk.slice(0, cut);
    const right = tk.slice(cut);
    if (!idx.known.has(left) || left.length > 3) continue;
    if (idx.known.has(right)) {
      scored.push({ words: [left, right], score: 0.3, distance: 0.3, kind: 'split', note: `"${token}" may be "${left} ${right}"` });
      continue;
    }
    for (const w of idx.words) {
      if (w.length < 2) continue;
      const dist = soundDistance(right, w);
      if (dist > maxDistance - 0.1 || !keepsConsonants(right, w)) continue;
      scored.push({
        words: [left, w],
        score: dist + 0.3 - (idx.prior.get(w) || 0) - (idx.bigrams.has(`${left} ${w}`) ? 0.4 : 0),
        distance: dist + 0.3,
        kind: 'split',
        note: `"${token}" may be "${left} ${w}"`
      });
    }
  }

  scored.sort((a, b) => a.score - b.score);
  const out: GuessOption[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    const k = s.words.join(' ');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= 5) break;
  }
  if (out.length === 0) {
    out.push({ words: [token], score: 1.4, distance: 1.4, kind: 'unresolved', note: `no close word for "${token}"` });
  }
  return out;
}

// ───────────────────────────── sentence search ─────────────────────────────

interface Beam {
  words: string[];
  punct: string[];
  score: number;
  notes: string[];
  kinds: GuessOption['kind'][];
  unresolved: number;
  guessed: number;
}

const NEGATABLE = new Set(['have', 'want', 'like', 'need', 'go', 'know', 'see', 'eat', 'get']);
const ADJECTIVES = new Set([
  'hungry', 'thirsty', 'tired', 'sleepy', 'sick', 'sad', 'happy', 'mad', 'angry', 'scared', 'cold', 'hot', 'hurt',
  'done', 'ready', 'finished', 'bored', 'excited', 'full'
]);
const SUBJECT_BE: Record<string, string> = { i: 'am', you: 'are', we: 'are', they: 'are', he: 'is', she: 'is', it: 'is' };

/** Grammar the child tends to leave out: "I hungry" -> "I am hungry". Applied to the finished word list. */
function smooth(words: string[], punct: string[]): { words: string[]; punct: string[] } {
  const out: string[] = [];
  const outP: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = out[out.length - 1];
    if (prev && SUBJECT_BE[prev] && ADJECTIVES.has(w) && !outP[outP.length - 1]) {
      out.push(SUBJECT_BE[prev]);
      outP.push('');
    }
    out.push(w);
    outP.push(punct[i] || '');
  }
  return { words: out, punct: outP };
}

function render(words: string[], punct: string[]): string {
  let t = words.map((w, i) => w + (punct[i] || '')).join(' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/\bi\b/g, 'I');
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (_m, a, b) => a + b.toUpperCase());
  return t;
}

export function guessUtterance(text: string, opts: GuessOptions = {}): UtteranceGuess {
  const heard = String(text ?? '').trim();
  if (!heard) return { decoded: '', candidates: [], confidence: 0, coverage: 0, explanations: [], changed: false };

  const idx = buildIndex(opts);
  const maxDistance = opts.maxDistance ?? 0.85;
  const rawTokens = heard.split(/\s+/).filter(t => clean(t));
  // keep sentence breaks so "lunsh" at the end of one sentence does not borrow the next sentence's word
  const tokenOptions = rawTokens.map(t => ({
    raw: t,
    trail: (t.match(/[.,!?;:]+$/) || [''])[0],
    opts: wordOptions(t, idx, maxDistance)
  }));

  let beams: Beam[] = [{ words: [], punct: [], score: 0, notes: [], kinds: [], unresolved: 0, guessed: 0 }];
  for (const { opts: choices, trail } of tokenOptions) {
    const next: Beam[] = [];
    for (const b of beams) {
      for (const c of choices) {
        let score = b.score + c.score;
        const prev = b.words[b.words.length - 1];
        if (prev && idx.bigrams.has(`${prev} ${c.words[0]}`)) score -= idx.bigrams.get(`${prev} ${c.words[0]}`)!;
        for (let i = 0; i + 1 < c.words.length; i++) {
          const bg = idx.bigrams.get(`${c.words[i]} ${c.words[i + 1]}`);
          if (bg) score -= bg;
        }
        next.push({
          words: [...b.words, ...c.words],
          punct: [...b.punct, ...c.words.map((_w, i) => (i === c.words.length - 1 ? trail : ''))],
          score,
          notes: c.note ? [...b.notes, c.note] : b.notes,
          kinds: [...b.kinds, c.kind],
          unresolved: b.unresolved + (c.kind === 'unresolved' ? 1 : 0),
          guessed: b.guessed + (c.kind === 'guess' || c.kind === 'split' ? 1 : 0)
        });
      }
    }
    next.sort((a, b) => a.score - b.score);
    beams = next.slice(0, 10);
  }

  const seenText = new Set<string>();
  const sentences: { text: string; score: number; beam: Beam }[] = [];
  for (const b of beams) {
    const sm = smooth(b.words, b.punct);
    const words = sm.words;
    // "no have" / "no want": zero-auxiliary negation
    const negated = words.map((w, i) => (w === 'no' && NEGATABLE.has(words[i + 1] || '') ? "didn't" : w));
    const variants = [words];
    if (negated.join(' ') !== words.join(' ')) {
      variants.unshift(negated);
      variants.push(words.map((w, i) => (w === 'no' && NEGATABLE.has(words[i + 1] || '') ? "don't" : w)));
    }
    variants.forEach((v, vi) => {
      const t = render(v, sm.punct);
      if (seenText.has(t.toLowerCase())) return;
      seenText.add(t.toLowerCase());
      sentences.push({ text: t, score: b.score + vi * 0.15, beam: b });
    });
  }
  sentences.sort((a, b) => a.score - b.score);
  const top = sentences.slice(0, 3);
  const best = top[0];

  const standardish = best.beam.kinds.filter(k => k !== 'unresolved').length;
  const totalChoices = best.beam.kinds.length || 1;
  const coverage = standardish / totalChoices;
  const changed = rawTokens.join(' ').toLowerCase().replace(/[^a-z' ]/g, '') !== best.text.toLowerCase().replace(/[^a-z' ]/g, '');

  // Honest confidence: a guess is never certain. Nothing guessed -> nothing offered.
  let confidence = 0;
  if (changed && best.beam.guessed > 0) {
    confidence = 0.62 - 0.07 * best.beam.guessed + 0.1 * coverage - 0.2 * best.beam.unresolved;
    confidence = Math.max(0.15, Math.min(0.65, Math.round(confidence * 100) / 100));
  }

  const weights = top.map(s => Math.exp(-(s.score - best.score) * 1.5));
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const candidates = top.map((s, i) => ({
    id: String.fromCharCode(65 + i),
    text: s.text,
    probability: Math.round((weights[i] / wsum) * confidence * 100) / 100
  }));

  return {
    decoded: best.text,
    candidates: confidence > 0 ? candidates : [],
    confidence,
    coverage,
    explanations: best.beam.notes,
    changed
  };
}
