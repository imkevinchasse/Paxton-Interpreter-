import { type AudioRecording, type TrainingItem } from '../types';

/**
 * Normalizes text for lenient comparison:
 * lowercase, removes non-alphanumeric punctuation, collapses spaces.
 */
export function normalizeAcousticText(input?: string | null): string {
  if (!input) return '';
  return String(input)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

  // Strip leading slashes and common upload folder prefixes
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
 * Strips Unix timestamps often added by upload handlers (e.g. 1781008695871-snippet.wav -> snippet.wav)
 */
export function stripTimestampPrefix(filename: string): string {
  return filename.replace(/^\d{10,14}[-_]/, '');
}

/**
 * Strips common audio extensions for name-stem comparison
 */
export function stripAudioExtension(filename: string): string {
  return filename.replace(/\.(wav|webm|mp3|ogg|m4a|aac)$/i, '');
}

/**
 * Resolves the base origin or endpoint URL from environment variables or browser context.
 * Checks VITE_AUDIO_BASE_URL first, then VITE_API_BASE_URL, then window.location.origin.
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
 * Handles timestamp variations and paired training item aliases.
 */
export function getAudioCandidateUrls(
  filenameOrPath?: string | null,
  pairedItem?: TrainingItem | null
): string[] {
  const candidates: string[] = [];
  const namesToTry = new Set<string>();

  const primaryClean = getCleanFilename(filenameOrPath);
  if (primaryClean) {
    namesToTry.add(primaryClean);
    const unPrefixed = stripTimestampPrefix(primaryClean);
    if (unPrefixed && unPrefixed !== primaryClean) {
      namesToTry.add(unPrefixed);
    }
    // Also try adding .wav if missing
    if (!primaryClean.includes('.')) {
      namesToTry.add(`${primaryClean}.wav`);
    }
  }

  // Also try names from paired training item if available
  if (pairedItem) {
    const pairedFilename = getCleanFilename(pairedItem.filename);
    const pairedAudioPath = getCleanFilename(pairedItem.audioPath);
    if (pairedFilename) {
      namesToTry.add(pairedFilename);
      namesToTry.add(stripTimestampPrefix(pairedFilename));
    }
    if (pairedAudioPath) {
      namesToTry.add(pairedAudioPath);
      namesToTry.add(stripTimestampPrefix(pairedAudioPath));
    }
  }

  const base = getBaseAudioUrl();

  for (const name of namesToTry) {
    const encoded = encodeURIComponent(name);
    // 1. Direct uploads folder route
    candidates.push(base ? `${base}/uploads/${encoded}` : `/uploads/${encoded}`);
    // 2. Training data audio API endpoint
    candidates.push(base ? `${base}/api/training_data/audio/${encoded}` : `/api/training_data/audio/${encoded}`);
    // 3. Audio bank endpoint
    candidates.push(base ? `${base}/api/audio_bank/audio/${encoded}` : `/api/audio_bank/audio/${encoded}`);
  }

  // Deduplicate preserving order
  return Array.from(new Set(candidates));
}

/**
 * Matches an AudioRecording from the audio bank with its corresponding TrainingItem in training_data.json.
 * Uses a multi-tiered matching strategy to ensure robust pairing:
 * 1. Exact cleaned filename match
 * 2. Timestamp-stripped filename match (1781008695871-snippet.wav vs snippet.wav)
 * 3. Base stem match (without .wav extension)
 * 4. ID match
 * 5. Normalized phonetic sound match (Whisper acoustic transcript)
 * 6. Normalized intended meaning match
 */
export function pairAudioWithTrainingData(
  audio: AudioRecording,
  trainingItems: TrainingItem[]
): TrainingItem | null {
  if (!audio || !trainingItems || trainingItems.length === 0) return null;

  const audioCleanName = getCleanFilename(audio.filename || audio.path);
  const audioStem = audioCleanName ? stripAudioExtension(stripTimestampPrefix(audioCleanName)) : '';

  // 1. Direct match on cleaned filename
  if (audioCleanName) {
    const filenameMatch = trainingItems.find(t => {
      const tClean = getCleanFilename(t.filename || t.audioPath);
      return tClean && tClean === audioCleanName;
    });
    if (filenameMatch) return filenameMatch;
  }

  // 2. Timestamp-stripped filename match
  if (audioCleanName) {
    const audioUnprefixed = stripTimestampPrefix(audioCleanName);
    const unprefixMatch = trainingItems.find(t => {
      const tClean = getCleanFilename(t.filename || t.audioPath);
      if (!tClean) return false;
      return stripTimestampPrefix(tClean) === audioUnprefixed;
    });
    if (unprefixMatch) return unprefixMatch;
  }

  // 3. Stem match (e.g. ZOOM0003_LR_snippet_2)
  if (audioStem && audioStem.length > 3) {
    const stemMatch = trainingItems.find(t => {
      const tClean = getCleanFilename(t.filename || t.audioPath);
      if (!tClean) return false;
      const tStem = stripAudioExtension(stripTimestampPrefix(tClean));
      return tStem === audioStem;
    });
    if (stemMatch) return stemMatch;
  }

  // 4. Direct match on ID
  if (audio.id) {
    const idMatch = trainingItems.find(t => t.id === audio.id);
    if (idMatch) return idMatch;
  }

  // 5. Match on exact phonetic sound and meaning pair
  const normAudioSound = normalizeAcousticText(audio.sound);
  const normAudioMeaning = normalizeAcousticText(audio.meaning);

  if (normAudioSound && normAudioMeaning) {
    const exactPairMatch = trainingItems.find(t => {
      return (
        normalizeAcousticText(t.sound) === normAudioSound &&
        normalizeAcousticText(t.meaning) === normAudioMeaning
      );
    });
    if (exactPairMatch) return exactPairMatch;
  }

  // 6. Match on normalized phonetic sound alone (Crucial for unfinalized snippets transcribed by Whisper)
  if (normAudioSound && normAudioSound.length >= 3) {
    const soundMatch = trainingItems.find(t => {
      const tSound = normalizeAcousticText(t.sound);
      return tSound && (tSound === normAudioSound || tSound.includes(normAudioSound) || normAudioSound.includes(tSound));
    });
    if (soundMatch) return soundMatch;
  }

  // 7. Match on target intent meaning alone
  if (normAudioMeaning && normAudioMeaning.length >= 3) {
    const meaningMatch = trainingItems.find(t => {
      const tMeaning = normalizeAcousticText(t.meaning);
      return tMeaning && (tMeaning === normAudioMeaning || tMeaning.includes(normAudioMeaning) || normAudioMeaning.includes(tMeaning));
    });
    if (meaningMatch) return meaningMatch;
  }

  return null;
}

/**
 * Checks if a given audio file is accessible and reachable via HTTP.
 * Tests candidate URLs until one responds with status 200 or 206.
 */
export async function verifyAudioReachable(
  filenameOrPath: string,
  pairedItem?: TrainingItem | null
): Promise<{ reachable: boolean; resolvedUrl: string | null }> {
  const candidateUrls = getAudioCandidateUrls(filenameOrPath, pairedItem);
  if (candidateUrls.length === 0) {
    return { reachable: false, resolvedUrl: null };
  }

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        headers: { 'Range': 'bytes=0-1' }
      });
      if (res.ok || res.status === 206 || res.status === 304) {
        return { reachable: true, resolvedUrl: url };
      }
    } catch {
      // Continue to next candidate
    }
  }

  return { reachable: false, resolvedUrl: null };
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
  },
  pairedItem?: TrainingItem | null
): { audio: HTMLAudioElement; stop: () => void } {
  const candidateUrls = getAudioCandidateUrls(filenameOrPath, pairedItem);
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
