import React, { useState, useEffect } from 'react';
import { 
  GitBranch, 
  Layers, 
  Database, 
  BookMarked, 
  BookA, 
  Sparkles, 
  Check, 
  RefreshCw, 
  Plus, 
  RotateCcw, 
  Download, 
  Copy, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Terminal, 
  Cpu, 
  X,
  ArrowRight,
  ShieldCheck,
  FileCode,
  Info
} from 'lucide-react';
import { type DataVersion, type VersioningState } from '../types';

export function VersioningView() {
  const [versioningState, setVersioningState] = useState<VersioningState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dataset' | 'rulebook' | 'dictionary' | 'mini_llm'>('dataset');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Snapshot modal
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  const [snapshotType, setSnapshotType] = useState<'dataset' | 'rulebook' | 'dictionary'>('dataset');
  const [snapshotTag, setSnapshotTag] = useState('');
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotDescription, setSnapshotDescription] = useState('');
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);

  // Mini LLM Export State
  const [miniLlmData, setMiniLlmData] = useState<{
    totalSamples: number;
    jsonl: string;
    modelfile: string;
    suggestedModel: string;
  } | null>(null);
  const [loadingMiniLlm, setLoadingMiniLlm] = useState(false);
  const [copiedJsonl, setCopiedJsonl] = useState(false);
  const [copiedModelfile, setCopiedModelfile] = useState(false);

  useEffect(() => {
    fetchVersioning();
  }, []);

  const fetchVersioning = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/versions');
      const data = await res.json();
      setVersioningState(data);
    } catch (e) {
      console.error('Error fetching versioning state:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMiniLlmExport = async () => {
    try {
      setLoadingMiniLlm(true);
      const res = await fetch('/api/mini-llm/export-dataset');
      const data = await res.json();
      setMiniLlmData(data);
    } catch (e) {
      console.error('Error fetching mini LLM dataset:', e);
    } finally {
      setLoadingMiniLlm(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'mini_llm') {
      fetchMiniLlmExport();
    }
  }, [activeTab]);

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapshotName.trim()) return;

    setIsCreatingSnapshot(true);
    try {
      const res = await fetch('/api/versions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: snapshotType,
          versionTag: snapshotTag.trim() || `v${Date.now()}`,
          name: snapshotName.trim(),
          description: snapshotDescription.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(`Created new ${snapshotType} version: "${snapshotName.trim()}"!`);
        setTimeout(() => setSuccessMessage(null), 4000);
        setShowSnapshotModal(false);
        setSnapshotTag('');
        setSnapshotName('');
        setSnapshotDescription('');
        fetchVersioning();
      } else {
        alert(data.error || 'Failed to create snapshot');
      }
    } catch (e: any) {
      alert('Error creating version: ' + e.message);
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleSelectVersion = async (type: 'dataset' | 'rulebook' | 'dictionary', versionId: string) => {
    try {
      const res = await fetch('/api/versions/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, versionId })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(data.message || `Switched active ${type} version!`);
        setTimeout(() => setSuccessMessage(null), 4000);
        fetchVersioning();
      } else {
        alert(data.error || 'Failed to select version');
      }
    } catch (e: any) {
      alert('Error selecting version: ' + e.message);
    }
  };

  const handleMarkTrained = async (versionId?: string) => {
    try {
      const res = await fetch('/api/versions/mark-trained', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage('Marked dataset version as fine-tuned! Untrained delta reset.');
        setTimeout(() => setSuccessMessage(null), 4000);
        fetchVersioning();
      }
    } catch (e: any) {
      alert('Failed to mark version as trained: ' + e.message);
    }
  };

  const openSnapshotModal = (type: 'dataset' | 'rulebook' | 'dictionary') => {
    setSnapshotType(type);
    const existingList = type === 'dataset' 
      ? versioningState?.datasetVersions 
      : type === 'rulebook' 
        ? versioningState?.rulebookVersions 
        : versioningState?.dictionaryVersions;
    const nextVer = `v1.${(existingList?.length || 0)}`;
    setSnapshotTag(nextVer);
    setSnapshotName(
      type === 'dataset' ? 'Training Pairs Snapshot' : 
      type === 'rulebook' ? 'Rulebook Hypothesis Snapshot' : 'Dictionary Snapshot'
    );
    setSnapshotDescription('');
    setShowSnapshotModal(true);
  };

  const copyToClipboard = (text: string, type: 'jsonl' | 'modelfile') => {
    navigator.clipboard.writeText(text);
    if (type === 'jsonl') {
      setCopiedJsonl(true);
      setTimeout(() => setCopiedJsonl(false), 2000);
    } else {
      setCopiedModelfile(true);
      setTimeout(() => setCopiedModelfile(false), 2000);
    }
  };

  const downloadJsonl = () => {
    if (!miniLlmData?.jsonl) return;
    const blob = new Blob([miniLlmData.jsonl], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paxton_mini_llm_train_${Date.now()}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeDatasetVer = versioningState?.datasetVersions?.find(v => v.id === versioningState.activeDatasetVersionId);
  const activeRulebookVer = versioningState?.rulebookVersions?.find(v => v.id === versioningState.activeRulebookVersionId);
  const activeDictVer = versioningState?.dictionaryVersions?.find(v => v.id === versioningState.activeDictionaryVersionId);
  const untrainedDelta = versioningState?.untrainedDatasetDeltaCount || 0;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-16">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Dataset, Rulebook &amp; Model Versioning
              </h2>
              <p className="text-xs text-slate-500">
                Prevent re-training on previously fine-tuned Whisper pairs, snapshot tested grammar rulebooks and dictionaries, and export instruction datasets for Phase 1B Mini LLM initial assumptions.
              </p>
            </div>
          </div>
        </div>

        {/* Untrained Delta Badge */}
        <div className="flex items-center gap-3">
          {untrainedDelta > 0 ? (
            <div className="px-3.5 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-900 text-xs font-mono">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <span className="font-bold">{untrainedDelta} Untrained Pairs</span>
                <span className="text-[10px] text-amber-700 block">Added since last Whisper fine-tuning</span>
              </div>
            </div>
          ) : (
            <div className="px-3.5 py-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-900 text-xs font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <span className="font-bold">Dataset Synced</span>
                <span className="text-[10px] text-emerald-700 block">All current pairs fine-tuned</span>
              </div>
            </div>
          )}

          <button
            onClick={() => fetchVersioning()}
            className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 transition cursor-pointer"
            title="Refresh Versions"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-medium flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Pillars Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pillar 1: Dataset */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-indigo-600" /> Whisper Dataset
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {activeDatasetVer?.versionTag || 'v1.0'}
            </span>
          </div>
          <h4 className="text-sm font-bold text-slate-900 truncate">
            {activeDatasetVer?.name || 'Active Training Set'}
          </h4>
          <div className="flex items-center justify-between text-xs font-mono text-slate-500 pt-1 border-t border-slate-100">
            <span>{activeDatasetVer?.itemCount || 0} pairs</span>
            <span className={activeDatasetVer?.fineTuned ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
              {activeDatasetVer?.fineTuned ? '✓ Fine-Tuned' : '• Pending Fine-Tune'}
            </span>
          </div>
        </div>

        {/* Pillar 2: Grammar Rulebook */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
              <BookMarked className="w-3.5 h-3.5 text-indigo-600" /> Grammar Rulebook
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {activeRulebookVer?.versionTag || 'v1.0'}
            </span>
          </div>
          <h4 className="text-sm font-bold text-slate-900 truncate">
            {activeRulebookVer?.name || 'Active Rules'}
          </h4>
          <div className="flex items-center justify-between text-xs font-mono text-slate-500 pt-1 border-t border-slate-100">
            <span>{activeRulebookVer?.itemCount || 0} rules</span>
            <span className="text-indigo-600 font-bold">Active in Interpreter</span>
          </div>
        </div>

        {/* Pillar 3: Dictionary */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
              <BookA className="w-3.5 h-3.5 text-indigo-600" /> Paxton Dictionary
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {activeDictVer?.versionTag || 'v1.0'}
            </span>
          </div>
          <h4 className="text-sm font-bold text-slate-900 truncate">
            {activeDictVer?.name || 'Active Vocabulary'}
          </h4>
          <div className="flex items-center justify-between text-xs font-mono text-slate-500 pt-1 border-t border-slate-100">
            <span>{activeDictVer?.itemCount || 0} vocabulary entries</span>
            <span className="text-indigo-600 font-bold">Active in Phase 4</span>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('dataset')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'dataset'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Whisper Datasets ({versioningState?.datasetVersions?.length || 0})</span>
            {untrainedDelta > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('rulebook')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'rulebook'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <BookMarked className="w-4 h-4" />
            <span>Rulebook Versions ({versioningState?.rulebookVersions?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('dictionary')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'dictionary'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <BookA className="w-4 h-4" />
            <span>Dictionary Versions ({versioningState?.dictionaryVersions?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('mini_llm')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'mini_llm'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Mini LLM Fine-Tuner (Phase 1B)</span>
          </button>
        </div>

        {activeTab !== 'mini_llm' && (
          <button
            onClick={() => openSnapshotModal(activeTab)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-mono font-bold transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Snapshot New {activeTab === 'dataset' ? 'Dataset' : activeTab === 'rulebook' ? 'Rulebook' : 'Dictionary'} Version</span>
          </button>
        )}
      </div>

      {/* Tab Content 1: Dataset Versions */}
      {activeTab === 'dataset' && (
        <div className="space-y-4">
          {/* Helper notice */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono text-slate-600 flex items-start gap-3">
            <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800 block">Prevent Duplicate Training</span>
              When you add new training pairs or voice recordings, the system keeps track of the untrained delta. Snapshot a version before fine-tuning, then mark it as fine-tuned upon completion. You can also rollback to previous dataset snapshots anytime.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {(versioningState?.datasetVersions || []).map((ver) => {
              const isActive = ver.id === versioningState?.activeDatasetVersionId;
              return (
                <div
                  key={ver.id}
                  className={`bg-white rounded-2xl border p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs ${
                    isActive ? 'border-indigo-300 ring-2 ring-indigo-500/10 bg-indigo-50/10' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 rounded-md text-xs font-mono font-bold">
                        {ver.versionTag}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 font-mono truncate">
                        {ver.name}
                      </h4>
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          Active In Interpreter
                        </span>
                      )}
                      {ver.fineTuned ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Fine-Tuned
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          Untrained
                        </span>
                      )}
                    </div>

                    {ver.description && (
                      <p className="text-xs text-slate-500 font-mono">{ver.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400">
                      <span>Items: <strong className="text-slate-700">{ver.itemCount} pairs</strong></span>
                      <span>Snapshot: {new Date(ver.timestamp).toLocaleDateString()} {new Date(ver.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {ver.fineTunedAt && (
                        <span className="text-emerald-700 font-medium">
                          Fine-tuned at: {new Date(ver.fineTunedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isActive ? (
                      <button
                        onClick={() => handleSelectVersion('dataset', ver.id)}
                        className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        <span>Activate Version</span>
                      </button>
                    ) : (
                      !ver.fineTuned && (
                        <button
                          onClick={() => handleMarkTrained(ver.id)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-mono font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Mark Fine-Tuned</span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab Content 2: Grammar Rulebook Versions */}
      {activeTab === 'rulebook' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono text-slate-600 flex items-start gap-3">
            <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800 block">Rulebook Version Control</span>
              As Gemma and LLaMA formulate, test, and confirm phonetic rules, you can checkpoint your grammar rulebook into distinct versions. Switching active versions instantly modifies the rules used in Phase 3 of the interpreter.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {(versioningState?.rulebookVersions || []).map((ver) => {
              const isActive = ver.id === versioningState?.activeRulebookVersionId;
              return (
                <div
                  key={ver.id}
                  className={`bg-white rounded-2xl border p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs ${
                    isActive ? 'border-emerald-300 ring-2 ring-emerald-500/10 bg-emerald-50/10' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 rounded-md text-xs font-mono font-bold">
                        {ver.versionTag}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 font-mono truncate">
                        {ver.name}
                      </h4>
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Active In Phase 3
                        </span>
                      )}
                    </div>

                    {ver.description && (
                      <p className="text-xs text-slate-500 font-mono">{ver.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400">
                      <span>Rules: <strong className="text-slate-700">{ver.itemCount} active rules</strong></span>
                      <span>Snapshot: {new Date(ver.timestamp).toLocaleDateString()} {new Date(ver.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isActive && (
                      <button
                        onClick={() => handleSelectVersion('rulebook', ver.id)}
                        className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        <span>Activate Version</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab Content 3: Dictionary Versions */}
      {activeTab === 'dictionary' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono text-slate-600 flex items-start gap-3">
            <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800 block">Dictionary Version Snapshots</span>
              Save checkpoints of Paxton's vocabulary dictionary as words and idioms are processed through the queue. You can rollback or switch dictionaries with zero downtime.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {(versioningState?.dictionaryVersions || []).map((ver) => {
              const isActive = ver.id === versioningState?.activeDictionaryVersionId;
              return (
                <div
                  key={ver.id}
                  className={`bg-white rounded-2xl border p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs ${
                    isActive ? 'border-indigo-300 ring-2 ring-indigo-500/10 bg-indigo-50/10' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 rounded-md text-xs font-mono font-bold">
                        {ver.versionTag}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 font-mono truncate">
                        {ver.name}
                      </h4>
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          Active In Phase 4
                        </span>
                      )}
                    </div>

                    {ver.description && (
                      <p className="text-xs text-slate-500 font-mono">{ver.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400">
                      <span>Entries: <strong className="text-slate-700">{ver.itemCount} vocabulary terms</strong></span>
                      <span>Snapshot: {new Date(ver.timestamp).toLocaleDateString()} {new Date(ver.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isActive && (
                      <button
                        onClick={() => handleSelectVersion('dictionary', ver.id)}
                        className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        <span>Activate Version</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab Content 4: Mini LLM Fine-Tuning Studio */}
      {activeTab === 'mini_llm' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Phase 1B Mini LLM Fine-Tuning Studio
                </h3>
                <p className="text-xs text-slate-500">
                  Export Paxton's verified phonetic-to-intent training pairs as an instruction-tuning dataset to fine-tune a lightweight local model (like Gemma 2 2B or LLaMA 3.2 1B). In Phase 1B, this mini model makes rapid initial semantic guesses based directly on learned training pairs before the full LLM orchestrates context.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <span className="text-xs font-mono text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                Exportable Samples: <strong>{miniLlmData?.totalSamples || 0} training pairs</strong>
              </span>
              <span className="text-xs font-mono text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                Target Model: <strong>{miniLlmData?.suggestedModel || 'gemma2:2b'}</strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Box 1: JSONL Training Dataset */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3 flex flex-col">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-indigo-600" />
                  1. Instruction Dataset (JSONL)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => miniLlmData?.jsonl && copyToClipboard(miniLlmData.jsonl, 'jsonl')}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 transition cursor-pointer"
                  >
                    {copiedJsonl ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedJsonl ? 'Copied!' : 'Copy'}</span>
                  </button>
                  <button
                    onClick={downloadJsonl}
                    className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs font-mono text-indigo-700 font-bold transition cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 rounded-xl p-3.5 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-72 flex-1 shadow-inner leading-relaxed">
                {loadingMiniLlm ? (
                  <div className="py-8 text-center text-slate-400">Loading dataset...</div>
                ) : (
                  <pre>{miniLlmData?.jsonl || 'No training pairs with sound and meaning available yet.'}</pre>
                )}
              </div>
            </div>

            {/* Box 2: Ollama Modelfile */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3 flex flex-col">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                  2. Ollama Modelfile
                </span>
                <button
                  onClick={() => miniLlmData?.modelfile && copyToClipboard(miniLlmData.modelfile, 'modelfile')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 transition cursor-pointer"
                >
                  {copiedModelfile ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedModelfile ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>

              <div className="bg-slate-900 rounded-xl p-3.5 font-mono text-[11px] text-indigo-200 overflow-x-auto max-h-72 flex-1 shadow-inner leading-relaxed">
                {loadingMiniLlm ? (
                  <div className="py-8 text-center text-slate-400">Loading Modelfile...</div>
                ) : (
                  <pre>{miniLlmData?.modelfile || ''}</pre>
                )}
              </div>
            </div>
          </div>

          {/* Quick CLI Guide */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-indigo-600" />
              CLI Instructions: How to Create Your Phase 1B Mini Model
            </span>
            <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs text-emerald-400 space-y-2 overflow-x-auto">
              <p className="text-slate-400"># 1. Save the Modelfile into your project directory</p>
              <p>cat &lt;&lt; 'EOF' &gt; Modelfile</p>
              <p className="text-indigo-300">FROM {miniLlmData?.suggestedModel || 'gemma2:2b'}</p>
              <p className="text-indigo-300">SYSTEM """You are Paxton's specialized communication interpreter. Translate his phonetic sounds into standard English."""</p>
              <p>EOF</p>
              <p className="text-slate-400 pt-2"># 2. Build the local Ollama model</p>
              <p className="text-white font-bold">ollama create paxton-aac-mini -f ./Modelfile</p>
              <p className="text-slate-400 pt-2"># 3. Set the Mini Model in Model Settings &rarr; Mini LLM Model: "paxton-aac-mini"</p>
            </div>
          </div>
        </div>
      )}

      {/* Snapshot Modal */}
      {showSnapshotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Snapshot New {snapshotType === 'dataset' ? 'Dataset' : snapshotType === 'rulebook' ? 'Rulebook' : 'Dictionary'} Version
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">Create an immutable checkpoint</p>
                </div>
              </div>
              <button onClick={() => setShowSnapshotModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSnapshot} className="p-6 space-y-4 text-left">
              <div>
                <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Version Tag *
                </label>
                <input
                  type="text"
                  required
                  value={snapshotTag}
                  onChange={e => setSnapshotTag(e.target.value)}
                  placeholder="e.g. v1.1, v2.0, 2025-03-snapshot"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 font-mono focus:outline-none focus:border-indigo-500 shadow-inner"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Version Name *
                </label>
                <input
                  type="text"
                  required
                  value={snapshotName}
                  onChange={e => setSnapshotName(e.target.value)}
                  placeholder="e.g. Post-Playground Session, Verified Consonant Rules"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 font-medium focus:outline-none focus:border-indigo-500 shadow-inner"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Description / Changelog (Optional)
                </label>
                <textarea
                  rows={2}
                  value={snapshotDescription}
                  onChange={e => setSnapshotDescription(e.target.value)}
                  placeholder="e.g. Added 8 new breakfast and toy phrase recordings, marked for Whisper fine-tuning..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 font-mono placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 shadow-inner resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSnapshotModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-mono font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingSnapshot}
                  className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-mono font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isCreatingSnapshot ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Snapshot Version</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
