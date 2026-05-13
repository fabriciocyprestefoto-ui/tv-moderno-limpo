import React, { useState } from 'react';
import { TiltCard } from '../components/TiltCard';
import { UserSettings, updateSubscription } from '../../../services/supabaseService';

interface CheckoutSubViewProps {
  userSettings: UserSettings | null;
  pendingPlan: any;
  pendingPlanId: string;
  cardNumber: string;
  setCurrentSubView: (view: string) => void;
  setCurrentPlanId: (id: string) => void;
}

export const CheckoutSubView: React.FC<CheckoutSubViewProps> = ({
  userSettings,
  pendingPlan,
  pendingPlanId,
  cardNumber,
  setCurrentSubView,
  setCurrentPlanId,
}) => {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-5 duration-500">
      <div className="flex items-center gap-6 mb-8">
        <button
          onClick={() => setCurrentSubView('change-plan')}
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
            Finalizar Plano
          </h2>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
            Quase lá, {userSettings?.name || 'Fabricio'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-7">
          <div className="rounded-2xl lg:rounded-[1.25rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] p-12 space-y-10">
            <div className="flex items-center gap-8">
              <div
                className={`w-20 h-20 rounded-3xl ${pendingPlan?.color || 'bg-zinc-600'} flex items-center justify-center text-white shadow-[0_8px_32px_rgba(0,0,0,0.4)]`}
              >
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-3xl font-bold">Plano {pendingPlan?.name}</h3>
                <p className="text-white/40 font-light">
                  Upgrade para experiência {pendingPlan?.quality}
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-10 border-t border-white/5">
              <div className="flex justify-between items-center text-lg">
                <span className="text-white/30">Valor mensal</span>
                <span className="font-bold">{pendingPlan?.price}</span>
              </div>
              <div className="flex justify-between items-center text-lg">
                <span className="text-white/30">Taxa de processamento</span>
                <span className="font-bold">R$ 0,00</span>
              </div>
              <div className="flex justify-between items-center text-2xl pt-4 border-t border-white/5">
                <span className="font-bold tracking-tight">TOTAL</span>
                <span className="font-bold text-violet-400">{pendingPlan?.price}</span>
              </div>
            </div>

            <div className="space-y-4 pt-10">
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/30">
                COBRAR EM
              </p>
              <div className="p-6 rounded-2xl flex justify-between items-center border border-white/[0.07] bg-white/[0.04] backdrop-blur-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-8 rounded bg-zinc-800 border border-white/10 flex items-center justify-center font-bold italic text-[10px]">
                    VISA
                  </div>
                  <span className="font-bold tracking-widest">{cardNumber.slice(-9)}</span>
                </div>
                <button
                  onClick={() => setCurrentSubView('payment-method')}
                  className="text-[9px] font-bold text-white/30 hover:text-white uppercase tracking-widest"
                >
                  ALTERAR
                </button>
              </div>
            </div>

            <button
              disabled={confirming}
              onClick={async () => {
                setConfirming(true);
                // Persiste no banco antes de redirecionar
                await updateSubscription(pendingPlanId);
                setCurrentPlanId(pendingPlanId);
                setConfirming(false);
                setCurrentSubView('plan-success');
              }}
              className="w-full py-6 rounded-3xl font-bold text-xs uppercase tracking-widest bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:scale-100 text-white shadow-[0_20px_50px_rgba(139,92,246,0.3)] hover:scale-[1.02] transition-all"
            >
              {confirming ? 'PROCESSANDO...' : 'CONFIRMAR NOVA ASSINATURA'}
            </button>
            <p className="text-center text-[9px] font-light text-white/20 italic">
              Ao confirmar, você aceita os termos de uso Spatial da RED X.
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-8">
          <TiltCard
            intensity={15}
            innerClassName="rounded-[3rem]! border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl p-10 space-y-6"
          >
            <h4 className="text-xl font-bold tracking-tight">O que você ganha:</h4>
            <div className="space-y-4">
              {pendingPlan?.features?.map((f: string, i: number) => (
                <div key={i} className="flex gap-4 items-start">
                  <svg
                    className="w-5 h-5 text-violet-600 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="4"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-sm font-light text-white/70">{f}</span>
                </div>
              ))}
            </div>
          </TiltCard>
        </div>
      </div>
    </div>
  );
};
