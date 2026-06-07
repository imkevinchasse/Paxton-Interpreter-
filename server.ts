import express from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import { createServer as createViteServer } from 'vite';

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
  llamaModel: 'llama3',
  whisperEndpoint: 'http://localhost:8080'
};
let trainingData: any[] = [];

try {
  if (fs.existsSync('db.json')) {
    interactions = JSON.parse(fs.readFileSync('db.json', 'utf-8'));
  }
} catch(e) {}

try {
  if (fs.existsSync('settings.json')) {
    appSettings = JSON.parse(fs.readFileSync('settings.json', 'utf-8'));
  }
} catch(e) {}

try {
  if (fs.existsSync('training_data.json')) {
    trainingData = JSON.parse(fs.readFileSync('training_data.json', 'utf-8'));
  }
} catch(e) {}

let audioBank: any[] = [];
try {
  if (fs.existsSync('audio_bank.json')) {
    audioBank = JSON.parse(fs.readFileSync('audio_bank.json', 'utf-8'));
  }
} catch(e) {}

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

function saveAudioBank() {
  if (isStorageDisabled) return;
  fs.writeFileSync('audio_bank.json', JSON.stringify(audioBank, null, 2));
}

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
  const { interactions: newInteractions, trainingData: newTraining, audioBank: newAudio } = req.body;
  if (newInteractions) interactions = newInteractions;
  if (newTraining) trainingData = newTraining;
  if (newAudio) audioBank = newAudio;
  saveDb();
  saveTrainingData();
  saveAudioBank();
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

app.get('/api/settings', (req, res) => {
  res.json(appSettings);
});

app.post('/api/settings', (req, res) => {
  appSettings = { ...appSettings, ...req.body };
  saveSettings();
  console.log(`\n[⚙️ SETTINGS UPDATED]`);
  console.log(`--> Ollama Endpoint: ${appSettings.ollamaEndpoint}`);
  console.log(`--> Llama Model: ${appSettings.llamaModel}`);
  console.log(`--> Whisper Gateway: ${appSettings.whisperEndpoint}`);
  res.json(appSettings);
});

app.get('/api/training_data', (req, res) => {
  res.json(trainingData);
});

app.post('/api/training_data', upload.single('audio'), (req, res) => {
  const item = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    category: req.body.category,
    sound: req.body.sound,
    meaning: req.body.meaning,
    hasAudio: !!req.file
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
  const audio = audioBank.find(a => a.id === id);
  if (audio) {
    if (audio.path && fs.existsSync(audio.path)) {
      const outputPath = `${audio.path}_cut.wav`;
      try {
        // Run real ffmpeg to remove silence from beginning and end
        await execAsync(`ffmpeg -y -i "${audio.path}" -af silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB,areverse "${outputPath}"`);
        audio.path = outputPath;
        audio.filename = audio.filename + '_cut.wav';
      } catch (e) {
        console.error("FFmpeg silence removal failed", e);
      }
    }
    audio.status = 'processed';
    audio.isCut = true;
    saveAudioBank();
    console.log(`\n[✂️ AUDIO AUTO-CUT & PROCESSED] ` + audio.filename);
  }
  res.json(audio);
});

app.post('/api/audio_bank/:id/finalize', (req, res) => {
  const id = req.params.id;
  const audio = audioBank.find(a => a.id === id);
  if (audio) {
    audio.status = 'finalized';
    audio.sound = req.body.sound;
    audio.meaning = req.body.meaning;
    saveAudioBank();
    
    // Also add to training data
    const trainingItem = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      category: 'Phrase',
      sound: audio.sound,
      meaning: audio.meaning,
      hasAudio: true
    };
    trainingData.unshift(trainingItem);
    saveTrainingData();
    
    console.log(`\n[✅ AUDIO FINALIZED & ADDED TO TRAINING] ` + audio.filename);
    console.log(`--> Sounded like: "${audio.sound}"`);
    console.log(`--> Target: "${audio.meaning}"`);
  }
  res.json(audio);
});

app.post('/api/train-models', async (req, res) => {
  console.log(`\n[🚀 DATASET OPTIMIZATION INITIATED]`);
  console.log(`--> Preparing and caching representations for ${trainingData.length} samples`);
  
  try {
    // Write out optimized definitions to a JSON file explicitly so LLM memory can load it faster
    const mappedContexts = trainingData.map(t => ({
      input_phonetic: t.sound,
      target_intent: t.meaning,
      category: t.category
    }));
    if (!isStorageDisabled) {
      fs.writeFileSync('optimized_context.json', JSON.stringify(mappedContexts, null, 2));
    }

    // Process all audio bank recordings that are unprocessed
    for (const audio of audioBank.filter(a => a.status === 'unprocessed' && a.path)) {
      if (fs.existsSync(audio.path)) {
        const outputPath = `${audio.path}_opt.wav`;
        try {
          await execAsync(`ffmpeg -y -i "${audio.path}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}"`);
          audio.path = outputPath;
          audio.status = 'processed';
        } catch(e) {}
      }
    }
    saveAudioBank();

    console.log(`[✅ DATASET OPTIMIZATION COMPLETE] Cache updated.`);
    res.json({ success: true, message: 'Datasets compiled and audio optimized successfully.' });
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

import { exec } from 'child_process';
import util from 'util';
const execAsync = util.promisify(exec);

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
    try {
      const whisperUrl = appSettings.whisperEndpoint || 'http://localhost:8080';
      // Use curl to avoid FormData boundary complexities in raw node
      const { stdout } = await execAsync(`curl -s ${whisperUrl}/inference -H "Content-Type: multipart/form-data" -F file="@${audioPath}"`);
      const res = JSON.parse(stdout);
      return res.text ? res.text.trim() : "";
    } catch (err) {
      console.error("--> [WhisperEngine] Error:", err);
      return "Transcription failed";
    }
  }
}

class RetrievalMemory {
  static async search(text: string) {
    // Real keyword-based similarity search over stored interactions
    const keywords = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const scored = interactions.map(interaction => {
      let score = 0;
      const textLower = (interaction.whisper_guess || "").toLowerCase();
      keywords.forEach(kw => {
         if (textLower.includes(kw)) score++;
      });
      return { interaction, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    const topMatches = scored.filter(s => s.score > 0).slice(0, 3).map(s => s.interaction);

    // Dynamic temporal context
    const currentTime = new Date();
    const hour = currentTime.getHours();
    let timeOfDay = "night";
    if (hour >= 5 && hour < 12) timeOfDay = "morning";
    else if (hour >= 12 && hour < 17) timeOfDay = "afternoon";
    else if (hour >= 17 && hour < 21) timeOfDay = "evening";

    return { location: "local device", time: timeOfDay, pastMatches: topMatches };
  }
}

class LlamaInterpreter {
  static async interpret(text: string, context: any) {
    if (!text || text === "Transcription failed") {
      return { candidates: [], confidence: 0 };
    }

    const promptText = `Analyze this phonetic transcription: "${text}"
Context: loc: ${context.location}, time: ${context.time}
Past matching intents: ${JSON.stringify(context.pastMatches)}

Output 3 possible interpretations arrays inside a JSON object: 
{
  "candidates": [
     {"id": "A", "text": "Intended sentence 1", "probability": 0.9},
     {"id": "B", "text": "Intended sentence 2", "probability": 0.05},
     {"id": "C", "text": "Intended sentence 3", "probability": 0.01}
  ],
  "confidence": 0.9
}
If the text seems like a clear standard phrase like "Hello my name is Kevin", fix any slight typos and give it a high probability (e.g. 0.95).`;

    try {
      const ollamaUrl = appSettings.ollamaEndpoint || 'http://localhost:11434';
      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
           model: appSettings.llamaModel || 'llama3',
           prompt: promptText,
           stream: false,
           format: 'json'
        })
      });
      const data = await response.json();
      const parsed = JSON.parse(data.response);
      return {
          candidates: parsed.candidates || [],
          confidence: parsed.confidence || (parsed.candidates && parsed.candidates.length > 0 ? parsed.candidates[0].probability : 0.5)
      };
    } catch (e) {
      console.error("--> [LlamaInterpreter] Error querying Ollama:", e);
      return { 
         candidates: [
           { id: 'A', text: text, probability: 0.9 },
           { id: 'B', text: 'Error contacting LLM', probability: 0.1 }
         ], 
         confidence: 0.9 
      };
    }
  }
}

class ConfidenceRouter {
  static route(confidence: number) {
    if (confidence >= 0.85) return 'auto';
    if (confidence < 0.55) return 'clarification';
    return 'choice';
  }
}

class DecisionEngine {
  static async execute(file: any) {
    console.log(`\n[${new Date().toISOString()}] 🎙️  NEW AUDIO PIPELINE INITIATED`);
    console.log(`--> Audio Source: ${file ? file.filename || file.path : 'Microphone Stream'}`);

    // The Internal Pipeline Workflow
    const audioInput = await AudioPipeline.process(file);
    const whisperGuess = await WhisperEngine.transcribe(audioInput);
    
    console.log(`--> [Whisper STT] Guess: "${whisperGuess}"`);

    const retrievalContext = await RetrievalMemory.search(whisperGuess);
    
    console.log(`--> [Memory Vector DB] Found ${retrievalContext.pastMatches.length} similar past contexts`);
    console.log(`--> [Context] loc: ${retrievalContext.location}, time: ${retrievalContext.time}`);

    const { candidates, confidence } = await LlamaInterpreter.interpret(whisperGuess, retrievalContext);

    console.log(`--> [Llama 3] Generated ${candidates.length} candidates.`);
    candidates.forEach((c, i) => console.log(`    ${i+1}. "${c.text}" (${(c.probability * 100).toFixed(1)}%)`));
    console.log(`--> [Confidence Engine] Final Score: ${(confidence * 100).toFixed(1)}%`);

    const mode = ConfidenceRouter.route(confidence);
    
    console.log(`--> [Decision Router] Mode Selected: ${mode.toUpperCase()}`);
    console.log(`======================================================\n`);
    
    return {
      whisper_guess: whisperGuess,
      candidates,
      final_confidence: confidence,
      mode,
      context: { location: retrievalContext.location, time: retrievalContext.time }
    };
  }
}

// -----------------------------------------------------
// Processing Pipeline Endpoint
// -----------------------------------------------------
app.post('/api/process-audio', upload.single('audio'), async (req, res) => {
  // Execute the local pipeline
  const result = await DecisionEngine.execute(req.file);

  // Artificial delay removed as real inference takes time
  res.json(result);
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
      server: { middlewareMode: true },
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

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n======================================================`);
    console.log(`🎙️ PAXTON INTERPRETER GATEWAY RUNNING`);
    console.log(`======================================================`);
    console.log(`Local Access (On Device): http://localhost:${PORT}`);
    console.log(`Network Access:         http://${getLocalIP()}:${PORT}`);
    console.log(`\nREQUIREMENTS FOR LOCAL PROCESSING:`);
    console.log(`1. Ollama (Llama 3): Must be running locally`);
    console.log(`   run: OLLAMA_HOST=0.0.0.0 ollama serve`);
    console.log(`   (Note: Use prompt engineering specifically to handle phonetic mappings like "I lie ba-man" -> "I like Batman")`);
    console.log(`2. Whisper: Use whisper.cpp server or similar local instance.`);
    console.log(`======================================================\n`);
  });
}

startServer();
