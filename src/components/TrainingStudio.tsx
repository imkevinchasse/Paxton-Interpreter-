import { useState, useRef, useEffect } from 'react';
import { Mic, CheckCircle2, ListPlus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { type TrainingItem } from '../types';

export function TrainingStudio() {
  const [category, setCategory] = useState('Phrase');
  const [sound, setSound] = useState('');
  const [meaning, setMeaning] = useState('');
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [savedItems, setSavedItems] = useState<TrainingItem[]>([]);

  useEffect(() => {
    fetch('/api/training_data')
      .then(res => res.json())
      .then(data => setSavedItems(data))
      .catch(console.error);
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/training_data/${id}`, { method: 'DELETE' });
      setSavedItems(prev => prev.filter(item => item.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorder.current?.stop();
      setRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        let mimeType = '';
        if (typeof MediaRecorder !== 'undefined') {
          if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
          else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        }

        mediaRecorder.current = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunks.current = [];
        setAudioBlob(null);
        
        mediaRecorder.current.ondataavailable = e => {
          if (e.data.size > 0) chunks.current.push(e.data);
        };
        
        mediaRecorder.current.onstop = () => {
          const blob = new Blob(chunks.current, { type: mimeType || 'audio/webm' });
          stream.getTracks().forEach(t => t.stop());
          setAudioBlob(blob);
        };
        
        mediaRecorder.current.start();
        setRecording(true);
      } catch (e) {
        console.error('Mic access denied.', e);
        alert("Microphone access is required to record training samples.");
      }
    }
  };

  const handleSave = async () => {
    if (!meaning) return;
    setSaving(true);
    
    const formData = new FormData();
    formData.append('category', category);
    formData.append('sound', sound);
    formData.append('meaning', meaning);
    if (audioBlob) {
      formData.append('audio', audioBlob, 'training_audio.webm');
    }

    try {
      const res = await fetch('/api/training_data', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setSavedItems(prev => [data, ...prev]);
      
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setSound('');
        setMeaning('');
        setAudioBlob(null);
      }, 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 flex gap-8 items-start">
      <div className="flex-1 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <ListPlus className="w-6 h-6 text-indigo-600" /> Training Studio
          </h2>
          <p className="text-slate-500 text-sm">
            Record words, phrases, or letters. Provide the phonetic spelling and the actual intent to collect data for fine-tuning Whisper.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
           <div className="space-y-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Utterance Type</label>
              <div className="flex gap-3">
                 {['Word', 'Phrase', 'Letter'].map(c => (
                   <button 
                     key={c}
                     onClick={() => setCategory(c)}
                     className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm ${
                       category === c 
                         ? 'bg-slate-800 text-white border border-slate-800' 
                         : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-800'
                     }`}
                   >
                     {c}
                   </button>
                 ))}
              </div>
           </div>

           <div className="space-y-4">
              <div className="space-y-2">
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Phonetic Guess (What it sounds like)</label>
                 <input 
                   type="text" 
                   value={sound}
                   onChange={e => setSound(e.target.value)}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 transition-all font-medium shadow-inner"
                   placeholder="e.g. 'I lie ba-man' or 'HAUGHMANPAPET'R TAWL'"
                 />
              </div>

              <div className="space-y-2">
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Target Intent (What he's trying to say)</label>
                 <input 
                   type="text" 
                   value={meaning}
                   onChange={e => setMeaning(e.target.value)}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 transition-all font-medium shadow-inner"
                   placeholder="e.g. 'I like Batman' or 'How many paper towels?'"
                 />
              </div>
           </div>

           <div className="pt-4 flex flex-col items-center border-t border-slate-100">
             <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mt-4 mb-4 self-start">Voice Sample</label>
             <div className="flex items-center gap-6 self-start">
               <motion.button
                 whileHover={{ scale: 1.05 }}
                 whileTap={{ scale: 0.95 }}
                 onClick={toggleRecording}
                 className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 relative bg-white overflow-hidden ${
                   recording 
                     ? 'text-red-500 border-2 border-red-200 shadow-[0_0_20px_rgba(239,68,68,0.2)] bg-red-50' 
                     : audioBlob 
                       ? 'text-emerald-600 border-2 border-emerald-200 bg-emerald-50 shadow-sm'
                       : 'text-slate-400 border border-slate-200 hover:text-slate-600 shadow-sm'
                 }`}
               >
                 {recording && (
                   <motion.div 
                     animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }} 
                     transition={{ repeat: Infinity, duration: 1.5 }}
                     className="absolute inset-0 rounded-full bg-red-500/10"
                   ></motion.div>
                 )}
                 {audioBlob && !recording ? <CheckCircle2 className="w-6 h-6" /> : <Mic className="w-6 h-6 relative z-10" />}
               </motion.button>

               <div className="text-sm font-mono text-slate-500">
                  {recording ? <span className="text-red-500 font-bold animate-pulse">Recording...</span> : audioBlob ? <span className="text-emerald-600 font-bold">Audio Captured</span> : 'Click to record'}
               </div>
             </div>
           </div>

           <div className="pt-6 flex items-center justify-between">
              <span className="text-xs text-emerald-600 font-bold transition-opacity duration-300" style={{ opacity: success ? 1 : 0 }}>
                Training Sample Saved!
              </span>
              <button 
                 onClick={handleSave}
                 disabled={!meaning || saving}
                 className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors shadow-md text-sm cursor-pointer"
              >
                 {saving ? 'Saving...' : 'Add to Dataset'}
              </button>
           </div>
        </div>
      </div>

      <div className="w-80 space-y-6">
         <div className="bg-slate-800 rounded-2xl p-6 text-white shadow-md space-y-4 relative overflow-hidden">
            <div className="relative z-10 space-y-2">
               <h3 className="font-bold text-sm uppercase tracking-wider text-slate-300">Model Training</h3>
               <p className="text-xs text-slate-400">Optimize audio datasets and fine-tune Whisper & Llama models based on collected samples.</p>
            </div>
            
            <button 
               onClick={async () => {
                 setSaving(true);
                 try {
                   await fetch('/api/train-models', { method: 'POST' });
                   alert("Model training pipeline complete. See terminal for logs.");
                 } catch (e) {
                   console.error(e);
                   alert("Training pipeline encountered an error.");
                 } finally {
                   setSaving(false);
                 }
               }}
               disabled={saving}
               className="w-full relative z-10 py-3 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl transition-colors shadow-sm text-sm"
            >
               {saving ? 'Training in progress...' : 'Optimize Audio & Train'}
            </button>
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-slate-700 rounded-full opacity-50 blur-2xl"></div>
         </div>

         <div className="space-y-3">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex justify-between items-center">
               Suggested Gaps
               <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Missing Coverage</span>
            </h3>
            <div className="flex flex-wrap gap-2">
               {['Yes/No', 'Help', 'Bathroom', 'Hungry', 'Hurt', 'Happy', 'A, B, C', 'Thank You'].map(sg => (
                 <button 
                   key={sg}
                   onClick={() => { setMeaning(sg); setCategory('Phrase'); setSound(''); }}
                   className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-colors shadow-sm"
                 >
                   + {sg}
                 </button>
               ))}
            </div>
            <p className="text-xs text-slate-400">Click to load suggestion.</p>
         </div>

         <div className="space-y-4 pt-4 border-t border-slate-200">
           <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Recently Added</h3>
           {savedItems.length === 0 && (
             <p className="text-xs text-slate-500 font-mono bg-white p-4 border border-slate-200 border-dashed rounded-xl text-center">No data collected this session.</p>
           )}
           <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
             {savedItems.map((item, i) => (
               <div key={item.id} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm space-y-2 group">
                  <div className="flex justify-between items-center">
                     <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{item.category}</span>
                     <div className="flex items-center space-x-2">
                       {item.hasAudio && <Mic className="w-4 h-4 text-emerald-500" />}
                       <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                         <Trash2 className="w-4 h-4" />
                       </button>
                     </div>
                  </div>
                  <div className="text-sm text-slate-800 font-medium">"{item.meaning}"</div>
                  <div className="text-xs text-slate-500 font-mono opacity-80">Sounds like: {item.sound || '(empty)'}</div>
               </div>
             ))}
           </div>
         </div>
      </div>
    </div>
  );
}
