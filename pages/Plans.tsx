import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAllPlans, selectPlanLocally, Plan } from '../services/supabaseService';
import { useSpatialNav } from '../hooks/useSpatialNavigation';
import { playNavigateSound, playSelectSound } from '../utils/soundEffects';
import { Crown, Check, Zap, Star, Shield } from 'lucide-react';

interface PlansProps {
  onPlanSelected: (plan: Plan) => void;
}

const Plans: React.FC<PlansProps> = ({ onPlanSelected }) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedIndex, setFocusedIndex] = useState(1); // Foco no plano do meio (recomendado)
  const [selecting, setSelecting] = useState(false);
  const cardsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const { setPosition: _setPosition } = useSpatialNav();

  useEffect(() => {
    const load = async () => {
      const data = await getAllPlans();
      setPlans(data);
      setLoading(false);
    };
    load();
  }, []);

  // Focar no card correto quando plans carregam
  useEffect(() => {
    if (!loading && plans.length > 0) {
      const idx = Math.min(focusedIndex, plans.length - 1);
      cardsRef.current[idx]?.focus();
    }
  }, [loading, plans.length]);

  // D-Pad navigation handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (index > 0) {
            playNavigateSound();
            setFocusedIndex(index - 1);
            cardsRef.current[index - 1]?.focus();
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (index < plans.length - 1) {
            playNavigateSound();
            setFocusedIndex(index + 1);
            cardsRef.current[index + 1]?.focus();
          }
          break;
        case 'Enter':
          e.preventDefault();
          handleSelectPlan(plans[index]);
          break;
      }
    },
    [plans]
  );

  const handleSelectPlan = async (plan: Plan) => {
    if (selecting) return;
    setSelecting(true);
    playSelectSound();

    // Salvar plano localmente como ativo (sem validação de pagamento)
    selectPlanLocally(plan);

    // Animação de confirmação
    await new Promise((r) => setTimeout(r, 600));
    onPlanSelected(plan);
  };

  const getPlanIcon = (index: number) => {
    const icons = [Shield, Star, Crown];
    const Icon = icons[Math.min(index, icons.length - 1)];
    return <Icon className="w-8 h-8" />;
  };

  const getPlanGradient = (index: number): string => {
    const gradients = [
      'from-zinc-600 to-zinc-800', // Básico
      'from-[#A855F7] to-[#6D28D9]', // Padrão (destaque)
      'from-amber-500 to-amber-700', // Premium
    ];
    return gradients[Math.min(index, gradients.length - 1)];
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-[#A855F7] border-t-transparent rounded-full animate-spin" />
          <p className="text-white/40 text-sm uppercase tracking-widest">Carregando planos...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-transparent flex flex-col items-center justify-center px-8"
      data-nav-row="0"
    >
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Zap className="w-8 h-8 text-[#A855F7]" />
          <h1 className="text-4xl font-black text-white tracking-tight">Escolha seu Plano</h1>
        </div>
        <p className="text-white/40 text-lg">
          Use as setas ← → para navegar e Enter para selecionar
        </p>
      </div>

      {/* Plan Cards */}
      <div className="flex gap-6 items-stretch max-w-5xl w-full justify-center">
        {plans.map((plan, index) => {
          const isFocused = focusedIndex === index;
          const isRecommended = index === 1; // Plano do meio é o recomendado

          return (
            <button
              key={plan.id}
              ref={(el) => {
                cardsRef.current[index] = el;
              }}
              data-nav-item
              data-nav-col={index}
              tabIndex={0}
              onClick={() => handleSelectPlan(plan)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              onFocus={() => setFocusedIndex(index)}
              className={`
                relative flex-1 max-w-[320px] rounded-3xl p-8 flex flex-col items-center text-center
                transition-all duration-300 ease-out outline-none cursor-pointer
                ${
                  isFocused
                    ? 'scale-105 shadow-2xl shadow-[#A855F7]/30 ring-2 ring-white/35 bg-white/10'
                    : 'scale-95 opacity-60 bg-white/5 hover:bg-white/8'
                }
                ${selecting ? 'pointer-events-none' : ''}
              `}
            >
              {/* Badge recomendado */}
              {isRecommended && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#A855F7] text-white text-xs font-bold uppercase tracking-widest px-5 py-1.5 rounded-full shadow-lg">
                  Recomendado
                </div>
              )}

              {/* Ícone */}
              <div
                className={`w-16 h-16 rounded-2xl bg-linear-to-br ${getPlanGradient(index)} flex items-center justify-center text-white mb-6 shadow-lg`}
              >
                {getPlanIcon(index)}
              </div>

              {/* Nome */}
              <h2 className="text-2xl font-black text-white mb-2">{plan.name}</h2>

              {/* Preço */}
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-white/40 text-lg">R$</span>
                <span className="text-5xl font-black text-white">
                  {plan.price?.toFixed(2).split('.')[0]}
                </span>
                <span className="text-white/40 text-lg">
                  ,{plan.price?.toFixed(2).split('.')[1]}/mês
                </span>
              </div>

              {/* Features */}
              <ul className="space-y-3 w-full text-left mb-8">
                {(plan.features || []).map((feature, fi) => (
                  <li key={fi} className="flex items-center gap-3 text-white/70 text-sm">
                    <Check className="w-4 h-4 text-green-400 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {/* Botão Visual */}
              <div
                className={`
                w-full py-4 rounded-2xl font-bold text-lg tracking-wide transition-all
                ${
                  isFocused
                    ? 'bg-linear-to-r from-[#A855F7] to-[#7c3aed] text-white shadow-lg shadow-purple-900/40'
                    : 'bg-white/10 text-white/60'
                }
              `}
              >
                {selecting && isFocused ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Ativando...
                  </div>
                ) : (
                  'Selecionar'
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <p className="mt-10 text-white/20 text-xs uppercase tracking-widest">
        Acesso imediato • Sem compromisso • Cancele quando quiser
      </p>
    </div>
  );
};

export default Plans;
