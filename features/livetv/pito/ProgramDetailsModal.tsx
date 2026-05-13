import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, Info, Clock, Calendar } from 'lucide-react';
import { Program } from './types';

interface ProgramDetailsModalProps {
  program: Program | null;
  onClose: () => void;
}

export const PitoProgramDetailsModal: React.FC<ProgramDetailsModalProps> = ({
  program,
  onClose,
}) => {
  // startTime/endTime computados apenas quando program existe (evita crash)
  const startTime = program
    ? new Date(program.startTime).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  const endTime = program
    ? new Date(program.endTime).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <AnimatePresence>
      {program && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-2xl pito-glass-panel rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10 pito-vision-glow"
          >
            <div className="p-8 md:p-12 flex flex-col gap-8">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span
                      className="px-3 py-1 rounded-lg text-[10px] font-black text-white uppercase tracking-widest"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(124,58,237,0.8) 0%, rgba(219,39,119,0.8) 100%)',
                      }}
                    >
                      PROGRAMA
                    </span>
                    <div className="flex items-center gap-2 text-white/40 text-xs font-bold">
                      <Clock className="w-3 h-3" />
                      <span>
                        {startTime} - {endTime}
                      </span>
                    </div>
                  </div>
                  <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none mt-2">
                    {program.title}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors text-white/40 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Conteúdo */}
              <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-white/20 uppercase tracking-[0.2em] text-[10px] font-black">
                    <Info className="w-3 h-3" />
                    <span>SINOPSE</span>
                  </div>
                  <p className="text-white/60 text-lg leading-relaxed font-medium">
                    {program.description ||
                      'Nenhuma descrição disponível para este programa no momento.'}
                  </p>
                </div>

                {program.cast && program.cast.length > 0 && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-white/20 uppercase tracking-[0.2em] text-[10px] font-black">
                      <Users className="w-3 h-3" />
                      <span>ELENCO</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {program.cast.map((member, idx) => (
                        <div
                          key={idx}
                          className="px-4 py-2 bg-white/5 rounded-xl border border-white/5 text-sm font-bold text-white/80"
                        >
                          {member}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="flex items-center gap-4 mt-4">
                <button
                  className="flex-1 py-4 rounded-2xl text-white font-black uppercase tracking-widest shadow-xl hover:scale-[1.02] transition-transform"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(124,58,237,0.8) 0%, rgba(219,39,119,0.8) 100%)',
                  }}
                >
                  ASSISTIR AGORA
                </button>
                <button className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-white/60 transition-colors">
                  <Calendar className="w-6 h-6" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
