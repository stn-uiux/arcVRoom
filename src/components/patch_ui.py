import sys

file_path = r'c:\Users\user\workspace\stn-uiux\arcVRoom\src\components\UI.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

state_code = """
  const {
    files: compressionFiles,
    addFiles: addCompressionFiles,
    removeFile: removeCompressionFile,
    clearFiles: clearCompressionFiles,
    setFiles: setCompressionFiles
  } = useGLBCompression();

  const [showCompletionToast, setShowCompletionToast] = useState(false);
  const [lastCompletedCount, setLastCompletedCount] = useState(0);

  const downloadCompressedFile = (file: FileState) => {
    if (!file.compressedBuffer) return;
    const blob = new Blob([file.compressedBuffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = file.name.replace('.glb', '_optimized.glb');
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const completed = compressionFiles.filter(f => f.status === 'completed').length;
    const processing = compressionFiles.filter(f => f.status === 'processing' || f.status === 'pending').length;
    
    if (completed > lastCompletedCount && processing === 0 && !showCompressor) {
      setShowCompletionToast(true);
      const timer = setTimeout(() => setShowCompletionToast(false), 10000);
      // return () => clearTimeout(timer);
    }
    setLastCompletedCount(completed);
  }, [compressionFiles, lastCompletedCount, showCompressor]);

  const isCompressing = compressionFiles.some(f => f.status === 'processing' || f.status === 'pending');
  const totalCompressionProgress = compressionFiles.length > 0 
    ? compressionFiles.reduce((acc, f) => acc + f.progress, 0) / compressionFiles.length 
    : 0;
"""

# Find activeTab state and insert after it
marker = "settings'>('objects');"
if marker in content:
    content = content.replace(marker, marker + state_code)
else:
    print("Marker not found")
    sys.exit(1)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied successfully")
