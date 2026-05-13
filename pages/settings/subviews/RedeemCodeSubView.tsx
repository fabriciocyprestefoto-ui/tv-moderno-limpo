import React, { useState } from 'react';
import { VisionKeyboard } from '../components/VisionKeyboard';
import { supabase } from '../../../services/supabaseService';
import { updateSubscription } from '../../../services/supabaseService';

interface RedeemCodeSubViewProps {
  setCurrentSubView: (view: string | null) => void;
}

export const RedeemCodeSubView: React.FC<RedeemCodeSubViewProps> = ({ setCurrentSubView }) => {
  const [promoCode, setPromoCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleKeyClick = (key: string) => {
    // Auto-insere hífens: XXXX-XXXX-XXXX
    setPromoCode((p) => {
      const raw = (p + key).replace(/-/g, '');
      if (raw.length > 12) return p;
      const parts = raw.match(/.{1,4}/g) || [];
      return parts.join('-');
    });
  };

  const handleBackspace = () => {
    setPromoCode((p) => {
      const raw = p.replace(/-/g, '');
      const trimmed = raw.slice(0, -1);
      const parts = trimmed.match(/.{1,4}/g) || [];
      return parts.join('-');
    });
  };

  const handleRedeem = async () => {
    setErrorMsg('');
    const code = promoCode.replace(/-/g, '').toUpperCase();
    if (code.length < 8) {
      setErrorMsg('Código muito curto. Verifique e tente novamente.');
      return;
    }

    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Busca o código no banco
      const { data: codeData, error } = await supabase
        .from('access_codes')
        .select('*')
        .eq('code', promoCode.toUpperCase())
        .eq('used', false)
        .maybeSingle();

      if (error || !codeData) {
        setErrorMsg('Código inválido ou já utilizado.');
        setIsLoading(false);
        return;
      }

      // Verifica se expirou
      if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
        setErrorMsg('Este código expirou.');
        setIsLoading(false);
        return;
      }

      // Marca como utilizado
      const { error: updateErr } = await supabase
        .from('access_codes')
        .update({
          used: true,
          used_by: user?.id ?? null,
          used_at: new Date().toISOString(),
        })
        .eq('id', codeData.id);

      if (updateErr) {
        setErrorMsg('Erro ao resgatar código. Tente novamente.');
        setIsLoading(false);
        return;
      }

      // Se o código está associado a um plano, atualiza a assinatura
      if (codeData.plan_id && user) {
        await updateSubscription(codeData.plan_id);
      }

      setCurrentSubView('plan-success');
    } catch {
      setErrorMsg('Erro inesperado. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const rawLen = promoCode.replace(/-/g, '').length;

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
            Resgatar Código
          </h2>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
            Cartão presente ou voucher promocional
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto flex flex-col items-center space-y-16 mt-[10vh]">
        <div className="w-full rounded-2xl lg:rounded-[1.25rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] p-12 md:p-20 text-center space-y-10 overflow-hidden relative group transition-all hover:scale-[1.01] duration-500">
          <div className="absolute inset-0 bg-violet-600/5 opacity-0 group-hover:opacity-100 transition-opacity blur-[100px]" />

          <div className="space-y-4 relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.8em] text-white/20">
              INSIRA SEU CÓDIGO SPATIAL
            </p>
            <div className="w-full py-8 text-4xl md:text-7xl font-bold tracking-[0.3em] uppercase text-white outline-none bg-transparent text-center border-b-2 border-white/10 h-24 flex items-center justify-center">
              {promoCode || 'XXXX-XXXX-XXXX'}
            </div>
            {errorMsg && (
              <p className="text-red-400 text-sm font-medium animate-in fade-in">{errorMsg}</p>
            )}
          </div>

          <div className="relative z-10">
            <button
              disabled={rawLen < 8 || isLoading}
              onClick={handleRedeem}
              className="px-20 py-8 rounded-full font-bold text-xs uppercase tracking-[0.5em] bg-violet-600 hover:bg-violet-500 text-white shadow-[0_20px_80px_rgba(139,92,246,0.4)] hover:scale-110 disabled:opacity-20 disabled:scale-100 disabled:shadow-none transition-all"
            >
              {isLoading ? 'VALIDANDO...' : 'RESGATAR AGORA'}
            </button>
          </div>
          <p className="text-[10px] text-white/20 uppercase tracking-widest font-light italic">
            Válido para assinaturas Standard e Premium Vision.
          </p>
        </div>

        <div className="w-full animate-in slide-in-from-bottom-10 duration-1000">
          <VisionKeyboard onKeyClick={handleKeyClick} onBackspace={handleBackspace} />
        </div>
      </div>
    </div>
  );
};
