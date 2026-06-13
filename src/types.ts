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
}

export interface DictionaryItem {
  id: string;
  word: string;
  definition: string;
  context?: string;
}

export type ViewState = 'interpreter' | 'training' | 'settings' | 'audiobank' | 'dictionary';
