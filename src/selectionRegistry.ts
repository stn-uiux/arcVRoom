import * as THREE from 'three';

// Separate registry for selection detection - always registers meshes regardless of selection state.
// This is a module-level singleton shared between Scene.tsx and Furniture.tsx
// to avoid circular dependencies.
export const selectionMeshesRef: { current: { [id: string]: THREE.Mesh } } = { current: {} };
