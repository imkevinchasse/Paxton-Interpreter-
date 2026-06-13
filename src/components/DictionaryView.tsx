import { useState, useEffect } from 'react';
import { type DictionaryItem } from '../types';
import { BookA, Trash2, Bot, Loader2, Plus, Edit2, X, Check } from 'lucide-react';

export function DictionaryView() {
  const [dictionary, setDictionary] = useState<DictionaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [buildStatus, setBuildStatus] = useState({ isBuilding: false, totalItems: 0, processedItems: 0, currentItem: '' });
  
  const [editingItem, setEditingItem] = useState<Partial<DictionaryItem> | null>(null);

  useEffect(() => {
    fetchDictionary();
    const iv = setInterval(fetchDictionary, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/dictionary/build/status');
        const data = await res.json();
        setBuildStatus(data);
        if (data.isBuilding) setBuilding(true);
        else setBuilding(false);
      } catch (e) {}
    };
    fetchStatus();
    const iv2 = setInterval(fetchStatus, 2000);
    return () => clearInterval(iv2);
  }, []);

  const fetchDictionary = async () => {
    try {
      const res = await fetch('/api/dictionary');
      const data = await res.json();
      setDictionary(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleBuild = async (forceAll: boolean = false) => {
    setBuilding(true);
    try {
      const res = await fetch(`/api/dictionary/build${forceAll ? '?force=true' : ''}`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
         alert(data.message);
         setBuilding(false);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to start dictionary builder.");
      setBuilding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this dictionary entry?')) return;
    try {
      await fetch(`/api/dictionary/${id}`, { method: 'DELETE' });
      setDictionary(dictionary.filter(d => d.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingItem?.word || !editingItem?.definition) return;
    
    try {
      if (editingItem.id) {
         // It's an edit, but wait... do we have an edit endpoint? Let's assume we can POST to /api/dictionary to create, but we might need a PUT for edit.
         // Let's implement an edit endpoint if not existing, or just delete and recreate.
         await fetch(`/api/dictionary/${editingItem.id}`, { method: 'DELETE' });
      }
      
      const res = await fetch('/api/dictionary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
           word: editingItem.word, 
           definition: editingItem.definition, 
           context: editingItem.context || ''
        })
      });
      const data = await res.json();
      
      setDictionary(prev => {
        const filtered = editingItem.id ? prev.filter(d => d.id !== editingItem.id) : prev;
        return [data, ...filtered];
      });
      
      setEditingItem(null);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="w-full max-w-4xl bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
      <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <BookA className="w-6 h-6 text-indigo-600" /> Learned Dictionary
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Words and slang compiled by the LLM from atypical phonetic translations.
          </p>
          {buildStatus.isBuilding && (
            <div className="mt-4 bg-indigo-50 border border-indigo-100 rounded-lg p-3">
               <div className="flex justify-between items-center mb-1">
                 <span className="text-xs font-bold text-indigo-700 uppercase">Building Dictionary...</span>
                 <span className="text-xs font-bold text-indigo-600">{buildStatus.processedItems} / {buildStatus.totalItems}</span>
               </div>
               <div className="w-full bg-indigo-100 rounded-full h-1.5 mb-2">
                 <div className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.round((buildStatus.processedItems / Math.max(buildStatus.totalItems, 1)) * 100)}%` }}></div>
               </div>
               <div className="text-xs text-indigo-500 truncate max-w-[300px]">Checking: "{buildStatus.currentItem}"</div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditingItem({ word: '', definition: '', context: '' })}
            className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-4 py-2 rounded-lg font-medium shadow-sm transition-all focus:ring-4 focus:ring-slate-100 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
          <button
            onClick={() => handleBuild(false)}
            disabled={building}
            className="bg-indigo-600 outline-none hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all focus:ring-4 focus:ring-indigo-100 flex items-center gap-2"
          >
            {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
            Scan New Data
          </button>
          <button
            onClick={() => {
               if(confirm("This will scan ALL training data and past interactions, which might take a while. Continue?")) {
                  handleBuild(true);
               }
            }}
            disabled={building}
            className="bg-purple-600 outline-none hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all focus:ring-4 focus:ring-purple-100 flex items-center gap-2"
          >
            {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
             Scan All
          </button>
        </div>
      </div>

      <div className="bg-white min-h-[400px]">
        {loading ? (
          <div className="p-12 text-center text-slate-400 font-mono text-sm">Loading dictionary...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {dictionary.length === 0 && !editingItem && (
               <div className="col-span-full p-12 text-center text-slate-400 font-mono text-sm">
                 Dictionary is empty. Click "Scan New Data" to scan your Training Data, or Add manually.
               </div>
            )}
            
            {editingItem && (
              <div className="border-2 border-indigo-200 rounded-lg p-4 bg-indigo-50/50 relative shadow-sm ring-4 ring-indigo-50">
                <button
                  onClick={() => setEditingItem(null)}
                  className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-slate-600 bg-white rounded-full shadow-sm"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="space-y-3 mt-4">
                  <input 
                    type="text" 
                    placeholder="Phonetic (e.g. ba-man)" 
                    value={editingItem.word}
                    onChange={e => setEditingItem({...editingItem, word: e.target.value})}
                    className="w-full text-sm font-mono border-slate-200 rounded p-2 focus:ring-1 focus:ring-indigo-300"
                  />
                  <input 
                    type="text" 
                    placeholder="Meaning (e.g. batman)" 
                    value={editingItem.definition}
                    onChange={e => setEditingItem({...editingItem, definition: e.target.value})}
                    className="w-full text-sm border-slate-200 rounded p-2 focus:ring-1 focus:ring-indigo-300"
                  />
                  <input 
                    type="text" 
                    placeholder="Context phrase (Optional)" 
                    value={editingItem.context || ''}
                    onChange={e => setEditingItem({...editingItem, context: e.target.value})}
                    className="w-full text-xs italic border-slate-200 rounded p-2 focus:ring-1 focus:ring-indigo-300"
                  />
                  <button 
                    onClick={handleSaveEdit}
                    disabled={!editingItem.word || !editingItem.definition}
                    className="w-full flex justify-center items-center gap-2 bg-indigo-600 text-white rounded p-2 text-sm font-bold shadow disabled:opacity-50"
                  >
                     <Check className="w-4 h-4" /> Save Entry
                  </button>
                </div>
              </div>
            )}
            
            {dictionary.map(item => (
              <div key={item.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50 relative group">
                <div className="absolute top-2 right-2 flex opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded backdrop-blur-sm shadow-sm gap-1 p-0.5">
                   <button
                     onClick={() => setEditingItem(item)}
                     className="p-1.5 text-slate-400 hover:text-indigo-600 rounded"
                   >
                     <Edit2 className="w-3.5 h-3.5" />
                   </button>
                   <button
                     onClick={() => handleDelete(item.id)}
                     className="p-1.5 text-slate-400 hover:text-red-500 rounded"
                   >
                     <Trash2 className="w-3.5 h-3.5" />
                   </button>
                </div>
                <div className="mb-2 pr-12">
                  <span className="font-mono text-indigo-600 font-bold break-words">"{item.word}"</span>
                </div>
                <div className="text-slate-800 font-medium mb-2 break-words">
                  = {item.definition}
                </div>
                <div className="text-xs text-slate-500 italic mt-2 border-t border-slate-200 pt-2 break-words">
                  "{item.context}"
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
