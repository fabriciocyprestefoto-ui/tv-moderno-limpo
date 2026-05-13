import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { PitoChannel, Program } from './types';
import { PitoProgramDetailsModal } from './ProgramDetailsModal';
import { normalizeRemoteKey } from '@/hooks/useRemoteControl';

interface EPGTimelineProps {
  channels: PitoChannel[];
  initialRow?: number;
  onClose: () => void;
}

export const PitoEPGTimeline: React.FC<EPGTimelineProps> = ({
  channels,
  initialRow = 0,
  onClose,
}) => {
  const [selectedProgram, setSelectedProgram] = React.useState<Program | null>(null);
  const [focusedRow, setFocusedRow] = React.useState(initialRow);
  const [focusedCol, setFocusedCol] = React.useState(0);

  const times = ['AGORA', '+1h', '+2h'];

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = normalizeRemoteKey(e);
      if (selectedProgram) {
        if (key === 'Escape' || key === 'Backspace') setSelectedProgram(null);
        return;
      }
      switch (key) {
        case 'ArrowUp':
          setFocusedRow((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowDown':
          setFocusedRow((prev) => Math.min(channels.length - 1, prev + 1));
          break;
        case 'ArrowLeft':
          setFocusedCol((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
          setFocusedCol((prev) => Math.min(2, prev + 1));
          break;
        case 'Enter': {
          const ch = channels[focusedRow];
          if (!ch) break;
          if (focusedCol === 0) setSelectedProgram(ch.currentProgram);
          else setSelectedProgram(ch.nextPrograms[focusedCol - 1] ?? null);
          break;
        }
        case 'Escape':
        case 'Backspace':
          onClose();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [selectedProgram, focusedRow, focusedCol, channels, onClose]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-8 font-sans antialiased text-white"
        style={{
          background: 'rgba(14, 8, 24, 0.68)',
        }}
      >
        <main className="livetv-vision-panel w-[95vw] h-[90vh] shadow-2xl flex flex-col relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none h-32 z-0" />

          <header className="relative z-10 flex justify-between items-center px-8 py-6 shrink-0">
            <button
              onClick={onClose}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 transition-colors duration-200 border border-white/20 rounded-full px-5 py-2.5 text-sm font-medium backdrop-blur-md"
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </button>
            <h1 className="text-3xl font-semibold tracking-wide absolute left-1/2 transform -translate-x-1/2">
              Guia de Canais
            </h1>
            <button
              onClick={onClose}
              className="bg-white/10 hover:bg-white/20 transition-colors duration-200 border border-white/20 rounded-full px-5 py-2.5 text-sm font-medium backdrop-blur-md"
            >
              Fechar (ESC)
            </button>
          </header>

          <section className="relative z-10 flex flex-col flex-1 px-8 pb-8 overflow-hidden">
            <div className="flex ml-[260px] mb-4 text-xs font-medium text-white/50 relative">
              {times.map((time, idx) => (
                <div
                  key={idx}
                  className="w-[30%] border-l border-white/20 pl-3"
                  style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}
                >
                  {time}
                </div>
              ))}
            </div>

            <div className="flex flex-1 relative pito-no-scrollbar overflow-y-auto">
              {/* Linha do tempo atual */}
              <div
                className="absolute top-0 bottom-0 z-40"
                style={{
                  left: 'calc(260px + 40%)',
                  width: '2px',
                  background:
                    'linear-gradient(to bottom, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 100%)',
                  boxShadow: '0 0 10px rgba(255,255,255,0.4)',
                }}
              />

              {/* Coluna dos canais */}
              <div className="w-[240px] shrink-0 flex flex-col gap-3 z-20">
                {channels.map((channel, rowIndex) => (
                  <article
                    key={channel.id}
                    ref={(el) => {
                      if (el && rowIndex === focusedRow) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                    className="h-[76px] rounded-2xl p-3 flex items-center gap-4 backdrop-blur-sm transition-colors"
                    style={{
                      background:
                        focusedRow === rowIndex
                          ? 'rgba(255,255,255,0.1)'
                          : 'rgba(255,255,255,0.08)',
                      border:
                        focusedRow === rowIndex
                          ? '1px solid rgba(255,255,255,0.2)'
                          : '1px solid rgba(255,255,255,0.05)',
                      borderRadius: '12px',
                    }}
                  >
                    <div className="w-10 h-10 rounded-[8px] bg-white flex items-center justify-center shrink-0 overflow-hidden p-1">
                      <img
                        src={channel.logo}
                        alt={channel.name}
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <h2 className="font-medium text-[15px] truncate leading-tight">
                      {channel.name}
                    </h2>
                  </article>
                ))}
              </div>

              {/* Coluna dos programas */}
              <div className="flex-1 relative ml-5 flex flex-col gap-3">
                {channels.map((channel, rowIndex) => (
                  <div key={channel.id} className="h-[76px] relative w-full flex gap-2">
                    {[channel.currentProgram, ...channel.nextPrograms]
                      .slice(0, 3)
                      .map((program, colIndex) => (
                        <div
                          key={program.id}
                          onClick={() => setSelectedProgram(program)}
                          className="flex-1 rounded-2xl p-3.5 flex flex-col justify-center backdrop-blur-md hover:bg-white/15 transition-colors cursor-pointer border"
                          style={{
                            background:
                              rowIndex === focusedRow && colIndex === focusedCol
                                ? 'linear-gradient(135deg, #A855F7, #D946EF)'
                                : 'rgba(255,255,255,0.08)',
                            border:
                              rowIndex === focusedRow && colIndex === focusedCol
                                ? '1px solid rgba(255,255,255,0.3)'
                                : '1px solid rgba(255,255,255,0.05)',
                            borderRadius: '12px',
                            boxShadow:
                              rowIndex === focusedRow && colIndex === focusedCol
                                ? '0 0 40px rgba(217,70,239,0.6)'
                                : undefined,
                          }}
                        >
                          <h3 className="font-medium text-[15px] truncate">{program.title}</h3>
                          <p className="text-xs text-white/60 mt-0.5">{program.time}</p>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </motion.div>

      <PitoProgramDetailsModal program={selectedProgram} onClose={() => setSelectedProgram(null)} />
    </>
  );
};
