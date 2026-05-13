/**
 * features/livetv/components/EPGPanel.tsx
 * Painel de Guia Eletrônico de Programação (EPG)
 */
import React, { memo } from 'react';
import { Channel } from '@/types';
import { getCurrentProgrammeCached, getNextProgrammeCached } from '../services/epgFacade';

interface EPGPanelProps {
  selectedChannel: Channel;
  epgReady: boolean;
  setShowChannelGuide: (v: boolean) => void;
  focusedButtonIndex: number;
}

const EPGPanel: React.FC<EPGPanelProps> = ({
  selectedChannel,
  epgReady,
  setShowChannelGuide: _setShowChannelGuide,
  focusedButtonIndex,
}) => {
  const chName = selectedChannel.name || '';
  const current = epgReady ? getCurrentProgrammeCached(chName) : null;
  const next = epgReady ? getNextProgrammeCached(chName) : null;

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Channel Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
          {selectedChannel.logo ? (
            <img src={selectedChannel.logo} alt={chName} className="w-full h-full object-contain" />
          ) : (
            <span className="text-2xl font-black text-white/20">
              {chName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <h2 className="text-2xl font-black">{chName}</h2>
          <p className="text-sm text-white/50">{selectedChannel.category || 'Canal'}</p>
        </div>
      </div>

      {/* Current Programme */}
      <div className="rounded-2xl border border-[rgba(196,164,255,0.15)] bg-white/4 p-6 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest bg-red-600 text-white">
            AO VIVO
          </span>
          <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">
            Agora
          </span>
        </div>
        {current ? (
          <div>
            <p className="text-lg font-bold">{current.title}</p>
            {current.description && (
              <p className="text-sm text-white/60 mt-1">{current.description}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-white/50">Programação não disponível</p>
        )}
      </div>

      {/* Next Programme */}
      <div className="rounded-2xl border border-white/10 bg-white/3 p-6 mb-6">
        <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3 block">
          A Seguir
        </span>
        {next ? (
          <div>
            <p className="text-lg font-bold text-white/80">{next.title}</p>
            {next.description && <p className="text-sm text-white/50 mt-1">{next.description}</p>}
          </div>
        ) : (
          <p className="text-sm text-white/40">Sem informações</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          data-epg-button="0"
          onClick={() => {
            /* Guia Completo — futuro */
          }}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            focusedButtonIndex === 0
              ? 'bg-[rgba(109,40,217,0.4)] border border-[rgba(196,164,255,0.5)] text-white shadow-[0_4px_18px_rgba(76,29,149,0.3)]'
              : 'bg-white/5 border border-white/10 text-white/60 hover:text-white/80'
          }`}
        >
          Guia Completo
        </button>
        <button
          data-epg-button="1"
          onClick={() => {
            /* Qualidade — futuro */
          }}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            focusedButtonIndex === 1
              ? 'bg-[rgba(109,40,217,0.4)] border border-[rgba(196,164,255,0.5)] text-white shadow-[0_4px_18px_rgba(76,29,149,0.3)]'
              : 'bg-white/5 border border-white/10 text-white/60 hover:text-white/80'
          }`}
        >
          Qualidade
        </button>
      </div>
    </div>
  );
};

export default memo(EPGPanel);
