import React, { useState } from 'react';
import { VisionKeyboard } from '../components/VisionKeyboard';

interface ParentalControlSubViewProps {
  setCurrentSubView: (view: string | null) => void;
  // If we need to persist to parent/server, we should add props or call API
  initialRating?: string;
  initialPin?: string;
}

export const ParentalControlSubView: React.FC<ParentalControlSubViewProps> = ({
  setCurrentSubView,
  initialRating = '14+',
  initialPin = '',
}) => {
  const [parentalPin, setParentalPin] = useState(initialPin);
  const [selectedParentalRating, setSelectedParentalRating] = useState(initialRating);

  const handleKeyClick = (key: string) => {
    if (parentalPin.length < 4 && /^\d+$/.test(key)) setParentalPin((p) => p + key);
  };

  const handleBackspace = () => {
    setParentalPin((p) => p.slice(0, -1));
  };

  const hashPin = async (pin: string): Promise<string> => {
    const data = new TextEncoder().encode(pin);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    return `sha256:${hash}`;
  };

  const handleSave = async () => {
    localStorage.setItem('redx_parental_rating', selectedParentalRating);
    localStorage.removeItem('redx_parental_pin');
    if (parentalPin.length === 4) {
      localStorage.setItem('redx_parental_pin_hash', await hashPin(parentalPin));
    } else {
      localStorage.removeItem('redx_parental_pin_hash');
    }
    setCurrentSubView(null);
  };

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-right-5 duration-500">
      <div className="flex items-center gap-6 mb-8">
        <button
          onClick={() => setCurrentSubView(null)}
          className="w-10 h-10 rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.07] transition-all"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="space-y-1">
          <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tight text-white">
            Controle Parental
          </h2>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
            Segurança para toda a família
          </p>
        </div>
      </div>

      <div className="w-full max-w-4xl mx-auto space-y-12">
        <div className="p-12 rounded-2xl lg:rounded-[1.25rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] space-y-12">
          <div className="space-y-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/30 ml-4">
              LIMITE DE CLASSIFICAÇÃO ETÁRIA
            </p>
            <div className="flex flex-wrap gap-4">
              {['L', '10+', '12+', '14+', '16+', '18+'].map((rating) => (
                <button
                  key={rating}
                  onClick={() => setSelectedParentalRating(rating)}
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold transition-all border-4 ${selectedParentalRating === rating ? 'bg-violet-600 border-violet-400/40 scale-110 shadow-2xl' : 'bg-white/5 border-transparent opacity-40 hover:opacity-100'}`}
                >
                  {rating}
                </button>
              ))}
            </div>
            <p className="text-xs text-white/40 font-light leading-relaxed italic">
              "Conteúdos acima de {selectedParentalRating} exigirão o PIN de acesso."
            </p>
          </div>

          <div className="pt-8 border-t border-white/5 space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/30 ml-4">
                PIN DE ACESSO
              </p>
              <span className="text-[8px] font-bold uppercase text-violet-400 tracking-widest">
                {parentalPin.length}/4 DÍGITOS
              </span>
            </div>
            <div className="flex gap-4 justify-center">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-12 h-16 rounded-2xl border flex items-center justify-center text-2xl font-bold transition-all ${parentalPin[i] ? 'bg-violet-600/20 border-violet-500 text-white scale-110' : 'bg-white/5 border-white/10 text-white/10'}`}
                >
                  {parentalPin[i] ? '•' : ''}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            className="w-full py-6 rounded-3xl font-bold text-[11px] uppercase tracking-widest bg-violet-600 hover:bg-violet-500 text-white shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] hover:scale-[1.02] transition-all border border-white/[0.07]"
          >
            SALVAR CONFIGURAÇÕES
          </button>
        </div>

        <div className="pt-4 animate-in slide-in-from-bottom-10 duration-700">
          <VisionKeyboard onKeyClick={handleKeyClick} onBackspace={handleBackspace} />
        </div>
      </div>
    </div>
  );
};
