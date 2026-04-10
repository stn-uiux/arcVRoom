import React, { useMemo, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Box, Layers, Plus, RefreshCw, Library } from 'lucide-react';
import { TextureConfig, identifyTextureType } from '../types';

interface MaterialsLibraryProps {
  onAddTexture: (tex: TextureConfig) => void;
}

/**
 * Parses a list of filenames from public/materials into grouped TextureConfig entries.
 * Groups files by their base material name and identifies map types (Color, Normal, etc.)
 */
const parseMaterialsFromFileList = (fileNames: string[]): TextureConfig[] => {
  const groups: Record<string, any> = {};

  fileNames.forEach(fileName => {
    const mapType = identifyTextureType(fileName);
    
    // Robust base name extraction:
    let baseName = fileName.replace(/\.[^/.]+$/, ""); // remove extension
    
    // Iteratively strip known suffixes
    const suffixes = ['Color', 'Normal', 'Roughness', 'Metalness', 'Displacement', 'AmbientOcclusion', 'AO', 'Emission', 'Emissive', 'NormalGL', 'NormalDX', 'Disp', 'NRM', 'Height', 'Opacity', 'Alpha', 'Diffuse', 'Albedo', 'BaseColor', '1K-JPG', '1K', '2K', '4K', 'JPG', 'PNG', 'WEBP'];
    
    let changed = true;
    while (changed) {
      changed = false;
      for (const suffix of suffixes) {
        const regex = new RegExp(`[_-]${suffix}$`, 'i');
        if (regex.test(baseName)) {
          baseName = baseName.replace(regex, '');
          changed = true;
        }
      }
    }

    if (!groups[baseName]) {
      groups[baseName] = { 
        id: `dynamic-${baseName}`,
        name: baseName.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        category: 'Dynamic',
        color: '#ffffff',
        isLibrary: true,
        maps: {},
        repeat: [2, 2],
        displacementScale: 0
      };
    }

    groups[baseName].maps[mapType] = `/materials/${fileName}`;
  });

  return Object.values(groups).filter(g => g.maps.color); // Ensure at least a color map exists
};

/**
 * Fetches the materials file list from the dev server endpoint.
 * Falls back to empty array on failure.
 */
const fetchMaterialManifest = async (): Promise<string[]> => {
  try {
    const res = await fetch('/__materials_manifest');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('[MaterialsLibrary] Failed to fetch materials manifest:', e);
    return [];
  }
};

// Shared state for PRESET_MATERIALS so Furniture.tsx can also access them
let _cachedMaterials: TextureConfig[] = [];
let _listeners: Set<() => void> = new Set();

export const getPresetMaterials = () => _cachedMaterials;

const notifyListeners = () => _listeners.forEach(fn => fn());

// Initial load
fetchMaterialManifest().then(files => {
  _cachedMaterials = parseMaterialsFromFileList(files);
  notifyListeners();
});

/**
 * Hook to subscribe to the shared preset materials state.
 */
export const usePresetMaterials = (): [TextureConfig[], () => void] => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick(t => t + 1);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const refresh = async () => {
    const files = await fetchMaterialManifest();
    _cachedMaterials = parseMaterialsFromFileList(files);
    notifyListeners();
  };

  return [_cachedMaterials, refresh];
};

// Re-export for backward compatibility
export const PRESET_MATERIALS = _cachedMaterials;

export const MaterialsLibrary: React.FC<MaterialsLibraryProps> = ({ onAddTexture, language = 'ko' }) => {
  const [materials, refresh] = usePresetMaterials();
  const t = (en: string, ko: string) => (language === 'ko' ? ko : en);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-1 px-1.5 h-7">
        <Library className="w-3.5 h-3.5 text-emerald-500" />
        <h2 className="text-xs font-black uppercase tracking-widest text-white/50">{t('Materials Library', '재질 라이브러리')}</h2>
        <button
          onClick={refresh}
          className="ml-auto p-1 text-white/20 hover:text-emerald-500 transition-colors rounded-lg hover:bg-emerald-500/10"
          title={t('Refresh materials from /public/materials', '/public/materials에서 재질 새로고침')}
        >
          <RefreshCw size={12} />
        </button>
      </div>
      
      <div className="grid grid-cols-2 gap-3 px-1">
        {materials.length === 0 && (
          <div className="col-span-2 py-8 text-center border-2 border-dashed border-white/5 rounded-2xl">
            <p className="text-[10px] text-white/20 font-black uppercase tracking-widest">{t('No materials found in /public/materials', '/public/materials 경로에서 재질을 찾을 수 없습니다')}</p>
          </div>
        )}
        {materials.map((mat) => (
          <div 
            key={mat.id}
            className="group relative bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-emerald-500/30 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer shadow-xl"
            onClick={() => onAddTexture({
              ...mat,
              id: uuidv4(),
              isCustom: true
            })}
          >
            {/* Preview Image */}
            <div className="aspect-square w-full overflow-hidden bg-black/40 relative">
              <img 
                src={mat.maps?.color} 
                alt={mat.name} 
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
              
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-emerald-500/10 backdrop-blur-[2px]">
                <div className="bg-emerald-500 text-black p-2 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.5)] transform translate-y-4 group-hover:translate-y-0 transition-transform">
                  <Plus size={16} />
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-3 space-y-1">
              <div className="text-[10px] font-black text-white/80 uppercase tracking-wider truncate">{mat.name}</div>
              <div className="text-[7px] font-bold text-white/30 uppercase tracking-[0.2em]">{Object.keys(mat.maps || {}).length} Maps Active</div>
            </div>
          </div>
        ))}

        <div className="aspect-square bg-white/[0.01] border border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center gap-2 opacity-50">
          <Layers size={20} className="text-white/10" />
          <span className="text-[7px] font-bold text-white/10 uppercase tracking-widest text-center px-4">Upload to /public/materials to add more</span>
        </div>
      </div>
    </div>
  );
};
