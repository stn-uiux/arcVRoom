import * as THREE from 'three';

export type LightType = 'point' | 'ambient' | 'directional' | 'spot';
export type LightShape = 'none' | 'sphere' | 'hemisphere' | 'box' | 'plane';

export interface LightConfig {
  id: string;
  name?: string;
  type: LightType;
  enabled: boolean;
  position?: [number, number, number];
  intensity: number;
  color: string;
  distance?: number;
  decay?: number;
  castShadow?: boolean;
  shadowRadius?: number;
  angle?: number;
  penumbra?: number;
  rotation?: [number, number, number];
  shape?: LightShape;
}

export type FurnitureType = 'box' | 'sphere' | 'plane' | 'svg' | 'model' | 'clock';

export interface SubtractionItem {
  id: string;
  type: 'box' | 'sphere' | 'cylinder';
  position: [number, number, number];
  dimensions: [number, number, number];
  rotation: [number, number, number];
}

export interface FurnitureItem {
  id: string;
  name?: string;
  type: FurnitureType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  dimensions?: [number, number, number];
  url?: string; // For GLTF
  baseDimensions?: [number, number, number];
  // Extended props
  color?: string;
  textureId?: string;
  textureRepeat?: [number, number];
  visible?: boolean;
  svgData?: string;
  extrusion?: number;
  isHollow?: boolean;
  emissiveIntensity?: number;
  subtractions?: SubtractionItem[];
  doubleSide?: boolean;
  flipNormals?: boolean;
  glassOpacity?: number;
  glassColor?: string;
  glassMetalness?: number;
  glassRoughness?: number;
  groupId?: string;
  locked?: boolean;
  textureTiling?: boolean;
  textureDensity?: [number, number];
  textureOffset?: [number, number];
  displacementScale?: number;
  envMapIntensity?: number;
  castShadow?: boolean;
  showReflection?: boolean;
  hasGlass?: boolean;
}

export interface TextureConfig {
  id: string;
  name: string;
  url?: string;
  maps?: { 
    color?: string; 
    normal?: string; 
    roughness?: string; 
    metalness?: string;
    displacement?: string;
    ao?: string;
    emissive?: string;
    opacity?: string;
  };
  repeat?: [number, number];
  isCustom?: boolean;
  color?: string;
  opacity?: number;
  metalness?: number;
  roughness?: number;
  emissiveIntensity?: number;
  displacementScale?: number;
}

export const identifyTextureType = (fileName: string): keyof NonNullable<TextureConfig['maps']> | 'color' => {
  // Extract only the map-type suffix (the part after the last underscore before the extension)
  // e.g. "MetalWalkway011_1K-JPG_Color.jpg" -> "color"
  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  const lastPart = withoutExt.split(/[_-]/).pop()?.toLowerCase() || '';

  // Check the suffix part for specific map types
  if (lastPart === 'color' || lastPart === 'diffuse' || lastPart === 'albedo' || lastPart === 'basecolor' || lastPart === 'col') return 'color';
  if (lastPart === 'normal' || lastPart === 'normalgl' || lastPart === 'normaldx' || lastPart === 'nrm' || lastPart === 'nor') return 'normal';
  if (lastPart === 'roughness' || lastPart === 'rough') return 'roughness';
  if (lastPart === 'metalness' || lastPart === 'metallic' || lastPart === 'metal') return 'metalness';
  if (lastPart === 'displacement' || lastPart === 'disp' || lastPart === 'height') return 'displacement';
  if (lastPart === 'ambientocclusion' || lastPart === 'ao') return 'ao';
  if (lastPart === 'emission' || lastPart === 'emissive') return 'emissive';
  if (lastPart === 'opacity' || lastPart === 'alpha') return 'opacity';

  // Fallback: check the full filename for map type keywords (less reliable)
  const name = fileName.toLowerCase();
  if (name.includes('_color') || name.includes('_diffuse') || name.includes('_albedo')) return 'color';
  if (name.includes('_normal') || name.includes('_nrm')) return 'normal';
  if (name.includes('_roughness')) return 'roughness';
  if (name.includes('_metalness') || name.includes('_metallic')) return 'metalness';
  if (name.includes('_displacement') || name.includes('_height')) return 'displacement';
  if (name.includes('_ao') || name.includes('_ambientocclusion')) return 'ao';
  if (name.includes('_emission') || name.includes('_emissive')) return 'emissive';
  if (name.includes('_opacity') || name.includes('_alpha')) return 'opacity';

  return 'color';
};

export interface AppState {
  items: FurnitureItem[];
  lights: LightConfig[];
  customTextures: TextureConfig[];
  selectedIds: string[];
  environment: string;
  intensity: number;
  zoomPercent: number;
  unit: 'm' | 'cm';
  realtimeShadows: boolean;
  showEnvironment: boolean;
  showGrid: boolean;
  gizmoMode: 'translate' | 'rotate' | 'scale' | 'texture';
  vignetteSize: number;
  vignetteDarkness: number;
  bloomIntensity: number;
  environmentBlur: number;
  gridColor: string;
  showBackgroundColor: boolean;
  backgroundColor: string;
}
