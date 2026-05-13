/**
 * HLSTestPlayer — página de teste para o stream local HLS (Nova pasta/master.m3u8)
 * Acesse em: /hls-test
 * Demonstra: ABR adaptativo, troca de qualidade, buffer watchdog, fullscreen TV Box
 */
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Settings, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { runtimeFlags } from '@/config/runtimeFlags';

const HLS_SOURCE = '/Nova pasta/master.m3u8';
const SEEK_STEP = 30;

function HLSTestDisabledForTv({ onClose }: { onClose?: () => void }) {
  return (
    <div className="fixed inset-0 bg-black z-[9999] text-white flex flex-col items-center justify-center gap-5 px-8 text-center">
      <Activity size={44} className="text-white/45" />
      <div>
        <p className="text-xl font-black">Teste HLS indisponivel no APK TV</p>
        <p className="mt-2 text-sm text-white/55 max-w-xl">
          Esta rota de debug usa HTML5 video/HLS.js e fica ativa apenas em web/legacy.
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="px-6 py-3 rounded-xl bg-white text-black font-black text-sm tracking-widest uppercase focus:outline-none focus:ring-4 focus:ring-white/60"
      >
        Voltar
      </button>
    </div>
  );
}

const HLSTestPlayerImpl: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [streamError, setStreamError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [qualityLabel, setQualityLabel] = useState('AUTO');
  const [qualities, setQualities] = useState<any[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [stallCount, setStallCount] = useState(0);
  const hideTimer = useRef<number | null>(null);

  const resolveLabel = useCallback((hls: any, level: number) => {
    if (level === -1) return 'AUTO';
    const h = (hls.levels || [])[level]?.height;
    if (!h) return 'AUTO';
    return h >= 1080 ? '1080p' : h >= 720 ? '720p' : h >= 480 ? '480p' : '360p';
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowControls(false), 4000);
  }, []);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  // ── Setup HLS ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const setupHls = async () => {
      const { default: Hls } = await import('hls.js');

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: false,
          startLevel: -1,
          capLevelToPlayerSize: true,
          abrEwmaDefaultEstimate: 500_000,
          abrBandWidthFactor: 0.95,
          abrBandWidthUpFactor: 0.7,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferSize: 30 * 1024 * 1024,
          backBufferLength: 10,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 5,
          fragLoadingTimeOut: 20_000,
          fragLoadingMaxRetry: 4,
          autoStartLoad: true,
          xhrSetup: (xhr: XMLHttpRequest) => {
            xhr.withCredentials = false;
          },
        });

        hlsRef.current = hls;
        hls.loadSource(HLS_SOURCE);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_ev: any, data: any) => {
          setQualities(data.levels || []);
          setQualityLabel('AUTO');
          video.play().catch(() => {});
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_ev: any, data: any) => {
          setCurrentQuality(data.level);
          setQualityLabel(resolveLabel(hls, data.level));
        });

        let netRetries = 0;
        hls.on(Hls.Events.ERROR, (_ev: any, data: any) => {
          if (!data.fatal) {
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) setStallCount((c) => c + 1);
            return;
          }
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 3) {
            netRetries++;
            setTimeout(() => hls.startLoad(), 1000 * netRetries);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            // Fallback MP4
            hls.destroy();
            hlsRef.current = null;
            video.src = '/Nova pasta/video.mp4';
            video.play().catch(() => {});
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl') !== '') {
        // Safari nativo
        video.src = HLS_SOURCE;
        video.play().catch(() => {});
      }
    };

    setupHls();

    // Fullscreen landscape automático
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }
    if ((screen.orientation as any)?.lock) {
      (screen.orientation as any).lock('landscape').catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [resolveLabel]);

  // ── D-Pad / teclado TV Box ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      let key = e.key;
      if (key === 'Up') key = 'ArrowUp';
      if (key === 'Down') key = 'ArrowDown';
      if (key === 'Left') key = 'ArrowLeft';
      if (key === 'Right') key = 'ArrowRight';
      if (key === 'OK' || key === 'Select') key = 'Enter';
      if (key === 'Back') key = 'Escape';
      if (!key) {
        const code = e.keyCode || 0;
        if (code === 21) key = 'ArrowLeft';
        if (code === 22) key = 'ArrowRight';
        if (code === 23 || code === 66) key = 'Enter';
        if (code === 4 || code === 27) key = 'Escape';
      }

      revealControls();
      const video = videoRef.current;
      if (!video) return;

      if (key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (key === 'Enter') {
        e.preventDefault();
        video.paused ? video.play() : video.pause();
        return;
      }
      if (key === 'ArrowLeft') {
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - SEEK_STEP);
        return;
      }
      if (key === 'ArrowRight') {
        e.preventDefault();
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + SEEK_STEP);
        return;
      }
      if (key === 'ArrowUp') {
        e.preventDefault();
        setShowQualityMenu((v) => !v);
        return;
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [onClose, revealControls]);

  const setManualQuality = (idx: number) => {
    if (!hlsRef.current) return;
    const level = idx; // -1 = AUTO
    hlsRef.current.currentLevel = level;
    hlsRef.current.nextLevel = level;
    setCurrentQuality(level);
    setQualityLabel(resolveLabel(hlsRef.current, level));
    setShowQualityMenu(false);
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black z-[9999] overflow-hidden text-white select-none"
      onClick={revealControls}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        autoPlay
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setStallCount(0);
        }}
        onError={() => setStreamError(true)}
      />

      {/* Badge qualidade */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2 pointer-events-none">
        <div
          className={`px-3 py-1 rounded-md text-xs font-black tracking-widest uppercase border
          ${
            qualityLabel === 'AUTO'
              ? 'bg-black/50 border-white/20 text-white/60'
              : 'bg-purple-600/80 border-purple-400/40 text-white'
          }`}
        >
          {qualityLabel}
        </div>
        {stallCount > 0 && (
          <div className="px-2 py-1 rounded-md text-[10px] font-black bg-yellow-500/20 border border-yellow-400/30 text-yellow-300">
            ⟳ recuperando
          </div>
        )}
      </div>

      {/* Buffering */}
      {isBuffering && !streamError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Erro */}
      <AnimatePresence>
        {streamError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 gap-6"
          >
            <Activity size={48} className="text-red-400" />
            <p className="text-xl font-black">Falha na reprodução</p>
            <button
              autoFocus
              onClick={() => {
                setStreamError(false);
              }}
              className="px-8 py-3 rounded-xl bg-white text-black font-black text-sm tracking-widest uppercase focus:outline-none focus:ring-4 focus:ring-white/60"
            >
              Tentar novamente
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD controles */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black/80 to-transparent"
          >
            {/* Barra de progresso */}
            <div className="mb-4">
              <div className="flex justify-between text-xs font-black text-white/50 mb-1 tracking-widest">
                <span>{fmt(currentTime)}</span>
                <span>{fmt(duration)}</span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Botões */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={onClose}
                  aria-label="Fechar"
                  className="p-3 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
                >
                  <ArrowLeft size={20} />
                </button>
                <button
                  onClick={() => {
                    const v = videoRef.current;
                    v && (v.paused ? v.play() : v.pause());
                  }}
                  aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
                  className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center font-black focus:outline-none focus:ring-4 focus:ring-white/60"
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <span className="text-sm font-black text-white/60 tracking-widest">
                  ◀◀ / ▶▶ {SEEK_STEP}s
                </span>
              </div>

              <button
                onClick={() => setShowQualityMenu((v) => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-sm font-black focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                <Settings size={16} />
                {qualityLabel}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Menu de qualidade */}
      <AnimatePresence>
        {showQualityMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute bottom-32 right-8 bg-black/90 border border-white/20 rounded-2xl p-4 backdrop-blur-xl z-50 min-w-[160px]"
          >
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">
              Qualidade
            </p>
            <button
              onClick={() => setManualQuality(-1)}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-black mb-1 transition-all
                ${currentQuality === -1 ? 'bg-purple-600 text-white' : 'text-white/70 hover:bg-white/10'}`}
            >
              AUTO (Adaptável)
            </button>
            {qualities.map((q, idx) => {
              const label =
                q.height >= 1080
                  ? '1080p'
                  : q.height >= 720
                    ? '720p'
                    : q.height >= 480
                      ? '480p'
                      : '360p';
              return (
                <button
                  key={idx}
                  onClick={() => setManualQuality(idx)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-black mb-1 transition-all
                    ${currentQuality === idx ? 'bg-purple-600 text-white' : 'text-white/70 hover:bg-white/10'}`}
                >
                  {label}
                  <span className="text-[10px] text-white/30 ml-2">
                    {Math.round((q.bitrate || q.bandwidth || 0) / 1000)}kbps
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const HLSTestPlayer: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  if (runtimeFlags.isTvBuild) return <HLSTestDisabledForTv onClose={onClose} />;
  return <HLSTestPlayerImpl onClose={onClose} />;
};

export default HLSTestPlayer;
