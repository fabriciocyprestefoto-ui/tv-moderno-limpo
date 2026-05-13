import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Subtitles, X, Check, Upload, Type, Minus, Plus, Palette } from 'lucide-react';
import { logger } from '../../utils/logger';

/**
 * SubtitleManager — Gerenciador de legendas SRT/VTT para TV Box
 * ═══════════════════════════════════════════════════════════════
 * - Suporte a SRT e VTT
 * - Parser interno (sem dependência externa)
 * - Controles de estilo (tamanho, cor, fundo, posição)
 * - Persistência de preferências (localStorage)
 * - Suporte a múltiplas faixas de legenda
 * - Compatível com D-Pad / TV Box
 */

// ═══════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════

export interface SubtitleCue {
  id: string;
  startTime: number; // segundos
  endTime: number; // segundos
  text: string;
}

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  cues: SubtitleCue[];
  src?: string; // URL externa (se disponível)
}

export interface SubtitleStyle {
  fontSize: number; // 14-32px
  color: string; // hex
  backgroundColor: string; // hex com alpha
  position: 'bottom' | 'top';
  fontWeight: 'normal' | 'bold';
  outlineColor: string;
}

// ═══════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════

const STORAGE_KEY = 'redx_subtitle_preferences';

const DEFAULT_STYLE: SubtitleStyle = {
  fontSize: 22,
  color: '#FFFFFF',
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  position: 'bottom',
  fontWeight: 'bold',
  outlineColor: '#000000',
};

const FONT_SIZES = [14, 16, 18, 20, 22, 24, 28, 32];

const SUBTITLE_COLORS: { label: string; value: string }[] = [
  { label: 'Branco', value: '#FFFFFF' },
  { label: 'Amarelo', value: '#FFD700' },
  { label: 'Verde', value: '#00FF00' },
  { label: 'Cyan', value: '#00FFFF' },
  { label: 'Rosa', value: '#FF69B4' },
];

const BG_COLORS: { label: string; value: string }[] = [
  { label: 'Escuro', value: 'rgba(0, 0, 0, 0.75)' },
  { label: 'Semi', value: 'rgba(0, 0, 0, 0.5)' },
  { label: 'Transparente', value: 'rgba(0, 0, 0, 0)' },
  { label: 'Vermelho', value: 'rgba(229, 9, 20, 0.5)' },
];

// ═══════════════════════════════════════════════════════
// PARSER SRT / VTT
// ═══════════════════════════════════════════════════════

function parseTimestamp(ts: string): number {
  // Formato: HH:MM:SS,mmm (SRT) ou HH:MM:SS.mmm (VTT)
  const clean = ts.trim().replace(',', '.');
  const parts = clean.split(':');

  if (parts.length === 3) {
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    return h * 3600 + m * 60 + s;
  }

  if (parts.length === 2) {
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    return m * 60 + s;
  }

  return parseFloat(clean) || 0;
}

function stripHtmlTags(text: string): string {
  return text
    .replace(/<\/?[^>]+(>|$)/g, '') // Remove tags HTML
    .replace(/\{[^}]*\}/g, '') // Remove tags ASS/SSA style
    .trim();
}

/**
 * Faz parse de um arquivo SRT.
 */
export function parseSRT(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  // Normalizar line breaks
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Procurar a linha com o timestamp (pode ser a 1ª ou 2ª)
    let timestampLineIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      if (lines[i].includes('-->')) {
        timestampLineIdx = i;
        break;
      }
    }

    if (timestampLineIdx < 0) continue;

    const timestampLine = lines[timestampLineIdx];
    const timeParts = timestampLine.split('-->');
    if (timeParts.length !== 2) continue;

    const startTime = parseTimestamp(timeParts[0]);
    const endTime = parseTimestamp(timeParts[1]);

    // Texto = todas as linhas após o timestamp
    const textLines = lines.slice(timestampLineIdx + 1);
    const text = textLines
      .map((l) => stripHtmlTags(l))
      .join('\n')
      .trim();

    if (text && endTime > startTime) {
      cues.push({
        id: `srt-${cues.length}`,
        startTime,
        endTime,
        text,
      });
    }
  }

  return cues;
}

/**
 * Faz parse de um arquivo VTT (WebVTT).
 */
export function parseVTT(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Remover header WEBVTT e notas
  const lines = normalized.split('\n');
  let i = 0;

  // Pular header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  // Processar cues
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.includes('-->')) {
      const timeParts = line.split('-->');
      if (timeParts.length >= 2) {
        // Remover position/alignment info do timestamp (ex: "00:01.000 --> 00:02.000 position:10%")
        const startTime = parseTimestamp(timeParts[0]);
        const endStr = timeParts[1].split(/\s+/)[0]; // Pegar só o timestamp, ignorar posição
        const endTime = parseTimestamp(endStr);

        // Coletar texto
        const textLines: string[] = [];
        i++;
        while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
          textLines.push(stripHtmlTags(lines[i]));
          i++;
        }

        const text = textLines.join('\n').trim();
        if (text && endTime > startTime) {
          cues.push({
            id: `vtt-${cues.length}`,
            startTime,
            endTime,
            text,
          });
        }
        continue;
      }
    }

    i++;
  }

  return cues;
}

/**
 * Detecta formato e faz parse automaticamente.
 */
export function parseSubtitleFile(content: string, filename?: string): SubtitleCue[] {
  const isVTT =
    content.trimStart().startsWith('WEBVTT') ||
    (filename && filename.toLowerCase().endsWith('.vtt'));

  return isVTT ? parseVTT(content) : parseSRT(content);
}

// ═══════════════════════════════════════════════════════
// HOOK: useSubtitles
// ═══════════════════════════════════════════════════════

interface UseSubtitlesOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export function useSubtitles({ videoRef }: UseSubtitlesOptions) {
  const [tracks, setTracks] = useState<SubtitleTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [currentCue, setCurrentCue] = useState<SubtitleCue | null>(null);
  const [style, setStyle] = useState<SubtitleStyle>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_STYLE, ...JSON.parse(saved) } : DEFAULT_STYLE;
    } catch {
      return DEFAULT_STYLE;
    }
  });

  const animFrameRef = useRef<number>(0);

  // ── Salvar preferências ao mudar estilo ──
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
    } catch {
      // Storage cheio
    }
  }, [style]);

  // ── Polling de cue ativa baseado no currentTime ──
  useEffect(() => {
    const activeTrack = tracks.find((t) => t.id === activeTrackId);
    if (!activeTrack || !videoRef.current) {
      setCurrentCue(null);
      return;
    }

    const checkCue = () => {
      const video = videoRef.current;
      if (!video) return;

      const ct = video.currentTime;
      const cue = activeTrack.cues.find((c) => ct >= c.startTime && ct <= c.endTime);
      setCurrentCue(cue || null);

      animFrameRef.current = requestAnimationFrame(checkCue);
    };

    animFrameRef.current = requestAnimationFrame(checkCue);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [activeTrackId, tracks, videoRef]);

  // ── Carregar legenda de arquivo local ──
  const loadFromFile = useCallback((file: File): Promise<SubtitleTrack> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const content = reader.result as string;
          const cues = parseSubtitleFile(content, file.name);
          if (cues.length === 0) {
            reject(new Error('Nenhuma legenda encontrada no arquivo'));
            return;
          }

          const langMatch = file.name.match(/\.([a-z]{2,3})\.(srt|vtt)$/i);
          const language = langMatch ? langMatch[1] : 'pt';
          const label = langMatch
            ? getLanguageLabel(langMatch[1])
            : file.name.replace(/\.(srt|vtt)$/i, '');

          const track: SubtitleTrack = {
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label,
            language,
            cues,
          };

          setTracks((prev) => [...prev, track]);
          setActiveTrackId(track.id);
          resolve(track);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'utf-8');
    });
  }, []);

  // ── Carregar legenda de URL ──
  const loadFromUrl = useCallback(
    async (url: string, label?: string, language?: string): Promise<SubtitleTrack> => {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const content = await resp.text();

      const cues = parseSubtitleFile(content, url);
      if (cues.length === 0) throw new Error('Nenhuma legenda encontrada');

      const track: SubtitleTrack = {
        id: `url-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: label || 'Legenda',
        language: language || 'pt',
        cues,
        src: url,
      };

      setTracks((prev) => [...prev, track]);
      setActiveTrackId(track.id);
      return track;
    },
    []
  );

  // ── Carregar de string diretamente ──
  const loadFromString = useCallback(
    (content: string, label: string, language: string = 'pt'): SubtitleTrack => {
      const cues = parseSubtitleFile(content);
      const track: SubtitleTrack = {
        id: `str-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label,
        language,
        cues,
      };

      setTracks((prev) => [...prev, track]);
      setActiveTrackId(track.id);
      return track;
    },
    []
  );

  const removeTrack = useCallback(
    (trackId: string) => {
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
      if (activeTrackId === trackId) setActiveTrackId(null);
    },
    [activeTrackId]
  );

  const selectTrack = useCallback((trackId: string | null) => {
    setActiveTrackId(trackId);
  }, []);

  const updateStyle = useCallback((updates: Partial<SubtitleStyle>) => {
    setStyle((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetStyle = useCallback(() => {
    setStyle(DEFAULT_STYLE);
  }, []);

  return {
    tracks,
    activeTrackId,
    currentCue,
    style,
    loadFromFile,
    loadFromUrl,
    loadFromString,
    removeTrack,
    selectTrack,
    updateStyle,
    resetStyle,
  };
}

// ═══════════════════════════════════════════════════════
// COMPONENTE: SubtitleOverlay (renderiza a legenda no vídeo)
// ═══════════════════════════════════════════════════════

interface SubtitleOverlayProps {
  cue: SubtitleCue | null;
  style: SubtitleStyle;
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = React.memo(
  ({ cue, style: subStyle }) => {
    if (!cue) return null;

    const positionClass = subStyle.position === 'top' ? 'top-16' : 'bottom-24';

    return (
      <div
        className={`absolute ${positionClass} left-0 right-0 flex justify-center z-30 pointer-events-none px-8 transition-opacity duration-200`}
        role="status"
        aria-live="polite"
      >
        <div
          className="max-w-[80%] text-center px-4 py-2 rounded-lg transition-all duration-150"
          style={{
            fontSize: `${subStyle.fontSize}px`,
            color: subStyle.color,
            backgroundColor: subStyle.backgroundColor,
            fontWeight: subStyle.fontWeight,
            textShadow: `1px 1px 3px ${subStyle.outlineColor}, -1px -1px 3px ${subStyle.outlineColor}`,
            lineHeight: 1.4,
          }}
        >
          {cue.text.split('\n').map((line, i) => (
            <React.Fragment key={i}>
              {i > 0 && <br />}
              {line}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }
);

SubtitleOverlay.displayName = 'SubtitleOverlay';

// ═══════════════════════════════════════════════════════
// COMPONENTE: SubtitleManager (UI de controle completa)
// ═══════════════════════════════════════════════════════

interface SubtitleManagerProps {
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
  style: SubtitleStyle;
  onSelectTrack: (trackId: string | null) => void;
  onLoadFile: (file: File) => Promise<SubtitleTrack>;
  onRemoveTrack: (trackId: string) => void;
  onUpdateStyle: (updates: Partial<SubtitleStyle>) => void;
  onResetStyle: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

const SubtitleManager: React.FC<SubtitleManagerProps> = ({
  tracks,
  activeTrackId,
  style: subStyle,
  onSelectTrack,
  onLoadFile,
  onRemoveTrack,
  onUpdateStyle,
  onResetStyle,
  isOpen,
  onToggle,
}) => {
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Fechar menu ao clicar fora ──
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onToggle();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onToggle]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setLoadError(null);
      try {
        await onLoadFile(file);
        logger.log(`[SubtitleManager] ✓ Legenda carregada: ${file.name}`);
      } catch (err) {
        const msg = (err as Error).message || 'Erro ao carregar legenda';
        setLoadError(msg);
        setTimeout(() => setLoadError(null), 4000);
      }

      // Reset input para permitir recarregar o mesmo arquivo
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [onLoadFile]
  );

  const currentFontSizeIdx = FONT_SIZES.indexOf(subStyle.fontSize);

  return (
    <div className="relative" ref={menuRef}>
      {/* ═══ TRIGGER BUTTON ═══ */}
      <button
        data-player-control
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        className={`flex items-center gap-1 px-1 py-1 rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white/35 ${
          isOpen
            ? 'bg-white/10 text-white'
            : activeTrackId
              ? 'text-red-400 hover:text-red-300'
              : 'text-white/40 hover:text-red-500'
        }`}
        title="Legendas (C)"
        aria-label="Gerenciador de legendas"
        aria-expanded={isOpen}
      >
        <Subtitles className="w-5 h-5" />
        {activeTrackId && (
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 absolute -top-0.5 -right-0.5" />
        )}
      </button>

      {/* ═══ DROPDOWN MENU ═══ */}
      {isOpen && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-black/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 min-w-[240px] shadow-2xl z-50 animate-in slide-in-from-bottom-2 fade-in duration-200">
          {/* ── Cabeçalho ── */}
          <div className="flex items-center justify-between px-3 py-1.5">
            <p className="text-white/30 text-[9px] uppercase tracking-[0.3em] font-bold">
              Legendas
            </p>
            <button
              onClick={() => setShowStylePanel((prev) => !prev)}
              tabIndex={0}
              className="text-white/30 hover:text-white/60 transition-colors focus:outline-none"
              title="Configurar estilo"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ── Erro de carregamento ── */}
          {loadError && (
            <div className="mx-2 mb-1 px-3 py-1.5 bg-red-600/20 border border-red-600/30 rounded-lg">
              <p className="text-[10px] text-red-400">{loadError}</p>
            </div>
          )}

          {/* ── Desativado ── */}
          <button
            onClick={() => {
              onSelectTrack(null);
              onToggle();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSelectTrack(null);
                onToggle();
              }
            }}
            tabIndex={0}
            data-nav-item
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-white/35 ${
              !activeTrackId
                ? 'bg-red-600/20 text-red-400 font-bold'
                : 'text-white/70 hover:bg-white/10'
            }`}
          >
            <span>Desativadas</span>
            {!activeTrackId && <Check className="w-4 h-4 text-red-500" />}
          </button>

          {/* ── Faixas disponíveis ── */}
          {tracks.length > 0 && (
            <>
              <div className="h-px bg-white/5 my-1" />
              {tracks.map((track) => {
                const isActive = activeTrackId === track.id;
                return (
                  <div key={track.id} className="flex items-center">
                    <button
                      onClick={() => {
                        onSelectTrack(track.id);
                        onToggle();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          onSelectTrack(track.id);
                          onToggle();
                        }
                      }}
                      tabIndex={0}
                      data-nav-item
                      className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-white/35 ${
                        isActive
                          ? 'bg-red-600/20 text-red-400 font-bold'
                          : 'text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-[9px] uppercase bg-white/10 px-1.5 py-0.5 rounded font-bold tracking-wider">
                          {track.language}
                        </span>
                        <span className="truncate max-w-[120px]">{track.label}</span>
                        <span className="text-[8px] text-white/20">{track.cues.length} cues</span>
                      </span>
                      {isActive && <Check className="w-4 h-4 text-red-500 flex-shrink-0" />}
                    </button>
                    <button
                      onClick={() => onRemoveTrack(track.id)}
                      tabIndex={0}
                      className="p-1 text-white/20 hover:text-red-500 transition-colors focus:outline-none rounded ml-1"
                      title="Remover"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {/* ── Carregar arquivo ── */}
          <div className="h-px bg-white/5 my-1" />
          <button
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            tabIndex={0}
            data-nav-item
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-white/50 hover:bg-white/10 hover:text-white/70 transition-all focus:outline-none focus:ring-2 focus:ring-white/35"
          >
            <Upload className="w-4 h-4" />
            <span>Carregar arquivo .srt / .vtt</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".srt,.vtt,text/vtt,application/x-subrip"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* ═══ PAINEL DE ESTILO ═══ */}
          {showStylePanel && (
            <>
              <div className="h-px bg-white/5 my-1" />
              <div className="px-3 py-2 space-y-3">
                <p className="text-white/20 text-[8px] uppercase tracking-[0.2em] font-bold">
                  Estilo
                </p>

                {/* Tamanho da fonte */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/40 flex items-center gap-1">
                    <Type className="w-3 h-3" /> Tamanho
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const newIdx = Math.max(0, currentFontSizeIdx - 1);
                        onUpdateStyle({ fontSize: FONT_SIZES[newIdx] });
                      }}
                      tabIndex={0}
                      className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors focus:outline-none focus:ring-1 focus:ring-white/35"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-[11px] text-white/60 font-mono w-8 text-center">
                      {subStyle.fontSize}px
                    </span>
                    <button
                      onClick={() => {
                        const newIdx = Math.min(FONT_SIZES.length - 1, currentFontSizeIdx + 1);
                        onUpdateStyle({ fontSize: FONT_SIZES[newIdx] });
                      }}
                      tabIndex={0}
                      className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors focus:outline-none focus:ring-1 focus:ring-white/35"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Cor do texto */}
                <div>
                  <span className="text-[10px] text-white/40 block mb-1">Cor</span>
                  <div className="flex gap-1.5">
                    {SUBTITLE_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => onUpdateStyle({ color: c.value })}
                        tabIndex={0}
                        className={`w-6 h-6 rounded-full border-2 transition-all focus:outline-none ${
                          subStyle.color === c.value
                            ? 'border-red-500 scale-110'
                            : 'border-white/20 hover:border-white/40'
                        }`}
                        style={{ backgroundColor: c.value }}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>

                {/* Fundo */}
                <div>
                  <span className="text-[10px] text-white/40 block mb-1">Fundo</span>
                  <div className="flex gap-1.5">
                    {BG_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => onUpdateStyle({ backgroundColor: c.value })}
                        tabIndex={0}
                        className={`px-2 py-1 rounded text-[8px] font-bold transition-all focus:outline-none ${
                          subStyle.backgroundColor === c.value
                            ? 'bg-red-600/30 border border-red-500/50 text-red-400'
                            : 'bg-white/10 border border-white/10 text-white/50 hover:bg-white/20'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Posição */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/40">Posição</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => onUpdateStyle({ position: 'bottom' })}
                      tabIndex={0}
                      className={`px-2 py-1 rounded text-[8px] font-bold transition-all focus:outline-none ${
                        subStyle.position === 'bottom'
                          ? 'bg-red-600/30 text-red-400'
                          : 'bg-white/10 text-white/50 hover:bg-white/20'
                      }`}
                    >
                      Baixo
                    </button>
                    <button
                      onClick={() => onUpdateStyle({ position: 'top' })}
                      tabIndex={0}
                      className={`px-2 py-1 rounded text-[8px] font-bold transition-all focus:outline-none ${
                        subStyle.position === 'top'
                          ? 'bg-red-600/30 text-red-400'
                          : 'bg-white/10 text-white/50 hover:bg-white/20'
                      }`}
                    >
                      Cima
                    </button>
                  </div>
                </div>

                {/* Reset */}
                <button
                  onClick={onResetStyle}
                  tabIndex={0}
                  className="w-full text-center text-[9px] text-white/30 hover:text-white/60 py-1 transition-colors focus:outline-none"
                >
                  Restaurar padrão
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(SubtitleManager);

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function getLanguageLabel(code: string): string {
  const labels: Record<string, string> = {
    pt: 'Português',
    'pt-br': 'Português (BR)',
    en: 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    it: 'Italiano',
    ja: '日本語',
    ko: '한국어',
    zh: '中文',
    ru: 'Русский',
    ar: 'العربية',
  };
  return labels[code.toLowerCase()] || code.toUpperCase();
}
