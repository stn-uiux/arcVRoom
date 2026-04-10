import React, { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect, Suspense, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useThree, useFrame, ThreeEvent } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  ContactShadows,
  Environment,
  PivotControls,
  Bounds,
  GizmoHelper,
  GizmoViewport,
  useHelper,
  Billboard,
  Html
} from '@react-three/drei';
import { Furniture } from './Furniture';
import { EffectComposer, Bloom, Vignette, SMAA } from '@react-three/postprocessing';
import { FurnitureItem, AppState } from '../types';

import { selectionMeshesRef } from '../selectionRegistry';
import * as THREE from 'three';
import { Sun, Zap, Circle, Lightbulb } from 'lucide-react';

interface SceneProps {
  state: AppState;
  onSelect: (id: string | null, multi?: boolean) => void;
  onBoxSelect: (ids: string[], isFinal?: boolean) => void;
  onSelectSub: (subId: string | null) => void;
  previewSelectedIds: string[];
  selectedSubId: string | null;
  onUpdate: (id: string, updates: Partial<FurnitureItem>, undoable?: boolean, isGroupUpdate?: boolean) => void;
  onUpdateLight: (id: string, updates: Partial<any>, undoable?: boolean) => void;
  onUpdateItems: (updatesMap: { [id: string]: Partial<FurnitureItem> }, undoable?: boolean) => void;
  onUpdateLights: (updatesMap: { [id: string]: Partial<any> }, undoable?: boolean) => void;
  onZoomChange: (percent: number) => void;
  fitSignal: number;
  zoomRef: React.RefObject<HTMLDivElement>;
  panRef: React.RefObject<HTMLDivElement>;
  shiftPressed: boolean;
  ctrlPressed: boolean;
  showGizmos: boolean;
  onUpdateState: (updates: Partial<AppState>) => void;
}

// selectionMeshesRef imported from ../selectionRegistry

function FitHandler({ trigger, objects }: { trigger: number, objects: FurnitureItem[] }) {
  const { camera, controls, scene } = useThree();
  const lastTrigger = useRef<number>(0);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (trigger <= 0 || trigger === lastTrigger.current) return;
    lastTrigger.current = trigger;

    const box = new THREE.Box3();
    let hasObjects = false;
    const targetIds = objects.map(o => o.id);

    scene.traverse(obj => {
      if (obj.userData?.isFurniture) {
        if (targetIds.length === 0 || targetIds.includes(obj.userData.id)) {
          box.expandByObject(obj);
          hasObjects = true;
        }
      }
    });

    if (!hasObjects) {
      box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 5, 5));
    }

    const center = new THREE.Vector3();
    box.getCenter(center);
    const aspect = (camera as THREE.PerspectiveCamera).aspect;

    const size = new THREE.Vector3();
    box.getSize(size);
    const radius = size.length() * 0.5 || 1;

    const vFov = (camera as THREE.PerspectiveCamera).fov * THREE.MathUtils.DEG2RAD;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

    const distHeight = radius / Math.tan(vFov / 2);
    const distWidth = radius / Math.tan(hFov / 2);

    let cameraDistance = Math.max(distHeight, distWidth) * 1.3;
    cameraDistance = THREE.MathUtils.clamp(cameraDistance, 5, 10000);

    const targetPos = new THREE.Vector3(
      center.x - cameraDistance * 0.58,
      center.y + cameraDistance * 0.5,
      center.z + cameraDistance * 0.58
    );

    const startPos = camera.position.clone();
    let startTarget = new THREE.Vector3();
    let endTarget = center.clone();

    if (controls) {
      startTarget = (controls as any).target.clone();
    }

    const duration = 800;
    const startTime = performance.now();

    function easeOutCubic(t: number) {
      return 1 - Math.pow(1 - t, 3);
    }

    if (animRef.current) cancelAnimationFrame(animRef.current);

    if (controls) (controls as any).enabled = false;

    function animateFrame(time: number) {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = easeOutCubic(progress);

      camera.position.lerpVectors(startPos, targetPos, ease);

      if (controls) {
        (controls as any).target.lerpVectors(startTarget, endTarget, ease);
        (controls as any).update();
      } else {
        camera.lookAt(endTarget);
      }

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animateFrame);
      } else {
        if (controls) (controls as any).enabled = true;
      }
    }

    animRef.current = requestAnimationFrame(animateFrame);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (controls) (controls as any).enabled = true;
    };
  }, [trigger, objects, camera, controls]);

  return null;
}

function OverlayControlsLogic({ zoomRef, panRef }: { zoomRef: React.RefObject<HTMLDivElement>, panRef: React.RefObject<HTMLDivElement> }) {
  const { camera, controls } = useThree();

  useEffect(() => {
    const zoomEl = zoomRef.current;
    const panEl = panRef.current;
    if (!zoomEl || !panEl || !controls) return;

    let isZooming = false;
    let isPanning = false;
    let lastY = 0;
    let lastX = 0;

    const onZoomDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      zoomEl.setPointerCapture(e.pointerId);
      isZooming = true;
      lastY = e.clientY;
    };

    const onPanDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      panEl.setPointerCapture(e.pointerId);
      isPanning = true;
      lastY = e.clientY;
      lastX = e.clientX;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isZooming && !isPanning) return;
      e.preventDefault();

      const dist = camera.position.distanceTo((controls as any).target);

      if (isZooming) {
        const delta = e.clientY - lastY;
        lastY = e.clientY;
        const dir = new THREE.Vector3().subVectors((controls as any).target, camera.position).normalize();
        const distFactor = Math.max(0.2, dist * 0.03);
        const moveAmount = -delta * distFactor * 0.05;

        if (delta < 0 && dist < 0.3) {
        } else {
          camera.position.addScaledVector(dir, moveAmount);
        }
        (controls as any).update();
      }

      if (isPanning) {
        const deltaX = e.clientX - lastX;
        const deltaY = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;

        const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const distFactor = Math.max(0.005, dist * 0.001);

        const panOffset = new THREE.Vector3()
          .addScaledVector(camRight, -deltaX * distFactor)
          .addScaledVector(camUp, deltaY * distFactor);

        camera.position.add(panOffset);
        (controls as any).target.add(panOffset);
        (controls as any).update();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isZooming) {
        isZooming = false;
        zoomEl.releasePointerCapture(e.pointerId);
      }
      if (isPanning) {
        isPanning = false;
        panEl.releasePointerCapture(e.pointerId);
      }
    };

    zoomEl.addEventListener('pointerdown', onZoomDown);
    panEl.addEventListener('pointerdown', onPanDown);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      zoomEl.removeEventListener('pointerdown', onZoomDown);
      panEl.removeEventListener('pointerdown', onPanDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [camera, controls, zoomRef, panRef]);

  return null;
}

interface RealTimeBoxSelectionProps {
  ctrlPressed: boolean;
  selectionBox: { start: [number, number], end: [number, number] } | null;
  onBoxSelect: (ids: string[], isFinal: boolean) => void;
  currentSelectedIds: string[];
  lights: any[];
}

const RealTimeBoxSelection: React.FC<RealTimeBoxSelectionProps> = ({
  ctrlPressed, selectionBox, onBoxSelect, currentSelectedIds, lights
}) => {
  const { camera, gl } = useThree();
  const meshes = selectionMeshesRef.current;

  useEffect(() => {
    if (!selectionBox) return;

    const start = new THREE.Vector2(
      (selectionBox.start[0] / gl.domElement.clientWidth) * 2 - 1,
      -(selectionBox.start[1] / gl.domElement.clientHeight) * 2 + 1
    );
    const end = new THREE.Vector2(
      (selectionBox.end[0] / gl.domElement.clientWidth) * 2 - 1,
      -(selectionBox.end[1] / gl.domElement.clientHeight) * 2 + 1
    );

    const min = new THREE.Vector2(Math.min(start.x, end.x), Math.min(start.y, end.y));
    const max = new THREE.Vector2(Math.max(start.x, end.x), Math.max(start.y, end.y));

    const selectedIdx: string[] = [];
    Object.entries(meshes).forEach(([id, mesh]) => {
      if (!mesh || mesh.userData?.locked) return; // Skip locked objects (Walls, etc.)
      
      mesh.updateWorldMatrix(true, false);
      let box3 = new THREE.Box3();
      if (mesh.geometry) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        box3.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      } else {
        box3.setFromCenterAndSize(new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld), new THREE.Vector3(1, 1, 1));
      }

      // Check if Object Center is within the screen box
      const center = new THREE.Vector3();
      box3.getCenter(center);
      center.project(camera);
      
      const isCenterInBox = center.x >= min.x && center.x <= max.x && center.y >= min.y && center.y <= max.y;

      // Check for AABB intersection but only for reasonably sized selection boxes
      const corners = [
        new THREE.Vector3(box3.min.x, box3.min.y, box3.min.z),
        new THREE.Vector3(box3.min.x, box3.min.y, box3.max.z),
        new THREE.Vector3(box3.min.x, box3.max.y, box3.min.z),
        new THREE.Vector3(box3.min.x, box3.max.y, box3.max.z),
        new THREE.Vector3(box3.max.x, box3.min.y, box3.min.z),
        new THREE.Vector3(box3.max.x, box3.min.y, box3.max.z),
        new THREE.Vector3(box3.max.x, box3.max.y, box3.min.z),
        new THREE.Vector3(box3.max.x, box3.max.y, box3.max.z),
      ];

      let objMinX = Infinity, objMaxX = -Infinity, objMinY = Infinity, objMaxY = -Infinity;
      corners.forEach(c => {
        c.project(camera);
        objMinX = Math.min(objMinX, c.x);
        objMaxX = Math.max(objMaxX, c.x);
        objMinY = Math.min(objMinY, c.y);
        objMaxY = Math.max(objMaxY, c.y);
      });

      const doesIntersect = !(objMaxX < min.x || objMinX > max.x || objMaxY < min.y || objMinY > max.y);

      // Final decision:
      // If it's a huge object (size on screen covers major area), only select if center is inside.
      // Small objects can be captured by touching any part.
      const objWidth = objMaxX - objMinX;
      const objHeight = objMaxY - objMinY;
      const isHuge = objWidth > 1.0 || objHeight > 1.0; 

      if (isHuge ? isCenterInBox : doesIntersect) {
        selectedIdx.push(id);
      }
    });

    // Also check lights (skip locked ones if they ever exist)
    lights.forEach(light => {
      if (light.type === 'ambient' || light.locked) return;
      const v = new THREE.Vector3(...(light.position || [0, 0, 0]));
      v.project(camera);
      if (v.x >= min.x && v.x <= max.x && v.y >= min.y && v.y <= max.y) {
        selectedIdx.push(light.id);
      }
    });

    if (ctrlPressed) {
      // XOR Logic (Toggle): 
      // 1. Items in initial AND box => Remove
      // 2. Items in box ONLY => Add
      // 3. Items in initial ONLY => Keep
      const initialIds = new Set(currentSelectedIds);
      const boxIds = new Set(selectedIdx);

      const nextIds = new Set(initialIds);
      boxIds.forEach(id => {
        if (nextIds.has(id)) nextIds.delete(id);
        else nextIds.add(id);
      });

      onBoxSelect(Array.from(nextIds), false);
    } else {
      // Normal Box Selection (Reset to what's in the box)
      onBoxSelect(selectedIdx, false);
    }
  }, [selectionBox, meshes, camera, gl, ctrlPressed, lights]);

  return null;
};

function PointLightDistanceGizmo({
  distance,
  updateLight,
  setIsDragging,
  isSelected,
  color
}: {
  distance: number;
  updateLight: (updates: Partial<any>, undoable?: boolean) => void;
  setIsDragging: (dragging: boolean) => void;
  isSelected: boolean;
  color: string;
}) {
  const { camera, raycaster, gl } = useThree();
  const groupRef = useRef<THREE.Group>(null!);
  const activeHandle = useRef<boolean>(false);
  const dragPlane = useRef<THREE.Plane>(new THREE.Plane());
  const initialOffset = useRef<number>(0);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!activeHandle.current || !groupRef.current) return;

      const rect = gl.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const inverseMatrix = groupRef.current.matrixWorld.clone().invert();
      const localRay = raycaster.ray.clone().applyMatrix4(inverseMatrix);

      const intersectPoint = new THREE.Vector3();
      if (localRay.intersectPlane(dragPlane.current, intersectPoint)) {
        const newDist = Math.max(0.1, intersectPoint.length() - initialOffset.current);
        updateLight({ distance: newDist });
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!activeHandle.current) return;
      activeHandle.current = false;
      setIsDragging(false);
      try {
        gl.domElement.releasePointerCapture(e.pointerId);
      } catch (e) { }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!isSelected) return;
    e.stopPropagation();
    gl.domElement.setPointerCapture(e.pointerId);

    const rect = gl.domElement.getBoundingClientRect();
    const x = ((e.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const inverseMatrix = groupRef.current.matrixWorld.clone().invert();
    const localRay = raycaster.ray.clone().applyMatrix4(inverseMatrix);
    const localCamPos = camera.position.clone().applyMatrix4(inverseMatrix);

    dragPlane.current.setFromNormalAndCoplanarPoint(
      localCamPos.clone().normalize(),
      new THREE.Vector3(0, 0, 0)
    );

    const intersect = new THREE.Vector3();
    if (localRay.intersectPlane(dragPlane.current, intersect)) {
      initialOffset.current = intersect.length() - distance;
    } else {
      initialOffset.current = 0;
    }

    activeHandle.current = true;
    updateLight({}, true); // Save history
    setIsDragging(true);
  };

  const safeDistance = Math.max(0.001, distance);
  const handleSize = Math.max(0.06, safeDistance * 0.04);

  const torusArgs = useMemo(() => [safeDistance, 0.005, 8, 48] as [number, number, number, number], [safeDistance]);
  const handlePositions = useMemo((): [number, number, number][] => [
    [safeDistance, 0, 0], [-safeDistance, 0, 0],
    [0, safeDistance, 0], [0, -safeDistance, 0],
    [0, 0, safeDistance], [0, 0, -safeDistance]
  ], [safeDistance]);

  return (
    <group ref={groupRef}>
      <group>
        <mesh><torusGeometry args={torusArgs} /><meshBasicMaterial color={color} transparent opacity={isSelected ? 0.3 : 0.1} depthTest={false} /></mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={torusArgs} /><meshBasicMaterial color={color} transparent opacity={isSelected ? 0.3 : 0.1} depthTest={false} /></mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}><torusGeometry args={torusArgs} /><meshBasicMaterial color={color} transparent opacity={isSelected ? 0.3 : 0.1} depthTest={false} /></mesh>
      </group>
      {isSelected && handlePositions.map((pos, i) => (
        <mesh key={i} position={pos} onPointerDown={onPointerDown} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'move'; }} onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}>
          <sphereGeometry args={[handleSize, 16, 16]} />
          <meshBasicMaterial color={activeHandle.current ? "#10b981" : "#fbbf24"} depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}

function SpotLightGizmo({
  distance,
  angle,
  updateLight,
  setIsDragging,
  isSelected,
  color
}: {
  distance: number;
  angle: number;
  updateLight: (updates: Partial<any>, undoable?: boolean) => void;
  setIsDragging: (dragging: boolean) => void;
  isSelected: boolean;
  color: string;
}) {
  const { camera, raycaster, gl } = useThree();
  const groupRef = useRef<THREE.Group>(null!);
  const [handleType, setHandleType] = useState<'distance' | 'angle' | null>(null);
  const activeHandle = useRef<'distance' | 'angle' | null>(null);
  const dragPlane = useRef<THREE.Plane>(new THREE.Plane());
  const initialOffset = useRef<number>(0);

  const visualDist = (distance > 0 && !isNaN(distance)) ? distance : 10;
  const safeAngle = (angle > 0 && !isNaN(angle)) ? Math.min(angle, 1.5) : Math.PI / 3;
  const radius = visualDist * Math.tan(safeAngle);

  const lineGeometries = useMemo(() => {
    return [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].map(rot => {
      const x = Math.cos(rot) * radius;
      const y = Math.sin(rot) * radius;
      return new Float32Array([0, 0, 0, x, y, -visualDist]);
    });
  }, [radius, visualDist]);

  const ringArgs = useMemo(() =>
    [Math.max(0.001, radius - 0.01), Math.max(0.002, radius + 0.01), 64] as [number, number, number],
    [radius]);

  const coneArgs = useMemo(() =>
    [visualDist * 0.035, visualDist * 0.08, 16] as [number, number, number],
    [visualDist]);

  const torusArgs = useMemo(() =>
    [Math.max(0.01, radius), visualDist * 0.02, 12, 64] as [number, number, number, number],
    [radius, visualDist]);

  const getLocalRay = (e: THREE.Vector2) => {
    if (!groupRef.current) return null;
    raycaster.setFromCamera(e, camera);
    const inverseMatrix = groupRef.current.matrixWorld.clone().invert();
    const rayOrigin = raycaster.ray.origin.clone().applyMatrix4(inverseMatrix);
    const rayDirection = raycaster.ray.direction.clone().transformDirection(inverseMatrix).normalize();
    return new THREE.Ray(rayOrigin, rayDirection);
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!activeHandle.current || !groupRef.current) return;

      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const localRay = getLocalRay(mouse);
      if (!localRay) return;

      const intersect = new THREE.Vector3();
      if (localRay.intersectPlane(dragPlane.current, intersect)) {
        if (activeHandle.current === 'distance') {
          const newVZ = intersect.z - initialOffset.current;
          updateLight({ distance: Math.max(0.1, -newVZ) });
        } else if (activeHandle.current === 'angle') {
          const newR = Math.sqrt(intersect.x * intersect.x + intersect.y * intersect.y) - initialOffset.current;
          const newAngle = Math.atan2(newR, visualDist);
          updateLight({ angle: Math.max(0.01, Math.min(newAngle, 1.5)) });
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!activeHandle.current) return;
      activeHandle.current = null;
      setHandleType(null);
      setIsDragging(false);
      try {
        gl.domElement.releasePointerCapture(e.pointerId);
      } catch (err) { }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [handleType, gl, visualDist, radius]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>, handle: 'distance' | 'angle') => {
    if (!isSelected) return;
    e.stopPropagation();
    gl.domElement.setPointerCapture(e.pointerId);

    const rect = gl.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1
    );

    const localRay = getLocalRay(mouse);
    if (!localRay) return;

    const inverseMatrix = groupRef.current.matrixWorld.clone().invert();
    const localCamPos = camera.position.clone().applyMatrix4(inverseMatrix);

    if (handle === 'distance') {
      const normal = Math.abs(localCamPos.x) > Math.abs(localCamPos.y) ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      dragPlane.current.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, 0, -visualDist));

      const intersect = new THREE.Vector3();
      if (localRay.intersectPlane(dragPlane.current, intersect)) {
        initialOffset.current = intersect.z - (-visualDist);
      } else {
        initialOffset.current = 0;
      }
    } else {
      dragPlane.current.set(new THREE.Vector3(0, 0, 1), visualDist);
      const intersect = new THREE.Vector3();
      if (localRay.intersectPlane(dragPlane.current, intersect)) {
        const r = Math.sqrt(intersect.x * intersect.x + intersect.y * intersect.y);
        initialOffset.current = r - radius;
      } else {
        initialOffset.current = 0;
      }
    }

    activeHandle.current = handle;
    updateLight({}, true); // Save history
    setHandleType(handle);
    setIsDragging(true);
  };

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, -visualDist / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.001, Math.max(0.001, radius), Math.max(0.001, visualDist), 48, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={isSelected ? 0.2 : 0.05} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {lineGeometries.map((pts, i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={2} array={pts} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color={color} transparent opacity={isSelected ? 0.5 : 0.2} />
        </line>
      ))}

      <mesh position={[0, 0, -visualDist]}>
        <ringGeometry args={ringArgs} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={isSelected ? 0.5 : 0.2} />
      </mesh>

      {isSelected && (
        <>
          {/* Distance Tip Handle */}
          <mesh
            position={[0, 0, -visualDist]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerDown={(e) => onPointerDown(e, 'distance')}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'move'; }}
            onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
          >
            <coneGeometry args={coneArgs} />
            <meshBasicMaterial color={handleType === 'distance' ? "#10b981" : "#fbbf24"} depthTest={false} transparent opacity={0.9} />
          </mesh>

          {/* Angle Rim Handle */}
          <mesh
            position={[0, 0, -visualDist]}
            onPointerDown={(e) => onPointerDown(e, 'angle')}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'ew-resize'; }}
            onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
          >
            <torusGeometry args={torusArgs} />
            <meshBasicMaterial color={handleType === 'angle' ? "#10b981" : "#fbbf24"} transparent opacity={handleType === 'angle' ? 1 : 0.5} depthTest={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

function LightWithHelper({
  config,
  showGizmos,
  isSelected,
  onUpdateLight,
  onSelectLight,
  setIsDragging,
  multiSelect,
  realtimeShadows
}: {
  config: any;
  isSelected: boolean;
  onUpdateLight: (id: string, updates: Partial<any>, undoable?: boolean) => void;
  onSelectLight: (id: string, multi?: boolean) => void;
  setIsDragging: (dragging: boolean) => void;
  multiSelect: boolean;
  realtimeShadows: boolean;
}) {
  const lightRef = useRef<any>(null!);
  const { scene } = useThree();

  const spotHelper = useHelper(isSelected && config.type === 'spot' ? lightRef : null, THREE.SpotLightHelper, config.color);
  const dirHelper = useHelper(isSelected && config.type === 'directional' ? lightRef : null, THREE.DirectionalLightHelper, 1, config.color);

  useLayoutEffect(() => {
    if (lightRef.current && (config.type === 'spot' || config.type === 'directional')) {
      const light = lightRef.current;
      if (!light.target) light.target = new THREE.Object3D();
      if (light.target.parent !== scene) scene.add(light.target);

      const rot = new THREE.Euler(...(config.rotation || [0, 0, 0]));
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(rot);
      light.target.position.copy(new THREE.Vector3(...(config.position || [0, 0, 0])).add(dir));
      light.target.updateMatrixWorld();

      return () => { if (light.target?.parent === scene) scene.remove(light.target); };
    }
  }, [config.type, scene, config.position, config.rotation]);

  useFrame(() => {
    if (lightRef.current && (config.type === 'spot' || config.type === 'directional')) {
      const light = lightRef.current;
      if (light.target) {
        const lp = new THREE.Vector3(), lq = new THREE.Quaternion();
        light.updateMatrixWorld(true);
        light.getWorldPosition(lp);
        light.getWorldQuaternion(lq);
        light.target.position.copy(lp.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(lq)));
        light.target.updateMatrixWorld();
      }
    }
  });

  const matrix = useMemo(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(config.rotation || [0, 0, 0])));
    m.compose(new THREE.Vector3(...(config.position || [0, 0, 0])), q, new THREE.Vector3(1, 1, 1));
    return m;
  }, [config.position, config.rotation]);

  const isIndividualGizmoActive = isSelected && !multiSelect && showGizmos && config.type !== 'ambient';

  const lightContent = (
    <group rotation={isIndividualGizmoActive ? [0, 0, 0] : (config.rotation || [0, 0, 0])}>
      {config.enabled && (
        <>
          {config.type === 'ambient' && <ambientLight intensity={config.intensity} color={config.color} />}
          {config.type === 'point' && <pointLight ref={lightRef} intensity={config.intensity * 50} color={config.color} distance={config.distance || 0} decay={config.decay || 2} castShadow={config.castShadow !== false && realtimeShadows} shadow-bias={-0.001} shadow-mapSize={[1024, 1024]} shadow-radius={config.shadowRadius ?? 2} position={[0, 0, 0]} />}
          {config.type === 'spot' && <spotLight ref={lightRef} intensity={config.intensity * 100} color={config.color} distance={config.distance || 0} angle={config.angle || Math.PI / 3} penumbra={config.penumbra || 0.1} decay={config.decay || 2} castShadow={config.castShadow !== false && realtimeShadows} shadow-bias={-0.0001} shadow-mapSize={[1024, 1024]} shadow-radius={config.shadowRadius ?? 2} shadow-camera-near={0.1} shadow-camera-far={200} position={[0, 0, 0]} />}
          {config.type === 'directional' && (
            <directionalLight
              ref={lightRef}
              intensity={config.intensity * 5}
              color={config.color}
              castShadow={config.castShadow !== false && realtimeShadows}
              shadow-bias={-0.0001}
              shadow-mapSize={[2048, 2048]}
              shadow-radius={config.shadowRadius ?? 2}
              shadow-camera-left={-50}
              shadow-camera-right={50}
              shadow-camera-top={50}
              shadow-camera-bottom={-50}
              shadow-camera-near={0.1}
              shadow-camera-far={200}
              position={[0, 0, 0]}
            />
          )}
        </>
      )}

      {showGizmos && config.type !== 'ambient' && (
        <group onClick={(e) => { e.stopPropagation(); onSelectLight(config.id, e.ctrlKey || e.metaKey); }}>
          <mesh visible={false}>
            <sphereGeometry args={[0.3, 16, 16]} />
          </mesh>
          <Billboard>
            <Html center zIndexRange={[10, 0]}>
              <div
                onClick={(e) => { e.stopPropagation(); onSelectLight(config.id, e.ctrlKey || e.metaKey); }}
                className={`flex items-center justify-center p-1.5 rounded-full transition-all cursor-pointer shadow-lg border ${isSelected ? 'bg-emerald-500 border-white text-white scale-125' : 'bg-black/60 border-white/20 text-white/80'}`}
                style={{ backdropFilter: 'blur(4px)' }}
              >
                {config.type === 'point' && <Lightbulb className="w-3 h-3" />}
                {config.type === 'spot' && <Zap className="w-3 h-3" />}
                {config.type === 'directional' && <Sun className="w-3 h-3" />}
              </div>
            </Html>
          </Billboard>
          {config.type === 'point' && <PointLightDistanceGizmo distance={config.distance || 0} updateLight={(u) => onUpdateLight(config.id, u)} setIsDragging={setIsDragging} isSelected={isSelected} color={config.color} />}
          {config.type === 'spot' && <SpotLightGizmo distance={config.distance || 0} angle={config.angle || Math.PI / 3} updateLight={(u) => onUpdateLight(config.id, u)} setIsDragging={setIsDragging} isSelected={isSelected} color={config.color} />}
        </group>
      )}
    </group>
  );

  if (config.type === 'ambient' || !showGizmos || !isSelected || multiSelect) {
    return <group position={config.position}>{lightContent}</group>;
  }

  return (
    <PivotControls
      depthTest={false}
      matrix={matrix}
      autoTransform={false}
      fixed={true}
      scale={75}
      lineWidth={2}
      onDragStart={() => {
        onUpdateLight(config.id, {}, true); // Save history
        setIsDragging(true);
      }}
      onDrag={(m) => {
        const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
        m.decompose(p, q, s);
        const r = new THREE.Euler().setFromQuaternion(q);
        onUpdateLight(config.id, { position: [p.x, p.y, p.z], rotation: [r.x, r.y, r.z] }, false);
      }}
      onDragEnd={() => setIsDragging(false)}
    >
      {lightContent}
    </PivotControls>
  );
}

export const Scene = forwardRef<any, SceneProps>(({
  state, onSelect, onBoxSelect, onSelectSub, previewSelectedIds, selectedSubId,
  onUpdate, onUpdateLight, onUpdateItems, onUpdateLights, onZoomChange, fitSignal, zoomRef, panRef, shiftPressed, ctrlPressed, showGizmos, onUpdateState
}, ref) => {
  // Silence specific deprecation warnings from libraries
  useEffect(() => {
    const originalWarn = console.warn;
    console.warn = (...args) => {
      if (typeof args[0] === 'string' && (
        args[0].includes('THREE.Clock') ||
        args[0].includes('PCFSoftShadowMap') ||
        args[0].includes('THREE.Timer')
      )) return;
      originalWarn(...args);
    };
    return () => { console.warn = originalWarn; };
  }, []);

  const [isDragging, setIsDragging] = useState(false);
  const [meshes, setMeshes] = useState<{ [id: string]: THREE.Mesh }>({});
  const [selectionBox, setSelectionBox] = useState<{ start: [number, number], end: [number, number] } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<any>(null);
  const isBoxSelecting = useRef(false);
  const lastPercent = useRef<number>(100);

  const viewRef = useRef<{ camera: THREE.Camera, gl: THREE.WebGLRenderer } | null>(null);

  const registerMesh = useCallback((id: string, mesh: THREE.Mesh | null) => {
    setMeshes(prev => {
      if (mesh) return { ...prev, [id]: mesh };
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const otherMeshes = useMemo(() => Object.values(meshes), [meshes]);
  const selectedItems = useMemo(() => state.items.filter(i => state.selectedIds.includes(i.id)), [state.items, state.selectedIds]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 0 && ctrlPressed) {
      isBoxSelecting.current = true;
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setSelectionBox({
          start: [e.clientX - rect.left, e.clientY - rect.top],
          end: [e.clientX - rect.left, e.clientY - rect.top]
        });
      }
    }
  };

  const ZoomTracker = () => {
    const { scene, camera, gl } = useThree();
    
    useEffect(() => {
      viewRef.current = { camera, gl };
    }, [camera, gl]);

    useImperativeHandle(ref, () => ({
      scene,
      camera,
      gl
    }), [scene, camera, gl]);

    useFrame((state) => {
      if (controlsRef.current) {
        const dist = state.camera.position.distanceTo(controlsRef.current.target);
        const p = Math.round((26 / dist) * 100);
        if (p !== lastPercent.current) {
          onZoomChange(p);
          lastPercent.current = p;
        }
      }
    });
    return null;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isBoxSelecting.current && selectionBox) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setSelectionBox(prev => prev ? {
          ...prev,
          end: [e.clientX - rect.left, e.clientY - rect.top]
        } : null);
      }
    }
  };

  const handlePointerUp = () => {
    if (isBoxSelecting.current && selectionBox) {
      const dx = selectionBox.end[0] - selectionBox.start[0];
      const dy = selectionBox.end[1] - selectionBox.start[1];
      if (Math.sqrt(dx * dx + dy * dy) > 5 && viewRef.current) {
        const { camera, gl } = viewRef.current;
        const start = new THREE.Vector2(
          (selectionBox.start[0] / gl.domElement.clientWidth) * 2 - 1,
          -(selectionBox.start[1] / gl.domElement.clientHeight) * 2 + 1
        );
        const end = new THREE.Vector2(
          (selectionBox.end[0] / gl.domElement.clientWidth) * 2 - 1,
          -(selectionBox.end[1] / gl.domElement.clientHeight) * 2 + 1
        );

        const min = new THREE.Vector2(Math.min(start.x, end.x), Math.min(start.y, end.y));
        const max = new THREE.Vector2(Math.max(start.x, end.x), Math.max(start.y, end.y));

        const selectedIdx: string[] = [];
        const selMeshes = selectionMeshesRef.current;
        Object.entries(selMeshes).forEach(([id, mesh]) => {
          if (!mesh || mesh.userData?.locked) return;
          mesh.updateWorldMatrix(true, false);
          let box3 = new THREE.Box3();
          if (mesh.geometry) {
            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            box3.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
          } else {
            box3.setFromCenterAndSize(new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld), new THREE.Vector3(1, 1, 1));
          }

          const center = new THREE.Vector3();
          box3.getCenter(center);
          center.project(camera);
          const isCenterInBox = center.x >= min.x && center.x <= max.x && center.y >= min.y && center.y <= max.y;

          const corners = [
            new THREE.Vector3(box3.min.x, box3.min.y, box3.min.z),
            new THREE.Vector3(box3.min.x, box3.min.y, box3.max.z),
            new THREE.Vector3(box3.min.x, box3.max.y, box3.min.z),
            new THREE.Vector3(box3.min.x, box3.max.y, box3.max.z),
            new THREE.Vector3(box3.max.x, box3.min.y, box3.min.z),
            new THREE.Vector3(box3.max.x, box3.min.y, box3.max.z),
            new THREE.Vector3(box3.max.x, box3.max.y, box3.min.z),
            new THREE.Vector3(box3.max.x, box3.max.y, box3.max.z),
          ];

          let objMinX = Infinity, objMaxX = -Infinity, objMinY = Infinity, objMaxY = -Infinity;
          corners.forEach(c => {
            c.project(camera);
            objMinX = Math.min(objMinX, c.x);
            objMaxX = Math.max(objMaxX, c.x);
            objMinY = Math.min(objMinY, c.y);
            objMaxY = Math.max(objMaxY, c.y);
          });

          const doesIntersect = !(objMaxX < min.x || objMinX > max.x || objMaxY < min.y || objMinY > max.y);
          const objWidth = objMaxX - objMinX;
          const objHeight = objMaxY - objMinY;
          const isHuge = objWidth > 1.0 || objHeight > 1.0; 

          if (isHuge ? isCenterInBox : doesIntersect) {
            selectedIdx.push(id);
          }
        });

        state.lights.forEach(light => {
          if (light.type === 'ambient') return;
          const v = new THREE.Vector3(...(light.position || [0, 0, 0]));
          v.project(camera);
          if (v.x >= min.x && v.x <= max.x && v.y >= min.y && v.y <= max.y) {
            selectedIdx.push(light.id);
          }
        });

        if (ctrlPressed) {
          const initialIds = new Set(state.selectedIds);
          const boxIds = new Set(selectedIdx);
          const nextIds = new Set(initialIds);
          boxIds.forEach(id => {
            if (nextIds.has(id)) nextIds.delete(id);
            else nextIds.add(id);
          });
          onBoxSelect(Array.from(nextIds), true);
        } else {
          onBoxSelect(selectedIdx, true);
        }
      }
    }
    setSelectionBox(null);
    isBoxSelecting.current = false;
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#0f0f0f] relative overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ position: [15, 15, 15], fov: 40, near: 0.1, far: 20000 }}
        gl={{ logarithmicDepthBuffer: true, antialias: true }}
        raycaster={{
          filter: (intersects) => {
            const gizmos = [];
            const others = [];
            for (const hit of intersects) {
              let cur = hit.object;
              let isGizmo = false;
              while (cur) {
                if ((cur as any).userData?.pivot || (cur as any).userData?.hover || (cur.name && cur.name.toLowerCase().includes('pivot'))) {
                  isGizmo = true;
                  break;
                }
                cur = cur.parent!;
              }
              if (isGizmo) gizmos.push(hit);
              else others.push(hit);
            }
            return [...gizmos, ...others];
          }
        }}
        gl={{
          antialias: true,
          stencil: true,
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0
        }}
        onPointerMissed={(e) => {
          if (e.button === 0 && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
            onSelect(null);
          }
        }}
      >
        <color attach="background" args={['#0f0f0f']} />
        {state.lights.map(light => (
          <LightWithHelper
            key={light.id}
            config={light}
            showGizmos={showGizmos}
            isSelected={state.selectedIds.includes(light.id)}
            onSelectLight={onSelect}
            onUpdateLight={onUpdateLight}
            setIsDragging={setIsDragging}
            multiSelect={state.selectedIds.length > 1}
            realtimeShadows={state.realtimeShadows}
          />
        ))}
        <Suspense fallback={null}>
          <Environment
            preset={state.environment as any}
            background={!state.showBackgroundColor}
            far={1000}
            resolution={256}
            environmentIntensity={state.showEnvironment ? state.intensity : 0}
            blur={state.environmentBlur ?? 0.8}
          />
        </Suspense>

        {state.showBackgroundColor && (
          <color attach="background" args={[state.backgroundColor || '#ffffff']} />
        )}

        {state.showGrid !== false && (
          <Grid
            position={[0, -0.03, 0]}
            infiniteGrid
            fadeDistance={50}
            fadeStrength={5}
            cellSize={0.5}
            sectionSize={2.5}
            sectionThickness={1}
            sectionColor={state.gridColor || "#ffffff"}
            cellColor={state.gridColor || "#ffffff"}
          />
        )}

        <RealTimeBoxSelection
          ctrlPressed={ctrlPressed}
          selectionBox={selectionBox}
          onBoxSelect={onBoxSelect}
          currentSelectedIds={state.selectedIds}
          lights={state.lights}
        />

        <FitHandler trigger={fitSignal} objects={selectedItems} />
        <OverlayControlsLogic zoomRef={zoomRef} panRef={panRef} />
        <ZoomTracker />
        <GroupGizmo
          state={state}
          onUpdateItems={onUpdateItems}
          onUpdateLights={onUpdateLights}
          setIsDragging={setIsDragging}
        />

        <Bounds margin={1.2}>
          <group>
            {state.items.map(item => (
              <Suspense key={item.id} fallback={null}>
                <Furniture
                  item={item}
                  isSelected={state.selectedIds.includes(item.id)}
                  isPreviewSelected={previewSelectedIds.includes(item.id)}
                  selectedSubId={selectedSubId}
                  onSelect={onSelect}
                  onSelectSub={onSelectSub}
                  onUpdate={onUpdate}
                  onUpdateItems={onUpdateItems}
                  onUpdateLight={onUpdateLight}
                  setIsDragging={setIsDragging}
                  shiftPressed={shiftPressed}
                  ctrlPressed={ctrlPressed}
                  registerMesh={registerMesh}
                  otherMeshes={otherMeshes}
                  showGizmos={true}
                  customTextures={state.customTextures || []}
                  multiSelect={state.selectedIds.length > 1}
                  isLastSelected={state.selectedIds[state.selectedIds.length - 1] === item.id}
                  isBoxSelecting={!!selectionBox}
                  gizmoMode={state.gizmoMode || 'translate'}
                  realtimeShadows={state.realtimeShadows}
                />
              </Suspense>
            ))}
          </group>
        </Bounds>

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enabled={!isDragging && !isBoxSelecting.current}
          minDistance={0.5}
          maxDistance={5000}
        />

        {state.contactShadows === true && (
          <ContactShadows
            resolution={1024}
            scale={20}
            blur={2}
            opacity={0.25}
            far={10}
            color="#000000"
          />
        )}

        {state.realtimeShadows === true && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]} receiveShadow renderOrder={-1}>
            <planeGeometry args={[1000, 1000]} />
            <shadowMaterial transparent opacity={0.4} polygonOffset={true} polygonOffsetFactor={1} polygonOffsetUnits={1} depthWrite={false} />
          </mesh>
        )}

        <GizmoHelper alignment="top-right" margin={[60, 60]} renderPriority={2}>

          <GizmoViewport axisColors={['#FF4458', '#38CC15', '#3D8BFB']} labelColor="black" />

        </GizmoHelper>

        <EffectComposer disableNormalPass>
          <Bloom
            luminanceThreshold={1}
            intensity={state.bloomIntensity ?? 0.05}
            radius={0.4}
          />
          <Vignette
            offset={1 - (state.vignetteSize ?? 0.3)}
            darkness={state.vignetteDarkness ?? 0.5}
          />
        </EffectComposer>
      </Canvas>

      {/* Selection Box Visual */}
      {selectionBox && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(selectionBox.start[0], selectionBox.end[0]),
            top: Math.min(selectionBox.start[1], selectionBox.end[1]),
            width: Math.abs(selectionBox.end[0] - selectionBox.start[0]),
            height: Math.abs(selectionBox.end[1] - selectionBox.start[1]),
            border: '1px solid #10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            pointerEvents: 'none',
            zIndex: 100,
            borderRadius: '2px'
          }}
        />
      )}
    </div>
  );
});

// Extracted outside to prevent re-mounting during Scene state updates
const GroupGizmo = ({
  state, onUpdateItems, onUpdateLights, setIsDragging
}: {
  state: AppState,
  onUpdateItems: (map: any, undo?: boolean) => void,
  onUpdateLights: (map: any, undo?: boolean) => void,
  setIsDragging: (val: boolean) => void
}) => {
  const selectedItemsList = state.items.filter(i => state.selectedIds.includes(i.id));
  const selectedLightsList = state.lights.filter(l => state.selectedIds.includes(l.id) && l.type !== 'ambient');
  const allSelected = useMemo(() => [
    ...selectedItemsList.map(i => ({ ...i, isLight: false })),
    ...selectedLightsList.map(l => ({ ...l, isLight: true }))
  ], [state.items, state.lights, state.selectedIds]);

  const initialStates = useRef<{ [id: string]: { pos: THREE.Vector3, quat: THREE.Quaternion, matrix: THREE.Matrix4, isLight: boolean } }>({});
  const initialCenter = useRef<THREE.Vector3>(new THREE.Vector3());
  const initialCenterInv = useRef<THREE.Matrix4>(new THREE.Matrix4());
  const [draggingMatrix, setDraggingMatrix] = useState<THREE.Matrix4 | null>(null);

  const centerPoint = useMemo(() => {
    if (allSelected.length === 0) return new THREE.Vector3();
    const sum = new THREE.Vector3();
    allSelected.forEach(obj => sum.add(new THREE.Vector3(...obj.position)));
    return sum.divideScalar(allSelected.length);
  }, [state.selectedIds, state.items, state.lights]); // Recompute center when selection or positions change

  const groupMatrix = useMemo(() => {
    const m = new THREE.Matrix4();
    m.setPosition(centerPoint);
    return m;
  }, [centerPoint]);

  if (state.selectedIds.length < 2) return null;

  return (
    <PivotControls
      depthTest={false}
      matrix={draggingMatrix || groupMatrix}
      autoTransform={false}
      fixed={true}
      scale={75}
      lineWidth={2}
      onDragStart={() => {
        setIsDragging(true);
        setDraggingMatrix(null);
        initialStates.current = {};
        const sum = new THREE.Vector3();

        allSelected.forEach(obj => {
          const pos = new THREE.Vector3(...obj.position);
          const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(obj.rotation || [0, 0, 0])));
          const mat = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1));
          initialStates.current[obj.id] = { pos, quat, matrix: mat, isLight: !!obj.isLight };
          sum.add(pos);
        });

        initialCenter.current = sum.divideScalar(allSelected.length);
        initialCenterInv.current = new THREE.Matrix4().setPosition(initialCenter.current).invert();

        onUpdateItems({}, true);
      }}
      onDrag={(m) => {
        setDraggingMatrix(m.clone());
        const deltaMatrix = m.clone().multiply(initialCenterInv.current);
        const itemUpdates: { [id: string]: Partial<FurnitureItem> } = {};
        const lightUpdates: { [id: string]: Partial<any> } = {};

        Object.entries(initialStates.current).forEach(([id, initial]) => {
          const newMatrix = deltaMatrix.clone().multiply(initial.matrix);
          const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
          newMatrix.decompose(p, q, s);
          const r = new THREE.Euler().setFromQuaternion(q);

          if (initial.isLight) {
            lightUpdates[id] = { position: [p.x, p.y, p.z], rotation: [r.x, r.y, r.z] };
          } else {
            itemUpdates[id] = { position: [p.x, p.y, p.z], rotation: [r.x, r.y, r.z] };
          }
        });

        if (Object.keys(itemUpdates).length > 0) onUpdateItems(itemUpdates, false);
        if (Object.keys(lightUpdates).length > 0) onUpdateLights(lightUpdates, false);
      }}
      onDragEnd={() => {
        setDraggingMatrix(null);
        setIsDragging(false);
      }}
    />
  );
};
