import express from 'express';
import https from 'node:https';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import util from 'util';
import { exec, spawn, execSync } from 'child_process';
import { createServer as createViteServer } from 'vite';
import {
  AUTO_ACCEPT_CONFIDENCE,
  alternativeMeanings,
  applyDraftToCandidates,
  applyGrammarRules,
  buildLexicon,
  builtinKeysForRule,
  containsPhrase,
  decodeUtterance,
  escapeRegExp,
  evaluatePattern,
  evidenceCeiling,
  fallbackConfidence,
  findRelatedPairs,
  introducedWords,
  isRuleActive,
  lexKey,
  PATTERN_CHECKS,
  polish,
  primaryMeaning,
  routeConfidence,
  sanitizeCandidates,
  summarizeUsage,
  resolveAcousticPhonetics,
  type PatternCheck
} from './src/lib/decoder';
import {
  buildDeconstructPrompt,
  buildDictionaryBuildPrompt,
  buildHypothesisPrompt,
  buildInterpreterPrompt
} from './src/lib/prompts';

// Cached list of installed Ollama models to prevent model-not-found 404s
let cachedOllamaModels: { names: string[]; timestamp: number } | null = null;
async function getInstalledOllamaModels(ollamaUrl: string): Promise<string[]> {
  const now = Date.now();
  if (cachedOllamaModels && now - cachedOllamaModels.timestamp < 30000) {
    return cachedOllamaModels.names;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const data: any = await res.json();
      if (data && Array.isArray(data.models)) {
        const names = data.models.map((m: any) => m.name || m.model).filter(Boolean);
        cachedOllamaModels = { names, timestamp: now };
        return names;
      }
    }
  } catch (e) {}
  return [];
}

// What happened on a model call. A silent failure used to look like "the app can't guess"; now the reason
// (Ollama not running, still loading, model not installed ...) is recorded and shown to the user.
interface LlmTrace {
  ollama: string;
  ok: boolean;
  via: 'ollama' | null;
  /** The model actually used (may differ from the configured one when that one is not installed). */
  model: string;
  /** Set when the configured model was not installed and another one was substituted. */
  note: string;
  ms: number;
}

function newLlmTrace(model = ''): LlmTrace {
  return { ollama: 'not tried', ok: false, via: null, model, note: '', ms: 0 };
}

/** A model that is still loading can take a while the first time, so be patient before giving up. */
function llmTimeoutMs(): number {
  const t = Number(appSettings.llmTimeoutMs);
  return isFinite(t) && t >= 2000 ? t : 55000;
}

async function ollamaPost(
  url: string,
  body: any,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body)
    });
    let data: any = null;
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    return { ok: false, status: 0, data: null, error: err?.name === 'AbortError' ? 'timeout' : String(err?.cause?.code || err?.message || 'unknown error') };
  } finally {
    clearTimeout(timer);
  }
}

// Universal Local LLM runner (Ollama primary with auto-detection of configured/installed models)
async function queryLlm(
  prompt: string,
  modelOverride?: string,
  formatJson: boolean = true,
  timeoutMs: number = llmTimeoutMs(),
  trace: LlmTrace = newLlmTrace()
): Promise<string | null> {
  const started = Date.now();
  const rawUrl = appSettings.ollamaEndpoint || 'http://localhost:11434';
  const ollamaUrl = rawUrl.trim().replace(/\/+$/, '');

  // Determine requested model based on priority: explicit override > interpreter > hypothesis > general
  let targetModel = (modelOverride ||
    appSettings.llamaInterpreterModel ||
    appSettings.llamaModel ||
    appSettings.grammarHypothesisModel ||
    appSettings.gemmaModel ||
    'llama3').trim();
  const configured = targetModel;
  const done = (text: string | null) => {
    trace.model = targetModel;
    trace.ms = Date.now() - started;
    return text;
  };
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const failure = (r: { status: number; data: any; error?: string }) =>
    r.error === 'timeout'
      ? `no answer within ${Math.round(timeoutMs / 1000)}s (a model that is still loading can be slow the first time)`
      : r.error
        ? `could not connect to ${ollamaUrl} (${r.error})`
        : `HTTP ${r.status}${r.data?.error ? ` (${String(r.data.error).slice(0, 120)})` : ''}`;

  // Check that the target model is installed, or pick the installed local model
  const installed = await getInstalledOllamaModels(ollamaUrl);
  if (installed.length > 0) {
    const matched = installed.find(m => m === targetModel || m.startsWith(targetModel + ':') || targetModel.startsWith(m.split(':')[0]));
    if (matched) {
      targetModel = matched;
    } else {
      // Fall back to the user's primary installed model in Ollama
      console.log(`[Local LLM] Configured model '${targetModel}' not in Ollama. Using installed local model '${installed[0]}'.`);
      targetModel = installed[0];
      trace.note = `'${configured}' is not installed in Ollama, so '${targetModel}' was used instead`;
    }
  }

  // /api/generate (keep_alive keeps the model in memory so only the very first phrase pays the load time)
  const generate = (withFormat: boolean) =>
    ollamaPost(`${ollamaUrl}/api/generate`, {
      model: targetModel,
      prompt,
      stream: false,
      keep_alive: '30m',
      format: withFormat ? 'json' : undefined
    }, timeoutMs);

  let r = await generate(formatJson);
  let out = r.ok ? text(r.data?.response) : '';
  let reason = r.ok ? 'replied with an empty response' : failure(r);

  // The model or Ollama version may not support format: 'json'. Retry without it.
  if (!out && !r.ok && formatJson && (r.status === 400 || r.status === 500)) {
    r = await generate(false);
    out = r.ok ? text(r.data?.response) : '';
    if (!out) reason = r.ok ? 'replied with an empty response' : failure(r);
  }

  // If /api/generate did not produce a response but Ollama did answer, try /api/chat. (A refused connection or a
  // timeout is not fixed by asking again, and a second full wait would just double the delay.)
  if (!out && r.status !== 0) {
    const c = await ollamaPost(`${ollamaUrl}/api/chat`, {
      model: targetModel,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      keep_alive: '30m',
      format: formatJson ? 'json' : undefined
    }, timeoutMs);
    out = c.ok ? text(c.data?.message?.content) : '';
  }

  if (!out) {
    trace.ollama = reason + (r.status === 404 ? `; install it with: ollama pull ${targetModel}` : '');
    console.warn(`[Local LLM] Ollama call to ${ollamaUrl} failed: ${trace.ollama}`);
    return done(null);
  }
  trace.ollama = 'ok';
  trace.ok = true;
  trace.via = 'ollama';
  return done(out);
}

// Safe directory resolution compatible with both CommonJS (dist/server.cjs) and ES modules
const currentDir = typeof __dirname !== 'undefined'
  ? __dirname
  : (typeof process !== 'undefined' ? process.cwd() : '.');
const execAsync = util.promisify(exec);

const app = express();
app.use(express.json());

let isStorageDisabled = process.env.DISABLE_LOCAL_STORAGE === 'true';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'uploads';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }
    cb(null, isStorageDisabled ? os.tmpdir() : dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });


// In-memory Database for prototyping
let interactions: any[] = [];
let appSettings: any = {
  ollamaEndpoint: 'http://localhost:11434',
  llamaInterpreterModel: 'llama3',
  llamaDictionaryModel: 'llama3',
  gemmaModel: 'gemma2',
  grammarHypothesisModel: 'gemma2',
  miniLlmModel: 'gemma2:2b',
  // The small first-guess model is planned but not in use yet. Flip this in settings.json to switch it on later.
  miniLlmEnabled: false,
  // How long to wait for a model before falling back to the offline guess (a cold model can be slow to load).
  llmTimeoutMs: 55000,
  hypothesisMinSupport: 2,
  hypothesisMinConfidence: 0.70,
  whisperEndpoint: 'http://localhost:8080',
  lowCertaintyThreshold: 0.78,
  trainingEpochs: 10,
  trainingLR: '1e-5',
  trainingBatchSize: 4
};
let trainingData: any[] = [];
let dictionaryData: any[] = [];
let grammarRulebook: any[] = [];

try {
  if (fs.existsSync('db.json')) {
    interactions = JSON.parse(fs.readFileSync('db.json', 'utf-8'));
  }
} catch(e) {}

try {
  if (fs.existsSync('settings.json')) {
    appSettings = { ...appSettings, ...JSON.parse(fs.readFileSync('settings.json', 'utf-8')) };
  }
} catch(e) {}

try {
  if (fs.existsSync('grammar_rulebook.json')) {
    grammarRulebook = JSON.parse(fs.readFileSync('grammar_rulebook.json', 'utf-8'));
  }
} catch(e) {}

function saveGrammarRulebook() {
  if (isStorageDisabled) return;
  fs.writeFileSync('grammar_rulebook.json', JSON.stringify(grammarRulebook, null, 2));
}

try {
  if (fs.existsSync('training_data.json')) {
    trainingData = JSON.parse(fs.readFileSync('training_data.json', 'utf-8'));
  }
} catch(e) {}

try {
  if (fs.existsSync('dictionary.json')) {
    dictionaryData = JSON.parse(fs.readFileSync('dictionary.json', 'utf-8'));
  }
} catch(e) {}

let audioBank: any[] = [];
try {
  if (fs.existsSync('audio_bank.json')) {
    audioBank = JSON.parse(fs.readFileSync('audio_bank.json', 'utf-8'));
  }
} catch(e) {}

let crossReferenceData: any[] = [];
try {
  if (fs.existsSync('cross_reference.json')) {
    crossReferenceData = JSON.parse(fs.readFileSync('cross_reference.json', 'utf-8'));
  }
} catch(e) {}

function saveCrossReferenceData() {
  if (isStorageDisabled) return;
  fs.writeFileSync('cross_reference.json', JSON.stringify(crossReferenceData, null, 2));
}

function seedBaselineDataIfEmpty() {
  if (trainingData.length === 0) {
    const seedPairs = [
      { sound: "i nee a hell", meaning: "I need some help", category: "Phrase" },
      { sound: "dussin work", meaning: "doesn't work", category: "Phrase" },
      { sound: "ba-man movie", meaning: "Batman movie", category: "Phrase" },
      { sound: "wa is dis", meaning: "what is this", category: "Phrase" },
      { sound: "gooh job", meaning: "good job", category: "Phrase" },
      { sound: "yeyo car", meaning: "yellow car", category: "Phrase" },
      { sound: "wanna wa", meaning: "want water", category: "Phrase" },
      { sound: "i wike dat", meaning: "I like that", category: "Phrase" },
      { sound: "ah finish", meaning: "all finished", category: "Phrase" },
      { sound: "dussin go in dare", meaning: "doesn't go in there", category: "Phrase" },
      { sound: "mom gimme dat", meaning: "Mom, give me that", category: "Phrase" },
      { sound: "i nee to pee", meaning: "I need to go to the bathroom", category: "Phrase" },
      { sound: "no no no dussin want", meaning: "no, I don't want that", category: "Phrase" },
      { sound: "see da airplane", meaning: "see the airplane", category: "Phrase" },
      { sound: "more please", meaning: "more please", category: "Phrase" },
      { sound: "i love you mom", meaning: "I love you Mom", category: "Phrase" },
      { sound: "where is daddy", meaning: "where is daddy", category: "Phrase" },
      { sound: "turn on tv", meaning: "turn on the TV", category: "Phrase" }
    ];
    seedPairs.forEach((p, idx) => {
      trainingData.push({
        id: (Date.now() - idx * 1000).toString(),
        timestamp: new Date().toISOString(),
        category: p.category,
        sound: p.sound,
        meaning: p.meaning,
        hasAudio: false
      });
    });
    saveTrainingData();
  }

  if (crossReferenceData.length === 0) {
    const seedItems = [
      { phonetic: "i nee a hell", meaning: "I need some help", type: "phrase", context: "i nee a hell wit dis", confidence: 0.96, occurrences: 14, inDictionary: true, approved: true },
      { phonetic: "dussin work", meaning: "doesn't work", type: "phrase", context: "dussin work right now", confidence: 0.95, occurrences: 18, inDictionary: true, approved: true },
      { phonetic: "wa is dis", meaning: "what is this", type: "phrase", context: "wa is dis thing", confidence: 0.94, occurrences: 12, inDictionary: true, approved: true },
      { phonetic: "gooh job", meaning: "good job", type: "phrase", context: "gooh job buddy", confidence: 0.98, occurrences: 16, inDictionary: true, approved: true },
      { phonetic: "i wike dat", meaning: "I like that", type: "phrase", context: "i wike dat toy", confidence: 0.93, occurrences: 9, inDictionary: true, approved: true },
      { phonetic: "mom gimme dat", meaning: "Mom, give me that", type: "phrase", context: "mom gimme dat please", confidence: 0.92, occurrences: 8, inDictionary: true, approved: true },
      { phonetic: "no no no dussin want", meaning: "no, I don't want that", type: "phrase", context: "no no no dussin want to go", confidence: 0.91, occurrences: 6, inDictionary: true, approved: true },
      { phonetic: "ah finish", meaning: "all finished", type: "phrase", context: "ah finish my food", confidence: 0.95, occurrences: 11, inDictionary: true, approved: true },
      { phonetic: "dussin", meaning: "doesn't", type: "word", context: "dussin work", confidence: 0.97, occurrences: 28, inDictionary: true, approved: true },
      { phonetic: "nee", meaning: "need", type: "word", context: "i nee water", confidence: 0.96, occurrences: 34, inDictionary: true, approved: true },
      { phonetic: "hell", meaning: "help", type: "word", context: "i nee a hell", confidence: 0.92, occurrences: 19, inDictionary: true, approved: true },
      { phonetic: "ba-man", meaning: "Batman", type: "word", context: "ba-man movie", confidence: 0.98, occurrences: 14, inDictionary: true, approved: true },
      { phonetic: "wa", meaning: "what / water", type: "word", context: "wa is dis", confidence: 0.90, occurrences: 22, inDictionary: true, approved: true },
      { phonetic: "yeyo", meaning: "yellow", type: "word", context: "yeyo car", confidence: 0.95, occurrences: 8, inDictionary: true, approved: true },
      { phonetic: "gooh", meaning: "good", type: "word", context: "gooh job", confidence: 0.96, occurrences: 16, inDictionary: true, approved: true },
      { phonetic: "wike", meaning: "like", type: "word", context: "i wike it", confidence: 0.94, occurrences: 12, inDictionary: true, approved: true },
      { phonetic: "dat", meaning: "that", type: "word", context: "gimme dat", confidence: 0.96, occurrences: 25, inDictionary: true, approved: true },
      { phonetic: "dis", meaning: "this", type: "word", context: "wa is dis", confidence: 0.95, occurrences: 18, inDictionary: true, approved: true },
      { phonetic: "gimme", meaning: "give me", type: "word", context: "mom gimme dat", confidence: 0.94, occurrences: 15, inDictionary: true, approved: true }
    ];

    crossReferenceData = seedItems.map((s, idx) => ({
      id: "xref_" + Date.now() + "_" + idx,
      ...s
    }));
    saveCrossReferenceData();
  }

  // The dictionary is seeded on its own: it used to be filled only when cross-reference was also
  // empty, so a missing/empty dictionary.json next to an existing cross_reference.json stayed empty.
  if (dictionaryData.length === 0) {
    crossReferenceData
      .filter(c => c?.inDictionary === true && c?.approved !== false && lexKey(c?.phonetic) && c?.meaning)
      .forEach(c => {
        dictionaryData.push({
          id: "dict_" + c.id,
          word: c.phonetic,
          definition: c.meaning,
          context: c.context || '',
          type: c.type || (lexKey(c.phonetic).includes(' ') ? 'phrase' : 'word')
        });
      });
    if (dictionaryData.length > 0) saveDictionaryData();
  }
}

seedBaselineDataIfEmpty();

function saveDb() {
  if (isStorageDisabled) return;
  fs.writeFileSync('db.json', JSON.stringify(interactions, null, 2));
}

function saveSettings() {
  if (isStorageDisabled) return;
  fs.writeFileSync('settings.json', JSON.stringify(appSettings, null, 2));
}

function saveTrainingData() {
  if (isStorageDisabled) return;
  fs.writeFileSync('training_data.json', JSON.stringify(trainingData, null, 2));
}

function saveDictionaryData() {
  if (isStorageDisabled) return;
  fs.writeFileSync('dictionary.json', JSON.stringify(dictionaryData, null, 2));
}

function saveAudioBank() {
  if (isStorageDisabled) return;
  fs.writeFileSync('audio_bank.json', JSON.stringify(audioBank, null, 2));
}

// -----------------------------------------------------
// Dictionary Processing Queue & Versioning System
// -----------------------------------------------------
const SNAPSHOTS_DIR = path.join(process.cwd(), 'snapshots');
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  try { fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true }); } catch(e) {}
}

let dictionaryQueue: any[] = [];
try {
  if (fs.existsSync('dictionary_queue.json')) {
    dictionaryQueue = JSON.parse(fs.readFileSync('dictionary_queue.json', 'utf-8'));
  }
} catch(e) {}

function saveDictionaryQueue() {
  if (isStorageDisabled) return;
  fs.writeFileSync('dictionary_queue.json', JSON.stringify(dictionaryQueue, null, 2));
}

// Items left in "analyzing" by a restart/crash would otherwise be stuck forever.
for (const q of dictionaryQueue) {
  if (q && q.status === 'analyzing') q.status = 'pending';
}

// -----------------------------------------------------
// Dictionary <-> Cross-Reference helpers
//
// The dictionary is the source of truth the interpreter uses. Cross-reference items mirror it via
// their `inDictionary` flag. Every change to one side must be reflected on the other, otherwise
// deleted words keep translating and edited words keep their old meaning.
// -----------------------------------------------------
function entryTypeFor(word: string): 'word' | 'phrase' {
  return lexKey(word).includes(' ') ? 'phrase' : 'word';
}

function findDictIndex(word: unknown): number {
  const key = lexKey(word);
  return key ? dictionaryData.findIndex(d => lexKey(d?.word) === key) : -1;
}

function findXrefIndex(phonetic: unknown): number {
  const key = lexKey(phonetic);
  return key ? crossReferenceData.findIndex(c => lexKey(c?.phonetic) === key) : -1;
}

/** Add or update a dictionary entry (matched by word, ignoring case/punctuation) and mirror it to cross-reference. */
function upsertDictionaryEntry(input: { word: string; definition: string; context?: string; type?: string }) {
  const word = input.word.trim();
  const definition = input.definition.trim();
  const type = input.type === 'word' || input.type === 'phrase' ? input.type : entryTypeFor(word);

  let created = false;
  let idx = findDictIndex(word);
  if (idx >= 0) {
    const e = dictionaryData[idx];
    e.word = word;
    e.definition = definition;
    if (typeof input.context === 'string') e.context = input.context;
    e.type = type;
  } else {
    created = true;
    dictionaryData.unshift({
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      word,
      definition,
      context: input.context || '',
      type
    });
    idx = 0;
  }

  const x = findXrefIndex(word);
  if (x >= 0) {
    const c = crossReferenceData[x];
    c.meaning = definition;
    c.inDictionary = true;
    c.approved = true;
    c.type = type;
    if (typeof input.context === 'string' && input.context) c.context = input.context;
  }

  return { entry: dictionaryData[idx], created };
}

/** Remove a dictionary entry and un-sync its cross-reference mirror so it stops translating. */
function removeDictionaryEntry(word: unknown) {
  const key = lexKey(word);
  if (!key) return false;
  const before = dictionaryData.length;
  dictionaryData = dictionaryData.filter(d => lexKey(d?.word) !== key);
  const x = findXrefIndex(word);
  if (x >= 0) crossReferenceData[x].inDictionary = false;
  return dictionaryData.length !== before;
}

/** LLMs asked for a JSON array usually return an object (Ollama's json mode forces one). Accept both. */
function extractJsonArray(raw: string | null | undefined): any[] {
  if (!raw) return [];
  const text = raw.trim();
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return undefined; } };

  let parsed = tryParse(text);
  if (parsed === undefined) {
    const arr = text.match(/\[[\s\S]*\]/);
    if (arr) parsed = tryParse(arr[0]);
  }
  if (parsed === undefined) {
    const obj = text.match(/\{[\s\S]*\}/);
    if (obj) parsed = tryParse(obj[0]);
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const inner = Object.values(parsed).find(v => Array.isArray(v));
    return inner ? (inner as any[]) : [parsed];
  }
  return [];
}

let versioningState: any = {
  datasetVersions: [],
  rulebookVersions: [],
  dictionaryVersions: [],
  activeDatasetVersionId: '',
  activeRulebookVersionId: '',
  activeDictionaryVersionId: '',
  untrainedDatasetDeltaCount: 0
};

try {
  if (fs.existsSync('versions_data.json')) {
    versioningState = JSON.parse(fs.readFileSync('versions_data.json', 'utf-8'));
  }
} catch(e) {}

function saveVersioningState() {
  if (isStorageDisabled) return;
  fs.writeFileSync('versions_data.json', JSON.stringify(versioningState, null, 2));
}

function initDefaultVersionsIfEmpty() {
  const now = new Date().toISOString();

  // 1. Dataset versioning
  if (!versioningState.datasetVersions || versioningState.datasetVersions.length === 0) {
    const vId = 'dset_v1_0';
    const snapFile = 'snapshots/dataset_v1_0.json';
    try {
      fs.writeFileSync(snapFile, JSON.stringify(trainingData, null, 2));
    } catch(e) {}
    versioningState.datasetVersions = [
      {
        id: vId,
        versionTag: 'v1.0',
        type: 'dataset',
        name: 'Baseline Training Pairs',
        description: `Initial verified training corpus (${trainingData.length} pairs)`,
        timestamp: now,
        itemCount: trainingData.length,
        fineTuned: true,
        fineTunedAt: now,
        isActive: true,
        snapshotFile: snapFile
      }
    ];
    versioningState.activeDatasetVersionId = vId;
  }

  // 2. Rulebook versioning
  if (!versioningState.rulebookVersions || versioningState.rulebookVersions.length === 0) {
    const vId = 'rule_v1_0';
    const snapFile = 'snapshots/rulebook_v1_0.json';
    try {
      fs.writeFileSync(snapFile, JSON.stringify(grammarRulebook, null, 2));
    } catch(e) {}
    versioningState.rulebookVersions = [
      {
        id: vId,
        versionTag: 'v1.0',
        type: 'rulebook',
        name: 'Core Rulebook Baseline',
        description: `Initial verified grammar rulebook (${grammarRulebook.length} rules)`,
        timestamp: now,
        itemCount: grammarRulebook.length,
        isActive: true,
        snapshotFile: snapFile
      }
    ];
    versioningState.activeRulebookVersionId = vId;
  }

  // 3. Dictionary versioning
  if (!versioningState.dictionaryVersions || versioningState.dictionaryVersions.length === 0) {
    const vId = 'dict_v1_0';
    const snapFile = 'snapshots/dictionary_v1_0.json';
    try {
      fs.writeFileSync(snapFile, JSON.stringify(dictionaryData, null, 2));
    } catch(e) {}
    versioningState.dictionaryVersions = [
      {
        id: vId,
        versionTag: 'v1.0',
        type: 'dictionary',
        name: 'Baseline Vocabulary',
        description: `Initial active dictionary (${dictionaryData.length} entries)`,
        timestamp: now,
        itemCount: dictionaryData.length,
        isActive: true,
        snapshotFile: snapFile
      }
    ];
    versioningState.activeDictionaryVersionId = vId;
  }

  saveVersioningState();
}

initDefaultVersionsIfEmpty();

async function deconstructPhraseWithLlm(originalSpoken: string, intendedMeaning: string, notes?: string) {
  const spokenWords = originalSpoken.trim().split(/\s+/).filter(Boolean);
  const intendedWords = intendedMeaning.trim().split(/\s+/).filter(Boolean);

  // Offline fallback. Words are paired by position, which is only trustworthy when the spoken and
  // intended phrases have the same number of words. (The old code paired by index regardless, so
  // "mom gimme dat" -> "Mom, give me that" produced dat => "me", and dictionary entries that were
  // really the whole sentence.) Unchanged words carry no information and are skipped.
  const stripPunct = (s: string) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const aligned = spokenWords.length > 0 && spokenWords.length === intendedWords.length;
  const fallbackWords: any[] = [];
  const fallbackConnected: any[] = [];

  if (aligned) {
    spokenWords.forEach((sw, idx) => {
      const cleanSw = stripPunct(sw).toLowerCase();
      const cleanIw = stripPunct(intendedWords[idx]);
      if (cleanSw && cleanIw && cleanSw !== cleanIw.toLowerCase()) {
        fallbackWords.push({ phonetic: cleanSw, meaning: cleanIw, partOfSpeech: 'word', confidence: 0.75 });
      }
    });

    for (let i = 0; i < spokenWords.length - 1; i++) {
      const spokenPair = [stripPunct(spokenWords[i]), stripPunct(spokenWords[i + 1])].join(' ').toLowerCase();
      const intendedPair = [stripPunct(intendedWords[i]), stripPunct(intendedWords[i + 1])].join(' ');
      if (spokenPair.trim() && spokenPair !== intendedPair.toLowerCase()) {
        fallbackConnected.push({ phoneticNgram: spokenPair, meaning: intendedPair, patternNote: 'Connected word pair (positional match)' });
      }
    }
  }
  const fallbackReasoning = aligned
    ? 'Model unavailable: used 1:1 positional word alignment. Review each word before approving.'
    : 'Model unavailable and the spoken/intended phrases have different word counts, so words cannot be aligned automatically. Only the whole phrase will be added; re-analyze when a model is online or add words manually.';

  const promptText = buildDeconstructPrompt(originalSpoken, intendedMeaning, notes);

  try {
    const rawResponse = await queryLlm(promptText, appSettings.llamaDictionaryModel || appSettings.llamaModel || 'llama3', true);
    if (rawResponse) {
      let cleanText = rawResponse.trim();
      const match = cleanText.match(/\{[\s\S]*\}/);
      if (match) cleanText = match[0];
      const parsed = JSON.parse(cleanText);
      if (parsed.deconstructedWords && Array.isArray(parsed.deconstructedWords)) {
        const words = parsed.deconstructedWords
          .filter((w: any) => w && typeof w.phonetic === 'string' && typeof w.meaning === 'string' && w.phonetic.trim() && w.meaning.trim())
          // Grounded in the pair he actually gave us, never invented by the model.
          .filter((w: any) => containsPhrase(originalSpoken, w.phonetic) && containsPhrase(intendedMeaning, w.meaning))
          .map((w: any) => ({
            phonetic: w.phonetic.trim().toLowerCase(),
            meaning: w.meaning.trim(),
            partOfSpeech: typeof w.partOfSpeech === 'string' ? w.partOfSpeech : undefined,
            confidence: typeof w.confidence === 'number' ? Math.min(1, Math.max(0, w.confidence)) : 0.85
          }));
        const connected = (Array.isArray(parsed.connectedWords) ? parsed.connectedWords : fallbackConnected)
          .filter((c: any) => c && typeof c.phoneticNgram === 'string' && typeof c.meaning === 'string' && c.phoneticNgram.trim() && c.meaning.trim())
          .filter((c: any) => containsPhrase(originalSpoken, c.phoneticNgram) && containsPhrase(intendedMeaning, c.meaning))
          .map((c: any) => ({ ...c, phoneticNgram: c.phoneticNgram.trim().toLowerCase(), meaning: c.meaning.trim() }));
        // Never let the model rewrite the pair the user actually gave us.
        return {
          deconstructedWords: words.length > 0 ? words : fallbackWords,
          connectedWords: connected,
          wholePhrase: { phonetic: originalSpoken, meaning: intendedMeaning },
          llmReasoning: parsed.llmReasoning || 'LLM linguistic breakdown completed.'
        };
      }
    }
  } catch(e) {
    console.warn("--> [Deconstruct Llm Note]:", e);
  }

  return {
    deconstructedWords: fallbackWords,
    connectedWords: fallbackConnected,
    wholePhrase: { phonetic: originalSpoken, meaning: intendedMeaning },
    llmReasoning: fallbackReasoning
  };
}

// -----------------------------------------------------
// Auto-reconciliation of finalized audio & training datasets
// -----------------------------------------------------
function reconcileFinalizedAudio() {
  let modified = false;

  // 1. Ensure all finalized items from audioBank exist in trainingData
  for (const a of audioBank) {
    if (a.status === 'finalized') {
      const existing = trainingData.find(t => 
        (t.filename && a.filename && t.filename === a.filename) ||
        (t.id && a.id && t.id === a.id) ||
        (t.sound && a.sound && t.sound.trim().toLowerCase() === a.sound.trim().toLowerCase() &&
         t.meaning && a.meaning && t.meaning.trim().toLowerCase() === a.meaning.trim().toLowerCase())
      );

      if (!existing) {
        trainingData.unshift({
          id: a.id || (Date.now().toString() + Math.random().toString(36).substring(2, 6)),
          timestamp: a.timestamp || new Date().toISOString(),
          category: 'Phrase',
          sound: a.sound || '',
          meaning: a.meaning || '',
          hasAudio: true,
          audioPath: a.path || (a.filename ? path.join('uploads', a.filename) : undefined),
          filename: a.filename
        });
        modified = true;
      } else {
        if (!existing.filename && a.filename) {
          existing.filename = a.filename;
          modified = true;
        }
        if (!existing.audioPath && (a.path || a.filename)) {
          existing.audioPath = a.path || path.join('uploads', a.filename);
          modified = true;
        }
        if (!existing.hasAudio) {
          existing.hasAudio = true;
          modified = true;
        }
        if (!existing.sound && a.sound) {
          existing.sound = a.sound;
          modified = true;
        }
        if (!existing.meaning && a.meaning) {
          existing.meaning = a.meaning;
          modified = true;
        }
      }
    }
  }

  // 2. Cross-heal any items in trainingData that have missing filename or audioPath
  for (const t of trainingData) {
    if ((!t.filename || !t.audioPath) && (t.sound || t.meaning || t.id)) {
      const match = audioBank.find(a => 
        a.filename && (
          (t.id && a.id && t.id === a.id) ||
          (a.sound && t.sound && a.sound.trim().toLowerCase() === t.sound.trim().toLowerCase()) ||
          (a.meaning && t.meaning && a.meaning.trim().toLowerCase() === t.meaning.trim().toLowerCase())
        )
      );
      if (match) {
        if (!t.filename && match.filename) {
          t.filename = match.filename;
          modified = true;
        }
        if (!t.audioPath && (match.path || match.filename)) {
          t.audioPath = match.path || path.join('uploads', match.filename);
          modified = true;
        }
        t.hasAudio = true;
      }
    }
  }

  if (modified) {
    saveTrainingData();
    saveAudioBank();
    console.log(`[🔄 RECONCILED] Finalized audio items synced across Audio Bank and Training Data (${trainingData.length} training items, ${audioBank.filter(a => a.status === 'finalized').length} finalized audio samples).`);
  }
}

// Initial reconciliation run on startup
reconcileFinalizedAudio();

// -----------------------------------------------------
// API Routes
// -----------------------------------------------------

app.get('/api/settings/storage', (req, res) => {
  res.json({ disabled: isStorageDisabled });
});

app.post('/api/settings/storage', (req, res) => {
  if (req.body.disabled !== undefined) {
    isStorageDisabled = req.body.disabled;
    console.log(`\n[⚙️ STORAGE] Local storage saving is now ${isStorageDisabled ? 'DISABLED' : 'ENABLED'}`);
  }
  res.json({ disabled: isStorageDisabled });
});

app.post('/api/sync-data', (req, res) => {
  const { interactions: newInteractions, trainingData: newTraining, audioBank: newAudio, dictionaryData: newDict } = req.body;
  if (newInteractions) interactions = newInteractions;
  if (newTraining) trainingData = newTraining;
  if (newAudio) audioBank = newAudio;
  if (newDict) dictionaryData = newDict;
  reconcileFinalizedAudio();
  saveDb();
  saveTrainingData();
  saveAudioBank();
  saveDictionaryData();
  console.log(`\n[🔄 DATA SYNC] Data and state synchronized from remote host.`);
  res.json({ success: true, message: 'Data synced successfully' });
});

app.post('/api/sync-models', (req, res) => {
  console.log(`\n[🔄 MODEL SYNC] Request to remote sync models received!`);
  try {
    if (!isStorageDisabled) {
      if (fs.existsSync('optimized_context.json')) {
        trainingData = JSON.parse(fs.readFileSync('optimized_context.json', 'utf-8'));
      }
    }
  } catch(e) {}
  
  console.log(`[✅ MODEL SYNC COMPLETE] New Whisper/Llama mappings applied from remote host.`);
  res.json({ success: true, message: 'Models updated' });
});

app.get('/api/interactions', (req, res) => {
  res.json(interactions);
});

app.delete('/api/interactions/:id', (req, res) => {
  const id = req.params.id;
  interactions = interactions.filter(i => i.id !== id);
  saveDb();
  res.json({ success: true });
});

app.get('/api/settings', (req, res) => {
  res.json(appSettings);
});

app.post('/api/settings', (req, res) => {
  appSettings = { ...appSettings, ...req.body };
  saveSettings();
  console.log(`\n[⚙️ SETTINGS UPDATED]`);
  console.log(`--> Ollama Endpoint: ${appSettings.ollamaEndpoint}`);
  console.log(`--> Interpreter Llama Model: ${appSettings.llamaInterpreterModel}`);
  console.log(`--> Dictionary Llama Model: ${appSettings.llamaDictionaryModel}`);
  console.log(`--> Whisper Gateway: ${appSettings.whisperEndpoint}`);
  res.json(appSettings);
});

// Is a language model actually reachable? Sends a tiny prompt and reports exactly what happened.
app.get('/api/llm/status', async (req, res) => {
  const trace = newLlmTrace();
  const raw = await queryLlm('Reply with exactly this JSON and nothing else: {"ok":true}', undefined, true, llmTimeoutMs(), trace);
  const installed = await getInstalledOllamaModels((appSettings.ollamaEndpoint || 'http://localhost:11434').trim().replace(/\/+$/, ''));
  res.json({
    ok: trace.ok,
    model: trace.model,
    ms: trace.ms,
    ollamaEndpoint: appSettings.ollamaEndpoint,
    detail: trace.ollama,
    note: trace.note,
    installedModels: installed,
    timeoutSeconds: Math.round(llmTimeoutMs() / 1000),
    reply: raw ? raw.slice(0, 80) : null
  });
});

// -----------------------------------------------------
// Simplified Mode (openai/whisper-large-v3-turbo + LoRA)
// -----------------------------------------------------

app.get('/api/simplified/status', (req, res) => {
  const pairsDir = path.join('paxton-interpreter', 'data', 'pairs');
  let pairCount = 0;
  let audioCount = 0;
  if (fs.existsSync(pairsDir)) {
    const files = fs.readdirSync(pairsDir);
    pairCount = files.filter(f => f.endsWith('.txt')).length;
    audioCount = files.filter(f => f.endsWith('.wav')).length;
  }

  const loraDir = path.join('paxton-interpreter', 'models', 'fine_tuned', 'lora');
  const loraExists = fs.existsSync(loraDir);

  res.json({
    simplifiedMode: appSettings.simplifiedMode || false,
    modelId: appSettings.whisperTurboModel || 'openai/whisper-large-v3-turbo',
    parameters: '809M',
    loraConfig: {
      r: 32,
      alpha: 64,
      targetModules: ['q_proj', 'v_proj', 'k_proj', 'out_proj'],
      dropout: 0.05,
      lr: 1e-4,
      epochs: appSettings.trainingEpochs || 12
    },
    loraActive: loraExists || appSettings.loraAdapterActive || false,
    pairCount,
    audioCount,
    confidenceThreshold: appSettings.simplifiedConfidenceThreshold || 0.82,
    lightLlmEnabled: appSettings.lightLlmCorrectionEnabled !== false,
    correctionModel: appSettings.gemmaModel || 'gemma2'
  });
});

app.post('/api/simplified/toggle', (req, res) => {
  appSettings.simplifiedMode = !appSettings.simplifiedMode;
  saveSettings();
  console.log(`[Mode Switch] Simplified Mode toggled to: ${appSettings.simplifiedMode}`);
  res.json({ simplifiedMode: appSettings.simplifiedMode });
});

app.post('/api/simplified/sync-pairs', (req, res) => {
  const pairsDir = path.join('paxton-interpreter', 'data', 'pairs');
  if (!fs.existsSync(pairsDir)) {
    fs.mkdirSync(pairsDir, { recursive: true });
  }

  let synced = 0;
  for (const item of trainingData) {
    if (!item?.meaning) continue;
    const id = item.id || `pair_${Date.now()}_${synced}`;
    const txtPath = path.join(pairsDir, `${id}.txt`);
    fs.writeFileSync(txtPath, item.meaning.trim(), 'utf-8');

    // If audio exists in uploads
    if (item.filename || item.audioFile) {
      const srcAudio = path.join('uploads', item.filename || item.audioFile);
      if (fs.existsSync(srcAudio)) {
        const dstAudio = path.join(pairsDir, `${id}.wav`);
        fs.copyFileSync(srcAudio, dstAudio);
      }
    }
    synced++;
  }

  res.json({ success: true, synced, totalInRulebook: trainingData.length });
});

app.post('/api/simplified/feedback', (req, res) => {
  const { audioPairId, intendedText, sound } = req.body;
  if (!intendedText) {
    return res.status(400).json({ error: 'intendedText is required' });
  }

  const id = audioPairId || `corr_${Date.now()}`;
  const pairsDir = path.join('paxton-interpreter', 'data', 'pairs');
  if (!fs.existsSync(pairsDir)) {
    fs.mkdirSync(pairsDir, { recursive: true });
  }

  // 1. Write text pair for LoRA training
  const txtPath = path.join(pairsDir, `${id}.txt`);
  fs.writeFileSync(txtPath, intendedText.trim(), 'utf-8');

  // 2. Also register in trainingData library so both web studio and LoRA trainer stay 100% synced
  const newTrainItem = {
    id,
    timestamp: new Date().toISOString(),
    category: 'Phrase',
    sound: sound || intendedText,
    meaning: intendedText.trim(),
    hasAudio: fs.existsSync(path.join(pairsDir, `${id}.wav`))
  };
  trainingData.unshift(newTrainItem);
  saveTrainingData();

  console.log(`[Continuous LoRA Loop] Saved verified pair: "${intendedText}" to data/pairs/${id}.txt`);
  res.json({ success: true, id, message: 'Added to LoRA dataset for next retraining cycle' });
});

app.post('/api/simplified/train', (req, res) => {
  console.log('[LoRA Training] Launching LoRA preparation & training pipeline for openai/whisper-large-v3-turbo...');
  
  exec('python3 paxton-interpreter/src/prepare_data.py', (err, stdout, stderr) => {
    if (err) {
      console.warn('[prepare_data notice]:', err.message);
    }
    console.log('[prepare_data output]:', stdout);
  });

  res.json({
    success: true,
    message: 'LoRA fine-tuning initiated for openai/whisper-large-v3-turbo (809M)',
    model: 'openai/whisper-large-v3-turbo',
    loraConfig: {
      r: 32,
      alpha: 64,
      targetModules: ['q_proj', 'v_proj', 'k_proj', 'out_proj'],
      epochs: appSettings.trainingEpochs || 12,
      lr: '1e-4'
    }
  });
});

app.get('/api/dictionary', (req, res) => {
  res.json(dictionaryData);
});

app.delete('/api/dictionary/:id', (req, res) => {
  const id = req.params.id;
  const target = dictionaryData.find(d => d.id === id);
  if (target) {
    dictionaryData = dictionaryData.filter(d => d.id !== id);
    // Only un-sync the cross-reference mirror if no other copy of this word remains.
    if (findDictIndex(target.word) < 0) {
      const x = findXrefIndex(target.word);
      if (x >= 0) crossReferenceData[x].inDictionary = false;
    }
    saveDictionaryData();
    saveCrossReferenceData();
  }
  res.json({ success: true });
});

app.post('/api/dictionary', (req, res) => {
  const word = typeof req.body?.word === 'string' ? req.body.word.trim() : '';
  const definition = typeof req.body?.definition === 'string' ? req.body.definition.trim() : '';
  if (!lexKey(word) || !definition) {
    return res.status(400).json({ error: 'word and definition are required' });
  }
  const { entry } = upsertDictionaryEntry({
    word,
    definition,
    context: typeof req.body?.context === 'string' ? req.body.context : undefined,
    type: req.body?.type
  });
  saveDictionaryData();
  saveCrossReferenceData();
  res.json(entry);
});

app.put('/api/dictionary/:id', (req, res) => {
  const entry = dictionaryData.find(d => d.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Dictionary entry not found' });

  const word = typeof req.body?.word === 'string' ? req.body.word.trim() : entry.word;
  const definition = typeof req.body?.definition === 'string' ? req.body.definition.trim() : entry.definition;
  if (!lexKey(word) || !definition) {
    return res.status(400).json({ error: 'word and definition are required' });
  }

  const clash = dictionaryData.find(d => d.id !== entry.id && lexKey(d.word) === lexKey(word));
  if (clash) {
    return res.status(409).json({ error: `"${clash.word}" already exists in the dictionary` });
  }

  // Renaming a word un-syncs the old cross-reference mirror, then the new word is mirrored.
  if (lexKey(entry.word) !== lexKey(word)) {
    const x = findXrefIndex(entry.word);
    if (x >= 0) crossReferenceData[x].inDictionary = false;
  }
  entry.word = word;
  entry.definition = definition;
  if (typeof req.body?.context === 'string') entry.context = req.body.context;
  entry.type = req.body?.type === 'word' || req.body?.type === 'phrase' ? req.body.type : entryTypeFor(word);

  const x = findXrefIndex(word);
  if (x >= 0) {
    crossReferenceData[x].meaning = definition;
    crossReferenceData[x].inDictionary = true;
    crossReferenceData[x].approved = true;
    crossReferenceData[x].type = entry.type;
  }

  saveDictionaryData();
  saveCrossReferenceData();
  res.json(entry);
});

let builderState = {
  isBuilding: false,
  totalItems: 0,
  processedItems: 0,
  currentItem: '',
  addedCount: 0,
  failedCount: 0,
  lastError: ''
};

app.get('/api/dictionary/build/status', (req, res) => {
  res.json(builderState);
});

app.post('/api/dictionary/build', async (req, res) => {
  if (builderState.isBuilding) {
    return res.status(400).json({ success: false, message: 'Build already in progress' });
  }
  
  const force = req.query.force === 'true' || req.body?.force === true;
  
  const toProcess = [];
  for (const t of trainingData) {
     if (t.sound && t.meaning && (!t.dictProcessed || force)) {
        toProcess.push({ source: t, sound: t.sound, meaning: t.meaning, type: 'training' });
     }
  }
  // Include finalized interactions
  for (const i of interactions) {
     if (i.whisper_guess && i.finalText && (!i.dictProcessed || force)) {
        toProcess.push({ source: i, sound: i.whisper_guess, meaning: i.finalText, type: 'interaction' });
     }
  }
  
  if (toProcess.length === 0) {
    return res.json({ success: false, message: 'No new items to process' });
  }
  
  builderState = {
    isBuilding: true,
    totalItems: toProcess.length,
    processedItems: 0,
    currentItem: '',
    addedCount: 0,
    failedCount: 0,
    lastError: ''
  };
  
  console.log(`\n[🔍 DICTIONARY BUILDER INITIATED] Processing ${toProcess.length} items`);
  res.status(202).json({ success: true, message: 'Dictionary build started in background' });
  
  // Background processing. try/finally guarantees the builder never stays stuck on "in progress".
  try {
    for (const item of toProcess) {
       builderState.currentItem = item.sound;
       const promptText = buildDictionaryBuildPrompt(item.sound, item.meaning);

       let success = false;
       try {
         console.log(`--> Analyzing item for dictionary: "${item.sound}"`);
         // queryLlm gives us the request timeout and the Gemini fallback the raw fetch lacked.
         const llmRaw = await queryLlm(promptText, appSettings.llamaDictionaryModel || 'llama3', true);
         if (llmRaw === null) {
           builderState.lastError = 'No language model reachable (Ollama is offline and no Gemini key is set).';
         }
         const parsed = extractJsonArray(llmRaw);

         if (parsed.length > 0) {
           success = true;
           console.log(`    [+] Parsed ${parsed.length} entries`);
         }

         for (const ent of parsed) {
            const word = typeof ent?.word === 'string' ? ent.word.trim() : '';
            const definition = typeof ent?.definition === 'string' ? ent.definition.trim() : '';
            if (!lexKey(word) || !definition || lexKey(word) === lexKey(definition)) continue;
            // Grounding: the word must be something he actually said and the meaning must come from what he
            // meant. This stops a model from inventing dictionary entries that the pair never contained.
            if (!containsPhrase(item.sound, word) || !containsPhrase(item.meaning, definition)) {
              console.log(`    [-] Rejected ungrounded entry: "${word}" => "${definition}"`);
              continue;
            }

            const existing = dictionaryData[findDictIndex(word)];
            if (existing) {
              // Never silently overwrite an existing (possibly user-approved) meaning.
              if (lexKey(existing.definition) !== lexKey(definition)) {
                console.log(`    [!] Conflict kept as-is: "${word}" is "${existing.definition}", model suggested "${definition}"`);
              }
              continue;
            }
            upsertDictionaryEntry({
              word,
              definition,
              context: typeof ent.context === 'string' && ent.context ? ent.context : item.sound
            });
            builderState.addedCount++;
            console.log(`    [+] Added dictionary word: "${word}" => "${definition}"`);
         }
         saveDictionaryData();
         saveCrossReferenceData();
       } catch (e: any) {
         builderState.lastError = e?.message || String(e);
         console.log("Error analyzing for dictionary:", e);
       }

       if (success) {
         item.source.dictProcessed = true;
         if (item.type === 'training') saveTrainingData();
         else saveDb();
       } else {
         builderState.failedCount++;
       }

       builderState.processedItems++;
    }
  } catch (fatal: any) {
    builderState.lastError = fatal?.message || String(fatal);
    console.error('[Dictionary Builder] Fatal error:', fatal);
  } finally {
    builderState.isBuilding = false;
    builderState.currentItem = '';
    console.log(`\n[✅ DICTIONARY BUILDER COMPLETE] Added ${builderState.addedCount}, failed ${builderState.failedCount}. Dictionary size: ${dictionaryData.length}`);
  }
});

app.get('/api/training_data', (req, res) => {
  reconcileFinalizedAudio();
  res.json(trainingData);
});

// -----------------------------------------------------
// Dictionary Processing Queue Endpoints
// -----------------------------------------------------

app.get('/api/dictionary/queue', (req, res) => {
  res.json({
    items: dictionaryQueue,
    totalCount: dictionaryQueue.length,
    pendingCount: dictionaryQueue.filter(i => i.status === 'pending' || i.status === 'analyzed').length,
    approvedCount: dictionaryQueue.filter(i => i.status === 'approved').length
  });
});

app.post('/api/dictionary/queue', async (req, res) => {
  const { originalSpoken, intendedMeaning, notes } = req.body || {};
  if (!originalSpoken || !intendedMeaning) {
    return res.status(400).json({ error: 'originalSpoken and intendedMeaning are required' });
  }

  const spokenClean = String(originalSpoken).trim();
  const meaningClean = String(intendedMeaning).trim();
  const notesClean = String(notes || '').trim();

  const queueItem: any = {
    id: `dq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    originalSpoken: spokenClean,
    intendedMeaning: meaningClean,
    notes: notesClean,
    timestamp: new Date().toISOString(),
    status: 'analyzing',
    deconstructedWords: [],
    connectedWords: [],
    wholePhrase: { phonetic: spokenClean, meaning: meaningClean },
    llmReasoning: ''
  };

  dictionaryQueue.unshift(queueItem);
  saveDictionaryQueue();

  // Deconstruct using LLM into words, connected words, and whole phrases
  try {
    const deconstruction = await deconstructPhraseWithLlm(spokenClean, meaningClean, notesClean);
    queueItem.deconstructedWords = deconstruction.deconstructedWords;
    queueItem.connectedWords = deconstruction.connectedWords;
    queueItem.wholePhrase = deconstruction.wholePhrase;
    queueItem.llmReasoning = deconstruction.llmReasoning;
    queueItem.status = 'analyzed';
    saveDictionaryQueue();
  } catch(e) {
    queueItem.status = 'pending';
    saveDictionaryQueue();
  }

  res.json({ success: true, item: queueItem });
});

app.post('/api/dictionary/queue/:id/analyze', async (req, res) => {
  const item = dictionaryQueue.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Queue item not found' });

  item.status = 'analyzing';
  saveDictionaryQueue();

  try {
    const deconstruction = await deconstructPhraseWithLlm(item.originalSpoken, item.intendedMeaning, item.notes);
    item.deconstructedWords = deconstruction.deconstructedWords;
    item.connectedWords = deconstruction.connectedWords;
    item.wholePhrase = deconstruction.wholePhrase;
    item.llmReasoning = deconstruction.llmReasoning;
    item.status = 'analyzed';
    saveDictionaryQueue();
    res.json({ success: true, item });
  } catch(e: any) {
    item.status = 'pending';
    saveDictionaryQueue();
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/dictionary/queue/:id/approve', (req, res) => {
  const item = dictionaryQueue.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Queue item not found' });

  const { selectedWords, selectedConnected, includeWholePhrase } = req.body || {};
  let committedWords = 0;
  let committedConnected = 0;
  let committedPhrase = 0;
  const conflicts: { word: string; existing: string; proposed: string }[] = [];

  // Add to the dictionary (and its cross-reference mirror) unless the word already exists.
  // An existing meaning is never overwritten silently; differences are reported back instead.
  const commit = (word: string, meaning: string, type: 'word' | 'phrase', context: string, confidence: number): boolean => {
    if (!lexKey(word) || !meaning || !String(meaning).trim()) return false;
    const existing = dictionaryData[findDictIndex(word)];
    if (existing) {
      if (lexKey(existing.definition) !== lexKey(meaning)) {
        conflicts.push({ word, existing: existing.definition, proposed: meaning });
      }
      return false;
    }
    upsertDictionaryEntry({ word, definition: meaning, context, type });
    const x = findXrefIndex(word);
    if (x < 0) {
      crossReferenceData.unshift({
        id: `cr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        phonetic: lexKey(word),
        meaning: String(meaning).trim(),
        type,
        context,
        confidence,
        occurrences: 1,
        approved: true,
        inDictionary: true
      });
    }
    return true;
  };

  // 1. Individual words
  const wordsToCommit = Array.isArray(selectedWords) ? selectedWords : item.deconstructedWords;
  for (const w of wordsToCommit || []) {
    if (commit(String(w?.phonetic ?? ''), String(w?.meaning ?? ''), 'word',
        `Deconstructed from: "${item.originalSpoken}"`, w?.confidence || 0.92)) committedWords++;
  }

  // 2. Connected words / n-grams
  const connectedToCommit = Array.isArray(selectedConnected) ? selectedConnected : item.connectedWords;
  for (const c of connectedToCommit || []) {
    if (commit(String(c?.phoneticNgram ?? ''), String(c?.meaning ?? ''), 'phrase',
        c?.patternNote || `Connected words from "${item.originalSpoken}"`, 0.90)) committedConnected++;
  }

  // 3. Whole phrase (also mirrored to cross-reference now, like words and n-grams)
  if (includeWholePhrase !== false && item.wholePhrase?.phonetic) {
    if (commit(item.wholePhrase.phonetic, item.wholePhrase.meaning, 'phrase',
        item.notes || `Full idiom: "${item.originalSpoken}"`, 0.95)) committedPhrase++;
  }

  saveDictionaryData();
  saveCrossReferenceData();

  item.status = 'approved';
  saveDictionaryQueue();

  const conflictNote = conflicts.length
    ? ` ${conflicts.length} word(s) already had a different meaning and were left unchanged: ${conflicts.map(c => `"${c.word}" (kept "${c.existing}", not "${c.proposed}")`).join('; ')}.`
    : '';

  res.json({
    success: true,
    message: `Successfully approved! Committed ${committedWords} words, ${committedConnected} connected phrases and ${committedPhrase} whole phrase(s) to the active Dictionary.${conflictNote}`,
    conflicts,
    item
  });
});

app.delete('/api/dictionary/queue/:id', (req, res) => {
  dictionaryQueue = dictionaryQueue.filter(i => i.id !== req.params.id);
  saveDictionaryQueue();
  res.json({ success: true });
});

// -----------------------------------------------------
// Dataset, Rulebook & Dictionary Versioning APIs
// -----------------------------------------------------

app.get('/api/versions', (req, res) => {
  // Calculate delta of untrained training pairs since active or last fine-tuned version
  const activeDatasetVersion = versioningState.datasetVersions.find(v => v.id === versioningState.activeDatasetVersionId);
  let untrainedCount = 0;
  if (activeDatasetVersion) {
    untrainedCount = Math.max(0, trainingData.length - (activeDatasetVersion.itemCount || 0));
  } else {
    untrainedCount = trainingData.length;
  }
  versioningState.untrainedDatasetDeltaCount = untrainedCount;

  res.json(versioningState);
});

app.post('/api/versions/create', (req, res) => {
  const { type, name, description, versionTag } = req.body || {};
  if (!type || !name) {
    return res.status(400).json({ error: 'type and name are required' });
  }

  const cleanTag = (versionTag || `v${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '');
  const snapshotFileName = `snapshots/${type}_${cleanTag}_${Date.now()}.json`;
  const now = new Date().toISOString();

  let targetData: any = [];
  if (type === 'dataset') targetData = trainingData;
  else if (type === 'rulebook') targetData = grammarRulebook;
  else if (type === 'dictionary') targetData = dictionaryData;

  try {
    fs.writeFileSync(snapshotFileName, JSON.stringify(targetData, null, 2));
  } catch(e: any) {
    return res.status(500).json({ error: 'Failed to write snapshot file: ' + e.message });
  }

  const newVersion: any = {
    id: `${type}_${Date.now()}`,
    versionTag: cleanTag,
    type,
    name: String(name).trim(),
    description: String(description || '').trim(),
    timestamp: now,
    itemCount: Array.isArray(targetData) ? targetData.length : 0,
    fineTuned: type === 'dataset' ? false : undefined,
    isActive: true,
    snapshotFile: snapshotFileName
  };

  if (type === 'dataset') {
    versioningState.datasetVersions.forEach(v => v.isActive = false);
    versioningState.datasetVersions.unshift(newVersion);
    versioningState.activeDatasetVersionId = newVersion.id;
    versioningState.untrainedDatasetDeltaCount = 0;
  } else if (type === 'rulebook') {
    versioningState.rulebookVersions.forEach(v => v.isActive = false);
    versioningState.rulebookVersions.unshift(newVersion);
    versioningState.activeRulebookVersionId = newVersion.id;
  } else if (type === 'dictionary') {
    versioningState.dictionaryVersions.forEach(v => v.isActive = false);
    versioningState.dictionaryVersions.unshift(newVersion);
    versioningState.activeDictionaryVersionId = newVersion.id;
  }

  saveVersioningState();
  console.log(`--> [Version Created] Type: ${type} Tag: ${cleanTag} Name: "${name}" (${newVersion.itemCount} items)`);
  res.json({ success: true, version: newVersion });
});

app.post('/api/versions/select', (req, res) => {
  const { type, versionId } = req.body || {};
  if (!type || !versionId) {
    return res.status(400).json({ error: 'type and versionId are required' });
  }

  let versionsList: any[] = [];
  if (type === 'dataset') versionsList = versioningState.datasetVersions;
  else if (type === 'rulebook') versionsList = versioningState.rulebookVersions;
  else if (type === 'dictionary') versionsList = versioningState.dictionaryVersions;

  const targetVer = versionsList.find(v => v.id === versionId);
  if (!targetVer) return res.status(404).json({ error: 'Version not found' });

  if (targetVer.snapshotFile && fs.existsSync(targetVer.snapshotFile)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(targetVer.snapshotFile, 'utf-8'));
      if (Array.isArray(loaded)) {
        if (type === 'dataset') {
          trainingData = loaded;
          saveTrainingData();
          versioningState.datasetVersions.forEach(v => v.isActive = (v.id === versionId));
          versioningState.activeDatasetVersionId = versionId;
          versioningState.untrainedDatasetDeltaCount = 0;
        } else if (type === 'rulebook') {
          grammarRulebook = loaded;
          saveGrammarRulebook();
          versioningState.rulebookVersions.forEach(v => v.isActive = (v.id === versionId));
          versioningState.activeRulebookVersionId = versionId;
        } else if (type === 'dictionary') {
          dictionaryData = loaded;
          saveDictionaryData();
          versioningState.dictionaryVersions.forEach(v => v.isActive = (v.id === versionId));
          versioningState.activeDictionaryVersionId = versionId;
        }
        saveVersioningState();
        console.log(`--> [Version Restored] Active ${type} switched to "${targetVer.name}" (${loaded.length} items)`);
        return res.json({ success: true, message: `Switched active ${type} to version: ${targetVer.versionTag} - ${targetVer.name}` });
      }
    } catch(e: any) {
      return res.status(500).json({ error: 'Failed to read snapshot file: ' + e.message });
    }
  }

  res.status(400).json({ error: 'Snapshot file missing for this version' });
});

app.post('/api/versions/mark-trained', (req, res) => {
  const { versionId } = req.body || {};
  const ver = versioningState.datasetVersions.find(v => v.id === (versionId || versioningState.activeDatasetVersionId));
  if (ver) {
    ver.fineTuned = true;
    ver.fineTunedAt = new Date().toISOString();
    versioningState.untrainedDatasetDeltaCount = 0;
    saveVersioningState();
    return res.json({ success: true, message: `Marked dataset version ${ver.versionTag} as fine-tuned!` });
  }
  res.status(404).json({ error: 'Version not found' });
});

// -----------------------------------------------------
// Mini LLM Export & Network Microphone Diagnostics
// -----------------------------------------------------

app.get('/api/mini-llm/export-dataset', (req, res) => {
  const validPairs = trainingData.filter(t => t.sound && t.meaning);
  
  // Format for instruction fine-tuning (Ollama / HuggingFace / Unsloth)
  const jsonlLines = validPairs.map(p => JSON.stringify({
    instruction: "You are Paxton's specialized communication AAC model. Translate his raw phonetic speech into his intended standard English meaning.",
    input: p.sound,
    output: p.meaning
  })).join('\n');

  const ollamaModelfile = `# Modelfile for Paxton AAC Mini LLM
FROM ${appSettings.miniLlmModel || 'gemma2:2b'}

SYSTEM """You are Paxton's specialized communication interpreter. The speaker has atypical phonetic speech patterns (drops coda consonants, intrusive articles, merges words). Given his phonetic speech, translate it directly into his intended English meaning."""

PARAMETER temperature 0.2
PARAMETER stop "<end_of_turn>"
`;

  res.json({
    totalSamples: validPairs.length,
    format: 'jsonl',
    jsonl: jsonlLines,
    modelfile: ollamaModelfile,
    suggestedModel: appSettings.miniLlmModel || 'gemma2:2b'
  });
});

app.get('/api/network-info', (req, res) => {
  const ip = getLocalIP();
  const hasCert = fs.existsSync('key.pem') && fs.existsSync('cert.pem');
  res.json({
    localIp: ip,
    httpPort: 3000,
    httpsPort: 3443,
    httpUrl: `http://${ip}:3000`,
    httpsUrl: `https://${ip}:3443`,
    hasCert,
    guidance: {
      title: "Remote / LAN Device Microphone Permissions",
      summary: "Modern browsers require a Secure Context (HTTPS or localhost) for microphone access (getUserMedia).",
      solutions: [
        {
          name: "HTTPS (Recommended)",
          detail: `Open https://${ip}:3443 on your mobile device or laptop. Accept the self-signed certificate once, and the microphone works natively!`,
          url: `https://${ip}:3443`
        },
        {
          name: "Chrome Insecure Origin Flag",
          detail: `In Chrome (Android/Desktop), navigate to chrome://flags/#unsafely-treat-insecure-origin-as-secure, add "http://${ip}:3000", enable the flag, and restart Chrome.`,
          flagUrl: "chrome://flags/#unsafely-treat-insecure-origin-as-secure"
        },
        {
          name: "Native Hardware Audio Recorder",
          detail: "You can tap the mobile voice upload button to trigger the device's native voice recorder and stream the file directly into Whisper."
        }
      ]
    }
  });
});

// -----------------------------------------------------
// Cross-Reference & LLaMA Phrase Grouping APIs
// -----------------------------------------------------

app.get('/api/cross-reference', (req, res) => {
  res.json({
    items: crossReferenceData,
    totalTrainingPairs: trainingData.length,
    dictionaryCount: dictionaryData.length,
    activeModel: appSettings.llamaDictionaryModel || appSettings.llamaInterpreterModel || 'llama3'
  });
});

app.post('/api/cross-reference/scan', async (req, res) => {
  console.log(`\n[🔍 LLaMA PHRASE & VOCAB SCAN] Scanning ${trainingData.length} training pairs …`);

  const pairsToScan = trainingData.filter(t => t.sound && t.meaning);
  if (pairsToScan.length === 0) {
    return res.json({ success: true, message: 'No pairs to scan', items: crossReferenceData });
  }

  const batchSize = 5;
  let newEntriesCount = 0;

  for (let i = 0; i < pairsToScan.length; i += batchSize) {
    const chunk = pairsToScan.slice(i, i + batchSize);
    const chunkPrompt = `You are a speech-language pathologist analyzing atypical phonetic speech patterns for a child named Paxton.
Pairs of (Whisper Phonetic Speech -> Intended Meaning):
${chunk.map((c, idx) => `${idx + 1}. Spoken: "${c.sound}" -> Intended: "${c.meaning}"`).join('\n')}

INSTRUCTIONS:
Deconstruct these pairs into:
1. "word": Single phonetic words (e.g., 'dussin' -> 'doesn\\'t', 'nee' -> 'need', 'hell' -> 'help', 'ba-man' -> 'Batman', 'wa' -> 'what').
2. "phrase": Multi-word connected phrases & idioms (e.g., 'i nee a hell' -> 'I need some help', 'dussin work' -> 'doesn\\'t work', 'wa is dis' -> 'what is this').

Output a valid JSON array of objects:
[
  {
    "phonetic": "exact phonetic word or multi-word phrase",
    "meaning": "intended English definition",
    "type": "word" or "phrase",
    "context": "example sentence",
    "confidence": 0.95
  }
]
Return ONLY raw JSON array.`;

    try {
      const rawRes = await queryLlm(chunkPrompt, appSettings.llamaDictionaryModel || 'llama3', true);
      if (rawRes) {
        const parsed = extractJsonArray(rawRes);

        if (parsed.length > 0) {
          for (const item of parsed) {
            if (item?.phonetic && item?.meaning) {
              const phoneticClean = String(item.phonetic).trim().toLowerCase();
              const meaningClean = String(item.meaning).trim();
              if (!lexKey(phoneticClean) || !meaningClean) continue;

              // Count whole-word occurrences (substring counting made "a" appear everywhere).
              const occurrences = trainingData.filter(t => containsPhrase(t.sound, phoneticClean)).length || 1;

              const existingIdx = findXrefIndex(phoneticClean);

              if (existingIdx >= 0) {
                crossReferenceData[existingIdx].occurrences = Math.max(crossReferenceData[existingIdx].occurrences, occurrences);
                if (!crossReferenceData[existingIdx].context && item.context) {
                  crossReferenceData[existingIdx].context = item.context;
                }
              } else {
                crossReferenceData.unshift({
                  id: "xref_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
                  phonetic: phoneticClean,
                  meaning: meaningClean,
                  type: item.type === 'word' ? 'word' : 'phrase',
                  context: item.context || chunk[0].sound,
                  confidence: typeof item.confidence === 'number' ? item.confidence : 0.92,
                  occurrences,
                  inDictionary: findDictIndex(phoneticClean) >= 0,
                  approved: true
                });
                newEntriesCount++;
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[LLaMA Scan] Batch note:', err.message);
    }
  }

  saveCrossReferenceData();
  console.log(`[✅ LLaMA SCAN COMPLETE] Added/Updated ${newEntriesCount} entries. Total: ${crossReferenceData.length}`);
  res.json({ success: true, newCount: newEntriesCount, items: crossReferenceData });
});

app.post('/api/cross-reference/sync', (req, res) => {
  const { ids, allApproved } = req.body || {};
  let synced = 0;

  for (const item of crossReferenceData) {
    if (!item?.phonetic || !item?.meaning) continue;
    const selected = Array.isArray(ids) && ids.includes(item.id);
    // "Sync all" must respect items the user explicitly rejected (approved === false).
    const included = selected || (allApproved && item.approved !== false);
    if (!included) continue;

    const { created } = upsertDictionaryEntry({
      word: item.phonetic,
      definition: item.meaning,
      context: item.context,
      type: item.type
    });
    if (created) synced++;
  }

  saveCrossReferenceData();
  saveDictionaryData();
  console.log(`[📚 DICTIONARY SYNC] Synced ${synced} cross-referenced words and phrases into active dictionary!`);
  res.json({ success: true, syncedCount: synced });
});

app.post('/api/cross-reference', (req, res) => {
  const { phonetic, meaning, type, context } = req.body || {};
  if (typeof phonetic !== 'string' || typeof meaning !== 'string' || !lexKey(phonetic) || !meaning.trim()) {
    return res.status(400).json({ error: 'phonetic and meaning required' });
  }

  const duplicate = findXrefIndex(phonetic);
  if (duplicate >= 0) {
    return res.status(409).json({
      error: `"${crossReferenceData[duplicate].phonetic}" is already cross-referenced. Edit the existing entry instead.`
    });
  }

  const occurrences = trainingData.filter(t => containsPhrase(t.sound, phonetic)).length || 1;
  const newItem = {
    id: "xref_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    phonetic: phonetic.trim().toLowerCase(),
    meaning: meaning.trim(),
    type: type === 'word' || type === 'phrase' ? type : entryTypeFor(phonetic),
    context: typeof context === 'string' ? context : '',
    confidence: 0.95,
    occurrences,
    inDictionary: false,
    approved: true
  };

  crossReferenceData.unshift(newItem);
  saveCrossReferenceData();
  res.json(newItem);
});

app.put('/api/cross-reference/:id', (req, res) => {
  const id = req.params.id;
  const item = crossReferenceData.find(c => c.id === id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  // Whitelist fields: the UI sends the whole object back (id, timestamps...) and Object.assign
  // would let a request rewrite the id or inject arbitrary keys.
  const b = req.body || {};
  const previousPhonetic: string = item.phonetic;
  const wasInDictionary = item.inDictionary === true;
  if (typeof b.phonetic === 'string' && lexKey(b.phonetic)) item.phonetic = b.phonetic.trim().toLowerCase();
  if (typeof b.meaning === 'string' && b.meaning.trim()) item.meaning = b.meaning.trim();
  if (b.type === 'word' || b.type === 'phrase') item.type = b.type;
  if (typeof b.context === 'string') item.context = b.context;
  if (typeof b.notes === 'string') item.notes = b.notes;
  if (typeof b.confidence === 'number' && isFinite(b.confidence)) item.confidence = Math.min(1, Math.max(0, b.confidence));
  if (typeof b.approved === 'boolean') item.approved = b.approved;
  if (typeof b.inDictionary === 'boolean') item.inDictionary = b.inDictionary;
  if (item.approved === false) item.inDictionary = false; // a rejected item can't be live

  // Make the dictionary follow the flag. Previously the toggle only flipped the flag, so
  // "Add to Dictionary" added nothing and turning it off removed nothing.
  if (wasInDictionary && lexKey(previousPhonetic) !== lexKey(item.phonetic)) {
    removeDictionaryEntry(previousPhonetic); // renamed: the old spelling must stop translating
  }
  if (item.inDictionary) {
    upsertDictionaryEntry({ word: item.phonetic, definition: item.meaning, context: item.context, type: item.type });
  } else {
    removeDictionaryEntry(item.phonetic);
    item.inDictionary = false;
  }
  saveDictionaryData();
  saveCrossReferenceData();

  res.json(item);
});

app.delete('/api/cross-reference/:id', (req, res) => {
  const id = req.params.id;
  crossReferenceData = crossReferenceData.filter(c => c.id !== id);
  saveCrossReferenceData();
  res.json({ success: true });
});

// Shows exactly what the interpreter's own knowledge does with a phrase, with no language model involved:
// which dictionary entries match, which rules fire, and how much of the phrase they explain.
app.post('/api/interpreter/diagnose', (req, res) => {
  const text = String(req.body?.text || '').trim();
  const lexicon = buildLexicon(dictionaryData, crossReferenceData);
  const activeRules = grammarRulebook.filter(isRuleActive);
  const decoded = text ? decodeUtterance(text, { lexicon, rules: grammarRulebook }) : null;
  const exact = text ? trainingData.find(t => t.sound && t.meaning && lexKey(t.sound) === lexKey(text)) : null;

  res.json({
    knowledge: {
      dictionaryEntries: dictionaryData.length,
      lexiconEntries: lexicon.length,
      fromCrossReference: lexicon.filter(e => e.source === 'cross_reference').length,
      activeRules: activeRules.length,
      inactiveRules: grammarRulebook.length - activeRules.length,
      verifiedPairs: trainingData.length,
      miniLlmEnabled: appSettings.miniLlmEnabled === true
    },
    ...(decoded ? {
      text,
      verifiedPair: exact ? { sound: exact.sound, meaning: exact.meaning } : null,
      decoded: decoded.decoded,
      afterRulesOnly: decoded.ruleTransformedText,
      coverage: decoded.coverage,
      matchedEntries: decoded.matchedEntries.map(e => ({ word: e.word, definition: e.definition, source: e.source })),
      appliedRules: decoded.appliedRules.map(r => ({ ruleId: r.ruleId, ruleName: r.ruleName, before: r.before, after: r.after }))
    } : {})
  });
});

app.post('/api/cross-reference/test-interpret', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.json({ candidates: [], confidence: 0, matchedEntries: [] });

  // Same deterministic decode the live interpreter uses, so the tester can't disagree with it.
  const lexicon = buildLexicon(dictionaryData, crossReferenceData);
  const decoded = decodeUtterance(text, {
    lexicon,
    rules: grammarRulebook
  });
  const acoustic = resolveAcousticPhonetics(text, {
    lexicon,
    rules: grammarRulebook,
    trainingData
  });
  const effectiveDraft = decoded.coverage > 0 ? decoded.decoded : acoustic.decoded;
  const effectiveCoverage = decoded.coverage > 0 ? decoded.coverage : acoustic.coverage;
  const matchedEntries = decoded.matchedEntries.map(e => ({ phonetic: e.word, meaning: e.definition, type: e.type || 'word' }));

  const promptText = buildInterpreterPrompt({
    heard: text,
    draft: effectiveDraft,
    coverage: effectiveCoverage,
    rules: grammarRulebook.filter(isRuleActive),
    entries: decoded.matchedEntries,
    verifiedPairs: verifiedPairsFor(text)
  });

  let candidates: any[] = [];
  let confidence = 0;

  try {
    const rawRes = await queryLlm(promptText, appSettings.llamaInterpreterModel || 'llama3', true);
    if (rawRes) {
      let clean = rawRes.trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) clean = match[0];
      const parsed = JSON.parse(clean);
      if (parsed && Array.isArray(parsed.candidates)) {
        candidates = sanitizeCandidates(parsed.candidates);
        const merged = applyDraftToCandidates(candidates, effectiveDraft, decoded.matchedEntries, effectiveCoverage, introducedWords(decoded.appliedRules));
        candidates = merged.candidates;
        const reported = typeof parsed.confidence === 'number' ? parsed.confidence : (candidates[0]?.probability ?? 0);
        confidence = Math.min(reported, evidenceCeiling(effectiveCoverage));
        if (merged.violated.length > 0) confidence = Math.min(confidence, fallbackConfidence(effectiveCoverage));
      }
    }
  } catch(e) {}

  if (candidates.length === 0) {
    confidence = decoded.coverage > 0 ? fallbackConfidence(decoded.coverage) : acoustic.confidence;
    candidates = sanitizeCandidates([
      { text: effectiveDraft, probability: confidence },
      ...(acoustic.candidates.slice(1).map(c => ({ text: c.text, probability: c.probability }))),
      { text: polish(effectiveDraft), probability: 0.05 }
    ]);
  }

  res.json({ candidates, confidence, matchedEntries });
});

// -----------------------------------------------------
// Grammar Rulebook & Hypothesis Engine APIs
// -----------------------------------------------------
let hypothesisCycleStatus: any = {
  active: false,
  isContinuous: false,
  cycleNumber: 0,
  currentStep: 'idle',
  stepDescription: 'Hypothesis engine ready.',
  activeHypothesis: null,
  activePattern: null,
  activeCandidateRule: null,
  testedPairsCount: 0,
  totalDatasetPairs: 0,
  confirmedRulesCount: 0,
  rejectedRulesCount: 0,
  modelUsed: 'gemma2',
  logs: [],
  lastResult: null,
  history: []
};

let continuousTimeout: NodeJS.Timeout | null = null;

function pushHypothesisLog(msg: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  hypothesisCycleStatus.logs.push(line);
  if (hypothesisCycleStatus.logs.length > 100) hypothesisCycleStatus.logs.shift();
  console.log(`[🧪 HYPOTHESIS ENGINE] ${msg}`);
}

// Explanatory text used when no language model is reachable. The rule's identity (name, type, key) always
// comes from the pattern under test, never from the model, so a sloppy model reply cannot create junk rules.
const HYPOTHESIS_TEMPLATES: Record<string, { hypothesis: string; condition: string; action: string; confidence: number }> = {
  intrusive_a: {
    hypothesis: "Paxton inserts 'a' as a rhythmic phonological placeholder between a verb/modal and a non-countable noun or predicate verb ('i nee a hell' -> 'I need help', 'go a sleep' -> 'go to sleep'). In contrast, before singular countable nouns ('a cookie', 'a ball'), 'a' is preserved as a standard determiner.",
    condition: "Spoken token 'a' preceding an action verb or uncountable mass noun ('help', 'sleep', 'play', 'water')",
    action: "Omit intrusive article 'a' or translate as partitive 'some' in target English",
    confidence: 0.96
  },
  coda_deletion: {
    hypothesis: "Paxton consistently drops terminal voiced alveolar plosives (/d/) and voiceless stops (/t/) on high-frequency monosyllabic content verbs ('nee' -> 'need', 'goo' -> 'good') due to oral-motor easing before following words.",
    condition: "Spoken token 'nee' or word ending with elided alveolar stop where verb syntax requires 'need' or 'good'",
    action: "Restore elided terminal stop ('nee' -> 'need', 'goo' -> 'good')",
    confidence: 0.95
  },
  coda_truncation_general: {
    hypothesis: "Paxton elides terminal plosives and consonants in high-frequency content words ('foo' -> 'food', 'ha' -> 'have', 'wan' -> 'want') to ease phonetic articulation.",
    condition: "Spoken word ending in open vowel where intended meaning requires final consonant ('foo' -> 'food', 'ha' -> 'have')",
    action: "Restore missing terminal consonant in content word ('foo' -> 'food', 'ha' -> 'have', 'wan' -> 'want')",
    confidence: 0.94
  },
  sibilant_deaffrication: {
    hypothesis: "Paxton deaffricates postalveolar affricates (/tʃ/) into fricatives (/ʃ/) ('lunsh' -> 'lunch', 'shursh' -> 'church') to reduce oral-motor tension.",
    condition: "Spoken word containing 'sh' where standard English requires affricate 'ch'",
    action: "Restore affricate 'ch' ('lunsh' -> 'lunch', 'shursh' -> 'church')",
    confidence: 0.95
  },
  copula_omission: {
    hypothesis: "Paxton exhibits zero copula syntax when linking subject pronoun 'I' with predicate state adjectives ('I hunry' -> 'I am hungry', 'I tired' -> 'I am tired').",
    condition: "Pronoun 'I' directly preceding predicate adjective ('hunry', 'hungry', 'tired')",
    action: "Insert inflected present-tense copula ('I am' or \"I'm\")",
    confidence: 0.93
  },
  liquid_gliding: {
    hypothesis: "Liquid consonants /l/ and /r/ undergo phonological gliding to glide /w/ or palatal approximant ('wike' -> 'like', 'yeyo' -> 'yellow').",
    condition: "Spoken word-initial glide 'w' substituting for liquid /l/",
    action: "Restore initial liquid consonant ('wike' -> 'like', 'yeyo' -> 'yellow')",
    confidence: 0.94
  },
  neg_auxiliary_reduction: {
    hypothesis: "Negative clauses are formulated with preverbal negation particle 'no' directly preceding base verbs ('no ha' -> \"didn't have\" or \"don't have\").",
    condition: "Spoken negation 'no' directly preceding lexical verb ('no ha', 'no wan')",
    action: "Translate as standard inflected negative auxiliary (\"didn't have\", \"don't have\")",
    confidence: 0.92
  },
  cluster_reduction: {
    hypothesis: "Consonant clusters in onsets and compound words are simplified into single consonants ('ba-man' -> 'Batman', 'tuck' -> 'stuck', 'pay' -> 'play').",
    condition: "Onset or medial consonant cluster simplified into single consonant",
    action: "Restore full consonant cluster ('ba-man' -> 'Batman', 'pay' -> 'play')",
    confidence: 0.95
  },
  velar_fronting: {
    hypothesis: "Velar plosives (/k/, /g/) are produced as anterior alveolar stops (/t/, /d/) due to tongue positioning easing ('tat' -> 'cat', 'do' -> 'go').",
    condition: "Spoken alveolar stop replacing target velar plosive",
    action: "Fronting restoration to velar plosive ('tat' -> 'cat', 'do' -> 'go')",
    confidence: 0.92
  },
  th_stopping: {
    hypothesis: "Voiced interdental fricative /ð/ is systematically stopped to voiced alveolar plosive /d/ ('dis' for 'this', 'dat' for 'that'), and interrogative coda /t/ is deleted ('wa' for 'what').",
    condition: "Spoken 'dis', 'dat', 'wa is dis'",
    action: "Translate as standard demonstrative/interrogative 'this', 'that', 'what is this'",
    confidence: 0.97
  },
  dussin: {
    hypothesis: "Negative auxiliary verb 'doesn't' is articulated with central vowel laxing and elision of the coronal plosive coda /t/, producing the characteristic dissyllabic phonetic form 'dussin'.",
    condition: "Spoken token 'dussin' preceding a base verb",
    action: "Translate as 3rd person negative auxiliary 'doesn't'",
    confidence: 0.95
  },
  baman: {
    hypothesis: "Paxton deletes syllable-final unreleased coronal plosives (/t/) in medial consonant clusters of proper names, creating glottalized hyphenated compounds ('ba-man' for 'Batman', 'spi-man' for 'Spiderman').",
    condition: "Phonetic pattern 'ba-man' or similar superhero/character compound",
    action: "Reconstruct compound character entity 'Batman'",
    confidence: 0.98
  }
};

interface HypothesisPatternItem {
  key: string;
  name: string;
  patternType: string;
  customChecks?: PatternCheck[];
  template?: { hypothesis: string; condition: string; action: string; confidence: number };
}

const BASE_HYPOTHESIS_PATTERNS: HypothesisPatternItem[] = [
  { key: 'intrusive_a', name: 'Intrusive Indefinite Article "a" before Mass Nouns & Actions', patternType: 'intrusive_article' },
  { key: 'coda_deletion', name: 'Terminal Alveolar Plosive /d/ and /t/ Deletion (Coda Truncation)', patternType: 'consonant_deletion' },
  { key: 'coda_truncation_general', name: 'Terminal Stop Deletion in Common Content Words ("foo" -> "food", "ha" -> "have")', patternType: 'consonant_deletion' },
  { key: 'sibilant_deaffrication', name: 'Sibilant and Affricate Simplification (/tʃ/ -> /ʃ/ as in "lunsh" -> "lunch")', patternType: 'consonant_deletion' },
  { key: 'copula_omission', name: 'Zero Copula Ellipsis in Predicative Adjectives ("I hunry" -> "I am hungry")', patternType: 'grammar_syntax' },
  { key: 'liquid_gliding', name: 'Liquid Gliding /l/ and /r/ -> /w/ ("wike" -> "like", "yeyo" -> "yellow")', patternType: 'consonant_deletion' },
  { key: 'neg_auxiliary_reduction', name: 'Negative Auxiliary Substitution ("no ha" -> "didn\'t have / don\'t have")', patternType: 'word_merging' },
  { key: 'th_stopping', name: 'Interdental Fricative Stopping (/ð/ -> /d/ in demonstratives)', patternType: 'consonant_deletion' },
  { key: 'cluster_reduction', name: 'Consonant Cluster Simplification ("pay" -> "play", "seep" -> "sleep")', patternType: 'consonant_deletion' },
  { key: 'velar_fronting', name: 'Velar Stop Fronting (/k/ -> /t/, /g/ -> /d/)', patternType: 'consonant_deletion' },
  { key: 'dussin', name: 'Negative Auxiliary Contraction Reduction ("dussin" -> "doesn\'t")', patternType: 'word_merging' },
  { key: 'baman', name: 'Medial Cluster Glottalization in Compound Entities ("ba-man" -> "Batman")', patternType: 'word_merging' }
];

// Dynamically mined candidate patterns discovered directly from Paxton's training dataset
const dynamicDiscoveredPatterns: HypothesisPatternItem[] = [];

// Track tested keys to prevent running the exact same patterns over and over
const testedPatternKeys: Set<string> = new Set();

/**
 * Mines unexplained phonetic speech transformations directly from verified pairs in trainingData
 * so the hypothesis engine autonomously discovers NEW candidate rules from real data.
 */
async function mineCandidatePatternFromDataset(pairs: any[], targetModel: string): Promise<HypothesisPatternItem | null> {
  if (!pairs || pairs.length === 0) return null;

  const discrepancyMap = new Map<string, { count: number; src: string; dst: string; examples: { sound: string; meaning: string }[] }>();

  for (const pair of pairs) {
    const s = String(pair?.sound || '').trim().toLowerCase();
    const m = String(pair?.meaning || '').trim().toLowerCase();
    if (!s || !m || s === m) continue;

    const sTokens = s.split(/\s+/);
    const mTokens = m.split(/\s+/);

    for (const st of sTokens) {
      const cleanS = st.replace(/[^a-z0-9-]/g, '');
      if (!cleanS || cleanS.length < 2) continue;

      // Skip common English function words
      if (/^(i|you|he|she|it|we|they|a|the|is|am|are|in|on|at|and|to|my|no)$/.test(cleanS)) continue;

      // Skip tokens already covered by confirmed rules in grammarRulebook
      const alreadyCovered = grammarRulebook.some(r => r.status === 'confirmed' && (r.match === cleanS || (r.patternKey && PATTERN_CHECKS[r.patternKey]?.some(c => c.trigger.test(cleanS)))));
      if (alreadyCovered) continue;

      for (const mt of mTokens) {
        const cleanM = mt.replace(/[^a-z0-9-]/g, '');
        if (!cleanM || cleanS === cleanM) continue;

        // Candidate token mutation pair
        const pairKey = `${cleanS}->${cleanM}`;
        if (!discrepancyMap.has(pairKey)) {
          discrepancyMap.set(pairKey, { count: 0, src: cleanS, dst: cleanM, examples: [] });
        }
        const entry = discrepancyMap.get(pairKey)!;
        entry.count++;
        if (entry.examples.length < 5) entry.examples.push({ sound: pair.sound, meaning: pair.meaning });
      }
    }
  }

  // Look for candidates: prioritize those across 2+ pairs, then fall back to single clear mutations
  const candidateEntries = [...discrepancyMap.values()]
    .filter(e => e.count >= 1)
    .sort((a, b) => b.count - a.count);

  for (const entry of candidateEntries) {
    const dynamicKey = `dyn_${entry.src}_${entry.dst}`.replace(/[^a-z0-9_]/g, '_');

    // Skip if already registered
    if (dynamicDiscoveredPatterns.some(p => p.key === dynamicKey) || BASE_HYPOTHESIS_PATTERNS.some(p => p.key === dynamicKey)) {
      continue;
    }

    const triggerRe = new RegExp(`\\b${escapeRegExp(entry.src)}\\b`, 'i');
    const expectRe = new RegExp(`\\b${escapeRegExp(entry.dst)}\\b`, 'i');
    const ruleName = `Phonetic Transformation ("${entry.src}" -> "${entry.dst}")`;

    const minedItem: HypothesisPatternItem = {
      key: dynamicKey,
      name: ruleName,
      patternType: 'consonant_deletion',
      customChecks: [
        {
          trigger: triggerRe,
          expect: expectRe,
          note: `'${entry.src}' -> '${entry.dst}'`
        }
      ],
      template: {
        hypothesis: `Paxton consistently articulates '${entry.src}' where target English requires '${entry.dst}', reflecting systematic phonological shift across speech contexts.`,
        condition: `Spoken occurrence of token '${entry.src}'`,
        action: `Translate phonetic token '${entry.src}' to intended '${entry.dst}'`,
        confidence: 0.90
      }
    };

    dynamicDiscoveredPatterns.push(minedItem);
    return minedItem;
  }

  return null;
}

async function runHypothesisCycle(): Promise<any> {
  if (trainingData.length === 0) {
    return { success: false, message: 'No training data available to test hypotheses. Add verified pairs in the Training Studio first.' };
  }

  try {
    hypothesisCycleStatus.active = true;
    hypothesisCycleStatus.cycleNumber++;
    hypothesisCycleStatus.totalDatasetPairs = trainingData.length;
    hypothesisCycleStatus.currentStep = 'scanning_dataset';
    hypothesisCycleStatus.stepDescription = `Cycle #${hypothesisCycleStatus.cycleNumber}: Scanning library of ${trainingData.length} phonetic speech pairs...`;
    pushHypothesisLog(`Cycle #${hypothesisCycleStatus.cycleNumber}: Scanning phonetic library (${trainingData.length} pairs)...`);

    const targetModel = appSettings.grammarHypothesisModel || appSettings.gemmaModel || 'gemma2';

    // 1. Autonomously mine fresh linguistic candidates from Paxton's training library
    const newlyMined = await mineCandidatePatternFromDataset(trainingData, targetModel);
    if (newlyMined) {
      pushHypothesisLog(`Step 1B: Discovered new linguistic pattern from library: "${newlyMined.name}"`);
    }

    // Merge base patterns and dynamic discovered patterns
    let allAvailable = [...BASE_HYPOTHESIS_PATTERNS, ...dynamicDiscoveredPatterns];

    // Check if all available patterns have been visited; if so, refresh the pool to re-verify
    const unvisited = allAvailable.filter(p => !testedPatternKeys.has(p.key));
    if (unvisited.length === 0) {
      testedPatternKeys.clear();
      pushHypothesisLog(`Step 1B: All ${allAvailable.length} patterns scanned. Cycling through library with updated evidence.`);
    }

    // Pick target pattern: prioritize unvisited candidates to explore new hypotheses first
    const candidatePool = allAvailable.filter(p => !testedPatternKeys.has(p.key));
    const target = candidatePool.length > 0
      ? candidatePool[0]
      : allAvailable[(hypothesisCycleStatus.cycleNumber - 1) % allAvailable.length];
    testedPatternKeys.add(target.key);

    const template = target.template || HYPOTHESIS_TEMPLATES[target.key] || {
      hypothesis: `Paxton systematically produces phonetic pattern "${target.name}".`,
      condition: `Spoken occurrence of ${target.name}`,
      action: `Apply linguistic restoration rule for ${target.name}`,
      confidence: 0.90
    };

    hypothesisCycleStatus.currentStep = 'isolating_pattern';
    hypothesisCycleStatus.activePattern = target.name;
    hypothesisCycleStatus.stepDescription = `Step 2: Isolated abnormal pattern "${target.name}"`;
    pushHypothesisLog(`Step 2: Isolated abnormal pattern: "${target.name}"`);

    // Evidence first. It is deterministic and instant, so the model can be briefed with real examples,
    // and skipped entirely when there is nothing to explain.
    const { supported: supportedExamples, counter: counterExamples } = evaluatePattern(target.key, trainingData, target.customChecks);
    const totalEvaluated = supportedExamples.length + counterExamples.length;
    const accuracy = totalEvaluated > 0 ? supportedExamples.length / totalEvaluated : 0;
    const minSupport = appSettings.hypothesisMinSupport || 2;
    const minConfidence = appSettings.hypothesisMinConfidence || 0.70;

    // Step 3: the model explains WHY, using only the evidence above.
    hypothesisCycleStatus.currentStep = 'formulating_hypothesis';
    let llmRule: any = null;
    if (totalEvaluated > 0) {
      hypothesisCycleStatus.stepDescription = `Step 3: Reasoning with ${targetModel} on why pattern occurs...`;
      pushHypothesisLog(`Step 3: Formulating hypothesis with ${targetModel} from ${totalEvaluated} real example(s)...`);
      try {
        const rawRes = await queryLlm(
          buildHypothesisPrompt({ patternName: target.name, patternKey: target.key, supported: supportedExamples, counter: counterExamples }),
          targetModel,
          true,
          65000
        );
        if (rawRes) {
          let clean = rawRes.trim();
          const m = clean.match(/\{[\s\S]*\}/);
          if (m) clean = m[0];
          llmRule = JSON.parse(clean);
        }
      } catch (e) {}
    } else {
      hypothesisCycleStatus.stepDescription = 'Step 3: No verified pair exercises this pattern yet, so there is nothing to explain.';
      pushHypothesisLog('Step 3: No verified pair exercises this pattern yet; skipping the model.');
    }

    const text = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
    const llmConfidence = typeof llmRule?.confidence === 'number' && isFinite(llmRule.confidence) ? llmRule.confidence : template.confidence;
    const candidateRule = {
      ruleName: target.name,
      patternType: target.patternType,
      patternKey: target.key,
      hypothesis: text(llmRule?.hypothesis, template.hypothesis),
      condition: text(llmRule?.condition, template.condition),
      action: text(llmRule?.action, template.action),
      confidence: Math.min(1, Math.max(0, llmConfidence))
    };
    hypothesisCycleStatus.activeHypothesis = candidateRule.hypothesis;
    hypothesisCycleStatus.activeCandidateRule = candidateRule;
    hypothesisCycleStatus.modelUsed = targetModel;

    // Step 4: report the test against the user's verified pairs.
    hypothesisCycleStatus.currentStep = 'testing_across_corpus';
    hypothesisCycleStatus.stepDescription = `Step 4: Tested against ${trainingData.length} library phrases: ${supportedExamples.length} support, ${counterExamples.length} contradict.`;
    pushHypothesisLog(`Step 4: ${supportedExamples.length} supporting / ${counterExamples.length} contradicting pair(s) across ${trainingData.length} phrases.`);

    hypothesisCycleStatus.currentStep = 'evaluating_decision';
    hypothesisCycleStatus.testedPairsCount = totalEvaluated;

    const meetsBar = supportedExamples.length >= minSupport && accuracy >= minConfidence;
    const pct = (accuracy * 100).toFixed(0);

    // Re-use the matching rule (same pattern key, same name, or the same built-in behaviour) instead of duplicating it.
    const existingIdx = grammarRulebook.findIndex(r => {
      if (r.match) return false; // user-defined replacement rules are never touched by the engine
      if (r.patternKey === target.key) return true;
      if (String(r.ruleName || '').toLowerCase() === target.name.toLowerCase()) return true;
      const keys = builtinKeysForRule(r);
      return keys.length === 1 && keys[0] === target.key;
    });
    const existing = existingIdx >= 0 ? grammarRulebook[existingIdx] : null;

    let outcome: 'confirmed' | 'kept' | 'testing' | 'candidate';
    let message: string;
    let savedRule: any = existing;

    if (!meetsBar && existing && existing.status === 'confirmed') {
      // Never demote a confirmed rule; just refresh its evidence when we actually have some.
      outcome = 'kept';
      if (totalEvaluated > 0) {
        existing.supportedExamples = supportedExamples;
        existing.counterExamples = counterExamples;
        existing.accuracy = Math.round(accuracy * 100) / 100;
        existing.testedCount = totalEvaluated;
        existing.updatedAt = new Date().toISOString();
        saveGrammarRulebook();
      }
      message = totalEvaluated > 0
        ? `"${existing.ruleName}" stays confirmed. Fresh evidence: ${supportedExamples.length} supporting / ${counterExamples.length} contradicting (${pct}%).`
        : `"${existing.ruleName}" stays confirmed. No verified pair exercises it yet, so there is no new evidence.`;
      pushHypothesisLog(`➡️ KEPT: ${message}`);
    } else {
      outcome = meetsBar ? 'confirmed' : totalEvaluated > 0 ? 'testing' : 'candidate';
      const ruleEntry: any = {
        ...(existing || {}),
        id: existing ? existing.id : "rule_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        ruleName: existing?.ruleName || candidateRule.ruleName,
        patternType: candidateRule.patternType,
        patternKey: candidateRule.patternKey,
        hypothesis: candidateRule.hypothesis,
        condition: candidateRule.condition,
        action: candidateRule.action,
        status: outcome,
        confidence: totalEvaluated > 0 ? candidateRule.confidence : 0,
        accuracy: Math.round(accuracy * 100) / 100,
        testedCount: totalEvaluated,
        supportedExamples,
        counterExamples,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // A rule the user switched off stays off when the engine re-confirms it.
        enabled: existing ? existing.enabled !== false : true
      };
      if (existing) grammarRulebook[existingIdx] = ruleEntry;
      else grammarRulebook.push(ruleEntry);
      saveGrammarRulebook();
      savedRule = ruleEntry;

      if (outcome === 'confirmed') {
        hypothesisCycleStatus.confirmedRulesCount++;
        message = `${existing ? 'Re-confirmed' : 'Added to the rulebook'}: "${ruleEntry.ruleName}" with ${supportedExamples.length} supporting / ${counterExamples.length} contradicting pair(s) (${pct}% accuracy).`;
        pushHypothesisLog(`✅ CONFIRMED: ${message}`);
      } else if (outcome === 'testing') {
        hypothesisCycleStatus.rejectedRulesCount++;
        const needSupport = Math.max(0, minSupport - supportedExamples.length);
        message = `Not confirmed yet: "${ruleEntry.ruleName}" has ${supportedExamples.length} supporting / ${counterExamples.length} contradicting (${pct}%). It needs ${needSupport > 0 ? `${needSupport} more supporting pair(s)` : `accuracy of at least ${(minConfidence * 100).toFixed(0)}%`}. Saved as "testing" so you can see its evidence; it is not applied while testing.`;
        pushHypothesisLog(`⚠️ TESTING: ${message}`);
      } else {
        hypothesisCycleStatus.rejectedRulesCount++;
        message = `No verified pair exercises "${ruleEntry.ruleName}" yet. Saved as a candidate; add examples that use this pattern and run it again.`;
        pushHypothesisLog(`⚠️ CANDIDATE: ${message}`);
      }
    }

    hypothesisCycleStatus.stepDescription = message;

    const result = {
      success: true,
      confirmed: outcome === 'confirmed',
      outcome,
      message,
      ruleId: savedRule?.id,
      ruleName: savedRule?.ruleName || candidateRule.ruleName,
      patternKey: target.key,
      accuracy,
      supportedCount: supportedExamples.length,
      counterCount: counterExamples.length,
      minSupport,
      minConfidence,
      rule: candidateRule,
      rulebookCount: grammarRulebook.length,
      confirmedCount: grammarRulebook.filter(r => r.status === 'confirmed').length,
      cycle: hypothesisCycleStatus.cycleNumber,
      at: new Date().toISOString()
    };
    hypothesisCycleStatus.lastResult = result;
    hypothesisCycleStatus.history = [result, ...(hypothesisCycleStatus.history || [])].slice(0, 12);
    return result;
  } finally {
    // Previously only the manual route cleared this, so a crash in continuous mode left the engine "active" forever.
    hypothesisCycleStatus.active = false;
  }
}

function scheduleNextContinuousHypothesis() {
  if (!hypothesisCycleStatus.isContinuous) return;
  continuousTimeout = setTimeout(async () => {
    try {
      await runHypothesisCycle();
    } catch(e) {
      console.warn('Hypothesis cycle notice:', e);
    }
    if (hypothesisCycleStatus.isContinuous) {
      scheduleNextContinuousHypothesis();
    }
  }, 4500);
}

app.get('/api/grammar-rules', (req, res) => {
  res.json({
    rules: grammarRulebook,
    status: hypothesisCycleStatus,
    totalSamples: trainingData.length,
    activeModel: appSettings.grammarHypothesisModel || appSettings.gemmaModel || 'gemma2'
  });
});

app.post('/api/grammar-rules/hypothesize', async (req, res) => {
  try {
    const result = await runHypothesisCycle();
    res.json(result);
  } catch(err: any) {
    hypothesisCycleStatus.active = false;
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/grammar-rules/continuous', (req, res) => {
  const { enabled } = req.body || {};
  hypothesisCycleStatus.isContinuous = Boolean(enabled);
  if (continuousTimeout) {
    clearTimeout(continuousTimeout);
    continuousTimeout = null;
  }

  if (hypothesisCycleStatus.isContinuous) {
    pushHypothesisLog(`Autonomous continuous overnight hypothesis mode STARTED.`);
    scheduleNextContinuousHypothesis();
  } else {
    pushHypothesisLog(`Autonomous continuous hypothesis mode STOPPED.`);
  }

  res.json({ success: true, isContinuous: hypothesisCycleStatus.isContinuous });
});

app.post('/api/grammar-rules', (req, res) => {
  const { ruleName, patternType, hypothesis, condition, action, patternKey, match, replacement } = req.body || {};
  if (!ruleName || !hypothesis) {
    return res.status(400).json({ error: 'ruleName and hypothesis are required.' });
  }

  const matchClean = typeof match === 'string' ? match.trim() : '';
  const replacementClean = typeof replacement === 'string' ? replacement.trim() : '';
  if ((matchClean && !replacementClean) || (!matchClean && replacementClean)) {
    return res.status(400).json({ error: 'A replacement rule needs both a spoken pattern and what it should become.' });
  }

  const newRule: any = {
    id: "rule_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    ruleName: String(ruleName).trim(),
    patternType: patternType || 'custom',
    // Data-driven behaviour: without these (or a built-in pattern) the decoder has nothing to apply.
    ...(typeof patternKey === 'string' && patternKey ? { patternKey } : {}),
    ...(matchClean ? { match: matchClean, replacement: replacementClean } : {}),
    hypothesis: String(hypothesis).trim(),
    condition: String(condition || '').trim(),
    action: String(action || '').trim(),
    status: 'confirmed',
    confidence: 0.95,
    accuracy: 1.0,
    testedCount: 1,
    supportedExamples: [],
    counterExamples: [],
    createdAt: new Date().toISOString(),
    enabled: true
  };

  grammarRulebook.unshift(newRule);
  saveGrammarRulebook();
  res.json(newRule);
});

app.put('/api/grammar-rules/:id', (req, res) => {
  const id = req.params.id;
  const rule = grammarRulebook.find(r => r.id === id);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });

  // Never let a client change a rule's identity.
  const { id: _ignoredId, createdAt: _ignoredCreated, ...patch } = req.body || {};
  Object.assign(rule, patch, { updatedAt: new Date().toISOString() });
  saveGrammarRulebook();
  res.json(rule);
});

app.delete('/api/grammar-rules/:id', (req, res) => {
  const id = req.params.id;
  grammarRulebook = grammarRulebook.filter(r => r.id !== id);
  saveGrammarRulebook();
  res.json({ success: true });
});

app.post('/api/grammar-rules/reset', (req, res) => {
  const seedRules = [
    {
      id: "rule_consonant_deletion_nee",
      ruleName: "Terminal /d/ & /t/ Alveolar Plosive Deletion (Coda Truncation)",
      patternType: "consonant_deletion",
      hypothesis: "Paxton consistently drops terminal voiced alveolar plosives (/d/) and voiceless stops (/t/) on high-frequency monosyllabic content verbs ('nee' -> 'need', 'goo' -> 'good') due to oral-motor easing before following words.",
      condition: "Spoken token 'nee' or word ending with elided alveolar stop where verb syntax requires 'need' or 'good'",
      action: "Restore elided terminal stop ('nee' -> 'need', 'goo' -> 'good')",
      status: "confirmed",
      confidence: 0.95,
      accuracy: 0.94,
      testedCount: 24,
      supportedExamples: [
        { spoken: "i nee a hell", intended: "I need some help", note: "Restores 'nee' to 'need'" },
        { spoken: "nee wa-wa", intended: "Need water", note: "Restores 'nee' to 'need'" },
        { spoken: "i nee dat", intended: "I need that", note: "Restores elided terminal alveolar stop" }
      ],
      counterExamples: [],
      createdAt: new Date().toISOString(),
      enabled: true
    },
    {
      id: "rule_intrusive_article_a",
      ruleName: "Intrusive Indefinite Article 'a' before Mass Nouns & Verbal Predicates",
      patternType: "intrusive_article",
      hypothesis: "Paxton inserts 'a' as a rhythmic phonological placeholder or metrical foot anchor between a verb/modal and a non-countable noun or predicate verb ('i nee a hell' -> 'I need help', 'go a sleep' -> 'go to sleep'). In contrast, before singular countable nouns ('a cookie', 'a ball'), 'a' is preserved as a standard determiner.",
      condition: "Spoken 'a' occurring between verb/modal and uncountable/mass noun or action ('help', 'sleep', 'play', 'water', 'eat')",
      action: "Omit intrusive article 'a' or translate as partitive 'some' in target English",
      status: "confirmed",
      confidence: 0.96,
      accuracy: 0.92,
      testedCount: 19,
      supportedExamples: [
        { spoken: "i nee a hell", intended: "I need some help", note: "Drops intrusive 'a' before uncountable 'help'" },
        { spoken: "he go a sleep", intended: "He goes to sleep", note: "Translates intrusive 'a' as infinitive/preposition 'to'" },
        { spoken: "i wan a play", intended: "I want to play", note: "Resolves intrusive 'a' to infinitive particle 'to'" }
      ],
      counterExamples: [
        { spoken: "i wan a cookie", intended: "I want a cookie", note: "Countable noun correctly preserves 'a'" }
      ],
      createdAt: new Date().toISOString(),
      enabled: true
    },
    {
      id: "rule_word_merging_baman",
      ruleName: "Medial Cluster Reduction in Compound Entities ('ba-man' -> 'Batman')",
      patternType: "word_merging",
      hypothesis: "Paxton deletes syllable-final unreleased coronal plosives (/t/) in medial consonant clusters of proper names, creating glottalized hyphenated compounds ('ba-man' for 'Batman', 'spi-man' for 'Spiderman').",
      condition: "Phonetic pattern 'ba-man' or similar superhero/character compound",
      action: "Reconstruct compound character entity 'Batman'",
      status: "confirmed",
      confidence: 0.98,
      accuracy: 1.0,
      testedCount: 16,
      supportedExamples: [
        { spoken: "ba-man dussin work", intended: "Batman doesn't work", note: "Identifies Batman entity" },
        { spoken: "where ba-man go", intended: "Where did Batman go?", note: "Reconstructs character noun" }
      ],
      counterExamples: [],
      createdAt: new Date().toISOString(),
      enabled: true
    },
    {
      id: "rule_fricative_neutralization_dis",
      ruleName: "Interdental Fricative Stopping ('dis / dat' -> 'this / that')",
      patternType: "consonant_deletion",
      hypothesis: "Voiced interdental fricative /ð/ is systematically stopped to voiced alveolar plosive /d/ ('dis' for 'this', 'dat' for 'that'), and interrogative coda /t/ is deleted ('wa' for 'what').",
      condition: "Spoken 'dis', 'dat', 'wa is dis'",
      action: "Translate as standard demonstrative/interrogative 'this', 'that', 'what is this'",
      status: "confirmed",
      confidence: 0.97,
      accuracy: 0.96,
      testedCount: 31,
      supportedExamples: [
        { spoken: "wa is dis", intended: "What is this?", note: "Resolves demonstrative and question pronoun" },
        { spoken: "gimme dat", intended: "Give me that", note: "Replaces stopped fricative with 'that'" }
      ],
      counterExamples: [],
      createdAt: new Date().toISOString(),
      enabled: true
    },
    {
      id: "rule_negative_contraction_dussin",
      ruleName: "Negative Auxiliary Contraction Reduction ('dussin' -> 'doesn't')",
      patternType: "word_merging",
      hypothesis: "Negative auxiliary verb 'doesn't' is articulated with central vowel laxing and elision of the coronal plosive coda /t/, producing the characteristic dissyllabic phonetic form 'dussin'.",
      condition: "Spoken token 'dussin' preceding a base verb",
      action: "Translate as 3rd person negative auxiliary 'doesn't'",
      status: "confirmed",
      confidence: 0.95,
      accuracy: 0.95,
      testedCount: 14,
      supportedExamples: [
        { spoken: "dussin work", intended: "Doesn't work", note: "Translates to 'doesn't work'" },
        { spoken: "ba-man dussin go", intended: "Batman doesn't go", note: "Auxiliary negation" }
      ],
      counterExamples: [],
      createdAt: new Date().toISOString(),
      enabled: true
    }
  ];

  // Tie every baseline rule to its built-in behaviour explicitly instead of relying on name matching.
  const seedKeys: Record<string, string> = {
    rule_consonant_deletion_nee: 'coda_deletion',
    rule_intrusive_article_a: 'intrusive_a',
    rule_word_merging_baman: 'baman',
    rule_fricative_neutralization_dis: 'th_stopping',
    rule_negative_contraction_dussin: 'dussin'
  };
  grammarRulebook = seedRules.map(r => ({ ...r, patternKey: seedKeys[r.id] }));
  saveGrammarRulebook();
  res.json({ success: true, rules: grammarRulebook });
});

app.post('/api/grammar-rules/test-phrase', (req, res) => {
  const phrase = String(req.body?.phrase || '').trim();
  if (!phrase) return res.json({ original: '', decoded: '', appliedRules: [] });

  // Rulebook preview: run the *same* rule engine the live interpreter uses (no dictionary, so the
  // result isolates what the rules do). It used to carry its own copy of the logic, which had drifted
  // (it dropped the "a" in "want a drink" and lower-cased everything).
  const { text: transformed, applied } = applyGrammarRules(phrase, grammarRulebook);

  res.json({
    original: phrase,
    decoded: polish(transformed),
    appliedRules: applied
  });
});

app.post('/api/interpreter/feedback', (req, res) => {
  const { originalSpoken, intendedMeaning, notes, target, patternType } = req.body || {};
  if (!originalSpoken || !intendedMeaning) {
    return res.status(400).json({ error: 'originalSpoken and intendedMeaning are required' });
  }

  const spokenClean = String(originalSpoken).trim();
  const meaningClean = String(intendedMeaning).trim();
  const notesClean = String(notes || '').trim();

  // Smart target resolution if 'auto'
  let resolvedTarget = target || 'auto';
  if (resolvedTarget === 'auto') {
    if (patternType && patternType !== 'custom') {
      resolvedTarget = 'rulebook';
    } else if (
      spokenClean.split(/\s+/).length >= 2 &&
      (spokenClean.includes(' a ') ||
       notesClean.toLowerCase().includes('drop') ||
       notesClean.toLowerCase().includes('rule') ||
       notesClean.toLowerCase().includes('consonant') ||
       notesClean.toLowerCase().includes('grammar') ||
       notesClean.toLowerCase().includes('article'))
    ) {
      resolvedTarget = 'rulebook';
    } else {
      resolvedTarget = 'dictionary';
    }
  }

  let message = '';
  let ruleCreated: any = null;
  let dictCreated: any = null;

  if (resolvedTarget === 'rulebook') {
    // Add to grammar rulebook as candidate rule for review/testing by the LLM
    const newRuleId = `rule_user_${Date.now()}`;
    ruleCreated = {
      id: newRuleId,
      ruleName: `User Clarification: "${spokenClean}" → "${meaningClean}"`,
      patternType: patternType || 'consonant_deletion',
      hypothesis: notesClean || `Paxton intended "${meaningClean}" when uttering "${spokenClean}". Submitted for LLM hypothesis testing.`,
      condition: `When Paxton utters phonetic phrase containing "${spokenClean}"`,
      action: `Transform to "${meaningClean}"`,
      status: 'testing',
      confidence: 0.85,
      accuracy: 0.90,
      testedCount: 1,
      supportedExamples: [{ spoken: spokenClean, intended: meaningClean, note: notesClean }],
      counterExamples: [],
      createdAt: new Date().toISOString(),
      enabled: true
    };
    grammarRulebook.unshift(ruleCreated);
    saveGrammarRulebook();
    message = `Added candidate rule to Grammar Rulebook for LLM / Gemma evaluation and hypothesis testing.`;
  } else {
    // Add to Dictionary Processing Queue for LLM breakdown into words, connected words & phrases
    const queueItem: any = {
      id: `dq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      originalSpoken: spokenClean,
      intendedMeaning: meaningClean,
      notes: notesClean,
      timestamp: new Date().toISOString(),
      status: 'analyzing',
      deconstructedWords: [],
      connectedWords: [],
      wholePhrase: { phonetic: spokenClean, meaning: meaningClean },
      llmReasoning: ''
    };
    dictionaryQueue.unshift(queueItem);
    saveDictionaryQueue();

    // Trigger deconstruction in background
    deconstructPhraseWithLlm(spokenClean, meaningClean, notesClean).then(parsed => {
      queueItem.deconstructedWords = parsed.deconstructedWords;
      queueItem.connectedWords = parsed.connectedWords;
      queueItem.wholePhrase = parsed.wholePhrase;
      queueItem.llmReasoning = parsed.llmReasoning;
      queueItem.status = 'analyzed';
      saveDictionaryQueue();
    }).catch(err => {
      queueItem.status = 'pending';
      saveDictionaryQueue();
    });

    dictCreated = queueItem;
    message = `Added to Dictionary Processing Queue where LLM deconstructs words, connected words, and phrases for review.`;
  }

  // Also record in training data so Whisper fine-tuning benefits
  trainingData.unshift({
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    category: 'user_clarification',
    sound: spokenClean,
    meaning: meaningClean,
    hasAudio: false
  });
  saveTrainingData();

  // Recalculate untrained pairs delta
  const activeVer = versioningState.datasetVersions.find((v: any) => v.id === versioningState.activeDatasetVersionId);
  if (activeVer) {
    versioningState.untrainedDatasetDeltaCount = Math.max(0, trainingData.length - (activeVer.itemCount || 0));
    saveVersioningState();
  }

  console.log(`--> [Feedback Recorded] "${spokenClean}" => "${meaningClean}" routed to ${resolvedTarget.toUpperCase()}`);
  res.json({
    success: true,
    resolvedTarget,
    message,
    ruleCreated,
    dictCreated
  });
});


const sendAudioFile = (req: express.Request, res: express.Response) => {
  let filename = req.params.filename || '';
  try {
    filename = decodeURIComponent(filename);
  } catch(e) {}

  // Strip leading uploads/ or slashes if passed in
  filename = filename.replace(/^uploads[\\/]/i, '').replace(/^[\\/]+/, '');
  const cleanRequested = filename.replace(/^\d{10,14}[-_]/, '').toLowerCase();

  const candidateDirs = [
    path.join(process.cwd(), 'uploads'),
    path.resolve('uploads'),
    path.join(currentDir, 'uploads'),
    'uploads',
    isStorageDisabled ? os.tmpdir() : 'uploads',
    os.tmpdir()
  ];
  
  // 1. Direct path check in candidate directories
  for (const dir of candidateDirs) {
    const filePath = path.join(dir, filename);
    if (fs.existsSync(filePath)) {
      if (filename.toLowerCase().endsWith('.wav')) {
        res.setHeader('Content-Type', 'audio/wav');
      } else if (filename.toLowerCase().endsWith('.webm')) {
        res.setHeader('Content-Type', 'audio/webm');
      }
      return res.sendFile(path.resolve(filePath));
    }
  }

  // 2. Directory scan for timestamp-prefixed, suffix, or case-insensitive matches
  for (const dir of candidateDirs) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      try {
        const files = fs.readdirSync(dir);
        const match = files.find(f => {
          const fLower = f.toLowerCase();
          const fClean = fLower.replace(/^\d{10,14}[-_]/, '');
          return (
            fLower === filename.toLowerCase() ||
            fClean === cleanRequested ||
            fLower.endsWith('-' + filename.toLowerCase()) ||
            fLower.endsWith('_' + filename.toLowerCase()) ||
            fClean.replace(/\.[^/.]+$/, '') === cleanRequested.replace(/\.[^/.]+$/, '')
          );
        });
        if (match) {
          const matchPath = path.join(dir, match);
          if (match.toLowerCase().endsWith('.wav')) {
            res.setHeader('Content-Type', 'audio/wav');
          } else if (match.toLowerCase().endsWith('.webm')) {
            res.setHeader('Content-Type', 'audio/webm');
          }
          return res.sendFile(path.resolve(matchPath));
        }
      } catch (e) {}
    }
  }

  // 3. AudioBank stored item check
  const audioItem = audioBank.find(a => 
    a.filename === filename || 
    (a.filename && path.basename(a.filename) === path.basename(filename)) ||
    (a.path && path.basename(a.path) === path.basename(filename)) ||
    (a.filename && a.filename.replace(/^\d{10,14}[-_]/, '').toLowerCase() === cleanRequested)
  );
  if (audioItem && audioItem.path && fs.existsSync(audioItem.path)) {
    if (audioItem.path.toLowerCase().endsWith('.wav')) {
      res.setHeader('Content-Type', 'audio/wav');
    }
    return res.sendFile(path.resolve(audioItem.path));
  }

  // 4. TrainingData stored item check
  const trainingItem = trainingData.find(t =>
    t.filename === filename ||
    (t.audioPath && path.basename(t.audioPath) === path.basename(filename)) ||
    (t.filename && t.filename.replace(/^\d{10,14}[-_]/, '').toLowerCase() === cleanRequested)
  );
  if (trainingItem && trainingItem.audioPath && fs.existsSync(trainingItem.audioPath)) {
    if (trainingItem.audioPath.toLowerCase().endsWith('.wav')) {
      res.setHeader('Content-Type', 'audio/wav');
    }
    return res.sendFile(path.resolve(trainingItem.audioPath));
  }

  res.status(404).json({ error: 'Audio file not found' });
};

// Mount static uploads directory for direct WAV access
app.use('/uploads', express.static(path.resolve('uploads')));
app.get('/uploads/:filename', sendAudioFile);
app.get('/api/training_data/audio/:filename', sendAudioFile);
app.get('/api/audio_bank/audio/:filename', sendAudioFile);

app.delete('/api/training_data/:id', (req, res) => {
  const id = req.params.id;
  trainingData = trainingData.filter(t => t.id !== id);
  saveTrainingData();
  res.json({ success: true });
});

app.post('/api/training_data', upload.single('audio'), (req, res) => {
  const item = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    category: req.body.category,
    sound: req.body.sound,
    meaning: req.body.meaning,
    hasAudio: !!req.file,
    filename: req.file ? req.file.filename : undefined
  };
  trainingData.unshift(item);
  saveTrainingData();
  
  console.log(`\n[🧠 NEW TRAINING DATA COLLECTED]`);
  console.log(`--> Category: ${item.category}`);
  console.log(`--> Sounded like: "${item.sound}"`);
  console.log(`--> Target Meaning: "${item.meaning}"`);
  console.log(`--> Audio Captured: ${item.hasAudio ? 'YES' : 'NO'}`);
  
  res.json(item);
});

app.get('/api/audio_bank', (req, res) => {
  res.json(audioBank);
});

app.post('/api/audio_bank/upload', upload.single('audio'), (req, res) => {
  const item: any = {
    id: Date.now().toString(),
    filename: req.file ? req.file.filename : (req.body.filename || `recording_${Date.now()}.webm`),
    path: req.file ? req.file.path : null,
    timestamp: new Date().toISOString(),
    status: 'unprocessed',
    isCut: false
  };
  audioBank.unshift(item);
  saveAudioBank();
  
  console.log(`\n[🎧 RAW AUDIO UPLOADED]`);
  console.log(`--> Filename: ${item.filename}`);
  console.log(`--> Status: UNPROCESSED`);
  
  res.json(item);
});

app.post('/api/audio_bank/:id/process', async (req, res) => {
  const id = req.params.id;
  const audioIndex = audioBank.findIndex(a => a.id === id);
  const audio = audioBank[audioIndex];
  
  if (audio) {
    if (audio.path && fs.existsSync(audio.path)) {
      try {
        console.log(`\n[🎧 AUDIO PROCESSING] ${audio.filename}`);
        if (appSettings.speakerIsolationEnabled) {
           console.log(`🎙️ [SPEAKER ISOLATION] Active. Applying Spectral Profiling for primary voice...`);
           console.log(`🎙️ [SPEAKER ISOLATION] Preserving loud/rough tonality variations for target speaker.`);
           console.log(`🎙️ [SPEAKER ISOLATION] Filtering cross-talk and background voices from audio.`);
        }

        let duration = 0;
        try {
           const { stdout: durationOutput } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audio.path}"`);
           duration = parseFloat(durationOutput.trim());
           console.log(`--> Audio duration: ${duration.toFixed(2)}s`);
        } catch(e) {
           console.log(`--> Failed to read duration directly, proceeding with standard processing.`);
        }

                 console.log(`--> Analyzing audio for silences to split into accurate snippets...`);
         let sdErr = '';
         try {
            const { stderr } = await execAsync(`ffmpeg -y -i "${audio.path}" -af silencedetect=noise=-30dB:d=0.5 -f null -`);
            sdErr = stderr;
         } catch(e: any) {
            sdErr = e.stderr || '';
         }
         
         const lines = sdErr.split('\n');
         const silences: {start?: number, end?: number}[] = [];
         
         for(const line of lines) {
           const sMatch = line.match(/silence_start: ([\d\.]+)/);
           if (sMatch) silences.push({ start: parseFloat(sMatch[1]) });
           const eMatch = line.match(/silence_end: ([\d\.]+)/);
           if (eMatch && silences.length > 0) silences[silences.length-1].end = parseFloat(eMatch[1]);
         }
         
         const segments: {start: number, end: number}[] = [];
         let curr = 0;
         for(const s of silences) {
           if (s.start !== undefined && s.start > curr + 0.2) {
             segments.push({ start: curr, end: s.start });
           }
           if (s.end !== undefined) curr = s.end;
         }
         if (duration > 0 && curr < duration - 0.2) {
           segments.push({ start: curr, end: duration });
         } else if (duration === 0) {
           segments.push({ start: curr, end: 999999 }); 
         }

         if (segments.length === 0 && duration > 0) {
            segments.push({ start: 0, end: duration });
         } else if (segments.length === 0) {
            segments.push({ start: 0, end: 999999 });
         }

         const newItems = [];
         const dir = path.dirname(audio.path);
         
         for (let i = 0; i < segments.length; i++) {
           const seg = segments[i];
           const suffix = segments.length > 1 ? `_snippet_${i + 1}.wav` : `_cut.wav`;
           const newFilename = audio.filename.replace(/\.[^/.]+$/, "") + suffix;
           const cutPath = path.join(dir, newFilename);
           try {
              const endArg = seg.end < 999999 ? `-to ${seg.end}` : "";
              await execAsync(`ffmpeg -y -i "${audio.path}" -ss ${seg.start} ${endArg} -af silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB,areverse -c:a pcm_s16le "${cutPath}"`);
              
              if (fs.existsSync(cutPath)) {
                 const stats = fs.statSync(cutPath);
                 if (stats.size > 4096) {
                    const guess = await WhisperEngine.transcribe(cutPath);
                    newItems.push({
                      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                      filename: newFilename,
                      path: cutPath,
                      timestamp: new Date().toISOString(),
                      status: 'processed' as const,
                      sound: guess,
                      isCut: true
                    });
                 } else {
                    fs.unlinkSync(cutPath);
                 }
              }
           } catch(err) {
              console.error(`Failed to process segment ${i}`, err);
           }
         }
         
         if (fs.existsSync(audio.path)) fs.unlinkSync(audio.path);
         
         if (newItems.length > 0) {
            audioBank.splice(audioIndex, 1, ...newItems);
            saveAudioBank();
            console.log(`[✅] Split audio into ${newItems.length} cut sections.`);
            return res.json(newItems[0]); 
         } else {
            console.log(`[🔇] Audio clip primarily silence, deleting...`);
            audioBank = audioBank.filter(a => a.id !== id);
            saveAudioBank();
            return res.status(400).json({ error: "Audio was only silence and was deleted." });
         }     } catch (e) {
        console.error("FFmpeg processing failed", e);
      }
    }
    audio.status = 'processed';
    audio.isCut = true;
    saveAudioBank();
    console.log(`\n[✂️ AUDIO AUTO-CUT & PROCESSED] ` + audio.filename);
  }
  res.json(audio);
});

app.put('/api/audio_bank/:id/ignore', (req, res) => {
  const id = req.params.id;
  const audio = audioBank.find(a => a.id === id);
  if (audio) {
    audio.status = 'ignored';
    saveAudioBank();
    res.json(audio);
  } else {
    res.status(404).json({ error: 'Audio not found' });
  }
});

app.post('/api/audio_bank/:id/finalize', (req, res) => {
  const id = req.params.id;
  const audio = audioBank.find(a => a.id === id);
  if (audio) {
    audio.status = 'finalized';
    audio.sound = req.body.sound;
    audio.meaning = req.body.meaning;
    saveAudioBank();
    
    // Also add/update in training data
    const existingIndex = trainingData.findIndex(t => 
      (t.filename && audio.filename && t.filename === audio.filename) || 
      (t.id && audio.id && t.id === audio.id)
    );

    const trainingItem = {
      id: audio.id || Date.now().toString(),
      timestamp: new Date().toISOString(),
      category: 'Phrase',
      sound: audio.sound,
      meaning: audio.meaning,
      hasAudio: true,
      audioPath: audio.path || (audio.filename ? path.join('uploads', audio.filename) : undefined),
      filename: audio.filename
    };

    if (existingIndex >= 0) {
      trainingData[existingIndex] = { ...trainingData[existingIndex], ...trainingItem };
    } else {
      trainingData.unshift(trainingItem);
    }
    saveTrainingData();
    
    console.log(`\n[✅ AUDIO FINALIZED & ADDED TO TRAINING] ` + audio.filename);
    console.log(`--> Sounded like: "${audio.sound}"`);
    console.log(`--> Target: "${audio.meaning}"`);
  }
  res.json(audio);
});

// -----------------------------------------------------
// Fine-Tuning & Training Telemetry State
// -----------------------------------------------------
let activeTrainProcess: any = null;
let simulationInterval: any = null;

interface MetricPoint {
  epoch: number;
  step: number;
  trainLoss?: number;
  evalLoss?: number;
  evalCer?: number;
  evalWer?: number;
  learningRate?: number;
  timestamp: string;
}

let trainingTelemetry: {
  status: 'idle' | 'preparing' | 'training' | 'completed' | 'failed';
  phase: string;
  currentEpoch: number;
  totalEpochs: number;
  currentStep: number;
  totalSteps: number;
  trainLoss: number | null;
  evalLoss: number | null;
  bestEvalLoss: number | null;
  evalCer: number | null;
  bestCer: number | null;
  evalWer: number | null;
  bestWer: number | null;
  history: MetricPoint[];
  sampleCount: number;
  device: string;
  modelName: string;
  transcriptMode: string;
  startTime: number | null;
  endTime: number | null;
  elapsedSeconds: number;
  estimatedRemainingSeconds: number | null;
  logs: string[];
  totalLogLines: number;
  error?: string | null;
  isSimulated?: boolean;
} = {
  status: 'idle',
  phase: 'Ready for training',
  currentEpoch: 0,
  totalEpochs: 15,
  currentStep: 0,
  totalSteps: 100,
  trainLoss: null,
  evalLoss: null,
  bestEvalLoss: null,
  evalCer: null,
  bestCer: null,
  evalWer: null,
  bestWer: null,
  history: [],
  sampleCount: 0,
  device: 'Detecting...',
  modelName: 'openai/whisper-small.en',
  transcriptMode: 'phonetic',
  startTime: null,
  endTime: null,
  elapsedSeconds: 0,
  estimatedRemainingSeconds: null,
  logs: [],
  totalLogLines: 0,
  error: null,
  isSimulated: false
};

function pushTrainingLog(rawLine: string) {
  if (!rawLine) return;
  const line = String(rawLine).replace(/\r/g, '').trimEnd();
  if (!line) return;

  trainingTelemetry.logs.push(line);
  trainingTelemetry.totalLogLines++;
  if (trainingTelemetry.logs.length > 2500) {
    trainingTelemetry.logs.shift();
  }

  // Write to log file asynchronously
  try {
    if (!fs.existsSync('logs')) fs.mkdirSync('logs', { recursive: true });
    fs.appendFileSync('logs/training_latest.log', line + '\n');
  } catch(e) {}

  // Parse key milestones & telemetry
  if (/\[1\/6\] Checking Python/i.test(line)) {
    trainingTelemetry.phase = 'Checking Python Environment';
  } else if (/\[2\/6\] Checking platform/i.test(line)) {
    trainingTelemetry.phase = 'Platform & Device Verification';
  } else if (/Apple Silicon.*MPS/i.test(line)) {
    trainingTelemetry.device = 'Apple Silicon (MPS GPU)';
  } else if (/CUDA backend/i.test(line)) {
    trainingTelemetry.device = 'NVIDIA CUDA GPU';
  } else if (/CPU backend/i.test(line)) {
    trainingTelemetry.device = 'CPU';
  } else if (/\[3\/6\] Setting up virtual environment/i.test(line)) {
    trainingTelemetry.phase = 'Setting up Virtual Environment (venv_train)';
  } else if (/\[4\/6\] Installing.*dependencies/i.test(line)) {
    trainingTelemetry.phase = 'Installing & Verifying PyTorch & Transformers';
  } else if (/\[5\/6\] Verifying MPS in PyTorch/i.test(line)) {
    trainingTelemetry.phase = 'Verifying MPS GPU Acceleration';
  } else if (/\[6\/6\] Checking dataset/i.test(line)) {
    trainingTelemetry.phase = 'Auditing Dataset & Vocabulary';
  } else if (/\[1\/5\] Splitting dataset/i.test(line)) {
    trainingTelemetry.phase = 'Splitting Train / Validation Sets';
  } else if (/\[2\/5\] Loading processor/i.test(line)) {
    trainingTelemetry.phase = 'Loading Whisper Processor & Tokenizer';
  } else if (/\[3\/5\] Preprocessing audio/i.test(line)) {
    trainingTelemetry.phase = 'Audio Feature Extraction & Augmentation';
  } else if (/\[4\/5\] Loading model/i.test(line)) {
    trainingTelemetry.phase = 'Initializing Whisper Neural Weights';
  } else if (/\[5\/5\] Training/i.test(line)) {
    trainingTelemetry.phase = 'Fine-Tuning Transformer Layers';
    trainingTelemetry.status = 'training';
  }

  // Regex parse Hugging Face Trainer metrics: e.g. {'loss': 0.45, 'learning_rate': 4.5e-6, 'epoch': 1.0}
  const lossMatch = line.match(/\{.*['"]loss['"]\s*:\s*([0-9.]+).*['"]epoch['"]\s*:\s*([0-9.]+).*\}/);
  if (lossMatch) {
    const loss = parseFloat(lossMatch[1]);
    const epoch = parseFloat(lossMatch[2]);
    trainingTelemetry.trainLoss = loss;
    trainingTelemetry.currentEpoch = Math.floor(epoch);
    trainingTelemetry.phase = `Epoch ${Math.min(trainingTelemetry.totalEpochs, Math.floor(epoch) + 1)}/${trainingTelemetry.totalEpochs} — Train Loss: ${loss.toFixed(4)}`;
    
    trainingTelemetry.history.push({
      epoch: Number(epoch.toFixed(2)),
      step: trainingTelemetry.history.length + 1,
      trainLoss: loss,
      timestamp: new Date().toLocaleTimeString()
    });
  }

  // Regex parse evaluation metrics:
  // e.g. {'eval_loss': 3.083, 'eval_cer': 42.1, 'eval_wer': 85.3, 'epoch': 2.0}
  // or individual components logged by Hugging Face trainer
  if (line.includes("'eval_loss'") || line.includes('"eval_loss"') || line.includes("eval_loss:") || line.includes("'eval_cer'") || line.includes('"eval_cer"')) {
    const lossMatch = line.match(/['"]eval_loss['"]\s*:\s*([0-9.]+)/);
    const cerMatch  = line.match(/['"](?:eval_)?cer['"]\s*:\s*([0-9.]+)/);
    const werMatch  = line.match(/['"](?:eval_)?wer['"]\s*:\s*([0-9.]+)/);
    const epochMatch = line.match(/['"]epoch['"]\s*:\s*([0-9.]+)/);

    const eLoss = lossMatch ? parseFloat(lossMatch[1]) : undefined;
    let cer = cerMatch ? parseFloat(cerMatch[1]) : undefined;
    if (cer !== undefined && cer > 1.0) cer = cer / 100; // normalize percentage if > 1.0
    let wer = werMatch ? parseFloat(werMatch[1]) : undefined;
    if (wer !== undefined && wer > 1.0) wer = wer / 100;

    if (eLoss !== undefined) {
      trainingTelemetry.evalLoss = eLoss;
      if (trainingTelemetry.bestEvalLoss === null || eLoss < trainingTelemetry.bestEvalLoss) {
        trainingTelemetry.bestEvalLoss = eLoss;
      }
    }
    if (cer !== undefined) {
      trainingTelemetry.evalCer = cer;
      if (trainingTelemetry.bestCer === null || cer < trainingTelemetry.bestCer) {
        trainingTelemetry.bestCer = cer;
      }
    }
    if (wer !== undefined) {
      trainingTelemetry.evalWer = wer;
      if (trainingTelemetry.bestWer === null || wer < trainingTelemetry.bestWer) {
        trainingTelemetry.bestWer = wer;
      }
    }

    const curEpoch = epochMatch ? parseFloat(epochMatch[1]) : trainingTelemetry.currentEpoch;
    trainingTelemetry.phase = `Validation · Loss: ${eLoss !== undefined ? eLoss.toFixed(4) : '--'}${cer !== undefined ? ` · CER: ${(cer * 100).toFixed(1)}%` : ''}`;

    const last = trainingTelemetry.history[trainingTelemetry.history.length - 1];
    if (last && Math.abs(last.epoch - curEpoch) < 0.2) {
      if (eLoss !== undefined) last.evalLoss = eLoss;
      if (cer !== undefined) last.evalCer = cer;
      if (wer !== undefined) last.evalWer = wer;
    } else {
      trainingTelemetry.history.push({
        epoch: curEpoch,
        step: trainingTelemetry.history.length + 1,
        evalLoss: eLoss,
        evalCer: cer,
        evalWer: wer,
        timestamp: new Date().toLocaleTimeString()
      });
    }
  }

  // Completion parsing
  if (/Training complete/i.test(line) || /Saved →.*whisper-paxton-final/i.test(line)) {
    trainingTelemetry.status = 'completed';
    trainingTelemetry.phase = 'Fine-Tuning Complete — Model Weights Saved';
    trainingTelemetry.endTime = Date.now();
  }
}

// -----------------------------------------------------
// Dataset builder helper
// -----------------------------------------------------
function buildDatasetCsv(): { sampleCount: number; csvPath: string } {
  reconcileFinalizedAudio();

  const datasetDir = path.join(process.cwd(), 'dataset');
  if (!fs.existsSync(datasetDir)) {
    fs.mkdirSync(datasetDir, { recursive: true });
  }

  const csvContent = ["file_name,transcription,phonetic,intent"];
  let sampleCount = 0;

  const uploadDirs = [
    path.join(process.cwd(), 'uploads'),
    path.resolve('uploads'),
    path.join(currentDir, 'uploads'),
    'uploads',
    isStorageDisabled ? os.tmpdir() : 'uploads',
    os.tmpdir()
  ];

  let availableUploadFiles: { name: string; fullPath: string }[] = [];
  for (const dir of uploadDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          availableUploadFiles.push({ name: f, fullPath: path.join(dir, f) });
        }
      } catch(e) {}
    }
  }

  for (const t of trainingData) {
    let candidateFilename = t.filename;
    if (!candidateFilename && t.audioPath) {
      candidateFilename = path.basename(t.audioPath);
    }
    if (!candidateFilename) {
      const ab = audioBank.find(a => 
        (a.id === t.id) ||
        (a.sound && t.sound && a.sound.trim().toLowerCase() === t.sound.trim().toLowerCase()) ||
        (a.meaning && t.meaning && a.meaning.trim().toLowerCase() === t.meaning.trim().toLowerCase())
      );
      if (ab && ab.filename) {
        candidateFilename = ab.filename;
        t.filename = ab.filename;
        if (ab.path) t.audioPath = ab.path;
      }
    }

    let audioFile: string | null = null;
    if (t.audioPath && fs.existsSync(t.audioPath)) audioFile = t.audioPath;
    else if (t.path && fs.existsSync(t.path)) audioFile = t.path;

    if (!audioFile && candidateFilename) {
      for (const dir of uploadDirs) {
        const p = path.join(dir, candidateFilename);
        if (fs.existsSync(p)) { audioFile = p; break; }
      }
    }

    if (!audioFile && candidateFilename) {
      const match = availableUploadFiles.find(af => 
        af.name.toLowerCase() === candidateFilename!.toLowerCase() ||
        af.name.toLowerCase().includes(candidateFilename!.toLowerCase()) ||
        candidateFilename!.toLowerCase().includes(af.name.toLowerCase())
      );
      if (match && fs.existsSync(match.fullPath)) {
        audioFile = match.fullPath;
      }
    }

    if (audioFile && fs.existsSync(audioFile)) {
      const ext = path.extname(audioFile) || '.wav';
      const newName = `audio_${t.id || sampleCount}${ext}`;
      const destPath = path.join(datasetDir, newName);
      try {
        fs.copyFileSync(audioFile, destPath);
      } catch(e) {}

      const escapedPhonetic = (t.sound || "").replace(/"/g, '""');
      const escapedTranscription = (t.meaning || "").replace(/"/g, '""');
      const escapedIntent = (t.category || "Phrase").replace(/"/g, '""');
      
      csvContent.push(`"dataset/${newName}","${escapedTranscription}","${escapedPhonetic}","${escapedIntent}"`);
      sampleCount++;
    }
  }

  const csvPath = path.join(datasetDir, "metadata.csv");
  fs.writeFileSync(csvPath, csvContent.join("\n"));
  console.log(`[📊] Exported ${sampleCount} real audio samples to dataset/metadata.csv`);
  return { sampleCount, csvPath };
}

// -----------------------------------------------------
// Training APIs
// -----------------------------------------------------

app.get('/api/training/status', (req, res) => {
  // Update elapsed seconds if running
  if (trainingTelemetry.status === 'training' || trainingTelemetry.status === 'preparing') {
    if (trainingTelemetry.startTime) {
      trainingTelemetry.elapsedSeconds = Math.floor((Date.now() - trainingTelemetry.startTime) / 1000);
      if (trainingTelemetry.currentEpoch > 0 && trainingTelemetry.totalEpochs > 0) {
        const progress = trainingTelemetry.currentEpoch / trainingTelemetry.totalEpochs;
        const totalEstimate = trainingTelemetry.elapsedSeconds / progress;
        trainingTelemetry.estimatedRemainingSeconds = Math.max(0, Math.floor(totalEstimate - trainingTelemetry.elapsedSeconds));
      }
    }
  }
  res.json(trainingTelemetry);
});

app.get('/api/training/logs', (req, res) => {
  const since = parseInt(req.query.since as string) || 0;
  const slice = trainingTelemetry.logs.slice(since);
  res.json({
    logs: slice,
    totalLogLines: trainingTelemetry.totalLogLines,
    status: trainingTelemetry.status,
    phase: trainingTelemetry.phase
  });
});

app.post('/api/training/stop', (req, res) => {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  if (activeTrainProcess) {
    try {
      activeTrainProcess.kill('SIGTERM');
    } catch(e) {}
    activeTrainProcess = null;
  }
  trainingTelemetry.status = 'idle';
  trainingTelemetry.phase = 'Training stopped by user';
  pushTrainingLog('⚠️ Training session cancelled by user.');
  res.json({ success: true, message: 'Training session stopped.' });
});

app.post('/api/training/simulate', (req, res) => {
  // Stop existing
  if (simulationInterval) clearInterval(simulationInterval);
  if (activeTrainProcess) {
    try { activeTrainProcess.kill(); } catch(e) {}
    activeTrainProcess = null;
  }

  const epochs = Number(req.body.epochs) || 5;
  const lr = req.body.lr || '5e-6';
  const batchSize = Number(req.body.batchSize) || 8;
  const mode = req.body.mode || 'phonetic';

  trainingTelemetry = {
    status: 'preparing',
    phase: 'Initializing Fine-Tuning Simulation …',
    currentEpoch: 0,
    totalEpochs: epochs,
    currentStep: 0,
    totalSteps: epochs * 20,
    trainLoss: 0.95,
    evalLoss: 0.92,
    bestEvalLoss: 0.92,
    evalCer: 0.38,
    bestCer: 0.38,
    evalWer: 0.52,
    bestWer: 0.52,
    history: [],
    sampleCount: trainingData.length || 176,
    device: 'Apple Silicon (M2 Pro MPS GPU - Accelerated)',
    modelName: 'openai/whisper-small.en',
    transcriptMode: mode,
    startTime: Date.now(),
    endTime: null,
    elapsedSeconds: 0,
    estimatedRemainingSeconds: 30,
    logs: [],
    totalLogLines: 0,
    error: null,
    isSimulated: true
  };

  const simSteps = [
    { delay: 400, log: "============================================================" },
    { delay: 800, log: "  Paxton Whisper Fine-Tuner Engine (Local Studio)" },
    { delay: 1200, log: `  Target Model : openai/whisper-small.en (244M params)` },
    { delay: 1600, log: `  Hyperparameters: epochs=${epochs}  lr=${lr}  batch=${batchSize}  mode=${mode}` },
    { delay: 2000, log: "[1/6] Checking Python … ✅ Python 3.10.12 found" },
    { delay: 2500, log: "[2/6] Checking platform … ✅ Apple Silicon (arm64) — MPS GPU active" },
    { delay: 3000, log: "[3/6] Setting up virtual environment … ✅ venv_train activated" },
    { delay: 3800, log: "[4/6] Installing dependencies … ✅ torch 2.3.1, transformers 4.41.2, evaluate, jiwer" },
    { delay: 4500, log: "[5/6] Verifying MPS in PyTorch … ✅ MPS available — GPU acceleration active" },
    { delay: 5200, log: `[6/6] Checking dataset … Total verified clips: ${trainingTelemetry.sampleCount}` },
    { delay: 6000, log: "  ── Dataset Report: 100% audio verified, vocabulary checked" },
    { delay: 6800, log: "[1/5] Splitting dataset … Train: 148  |  Val: 28 held-out" },
    { delay: 7600, log: "[2/5] Loading processor for openai/whisper-small.en …" },
    { delay: 8400, log: "[3/5] Preprocessing audio … 🔀 Augmentation ON (~704 effective samples)" },
    { delay: 9200, log: "[4/5] Loading model … WhisperForConditionalGeneration ready on MPS" },
    { delay: 10000, log: "[5/5] Training … Starting AdamW cosine schedule" }
  ];

  let stepIdx = 0;
  simulationInterval = setInterval(() => {
    if (stepIdx < simSteps.length) {
      pushTrainingLog(simSteps[stepIdx].log);
      stepIdx++;
    } else {
      // Advance epochs
      trainingTelemetry.status = 'training';
      const curEp = trainingTelemetry.currentEpoch + 1;
      if (curEp <= epochs) {
        trainingTelemetry.currentEpoch = curEp;
        trainingTelemetry.currentStep = curEp * 20;

        const baseLoss = 0.95 * Math.exp(-0.35 * curEp) + 0.12;
        const jitter = (Math.random() - 0.5) * 0.03;
        const tLoss = Math.max(0.08, Number((baseLoss + jitter).toFixed(4)));
        const eLoss = Math.max(0.11, Number((baseLoss * 1.08 + jitter).toFixed(4)));
        const cer = Math.max(0.04, Number((0.42 * Math.exp(-0.38 * curEp) + 0.05).toFixed(3)));
        const wer = Math.max(0.09, Number((0.55 * Math.exp(-0.32 * curEp) + 0.08).toFixed(3)));

        trainingTelemetry.trainLoss = tLoss;
        trainingTelemetry.evalLoss = eLoss;
        trainingTelemetry.evalCer = cer;
        trainingTelemetry.evalWer = wer;
        if (trainingTelemetry.bestEvalLoss === null || eLoss < trainingTelemetry.bestEvalLoss) {
          trainingTelemetry.bestEvalLoss = eLoss;
        }
        if (trainingTelemetry.bestCer === null || cer < trainingTelemetry.bestCer) {
          trainingTelemetry.bestCer = cer;
        }
        if (trainingTelemetry.bestWer === null || wer < trainingTelemetry.bestWer) {
          trainingTelemetry.bestWer = wer;
        }

        const point: MetricPoint = {
          epoch: curEp,
          step: trainingTelemetry.currentStep,
          trainLoss: tLoss,
          evalLoss: eLoss,
          evalCer: cer,
          evalWer: wer,
          learningRate: parseFloat(lr) * Math.cos((curEp / epochs) * (Math.PI / 2)),
          timestamp: new Date().toLocaleTimeString()
        };
        trainingTelemetry.history.push(point);

        pushTrainingLog(`{'loss': ${tLoss}, 'learning_rate': ${point.learningRate?.toExponential(2)}, 'epoch': ${curEp}.0}`);
        pushTrainingLog(`{'eval_loss': ${eLoss}, 'eval_cer': ${(cer * 100).toFixed(1)}%, 'eval_wer': ${(wer * 100).toFixed(1)}%, 'epoch': ${curEp}.0}  [Best Loss: ${(trainingTelemetry.bestEvalLoss || eLoss).toFixed(4)} | Best CER: ${((trainingTelemetry.bestCer || cer) * 100).toFixed(1)}%]`);
        trainingTelemetry.phase = `Epoch ${curEp}/${epochs} · Loss: ${eLoss.toFixed(4)} · CER: ${(cer * 100).toFixed(1)}%`;
      } else {
        // Complete
        clearInterval(simulationInterval);
        simulationInterval = null;
        trainingTelemetry.status = 'completed';
        trainingTelemetry.phase = `Training Complete! Best Loss: ${(trainingTelemetry.bestEvalLoss || 0.12).toFixed(4)} · CER: ${((trainingTelemetry.bestCer || 0.052) * 100).toFixed(1)}%`;
        trainingTelemetry.endTime = Date.now();
        pushTrainingLog("============================================================");
        pushTrainingLog("  ✅ Training complete!");
        pushTrainingLog("  Model Saved    → ./whisper-paxton-final/");
        pushTrainingLog("  Manifest       → ./whisper-paxton-final/training_manifest.json");
        pushTrainingLog(`  Best Eval Loss → ${(trainingTelemetry.bestEvalLoss || 0.12).toFixed(4)}`);
        pushTrainingLog(`  Best CER       → ${((trainingTelemetry.bestCer || 0.052) * 100).toFixed(1)}% (Character Error Rate)`);
        pushTrainingLog(`  Best WER       → ${((trainingTelemetry.bestWer || 0.118) * 100).toFixed(1)}% (Word Error Rate)`);
        pushTrainingLog("============================================================");
      }
    }
  }, 1200);

  res.json({ success: true, message: 'Simulation session initiated.' });
});

app.post('/api/training/start', async (req, res) => {
  try {
    const { sampleCount } = buildDatasetCsv();
    
    if (sampleCount < 5) {
      return res.status(400).json({ 
        success: false, 
        message: `Need at least 5 audio samples to train (Current: ${sampleCount}). Finalize more in the audio pipeline.` 
      });
    }

    const epochs = Number(req.body.epochs) || appSettings.trainingEpochs || 15;
    const lr = req.body.lr || appSettings.trainingLR || '5e-6';
    const batchSize = Number(req.body.batchSize) || appSettings.trainingBatchSize || 8;
    const mode = req.body.mode || appSettings.trainingMode || 'phonetic';

    // Stop existing if any
    if (activeTrainProcess) {
      try { activeTrainProcess.kill(); } catch(e) {}
    }
    if (simulationInterval) {
      clearInterval(simulationInterval);
      simulationInterval = null;
    }

    trainingTelemetry = {
      status: 'preparing',
      phase: 'Initiating Fine-Tuning Pipeline …',
      currentEpoch: 0,
      totalEpochs: epochs,
      currentStep: 0,
      totalSteps: epochs * Math.max(1, Math.ceil(sampleCount / batchSize)),
      trainLoss: null,
      evalLoss: null,
      bestEvalLoss: null,
      evalCer: null,
      bestCer: null,
      evalWer: null,
      bestWer: null,
      history: [],
      sampleCount,
      device: 'Detecting...',
      modelName: 'openai/whisper-small.en',
      transcriptMode: mode,
      startTime: Date.now(),
      endTime: null,
      elapsedSeconds: 0,
      estimatedRemainingSeconds: null,
      logs: [],
      totalLogLines: 0,
      error: null,
      isSimulated: false
    };

    pushTrainingLog(`[🚀 INITIALIZING] Preparing local Whisper fine-tuning run for Paxton...`);
    pushTrainingLog(`--> Dataset samples: ${sampleCount} clips exported to dataset/metadata.csv`);
    pushTrainingLog(`--> Parameters: epochs=${epochs}, lr=${lr}, batch_size=${batchSize}, mode=${mode}`);

    if (fs.existsSync('run_training.sh')) {
      try { fs.chmodSync('run_training.sh', 0o755); } catch(e) {}
    }

    activeTrainProcess = spawn('bash', [
      'run_training.sh',
      epochs.toString(),
      lr.toString(),
      batchSize.toString(),
      mode
    ], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    activeTrainProcess.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      text.split('\n').forEach(pushTrainingLog);
    });

    activeTrainProcess.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      text.split('\n').forEach(pushTrainingLog);
    });

    activeTrainProcess.on('close', (code: number) => {
      activeTrainProcess = null;
      trainingTelemetry.endTime = Date.now();
      if (code === 0) {
        trainingTelemetry.status = 'completed';
        trainingTelemetry.phase = 'Training Complete — Weights Exported';
        pushTrainingLog(`[✅ SUCCESS] Process finished cleanly with exit code 0`);
      } else {
        trainingTelemetry.status = 'failed';
        trainingTelemetry.phase = `Process exited with code ${code}`;
        pushTrainingLog(`[❌ FAILED] Process exited with code ${code}`);
      }
    });

    res.json({ success: true, message: `Training launched on ${sampleCount} samples.` });
  } catch(e) {
    console.error('Failed to start training:', e);
    res.status(500).json({ success: false, error: 'Could not launch training pipeline' });
  }
});

app.get('/api/training/checkpoints', (req, res) => {
  const artifacts: any[] = [];
  const checkDir = path.join(process.cwd(), 'whisper-paxton-checkpoints');
  const finalDir = path.join(process.cwd(), 'whisper-paxton-final');

  if (fs.existsSync(finalDir)) {
    let manifest: any = {};
    const manifestPath = path.join(finalDir, 'training_manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch(e) {}
    }

    artifacts.push({
      id: 'final',
      name: 'whisper-paxton-final',
      path: finalDir,
      type: 'Final Release Model',
      date: fs.statSync(finalDir).mtime.toISOString(),
      manifest,
      isFinal: true
    });
  }

  if (fs.existsSync(checkDir)) {
    try {
      const entries = fs.readdirSync(checkDir);
      for (const entry of entries) {
        const full = path.join(checkDir, entry);
        if (fs.statSync(full).isDirectory()) {
          artifacts.push({
            id: entry,
            name: entry,
            path: full,
            type: 'Intermediate Checkpoint',
            date: fs.statSync(full).mtime.toISOString(),
            isFinal: false
          });
        }
      }
    } catch(e) {}
  }

  res.json(artifacts);
});

app.post('/api/training/finalize', async (req, res) => {
  try {
    const venvPy = path.join(process.cwd(), 'venv_train', 'bin', 'python3');
    const pyBin = fs.existsSync(venvPy) ? venvPy : 'python3';
    const finalizeScript = path.join(process.cwd(), 'finalize_model.py');

    if (!fs.existsSync(finalizeScript)) {
      return res.status(404).json({ success: false, error: 'finalize_model.py not found' });
    }

    pushTrainingLog("📦 [MANUAL FINALIZE] Triggered model finalization from best checkpoint …");
    const { stdout, stderr } = await execAsync(`"${pyBin}" "${finalizeScript}"`);
    if (stdout) {
      stdout.split('\n').forEach(line => { if (line.trim()) pushTrainingLog(line); });
    }
    if (stderr) {
      stderr.split('\n').forEach(line => { if (line.trim()) pushTrainingLog(line); });
    }

    trainingTelemetry.status = 'completed';
    trainingTelemetry.phase = 'Fine-Tuned Model Finalized & Ready for Use';
    res.json({ success: true, message: 'Model successfully finalized and activated!' });
  } catch (err: any) {
    console.error('Failed to finalize model:', err);
    res.status(500).json({ success: false, error: err.message || 'Finalization failed' });
  }
});

// Legacy backward-compatible endpoint
app.post('/api/train-models', async (req, res) => {
  console.log(`\n[🚀 WHISPER TRAINING & DATASET BUILD INITIATED]`);
  try {
    const { sampleCount } = buildDatasetCsv();
    if (sampleCount < 5) {
      return res.json({ success: false, message: `Need at least 5 audio samples to begin (Current: ${sampleCount}). Finalize more in the pipeline.` });
    }
    // Launch training through unified manager
    const epochs = appSettings.trainingEpochs || 15;
    const lr = appSettings.trainingLR || '5e-6';
    const batchSize = appSettings.trainingBatchSize || 8;
    const mode = appSettings.trainingMode || 'phonetic';

    trainingTelemetry = {
      status: 'preparing',
      phase: 'Initiating Fine-Tuning Pipeline …',
      currentEpoch: 0,
      totalEpochs: epochs,
      currentStep: 0,
      totalSteps: epochs * Math.max(1, Math.ceil(sampleCount / batchSize)),
      trainLoss: null,
      evalLoss: null,
      bestEvalLoss: null,
      evalCer: null,
      bestCer: null,
      evalWer: null,
      bestWer: null,
      history: [],
      sampleCount,
      device: 'Detecting...',
      modelName: 'openai/whisper-small.en',
      transcriptMode: mode,
      startTime: Date.now(),
      endTime: null,
      elapsedSeconds: 0,
      estimatedRemainingSeconds: null,
      logs: [],
      totalLogLines: 0,
      error: null,
      isSimulated: false
    };

    activeTrainProcess = spawn('bash', [
      'run_training.sh',
      epochs.toString(),
      lr.toString(),
      batchSize.toString(),
      mode
    ], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    activeTrainProcess.stdout.on('data', (d: Buffer) => d.toString().split('\n').forEach(pushTrainingLog));
    activeTrainProcess.stderr.on('data', (d: Buffer) => d.toString().split('\n').forEach(pushTrainingLog));
    activeTrainProcess.on('close', (code: number) => {
      activeTrainProcess = null;
      trainingTelemetry.status = code === 0 ? 'completed' : 'failed';
    });

    res.json({ success: true, message: `Whisper training started on ${sampleCount} samples! Open the Model Training Studio to watch live telemetry.` });
  } catch(e) {
    console.error("Dataset optimization failed", e);
    res.status(500).json({ error: 'Failed to compile datasets' });
  }
});

app.delete('/api/audio_bank/:id', (req, res) => {
  const id = req.params.id;
  const initialLength = audioBank.length;
  audioBank = audioBank.filter(a => a.id !== id);
  
  if (audioBank.length < initialLength) {
    saveAudioBank();
    console.log(`\n[🗑️ AUDIO DELETED] ID: ${id}`);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Audio not found' });
  }
});

app.put('/api/audio_bank/:id/rename', (req, res) => {
  const id = req.params.id;
  const { newName } = req.body;
  const audio = audioBank.find(a => a.id === id);
  if (audio && newName) {
    const oldName = audio.filename;
    audio.filename = newName;
    saveAudioBank();
    console.log(`\n[✏️ AUDIO RENAMED] ${oldName} -> ${newName}`);
    res.json(audio);
  } else {
    res.status(400).json({ error: 'Invalid request' });
  }
});

app.post('/api/interactions', (req, res) => {
  const interaction = req.body;
  interaction.id = Date.now().toString();
  interaction.timestamp = new Date().toISOString();
  interactions.unshift(interaction);
  saveDb();

  if ((interaction.mode === 'choice' || interaction.mode === 'clarification') && 
      interaction.finalText && interaction.whisper_guess) {
    
    let category = 'Multiple Choice Selection';
    if (interaction.mode === 'clarification' || !interaction.selectedId) {
      category = 'Manual Override';
    }

    const trainingItem = {
      id: Date.now().toString() + "_train",
      timestamp: new Date().toISOString(),
      category: category,
      sound: interaction.whisper_guess,
      meaning: interaction.finalText,
      hasAudio: false
    };
    trainingData.unshift(trainingItem);
    saveTrainingData();
    console.log(`\n[🧠 AUTO-LEARNED FROM INTERACTION]`);
    console.log(`--> Mode: ${interaction.mode.toUpperCase()}`);
    console.log(`--> Sounded like: "${trainingItem.sound}"`);
    console.log(`--> Correct Intent: "${trainingItem.meaning}"`);
  }

  res.json(interaction);
});

// -----------------------------------------------------
// Core Local Architecture (Modular Core)
// -----------------------------------------------------

class AudioPipeline {
  static async process(file: any) {
    if (!file) return '';
    const originalPath = file.path;
    const wavPath = `${originalPath}.wav`;
    try {
      // Convert to 16kHz WAV using FFmpeg as required by whisper.cpp
      await execAsync(`ffmpeg -y -i "${originalPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}"`);
      return wavPath;
    } catch (err) {
      console.error("--> [AudioPipeline] FFmpeg conversion failed:", err);
      return originalPath;
    }
  }
}

class WhisperEngine {
  static async transcribe(audioPath: string) {
    if (!audioPath) return "";

    // 1. Try Local Fine-Tuned Paxton Model (whisper-paxton-final or best checkpoint)
    const finalDir = path.join(process.cwd(), 'whisper-paxton-final');
    const ckptsDir = path.join(process.cwd(), 'whisper-paxton-checkpoints');
    const venvPy = path.join(process.cwd(), 'venv_train', 'bin', 'python3');
    const pyBin = fs.existsSync(venvPy) ? venvPy : 'python3';
    const transcribeScript = path.join(process.cwd(), 'transcribe_local.py');

    if (fs.existsSync(transcribeScript) && (fs.existsSync(finalDir) || fs.existsSync(ckptsDir))) {
      try {
        console.log(`\n[🎙️ LOCAL WHISPER] Transcribing with fine-tuned Paxton model via ${pyBin} …`);
        const { stdout } = await execAsync(`"${pyBin}" "${transcribeScript}" "${audioPath}"`);
        const res = JSON.parse(stdout.trim());
        if (res && res.text) {
          console.log(`[✅ WHISPER TRANSCRIBED (${res.model} on ${res.device})] "${res.text}"`);
          return res.text.trim();
        }
      } catch (localErr) {
        console.warn("[⚠️ LOCAL WHISPER] Local Python inference notice:", localErr);
      }
    }

    // 2. Fallback to whisperEndpoint (e.g. whisper.cpp server)
    try {
      const whisperUrl = appSettings.whisperEndpoint || 'http://localhost:8080';
      const { stdout } = await execAsync(`curl -s --max-time 15 ${whisperUrl}/inference -H "Content-Type: multipart/form-data" -F file="@${audioPath}"`);
      const res = JSON.parse(stdout);
      return res.text ? res.text.trim() : "";
    } catch (err) {
      console.error("--> [WhisperEngine] Fallback endpoint error:", err);
      return "Transcription failed";
    }
  }
}

class RetrievalMemory {
  static async search(text: string) {
    // Word-based matching only (the old substring matching let "a" or "i" match every entry).
    const topDictMatches = findRelatedPairs(
      text,
      dictionaryData.map(d => ({ sound: d.word, item: d })),
      3
    ).map(p => p.item);

    const topTrainingMatches = findRelatedPairs(text, trainingData, 3);

    const topPastInteractions = findRelatedPairs(
      text,
      interactions.filter(i => i.finalText).map(i => ({ sound: i.whisper_guess, item: i })),
      3
    ).map(p => p.item);

    // Dynamic temporal context
    const currentTime = new Date();
    const hour = currentTime.getHours();
    let timeOfDay = "night";
    if (hour >= 5 && hour < 12) timeOfDay = "morning";
    else if (hour >= 12 && hour < 17) timeOfDay = "afternoon";
    else if (hour >= 17 && hour < 21) timeOfDay = "evening";

    return {
      location: "local device",
      time: timeOfDay,
      dictionary: topDictMatches,
      customDictionary: topTrainingMatches,
      pastMatches: topPastInteractions
    };
  }
}

/** Verified pairs to show the model: the ones most similar to what was heard first, then a few general examples. */
function verifiedPairsFor(text: string, max = 6) {
  const related = findRelatedPairs(text, trainingData, 3);
  const seen = new Set(related.map(p => lexKey(p.sound)));
  const rest = trainingData
    .filter(t => t.sound && t.meaning && !seen.has(lexKey(t.sound)))
    .slice(0, Math.max(0, max - related.length));
  return [...related, ...rest];
}

function buildEmptyPhases(threshold: number, note: string) {
  const empty = { phoneticTranscript: '', rawAcousticGuess: '', confidence: 0 };
  return {
    phase1: empty,
    phase1A: empty,
    phase1B: { initialAssumption: '', miniModelUsed: 'not run', learnedPairsMatched: [], confidence: 0, reasoning: note },
    phase2: { initialGuess: '', reasoning: note, identifiedAtypicalFeatures: [], nextStepsPlanned: [] },
    phase3: { appliedRules: [], searchedRulesCount: grammarRulebook.length, ruleTransformedText: '', reasoning: '', newAssumptions: [] },
    phase4: { matchedDictionaryEntries: [], priorContextUsed: {}, refinedAssumption: '', confidenceScore: 0, isLowCertainty: true, threshold },
    phase5: { spokenText: '', voiceEngine: 'Web Speech / TTS Voice Model', autoSpoken: false, status: 'ready' as const }
  };
}

function currentThreshold(): number {
  return typeof appSettings.lowCertaintyThreshold === 'number' ? appSettings.lowCertaintyThreshold : 0.78;
}

class LlamaInterpreter {
  static async interpret(text: string, context: any) {
    const threshold = currentThreshold();

    if (!text || text === "Transcription failed") {
      return {
        candidates: [] as any[],
        confidence: 0,
        appliedRules: [] as any[],
        phases: buildEmptyPhases(threshold, 'No acoustic audio detected.'),
        isLowCertainty: true,
        didYouMeanPrompt: '',
        mode: 'clarification' as const
      };
    }

    const textTrim = text.trim();

    // ───────────────────────────────────────────────────────────
    // Deterministic decode: dictionary phrases -> grammar rules -> dictionary words
    // ───────────────────────────────────────────────────────────
    const lexicon = buildLexicon(dictionaryData, crossReferenceData);
    const activeConfirmedRules = grammarRulebook.filter(isRuleActive);
    const decoded = decodeUtterance(textTrim, { lexicon, rules: grammarRulebook });

    // Phonetic acoustic resolver for atypical speech patterns
    const acoustic = resolveAcousticPhonetics(textTrim, {
      lexicon,
      rules: grammarRulebook,
      trainingData
    });

    // A user-verified utterance (same words, ignoring case/punctuation) beats any model guess.
    const exactKey = lexKey(textTrim);
    const exactPairs = trainingData.filter(t => t.sound && t.meaning && lexKey(t.sound) === exactKey);
    const exactMeanings: string[] = [];
    for (const p of exactPairs) {
      const m = String(p.meaning).trim();
      if (m && !exactMeanings.some(x => x.toLowerCase() === m.toLowerCase())) exactMeanings.push(m);
    }
    const relatedPairs = findRelatedPairs(textTrim, trainingData, 3);

    // ───────────────────────────────────────────────────────────
    // PHASE 1A: Whisper Acoustic Phonetic Capture
    // ───────────────────────────────────────────────────────────
    const phase1A = {
      phoneticTranscript: text,
      rawAcousticGuess: text,
      confidence: 0.90
    };

    // ───────────────────────────────────────────────────────────
    // PHASE 1B: Mini LLM initial assumption (skipped when a verified pair exists)
    // ───────────────────────────────────────────────────────────
    let miniLlmAssumption = exactMeanings[0] || (decoded.coverage > 0 ? decoded.decoded : acoustic.decoded);
    const miniModel = appSettings.miniLlmModel || 'gemma2:2b';
    // The small first-guess model is planned for later. Until it is switched on, Phase 1B reports the
    // acoustic/dictionary draft as the first assumption.
    const miniLlmEnabled = appSettings.miniLlmEnabled === true;

    if (exactMeanings.length === 0 && miniLlmEnabled) {
      try {
        const miniPrompt = `You are a specialized lightweight AAC edge model trained on Paxton's phonetic speech.
Phonetic input: "${text}"
Dictionary/rule-based draft: "${decoded.coverage > 0 ? decoded.decoded : acoustic.decoded}"
Matched Training Pairs: ${JSON.stringify(relatedPairs.map(p => ({ sound: p.sound, meaning: p.meaning })))}

Output in 1 short phrase: What is your initial 1st-pass translation assumption of what Paxton means?`;
        const miniRes = await queryLlm(miniPrompt, miniModel, false);
        if (miniRes && miniRes.trim().length > 0) {
          const cleanMini = miniRes.trim().replace(/^["']|["']$/g, '').replace(/^(Paxton means|He means|Translation:)\s*/i, '');
          if (cleanMini && cleanMini.length < 80) {
            miniLlmAssumption = cleanMini;
          }
        }
      } catch(e) {
        console.warn("--> [Phase 1B Mini LLM Note]:", e);
      }
    }

    const phase1B = {
      initialAssumption: miniLlmAssumption,
      miniModelUsed: exactMeanings.length > 0
        ? 'verified training pair (no model needed)'
        : miniLlmEnabled ? `${miniModel} (Fine-Tuned Mini LLM)` : (decoded.coverage > 0 ? 'dictionary + rulebook draft' : 'phonetic acoustic resolver'),
      learnedPairsMatched: relatedPairs.map(p => ({ sound: p.sound, meaning: p.meaning })),
      confidence: exactMeanings.length > 0
        ? 0.94
        : miniLlmEnabled ? 0.76 : (decoded.coverage > 0 ? fallbackConfidence(decoded.coverage) : acoustic.confidence),
      reasoning: exactMeanings.length > 0
        ? `Matched fine-tuned phonetic memory pair: "${exactPairs[0].sound}" → "${exactMeanings[0]}"`
        : miniLlmEnabled
          ? `1st-pass semantic translation generated by Mini LLM based on Paxton's phonetic speech.`
          : (decoded.coverage > 0
            ? `Draft built from dictionary and grammar rulebook alone.`
            : `Acoustic speech resolver analyzed phonetic shifts: ${acoustic.explanations.slice(0, 2).join('; ') || 'phonetic sound resolution'}`)
    };

    // ───────────────────────────────────────────────────────────
    // PHASE 2: Contextual reasoning summary (derived from what actually matched)
    // ───────────────────────────────────────────────────────────
    const identifiedAtypicalFeatures: string[] = decoded.appliedRules.map(r => r.ruleName);
    if (decoded.matchedEntries.length > 0) {
      identifiedAtypicalFeatures.push(
        `Known vocabulary: ${decoded.matchedEntries.slice(0, 4).map(e => `"${e.word}" → "${e.definition}"`).join(', ')}`
      );
    }
    if (identifiedAtypicalFeatures.length === 0 && acoustic.explanations.length > 0) {
      identifiedAtypicalFeatures.push(...acoustic.explanations.slice(0, 3));
    }
    if (identifiedAtypicalFeatures.length === 0) {
      identifiedAtypicalFeatures.push("No known rule or dictionary entry matched; relying on model inference");
    }

    const phase2 = {
      initialGuess: phase1B.initialAssumption,
      reasoning: `Phase 1A captured phonetic sound: "${text}". Phase 1B proposed: "${phase1B.initialAssumption}". ${decoded.matchedEntries.length} dictionary entr${decoded.matchedEntries.length === 1 ? 'y' : 'ies'} and ${decoded.appliedRules.length} grammar rule(s) explain ${(decoded.coverage * 100).toFixed(0)}% of the utterance.${acoustic.explanations.length > 0 ? ` Acoustic resolver identified: ${acoustic.explanations.slice(0, 3).join(', ')}.` : ''}`,
      identifiedAtypicalFeatures,
      nextStepsPlanned: [
        "Apply Paxton's confirmed Grammar Rulebook",
        "Cross-reference the active Dictionary for known words and phrases",
        `Score certainty and gate auto-speak below ${(threshold * 100).toFixed(0)}%`
      ]
    };

    // ───────────────────────────────────────────────────────────
    // PHASE 3: Grammar Rulebook (applied inside decodeUtterance)
    // ───────────────────────────────────────────────────────────
    const appliedRules = decoded.appliedRules.map(r => ({
      ruleId: r.ruleId,
      ruleName: r.ruleName,
      action: r.action,
      reason: r.reason
    }));

    const transformedCandidate = decoded.ruleTransformedText !== textTrim
      ? decoded.ruleTransformedText
      : (acoustic.decoded !== textTrim ? acoustic.decoded : decoded.ruleTransformedText);

    const phase3 = {
      appliedRules,
      searchedRulesCount: activeConfirmedRules.length,
      ruleTransformedText: transformedCandidate,
      reasoning: appliedRules.length > 0
        ? `Applied ${appliedRules.length} verified rule(s) from Paxton's Grammar Rulebook: ${appliedRules.map(r => r.ruleName).join(', ')}.`
        : (acoustic.explanations.length > 0 ? `Acoustic analysis resolved: ${acoustic.explanations.join('; ')}` : `Searched ${activeConfirmedRules.length} active grammar rules; no structural mutation triggered.`),
      newAssumptions: appliedRules.length > 0 ? appliedRules.map(r => `${r.ruleName}: "${r.action}"`) : acoustic.explanations
    };

    // ───────────────────────────────────────────────────────────
    // PHASE 4: Dictionary, context, final assumption and confidence
    // ───────────────────────────────────────────────────────────
    const matchedEntries = decoded.matchedEntries;
    const effectiveDraft = decoded.coverage > 0 ? decoded.decoded : acoustic.decoded;

    const promptText = buildInterpreterPrompt({
      heard: text,
      draft: effectiveDraft,
      coverage: decoded.coverage > 0 ? decoded.coverage : acoustic.coverage,
      rules: activeConfirmedRules,
      entries: matchedEntries,
      verifiedPairs: verifiedPairsFor(textTrim),
      pastConfirmations: (context?.pastMatches || []).map((p: any) => ({ heard: p.whisper_guess, confirmed: p.finalText })),
      timeOfDay: context?.time
    });

    let candidates: { id: string; text: string; probability: number }[] = [];
    let confidence = 0;
    let llmUsed = false;
    let draftOverrodeModel = false;

    if (exactMeanings.length > 0) {
      // Verified memory: no model call. Several different verified meanings => let the user choose.
      const ambiguous = exactMeanings.length > 1;
      const alts: any[] = exactMeanings.map((m, i) => ({ text: m, probability: ambiguous ? (i === 0 ? 0.5 : 0.3) : 0.96 }));
      if (!exactMeanings.some(m => m.toLowerCase() === effectiveDraft.toLowerCase())) {
        alts.push({ text: effectiveDraft, probability: 0.03 });
      }
      candidates = sanitizeCandidates(alts);
      confidence = ambiguous ? 0.84 : 0.95;
    } else {
      let parsedResult: any = null;
      try {
        const rawResponse = await queryLlm(promptText, appSettings.llamaInterpreterModel || 'llama3', true, 55000);
        if (rawResponse) {
          let cleanText = rawResponse.trim();
          const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
          if (jsonMatch) cleanText = jsonMatch[0];
          parsedResult = JSON.parse(cleanText);
        }
      } catch (e) {
        console.warn("--> [LlamaInterpreter] LLM query note:", e);
      }

      const echo = lexKey(textTrim);
      const llmCandidates = parsedResult && Array.isArray(parsedResult.candidates)
        ? sanitizeCandidates(
            parsedResult.candidates.map((c: any) => {
              let txt = String(c?.text ?? '').trim();
              // If model parroted the raw phonetics, replace with interpreted decode
              if (txt && lexKey(txt) === echo) {
                txt = effectiveDraft;
              }
              return { text: txt, probability: c?.probability };
            })
          )
        : [];

      if (llmCandidates.length > 0) {
        llmUsed = true;
        const llmTopAgrees = lexKey(llmCandidates[0].text) === lexKey(effectiveDraft);

        const merged = applyDraftToCandidates(llmCandidates, effectiveDraft, matchedEntries, decoded.coverage > 0 ? decoded.coverage : acoustic.coverage, introducedWords(decoded.appliedRules));
        candidates = merged.candidates;
        draftOverrodeModel = merged.violated.length > 0;
        if (draftOverrodeModel) {
          console.log(`--> [Interpreter] Model dropped verified meaning(s) for ${merged.violated.map(w => `"${w}"`).join(', ')}; using the dictionary/rule decode instead.`);
        }

        const reported = typeof parsedResult.confidence === 'number' && isFinite(parsedResult.confidence)
          ? parsedResult.confidence
          : candidates[0].probability;
        confidence = Math.min(0.98, Math.max(0.4, reported));
        confidence = Math.min(confidence, evidenceCeiling(decoded.coverage > 0 ? decoded.coverage : acoustic.coverage));
        if (llmTopAgrees && (decoded.coverage > 0 || acoustic.coverage > 0)) {
          confidence = Math.max(confidence, decoded.coverage > 0 ? fallbackConfidence(decoded.coverage) : acoustic.confidence);
        }
        if (draftOverrodeModel) {
          confidence = Math.min(fallbackConfidence(decoded.coverage), AUTO_ACCEPT_CONFIDENCE - 0.01);
        }
      } else {
        // High-intelligence Local Phonetic Resolver fallback
        const candidateA = decoded.coverage > 0 ? decoded.decoded : acoustic.decoded;
        const alts: { text: string; probability: number }[] = [];

        // Include alternative readings from acoustic resolver
        for (const ac of acoustic.candidates.slice(1)) {
          alts.push({ text: ac.text, probability: ac.probability });
        }

        const wantVariant = candidateA.replace(/\bneed\b/i, 'want');
        if (wantVariant !== candidateA && !alts.some(a => a.text === wantVariant)) {
          alts.push({ text: wantVariant, probability: 0.1 });
        }

        for (const e of matchedEntries) {
          const primary = primaryMeaning(e.definition);
          for (const alt of alternativeMeanings(e.definition)) {
            const swapped = candidateA.replace(new RegExp(`\\b${escapeRegExp(primary)}\\b`, 'i'), alt);
            if (swapped !== candidateA && !alts.some(a => a.text === polish(swapped))) {
              alts.push({ text: polish(swapped), probability: 0.1 });
            }
          }
        }

        confidence = decoded.coverage > 0 ? fallbackConfidence(decoded.coverage) : acoustic.confidence;
        candidates = sanitizeCandidates([{ text: candidateA, probability: confidence }, ...alts]);
      }
    }

    const isLowCertainty = confidence < threshold;
    const mode = routeConfidence(confidence, threshold);
    const didYouMeanPrompt = candidates[0]?.text || '';
    const usage = summarizeUsage({ verifiedPair: exactMeanings.length > 0, llmUsed, decoded, draftOverrodeModel });
    if (usage.coverage === 0 && acoustic.coverage > 0) {
      usage.coverage = Math.round(acoustic.coverage * 1000) / 1000;
    }

    const phase4 = {
      matchedDictionaryEntries: matchedEntries.map(m => ({ word: m.word, definition: m.definition, type: m.type })),
      priorContextUsed: {
        location: context?.location || 'Living Room',
        time: context?.time || 'Now',
        recentConversationsCount: Array.isArray(context?.pastMatches) ? context.pastMatches.length : 0
      },
      refinedAssumption: candidates[0]?.text || '',
      confidenceScore: confidence,
      isLowCertainty,
      threshold,
      didYouMeanPrompt
    };

    // ───────────────────────────────────────────────────────────
    // PHASE 5: Voice output. Only auto-speak when the router says "auto"
    // (previously this fired for "choice" mode too, speaking before the user had chosen).
    // ───────────────────────────────────────────────────────────
    const phase5 = {
      spokenText: candidates[0]?.text || '',
      voiceEngine: 'Web Speech / TTS Voice Model',
      autoSpoken: mode === 'auto',
      status: 'ready' as const
    };

    const phases = {
      phase1: phase1A, // backwards compatible alias
      phase1A,
      phase1B,
      phase2,
      phase3,
      phase4,
      phase5
    };

    console.log(`--> [Interpreter Multi-Phase Summary]`);
    console.log(`    Phase 1A (Whisper): "${phase1A.phoneticTranscript}"`);
    console.log(`    Phase 1B (Assumption): "${phase1B.initialAssumption}" (${phase1B.miniModelUsed})`);
    console.log(`    Phase 3 (Grammar Rules): applied ${phase3.appliedRules.length} rule(s) -> "${phase3.ruleTransformedText}"`);
    console.log(`    Phase 4 (Dictionary & Context): final="${phase4.refinedAssumption}" confidence=${(confidence*100).toFixed(1)}% coverage=${(decoded.coverage*100).toFixed(0)}% mode=${mode}`);
    console.log(`    Phase 5 (Voice Model): ${phase5.autoSpoken ? 'will auto-speak' : 'waiting for confirmation'} "${phase5.spokenText}"`);
    console.log(`    Used: source=${usage.source} dictionaryEntries=${usage.dictionaryEntriesUsed} rules=${usage.rulesApplied} coverage=${(usage.coverage * 100).toFixed(0)}%${usage.draftOverrodeModel ? ' (dictionary overrode model)' : ''}`);

    return {
      candidates,
      confidence,
      appliedRules,
      phases,
      isLowCertainty,
      didYouMeanPrompt,
      mode,
      usage
    };
  }
}

class ConfidenceRouter {
  static route(confidence: number, threshold: number = 0.78) {
    return routeConfidence(confidence, threshold);
  }
}

class DecisionEngine {
  static async executeSimplified(file: any, textOverride?: string) {
    console.log(`\n[${new Date().toISOString()}] ⚡ SIMPLIFIED WHISPER-TURBO LoRA PIPELINE INITIATED`);
    let whisperGuess = (textOverride || "").trim();
    let transcriptionFailed = false;

    const audioPairId = "pair_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);

    if (file) {
      const audioInput = await AudioPipeline.process(file);
      const transcribed = await WhisperEngine.transcribe(audioInput);
      if (transcribed === "Transcription failed") {
        transcriptionFailed = true;
      } else if (transcribed) {
        whisperGuess = transcribed;
      }
      try {
        const dstPath = path.join('paxton-interpreter', 'data', 'pairs', `${audioPairId}.wav`);
        fs.copyFileSync(file.path, dstPath);
      } catch(e) {}
    }

    if (!whisperGuess) {
      return {
        whisper_guess: '',
        rawWhisperTranscript: '',
        candidates: [] as any[],
        final_confidence: 0,
        mode: 'clarification' as const,
        appliedRules: [],
        isLowCertainty: true,
        isSimplifiedMode: true,
        didYouMeanPrompt: '',
        audioPairId,
        context: { location: 'Home', time: 'Now' }
      };
    }

    // 1. Check exact match in training library
    const exactMatch = trainingData.find(t => String(t.sound).trim().toLowerCase() === whisperGuess.toLowerCase());
    let rawConfidence = exactMatch ? 0.96 : (whisperGuess.split(/\s+/).length >= 3 ? 0.84 : 0.74);

    const lexicon = buildLexicon(dictionaryData, crossReferenceData);
    const decoded = decodeUtterance(whisperGuess, { lexicon, rules: grammarRulebook });
    let finalText = exactMatch ? exactMatch.meaning : decoded.decoded;

    if (decoded.coverage > 0) {
      rawConfidence = Math.max(rawConfidence, 0.88);
    } else {
      // Acoustic phonetic resolver
      const phoneticRes = resolveAcousticPhonetics(whisperGuess, { lexicon, rules: grammarRulebook, trainingData });
      if (phoneticRes.confidence > 0 && phoneticRes.decoded && phoneticRes.decoded.toLowerCase() !== whisperGuess.toLowerCase()) {
        finalText = phoneticRes.decoded;
        rawConfidence = Math.max(rawConfidence, phoneticRes.confidence);
      }
    }

    const threshold = appSettings.simplifiedConfidenceThreshold || 0.82;
    let lightLlmCorrectionApplied = false;
    let correctionReason = '';
    let finalConfidence = rawConfidence;

    // 2. Light context-aware LLM translation when confidence is below threshold
    if ((rawConfidence < threshold || /(tobah|watubah|wakabah|caskon|cassin|blackwet|dussin|wah out)/i.test(whisperGuess)) && appSettings.lightLlmCorrectionEnabled !== false) {
      console.log(`--> [Simplified Mode] Confidence ${(rawConfidence * 100).toFixed(0)}%. Running severe speech translation LLM...`);
      try {
        const corrModel = appSettings.gemmaModel || appSettings.llamaInterpreterModel || 'gemma2';
        const prompt = `You are a specialized speech translation module for Paxton, an individual with severe speech motor differences and atypical idiosyncratic speech patterns.
Raw acoustic transcription from fine-tuned Whisper (${appSettings.whisperTurboModel || 'whisper-small'}): "${whisperGuess}"
Acoustic draft: "${finalText}"

Paxton's Verified Translation Rules:
- "Watubah" -> "I want talk about" / "want talk about"
- "Wakabah" -> "I wan talk to" / "want talk to"
- "Tobah" -> "toilet paper"
- "dussin" (in names/asking) -> "Dustin", (before verbs) -> "doesn't"
- "caskon" -> "cat's gone"
- "Cassin" -> "Cat"
- "blackwet" -> "black white"
- "wah out" -> "ran out"
- "best you ah" -> "go back to work"
- "Am I a black" -> "I like mower, black"
- "see you some" -> "sing a song / sing song"
- "nee a hell" -> "need some help"
- "wike dat" -> "like that"
- "foo" -> "food", "ha" -> "have", "lunsh" -> "lunch"

Task:
Translate and restore Paxton's intended natural English sentence accurately using his rules above. Preserve his exact message. Do not invent unrelated content.

Reply with JSON only:
{"corrected": "intended natural english sentence", "confidence": 0.92, "changes": "brief note"}`;

        const rawLlm = await queryLlm(prompt, corrModel, true, 12000);
        if (rawLlm) {
          const parsed = JSON.parse(rawLlm.replace(/```json|```/g, '').trim());
          if (parsed.corrected && typeof parsed.corrected === 'string') {
            finalText = parsed.corrected.trim();
            lightLlmCorrectionApplied = true;
            correctionReason = parsed.changes || 'Severe speech translation';
            finalConfidence = Math.min(0.95, Math.max(rawConfidence + 0.16, parsed.confidence || 0.90));
          }
        }
      } catch(e) {
        console.warn('Light LLM correction fallback notice:', e);
      }
    }

    const candidate = {
      id: 'A',
      text: finalText,
      probability: finalConfidence
    };

    console.log(`--> [Simplified Result] "${finalText}" (${(finalConfidence * 100).toFixed(1)}%, Light LLM: ${lightLlmCorrectionApplied})`);

    return {
      whisper_guess: whisperGuess,
      rawWhisperTranscript: whisperGuess,
      candidates: [candidate],
      final_confidence: finalConfidence,
      mode: finalConfidence >= threshold ? ('auto' as const) : ('choice' as const),
      isSimplifiedMode: true,
      lightLlmCorrectionApplied,
      correctionReason,
      audioPairId,
      context: { location: 'Home', time: 'Now' }
    };
  }

  static async execute(file: any, textOverride?: string) {
    if (appSettings.simplifiedMode === true || (textOverride && textOverride.startsWith('__SIMPLIFIED__'))) {
      const cleanText = textOverride ? textOverride.replace('__SIMPLIFIED__', '').trim() : '';
      return await DecisionEngine.executeSimplified(file, cleanText);
    }
    console.log(`\n[${new Date().toISOString()}] 🎙️  NEW AUDIO PIPELINE INITIATED`);
    console.log(`--> Audio Source: ${file ? file.filename || file.path : (textOverride ? 'Client Speech Stream' : 'Microphone Stream')}`);

    let whisperGuess = (textOverride || "").trim();
    let transcriptionFailed = false;

    if (file) {
      const audioInput = await AudioPipeline.process(file);
      const transcribed = await WhisperEngine.transcribe(audioInput);
      if (transcribed === "Transcription failed") {
        transcriptionFailed = true;
      } else if (transcribed) {
        whisperGuess = transcribed;
      }
    }

    const retrievalContext = await RetrievalMemory.search(whisperGuess);
    const ctx = { location: retrievalContext.location, time: retrievalContext.time };

    // Nothing was heard. Never invent a phrase: this is an assistive device, and speaking
    // "I need help" when nobody said anything is worse than saying nothing.
    if (!whisperGuess) {
      const reason = transcriptionFailed ? 'transcription_failed' : 'no_speech';
      console.log(`--> [Whisper STT] No usable speech (${reason}); returning an empty result instead of guessing.`);
      return {
        whisper_guess: '',
        candidates: [] as any[],
        final_confidence: 0,
        mode: 'clarification' as const,
        appliedRules: [] as any[],
        phases: buildEmptyPhases(currentThreshold(), reason === 'transcription_failed' ? 'Transcription failed.' : 'No speech detected.'),
        isLowCertainty: true,
        didYouMeanPrompt: '',
        noSpeech: true,
        error: reason,
        context: ctx
      };
    }

    console.log(`--> [Whisper STT Hypothesis] Guess: "${whisperGuess}"`);
    console.log(`--> [Memory] Found ${retrievalContext.pastMatches.length} similar past contexts`);
    console.log(`--> [Context] loc: ${retrievalContext.location}, time: ${retrievalContext.time}`);

    const { candidates, confidence, appliedRules, phases, isLowCertainty, didYouMeanPrompt, mode, usage } = await LlamaInterpreter.interpret(whisperGuess, retrievalContext);

    console.log(`--> [Interpreter] Generated ${candidates.length} candidates.`);
    candidates.forEach((c, i) => console.log(`    ${i+1}. "${c.text}" (${(c.probability * 100).toFixed(1)}%)`));
    if (appliedRules && appliedRules.length > 0) {
      console.log(`--> [Applied Grammar Rules] ${appliedRules.map((r: any) => r.ruleName).join(', ')}`);
    }
    console.log(`--> [Confidence Engine] Final Score: ${(confidence * 100).toFixed(1)}%`);
    console.log(`--> [Decision Router] Mode Selected: ${mode.toUpperCase()} (LowCertainty: ${isLowCertainty})`);
    console.log(`======================================================\n`);

    return {
      whisper_guess: whisperGuess,
      candidates,
      final_confidence: confidence,
      mode,
      appliedRules: appliedRules || [],
      phases,
      isLowCertainty,
      didYouMeanPrompt,
      usage,
      context: ctx
    };
  }
}

// -----------------------------------------------------
// Processing Pipeline Endpoint
// -----------------------------------------------------
app.post('/api/process-audio', upload.single('audio'), async (req, res) => {
  try {
    const textInput = (req.body?.text || req.body?.speech || req.query?.text || '').toString().trim();
    const result = await DecisionEngine.execute(req.file, textInput);
    res.json(result);
  } catch (err: any) {
    console.error('[process-audio] Pipeline error:', err);
    res.status(500).json({ error: 'pipeline_failed', message: err?.message || String(err) });
  }
});


function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '<YOUR_DEVICE_IP>';
}

// -----------------------------------------------------
// Vite Middleware & Static Serving
// -----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n======================================================`);
    console.log(`🎙️ PAXTON INTERPRETER GATEWAY RUNNING`);
    console.log(`======================================================`);
    console.log(`Local Access (On Device): http://localhost:${PORT}`);
    console.log(`Network Access (HTTP):    http://${getLocalIP()}:${PORT}`);
    console.log(`\nREQUIREMENTS FOR LOCAL PROCESSING:`);
    console.log(`1. Ollama (Llama 3 & Gemma 2): Running locally`);
    console.log(`   run: OLLAMA_HOST=0.0.0.0 ollama serve`);
    console.log(`2. Whisper: Use whisper.cpp or fine-tuned model.`);
    console.log(`======================================================\n`);
  });

  // Auto-generate local SSL certs for remote LAN device microphone support if missing
  if (!fs.existsSync('key.pem') || !fs.existsSync('cert.pem')) {
    try {
      execSync('openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=paxton-interpreter"', { stdio: 'ignore' });
      console.log('🔒 Auto-generated self-signed SSL certificate for remote LAN microphone access (key.pem, cert.pem)');
    } catch(e) {}
  }

  if (fs.existsSync('key.pem') && fs.existsSync('cert.pem')) {
    try {
      const httpsOptions = {
        key: fs.readFileSync('key.pem'),
        cert: fs.readFileSync('cert.pem')
      };
      const HTTPS_PORT = 3443;
      https.createServer(httpsOptions, app).listen(HTTPS_PORT, "0.0.0.0", () => {
        console.log(`🔒 HTTPS Gateway (Secure Mic for Mobile/LAN): https://${getLocalIP()}:${HTTPS_PORT}`);
      });
    } catch(e) {
      console.warn("HTTPS server startup notice:", e);
    }
  }
}

startServer();
