import React from 'react';
import { UserSettings, Device } from '../../../services/supabaseService';

interface OverviewTabProps {
  userSettings: UserSettings | null;
  currentPlanId: string;
  currentPlan: any;
  devices: Device[];
  cardNumber: string;
}

export const OverviewTab: React.FC<OverviewTabProps> = React.memo(
  ({ userSettings, currentPlanId, currentPlan, devices, cardNumber }) => {
    return (
      <div className="w-full space-y-5 lg:space-y-7 animate-in fade-in slide-in-from-right-4 duration-400">
        {/* Header — standardized */}
        <div className="space-y-1.5">
          <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tight text-white">
            Visão geral
          </h2>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
            Sua central de controle RED X
          </p>
        </div>

        {/* Profile card — visionOS floating glass */}
        <div className="relative overflow-hidden rounded-2xl lg:rounded-[1.5rem] border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl shadow-[0_4px_24px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]">
          {/* Ambient glow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_10%_20%,rgba(139,92,246,0.12),transparent_60%)]" />

          <div className="relative p-5 lg:p-7 xl:p-8">
            <div className="flex items-center gap-4 lg:gap-6 border-b border-white/[0.06] pb-5 lg:pb-7">
              {/* Avatar */}
              <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl bg-gradient-to-br from-violet-500/60 to-purple-800/50 flex items-center justify-center text-xl lg:text-2xl font-bold shadow-[0_8px_24px_rgba(139,92,246,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] text-white shrink-0">
                {userSettings?.name ? userSettings.name[0] : 'F'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg lg:text-xl xl:text-2xl font-bold tracking-tight truncate text-white">
                  {userSettings?.name || userSettings?.email || 'Carregando...'}
                </h3>
                <p className="text-white/40 font-light text-xs lg:text-sm truncate mt-0.5">
                  {userSettings?.email || '...'}
                </p>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  <span
                    className={`text-[8px] font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-lg border backdrop-blur-sm ${
                      currentPlanId === 'premium'
                        ? 'text-violet-300 bg-violet-500/10 border-violet-400/20'
                        : 'text-blue-300 bg-blue-500/10 border-blue-400/20'
                    }`}
                  >
                    Membro {currentPlan?.name}
                  </span>
                  <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-white/30 bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">
                    Ativo há 2 anos
                  </span>
                </div>
              </div>
            </div>

            {/* Info grid — visionOS sub-cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4 mt-5 lg:mt-7">
              {[
                {
                  label: 'Planos & Pagamentos',
                  value: currentPlan?.name,
                  details: [
                    `Próxima fatura: 12 de Jan, 2026`,
                    `Cartão •••• ${cardNumber.slice(-4)}`,
                  ],
                },
                {
                  label: 'Aparelhos Ligados',
                  value: `${devices.length} de ${currentPlan?.device_limit || 3} Dispositivos`,
                  details: [
                    'Vision Pro (Ativo)',
                    devices.length > 1 ? `e outros ${devices.length - 1}` : 'Nenhum outro',
                  ],
                },
                {
                  label: 'Preferências',
                  value: 'Português (Brasil)',
                  details: ['Legendas: Ativadas', `Qualidade: ${currentPlan?.quality || '—'}`],
                },
              ].map((card, i) => (
                <div
                  key={i}
                  className="rounded-xl lg:rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 lg:p-5 backdrop-blur-xl
                                    shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]
                                    hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-300 group"
                >
                  <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-white/20 mb-2.5">
                    {card.label}
                  </p>
                  <p className="font-semibold text-sm lg:text-base text-white/90 group-hover:text-white transition-colors">
                    {card.value}
                  </p>
                  {card.details.map((d, j) => (
                    <p key={j} className="text-[11px] text-white/35 mt-1 font-light">
                      {d}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
);
