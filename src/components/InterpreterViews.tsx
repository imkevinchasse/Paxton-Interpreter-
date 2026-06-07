import { type PipelineResult } from '../types';
import { motion } from 'motion/react';
import { Check, X, ListCollapse, Activity, Volume2 } from 'lucide-react';
import { useState, useEffect } from 'react';

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

export function ProcessingView() {
  return (
    <div className="flex flex-col items-center justify-center space-y-8">
      <div className="relative w-32 h-32 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
          className="absolute inset-0 rounded-full border-t border-b border-indigo-400"
        />
        <motion.div 
          animate={{ rotate: -360 }} 
          transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
          className="absolute inset-2 rounded-full border-l border-r border-indigo-200"
        />
        <Activity className="w-8 h-8 text-indigo-600" />
      </div>
      <div className="text-center font-mono text-indigo-600 text-xs uppercase tracking-widest space-y-3 font-bold">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>1. Acoustic Extraction</motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>2. Vector Similarity Search</motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}>3. LLM Consensus Ranking</motion.p>
      </div>
    </div>
  );
}

export function HighConfidenceView({ result, onDone }: { result: PipelineResult, onDone: (text: string) => void }) {
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    speakText(result.candidates[0].text);
  }, [result.candidates]);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center w-full max-w-md">
      <div className="bg-white border border-slate-200 rounded-3xl p-10 w-full text-center space-y-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50"></div>
        <div className="w-20 h-20 bg-emerald-50 border-2 border-emerald-100 rounded-full flex items-center justify-center mx-auto mb-8 shadow-sm">
          <Check className="w-10 h-10 text-emerald-500" />
        </div>
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-emerald-600 font-mono text-xs uppercase tracking-[0.2em] font-bold">Consensus Established</h3>
            <p className="text-4xl font-medium text-slate-800 tracking-tight pt-2">{result.candidates[0].text}</p>
          </div>
          
          <button 
             onClick={() => speakText(result.candidates[0].text)}
             className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 transition-colors shadow-sm"
          >
             <Volume2 className="w-4 h-4" /> Speak Translation
          </button>
        </div>
        <div className="pt-6 mt-6 border-t border-slate-100 flex justify-center gap-6 font-mono text-xs text-slate-500 uppercase tracking-widest">
           <div>Conf: <span className="text-emerald-600 font-bold">{(result.final_confidence * 100).toFixed(1)}%</span></div>
           <div>Margin: <span className="text-emerald-600 font-bold">{((result.candidates[0].probability - (result.candidates[1]?.probability || 0))*100).toFixed(1)}%</span></div>
        </div>
      </div>
      <button onClick={() => onDone(result.candidates[0].text)} className="mt-8 px-8 py-3 bg-slate-800 border border-slate-800 hover:bg-slate-700 shadow-md rounded-xl text-sm font-medium transition-all text-white">
        Log Auto-Acceptance
      </button>
    </motion.div>
  );
}

export function MediumConfidenceView({ result, onSelect }: { result: PipelineResult, onSelect: (id: string | null, text: string) => void }) {
  useEffect(() => {
    playDing();
  }, []);

  const speakText = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl px-4">
      <div className="text-center mb-10 space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-100 border border-amber-200 rounded-full text-amber-700 font-mono text-xs uppercase tracking-widest mb-2 font-bold shadow-sm">
          <ListCollapse className="w-3.5 h-3.5" />
          <span>Medium Confidence / {(result.final_confidence * 100).toFixed(1)}%</span>
        </div>
        <h2 className="text-3xl font-medium tracking-tight text-slate-800">Select best match</h2>
        <p className="text-slate-500 font-mono text-sm max-w-md mx-auto">Hypothesis: <span className="text-slate-800 font-medium">"{result.whisper_guess}"</span></p>
      </div>
      
      <div className="flex flex-col gap-3">
        {result.candidates.map((c) => (
          <button 
            key={c.id} 
            onClick={() => onSelect(c.id, c.text)}
            className="flex items-center p-5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-500 transition-colors shadow-sm text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center font-mono text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-200 transition-colors shrink-0 font-bold">
              {c.id}
            </div>
            <div className="ml-5 flex-1 flex items-center gap-4">
              <span className="text-xl font-medium text-slate-800 transition-colors">{c.text}</span>
              <div 
                 onClick={(e) => speakText(e, c.text)}
                 className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                 title="Speak this option"
              >
                 <Volume2 className="w-5 h-5" />
              </div>
            </div>
            <span className="font-mono text-slate-400 font-medium bg-slate-50 px-3 py-1 rounded-lg border border-slate-200 text-sm">{(c.probability * 100).toFixed(0)}%</span>
          </button>
        ))}
        <button 
          onClick={() => onSelect(null, '')}
          className="flex items-center p-5 mt-2 rounded-2xl bg-slate-50 border border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-100 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 border-dashed flex items-center justify-center shrink-0">
             <div className="w-1.5 h-1.5 bg-slate-400 rounded-full group-hover:bg-slate-600"></div>
          </div>
          <p className="ml-5 text-slate-500 group-hover:text-slate-700 font-medium">None of these (Train new phrase)</p>
        </button>
      </div>
    </motion.div>
  );
}

export function LowConfidenceView({ result, onSubmit }: { result: PipelineResult, onSubmit: (text: string) => void }) {
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    playDing();
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl">
      <div className="text-center mb-10 space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-red-100 border border-red-200 rounded-full text-red-700 font-mono text-xs uppercase tracking-widest font-bold shadow-sm">
          <X className="w-3.5 h-3.5" />
          <span>Low Confidence / {(result.final_confidence * 100).toFixed(1)}%</span>
        </div>
        <h2 className="text-3xl font-medium tracking-tight text-slate-800">Clarification Required</h2>
        <p className="text-slate-500 font-mono text-sm leading-relaxed max-w-sm mx-auto">
          Consensus failed. Human review needed.<br/>
          Raw: <span className="text-slate-800 font-medium">"{result.whisper_guess}"</span>
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-8 space-y-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-30"></div>
        
        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-slate-400 font-bold mb-3">Guided Narrowing</label>
          <div className="flex flex-wrap gap-2">
            {['Food', 'Play', 'Sleep', 'Outside', 'Bathroom'].map(c => (
              <button key={c} onClick={() => setCustomText(customText + (customText ? ' ' : '') + c)} className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-sm hover:bg-slate-100 hover:border-slate-300 transition font-medium shadow-sm">
                + {c}
              </button>
            ))}
          </div>
        </div>
        
        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-slate-400 font-bold mb-3">Ground Truth Override</label>
          <input 
            type="text" 
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            placeholder="Type correct verified meaning..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-red-300 focus:ring-1 focus:ring-red-300 transition-all font-medium shadow-inner"
            autoFocus
          />
        </div>

        <button 
          onClick={() => onSubmit(customText || 'Unknown intent')}
          className="w-full py-4 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl transition-colors border border-red-200 tracking-wide shadow-sm"
        >
          Inject Override & Train Model
        </button>
      </div>
    </motion.div>
  );
}
