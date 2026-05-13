import React from 'react';

interface SubscriptionTabProps {
  currentPlan: any;
  currentPlanId: string;
  setCurrentSubView: (view: string) => void;
  cardNumber: string;
  cardExpiry: string;
}

export const SubscriptionTab: React.FC<SubscriptionTabProps> = React.memo(
  ({ currentPlan, currentPlanId, setCurrentSubView, cardNumber, cardExpiry }) => {
    return (
      <div className="w-full space-y-5 lg:space-y-7 animate-in fade-in slide-in-from-right-4 duration-400">
        <div className="space-y-1.5">
          <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tight text-white">
            Assinatura
          </h2>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
            Seu portal de benefícios ilimitados
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch">
          {/* Plan card */}
          <div className="lg:col-span-7 flex">
            <div
              className={`flex-1 flex flex-col rounded-2xl lg:rounded-[1.5rem] border overflow-hidden backdrop-blur-2xl
                        ${
                          currentPlanId === 'premium'
                            ? 'border-violet-500/20 bg-violet-500/[0.04]'
                            : 'border-white/[0.08] bg-white/[0.03]'
                        }
                        shadow-[0_4px_24px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]`}
            >
              <div className="p-5 lg:p-7 space-y-4 lg:space-y-5 flex-1">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg lg:text-xl font-bold tracking-tight mb-1.5">
                      Plano {currentPlan?.name}
                    </h3>
                    <p className="text-xs lg:text-sm text-white/50 font-light leading-relaxed">
                      Qualidade {currentPlan?.quality} e streaming em até {currentPlan?.screens}.
                    </p>
                  </div>
                  <div
                    className={`px-3 py-1 rounded-lg text-[8px] font-bold uppercase tracking-widest shrink-0
                                    ${
                                      currentPlanId === 'premium'
                                        ? 'bg-violet-500/20 text-violet-300 border border-violet-400/20'
                                        : 'bg-white/[0.06] text-white/50 border border-white/[0.08]'
                                    }`}
                  >
                    Ativo
                  </div>
                </div>
                <div className="space-y-2 mt-3">
                  {currentPlan?.features?.map((feat: string, i: number) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 text-xs lg:text-sm font-medium text-white/80"
                    >
                      <svg
                        className="w-4 h-4 shrink-0 text-violet-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="3"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {feat}
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-5 lg:px-7 py-4 lg:py-5 bg-white/[0.03] flex items-center justify-between gap-3 border-t border-white/[0.06]">
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-white/25">
                    Próxima fatura
                  </p>
                  <p className="text-sm lg:text-base font-bold mt-0.5">12 de Jan, 2026</p>
                </div>
                <button
                  onClick={() => setCurrentSubView('change-plan')}
                  className="px-5 py-2.5 rounded-xl font-bold text-[9px] uppercase tracking-[0.15em] transition-all duration-300
                                    text-violet-300 border border-violet-500/20 bg-violet-500/[0.06]
                                    hover:bg-violet-500/15 hover:border-violet-400/40 hover:text-white
                                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40
                                    shrink-0"
                >
                  Alterar Plano
                </button>
              </div>
            </div>
          </div>

          {/* Side cards */}
          <div className="lg:col-span-5 flex flex-col gap-4 lg:gap-5">
            {/* Payment method */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Gerenciar método de pagamento"
              onClick={() => setCurrentSubView('payment-method')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setCurrentSubView('payment-method');
                }
              }}
              className="cursor-pointer group rounded-2xl lg:rounded-[1.25rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl
                            p-4 lg:p-5 transition-all duration-300
                            shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)]
                            hover:bg-white/[0.07] hover:border-white/[0.14] hover:-translate-y-0.5
                            hover:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
            >
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/25">
                  Método de Pagamento
                </h4>
                <svg
                  className="w-3.5 h-3.5 text-white/10 group-hover:text-white/40 transition-all duration-300 group-hover:translate-x-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center font-bold italic text-[10px] tracking-tighter shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  VISA
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm tracking-widest truncate text-white/80">
                    {cardNumber.slice(-9)}
                  </p>
                  <p className="text-[8px] text-white/25 uppercase tracking-[0.15em]">
                    Expira {cardExpiry}
                  </p>
                </div>
              </div>
            </div>

            {/* Redeem code */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Resgatar código de presente"
              onClick={() => setCurrentSubView('redeem-code')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setCurrentSubView('redeem-code');
                }
              }}
              className="cursor-pointer group rounded-2xl lg:rounded-[1.25rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl
                            p-4 lg:p-5 transition-all duration-300
                            shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)]
                            hover:bg-white/[0.07] hover:border-white/[0.14] hover:-translate-y-0.5
                            hover:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
            >
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/25">
                  Resgatar Código
                </h4>
                <svg
                  className="w-3.5 h-3.5 text-white/10 group-hover:text-white/40 transition-all duration-300 group-hover:translate-x-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
              <button
                className="w-full py-3 rounded-xl font-bold text-[9px] uppercase tracking-widest
                            bg-white/[0.06] hover:bg-white/[0.1] transition-all text-white/70 border border-white/[0.06]
                            shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
              >
                Adicionar Cartão Presente
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
