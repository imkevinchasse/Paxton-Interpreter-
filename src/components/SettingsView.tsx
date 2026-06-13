import { useState, useEffect } from 'react';
import { type AppSettings } from '../types';
import { Server, HardDrive, RefreshCw } from 'lucide-react';

export function SettingsView() {
  const [settings, setSettings] = useState<AppSettings>({
    ollamaEndpoint: '',
    llamaModel: '',
    llamaInterpreterModel: '',
    llamaDictionaryModel: '',
    whisperEndpoint: '',
    trainingEpochs: 10,
    trainingLR: '1e-5',
    trainingBatchSize: 4
  });
  const [saved, setSaved] = useState(false);
  const [storageDisabled, setStorageDisabled] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(setSettings).catch(console.error);
    fetch('/api/settings/storage').then(res => res.json()).then(data => setStorageDisabled(data.disabled)).catch(console.error);
  }, []);

  const handleSave = async () => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleStorage = async () => {
    const val = !storageDisabled;
    setStorageDisabled(val);
    try {
      await fetch('/api/settings/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: val })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSyncModels = async () => {
    setSyncing(true);
    try {
      await fetch('/api/sync-models', { method: 'POST' });
      alert('Models synchronized successfully with remote host.');
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2"><Server className="w-6 h-6 text-indigo-600" /> Platform Configuration</h2>
        <p className="text-slate-500 text-sm">Configure routing endpoints, storage persistence, and remote node syncing.</p>
      </div>

      <div className="grid gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm xl uppercase tracking-wider flex items-center gap-2"><HardDrive className="w-4 h-4" /> Node Storage</h3>
                <p className="text-xs text-slate-500 mt-1">When running on lightweight devices (e.g. Raspberry Pi Zero), you can disable local disk writing. All data will be kept in memory.</p>
              </div>
              <button 
                onClick={toggleStorage}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${storageDisabled ? 'bg-red-500' : 'bg-emerald-500'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${storageDisabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
               <div>
                  <h3 className="font-bold text-slate-800 text-sm xl uppercase tracking-wider">Remote Sync (Pull Updates)</h3>
                  <p className="text-xs text-slate-500 mt-1">If this is a headless node (Raspberry Pi), pull optimized models from your main host.</p>
               </div>
               <button 
                 onClick={handleSyncModels}
                 disabled={syncing}
                 className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-bold rounded-lg transition-colors text-xs cursor-pointer shadow-sm disabled:opacity-50"
               >
                 <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing...' : 'Sync Now'}
               </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
          <div className="space-y-4">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Ollama Settings</h3>
            
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Ollama Endpoint URL</label>
              <input 
                type="text" 
                value={settings.ollamaEndpoint}
                onChange={e => setSettings({ ...settings, ollamaEndpoint: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 transition-all text-sm font-mono shadow-inner"
                placeholder="http://localhost:11434"
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Interpreter LLM Model Name</label>
                <input 
                  type="text" 
                  list="ollama-models"
                  value={settings.llamaInterpreterModel || settings.llamaModel || ''}
                  onChange={e => setSettings({ ...settings, llamaInterpreterModel: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 transition-all text-sm font-mono shadow-inner"
                  placeholder="llama3"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Dictionary Builder LLM Model Name</label>
                <input 
                  type="text" 
                  list="ollama-models"
                  value={settings.llamaDictionaryModel || settings.llamaModel || ''}
                  onChange={e => setSettings({ ...settings, llamaDictionaryModel: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 transition-all text-sm font-mono shadow-inner"
                  placeholder="llama3"
                />
              </div>
              
              <datalist id="ollama-models">
                <option value="llama3" />
                <option value="gemma:2b" />
                <option value="gemma:4b" />
                <option value="gemma:7b" />
                <option value="phi3" />
                <option value="mistral" />
                <option value="qwen:1.8b" />
                <option value="qwen:4b" />
                <option value="llama3:instruct-q4" />
                <option value="gemma:2b-instruct-q4" />
              </datalist>
              <p className="text-xs text-slate-400 mt-2">
                 Assign different models. e.g. A fast lightweight model for Interpreter and a larger smarter model for Dictionary Builder.
              </p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Whisper Fine-Tuning Hyperparameters</h3>
            <p className="text-xs text-slate-500">Tune the fallback Python training job when you process &gt;10 datasets</p>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
               <div className="space-y-2">
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Epochs</label>
                 <input 
                   type="number" 
                   value={settings.trainingEpochs || ''}
                   onChange={e => setSettings({ ...settings, trainingEpochs: parseInt(e.target.value) || 10 })}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 text-sm font-mono shadow-inner"
                 />
               </div>
               <div className="space-y-2">
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Learn Rate (LR)</label>
                 <input 
                   type="text" 
                   value={settings.trainingLR || ''}
                   onChange={e => setSettings({ ...settings, trainingLR: e.target.value })}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 text-sm font-mono shadow-inner"
                   placeholder="1e-5"
                 />
               </div>
               <div className="space-y-2">
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Batch Size</label>
                 <input 
                   type="number" 
                   value={settings.trainingBatchSize || ''}
                   onChange={e => setSettings({ ...settings, trainingBatchSize: parseInt(e.target.value) || 8 })}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 text-sm font-mono shadow-inner"
                 />
               </div>
               <div className="space-y-2">
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Transcript Mode</label>
                 <select
                   value={settings.trainingMode || 'phonetic'}
                   onChange={e => setSettings({ ...settings, trainingMode: e.target.value })}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 text-sm font-mono shadow-inner"
                 >
                   <option value="phonetic">Phonetic</option>
                   <option value="english">English</option>
                 </select>
               </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Whisper STT Settings</h3>
            
            <div className="space-y-4">
               <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Speaker Isolation / Voice Profile</h3>
                    <p className="text-xs text-slate-500 mt-1">Differentiate voices. Isolates target voice and removes cross-talk/interruptions from others. Preserves loud/rough voice variations of the target.</p>
                  </div>
                  <button 
                    onClick={() => setSettings(s => ({ ...s, speakerIsolationEnabled: !s.speakerIsolationEnabled }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.speakerIsolationEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.speakerIsolationEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
               </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Whisper Gateway URL</label>
              <input 
                 type="text" 
                 value={settings.whisperEndpoint}
                 onChange={e => setSettings({ ...settings, whisperEndpoint: e.target.value })}
                 className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 transition-all text-sm font-mono shadow-inner"
                 placeholder="http://localhost:8080"
              />
              <p className="text-xs text-slate-400 mt-2">
                 Local access: <code>localhost:8080</code> | Remote access (off-device): <code>&lt;YOUR_IP&gt;:8080</code>
              </p>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <span className="text-xs text-emerald-600 font-bold transition-opacity duration-300" style={{ opacity: saved ? 1 : 0 }}>
              Settings Saved!
            </span>
            <button 
               onClick={handleSave}
               className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-md text-sm cursor-pointer"
            >
               Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
