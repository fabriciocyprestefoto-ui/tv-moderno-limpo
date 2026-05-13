import React from 'react';
import { SettingsCard } from '../components/SettingsCard';
import { UserSettings } from '../../../services/supabaseService';

interface SecurityTabProps {
  userSettings: UserSettings | null;
  setCurrentSubView: (view: string) => void;
}

export const SecurityTab: React.FC<SecurityTabProps> = React.memo(
  ({ userSettings, setCurrentSubView }) => {
    return (
      <div className="w-full space-y-5 lg:space-y-7 animate-in fade-in slide-in-from-right-4 duration-400">
        <div className="space-y-1.5">
          <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tight text-white">
            Segurança
          </h2>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
            Protocolos de proteção espacial
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
          <SettingsCard
            onClick={() => setCurrentSubView('change-password')}
            title="Alterar Senha"
            description="Última alteração há 3 meses. Recomendamos mudar a cada 6 meses."
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            }
          />
          <SettingsCard
            onClick={() => setCurrentSubView('two-factor')}
            title="Autenticação em Duas Etapas"
            badge={userSettings?.two_factor_enabled ? 'ATIVO' : 'INATIVO'}
            accent={userSettings?.two_factor_enabled}
            description="Proteja sua conta com um código enviado ao seu dispositivo."
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            }
          />
          <SettingsCard
            onClick={() => setCurrentSubView('passkeys')}
            title="Gerenciar Chaves de Acesso"
            description="Use biometria para entrar no RED X sem senhas."
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A10.003 10.003 0 0012 3c1.268 0 2.39.606 3.107 1.554m-2.107 10.102V14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v5a2 2 0 002 2h2.292"
                />
              </svg>
            }
          />
          <SettingsCard
            onClick={() => setCurrentSubView('sign-out-all')}
            title="Encerrar todas as sessões"
            description="Desconecta todos os dispositivos ligados a esta conta."
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            }
          />
        </div>
      </div>
    );
  }
);
