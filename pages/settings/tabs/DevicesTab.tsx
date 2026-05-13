import React from 'react';
import { Device } from '../../../services/supabaseService';

interface DevicesTabProps {
  devices: Device[];
  currentPlan: any;
  handleAddDevice: () => void;
  handleRemoveDevice: (id: string) => void;
}

export const DevicesTab: React.FC<DevicesTabProps> = React.memo(
  ({ devices, currentPlan, handleAddDevice, handleRemoveDevice }) => {
    // Suporta tanto snake_case (DB) quanto camelCase (DEFAULT_PLANS)
    const deviceLimit: number = currentPlan?.device_limit ?? (currentPlan as any)?.deviceLimit ?? 3;

    return (
      <div className="w-full space-y-5 lg:space-y-7 animate-in fade-in slide-in-from-right-4 duration-400">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tight text-white">
              Aparelhos
            </h2>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40">
              {devices.length} de {deviceLimit} — {currentPlan?.name}
            </p>
          </div>
          <button
            onClick={handleAddDevice}
            disabled={devices.length >= deviceLimit}
            aria-disabled={devices.length >= deviceLimit}
            aria-label={
              devices.length >= deviceLimit
                ? 'Limite de aparelhos atingido'
                : 'Vincular novo aparelho'
            }
            className={`px-5 py-2.5 min-h-[44px] rounded-xl font-bold text-[9px] uppercase tracking-widest flex items-center gap-2 group shrink-0 transition-all duration-300
                        ${
                          devices.length >= deviceLimit
                            ? 'opacity-40 cursor-not-allowed bg-white/[0.03] text-white/30'
                            : 'text-violet-300 border border-violet-500/20 bg-violet-500/[0.06] hover:bg-violet-500/15 hover:border-violet-400/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60'
                        }`}
          >
            <div
              className={`w-5 h-5 rounded-lg flex items-center justify-center text-white shrink-0 transition-all
                        ${devices.length >= deviceLimit ? 'bg-zinc-700' : 'bg-violet-600/50 group-hover:bg-violet-500'}`}
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="4"
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
            Vincular
          </button>
        </div>

        {devices.length === 0 && (
          <div
            className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-10 text-center space-y-3"
            role="status"
          >
            <svg
              className="w-10 h-10 text-white/20 mx-auto"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm font-semibold text-white/40">Nenhum aparelho vinculado</p>
            <p className="text-xs text-white/25 font-light">
              Use o botão "Vincular" acima para adicionar um aparelho.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {devices.map((device, idx) => (
            <div
              key={device.id}
              className={`relative group rounded-2xl lg:rounded-[1.25rem] border backdrop-blur-2xl
                            transition-all duration-300 ease-out flex flex-col p-4 lg:p-5
                            shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)]
                            hover:bg-white/[0.07] hover:border-white/[0.14] hover:-translate-y-0.5
                            hover:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]
                            animate-in fade-in zoom-in-95 duration-400
                            ${
                              device.is_current_session
                                ? 'border-violet-500/25 bg-violet-500/[0.05]'
                                : 'border-white/[0.07] bg-white/[0.03]'
                            }`}
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              {/* Ambient glow for active device */}
              {device.is_current_session && (
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(139,92,246,0.1),transparent_70%)]" />
              )}

              <div className="relative flex items-center justify-between mb-3">
                <div
                  className={`w-10 h-10 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center shrink-0 transition-all
                                ${
                                  device.is_current_session
                                    ? 'bg-gradient-to-br from-violet-500/50 to-purple-700/40 text-white shadow-[0_4px_14px_rgba(139,92,246,0.25)]'
                                    : 'bg-white/[0.06] text-white/30 group-hover:text-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                                }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                      d={device.icon}
                    />
                  </svg>
                </div>
                {device.is_current_session && (
                  <span className="text-[7px] font-bold uppercase tracking-[0.25em] text-violet-400/80 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                    Ativo
                  </span>
                )}
              </div>

              <div className="relative">
                <h5 className="text-sm lg:text-[15px] font-semibold tracking-tight text-white/90">
                  {device.name}
                </h5>
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/15 mt-0.5">
                  {device.type}
                </p>
                <p
                  className={`mt-2.5 text-[11px] ${device.is_current_session ? 'text-violet-400/70 font-semibold' : 'text-white/25 font-light'}`}
                >
                  {device.is_current_session
                    ? 'Sessão atual'
                    : new Date(device.last_active).toLocaleDateString()}
                </p>
              </div>

              {!device.is_current_session && (
                <button
                  onClick={() => handleRemoveDevice(device.id)}
                  aria-label={`Encerrar sessão de ${device.name}`}
                  className="relative mt-3 py-2.5 min-h-[44px] rounded-lg font-bold text-[8px] uppercase tracking-widest text-white/40 hover:text-red-400/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 transition-colors"
                >
                  Encerrar Sessão
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
);
