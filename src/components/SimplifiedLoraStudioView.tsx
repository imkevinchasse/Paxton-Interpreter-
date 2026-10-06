import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Cpu, 
  Play, 
  Square, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Volume2, 
  Database, 
  Sparkles, 
  Settings2, 
  Layers, 
  ArrowRight, 
  FolderCheck, 
  Terminal, 
  Mic, 
  Send,
  HelpCircle,
  FileText
} from 'lucide-react';
import { Microphone } from './Microphone';

interface SimplifiedStatus {
  simplifiedMode: boolean;
  modelId: string;
  parameters: string;
  loraConfig: {
    r: number;
    alpha: number;
    targetModules: string[];
    dropout: number;
    lr: string;
    epochs: number;
  };
  loraActive: boolean;
  pairCount: number;
  audioCount: number;
  confidenceThreshold: number;
  lightLlmEnabled: boolean;
  correctionModel: string;
}

export function SimplifiedLoraStudioView() {
  const [status, setStatus] = useState<SimplifiedStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [training, setTraining] = useState<boolean>(false);
  const [testPhrase, setTestPhrase] = useState<string>('i nee a hell');
  const [testResult, setTestResult] = useState<any | null>(null);
  const [interpreting, setInterpreting] = useState<boolean>(false);

  // Continuous improvement feedback state
  const [intendedCorrection, setIntendedCorrection] = useState<string>('');
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/simplified/status');
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMode = async () => {
    try {
      const res = await fetch('/api/simplified/toggle', { method: 'POST' });
      const data = await res.json();
      if (status) {
        setStatus({ ...status, simplifiedMode: data.simplifiedMode });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleModelChange = async (newModel: string) => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whisperTurboModel: newModel })
      });
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSyncPairs = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/simplified/sync-pairs', { method: 'POST' });
      const data = await res.json();
      alert(`Synced ${data.synced} audio/text pairs into paxton-interpreter/data/pairs/!`);
      fetchStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const handleStartTraining = async () => {
    setTraining(true);
    try {
      const res = await fetch('/api/simplified/train', { method: 'POST' });
      const data = await res.json();
      alert(data.message || 'LoRA fine-tuning initiated!');
    } catch (e) {
      console.error(e);
    } finally {
      setTraining(false);
    }
  };

  const handleTestInference = async (inputSample?: string) => {
    const textToTest = inputSample || testPhrase;
    if (!textToTest) return;
    setInterpreting(true);
    setTestResult(null);
    setFeedbackSuccess(null);
    setIntendedCorrection('');

    try {
      const formData = new FormData();
      formData.append('audio', new Blob([''], { type: 'audio/webm' }), 'audio.webm');
      formData.append('text', '__SIMPLIFIED__' + textToTest);

      const res = await fetch('/api/process-audio', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setTestResult(data);
      if (data?.candidates?.[0]?.text) {
        setIntendedCorrection(data.candidates[0].text);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setInterpreting(false);
    }
  };

  const handleSaveCorrection = async () => {
    if (!intendedCorrection.trim() || !testResult) return;
    try {
      const res = await fetch('/api/simplified/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioPairId: testResult.audioPairId,
          intendedText: intendedCorrection.trim(),
          sound: testResult.rawWhisperTranscript || testPhrase
        })
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackSuccess(`Saved "${intendedCorrection.trim()}" to data/pairs/ for next LoRA retrain!`);
        fetchStatus();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(u);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 fill-amber-600 text-amber-600" />
                Simplified Mode Architecture
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                openai/whisper-large-v3-turbo (809M)
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Whisper Turbo LoRA Studio
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
              High-speed personalized interpreter tailored for severe speech differences. Uses fine-tuned LoRA adapters directly on Whisper Turbo, with context-aware light LLM restoration when acoustic confidence is low.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleMode}
              className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider transition shadow-sm ${
                status?.simplifiedMode
                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>{status?.simplifiedMode ? 'Simplified Mode: ACTIVE' : 'Enable Simplified Mode'}</span>
            </button>

            <button
              onClick={handleSyncPairs}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider bg-slate-900 hover:bg-slate-800 text-white transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span>Sync {status?.pairCount || 0} Pairs</span>
            </button>
          </div>
        </div>

        {/* 3-Step Pipeline Architecture Blueprint */}
        <div className="mt-6 pt-6 border-t border-slate-100">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-3 font-mono">
            3-Step Runtime Flow:
          </span>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-bold text-slate-700 block mb-1">1. Audio Input</span>
              <p className="text-slate-500">Live mic or wav audio stream from Paxton.</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <span className="font-bold text-amber-800 block mb-1">2. Whisper Turbo + LoRA</span>
              <p className="text-amber-700">809M turbo with r=32 personalized adapter weights.</p>
            </div>
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
              <span className="font-bold text-indigo-800 block mb-1">3. Light LLM Restoration</span>
              <p className="text-indigo-700">Only invoked when confidence &lt; 82% (context-aware).</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="font-bold text-emerald-800 block mb-1">4. TTS Voice & Feedback</span>
              <p className="text-emerald-700">Speaks immediately. Continuous feedback saves to dataset.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Interactive Tester & LoRA Controller */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Tester & Feedback Loop */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Mic className="w-5 h-5 text-amber-600" />
                Live Simplified Pipeline Tester
              </h2>
              <span className="text-xs font-mono text-slate-400">
                Confidence Threshold: {(status?.confidenceThreshold ? status.confidenceThreshold * 100 : 82)}%
              </span>
            </div>

            {/* Test Sample Quick Buttons */}
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 font-mono">
                Paxton Severe Speech Test Samples:
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  "Watubah! I'm nass a love you mom",
                  "Wakabah to you.",
                  "Am I a black?",
                  "Oh yeah best you ah I lost a job. That's what happen",
                  "Hey I wah out Tobah go ask dussin more Tobah",
                  "Mmhmm. I feel mad bad caskon",
                  "Cassin mya blackwet cats",
                  "Mm.I see you some",
                  "i nee a hell",
                  "dussin work",
                  "ba-man movie",
                  "wanna wa"
                ].map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      setTestPhrase(s);
                      handleTestInference(s);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-amber-100 hover:text-amber-900 border border-slate-200 text-xs font-medium text-slate-700 transition"
                  >
                    "{s.length > 30 ? s.substring(0, 30) + '…' : s}"
                  </button>
                ))}
              </div>
            </div>

            {/* Input Bar */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={testPhrase}
                onChange={e => setTestPhrase(e.target.value)}
                placeholder="Enter what Paxton said (or test utterance)..."
                className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 bg-slate-50/50"
                onKeyDown={e => e.key === 'Enter' && handleTestInference()}
              />
              <button
                disabled={interpreting || !testPhrase}
                onClick={() => handleTestInference()}
                className="px-5 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider transition disabled:opacity-50 shadow-sm flex items-center gap-2"
              >
                {interpreting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>Test</span>
              </button>
            </div>

            {/* Interpretation Result Card */}
            {testResult && (
              <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                    Pipeline Interpretation Output:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-slate-800 text-slate-300">
                      {(testResult.final_confidence * 100).toFixed(1)}% Confidence
                    </span>
                    {testResult.lightLlmCorrectionApplied && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-indigo-900 text-indigo-300 border border-indigo-700">
                        Light LLM Polished
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-0.5">Whisper Turbo Raw Acoustic:</span>
                    <span className="text-sm font-mono text-slate-300">"{testResult.whisper_guess}"</span>
                  </div>
                  <button
                    onClick={() => speakText(testResult.candidates?.[0]?.text || testResult.whisper_guess)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition"
                  >
                    <Volume2 className="w-4 h-4" /> Speak
                  </button>
                </div>

                <div className="pt-3 border-t border-slate-800">
                  <span className="text-[11px] text-amber-400 font-bold uppercase tracking-wider block mb-1">
                    Final English Translation:
                  </span>
                  <p className="text-xl font-bold text-white tracking-tight">
                    "{testResult.candidates?.[0]?.text || testResult.whisper_guess}"
                  </p>
                </div>

                {/* Continuous Improvement Loop Box */}
                <div className="mt-4 pt-4 border-t border-slate-800/80 bg-slate-950/60 p-4 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-xs text-amber-300 font-medium">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Continuous Improvement Loop (Critical for Severe Speech)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    If this interpretation wasn't 100% right, enter what Paxton actually meant below and save it. It immediately joins the LoRA training pairs.
                  </p>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={intendedCorrection}
                      onChange={e => setIntendedCorrection(e.target.value)}
                      placeholder="Enter correct intended English sentence..."
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                    <button
                      onClick={handleSaveCorrection}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Save to Dataset
                    </button>
                  </div>

                  {feedbackSuccess && (
                    <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-mono">
                      ✓ {feedbackSuccess}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Standalone Project Files Card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <FolderCheck className="w-4 h-4 text-emerald-600" />
              All-In-One Standalone Python Project
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              The full Python training and inference suite is installed directly in <code className="text-slate-800 font-bold bg-slate-100 px-1.5 py-0.5 rounded">/paxton-interpreter</code>:
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 block">src/prepare_data.py</span>
                <span className="text-slate-400 text-[10px]">Formats .wav/.txt into HF Dataset</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 block">src/train.py</span>
                <span className="text-slate-400 text-[10px]">LoRA fine-tuning for turbo model</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 block">src/infer.py</span>
                <span className="text-slate-400 text-[10px]">Real-time mic & batch inference</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 block">src/correct.py</span>
                <span className="text-slate-400 text-[10px]">Light context-aware LLM restore</span>
              </div>
            </div>

            <div className="p-3 bg-slate-900 rounded-xl text-slate-300 text-xs font-mono">
              <span className="text-slate-500 block mb-1"># Run locally in terminal:</span>
              <span className="text-amber-400">cd paxton-interpreter && python src/train.py</span>
            </div>
          </div>
        </div>

        {/* Right Column: Model Specs & LoRA Training Controller */}
        <div className="lg:col-span-5 space-y-6">
          {/* LoRA Specs Card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-600" />
              Fine-Tuning Configuration
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 font-medium">Base Whisper Model:</span>
                <select
                  value={status?.modelId || 'openai/whisper-small'}
                  onChange={e => handleModelChange(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="openai/whisper-small">openai/whisper-small (244M - Fast / Low VRAM)</option>
                  <option value="openai/whisper-large-v3-turbo">openai/whisper-large-v3-turbo (809M - High Capacity)</option>
                  <option value="openai/whisper-base">openai/whisper-base (74M - Lightweight)</option>
                </select>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Parameters:</span>
                <span className="font-bold font-mono text-slate-800">809M (Turbo Speed)</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">LoRA Rank (r):</span>
                <span className="font-bold font-mono text-indigo-600">r = {status?.loraConfig.r || 32} (alpha = {status?.loraConfig.alpha || 64})</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Target Modules:</span>
                <span className="font-bold font-mono text-slate-800">q_proj, v_proj, k_proj, out_proj</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Training Pairs in data/pairs/:</span>
                <span className="font-bold font-mono text-emerald-600">{status?.pairCount || 0} pairs ready</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">LoRA Adapter Status:</span>
                <span className="font-bold font-mono text-amber-600">Active / Initialized</span>
              </div>
            </div>

            <button
              disabled={training}
              onClick={handleStartTraining}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${training ? 'animate-spin' : ''}`} />
              <span>{training ? 'Fine-Tuning in Progress...' : 'Run LoRA Training'}</span>
            </button>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
              <span className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Note for Severe Speech:
              </span>
              <p className="leading-relaxed">
                With ~300 verified pairs, LoRA adapts the attention projections without blowing out memory. Expect rapid improvement on Paxton's recurrent sounds, while the Light LLM layer handles residual slips.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
