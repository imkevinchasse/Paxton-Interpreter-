import { useState, useEffect } from 'react';
import { type AppSettings } from '../types';
import { Server, HardDrive, RefreshCw } from 'lucide-react';

export function SettingsView() {
  const [settings, setSettings] = useState<AppSettings>({
    ollamaEndpoint: '',
    llamaModel: '',
    whisperEndpoint: ''
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
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Ollama Settings (Llama 3)</h3>
            
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

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Llama Model Name</label>
              <input 
                type="text" 
                value={settings.llamaModel}
                onChange={e => setSettings({ ...settings, llamaModel: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 transition-all text-sm font-mono shadow-inner"
                placeholder="llama3"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Whisper STT Settings</h3>
            
            <div className="space-y-2">
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
