import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import { TextureConfig } from '../types';

interface TextureSelectorProps {
  textures: TextureConfig[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export const TextureSelector: React.FC<TextureSelectorProps> = ({ textures, selectedId, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedTexture = textures.find(t => t.id === selectedId) || textures[0];

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
        <div className="mt-2 grid grid-cols-5 gap-1.5 p-2 bg-black/60 backdrop-blur-xl rounded-xl border border-white/10 z-50 overflow-y-auto max-h-48 custom-scrollbar shadow-2xl">
          {textures.map(tex => (
            <button
              key={tex.id}
              onClick={() => { onSelect(tex.id); setIsOpen(false); }}
              className={`aspect-square rounded-lg overflow-hidden border relative group transition-all ${tex.id === selectedId ? 'border-emerald-500 ring-1 ring-emerald-500/20' : 'border-white/5 hover:border-white/20'}`}
              title={tex.name}
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
    </div>
  );
};
