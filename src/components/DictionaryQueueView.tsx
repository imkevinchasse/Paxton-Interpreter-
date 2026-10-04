import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Brain, 
  BookOpen, 
  Check, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Search, 
  Volume2, 
  CheckCircle2, 
  Database,
  X,
  Layers,
  ArrowRight,
  Filter,
  Info,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { type DictionaryQueueItem } from '../types';

export function DictionaryQueueView({ onSyncComplete }: { onSyncComplete?: () => void }) {
  const [queueItems, setQueueItems] = useState<DictionaryQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [committingId, setCommittingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New item modal form state
  const [newSpoken, setNewSpoken] = useState('');
  const [newMeaning, setNewMeaning] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [submittingNew, setSubmittingNew] = useState(false);

  // Local selection state for partial commitments per queue item
  // Map of itemId -> { selectedWords: Set<number>, selectedConnected: Set<number>, includeWhole: boolean }
  const [itemSelections, setItemSelections] = useState<Record<string, {
    selectedWords: Set<number>;
    selectedConnected: Set<number>;
    includeWhole: boolean;
  }>>({});

  // Expanded reasoning items
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/dictionary/queue');
      const data = await res.json();
      if (data && Array.isArray(data.items)) {
        setQueueItems(data.items);
        // Initialize selections for any newly fetched items
        setItemSelections(prev => {
          const next = { ...prev };
          data.items.forEach((item: DictionaryQueueItem) => {
            if (!next[item.id]) {
              next[item.id] = {
                selectedWords: new Set((item.deconstructedWords || []).map((_, idx) => idx)),
                selectedConnected: new Set((item.connectedWords || []).map((_, idx) => idx)),
                includeWhole: true
              };
            }
          });
          return next;
        });
      }
    } catch (e) {
      console.error('Error fetching dictionary queue:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNewToQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpoken.trim() || !newMeaning.trim()) return;

    setSubmittingNew(true);
    try {
      const res = await fetch('/api/dictionary/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalSpoken: newSpoken.trim(),
          intendedMeaning: newMeaning.trim(),
          notes: newNotes.trim()
        })
      });
      const data = await res.json();
      if (data.success && data.item) {
        setSuccessMessage(`Added "${newSpoken.trim()}" to queue! LLM is deconstructing into words and phrases.`);
        setTimeout(() => setSuccessMessage(null), 4000);
        setNewSpoken('');
        setNewMeaning('');
        setNewNotes('');
        setShowAddModal(false);
        fetchQueue();
      }
    } catch (err: any) {
      alert('Failed to add item to dictionary queue: ' + err.message);
    } finally {
      setSubmittingNew(false);
    }
  };

  const handleReanalyze = async (id: string) => {
    setAnalyzingId(id);
    try {
      const res = await fetch(`/api/dictionary/queue/${id}/analyze`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        fetchQueue();
      }
    } catch (e) {
      console.error('Failed to reanalyze queue item:', e);
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleApproveItem = async (item: DictionaryQueueItem) => {
    setCommittingId(item.id);
    const selection = itemSelections[item.id] || {
      selectedWords: new Set((item.deconstructedWords || []).map((_, idx) => idx)),
      selectedConnected: new Set((item.connectedWords || []).map((_, idx) => idx)),
      includeWhole: true
    };

    const wordsToCommit = (item.deconstructedWords || []).filter((_, idx) => selection.selectedWords.has(idx));
    const connectedToCommit = (item.connectedWords || []).filter((_, idx) => selection.selectedConnected.has(idx));

    try {
      const res = await fetch(`/api/dictionary/queue/${item.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedWords: wordsToCommit,
          selectedConnected: connectedToCommit,
          includeWholePhrase: selection.includeWhole
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(data.message || 'Committed selected words and phrases to active dictionary!');
        setTimeout(() => setSuccessMessage(null), 4000);
        fetchQueue();
        if (onSyncComplete) onSyncComplete();
      }
    } catch (e: any) {
      alert('Failed to approve queue item: ' + e.message);
    } finally {
      setCommittingId(null);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Remove this phrase from the processing queue?')) return;
    try {
      await fetch(`/api/dictionary/queue/${id}`, { method: 'DELETE' });
      setQueueItems(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleWordSelection = (itemId: string, wordIdx: number) => {
    setItemSelections(prev => {
      const current = prev[itemId] || {
        selectedWords: new Set(),
        selectedConnected: new Set(),
        includeWhole: true
      };
      const nextWords = new Set(current.selectedWords);
      if (nextWords.has(wordIdx)) nextWords.delete(wordIdx);
      else nextWords.add(wordIdx);
      return { ...prev, [itemId]: { ...current, selectedWords: nextWords } };
    });
  };

  const toggleConnectedSelection = (itemId: string, connIdx: number) => {
    setItemSelections(prev => {
      const current = prev[itemId] || {
        selectedWords: new Set(),
        selectedConnected: new Set(),
        includeWhole: true
      };
      const nextConnected = new Set(current.selectedConnected);
      if (nextConnected.has(connIdx)) nextConnected.delete(connIdx);
      else nextConnected.add(connIdx);
      return { ...prev, [itemId]: { ...current, selectedConnected: nextConnected } };
    });
  };

  const toggleWholePhrase = (itemId: string) => {
    setItemSelections(prev => {
      const current = prev[itemId] || {
        selectedWords: new Set(),
        selectedConnected: new Set(),
        includeWhole: true
      };
      return { ...prev, [itemId]: { ...current, includeWhole: !current.includeWhole } };
    });
  };

  const toggleReasoning = (itemId: string) => {
    setExpandedReasoning(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(u);
    }
  };

  const filteredQueue = queueItems.filter(item => {
    if (filterStatus === 'pending' && item.status === 'approved') return false;
    if (filterStatus === 'approved' && item.status !== 'approved') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSpoken = item.originalSpoken.toLowerCase().includes(q);
      const matchMeaning = item.intendedMeaning.toLowerCase().includes(q);
      const matchNotes = (item.notes || '').toLowerCase().includes(q);
      return matchSpoken || matchMeaning || matchNotes;
    }
    return true;
  });

  const pendingCount = queueItems.filter(i => i.status !== 'approved').length;
  const approvedCount = queueItems.filter(i => i.status === 'approved').length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Dictionary Processing Queue
                {pendingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    {pendingCount} Pending Review
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500">
                Instead of dumping phrases directly into the dictionary, the LLM analyzes each utterance and breaks it down into individual words, connected words (n-grams), and idioms for targeted approval.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-mono transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Utterance to Queue</span>
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

      {/* Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search spoken phonetics or meanings..."
            className="w-full bg-white border border-slate-200 rounded-xl pl-9.5 pr-4 py-2 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 shadow-inner"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition cursor-pointer ${
              filterStatus === 'all' 
                ? 'bg-indigo-600 text-white shadow-xs' 
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All ({queueItems.length})
          </button>
          <button
            onClick={() => setFilterStatus('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition cursor-pointer ${
              filterStatus === 'pending' 
                ? 'bg-indigo-600 text-white shadow-xs' 
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Pending Review ({pendingCount})
          </button>
          <button
            onClick={() => setFilterStatus('approved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition cursor-pointer ${
              filterStatus === 'approved' 
                ? 'bg-indigo-600 text-white shadow-xs' 
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Approved ({approvedCount})
          </button>
        </div>
      </div>

      {/* Queue Items List */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
          <p className="text-xs font-mono text-slate-500">Loading dictionary processing queue...</p>
        </div>
      ) : filteredQueue.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
          <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center mx-auto text-indigo-600">
            <BookOpen className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">No Items in Processing Queue</h4>
          <p className="text-xs text-slate-500 font-mono max-w-md mx-auto">
            When you correct low-confidence interpretations or add phrases, they appear here. The LLM breaks each phrase down into words and connected n-grams so you can choose exactly what to add to Paxton's active vocabulary.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-mono font-bold transition cursor-pointer"
          >
            + Add First Phrase to Deconstruct
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredQueue.map(item => {
            const isAnalyzing = item.status === 'analyzing' || analyzingId === item.id;
            const isApproved = item.status === 'approved';
            const selection = itemSelections[item.id] || {
              selectedWords: new Set((item.deconstructedWords || []).map((_, idx) => idx)),
              selectedConnected: new Set((item.connectedWords || []).map((_, idx) => idx)),
              includeWhole: true
            };
            const isExpanded = !!expandedReasoning[item.id];

            return (
              <div 
                key={item.id} 
                className={`bg-white rounded-2xl border transition-all overflow-hidden shadow-xs ${
                  isApproved 
                    ? 'border-emerald-200 bg-emerald-50/20' 
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Header row */}
                <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-900 font-mono tracking-tight flex items-center gap-2">
                        &ldquo;{item.originalSpoken}&rdquo;
                        <button
                          onClick={() => speak(item.originalSpoken)}
                          className="p-1 text-slate-400 hover:text-indigo-600 transition"
                          title="Speak phonetic sound"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-sm font-bold text-indigo-700 font-mono flex items-center gap-2">
                        &ldquo;{item.intendedMeaning}&rdquo;
                        <button
                          onClick={() => speak(item.intendedMeaning)}
                          className="p-1 text-indigo-400 hover:text-indigo-700 transition"
                          title="Speak intended English"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {item.notes && (
                        <span className="text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                          Note: {item.notes}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Status Pill */}
                    {isAnalyzing ? (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-mono font-medium">
                        <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                        LLM Deconstructing...
                      </span>
                    ) : isApproved ? (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-mono font-bold">
                        <Check className="w-3 h-3 text-emerald-600" />
                        Approved in Dictionary
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-mono font-medium">
                        <Sparkles className="w-3 h-3 text-indigo-600" />
                        Ready for Review
                      </span>
                    )}

                    {!isApproved && (
                      <button
                        onClick={() => handleApproveItem(item)}
                        disabled={committingId === item.id || isAnalyzing}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold font-mono transition shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        {committingId === item.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Approve Selected</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleReanalyze(item.id)}
                      disabled={isAnalyzing}
                      className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl transition cursor-pointer"
                      title="Re-run LLM Deconstruction"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                    </button>

                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 text-slate-400 hover:text-red-600 rounded-xl transition cursor-pointer"
                      title="Remove from queue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Body: 3-Tier Decomposition Cards */}
                <div className="p-5 space-y-4">
                  {/* Tier 1: Individual Words */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                        1. Isolated Words ({item.deconstructedWords?.length || 0})
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Select words to commit as individual dictionary entries
                      </span>
                    </div>

                    {(!item.deconstructedWords || item.deconstructedWords.length === 0) ? (
                      <p className="text-xs text-slate-400 font-mono italic">No isolated words extracted yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {item.deconstructedWords.map((word, wIdx) => {
                          const isSelected = selection.selectedWords.has(wIdx);
                          return (
                            <div
                              key={wIdx}
                              onClick={() => !isApproved && toggleWordSelection(item.id, wIdx)}
                              className={`p-3 rounded-xl border transition-all text-left flex items-start gap-2.5 ${
                                !isApproved ? 'cursor-pointer' : ''
                              } ${
                                isSelected 
                                  ? 'bg-indigo-50/40 border-indigo-200 text-indigo-950' 
                                  : 'bg-slate-50/50 border-slate-200 text-slate-400 opacity-60'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isApproved}
                                onChange={() => {}}
                                className="mt-0.5 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                              />
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-xs font-bold font-mono text-slate-900 truncate">
                                    &ldquo;{word.phonetic}&rdquo;
                                  </span>
                                  {word.partOfSpeech && (
                                    <span className="text-[9px] uppercase px-1.5 py-0.2 bg-white border border-slate-200 rounded text-slate-500 font-mono">
                                      {word.partOfSpeech}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-indigo-700 font-medium truncate">
                                  → {word.meaning}
                                </div>
                                {word.confidence && (
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    Confidence: {Math.round(word.confidence * 100)}%
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Tier 2: Connected Words / N-Grams */}
                  {item.connectedWords && item.connectedWords.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1.5">
                          <Brain className="w-3.5 h-3.5 text-indigo-600" />
                          2. Connected Words / Sound Links ({item.connectedWords.length})
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Phonetic n-grams where sounds merge or drop
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {item.connectedWords.map((conn, cIdx) => {
                          const isSelected = selection.selectedConnected.has(cIdx);
                          return (
                            <div
                              key={cIdx}
                              onClick={() => !isApproved && toggleConnectedSelection(item.id, cIdx)}
                              className={`p-3 rounded-xl border transition-all text-left flex items-start gap-2.5 ${
                                !isApproved ? 'cursor-pointer' : ''
                              } ${
                                isSelected 
                                  ? 'bg-indigo-50/40 border-indigo-200 text-indigo-950' 
                                  : 'bg-slate-50/50 border-slate-200 text-slate-400 opacity-60'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isApproved}
                                onChange={() => {}}
                                className="mt-0.5 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                              />
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <div className="text-xs font-bold font-mono text-slate-900 truncate">
                                  &ldquo;{conn.phoneticNgram}&rdquo;
                                </div>
                                <div className="text-xs text-indigo-700 font-medium truncate">
                                  → {conn.meaning}
                                </div>
                                {conn.patternNote && (
                                  <div className="text-[10px] text-slate-500 font-mono italic">
                                    {conn.patternNote}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Tier 3: Whole Phrase / Idiom */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <label 
                      onClick={() => !isApproved && toggleWholePhrase(item.id)}
                      className={`flex items-center gap-2.5 text-xs font-mono ${
                        !isApproved ? 'cursor-pointer' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selection.includeWhole}
                        disabled={isApproved}
                        onChange={() => {}}
                        className="rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                      />
                      <span className="font-bold text-slate-700">
                        3. Also commit complete utterance as whole phrase mapping:
                      </span>
                      <span className="text-indigo-600 font-medium">
                        &ldquo;{item.wholePhrase?.phonetic || item.originalSpoken}&rdquo; = &ldquo;{item.wholePhrase?.meaning || item.intendedMeaning}&rdquo;
                      </span>
                    </label>

                    {item.llmReasoning && (
                      <button
                        onClick={() => toggleReasoning(item.id)}
                        className="text-[11px] font-mono text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition cursor-pointer"
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>{isExpanded ? 'Hide LLM Analysis' : 'View LLM Analysis'}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>

                  {/* Expandable LLM Reasoning */}
                  {isExpanded && item.llmReasoning && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 space-y-1">
                      <span className="font-bold text-indigo-700 block">LLM Linguistic Breakdown Note:</span>
                      <p className="leading-relaxed">{item.llmReasoning}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Add New Utterance to Queue */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Add Utterance to Dictionary Queue</h3>
                  <p className="text-xs text-slate-500 font-mono">LLM will deconstruct into words, connected words &amp; phrases</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewToQueue} className="p-6 space-y-4 text-left">
              <div>
                <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Paxton's Phonetic Speech *
                </label>
                <input
                  type="text"
                  required
                  value={newSpoken}
                  onChange={e => setNewSpoken(e.target.value)}
                  placeholder="e.g. i nee a hell, ba-man dussin work, pa-pa boba"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 font-medium focus:outline-none focus:border-indigo-500 shadow-inner"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  What Paxton Actually Meant (Standard English) *
                </label>
                <input
                  type="text"
                  required
                  value={newMeaning}
                  onChange={e => setNewMeaning(e.target.value)}
                  placeholder="e.g. I need some help, Batman doesn't work, bubble tea"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 font-medium focus:outline-none focus:border-indigo-500 shadow-inner"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Linguistic Context / Pattern Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="e.g. Drops coda /d/ on 'need', inserts article 'a' before help..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 font-mono placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 shadow-inner resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-mono font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingNew}
                  className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-mono font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {submittingNew ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending to LLM...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Send to LLM Deconstruction</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
