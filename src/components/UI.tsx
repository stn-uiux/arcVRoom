import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Plus,
  Trash2,
  Upload,
  Square,
  Sun,
  Download,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Layout,
  Search,
  Hand,
  Maximize,
  Box,
  Settings,
  Lightbulb,
  Trash,
  Scissors,
  Move,
  RotateCw,
  Scaling,
  Power,
  Layers,
  Circle,
  Zap,
  Lock,
  Unlock,
  AlignLeft,
  AlignCenterHorizontal as AlignCenterH,
  AlignRight,
  AlignStartVertical as AlignTop,
  AlignCenterVertical as AlignCenterV,
  AlignEndVertical as AlignBottom,
  MoveHorizontal,
  MoveVertical,
  MoreHorizontal,
  Folder,
  Eye,
  EyeOff,
  MousePointer,
  Library
} from 'lucide-react';
import {
  FurnitureType,
  FurnitureItem,
  AppState,
  TextureConfig,
  LightType,
  identifyTextureType
} from '../types';
import { TextureSelector } from './TextureSelector';
import { TextureManagerPanel } from './TextureManagerPanel';
import { AssetLibrary } from './AssetLibrary';
import { MaterialsLibrary, usePresetMaterials } from './MaterialsLibrary';
import { motion, AnimatePresence } from 'framer-motion';
import { FloorplanToSvg } from './FloorplanToSvg';
import { ACCENT_400, accentRgba } from '../theme';

interface UIProps {
  state: AppState;
  onAddItem: (type: FurnitureType, url?: string, name?: string) => void;
  onDeleteItem: () => void;
  onUpdateItem: (id: string, updates: Partial<FurnitureItem>, undoable?: boolean) => void;
  onUpdateItems: (updatesMap: { [id: string]: Partial<FurnitureItem> }, undoable?: boolean) => void;
  onAlign?: (axis: 0 | 1 | 2, type: 'min' | 'center' | 'max') => void;
  onDistribute?: (axis: 0 | 1 | 2) => void;
  onUpdateLight: (id: string, updates: Partial<any>) => void;
  onUpdateLights: (updatesMap: { [id: string]: Partial<any> }, undoable?: boolean) => void;
  onAddLight: (type: string) => void;
  onUpdateState: (updates: Partial<AppState>) => void;
  onFitToSelection: () => void;
  onSvgUpload?: (files: File[]) => void;
  onExport: (mode: 'all' | 'objects' | 'lights' | 'json') => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  expandedLights: Set<string>;
  setExpandedLights: (expanded: Set<string>) => void;
  showGizmos: boolean;
  setShowGizmos: (show: boolean) => void;
  toggleAllLightsStatus: () => void;
  setSelectedSubId: (id: string | null) => void;
  selectedSubId: string | null;
  staticTextures: TextureConfig[];
  zoomRef: React.RefObject<HTMLDivElement>;
  panRef: React.RefObject<HTMLDivElement>;
  onSelect: (id: string | null, multi?: boolean, isGroupSelect?: boolean) => void;
  language?: 'en' | 'ko';
}

export const UI: React.FC<UIProps> = ({
  state,
  onAddItem,
  onDeleteItem,
  onUpdateItem,
  onUpdateItems,
  onAlign,
  onDistribute,
  onUpdateLight,
  onUpdateLights,
  onAddLight,
  onUpdateState,
  onFitToSelection,
  onSvgUpload,
  onExport,
  onImport,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  sidebarOpen,
  setSidebarOpen,
  expandedLights,
  setExpandedLights,
  showGizmos,
  setShowGizmos,
  toggleAllLightsStatus,
  setSelectedSubId,
  selectedSubId,
  staticTextures,
  zoomRef,
  panRef,
  onSelect,
  language = 'en'
}) => {
  const [activeTab, setActiveTab] = useState<'objects' | 'lights' | 'materials' | 'settings'>('objects');
  const [showFloorplanModal, setShowFloorplanModal] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [jumpToMaterialId, setJumpToMaterialId] = useState<string | null>(null);
  const [isDraggingMaterials, setIsDraggingMaterials] = useState(false);
  const lastSelectedIdRef = useRef<string | null>(null);
  const internalUIActionRef = useRef(false);
  const lastSelectedIndexRef = useRef<number | null>(null);

  const t = (en: string, ko: string) => (language === 'ko' ? ko : en);

  const EditableNumber: React.FC<{ value: number, onChange: (val: number) => void, precision?: number }> = ({ value, onChange, precision = 1 }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState(value.toString());

    if (isEditing) {
      return (
        <input
          autoFocus
          className="w-10 bg-teal-500/10 border border-teal-500/50 rounded text-[10px] text-teal-500 font-mono px-1 outline-none"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={() => {
            const val = parseFloat(tempValue);
            if (!isNaN(val)) onChange(val);
            setIsEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = parseFloat(tempValue);
              if (!isNaN(val)) onChange(val);
              setIsEditing(false);
            }
            if (e.key === 'Escape') {
              setTempValue(value.toString());
              setIsEditing(false);
            }
          }}
        />
      );
    }
    return (
      <span
        className="text-teal-500 cursor-pointer hover:underline decoration-teal-500/30"
        onClick={() => {
          setTempValue(value.toString());
          setIsEditing(true);
        }}
      >
        {value.toFixed(precision)}
      </span>
    );
  };

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroupExpansion = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const sceneHierarchy = React.useMemo(() => {
    const nodes: Array<{ type: 'item', item: FurnitureItem } | { type: 'group', groupId: string, items: FurnitureItem[] }> = [];
    const groupedIds = new Set<string>();

    state.items.forEach(item => {
      if (item.groupId) {
        if (!groupedIds.has(item.groupId)) {
          const groupItems = state.items.filter(i => i.groupId === item.groupId);
          nodes.push({ type: 'group', groupId: item.groupId, items: groupItems });
          groupedIds.add(item.groupId);
        }
      } else {
        nodes.push({ type: 'item', item });
      }
    });
    return nodes;
  }, [state.items]);

  const { unit = 'm' } = state;

  // Tab switching effect - only triggers on NEW selection
  useEffect(() => {
    if (state.selectedIds.length === 0) {
      lastSelectedIdRef.current = null;
      return;
    }
    const lastId = state.selectedIds[state.selectedIds.length - 1];
    if (lastId === lastSelectedIdRef.current) return;

    lastSelectedIdRef.current = lastId;
    const isLight = state.lights.find(l => l.id === lastId);
    const isItem = state.items.find(i => i.id === lastId);

    if (isLight) setActiveTab('lights');
    else if (isItem) setActiveTab('objects');
  }, [state.selectedIds, state.lights, state.items]);

  // Scroll effect for both lights and objects
  useEffect(() => {
    if (state.selectedIds.length === 0) {
      internalUIActionRef.current = false;
      return;
    }

    // If it was an internal UI action (list click, item add), don't scroll top
    if (internalUIActionRef.current) {
      internalUIActionRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const lastId = state.selectedIds[state.selectedIds.length - 1];
      if (!lastId) return;

      const isLight = state.lights.some(l => l.id === lastId);
      const isItem = state.items.some(i => i.id === lastId);

      const sectionId = isLight ? 'lights-section' : 'scene-objects-section';
      const sectionEl = document.getElementById(sectionId);
      const itemPanelId = (isLight ? 'light-panel-' : 'object-panel-') + lastId;
      const itemEl = document.getElementById(itemPanelId);

      // 1. Scroll the outer sidebar to the specific section header
      if (sectionEl) {
        sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // 2. Scroll the internal list to show the specific layer at the top
      if (itemEl) {
        // Small delay to ensure the outer scroll doesn't conflict with internal scroll
        setTimeout(() => {
          itemEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [state.selectedIds]);

  const selectedItems = state.items.filter(item => state.selectedIds.includes(item.id));
  const selectedItem = selectedItems[0] || null;
  const [presetMaterials] = usePresetMaterials();
  const allTextures = [
    { id: 'none', name: 'None', color: '#94a3b8' },
    ...staticTextures,
    ...presetMaterials.map(m => ({ ...m, name: `[Library] ${m.name}` })),
    ...(state.customTextures || []).map(t => ({ ...t, isCustom: true }))
  ];

  const updateField = (id: string, field: 'position' | 'scale' | 'rotation', index: number, value: number) => {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    const newArray = [...item[field]] as [number, number, number];
    newArray[index] = value;
    onUpdateItem(id, { [field]: newArray }, true);
  };

  const toggleAllLightsExpansion = () => {
    if (expandedLights.size === state.lights.length && state.lights.length > 0) {
      setExpandedLights(new Set());
    } else {
      setExpandedLights(new Set(state.lights.map(l => l.id)));
    }
  };

  return (
    <>
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
        <div className="absolute top-6 left-6 pointer-events-auto flex items-center gap-3">
          <div className="flex items-center gap-3 glass-panel px-4 py-2 rounded-full border border-white/10 shadow-2xl">
            <div className="w-8 h-8 bg-teal-500 rounded-full flex items-center justify-center">
              <Box className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white leading-tight">arcVRoom</h1>
              <p className="text-[10px] text-white/50 font-mono">Architect Visual Room</p>
            </div>
          </div>

          <div className="flex bg-black/40 backdrop-blur-xl border border-white/10 rounded-full p-1 shadow-2xl">
            <button
              onClick={() => onUpdateState({ language: 'ko' })}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all ${language === 'ko' ? `bg-teal-500 text-black shadow-[0_0_15px_${accentRgba(0.3)}]` : 'text-white/40 hover:text-white/70'}`}
            >
              KO
            </button>
            <button
              onClick={() => onUpdateState({ language: 'en' })}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all ${language === 'en' ? `bg-teal-500 text-black shadow-[0_0_15px_${accentRgba(0.3)}]` : 'text-white/40 hover:text-white/70'}`}
            >
              EN
            </button>
          </div>
        </div>

        {/* Alignment Modal */}
        <AnimatePresence>
          {state.selectedIds.length > 1 && onAlign && onDistribute && (
            <div
              id="alignment-tools-modal"
              style={{
                right: sidebarOpen ? '480px' : '160px',
                top: '24px',
                transition: 'right 0.5s ease-in-out'
              }}
              className="absolute pointer-events-auto overflow-hidden border border-teal-500/20 bg-black/80 backdrop-blur-xl rounded-2xl p-3 space-y-2 shadow-[0_15px_35px_rgba(0,0,0,0.5)] w-[200px]"
            >
              <div className="flex items-center justify-between mb-1 pb-1.5 border-b border-white/10">
                <span className="text-[10px] font-black uppercase tracking-widest text-teal-500/80">Alignment</span>
                <span className="text-[10px] font-mono text-teal-500/60 uppercase font-black">{state.selectedIds.length} Selected</span>
              </div>

              {/* X Axis */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-white/30 w-2.5">X</span>
                  <div className="flex gap-1 flex-1">
                    <button onClick={() => onAlign(0, 'min')} title="Align Left" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignLeft size={10} /></button>
                    <button onClick={() => onAlign(0, 'center')} title="Align Center X" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignCenterH size={10} /></button>
                    <button onClick={() => onAlign(0, 'max')} title="Align Right" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignRight size={10} /></button>
                    <button onClick={() => onDistribute(0)} title="Distribute X" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-teal-500/30 border-dashed"><MoveHorizontal size={10} /></button>
                  </div>
                </div>
              </div>

              {/* Y Axis */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-white/30 w-2.5">Y</span>
                  <div className="flex gap-1 flex-1">
                    <button onClick={() => onAlign(1, 'min')} title="Align Bottom" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignBottom size={10} /></button>
                    <button onClick={() => onAlign(1, 'center')} title="Align Center Y" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignCenterV size={10} /></button>
                    <button onClick={() => onAlign(1, 'max')} title="Align Top" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignTop size={10} /></button>
                    <button onClick={() => onDistribute(1)} title="Distribute Y" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-teal-500/30 border-dashed"><MoveVertical size={10} /></button>
                  </div>
                </div>
              </div>

              {/* Z Axis */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-white/30 w-2.5">Z</span>
                  <div className="flex gap-1 flex-1">
                    <button onClick={() => onAlign(2, 'min')} title="Align Back" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignLeft className="rotate-90" size={10} /></button>
                    <button onClick={() => onAlign(2, 'center')} title="Align Center Z" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignCenterH className="rotate-90" size={10} /></button>
                    <button onClick={() => onAlign(2, 'max')} title="Align Front" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-white/10"><AlignRight className="rotate-90" size={10} /></button>
                    <button onClick={() => onDistribute(2)} title="Distribute Z" className="flex-1 h-6 flex items-center justify-center bg-white/5 hover:bg-teal-500 text-white hover:text-black rounded-md transition-all border border-teal-500/30 border-dashed"><MoreHorizontal size={10} /></button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        <div
          style={{
            right: sidebarOpen ? '376px' : '16px',
            transition: 'right 0.5s ease-in-out'
          }}
          className="absolute top-[130px] flex flex-col items-end gap-3 pointer-events-auto"
        >
          <div
            ref={zoomRef}
            className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white rounded-full p-2.5 cursor-ns-resize shadow-xl flex items-center justify-center w-10 h-10 border border-white/5 transition-colors"
            title="Drag up/down to Zoom"
          >
            <Search size={18} />
          </div>
          <div
            ref={panRef}
            className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white rounded-full p-2.5 cursor-all-scroll shadow-xl flex items-center justify-center w-10 h-10 border border-white/5 transition-colors"
            title="Drag to Pan"
          >
            <Hand size={18} />
          </div>
          <div
            onClick={onFitToSelection}
            className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-teal-500 rounded-full p-2.5 cursor-pointer shadow-xl flex items-center justify-center w-10 h-10 border border-white/5 transition-colors"
            title="Fit to Model"
          >
            <Maximize size={18} />
          </div>

          <div className="mt-1 glass-panel px-2.5 py-1.5 rounded-xl border border-white/5 flex flex-col items-center bg-black/60 shadow-inner">
            <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest leading-none mb-1">Zoom</span>
            <span className="text-[10px] font-mono font-black text-teal-500">{state.zoomPercent}%</span>
          </div>
        </div>

        {/* Bottom-Left: Create SVG Floorplan Button */}
        <div className="absolute bottom-6 left-6 pointer-events-auto z-20">
          <button
            onClick={() => setShowFloorplanModal(true)}
            className="flex items-center gap-2.5 px-5 py-3 bg-[#1a1a1a]/90 backdrop-blur-xl hover:bg-teal-500 text-white/70 hover:text-black rounded-2xl border border-white/10 hover:border-teal-500 transition-all shadow-[0_10px_40px_rgba(0,0,0,0.5)] group"
          >
            <svg className="w-4 h-4 text-teal-500 group-hover:text-black transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 3v18" />
            </svg>
            <span className="text-[10px] font-black uppercase tracking-widest">{t('Create SVG Floorplan', 'SVG 평면도 생성')}</span>
          </button>
        </div>

        <AnimatePresence>
          {state.items.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-auto"
            >
              <div className="glass-panel px-8 py-3 rounded-full border border-white/10 opacity-90 flex items-center gap-3 shadow-2xl">
                <Upload className="w-4 h-4 text-teal-500" />
                <span className="text-[11px] text-white/80 font-mono tracking-widest uppercase font-bold">
                  {t('Drag & Drop .gltf, .glb, or .svg to load', '.gltf, .glb, 또는 .svg 파일을 드래그하여 불러오세요')}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <aside
        style={{
          width: sidebarOpen ? '360px' : '0px',
          opacity: sidebarOpen ? 1 : 0,
          transition: 'width 0.5s ease-in-out, opacity 0.5s ease-in-out',
          background: `radial-gradient(circle at bottom right, rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.1) 0%, #1a1a1a 80%)`
        }}
        className="h-full border-l border-white/10 bg-[#1a1a1a] flex flex-col relative z-30 overflow-hidden shrink-0 pointer-events-auto"
      >
        <div className="flex border-b border-white/10 shrink-0">
          <button
            onClick={() => setActiveTab('objects')}
            className={`flex-1 py-3 text-[12px] font-black uppercase transition-all relative ${activeTab === 'objects' ? 'text-teal-500 bg-white/5' : 'text-white/30 hover:text-white/60'}`}
          >
            {activeTab === 'objects' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500" />}
            {t('Objects', '오브젝트')}
          </button>
          <button
            onClick={() => setActiveTab('lights')}
            className={`flex-1 py-3 text-[12px] font-black uppercase transition-all relative ${activeTab === 'lights' ? 'text-teal-500 bg-white/5' : 'text-white/30 hover:text-white/60'}`}
          >
            {activeTab === 'lights' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500" />}
            {t('Lights', '조명')}
          </button>
          <button
            onClick={() => setActiveTab('materials')}
            className={`flex-1 py-3 text-[12px] font-black uppercase transition-all relative ${activeTab === 'materials' ? 'text-teal-500 bg-white/5' : 'text-white/30 hover:text-white/60'}`}
          >
            {activeTab === 'materials' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500" />}
            {t('Materials', '재질')}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-3 text-[12px] font-black uppercase transition-all relative ${activeTab === 'settings' ? 'text-teal-500 bg-white/5' : 'text-white/30 hover:text-white/60'}`}
          >
            {activeTab === 'settings' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500" />}
            {t('Scene', '설정')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="p-5 flex flex-col gap-6 w-[360px]">
            {activeTab === 'objects' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                <section className="space-y-1.5">
                  <div className="flex items-center gap-2.5 mb-1 px-1.5 h-7">
                    <Box className="w-3.5 h-3.5 text-teal-500" />
                    <h2 className="text-xs font-black uppercase tracking-widest text-white/50">{t('Primitives', '도형')}</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { type: 'box', icon: <Box size={12} />, label: 'Box' },
                      { type: 'sphere', icon: <Circle size={12} />, label: 'Sphere' },
                      { type: 'plane', icon: <Layout size={12} />, label: 'Plane' },
                    ].map(btn => (
                      <button
                        key={btn.type}
                        onClick={() => {
                          internalUIActionRef.current = true;
                          onAddItem(btn.type as any, undefined, btn.label);
                        }}
                        className="flex flex-col items-center justify-center gap-1.5 p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-all text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white group"
                      >
                        <span className="text-teal-500 group-hover:scale-110 transition-transform">{btn.icon}</span>
                        <span className="opacity-60">{btn.type}</span>
                      </button>
                    ))}
                  </div>
                </section>
                <section>
                  <div className="flex items-center gap-2.5 mb-1 px-1.5 h-7">
                    <Library className="w-3.5 h-3.5 text-teal-500" />
                    <h2 className="text-xs font-black uppercase tracking-widest text-white/300">{t('Asset Library', '에셋 라이브러리')}</h2>
                  </div>
                  <AssetLibrary onSelect={(type, url, name) => {
                    internalUIActionRef.current = true;
                    onAddItem(type, url, name);
                  }} />
                </section>

                <section id="scene-objects-section">
                  <div id="scene-objects-layer" className="flex items-center justify-between mb-1 px-1.5 h-7 scroll-mt-4">
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-3.5 h-3.5 text-teal-500" />
                      <h2 className="text-xs font-black uppercase tracking-widest text-white/50">{t('Scene Objects', '씬 오브젝트')}</h2>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          const anyVisible = state.items.some(i => i.visible !== false);
                          onUpdateItems(Object.fromEntries(state.items.map(i => [i.id, { visible: !anyVisible }])));
                        }}
                        className={`p-1 rounded-lg transition-all border ${state.items.some(i => i.visible !== false) ? 'bg-amber-500 text-black border-amber-500' : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10'}`}
                        title="Toggle visibility for all objects"
                      >
                        {state.items.some(i => i.visible !== false) ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <button
                        onClick={() => {
                          const anyUnlocked = state.items.some(i => !i.locked);
                          onUpdateItems(Object.fromEntries(state.items.map(i => [i.id, { locked: anyUnlocked }])));
                        }}
                        className={`p-1 rounded-lg transition-all border ${state.items.some(i => !i.locked) ? 'bg-teal-500 text-black border-teal-500' : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10'}`}
                        title="Toggle lock for all objects"
                      >
                        {state.items.some(i => !i.locked) ? <Unlock size={12} /> : <Lock size={12} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                    {sceneHierarchy.map((node, idx) => {
                      if (node.type === 'item') {
                        const item = node.item;
                        return (
                          <div
                            key={item.id}
                            id={'object-panel-' + item.id}
                            onClick={(e) => {
                              internalUIActionRef.current = true;
                              const isMulti = e.ctrlKey || e.metaKey;
                              const isShift = e.shiftKey;

                              if (isShift && lastSelectedIndexRef.current !== null) {
                                const start = Math.min(lastSelectedIndexRef.current, idx);
                                const end = Math.max(lastSelectedIndexRef.current, idx);
                                const rangeNodes = sceneHierarchy.slice(start, end + 1);
                                const rangeIds: string[] = [];
                                rangeNodes.forEach(rn => {
                                  if (rn.type === 'item') rangeIds.push(rn.item.id);
                                  else rn.items.forEach(ri => rangeIds.push(ri.id));
                                });

                                const nextIds = Array.from(new Set([...state.selectedIds, ...rangeIds]));
                                onUpdateState({ selectedIds: nextIds });
                              } else {
                                onSelect(item.id, isMulti);
                                if (!isMulti) lastSelectedIndexRef.current = idx;
                              }
                            }}
                            className={`px-3 py-2 rounded-xl border transition-all duration-300 relative overflow-hidden flex items-center justify-between cursor-pointer ${state.selectedIds.includes(item.id) ? `border-teal-500 bg-teal-500/[0.04] shadow-[0_5px_15px_${accentRgba(0.05)}]` : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`p-1 rounded-lg transition-all ${state.selectedIds.includes(item.id) ? 'bg-teal-500/10 text-teal-500' : 'bg-white/5 text-white/30'}`}>
                                {item.type === 'box' && <Box size={12} />}
                                {item.type === 'sphere' && <Circle size={12} />}
                                {item.type === 'plane' && <Layout size={12} />}
                                {item.type === 'model' && <Box size={12} />}
                              </div>
                              <div className="flex flex-col min-w-0">
                                {editingNameId === item.id ? (
                                  <input
                                    type="text"
                                    value={editingNameValue}
                                    autoFocus
                                    onClick={e => e.stopPropagation()}
                                    className="bg-black/60 border border-teal-500/50 rounded px-1.5 py-0.5 text-[10px] text-white outline-none"
                                    onBlur={() => {
                                      onUpdateItem(item.id, { name: editingNameValue });
                                      setEditingNameId(null);
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        onUpdateItem(item.id, { name: editingNameValue });
                                        setEditingNameId(null);
                                      }
                                    }}
                                  />
                                ) : (
                                  <span
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      setEditingNameId(item.id);
                                      setEditingNameValue(item.name);
                                    }}
                                    className={`text-[10px] font-black uppercase tracking-tight truncate transition-colors ${state.selectedIds.includes(item.id) ? 'text-white' : 'text-white/50'}`}
                                  >
                                    {item.name}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 pr-1 opacity-40 hover:opacity-300 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); onUpdateItem(item.id, { visible: item.visible === false }); }}
                                className="p-1 rounded-md text-white/300 hover:text-amber-500 transition-all"
                                title={item.visible === false ? "Show object" : "Hide object"}
                              >
                                {item.visible !== false ? <Eye size={12} /> : <EyeOff size={12} />}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); onUpdateItem(item.id, { locked: !item.locked }); }}
                                className="p-1 rounded-md text-white/300 hover:text-teal-500 transition-all"
                                title={item.locked ? "Unlock object" : "Lock object"}
                              >
                                {!item.locked ? <Unlock size={12} /> : <Lock size={12} />}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nextIds = state.selectedIds.filter(sid => sid !== item.id);
                                  onUpdateState({ items: state.items.filter(i => i.id !== item.id), selectedIds: nextIds });
                                }}
                                className="p-1 rounded-md text-white/300 hover:text-red-500 transition-all"
                                title="Delete object"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      } else {
                        const isGroupSelected = node.items.some(i => state.selectedIds.includes(i.id));
                        const isExpanded = expandedGroups.has(node.groupId);

                        return (
                          <div key={node.groupId} id={'object-panel-' + node.groupId} className="space-y-1">
                            <div
                              className={`px-3 py-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${isGroupSelected ? `border-teal-500 bg-teal-500/[0.04] shadow-[0_5px_15px_${accentRgba(0.05)}]` : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'}`}
                              onClick={(e) => {
                                internalUIActionRef.current = true;
                                const isShift = e.shiftKey;
                                if (isShift && lastSelectedIndexRef.current !== null) {
                                  const start = Math.min(lastSelectedIndexRef.current, idx);
                                  const end = Math.max(lastSelectedIndexRef.current, idx);
                                  const rangeNodes = sceneHierarchy.slice(start, end + 1);
                                  const rangeIds: string[] = [];
                                  rangeNodes.forEach(rn => {
                                    if (rn.type === 'item') rangeIds.push(rn.item.id);
                                    else rn.items.forEach(ri => rangeIds.push(ri.id));
                                  });
                                  const nextIds = Array.from(new Set([...state.selectedIds, ...rangeIds]));
                                  onUpdateState({ selectedIds: nextIds });
                                } else {
                                  onSelect(node.groupId, e.shiftKey || e.ctrlKey || e.metaKey, true);
                                  if (!e.shiftKey && !(e.ctrlKey || e.metaKey)) lastSelectedIndexRef.current = idx;
                                }
                              }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <button
                                  onClick={(e) => toggleGroupExpansion(node.groupId, e)}
                                  className={`p-1 -ml-1.5 rounded bg-transparent ${isGroupSelected ? 'text-teal-500 hover:text-teal-400' : 'text-white/30 hover:text-white/80'} transition-colors`}
                                >
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                                <span className={`text-white/50 ${isGroupSelected ? 'text-teal-500' : ''}`}><Folder size={12} /></span>
                                <span className={`text-[10px] font-black uppercase tracking-tight truncate ${isGroupSelected ? 'text-white' : 'text-white/60'}`}>Group</span>
                              </div>
                            </div>

                            <AnimatePresence initial={false}>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="pl-4 ml-3 border-l border-white/10 space-y-1 overflow-hidden"
                                >
                                  {node.items.map(item => (
                                    <div
                                      key={item.id}
                                      id={'object-panel-' + item.id}
                                      onClick={(e) => {
                                        internalUIActionRef.current = true;
                                        onSelect(item.id, e.shiftKey || e.ctrlKey || e.metaKey);
                                      }}
                                      className={`px-3 py-1.5 rounded-lg border transition-all duration-300 relative flex items-center justify-between cursor-pointer ${state.selectedIds.includes(item.id) ? 'border-teal-500/50 bg-teal-500/5' : 'border-transparent hover:bg-white/5'}`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div className={`text-white/30 ${state.selectedIds.includes(item.id) ? 'text-teal-500' : ''}`}>
                                          {item.type === 'box' && <Square size={10} />}
                                          {item.type === 'sphere' && <div className="w-2 h-2 rounded-full border border-current" />}
                                          {item.type === 'plane' && <Layout size={10} />}
                                          {item.type === 'model' && <Box size={10} />}
                                        </div>
                                        {editingNameId === item.id ? (
                                          <input
                                            type="text"
                                            value={editingNameValue}
                                            autoFocus
                                            onClick={e => e.stopPropagation()}
                                            className="bg-black/80 border border-teal-500/50 rounded px-1.5 py-0.5 text-[10px] text-white outline-none w-full"
                                            onBlur={() => {
                                              onUpdateItem(item.id, { name: editingNameValue });
                                              setEditingNameId(null);
                                            }}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') {
                                                onUpdateItem(item.id, { name: editingNameValue });
                                                setEditingNameId(null);
                                              }
                                            }}
                                          />
                                        ) : (
                                          <span
                                            onDoubleClick={(e) => {
                                              e.stopPropagation();
                                              setEditingNameId(item.id);
                                              setEditingNameValue(item.name);
                                            }}
                                            className={`text-[10px] font-bold uppercase tracking-tight truncate ${state.selectedIds.includes(item.id) ? 'text-white' : 'text-white/50'}`}
                                          >
                                            {item.name}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 pr-1 opacity-40 hover:opacity-300 transition-opacity">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); onUpdateItem(item.id, { visible: item.visible === false }); }}
                                          className="p-1 rounded-md text-white/300 hover:text-amber-500 transition-all"
                                          title={item.visible === false ? "Show object" : "Hide object"}
                                        >
                                          {item.visible !== false ? <Eye size={10} /> : <EyeOff size={10} />}
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); onUpdateItem(item.id, { locked: !item.locked }); }}
                                          className="p-1 rounded-md text-white/300 hover:text-teal-500 transition-all"
                                          title={item.locked ? "Unlock object" : "Lock object"}
                                        >
                                          {!item.locked ? <Unlock size={10} /> : <Lock size={10} />}
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const nextIds = state.selectedIds.filter(sid => sid !== item.id);
                                            onUpdateState({ items: state.items.filter(i => i.id !== item.id), selectedIds: nextIds });
                                          }}
                                          className="p-1 rounded-md text-white/300 hover:text-red-500 transition-all"
                                          title="Delete object"
                                        >
                                          <Trash2 size={10} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      }
                    })}
                    {state.items.length === 0 && (
                      <div className="py-8 text-center border-2 border-dashed border-white/5 rounded-2xl opacity-30">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white">Empty Scene</span>
                      </div>
                    )}
                  </div>
                </section>

                {selectedItem && (
                  <section id="selected-object-properties" className="space-y-4 pt-4 border-t border-white/5 animate-in slide-in-from-right duration-400">
                    <div className="flex items-center justify-between bg-teal-500/5 p-2 rounded-lg border border-teal-500/10">
                      <div className="flex items-center gap-2">
                        <div className={`w-1 h-1 rounded-full bg-teal-500 shadow-[0_0_10px_${ACCENT_400}] animate-pulse`} />
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-teal-500">{t('Properties', '속성')}</h2>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">{t('Identity', '이름')}</span>
                        <input
                          type="text"
                          value={selectedItem.name}
                          onChange={(e) => onUpdateItem(selectedItem.id, { name: e.target.value })}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-bold text-white focus:border-teal-500/50 outline-none transition-all shadow-inner"
                        />
                      </div>

                      <div className="space-y-4 pt-1">
                        {[
                          { field: 'position', icon: <Move />, label: t('Position', '위치') },
                          { field: 'scale', icon: <Scaling />, label: t('Scale', '크기') },
                          { field: 'rotation', icon: <RotateCw />, label: t('Rotation', '회전') }
                        ].map(config => (
                          <div key={config.field} className="space-y-1.5">
                            <div className="flex items-center gap-1.5 pr-2">
                              <div className="text-teal-500/40">{React.cloneElement(config.icon as any, { size: 10 })}</div>
                              <span className="text-[7.5px] text-white/30 font-black uppercase tracking-widest">{config.label}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              {['X', 'Y', 'Z'].map((l, i) => (
                                <div key={l} className="relative group">
                                  <input
                                    type="number" step={config.field === 'rotation' ? "1" : "0.001"}
                                    value={config.field === 'rotation'
                                      ? Math.round((selectedItem.rotation[i] * 180) / Math.PI)
                                      : Number(selectedItem[config.field as 'position' | 'scale' | 'rotation'][i].toFixed(3))
                                    }
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      if (config.field === 'rotation') {
                                        updateField(selectedItem.id, 'rotation', i, val * (Math.PI / 180));
                                      } else {
                                        updateField(selectedItem.id, config.field as any, i, val);
                                      }
                                    }}
                                    className="w-full bg-black/40 border border-white/5 group-hover:border-teal-500/30 rounded px-1.5 py-1 text-center text-[10px] font-mono font-bold text-white outline-none focus:border-teal-500/50 transition-all shadow-inner"
                                  />
                                  <span className="absolute top-0.5 right-1.5 text-[10px] text-white/[0.30] font-black group-hover:text-teal-500/20">{l}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Box className="w-3 h-3 text-teal-500/40" />
                            <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">{t('Dimensions', '치수')}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {['W', 'H', 'D'].map((l, i) => (
                              <div key={l} className="relative group">
                                <input
                                  type="number" step="0.001"
                                  value={Number((selectedItem.dimensions?.[i] ?? 1).toFixed(3))}
                                  onChange={(e) => {
                                    const dims = [...(selectedItem.dimensions || [1, 1, 1])] as [number, number, number];
                                    const val = parseFloat(e.target.value);
                                    dims[i] = isNaN(val) ? 0 : val;
                                    onUpdateItem(selectedItem.id, { dimensions: dims });
                                  }}
                                  className="w-full bg-black/60 border border-white/5 group-hover:border-teal-500/30 rounded-lg px-2 py-2 text-center text-[10px] font-mono font-bold text-white outline-none focus:border-teal-500/50 transition-all shadow-inner"
                                />
                                <span className="absolute top-0.5 right-1.5 text-[10px] text-white/[0.30] font-black group-hover:text-teal-500/20">{l}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-white/5 space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              onClick={() => onUpdateItem(selectedItem.id, { doubleSide: !selectedItem.doubleSide })}
                              className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${!selectedItem.doubleSide ? 'bg-teal-500/10 border-teal-500/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                            >
                              <span className="text-[10px] font-black uppercase text-white/50">Culling</span>
                              <span className={`text-[10px] font-black ${!selectedItem.doubleSide ? 'text-teal-500' : 'text-white/30'}`}>{!selectedItem.doubleSide ? 'ACTIVE' : 'OFF'}</span>
                            </button>
                            <button
                              onClick={() => onUpdateItem(selectedItem.id, { flipNormals: !selectedItem.flipNormals })}
                              className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${selectedItem.flipNormals ? 'bg-teal-500/10 border-teal-500/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                            >
                              <span className="text-[10px] font-black uppercase text-white/50">Inversion</span>
                              <span className={`text-[10px] font-black ${selectedItem.flipNormals ? 'text-teal-500' : 'text-white/30'}`}>{selectedItem.flipNormals ? 'FLIPPED' : 'NORMAL'}</span>
                            </button>
                            <button
                              onClick={() => onUpdateItem(selectedItem.id, { castShadow: selectedItem.castShadow === false ? true : false })}
                              className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${selectedItem.castShadow !== false ? 'bg-teal-500/10 border-teal-500/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                            >
                              <span className="text-[10px] font-black uppercase text-white/50">Shadows</span>
                              <span className={`text-[10px] font-black ${selectedItem.castShadow !== false ? 'text-teal-500' : 'text-white/30'}`}>{selectedItem.castShadow !== false ? 'ON' : 'OFF'}</span>
                            </button>
                          </div>

                          {selectedItem.hasGlass && (
                            <div className="space-y-4 pt-2">
                              <div className="space-y-2">
                                <div className="flex justify-between text-[10px] text-white/50 font-black uppercase tracking-widest">
                                  <span>Glass Opacity</span>
                                  <span className="text-teal-500">{(selectedItem.glassOpacity ?? 0.3).toFixed(2)}</span>
                                </div>
                                <input
                                  type="range" min="0" max="1" step="0.05"
                                  value={selectedItem.glassOpacity ?? 0.3}
                                  onChange={(e) => onUpdateItem(selectedItem.id, { glassOpacity: parseFloat(e.target.value) })}
                                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                />
                              </div>

                              <div className="flex items-center justify-between p-2.5 bg-black/40 rounded-xl border border-white/5 shadow-inner">
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-black text-white/50 uppercase tracking-widest leading-none mb-1">Glass Base Color</span>
                                  <span className="text-[10px] font-mono text-teal-500 uppercase tracking-widest">{selectedItem.glassColor || 'Default'}</span>
                                </div>
                                <div className="relative w-7 h-7 rounded-lg overflow-hidden border border-white/20 hover:border-teal-500 transition-all shadow-lg">
                                  <input
                                    type="color"
                                    value={selectedItem.glassColor || '#ffffff'}
                                    onChange={(e) => onUpdateItem(selectedItem.id, { glassColor: e.target.value })}
                                    className="absolute -inset-4 w-16 h-16 cursor-pointer"
                                  />
                                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-black/20 to-transparent" />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="flex justify-between text-[10px] text-white/50 font-black uppercase tracking-widest">
                                  <span>Glass Metalness</span>
                                  <span className="text-teal-500">{(selectedItem.glassMetalness ?? 0.1).toFixed(2)}</span>
                                </div>
                                <input
                                  type="range" min="0" max="1" step="0.05"
                                  value={selectedItem.glassMetalness ?? 0.1}
                                  onChange={(e) => onUpdateItem(selectedItem.id, { glassMetalness: parseFloat(e.target.value) })}
                                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="flex justify-between text-[10px] text-white/50 font-black uppercase tracking-widest">
                                  <span>Glass Roughness</span>
                                  <span className="text-teal-500">{(selectedItem.glassRoughness ?? 0.1).toFixed(2)}</span>
                                </div>
                                <input
                                  type="range" min="0" max="1" step="0.05"
                                  value={selectedItem.glassRoughness ?? 0.1}
                                  onChange={(e) => onUpdateItem(selectedItem.id, { glassRoughness: parseFloat(e.target.value) })}
                                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                />
                              </div>
                            </div>
                          )}


                          <div className="space-y-4 pt-2">
                            {/* Base Color Picker */}
                            <div className={`flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5 shadow-inner transition-all ${selectedItem.textureId && selectedItem.textureId !== 'none' ? 'opacity-30 pointer-events-none' : ''}`}>
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-white/50 uppercase tracking-widest leading-none mb-1">Base Color Tint</span>
                                <span className="text-[10px] font-mono text-teal-500 uppercase tracking-widest">{selectedItem.color || 'Default'}</span>
                              </div>
                              <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-white/20 hover:border-teal-500 transition-all shadow-lg">
                                <input
                                  type="color"
                                  value={selectedItem.color || '#94a3b8'}
                                  onChange={(e) => onUpdateItem(selectedItem.id, { color: e.target.value })}
                                  className="absolute -inset-4 w-16 h-16 cursor-pointer"
                                />
                                <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-black/20 to-transparent" />
                              </div>
                            </div>

                            {/* Texture Selection */}
                            <div className="space-y-2">
                              <span className="text-[10px] font-black text-white/50 uppercase tracking-widest px-1">Material Asset</span>
                              <TextureSelector
                                textures={allTextures}
                                selectedId={selectedItem.textureId || 'none'}
                                onSelect={(tid) => {
                                  const updates: Partial<FurnitureItem> = { textureId: tid };
                                  if (tid !== 'none' && selectedItem.textureTiling === undefined) {
                                    updates.textureTiling = true;
                                  }
                                  onUpdateItem(selectedItem.id, updates);
                                }}
                                onEditMaterial={(mid) => {
                                  setActiveTab('materials');
                                  setJumpToMaterialId(mid);
                                }}
                                language={state.language}
                              />
                            </div>

                            {/* Tiling Controls */}
                            {selectedItem.textureId && selectedItem.textureId !== 'none' && (
                              <div className="p-3 bg-black/40 rounded-xl border border-white/5 shadow-inner space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Texture Tiling</span>
                                  <button
                                    onClick={() => onUpdateItem(selectedItem.id, { textureTiling: !selectedItem.textureTiling })}
                                    className={`w-9 h-4.5 rounded-full transition-all relative p-0.5 border ${selectedItem.textureTiling ? 'bg-teal-500/20 border-teal-500/30' : 'bg-black/40 border-white/10'}`}
                                  >
                                    <div className={`w-3 h-3 rounded-full transition-all ${selectedItem.textureTiling ? `translate-x-[18px] bg-teal-500 shadow-[0_0_10px_${accentRgba(0.5)}]` : 'translate-x-0 bg-white/20'}`} />
                                  </button>
                                </div>

                                {selectedItem.textureTiling && (
                                  <div className="space-y-4 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                                    {/* Density (Density) */}
                                    <div className="space-y-2">
                                      <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-widest">
                                        <span>{t('Tiling Density', '개체 타일 밀도')}</span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        {[0, 1].map(idx => (
                                          <div key={idx} className="flex flex-col gap-1.5">
                                            <div className="flex justify-between text-[10px] text-white/30">
                                              <span>{idx === 0 ? 'X SCALE' : 'Y SCALE'}</span>
                                              <EditableNumber
                                                value={selectedItem.textureDensity?.[idx] || 1}
                                                onChange={(val) => {
                                                  const dens = [...(selectedItem.textureDensity || [1, 1])] as [number, number];
                                                  dens[idx] = val;
                                                  onUpdateItem(selectedItem.id, { textureDensity: dens });
                                                }}
                                              />
                                            </div>
                                            <input
                                              type="range" min="0.1" max="10" step="0.1"
                                              value={selectedItem.textureDensity?.[idx] || 1}
                                              onChange={(e) => {
                                                const dens = [...(selectedItem.textureDensity || [1, 1])] as [number, number];
                                                dens[idx] = parseFloat(e.target.value);
                                                onUpdateItem(selectedItem.id, { textureDensity: dens });
                                              }}
                                              className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Offset */}
                                    <div className="space-y-2">
                                      <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-widest">
                                        <span>{t('Tiling Offset', '개체 타일 오프셋')}</span>
                                        <button
                                          onClick={() => onUpdateState({ gizmoMode: state.gizmoMode === 'texture' ? 'translate' : 'texture' })}
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase transition-all ${state.gizmoMode === 'texture' ? 'bg-teal-500 text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
                                        >
                                          {state.gizmoMode === 'texture' ? 'Gizmo Active' : 'Use 3D Gizmo'}
                                        </button>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        {[0, 1].map(idx => (
                                          <div key={idx} className="flex flex-col gap-1.5">
                                            <div className="flex justify-between text-[10px] text-white/30">
                                              <span>{idx === 0 ? 'X OFFSET' : 'Y OFFSET'}</span>
                                              <EditableNumber
                                                value={selectedItem.textureOffset?.[idx] || 0}
                                                onChange={(val) => {
                                                  const off = [...(selectedItem.textureOffset || [0, 0])] as [number, number];
                                                  off[idx] = val;
                                                  onUpdateItem(selectedItem.id, { textureOffset: off });
                                                }}
                                                precision={2}
                                              />
                                            </div>
                                            <input
                                              type="range" min="-1" max="1" step="0.01"
                                              value={selectedItem.textureOffset?.[idx] || 0}
                                              onChange={(e) => {
                                                const off = [...(selectedItem.textureOffset || [0, 0])] as [number, number];
                                                off[idx] = parseFloat(e.target.value);
                                                onUpdateItem(selectedItem.id, { textureOffset: off });
                                              }}
                                              className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Displacement Scale */}
                            {selectedItem.textureId && selectedItem.textureId !== 'none' && (() => {
                              const appliedTex = allTextures.find(t => t.id === selectedItem.textureId);
                              if (!appliedTex?.maps?.displacement) return null;
                              const dispVal = selectedItem.displacementScale ?? appliedTex?.displacementScale ?? 0.1;
                              return (
                                <div className="p-3 bg-black/40 rounded-xl border border-white/5 shadow-inner space-y-2">
                                  <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-widest">
                                    <span>Displacement Scale</span>
                                    <EditableNumber
                                      value={dispVal}
                                      onChange={(val) => onUpdateItem(selectedItem.id, { displacementScale: val })}
                                      precision={3}
                                    />
                                  </div>
                                  <input
                                    type="range" min="0" max="1" step="0.001"
                                    value={dispVal}
                                    onChange={(e) => onUpdateItem(selectedItem.id, { displacementScale: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                  />
                                </div>
                              );
                            })()}
                          </div>

                          <div className="pt-3 space-y-3">
                            <div className="flex items-center justify-between px-1">
                              <div className="flex items-center gap-2">
                                <Scissors className="w-3 h-3 text-teal-500/40" />
                                <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">{t('Subtraction System', '객체 결합 및 제거')}</span>
                              </div>
                              <button
                                onClick={() => {
                                  const newSub = { id: uuidv4(), type: 'box' as const, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], dimensions: [0.5, 0.5, 0.5] as [number, number, number] };
                                  onUpdateItem(selectedItem.id, { subtractions: [...(selectedItem.subtractions || []), newSub] }, true);
                                  setSelectedSubId(newSub.id);
                                }}
                                className="px-2 py-0.5 bg-teal-500/10 hover:bg-teal-500 text-teal-500 hover:text-black rounded-lg text-[10px] font-black uppercase tracking-widest border border-teal-500/20 transition-all"
                              >
                                {t('Add Hole', '구멍 추가')}
                              </button>
                            </div>
                            <div className="space-y-2">
                              {(selectedItem.subtractions || []).map(sub => (
                                <div key={sub.id} className="space-y-2">
                                  <div
                                    onClick={() => setSelectedSubId(selectedSubId === sub.id ? null : sub.id)}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${selectedSubId === sub.id ? 'bg-teal-500/10 border-teal-500/50' : 'bg-black/40 border-white/5 hover:border-white/10'}`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className={`w-2 h-2 rounded-full ${selectedSubId === sub.id ? 'bg-teal-500 shadow-[0_0_8px_#2dd4bf] animate-pulse' : 'bg-white/10'}`} />
                                      <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-white/80 uppercase tracking-widest">{sub.type} Boolean</span>
                                        <span className="text-[10px] text-white/30 font-mono tracking-tighter uppercase">{sub.id.slice(0, 8)}</span>
                                      </div>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdateItem(selectedItem.id, { subtractions: selectedItem.subtractions?.filter(s => s.id !== sub.id) }, true);
                                        if (selectedSubId === sub.id) setSelectedSubId(null);
                                      }}
                                      className="p-1.5 rounded-lg text-white/30 hover:text-red-500 transition-colors hover:bg-red-500/10"
                                    >
                                      <Trash size={12} />
                                    </button>
                                  </div>
                                  {selectedSubId === sub.id && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="ml-3 pl-3 border-l-2 border-teal-500/20 space-y-3">
                                      <div className="space-y-2">
                                        <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">Position Matrix</span>
                                        <div className="grid grid-cols-3 gap-1.5">
                                          {['X', 'Y', 'Z'].map((l, i) => (
                                            <input
                                              key={l} type="number" step="0.1"
                                              value={Number(sub.position[i].toFixed(2))}
                                              onChange={(e) => {
                                                const newSubs = selectedItem.subtractions!.map(s => {
                                                  if (s.id !== sub.id) return s;
                                                  const pos = [...s.position] as [number, number, number];
                                                  pos[i] = parseFloat(e.target.value) || 0;
                                                  return { ...s, position: pos };
                                                });
                                                onUpdateItem(selectedItem.id, { subtractions: newSubs }, true);
                                              }}
                                              className="bg-black/60 border border-white/5 rounded-lg px-1 py-1.5 text-center text-[10px] font-mono font-bold text-white outline-none focus:border-teal-500/30 shadow-inner"
                                            />
                                          ))}
                                        </div>
                                      </div>
                                      <div className="space-y-2">
                                        <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">Dimension Matrix</span>
                                        <div className="grid grid-cols-3 gap-1.5">
                                          {['W', 'H', 'D'].map((l, i) => (
                                            <input
                                              key={l} type="number" step="0.1"
                                              value={sub.dimensions[i] ?? 1}
                                              onChange={(e) => {
                                                const newSubs = selectedItem.subtractions!.map(s => {
                                                  if (s.id !== sub.id) return s;
                                                  const dims = [...s.dimensions] as [number, number, number];
                                                  const val = parseFloat(e.target.value);
                                                  dims[i] = isNaN(val) ? 0 : val;
                                                  return { ...s, dimensions: dims };
                                                });
                                                onUpdateItem(selectedItem.id, { subtractions: newSubs }, true);
                                              }}
                                              className="bg-black/60 border border-white/5 rounded-lg px-1 py-1.5 text-center text-[10px] font-mono font-bold text-white outline-none focus:border-teal-500/30 shadow-inner"
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            )}

            {activeTab === 'lights' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                <section>
                  <div className="flex items-center gap-2.5 mb-1 px-1.5 h-7">
                    <Lightbulb className="w-3.5 h-3.5 text-teal-500" />
                    <h2 className="text-xs font-black uppercase tracking-widest text-white/50">{t('Lighting', '조명 설정')}</h2>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { type: 'point', icon: <Lightbulb size={14} />, color: 'amber' },
                      { type: 'spot', icon: <Zap size={14} />, color: 'teal' },
                      { type: 'directional', icon: <Sun size={14} />, color: 'blue' },
                      { type: 'ambient', icon: <Circle size={14} />, color: 'indigo' }
                    ].map(btn => (
                      <button
                        key={btn.type}
                        onClick={() => onAddLight(btn.type)}
                        className="flex flex-col items-center gap-1.5 p-2 bg-white/[0.03] hover:bg-white/10 border border-white/5 rounded-xl transition-all group"
                      >
                        <div className="text-white/30 group-hover:text-white">{btn.icon}</div>
                        <span className="text-[10px] font-black uppercase text-white/30 group-hover:text-white tracking-widest">{t(btn.type.slice(0, 3), btn.type === 'point' ? '점' : btn.type === 'spot' ? '스포트' : btn.type === 'directional' ? '직사' : '주변')}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section id="lights-section">
                  <div id="scene-lights-layer" className="flex items-center justify-between mb-1 px-1.5 h-7 scroll-mt-4">
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-3.5 h-3.5 text-teal-500" />
                      <h2 className="text-xs font-black uppercase tracking-widest text-white/50">{t('Scene Lights', '씬 라이트')}</h2>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={toggleAllLightsStatus}
                        className={`p-1 rounded-lg transition-all border ${state.lights.some(l => l.enabled) ? 'bg-amber-500 text-black border-amber-500' : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10'}`}
                        title="Toggle all lights"
                      >
                        <Power size={12} />
                      </button>
                      <button
                        onClick={() => setShowGizmos(!showGizmos)}
                        className={`p-1 rounded-lg transition-all border ${showGizmos ? 'bg-teal-500 text-black border-teal-500' : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10'}`}
                        title="Toggle global gizmos"
                      >
                        {showGizmos ? <Unlock size={12} /> : <Lock size={12} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                    {state.lights.map((light, index) => (
                      <div
                        key={light.id}
                        id={'light-panel-' + light.id}
                        onClick={(e) => {
                          internalUIActionRef.current = true;
                          const isShift = e.shiftKey;
                          const isMulti = e.ctrlKey || e.metaKey;
                          if (isShift && lastSelectedIndexRef.current !== null) {
                            const start = Math.min(lastSelectedIndexRef.current, index);
                            const end = Math.max(lastSelectedIndexRef.current, index);
                            const rangeIds = state.lights.slice(start, end + 1).map(l => l.id);
                            const nextIds = Array.from(new Set([...state.selectedIds, ...rangeIds]));
                            onUpdateState({ selectedIds: nextIds });
                          } else {
                            onSelect(light.id, isMulti);
                            if (!isMulti) lastSelectedIndexRef.current = index;
                          }
                        }}
                        className={`px-3 py-2 rounded-xl border transition-all duration-300 relative overflow-hidden flex items-center justify-between cursor-pointer ${state.selectedIds.includes(light.id) ? 'border-teal-500 bg-teal-500/[0.04] shadow-[0_5px_15px_rgba(45,212,191,0.05)]' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-1 rounded-lg transition-all ${light.enabled ? 'bg-amber-500/10 text-amber-500' : 'bg-white/5 text-white/30'}`}>
                            {light.type === 'point' && <Lightbulb size={12} />}
                            {light.type === 'spot' && <Zap size={12} />}
                            {light.type === 'directional' && <Sun size={12} />}
                            {light.type === 'ambient' && <Circle size={12} />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            {editingNameId === light.id ? (
                              <input
                                type="text"
                                value={editingNameValue}
                                autoFocus
                                onClick={e => e.stopPropagation()}
                                className="bg-black/60 border border-teal-500/50 rounded px-1.5 py-0.5 text-[10px] text-white outline-none"
                                onBlur={() => {
                                  onUpdateLight(light.id, { name: editingNameValue });
                                  setEditingNameId(null);
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    onUpdateLight(light.id, { name: editingNameValue });
                                    setEditingNameId(null);
                                  }
                                }}
                              />
                            ) : (
                              <span
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setEditingNameId(light.id);
                                  setEditingNameValue(light.name || (light.type.charAt(0).toUpperCase() + light.type.slice(1) + ' Light'));
                                }}
                                className={`text-[10px] font-black uppercase tracking-tight truncate transition-colors ${state.selectedIds.includes(light.id) ? 'text-white' : 'text-white/50'}`}
                              >
                                {light.name || (light.type.charAt(0).toUpperCase() + light.type.slice(1) + ' Light')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 pr-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); onUpdateLight(light.id, { enabled: !light.enabled }); }}
                            className={`p-1 rounded-md transition-all border ${light.enabled ? 'bg-amber-500 text-black border-amber-500' : 'bg-white/5 text-white/30 border-white/5 hover:bg-white/10'}`}
                          >
                            <Power size={10} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextLights = state.lights.filter(l => l.id !== light.id);
                              onUpdateState({ lights: nextLights, selectedIds: state.selectedIds.filter(sid => sid !== light.id) });
                            }}
                            className="p-1 rounded-md hover:bg-red-500 text-white/30 hover:text-black border border-transparent transition-all"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {(() => {
                  const selectedLight = state.lights.find(l => state.selectedIds.includes(l.id));
                  if (!selectedLight) return null;

                  return (
                    <section id="selected-light-properties" className="space-y-6 pt-6 border-t border-white/5 animate-in slide-in-from-right duration-400">
                      <div className="flex items-center justify-between bg-teal-500/5 p-3 rounded-xl border border-teal-500/10">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-teal-500 shadow-[0_0_10px_#2dd4bf] animate-pulse" />
                          <h2 className="text-[10px] font-black uppercase tracking-widest text-teal-500">{t('Properties', '속성')}</h2>
                        </div>
                        <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">{selectedLight.type} module</span>
                      </div>

                      <div className="space-y-5">
                        {selectedLight.type !== 'ambient' && (
                          <div className="space-y-4">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2rem]">{t('Spatial Matrix', '공간 좌표')} ({unit})</span>
                            <div className="grid grid-cols-3 gap-2">
                              {[0, 1, 2].map(i => (
                                <div key={i} className="relative group">
                                  <input
                                    type="number" step={unit === 'm' ? "0.001" : "1"}
                                    value={unit === 'm' ? Number((selectedLight.position?.[i] || 0).toFixed(3)) : Number(((selectedLight.position?.[i] || 0) * 100).toFixed(1))}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      const pos = [...(selectedLight.position || [0, 0, 0])] as [number, number, number];
                                      pos[i] = unit === 'm' ? val : val / 100;
                                      onUpdateLight(selectedLight.id, { position: pos });
                                    }}
                                    className="w-full bg-black/60 border border-white/5 rounded-xl px-2 py-3 text-[11px] font-mono font-bold text-white focus:border-teal-500/50 outline-none transition-all shadow-inner"
                                  />
                                  <span className="absolute top-1 right-2 text-[10px] text-white/[0.30] font-black group-hover:text-teal-500/20">{['X', 'Y', 'Z'][i]}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">
                              <span>{t('Flux Intensity', '광도 강도')}</span>
                              <span className="text-teal-500">{selectedLight.intensity.toFixed(2)}</span>
                            </div>
                            <input
                              type="range" min="0" max={selectedLight.type === 'ambient' ? 2 : 10} step="0.01"
                              value={selectedLight.intensity}
                              onChange={(e) => onUpdateLight(selectedLight.id, { intensity: parseFloat(e.target.value) })}
                              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                            />
                          </div>

                          {(selectedLight.type === 'point' || selectedLight.type === 'spot') && (
                            <div className="space-y-2">
                              <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">
                                <span>Beam Distance</span>
                                <span className="text-teal-500">{selectedLight.distance?.toFixed(2) || '0.00'}</span>
                              </div>
                              <input
                                type="range" min="0" max="100" step="0.1"
                                value={selectedLight.distance || 0}
                                onChange={(e) => onUpdateLight(selectedLight.id, { distance: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                              />
                            </div>
                          )}

                          {selectedLight.type === 'spot' && (
                            <>
                              <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black text-white/30 uppercase">
                                  <span>{t('Aperture Angle', '조사 각도')}</span>
                                  <span className="text-teal-500">{((selectedLight.angle || 0) * (180 / Math.PI)).toFixed(1)}°</span>
                                </div>
                                <input
                                  type="range" min="0.05" max="1.5" step="0.01"
                                  value={selectedLight.angle || Math.PI / 3}
                                  onChange={(e) => onUpdateLight(selectedLight.id, { angle: parseFloat(e.target.value) })}
                                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black text-white/30 uppercase">
                                  <span>{t('Penumbra (Softness)', '반영 (부드러움)')}</span>
                                  <span className="text-teal-500">{(selectedLight.penumbra || 0).toFixed(2)}</span>
                                </div>
                                <input
                                  type="range" min="0" max="1" step="0.01"
                                  value={selectedLight.penumbra || 0}
                                  onChange={(e) => onUpdateLight(selectedLight.id, { penumbra: parseFloat(e.target.value) })}
                                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                />
                              </div>
                            </>
                          )}

                          {(selectedLight.type === 'point' || selectedLight.type === 'spot') && (
                            <div className="space-y-2">
                              <div className="flex justify-between text-[10px] font-black text-white/30 uppercase">
                                <span>{t('Beam Decay', '광량 감쇄')}</span>
                                <span className="text-teal-500">{(selectedLight.decay || 1).toFixed(2)}</span>
                              </div>
                              <input
                                type="range" min="0" max="10" step="0.1"
                                value={selectedLight.decay || 2}
                                onChange={(e) => onUpdateLight(selectedLight.id, { decay: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                              />
                            </div>
                          )}

                          {selectedLight.type !== 'ambient' && (
                            <div className="space-y-2 mt-4 mb-2 p-3 bg-black/40 rounded-xl border border-white/5 shadow-inner">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black text-white/50 uppercase leading-none mt-0.5">{t('Cast Shadows', '그림자 생성')}</span>
                                </div>
                                <button
                                  onClick={() => onUpdateLight(selectedLight.id, { castShadow: selectedLight.castShadow === false ? true : false })}
                                  className={`w-9 h-4.5 rounded-full transition-all relative p-0.5 border ${selectedLight.castShadow !== false ? 'bg-teal-500/20 border-teal-500/30' : 'bg-black/40 border-white/10'}`}
                                >
                                  <div className={`w-3 h-3 rounded-full transition-all ${selectedLight.castShadow !== false ? 'translate-x-[18px] bg-teal-500 shadow-[0_0_10px_rgba(45,212,191,0.5)]' : 'translate-x-0 bg-white/20'}`} />
                                </button>
                              </div>

                              {selectedLight.castShadow !== false && (
                                <div className="pt-3 mt-1 border-t border-white/10 space-y-2">
                                  <div className="flex justify-between text-[10px] font-black text-white/30 uppercase">
                                    <span>{t('Shadow Softness', '그림자 부드러움')}</span>
                                    <span className="text-teal-500">{Number(selectedLight.shadowRadius ?? 2).toFixed(1)}</span>
                                  </div>
                                  <input
                                    type="range" min="0.5" max="15" step="0.5"
                                    value={selectedLight.shadowRadius ?? 2}
                                    onChange={(e) => onUpdateLight(selectedLight.id, { shadowRadius: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5 shadow-inner mt-2">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-white/50 uppercase leading-none mb-1">{t('Chromaticity Vector', '색도 벡터')}</span>
                              <span className="text-[10px] font-mono text-teal-500 uppercase tracking-widest">{selectedLight.color}</span>
                            </div>
                            <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-white/20 hover:border-teal-500 transition-all shadow-lg">
                              <input
                                type="color"
                                value={selectedLight.color}
                                onChange={(e) => onUpdateLight(selectedLight.id, { color: e.target.value })}
                                className="absolute -inset-4 w-20 h-20 cursor-pointer"
                              />
                              <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-black/20 to-transparent" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  );
                })()}

                {state.lights.length === 0 && (
                  <div className="py-12 text-center border-2 border-dashed border-white/5 rounded-[40px] bg-black/20">
                    <Layers className="w-10 h-10 text-white/30 mx-auto mb-4" />
                    <p className="text-[10px] text-white/30 font-black uppercase">No active nodes</p>
                  </div>
                )}
              </div>
            )}


            {activeTab === 'materials' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300 pb-12">
                {/* 1. Materials Library Section */}
                <section>
                  <MaterialsLibrary
                    language={state.language || 'ko'}
                    onAddTexture={(tex) => {
                      onUpdateState({ customTextures: [...(state.customTextures || []), tex] });
                    }}
                  />
                </section>

                {/* 2. Custom Materials Section (Properties) */}
                <section className="pt-6 border-t border-white/5">
                  <div className="flex items-center justify-between mb-4 px-1.5 h-7">
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-3.5 h-3.5 text-teal-500" />
                      <h2 className="text-xs font-black uppercase text-white/50">{t('Custom Materials', '커스텀 재질')}</h2>
                    </div>
                    <button
                      onClick={() => {
                        const newId = uuidv4();
                        const newTex: TextureConfig = { id: newId, name: 'New Material', color: '#ffffff', opacity: 1, metalness: 0.1, roughness: 0.7, displacementScale: 0, isCustom: true };
                        onUpdateState({ customTextures: [...(state.customTextures || []), newTex] });
                      }}
                      className="p-1.5 bg-teal-500/10 hover:bg-teal-500 text-teal-500 hover:text-black rounded-lg transition-all"
                      title={t('Add New Material', '새 재질 추가')}
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  {/* Material Drop Zone */}
                  <div
                    onDragEnter={(e) => { e.preventDefault(); setIsDraggingMaterials(true); }}
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingMaterials(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDraggingMaterials(false); }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      setIsDraggingMaterials(false);

                      const rawFiles = Array.from(e.dataTransfer.files);
                      const supportedExtensions = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'];
                      const validFiles: File[] = [];
                      const invalidFiles: string[] = [];

                      rawFiles.forEach(f => {
                        const ext = f.name.split('.').pop()?.toLowerCase() || '';
                        if (supportedExtensions.includes(ext)) {
                          validFiles.push(f);
                        } else {
                          invalidFiles.push(f.name);
                        }
                      });

                      if (invalidFiles.length > 0) {
                        alert(`지원하지 않는 파일이 포함되어 있습니다: ${invalidFiles.join(', ')}\n(PNG, JPG, WEBP 형식의 이미지만 지원합니다.)`);
                      }

                      if (validFiles.length === 0) return;

                      const groups: Record<string, any> = {};
                      for (const file of validFiles) {
                        const dataUrl = await new Promise<string>((resolve) => {
                          const reader = new FileReader();
                          reader.onload = (ev) => resolve(ev.target?.result as string);
                          reader.readAsDataURL(file);
                        });

                        const mapType = identifyTextureType(file.name);
                        let baseName = file.name.replace(/\.[^/.]+$/, "");
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
                            id: uuidv4(),
                            name: baseName.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                            color: '#ffffff',
                            isCustom: true,
                            maps: {},
                            repeat: [2, 2],
                            metalness: 0.1,
                            roughness: 0.7,
                            displacementScale: 0
                          };
                        }
                        groups[baseName].maps[mapType] = dataUrl;
                        // Set url if it's a color map, OR if no url exists yet (fallback for first map)
                        if (mapType === 'color' || !groups[baseName].url) {
                          groups[baseName].url = dataUrl;
                        }
                      }

                      const newMats = Object.values(groups);
                      if (newMats.length > 0) {
                        onUpdateState({ customTextures: [...(state.customTextures || []), ...newMats as any] });
                      }
                    }}
                    className={`mb-4 mx-1.5 py-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group cursor-pointer ${isDraggingMaterials
                      ? 'border-teal-500 bg-teal-500/10 scale-[1.02]'
                      : 'border-white/5 bg-white/[0.02] hover:border-teal-500/50'
                      }`}
                  >
                    <div className={`p-3 rounded-full transition-all ${isDraggingMaterials ? 'bg-teal-500/20 text-teal-500' : 'bg-white/5 group-hover:bg-teal-500/20 group-hover:text-teal-500'}`}>
                      <Library size={20} className={isDraggingMaterials ? 'text-teal-500' : 'text-white/20 group-hover:text-teal-500'} />
                    </div>
                    <div className="text-center">
                      <p className={`text-[10px] font-black uppercase transition-colors ${isDraggingMaterials ? 'text-white' : 'text-white/40 group-hover:text-white'}`}>{t('Drop Material Maps', '재질 맵 이미지를 드롭하세요')}</p>
                      <p className={`text-[8px] font-bold uppercase tracking-tighter transition-colors ${isDraggingMaterials ? 'text-teal-500/60' : 'text-white/10'}`}>{t('Auto-groups by filename (albedo, normal, etc)', '파일명으로 자동 분류 (albedo, normal 등)')}</p>
                    </div>
                  </div>

                  <TextureManagerPanel
                    textures={state.customTextures || []}
                    expandedId={jumpToMaterialId}
                    onExpandedChange={(id) => {
                      if (id !== jumpToMaterialId) setJumpToMaterialId(id);
                    }}
                    onUpdate={(id, updates) => {
                      const next = (state.customTextures || []).map(t => t.id === id ? { ...t, ...updates } : t);
                      onUpdateState({ customTextures: next });
                    }}
                    onDelete={(id) => onUpdateState({ customTextures: (state.customTextures || []).filter(t => t.id !== id) })}
                    onAddNew={() => {
                      const newId = uuidv4();
                      const newTex = { id: newId, name: 'New Material', color: '#ffffff', opacity: 1, metalness: 0.1, roughness: 0.7, isCustom: true };
                      onUpdateState({ customTextures: [...(state.customTextures || []), newTex] });
                    }}
                    language={state.language}
                  />
                </section>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300 pb-12">
                {/* 3. Environment Section */}
                <section>
                  <div className="flex items-center gap-2.5 mb-1 px-1.5 h-7">
                    <Sun className="w-3.5 h-3.5 text-teal-500" />
                    <h2 className="text-xs font-black uppercase text-white/50">{t('Environment', '환경 설정')}</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {['city', 'sunset', 'night', 'warehouse'].map(env => (
                      <button
                        key={env}
                        onClick={() => onUpdateState({ environment: env as any })}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${state.environment === env ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10'}`}
                      >
                        {env}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 space-y-4 px-1.5">
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest leading-none">
                        <span>{t('Intensity', '강도')}</span>
                        <span className="text-teal-500">{(state.intensity || 0).toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min="0" max="5" step="0.01"
                        value={state.intensity || 0}
                        onChange={(e) => onUpdateState({ intensity: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest leading-none">
                        <span>{t('Background Blur', '배경 흐림')}</span>
                        <span className="text-teal-500">{(state.environmentBlur || 0).toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.01"
                        value={state.environmentBlur || 0}
                        onChange={(e) => onUpdateState({ environmentBlur: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                      />
                    </div>
                    <div className="space-y-1.5 mt-4">
                      {[
                        { label: t('Environment', '환경 광원'), sub: t('Enable HDRI lighting source', 'HDRI 조명 활성화'), state: state.showEnvironment, key: 'showEnvironment' },
                        { label: t('Background Color', '배경 색상'), sub: t('Solid canvas backdrop', '단색 배경 채우기'), state: state.showBackgroundColor, key: 'showBackgroundColor' },
                        { label: t('Dynamic Shadows', '동적 그림자'), sub: t('Ray-based light projections', '빛 투사에 따른 실시간 그림자'), state: state.realtimeShadows, key: 'realtimeShadows' },
                        { label: t('Ground Grid', '바닥 그리드'), sub: t('Scene alignment reference', '배치 가이드 그리드 표시'), state: state.showGrid, key: 'showGrid' }
                      ].map((item) => (
                        <div key={item.key} className="space-y-3 p-3 bg-black/40 rounded-xl border border-white/5 shadow-inner">
                          <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">{item.label}</span>
                              <span className="text-[10px] text-white/30 uppercase tracking-tighter">{item.sub}</span>
                            </div>
                            <button
                              onClick={() => onUpdateState({ [item.key]: !(state as any)[item.key] })}
                              className={`w-10 h-5 rounded-full transition-all relative p-0.5 border ${item.state ? 'bg-teal-500/20 border-teal-500/30' : 'bg-black/40 border-white/10'}`}
                            >
                              <div className={`w-3.5 h-3.5 rounded-full transition-all ${item.state ? 'translate-x-5 bg-teal-500 shadow-[0_0_10px_rgba(45,212,191,0.5)]' : 'translate-x-0 bg-white/20'}`} />
                            </button>
                          </div>

                          {item.key === 'showBackgroundColor' && item.state && (
                            <div className="pt-3 border-t border-white/5 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                              <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-widest leading-none">
                                <span>{t('Backdrop Color', '배경 색상')}</span>
                                <span className="text-teal-500 font-mono uppercase">{state.backgroundColor}</span>
                              </div>
                              <input
                                type="color"
                                value={state.backgroundColor}
                                onChange={(e) => onUpdateState({ backgroundColor: e.target.value })}
                                className="w-full h-6 bg-transparent cursor-pointer rounded overflow-hidden border-none"
                              />
                            </div>
                          )}

                          {item.key === 'showGrid' && item.state && (
                            <div className="pt-3 border-t border-white/5 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                              <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black text-white/30 uppercase tracking-widest leading-none">
                                  <span>{t('Grid Color', '그리드 색상')}</span>
                                  <span className="text-teal-500 font-mono uppercase">{state.gridColor}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <input
                                    type="color"
                                    value={state.gridColor}
                                    onChange={(e) => onUpdateState({ gridColor: e.target.value })}
                                    className="w-full h-6 bg-transparent cursor-pointer rounded overflow-hidden border-none"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                {/* 4. Post-processing Section */}
                <section className="pt-6 border-t border-white/5 space-y-4">
                  <div className="flex items-center gap-2.5 mb-1 px-1.5 h-7">
                    <Maximize className="w-3.5 h-3.5 text-teal-500" />
                    <h2 className="text-xs font-black uppercase tracking-widest text-white/50">{t('Post Processing', '후처리 설정')}</h2>
                  </div>

                  <div className="space-y-4 px-1.5">
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest leading-none">
                        <span>{t('Vignette Size', '비네트 크기')}</span>
                        <span className="text-teal-500">{(state.vignetteSize || 0).toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.01"
                        value={state.vignetteSize || 0}
                        onChange={(e) => onUpdateState({ vignetteSize: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest leading-none">
                        <span>{t('Vignette Darkness', '비네트 어두움')}</span>
                        <span className="text-teal-500">{(state.vignetteDarkness || 0).toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.01"
                        value={state.vignetteDarkness || 0}
                        onChange={(e) => onUpdateState({ vignetteDarkness: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest leading-none">
                        <span>{t('Bloom Intensity', '블룸 강도')}</span>
                        <span className="text-teal-500">{(state.bloomIntensity || 0).toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min="0" max="2" step="0.01"
                        value={state.bloomIntensity || 0}
                        onChange={(e) => onUpdateState({ bloomIntensity: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal-500"
                      />
                    </div>
                  </div>
                </section>

                {/* 4. Scene Management Section */}
                <section className="pt-6 border-t border-white/5 space-y-3">
                  <div className="flex items-center gap-2.5 mb-1 px-1.5 h-7">
                    <Settings className="w-3.5 h-3.5 text-teal-500" />
                    <h2 className="text-xs font-black uppercase tracking-widest text-white/50">{t('Scene Management', '씬 관리')}</h2>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-col gap-1.5">
                      <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em] px-1.5 mb-1 flex items-center gap-2">
                        <Download size={10} /> {t('GLTF Export Options', 'GLTF 내보내기 옵션')}
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        <button
                          onClick={() => onExport('all')}
                          className="flex items-center justify-between gap-3 px-4 py-3 bg-teal-500/10 hover:bg-teal-500 text-teal-500 hover:text-black font-black uppercase rounded-xl text-[10px] transition-all border border-teal-500/20 shadow-xl group"
                        >
                          <div className="flex items-center gap-3">
                            <Layers size={14} className="group-hover:scale-110 transition-transform" />
                            <span>{t('Export All', '전체 내보내기')}</span>
                          </div>
                          <span className="text-[10px] opacity-50 font-mono">.GLB</span>
                        </button>

                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => onExport('objects')}
                            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white font-black uppercase tracking-widest rounded-xl text-[10px] transition-all border border-white/5 group"
                          >
                            <Box size={12} /> {t('Objects Only', '오브젝트만')}
                          </button>
                          <button
                            onClick={() => onExport('lights')}
                            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white font-black uppercase tracking-widest rounded-xl text-[10px] transition-all border border-white/5 group"
                          >
                            <Lightbulb size={12} /> {t('Lights Only', '조명만')}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/5 mt-2">
                      <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em] px-1.5 mb-2 flex items-center gap-2">
                        <Upload size={10} /> {t('Scene Configuration', '씬 구성 설정')}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => onExport('json')}
                          className="flex items-center justify-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white font-black uppercase tracking-widest rounded-xl text-[10px] transition-all border border-white/5 group"
                        >
                          <Download size={14} /> {t('Export JSON', 'JSON 내보내기')}
                        </button>
                        <label className="flex items-center justify-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white font-black uppercase tracking-widest rounded-xl text-[10px] transition-all border border-white/5 cursor-pointer group">
                          <Upload size={14} /> {t('Import JSON', 'JSON 불러오기')}
                          <input type="file" accept=".json" className="hidden" onChange={onImport} />
                        </label>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 5. System Footer */}
                <div className="mt-6 pt-6 border-t border-white/5 opacity-50">
                  <div className="bg-black/40 p-4 rounded-2xl border border-white/5 shadow-inner">
                    <p className="text-[10px] font-mono leading-relaxed text-white/30 uppercase space-y-1">
                      <span className="block border-b border-white/5 pb-2 mb-2 text-teal-500/80 font-black text-[10px]">{t('Engine Status', '엔진 상태')} (V4.2)</span>
                      <span className="flex justify-between"><span>{t('Core', '코어')}:</span> <span className="text-white/60">PHYSICAL_PBR_BETA</span></span>
                      <span className="flex justify-between"><span>{t('Active Nodes', '활성 노드')}:</span> <span className="text-white/60">{state.items.length + state.lights.length} CHANNEL(S)</span></span>
                      <span className="flex justify-between"><span>{t('Render State', '렌더링 상태')}:</span> <span className="text-teal-500/50">STABLE_DIFFUSION_O1</span></span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <button
        style={{
          right: sidebarOpen ? '345px' : '15px',
          transition: 'right 0.5s ease-in-out'
        }}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute top-1/2 -translate-y-1/2 z-50 bg-[#0a0a0a]/80 backdrop-blur-xl hover:bg-teal-500 text-white hover:text-black p-2 rounded-full border border-white/10 transition-all pointer-events-auto shadow-[0_15px_35px_rgba(0,0,0,0.5)] group"
      >
        {sidebarOpen ? <ChevronRight size={18} className="group-hover:scale-110 transition-transform" /> : <ChevronLeft size={18} className="group-hover:scale-110 transition-transform" />}
      </button>

      {/* Floorplan to SVG Modal */}
      <FloorplanToSvg
        isOpen={showFloorplanModal}
        onClose={() => setShowFloorplanModal(false)}
        onApply={(svgData) => {
          if (onSvgUpload) {
            const blob = new Blob([svgData], { type: 'image/svg+xml' });
            const file = new File([blob], "edited_floorplan.svg", { type: 'image/svg+xml' });
            onSvgUpload([file]);
          }
        }}
        language={state.language}
        onLanguageChange={(lang) => onUpdateState({ language: lang })}
      />
    </>
  );
};
