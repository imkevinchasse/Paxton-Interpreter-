import { Mic } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, useRef } from 'react';

export function Microphone({ onProcess }: { onProcess: (audioBlob: Blob | null) => void }) {
  const [recording, setRecording] = useState(false);
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
        
        mediaRecorder.current.ondataavailable = e => {
          if (e.data.size > 0) chunks.current.push(e.data);
        };
        
        mediaRecorder.current.onstop = () => {
          const blob = new Blob(chunks.current, { type: mimeType || 'audio/webm' });
          stream.getTracks().forEach(t => t.stop());
          onProcess(blob);
        };
        
        mediaRecorder.current.start();
        setRecording(true);
      } catch (e) {
        console.error('Mic access denied.', e);
        alert('Microphone access is denied or not available in this preview environment. Please use a direct window or allow permissions.');
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-md mx-auto">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleRecording}
        className={`w-40 h-40 rounded-full flex items-center justify-center transition-all duration-300 relative bg-white overflow-hidden ${
          recording 
            ? 'text-red-500 border border-red-200 shadow-[0_0_40px_rgba(239,68,68,0.15)] bg-red-50' 
            : 'text-slate-400 border border-slate-200 hover:text-slate-600 shadow-xl'
        }`}
      >
        {recording && (
          <motion.div 
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }} 
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="absolute inset-0 rounded-full bg-red-500/10"
          ></motion.div>
        )}
        <Mic className="w-12 h-12 relative z-10" />
      </motion.button>
      <div className="text-center space-y-1">
        <p className="font-mono text-indigo-600 font-bold text-xs uppercase tracking-widest">
          {recording ? 'Recording Speech' : 'System Idle'}
        </p>
        <p className="text-slate-500 text-xs">
          {recording ? 'Click to stop & process' : 'Click microphone to capture intent'}
        </p>
      </div>
    </div>
  );
}
