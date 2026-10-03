import { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  Terminal, 
  LineChart, 
  Cpu, 
  Database, 
  Sparkles, 
  FolderCheck, 
  RefreshCw, 
  Copy, 
  Check, 
  Sliders, 
  Volume2, 
  ChevronRight,
  Info,
  AlertCircle,
  X
} from 'lucide-react';
import { motion } from 'motion/react';
import { type TrainingTelemetry, type TrainingMetricPoint } from '../types';

export function TrainingStudioView() {
  const [telemetry, setTelemetry] = useState<TrainingTelemetry | null>(null);
  const [activeTab, setActiveTab] = useState<'console' | 'metrics' | 'dataset' | 'checkpoints'>('console');
  const [epochs, setEpochs] = useState<number>(10);
  const [lr, setLr] = useState<string>('5e-6');
  const [batchSize, setBatchSize] = useState<number>(8);
  const [mode, setMode] = useState<'phonetic' | 'english'>('phonetic');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [datasetItems, setDatasetItems] = useState<any[]>([]);
  const [starting, setStarting] = useState<boolean>(false);
  const [studioError, setStudioError] = useState<string | null>(null);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Poll status & logs
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/training/status');
      const data: TrainingTelemetry = await res.json();
      setTelemetry(data);
    } catch(e) {
      console.error('Error fetching training status:', e);
    }
  };

  const fetchCheckpoints = async () => {
    try {
      const res = await fetch('/api/training/checkpoints');
      const data = await res.json();
      if (Array.isArray(data)) setCheckpoints(data);
    } catch(e) {}
  };

  const fetchDataset = async () => {
    try {
      const res = await fetch('/api/training_data');
      const data = await res.json();
      if (Array.isArray(data)) setDatasetItems(data);
    } catch(e) {}
  };

  useEffect(() => {
    fetchStatus();
    fetchCheckpoints();
    fetchDataset();

    const interval = setInterval(() => {
      fetchStatus();
    }, 1200);

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll console when new logs arrive
  useEffect(() => {
    if (autoScroll && activeTab === 'console') {
      consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [telemetry?.logs.length, autoScroll, activeTab]);

  const handleStartRealTraining = async () => {
    setStarting(true);
    setStudioError(null);
    setActiveTab('console'); // Stream logs immediately
    try {
      const res = await fetch('/api/training/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epochs, lr, batchSize, mode })
      });
      const data = await res.json();
      if (!res.ok) {
        setStudioError(data.message || data.error || 'Failed to start training');
      }
      await fetchStatus();
    } catch(e: any) {
      console.error(e);
      setStudioError(e?.message || 'Network error launching training pipeline');
    } finally {
      setStarting(false);
    }
  };

  const handleStartSimulation = async () => {
    try {
      await fetch('/api/training/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epochs, lr, batchSize, mode })
      });
      await fetchStatus();
    } catch(e) {
      console.error(e);
    }
  };

  const handleStopTraining = async () => {
    try {
      await fetch('/api/training/stop', { method: 'POST' });
      await fetchStatus();
    } catch(e) {}
  };

  const handleCopyLogs = () => {
    if (!telemetry?.logs) return;
    navigator.clipboard.writeText(telemetry.logs.join('\n'));
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const isRunning = telemetry?.status === 'training' || telemetry?.status === 'preparing';

  const formatSeconds = (sec: number | null | undefined) => {
    if (sec === null || sec === undefined) return '--:--';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Metrics for rendering graph
  const history = telemetry?.history || [];
  const maxEpoch = telemetry?.totalEpochs || epochs || 10;
  const maxLoss = Math.max(3.5, ...history.map(p => Math.max(p.trainLoss || 0, p.evalLoss || 0)));

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
              Paxton Whisper Fine-Tuning Studio
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`w-2 h-2 rounded-full ${
                isRunning ? 'bg-amber-500 animate-ping' : 
                telemetry?.status === 'completed' ? 'bg-emerald-500' : 
                telemetry?.status === 'failed' ? 'bg-red-500' : 'bg-slate-400'
              }`} />
              <span className="font-mono uppercase font-bold text-[11px] text-slate-700">
                {telemetry?.status || 'idle'}
              </span>
              {telemetry?.isSimulated && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-indigo-600 font-medium">Demo Simulation</span>
                </>
              )}
            </div>
          </div>
          <p className="text-slate-500 text-sm">
            Monitor Whisper speech recognition fine-tuning, inspect epoch loss curves, audit vocabulary coverage, and export custom weights.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {!isRunning ? (
            <>
              <button
                type="button"
                onClick={handleStartRealTraining}
                disabled={starting}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition-all shadow-sm text-xs cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {starting ? 'Initializing...' : `Start Fine-Tuning (${datasetItems.length} Samples)`}
              </button>
              
              <button
                type="button"
                onClick={handleStartSimulation}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600 font-bold rounded-xl transition-all shadow-xs text-xs cursor-pointer"
                title="Simulates realistic telemetry and curves for immediate testing"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>Live Simulation Demo</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleStopTraining}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-sm text-xs cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Training Run</span>
            </button>
          )}

          <button
            type="button"
            onClick={fetchStatus}
            className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-slate-800 rounded-xl transition-colors shadow-xs cursor-pointer"
            title="Refresh Telemetry"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {studioError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-800 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="font-medium">{studioError}</span>
          </div>
          <button
            type="button"
            onClick={() => setStudioError(null)}
            className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Telemetry Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Current Phase</span>
          <p className="text-xs font-bold text-slate-800 truncate" title={telemetry?.phase || 'Ready'}>
            {telemetry?.phase || 'Ready'}
          </p>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Epoch Progress</span>
          <p className="text-sm font-mono font-bold text-slate-800">
            {telemetry?.currentEpoch || 0} <span className="text-slate-400 font-normal">/ {telemetry?.totalEpochs || epochs}</span>
          </p>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Training Loss</span>
          <p className="text-sm font-mono font-bold text-indigo-600">
            {telemetry?.trainLoss !== null && telemetry?.trainLoss !== undefined ? telemetry.trainLoss.toFixed(4) : '--'}
          </p>
        </div>

        <div className="p-3.5 bg-white border border-purple-200 bg-purple-50/20 rounded-xl shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-purple-700 block">Val Loss (eval_loss)</span>
            <span className="text-[9px] bg-purple-100 text-purple-700 px-1 py-0.2 rounded font-medium">True Metric</span>
          </div>
          <p className="text-sm font-mono font-bold text-purple-700">
            {telemetry?.evalLoss !== null && telemetry?.evalLoss !== undefined ? telemetry.evalLoss.toFixed(4) : '--'}
          </p>
          <span className="text-[10px] text-purple-600 block truncate">Best: {telemetry?.bestEvalLoss ? telemetry.bestEvalLoss.toFixed(4) : (telemetry?.evalLoss ? telemetry.evalLoss.toFixed(4) : '--')}</span>
        </div>

        <div className="p-3.5 bg-white border border-teal-200 bg-teal-50/20 rounded-xl shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-teal-800 block">Best CER</span>
            <span className="text-[9px] bg-teal-100 text-teal-800 px-1 py-0.2 rounded font-medium">Phonetic</span>
          </div>
          <p className="text-sm font-mono font-bold text-teal-700">
            {telemetry?.bestCer !== null && telemetry?.bestCer !== undefined ? `${(telemetry.bestCer * 100).toFixed(1)}%` : (telemetry?.evalCer !== null && telemetry?.evalCer !== undefined ? `${(telemetry.evalCer * 100).toFixed(1)}%` : '--')}
          </p>
          <span className="text-[10px] text-slate-400 block truncate">
            {telemetry?.bestWer !== null && telemetry?.bestWer !== undefined ? `WER: ${(telemetry.bestWer * 100).toFixed(1)}%` : 'Char Error Rate'}
          </span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Duration / ETA</span>
          <p className="text-xs font-mono font-medium text-slate-700">
            {formatSeconds(telemetry?.elapsedSeconds)} <span className="text-slate-400">·</span> {formatSeconds(telemetry?.estimatedRemainingSeconds)}
          </p>
        </div>
      </div>

      {/* Progress Bar & Phase Stepper */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-600" />
            <span className="font-bold text-slate-700">Acceleration Backend:</span>
            <span className="font-mono text-slate-600">{telemetry?.device || 'Apple Silicon MPS'}</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-500">Model: {telemetry?.modelName || 'openai/whisper-small.en'}</span>
          </div>

          <div className="text-slate-500 font-mono text-[11px]">
            {telemetry?.currentEpoch && telemetry?.totalEpochs 
              ? `${Math.round((telemetry.currentEpoch / telemetry.totalEpochs) * 100)}% Completed`
              : isRunning ? 'Initializing...' : 'Idle'}
          </div>
        </div>

        {/* Progress Track */}
        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ 
              width: telemetry?.currentEpoch && telemetry?.totalEpochs 
                ? `${Math.min(100, Math.max(5, (telemetry.currentEpoch / telemetry.totalEpochs) * 100))}%` 
                : isRunning ? '8%' : '0%' 
            }}
            transition={{ duration: 0.5 }}
          />
        </div>

        {/* Step checkpoints */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isRunning || telemetry?.status === 'completed' ? 'bg-indigo-600' : 'bg-slate-300'}`} />
            <span>1. Env & GPU</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${telemetry?.currentEpoch && telemetry.currentEpoch >= 1 ? 'bg-indigo-600' : 'bg-slate-300'}`} />
            <span>2. Audio Prep</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${telemetry?.currentEpoch && telemetry.currentEpoch >= 1 ? 'bg-indigo-600' : 'bg-slate-300'}`} />
            <span>3. Model Init</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${telemetry?.currentEpoch && telemetry.currentEpoch >= 2 ? 'bg-indigo-600' : 'bg-slate-300'}`} />
            <span>4. Fine-Tuning</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${telemetry?.currentEpoch && telemetry.currentEpoch >= (telemetry.totalEpochs * 0.8) ? 'bg-indigo-600' : 'bg-slate-300'}`} />
            <span>5. Eval & WER</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${telemetry?.status === 'completed' ? 'bg-emerald-600' : 'bg-slate-300'}`} />
            <span>6. Export ggml</span>
          </div>
        </div>
      </div>

      {/* Main Studio Viewport */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Interactive Segmented Tab Controls */}
        <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('console')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'console'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Live Training Console</span>
            <span className="text-[10px] font-mono text-slate-400">({telemetry?.logs.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('metrics')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'metrics'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <LineChart className="w-3.5 h-3.5" />
            <span>Loss & WER Telemetry</span>
            <span className="text-[10px] font-mono text-slate-400">({history.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dataset')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'dataset'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Dataset & Vocab Audit</span>
            <span className="text-[10px] font-mono text-slate-400">({datasetItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('checkpoints')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'checkpoints'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FolderCheck className="w-3.5 h-3.5" />
            <span>Checkpoints & Deploy</span>
            <span className="text-[10px] font-mono text-slate-400">({checkpoints.length})</span>
          </button>
        </div>

        {/* Tab 1: Live Terminal Console */}
        {activeTab === 'console' && (
          <div className="flex flex-col bg-slate-950 text-slate-200">
            {/* Console Toolbar */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  stdout / stderr stream
                </span>
                <span className="text-slate-600" aria-hidden="true">|</span>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={autoScroll} 
                    onChange={e => setAutoScroll(e.target.checked)}
                    className="rounded text-indigo-500 focus:ring-0" 
                  />
                  <span>Auto-scroll</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] transition-colors cursor-pointer"
                >
                  {copiedLogs ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedLogs ? 'Copied' : 'Copy Logs'}</span>
                </button>
              </div>
            </div>

            {/* Console Window */}
            <div className="h-[460px] overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-1 select-text">
              {telemetry?.status === 'failed' && (
                <div className="mb-4 p-4 bg-amber-950/70 border border-amber-600/50 rounded-xl font-sans text-xs text-amber-200 space-y-2">
                  <div className="font-bold flex items-center gap-2 text-amber-300">
                    <Info className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Apple Silicon Mac: PyTorch &amp; Python Compatibility</span>
                  </div>
                  <p className="text-amber-200/90 leading-relaxed font-sans">
                    If your local Mac training failed during dependency setup (e.g. <code>torch==2.3.1</code> not found on Python 3.14), Apple Silicon prebuilt MPS GPU wheels are officially targeted at <strong>Python 3.11 and 3.12</strong>.
                  </p>
                  <div className="bg-black/50 p-2.5 rounded-lg border border-amber-500/30 flex items-center justify-between font-mono text-[11px] text-amber-300">
                    <span>brew install python@3.11 &amp;&amp; rm -rf venv_train</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('brew install python@3.11 && rm -rf venv_train');
                        setCopiedLogs(true);
                        setTimeout(() => setCopiedLogs(false), 2000);
                      }}
                      className="ml-3 px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded font-sans font-bold text-[10px] cursor-pointer"
                    >
                      Copy Command
                    </button>
                  </div>
                </div>
              )}

              {(!telemetry?.logs || telemetry.logs.length === 0) ? (
                <div className="text-slate-500 py-12 text-center">
                  No active training output. Click &ldquo;Start Fine-Tuning&rdquo; or &ldquo;Live Simulation Demo&rdquo; to begin streaming.
                </div>
              ) : (
                telemetry.logs.map((line, idx) => {
                  const isCheck = line.includes('✅') || line.includes('Saved');
                  const isWarn = line.includes('⚠️') || line.includes('Watch:');
                  const isError = line.includes('❌') || line.includes('failed');
                  const isStep = line.includes('[1/6]') || line.includes('[2/6]') || line.includes('[3/6]') || line.includes('[4/6]') || line.includes('[5/6]') || line.includes('[6/6]');
                  const isEpoch = line.includes("'loss':");

                  return (
                    <div 
                      key={idx} 
                      className={`break-words ${
                        isCheck ? 'text-emerald-400' :
                        isError ? 'text-rose-400 font-bold' :
                        isWarn ? 'text-amber-300' :
                        isStep ? 'text-indigo-300 font-bold' :
                        isEpoch ? 'text-sky-300 font-medium' :
                        'text-slate-300'
                      }`}
                    >
                      <span className="text-slate-600 select-none mr-2">{(idx + 1).toString().padStart(4, ' ')}</span>
                      {line}
                    </div>
                  );
                })
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>
        )}

        {/* Tab 2: Loss Curves & Telemetry Visualizer */}
        {activeTab === 'metrics' && (
          <div className="p-6 space-y-6">
            {/* Metric Methodology Guidance Banner */}
            <div className="p-4 bg-purple-50/80 border border-purple-200 rounded-xl flex items-start gap-3 text-xs text-purple-950 leading-relaxed shadow-xs">
              <Sparkles className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm text-purple-900">Validation Metric: Character Error Rate (CER) &amp; eval_loss</p>
                  <span className="text-[10px] bg-purple-200 text-purple-800 font-semibold px-2 py-0.5 rounded-full">Recommended</span>
                </div>
                <p className="text-purple-800">
                  Phonetic speech variations (e.g., <em>"dussin"</em> vs <em>"does in"</em>) artificially inflate word error penalties (often exceeding 100–250% WER for minor token boundary differences). <strong>Validation Loss (<code className="font-mono font-bold bg-purple-100 px-1 py-0.5 rounded text-purple-900">eval_loss</code>)</strong> is the authentic mathematical indicator of neural network convergence, while <strong>Character Error Rate (CER)</strong> evaluated with strict punctuation removal and timestamp suppression accurately measures acoustic intelligibility.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Fine-Tuning Convergence Curves</h3>
                <p className="text-xs text-slate-500">Tracks Training Loss vs Validation Loss, and Character Error Rate (CER) across epochs.</p>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
                <span className="flex items-center gap-1.5 text-indigo-600">
                  <span className="w-3 h-0.5 bg-indigo-600"></span> Train Loss
                </span>
                <span className="flex items-center gap-1.5 text-purple-600">
                  <span className="w-3 h-0.5 bg-purple-600 border-b border-dashed border-purple-600"></span> Val Loss (eval_loss)
                </span>
                <span className="flex items-center gap-1.5 text-teal-600">
                  <span className="w-3 h-0.5 bg-teal-600"></span> CER (Primary)
                </span>
                <span className="flex items-center gap-1.5 text-emerald-600">
                  <span className="w-3 h-0.5 bg-emerald-600"></span> WER (Reference)
                </span>
              </div>
            </div>

            {history.length < 2 ? (
              <div className="h-64 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 text-xs space-y-2">
                <LineChart className="w-8 h-8 text-slate-300" />
                <p>Telemetry data will plot here as training epochs progress.</p>
              </div>
            ) : (
              <div className="relative bg-slate-50/70 border border-slate-200 rounded-xl p-4">
                {/* SVG Line Graph */}
                <svg viewBox="0 0 600 240" className="w-full h-64 overflow-visible">
                  {/* Grid Lines */}
                  {[0, 60, 120, 180, 240].map((y, i) => (
                    <line key={i} x1="40" y1={y} x2="590" y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
                  ))}

                  {/* Y Axis Labels (Dynamic Loss / Error Scale) */}
                  <text x="35" y="15" textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="monospace">{maxLoss.toFixed(1)}</text>
                  <text x="35" y="75" textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="monospace">{(maxLoss * 0.75).toFixed(1)}</text>
                  <text x="35" y="135" textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="monospace">{(maxLoss * 0.50).toFixed(1)}</text>
                  <text x="35" y="195" textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="monospace">{(maxLoss * 0.25).toFixed(1)}</text>
                  <text x="35" y="235" textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="monospace">0.0</text>

                  {/* Lines */}
                  {/* Train Loss Polyline */}
                  <polyline
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    points={history.map((pt, i) => {
                      const x = 50 + (i / Math.max(1, history.length - 1)) * 530;
                      const y = 230 - Math.min(1, Math.max(0, (pt.trainLoss || 0) / maxLoss)) * 200;
                      return `${x},${y}`;
                    }).join(' ')}
                  />

                  {/* Eval Loss Polyline (Primary True Indicator) */}
                  <polyline
                    fill="none"
                    stroke="#9333ea"
                    strokeWidth="2.5"
                    strokeDasharray="4 2"
                    strokeLinecap="round"
                    points={history.filter(pt => pt.evalLoss !== undefined).map((pt, i, arr) => {
                      const x = 50 + (i / Math.max(1, arr.length - 1)) * 530;
                      const y = 230 - Math.min(1, Math.max(0, (pt.evalLoss || 0) / maxLoss)) * 200;
                      return `${x},${y}`;
                    }).join(' ')}
                  />

                  {/* CER Polyline */}
                  <polyline
                    fill="none"
                    stroke="#0d9488"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    points={history.filter(pt => pt.evalCer !== undefined).map((pt, i, arr) => {
                      const x = 50 + (i / Math.max(1, arr.length - 1)) * 530;
                      const y = 230 - Math.min(1, Math.max(0, pt.evalCer || 0)) * 200;
                      return `${x},${y}`;
                    }).join(' ')}
                  />

                  {/* WER Polyline */}
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                    strokeLinecap="round"
                    points={history.filter(pt => pt.evalWer !== undefined).map((pt, i, arr) => {
                      const x = 50 + (i / Math.max(1, arr.length - 1)) * 530;
                      const y = 230 - Math.min(1, Math.max(0, pt.evalWer || 0)) * 200;
                      return `${x},${y}`;
                    }).join(' ')}
                  />

                  {/* Data Points */}
                  {history.map((pt, i) => {
                    const x = 50 + (i / Math.max(1, history.length - 1)) * 530;
                    const yTrain = 230 - Math.min(1, Math.max(0, (pt.trainLoss || 0) / maxLoss)) * 200;
                    return (
                      <circle key={i} cx={x} cy={yTrain} r="3" fill="#4f46e5" />
                    );
                  })}
                </svg>

                {/* X Axis Epoch Markers */}
                <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-2 pl-12 pr-4">
                  <span>Epoch 1</span>
                  <span>Epoch {Math.round(maxEpoch / 2)}</span>
                  <span>Epoch {maxEpoch}</span>
                </div>
              </div>
            )}

            {/* Loss metrics table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2.5 px-4">Epoch / Step</th>
                    <th className="py-2.5 px-4">Train Loss</th>
                    <th className="py-2.5 px-4 text-purple-700">Val Loss (eval_loss)</th>
                    <th className="py-2.5 px-4 text-teal-700">Char Error (CER)</th>
                    <th className="py-2.5 px-4 text-emerald-700">Word Error (WER)</th>
                    <th className="py-2.5 px-4">Recorded At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {history.slice(-10).reverse().map((pt, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="py-2 px-4 font-bold text-slate-700">Epoch {pt.epoch}</td>
                      <td className="py-2 px-4 text-indigo-600">{pt.trainLoss !== undefined ? pt.trainLoss.toFixed(4) : '--'}</td>
                      <td className="py-2 px-4 font-bold text-purple-700 bg-purple-50/30">{pt.evalLoss !== undefined ? pt.evalLoss.toFixed(4) : '--'}</td>
                      <td className="py-2 px-4 font-bold text-teal-700">{pt.evalCer !== undefined ? `${(pt.evalCer * 100).toFixed(1)}%` : '--'}</td>
                      <td className="py-2 px-4 text-emerald-600">{pt.evalWer !== undefined ? `${(pt.evalWer * 100).toFixed(1)}%` : '--'}</td>
                      <td className="py-2 px-4 text-slate-400 text-[11px]">{pt.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Dataset & Vocabulary Audit */}
        {activeTab === 'dataset' && (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Fine-Tuning Dataset Coverage</h3>
              <p className="text-xs text-slate-500">
                Audited samples compiled into <code className="font-mono text-slate-700">dataset/metadata.csv</code> for the Whisper neural network.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Labelled Clips</span>
                <p className="text-lg font-bold text-slate-800 font-mono">{datasetItems.length}</p>
                <span className="text-[11px] text-slate-500">Expands to ~{datasetItems.length * 4} with augmentation</span>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-slate-400">Transcript Mode</span>
                <p className="text-lg font-bold text-slate-800 font-mono capitalize">{mode}</p>
                <span className="text-[11px] text-slate-500">Trains Whisper to emit phonetic tokens</span>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-slate-400">Held-Out Test Set</span>
                <p className="text-lg font-bold text-emerald-700 font-mono">15% Split</p>
                <span className="text-[11px] text-slate-500">Never seen during gradient updates</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">Sample Dataset Records</h4>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {datasetItems.map((item, idx) => (
                  <div key={item.id || idx} className="p-3 flex items-center justify-between hover:bg-slate-50 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-800">
                        &ldquo;{item.sound}&rdquo; <span className="text-slate-400 font-normal">➔</span> &ldquo;{item.meaning}&rdquo;
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {item.filename || item.audioPath || 'sample_clip.wav'} · {item.category || 'Phrase'}
                      </div>
                    </div>
                    {item.hasAudio && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        WAV Ready
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Checkpoints & Model Artifacts */}
        {activeTab === 'checkpoints' && (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Fine-Tuned Model Weights & Checkpoints</h3>
              <p className="text-xs text-slate-500">Saved checkpoints and final fine-tuned Whisper model for Paxton.</p>
            </div>

            <div className="space-y-3">
              {checkpoints.length === 0 ? (
                <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl text-xs space-y-1">
                  <FolderCheck className="w-8 h-8 text-slate-300 mx-auto" />
                  <p>No model checkpoints saved yet. Run fine-tuning to generate release weights.</p>
                </div>
              ) : (
                checkpoints.map(cp => (
                  <div key={cp.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-800 text-sm">{cp.name}</span>
                        {cp.isFinal && (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                            Production Model
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-mono">
                        Path: {cp.path} · Saved: {new Date(cp.date).toLocaleString()}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-slate-600 font-medium">Ready for Inference</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Inference usage guide */}
            <div className="p-4 bg-slate-900 text-slate-200 rounded-xl space-y-2 text-xs font-mono">
              <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-indigo-400" />
                How the Local System Loads This Model
              </div>
              <p className="text-slate-300">
                Once fine-tuning completes, the weights are quantized or converted to ggml format for whisper.cpp server:
              </p>
              <pre className="bg-slate-950 p-2.5 rounded border border-slate-800 overflow-x-auto text-[11px] text-emerald-400">
                python3 models/convert-h5-to-ggml.py ./whisper-paxton-final/ models/ggml-paxton.bin
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Hyperparameter Configuration Drawer */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
          <Sliders className="w-4 h-4 text-indigo-600" />
          <span>Training Hyperparameters</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Epochs</label>
            <input 
              type="number" 
              min={1} 
              max={30} 
              value={epochs} 
              onChange={e => setEpochs(Number(e.target.value))}
              disabled={isRunning}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 font-mono focus:outline-none focus:border-indigo-500" 
            />
            <span className="text-[11px] text-slate-400 block">Recommended: 10-15</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Learning Rate</label>
            <select
              value={lr}
              onChange={e => setLr(e.target.value)}
              disabled={isRunning}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
            >
              <option value="1e-5">1e-5 (Fast)</option>
              <option value="5e-6">5e-6 (Standard Recommended)</option>
              <option value="3e-6">3e-6 (Fine Adaptation)</option>
              <option value="1e-6">1e-6 (Conservative)</option>
            </select>
            <span className="text-[11px] text-slate-400 block">AdamW Cosine Schedule</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Batch Size</label>
            <select
              value={batchSize}
              onChange={e => setBatchSize(Number(e.target.value))}
              disabled={isRunning}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
            >
              <option value={4}>4 (Lightweight RAM)</option>
              <option value={8}>8 (Standard for M-Series)</option>
              <option value={16}>16 (High Performance)</option>
            </select>
            <span className="text-[11px] text-slate-400 block">Effective batch x2 via gradient accum</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Transcript Target</label>
            <select
              value={mode}
              onChange={e => setMode(e.target.value as any)}
              disabled={isRunning}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
            >
              <option value="phonetic">Phonetic (&ldquo;I nee a hell&rdquo;)</option>
              <option value="english">Standard English (&ldquo;I need help&rdquo;)</option>
            </select>
            <span className="text-[11px] text-slate-400 block">Preserves Paxton&rsquo;s natural phonemes</span>
          </div>
        </div>
      </div>
    </div>
  );
}
