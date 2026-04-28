import React, { useState, useEffect } from 'react';
import { Box, Monitor, Video, Leaf, Armchair, Plus, Clock, RefreshCw, ChevronDown, ChevronRight, Layers, LayoutGrid } from 'lucide-react';

interface ModelInfo {
  id: string;
  name: string;
  url?: string;
  type?: string;
}

interface AssetLibraryProps {
  onSelect: (type: any, url: string, name?: string) => void;
}

const getIcon = (id: string) => {
  const lower = id.toLowerCase();
  if (lower.includes('clock')) return <Clock size={14} />;
  if (lower.includes('cctv') || lower.includes('camera')) return <Video size={14} />;
  if (lower.includes('plant') || lower.includes('tree') || lower.includes('flower')) return <Leaf size={14} />;
  if (lower.includes('desk') || lower.includes('table') || lower.includes('monitor')) return <Monitor size={14} />;
  if (lower.includes('chair') || lower.includes('sofa') || lower.includes('seat')) return <Armchair size={14} />;
  return <Box size={14} />;
};

/**
 * Fetches the model file list from the dev server endpoint.
 */
const fetchModelManifest = async (): Promise<string[]> => {
  try {
    const res = await fetch('/__models_manifest');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('[AssetLibrary] Failed to fetch models manifest:', e);
    return [];
  }
};

/**
 * Convert model filenames to ModelInfo entries
 */
const parseModelsFromFileList = (fileNames: string[]): ModelInfo[] => {
  return fileNames.map(fileName => {
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    return {
      id: baseName.toLowerCase(),
      name: baseName.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      url: `/models/${encodeURIComponent(fileName)}`,
      type: 'model'
    };
  });
};

// Shared state
let _cachedModels: ModelInfo[] = [];
let _listeners: Set<() => void> = new Set();

const notifyListeners = () => _listeners.forEach(fn => fn());

// Initial load
fetchModelManifest().then(files => {
  _cachedModels = parseModelsFromFileList(files);
  notifyListeners();
});

/**
 * Hook to subscribe to the shared model library state.
 */
export const useModelLibrary = (): [ModelInfo[], () => void] => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick(t => t + 1);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const refresh = async () => {
    const files = await fetchModelManifest();
    _cachedModels = parseModelsFromFileList(files);
    notifyListeners();
  };

  return [_cachedModels, refresh];
};

export const AssetLibrary: React.FC<AssetLibraryProps> = ({ onSelect }) => {
  const [models, refresh] = useModelLibrary();
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    furniture: false,
    devices: false,
    etc: false
  });

  const allModels = [
    ...models,
    { id: 'clock', name: 'Digital Clock', type: 'clock' }
  ];

  // Logic to categorize models
  const categorized = {
    furniture: [] as typeof allModels,
    devices: [] as typeof allModels,
    etc: [] as typeof allModels
  };

  allModels.forEach(m => {
    const id = m.id.toLowerCase();
    
    // Furniture check
    if (['cabinet', 'bookcase', 'chair', 'desk', 'partition', 'sofa', 'table', 'seat', 'bench', 'stool', 'shelf', 'wardrobe'].some(k => id.includes(k))) {
      categorized.furniture.push(m);
    } 
    // Device check
    else if (['ac', 'tv', 'monitor', 'screen', 'computer', 'aircon', 'electronics', 'printer', 'clock'].some(k => id.includes(k))) {
      categorized.devices.push(m);
    } 
    // Catch-all ETC
    else {
      categorized.etc.push(m);
    }
  });

  const toggleCategory = (cat: string) => {
    setOpenCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const categories = [
    { id: 'furniture', name: 'Furniture', label: '가구', icon: <Armchair size={13} />, items: categorized.furniture },
    { id: 'devices', name: 'Devices', label: '기기', icon: <Monitor size={13} />, items: categorized.devices },
    { id: 'etc', name: 'ETC', label: '기타', icon: <LayoutGrid size={13} />, items: categorized.etc },
  ];

  return (
    <div className="relative pt-0.5">
      {/* Position Refresh button for alignment with parent Title */}
      <button
        onClick={refresh}
        className="absolute -top-7 right-2 p-1 text-white/20 hover:text-teal-500 transition-colors rounded-lg hover:bg-teal-500/10 z-10"
        title="Refresh models from /public/models"
      >
        <RefreshCw size={12} />
      </button>

      <div className="divide-y divide-white/[0.03] border-t border-white/[0.03]">
        {categories.map((cat) => (
          <div key={cat.id} className="overflow-hidden">
            {/* Accordion Header - Underline style */}
            <button
              onClick={() => toggleCategory(cat.id)}
              className="w-full flex items-center gap-2.5 px-3 py-3 transition-all duration-300 hover:bg-white/[0.02] group"
            >
              <span className={`${openCategories[cat.id] ? 'text-teal-500' : 'text-white/30'} transition-colors`}>
                {cat.icon}
              </span>
              <div className="flex flex-col items-start transition-transform duration-300 transform group-hover:translate-x-0.5">
                <span className="text-[10px] font-black uppercase text-white/50 group-hover:text-white/80">{cat.name}</span>
                <span className="text-[10px] font-bold uppercase text-white/30">{cat.label} • {cat.items.length}</span>
              </div>
              <div className={`ml-auto text-white/30 transition-transform duration-300 ${openCategories[cat.id] ? 'rotate-180 text-teal-500/50' : ''}`}>
                <ChevronDown size={12} />
              </div>
            </button>

            {/* Accordion Content - Black background for depth */}
            {openCategories[cat.id] && (
              <div className="bg-[#050505] shadow-[inset_0_4px_12px_rgba(0,0,0,0.8)] px-2 py-3 animate-in fade-in slide-in-from-top-1 duration-300">
                <div className="grid grid-cols-2 gap-1.5">
                  {cat.items.length === 0 ? (
                    <div className="col-span-2 py-4 text-center border border-dashed border-white/5 rounded-xl">
                      <span className="text-[10px] font-bold text-white/10 uppercase">Empty</span>
                    </div>
                  ) : (
                    cat.items.map(model => (
                      <button
                        key={model.id}
                        onClick={() => onSelect((model.type || 'model') as any, model.url || '', model.name)}
                        className="flex items-center gap-2 px-2 py-1.5 bg-white/[0.01] hover:bg-teal-500/10 border border-white/5 hover:border-teal-500/20 rounded-xl transition-all group shrink-0 h-9"
                      >
                        <div className="w-5 h-5 rounded-md bg-white/[0.05] flex items-center justify-center text-white/30 group-hover:text-teal-500 group-hover:scale-110 transition-all duration-500 shadow-inner shrink-0">
                          {getIcon(model.id)}
                        </div>
                        <span className="truncate text-left text-[10px] font-bold text-white/40 group-hover:text-white uppercase tracking-tighter transition-colors leading-none">
                          {model.name}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
