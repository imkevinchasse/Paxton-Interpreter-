import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { type AudioRecording, type TrainingItem } from '../types';
import { 
  Mic, 
  Upload, 
  Scissors, 
  CheckCircle, 
  FileAudio, 
  PlayCircle, 
  Square,
  Edit2, 
  Trash2, 
  X, 
  Check, 
  Sparkles,
  AlertCircle,
  Database,
  ExternalLink,
  Copy,
  Link2
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  getAudioAbsoluteUrl, 
  getCleanFilename, 
  getBaseAudioUrl,
  pairAudioWithTrainingData, 
  playAudioWithResilience 
} from '../utils/audioPath';

export function AudioBankView() {
  const [recordings, setRecordings] = useState<AudioRecording[]>([]);
  const [trainingItems, setTrainingItems] = useState<TrainingItem[]>([]);
  const [activeTab, setActiveTab] = useState<'unfinalized' | 'finalized' | 'ignored'>('unfinalized');
  const [training, setTraining] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States for finalization form
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [sound, setSound] = useState('');
  const [meaning, setMeaning] = useState('');

  // States for renaming
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioErrorId, setAudioErrorId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const activeAudioController = useRef<{ stop: () => void } | null>(null);

  const refreshAllData = async () => {
    try {
      const [audioRes, trainRes] = await Promise.all([
        fetch('/api/audio_bank'),
        fetch('/api/training_data')
      ]);
      const [audioData, trainData] = await Promise.all([
        audioRes.json(),
        trainRes.json()
      ]);
      if (Array.isArray(audioData)) setRecordings(audioData);
      if (Array.isArray(trainData)) setTrainingItems(trainData);
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAllData();
    return () => {
      activeAudioController.current?.stop();
    };
  }, []);

  const handlePlayAudio = (audio: AudioRecording, paired?: TrainingItem | null) => {
    // If clicking on already playing audio, stop it
    if (playingId === audio.id) {
      activeAudioController.current?.stop();
      activeAudioController.current = null;
      setPlayingId(null);
      return;
    }

    // Stop previously playing audio
    activeAudioController.current?.stop();
    setPlayingId(audio.id);
    setAudioErrorId(null);

    const targetSrc = audio.filename || audio.path || paired?.filename || paired?.audioPath || '';
    const controller = playAudioWithResilience(
      targetSrc,
      {
        onPlay: () => {
          setPlayingId(audio.id);
          setAudioErrorId(null);
        },
        onEnd: () => {
          setPlayingId(null);
          activeAudioController.current = null;
        },
        onError: (err) => {
          console.warn(`Could not resolve or play audio: ${targetSrc}`, err);
          setPlayingId(null);
          setAudioErrorId(audio.id);
          activeAudioController.current = null;
        }
      },
      paired
    );

    activeAudioController.current = controller;
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this audio file?')) return;
    try {
      if (playingId === id) {
        activeAudioController.current?.stop();
        setPlayingId(null);
      }
      await fetch(`/api/audio_bank/${id}`, { method: 'DELETE' });
      setRecordings(prev => prev.filter(r => r.id !== id));
      setTrainingItems(prev => prev.filter(t => t.id !== id));
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
        body: JSON.stringify({ newName: editName.trim() })
      });
      if (res.ok) {
        setRecordings(prev => prev.map(r => r.id === id ? { ...r, filename: editName.trim() } : r));
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
      setRecordings(prev => [{ ...data }, ...prev]);
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleProcess = async (id: string) => {
    try {
      await fetch(`/api/audio_bank/${id}/process`, { method: 'POST' });
      await refreshAllData();
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
      setRecordings(prev => prev.map(r => r.id === id ? data : r));
      setFinalizingId(null);
      setSound('');
      setMeaning('');
      // Refresh training items to reflect newly paired entry
      const trainRes = await fetch('/api/training_data');
      const trainData = await trainRes.json();
      if (Array.isArray(trainData)) setTrainingItems(trainData);
    } catch (e) {
      console.error(e);
    }
  };

  const handleIgnore = async (id: string) => {
    try {
      const res = await fetch(`/api/audio_bank/${id}/ignore`, { method: 'PUT' });
      const data = await res.json();
      setRecordings(prev => prev.map(r => r.id === id ? data : r));
      setFinalizingId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleTrainWhisper = async () => {
    setTraining(true);
    try {
      const res = await fetch('/api/train-models', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Whisper training dataset built successfully! Pipeline started.');
      } else {
        alert(data.message || 'Training pipeline returned a warning.');
      }
      await refreshAllData();
    } catch(e) {
      console.error(e);
      alert('Failed to connect to training pipeline.');
    } finally {
      setTraining(false);
    }
  };

  const unfinalized = recordings.filter(r => r.status === 'unprocessed' || r.status === 'processed');
  const finalized = recordings.filter(r => r.status === 'finalized');
  const ignored = recordings.filter(r => r.status === 'ignored');

  const activeItems = activeTab === 'unfinalized' ? unfinalized : activeTab === 'finalized' ? finalized : ignored;
  const pairedCount = recordings.filter(r => pairAudioWithTrainingData(r, trainingItems) !== null).length;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
      {/* Top Banner and Upload Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <FileAudio className="w-6 h-6 text-indigo-600" /> Audio Processing & Dataset Pipeline
          </h2>
          <p className="text-slate-500 text-sm">
            Upload, auto-cut, and finalize audio recordings. All files are automatically mapped and paired with examples in the training dataset.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
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
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition-colors shadow-md text-sm cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload Raw Audio'}
          </button>
        </div>
      </div>

      {/* Audio Resolution & Dataset Pairing Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Link2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Audio Root Endpoint</span>
            <span className="text-xs font-mono font-medium text-slate-700 truncate block" title={getBaseAudioUrl() || 'Relative origin (/uploads)'}>
              {(getBaseAudioUrl() || (typeof window !== 'undefined' ? window.location.origin : '')) + '/uploads/'}
            </span>
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Training Data Pairing</span>
            <span className="text-xs font-bold text-slate-800">
              {pairedCount} of {recordings.length} Recordings Paired
            </span>
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Dataset Inventory</span>
            <span className="text-xs font-bold text-slate-800">
              {trainingItems.length} Phonetic Pairs in training_data.json
            </span>
          </div>
        </div>
      </div>

      {/* Main Bank View */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button 
            onClick={() => setActiveTab('unfinalized')}
            className={`px-8 py-4 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer ${
              activeTab === 'unfinalized' 
                ? 'border-indigo-600 text-indigo-600 bg-white' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            Unfinalized ({unfinalized.length})
          </button>
          <button 
            onClick={() => setActiveTab('finalized')}
            className={`px-8 py-4 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer ${
              activeTab === 'finalized' 
                ? 'border-emerald-600 text-emerald-600 bg-white' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            Finalized & Trained ({finalized.length})
          </button>
          <button 
            onClick={() => setActiveTab('ignored')}
            className={`px-8 py-4 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer ${
              activeTab === 'ignored' 
                ? 'border-amber-600 text-amber-600 bg-white' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            Ignored ({ignored.length})
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'finalized' && finalized.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl mb-6 shadow-sm">
              <div className="space-y-0.5">
                <h4 className="font-bold text-sm text-emerald-950 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  {finalized.length} Finalized & Labelled Samples Ready for Training
                </h4>
                <p className="text-xs text-emerald-700">
                  All phonetic guesses and intended meanings are paired and compiled directly into the Whisper fine-tuning dataset.
                </p>
              </div>
              <button
                onClick={handleTrainWhisper}
                disabled={training}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                {training ? 'Compiling Dataset & Training...' : `Train Whisper on ${finalized.length} Samples`}
              </button>
            </div>
          )}

          <div className="space-y-4">
            {loading && (
              <div className="text-center text-slate-400 font-mono text-sm py-12">
                Loading audio recordings and pairing dataset...
              </div>
            )}

            {!loading && activeItems.length === 0 && (
              <div className="text-center text-slate-400 font-mono text-sm py-12 border border-slate-200 border-dashed rounded-xl bg-slate-50">
                No audio recordings in this category.
              </div>
            )}

            {!loading && activeItems.map((audio) => {
              const paired = pairAudioWithTrainingData(audio, trainingItems);
              const cleanFilename = getCleanFilename(audio.filename || audio.path || paired?.filename || paired?.audioPath);
              const absoluteUrl = getAudioAbsoluteUrl(cleanFilename);
              const isPlaying = playingId === audio.id;
              const hasAudioError = audioErrorId === audio.id;

              return (
                <motion.div 
                  key={audio.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col gap-4 p-4 border rounded-xl transition-colors bg-white shadow-sm ${
                    isPlaying 
                      ? 'border-indigo-400 ring-2 ring-indigo-100' 
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-slate-100 text-slate-400 rounded-lg shrink-0">
                       {audio.status === 'unprocessed' && <Mic className="w-6 h-6 text-slate-500" />}
                       {audio.status === 'processed' && <Scissors className="w-6 h-6 text-amber-500" />}
                       {audio.status === 'finalized' && <CheckCircle className="w-6 h-6 text-emerald-500" />}
                    </div>

                    <div className="flex-1 space-y-1.5 min-w-0">
                       <div className="flex flex-wrap items-center gap-2">
                         {editingId === audio.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                autoFocus
                                className="border border-slate-300 rounded px-2.5 py-1 text-sm bg-white focus:outline-none focus:border-indigo-500"
                              />
                              <button onClick={() => handleRename(audio.id)} className="text-emerald-600 hover:text-emerald-700 p-1 bg-emerald-50 rounded cursor-pointer"><Check className="w-4 h-4" /></button>
                              <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-700 p-1 bg-slate-50 rounded cursor-pointer"><X className="w-4 h-4" /></button>
                            </div>
                         ) : (
                            <span className="font-bold text-slate-800 text-sm truncate max-w-xs sm:max-w-md font-mono" title={cleanFilename}>
                              {cleanFilename}
                            </span>
                         )}

                         <span className={`text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-md ${
                           audio.status === 'unprocessed' ? 'bg-slate-100 text-slate-500' :
                           audio.status === 'processed' ? 'bg-amber-100 text-amber-700' :
                           'bg-emerald-100 text-emerald-700'
                         }`}>
                           {audio.status}
                         </span>

                         {audio.isCut && (
                           <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-md bg-blue-100 text-blue-700">
                             Auto-Cut
                           </span>
                         )}

                         {paired ? (
                           <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                             <Database className="w-3 h-3 text-indigo-500" />
                             Paired: {paired.category || 'Phrase'}
                           </span>
                         ) : audio.status === 'finalized' ? (
                           <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                             <Database className="w-3 h-3 text-slate-400" />
                             Dataset Entry
                           </span>
                         ) : null}

                         {/* Direct WAV link verification & URL copying */}
                         <div className="flex items-center gap-2.5 ml-auto">
                           <button
                             onClick={() => {
                               if (absoluteUrl) {
                                 navigator.clipboard.writeText(absoluteUrl);
                                 setCopiedId(audio.id);
                                 setTimeout(() => setCopiedId(null), 1500);
                               }
                             }}
                             className="text-[11px] text-slate-400 hover:text-indigo-600 flex items-center gap-1 cursor-pointer transition-colors"
                             title={`Copy absolute URL: ${absoluteUrl}`}
                           >
                             {copiedId === audio.id ? (
                               <>
                                 <Check className="w-3 h-3 text-emerald-600" />
                                 <span className="text-emerald-600 font-bold">Copied</span>
                               </>
                             ) : (
                               <>
                                 <Copy className="w-3 h-3" />
                                 <span className="hidden md:inline">Copy URL</span>
                               </>
                             )}
                           </button>

                           <a 
                             href={absoluteUrl} 
                             target="_blank" 
                             rel="noreferrer" 
                             title={`View WAV in uploads: ${absoluteUrl}`}
                             className="text-[11px] text-slate-400 hover:text-indigo-600 flex items-center gap-1"
                           >
                             <ExternalLink className="w-3 h-3" />
                             <span className="hidden md:inline">Open WAV</span>
                           </a>
                         </div>
                       </div>

                       <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                         <span className="font-mono">{new Date(audio.timestamp).toLocaleString()}</span>
                         <span className="text-slate-300">•</span>
                         <span className="text-[11px] font-mono text-slate-500 truncate max-w-xs" title={absoluteUrl}>
                           {absoluteUrl.replace(/^https?:\/\/[^/]+/, '')}
                         </span>
                       </div>
                       
                       {/* Display finalized phonetic guess and target intent */}
                       {audio.status === 'finalized' && (
                         <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50/70 p-3 rounded-lg">
                           <div>
                             <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-0.5">Phonetic Guess (Sounded Like)</span>
                             <p className="text-sm text-slate-800 font-medium">"{audio.sound}"</p>
                           </div>
                           <div>
                             <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-0.5">Target Intent (Meaning)</span>
                             <p className="text-sm text-emerald-800 font-semibold">"{audio.meaning}"</p>
                           </div>
                         </div>
                       )}

                       {/* If unfinalized but paired with a training example, show shortcut to prefill */}
                       {audio.status !== 'finalized' && paired && (
                         <div className="mt-2 p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-lg flex items-center justify-between text-xs text-indigo-900">
                            <div>
                               <span className="font-bold">Matched Example in Training Data:</span> "{paired.sound}" ➔ "{paired.meaning}"
                            </div>
                            <button
                              onClick={() => {
                                setFinalizingId(audio.id);
                                setSound(paired.sound || audio.sound || '');
                                setMeaning(paired.meaning || audio.meaning || '');
                              }}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-[11px] shadow-sm cursor-pointer shrink-0"
                            >
                              Autofill Target
                            </button>
                         </div>
                       )}

                       {/* Finalization input form */}
                       {finalizingId === audio.id && (
                         <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
                           <div className="space-y-1.5">
                              <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest">
                                Phonetic Guess (What it sounds like)
                              </label>
                              <input 
                                type="text" 
                                value={sound}
                                onChange={e => setSound(e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-md p-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500"
                                placeholder="e.g. 'Eh wubah eh talkin machine'"
                              />
                           </div>
                           <div className="space-y-1.5">
                              <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest">
                                Target Intent (What he's actually saying)
                              </label>
                              <input 
                                type="text" 
                                value={meaning}
                                onChange={e => setMeaning(e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-md p-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500"
                                placeholder="e.g. 'A robot talking machine'"
                              />
                           </div>
                           <div className="flex gap-2 justify-end pt-2">
                             <button onClick={() => setFinalizingId(null)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer">Cancel</button>
                             <button 
                               onClick={() => handleFinalize(audio.id)}
                               disabled={!sound || !meaning}
                               className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-lg transition-colors text-xs shadow-sm cursor-pointer"
                             >
                               Finalize & Add to Training Data
                             </button>
                           </div>
                         </div>
                       )}

                       {hasAudioError && (
                         <div className="mt-2 text-xs text-red-600 flex items-center gap-1.5 font-medium">
                           <AlertCircle className="w-4 h-4 shrink-0" />
                           <span>Could not resolve WAV file from uploads directory. Verify file exists in uploads/.</span>
                         </div>
                       )}
                    </div>

                    {/* Actions and Playback controls */}
                    <div className="flex flex-wrap sm:flex-col gap-2 items-end justify-center self-end sm:self-center shrink-0">
                       <div className="flex items-center gap-2">
                         {/* Universal Play / Stop Button with resilient pathing */}
                         <button 
                           onClick={() => handlePlayAudio(audio, paired)}
                           className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer ${
                             isPlaying 
                               ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                               : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-indigo-600'
                           }`}
                           title={isPlaying ? "Stop audio" : "Play WAV audio file"}
                         >
                           {isPlaying ? (
                             <>
                               <Square className="w-3.5 h-3.5 fill-current" />
                               <span>Stop</span>
                             </>
                           ) : (
                             <>
                               <PlayCircle className="w-3.5 h-3.5" />
                               <span>Play</span>
                             </>
                           )}
                         </button>

                         {audio.status === 'unprocessed' && (
                           <button 
                             onClick={() => handleProcess(audio.id)}
                             className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer"
                           >
                             <Scissors className="w-3.5 h-3.5 text-amber-600" /> Auto-Cut
                           </button>
                         )}

                         {audio.status === 'processed' && finalizingId !== audio.id && (
                           <>
                             <button 
                               onClick={() => { 
                                 setFinalizingId(audio.id); 
                                 setSound(audio.sound || paired?.sound || ''); 
                                 setMeaning(audio.meaning || paired?.meaning || ''); 
                               }}
                               className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer"
                             >
                               <CheckCircle className="w-3.5 h-3.5" /> Finalize
                             </button>
                             <button 
                               onClick={() => handleIgnore(audio.id)}
                               className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer"
                             >
                               <X className="w-3.5 h-3.5" /> Skip
                             </button>
                           </>
                         )}

                         {audio.status === 'finalized' && finalizingId !== audio.id && (
                           <button 
                             onClick={() => { 
                               setFinalizingId(audio.id); 
                               setSound(audio.sound || ''); 
                               setMeaning(audio.meaning || ''); 
                             }}
                             className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer"
                             title="Edit phonetic or meaning"
                           >
                             <Edit2 className="w-3 h-3" /> Edit
                           </button>
                         )}
                       </div>

                       <div className="flex items-center gap-2">
                          <button 
                            onClick={() => { setEditingId(audio.id); setEditName(audio.filename); }} 
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-transparent hover:border-slate-200 rounded-md transition-colors cursor-pointer" 
                            title="Rename file"
                          >
                            <Edit2 className="w-3 h-3" /> Rename
                          </button>
                          <button 
                            onClick={() => handleDelete(audio.id)} 
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-md transition-colors cursor-pointer" 
                            title="Delete file"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                       </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
