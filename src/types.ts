export interface Candidate {
  id: string;
  text: string;
  probability: number;
}

export interface PipelineResult {
  whisper_guess: string;
  candidates: Candidate[];
  final_confidence: number;
  mode: 'auto' | 'choice' | 'clarification';
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

export type ViewState = 'interpreter' | 'training_studio' | 'training' | 'settings' | 'audiobank' | 'dictionary';
