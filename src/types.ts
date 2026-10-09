export interface Candidate {
  id: string;
  text: string;
  probability: number;
}

export interface AppliedGrammarRule {
  ruleId: string;
  ruleName: string;
  action: string;
  reason: string;
}

export interface InterpreterPhase1Whisper {
  phoneticTranscript: string;
  rawAcousticGuess: string;
  confidence: number;
}

export interface InterpreterPhase1AWhisper {
  phoneticTranscript: string;
  rawAcousticGuess: string;
  confidence: number;
}

export interface InterpreterPhase1BMiniLlm {
  initialAssumption: string;
  miniModelUsed: string;
  learnedPairsMatched: { sound: string; meaning: string }[];
  confidence: number;
  reasoning: string;
}

export interface InterpreterPhase2LLMInitial {
  initialGuess: string;
  reasoning: string;
  identifiedAtypicalFeatures: string[];
  nextStepsPlanned: string[];
}

export interface InterpreterPhase3GrammarRules {
  appliedRules: AppliedGrammarRule[];
  searchedRulesCount: number;
  ruleTransformedText: string;
  reasoning: string;
  newAssumptions: string[];
}

export interface InterpreterPhase4DictionaryContext {
  matchedDictionaryEntries: { word: string; definition: string; type?: string }[];
  priorContextUsed: { location?: string; time?: string; recentConversationsCount?: number };
  refinedAssumption: string;
  confidenceScore: number;
  isLowCertainty: boolean;
  threshold: number; // e.g. 0.78 (78%)
  didYouMeanPrompt?: string;
}

export interface InterpreterPhase5VoiceOutput {
  spokenText: string;
  voiceEngine: string;
  autoSpoken: boolean;
  status: 'ready' | 'speaking' | 'completed';
}

export interface MultiPhaseInterpretation {
  phase1?: InterpreterPhase1Whisper;
  phase1A: InterpreterPhase1AWhisper;
  phase1B: InterpreterPhase1BMiniLlm;
  phase2: InterpreterPhase2LLMInitial;
  phase3: InterpreterPhase3GrammarRules;
  phase4: InterpreterPhase4DictionaryContext;
  phase5: InterpreterPhase5VoiceOutput;
}

/** Where an answer came from: proof that the dictionary and rulebook were (or were not) used. */
export interface InterpretationUsage {
  source: 'verified_pair' | 'dictionary_rules' | 'llm_assisted' | 'llm_only' | 'unmatched';
  dictionaryEntriesUsed: number;
  rulesApplied: number;
  coverage: number;
  draft: string;
  draftOverrodeModel: boolean;
}

export interface PipelineResult {
  whisper_guess: string;
  candidates: Candidate[];
  final_confidence: number;
  mode: 'auto' | 'choice' | 'clarification';
  appliedRules?: AppliedGrammarRule[];
  phases?: MultiPhaseInterpretation;
  isLowCertainty?: boolean;
  didYouMeanPrompt?: string;
  usage?: InterpretationUsage;
  context: {
    location: string;
    time: string;
  };
}

export interface Interaction extends PipelineResult {
  id: string;
  timestamp: string;
  selectedId: string | null;
  finalText: string;
  dictProcessed?: boolean;
}

export interface AppSettings {
  ollamaEndpoint: string;
  llamaModel: string;
  llamaInterpreterModel?: string;
  llamaDictionaryModel?: string;
  gemmaModel?: string;
  grammarHypothesisModel?: string;
  hypothesisMinSupport?: number;
  hypothesisMinConfidence?: number;
  lowCertaintyThreshold?: number; // threshold below which "Did you mean ___?" triggers (e.g. 0.78)
  miniLlmModel?: string; // model for Phase 1B initial assumptions (e.g. gemma2:2b, llama3.2:1b)
  llmTimeoutMs?: number; // how long to wait for a model before using the offline guess
  miniLlmEnabled?: boolean; // Phase 1B small first-guess model. Planned, off by default.
  whisperEndpoint: string;
  speakerIsolationEnabled?: boolean;
  trainingEpochs?: number;
  trainingLR?: string;
  trainingBatchSize?: number;
  trainingMode?: string;
}

export interface TrainingItem {
  id: string;
  timestamp: string;
  category: string;
  sound: string;
  meaning: string;
  hasAudio: boolean;
  filename?: string;
  audioPath?: string;
  dictProcessed?: boolean;
}

export interface AudioRecording {
  id: string;
  filename: string;
  timestamp: string;
  status: 'unprocessed' | 'processed' | 'finalized' | 'ignored';
  sound?: string;
  meaning?: string;
  isCut?: boolean;
  path?: string;
  audioPath?: string;
}

export interface DictionaryItem {
  id: string;
  word: string;
  definition: string;
  context?: string;
  type?: 'word' | 'phrase';
}

export interface CrossReferenceItem {
  id: string;
  phonetic: string;
  meaning: string;
  type: 'word' | 'phrase';
  context: string;
  confidence: number;
  occurrences: number;
  approved?: boolean;
  inDictionary?: boolean;
  notes?: string;
}

export interface TrainingMetricPoint {
  epoch: number;
  step: number;
  trainLoss?: number;
  evalLoss?: number;
  evalCer?: number;
  evalWer?: number;
  learningRate?: number;
  timestamp: string;
}

export interface TrainingTelemetry {
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
  history: TrainingMetricPoint[];
  sampleCount: number;
  device: string;
  modelName: string;
  transcriptMode: string;
  startTime: number | null;
  elapsedSeconds: number;
  estimatedRemainingSeconds: number | null;
  logs: string[];
  totalLogLines: number;
  error?: string | null;
  isSimulated?: boolean;
}

export interface GrammarRuleExample {
  spoken: string;
  intended: string;
  note?: string;
}

export interface GrammarRule {
  id: string;
  ruleName: string;
  patternType: 'consonant_deletion' | 'intrusive_article' | 'vowel_reduction' | 'word_merging' | 'prefix_omission' | 'custom';
  /** Explicit built-in behaviour this rule stands for (intrusive_a, coda_deletion, th_stopping, dussin, baman). */
  patternKey?: string;
  /** Data-driven rule: when Paxton says this word/phrase ... */
  match?: string;
  /** ... decode it as this. A rule with neither a built-in pattern nor match/replacement only guides the language model. */
  replacement?: string;
  hypothesis: string; // The linguistic assumption/reasoning
  clinicalCategory?: string; // Clinical pathology category (e.g. Syllable Structure, Substitution, Morphosyntax, Gestalt)
  clinicalWhy?: string; // Physiological / neuromotor / articulatory rationale
  condition: string; // Trigger/phonetic context
  action: string; // How to translate/decode
  status: 'confirmed' | 'testing' | 'rejected' | 'candidate';
  confidence: number;
  accuracy: number;
  testedCount: number;
  supportedExamples: GrammarRuleExample[];
  counterExamples: GrammarRuleExample[];
  createdAt: string;
  updatedAt?: string;
  enabled?: boolean;
}

export interface HypothesisCycleResult {
  success: boolean;
  /** confirmed = added/re-confirmed, kept = already confirmed and stays so, testing = some evidence but not enough, candidate = no evidence yet */
  outcome: 'confirmed' | 'kept' | 'testing' | 'candidate';
  message: string;
  ruleId?: string;
  ruleName: string;
  patternKey: string;
  accuracy: number;
  supportedCount: number;
  counterCount: number;
  minSupport: number;
  minConfidence: number;
  rulebookCount: number;
  confirmedCount: number;
  cycle: number;
  at: string;
}

export interface HypothesisCycleStatus {
  active: boolean;
  isContinuous: boolean;
  cycleNumber: number;
  currentStep: 'idle' | 'scanning_dataset' | 'isolating_pattern' | 'formulating_hypothesis' | 'testing_across_corpus' | 'evaluating_decision';
  stepDescription: string;
  activeHypothesis: string | null;
  activePattern: string | null;
  activeCandidateRule?: Partial<GrammarRule> | null;
  testedPairsCount: number;
  totalDatasetPairs: number;
  confirmedRulesCount: number;
  rejectedRulesCount: number;
  modelUsed: string;
  logs: string[];
  lastResult?: HypothesisCycleResult | null;
  history?: HypothesisCycleResult[];
}

export interface DictionaryDeconstructionWord {
  phonetic: string;
  meaning: string;
  partOfSpeech?: string;
  confidence: number;
}

export interface DictionaryDeconstructionConnected {
  phoneticNgram: string;
  meaning: string;
  patternNote?: string;
}

export interface DictionaryQueueItem {
  id: string;
  originalSpoken: string;
  intendedMeaning: string;
  notes?: string;
  timestamp: string;
  status: 'pending' | 'analyzed' | 'approved' | 'rejected';
  deconstructedWords: DictionaryDeconstructionWord[];
  connectedWords: DictionaryDeconstructionConnected[];
  wholePhrase: {
    phonetic: string;
    meaning: string;
  };
  llmReasoning?: string;
}

export interface DataVersion {
  id: string;
  versionTag: string; // e.g. "v1.0", "v1.1"
  type: 'dataset' | 'rulebook' | 'dictionary';
  name: string;
  description: string;
  timestamp: string;
  itemCount: number;
  fineTuned?: boolean;
  fineTunedAt?: string;
  isActive: boolean;
  snapshotFile: string;
}

export interface VersioningState {
  datasetVersions: DataVersion[];
  rulebookVersions: DataVersion[];
  dictionaryVersions: DataVersion[];
  activeDatasetVersionId: string;
  activeRulebookVersionId: string;
  activeDictionaryVersionId: string;
  untrainedDatasetDeltaCount: number;
}

export type ViewState = 'interpreter' | 'training_studio' | 'training' | 'settings' | 'audiobank' | 'dictionary' | 'cross_reference' | 'grammar_rulebook' | 'versioning';

