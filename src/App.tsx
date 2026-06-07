import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Microphone } from './components/Microphone';
import { ProcessingView, HighConfidenceView, MediumConfidenceView, LowConfidenceView } from './components/InterpreterViews';
import { SettingsView } from './components/SettingsView';
import { TrainingStudio } from './components/TrainingStudio';
import { AudioBankView } from './components/AudioBankView';
import { type Interaction, type PipelineResult, type ViewState } from './types';

export default function App() {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('interpreter');

  useEffect(() => {
    fetch('/api/interactions')
      .then(res => res.json())
      .then(setInteractions)
      .catch(console.error);
  }, []);

  const handleProcess = async (blob: Blob | null) => {
    setProcessing(true);
    setResult(null);

    const formData = new FormData();
    if (blob) {
      formData.append('audio', blob, blob.type === 'audio/mp4' ? 'audio.mp4' : 'audio.webm');
    } else {
      // Fallback tiny blob for API
      formData.append('audio', new Blob([''], { type: 'audio/webm' }), 'audio.webm'); 
    }

    try {
      const res = await fetch('/api/process-audio', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  const finalizeInteraction = async (finalText: string, selectedId: string | null) => {
    if (!result) return;
    
    // Save to DB
    const newInteraction: Partial<Interaction> = {
      ...result,
      selectedId,
      finalText
    };

    try {
      const res = await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newInteraction)
      });
      const saved = await res.json();
      setInteractions(prev => [saved, ...prev]);
    } catch (e) {
      console.error(e);
    }
    
    setResult(null);
  };

  return (
    <div className="flex h-screen bg-[#f0f2f5] text-[#1a1c1e] overflow-hidden font-sans">
      <Sidebar interactions={interactions} currentView={currentView} onViewChange={setCurrentView} />
      
      <main className="flex-1 flex flex-col relative z-0">
        <header className="h-16 px-8 flex items-center justify-between border-b border-slate-200 bg-white z-10 shrink-0">
          <div className="flex items-center space-x-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center relative">
                 <span className="w-4 h-4 border-2 border-white rounded-full border-t-transparent animate-pulse"></span>
              </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-800">
              PAXTON INTERPRETER <span className="text-indigo-600 font-mono text-sm ml-1">v1.0.4</span>
            </h1>
          </div>
          <div className="flex items-center space-x-6">
             <div className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-green-500"></span> 
               <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">System Live</span>
             </div>
          </div>
        </header>
        
        <div className="flex-1 flex flex-col items-center p-8 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-opacity-5 relative z-0 overflow-y-auto">
           {currentView === 'interpreter' && (
             <div className="w-full flex-1 flex flex-col items-center justify-center">
               { !result && !processing && <Microphone onProcess={handleProcess} /> }
               { processing && <ProcessingView /> }
               { result && result.mode === 'auto' && <HighConfidenceView result={result} onDone={(txt) => finalizeInteraction(txt, result.candidates[0].id)} /> }
               { result && result.mode === 'choice' && <MediumConfidenceView result={result} onSelect={(id, txt) => finalizeInteraction(txt, id)} /> }
               { result && result.mode === 'clarification' && <LowConfidenceView result={result} onSubmit={(txt) => finalizeInteraction(txt, null)} /> }
             </div>
           )}

           {currentView === 'training' && (
             <TrainingStudio />
           )}

           {currentView === 'audiobank' && (
             <AudioBankView />
           )}

           {currentView === 'settings' && (
             <SettingsView />
           )}
        </div>
      </main>
    </div>
  );
}
