import React from 'react';

// PlanSuccessSubView for "Portal Atualizado!"
export const PlanSuccessSubView: React.FC<{
  currentPlan: any;
  setCurrentSubView: (view: string | null) => void;
  setActiveTab: (tab: string) => void;
}> = ({ currentPlan, setCurrentSubView, setActiveTab }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-12 animate-in zoom-in-95 duration-700">
      <div className="relative">
        <div className="absolute inset-0 bg-violet-600/30 blur-[100px] rounded-full animate-pulse"></div>
        <div className="w-32 h-32 rounded-full bg-violet-600 flex items-center justify-center text-white shadow-[0_0_60px_rgba(139,92,246,0.4)] border-4 border-white/20 relative z-10 animate-bounce">
          <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
      <div className="space-y-4">
        <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tight text-white">
          Portal Atualizado!
        </h2>
        <p className="text-xl text-white/60 font-light max-w-lg mx-auto">
          Sua experiência RED X foi processada com sucesso. Aproveite o multiverso imersivo.
        </p>
      </div>
      <div className="rounded-2xl lg:rounded-[1.25rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] p-8 w-full max-w-md">
        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/20 mb-4">
          DETALHES DA TRANSAÇÃO
        </p>
        <div className="flex justify-between items-center py-3 border-b border-white/5">
          <span className="text-white/40 font-light">Assinatura</span>
          <span className="font-bold">{currentPlan?.name}</span>
        </div>
        <div className="flex justify-between items-center py-3">
          <span className="text-white/40 font-light">Status</span>
          <span className="text-green-500 font-bold uppercase text-[10px]">ATIVO AGORA</span>
        </div>
      </div>
      <button
        onClick={() => {
          setCurrentSubView(null);
          setActiveTab('subscription');
        }}
        className="px-16 py-6 rounded-3xl font-bold text-xs uppercase tracking-widest bg-violet-600 hover:bg-violet-500 text-white shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:scale-110 transition-all"
      >
        VOLTAR AO PAINEL
      </button>
    </div>
  );
};
