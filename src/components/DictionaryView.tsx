import { useState, useEffect } from 'react';
import { type DictionaryItem } from '../types';
import { BookA, Trash2, Bot, Loader2 } from 'lucide-react';

export function DictionaryView() {
  const [dictionary, setDictionary] = useState<DictionaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    fetchDictionary();
    const iv = setInterval(fetchDictionary, 5000);
    return () => clearInterval(iv);
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

  const handleBuild = async () => {
    setBuilding(true);
    try {
      await fetch('/api/dictionary/build', { method: 'POST' });
      alert("Dictionary builder started. It will process training data in the background and use LLM to extract meaning. This may take a few minutes. Check back soon!");
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

  return (
    <div className="w-full max-w-4xl bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
      <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <BookA className="w-6 h-6 text-indigo-600" /> Learned Dictionary
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Words and slang compiled by the LLM from atypical phonetic translations.
          </p>
        </div>
        <button
          onClick={handleBuild}
          disabled={building}
          className="bg-indigo-600 outline-none hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all focus:ring-4 focus:ring-indigo-100 flex items-center gap-2"
        >
          {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
          Run Dictionary Builder
        </button>
      </div>

      <div className="bg-white min-h-[400px]">
        {loading ? (
          <div className="p-12 text-center text-slate-400 font-mono text-sm">Loading dictionary...</div>
        ) : dictionary.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-mono text-sm">
            Dictionary is empty. Click "Run Dictionary Builder" to scan your Training Data.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {dictionary.map(item => (
              <div key={item.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50 relative group">
                <button
                  onClick={() => handleDelete(item.id)}
                  className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-white rounded transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="mb-2">
                  <span className="font-mono text-indigo-600 font-bold">"{item.word}"</span>
                </div>
                <div className="text-slate-800 font-medium mb-2">
                  = {item.definition}
                </div>
                <div className="text-xs text-slate-500 italic mt-2 border-t border-slate-200 pt-2">
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
