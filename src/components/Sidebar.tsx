import { type Interaction, type ViewState } from '../types';
import { Settings, Mic2, Database, Activity, FileAudio, Volume2, Trash2, BookA } from 'lucide-react';

interface SidebarProps { 
  interactions: Interaction[];
  currentView: ViewState;
  onViewChange: (v: ViewState) => void;
  onDelete: (id: string) => void;
}

export function Sidebar({ interactions, currentView, onViewChange, onDelete }: SidebarProps) {
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <aside className="w-72 bg-slate-50 border-r border-slate-200 flex flex-col h-full z-10 relative shrink-0">
      <div className="p-4 border-b border-slate-200 bg-white shadow-sm z-10 flex flex-col gap-1">
        <h2 className="font-sans font-bold text-slate-800 text-sm uppercase tracking-wider mb-2 mt-2">Navigation</h2>

        
        <div className="flex flex-col gap-2">
          <button 
            onClick={() => onViewChange('interpreter')}
            className={`flex items-center gap-3 p-3 rounded-lg text-sm font-medium transition-colors ${
              currentView === 'interpreter' 
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' 
                : 'text-slate-600 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Activity className="w-4 h-4" /> Live Interpreter
          </button>
          
          <button 
            onClick={() => onViewChange('training')}
            className={`flex items-center gap-3 p-3 rounded-lg text-sm font-medium transition-colors ${
              currentView === 'training' 
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' 
                : 'text-slate-600 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Database className="w-4 h-4" /> Intended Words
          </button>

          <button 
            onClick={() => onViewChange('audiobank')}
            className={`flex items-center gap-3 p-3 rounded-lg text-sm font-medium transition-colors ${
              currentView === 'audiobank' 
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' 
                : 'text-slate-600 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <FileAudio className="w-4 h-4" /> Audio Pipeline
          </button>
          
          <button 
            onClick={() => onViewChange('dictionary')}
            className={`flex items-center gap-3 p-3 rounded-lg text-sm font-medium transition-colors ${
              currentView === 'dictionary' 
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' 
                : 'text-slate-600 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <BookA className="w-4 h-4" /> Dictionary
          </button>
          
          <button 
            onClick={() => onViewChange('settings')}
            className={`flex items-center gap-3 p-3 rounded-lg text-sm font-medium transition-colors ${
              currentView === 'settings' 
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' 
                : 'text-slate-600 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Settings className="w-4 h-4" /> Model Settings
          </button>
        </div>
      </div>

      <div className="p-4 border-b border-slate-200 bg-slate-50 relative mt-4">
        <h2 className="font-sans font-bold text-slate-500 text-xs uppercase tracking-wider mb-1">Said Input</h2>
        <p className="text-xs text-slate-500 font-mono">Recent Interactions: {interactions.length}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {interactions.length === 0 && (
          <div className="text-center text-slate-400 font-mono text-sm mt-4 border border-slate-200 border-dashed rounded-xl p-6 shadow-sm bg-white">
            No history yet.
          </div>
        )}
        {interactions.map(interaction => (
          <div key={interaction.id} className="bg-white rounded-xl p-4 text-sm border border-slate-200 hover:border-indigo-300 transition-colors shadow-sm group">
            <div className="flex justify-between items-start mb-3">
              <span className="font-mono text-[10px] text-slate-400 uppercase tracking-widest">
                {(new Date(interaction.timestamp)).toLocaleTimeString()}
              </span>
              <div className="flex gap-1 items-center">
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider
                  ${interaction.mode === 'auto' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 
                    interaction.mode === 'choice' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 
                    'bg-red-100 text-red-700 border border-red-200'}`}>
                  {interaction.mode}
                </span>
                <button
                  onClick={() => onDelete(interaction.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all p-0.5 ml-1"
                  title="Delete Interaction"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex gap-2 items-start justify-between">
              <p className="text-slate-800 text-base font-medium leading-tight">"{interaction.finalText}"</p>
              <button 
                 onClick={() => speakText(interaction.finalText)}
                 className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                 title="Speak meaning"
              >
                 <Volume2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100">
              <span className="text-slate-500 text-xs font-mono">Conf: {(interaction.final_confidence * 100).toFixed(1)}%</span>
              {interaction.selectedId && (
                <span className="text-slate-600 text-xs font-mono bg-slate-50 px-2 py-1 rounded border border-slate-200">Opt {interaction.selectedId}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
