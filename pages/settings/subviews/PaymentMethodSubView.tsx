import React, { useState } from 'react';
import { TiltCard } from '../components/TiltCard';
import { VisionKeyboard } from '../components/VisionKeyboard';

interface PaymentMethodSubViewProps {
  setCurrentSubView: (view: string | null) => void;
  cardNumber: string;
  setCardNumber: React.Dispatch<React.SetStateAction<string>>;
  cardHolder: string;
  setCardHolder: React.Dispatch<React.SetStateAction<string>>;
  cardExpiry: string;
  setCardExpiry: React.Dispatch<React.SetStateAction<string>>;
}

export const PaymentMethodSubView: React.FC<PaymentMethodSubViewProps> = ({
  setCurrentSubView,
  cardNumber,
  setCardNumber,
  cardHolder,
  setCardHolder,
  cardExpiry,
  setCardExpiry,
}) => {
  const [isEditingCard, setIsEditingCard] = useState(false);
  const [focusedField, setFocusedField] = useState<'number' | 'holder' | 'expiry'>('number');

  const handleKeyClick = (key: string) => {
    if (focusedField === 'number') setCardNumber((p) => p + key);
    else if (focusedField === 'holder') setCardHolder((p) => p + key);
    else if (focusedField === 'expiry') setCardExpiry((p) => p + key);
  };

  const handleBackspace = () => {
    if (focusedField === 'number') setCardNumber((p) => p.slice(0, -1));
    else if (focusedField === 'holder') setCardHolder((p) => p.slice(0, -1));
    else if (focusedField === 'expiry') setCardExpiry((p) => p.slice(0, -1));
  };

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-right-5 duration-500">
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
            Método de Pagamento
          </h2>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
            Cartões vinculados ao portal
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-6 space-y-8">
          <TiltCard
            intensity={20}
            className="w-full h-64"
            innerClassName="rounded-[2.5rem]! bg-linear-to-br! from-blue-900 to-indigo-950 p-10 flex flex-col justify-between shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/20 overflow-hidden relative group"
          >
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
            <div className="flex justify-between items-start relative z-10">
              <div className="w-14 h-10 rounded-lg bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center">
                <div className="w-8 h-6 bg-linear-to-r from-yellow-600 to-yellow-400 rounded-sm"></div>
              </div>
              <span className="font-bold italic text-2xl tracking-tighter">VISA</span>
            </div>
            <div className="space-y-6 relative z-10">
              <p className="text-2xl md:text-3xl font-bold tracking-[0.2em]">
                {cardNumber || '•••• •••• •••• ••••'}
              </p>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-white/40">
                    TITULAR
                  </p>
                  <p className="font-bold text-sm tracking-widest">
                    {cardHolder || 'NOME NO CARTÃO'}
                  </p>
                </div>
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-white/40">
                    VALIDADE
                  </p>
                  <p className="font-bold text-sm">{cardExpiry || 'MM/AA'}</p>
                </div>
              </div>
            </div>
          </TiltCard>

          <div className="rounded-2xl lg:rounded-[1.25rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] p-8 space-y-4">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/20">
              Ações Rápidas
            </h4>
            <button
              onClick={() => {
                setIsEditingCard(true);
                setFocusedField('number');
              }}
              className="w-full py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest border border-white/[0.07] bg-white/[0.04] backdrop-blur-2xl hover:bg-white/[0.07] hover:text-violet-400 transition-all"
            >
              Substituir Cartão Atual
            </button>
            <button className="w-full py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest border border-white/[0.07] bg-white/[0.04] backdrop-blur-2xl text-white/20">
              Remover Método
            </button>
          </div>
        </div>

        <div className="lg:col-span-6 space-y-8">
          <div
            className={`rounded-2xl lg:rounded-[1.25rem] border ${isEditingCard ? 'border-violet-600/40 shadow-2xl' : 'border-white/[0.07] opacity-50'} bg-white/[0.03] backdrop-blur-2xl shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] p-10 transition-all`}
          >
            <h3 className="text-xl font-bold tracking-tight mb-8">Informações do Cartão</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-[9px] font-bold uppercase text-white/30 ml-4">
                  NÚMERO DO CARTÃO
                </p>
                <div
                  onClick={() => isEditingCard && setFocusedField('number')}
                  className={`w-full py-4 px-6 rounded-2xl border ${focusedField === 'number' && isEditingCard ? 'border-white/35 bg-white/10' : 'border-white/[0.07]'} bg-white/[0.04] backdrop-blur-2xl font-bold tracking-widest h-14 flex items-center`}
                >
                  {cardNumber || 'Digite o número'}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[9px] font-bold uppercase text-white/30 ml-4">TITULAR</p>
                <div
                  onClick={() => isEditingCard && setFocusedField('holder')}
                  className={`w-full py-4 px-6 rounded-2xl border ${focusedField === 'holder' && isEditingCard ? 'border-white/35 bg-white/10' : 'border-white/[0.07]'} bg-white/[0.04] backdrop-blur-2xl font-bold h-14 flex items-center`}
                >
                  {cardHolder || 'Nome impresso'}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-[9px] font-bold uppercase text-white/30 ml-4">VALIDADE</p>
                  <div
                    onClick={() => isEditingCard && setFocusedField('expiry')}
                    className={`w-full py-4 px-6 rounded-2xl border ${focusedField === 'expiry' && isEditingCard ? 'border-white/35 bg-white/10' : 'border-white/[0.07]'} bg-white/[0.04] backdrop-blur-2xl font-bold h-14 flex items-center`}
                  >
                    {cardExpiry || 'MM/AA'}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[9px] font-bold uppercase text-white/30 ml-4">CVV</p>
                  <div className="w-full py-4 px-6 rounded-2xl border border-white/[0.07] bg-white/[0.04] backdrop-blur-2xl font-bold h-14 flex items-center">
                    •••
                  </div>
                </div>
              </div>
            </div>
            <button
              disabled={!isEditingCard}
              onClick={() => {
                setIsEditingCard(false);
                setCurrentSubView(null);
              }}
              className="w-full mt-10 py-5 rounded-3xl font-bold text-[10px] uppercase tracking-widest bg-violet-600 hover:bg-violet-500 text-white shadow-[0_8px_32px_rgba(0,0,0,0.4)] disabled:opacity-20 transition-all"
            >
              SALVAR NOVO CARTÃO
            </button>
          </div>
        </div>
      </div>

      <div className="animate-in slide-in-from-bottom-10 duration-1000">
        <VisionKeyboard onKeyClick={handleKeyClick} onBackspace={handleBackspace} />
      </div>
    </div>
  );
};
