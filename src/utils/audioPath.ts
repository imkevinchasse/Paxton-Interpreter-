import { type AudioRecording, type TrainingItem } from '../types';

/**
 * Extracts a clean, normalized filename from an audioPath, URL, or raw filename.
 * Strips leading directory segments like 'uploads/', '/uploads/', or full system paths.
 */
export function getCleanFilename(input?: string | null): string {
  if (!input) return '';
  let str = String(input).trim();

  // If input is a URL, parse pathname
  try {
    if (str.startsWith('http://') || str.startsWith('https://')) {
      const parsed = new URL(str);
      str = parsed.pathname;
    }
  } catch {
    // Keep str as is
  }

  // Remove query params or hash fragments
  str = str.split('?')[0].split('#')[0];

  // Convert Windows backslashes to forward slashes
  str = str.replace(/\\/g, '/');

  // Remove leading slashes and common upload folder prefixes
  str = str.replace(/^\/+/, '');
  str = str.replace(/^uploads\//i, '');

  // Extract the terminal filename
  const lastSlashIndex = str.lastIndexOf('/');
  if (lastSlashIndex >= 0) {
    str = str.substring(lastSlashIndex + 1);
  }

  // Decode URI components if it was encoded
  try {
    str = decodeURIComponent(str);
  } catch {
    // Keep decoded or raw
  }

  return str.trim();
}

/**
 * Resolves the base origin or endpoint URL from environment variables or browser context.
 */
export function getBaseAudioUrl(): string {
  // Check for explicitly configured base URLs in Vite environment
  const metaEnv = (import.meta as any)?.env || {};
  const envAudioUrl = metaEnv.VITE_AUDIO_BASE_URL;
  if (envAudioUrl && typeof envAudioUrl === 'string' && envAudioUrl.trim()) {
    return envAudioUrl.trim().replace(/\/+$/, '');
  }

  const envApiUrl = metaEnv.VITE_API_BASE_URL;
  if (envApiUrl && typeof envApiUrl === 'string' && envApiUrl.trim()) {
    return envApiUrl.trim().replace(/\/+$/, '');
  }

  // Default to browser origin if available
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  return '';
}

/**
 * Constructs an absolute URL pointing to the WAV/audio file inside the 'uploads' folder.
 * Example: http://localhost:3000/uploads/1781008695871-ZOOM0003_LR_snippet_2.wav
 */
export function getAudioAbsoluteUrl(filenameOrPath?: string | null): string {
  const clean = getCleanFilename(filenameOrPath);
  if (!clean) return '';
  const base = getBaseAudioUrl();
  const encodedName = encodeURIComponent(clean);
  return base ? `${base}/uploads/${encodedName}` : `/uploads/${encodedName}`;
}

/**
 * Constructs fallback API URL for serving the audio file via Express streaming endpoint.
 */
export function getAudioFallbackUrl(filenameOrPath?: string | null): string {
  const clean = getCleanFilename(filenameOrPath);
  if (!clean) return '';
  const base = getBaseAudioUrl();
  const encodedName = encodeURIComponent(clean);
  return base ? `${base}/api/training_data/audio/${encodedName}` : `/api/training_data/audio/${encodedName}`;
}

/**
 * Secondary fallback directly against AudioBank storage endpoint.
 */
export function getAudioBankApiUrl(filenameOrPath?: string | null): string {
  const clean = getCleanFilename(filenameOrPath);
  if (!clean) return '';
  const base = getBaseAudioUrl();
  const encodedName = encodeURIComponent(clean);
  return base ? `${base}/api/audio_bank/audio/${encodedName}` : `/api/audio_bank/audio/${encodedName}`;
}

/**
 * Returns prioritized array of candidate URLs to resolve and fetch the WAV file.
 */
export function getAudioCandidateUrls(filenameOrPath?: string | null): string[] {
  const clean = getCleanFilename(filenameOrPath);
  if (!clean) return [];

  const primary = getAudioAbsoluteUrl(clean);
  const fallback = getAudioFallbackUrl(clean);
  const bankFallback = getAudioBankApiUrl(clean);

  // Return unique candidate URLs
  return Array.from(new Set([primary, fallback, bankFallback]));
}

/**
 * Matches an AudioRecording from the audio bank with its corresponding TrainingItem in training_data.json.
 */
export function pairAudioWithTrainingData(
  audio: AudioRecording,
  trainingItems: TrainingItem[]
): TrainingItem | null {
  if (!audio || !trainingItems || trainingItems.length === 0) return null;

  const audioCleanName = getCleanFilename(audio.filename);

  // 1. Direct match on cleaned filename
  if (audioCleanName) {
    const filenameMatch = trainingItems.find(t => {
      const tClean = getCleanFilename(t.filename) || getCleanFilename(t.audioPath);
      return tClean === audioCleanName;
    });
    if (filenameMatch) return filenameMatch;
  }

  // 2. Direct match on ID
  if (audio.id) {
    const idMatch = trainingItems.find(t => t.id === audio.id);
    if (idMatch) return idMatch;
  }

  // 3. Exact match on both phonetic sound and target intent meaning
  const audioSound = (audio.sound || '').trim().toLowerCase();
  const audioMeaning = (audio.meaning || '').trim().toLowerCase();

  if (audioSound && audioMeaning) {
    const exactPairMatch = trainingItems.find(t => {
      const tSound = (t.sound || '').trim().toLowerCase();
      const tMeaning = (t.meaning || '').trim().toLowerCase();
      return tSound === audioSound && tMeaning === audioMeaning;
    });
    if (exactPairMatch) return exactPairMatch;
  }

  // 4. Match on sound alone if meaning is missing or vice-versa
  if (audioMeaning) {
    const meaningMatch = trainingItems.find(t => {
      const tMeaning = (t.meaning || '').trim().toLowerCase();
      return tMeaning === audioMeaning;
    });
    if (meaningMatch) return meaningMatch;
  }

  return null;
}

/**
 * Plays an audio recording with resilient multi-tier fallback between `/uploads/` and `/api/training_data/audio/`.
 */
export function playAudioWithResilience(
  filenameOrPath: string,
  callbacks?: {
    onPlay?: () => void;
    onEnd?: () => void;
    onError?: (err: Error) => void;
  }
): { audio: HTMLAudioElement; stop: () => void } {
  const candidateUrls = getAudioCandidateUrls(filenameOrPath);
  let currentIndex = 0;

  const audio = new Audio();
  let stopped = false;

  const tryPlayCurrent = () => {
    if (stopped || currentIndex >= candidateUrls.length) {
      if (currentIndex >= candidateUrls.length && !stopped) {
        callbacks?.onError?.(new Error(`Failed to load audio from all candidate paths for ${filenameOrPath}`));
      }
      return;
    }

    const currentUrl = candidateUrls[currentIndex];
    audio.src = currentUrl;
    audio.load();

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          callbacks?.onPlay?.();
        })
        .catch(err => {
          // If playback error, attempt next candidate URL
          if (!stopped) {
            currentIndex++;
            if (currentIndex < candidateUrls.length) {
              tryPlayCurrent();
            } else {
              callbacks?.onError?.(err instanceof Error ? err : new Error(String(err)));
            }
          }
        });
    }
  };

  audio.onended = () => {
    callbacks?.onEnd?.();
  };

  audio.onerror = () => {
    if (!stopped) {
      currentIndex++;
      if (currentIndex < candidateUrls.length) {
        tryPlayCurrent();
      } else {
        callbacks?.onError?.(new Error(`Unable to fetch WAV file: ${candidateUrls[currentIndex - 1]}`));
      }
    }
  };

  tryPlayCurrent();

  return {
    audio,
    stop: () => {
      stopped = true;
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      callbacks?.onEnd?.();
    }
  };
}
