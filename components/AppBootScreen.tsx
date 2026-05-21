import React, { useCallback, useEffect, useRef, useState } from 'react';
import { isNativePlatform } from '@/services/nativePlayerService';

interface AppBootScreenProps {
  onComplete: () => void;
}

const TOTAL_FRAMES_RENDERED = 48; // Reduzido pela metade para poupar memória na TCL
const FPS = 12; // Metade do frame rate para manter a duração de 4 segundos
const FRAME_DURATION_MS = 1000 / FPS;

const AppBootScreen: React.FC<AppBootScreenProps> = ({ onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(false);
  const currentFrameRef = useRef(1);
  const [images, setImages] = useState<HTMLImageElement[]>([]);
  const [loaded, setLoaded] = useState(false);

  const nativeAndroid = typeof window !== 'undefined' && isNativePlatform();
  const skipBoot =
    typeof window !== 'undefined' &&
    ((window as unknown as Record<string, unknown>).__REDX_SKIP_BOOT === true ||
      (!nativeAndroid && localStorage.getItem('redx-skip-boot') === '1'));

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [onComplete]);

  // Preload das imagens
  useEffect(() => {
    if (skipBoot) {
      onComplete();
      return;
    }

    let loadedCount = 0;
    const loadedImages: HTMLImageElement[] = [];

    for (let i = 1; i <= TOTAL_FRAMES_RENDERED; i++) {
      const img = new Image();
      // Pega frames ímpares (1, 3, 5, 7...) para pular quadros e salvar memória
      const fileIndex = i * 2 - 1;
      const frameNumber = String(fileIndex).padStart(3, '0');
      img.src = `/boot-vinheta/frame_${frameNumber}.webp`;
      
      img.onload = () => {
        loadedCount++;
        // Assim que carregarmos os primeiros 10 frames (ou se a internet for rápida, todos), já podemos iniciar a animação
        if (loadedCount >= 10 && !loaded) {
          setLoaded(true);
        }
      };
      
      img.onerror = () => {
        loadedCount++;
      };
      
      loadedImages.push(img);
    }
    
    setImages(loadedImages);
    
    // Failsafe absoluto de 12 segundos
    const failsafe = window.setTimeout(finish, 12000);
    return () => window.clearTimeout(failsafe);
  }, [finish, onComplete, skipBoot, loaded]);

  // Loop de animação no Canvas
  useEffect(() => {
    if (skipBoot || !loaded || !canvasRef.current || images.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastDrawTime = performance.now();

    const render = (time: number) => {
      if (doneRef.current) return;

      const elapsed = time - lastDrawTime;

      if (elapsed >= FRAME_DURATION_MS) {
        const frameIndex = currentFrameRef.current - 1;
        const img = images[frameIndex];

        if (img && img.complete && img.naturalWidth !== 0) {
          // Mantém proporção da tela preenchendo a tela (object-fit cover equivalent)
          const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
          const x = (canvas.width / 2) - (img.width / 2) * scale;
          const y = (canvas.height / 2) - (img.height / 2) * scale;
          
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        }

        currentFrameRef.current++;
        lastDrawTime = time - (elapsed % FRAME_DURATION_MS);

        if (currentFrameRef.current > TOTAL_FRAMES_RENDERED) {
          finish();
          return;
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [skipBoot, loaded, images, finish]);

  if (skipBoot) return null;

  return (
    <div className="fixed inset-0 z-[99999] overflow-hidden bg-black select-none">
      <canvas
        ref={(el) => {
          canvasRef.current = el;
          if (el) {
            // Seta resolução nativa da TV para evitar borrões
            el.width = window.innerWidth;
            el.height = window.innerHeight;
          }
        }}
        className="absolute inset-0 h-full w-full object-cover"
        aria-hidden="true"
      />
    </div>
  );
};

export default AppBootScreen;

