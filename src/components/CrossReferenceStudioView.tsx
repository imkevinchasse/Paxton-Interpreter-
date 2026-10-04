import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Brain, 
  BookOpen, 
  Layers, 
  Check, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Search, 
  ArrowRight, 
  Volume2, 
  CheckCircle2, 
  Sliders, 
  Database,
  ExternalLink,
  Edit2,
  X,
  Play,
  MessageSquareQuote,
  Lightbulb,
  ListOrdered,
  BookA
} from 'lucide-react';
import { type CrossReferenceItem } from '../types';
import { DictionaryQueueView } from './DictionaryQueueView';

export function CrossReferenceStudioView() {
  const [items, setItems] = useState<CrossReferenceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [totalPairs, setTotalPairs] = useState<number>(0);
  const [activeModel, setActiveModel] = useState<string>('LLaMA 3 (Ollama)');
  const [filterType, setFilterType] = useState<'all' | 'phrase' | 'word' | 'pending' | 'synced'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<'dictionary' | 'queue' | 'sandbox'>('dictionary');
  const [queueCount, setQueueCount] = useState<number>(0);
  
  // Test sandbox state
  const [testInput, setTestInput] = useState<string>('i nee a hell');
  const [testResult, setTestResult] = useState<any | null>(null);
  const [testing, setTesting] = useState<boolean>(false);

  // Edit modal
  const [editingItem, setEditingItem] = useState<CrossReferenceItem | null>(null);

  // New item modal
  const [newItem, setNewItem] = useState<{ phonetic: string; meaning: string; type: 'word' | 'phrase'; context: string } | null>(null);

  useEffect(() => {
    fetchData();
    fetchQueueCount();
  }, []);

  const fetchQueueCount = async () => {
    try {
      const res = await fetch('/api/dictionary/queue');
      const data = await res.json();
      if (data && typeof data.pendingCount === 'number') {
        setQueueCount(data.pendingCount);
      }
    } catch(e) {}
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/cross-reference');
      const data = await res.json();
      if (data) {
        setItems(data.items || []);
        setTotalPairs(data.totalTrainingPairs || 0);
        if (data.activeModel) setActiveModel(data.activeModel);
      }
    } catch (e) {
      console.error('Error fetching cross reference data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleStartScan = async (forceAll: boolean = false) => {
    setScanning(true);
    setScanProgress({ current: 0, total: totalPairs || 10, message: 'Initiating LLaMA analysis of training pairs …' });
    try {
      const res = await fetch('/api/cross-reference/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceAll })
      });
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
        setSyncStatus(`LLaMA scan complete! Found and analyzed ${data.items?.length || 0} phonetic vocabulary and phrase groups.`);
        setTimeout(() => setSyncStatus(null), 5000);
      } else {
        alert(data.error || 'Scan encountered an issue.');
      }
    } catch (e: any) {
      alert('Failed to connect to LLM scanner: ' + e.message);
    } finally {
      setScanning(false);
      setScanProgress(null);
      fetchData();
    }
  };

  const handleSyncToDictionary = async (ids?: string[]) => {
    try {
      const res = await fetch('/api/cross-reference/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, allApproved: !ids })
      });
      const data = await res.json();
      if (data.success) {
        setSyncStatus(`Successfully synced ${data.syncedCount || 'all'} entries to Paxton's active dictionary!`);
        setTimeout(() => setSyncStatus(null), 4000);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleItem = async (item: CrossReferenceItem) => {
    try {
      const updated = { ...item, inDictionary: !item.inDictionary, approved: true };
      await fetch(`/api/cross-reference/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      setItems(prev => prev.map(i => i.id === item.id ? updated : i));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Remove this cross-reference item?')) return;
    try {
      await fetch(`/api/cross-reference/${id}`, { method: 'DELETE' });
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    try {
      await fetch(`/api/cross-reference/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingItem)
      });
      setItems(prev => prev.map(i => i.id === editingItem.id ? editingItem : i));
      setEditingItem(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateNew = async () => {
    if (!newItem || !newItem.phonetic || !newItem.meaning) return;
    try {
      const res = await fetch('/api/cross-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
      const created = await res.json();
      setItems(prev => [created, ...prev]);
      setNewItem(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleTestInterpret = async () => {
    if (!testInput.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/cross-reference/test-interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testInput })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setTesting(false);
    }
  };

  // Filtered list
  const filteredItems = items.filter(item => {
    if (filterType === 'phrase' && item.type !== 'phrase') return false;
    if (filterType === 'word' && item.type !== 'word') return false;
    if (filterType === 'pending' && item.inDictionary) return false;
    if (filterType === 'synced' && !item.inDictionary) return false;
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchPhonetic = item.phonetic.toLowerCase().includes(q);
      const matchMeaning = item.meaning.toLowerCase().includes(q);
      const matchContext = (item.context || '').toLowerCase().includes(q);
      return matchPhonetic || matchMeaning || matchContext;
    }
    return true;
  });

  const phraseCount = items.filter(i => i.type === 'phrase').length;
  const wordCount = items.filter(i => i.type === 'word').length;
  const syncedCount = items.filter(i => i.inDictionary).length;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-16">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Paxton Dictionary &amp; Phrase Studio
              </h2>
              <p className="text-xs text-slate-500">
                Uses the active LLaMA model to dissect training pairs, compile phonetic dictionaries, group multi-word idioms, and cross-reference occurrences.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>LLM: {activeModel}</span>
          </div>

          <button
            type="button"
            onClick={() => handleStartScan(false)}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {scanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>{scanning ? 'Analyzing Pairs …' : 'Scan Training Pairs with LLaMA'}</span>
          </button>
        </div>
      </div>

      {/* Sync Success Alert */}
      {syncStatus && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-medium flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{syncStatus}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setSyncStatus(null)} 
            className="text-emerald-600 hover:text-emerald-800 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Progress Box when Scanning */}
      {scanning && scanProgress && (
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 text-xs text-indigo-900 space-y-2">
          <div className="flex items-center justify-between font-bold">
            <span className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
              <span>LLaMA Linguistic Parsing in Progress</span>
            </span>
            <span className="font-mono text-indigo-700">{scanProgress.current} / {scanProgress.total}</span>
          </div>
          <p className="text-indigo-700 text-[11px] font-mono truncate">{scanProgress.message}</p>
          <div className="w-full bg-indigo-100 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(10, Math.round((scanProgress.current / Math.max(1, scanProgress.total)) * 100))}%` }}
            />
          </div>
        </div>
      )}

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setMainTab('dictionary')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 ${
            mainTab === 'dictionary'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <BookA className="w-4 h-4" />
          <span>Active Vocabulary &amp; Phrases ({items.length})</span>
        </button>

        <button
          type="button"
          onClick={() => { setMainTab('queue'); fetchQueueCount(); }}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 ${
            mainTab === 'queue'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Dictionary Processing Queue</span>
          {queueCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-400 text-amber-950">
              {queueCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMainTab('sandbox')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 ${
            mainTab === 'sandbox'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Play className="w-4 h-4" />
          <span>Interpreter Sandbox</span>
        </button>
      </div>

      {/* Main Tab 1: Dictionary & Phrases */}
      {mainTab === 'dictionary' && (
        <>
          {/* Stats Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Training Pairs</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold font-mono text-slate-800">{totalPairs || 229}</span>
                <span className="text-xs text-slate-400">clips</span>
              </div>
              <span className="text-[11px] text-slate-500">Phonetic sound &amp; meaning pairs</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-500 block">Multi-Word Phrases</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold font-mono text-indigo-700">{phraseCount}</span>
                <span className="text-xs text-indigo-400">groups</span>
              </div>
              <span className="text-[11px] text-slate-500">Connected phonetic idioms</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-violet-500 block">Single Phonetic Words</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold font-mono text-violet-700">{wordCount}</span>
                <span className="text-xs text-violet-400">tokens</span>
              </div>
              <span className="text-[11px] text-slate-500">Individual phonetic mappings</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500 block">Active In Dictionary</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold font-mono text-emerald-700">{syncedCount}</span>
                <span className="text-xs text-emerald-400">synced</span>
              </div>
              <span className="text-[11px] text-slate-500">Cross-referenced &amp; live in interpreter</span>
            </div>
          </div>

      {/* Main Content Workspace */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Filter & Action Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterType === 'all' 
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('phrase')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterType === 'phrase' 
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Phrase Groups ({phraseCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('word')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterType === 'word' 
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Single Words ({wordCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('synced')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterType === 'synced' 
                  ? 'bg-white text-emerald-700 shadow-xs border border-slate-200' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Synced ({syncedCount})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search phonetic or meaning …"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="button"
              onClick={() => setNewItem({ phonetic: '', meaning: '', type: 'phrase', context: '' })}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium transition-colors shadow-2xs cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom</span>
            </button>

            <button
              type="button"
              onClick={() => handleSyncToDictionary()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs cursor-pointer shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Sync All to Dictionary</span>
            </button>
          </div>
        </div>

        {/* Table of Dissected Items */}
        <div className="divide-y divide-slate-100">
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-medium">No cross-reference items match your filter.</p>
              <p className="text-[11px] text-slate-400">
                Click &ldquo;Scan Training Pairs with LLaMA&rdquo; above to extract vocabulary and phrases automatically.
              </p>
            </div>
          ) : (
            filteredItems.map(item => (
              <div 
                key={item.id} 
                className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm text-indigo-700 bg-indigo-50/80 px-2.5 py-0.5 rounded-lg border border-indigo-100">
                      &ldquo;{item.phonetic}&rdquo;
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-bold text-slate-900 text-sm">
                      {item.meaning}
                    </span>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      item.type === 'phrase' 
                        ? 'bg-indigo-100 text-indigo-700' 
                        : 'bg-violet-100 text-violet-700'
                    }`}>
                      {item.type === 'phrase' ? 'Phrase Group' : 'Single Word'}
                    </span>

                    {item.occurrences > 1 && (
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {item.occurrences}× in training
                      </span>
                    )}

                    {item.confidence && (
                      <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {Math.round(item.confidence * 100)}% match
                      </span>
                    )}
                  </div>

                  {item.context && (
                    <div className="text-[11px] text-slate-500 italic flex items-center gap-1.5">
                      <span className="text-slate-400 not-italic font-bold text-[10px] uppercase">Context:</span>
                      <span>&ldquo;{item.context}&rdquo;</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleItem(item)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      item.inDictionary 
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' 
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Check className={`w-3.5 h-3.5 ${item.inDictionary ? 'text-emerald-700' : 'text-slate-400'}`} />
                    <span>{item.inDictionary ? 'In Dictionary' : 'Add to Dictionary'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingItem(item)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Edit Item"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Delete Item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </>
      )}

      {/* Main Tab 2: Dictionary Processing Queue */}
      {mainTab === 'queue' && (
        <DictionaryQueueView onSyncComplete={() => { fetchData(); fetchQueueCount(); }} />
      )}

      {/* Main Tab 3: Live Interactive Interpretation Sandbox */}
      {mainTab === 'sandbox' && (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <MessageSquareQuote className="w-4 h-4 text-indigo-600" />
              <span>Live LLaMA Interpretation Test Sandbox</span>
            </h3>
            <p className="text-xs text-slate-500">
              Verify how the LLaMA model combines your fine-tuned Whisper phonetic transcription with cross-referenced dictionary groups to deduce Paxton&rsquo;s actual intent.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="Type phonetic speech (e.g. 'i nee a hell' or 'dussin work wa is dat') …"
            value={testInput}
            onChange={e => setTestInput(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
          />

          <button
            type="button"
            onClick={handleTestInterpret}
            disabled={testing || !testInput.trim()}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{testing ? 'Decoding …' : 'Decode Intent with LLaMA'}</span>
          </button>
        </div>

        {/* Quick sample chips */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
          <span className="font-bold text-[10px] uppercase text-slate-400">Try Sample:</span>
          {['i nee a hell', 'dussin work', 'ba-man movie', 'wa is dis', 'yeyo car', 'no no no dussin want'].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => { setTestInput(s); }}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-mono text-[11px] transition-colors cursor-pointer"
            >
              &ldquo;{s}&rdquo;
            </button>
          ))}
        </div>

        {/* Test Result Display */}
        {testResult && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span>LLaMA Decoded Interpretation</span>
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Confidence: <strong className="text-emerald-700">{Math.round((testResult.confidence || 0.85) * 100)}%</strong>
              </span>
            </div>

            <div className="space-y-2">
              {testResult.candidates?.map((c: any, idx: number) => (
                <div 
                  key={c.id || idx}
                  className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
                    idx === 0 
                      ? 'bg-white border-indigo-200 shadow-2xs font-bold text-indigo-900' 
                      : 'bg-slate-50/50 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      idx === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {c.id || String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-sm">{c.text}</span>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400">
                    {Math.round((c.probability || 0.8) * 100)}% prob
                  </span>
                </div>
              ))}
            </div>

            {testResult.matchedEntries && testResult.matchedEntries.length > 0 && (
              <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600 space-y-1">
                <span className="font-bold text-slate-500 uppercase text-[10px]">Applied Dictionary Rules:</span>
                <div className="flex gap-2 flex-wrap">
                  {testResult.matchedEntries.map((m: any, idx: number) => (
                    <span key={idx} className="bg-white border border-slate-200 px-2 py-0.5 rounded text-indigo-700 font-mono">
                      &ldquo;{m.word || m.phonetic}&rdquo; ➔ &ldquo;{m.definition || m.meaning}&rdquo;
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h4 className="font-bold text-sm text-slate-800">Edit Cross-Reference Entry</h4>
              <button 
                type="button" 
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-600 uppercase text-[10px]">Phonetic Sound</label>
                <input
                  type="text"
                  value={editingItem.phonetic}
                  onChange={e => setEditingItem({ ...editingItem, phonetic: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 uppercase text-[10px]">Intended English Meaning</label>
                <input
                  type="text"
                  value={editingItem.meaning}
                  onChange={e => setEditingItem({ ...editingItem, meaning: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 uppercase text-[10px]">Entry Type</label>
                <select
                  value={editingItem.type}
                  onChange={e => setEditingItem({ ...editingItem, type: e.target.value as 'word' | 'phrase' })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2"
                >
                  <option value="phrase">Phrase Group (Multi-word)</option>
                  <option value="word">Single Phonetic Word</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 uppercase text-[10px]">Context Phrase</label>
                <input
                  type="text"
                  value={editingItem.context || ''}
                  onChange={e => setEditingItem({ ...editingItem, context: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Item Modal */}
      {newItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h4 className="font-bold text-sm text-slate-800">Add New Cross-Reference Mapping</h4>
              <button 
                type="button" 
                onClick={() => setNewItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-600 uppercase text-[10px]">Phonetic Sound / Words</label>
                <input
                  type="text"
                  placeholder="e.g. 'i nee a hell' or 'dussin'"
                  value={newItem.phonetic}
                  onChange={e => setNewItem({ ...newItem, phonetic: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 uppercase text-[10px]">Intended English Meaning</label>
                <input
                  type="text"
                  placeholder="e.g. 'I need some help' or 'doesn't'"
                  value={newItem.meaning}
                  onChange={e => setNewItem({ ...newItem, meaning: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 uppercase text-[10px]">Entry Type</label>
                <select
                  value={newItem.type}
                  onChange={e => setNewItem({ ...newItem, type: e.target.value as 'word' | 'phrase' })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2"
                >
                  <option value="phrase">Phrase Group (Multi-word idiom)</option>
                  <option value="word">Single Phonetic Word</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 uppercase text-[10px]">Example Context</label>
                <input
                  type="text"
                  placeholder="e.g. 'i nee a hell wit dis'"
                  value={newItem.context}
                  onChange={e => setNewItem({ ...newItem, context: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateNew}
                disabled={!newItem.phonetic || !newItem.meaning}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Add Mapping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
