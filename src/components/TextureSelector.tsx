import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Check, Box } from 'lucide-react';
import { TextureConfig } from '../types';

interface TextureSelectorProps {
  textures: TextureConfig[];
  selectedId: string;
  onSelect: (id: string) => void;
  onEditMaterial?: (id: string) => void;
  language?: 'en' | 'ko';
}

export const TextureSelector: React.FC<TextureSelectorProps> = ({ textures, selectedId, onSelect, onEditMaterial, language = 'ko' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string } | null>(null);
  const selectedTexture = textures.find(t => t.id === selectedId) || textures[0];
  const t = (en: string, ko: string) => language === 'ko' ? ko : en;

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-white/2 border border-white/5 rounded-xl px-2.5 py-2 text-[10px] hover:bg-white/10 transition-all group"
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-5 h-5 rounded-md bg-black/40 shrink-0 overflow-hidden border border-white/10 shadow-inner">
            {(selectedTexture.url || selectedTexture.maps?.color) ? (
              <img src={selectedTexture.maps?.color || selectedTexture.url} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full" style={{ backgroundColor: selectedTexture.color || '#999' }} />
            )}
          </div>
          <span className="truncate text-white/50 group-hover:text-white font-bold transition-colors">{selectedTexture.name}</span>
        </div>
        <div className="text-white/20 group-hover:text-white transition-colors">
          {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>
      </button>

      {isOpen && (
        <div className="mt-2 grid grid-cols-5 gap-1.5 p-2 bg-black/60 backdrop-blur-xl rounded-xl border border-white/10 z-50 overflow-y-auto max-h-48 custom-scrollbar shadow-2xl relative">
          {textures.map(tex => (
            <button
              key={tex.id}
              onClick={() => { onSelect(tex.id); setIsOpen(false); }}
              onContextMenu={(e) => {
                if (!tex.isCustom) return; // Only custom materials can be "modified" in the manager
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, id: tex.id });
              }}
              className={`aspect-square rounded-lg overflow-hidden border relative group transition-all ${tex.id === selectedId ? 'border-emerald-500 ring-1 ring-emerald-500/20' : 'border-white/5 hover:border-white/20'}`}
              title={tex.isCustom ? `${tex.name} (${t('Right click to edit', '우클릭으로 수정')})` : tex.name}
            >
              {(tex.url || tex.maps?.color) ? (
                <img src={tex.maps?.color || tex.url} className="w-full h-full object-cover" alt={tex.name} />
              ) : (
                <div className="w-full h-full" style={{ backgroundColor: tex.color || '#999' }} />
              )}
              {tex.id === selectedId && (
                <div className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center backdrop-blur-[1px]">
                  <Check size={14} className="text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Context Menu Portal (Simplified floating div) */}
      {contextMenu && (
        <div 
          className="fixed z-[9999] bg-[#1a1a1a] border border-emerald-500/30 rounded-lg shadow-2xl py-1 transform -translate-x-1/2"
          style={{ top: contextMenu.y + 5, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            onClick={() => {
              onEditMaterial?.(contextMenu.id);
              setContextMenu(null);
              setIsOpen(false);
            }}
            className="w-full px-4 py-2 text-[10px] font-black text-white hover:bg-emerald-500 hover:text-black transition-all flex items-center gap-2 whitespace-nowrap uppercase tracking-widest"
          >
            <Box size={10} />
            {t('Modify Material', '재질 수정')}
          </button>
        </div>
      )}
    </div>
  );
};
