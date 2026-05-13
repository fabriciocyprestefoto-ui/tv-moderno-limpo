import React from 'react';
import { TiltCard } from '../components/TiltCard';

interface PlansSubViewProps {
  plans: any[];
  currentPlanId: string;
  setPendingPlanId: (id: string) => void;
  setCurrentSubView: (view: string | null) => void;
}

export const PlansSubView: React.FC<PlansSubViewProps> = ({
  plans,
  currentPlanId,
  setPendingPlanId,
  setCurrentSubView,
}) => {
  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-5 duration-500">
      <div className="flex items-center gap-6 mb-8">
        <button
          onClick={() => setCurrentSubView(null)}
          className="w-10 h-10 rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.07] transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="space-y-1">
          <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tight text-white">
            Escolha seu Plano
          </h2>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
            Ajuste sua experiência imersiva
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan, i) => (
          <TiltCard
            key={i}
            intensity={10}
            className="h-full"
            innerClassName={`rounded-[3rem]! border ${currentPlanId === plan.id ? 'border-violet-600 bg-violet-600/5 shadow-[0_0_40px_rgba(139,92,246,0.1)]' : 'border-white/[0.07] bg-white/[0.03]'} backdrop-blur-2xl p-10 flex flex-col gap-8`}
          >
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="text-3xl font-bold">{plan.name}</h4>
                {currentPlanId === plan.id && (
                  <span className="text-[8px] font-bold uppercase text-violet-400 tracking-widest px-2 py-1 bg-violet-600/10 rounded">
                    ATUAL
                  </span>
                )}
              </div>
              <p className="text-2xl font-light text-white/80">
                {plan.price}
                <span className="text-sm opacity-30">/mês</span>
              </p>
            </div>
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-3 text-sm font-bold text-white/60">
                <svg
                  className="w-4 h-4 text-violet-600"
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
                {plan.quality}
              </div>
              <div className="flex items-center gap-3 text-sm font-bold text-white/60">
                <svg
                  className="w-4 h-4 text-violet-600"
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
                {plan.screens}
              </div>
              {plan.id === 'premium' && (
                <div className="flex items-center gap-3 text-sm font-bold text-white/60">
                  <svg
                    className="w-4 h-4 text-violet-600"
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
                  Áudio Spatial Atmos
                </div>
              )}
            </div>
            <button
              disabled={currentPlanId === plan.id}
              onClick={() => {
                setPendingPlanId(plan.id);
                setCurrentSubView('checkout');
              }}
              className={`w-full py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all ${currentPlanId === plan.id ? 'bg-white/10 text-white/30 cursor-default' : 'bg-violet-600 hover:bg-violet-500 text-white hover:scale-105 shadow-xl'}`}
            >
              {currentPlanId === plan.id ? 'PLANO ATUAL' : 'SELECIONAR'}
            </button>
          </TiltCard>
        ))}
      </div>
    </div>
  );
};
