import React, { useMemo, useEffect, useState, forwardRef, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface DigitalClockProps {
  color?: string;
  dimensions?: [number, number, number];
  emissiveIntensity?: number;
}

export const DigitalClock = forwardRef<THREE.Mesh, DigitalClockProps>(({
  color = '#1a1a1a',
  dimensions = [1.2, 0.85, 0.05],
  emissiveIntensity = 0.15
}, ref) => {
  const baseCanvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1100;
    c.height = 700;
    return c;
  }, []);

  const emissiveCanvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1100;
    c.height = 700;
    return c;
  }, []);

  const baseTexture = useMemo(() => {
    const tex = new THREE.CanvasTexture(baseCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [baseCanvas]);

  const emissiveTexture = useMemo(() => {
    const tex = new THREE.CanvasTexture(emissiveCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [emissiveCanvas]);

  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @font-face { font-family: "D7MI"; src: url("/font/DSEG7-Classic/DSEG7Classic-Italic.woff") format('woff'); }
      @font-face { font-family: "D14MI"; src: url("/font/fonts-DSEG_v046/DSEG14-Classic/DSEG14Classic-Italic.woff") format('woff'); }
      @font-face { font-family: "D7MBI"; src: url("/font/DSEG7-Classic/DSEG7Classic-BoldItalic.woff") format('woff'); }
    `;
    document.head.appendChild(style);
    document.fonts.ready.then(() => setFontsLoaded(true));
    return () => { try { document.head.removeChild(style); } catch (e) { } };
  }, []);

  const lastTimeRef = useRef(0);

  useFrame((state) => {
    const now = Math.floor(state.clock.elapsedTime);
    if (now === lastTimeRef.current) return;
    lastTimeRef.current = now;

    const ctx = baseCanvas.getContext('2d');
    const emissiveCtx = emissiveCanvas.getContext('2d');
    if (!ctx || !emissiveCtx) return;

    const time = new Date();
    const hours = String(time.getHours()).padStart(2, '0');
    const minutes = String(time.getMinutes()).padStart(2, '0');
    const seconds = String(time.getSeconds()).padStart(2, '0');
    const year = time.getFullYear();
    const month = String(time.getMonth() + 1).padStart(2, '0');
    const day = String(time.getDate()).padStart(2, '0');
    const dayName = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][time.getDay()] + '.';

    // Clear both
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 1100, 700);
    emissiveCtx.fillStyle = '#000000';
    emissiveCtx.fillRect(0, 0, 1100, 700);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, 1100, 700);

    if (fontsLoaded) {
      // Common settings
      const drawSettings = (c: CanvasRenderingContext2D) => {
        c.textAlign = 'left';
        c.textBaseline = 'top';
      };

      drawSettings(ctx);
      drawSettings(emissiveCtx);

      // 1. Draw static background numbers to Base Canvas (non-glowing)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.font = 'italic 80px "D7MI"';
      ctx.fillText('8888-88-88', 90, 60);
      ctx.font = 'italic 80px "D14MI"';
      ctx.fillText(' ~~~', 790, 60);
      ctx.font = 'italic bold 230px "D7MBI"';
      ctx.fillText('88:88', 60, 210);
      ctx.font = 'italic bold 110px "D7MBI"';
      ctx.fillText('88', 860, 330);
      ctx.font = 'italic 110px "D7MBI"';
      ctx.fillText('88.8', 193, 520);
      ctx.fillText('88', 780, 520);

      // 2. Draw actual values to Emissive Canvas (Glowing)
      emissiveCtx.fillStyle = 'rgba(81, 255, 0, 1)';
      emissiveCtx.font = 'italic 80px "D7MI"';
      emissiveCtx.fillText(`${year}-${month}-${day}`, 90, 60);
      emissiveCtx.font = 'italic 80px "D14MI"';
      emissiveCtx.fillText(` ${dayName}`, 790, 60);

      emissiveCtx.fillStyle = 'rgba(255, 0, 0, 1)';
      emissiveCtx.font = 'italic bold 230px "D7MBI"';
      emissiveCtx.fillText(`${hours}:${minutes}`, 60, 210);
      emissiveCtx.font = 'italic bold 110px "D7MBI"';
      emissiveCtx.fillText(seconds, 860, 330);

      // 3. Draw labels to Base Canvas (non-glowing)
      const labelFont = '50px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
      const labelColor = 'white';
      const valueColor = 'rgba(26, 240, 255, 1)';
      let curX = 75;

      ctx.font = labelFont; ctx.fillStyle = labelColor; ctx.fillText('온도 ', curX, 520 + 60);
      curX += ctx.measureText('온도 ').width;

      // Draw dynamic value to Emissive
      emissiveCtx.font = 'italic 110px "D7MBI"'; emissiveCtx.fillStyle = valueColor; emissiveCtx.fillText('24.5', curX, 520);
      curX += emissiveCtx.measureText('24.5').width;

      ctx.font = labelFont; ctx.fillStyle = labelColor; ctx.fillText(' ℃    |   습도 ', curX, 520 + 60);
      curX += ctx.measureText(' ℃    |   습도 ').width;

      // Draw dynamic value to Emissive
      emissiveCtx.font = 'italic 110px "D7MBI"'; emissiveCtx.fillStyle = valueColor; emissiveCtx.fillText('42', curX, 520);
      curX += emissiveCtx.measureText('42').width;

      ctx.font = labelFont; ctx.fillStyle = labelColor; ctx.fillText(' %', curX, 520 + 60);
    } else {
      emissiveCtx.fillStyle = 'white'; emissiveCtx.font = 'bold 100px sans-serif'; emissiveCtx.textAlign = 'center';
      emissiveCtx.fillText(`${hours}:${minutes}:${seconds}`, 1100 / 2, 350);
    }

    baseTexture.needsUpdate = true;
    emissiveTexture.needsUpdate = true;
  });

  return (
    <group position={[0, dimensions[1] / 2, 0]}>
      {/* Clock Case & Screen */}
      <mesh ref={ref} castShadow receiveShadow>
        <boxGeometry args={dimensions} />
        {[0, 1, 2, 3, 5].map(idx => (
          <meshStandardMaterial key={idx} attach={`material-${idx}`} color="#050505" roughness={0.5} metalness={0.2} />
        ))}
        <meshStandardMaterial
          attach="material-4"
          map={baseTexture}
          emissive={[8, 8, 8]}
          emissiveIntensity={emissiveIntensity * 12}
          emissiveMap={emissiveTexture}
          toneMapped={false}
          transparent={true}
        />
      </mesh>

      {/* Glass Front Panel */}
      <mesh position={[0, 0, dimensions[2] / 2 + 0.002]} renderOrder={2}>
        <planeGeometry args={[dimensions[0] - 0.04, dimensions[1] - 0.04]} />
        <meshStandardMaterial
          transparent={true}
          opacity={0.1}
          color="#e0f2fe"
          roughness={0.01}
          metalness={1.0}
          depthWrite={false}
          envMapIntensity={2}
        />
      </mesh>
    </group>
  );
});

DigitalClock.displayName = 'DigitalClock';
