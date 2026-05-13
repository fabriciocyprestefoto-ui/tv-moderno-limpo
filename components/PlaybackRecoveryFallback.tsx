import React, { useEffect, useMemo, useState } from 'react';
import {
  canAttemptChunkRecovery,
  hardRefreshAfterChunkError,
  isLikelyChunkError,
} from '../utils/chunkRecovery';

interface PlaybackRecoveryFallbackProps {
  contextName: string;
  error?: Error;
  onGoSafe?: () => void;
}

export const PlaybackRecoveryFallback: React.FC<PlaybackRecoveryFallbackProps> = ({
  contextName,
  error,
  onGoSafe,
}) => {
  const [recovering, setRecovering] = useState(false);
  const chunkError = useMemo(() => isLikelyChunkError(error), [error]);

  useEffect(() => {
    if (!chunkError || !canAttemptChunkRecovery()) return;
    setRecovering(true);
    void hardRefreshAfterChunkError(contextName);
  }, [chunkError, contextName]);

  return (
    <div className="redx-app-surface fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-white">
      <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-white/80 text-sm font-semibold mb-2">Falha em {contextName}</p>
      <p className="text-white/55 text-xs font-bold uppercase tracking-widest text-center max-w-md">
        {recovering
          ? 'Atualizando o app para recuperar módulos...'
          : chunkError
            ? 'Detectamos erro de atualização. Recarregue para sincronizar o app.'
            : 'Falha temporária de reprodução. Tente atualizar o app ou voltar em segurança.'}
      </p>

      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => {
            setRecovering(true);
            void hardRefreshAfterChunkError(contextName);
          }}
          className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 font-bold"
        >
          Atualizar app
        </button>
        {onGoSafe && (
          <button
            type="button"
            onClick={onGoSafe}
            className="px-5 py-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 font-bold"
          >
            Voltar em segurança
          </button>
        )}
      </div>
    </div>
  );
};
