import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { type AudioRecording } from '../types';
import { Mic, Upload, Scissors, CheckCircle, FileAudio, PlayCircle, Edit2, Trash2, X, Check } from 'lucide-react';
import { motion } from 'motion/react';

export function AudioBankView() {
  const [recordings, setRecordings] = useState<AudioRecording[]>([]);
  const [activeTab, setActiveTab] = useState<'unfinalized' | 'finalized'>('unfinalized');
  
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States for finalization form
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [sound, setSound] = useState('');
  const [meaning, setMeaning] = useState('');

  // States for renaming
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetch('/api/audio_bank').then(res => res.json()).then(setRecordings);
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this audio file?')) return;
    try {
      await fetch(`/api/audio_bank/${id}`, { method: 'DELETE' });
      setRecordings(recordings.filter(r => r.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleRename = async (id: string) => {
     if (!editName.trim()) return;
     try {
       const res = await fetch(`/api/audio_bank/${id}/rename`, {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ newName: editName })
       });
       if (res.ok) {
         setRecordings(recordings.map(r => r.id === id ? { ...r, filename: editName } : r));
         setEditingId(null);
       }
     } catch (e) {
       console.error(e);
     }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    
    const formData = new FormData();
    formData.append('audio', e.target.files[0]);
    
    try {
      const res = await fetch('/api/audio_bank/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setRecordings([{ ...data }, ...recordings]);
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleProcess = async (id: string) => {
    try {
      const res = await fetch(`/api/audio_bank/${id}/process`, { method: 'POST' });
      const data = await res.json();
      setRecordings(recordings.map(r => r.id === id ? data : r));
    } catch (e) {
      console.error(e);
    }
  };

  const handleFinalize = async (id: string) => {
    if (!sound || !meaning) return;
    try {
      const res = await fetch(`/api/audio_bank/${id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sound, meaning })
      });
      const data = await res.json();
      setRecordings(recordings.map(r => r.id === id ? data : r));
      setFinalizingId(null);
      setSound('');
      setMeaning('');
    } catch (e) {
      console.error(e);
    }
  };

  const unfinalized = recordings.filter(r => r.status === 'unprocessed' || r.status === 'processed');
  const finalized = recordings.filter(r => r.status === 'finalized');

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <FileAudio className="w-6 h-6 text-indigo-600" /> Audio Processing Pipeline
          </h2>
          <p className="text-slate-500 text-sm">
            Upload, auto-cut, and finalize raw audio files to incorporate them into Whisper's training dataset.
          </p>
        </div>
        
        <div>
          <input 
            type="file" 
            accept="audio/*" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition-colors shadow-md text-sm"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload Raw Audio'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button 
            onClick={() => setActiveTab('unfinalized')}
            className={`px-8 py-4 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'unfinalized' 
                ? 'border-indigo-600 text-indigo-600 bg-white' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            Unfinalized ({unfinalized.length})
          </button>
          <button 
            onClick={() => setActiveTab('finalized')}
            className={`px-8 py-4 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'finalized' 
                ? 'border-emerald-600 text-emerald-600 bg-white' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            Finalized & Trained ({finalized.length})
          </button>
        </div>

        <div className="p-6">
          <div className="space-y-4">
            {(activeTab === 'unfinalized' ? unfinalized : finalized).length === 0 && (
              <div className="text-center text-slate-400 font-mono text-sm py-12 border border-slate-200 border-dashed rounded-xl bg-slate-50">
                No audio recordings in this category.
              </div>
            )}

            {(activeTab === 'unfinalized' ? unfinalized : finalized).map((audio) => (
               <motion.div 
                 key={audio.id}
                 layout
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="flex flex-col sm:flex-row gap-4 p-4 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors bg-white shadow-sm"
               >
                 <div className="flex items-center justify-center w-12 h-12 bg-slate-100 text-slate-400 rounded-lg shrink-0">
                    {audio.status === 'unprocessed' && <Mic className="w-6 h-6" />}
                    {audio.status === 'processed' && <Scissors className="w-6 h-6 text-amber-500" />}
                    {audio.status === 'finalized' && <CheckCircle className="w-6 h-6 text-emerald-500" />}
                 </div>

                 <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      {editingId === audio.id ? (
                         <div className="flex items-center gap-2">
                           <input
                             type="text"
                             value={editName}
                             onChange={(e) => setEditName(e.target.value)}
                             autoFocus
                             className="border border-slate-200 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:border-indigo-300"
                           />
                           <button onClick={() => handleRename(audio.id)} className="text-emerald-600 hover:text-emerald-700 p-1 bg-emerald-50 rounded"><Check className="w-4 h-4" /></button>
                           <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-700 p-1 bg-slate-50 rounded"><X className="w-4 h-4" /></button>
                         </div>
                      ) : (
                         <span className="font-bold text-slate-800 text-sm">{audio.filename}</span>
                      )}
                      <span className={`text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-md ${
                        audio.status === 'unprocessed' ? 'bg-slate-100 text-slate-500' :
                        audio.status === 'processed' ? 'bg-amber-100 text-amber-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {audio.status}
                      </span>
                      {audio.isCut && <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-md bg-blue-100 text-blue-700">Auto-Cut</span>}
                    </div>
                    <p className="text-xs text-slate-400 font-mono">{new Date(audio.timestamp).toLocaleString()}</p>
                    
                    {audio.status === 'finalized' && (
                      <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Phonetic Guess (Sounded Like)</span>
                          <p className="text-sm text-slate-700 font-medium">"{audio.sound}"</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Target Intent (Meaning)</span>
                          <p className="text-sm text-slate-700 font-medium">"{audio.meaning}"</p>
                        </div>
                      </div>
                    )}

                    {finalizingId === audio.id && (
                      <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
                        <div className="space-y-2">
                           <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Phonetic Guess (What it sounds like)</label>
                           <input 
                             type="text" 
                             value={sound}
                             onChange={e => setSound(e.target.value)}
                             className="w-full bg-white border border-slate-200 rounded-md p-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-300"
                             placeholder="e.g. 'I lie ba-man'"
                           />
                        </div>
                        <div className="space-y-2">
                           <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Target Intent (What he's trying to say)</label>
                           <input 
                             type="text" 
                             value={meaning}
                             onChange={e => setMeaning(e.target.value)}
                             className="w-full bg-white border border-slate-200 rounded-md p-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-300"
                             placeholder="e.g. 'I like Batman'"
                           />
                        </div>
                        <div className="flex gap-2 justify-end pt-2">
                          <button onClick={() => setFinalizingId(null)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700">Cancel</button>
                          <button 
                            onClick={() => handleFinalize(audio.id)}
                            disabled={!sound || !meaning}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-lg transition-colors text-xs shadow-sm"
                          >
                            Finalize & Add to Training Data
                          </button>
                        </div>
                      </div>
                    )}
                 </div>

                 <div className="flex flex-col gap-2 items-end justify-center">
                    <div className="flex items-center gap-2">
                      {audio.status === 'unprocessed' && (
                        <button 
                          onClick={() => handleProcess(audio.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-white border border-amber-200 text-amber-700 hover:bg-amber-50 rounded-lg text-xs font-bold shadow-sm transition-colors"
                        >
                          <Scissors className="w-3 h-3" /> Auto-Cut Audio
                        </button>
                      )}
                      {audio.status === 'processed' && finalizingId !== audio.id && (
                        <button 
                          onClick={() => setFinalizingId(audio.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold shadow-sm transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" /> Write Standard (Finalize)
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                       <button onClick={() => { setEditingId(audio.id); setEditName(audio.filename); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-transparent hover:border-slate-200 rounded-md transition-colors" title="Rename file">
                         <Edit2 className="w-3 h-3" /> Rename
                       </button>
                       <button onClick={() => handleDelete(audio.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-md transition-colors" title="Delete file">
                         <Trash2 className="w-3 h-3" /> Delete
                       </button>
                    </div>
                 </div>
               </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
