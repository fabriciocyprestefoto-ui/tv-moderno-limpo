import React, { useState } from 'react';
import { TiltCard } from '../components/TiltCard';
import { VisionKeyboard } from '../components/VisionKeyboard';
import { addUserProfile, UserProfileDB } from '../../../services/supabaseService';
import { Baby } from 'lucide-react';

interface AddProfileSubViewProps {
  setCurrentSubView: (view: string | null) => void;
  setProfiles: React.Dispatch<React.SetStateAction<UserProfileDB[]>>;
  userId: string | null;
}

export const AddProfileSubView: React.FC<AddProfileSubViewProps> = ({
  setCurrentSubView,
  setProfiles,
  userId,
}) => {
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileIcon, setNewProfileIcon] = useState('bg-blue-600');
  const [isKidsProfile, setIsKidsProfile] = useState(false);

  const handleKeyClick = (key: string) => {
    setNewProfileName((p) => p + key);
  };

  const handleBackspace = () => {
    setNewProfileName((p) => p.slice(0, -1));
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-5 duration-500">
      <div className="flex items-center gap-6 mb-8">
        <button
          onClick={() => setCurrentSubView(null)}
          aria-label="Voltar para Perfis"
          className="w-10 h-10 rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 transition-all"
        >
          <svg
            className="w-6 h-6"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
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
            Adicionar Perfil
          </h2>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
            Nova identidade no ecossistema
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8">
          <div className="rounded-2xl lg:rounded-[1.25rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] p-12 space-y-12">
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/30 ml-4">
                  NOME DO PERFIL
                </p>
                <div className="w-full py-6 px-10 rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl text-2xl font-light h-20 flex items-center">
                  {newProfileName || 'Como devemos chamar você?'}
                </div>
              </div>

              <div className="flex items-center justify-between p-8 rounded-2xl bg-white/5 border border-white/5 relative overflow-hidden">
                <div className="flex items-center gap-6 relative z-10">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isKidsProfile ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}
                  >
                    <Baby size={28} />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold tracking-tight">Perfil Kids?</h4>
                    <p className="text-xs text-white/40 font-light">
                      Exibe apenas conteúdos recomendados para crianças.
                    </p>
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={isKidsProfile}
                  aria-label={isKidsProfile ? 'Desativar modo Kids' : 'Ativar modo Kids'}
                  onClick={() => setIsKidsProfile(!isKidsProfile)}
                  className={`w-16 h-8 rounded-full transition-all relative z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${isKidsProfile ? 'bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)]' : 'bg-white/10'}`}
                >
                  <div
                    className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all shadow-md ${isKidsProfile ? 'left-9' : 'left-1'}`}
                  ></div>
                </button>
                {isKidsProfile && (
                  <div className="absolute inset-0 bg-green-500/5 pointer-events-none" />
                )}
              </div>
            </div>

            <div className="space-y-6 mt-12">
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/30 ml-4">
                ESCOLHA UM ÍCONE ESPACIAL
              </p>
              <div className="flex flex-wrap gap-4">
                {[
                  'bg-blue-600',
                  'bg-violet-600',
                  'bg-purple-600',
                  'bg-green-600',
                  'bg-linear-to-tr from-yellow-400 via-violet-500 to-purple-600',
                  'bg-linear-to-br from-cyan-400 to-blue-600',
                ].map((color, i) => (
                  <button
                    key={i}
                    onClick={() => setNewProfileIcon(color)}
                    className={`w-16 h-16 rounded-2xl ${color} transition-all border-4 ${newProfileIcon === color ? 'border-white scale-110 shadow-2xl' : 'border-transparent opacity-40 hover:opacity-100 hover:scale-105'}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6 pt-8">
              <button
                onClick={() => setCurrentSubView(null)}
                className="flex-1 py-6 rounded-2xl font-bold text-[11px] uppercase tracking-widest border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl text-white/40 hover:text-white hover:bg-white/[0.07] transition-all"
              >
                CANCELAR
              </button>
              <button
                onClick={async () => {
                  if (!newProfileName || !userId) return;
                  const newProfile = await addUserProfile({
                    user_id: userId,
                    name: newProfileName,
                    avatar_color: newProfileIcon,
                    is_kids: isKidsProfile,
                  });
                  if (newProfile) setProfiles((prev) => [...prev, newProfile]);
                  setCurrentSubView(null);
                }}
                className="flex-1 py-6 rounded-2xl font-bold text-[11px] uppercase tracking-widest bg-violet-600 hover:bg-violet-500 text-white shadow-[0_20px_50px_rgba(139,92,246,0.3)] disabled:opacity-20 transition-all"
                disabled={!newProfileName}
              >
                SALVAR PERFIL
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="flex flex-col items-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/20 mb-8">
              PRÉVIA DO PERFIL
            </p>
            <TiltCard
              intensity={25}
              className="w-full max-w-70"
              innerClassName={`p-12! rounded-[4rem]! border border-white/10 thick-glass text-center space-y-6 flex flex-col items-center shadow-[0_20px_50px_rgba(139,92,246,0.3)]`}
            >
              <div
                className={`w-32 h-32 rounded-[2.5rem] ${newProfileIcon} flex items-center justify-center text-6xl font-bold text-white shadow-[0_20px_50px_rgba(139,92,246,0.3)] animate-float`}
                style={{ transform: 'translateZ(50px)' }}
              >
                {newProfileName ? newProfileName[0].toUpperCase() : '?'}
              </div>
              <div style={{ transform: 'translateZ(30px)' }}>
                <h3 className="text-3xl font-bold tracking-tighter truncate w-full px-4">
                  {newProfileName || 'Novo Perfil'}
                </h3>
                {isKidsProfile && (
                  <span className="inline-block mt-2 text-[8px] font-bold uppercase tracking-widest text-green-400 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">
                    Modo Kids Ativo
                  </span>
                )}
              </div>
            </TiltCard>
          </div>
        </div>
      </div>

      <div className="pt-10 animate-in slide-in-from-bottom-10 duration-1000">
        <VisionKeyboard onKeyClick={handleKeyClick} onBackspace={handleBackspace} />
      </div>
    </div>
  );
};
