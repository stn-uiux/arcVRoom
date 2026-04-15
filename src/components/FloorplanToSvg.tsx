import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Upload, Download, ZoomIn, ZoomOut, Undo2,
  Contrast, Palette, SlidersHorizontal, RefreshCw, Pencil, Trash2, Eye, EyeOff, Spline, Grid, Lock, Unlock, ChevronUp, ChevronDown
} from 'lucide-react';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface BezierHandle { cx1: number; cy1: number; cx2: number; cy2: number; }
interface Point { x: number; y: number; bezier?: BezierHandle; }
interface SvgPath { id: string; subPaths: Point[][]; closed: boolean; locked?: boolean; visible?: boolean; color?: string; opacity?: number; }

interface ImageAdjustments {
  brightness: number;
  contrast: number;
  hue: number;
  saturation: number;
  lightness: number;
  levelBlack: number;
  levelWhite: number;
  levelGamma: number;
  threshold: number;
  wallThickness: number;   // morphological opening kernel radius (0 = off)
  invert: boolean;         // invert black/white
  minArea: number;         // minimum contour area to keep
  simplify: number;        // Douglas-Peucker epsilon
}

const DEFAULT_ADJ: ImageAdjustments = {
  brightness: 0, contrast: 80,
  hue: 0, saturation: -100, lightness: 0,
  levelBlack: 20, levelWhite: 235, levelGamma: 1.0,
  threshold: 160,
  wallThickness: 2,
  invert: false,
  minArea: 300,
  simplify: 1.5,
};

// ──────────────────────────────────────────────
// Image adjustments
// ──────────────────────────────────────────────
function applyAdjustments(src: HTMLImageElement, adj: ImageAdjustments, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  canvas.width = src.naturalWidth;
  canvas.height = src.naturalHeight;
  ctx.drawImage(src, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;

  const levelsLUT = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let v = Math.max(0, Math.min(255, ((i - adj.levelBlack) / Math.max(1, adj.levelWhite - adj.levelBlack)) * 255));
    v = 255 * Math.pow(v / 255, 1 / adj.levelGamma);
    levelsLUT[i] = Math.max(0, Math.min(255, Math.round(v)));
  }

  const bFactor = adj.brightness / 100;
  const cFactor = (259 * (adj.contrast + 255)) / (255 * (259 - adj.contrast));

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    r = levelsLUT[r]; g = levelsLUT[g]; b = levelsLUT[b];
    r = Math.min(255, Math.max(0, r + bFactor * 255));
    g = Math.min(255, Math.max(0, g + bFactor * 255));
    b = Math.min(255, Math.max(0, b + bFactor * 255));
    r = Math.min(255, Math.max(0, cFactor * (r - 128) + 128));
    g = Math.min(255, Math.max(0, cFactor * (g - 128) + 128));
    b = Math.min(255, Math.max(0, cFactor * (b - 128) + 128));

    if (adj.hue !== 0 || adj.saturation !== 0 || adj.lightness !== 0) {
      let [h, s, l] = rgbToHsl(r, g, b);
      h = ((h + adj.hue / 360) % 1 + 1) % 1;
      s = Math.max(0, Math.min(1, s + adj.saturation / 100));
      l = Math.max(0, Math.min(1, l + adj.lightness / 100));
      [r, g, b] = hslToRgb(h, s, l);
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(imageData, 0, 0);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

// ──────────────────────────────────────────────
// Morphological operations for wall extraction
// ──────────────────────────────────────────────

/** Create binary grid from canvas: 1=dark(wall), 0=light(background) */
function createBinaryGrid(canvas: HTMLCanvasElement, threshold: number, invert: boolean): { grid: Uint8Array; w: number; h: number } {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width, h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const grid = new Uint8Array(w * h);

  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const isDark = lum < threshold;
    grid[i / 4] = (invert ? !isDark : isDark) ? 1 : 0;
  }
  return { grid, w, h };
}

/** Morphological Erosion: shrinks white regions, removes thin features */
function erode(grid: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return new Uint8Array(grid);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === 0) { out[y * w + x] = 0; continue; }
      let allSet = true;
      for (let dy = -radius; dy <= radius && allSet; dy++) {
        for (let dx = -radius; dx <= radius && allSet; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue; // circular kernel
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || grid[ny * w + nx] === 0) {
            allSet = false;
          }
        }
      }
      out[y * w + x] = allSet ? 1 : 0;
    }
  }
  return out;
}

/** Morphological Dilation: grows regions back */
function dilate(grid: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return new Uint8Array(grid);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === 1) { out[y * w + x] = 1; continue; }
      let anySet = false;
      for (let dy = -radius; dy <= radius && !anySet; dy++) {
        for (let dx = -radius; dx <= radius && !anySet; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && grid[ny * w + nx] === 1) {
            anySet = true;
          }
        }
      }
      out[y * w + x] = anySet ? 1 : 0;
    }
  }
  return out;
}

/** Morphological Opening (Erode → Dilate): removes thin features while keeping thick ones */
function morphOpen(grid: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return new Uint8Array(grid);
  return dilate(erode(grid, w, h, radius), w, h, radius);
}

/** Remove small connected components below minArea */
function removeSmallRegions(grid: Uint8Array, w: number, h: number, minArea: number): Uint8Array {
  const out = new Uint8Array(grid);
  const visited = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (visited[idx] || !out[idx]) continue;

      // Flood fill to find connected component
      const component: number[] = [];
      const stack = [idx];
      while (stack.length > 0) {
        const ci = stack.pop()!;
        if (visited[ci] || !out[ci]) continue;
        visited[ci] = 1;
        component.push(ci);
        const cx = ci % w, cy = (ci - cx) / w;
        if (cx > 0) stack.push(ci - 1);
        if (cx < w - 1) stack.push(ci + 1);
        if (cy > 0) stack.push(ci - w);
        if (cy < h - 1) stack.push(ci + w);
      }

      if (component.length < minArea) {
        component.forEach(i => { out[i] = 0; });
      }
    }
  }
  return out;
}

// ──────────────────────────────────────────────
// Full wall extraction pipeline
// ──────────────────────────────────────────────
function extractWalls(canvas: HTMLCanvasElement, adj: ImageAdjustments): Uint8Array {
  let { grid, w, h } = createBinaryGrid(canvas, adj.threshold, adj.invert);

  // 1) Morphological opening: removes thin lines (furniture), keeps thick walls
  if (adj.wallThickness > 0) {
    grid = morphOpen(grid, w, h, adj.wallThickness);
  }

  // 2) Remove tiny fragments
  if (adj.minArea > 0) {
    grid = removeSmallRegions(grid, w, h, adj.minArea);
  }

  // 3) Slight dilation to fill gaps after opening
  if (adj.wallThickness > 0) {
    grid = dilate(grid, w, h, 1);
  }

  return grid;
}

/** Draw binary grid onto canvas for preview */
function drawBinaryPreview(
  grid: Uint8Array, w: number, h: number, 
  canvas: HTMLCanvasElement, originalCanvas: HTMLCanvasElement, 
  showOverlay: boolean, paths: SvgPath[], zoom: number
) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  if (showOverlay) {
    ctx.drawImage(originalCanvas, 0, 0);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1.0;

    // 1) Draw wall mask (Emerald tint)
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === 1) {
        d[i * 4] = 16; d[i * 4 + 1] = 185; d[i * 4 + 2] = 129; d[i * 4 + 3] = 160;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // 2) ★ Draw solid walls (Fill instead of Stroke for "no border" look)
    ctx.fillStyle = '#10b981';
    ctx.globalAlpha = 0.8;
    
    // Create one big path for even-odd fill in Canvas
    ctx.beginPath();
    paths.forEach(p => {
      p.subPaths.forEach(sub => {
        sub.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else {
            if (pt.bezier) ctx.bezierCurveTo(pt.bezier.cx1, pt.bezier.cy1, pt.bezier.cx2, pt.bezier.cy2, pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          }
        });
        if (p.closed && sub.length > 0) {
          const pt = sub[0];
          if (pt.bezier) ctx.bezierCurveTo(pt.bezier.cx1, pt.bezier.cy1, pt.bezier.cx2, pt.bezier.cy2, pt.x, pt.y);
        }
        ctx.closePath();
      });
    });
    // Use 'evenodd' to keep rooms hollow
    ctx.fill('evenodd');
    ctx.globalAlpha = 1.0;
  } else {
    const imageData = ctx.createImageData(w, h);
    const d = imageData.data;
    for (let i = 0; i < grid.length; i++) {
      const v = grid[i] === 1 ? 0 : 255;
      d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }
}

// ──────────────────────────────────────────────
// Contour tracing (Moore Neighborhood)
// ──────────────────────────────────────────────
function traceContours(grid: Uint8Array, w: number, h: number, simplifyEps: number): SvgPath[] {
  const visited = new Uint8Array(w * h);
  const paths: SvgPath[] = [];
  let pathId = 0;

  const get = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    return grid[y * w + x];
  };

  // Direction vectors for Moore neighborhood (clockwise from right)
  // 0=R, 1=DR, 2=D, 3=DL, 4=L, 5=UL, 6=U, 7=UR
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Look for boundary pixel: current=1, left=0
      if (get(x, y) !== 1) continue;
      if (get(x - 1, y) !== 0) continue;
      if (visited[y * w + x]) continue;

      const contour: Point[] = [];
      let cx = x, cy = y;
      let dir = 0; // start looking right
      const startX = x, startY = y;
      let steps = 0;
      const maxSteps = w * h;

      do {
        contour.push({ x: cx, y: cy });
        visited[cy * w + cx] = 1;

        // Backtrack direction: opposite of entry + 1 clockwise
        let found = false;
        const startDir = (dir + 5) % 8; // start from opposite+1

        for (let i = 0; i < 8; i++) {
          const nd = (startDir + i) % 8;
          const nx = cx + dx[nd];
          const ny = cy + dy[nd];

          if (get(nx, ny) === 1) {
            cx = nx;
            cy = ny;
            dir = nd;
            found = true;
            break;
          }
        }

        if (!found) break;
        steps++;
      } while ((cx !== startX || cy !== startY) && steps < maxSteps);

      if (contour.length < 6) continue;

      const simplified = douglasPeucker(contour, simplifyEps);
      if (simplified.length >= 3) {
        // Calculate approximate area of the contour
        let area = 0;
        for (let i = 0; i < simplified.length; i++) {
          const j = (i + 1) % simplified.length;
          area += simplified[i].x * simplified[j].y;
          area -= simplified[j].x * simplified[i].y;
        }
        area = Math.abs(area) / 2;

        // Only add if area is reasonable (ignore huge boundary or tiny noise)
        if (area < (w * h * 0.9) && area > 20) {
          paths.push({ id: `temp-${pathId++}`, subPaths: [simplified], closed: true });
        }
      }
    }
  }

  return paths;
}

// ──────────────────────────────────────────────
// Geometry utils
// ──────────────────────────────────────────────
function douglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return [...points];
  let dmax = 0, index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpDist(points[i], points[0], points[end]);
    if (d > dmax) { dmax = d; index = i; }
  }
  if (dmax > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[end]];
}

function perpDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

function pathToSvgD(points: Point[], closed: boolean): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    if (pt.bezier) d += ` C ${pt.bezier.cx1.toFixed(1)} ${pt.bezier.cy1.toFixed(1)}, ${pt.bezier.cx2.toFixed(1)} ${pt.bezier.cy2.toFixed(1)}, ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    else d += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
  }
  if (closed && points.length > 0) {
    const pt = points[0];
    if (pt.bezier) d += ` C ${pt.bezier.cx1.toFixed(1)} ${pt.bezier.cy1.toFixed(1)}, ${pt.bezier.cx2.toFixed(1)} ${pt.bezier.cy2.toFixed(1)}, ${pt.x.toFixed(1)} ${pt.y.toFixed(1)} Z`;
    else d += ' Z';
  }
  return d;
}

function convexHull(points: Point[]): Point[] {
  if (points.length <= 3) return points;
  const sorted = [...points].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  
  const lower: Point[] = [];
  for (let i = 0; i < sorted.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) lower.pop();
    lower.push(sorted[i]);
  }
  
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) upper.pop();
    upper.push(sorted[i]);
  }
  
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// ──────────────────────────────────────────────
// COMPONENT
// ──────────────────────────────────────────────
interface FloorplanToSvgProps {
  isOpen: boolean;
  onClose: () => void;
  onApply?: (svgData: string) => void;
  language?: 'en' | 'ko';
}

type ActivePanel = 'levels' | 'curves' | 'huesat' | null;

export const FloorplanToSvg: React.FC<FloorplanToSvgProps> = ({ isOpen, onClose, onApply, language = 'en' }) => {
  const t = (en: string, ko: string) => (language === 'ko' ? ko : en);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [adj, setAdj] = useState<ImageAdjustments>(DEFAULT_ADJ);
  const [svgPaths, setSvgPaths] = useState<SvgPath[]>([]);
  const [previewPaths, setPreviewPaths] = useState<SvgPath[]>([]);
  const [wallGrid, setWallGrid] = useState<Uint8Array | null>(null);
  const [step, setStep] = useState<'upload' | 'adjust' | 'edit'>('upload');
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [selectedPoints, setSelectedPoints] = useState<Set<string>>(new Set()); // "subIdx-ptIdx"
  const [highlightedPoints, setHighlightedPoints] = useState<Set<string>>(new Set());
  const [draggingPoint, setDraggingPoint] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectionBox, setSelectionBox] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x1: number, y1: number, x2: number, y2: number, type: 'h'|'v', isPerp?: boolean, isPerfect?: boolean }[]>([]);
  const [snapCircle, setSnapCircle] = useState<{ x: number, y: number, r: number } | null>(null);
  const [perpPoint, setPerpPoint] = useState<Point | null>(null);
  const [addNodeGuide, setAddNodeGuide] = useState<{ s: number, i: number, pt: Point } | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const dragStartRef = useRef<Point | null>(null);
  const panStartRef = useRef<Point | null>(null);
  const [svgWidth, setSvgWidth] = useState<number | string>(1000);
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showBgInEdit, setShowBgInEdit] = useState(true);
  const [enablePixelSnap, setEnablePixelSnap] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const adjustCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const processTimerRef = useRef<number>(0);

  // History System Refs
  const historyRef = useRef<{ past: SvgPath[][], future: SvgPath[][] }>({ past: [], future: [] });
  const lastSavedPathsRef = useRef<SvgPath[]>([]);
  const latestPathsRef = useRef<SvgPath[]>([]);

  const commitChange = useCallback((newPaths: SvgPath[]) => {
    historyRef.current.past.push(lastSavedPathsRef.current);
    if (historyRef.current.past.length > 50) historyRef.current.past.shift();
    historyRef.current.future = [];
    lastSavedPathsRef.current = JSON.parse(JSON.stringify(newPaths));
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.past.length > 0) {
      historyRef.current.future.push(lastSavedPathsRef.current);
      const prev = historyRef.current.past.pop()!;
      lastSavedPathsRef.current = prev;
      latestPathsRef.current = prev;
      setSvgPaths(JSON.parse(JSON.stringify(prev)));
      setSelectionBox(null);
      setSelectedPoints(new Set());
    }
  }, []);

  const redo = useCallback(() => {
    if (historyRef.current.future.length > 0) {
      historyRef.current.past.push(lastSavedPathsRef.current);
      const next = historyRef.current.future.pop()!;
      lastSavedPathsRef.current = next;
      latestPathsRef.current = next;
      setSvgPaths(JSON.parse(JSON.stringify(next)));
      setSelectionBox(null);
      setSelectedPoints(new Set());
    }
  }, []);

  // Apply color adjustments
  useEffect(() => {
    if (!sourceImage || !adjustCanvasRef.current) return;
    applyAdjustments(sourceImage, adj, adjustCanvasRef.current);
  }, [sourceImage, adj.brightness, adj.contrast, adj.hue, adj.saturation, adj.lightness, adj.levelBlack, adj.levelWhite, adj.levelGamma]);

  // Run wall extraction pipeline (debounced)
  useEffect(() => {
    if (!sourceImage || !adjustCanvasRef.current || !previewCanvasRef.current || step !== 'adjust') return;

    clearTimeout(processTimerRef.current);
    setIsProcessing(true);

    processTimerRef.current = window.setTimeout(() => {
      const canvas = adjustCanvasRef.current!;
      const preview = previewCanvasRef.current!;

      // Ensure color adjustments are applied first
      applyAdjustments(sourceImage, adj, canvas);

      // Extract walls
      const grid = extractWalls(canvas, adj);
      setWallGrid(grid);

      // ★ Live trace for simplification preview
      const paths = traceContours(grid, canvas.width, canvas.height, adj.simplify);
      setPreviewPaths(paths);

      // Draw preview with paths
      drawBinaryPreview(grid, canvas.width, canvas.height, preview, canvas, showOverlay, paths, zoom);
      setIsProcessing(false);
    }, 150);

    return () => clearTimeout(processTimerRef.current);
  }, [sourceImage, adj, step, showOverlay]);

  const handleFile = useCallback((file: File) => {
    const name = file.name.toLowerCase();
    const extension = name.split('.').pop() || '';
    const supported = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'];
    
    if (!supported.includes(extension)) {
      alert(`지원하지 않는 이미지 형식입니다: .${extension}\n(PNG, JPG, WEBP 등의 이미지 파일만 업로드 가능합니다.)`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setSourceImage(img);
        setAdj(DEFAULT_ADJ);
        setSvgPaths([]);
        setWallGrid(null);
        setStep('adjust');
        setEditMode(false);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const isImage = /^image\/(png|jpe?g|gif|bmp|webp)$/i.test(file.type);
      if (isImage) {
        handleFile(file);
      } else {
        const extension = file.name.split('.').pop() || 'unknown';
        alert(`지원하지 않는 이미지 형식입니다: .${extension}\n(PNG, JPG, WEBP 등의 이미지 파일만 드래그 앤 드롭이 가능합니다.)`);
      }
    }
  }, [handleFile]);

  // Convert extracted walls to SVG paths
  const convertToSvg = useCallback(() => {
    if (previewPaths.length === 0) return;
    
    // Merge all preview paths into one single "Wall System"
    const merged: SvgPath = {
      id: 'wall',
      subPaths: previewPaths.map(p => p.subPaths[0]),
      closed: true
    };
    
    // Create Floor by computing Convex Hull of all wall points
    const allPoints: Point[] = [];
    previewPaths.forEach(p => p.subPaths[0].forEach(pt => allPoints.push(pt)));
    
    const floorPoints = convexHull(allPoints);
    const floorPath: SvgPath = {
      id: 'floor',
      subPaths: [floorPoints],
      closed: true
    };
    
    // Floor first (so it renders under), Wall second
    const initialPaths = [floorPath, merged];
    setSvgPaths(initialPaths); 
    const initialCopy = JSON.parse(JSON.stringify(initialPaths));
    lastSavedPathsRef.current = initialCopy;
    latestPathsRef.current = initialCopy;
    historyRef.current = { past: [], future: [] };

    setSelectedPathId('wall');
    setStep('edit');
  }, [previewPaths]);

  const downloadSvg = useCallback(() => {
    if (!sourceImage || svgPaths.length === 0) return;

    try {
      // 1. Calculate scaling
      const w = sourceImage.naturalWidth;
      const h = sourceImage.naturalHeight;
      const scale = svgWidth / w;
      const scaledH = Math.round(h * scale);

      // 2. Build combined Path 'd' attribute for even-odd filling
      const pathsSvg = svgPaths.filter(p => p.visible !== false).map(path => {
        const combinedD = path.subPaths.map(points => {
          const scaled = points.map(pt => ({ 
            x: pt.x * scale, 
            y: pt.y * scale,
            bezier: pt.bezier ? {
              cx1: pt.bezier.cx1 * scale,
              cy1: pt.bezier.cy1 * scale,
              cx2: pt.bezier.cx2 * scale,
              cy2: pt.bezier.cy2 * scale
            } : undefined
          }));
          return pathToSvgD(scaled, path.closed);
        }).join(' ');
        const fill = path.color || (path.id === 'floor' ? '#dddddd' : '#333333');
        const opacity = path.opacity !== undefined ? path.opacity : (path.id === 'floor' ? 0.05 : 0.85);
        return `  <path id="${path.id}" d="${combinedD}" fill="${fill}" fill-opacity="${opacity}" fill-rule="evenodd" stroke="none" />`;
      }).join('\n');

      // 3. Build Full SVG with Headers
      const svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${scaledH}" viewBox="0 0 ${svgWidth} ${scaledH}">
${pathsSvg}
</svg>`;

      // 4. Create Blob and Trigger Download
      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      link.setAttribute('href', url);
      link.setAttribute('download', 'floorplan_wall.svg');
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      
      // Cleanup with generous timeout
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      console.error('SVG Download failed:', err);
      alert('SVG 다운로드에 실패했습니다.');
    }
  }, [sourceImage, svgPaths, svgWidth]);

  const handleApplyToScene = useCallback(() => {
    if (!sourceImage || svgPaths.length === 0 || !onApply) return;

    try {
      const w = sourceImage.naturalWidth;
      const h = sourceImage.naturalHeight;
      const scale = 1.0; // Use natural scale for scene application
      
      const pathsSvg = svgPaths.filter(p => p.visible !== false).map(path => {
        const combinedD = path.subPaths.map(points => {
          const scaled = points.map(pt => ({ 
            x: pt.x * scale, 
            y: pt.y * scale,
            bezier: pt.bezier ? {
              cx1: pt.bezier.cx1 * scale,
              cy1: pt.bezier.cy1 * scale,
              cx2: pt.bezier.cx2 * scale,
              cy2: pt.bezier.cy2 * scale
            } : undefined
          }));
          return pathToSvgD(scaled, path.closed);
        }).join(' ');
        const fill = path.color || (path.id === 'floor' ? '#dddddd' : '#333333');
        const opacity = path.opacity !== undefined ? path.opacity : (path.id === 'floor' ? 0.05 : 0.85);
        return `  <path id="${path.id}" d="${combinedD}" fill="${fill}" fill-opacity="${opacity}" fill-rule="evenodd" stroke="none" />`;
      }).join('\n');

      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${pathsSvg}
</svg>`;

      onApply(svgContent);
      onClose();
    } catch (err) {
      console.error('Apply to scene failed:', err);
    }
  }, [sourceImage, svgPaths, onApply, onClose]);

  const handleSvgMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!editMode) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM()?.inverse();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm);
    if (enablePixelSnap) {
      svgPt.x = Math.round(svgPt.x);
      svgPt.y = Math.round(svgPt.y);
    }
    const isCtrl = e.ctrlKey || e.metaKey;

    const hitRadius = 10 / zoom;
    const activePathId = selectedPathId || 'wall';
    const wall = svgPaths.find(p => p.id === activePathId) || svgPaths[0];
    if (!wall || wall.locked || wall.visible === false) return;

    // Insert New Point if hovering over the segment guide
    if (addNodeGuide && Math.sqrt((addNodeGuide.pt.x - svgPt.x) ** 2 + (addNodeGuide.pt.y - svgPt.y) ** 2) < hitRadius * 2) {
      setSvgPaths(prev => {
        const newPaths = prev.map(p => {
          if (p.id !== (selectedPathId || 'wall') || p.locked || p.visible === false) return p;
          const newSubPaths = p.subPaths.map((points, s) => {
            if (s !== addNodeGuide.s) return points;
            const pts = [...points];
            pts.splice(addNodeGuide.i, 0, { x: addNodeGuide.pt.x, y: addNodeGuide.pt.y });
            return pts;
          });
          return { ...p, subPaths: newSubPaths };
        });
        latestPathsRef.current = newPaths;
        commitChange(newPaths);
        return newPaths;
      });
      setSelectedPoints(new Set([`${addNodeGuide.s}-${addNodeGuide.i}`]));
      setAddNodeGuide(null);
      setDraggingPoint(true);
      dragStartRef.current = { x: addNodeGuide.pt.x, y: addNodeGuide.pt.y };
      return;
    }

    // Check Control Handles FIRST
    for (let s = 0; s < wall.subPaths.length; s++) {
      const points = wall.subPaths[s];
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p.bezier) {
          if (Math.hypot(p.bezier.cx1 - svgPt.x, p.bezier.cy1 - svgPt.y) < hitRadius) {
            setSelectedPoints(new Set([`${s}-${i}-c1`]));
            setDraggingPoint(true); dragStartRef.current = { x: svgPt.x, y: svgPt.y }; return;
          }
          if (Math.hypot(p.bezier.cx2 - svgPt.x, p.bezier.cy2 - svgPt.y) < hitRadius) {
            setSelectedPoints(new Set([`${s}-${i}-c2`]));
            setDraggingPoint(true); dragStartRef.current = { x: svgPt.x, y: svgPt.y }; return;
          }
        }
      }
    }

    // Then check main points
    for (let s = 0; s < wall.subPaths.length; s++) {
      const points = wall.subPaths[s];
      for (let i = 0; i < points.length; i++) {
        const dx = points[i].x - svgPt.x;
        const dy = points[i].y - svgPt.y;
        if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
          const key = `${s}-${i}`;
          if (isCtrl) {
            setSelectedPoints(prev => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key); else next.add(key);
              return next;
            });
          } else {
            if (!selectedPoints.has(key)) {
              setSelectedPoints(new Set([key]));
            }
          }
          setDraggingPoint(true);
          dragStartRef.current = { x: svgPt.x, y: svgPt.y };
          return;
        }
      }
    }
    // 1. Panning Logic (Always allowed even if not clicking SVG, if Space or Right/Middle button)
    if (isSpacePressed || e.button === 2 || e.button === 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (isCtrl) {
      // Start Drag-to-Select (Marquee)
      setSelectionBox({ x1: svgPt.x, y1: svgPt.y, x2: svgPt.x, y2: svgPt.y });
    } else {
      setSelectedPoints(new Set());
    }
  }, [editMode, svgPaths, zoom, selectedPoints, isSpacePressed]);

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const isAlt = e.altKey;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM()?.inverse();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm);
    if (enablePixelSnap) {
      svgPt.x = Math.round(svgPt.x);
      svgPt.y = Math.round(svgPt.y);
    }

    // Case 1: Panning
    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      panStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
// Case 2: Dragging Points
    if (draggingPoint && selectedPathId && selectedPoints.size > 0 && dragStartRef.current) {
      const isShift = e.shiftKey;
      let deltaX = svgPt.x - dragStartRef.current.x;
      let deltaY = svgPt.y - dragStartRef.current.y;
      
      const guides: { x1: number, y1: number, x2: number, y2: number, type: 'h'|'v', isPerp?: boolean, isPerfect?: boolean }[] = [];
      const activePathId = selectedPathId || 'wall';
      const wall = svgPaths.find(p => p.id === activePathId) || svgPaths[0];
      if (wall.locked || wall.visible === false) return;
      let currentPerp: Point | null = null;
      let currentCircle: { x: number, y: number, r: number } | null = null;

      // Enhanced Snapping Logic (if Shift is held)
      if (isShift && wall && selectedPoints.size === 1) {
        const parts = Array.from(selectedPoints)[0].split('-');
        const subIdx = Number(parts[0]);
        const ptIdx = Number(parts[1]);
        const handleType = parts.length > 2 ? parts[2] : null;

        const pts = wall.subPaths[subIdx];
        const p = pts[ptIdx];
        const targetX = p.x + deltaX;
        const targetY = p.y + deltaY;
        const threshold = 12 / zoom;
        
        // Neighbor check
        const prev = pts[(ptIdx - 1 + pts.length) % pts.length];
        const next = pts[(ptIdx + 1) % pts.length];

        const margin = 100000; 
        const w = sourceImage?.naturalWidth || 5000;
        const h = sourceImage?.naturalHeight || 5000;

        if (handleType === 'c1' || handleType === 'c2') {
          // Snap Bezier Handle to its anchor point's axes
          const cx = handleType === 'c1' ? p.bezier!.cx1 : p.bezier!.cx2;
          const cy = handleType === 'c1' ? p.bezier!.cy1 : p.bezier!.cy2;
          const hTargetX = cx + deltaX;
          const hTargetY = cy + deltaY;
          const anchor = handleType === 'c1' ? prev : p;

          if (Math.abs(hTargetX - anchor.x) < threshold) {
            deltaX = anchor.x - cx;
            guides.push({ x1: anchor.x, y1: -margin, x2: anchor.x, y2: h + margin, type: 'v', isPerfect: true });
          }
          if (Math.abs(hTargetY - anchor.y) < threshold) {
            deltaY = anchor.y - cy;
            guides.push({ x1: -margin, y1: anchor.y, x2: w + margin, y2: anchor.y, type: 'h', isPerfect: true });
          }
        } else {
          // 1. Thales's Circle Snap (Any-Angle 90-degree Corner)
          const cx = (prev.x + next.x) / 2;
          const cy = (prev.y + next.y) / 2;
          const r = Math.sqrt((prev.x - next.x)**2 + (prev.y - next.y)**2) / 2;
          
          const distToCenter = Math.sqrt((targetX - cx)**2 + (targetY - cy)**2);
          
          let snappedToCircle = false;
          if (Math.abs(distToCenter - r) < threshold) {
          const angle = Math.atan2(targetY - cy, targetX - cx);
          const snappedX = cx + r * Math.cos(angle);
          const snappedY = cy + r * Math.sin(angle);
          
          deltaX = snappedX - p.x;
          deltaY = snappedY - p.y;
          
          const isH = Math.abs(snappedY - prev.y) < 0.5 || Math.abs(snappedY - next.y) < 0.5;
          const isV = Math.abs(snappedX - prev.x) < 0.5 || Math.abs(snappedX - next.x) < 0.5;
          const isPerfectCorner = isH && isV;

          const extend = (p1: Point, p2: Point, length: number) => {
            const dx = p2.x - p1.x; const dy = p2.y - p1.y;
            const d = Math.sqrt(dx*dx + dy*dy);
            if (d === 0) return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
            return {
              x1: p2.x - (dx/d)*length, y1: p2.y - (dy/d)*length,
              x2: p2.x + (dx/d)*length, y2: p2.y + (dy/d)*length
            };
          };
          const g1 = extend(prev, { x: snappedX, y: snappedY }, margin);
          const g2 = extend(next, { x: snappedX, y: snappedY }, margin);

          guides.push({ ...g1, type: 'v', isPerp: true, isPerfect: isPerfectCorner });
          guides.push({ ...g2, type: 'h', isPerp: true, isPerfect: isPerfectCorner });

          currentPerp = { x: snappedX, y: snappedY };
          currentCircle = { x: cx, y: cy, r };
          snappedToCircle = true;
        }

        // 2. Global Axis Snap (Horizontal/Vertical)
        if (!snappedToCircle) {
           let snapH = false;
           let snapV = false;

           [prev, next].forEach(n => {
            if (Math.abs(targetX - n.x) < threshold) {
              deltaX = n.x - p.x;
              snapV = true;
            }
            if (Math.abs(targetY - n.y) < threshold) {
              deltaY = n.y - p.y;
              snapH = true;
            }
          });

          const isCorner = snapH && snapV;
          [prev, next].forEach(n => {
            if (Math.abs((p.x + deltaX) - n.x) < 0.5) {
              guides.push({ x1: n.x, y1: -margin, x2: n.x, y2: h + margin, type: 'v', isPerp: isCorner, isPerfect: isCorner });
            }
            if (Math.abs((p.y + deltaY) - n.y) < 0.5) {
              guides.push({ x1: -margin, y1: n.y, x2: w + margin, y2: n.y, type: 'h', isPerp: isCorner, isPerfect: isCorner });
            }
          });
        }
      } // end of else (main point)
      } // end of if (isShift)

      setSnapGuides(guides);
      setSnapCircle(currentCircle);
      setPerpPoint(currentPerp);

      dragStartRef.current = { x: dragStartRef.current.x + deltaX, y: dragStartRef.current.y + deltaY };

      setSvgPaths(prev => {
        const newPaths = prev.map(p => {
          if (p.id !== activePathId || p.locked || p.visible === false) return p;
          const newSubPaths = p.subPaths.map((points, s) => {
            const pLength = points.length;
            return points.map((point, i) => {
              const prevIdx = (i - 1 + pLength) % pLength;
              let movedX = 0; let movedY = 0;
              if (selectedPoints.has(`${s}-${i}`)) {
                movedX = deltaX; movedY = deltaY;
              }
              
              let newBezier = point.bezier;
              if (newBezier) {
                newBezier = { ...newBezier };
                if (movedX || movedY) {
                  newBezier.cx2 += movedX; newBezier.cy2 += movedY;
                }
                if (selectedPoints.has(`${s}-${prevIdx}`)) {
                  newBezier.cx1 += deltaX; newBezier.cy1 += deltaY;
                }
                if (selectedPoints.has(`${s}-${i}-c1`)) {
                  newBezier.cx1 += deltaX; newBezier.cy1 += deltaY;
                }
                if (selectedPoints.has(`${s}-${i}-c2`)) {
                  newBezier.cx2 += deltaX; newBezier.cy2 += deltaY;
                }

                // --- SYMMETRY LOGIC ---
                // If user drags the opposite handle connected to the same anchor, mirror it (unless Alt is held).
                if (!isAlt) {
                  const nextIdx = (i + 1) % pLength;
                  if (selectedPoints.has(`${s}-${nextIdx}-c1`)) {
                     newBezier.cx2 -= deltaX;
                     newBezier.cy2 -= deltaY;
                  }
                  if (selectedPoints.has(`${s}-${prevIdx}-c2`)) {
                     newBezier.cx1 -= deltaX;
                     newBezier.cy1 -= deltaY;
                  }
                }
                
              }
              
              if (movedX || movedY || newBezier !== point.bezier) {
                return { x: point.x + movedX, y: point.y + movedY, bezier: newBezier };
              }
              return point;
            });
          });
          return { ...p, subPaths: newSubPaths };
        });
        latestPathsRef.current = newPaths;
        return newPaths;
      });
      return;
    }

    // Case 3: Drag Selection Box (Marquee)
    if (selectionBox) {
      const newBox = { ...selectionBox, x2: svgPt.x, y2: svgPt.y };
      setSelectionBox(newBox);

      // Real-time Highlight within box
      const xMin = Math.min(newBox.x1, newBox.x2);
      const xMax = Math.max(newBox.x1, newBox.x2);
      const yMin = Math.min(newBox.y1, newBox.y2);
      const yMax = Math.max(newBox.y1, newBox.y2);

      const highlights = new Set<string>();
      const activePathId2 = selectedPathId || 'wall';
      const wall = svgPaths.find(p => p.id === activePathId2) || svgPaths[0];
      if (wall && !wall.locked && wall.visible !== false) {
        wall.subPaths.forEach((points, s) => {
          points.forEach((pt, i) => {
            if (pt.x >= xMin && pt.x <= xMax && pt.y >= yMin && pt.y <= yMax) {
              highlights.add(`${s}-${i}`);
            }
          });
        });
      }
      setHighlightedPoints(highlights);
      return;
    }

    // Case 4: Pure Hovering (Check if near segment to add node point guide)
    const activeHoverPathId = selectedPathId || 'wall';
    const hoverWall = svgPaths.find(p => p.id === activeHoverPathId) || svgPaths[0];

    if (editMode && hoverWall && !hoverWall.locked && hoverWall.visible !== false) {
      let foundHover = false;
      const hitRadius = 15 / zoom;

      for (let s = 0; s < hoverWall.subPaths.length; s++) {
        const points = hoverWall.subPaths[s];
        for (let i = 0; i < points.length; i++) {
          const prev = points[(i - 1 + points.length) % points.length];
          const curr = points[i];
          
          const px = Math.min(prev.x, curr.x) - hitRadius;
          const py = Math.min(prev.y, curr.y) - hitRadius;
          const px2 = Math.max(prev.x, curr.x) + hitRadius;
          const py2 = Math.max(prev.y, curr.y) + hitRadius;

          // quick bounding box check
          if (svgPt.x >= px && svgPt.x <= px2 && svgPt.y >= py && svgPt.y <= py2) {
            const dist = perpDist(svgPt, prev, curr);
            if (dist < hitRadius) {
              let midP: Point;
              if (curr.bezier) {
                  const t = 0.5;
                  const mt = 1 - t;
                  midP = {
                    x: mt*mt*mt*prev.x + 3*mt*mt*t*curr.bezier.cx1 + 3*mt*t*t*curr.bezier.cx2 + t*t*t*curr.x,
                    y: mt*mt*mt*prev.y + 3*mt*mt*t*curr.bezier.cy1 + 3*mt*t*t*curr.bezier.cy2 + t*t*t*curr.y
                  };
              } else {
                  midP = { x: (prev.x + curr.x)/2, y: (prev.y + curr.y)/2 };
              }
              setAddNodeGuide({ s, i, pt: midP });
              foundHover = true;
              break;
            }
          }
        }
        if (foundHover) break;
      }
      if (!foundHover) setAddNodeGuide(null);
    } else {
      setAddNodeGuide(null);
    }
  }, [editMode, draggingPoint, selectedPathId, selectedPoints, selectionBox, isPanning, svgPaths, zoom]);

  const handleSvgMouseUp = useCallback(() => {
    // Process Drag Selection
    if (selectionBox) {
      const newlySelected = new Set(selectedPoints);
      highlightedPoints.forEach(p => newlySelected.add(p));
      setSelectedPoints(newlySelected);
      if (newlySelected.size > 0) setSelectedPathId('wall');
      setSelectionBox(null);
      setHighlightedPoints(new Set());
    }

    if (draggingPoint) {
      commitChange(latestPathsRef.current);
    }

    setIsPanning(false);
    setDraggingPoint(false);
    setSnapGuides([]);
    setSnapCircle(null);
    setPerpPoint(null);
    dragStartRef.current = null;
    panStartRef.current = null;
  }, [selectionBox, selectedPoints, highlightedPoints, draggingPoint, commitChange]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (step === 'upload') return;
    e.preventDefault();
    const zoomFactor = 1.1;
    const delta = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
    const newZoom = Math.max(0.1, Math.min(100, zoom * delta));

    // Zoom to cursor logic
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const dx = (mouseX - pan.x) / zoom;
    const dy = (mouseY - pan.y) / zoom;

    const newPanX = mouseX - dx * newZoom;
    const newPanY = mouseY - dy * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [zoom, pan, step]);

  const toggleCurve = useCallback(() => {
    if (selectedPoints.size === 0) return;
    setSvgPaths(prev => {
      const newPaths = prev.map(p => {
        if (p.id !== (selectedPathId || 'wall') || p.locked || p.visible === false) return p;
        const newSubPaths = p.subPaths.map((points, s) => {
          let pts = [...points];
          const selectedIndices = [];
          for (let i = 0; i < pts.length; i++) {
            if (selectedPoints.has(`${s}-${i}`)) selectedIndices.push(i);
          }

          selectedIndices.forEach(i => {
            const pt = pts[i];
            const pLength = pts.length;
            const prevIdx = (i - 1 + pLength) % pLength;
            const nextIdx = (i + 1) % pLength;
            const prev = pts[prevIdx];
            const next = pts[nextIdx];

            if (pt.bezier) {
               const { bezier, ...rest } = pt;
               pts[i] = rest;
            } else {
               // Calculate smooth tangent parallel to the chord (next - prev)
               const dx = next.x - prev.x;
               const dy = next.y - prev.y;
               const len = Math.hypot(dx, dy) || 1;
               const ux = dx / len;
               const uy = dy / len;
               const handleLen = 40; // Default handle length

               // Incoming segment to `i` (from `prev`)
               pts[i] = {
                 ...pt,
                 bezier: {
                   cx1: prev.x + (pt.x - prev.x) * 0.33,
                   cy1: prev.y + (pt.y - prev.y) * 0.33,
                   cx2: pt.x - ux * handleLen,
                   cy2: pt.y - uy * handleLen
                 }
               };
               
               // Outgoing segment from `i` (to `next`)
               const nextBz = pts[nextIdx].bezier;
               pts[nextIdx] = {
                 ...next,
                 bezier: {
                   cx1: pt.x + ux * handleLen,
                   cy1: pt.y + uy * handleLen,
                   cx2: nextBz ? nextBz.cx2 : next.x - (next.x - pt.x) * 0.33,
                   cy2: nextBz ? nextBz.cy2 : next.y - (next.y - pt.y) * 0.33
                 }
               };
            }
          });
          return pts;
        });
        return { ...p, subPaths: newSubPaths };
      });
      latestPathsRef.current = newPaths;
      commitChange(newPaths);
      return newPaths;
    });
  }, [selectedPoints, commitChange]);

  const deleteSelectedPoints = useCallback(() => {
    if (selectedPoints.size === 0) return;
    setSvgPaths(prev => {
      const newPaths = prev.map(p => {
        if (p.id !== (selectedPathId || 'wall') || p.locked || p.visible === false) return p;
        const newSubPaths = p.subPaths.map((points, s) => {
          let pts = [...points];
          // 1. Delete bezier handles if selected (retract to anchor)
          for (let i = 0; i < pts.length; i++) {
            if (pts[i].bezier) {
              const prev = pts[(i - 1 + pts.length) % pts.length];
              const pt = pts[i];
              let newBz = { ...pts[i].bezier! };
              let modified = false;

              if (selectedPoints.has(`${s}-${i}-c1`)) {
                newBz.cx1 = prev.x;
                newBz.cy1 = prev.y;
                modified = true;
              }
              if (selectedPoints.has(`${s}-${i}-c2`)) {
                newBz.cx2 = pt.x;
                newBz.cy2 = pt.y;
                modified = true;
              }

              if (modified) {
                // If both are completely retracted, delete the curve entirely
                if (newBz.cx1 === prev.x && newBz.cy1 === prev.y && newBz.cx2 === pt.x && newBz.cy2 === pt.y) {
                    const { bezier, ...rest } = pts[i];
                    pts[i] = rest;
                } else {
                    pts[i] = { ...pts[i], bezier: newBz };
                }
              }
            }
          }
          // 2. Delete main points
          const filtered = pts.filter((_, i) => !selectedPoints.has(`${s}-${i}`));
          return filtered.length >= 3 ? filtered : pts;
        });
        return { ...p, subPaths: newSubPaths };
      });
      latestPathsRef.current = newPaths;
      commitChange(newPaths);
      return newPaths;
    });
    setSelectedPoints(new Set());
  }, [selectedPoints, commitChange]);

  const deleteSelectedPath = useCallback(() => {
    if (!selectedPathId) return;
    setSvgPaths(prev => prev.filter(p => p.id !== selectedPathId));
    setSelectedPathId(null); setSelectedPoints(new Set());
  }, [selectedPathId]);

  // Spacebar Pan & Editor Hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      if (e.code === 'Space' || e.key === ' ') {
        setIsSpacePressed(true); 
        e.preventDefault();
      }

      if (step === 'edit') {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          if (selectedPoints.size > 0) deleteSelectedPoints();
          else if (selectedPathId) deleteSelectedPath();
        }
        if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (e.shiftKey) redo(); else undo();
        }
        if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleCurve();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') setIsSpacePressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [step, selectedPoints.size, selectedPathId, deleteSelectedPoints, deleteSelectedPath, undo, redo, toggleCurve]);

  const viewBox = sourceImage ? `0 0 ${sourceImage.naturalWidth} ${sourceImage.naturalHeight}` : '0 0 100 100';

  // Reusable slider
  const Slider = ({ label, value, min, max, step: s, onChange, unit }: {
    label: string; value: number; min: number; max: number; step?: number;
    onChange: (v: number) => void; unit?: string;
  }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-black text-white/40 uppercase tracking-widest">
        <span>{label}</span>
        <span className="text-emerald-500 font-mono">{value.toFixed(s && s < 1 ? 1 : 0)}{unit || ''}</span>
      </div>
      <input
        type="range" min={min} max={max} step={s || 1} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />
    </div>
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-lg"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
          className="bg-[#0d0d0d] border border-white/10 rounded-3xl shadow-2xl w-[90vw] h-[85vh] max-w-[1400px] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981] animate-pulse" />
              <h2 className="text-sm font-black uppercase text-white/80">{t('Create SVG Floorplan', 'SVG 도면 생성')}</h2>
              <div className="flex gap-1 ml-4">
                {['upload', 'adjust', 'edit'].map((s, i) => (
                  <div key={s} className="flex items-center gap-1">
                    <div className={`w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center border transition-all ${
                      step === s ? 'bg-emerald-500 text-black border-emerald-500' :
                      ['upload', 'adjust', 'edit'].indexOf(step) > i ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' :
                      'bg-white/5 text-white/20 border-white/10'
                    }`}>{i + 1}</div>
                    {i < 2 && <div className={`w-6 h-px ${['upload', 'adjust', 'edit'].indexOf(step) > i ? 'bg-emerald-500/30' : 'bg-white/5'}`} />}
                  </div>
                ))}
              </div>
              {isProcessing && (
                <div className="ml-3 flex items-center gap-2 text-[10px] text-amber-500 font-bold uppercase">
                  <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  {t('Processing...', '처리 중...')}
                </div>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-all">
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-1 min-h-0">
            {/* STEP 1: Upload */}
            {step === 'upload' && (
              <div className="flex-1 flex items-center justify-center p-8">
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`w-full max-w-xl aspect-[4/3] rounded-3xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-4 cursor-pointer ${
                    isDragging ? 'border-emerald-500 bg-emerald-500/5 scale-[1.02]' : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
                  }`}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/png,image/jpeg,image/gif,image/bmp,image/webp';
                    input.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f); };
                    input.click();
                  }}
                >
                  <div className={`p-6 rounded-full transition-all ${isDragging ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
                    <Upload size={32} className={`transition-colors ${isDragging ? 'text-emerald-500' : 'text-white/20'}`} />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-sm font-black uppercase text-white/60">{t('Drop Floorplan Image Here', '도면 이미지를 여기에 드롭하세요')}</p>
                    <p className="text-[10px] text-white/20 font-bold uppercase tracking-wider">{t('PNG, JPG, GIF, BMP, WEBP', '지원 형식: PNG, JPG, WEBP 등')}</p>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Adjust + STEP 3: Edit */}
            {(step === 'adjust' || step === 'edit') && (
              <>
                {/* Left: Controls */}
                <div className="w-72 border-r border-white/5 flex flex-col overflow-y-auto custom-scrollbar shrink-0">
                  <div className="p-4 space-y-4">
                    {step === 'adjust' && (
                      <>
                        {/* Presets */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-black uppercase text-white/30">{t('Presets', '프리셋')}</span>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              onClick={() => setAdj(DEFAULT_ADJ)}
                              className="py-2 bg-white/5 hover:bg-white/10 text-white/60 text-[10px] font-black uppercase rounded-xl border border-white/5 transition-all"
                            >
                              {t('Default', '초기값')}
                            </button>
                            <button
                              onClick={() => setAdj(a => ({
                                ...a,
                                saturation: -100,
                                contrast: 100,
                                brightness: 10,
                                levelBlack: 40,
                                levelWhite: 220,
                                wallThickness: 4,
                                threshold: 180,
                                minArea: 800
                              }))}
                              className="py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase rounded-xl border border-emerald-500/20 transition-all flex items-center justify-center gap-2"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                              {t('Wall Only', '벽체 강조')}
                            </button>
                          </div>
                        </div>

                        {/* Panel Toggles */}
                        <div className="grid grid-cols-3 gap-1.5">
                          {([
                            { id: 'levels' as ActivePanel, icon: <SlidersHorizontal size={14} />, label: t('Levels', '레벨') },
                            { id: 'curves' as ActivePanel, icon: <Contrast size={14} />, label: t('Curves', '곡선') },
                            { id: 'huesat' as ActivePanel, icon: <Palette size={14} />, label: t('Hue/Sat', '색조') },
                          ]).map(panel => (
                            <button
                              key={panel.id}
                              onClick={() => setActivePanel(activePanel === panel.id ? null : panel.id)}
                              className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border transition-all text-[10px] font-black uppercase tracking-wider ${
                                activePanel === panel.id
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                                  : 'bg-white/[0.03] border-white/5 text-white/40 hover:bg-white/[0.06]'
                              }`}
                            >
                              {panel.icon}
                              <span>{panel.label}</span>
                            </button>
                          ))}
                        </div>

                        {/* Levels */}
                        <AnimatePresence>
                          {activePanel === 'levels' && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <div className="space-y-3 p-3 bg-white/[0.02] rounded-xl border border-white/5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{t('Levels', '레벨 조정')}</span>
                                <Slider label={t('Input Black', '입력 블랙')} value={adj.levelBlack} min={0} max={254} onChange={v => setAdj(a => ({ ...a, levelBlack: v }))} />
                                <Slider label={t('Input White', '입력 화이트')} value={adj.levelWhite} min={1} max={255} onChange={v => setAdj(a => ({ ...a, levelWhite: v }))} />
                                <Slider label={t('Gamma', '감마')} value={adj.levelGamma} min={0.1} max={5} step={0.05} onChange={v => setAdj(a => ({ ...a, levelGamma: v }))} />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Curves */}
                        <AnimatePresence>
                          {activePanel === 'curves' && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <div className="space-y-3 p-3 bg-white/[0.02] rounded-xl border border-white/5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{t('Curves', '곡선 조정')}</span>
                                <Slider label={t('Brightness', '밝기')} value={adj.brightness} min={-100} max={100} onChange={v => setAdj(a => ({ ...a, brightness: v }))} />
                                <Slider label={t('Contrast', '대비')} value={adj.contrast} min={-100} max={100} onChange={v => setAdj(a => ({ ...a, contrast: v }))} />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Hue/Saturation */}
                        <AnimatePresence>
                          {activePanel === 'huesat' && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <div className="space-y-3 p-3 bg-white/[0.02] rounded-xl border border-white/5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{t('Hue / Saturation', '색조 / 채도')}</span>
                                <Slider label={t('Hue', '색상')} value={adj.hue} min={-180} max={180} onChange={v => setAdj(a => ({ ...a, hue: v }))} unit="°" />
                                <Slider label={t('Saturation', '채도')} value={adj.saturation} min={-100} max={100} onChange={v => setAdj(a => ({ ...a, saturation: v }))} />
                                <Slider label={t('Lightness', '휘도')} value={adj.lightness} min={-100} max={100} onChange={v => setAdj(a => ({ ...a, lightness: v }))} />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* ★ Wall Extraction Controls (always visible) */}
                        <div className="space-y-3 p-3 bg-emerald-500/[0.03] rounded-xl border border-emerald-500/10">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500/60">{t('Wall Extraction', '벽체 추출 설정')}</span>
                          </div>
                          <Slider label={t('Threshold', '임계값')} value={adj.threshold} min={0} max={255} onChange={v => setAdj(a => ({ ...a, threshold: v }))} />
                          <Slider label={t('Wall Thickness', '최소 벽 두께')} value={adj.wallThickness} min={0} max={15} onChange={v => setAdj(a => ({ ...a, wallThickness: v }))} unit="px" />
                          <Slider label={t('Min Area', '최소 면적')} value={adj.minArea} min={0} max={5000} step={50} onChange={v => setAdj(a => ({ ...a, minArea: v }))} />
                          <Slider label={t('Simplify', '단순화')} value={adj.simplify} min={0.5} max={10} step={0.5} onChange={v => setAdj(a => ({ ...a, simplify: v }))} />

                          <div className="flex gap-2">
                            <button
                              onClick={() => setAdj(a => ({ ...a, invert: !a.invert }))}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${
                                adj.invert ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-white/[0.03] border-white/5 text-white/40'
                              }`}
                            >
                              {t('Invert', '색상 반전')}
                            </button>
                            <button
                              onClick={() => setShowOverlay(!showOverlay)}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${
                                showOverlay ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-white/[0.03] border-white/5 text-white/40'
                              }`}
                            >
                              {showOverlay ? <Eye size={12} /> : <EyeOff size={12} />}
                              {t('Overlay', '이미지 겹침')}
                            </button>
                          </div>
                        </div>

                        {/* Reset */}
                        <button
                          onClick={() => setAdj(DEFAULT_ADJ)}
                          className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                        >
                          <RefreshCw size={12} /> {t('Reset All', '설정 초기화')}
                        </button>

                        <button
                          onClick={convertToSvg}
                          disabled={!wallGrid || isProcessing || previewPaths.length === 0}
                          className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase rounded-xl text-[11px] transition-all shadow-[0_0_30px_rgba(16,185,129,0.3)] disabled:opacity-30"
                        >
                          {t('Convert to SVG', 'SVG 도면 생성하기')}
                        </button>
                        
                        <div className="flex border-t border-white/5 pt-2 justify-between px-1">
                          <span className="text-[10px] font-black text-white/30 uppercase">Paths: {previewPaths.length}</span>
                          <span className="text-[10px] font-black text-white/30 uppercase">Points: {previewPaths.reduce((s, p) => s + (p.subPaths?.[0]?.length || 0), 0)}</span>
                        </div>
                      </>
                    )}

                    {step === 'edit' && (
                      <>
                        <div className="space-y-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{t('Vector Edit', '벡터 편집')}</span>
                          <div className="flex gap-2 mb-2">
                             <button
                                 onClick={() => setShowBgInEdit(!showBgInEdit)}
                                 className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${
                                   showBgInEdit ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                 }`}
                               >
                                 {showBgInEdit ? <Eye size={12} /> : <EyeOff size={12} />}
                                 {t('Show Bg', '배경 보기')}
                               </button>
                             <button
                                 onClick={() => setEnablePixelSnap(!enablePixelSnap)}
                                 className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${
                                   enablePixelSnap ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                 }`}
                               >
                                 <Grid size={12} /> {t('Pixel Snap', '픽셀 스냅')}
                               </button>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              onClick={() => setEditMode(!editMode)}
                              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${
                                editMode ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                              }`}
                            >
                              <Pencil size={12} /> {t('Edit Points', '점 편집')}
                            </button>
                            <button
                              onClick={deleteSelectedPoints}
                              disabled={selectedPoints.size === 0}
                              className="flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all bg-white/5 border-white/5 text-white/40 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500 disabled:opacity-20"
                            >
                              <Trash2 size={12} /> {t('Delete', '삭제')} {selectedPoints.size > 0 ? `(${selectedPoints.size})` : ''}
                            </button>
                          </div>
                          {selectedPathId && (
                            <button onClick={deleteSelectedPath}
                              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20"
                            >
                              <Trash2 size={12} /> {t('Delete Selected Path', '선택된 패스 삭제')}
                            </button>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{t('Layers', '레이어 리스트')}</span>
                          <div className="flex flex-col gap-1.5">
                            {svgPaths.map((path, idx) => (
                              <div key={path.id} 
                                className={`px-2 py-2 rounded-xl border flex flex-col gap-2 transition-all cursor-pointer ${selectedPathId === path.id ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}
                                onClick={() => setSelectedPathId(path.id)}
                              >
                                <div className="flex justify-between items-center w-full">
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex flex-col opacity-30 hover:opacity-100 transition-all">
                                      <button disabled={idx === 0} onClick={(e) => { e.stopPropagation(); if(idx === 0) return; const newPaths=[...svgPaths]; const temp=newPaths[idx-1]; newPaths[idx-1]=path; newPaths[idx]=temp; setSvgPaths(newPaths); commitChange(newPaths); }} className="hover:text-emerald-500 disabled:opacity-30 disabled:hover:text-white"><ChevronUp size={10} /></button>
                                      <button disabled={idx === svgPaths.length - 1} onClick={(e) => { e.stopPropagation(); if(idx === svgPaths.length - 1) return; const newPaths=[...svgPaths]; const temp=newPaths[idx+1]; newPaths[idx+1]=path; newPaths[idx]=temp; setSvgPaths(newPaths); commitChange(newPaths); }} className="hover:text-emerald-500 disabled:opacity-30 disabled:hover:text-white"><ChevronDown size={10} /></button>
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${selectedPathId === path.id ? 'text-emerald-500' : 'text-white/60'}`}>
                                      {path.id === 'floor' ? t('Floor', '바닥면') : t('Wall', '벽체')} <span className="text-[10px] bg-white/10 px-1 py-0.5 rounded ml-1 text-white/40">{path.subPaths.length} pts</span>
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button onClick={(e) => { e.stopPropagation(); const np = [...svgPaths]; np[idx] = {...path, visible: path.visible === false ? true : false}; setSvgPaths(np); commitChange(np); }} className={`p-1.5 rounded-lg transition-all ${path.visible === false ? 'bg-white/5 text-white/20 hover:bg-white/10' : 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30'}`}>
                                      {path.visible === false ? <EyeOff size={12} /> : <Eye size={12} />}
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); const np = [...svgPaths]; np[idx] = {...path, locked: !path.locked}; setSvgPaths(np); commitChange(np); }} className={`p-1.5 rounded-lg transition-all ${path.locked ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
                                      {path.locked ? <Lock size={12} /> : <Unlock size={12} />}
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
                                  <input type="color" value={path.color || (path.id === 'floor' ? '#dddddd' : '#333333')} 
                                    onChange={(e) => { const np = [...svgPaths]; np[idx] = {...path, color: e.target.value}; setSvgPaths(np); }}
                                    className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0" />
                                  <input type="range" min="0" max="1" step="0.05" value={path.opacity ?? (path.id === 'floor' ? 0.05 : 0.85)}
                                    onChange={(e) => { const np = [...svgPaths]; np[idx] = {...path, opacity: parseFloat(e.target.value)}; setSvgPaths(np); }}
                                    onMouseUp={() => commitChange(svgPaths)}
                                    className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                                  <span className="text-[10px] font-mono text-white/40 w-6 text-right">{(path.opacity ?? (path.id==='floor'?0.05:0.85)).toFixed(2)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3 p-3 bg-white/[0.02] rounded-xl border border-white/5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{t('SVG Export', '내보내기 설정')}</span>
                          <div className="space-y-1.5">
                            <span className="text-[10px] text-white/30 font-bold uppercase">{t('Export Width (px)', '출력 가로 너비 (px)')}</span>
                            <input type="number" min={1} value={svgWidth}
                              onChange={(e) => setSvgWidth(e.target.value)}
                              onBlur={(e) => setSvgWidth(Math.max(1, parseInt(e.target.value) || 1000))}
                              className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-[11px] font-mono font-bold text-white focus:border-emerald-500/50 outline-none"
                            />
                          </div>
                          <button onClick={downloadSvg} disabled={svgPaths.length === 0}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 font-black uppercase rounded-xl text-[11px] transition-all disabled:opacity-30"
                          >
                            <Download size={14} /> {t('Download SVG', 'SVG 파일 다운로드')}
                          </button>

                          <button onClick={handleApplyToScene} disabled={svgPaths.length === 0 || !onApply}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase rounded-xl text-[11px] transition-all shadow-[0_0_30px_rgba(16,185,129,0.3)] disabled:opacity-30"
                          >
                            <RefreshCw size={14} /> {t('Apply to Scene', '3D 현장에 반영하기')}
                          </button>
                        </div>

                        <button onClick={() => { setStep('adjust'); setEditMode(false); }}
                          className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                        >
                          <Undo2 size={12} /> {t('Back to Adjust', '추출 단계로 돌아가기')}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Right: Preview */}
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setZoom(z => Math.max(0.1, z - 0.25))} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 transition-all"><ZoomOut size={14} /></button>
                      <span className="text-[10px] font-mono font-bold text-white/40 w-12 text-center">{Math.round(zoom * 100)}%</span>
                      <button onClick={() => setZoom(z => Math.min(100, z + 0.25))} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 transition-all"><ZoomIn size={14} /></button>
                      <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="text-[10px] font-black text-white/20 hover:text-white ml-2 uppercase">{t('Reset View', '화면 재설정')}</button>
                      <div className="w-px h-3 bg-white/10 mx-2" />
                      <button onClick={toggleCurve} disabled={selectedPoints.size === 0} title="Toggle Curve (C)" className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-white/5"><Spline size={14} /></button>
                      <button onClick={undo} disabled={historyRef.current.past.length === 0} title="Undo (Ctrl+Z)" className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-white/5"><Undo2 size={14} /></button>
                      <button onClick={redo} disabled={historyRef.current.future.length === 0} title="Redo (Ctrl+Shift+Z)" className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-white/5" style={{ transform: 'scaleX(-1)' }}><Undo2 size={14} /></button>
                    </div>
                    {step === 'edit' && (
                      <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">
                        {isSpacePressed 
                          ? t('✋ Pan Mode — Drag to move view', '✋ 팬 모드 — 드래그하여 화면 이동') 
                          : editMode 
                            ? t('🟢 Editing — Click points or Ctrl+Drag box', '🟢 편집 모드 — 점 클릭 또는 Ctrl+드래그') 
                            : t('Double-click to edit points | Space + Drag to Pan | Scroll to Zoom', '더블 클릭하여 점 편집 | Space + 드래그로 이동 | 휠 스크롤로 확대축소')}
                      </span>
                    )}
                    {step === 'adjust' && (
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full mb-1 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                          {t('Green Area = Extracted Walls', '녹색 영역 = 추출된 벽체 영역')}
                        </span>
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest mt-1">
                          {t('Space + Drag to Pan | Scroll to Zoom', 'Space + 드래그로 화면 이동 | 휠 스크롤로 확대축소')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div 
                    className="flex-1 overflow-hidden bg-[#111] flex items-center justify-center p-4 relative"
                    style={{ cursor: isSpacePressed ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
                    onDoubleClick={() => { if (step === 'edit') setEditMode(!editMode); }}
                    onWheel={handleWheel}
                    onMouseDown={(e) => {
                      if (isSpacePressed || e.button === 1 || e.button === 2) {
                        setIsPanning(true);
                        panStartRef.current = { x: e.clientX, y: e.clientY };
                      }
                    }}
                    onMouseMove={(e) => {
                      if (isPanning && panStartRef.current) {
                        const dx = e.clientX - panStartRef.current.x;
                        const dy = e.clientY - panStartRef.current.y;
                        setPan(p => ({ x: p.x + dx, y: p.y + dy }));
                        panStartRef.current = { x: e.clientX, y: e.clientY };
                      }
                    }}
                    onMouseUp={() => setIsPanning(false)}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    {/* Global Cursor Override Style when Space is pressed */}
                    {isSpacePressed && (
                      <style>{`
                        * { cursor: ${isPanning ? 'grabbing' : 'grab'} !important; }
                        svg { pointer-events: none; }
                      `}</style>
                    )}
                    <div style={{ 
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, 
                      transformOrigin: '0 0', 
                      transition: draggingPoint || isPanning || selectionBox ? 'none' : 'transform 0.1s' 
                    }}>
                      {/* Hidden canvas for color adjustments */}
                      <canvas ref={adjustCanvasRef} className="hidden" />

                      {step === 'adjust' && (
                        <canvas
                          ref={previewCanvasRef}
                          className="border border-white/10 rounded-lg shadow-xl"
                          style={{ imageRendering: 'auto', maxWidth: '100%' }}
                        />
                      )}

                      {step === 'edit' && sourceImage && (
                        <svg
                          viewBox={viewBox}
                          width={sourceImage.naturalWidth}
                          height={sourceImage.naturalHeight}
                          className="border border-white/10 rounded-lg shadow-xl bg-white"
                          style={{ cursor: editMode ? 'crosshair' : 'default' }}
                          onMouseDown={handleSvgMouseDown}
                          onMouseMove={handleSvgMouseMove}
                          onMouseUp={handleSvgMouseUp}
                          onMouseLeave={handleSvgMouseUp}
                        >
                          <defs>
                            <pattern id="smallGrid" width="1" height="1" patternUnits="userSpaceOnUse">
                              <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={1/zoom} />
                            </pattern>
                            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                              <rect width="10" height="10" fill="url(#smallGrid)" />
                              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={2/zoom} />
                            </pattern>
                          </defs>
                          {showBgInEdit && sourceImage && (
                            <image
                              href={sourceImage.src}
                              width={sourceImage.naturalWidth}
                              height={sourceImage.naturalHeight}
                              opacity={0.3}
                            />
                          )}
                          {zoom >= 3 && (
                            <rect width={sourceImage.naturalWidth} height={sourceImage.naturalHeight} fill="url(#grid)" pointerEvents="none" />
                          )}
                          {/* Combined paths preview */}
                          {svgPaths.filter(p => p.visible !== false).map(path => (
                            <path
                              key={path.id}
                              d={path.subPaths.map(points => pathToSvgD(points, path.closed)).join(' ')}
                              fill={path.color || (path.id === 'floor' ? 'rgba(255,255,255,0.05)' : 'rgba(51,51,51,0.85)')}
                              fillOpacity={path.opacity !== undefined ? path.opacity : (path.id === 'floor' ? 0.05 : 0.85)}
                              fillRule="evenodd"
                              stroke={path.id === 'floor' ? 'rgba(255,255,255,0.1)' : 'none'}
                            />
                          ))}

                          {/* Snap Guides - Infinite looking lines */}
                          {snapGuides.map((g, i) => (
                            <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
                              stroke={g.isPerfect ? '#2dd4bf' : (g.isPerp ? '#4ade80' : '#0ea5e9')} 
                              strokeWidth={(g.isPerfect ? 2 : 1.5) / zoom} 
                              strokeDasharray={g.isPerfect ? 'none' : '6 4'} 
                              opacity={1.0}
                            />
                          ))}

                          {/* 90-degree Corner Square Marker */}
                          {perpPoint && (
                            <rect
                              x={perpPoint.x - 4 / zoom} y={perpPoint.y - 4 / zoom}
                              width={8 / zoom} height={8 / zoom}
                              fill="none" stroke="#10b981" strokeWidth={1 / zoom}
                            />
                          )}

                          {/* Thales Circle Snap Guide */}
                          {snapCircle && (
                            <circle
                              cx={snapCircle.x} cy={snapCircle.y} r={snapCircle.r}
                              fill="none" stroke="#10b981" strokeWidth={0.5 / zoom} strokeDasharray="2 2" opacity={0.3}
                            />
                          )}

                          {/* Rendering Control Points & Handles for Curves */}
                          {editMode && (svgPaths.find(p => p.id === selectedPathId) || svgPaths[0])?.subPaths.map((pts, s) => pts.map((pt, i) => {
                            if (!pt.bezier) return null;
                            const prevIdx = (i - 1 + pts.length) % pts.length;
                            const prev = pts[prevIdx];
                            return (
                              <g key={`bezier-${s}-${i}`}>
                                <line x1={prev.x} y1={prev.y} x2={pt.bezier.cx1} y2={pt.bezier.cy1} stroke="#facc15" strokeWidth={1.5/zoom} strokeOpacity={0.8} strokeDasharray="3 3" />
                                <line x1={pt.x} y1={pt.y} x2={pt.bezier.cx2} y2={pt.bezier.cy2} stroke="#facc15" strokeWidth={1.5/zoom} strokeOpacity={0.8} strokeDasharray="3 3" />
                                <circle cx={pt.bezier.cx1} cy={pt.bezier.cy1} r={4.5/zoom} fill={selectedPoints.has(`${s}-${i}-c1`) ? "#10b981" : "#facc15"} className="cursor-move" />
                                <circle cx={pt.bezier.cx2} cy={pt.bezier.cy2} r={4.5/zoom} fill={selectedPoints.has(`${s}-${i}-c2`) ? "#10b981" : "#facc15"} className="cursor-move" />
                              </g>
                            );
                          }))}

                          {/* Selection Box (Marquee) */}
                          {selectionBox && (
                            <rect
                              x={Math.min(selectionBox.x1, selectionBox.x2)}
                              y={Math.min(selectionBox.y1, selectionBox.y2)}
                              width={Math.abs(selectionBox.x2 - selectionBox.x1)}
                              height={Math.abs(selectionBox.y2 - selectionBox.y1)}
                              fill="rgba(16,185,129,0.1)"
                              stroke="#10b981"
                              strokeWidth={1 / zoom}
                              strokeDasharray="4 4"
                            />
                          )}

                          {/* Selection & Point editing */}
                          {svgPaths.map((path) => 
                            (path.id === selectedPathId && path.visible !== false && !path.locked) 
                            ? path.subPaths.map((points, s) => (
                            <g key={`${path.id}-${s}`}>
                              {/* Invisible hit area for the entire chunk */}
                              <path
                                d={pathToSvgD(points, true)}
                                fill="none"
                                stroke={selectedPathId === path.id ? 'transparent' : 'transparent'}
                                strokeWidth={8 / zoom}
                                onClick={(e) => { e.stopPropagation(); setSelectedPathId(path.id); if (!e.ctrlKey && !e.metaKey) setSelectedPoints(new Set()); }}
                                style={{ cursor: 'pointer' }}
                              />
                              {editMode && selectedPathId === path.id && points.map((pt, i) => {
                                const key = `${s}-${i}`;
                                return (
                                  <circle key={i} cx={pt.x} cy={pt.y} r={4 / zoom}
                                    fill={selectedPoints.has(key) || highlightedPoints.has(key) ? '#10b981' : '#fff'}
                                    stroke={selectedPoints.has(key) || highlightedPoints.has(key) ? '#10b981' : '#333'}
                                    strokeWidth={1.5 / zoom}
                                    style={{ cursor: 'move' }}
                                  />
                                );
                              })}
                            </g>
                          )) : null)}

                          {/* Segment Hover Add Node Guide */}
                          {editMode && addNodeGuide && !draggingPoint && !isPanning && (
                            <circle cx={addNodeGuide.pt.x} cy={addNodeGuide.pt.y} r={5 / zoom}
                              fill="#0ea5e9" stroke="#fff" strokeWidth={1.5 / zoom}
                              style={{ cursor: 'copy', pointerEvents: 'none' }}
                            />
                          )}
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
