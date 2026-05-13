import React from 'react';
import { SettingsCard } from '../components/SettingsCard';
import { UserProfileDB } from '../../../services/supabaseService';

interface ProfilesTabProps {
  profiles: UserProfileDB[];
  setCurrentSubView: (view: string) => void;
  prepareAddProfile: () => void;
}

export const ProfilesTab: React.FC<ProfilesTabProps> = React.memo(
  ({ profiles, setCurrentSubView, prepareAddProfile }) => {
    return (
      <div className="w-full space-y-5 lg:space-y-7 animate-in fade-in slide-in-from-right-4 duration-400">
        <div className="space-y-1.5">
          <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tight text-white">
            Perfis
          </h2>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
            Controle parental e permissões
          </p>
        </div>

        {/* Action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
          <SettingsCard
            onClick={() => setCurrentSubView('parental-control')}
            title="Ajustar o controle parental"
            description="Definir limites de classificação etária, bloquear títulos"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            }
          />
          <SettingsCard
            onClick={prepareAddProfile}
            title="Adicionar novo perfil"
            description="Criar uma nova identidade no ecossistema RED X"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
            }
          />
        </div>

        {/* Configured profiles */}
        <div className="space-y-3 lg:space-y-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/15 border-b border-white/[0.05] pb-3">
            Perfis configurados
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
            {profiles.map((prof, i) => (
              <div
                key={i}
                className="group rounded-2xl lg:rounded-[1.25rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl
                                p-4 lg:p-5 flex items-center gap-3.5 transition-all duration-300
                                shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)]
                                hover:bg-white/[0.07] hover:border-white/[0.14] hover:-translate-y-0.5
                                hover:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]"
              >
                <div
                  className={`w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-[0_4px_14px_rgba(0,0,0,0.3)]
                                ${(prof as any).avatar_color || 'bg-blue-600'}`}
                >
                  {prof.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tracking-tight text-white/90 truncate">
                    {prof.name}
                  </p>
                  <span
                    className={`text-[7px] font-bold uppercase tracking-[0.15em] mt-1 inline-block px-2 py-0.5 rounded-md
                                    ${
                                      prof.is_kids
                                        ? 'text-green-300 bg-green-500/10 border border-green-400/20'
                                        : 'text-white/30 bg-white/[0.04] border border-white/[0.06]'
                                    }`}
                  >
                    {prof.is_kids ? 'Kids Safe' : 'Seu Perfil'}
                  </span>
                </div>
              </div>
            ))}

            {/* Add profile card */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Adicionar novo perfil"
              onClick={prepareAddProfile}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  prepareAddProfile();
                }
              }}
              className="group cursor-pointer rounded-2xl lg:rounded-[1.25rem] border-2 border-dashed border-white/[0.08]
                            p-4 lg:p-5 flex items-center justify-center gap-3 transition-all duration-300
                            hover:border-violet-400/30 hover:bg-violet-500/[0.04]
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
            >
              <div className="w-9 h-9 rounded-xl border border-white/[0.12] flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all shrink-0 text-white/30">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/20 group-hover:text-white/50 transition-colors">
                Novo perfil
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
