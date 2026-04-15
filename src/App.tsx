import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AppState, FurnitureItem, FurnitureType, TextureConfig } from './types';
import { Scene } from './components/Scene';
import { UI } from './components/UI';

import * as THREE from 'three';
// @ts-ignore
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader';
import { v4 as uuidv4 } from 'uuid';
import { motion } from 'framer-motion';
// @ts-ignore
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
// @ts-ignore
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
// @ts-ignore
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
import { Box } from 'lucide-react';

const staticTextures: TextureConfig[] = [];

const initialState: AppState = {
  items: [],
  selectedIds: [],
  lights: [
    { id: 'ambient', name: 'Ambient Light', type: 'ambient', intensity: 0.5, color: '#ffffff', enabled: true },
    { id: 'sun', name: 'Sun Light', type: 'directional', intensity: 1, position: [10, 10, 10], color: '#fff5e6', castShadow: true, enabled: true },
  ],
  environment: 'city',
  customTextures: [],
  intensity: 1,
  zoomPercent: 100,
  unit: 'm',
  realtimeShadows: true,
  showEnvironment: true,
  showGrid: true,
  gizmoMode: 'translate',
  vignetteSize: 0.3,
  vignetteDarkness: 0.3,
  bloomIntensity: 0.05,
  environmentBlur: 0.8,
  gridColor: '#ffffff',
  showBackgroundColor: false,
  backgroundColor: '#ffffff',
  language: 'en'
};

const expandSelectionWithGroups = (ids: string[], items: FurnitureItem[]): string[] => {
  const expandedIds = new Set(ids);
  const groupIds = new Set<string>();
  ids.forEach(id => {
    const item = items.find(i => i.id === id);
    if (item && item.groupId) groupIds.add(item.groupId);
  });
  if (groupIds.size > 0) {
    items.forEach(item => {
      if (item.groupId && groupIds.has(item.groupId)) {
        expandedIds.add(item.id);
      }
    });
  }
  return Array.from(expandedIds);
};

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [previewSelectedIds, setPreviewSelectedIds] = useState<string[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [history, setHistory] = useState<AppState[]>([]);
  const [redoStack, setRedoStack] = useState<AppState[]>([]);
  const [fitSignal, setFitSignal] = useState(0);
  const zoomRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<any>(null);
  const viewCenterRef = useRef<[number, number, number]>([0, 0, 0]);

  const [shiftPressed, setShiftPressed] = useState(false);
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDraggingViewport, setIsDraggingViewport] = useState(false);

  const saveToHistory = useCallback((newState: AppState) => {
    setHistory(prev => [...prev.slice(-19), state]);
    setRedoStack([]);
  }, [state]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoStack(rs => [...rs, state]);
    setHistory(h => h.slice(0, -1));
    setState(prev);
  }, [history, state]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(h => [...h, state]);
    setRedoStack(rs => rs.slice(0, -1));
    setState(next);
  }, [redoStack, state]);

  const handleGroup = useCallback(() => {
    setState(prev => {
      const selectedItemsCount = prev.items.filter(i => prev.selectedIds.includes(i.id)).length;
      if (selectedItemsCount < 2) return prev;
      saveToHistory(prev);
      const newGroupId = uuidv4();
      return {
        ...prev,
        items: prev.items.map(item => prev.selectedIds.includes(item.id) ? { ...item, groupId: newGroupId } : item)
      };
    });
  }, [saveToHistory]);

  const handleUngroup = useCallback(() => {
    setState(prev => {
      const hasGroupedItems = prev.items.some(i => prev.selectedIds.includes(i.id) && i.groupId);
      if (!hasGroupedItems) return prev;
      saveToHistory(prev);
      return {
        ...prev,
        items: prev.items.map(item => prev.selectedIds.includes(item.id) ? { ...item, groupId: undefined } : item)
      };
    });
  }, [saveToHistory]);

  const handleAddItem = (type: FurnitureType, data?: string, name?: string) => {
    saveToHistory(state);
    const newItem: FurnitureItem = {
      id: uuidv4(),
      type,
      name: name || `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      position: [...viewCenterRef.current] as [number, number, number],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#ffffff',
      subtractions: []
    };
    if (type === 'svg') {
      newItem.svgData = data;
      newItem.rotation = [0, 0, 0];
    } else if (type === 'model') {
      newItem.url = data;
    } else if (type === 'clock') {
      newItem.dimensions = [1.2, 0.85, 0.05];
    } else {
      newItem.url = data;
    }
    setState(prev => ({ ...prev, items: [...prev.items, newItem], selectedIds: [newItem.id] }));
    setSelectedSubId(null);
  };

  const handleSelectSub = (subId: string | null) => {
    setSelectedSubId(subId);
  };

  const handleSelect = (id: string | null, multi = false, isGroupSelect = false) => {
    // If selecting a new object, clear the active sub-selection
    if (!id || (!isGroupSelect && !state.selectedIds.includes(id))) {
      setSelectedSubId(null);
    }

    if (!id) {
      if (!multi) setState(prev => ({ ...prev, selectedIds: [], gizmoMode: 'translate' }));
      return;
    }

    setState(prev => {
      let idsToToggle: string[] = [];
      if (isGroupSelect) {
        idsToToggle = prev.items.filter(i => i.groupId === id).map(i => i.id);
      } else {
        idsToToggle = [id];
      }

      if (multi) {
        const newIds = new Set(prev.selectedIds);
        const allSelected = idsToToggle.every(tid => newIds.has(tid));

        if (allSelected) {
          idsToToggle.forEach(tid => newIds.delete(tid));
        } else {
          idsToToggle.forEach(tid => newIds.add(tid));
        }
        return { ...prev, selectedIds: Array.from(newIds) };
      } else {
        return { ...prev, selectedIds: idsToToggle };
      }
    });
  };

  const handleDeleteItems = useCallback(() => {
    if (state.selectedIds.length === 0) return;
    saveToHistory(state);
    setState({
      ...state,
      items: state.items.filter(item => !state.selectedIds.includes(item.id)),
      lights: state.lights.filter(light => !state.selectedIds.includes(light.id)),
      selectedIds: []
    });
    setSelectedSubId(null);
  }, [state, saveToHistory]);

  const handleUpdateItem = (id: string, updates: Partial<FurnitureItem>, undoable = true) => {
    if (undoable) saveToHistory(state);
    setState(prev => {
      const isLocking = updates.locked === true;
      const nextSelectedIds = isLocking 
        ? prev.selectedIds.filter(sid => sid !== id)
        : prev.selectedIds;

      return {
        ...prev,
        selectedIds: nextSelectedIds,
        items: prev.items.map(item => item.id === id ? { ...item, ...updates } : item)
      };
    });
  };

  const handleUpdateLight = (id: string, updates: Partial<any>, undoable = false) => {
    if (undoable) saveToHistory(state);
    setState(prev => ({
      ...prev,
      lights: prev.lights.map(light => light.id === id ? { ...light, ...updates } : light)
    }));
  };

  const handleAddLight = (type: string) => {
    saveToHistory(state);
    const newLight = {
      id: uuidv4(),
      name: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Light`,
      type: type as any,
      enabled: true,
      position: [viewCenterRef.current[0], 4, viewCenterRef.current[2]] as [number, number, number],
      intensity: type === 'ambient' ? 0.5 : 1,
      color: '#ffffff',
      distance: 10,
      decay: 2,
      castShadow: true,
      angle: Math.PI / 3,
      penumbra: 0.1,
      rotation: [0, 0, 0] as [number, number, number],
      shape: 'sphere' as any
    };
    setState(prev => ({
      ...prev,
      lights: [...prev.lights, newLight],
      selectedIds: [newLight.id]
    }));
    setSelectedSubId(null);
  };

  const handleUpdateItems = (updatesMap: { [id: string]: Partial<FurnitureItem> }, undoable = true) => {
    if (undoable) saveToHistory(state);
    setState(prev => {
      const lockedIds = Object.entries(updatesMap)
        .filter(([_, up]) => up.locked === true)
        .map(([id]) => id);
      
      const nextSelectedIds = prev.selectedIds.filter(sid => !lockedIds.includes(sid));

      return {
        ...prev,
        selectedIds: nextSelectedIds,
        items: prev.items.map(item => updatesMap[item.id] ? { ...item, ...updatesMap[item.id] } : item)
      };
    });
  };

  const handleUpdateLights = (updatesMap: { [id: string]: Partial<any> }, undoable = true) => {
    if (undoable) saveToHistory(state);
    setState(prev => ({
      ...prev,
      lights: prev.lights.map(light => updatesMap[light.id] ? { ...light, ...updatesMap[light.id] } : light)
    }));
  };

  const [expandedLights, setExpandedLights] = useState<Set<string>>(new Set());
  const [showGizmos, setShowGizmos] = useState(true);

  const toggleAllLightsStatus = () => {
    saveToHistory(state);
    const anyEnabled = state.lights.some(l => l.enabled);
    setState(prev => ({
      ...prev,
      lights: prev.lights.map(l => ({ ...l, enabled: !anyEnabled }))
    }));
  };

  const handleAlign = (axis: 0 | 1 | 2, type: 'min' | 'center' | 'max') => {
    if (state.selectedIds.length < 2) return;
    saveToHistory(state);
    const selected = state.items.filter(o => state.selectedIds.includes(o.id));
    const values = selected.map(o => o.position[axis]);

    let targetValue = 0;
    if (type === 'min') targetValue = Math.min(...values);
    else if (type === 'max') targetValue = Math.max(...values);
    else targetValue = values.reduce((a, b) => a + b, 0) / values.length;

    const updates: { [id: string]: Partial<FurnitureItem> } = {};
    state.selectedIds.forEach(id => {
      const item = state.items.find(o => o.id === id);
      if (item) {
        const newPos = [...item.position] as [number, number, number];
        newPos[axis] = targetValue;
        updates[id] = { position: newPos };
      }
    });
    handleUpdateItems(updates, false);
  };

  const handleDistribute = (axis: 0 | 1 | 2) => {
    if (state.selectedIds.length < 3) return;
    saveToHistory(state);
    const selected = state.items.filter(o => state.selectedIds.includes(o.id));
    const sorted = [...selected].sort((a, b) => a.position[axis] - b.position[axis]);

    const min = sorted[0].position[axis];
    const max = sorted[sorted.length - 1].position[axis];
    const count = sorted.length;
    const step = (max - min) / (count - 1);

    const updates: { [id: string]: Partial<FurnitureItem> } = {};
    sorted.forEach((o, index) => {
      const newPos = [...o.position] as [number, number, number];
      newPos[axis] = min + index * step;
      updates[o.id] = { position: newPos };
    });
    handleUpdateItems(updates, false);
  };

  const handleBoxSelect = (ids: string[], isFinal: boolean) => {
    if (isFinal) {
      setState(prev => ({ ...prev, selectedIds: ids }));
      setPreviewSelectedIds([]);
    } else {
      setPreviewSelectedIds(ids);
    }
  };

  const exportScene = (mode: 'all' | 'objects' | 'lights' | 'json' = 'json') => {
    if (mode === 'json') {
      const data = JSON.stringify(state, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `scene-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      return;
    }

    if (!sceneRef.current) return;
    const { scene } = sceneRef.current;
    const exporter = new GLTFExporter();
    
    // Create a temporary scene for selective export
    const exportScene = new THREE.Scene();
    
    scene.traverse((obj: any) => {
      // Check for furniture objects (only at top level group)
      const isFurniture = obj.userData?.isFurniture && obj instanceof THREE.Group;
      // Check for lights
      const isLight = (obj.userData?.isLight || obj instanceof THREE.Light) && (obj.parent === scene || obj.parent?.userData?.isLight);

      if (mode === 'all') {
        if (isFurniture || isLight) {
          const clone = obj.clone();
          // Clean up gizmos inside the clone
          clone.traverse((child: any) => {
            if (child.userData?.isGizmo || child.userData?.isHelper || child.name?.includes('Pivot')) {
              child.visible = false; // Hide from export
              // Or better: remove from clone
              if (child.parent) child.parent.remove(child);
            }
          });
          exportScene.add(clone);
        }
      } else if (mode === 'objects') {
        if (isFurniture) {
          const clone = obj.clone();
          clone.traverse((child: any) => {
            if (child.userData?.isGizmo || child.userData?.isHelper || child.name?.includes('Pivot')) {
              if (child.parent) child.parent.remove(child);
            }
          });
          exportScene.add(clone);
        }
      } else if (mode === 'lights') {
        if (isLight) {
          const clone = obj.clone();
          exportScene.add(clone);
        }
      }
    });

    exporter.parse(
      exportScene,
      (gltf) => {
        const output = JSON.stringify(gltf);
        const blob = new Blob([output], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `export-${mode}-${new Date().toISOString().slice(0, 10)}.gltf`;
        link.click();
      },
      (error) => console.error('Export failed:', error),
      { binary: false }
    );
  };

  const importScene = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        setState(JSON.parse(ev.target?.result as string));
        setHistory([]);
        setRedoStack([]);
      } catch (err) {
        alert('Import failed');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string);
        saveToHistory(state);
        setState(imported);
        setSelectedSubId(null);
      } catch (err) { alert('Invalid scene file.'); }
    };
    reader.readAsText(file);
  };

  const handleSvgUpload = async (files: File[]) => {
    const localNewObjects: FurnitureItem[] = [];
    const loader = new SVGLoader();

    interface PendingSvg {
      id: string;
      name: string;
      svgData: string;
      center: THREE.Vector2;
      size: THREE.Vector2;
      area: number;
      extrusion: number;
      type: string;
    }

    const batch: PendingSvg[] = [];

    for (const file of files) {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'image/svg+xml');
      const svgElement = doc.querySelector('svg');
      if (!svgElement) continue;

      const viewBox = svgElement.getAttribute('viewBox');
      const width = parseFloat(svgElement.getAttribute('width') || '0');
      const height = parseFloat(svgElement.getAttribute('height') || '0');

      let vb = [0, 0, 100, 100];
      if (viewBox) {
        vb = viewBox.split(' ').map(parseFloat);
      } else if (width && height) {
        vb = [0, 0, width, height];
      }

      const candidates = Array.from(doc.querySelectorAll('#wall, #wall-mass, #wall-stroke, #glass, #ceiling, #floor'));

      const processElement = (targetEl: Element, typeId: string, label: string) => {
        const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        tempSvg.setAttribute('viewBox', vb.join(' '));
        tempSvg.appendChild(targetEl.cloneNode(true));
        const svgData = tempSvg.outerHTML;

        const result = loader.parse(svgData);
        if (result.paths.length === 0) return;

        const box = new THREE.Box2();
        result.paths.forEach(path => {
          const shapes = SVGLoader.createShapes(path);
          shapes.forEach(shape => {
            shape.curves.forEach(curve => {
              const pts = curve.getPoints(10);
              pts.forEach(p => box.expandByPoint(new THREE.Vector2(p.x, p.y)));
            });
          });
        });

        const center = new THREE.Vector2();
        box.getCenter(center);
        const size = new THREE.Vector2();
        box.getSize(size);
        const area = size.x * size.y;

        let extrusion = 2;
        if (typeId === 'ceiling' || typeId === 'floor') extrusion = 0; // True flat plane

        batch.push({
          id: typeId,
          name: `${file.name} - ${label}`,
          svgData,
          center,
          size,
          area,
          extrusion,
          type: 'svg'
        });
      };

      candidates.forEach((el) => {
        if (el.id === 'wall') {
          const descendants = Array.from(el.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon'));
          const isSingle = descendants.length === 0;

          if (isSingle) {
            const fill = el.getAttribute('fill');
            const isMass = fill && fill !== 'none';
            processElement(el, isMass ? 'wall-mass' : 'wall-stroke', isMass ? 'Wall (Mass)' : 'Wall (Line)');
          } else {
            const fills = descendants.filter(d => d.getAttribute('fill') && d.getAttribute('fill') !== 'none');
            const strokes = descendants.filter(d => !d.getAttribute('fill') || d.getAttribute('fill') === 'none');

            if (fills.length > 0) {
              const massGroup = el.cloneNode(false) as Element;
              fills.forEach(f => massGroup.appendChild(f.cloneNode(true)));
              processElement(massGroup, 'wall-mass', 'Wall (Mass)');
            }
            if (strokes.length > 0) {
              const strokeGroup = el.cloneNode(false) as Element;
              strokes.forEach(s => strokeGroup.appendChild(s.cloneNode(true)));
              processElement(strokeGroup, 'wall-stroke', 'Wall (Line)');
            }
          }
        } else {
          const label = el.id.charAt(0).toUpperCase() + el.id.slice(1).replace('-', ' ');
          processElement(el, el.id, label);
        }
      });
    }

    if (batch.length > 0) {
      const largest = batch.reduce((prev, curr) => (curr.area > prev.area ? curr : prev), batch[0]);
      const globalRefCenterCenter = largest.center;
      const scale = 0.1;

      batch.forEach(item => {
        const isCeiling = item.id === 'ceiling';
        const isFloor = item.id === 'floor';
        const isWall = item.id.startsWith('wall');
        const isStrokeWall = item.id === 'wall-stroke';

        let extrusion = 2;
        if (isCeiling || isFloor) extrusion = 0; // True flat plane (ShapeGeometry)
        if (isStrokeWall) extrusion = 4; // Requested height for stroke walls

        const newItem: FurnitureItem = {
          id: `${item.id}-${uuidv4()}`,
          type: 'svg' as FurnitureType,
          name: item.name,
          position: [
            (item.center.x - globalRefCenterCenter.x) * scale,
            isCeiling ? 4.0 : (isWall || isStrokeWall) ? 0 : -0.005,
            (item.center.y - globalRefCenterCenter.y) * scale
          ],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: isWall ? '#e5e7eb' : isStrokeWall ? '#e5e7eb' : item.id === 'glass' ? '#93c5fd' : isCeiling ? '#eeeeee' : '#333333',
          svgData: item.svgData,
          extrusion: extrusion,
          doubleSide: !(isCeiling || isStrokeWall), // ArcLabV: backfaceCulling ON for ceiling/strokeWall
          flipNormals: (isCeiling || isStrokeWall), // ArcLabV: flipNormals ON for ceiling/strokeWall
          isHollow: isStrokeWall,
          subtractions: [],
          glassOpacity: (item.id === 'glass') ? 0.2 : undefined,
          glassMetalness: (item.id === 'glass') ? 1.0 : undefined,
          glassRoughness: (item.id === 'glass') ? 0.0 : undefined
        };
        localNewObjects.push(newItem);
      });

      saveToHistory(state);
      setState(prev => ({
        ...prev,
        items: [...prev.items, ...localNewObjects],
        selectedIds: localNewObjects.length > 0 ? [localNewObjects[0].id] : []
      }));
      setSelectedSubId(null);
    } else {
      alert('오류: SVG 파일 내부에 "wall", "floor", "ceiling" ID 정보가 하나도 없습니다.\n도면으로 변환할 레이어의 ID 설정을 확인해 주세요.');
    }
  };

  const clipboardRef = useRef<{ items: FurnitureItem[], lights: any[] } | null>(null);
  const handleCopy = useCallback(() => {
    if (state.selectedIds.length === 0) return;
    const items = state.items.filter(i => state.selectedIds.includes(i.id));
    const lights = state.lights.filter(l => state.selectedIds.includes(l.id));
    clipboardRef.current = { items: JSON.parse(JSON.stringify(items)), lights: JSON.parse(JSON.stringify(lights)) };
  }, [state.selectedIds, state.items, state.lights]);

  const handlePaste = useCallback((inPlace: boolean = false) => {
    if (!clipboardRef.current) return;
    saveToHistory(state);
    const offset = inPlace ? 0 : 0.5;

    // Remap group IDs so pasted groups are distinct from the original groups
    const groupIdMap = new Map<string, string>();
    clipboardRef.current.items.forEach(i => {
      if (i.groupId && !groupIdMap.has(i.groupId)) {
        groupIdMap.set(i.groupId, uuidv4());
      }
    });

    const newItems = clipboardRef.current.items.map(i => {
      const gId = i.groupId ? groupIdMap.get(i.groupId) : undefined;
      return {
        ...i,
        id: uuidv4(),
        groupId: gId,
        position: [i.position[0] + offset, i.position[1], i.position[2] + offset] as [number, number, number]
      };
    });
    const newLights = clipboardRef.current.lights.map(l => ({ ...l, id: uuidv4(), position: [l.position[0] + offset, l.position[1], l.position[2] + offset] as [number, number, number] }));

    setState(prev => ({
      ...prev,
      items: [...prev.items, ...newItems],
      lights: [...prev.lights, ...newLights],
      selectedIds: [...newItems.map(i => i.id), ...newLights.map(l => l.id)]
    }));
    setSelectedSubId(null);
  }, [state, saveToHistory]);

  const handleZoomChange = useCallback((percent: number) => {
    setState(prev => prev.zoomPercent === percent ? prev : { ...prev, zoomPercent: percent });
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingViewport(false);
    const files = Array.from(e.dataTransfer.files);
    
    files.forEach(file => {
      const name = file.name.toLowerCase();
      const extension = name.split('.').pop() || '';
      const supported = ['gltf', 'glb', 'svg'];
      
      if (!supported.includes(extension)) {
        alert(`지원하지 않는 파일 형식입니다: .${extension}\n(GLTF, GLB, SVG 파일만 드래그 앤 드롭이 가능합니다.)`);
        return;
      }

      const cleanName = file.name.replace(/\.[^/.]+$/, "");

      if (name.endsWith('.gltf') || name.endsWith('.glb')) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const content = ev.target?.result;
          if (!content) return;

          // GLTF Validation: Check for materials information
          const loader = new GLTFLoader();
          loader.setDRACOLoader(dracoLoader);
          loader.parse(content, '', 
            (gltf: any) => {
              const hasMaterials = gltf.parser.json.materials && gltf.parser.json.materials.length > 0;
              if (!hasMaterials) {
                alert(`오류: GLTF 파일("${file.name}") 내부에 Materials(재질) 정보가 하나도 없습니다.\n정상적인 렌더링을 위해 재질이 포함된 파일을 사용해 주세요.`);
              } else {
                // To support Furniture.tsx loading via URL, we convert the result back to DataURL if it wasn't already
                // Or just use readAsDataURL initially for the actual add, and this content for validation.
                // Let's keep it simple: we already have the content. For Furniture.tsx to work, it needs a URL.
                // DataURL is best for that.
                const dataUrlReader = new FileReader();
                dataUrlReader.onload = (dataEv) => {
                  handleAddItem('model' as FurnitureType, dataEv.target?.result as string, cleanName);
                };
                dataUrlReader.readAsDataURL(file);
              }
            },
            (error: any) => {
              alert(`GLTF 파싱 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
            }
          );
        };

        if (name.endsWith('.glb')) {
          reader.readAsArrayBuffer(file);
        } else {
          reader.readAsText(file);
        }
      } else if (name.endsWith('.svg')) {
        handleSvgUpload([file]);
      }
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      const isCmd = e.ctrlKey || e.metaKey;
      
      if (isCmd && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (state.selectedIds.length > 0) {
          const updates: { [id: string]: Partial<FurnitureItem> } = {};
          const anyUnlocked = state.items.some(i => state.selectedIds.includes(i.id) && !i.locked);
          state.selectedIds.forEach(id => {
            updates[id] = { locked: anyUnlocked };
          });
          handleUpdateItems(updates);
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') handleDeleteItems();
      else if (e.key.toLowerCase() === 'z' && isCmd) {
        if (e.shiftKey) redo(); else undo();
      }
      else if (e.key.toLowerCase() === 'y' && isCmd) redo();
      else if (e.key.toLowerCase() === 'c' && isCmd) handleCopy();
      else if (e.key.toLowerCase() === 'v' && isCmd) {
        if (e.shiftKey) handlePaste(true);
        else handlePaste(false);
      }
      else if (e.key.toLowerCase() === 'g' && isCmd) {
        e.preventDefault();
        if (e.shiftKey) handleUngroup(); else handleGroup();
      }

      if (e.shiftKey) setShiftPressed(true);
      if (isCmd) setCtrlPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.shiftKey) setShiftPressed(false);
      if (!(e.ctrlKey || e.metaKey)) setCtrlPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [handleDeleteItems, undo, redo, handleCopy, handlePaste, handleGroup, handleUngroup]);

  return (
    <div 
      className="w-full h-screen grid bg-[#0a0a0a] overflow-hidden"
      style={{ 
        gridTemplateColumns: `1fr ${sidebarOpen ? '360px' : '0px'}`,
        transition: 'grid-template-columns 0.5s ease-in-out'
      }}
    >
      <div 
        className={`relative h-full overflow-hidden ${isDraggingViewport ? 'ring-4 ring-inset ring-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.3)]' : ''}`}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingViewport(true); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingViewport(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingViewport(false); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e); }}
      >
        {isDraggingViewport && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-emerald-500/10 backdrop-blur-[2px] pointer-events-none animate-in fade-in duration-300">
            <div className="bg-[#0a0a0a]/90 p-8 rounded-[40px] border border-emerald-500/30 shadow-2xl flex flex-col items-center gap-4 transform scale-110">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center animate-bounce">
                <Box className="w-8 h-8 text-emerald-500" />
              </div>
              <div className="text-center">
                <p className="text-lg font-black uppercase tracking-widest text-white">{state.language === 'ko' ? '에셋 드롭하여 로드' : 'Drop to Load Assets'}</p>
                <p className="text-[10px] font-bold text-emerald-500/60 uppercase mt-1">GLTF • GLB • SVG</p>
              </div>
            </div>
          </div>
        )}
        <Scene
          ref={sceneRef}
          state={state}
          onSelect={handleSelect}
          onBoxSelect={handleBoxSelect}
          onSelectSub={handleSelectSub}
          previewSelectedIds={previewSelectedIds}
          selectedSubId={selectedSubId}
          onUpdate={handleUpdateItem}
          onUpdateLight={handleUpdateLight}
          onUpdateItems={handleUpdateItems}
          onUpdateLights={handleUpdateLights}
          onZoomChange={handleZoomChange}
          fitSignal={fitSignal}
          zoomRef={zoomRef}
          panRef={panRef}
          shiftPressed={shiftPressed}
          ctrlPressed={ctrlPressed}
          showGizmos={showGizmos}
          viewCenterRef={viewCenterRef}
          onUpdateState={(updates) => setState(prev => ({ ...prev, ...updates }))}
        />
      </div>
      <UI
        state={state}
        onAddItem={handleAddItem}
        onDeleteItem={handleDeleteItems}
        onUpdateItem={handleUpdateItem}
        onUpdateItems={handleUpdateItems}
        onAlign={handleAlign}
        onDistribute={handleDistribute}
        onUpdateLight={handleUpdateLight}
        onUpdateLights={handleUpdateLights}
        onAddLight={handleAddLight}
        onUpdateState={(updates) => setState(prev => ({ ...prev, ...updates }))}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.length > 0}
        canRedo={redoStack.length > 0}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        expandedLights={expandedLights}
        setExpandedLights={setExpandedLights}
        showGizmos={showGizmos}
        setShowGizmos={setShowGizmos}
        toggleAllLightsStatus={toggleAllLightsStatus}
        onFitToSelection={() => setFitSignal(s => (s + 1) % 1000)}
        onSvgUpload={handleSvgUpload}
        onExport={exportScene}
        onImport={handleImport}
        staticTextures={staticTextures}

        selectedSubId={selectedSubId}
        setSelectedSubId={setSelectedSubId}
        zoomRef={zoomRef}
        panRef={panRef}
        onSelect={handleSelect}
      />
    </div>
  );
}
