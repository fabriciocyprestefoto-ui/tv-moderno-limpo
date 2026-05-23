import React, { useCallback, useEffect, useRef, useState } from 'react';
import { isNativePlatform } from '@/services/nativePlayerService';
import { getSignal } from '@/utils/appSignals';

interface AppBootScreenProps {
  onComplete: () => void;
}

// Assets disponíveis: frame_000…frame_071 (72 arquivos). Renderiza os 36 ímpares
// (1,3,5…71) — metade dos quadros economiza RAM na TCL sem pedir frames inexistentes.
const TOTAL_FRAMES_RENDERED = 36;
const FPS = 12;
const FRAME_DURATION_MS = 1000 / FPS;
/** Sequência webp completa: 48 frames / 12fps ≈ 4s. O splash nunca sai antes disso. */
const MIN_TOTAL_MS = TOTAL_FRAMES_RENDERED * FRAME_DURATION_MS;
/** Teto de segurança: se o catálogo (homeReady) nunca sinalizar, sai assim mesmo. */
const MAX_TOTAL_MS = 12000;

const AppBootScreen: React.FC<AppBootScreenProps> = ({ onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(false);
  const currentFrameRef = useRef(1);
  const startTimeRef = useRef(performance.now());
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const preloadStartedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const nativeAndroid = typeof window !== 'undefined' && isNativePlatform();
  const skipBoot =
    typeof window !== 'undefined' &&
    ((window as unknown as Record<string, unknown>).__REDX_SKIP_BOOT === true ||
      (!nativeAndroid && localStorage.getItem('redx-skip-boot') === '1'));

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCompleteRef.current();
  }, []);

  // Preload — roda UMA vez (ref guard). Sem `loaded` nas deps: a sequência nunca reinicia.
  useEffect(() => {
    if (preloadStartedRef.current) return;
    preloadStartedRef.current = true;

    if (skipBoot) {
      finish();
      return;
    }

    let loadedCount = 0;
    let animationUnlocked = false;
    const loadedImages: HTMLImageElement[] = [];

    for (let i = 1; i <= TOTAL_FRAMES_RENDERED; i++) {
      const img = new Image();
      const fileIndex = i * 2 - 1; // 1,3,5…95
      img.src = `/boot-vinheta/frame_${String(fileIndex).padStart(3, '0')}.webp`;
      const onSettled = () => {
        loadedCount++;
        // Começa a animar quando há frames suficientes em buffer.
        if (loadedCount >= 10 && !animationUnlocked) {
          animationUnlocked = true;
          setLoaded(true);
        }
      };
      img.onload = onSettled;
      img.onerror = onSettled;
      loadedImages.push(img);
    }

    imagesRef.current = loadedImages;

    // Failsafe absoluto: se as imagens nunca carregarem (rede/decodificação falha),
    // o loop de animação não roda — este timer garante a saída do splash.
    const failsafe = window.setTimeout(finish, MAX_TOTAL_MS + 1000);
    return () => window.clearTimeout(failsafe);
  }, [skipBoot, finish]);

  // Loop: desenha a sequência 1x, depois aguarda o catálogo (homeReady) — fluxo do desktop.
  useEffect(() => {
    if (skipBoot || !loaded) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let rafId = 0;
    let lastDrawTime = performance.now();

    const drawFrame = (img: HTMLImageElement | undefined) => {
      if (!img || !img.complete || img.naturalWidth === 0) return;
      // object-fit: cover — preenche a tela mantendo proporção
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
      const x = canvas.width / 2 - (img.width / 2) * scale;
      const y = canvas.height / 2 - (img.height / 2) * scale;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
    };

    const render = (time: number) => {
      if (doneRef.current) return;
      const images = imagesRef.current;
      const sequenceDone = currentFrameRef.current > TOTAL_FRAMES_RENDERED;

      if (!sequenceDone) {
        if (time - lastDrawTime >= FRAME_DURATION_MS) {
          drawFrame(images[currentFrameRef.current - 1]);
          currentFrameRef.current++;
          lastDrawTime = time - ((time - lastDrawTime) % FRAME_DURATION_MS);
        }
      } else {
        // Sequência terminou: segura o último frame enquanto espera o catálogo.
        drawFrame(images[TOTAL_FRAMES_RENDERED - 1]);
      }

      const elapsed = time - startTimeRef.current;
      // Sai quando: sequência completa + catálogo pronto + tempo mínimo,
      // OU teto de segurança atingido. Mesmo critério do boot do desktop.
      if (
        (sequenceDone && getSignal('homeReady') && elapsed >= MIN_TOTAL_MS) ||
        elapsed >= MAX_TOTAL_MS
      ) {
        finish();
        return;
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [skipBoot, loaded, finish]);

  if (skipBoot) return null;

  return (
    <div className="fixed inset-0 z-[99999] overflow-hidden bg-black select-none">
      <canvas
        ref={(el) => {
          canvasRef.current = el;
          if (el) {
            // Resolução nativa da TV — evita borrões
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
