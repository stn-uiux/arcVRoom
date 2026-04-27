import { useState, useCallback, useRef } from 'react';
import { WebIO, Document, Transform } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import {
  weld,
  dedup,
  resample,
  prune,
  simplify,
  instance,
  flatten,
  join,
  draco
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3d';

export interface FileState {
  id: string;
  name: string;
  originalBuffer: Uint8Array;
  originalSize: number;
  compressedBuffer: Uint8Array | null;
  compressedSize: number | null;
  progress: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface CompressionOptions {
  textureFormat: string;
  textureSize: string;
  removeDuplicates: boolean;
  removeUnused: boolean;
  dracoEnabled: boolean;
  simplifyEnabled: boolean;
  simplifyRatio: number;
  instanceEnabled: boolean;
  flattenEnabled: boolean;
  joinEnabled: boolean;
  weldEnabled: boolean;
}

export const useGLBCompression = () => {
  const [files, setFiles] = useState<FileState[]>([]);
  const processingRef = useRef<Set<string>>(new Set());

  const customTextureCompress = (options: { targetFormat: string, resize: number }): Transform => {
    return async (gltfDoc: Document) => {
      const textures = gltfDoc.getRoot().listTextures();
      for (const texture of textures) {
        const mimeType = texture.getMimeType();
        const image = texture.getImage();
        if (!image) continue;

        const blob = new Blob([image], { type: mimeType });
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const MAX_SIZE = options.resize;
        let width = img.width;
        let height = img.height;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round(height * (MAX_SIZE / width));
            width = MAX_SIZE;
          } else {
            width = Math.round(width * (MAX_SIZE / height));
            height = MAX_SIZE;
          }
        }

        const canvas = window.document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
        }

        const targetMime = options.targetFormat === 'webp' ? 'image/webp' :
          options.targetFormat === 'jpeg' ? 'image/jpeg' : 'image/png';

        const resultBlob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, targetMime, 0.75);
        });

        if (resultBlob) {
          const arrayBuffer = await resultBlob.arrayBuffer();
          texture.setImage(new Uint8Array(arrayBuffer));
          texture.setMimeType(targetMime);
          texture.setURI(texture.getURI().replace(/\.[a-zA-Z0-9]+$/, `.${options.targetFormat}`));
        }
        URL.revokeObjectURL(img.src);
      }
    };
  };

  const processFile = useCallback(async (fileState: FileState, options: CompressionOptions) => {
    if (processingRef.current.has(fileState.id)) return;
    processingRef.current.add(fileState.id);

    try {
      const io = new WebIO().registerExtensions(KHRONOS_EXTENSIONS);

      const setFileProgress = (p: number, s: string) => {
        setFiles(prev => prev.map(f =>
          f.id === fileState.id ? { ...f, progress: p, status: s as any } : f
        ));
      };

      setFileProgress(10, 'processing');
      const doc = await io.readBinary(fileState.originalBuffer);

      const transforms = [];

      if (options.flattenEnabled) transforms.push(flatten());
      if (options.instanceEnabled) transforms.push(instance());
      if (options.joinEnabled) transforms.push(join());
      if (options.weldEnabled) transforms.push(weld());

      if (options.simplifyEnabled) {
        await MeshoptSimplifier.ready;
        transforms.push(simplify({ simplifier: MeshoptSimplifier, ratio: options.simplifyRatio, error: 0.01 }));
      }

      transforms.push(resample());

      const size = parseInt(options.textureSize);
      if (!isNaN(size)) {
        transforms.push(customTextureCompress({
          targetFormat: options.textureFormat,
          resize: size
        }));
      }

      if (options.removeDuplicates) transforms.push(dedup());
      if (options.removeUnused) transforms.push(prune({ keepAttributes: false, keepLeaves: false }));

      if (options.dracoEnabled) {
        transforms.push(draco({
          method: 'edgebreaker',
          quantizePositionBits: 14,
          quantizeNormalBits: 10,
          quantizeColorBits: 8,
          quantizeTexcoordBits: 12,
          quantizeGenericBits: 8,
          encodeSpeed: 5,
          decodeSpeed: 5,
        }));
      }

      setFileProgress(40, 'processing');
      await doc.transform(...transforms);

      if (options.dracoEnabled) {
        setFileProgress(70, 'processing');
        try {
          const decoderModule = await draco3d.createDecoderModule({
            locateFile: (file: string) => `https://unpkg.com/draco3d@1.5.7/${file}`
          });
          const encoderModule = await draco3d.createEncoderModule({
            locateFile: (file: string) => `https://unpkg.com/draco3d@1.5.7/${file}`
          });
          io.registerDependencies({
            'draco3d.decoder': decoderModule,
            'draco3d.encoder': encoderModule,
          });
        } catch (e) {
          console.error('Failed to load draco dependencies', e);
        }
      }

      setFileProgress(85, 'processing');
      const optimizedBuffer = await io.writeBinary(doc);

      setFiles(prev => prev.map(f =>
        f.id === fileState.id ? {
          ...f,
          compressedBuffer: optimizedBuffer,
          compressedSize: optimizedBuffer.byteLength,
          progress: 100,
          status: 'completed'
        } : f
      ));
    } catch (err: any) {
      console.error(err);
      setFiles(prev => prev.map(f =>
        f.id === fileState.id ? { ...f, progress: 0, status: 'failed', error: err.message } : f
      ));
    } finally {
      processingRef.current.delete(fileState.id);
    }
  }, []);

  const addFiles = useCallback((newFiles: File[], options: CompressionOptions) => {
    newFiles.forEach(async (file) => {
      if (!file.name.toLowerCase().endsWith('.glb')) return;

      const buffer = await file.arrayBuffer();
      const Uint8Buffer = new Uint8Array(buffer);
      const id = Math.random().toString(36).substr(2, 9);
      
      const newFileState: FileState = {
        id,
        name: file.name,
        originalBuffer: Uint8Buffer,
        originalSize: Uint8Buffer.byteLength,
        compressedBuffer: null,
        compressedSize: null,
        progress: 0,
        status: 'pending'
      };

      setFiles(prev => [...prev, newFileState]);
      processFile(newFileState, options);
    });
  }, [processFile]);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  return {
    files,
    setFiles,
    addFiles,
    removeFile,
    clearFiles,
    processFile
  };
};
