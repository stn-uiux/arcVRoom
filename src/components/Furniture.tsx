import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { TransformControls, useGLTF, Html, PivotControls, useTexture } from '@react-three/drei';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
// @ts-ignore
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils';
// @ts-ignore
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader';
import { FurnitureItem, TextureConfig, SubtractionItem } from '../types';
import { DigitalClock } from './DigitalClock';
import { getPresetMaterials } from './MaterialsLibrary';
import { selectionMeshesRef } from '../selectionRegistry';
import { ACCENT_400 } from '../theme';
import { Evaluator, Brush, SUBTRACTION } from 'three-bvh-csg';
// @ts-ignore
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry';

// Set global DRACO decoder path for useGLTF
useGLTF.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const ModelLayer: React.FC<{ url: string; onModelLoaded: (scene: THREE.Group) => void }> = ({ url, onModelLoaded }) => {
  const { scene } = useGLTF(url);
  useEffect(() => {
    if (scene) onModelLoaded(scene);
  }, [scene, onModelLoaded]);
  return null;
};

// Extend THREE with BVH
(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

interface FurnitureProps {
  item: FurnitureItem;
  isSelected: boolean;
  isPreviewSelected: boolean;
  selectedSubId: string | null;
  onSelect: (id: string, multi?: boolean) => void;
  onSelectSub: (subId: string | null) => void;
  onUpdate: (id: string, updates: Partial<FurnitureItem>, undoable?: boolean, isGroupUpdate?: boolean) => void;
  onUpdateItems: (updates: { [id: string]: Partial<FurnitureItem> }, undoable?: boolean) => void;
  onUpdateLight: (id: string, updates: Partial<any>) => void;
  setIsDragging: (dragging: boolean) => void;
  shiftPressed: boolean;
  ctrlPressed: boolean;
  registerMesh: (id: string, mesh: THREE.Mesh | null) => void;
  otherMeshes: THREE.Mesh[];
  showGizmos: boolean;
  customTextures: TextureConfig[];
  multiSelect: boolean;
  isLastSelected: boolean;
  isBoxSelecting?: boolean;
  gizmoMode: 'translate' | 'rotate' | 'scale' | 'texture';
  realtimeShadows?: boolean;
  showReflection: boolean;
}

const SubtractionGizmo: React.FC<{
  sub: SubtractionItem;
  item: FurnitureItem;
  onUpdate: (id: string, updates: Partial<FurnitureItem>, undoable?: boolean) => void;
  onSelectSub: (subId: string | null) => void;
  setIsDragging: (dragging: boolean) => void;
  isSelected: boolean;
}> = ({ sub, item, onUpdate, onSelectSub, setIsDragging, isSelected }) => {
  const initialDimensions = useRef<[number, number, number] | null>(null);

  const gizmoMatrix = useMemo(() => {
    const m = new THREE.Matrix4();
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...sub.rotation));
    m.compose(new THREE.Vector3(...sub.position), quat, new THREE.Vector3(1, 1, 1));
    return m;
  }, [sub.id, ...sub.position, ...sub.rotation]);

  return (
    <>
      <group
        position={sub.position}
        rotation={sub.rotation}
      >
        {/* Selection Hit Box: ONLY active when not already selected to avoid competing with PivotControls */}
        {!isSelected && (
          <mesh
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelectSub(sub.id);
            }}
          >
            {sub.type === 'box' && <boxGeometry args={sub.dimensions} />}
            {sub.type === 'sphere' && <sphereGeometry args={[sub.dimensions[0] / 2, 16, 16]} />}
            {sub.type === 'cylinder' && <cylinderGeometry args={[sub.dimensions[0] / 2, sub.dimensions[0] / 2, sub.dimensions[1], 16]} />}
            <meshBasicMaterial visible={false} />
          </mesh>
        )}

        {/* Visual Helper: Purely visual, ignores all mouse events */}
        <mesh 
          // @ts-ignore
          pointerEvents="none"
          renderOrder={9999}
        >
          {sub.type === 'box' && <boxGeometry args={sub.dimensions} />}
          {sub.type === 'sphere' && <sphereGeometry args={[sub.dimensions[0] / 2, 16, 16]} />}
          {sub.type === 'cylinder' && <cylinderGeometry args={[sub.dimensions[0] / 2, sub.dimensions[0] / 2, sub.dimensions[1], 16]} />}
          <meshBasicMaterial
            wireframe
            color={isSelected ? ACCENT_400 : "#FF4458"}
            transparent
            opacity={isSelected ? 0.8 : 0.3}
            depthTest={false}
          />
        </mesh>
      </group>
      {isSelected && (
        <PivotControls
          matrix={gizmoMatrix}
          autoTransform={false}
          depthTest={false}
          fixed={true}
          scale={50}
          lineWidth={2}
          onDragStart={() => {
            setIsDragging(true);
            initialDimensions.current = [...sub.dimensions];
            onUpdate(item.id, {}, true); // Save history before drag
          }}
          onDrag={(matrix) => {
            const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
            matrix.decompose(pos, quat, scale);
            const rot = new THREE.Euler().setFromQuaternion(quat);
            const dims = initialDimensions.current || sub.dimensions;
            const newDims: [number, number, number] = [dims[0] * scale.x, dims[1] * scale.y, dims[2] * scale.z];
            const newSubs: SubtractionItem[] = (item.subtractions || []).map(s => s.id === sub.id ? {
              ...s,
              position: [pos.x, pos.y, pos.z] as [number, number, number],
              rotation: [rot.x, rot.y, rot.z] as [number, number, number],
              dimensions: newDims
            } : s);
            onUpdate(item.id, { subtractions: newSubs }, false);
          }}
          onDragEnd={() => {
            setIsDragging(false);
            onUpdate(item.id, { subtractions: item.subtractions }, false);
          }}
        />
      )}
    </>
  );
};

export const Furniture = React.memo(({
  item,
  isSelected,
  isPreviewSelected,
  selectedSubId,
  onSelect,
  onSelectSub,
  onUpdate,
  onUpdateItems,
  onUpdateLight,
  setIsDragging,
  shiftPressed,
  ctrlPressed,
  registerMesh,
  otherMeshes,
  showGizmos,
  customTextures,
  multiSelect,
  isLastSelected,
  isBoxSelecting = false,
  gizmoMode,
  realtimeShadows,
  showReflection
}: FurnitureProps) => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const groupRef = useRef<THREE.Group>(null!);
  const { scene } = useThree();
  const [loadedScene, setLoadedScene] = useState<THREE.Group | null>(null);

  const texConfig = useMemo(() => {
    return ([
      ...getPresetMaterials(),
      ...customTextures
    ].find(t => t.id === item.textureId)) as TextureConfig | undefined;
  }, [item.textureId, customTextures]);

  const mapUrls = useMemo(() => {
    if (!texConfig || item.textureId === 'none') return null;
    const urls: { [key: string]: string } = {};
    if (texConfig.maps) {
      Object.entries(texConfig.maps).forEach(([k, v]) => { if (v) urls[k] = v; });
    } else if (texConfig.url) {
      urls.color = texConfig.url;
    }
    return Object.keys(urls).length > 0 ? urls : null;
  }, [texConfig, item.textureId]);

  // Stable fallback for useTexture when no maps are needed
  const dummyMap = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

  // @ts-ignore
  const loadedMaps = useTexture(mapUrls || { dummy: dummyMap });

  const finalTextures = useMemo(() => {
    if (!mapUrls || !loadedMaps) return null;

    const result: { [key: string]: THREE.Texture } = {};
    const useTiling = item.textureTiling !== false;
    const densityX = item.textureDensity?.[0] ?? 1;
    const densityY = item.textureDensity?.[1] ?? 1;
    const offsetX = item.textureOffset?.[0] ?? 0;
    const offsetY = item.textureOffset?.[1] ?? 0;

    Object.keys(mapUrls).forEach(key => {
      const t = (loadedMaps as any)[key]?.clone();
      if (t) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (useTiling) {
          const baseRepeatX = texConfig?.repeat?.[0] || 1;
          const baseRepeatY = texConfig?.repeat?.[1] || 1;
          t.repeat.set(baseRepeatX * densityX, baseRepeatY * densityY);
          t.offset.set(offsetX, offsetY);
        } else {
          t.repeat.set(1, 1);
          t.offset.set(0, 0);
        }
        result[key] = t;
      }
    });

    return result;
  }, [mapUrls, loadedMaps, item.textureTiling, item.textureDensity, item.textureOffset, texConfig]);
  


  const [isColliding, setIsColliding] = useState(false);
  const pointerDownPos = useRef<{ x: number, y: number } | null>(null);

  const lastValidPos = useRef(new THREE.Vector3(...item.position));
  const lastValidRot = useRef(new THREE.Euler(...item.rotation));

  useEffect(() => {
    if (meshRef.current) {
      registerMesh(item.id, meshRef.current);
    }
    return () => registerMesh(item.id, null);
  }, [item.id, registerMesh]);

  const checkCollisionAt = (pos: THREE.Vector3, rot: THREE.Euler, scale: THREE.Vector3) => {
    if (!meshRef.current || !geometry) return false;
    const testMatrix = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), scale);
    const meshWorldMatrix = testMatrix.clone().multiply(meshRef.current.matrix);
    const tempBox = new THREE.Box3();
    const currentGeo = geometry as any;
    if (!currentGeo.boundingBox) currentGeo.computeBoundingBox();
    tempBox.copy(currentGeo.boundingBox).applyMatrix4(meshWorldMatrix);

    const tempMatrix = new THREE.Matrix4();
    // Use full scale for check, but snap-back later for gap
    const worldMatrix = testMatrix.clone().multiply(meshRef.current.matrix);

    const checkArch = (id: string = '', type: string = '', groupId: string = '') => {
      const lowerId = id.toLowerCase();
      const lowerGroup = (groupId || '').toLowerCase();
      
      const isWall = lowerId.includes('wall') || lowerGroup.includes('wall') || type === 'svg';
      const isGlass = lowerId.includes('glass') || lowerGroup.includes('glass');
      const isCeiling = lowerId.includes('ceiling') || lowerGroup.includes('ceiling');
      const isFloor = lowerId.includes('floor') || lowerGroup.includes('floor');
      
      if (isGlass) return 'glass';
      if (isCeiling) return 'ceiling';
      if (isFloor) return 'floor';
      if (isWall) return 'wall';
      return null;
    };

    const archType = checkArch(item.id, item.type, item.groupId);

    for (const other of otherMeshes) {
      if (other === meshRef.current) continue;

      const otherData = (other as any).userData || {};
      const otherArchType = checkArch(otherData.id, otherData.type, otherData.groupId);

      // Feature: Different architectural types (Wall vs Glass, Wall vs Floor) DO NOT collide with each other.
      // But identical architectural types (Wall vs Wall, like a duplicated SVG cap) DO collide with each other!
      if (archType && otherArchType && archType !== otherArchType) {
        continue;
      }


      const otherBox = new THREE.Box3().setFromObject(other);
      if (tempBox.intersectsBox(otherBox)) {
        const otherGeo = (other as any).collisionGeometry || (other as THREE.Mesh).geometry;
        if (currentGeo.boundsTree && otherGeo && otherGeo.boundsTree) {
          tempMatrix.copy(worldMatrix).invert().multiply(other.matrixWorld);
          if (currentGeo.boundsTree.intersectsGeometry(otherGeo, tempMatrix)) return true;
        } else { return true; }
      }
    }
    return false;
  };

  const model = useMemo(() => {
    if (item.url && loadedScene) {
      const clone = loadedScene.clone();
      const tempBox = new THREE.Box3().setFromObject(clone);
      const center = tempBox.getCenter(new THREE.Vector3());

      // X, Z는 중앙 정렬, Y는 모델의 바닥(min.y)을 0점에 맞춰 기즈모와 일치시킴
      clone.position.set(-center.x, -tempBox.min.y, -center.z);

      clone.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.receiveShadow = true;
          (mesh as any).geometry.computeBoundsTree();

          if (mesh.material) {
            // Clone materials so independent items don't share state overrides
            if (!mesh.userData.materialCloned) {
              mesh.material = Array.isArray(mesh.material)
                ? mesh.material.map(m => m.clone())
                : (mesh.material as THREE.Material).clone();
              mesh.userData.materialCloned = true;
            }

            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            let isAnyGlass = false;

            mats.forEach((mat: any) => {
              // Apply UI Culling overrides natively to all materials in the GLTF
              if (item.flipNormals !== undefined) {
                mat.side = item.flipNormals ? THREE.BackSide : (item.doubleSide === false ? THREE.FrontSide : THREE.DoubleSide);
              } else if (item.doubleSide !== undefined) {
                mat.side = item.doubleSide === false ? THREE.FrontSide : THREE.DoubleSide;
              }

              // Vital fix: Make sure the shadow engine respects material backface culling perfectly
              mat.shadowSide = mat.side;

              const hasTransmission = mat.isMeshPhysicalMaterial && mat.transmission > 0;
              const isByName = mat.name && mat.name.toLowerCase().includes('glass');
              const isGlass = hasTransmission || isByName;

              if (isGlass) {
                isAnyGlass = true;
                mat.transparent = true;
                
                // ARC-FIX: Only disable depthWrite for highly transparent items to prevent internal sorting artifacts
                // If opacity is high, we want depthWrite to hide backfaces/internal geometry
                const effectiveOpacity = item.glassOpacity !== undefined ? item.glassOpacity : (mat.opacity ?? 0.3);
                mat.depthWrite = effectiveOpacity > 0.8;
                
                // ARC-FIX: Respect user culling preference even for glass materials
                if (item.flipNormals !== undefined) {
                  mat.side = item.flipNormals ? THREE.BackSide : (item.doubleSide === false ? THREE.FrontSide : THREE.DoubleSide);
                } else if (item.doubleSide !== undefined) {
                  mat.side = item.doubleSide === false ? THREE.FrontSide : THREE.DoubleSide;
                } else {
                  // Default to DoubleSide only for glass if no override, to handle single-plane panes
                  mat.side = THREE.DoubleSide;
                }

                mat.envMapIntensity = Math.max(mat.envMapIntensity || 1, 1);

                if (item.glassColor) {
                  mat.color.set(item.glassColor);
                }

                if (item.glassOpacity !== undefined) {
                  mat.opacity = item.glassOpacity;
                  if (hasTransmission) {
                    mat.transmission = 1 - item.glassOpacity;
                  }
                } else {
                  if (!hasTransmission) {
                    mat.opacity = 0.2; // ARC-FIX: Default 0.2
                  }
                }

                mat.metalness = item.glassMetalness !== undefined ? item.glassMetalness : 1.0; // ARC-FIX: Default 1.0
                mat.roughness = item.glassRoughness !== undefined ? item.glassRoughness : 0.0; // ARC-FIX: Default 0.0
              } else {
                // For non-glass materials, respect opacity-based depthWrite but keep it TRUE for near-opaque items
                if (mat.transparent && mat.opacity < 0.9) {
                  mat.depthWrite = false;
                } else {
                  // Ensure solid frames/panels don't bleed depth
                  mat.depthWrite = true;
                }
              }

              // Basic assignments only during initial load/memoization
              // (Live updates are handled by the useEffect above)

              // ARC-FIX: Apply consistent renderOrder for sorting
              child.renderOrder = isSelected ? 20 : (mat.transparent ? 10 : 0);
            });

            // ARC-FIX: Let user control shadow casting, or default to NO SHADOW for glass
            const shouldCast = item.castShadow !== undefined ? item.castShadow : !isAnyGlass;
            mesh.castShadow = shouldCast;
            mesh.customDistanceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material; // Help shadow engine with transparency
          } else {
            mesh.castShadow = item.castShadow !== undefined ? item.castShadow : true;
          }
        }
      });
      return clone;
    }
    return null;
  }, [item.url, loadedScene, item.glassOpacity, item.glassColor, item.glassMetalness, item.glassRoughness, item.doubleSide, item.flipNormals]);
  
  // ARC-FIX: Detect if the model contains any glass materials and update state
  useEffect(() => {
    if (loadedScene && item.type === 'model' && item.hasGlass === undefined) {
      let containsGlass = false;
      loadedScene.traverse((child) => {
        if ((child as any).isMesh && (child as any).material) {
          const mats = Array.isArray((child as any).material) ? (child as any).material : [(child as any).material];
          mats.forEach((mat: any) => {
            const hasTransmission = mat.isMeshPhysicalMaterial && mat.transmission > 0;
            const isByName = mat.name && mat.name.toLowerCase().includes('glass');
            const isTransparent = mat.transparent === true && mat.opacity < 0.9;
            if (hasTransmission || isByName || isTransparent) {
              containsGlass = true;
            }
          });
        }
      });
      if (containsGlass) {
        onUpdate(item.id, { 
          hasGlass: true,
          glassOpacity: 0.2,
          glassMetalness: 1.0,
          glassRoughness: 0.0
        }, false);
      } else {
        onUpdate(item.id, { hasGlass: false }, false);
      }
    }
  }, [loadedScene, item.type, item.id, item.hasGlass, onUpdate]);

  // ARC-FIX: Sync material properties live when sliders change (Optimized: No re-cloning)
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          
          mats.forEach((mat: any) => {
            // ARC-FIX: Apply Material Properties from Config (Support for Custom Materials on Models)
            if (item.textureId && item.textureId !== 'none' && texConfig) {
              if (texConfig.opacity !== undefined) {
                mat.opacity = texConfig.opacity;
                mat.transparent = mat.opacity < 0.99;
              }
              if (texConfig.metalness !== undefined) mat.metalness = texConfig.metalness;
              if (texConfig.roughness !== undefined) mat.roughness = texConfig.roughness;
              if (texConfig.color) mat.color.set(texConfig.color);
            }

            // ARC-FIX: Get reflection properties
            const hasTransmission = mat.isMeshPhysicalMaterial && mat.transmission > 0;
            const isByName = mat.name && mat.name.toLowerCase().includes('glass');
            const isGlass = hasTransmission || isByName;

            // Apply environment intensity
            const canReflect = showReflection === true;
            
            if (!canReflect) {
              mat.envMapIntensity = 0;
            } else if (item.envMapIntensity !== undefined) {
              mat.envMapIntensity = item.envMapIntensity;
            } else {
              // Default intensity when enabled
              mat.envMapIntensity = 1.0;
            }

            // ARC-FIX: Force updates for materials that might be static
            if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
              if (!mat.envMap && scene.environment) {
                mat.envMap = scene.environment;
              }
              mat.needsUpdate = true;
            }
          });
        }
      });
    }
  }, [item.envMapIntensity, showReflection, scene.environment, loadedScene, texConfig]); 
// Note: item.url check to see if it's a model
  
  // ARC-FIX: Object level shadow sync (Traverses models to ensure children sync)
  useEffect(() => {
    if (meshRef.current) {
      // Logic: Explicitly OFF if castShadow is false, otherwise default to context
      const shouldCast = item.castShadow !== false;
      const shouldReceive = !!realtimeShadows;
      
      meshRef.current.traverse((child) => {
        if ((child as any).isMesh) {
          child.castShadow = shouldCast;
          child.receiveShadow = shouldReceive;
        }
      });
    }
  }, [item.castShadow, realtimeShadows, loadedScene]);

  const svgGeometry = useMemo(() => {
    if ((item.type === 'svg' || item.type === 'model') && item.svgData) {
      const loader = new SVGLoader();
      const result = loader.parse(item.svgData);
      const allShapes: THREE.Shape[] = [];
      result.paths.forEach((path) => {
        const pathShapes = SVGLoader.createShapes(path);
        allShapes.push(...pathShapes);
      });

      if (allShapes.length === 0) return null;

      // ArcLabV: Calculate bounding box from curves
      const box = new THREE.Box2();
      allShapes.forEach(shape => {
        shape.curves.forEach(curve => {
          const points = curve.getPoints(10);
          points.forEach(p => box.expandByPoint(new THREE.Vector2(p.x, p.y)));
        });
      });

      const center2D = new THREE.Vector2();
      box.getCenter(center2D);
      const size2D = new THREE.Vector2();
      box.getSize(size2D);
      const extrusion = item.extrusion ?? 2; // ?? preserves 0 (flat plane for ceiling/floor)

      // Second pass: Create geometries with vertex colors
      const geometries: THREE.BufferGeometry[] = [];
      result.paths.forEach((path) => {
        const pathShapes = SVGLoader.createShapes(path);
        const isFill = path.userData?.style?.fill && path.userData.style.fill !== 'none';
        
        pathShapes.forEach(shape => {
          let geo: THREE.BufferGeometry;
          if (extrusion > 0.01) {
            geo = new THREE.ExtrudeGeometry(shape, {
              depth: extrusion,
              bevelEnabled: false,
              curveSegments: 32
            });
          } else {
            geo = new THREE.ShapeGeometry(shape, 32);
          }

          // Transform coordinate: flip Y and center
          geo.scale(1, -1, 1);
          geo.translate(-center2D.x, center2D.y, 0);
          geo.rotateX(-Math.PI / 2);

          // Handle Hollow (open top/bottom)
          if (item.isHollow && extrusion > 0.01) {
            const nonIndexed = geo.toNonIndexed();
            const posAttr = nonIndexed.getAttribute('position');
            const normAttr = nonIndexed.getAttribute('normal');
            const uvAttr = nonIndexed.getAttribute('uv');
            const filteredPositions: number[] = [];
            const filteredNormals: number[] = [];
            const filteredUvs: number[] = [];

            for (let i = 0; i < posAttr.count; i += 3) {
              const ny = normAttr.getY(i);
              if (Math.abs(ny) < 0.5) {
                for (let j = 0; j < 3; j++) {
                  filteredPositions.push(posAttr.getX(i + j), posAttr.getY(i + j), posAttr.getZ(i + j));
                  filteredNormals.push(normAttr.getX(i + j), normAttr.getY(i + j), normAttr.getZ(i + j));
                  if (uvAttr) filteredUvs.push(uvAttr.getX(i + j), uvAttr.getY(i + j));
                }
              }
            }
            geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(filteredPositions, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(filteredNormals, 3));
            if (filteredUvs.length > 0) geo.setAttribute('uv', new THREE.Float32BufferAttribute(filteredUvs, 2));
          }

          // Apply Vertex Colors
          geo = geo.toNonIndexed();
          const pos = geo.getAttribute('position');
          const norm = geo.getAttribute('normal');
          const colors = new Float32Array(pos.count * 3);

          const lowerId = (item.id || '').toLowerCase();
          const lowerGroup = (item.groupId || '').toLowerCase();
          const isWall = (lowerId.includes('wall') || lowerGroup.includes('wall')) && 
                         !lowerId.includes('floor') && !lowerId.includes('ceiling') &&
                         !lowerGroup.includes('floor') && !lowerGroup.includes('ceiling');
          
          const canHaveBlackTop = isWall || item.type === 'box';
          const shouldShowBlackTop = item.showBlackTop === true; // Default to false

          for (let i = 0; i < pos.count; i++) {
            const ny = norm.getY(i);
            // If it should show black top, is a fill, and normal points UP, paint it BLACK
            if (canHaveBlackTop && shouldShowBlackTop && isFill && ny > 0.5) {
              colors[i * 3] = 0; // Pure black
              colors[i * 3 + 1] = 0;
              colors[i * 3 + 2] = 0;
            } else {
              // Otherwise white (will be tinted by material color)
              colors[i * 3] = 1;
              colors[i * 3 + 1] = 1;
              colors[i * 3 + 2] = 1;
            }
          }
          geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

          // Fix Winding Order
          for (let i = 0; i < pos.count; i += 3) {
            const x1 = pos.getX(i + 1), y1 = pos.getY(i + 1), z1 = pos.getZ(i + 1);
            const x2 = pos.getX(i + 2), y2 = pos.getY(i + 2), z2 = pos.getZ(i + 2);
            pos.setXYZ(i + 1, x2, y2, z2);
            pos.setXYZ(i + 2, x1, y1, z1);
          }

          geometries.push(geo);
        });
      });

      if (geometries.length === 0) return null;

      // 4. ArcLabV: Merge all shapes into one solid
      let merged = mergeGeometries(geometries);
      if (!merged) return null;

      // 5. ArcLabV Manifold Cleanup: weld vertices, recompute normals
      merged = mergeVertices(merged, 1e-4);
      merged.deleteAttribute('normal');
      merged.computeVertexNormals();
      merged.computeBoundingSphere();
      merged.computeBoundingBox();

      // Apply app-specific scaling
      if (!item.dimensions && !item.baseDimensions) {
        merged.scale(0.1, 1.0, 0.1);
      }

      if (item.dimensions) {
        merged.computeBoundingBox();
        const size = new THREE.Vector3();
        merged.boundingBox!.getSize(size);
        merged.scale(
          item.dimensions[0] / (size.x || 1),
          item.dimensions[1] / (size.y || 1),
          item.dimensions[2] / (size.z || 1)
        );
        merged.computeBoundingBox();
        merged.translate(0, -merged.boundingBox!.min.y, 0);
      }

      // BOX MAPPING: Improved Planar UVs based on surface normals (Critical for walls)
      merged.computeBoundingBox();
      const pos = merged.attributes.position;
      const norm = merged.attributes.normal;
      const uvs = new Float32Array(pos.count * 2);
      const uvScale = 0.1; 
      
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        
        const nx = Math.abs(norm.getX(i));
        const ny = Math.abs(norm.getY(i));
        const nz = Math.abs(norm.getZ(i));
        
        if (ny > nx && ny > nz) {
          // Horizontal surface (Floor/Ceiling) -> Project on XZ
          uvs[i * 2] = x * uvScale;
          uvs[i * 2 + 1] = z * uvScale;
        } else if (nx > nz) {
          // Vertical surface facing X -> Project on ZY
          uvs[i * 2] = z * uvScale;
          uvs[i * 2 + 1] = y * uvScale;
        } else {
          // Vertical surface facing Z -> Project on XY
          uvs[i * 2] = x * uvScale;
          uvs[i * 2 + 1] = y * uvScale;
        }
      }
      merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      merged.setAttribute('uv2', new THREE.BufferAttribute(uvs, 2));

      (merged as any).computeBoundsTree?.();
      return merged;
    }
    return null;
  }, [item.type, item.svgData, item.extrusion, item.dimensions, item.isHollow, item.showBlackTop]);


  const geometry = useMemo(() => {
    let baseGeo: THREE.BufferGeometry;
    if (svgGeometry) {
      baseGeo = svgGeometry.clone();
    } else if (item.url && loadedScene) {
      const geometries: THREE.BufferGeometry[] = [];
      const tempScene = loadedScene.clone();
      tempScene.position.set(0, 0, 0); tempScene.rotation.set(0, 0, 0); tempScene.scale.set(1, 1, 1);
      tempScene.updateMatrixWorld(true);
      tempScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const geo = (child as THREE.Mesh).geometry.clone();
          geo.applyMatrix4((child as THREE.Mesh).matrixWorld);
          Object.keys(geo.attributes).forEach(k => { if (k !== 'position') geo.deleteAttribute(k); });
          geometries.push(geo);
        }
      });
      if (geometries.length > 0) {
        baseGeo = mergeGeometries(geometries) || new THREE.BoxGeometry(0.001, 0.001, 0.001);
      } else {
        // If it's a model but we found no meshes yet, return null to avoid showing a box
        if (item.type === 'model' || item.url) return null;
        baseGeo = new THREE.BoxGeometry(1, 1, 1);
      }
    } else {
      const d = item.dimensions || [1, 1, 1];
      if (item.type === 'box') {
        const radius = item.borderRadius ?? 0;
        const segments = item.borderSegments ?? 4;
        if (radius > 0) {
          // @ts-ignore
          baseGeo = new RoundedBoxGeometry(d[0], d[1], d[2], segments, radius).translate(0, d[1] / 2, 0);
        } else {
          baseGeo = new THREE.BoxGeometry(d[0], d[1], d[2]).translate(0, d[1] / 2, 0);
        }
      }
      else if (item.type === 'sphere') baseGeo = new THREE.SphereGeometry(d[0] / 2, 32, 16).translate(0, d[1] / 2, 0);

      else if (item.type === 'plane') baseGeo = new THREE.PlaneGeometry(d[0], d[2]).rotateX(-Math.PI / 2).translate(0, 0, 0);
      else if (item.type === 'clock') baseGeo = new THREE.BoxGeometry(1.2, 0.85, 0.05).translate(0, 0.425, 0);
      else baseGeo = new THREE.BoxGeometry(d[0], d[1], d[2]);

      // Ensure normals are correctly computed for lighting and transparency
      baseGeo.computeVertexNormals();
      baseGeo.computeBoundingBox();

      // Add uv2 for AO map support (standard requirement for MeshStandardMaterial.aoMap)
      if (baseGeo.attributes.uv) {
        baseGeo.setAttribute('uv2', new THREE.BufferAttribute(baseGeo.attributes.uv.array, 2));
      }
    }

    if (item.subtractions && item.subtractions.length > 0) {
      const evaluator = new Evaluator();
      let resBrush = new Brush(baseGeo);
      resBrush.updateMatrixWorld();

      item.subtractions.forEach(sub => {
        let subGeo;
        if (sub.type === 'box') subGeo = new THREE.BoxGeometry(...sub.dimensions);
        else if (sub.type === 'sphere') subGeo = new THREE.SphereGeometry(sub.dimensions[0] / 2, 16, 16);
        else subGeo = new THREE.CylinderGeometry(sub.dimensions[0] / 2, sub.dimensions[0] / 2, sub.dimensions[1], 16);

        if (subGeo) {
          const subBrush = new Brush(subGeo);
          subBrush.position.set(...sub.position);
          subBrush.rotation.set(...sub.rotation);
          subBrush.updateMatrixWorld();
          const nextResult = evaluator.evaluate(resBrush, subBrush, SUBTRACTION);

          // ArcLabV isHollow: Discard Group 1 (subtractor cap faces) to avoid "capping" the hole
          if (item.isHollow) {
            const groups = nextResult.geometry.groups;
            if (groups.length > 1) {
              const group0 = groups[0];
              const filteredGeo = nextResult.geometry.clone();
              if (filteredGeo.index) {
                const newIndexArray = filteredGeo.index.array.slice(group0.start, group0.start + group0.count);
                filteredGeo.setIndex(new THREE.BufferAttribute(newIndexArray, 1));
              } else {
                const pos = filteredGeo.getAttribute('position');
                filteredGeo.setAttribute('position', new THREE.BufferAttribute(pos.array.slice(group0.start * 3, (group0.start + group0.count) * 3), 3));
                const norm = filteredGeo.getAttribute('normal');
                if (norm) filteredGeo.setAttribute('normal', new THREE.BufferAttribute(norm.array.slice(group0.start * 3, (group0.start + group0.count) * 3), 3));
                const uv = filteredGeo.getAttribute('uv');
                if (uv) filteredGeo.setAttribute('uv', new THREE.BufferAttribute(uv.array.slice(group0.start * 2, (group0.start + group0.count) * 2), 2));
              }
              filteredGeo.clearGroups();
              nextResult.geometry = filteredGeo;
            }
          }

          resBrush = nextResult;
          resBrush.updateMatrixWorld();
        }
      });
      baseGeo = resBrush.geometry;
    }


    baseGeo.computeVertexNormals();

    // ArcLabV: Final pass for wall top coloring (persists after CSG/scaling)
    const lowerId = (item.id || '').toLowerCase();
    const lowerGroup = (item.groupId || '').toLowerCase();
    const isWall = (lowerId.includes('wall') || lowerGroup.includes('wall')) && 
                   !lowerId.includes('floor') && !lowerId.includes('ceiling') &&
                   !lowerGroup.includes('floor') && !lowerGroup.includes('ceiling');

    const canHaveBlackTop = isWall || item.type === 'box';
    const shouldShowBlackTop = item.showBlackTop === true; // Default to false

    if (canHaveBlackTop) {
      baseGeo = baseGeo.toNonIndexed();
      const pos = baseGeo.getAttribute('position');
      const norm = baseGeo.getAttribute('normal');
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const ny = norm.getY(i);
        if (shouldShowBlackTop && ny > 0.5) {
          colors[i * 3] = 0; // Pure black
          colors[i * 3 + 1] = 0;
          colors[i * 3 + 2] = 0;
        } else {
          colors[i * 3] = 1; // Pure white
          colors[i * 3 + 1] = 1;
          colors[i * 3 + 2] = 1;
        }
      }
      baseGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    (baseGeo as any).computeBoundsTree?.();
    
    // ARC-FIX: BOX MAPPING - Improved Planar UVs based on surface normals (Prevents texture stretching)
    if (item.type === 'box' || item.type === 'plane' || isWall) {
      const pos = baseGeo.attributes.position;
      const norm = baseGeo.attributes.normal;
      const uvs = new Float32Array(pos.count * 2);
      const uvScale = 1.0; 
      
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        
        const nx = Math.abs(norm.getX(i));
        const ny = Math.abs(norm.getY(i));
        const nz = Math.abs(norm.getZ(i));
        
        if (ny > 0.5) { // Top/Bottom faces
          uvs[i * 2] = x * uvScale;
          uvs[i * 2 + 1] = z * uvScale;
        } else if (nx > 0.5) { // Side faces (X-facing)
          uvs[i * 2] = z * uvScale;
          uvs[i * 2 + 1] = y * uvScale;
        } else { // Side faces (Z-facing)
          uvs[i * 2] = x * uvScale;
          uvs[i * 2 + 1] = y * uvScale;
        }
      }
      baseGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      baseGeo.setAttribute('uv2', new THREE.BufferAttribute(uvs, 2));
    }

    return baseGeo;
  }, [item.type, item.url, item.dimensions, item.subtractions, item.isHollow, item.showBlackTop, item.borderRadius, item.borderSegments, loadedScene, svgGeometry]);




  // Performance Fix: Trigger material update ONLY when textures change
  useEffect(() => {
    if (meshRef.current?.material) {
      (meshRef.current.material as THREE.Material).needsUpdate = true;
    }
  }, [finalTextures]);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.userData = { ...meshRef.current.userData, id: item.id, type: item.type, groupId: item.groupId, locked: item.locked };
      (meshRef.current as any).collisionGeometry = geometry;
      registerMesh(item.id, isSelected ? null : meshRef.current);

      // Always register for selection detection (even when selected)
      selectionMeshesRef.current[item.id] = meshRef.current;

      // Auto-update dimensions if missing
      if (item.id && (item.type === 'svg' || item.type === 'model' || item.url) && !item.dimensions && !item.baseDimensions) {
        const geo = svgGeometry || geometry;
        if (geo) {
          if (!geo.boundingBox) geo.computeBoundingBox();
          const size = new THREE.Vector3();
          geo.boundingBox!.getSize(size);
          if (size.length() > 0) {
            onUpdate(item.id, {
              baseDimensions: [size.x, size.y, size.z] as [number, number, number],
              dimensions: [size.x, size.y, size.z] as [number, number, number]
            }, false);
          }
        }
      }
    }
    return () => {
      registerMesh(item.id, null);
      delete selectionMeshesRef.current[item.id];
    };
  }, [item.id, registerMesh, geometry, svgGeometry, isSelected, item.type, item.url, item.dimensions, item.baseDimensions, onUpdate]);

  // Pre-allocated objects for useFrame to avoid GC pressure and Illegal constructor errors
  const _tempPos = useMemo(() => new THREE.Vector3(), []);
  const _tempQuat = useMemo(() => new THREE.Quaternion(), []);
  const _tempRot = useMemo(() => new THREE.Euler(), []);
  const _lastQuat = useMemo(() => new THREE.Quaternion(), []);
  const _currentQuat = useMemo(() => new THREE.Quaternion(), []);
  // Track if position/rotation actually changed to skip collision checks during camera movement
  const _prevPos = useMemo(() => new THREE.Vector3(...item.position), []);
  const _prevRot = useMemo(() => new THREE.Euler(...item.rotation), []);
  // Grace period: skip collision for first N frames after spawn so geometry/BVH can settle
  const _spawnGrace = useRef(10);

  useFrame(() => {
    // Countdown spawn grace
    if (_spawnGrace.current > 0) {
      _spawnGrace.current--;
      // Sync tracking so first real frame doesn't see a phantom move
      if (groupRef.current) {
        _prevPos.copy(groupRef.current.position);
        _prevRot.copy(groupRef.current.rotation);
        lastValidPos.current.copy(groupRef.current.position);
        lastValidRot.current.copy(groupRef.current.rotation);
      }
      return;
    }

    // Early exit: no mesh, no others, or not relevant
    if (!meshRef.current || otherMeshes.length === 0 || (!isSelected && !isColliding)) {
      return;
    }

    const currentPos = groupRef.current.position;
    const currentRot = groupRef.current.rotation;

    // PERF FIX: Only run expensive collision checks if the object's transform actually changed
    // (i.e., user is dragging it), NOT when only the camera is moving
    const posChanged = !_prevPos.equals(currentPos);
    const rotChanged = _prevRot.x !== currentRot.x || _prevRot.y !== currentRot.y || _prevRot.z !== currentRot.z;
    _prevPos.copy(currentPos);
    _prevRot.copy(currentRot);

    if (!posChanged && !rotChanged) {
      return; // Camera is moving but object is still — skip collision
    }

    let colliding = checkCollisionAt(currentPos, currentRot, groupRef.current.scale);
    
    // Only update state if it actually changed to avoid unnecessary re-renders
    if (colliding !== isColliding) {
      setIsColliding(colliding);
    }

    // If perfectly stuck (spawning, bad scaling, etc.), allow users to drag their way OUT.
    const isLastValidColliding = checkCollisionAt(lastValidPos.current, lastValidRot.current, groupRef.current.scale);

    if (colliding && isSelected && !isLastValidColliding) {
      let low = 0, high = 1;
      _lastQuat.setFromEuler(lastValidRot.current);
      _currentQuat.setFromEuler(currentRot);
      for (let i = 0; i < 10; i++) { // Increased precision to 10 steps
        const mid = (low + high) / 2;
        _tempPos.lerpVectors(lastValidPos.current, currentPos, mid);
        _tempQuat.slerpQuaternions(_lastQuat, _currentQuat, mid);
        _tempRot.setFromQuaternion(_tempQuat);
        if (!checkCollisionAt(_tempPos, _tempRot, groupRef.current.scale)) {
          low = mid;
        } else { high = mid; }
      }

      // Implement 0.004 absolute safety gap on top of collision point
      const dist = lastValidPos.current.distanceTo(currentPos);
      const gapT = 0.004 / (dist || 1);
      const finalT = Math.max(0, low - gapT);
      _tempPos.lerpVectors(lastValidPos.current, currentPos, finalT);
      _tempQuat.slerpQuaternions(_lastQuat, _currentQuat, finalT);
      _tempRot.setFromQuaternion(_tempQuat);

      groupRef.current.position.copy(_tempPos);
      groupRef.current.rotation.copy(_tempRot);
    } else if (!colliding) {
      lastValidPos.current.copy(currentPos);
      lastValidRot.current.copy(currentRot);
    }
  });

  const mainGizmoMatrix = useMemo(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...item.rotation));
    m.compose(new THREE.Vector3(...item.position), q, new THREE.Vector3(...item.scale));
    return m;
  }, [item.id, ...item.position, ...item.rotation, ...item.scale]);

  const [hovered, setHovered] = useState(false);

  return (
    <>
      {item.url && <ModelLayer url={item.url} onModelLoaded={setLoadedScene} />}
      <group
        ref={groupRef}
        visible={item.visible !== false}
        position={item.position}
        rotation={item.rotation}
        scale={item.scale}
        userData={{ id: item.id, isFurniture: true, locked: item.locked }}
        onPointerDown={item.locked ? undefined : ((e) => { pointerDownPos.current = { x: e.clientX, y: e.clientY }; })}
        onPointerUp={item.locked ? undefined : ((e) => {
          if (pointerDownPos.current) {
            const dx = e.clientX - pointerDownPos.current.x;
            const dy = e.clientY - pointerDownPos.current.y;
            if (Math.sqrt(dx * dx + dy * dy) < 10) { e.stopPropagation(); onSelect(item.id, e.shiftKey || e.ctrlKey || e.metaKey); }
            pointerDownPos.current = null;
          }
        })}
        onPointerOver={item.locked || isSelected ? undefined : ((e) => { e.stopPropagation(); setHovered(true); })}
        onPointerOut={item.locked || isSelected ? undefined : (() => setHovered(false))}
      >
        {model ? (
          <primitive object={model} ref={meshRef} />
        ) : item.type === 'clock' ? (
          <DigitalClock ref={meshRef} color={item.color} emissiveIntensity={item.emissiveIntensity} />
        ) : (
          <mesh
            ref={meshRef}
            visible={item.type !== 'model' || !!loadedScene}
            geometry={geometry as any}
            userData={{ id: item.id, isFurniture: true, locked: item.locked }}
            castShadow={item.castShadow !== undefined ? item.castShadow : (!!realtimeShadows && (texConfig?.opacity ?? 1) > 0.8)}
            receiveShadow={!!realtimeShadows}
            renderOrder={isSelected || isPreviewSelected ? 20 : (texConfig?.opacity ?? 1) < 0.99 ? 10 : 0}
            frustumCulled={false}
          >
            <meshStandardMaterial
              color={(item.textureId && item.textureId !== 'none') ? (texConfig?.color || "#ffffff") : (item.color || texConfig?.color || (isSelected || isPreviewSelected ? "#60a5fa" : "#94a3b8"))}
              vertexColors={(() => {
                const lowerId = (item.id || '').toLowerCase();
                const lowerGroup = (item.groupId || '').toLowerCase();
                const isWall = (lowerId.includes('wall') || lowerGroup.includes('wall')) && 
                               !lowerId.includes('floor') && !lowerId.includes('ceiling');
                return isWall || item.type === 'box';
              })()}
              map={finalTextures?.color || null}
              normalMap={finalTextures?.normal || null}
              roughnessMap={finalTextures?.roughness || null}
              metalnessMap={finalTextures?.metalness || null}
              aoMap={finalTextures?.ao || null}
              displacementMap={finalTextures?.displacement || null}
              displacementScale={item.displacementScale ?? texConfig?.displacementScale ?? 0.1}
              emissiveMap={finalTextures?.emissive || null}
              emissive={(item.textureId && item.textureId !== 'none') ? (texConfig?.color || '#000000') : (item.color || texConfig?.color || '#000000')}
              emissiveIntensity={texConfig?.emissiveIntensity ?? (item.emissiveIntensity || 0)}
              alphaMap={finalTextures?.opacity || null}
              metalness={texConfig?.metalness ?? 0.1}
              roughness={texConfig?.roughness ?? 0.7}
              envMapIntensity={item.showReflection === false ? 0 : (item.envMapIntensity ?? 1.0)}
              transparent={(texConfig?.opacity ?? 1) < 0.99 || !!finalTextures?.opacity}
              opacity={texConfig?.opacity ?? 1}
              depthWrite={(texConfig?.opacity ?? 1) > 0.8 && !finalTextures?.opacity}
              depthTest={true}
              alphaTest={finalTextures?.opacity ? 0.05 : 0}
              side={
                item.flipNormals ? THREE.BackSide :
                  item.doubleSide === true || item.type === 'sphere' ? THREE.DoubleSide : THREE.FrontSide
              }
              shadowSide={
                item.flipNormals ? THREE.BackSide :
                  item.doubleSide === true || item.type === 'sphere' ? THREE.DoubleSide : THREE.FrontSide
              }

            />
          </mesh>
        )}
        <mesh 
          geometry={geometry as any} 
          position={model ? model.position : undefined}
          userData={{ isGizmo: true }}
          renderOrder={1000} // Ensure it's rendered after everything else
        >
          <meshBasicMaterial
            color={isColliding ? "#FF4458" : (isSelected && item.locked) ? "#eab308" : (isBoxSelecting ? isPreviewSelected : isSelected) ? "#38CC15" : (!isBoxSelecting && ctrlPressed && hovered) ? "#eab308" : "#38CC15"}
            wireframe
            transparent
            opacity={0.3}
            visible={(isBoxSelecting ? isPreviewSelected : isSelected) || (!isBoxSelecting && ctrlPressed && hovered)}
            depthTest={true}
            polygonOffset
            polygonOffsetFactor={-4} // Increased factor to push it significantly towards the camera
            polygonOffsetUnits={-4}
          />
        </mesh>
        {isSelected && item.subtractions?.map(sub => (
          <SubtractionGizmo
            key={sub.id}
            sub={sub}
            item={item}
            isSelected={selectedSubId === sub.id}
            onSelectSub={onSelectSub}
            onUpdate={onUpdate}
            setIsDragging={setIsDragging}
          />
        ))}
        {isColliding && (
          <Html distanceFactor={10} position={[0, 2, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
            <div className="bg-red-500/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-lg border border-white/20 animate-pulse uppercase tracking-wider">
              Collision
            </div>
          </Html>
        )}
      </group>

      {isSelected && isLastSelected && !multiSelect && !selectedSubId && !item.locked && (
        <PivotControls
          matrix={mainGizmoMatrix}
          autoTransform={false}
          depthTest={false}
          fixed={true}
          scale={60}
          lineWidth={2}
          activeAxes={gizmoMode === 'texture' ? [true, false, true] : [true, true, true]}
          axisColors={['#FF4458', '#38CC15', '#3D8BFB']}
          hoveredColor="#fde047"
          opacity={1.0}
          renderOrder={999}
          onDragStart={() => {
            onUpdate(item.id, {}, true);
            setIsDragging(true);
          }}
          onDrag={(matrix) => {
            const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
            matrix.decompose(pos, quat, scl);
            const rot = new THREE.Euler().setFromQuaternion(quat);

            if (gizmoMode === 'texture') {
              // Texture Gizmo: Use delta to shift offset (X and Z are horizontal plane)
              // Invert both axes for opposite response. Reduced sensitivity for precision (0.2 instead of 0.5)
              const deltaX = (pos.x - item.position[0]) * -0.2;
              const deltaZ = (pos.z - item.position[2]) * 0.2;
              const currentOff = item.textureOffset || [0, 0];
              onUpdate(item.id, {
                textureOffset: [currentOff[0] + deltaX, currentOff[1] + deltaZ]
              }, false);
              return;
            }

            // Synchronize Gizmo with collision state
            let bestPos: [number, number, number] = [pos.x, pos.y, pos.z];
            let bestRot: [number, number, number] = [rot.x, rot.y, rot.z];

            const isLastValidColliding = checkCollisionAt(lastValidPos.current, lastValidRot.current, scl);

            if (checkCollisionAt(pos, rot, scl) && !isLastValidColliding) {
              let low = 0, high = 1;
              const lastQuat = new THREE.Quaternion().setFromEuler(lastValidRot.current);

              for (let i = 0; i < 10; i++) {
                const mid = (low + high) / 2;
                const tP = new THREE.Vector3().lerpVectors(lastValidPos.current, pos, mid);
                const tQ = new THREE.Quaternion().slerpQuaternions(lastQuat, quat, mid);
                const tR = new THREE.Euler().setFromQuaternion(tQ);
                if (!checkCollisionAt(tP, tR, scl)) {
                  low = mid;
                } else {
                  high = mid;
                }
              }

              const dist = lastValidPos.current.distanceTo(pos);
              const gapT = 0.004 / (dist || 1);
              const finalT = Math.max(0, low - gapT);
              const finalPos = new THREE.Vector3().lerpVectors(lastValidPos.current, pos, finalT);
              const finalQuat = new THREE.Quaternion().slerpQuaternions(lastQuat, quat, finalT);
              const finalRot = new THREE.Euler().setFromQuaternion(finalQuat);

              bestPos = [finalPos.x, finalPos.y, finalPos.z];
              bestRot = [finalRot.x, finalRot.y, finalRot.z];
            }

            onUpdate(item.id, {
              position: bestPos,
              rotation: bestRot,
              scale: [scl.x, scl.y, scl.z],
            }, false);
          }}
          onDragEnd={() => {
            onUpdate(item.id, {
              position: item.position,
              rotation: item.rotation,
              scale: item.scale,
              textureOffset: item.textureOffset
            }, false);
            setIsDragging(false);
          }}
        />
      )}
    </>
  );
}, (prev, next) => {
  return (
    prev.isSelected === next.isSelected &&
    prev.isPreviewSelected === next.isPreviewSelected &&
    prev.item === next.item &&
    prev.customTextures === next.customTextures &&
    prev.gizmoMode === next.gizmoMode &&
    prev.selectedSubId === next.selectedSubId &&
    prev.isBoxSelecting === next.isBoxSelecting &&
    prev.multiSelect === next.multiSelect &&
    prev.showReflection === next.showReflection
  );
});
