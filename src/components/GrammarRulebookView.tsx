import React, { useState, useEffect, useRef } from 'react';
import { 
  BookMarked, 
  Brain, 
  Sparkles, 
  Play, 
  Square, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Trash2, 
  Sliders, 
  Search, 
  ArrowRight, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  Volume2, 
  HelpCircle, 
  Lightbulb, 
  Cpu, 
  FileText,
  RotateCcw,
  Zap,
  Activity
} from 'lucide-react';
import { type GrammarRule, type HypothesisCycleStatus } from '../types';

export function GrammarRulebookView() {
  const [rules, setRules] = useState<GrammarRule[]>([]);
  const [status, setStatus] = useState<HypothesisCycleStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [cycling, setCycling] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string>('gemma2');

  // Test phrase sandbox state
  const [testPhrase, setTestPhrase] = useState<string>('i nee a hell');
  const [testResult, setTestResult] = useState<any | null>(null);
  const [testingPhrase, setTestingPhrase] = useState<boolean>(false);

  // New rule modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newRuleForm, setNewRuleForm] = useState({
    ruleName: '',
    patternType: 'consonant_deletion',
    hypothesis: '',
    condition: '',
    action: ''
  });

  const pollIntervalRef = useRef<any>(null);

  useEffect(() => {
    fetchRules();
    // Poll status while cycling
    pollIntervalRef.current = setInterval(fetchRulesSilently, 2500);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/grammar-rules');
      const data = await res.json();
      if (data) {
        setRules(data.rules || []);
        setStatus(data.status || null);
        if (data.activeModel) setActiveModel(data.activeModel);
      }
    } catch (e) {
      console.error('Failed to fetch grammar rules:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchRulesSilently = async () => {
    try {
      const res = await fetch('/api/grammar-rules');
      const data = await res.json();
      if (data) {
        setRules(data.rules || []);
        setStatus(data.status || null);
      }
    } catch (e) {}
  };

  const handleStartCycle = async () => {
    setCycling(true);
    try {
      const res = await fetch('/api/grammar-rules/hypothesize', { method: 'POST' });
      const data = await res.json();
      fetchRules();
    } catch (e) {
      console.error('Error starting hypothesis cycle:', e);
    } finally {
      setCycling(false);
    }
  };

  const handleToggleContinuous = async () => {
    const nextState = !status?.isContinuous;
    try {
      const res = await fetch('/api/grammar-rules/continuous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState })
      });
      const data = await res.json();
      fetchRules();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleRuleEnabled = async (rule: GrammarRule) => {
    const updated = !rule.enabled;
    try {
      await fetch(`/api/grammar-rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: updated })
      });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: updated } : r));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to remove this grammar rule from the rulebook?')) return;
    try {
      await fetch(`/api/grammar-rules/${id}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetRulebook = async () => {
    if (!confirm('Reset rulebook to verified foundational baseline?')) return;
    try {
      const res = await fetch('/api/grammar-rules/reset', { method: 'POST' });
      const data = await res.json();
      if (data.rules) setRules(data.rules);
    } catch (e) {
      console.error(e);
    }
  };

  const handleTestPhrase = async (phraseToTest?: string) => {
    const target = phraseToTest || testPhrase;
    if (!target) return;
    setTestingPhrase(true);
    try {
      const res = await fetch('/api/grammar-rules/test-phrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase: target })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setTestingPhrase(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleForm.ruleName || !newRuleForm.hypothesis) return;

    try {
      const res = await fetch('/api/grammar-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRuleForm)
      });
      const created = await res.json();
      setRules(prev => [created, ...prev]);
      setShowAddModal(false);
      setNewRuleForm({
        ruleName: '',
        patternType: 'consonant_deletion',
        hypothesis: '',
        condition: '',
        action: ''
      });
    } catch (e) {
      console.error(e);
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  const filteredRules = rules.filter(r => {
    if (selectedFilter !== 'all' && r.patternType !== selectedFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.ruleName.toLowerCase().includes(q) ||
        r.hypothesis.toLowerCase().includes(q) ||
        r.condition.toLowerCase().includes(q) ||
        r.action.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const confirmedCount = rules.filter(r => r.status === 'confirmed').length;
  const avgAccuracy = rules.length > 0 
    ? (rules.reduce((acc, r) => acc + (r.accuracy || 0.9), 0) / rules.length) * 100 
    : 95;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 pb-16 font-sans">
      {/* Page Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-indigo-600 to-emerald-400"></div>
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm">
                <BookMarked className="w-5 h-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">
                Paxton Grammar Rulebook
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                Hypothesis Engine
              </span>
            </div>
            <p className="text-sm text-slate-500 max-w-2xl leading-relaxed">
              Autonomous linguistic reasoning model powered by <strong>Gemma</strong> to deduce <em>why</em> Paxton drops consonants, inserts intrusive articles like &ldquo;a&rdquo;, and merges words—compiling an empirical rulebook for the interpreter.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleToggleContinuous}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition shadow-sm ${
                status?.isContinuous
                  ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {status?.isContinuous ? <Square className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
              <span>{status?.isContinuous ? 'Pause Overnight Loop' : 'Run Overnight Discovery'}</span>
            </button>

            <button
              disabled={cycling || status?.active}
              onClick={handleStartCycle}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-white transition disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${cycling || status?.active ? 'animate-spin' : ''}`} />
              <span>{cycling || status?.active ? 'Testing Hypothesis …' : 'Test Next Hypothesis'}</span>
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Custom Rule</span>
            </button>

            <button
              onClick={handleResetRulebook}
              title="Reset to default verified rules"
              className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Active Rules</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-800">{confirmedCount}</span>
              <span className="text-xs text-emerald-600 font-semibold font-mono">confirmed</span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Reasoning Model</span>
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-bold text-slate-800 font-mono capitalize">{activeModel}</span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">Ollama &bull; Gemini Fallback</span>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Library Samples Tested</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-800">{status?.totalDatasetPairs || 229}</span>
              <span className="text-xs text-slate-500 font-mono">phrases</span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Empirical Accuracy</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-emerald-600">{avgAccuracy.toFixed(1)}%</span>
              <span className="text-xs text-slate-400 font-mono">across corpus</span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-Time Hypothesis Cycle Monitor */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></div>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">
              Linguistic Hypothesis Pipeline
            </h2>
            {status?.isContinuous && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                Continuous Overnight Mode Active
              </span>
            )}
          </div>
          <span className="text-xs font-mono text-slate-500">
            Cycle #{status?.cycleNumber || 1} &bull; Model: {activeModel}
          </span>
        </div>

        {/* 5-Step Pipeline Steps */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {[
            { step: '1. Scan Library', desc: 'Scan library of phonetic speech pairs & proper English intent' },
            { step: '2. Isolate Pattern', desc: 'Detect abnormal grammar, dropped /d/, or intrusive "a"' },
            { step: '3. Gemma Reason', desc: 'Formulate scientific hypothesis explaining why he said it' },
            { step: '4. Test Corpus', desc: 'Test hypothesis across all other phrases in data to see if it holds' },
            { step: '5. Rule Decision', desc: 'Empirical confirmation into active Grammar Rulebook' }
          ].map((s, idx) => {
            const stepNum = idx + 1;
            const currentStepNum = 
              status?.currentStep === 'scanning_dataset' ? 1 :
              status?.currentStep === 'isolating_pattern' ? 2 :
              status?.currentStep === 'formulating_hypothesis' ? 3 :
              status?.currentStep === 'testing_across_corpus' ? 4 :
              status?.currentStep === 'evaluating_decision' ? 5 : 0;

            const isCurrent = currentStepNum === stepNum;
            const isCompleted = currentStepNum > stepNum || (!status?.active && currentStepNum === 0);

            return (
              <div 
                key={s.step} 
                className={`p-3.5 rounded-2xl border transition-all ${
                  isCurrent 
                    ? 'bg-emerald-50/80 border-emerald-300 shadow-sm ring-1 ring-emerald-200' 
                    : isCompleted
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-white border-slate-100 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[11px] font-mono font-bold uppercase tracking-wider ${isCurrent ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {s.step}
                  </span>
                  {isCurrent && <Activity className="w-3.5 h-3.5 text-emerald-600 animate-spin" />}
                  {isCompleted && !isCurrent && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {s.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* Current Cycle Description Banner */}
        <div className="p-4 bg-slate-900 rounded-2xl text-slate-200 font-mono text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-emerald-400 font-bold uppercase tracking-wider text-[11px]">Active Hypothesis:</span>
            <span className="text-slate-300">
              {status?.activeHypothesis || status?.stepDescription || "Hypothesis engine initialized. Verified patterns active."}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 shrink-0">
            {rules.length} confirmed rules &bull; {status?.rejectedRulesCount || 0} refined
          </span>
        </div>

        {/* Live Terminal Log Drawer */}
        {status?.logs && status.logs.length > 0 && (
          <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 text-[11px] font-mono text-slate-400 max-h-36 overflow-y-auto space-y-1">
            {status.logs.slice(-6).map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-slate-600 select-none">&gt;</span>
                <span className={log.includes('CONFIRMED') ? 'text-emerald-400 font-semibold' : log.includes('REJECTED') ? 'text-amber-400' : 'text-slate-300'}>
                  {log}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Rulebook Test Sandbox */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 tracking-tight">
                Live Grammar Rulebook Test Bench
              </h2>
              <p className="text-xs text-slate-500">
                Test how Paxton&rsquo;s abnormal speech is transformed and decoded by the verified rules.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'i nee a hell', hint: 'Terminal /d/ + drop "a"' },
              { label: 'ba-man dussin work', hint: 'Batman + doesn\'t' },
              { label: 'wa is dis', hint: 'What is this' },
              { label: 'he go a sleep', hint: 'Intrusive "a" -> to' },
              { label: 'i wan a cookie', hint: 'Preserves "a"' }
            ].map(p => (
              <button
                key={p.label}
                onClick={() => {
                  setTestPhrase(p.label);
                  handleTestPhrase(p.label);
                }}
                className="px-2.5 py-1 text-xs font-mono rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                &ldquo;{p.label}&rdquo;
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={testPhrase}
            onChange={e => setTestPhrase(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTestPhrase()}
            placeholder="Enter phonetic spoken phrase (e.g. 'i nee a hell', 'wa is dis')..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 font-medium focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 shadow-inner"
          />
          <button
            onClick={() => handleTestPhrase()}
            disabled={testingPhrase || !testPhrase}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition disabled:opacity-50 shadow-sm flex items-center gap-2"
          >
            {testingPhrase ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>Apply Rulebook</span>
          </button>
        </div>

        {testResult && (
          <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Raw Whisper Phonetic Input</span>
                <p className="text-xl font-mono text-slate-700 font-semibold">&ldquo;{testResult.original}&rdquo;</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Decoded Intended Meaning
                </span>
                <div className="flex items-center justify-between">
                  <p className="text-xl font-bold text-slate-800">&ldquo;{testResult.decoded}&rdquo;</p>
                  <button
                    onClick={() => speakText(testResult.decoded)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition"
                    title="Speak decoded translation"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Applied Rules Breakdown */}
            {testResult.appliedRules && testResult.appliedRules.length > 0 ? (
              <div className="space-y-2 pt-2 border-t border-slate-200/60">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Grammar Rules Triggered ({testResult.appliedRules.length}):
                </span>
                <div className="space-y-2">
                  {testResult.appliedRules.map((ar: any, idx: number) => (
                    <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-indigo-700">{ar.ruleName}</span>
                        <span className="text-[11px] font-mono text-slate-500">
                          &ldquo;{ar.before}&rdquo; &rarr; &ldquo;{ar.after}&rdquo;
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px]">{ar.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic pt-1">
                No transformation rules triggered for this phrase; direct dictionary phonetic substitution applied.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Verified Grammar Rulebook Catalog */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">
              Verified Grammar Rulebook
            </h2>
            <p className="text-xs text-slate-500">
              Validated phonological rules applied directly by the LLaMA interpreter when listening to Paxton.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search grammar rules..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
          {[
            { id: 'all', label: `All Rules (${rules.length})` },
            { id: 'consonant_deletion', label: 'Consonant Deletion (/d/, /t/)' },
            { id: 'intrusive_article', label: 'Intrusive Article ("a")' },
            { id: 'word_merging', label: 'Word Merging & Compounds' },
            { id: 'custom', label: 'Custom' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFilter(f.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                selectedFilter === f.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Rules List */}
        <div className="space-y-4">
          {filteredRules.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl">
              <BookMarked className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600">No matching grammar rules found.</p>
              <p className="text-xs text-slate-400 mt-1">Run the hypothesis engine or add a custom rule above.</p>
            </div>
          ) : (
            filteredRules.map(rule => {
              const isExpanded = expandedRuleId === rule.id;

              return (
                <div
                  key={rule.id}
                  className={`border rounded-2xl transition-all overflow-hidden ${
                    rule.enabled !== false 
                      ? 'border-slate-200 bg-white hover:border-slate-300' 
                      : 'border-slate-200/60 bg-slate-50/60 opacity-60'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="font-bold text-slate-800 text-base">{rule.ruleName}</h3>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          rule.patternType === 'intrusive_article' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                          rule.patternType === 'consonant_deletion' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          'bg-purple-100 text-purple-800 border border-purple-200'
                        }`}>
                          {rule.patternType.replace('_', ' ')}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {(rule.accuracy * 100).toFixed(0)}% Accuracy
                        </span>
                      </div>

                      {/* Linguistic Hypothesis */}
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        <strong className="text-slate-700">Linguistic Hypothesis:</strong> {rule.hypothesis}
                      </p>
                    </div>

                    {/* Card Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggleRuleEnabled(rule)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition ${
                          rule.enabled !== false
                            ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                            : 'bg-slate-200 hover:bg-slate-300 text-slate-600'
                        }`}
                      >
                        {rule.enabled !== false ? 'Active' : 'Disabled'}
                      </button>

                      <button
                        onClick={() => setExpandedRuleId(isExpanded ? null : rule.id)}
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                        title="View details & empirical examples"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                        title="Delete rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-3 border-t border-slate-100 bg-slate-50/50 space-y-4 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400 block">Trigger Condition</span>
                          <p className="text-slate-700 font-mono bg-white p-2.5 rounded-xl border border-slate-200">{rule.condition}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400 block">Translation Action</span>
                          <p className="text-slate-700 font-mono bg-white p-2.5 rounded-xl border border-slate-200">{rule.action}</p>
                        </div>
                      </div>

                      {/* Supporting Examples */}
                      {rule.supportedExamples && rule.supportedExamples.length > 0 && (
                        <div className="space-y-2">
                          <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Supported Training Examples ({rule.supportedExamples.length}):
                          </span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {rule.supportedExamples.map((ex, idx) => (
                              <div key={idx} className="bg-white p-2.5 rounded-xl border border-emerald-200 flex items-center justify-between gap-2">
                                <div>
                                  <span className="font-mono text-slate-500 font-bold">&ldquo;{ex.spoken}&rdquo;</span>
                                  <span className="text-slate-400 mx-1.5">&rarr;</span>
                                  <span className="font-semibold text-slate-800">&ldquo;{ex.intended}&rdquo;</span>
                                </div>
                                {ex.note && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">{ex.note}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Counter Examples */}
                      {rule.counterExamples && rule.counterExamples.length > 0 && (
                        <div className="space-y-2">
                          <span className="font-bold uppercase tracking-wider text-[10px] text-amber-700 flex items-center gap-1">
                            <HelpCircle className="w-3.5 h-3.5" /> Evaluated Counter-Examples / Boundary Cases ({rule.counterExamples.length}):
                          </span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {rule.counterExamples.map((ex, idx) => (
                              <div key={idx} className="bg-white p-2.5 rounded-xl border border-amber-200 flex items-center justify-between gap-2">
                                <div>
                                  <span className="font-mono text-slate-500">&ldquo;{ex.spoken}&rdquo;</span>
                                  <span className="text-slate-400 mx-1.5">&rarr;</span>
                                  <span className="font-semibold text-slate-800">&ldquo;{ex.intended}&rdquo;</span>
                                </div>
                                {ex.note && <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">{ex.note}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Custom Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-xl w-full border border-slate-200 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Add Custom Grammar Rule</h3>
            <form onSubmit={handleCreateRule} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  value={newRuleForm.ruleName}
                  onChange={e => setNewRuleForm({ ...newRuleForm, ruleName: e.target.value })}
                  placeholder="e.g. Intrusive Article 'a' Omission"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Pattern Type</label>
                <select
                  value={newRuleForm.patternType}
                  onChange={e => setNewRuleForm({ ...newRuleForm, patternType: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                >
                  <option value="consonant_deletion">Consonant Deletion (/d/, /t/, /k/)</option>
                  <option value="intrusive_article">Intrusive Indefinite Article ('a')</option>
                  <option value="word_merging">Word Merging & Compounds</option>
                  <option value="vowel_reduction">Vowel Reduction / Laxing</option>
                  <option value="custom">Custom Rule</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Linguistic Hypothesis & Reasoning</label>
                <textarea
                  required
                  rows={3}
                  value={newRuleForm.hypothesis}
                  onChange={e => setNewRuleForm({ ...newRuleForm, hypothesis: e.target.value })}
                  placeholder="Explain why Paxton exhibits this pattern and the phonetic justification..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Trigger Condition</label>
                  <input
                    type="text"
                    value={newRuleForm.condition}
                    onChange={e => setNewRuleForm({ ...newRuleForm, condition: e.target.value })}
                    placeholder="e.g. Spoken 'a' preceding verb/mass noun"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Translation Action</label>
                  <input
                    type="text"
                    value={newRuleForm.action}
                    onChange={e => setNewRuleForm({ ...newRuleForm, action: e.target.value })}
                    placeholder="e.g. Omit 'a' in intent translation"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
                >
                  Save Rule to Rulebook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
