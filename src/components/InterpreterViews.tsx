import { type PipelineResult, type MultiPhaseInterpretation } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Check, 
  X, 
  ListCollapse, 
  Activity, 
  Volume2, 
  Sparkles, 
  BookOpen, 
  Layers, 
  ChevronDown, 
  ChevronUp, 
  ArrowRight,
  HelpCircle,
  Database,
  Sliders,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import React, { useState, useEffect } from 'react';

const playDing = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.3);
  } catch(e) {}
};

export const speakWithVoiceModel = (text: string) => {
  if (!text) return;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95; // Slightly measured pace for clear assistive feedback
    utterance.pitch = 1.0;
    
    // Pick an English voice if available
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Google') || v.name.includes('Alex')));
    if (naturalVoice) {
      utterance.voice = naturalVoice;
    }
    window.speechSynthesis.speak(utterance);
  }
};

export function ProcessingView() {
  const [activeStep, setActiveStep] = useState(1);

  useEffect(() => {
    const timer1 = setTimeout(() => setActiveStep(2), 500);
    const timer2 = setTimeout(() => setActiveStep(3), 1000);
    const timer3 = setTimeout(() => setActiveStep(4), 1500);
    const timer4 = setTimeout(() => setActiveStep(5), 2000);
    const timer5 = setTimeout(() => setActiveStep(6), 2500);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
    };
  }, []);

  const phases = [
    { step: 1, label: "Phase 1A: Whisper Phonetic Acoustic Capture" },
    { step: 2, label: "Phase 1B: Fine-Tuned Mini LLM Initial Semantic Assumption" },
    { step: 3, label: "Phase 2: Full Contextual Reasoning & Planning" },
    { step: 4, label: "Phase 3: Grammar Rulebook Deep Search & Transformation" },
    { step: 5, label: "Phase 4: Context & Dictionary Cross-Referencing & Scoring" },
    { step: 6, label: "Phase 5: Voice Model Output Synthesis" },
  ];

  return (
    <div className="flex flex-col items-center justify-center space-y-8 max-w-md mx-auto p-6">
      <div className="relative w-28 h-28 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
          className="absolute inset-0 rounded-full border-2 border-dashed border-indigo-400 opacity-60"
        />
        <motion.div 
          animate={{ rotate: -360 }} 
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="absolute inset-2 rounded-full border-2 border-indigo-500 border-t-transparent"
        />
        <Activity className="w-8 h-8 text-indigo-600 animate-pulse" />
      </div>

      <div className="w-full space-y-2.5">
        <p className="text-center font-mono text-indigo-600 text-xs font-bold uppercase tracking-widest mb-3">
          Executing Multi-Phase Interpreter Pipeline
        </p>
        {phases.map((p) => {
          const isDone = activeStep > p.step;
          const isCurrent = activeStep === p.step;
          return (
            <motion.div
              key={p.step}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-mono transition-all ${
                isCurrent 
                  ? 'bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold shadow-xs' 
                  : isDone 
                    ? 'bg-emerald-50/50 text-emerald-800 border border-emerald-100 font-medium'
                    : 'text-slate-400 bg-slate-50/50'
              }`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold ${
                isCurrent 
                  ? 'bg-indigo-600 text-white animate-pulse' 
                  : isDone 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-slate-200 text-slate-500'
              }`}>
                {isDone ? '✓' : p.step}
              </div>
              <span className="truncate">{p.label}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Multi-Phase Pipeline Inspector & Accordion Card
// ─────────────────────────────────────────────────────────────
export function MultiPhasePipelineViewer({ result }: { result: PipelineResult }) {
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  const phases = result.phases;
  if (!phases) return null;

  const togglePhase = (phaseKey: string) => {
    setExpandedPhase(expandedPhase === phaseKey ? null : phaseKey);
  };

  const phase1A = phases.phase1A || phases.phase1;
  const phase1B = phases.phase1B;

  const usage = result.usage;
  const sourceLabel: Record<string, string> = {
    verified_pair: 'Matched a verified pair',
    dictionary_rules: 'Dictionary + rulebook',
    llm_assisted: 'Dictionary + rulebook + language model',
    llm_only: 'Language model only (nothing in the dictionary or rulebook matched)',
    unmatched: 'No dictionary or rule match'
  };

  return (
    <div className="w-full bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3 text-left">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-600" />
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
            Multi-Phase Interpreter Pipeline Breakdown
          </span>
        </div>
        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
          {usage ? sourceLabel[usage.source] || usage.source : 'Pipeline'}
        </span>
      </div>

      {usage && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
            {usage.dictionaryEntriesUsed} dictionary {usage.dictionaryEntriesUsed === 1 ? 'entry' : 'entries'} used
          </span>
          <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
            {usage.rulesApplied} grammar {usage.rulesApplied === 1 ? 'rule' : 'rules'} applied
          </span>
          <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
            {Math.round(usage.coverage * 100)}% of words explained
          </span>
          {usage.draftOverrodeModel && (
            <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800">
              Dictionary overrode the language model
            </span>
          )}
        </div>
      )}

      <div className="space-y-2">
        {/* Phase 1A: Whisper Phonetic Equivalent */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => togglePhase('1A')}
            className="w-full px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 text-left transition cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                1A
              </span>
              <div>
                <div className="text-xs font-bold text-slate-800 font-mono">
                  Phase 1A: Whisper Phonetic Acoustic Capture
                </div>
                <div className="text-[11px] text-slate-500 font-mono truncate max-w-sm">
                  Heard: &ldquo;{phase1A?.phoneticTranscript || result.whisper_guess}&rdquo;
                </div>
              </div>
            </div>
            {expandedPhase === '1A' ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedPhase === '1A' && (
            <div className="px-3.5 pb-3 pt-1 border-t border-slate-100 text-xs text-slate-600 space-y-2 bg-slate-50/40 font-mono">
              <p>Raw acoustic phonetics transcribed by fine-tuned Whisper model.</p>
              <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-slate-800 font-bold">
                &ldquo;{phase1A?.phoneticTranscript || result.whisper_guess}&rdquo;
              </div>
            </div>
          )}
        </div>

        {/* Phase 1B: Fine-Tuned Mini LLM Initial Semantic Assumption */}
        {phase1B && (
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <button
              onClick={() => togglePhase('1B')}
              className="w-full px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 text-left transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                  1B
                </span>
                <div>
                  <div className="text-xs font-bold text-slate-800 font-mono flex items-center gap-2">
                    <span>Phase 1B: Fine-Tuned Mini LLM Semantic Assumption</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 bg-violet-50 text-violet-700 border border-violet-200 rounded font-mono">
                      Fast 1st-Pass
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono truncate max-w-sm">
                    Initial Guess: &ldquo;{phase1B.initialAssumption}&rdquo;
                  </div>
                </div>
              </div>
              {expandedPhase === '1B' ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {expandedPhase === '1B' && (
              <div className="px-3.5 pb-3 pt-1 border-t border-slate-100 text-xs text-slate-600 space-y-2 bg-slate-50/40 font-mono">
                <p className="text-[11px] text-slate-600">{phase1B.reasoning}</p>
                <div className="p-2.5 bg-white rounded-lg border border-violet-200 text-violet-900 font-bold">
                  Assumption: &ldquo;{phase1B.initialAssumption}&rdquo;
                </div>
                <div className="text-[10px] text-slate-500">
                  Model: <span className="font-semibold text-slate-700">{phase1B.miniModelUsed}</span> • Confidence: {(phase1B.confidence * 100).toFixed(0)}%
                </div>
                {phase1B.learnedPairsMatched && phase1B.learnedPairsMatched.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Matched Paxton Training Pairs:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {phase1B.learnedPairsMatched.map((p, i) => (
                        <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-white border border-slate-200 text-slate-700">
                          &ldquo;{p.sound}&rdquo; → &ldquo;{p.meaning}&rdquo;
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Phase 2: Larger Primary LLM Contextual Reasoning & Planning */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => togglePhase('2')}
            className="w-full px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 text-left transition cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <div className="text-xs font-bold text-slate-800 font-mono">
                  Phase 2: Larger LLM Reasoning &amp; Strategy Plan
                </div>
                <div className="text-[11px] text-slate-500 font-mono truncate max-w-sm">
                  Synthesizing Phase 1A phonetics + Phase 1B assumption
                </div>
              </div>
            </div>
            {expandedPhase === '2' ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedPhase === '2' && (
            <div className="px-3.5 pb-3 pt-1 border-t border-slate-100 text-xs text-slate-600 space-y-2 bg-slate-50/40">
              <p className="text-slate-600 font-mono text-[11px]">{phases.phase2.reasoning}</p>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block font-mono mb-1">
                  Identified Atypical Speech Features:
                </span>
                <div className="flex flex-wrap gap-1">
                  {phases.phase2.identifiedAtypicalFeatures.map((f, i) => (
                    <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-amber-50 text-amber-800 border border-amber-200 font-mono">
                      • {f}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block font-mono mb-1">
                  Formulated Analytical Steps:
                </span>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-600 font-mono">
                  {phases.phase2.nextStepsPlanned.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Phase 3: Grammar Rulebook Deep Search */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => togglePhase('3')}
            className="w-full px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 text-left transition cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                3
              </span>
              <div>
                <div className="text-xs font-bold text-slate-800 font-mono flex items-center gap-2">
                  <span>Phase 3: Grammar Rulebook Deep Search</span>
                  {phases.phase3.appliedRules.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                      {phases.phase3.appliedRules.length} Rule(s) Applied
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 font-mono truncate max-w-sm">
                  Transformed: &ldquo;{phases.phase3.ruleTransformedText}&rdquo;
                </div>
              </div>
            </div>
            {expandedPhase === '3' ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedPhase === '3' && (
            <div className="px-3.5 pb-3 pt-1 border-t border-slate-100 text-xs text-slate-600 space-y-2 bg-slate-50/40">
              <p className="font-mono text-[11px]">{phases.phase3.reasoning}</p>
              {phases.phase3.appliedRules.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block font-mono">
                    Confirmed Grammar Rules Fired:
                  </span>
                  {phases.phase3.appliedRules.map((r, i) => (
                    <div key={i} className="p-2 bg-white rounded-lg border border-emerald-200 text-[11px] font-mono space-y-0.5">
                      <div className="font-bold text-emerald-800">{r.ruleName}</div>
                      <div className="text-slate-600">Action: <span className="text-slate-800 font-semibold">{r.action}</span></div>
                      <div className="text-slate-500 text-[10px]">Hypothesis: {r.reason}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 font-mono italic">
                  No structural transformation rules needed for this phrase.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Phase 4: Prior Context & Dictionary Cross-Referencing */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => togglePhase('4')}
            className="w-full px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 text-left transition cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                4
              </span>
              <div>
                <div className="text-xs font-bold text-slate-800 font-mono flex items-center gap-2">
                  <span>Phase 4: Prior Context &amp; Dictionary Matching</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                    phases.phase4.isLowCertainty 
                      ? 'bg-amber-50 text-amber-800 border-amber-200' 
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}>
                    {(phases.phase4.confidenceScore * 100).toFixed(0)}% Certainty
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono truncate max-w-sm">
                  Refined: &ldquo;{phases.phase4.refinedAssumption}&rdquo;
                </div>
              </div>
            </div>
            {expandedPhase === '4' ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedPhase === '4' && (
            <div className="px-3.5 pb-3 pt-1 border-t border-slate-100 text-xs text-slate-600 space-y-2 bg-slate-50/40">
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[9px] uppercase font-bold">Location &amp; Time</span>
                  <span className="font-semibold text-slate-700">{phases.phase4.priorContextUsed.location || 'Home'} • {phases.phase4.priorContextUsed.time || 'Current'}</span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[9px] uppercase font-bold">Threshold Gating</span>
                  <span className="font-semibold text-slate-700">
                    Threshold: {(phases.phase4.threshold * 100).toFixed(0)}% ({phases.phase4.isLowCertainty ? 'Clarification Required' : 'Certainty Pass'})
                  </span>
                </div>
              </div>
              {phases.phase4.matchedDictionaryEntries.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block font-mono">
                    Dictionary Match:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {phases.phase4.matchedDictionaryEntries.map((d, i) => (
                      <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                        {d.word} → {d.definition}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Phase 5: Voice Model Output */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => togglePhase('5')}
            className="w-full px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 text-left transition cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                5
              </span>
              <div>
                <div className="text-xs font-bold text-slate-800 font-mono">
                  Phase 5: Voice Model Output (Speech Synthesis)
                </div>
                <div className="text-[11px] text-slate-500 font-mono truncate max-w-sm">
                  Spoken Output: &ldquo;{phases.phase5.spokenText}&rdquo;
                </div>
              </div>
            </div>
            {expandedPhase === '5' ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedPhase === '5' && (
            <div className="px-3.5 pb-3 pt-1 border-t border-slate-100 text-xs text-slate-600 space-y-2 bg-slate-50/40 font-mono flex items-center justify-between">
              <div>
                <div className="text-slate-800 font-bold">&ldquo;{phases.phase5.spokenText}&rdquo;</div>
                <div className="text-[10px] text-slate-400">Engine: {phases.phase5.voiceEngine}</div>
              </div>
              <button
                onClick={() => speakWithVoiceModel(phases.phase5.spokenText)}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" /> Replay
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Feedback Dialog Component (Add to Grammar Rulebook OR Dictionary)
// ─────────────────────────────────────────────────────────────
function ClarificationFeedbackModal({ 
  originalSpoken, 
  defaultIntended,
  onClose,
  onSaved
}: {
  originalSpoken: string;
  defaultIntended: string;
  onClose: () => void;
  onSaved: (intended: string) => void;
}) {
  const [intended, setIntended] = useState(defaultIntended || '');
  const [notes, setNotes] = useState('');
  const [target, setTarget] = useState<'auto' | 'rulebook' | 'dictionary'>('auto');
  const [patternType, setPatternType] = useState<string>('consonant_deletion');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!intended.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/interpreter/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalSpoken,
          intendedMeaning: intended.trim(),
          notes: notes.trim(),
          target,
          patternType
        })
      });
      const data = await res.json();
      if (data.success) {
        setSubmitSuccess(data.message || 'Saved successfully!');
        // Speak corrected text via Voice Model (Phase 5)
        speakWithVoiceModel(intended.trim());
        setTimeout(() => {
          onSaved(intended.trim());
        }, 1200);
      }
    } catch (err) {
      console.error(err);
      // Fallback: still confirm and speak
      speakWithVoiceModel(intended.trim());
      onSaved(intended.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden relative"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Add Information &amp; Teach Model</h3>
              <p className="text-xs text-slate-500 font-mono">Paxton said: &ldquo;{originalSpoken}&rdquo;</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitSuccess ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-800">Thank you! Model Updated</h4>
            <p className="text-xs text-slate-500 font-mono max-w-sm mx-auto">{submitSuccess}</p>
            <p className="text-xs text-indigo-600 font-bold font-mono">Speaking translation aloud...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-left">
            <div>
              <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                What did Paxton actually mean? *
              </label>
              <input
                type="text"
                required
                value={intended}
                onChange={e => setIntended(e.target.value)}
                placeholder="e.g. I need help, I want to play..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 font-medium focus:outline-none focus:border-indigo-500 shadow-inner"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Linguistic Notes or Speech Pattern (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Drops the terminal 'd' in 'need', inserts 'a' before help..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 font-mono placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 shadow-inner resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-2">
                Where should this knowledge be added?
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTarget('auto')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    target === 'auto'
                      ? 'border-indigo-500 bg-indigo-50/50 text-indigo-900 font-bold'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-xs font-mono font-bold">Auto-Detect</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Smart AI routing</div>
                </button>
                <button
                  type="button"
                  onClick={() => setTarget('rulebook')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    target === 'rulebook'
                      ? 'border-indigo-500 bg-indigo-50/50 text-indigo-900 font-bold'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-xs font-mono font-bold flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-600" /> Rulebook
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">For LLM testing</div>
                </button>
                <button
                  type="button"
                  onClick={() => setTarget('dictionary')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    target === 'dictionary'
                      ? 'border-indigo-500 bg-indigo-50/50 text-indigo-900 font-bold'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-xs font-mono font-bold flex items-center gap-1">
                    <Database className="w-3.5 h-3.5 text-indigo-600" /> Dictionary
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Direct mapping</div>
                </button>
              </div>
            </div>

            {target === 'rulebook' && (
              <div>
                <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Pattern Type
                </label>
                <select
                  value={patternType}
                  onChange={e => setPatternType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-700"
                >
                  <option value="consonant_deletion">Consonant Deletion (Dropped /d/, /t/, etc.)</option>
                  <option value="intrusive_article">Intrusive Article (Drops or inserts 'a')</option>
                  <option value="word_merging">Word Merging / Compound Contraction</option>
                  <option value="vowel_reduction">Vowel Reduction / Alteration</option>
                  <option value="custom">Custom Linguistic Phenomenon</option>
                </select>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !intended.trim()}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-40 flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Activity className="w-4 h-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Save &amp; Speak Output
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Low Confidence / Clarification View ("Did you mean ____?")
// ─────────────────────────────────────────────────────────────
export function LowConfidenceView({ 
  result, 
  onSubmit 
}: { 
  result: PipelineResult; 
  onSubmit: (text: string) => void;
}) {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const bestGuess = result.candidates[0]?.text || result.didYouMeanPrompt || "I need help";

  useEffect(() => {
    playDing();
  }, []);

  const handleYes = () => {
    // Phase 5: Voice model speaks final output!
    speakWithVoiceModel(bestGuess);
    onSubmit(bestGuess);
  };

  const handleNo = () => {
    setShowFeedbackModal(true);
  };

  const handleCandidateSelect = (text: string) => {
    speakWithVoiceModel(text);
    onSubmit(text);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl mx-auto space-y-5">
      {/* Low Certainty Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-800 font-mono text-xs uppercase tracking-widest font-bold shadow-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>Low Certainty / {(result.final_confidence * 100).toFixed(0)}% (Below 78% Threshold)</span>
        </div>
        <p className="text-xs font-mono text-slate-500">
          Whisper heard: <span className="font-bold text-slate-700">&ldquo;{result.whisper_guess}&rdquo;</span>
        </p>
      </div>

      {/* Main "Did you mean ____?" Decision Card */}
      <div className="bg-white border-2 border-indigo-200 rounded-3xl p-7 shadow-lg relative overflow-hidden space-y-6 text-center">
        <div className="space-y-2">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-600 block">
            Interpreter Verification Check
          </span>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Did you mean &ldquo;<span className="text-indigo-600">{bestGuess}</span>&rdquo;?
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto font-mono">
            Certainty is {(result.final_confidence * 100).toFixed(0)}%. Confirm if this matches Paxton&apos;s intent, or provide a quick correction.
          </p>
        </div>

        {/* Big Yes and No Action Buttons */}
        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto pt-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleYes}
            className="py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 shadow-md shadow-emerald-500/20 transition cursor-pointer"
          >
            <Check className="w-5 h-5" />
            <span>Yes, that&apos;s it</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleNo}
            className="py-4 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition cursor-pointer"
          >
            <X className="w-5 h-5 text-red-500" />
            <span>No, correct it</span>
          </motion.button>
        </div>

        {/* Optional quick candidate alternatives if any */}
        {result.candidates.length > 1 && (
          <div className="pt-3 border-t border-slate-100">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Or did he mean one of these?
            </span>
            <div className="flex flex-wrap justify-center gap-2">
              {result.candidates.slice(1).map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleCandidateSelect(c.text)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 text-slate-700 text-xs font-mono transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="font-bold text-indigo-600">{c.id}:</span>
                  <span>&ldquo;{c.text}&rdquo;</span>
                  <span className="text-[10px] text-slate-400">({(c.probability * 100).toFixed(0)}%)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Phase 5 Voice Preview button */}
        <div className="pt-2 flex justify-center">
          <button
            onClick={() => speakWithVoiceModel(bestGuess)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 font-mono transition"
          >
            <Volume2 className="w-4 h-4 text-indigo-500" />
            <span>Preview voice synthesis (Phase 5)</span>
          </button>
        </div>
      </div>

      {/* 5-Phase Pipeline Inspection Accordion */}
      <MultiPhasePipelineViewer result={result} />

      {/* Feedback Modal for No / Correction */}
      <AnimatePresence>
        {showFeedbackModal && (
          <ClarificationFeedbackModal
            originalSpoken={result.whisper_guess}
            defaultIntended={bestGuess}
            onClose={() => setShowFeedbackModal(false)}
            onSaved={(correctedText) => {
              setShowFeedbackModal(false);
              onSubmit(correctedText);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// High Confidence View (Certainty >= 85%)
// ─────────────────────────────────────────────────────────────
export function HighConfidenceView({ 
  result, 
  onDone 
}: { 
  result: PipelineResult; 
  onDone: (text: string) => void;
}) {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const bestIntent = result.candidates[0]?.text || '';

  // Phase 5: Voice model speaks final output automatically
  useEffect(() => {
    if (bestIntent) {
      speakWithVoiceModel(bestIntent);
    }
  }, [bestIntent]);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center w-full max-w-xl mx-auto space-y-5">
      <div className="bg-white border border-slate-200 rounded-3xl p-8 w-full text-center space-y-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"></div>
        
        <div className="w-16 h-16 bg-emerald-50 border-2 border-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2 shadow-xs">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-left space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
              🎙️ Phase 1: Whisper Acoustic Phonetics
            </span>
            <p className="text-sm font-mono text-slate-700 font-semibold">&ldquo;{result.whisper_guess}&rdquo;</p>
          </div>

          <div className="space-y-1 pt-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-mono font-bold">
              <span>Phase 5: Voice Model Output (Decoded Intent)</span>
            </div>
            <p className="text-3xl font-extrabold text-slate-900 tracking-tight pt-2">
              &ldquo;{bestIntent}&rdquo;
            </p>
          </div>

          {/* Applied Grammar Rules Pills */}
          {result.appliedRules && result.appliedRules.length > 0 && (
            <div className="p-3 bg-emerald-50/50 border border-emerald-200/80 rounded-2xl text-left space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block font-mono flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                Phase 3 Grammar Rulebook Applied ({result.appliedRules.length}):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {result.appliedRules.map((ar, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white text-emerald-900 border border-emerald-200 shadow-2xs font-mono">
                    {ar.ruleName}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-center gap-3 pt-2">
            <button 
               onClick={() => speakWithVoiceModel(bestIntent)}
               className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold font-mono uppercase tracking-wider text-slate-700 transition cursor-pointer shadow-xs"
            >
               <Volume2 className="w-4 h-4 text-indigo-600" /> Replay Voice Model
            </button>
            <button 
               onClick={() => setShowFeedbackModal(true)}
               className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs text-slate-500 hover:text-slate-700 font-mono transition cursor-pointer"
            >
               <HelpCircle className="w-3.5 h-3.5" /> Need adjustments?
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-center gap-8 font-mono text-xs text-slate-500 uppercase tracking-widest">
           <div>Certainty: <span className="text-emerald-600 font-bold">{(result.final_confidence * 100).toFixed(0)}%</span></div>
           <div>Mode: <span className="text-emerald-600 font-bold">{result.mode.toUpperCase()}</span></div>
        </div>
      </div>

      {/* 5-Phase Breakdown Accordion */}
      <MultiPhasePipelineViewer result={result} />

      <button 
        onClick={() => onDone(bestIntent)} 
        className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 shadow-md rounded-2xl text-xs font-bold uppercase tracking-wider transition text-white font-mono cursor-pointer"
      >
        Confirm &amp; Log Interpretation
      </button>

      {/* Feedback Modal for Manual Correction */}
      <AnimatePresence>
        {showFeedbackModal && (
          <ClarificationFeedbackModal
            originalSpoken={result.whisper_guess}
            defaultIntended={bestIntent}
            onClose={() => setShowFeedbackModal(false)}
            onSaved={(correctedText) => {
              setShowFeedbackModal(false);
              onDone(correctedText);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// Medium Confidence View (78% <= Certainty < 85%)
// ─────────────────────────────────────────────────────────────
export function MediumConfidenceView({ 
  result, 
  onSelect 
}: { 
  result: PipelineResult; 
  onSelect: (id: string | null, text: string) => void;
}) {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  useEffect(() => {
    playDing();
  }, []);

  const handleCandidateClick = (id: string, text: string) => {
    // Phase 5 Voice Output speaks selection
    speakWithVoiceModel(text);
    onSelect(id, text);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl px-4 mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-amber-800 font-mono text-xs uppercase tracking-widest font-bold shadow-xs">
          <ListCollapse className="w-3.5 h-3.5 text-amber-600" />
          <span>Medium Confidence / {(result.final_confidence * 100).toFixed(0)}%</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Select Best Intent Match</h2>
        <p className="text-slate-500 font-mono text-xs">Whisper heard: <span className="text-slate-800 font-bold">&ldquo;{result.whisper_guess}&rdquo;</span></p>
      </div>

      <div className="flex flex-col gap-3">
        {result.candidates.map((c) => (
          <button 
            key={c.id} 
            onClick={() => handleCandidateClick(c.id, c.text)}
            className="flex items-center p-4 rounded-2xl bg-white border border-slate-200 hover:border-indigo-500 transition-all shadow-xs text-left group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center font-mono text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-200 transition-colors shrink-0 font-bold">
              {c.id}
            </div>
            <div className="ml-4 flex-1 flex items-center gap-3">
              <span className="text-lg font-bold text-slate-800 group-hover:text-indigo-900 transition-colors">{c.text}</span>
              <div 
                 onClick={(e) => {
                   e.stopPropagation();
                   speakWithVoiceModel(c.text);
                 }}
                 className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                 title="Preview voice output"
              >
                 <Volume2 className="w-4 h-4" />
              </div>
            </div>
            <span className="font-mono text-slate-400 font-semibold bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
              {(c.probability * 100).toFixed(0)}%
            </span>
          </button>
        ))}

        <button 
          onClick={() => setShowFeedbackModal(true)}
          className="flex items-center p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-100 transition text-left cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 border-dashed flex items-center justify-center shrink-0">
             <Sparkles className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
          </div>
          <p className="ml-4 text-xs font-mono text-slate-500 group-hover:text-slate-700 font-medium">
            None of these match (Clarify &amp; add to Rulebook or Dictionary)
          </p>
        </button>
      </div>

      {/* 5-Phase Inspector Accordion */}
      <MultiPhasePipelineViewer result={result} />

      <AnimatePresence>
        {showFeedbackModal && (
          <ClarificationFeedbackModal
            originalSpoken={result.whisper_guess}
            defaultIntended={result.candidates[0]?.text || ''}
            onClose={() => setShowFeedbackModal(false)}
            onSaved={(correctedText) => {
              setShowFeedbackModal(false);
              onSelect(null, correctedText);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
