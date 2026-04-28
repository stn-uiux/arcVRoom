import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  Download,
  Trash2,
  Zap,
  HelpCircle,
  FileText
} from 'lucide-react';
import { motion } from 'framer-motion';
import { FileState, CompressionOptions } from './useGLBCompression';

interface GLBCompressorProps {
  isOpen: boolean;
  onClose: () => void;
  language?: 'en' | 'ko';
  files: FileState[];
  onAddFiles: (files: File[], options: CompressionOptions) => void;
  onRemoveFile: (id: string) => void;
  onClearFiles: () => void;
  onDownloadFile: (file: FileState) => void;
}

export const GLBCompressor: React.FC<GLBCompressorProps> = ({
  isOpen,
  onClose,
  language = 'ko',
  files,
  onAddFiles,
  onRemoveFile,
  onClearFiles,
  onDownloadFile
}) => {
  const [isDragging, setIsDragging] = useState(false);

  // Options
  const [textureFormat, setTextureFormat] = useState('webp');
  const [textureSize, setTextureSize] = useState('1024');
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [removeUnused, setRemoveUnused] = useState(true);
  const [dracoEnabled, setDracoEnabled] = useState(true);
  const [simplifyEnabled, setSimplifyEnabled] = useState(false);
  const [simplifyRatio, setSimplifyRatio] = useState(0.75);
  const [instanceEnabled, setInstanceEnabled] = useState(true);
  const [flattenEnabled, setFlattenEnabled] = useState(true);
  const [joinEnabled, setJoinEnabled] = useState(true);
  const [weldEnabled, setWeldEnabled] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = (en: string, ko: string) => (language === 'ko' ? ko : en);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const calculateReduction = (orig: number, comp: number) => {
    const diff = orig - comp;
    if (diff <= 0) return '0%';
    return `-${((diff / orig) * 100).toFixed(1)}%`;
  };

  const currentOptions: CompressionOptions = {
    textureFormat,
    textureSize,
    removeDuplicates,
    removeUnused,
    dracoEnabled,
    simplifyEnabled,
    simplifyRatio,
    instanceEnabled,
    flattenEnabled,
    joinEnabled,
    weldEnabled
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles?.length) return;
    onAddFiles(Array.from(selectedFiles), currentOptions);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadAll = () => {
    files.forEach(f => {
      if (f.status === 'completed') onDownloadFile(f);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/95 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-[1200px] h-[85vh] bg-[#020617] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-800 bg-[#020617]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
              <Zap className="text-blue-500 w-6 h-6 fill-blue-500/10" />
            </div>
            <h2 className="text-xl font-bold tracking-tight">{t('GLB Compressor', 'GLB 압축 최적화')}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-slate-800/50 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 grid grid-cols-12 overflow-hidden bg-slate-950/20">
          {/* Left: Options (7 cols) */}
          <div className="col-span-7 border-r border-slate-800 overflow-y-auto p-8 space-y-10 custom-scrollbar">
            {/* Texture Options */}
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">
                {t('Texture Options', '텍스처 옵션')}
              </h3>
              <div className="flex gap-4">
                <select
                  value={textureFormat}
                  onChange={(e) => setTextureFormat(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 focus:border-blue-500 outline-none transition-colors"
                >
                  <option value="webp">WebP</option>
                  <option value="jpeg">JPEG</option>
                  <option value="png">PNG</option>
                </select>
                <select
                  value={textureSize}
                  onChange={(e) => setTextureSize(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 focus:border-blue-500 outline-none transition-colors"
                >
                  <option value="512">512</option>
                  <option value="1024">1024 (Recommended)</option>
                  <option value="2048">2048</option>
                  <option value="4096">4096</option>
                </select>
              </div>
            </section>

            {/* Advanced Options */}
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">
                {t('Advanced Options', '상세 옵션')}
              </h3>

              <div className="space-y-4">
                {/* Checkbox Rows */}
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={removeDuplicates}
                      onChange={(e) => setRemoveDuplicates(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                    />
                    <span className="text-sm text-slate-300 group-hover:text-white transition-colors flex items-center gap-2">
                      {t('Remove duplicates', '중복 리소스 제거')} <HelpCircle size={12} className="text-slate-600" />
                    </span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={removeUnused}
                      onChange={(e) => setRemoveUnused(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                    />
                    <span className="text-sm text-slate-300 group-hover:text-white transition-colors flex items-center gap-2">
                      {t('Remove unused vertices', '미사용 정점 제거')} <HelpCircle size={12} className="text-slate-600" />
                    </span>
                  </label>

                  <div className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={dracoEnabled}
                        onChange={(e) => setDracoEnabled(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                      />
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors flex items-center gap-2">
                        {t('Draco compression', '드라코 압축')} <HelpCircle size={12} className="text-slate-600" />
                      </span>
                    </label>
                    <div className="ml-7 p-3 bg-slate-950 border border-slate-800 rounded-lg text-[10px] text-slate-500 leading-normal">
                      <span className="text-slate-300 font-bold">Note:</span> Remember to include DRACOLoader in your GLTF loader when using Draco compression.
                    </div>
                  </div>

                  {/* Simplify */}
                  <div className="flex items-center gap-6 p-4 bg-slate-950/50 border border-slate-800 rounded-xl">
                    <label className="flex items-center gap-3 cursor-pointer w-48 shrink-0">
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${simplifyEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
                        <input
                          type="checkbox"
                          checked={simplifyEnabled}
                          onChange={(e) => setSimplifyEnabled(e.target.checked)}
                          className="sr-only"
                        />
                        <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${simplifyEnabled ? 'translate-x-4' : ''}`} />
                      </div>
                      <span className="text-sm text-slate-300">{t('Simplify geometry', '지오메트리 단순화')}</span>
                    </label>
                    <div className="flex-1 flex items-center gap-4">
                      <input
                        type="range" min="0" max="1" step="0.01"
                        disabled={!simplifyEnabled}
                        value={simplifyRatio}
                        onChange={(e) => setSimplifyRatio(parseFloat(e.target.value))}
                        className="flex-1 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-600 disabled:opacity-30"
                      />
                      <span className="text-xs font-mono text-slate-500 w-8">{simplifyRatio.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Quick Toggles Grid */}
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    {[
                      { id: 'instance', label: t('Instance meshes', '메시 인스턴싱'), state: instanceEnabled, set: setInstanceEnabled },
                      { id: 'flatten', label: t('Flatten nodes', '노드 구조 단순화'), state: flattenEnabled, set: setFlattenEnabled },
                      { id: 'join', label: t('Join meshes', '메시 통합'), state: joinEnabled, set: setJoinEnabled },
                      { id: 'weld', label: t('Weld vertices', '정점 병합'), state: weldEnabled, set: setWeldEnabled }
                    ].map(opt => (
                      <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={opt.state}
                          onChange={(e) => opt.set(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                        />
                        <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors flex items-center gap-2">
                          {opt.label}
                          <span className="px-1 py-0.5 bg-slate-800 text-[8px] font-bold text-slate-500 rounded uppercase tracking-tighter">New</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Right: Upload & List (5 cols) */}
          <div className="col-span-5 flex flex-col bg-[#020617] min-h-0">
            {/* Upload Zone */}
            <div className="p-8 flex-1 flex flex-col gap-4 min-h-0">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.length) {
                    onAddFiles(Array.from(e.dataTransfer.files), currentOptions);
                  }
                }}
                className={`
                  flex-shrink-0 h-40 bg-slate-900/50 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center gap-3 transition-all cursor-pointer
                  ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 hover:border-slate-700'}
                `}
              >
                <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center">
                  <UploadCloud className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white uppercase tracking-tight">{t('Drag & Drop GLB/GLTF files', 'GLB/GLTF 파일 드래그')}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Or click to explore</p>
                </div>
              </div>
              <input
                type="file"
                multiple
                accept=".glb,.gltf"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileUpload}
              />

              {/* List Header */}
              <div className="flex-1 flex flex-col min-h-0 bg-slate-900/20 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{t('Recent Queue', '대기열')} ({files.length})</h3>
                  <div className="flex gap-3">
                    {files.length > 0 && (
                      <>
                        <button onClick={downloadAll} className="text-[9px] font-bold text-blue-500 hover:text-blue-400 uppercase tracking-tighter">Download All</button>
                        <button onClick={onClearFiles} className="text-[9px] font-bold text-slate-600 hover:text-slate-400 uppercase tracking-tighter">Clear All</button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {files.length > 0 ? (
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-[#020617] text-[8px] font-bold text-slate-600 uppercase tracking-widest border-b border-slate-800">
                        <tr>
                          <th className="px-4 py-2">Filename</th>
                          <th className="px-4 py-2">Size</th>
                          <th className="px-4 py-2">Reduction</th>
                          <th className="px-4 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="text-[10px]">
                        {files.map((file) => (
                          <tr key={file.id} className="border-b border-slate-800/30 hover:bg-slate-800/20 group">
                            <td className="px-4 py-3 max-w-[100px] truncate font-bold text-slate-300" title={file.name}>{file.name}</td>
                            <td className="px-4 py-3 text-slate-500">
                              {formatSize(file.originalSize)}
                              {file.compressedSize && <span className="block text-[8px] text-slate-600">~{formatSize(file.compressedSize)}</span>}
                            </td>
                            <td className="px-4 py-3 text-green-500 font-bold">
                              {file.compressedSize ? calculateReduction(file.originalSize, file.compressedSize) : '-'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {file.status === 'processing' ? (
                                <div className="flex flex-col items-end gap-1">
                                  <div className="w-12 h-0.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500" style={{ width: `${file.progress}%` }} />
                                  </div>
                                  <span className="text-[7px] text-blue-500 uppercase">Processing</span>
                                </div>
                              ) : file.status === 'completed' ? (
                                <button
                                  onClick={() => onDownloadFile(file)}
                                  className="text-[9px] font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1 rounded-md text-white transition-all"
                                >
                                  Download
                                </button>
                              ) : file.status === 'failed' ? (
                                <span className="text-[8px] text-red-500 font-bold">Failed</span>
                              ) : (
                                <button onClick={() => onRemoveFile(file.id)} className="text-slate-700 hover:text-red-500 transition-colors">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-20">
                      <FileText size={32} strokeWidth={1} />
                      <p className="text-[10px] font-bold uppercase tracking-widest mt-2">No files in queue</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
