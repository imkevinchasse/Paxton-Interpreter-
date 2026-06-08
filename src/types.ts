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
}

export interface AppSettings {
  ollamaEndpoint: string;
  llamaModel: string;
  whisperEndpoint: string;
  speakerIsolationEnabled?: boolean;
}

export interface TrainingItem {
  id: string;
  timestamp: string;
  category: string;
  sound: string;
  meaning: string;
  hasAudio: boolean;
  filename?: string;
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

export type ViewState = 'interpreter' | 'training' | 'settings' | 'audiobank';
