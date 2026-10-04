import { Mic, Sparkles, Send, Volume2, ShieldAlert, ExternalLink, HelpCircle, Radio, UploadCloud, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useRef, useEffect } from 'react';

export function Microphone({ onProcess }: { onProcess: (audioBlob: Blob | null, textTranscript?: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [showNetworkGuide, setShowNetworkGuide] = useState(false);
  const [copiedFlag, setCopiedFlag] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [copiedHttps, setCopiedHttps] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const speechRecognition = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Detect if user is on non-localhost HTTP (where browser blocks navigator.mediaDevices)
  const isNonSecureRemote = typeof window !== 'undefined' && 
    !window.isSecureContext && 
    window.location.hostname !== 'localhost' && 
    window.location.hostname !== '127.0.0.1';

  useEffect(() => {
    // Check Web Speech API support for live browser speech recognition fallback
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';

        rec.onresult = (event: any) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
          }
          if (transcript) {
            setLiveTranscript(transcript.trim());
          }
        };

        speechRecognition.current = rec;
      } catch(e) {}
    }
  }, []);

  const toggleRecording = async () => {
    if (recording) {
      try {
        speechRecognition.current?.stop();
      } catch(e) {}
      mediaRecorder.current?.stop();
      setRecording(false);
    } else {
      setLiveTranscript('');
      
      // If browser blocked mediaDevices due to insecure HTTP on remote LAN IP, open helper or file capture
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setShowNetworkGuide(true);
        return;
      }

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
          onProcess(blob, liveTranscript || undefined);
        };
        
        mediaRecorder.current.start();
        try {
          speechRecognition.current?.start();
        } catch(e) {}
        setRecording(true);
      } catch (e: any) {
        console.warn('Microphone stream notice:', e);
        // Fallback: If microphone hardware permission is restricted in preview or on non-secure LAN
        if (isNonSecureRemote || e.name === 'SecurityError' || e.name === 'NotAllowedError') {
          setShowNetworkGuide(true);
        } else {
          try {
            speechRecognition.current?.start();
            setRecording(true);
          } catch (err) {
            setShowNetworkGuide(true);
          }
        }
      }
    }
  };

  const handleNativeAudioRecord = () => {
    fileInputRef.current?.click();
  };

  const handleNativeAudioFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onProcess(file);
    }
    // reset input
    if (e.target) e.target.value = '';
  };

  const handlePresetClick = (phrase: string) => {
    onProcess(null, phrase);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    onProcess(null, customInput.trim());
    setCustomInput('');
  };

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '192.168.x.x';

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-lg mx-auto">
      {/* Hidden file input for native mobile audio recording fallback (bypasses HTTP getUserMedia security restrictions) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        capture="microphone"
        className="hidden"
        onChange={handleNativeAudioFileSelected}
      />

      {/* Non-localhost Insecure HTTP Alert Banner */}
      {isNonSecureRemote && (
        <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between text-left shadow-xs">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-xs text-amber-900 font-mono">
              <span className="font-bold block">Remote Device HTTP Detected ({currentHost})</span>
              <span className="text-[11px] text-amber-700">Browsers require HTTPS or Chrome flag for microphone.</span>
            </div>
          </div>
          <button
            onClick={() => setShowNetworkGuide(true)}
            className="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-xl text-[11px] font-bold font-mono transition cursor-pointer shrink-0"
          >
            Fix / Setup Mic
          </button>
        </div>
      )}

      {/* Microphone Main Orb */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleRecording}
        className={`w-36 h-36 rounded-full flex items-center justify-center transition-all duration-300 relative bg-white overflow-hidden cursor-pointer ${
          recording 
            ? 'text-red-500 border-2 border-red-300 shadow-[0_0_40px_rgba(239,68,68,0.25)] bg-red-50' 
            : 'text-indigo-600 border border-slate-200 hover:border-indigo-300 shadow-xl'
        }`}
      >
        {recording && (
          <motion.div 
            animate={{ scale: [1, 1.3, 1], opacity: [0.35, 0.05, 0.35] }} 
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="absolute inset-0 rounded-full bg-red-500/15"
          ></motion.div>
        )}
        <Mic className={`w-12 h-12 relative z-10 ${recording ? 'text-red-500 animate-pulse' : 'text-indigo-600'}`} />
      </motion.button>

      {/* Recording Status / Live Transcription */}
      <div className="text-center space-y-1">
        <p className="font-mono text-indigo-600 font-bold text-xs uppercase tracking-widest">
          {recording ? 'Listening to Paxton...' : 'System Live & Ready'}
        </p>
        <p className="text-slate-500 text-xs">
          {recording 
            ? (liveTranscript ? `Hypothesis: "${liveTranscript}"` : 'Speak into microphone, then click to decode')
            : 'Click microphone to talk, or test with quick phrases below'}
        </p>
        
        {/* Mobile / Insecure fallback direct button */}
        {isNonSecureRemote && (
          <div className="pt-1">
            <button
              onClick={handleNativeAudioRecord}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-mono font-medium transition cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5 text-indigo-600" />
              <span>Tap to Record with Mobile Audio Recorder</span>
            </button>
          </div>
        )}
      </div>

      {/* Quick Test Presets */}
      <div className="w-full bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            Test Spoken Phonetics:
          </span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowNetworkGuide(true)}
              className="text-[10px] text-slate-400 hover:text-indigo-600 flex items-center gap-1 font-mono transition cursor-pointer"
              title="Remote mic guide"
            >
              <HelpCircle className="w-3 h-3" /> Network Mic Help
            </button>
            <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-mono">
              Phases 1A &amp; 1B Active
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { spoken: 'i nee a hell', label: '"i nee a hell"', note: 'Drop "a" + need help' },
            { spoken: 'ba-man dussin work', label: '"ba-man dussin work"', note: 'Batman doesn\'t work' },
            { spoken: 'wa is dis', label: '"wa is dis"', note: 'What is this' },
            { spoken: 'he go a sleep', label: '"he go a sleep"', note: 'Go to sleep' },
            { spoken: 'pa-pa boba', label: '"pa-pa boba"', note: 'Ambiguous: triggers "Did you mean?" confirmation (<78%)' },
            { spoken: 'i wan a cookie', label: '"i wan a cookie"', note: 'Preserves legitimate "a"' }
          ].map((item) => (
            <button
              key={item.spoken}
              onClick={() => handlePresetClick(item.spoken)}
              title={item.note}
              className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-200 text-slate-700 text-xs font-mono transition cursor-pointer flex items-center gap-1.5"
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Text Input Simulation Bar */}
        <form onSubmit={handleCustomSubmit} className="flex gap-2 pt-1 border-t border-slate-100">
          <input
            type="text"
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            placeholder="Type any phonetic speech (e.g. 'i nee a hell wit dis')..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 font-mono shadow-inner"
          />
          <button
            type="submit"
            disabled={!customInput.trim()}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-40 cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Interpret</span>
          </button>
        </form>
      </div>

      {/* Network / Remote Microphone Access Modal */}
      <AnimatePresence>
        {showNetworkGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden text-left"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Remote &amp; Mobile Microphone Access</h3>
                    <p className="text-xs text-slate-500 font-mono">Enabling audio input from other devices on your LAN</p>
                  </div>
                </div>
                <button onClick={() => setShowNetworkGuide(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl transition cursor-pointer">
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 font-mono">
                  <p>Browser security specifications (WebRTC) only allow microphone access over <strong>HTTPS</strong> or <strong>localhost</strong>. When accessed from an IP address like <span className="font-bold text-indigo-700">http://{currentHost}:3000</span>, browsers block the microphone by default.</p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
                    3 Instant Solutions:
                  </h4>

                  {/* Solution 1: HTTPS Port 3443 */}
                  <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-2xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-900 font-mono">Option 1: Open Secure HTTPS Gateway (Recommended)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-600 text-white font-mono font-bold">Fastest</span>
                    </div>
                    <p className="text-xs text-indigo-800">
                      We spun up an HTTPS server on port 3443! Simply open the link below on your phone/laptop, accept the local certificate once, and the microphone works natively:
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <a
                        href={`https://${currentHost}:3443`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-mono transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open https://{currentHost}:3443</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`https://${currentHost}:3443`);
                          setCopiedHttps(true);
                          setTimeout(() => setCopiedHttps(false), 2000);
                        }}
                        className="px-3 py-1.5 bg-white border border-indigo-200 hover:bg-indigo-100 text-indigo-800 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        {copiedHttps ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedHttps ? 'Copied URL!' : 'Copy Link'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Solution 2: Chrome Insecure Origin Flag */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
                    <span className="text-xs font-bold text-slate-800 font-mono block">Option 2: Enable Chrome Insecure Origin Flag</span>
                    <p className="text-xs text-slate-600">
                      On Android Chrome or Desktop Chrome, navigate to:
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-white rounded-lg border border-slate-200 text-[11px] font-mono text-slate-800 select-all flex-1 truncate">
                        chrome://flags/#unsafely-treat-insecure-origin-as-secure
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText('chrome://flags/#unsafely-treat-insecure-origin-as-secure');
                          setCopiedFlag(true);
                          setTimeout(() => setCopiedFlag(false), 2000);
                        }}
                        className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-mono font-medium transition flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        {copiedFlag ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedFlag ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                      <span>Add origin: <code className="bg-slate-200 px-1 rounded text-[11px]">http://{currentHost}:3000</code></span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`http://${currentHost}:3000`);
                          setCopiedOrigin(true);
                          setTimeout(() => setCopiedOrigin(false), 2000);
                        }}
                        className="text-[11px] font-mono text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedOrigin ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedOrigin ? 'Copied Origin' : 'Copy Origin'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Solution 3: Native Voice Recorder */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
                    <span className="text-xs font-bold text-slate-800 font-mono block">Option 3: Tap Native Mobile Voice Recorder</span>
                    <p className="text-xs text-slate-600">
                      Tap below to launch your phone&apos;s built-in sound recorder app and send the audio directly:
                    </p>
                    <button
                      onClick={() => {
                        setShowNetworkGuide(false);
                        handleNativeAudioRecord();
                      }}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold font-mono transition flex items-center gap-1.5 cursor-pointer mt-1"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>Launch Device Sound Recorder</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50">
                <button
                  onClick={() => setShowNetworkGuide(false)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold font-mono rounded-xl transition cursor-pointer"
                >
                  Got It
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
