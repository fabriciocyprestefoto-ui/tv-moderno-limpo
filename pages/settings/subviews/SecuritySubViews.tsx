import React, { useState } from 'react';
import { VisionKeyboard } from '../components/VisionKeyboard';
import { UserSettings } from '../../../services/supabaseService';
import { supabase } from '../../../services/supabaseService';
import { useAuth } from '../../../contexts/AuthContext';

/* -------------------------------------------------------------------------- */
/*                            ChangePasswordSubView                           */
/* -------------------------------------------------------------------------- */
export const ChangePasswordSubView: React.FC<{ setCurrentSubView: (v: string | null) => void }> = ({
  setCurrentSubView,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [focusedField, setFocusedField] = useState<'current' | 'new' | 'confirm'>('current');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleKeyClick = (key: string) => {
    if (focusedField === 'current') setCurrentPassword((p) => p + key);
    else if (focusedField === 'new') setNewPassword((p) => p + key);
    else if (focusedField === 'confirm') setConfirmPassword((p) => p + key);
  };

  const handleBackspace = () => {
    if (focusedField === 'current') setCurrentPassword((p) => p.slice(0, -1));
    else if (focusedField === 'new') setNewPassword((p) => p.slice(0, -1));
    else if (focusedField === 'confirm') setConfirmPassword((p) => p.slice(0, -1));
  };

  const handleSave = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    // Validações básicas
    if (!currentPassword) {
      setErrorMsg('Informe a senha atual.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('As senhas não conferem.');
      return;
    }

    setIsLoading(true);
    try {
      // Primeiro verifica se a senha atual está correta tentando fazer re-login
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) {
        setErrorMsg('Usuário não autenticado.');
        setIsLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) {
        setErrorMsg('Senha atual incorreta.');
        setIsLoading(false);
        return;
      }

      // Atualiza a senha no Supabase
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setErrorMsg(error.message || 'Erro ao alterar senha.');
      } else {
        setSuccessMsg('Senha alterada com sucesso!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        // Volta após 1.5s
        setTimeout(() => setCurrentSubView(null), 1500);
      }
    } catch {
      setErrorMsg('Erro inesperado. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-5 duration-500">
      <div className="flex items-center gap-6 mb-8">
        <button
          onClick={() => setCurrentSubView(null)}
          aria-label="Voltar para Segurança"
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
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
            Segurança
          </p>
          <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tight text-white">
            Alterar Senha
          </h2>
        </div>
      </div>
      <div className="rounded-2xl lg:rounded-[1.25rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] p-12 max-w-2xl space-y-8">
        {/* Mensagens de feedback */}
        {errorMsg && (
          <div
            role="alert"
            aria-live="assertive"
            className="px-5 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium"
          >
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div
            role="status"
            aria-live="polite"
            className="px-5 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium"
          >
            {successMsg}
          </div>
        )}

        <div className="space-y-6">
          {/* Campo: Senha Atual */}
          <div className="space-y-2">
            <label
              id="lbl-current"
              className="block text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/70 ml-4"
            >
              SENHA ATUAL
            </label>
            <div
              role="textbox"
              aria-labelledby="lbl-current"
              aria-placeholder="Toque para digitar"
              tabIndex={0}
              onClick={() => setFocusedField('current')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setFocusedField('current');
              }}
              className={`w-full py-5 px-8 rounded-2xl border cursor-pointer backdrop-blur-2xl text-xl font-light tracking-[0.5em] h-16 flex items-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60
                                ${focusedField === 'current' ? 'border-violet-500/50 bg-violet-600/5' : 'border-white/[0.07] bg-white/[0.03]'}`}
            >
              {currentPassword ? (
                '•'.repeat(currentPassword.length)
              ) : (
                <span className="text-white/30 text-base tracking-normal">Toque para digitar</span>
              )}
            </div>
          </div>

          {/* Campo: Nova Senha */}
          <div className="space-y-2">
            <label
              id="lbl-new"
              className="block text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/70 ml-4"
            >
              NOVA SENHA
            </label>
            <div
              role="textbox"
              aria-labelledby="lbl-new"
              aria-placeholder="Mínimo 8 caracteres"
              tabIndex={0}
              onClick={() => setFocusedField('new')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setFocusedField('new');
              }}
              className={`w-full py-5 px-8 rounded-2xl border cursor-pointer backdrop-blur-2xl text-xl font-light tracking-[0.5em] h-16 flex items-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60
                                ${focusedField === 'new' ? 'border-violet-500/50 bg-violet-600/5' : 'border-white/[0.07] bg-white/[0.03]'}`}
            >
              {newPassword ? (
                '•'.repeat(newPassword.length)
              ) : (
                <span className="text-white/30 text-base tracking-normal">Mínimo 8 caracteres</span>
              )}
            </div>
          </div>

          {/* Campo: Confirmar Nova Senha */}
          <div className="space-y-2">
            <label
              id="lbl-confirm"
              className="block text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/70 ml-4"
            >
              CONFIRMAR NOVA SENHA
            </label>
            <div
              role="textbox"
              aria-labelledby="lbl-confirm"
              aria-placeholder="Repita a nova senha"
              aria-invalid={!!(confirmPassword && confirmPassword !== newPassword)}
              tabIndex={0}
              onClick={() => setFocusedField('confirm')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setFocusedField('confirm');
              }}
              className={`w-full py-5 px-8 rounded-2xl border cursor-pointer backdrop-blur-2xl text-xl font-light tracking-[0.5em] h-16 flex items-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60
                                ${focusedField === 'confirm' ? 'border-violet-500/50 bg-violet-600/5' : 'border-white/[0.07] bg-white/[0.03]'}
                                ${confirmPassword && confirmPassword !== newPassword ? 'border-red-500/40' : ''}
                            `}
            >
              {confirmPassword ? (
                '•'.repeat(confirmPassword.length)
              ) : (
                <span className="text-white/30 text-base tracking-normal">Repita a nova senha</span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
          className="w-full py-6 rounded-3xl font-bold text-xs uppercase tracking-widest text-white border border-violet-500/30 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed backdrop-blur-2xl shadow-[0_2px_12px_rgba(0,0,0,0.2)] transition-all flex items-center justify-center gap-3"
        >
          {isLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              SALVANDO...
            </>
          ) : (
            'SALVAR ALTERAÇÕES'
          )}
        </button>
        <p className="text-center text-[10px] font-light text-white/20 italic">
          "Sua segurança é nossa prioridade."
        </p>
      </div>
      <VisionKeyboard onKeyClick={handleKeyClick} onBackspace={handleBackspace} />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                              TwoFactorSubView                              */
/* -------------------------------------------------------------------------- */
export const TwoFactorSubView: React.FC<{
  setCurrentSubView: (v: string | null) => void;
  userSettings: UserSettings | null;
}> = ({ setCurrentSubView, userSettings }) => {
  // Estado local para refletir toggle sem precisar recarregar userSettings do servidor
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(
    userSettings?.two_factor_enabled ?? false
  );
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const handleToggle = async () => {
    setIsLoading(true);
    setFeedbackMsg('');
    try {
      const newValue = !twoFactorEnabled;
      // Atualiza na tabela user_settings
      const { error } = await supabase
        .from('user_settings')
        .update({ two_factor_enabled: newValue })
        .eq('user_id', userSettings?.user_id ?? '');

      if (error) {
        setFeedbackMsg('Erro ao atualizar configuração. Tente novamente.');
      } else {
        setTwoFactorEnabled(newValue);
        setFeedbackMsg(
          newValue
            ? 'Autenticação em duas etapas ativada!'
            : 'Autenticação em duas etapas desativada.'
        );
        setTimeout(() => setFeedbackMsg(''), 3000);
      }
    } catch {
      setFeedbackMsg('Erro inesperado. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-5 duration-500">
      <div className="flex items-center gap-6 mb-8">
        <button
          onClick={() => setCurrentSubView(null)}
          aria-label="Voltar para Segurança"
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
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
            Segurança
          </p>
          <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tight text-white">
            Autenticação em Duas Etapas
          </h2>
        </div>
      </div>
      <div className="rounded-2xl lg:rounded-[1.25rem] border border-violet-500/30 bg-violet-600/5 backdrop-blur-2xl shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] p-12 space-y-10">
        {feedbackMsg && (
          <div
            role={feedbackMsg.includes('Erro') ? 'alert' : 'status'}
            aria-live={feedbackMsg.includes('Erro') ? 'assertive' : 'polite'}
            className={`px-5 py-3 rounded-xl border text-sm font-medium ${feedbackMsg.includes('Erro') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}
          >
            {feedbackMsg}
          </div>
        )}

        <div className="flex items-center gap-8">
          <div
            className={`w-20 h-20 rounded-3xl flex items-center justify-center text-white shadow-[0_2px_12px_rgba(139,92,246,0.4)] transition-all ${twoFactorEnabled ? 'bg-violet-600' : 'bg-white/10'}`}
          >
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-3xl font-bold tracking-tight">
              STATUS: {twoFactorEnabled ? 'ATIVO' : 'INATIVO'}
            </h3>
            <p className="text-white/60 font-light">
              {twoFactorEnabled
                ? 'Sua conta está protegida por verificação via dispositivo móvel.'
                : 'Ative para proteger sua conta com verificação extra.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-10 border-t border-white/5">
          <div className="space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
              NÚMERO DE TELEFONE
            </p>
            <div className="p-6 rounded-2xl flex justify-between items-center bg-white/[0.03] border border-white/[0.07] backdrop-blur-2xl h-16">
              <span className="font-bold">{userSettings?.phone || '+55 ** ***** ****'}</span>
              <span className="text-[8px] font-bold text-violet-400 uppercase tracking-widest">
                VERIFICADO
              </span>
            </div>
          </div>
          <div className="space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
              E-MAIL DE RECUPERAÇÃO
            </p>
            <div className="p-6 rounded-2xl flex justify-between items-center bg-white/[0.03] border border-white/[0.07] backdrop-blur-2xl h-16">
              <span className="font-bold truncate mr-2">
                {userSettings?.email || 'email@exemplo.com'}
              </span>
              <span className="text-[8px] font-bold text-violet-400 uppercase tracking-widest shrink-0">
                VERIFICADO
              </span>
            </div>
          </div>
        </div>

        {/* Toggle principal */}
        <div className="flex items-center justify-between p-6 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
          <div>
            <p className="font-semibold text-white/90">
              {twoFactorEnabled ? 'Desativar autenticação' : 'Ativar autenticação'}
            </p>
            <p className="text-xs text-white/40 font-light mt-0.5">
              {twoFactorEnabled
                ? 'Remove a camada extra de segurança'
                : 'Adiciona camada extra de segurança'}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={twoFactorEnabled}
            aria-label={
              twoFactorEnabled
                ? 'Desativar autenticação em duas etapas'
                : 'Ativar autenticação em duas etapas'
            }
            onClick={handleToggle}
            disabled={isLoading}
            className={`relative w-14 h-7 rounded-full transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${twoFactorEnabled ? 'bg-violet-600' : 'bg-white/10'}`}
          >
            {isLoading ? (
              <svg
                className="w-4 h-4 animate-spin absolute top-1.5 right-1.5 text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <div
                className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all shadow-md ${twoFactorEnabled ? 'left-8' : 'left-1'}`}
              />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                              PasskeysSubView                               */
/* -------------------------------------------------------------------------- */
export const PasskeysSubView: React.FC<{ setCurrentSubView: (v: string | null) => void }> = ({
  setCurrentSubView,
}) => {
  const [passkeys, setPasskeys] = useState([
    { name: 'Apple Vision Pro (Este aparelho)', date: 'Adicionado hoje' },
    { name: 'FaceID iPhone 15 Pro', date: 'Adicionado em 12/10/2024' },
  ]);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const handleRemovePasskey = (index: number) => {
    setPasskeys((prev) => prev.filter((_, i) => i !== index));
    setFeedbackMsg('Chave de acesso removida.');
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  const handleAddPasskey = () => {
    // Em produção real chamaria a Web Authentication API (WebAuthn)
    setFeedbackMsg('Funcionalidade disponível apenas em dispositivos compatíveis com biometria.');
    setTimeout(() => setFeedbackMsg(''), 4000);
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-5 duration-500">
      <div className="flex items-center gap-6 mb-8">
        <button
          onClick={() => setCurrentSubView(null)}
          aria-label="Voltar para Segurança"
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
              strokeWidth="2.5"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
            Segurança
          </p>
          <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tight text-white">
            Chaves de Acesso
          </h2>
        </div>
      </div>

      {feedbackMsg && (
        <div className="px-5 py-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm font-medium">
          {feedbackMsg}
        </div>
      )}

      <div className="space-y-6">
        {passkeys.map((key, i) => (
          <div
            key={i}
            className="rounded-2xl lg:rounded-[1.25rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] p-8 flex justify-between items-center group hover:border-white/20 transition-all"
          >
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-white/40 group-hover:bg-violet-600 group-hover:text-white transition-all shadow-xl">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A10.003 10.003 0 0112 3c1.268 0 2.39.606 3.107 1.554m-2.107 10.102V14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v5a2 2 0 002 2h2.292"
                  />
                </svg>
              </div>
              <div>
                <h4 className="text-xl font-bold">{key.name}</h4>
                <p className="text-xs text-white/30 font-light">{key.date}</p>
              </div>
            </div>
            <button
              onClick={() => handleRemovePasskey(i)}
              className="w-10 h-10 rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-600/10 hover:border-red-500/20 transition-all"
              title="Remover chave"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        ))}

        <button
          onClick={handleAddPasskey}
          className="w-full py-8 rounded-2xl border-dashed border-2 border-white/10 font-bold text-xs uppercase tracking-[0.5em] text-white/20 hover:text-white hover:bg-white/[0.07] hover:border-white/20 transition-all"
        >
          + Adicionar nova Chave de Acesso
        </button>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                              SignOutAllSubView                             */
/* -------------------------------------------------------------------------- */
export const SignOutAllSubView: React.FC<{
  setCurrentSubView: (v: string | null) => void;
  userSettings: UserSettings | null;
}> = ({ setCurrentSubView, userSettings }) => {
  const { signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSignOutAll = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      // Encerra a sessão global no Supabase (revoga todos os refresh tokens)
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) {
        setErrorMsg('Erro ao encerrar sessões: ' + error.message);
      } else {
        setDone(true);
        // Chama o signOut do contexto para limpar estado local
        setTimeout(async () => {
          await signOut();
        }, 2000);
      }
    } catch {
      setErrorMsg('Erro inesperado. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-5 duration-500">
      <div className="flex items-center gap-6 mb-8">
        <button
          onClick={() => setCurrentSubView(null)}
          aria-label="Voltar para Segurança"
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
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-400/60">
            Segurança
          </p>
          <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tight text-white">
            Sair de Tudo
          </h2>
        </div>
      </div>
      <div className="rounded-2xl lg:rounded-[1.25rem] border border-violet-500/30 bg-violet-600/5 backdrop-blur-2xl shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] p-16 text-center space-y-12">
        {done ? (
          /* Tela de sucesso */
          <div className="space-y-6">
            <div className="w-24 h-24 rounded-full bg-green-600/20 border border-green-500/30 flex items-center justify-center text-green-400 mx-auto">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-3xl font-black tracking-tighter text-white">Sessões encerradas!</h3>
            <p className="text-white/60 font-light">
              Todos os dispositivos foram desconectados. Redirecionando...
            </p>
          </div>
        ) : (
          <>
            <div className="w-32 h-32 rounded-full bg-violet-600/20 flex items-center justify-center text-violet-400 mx-auto shadow-[0_0_80px_rgba(139,92,246,0.3)] border border-violet-500/30">
              <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </div>

            {errorMsg && (
              <div
                role="alert"
                aria-live="assertive"
                className="px-5 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium"
              >
                {errorMsg}
              </div>
            )}

            <div className="max-w-xl mx-auto space-y-4">
              <h3 className="text-4xl font-black tracking-tighter">Tem certeza absoluta?</h3>
              <p className="text-xl text-white/60 font-light leading-relaxed">
                Isso encerrará sua sessão em todos os computadores, Smart TVs e computadores
                espaciais conectados à conta{' '}
                <span className="text-white font-bold">{userSettings?.email || 'sua conta'}</span>.
              </p>
            </div>

            <div className="flex flex-col md:flex-row gap-6 justify-center pt-8">
              <button
                onClick={() => setCurrentSubView(null)}
                disabled={isLoading}
                className="px-16 py-6 rounded-3xl font-bold text-xs uppercase tracking-widest bg-white/[0.03] border border-white/[0.07] backdrop-blur-2xl hover:bg-white/[0.07] transition-all disabled:opacity-40"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSignOutAll}
                disabled={isLoading}
                className="px-16 py-6 rounded-3xl font-bold text-xs uppercase tracking-widest bg-violet-600 text-white shadow-[0_20px_60px_rgba(139,92,246,0.4)] hover:scale-110 hover:bg-violet-500 transition-all disabled:opacity-40 disabled:scale-100 flex items-center justify-center gap-3"
              >
                {isLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    ENCERRANDO...
                  </>
                ) : (
                  'SAIR DE TUDO AGORA'
                )}
              </button>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/10 pt-4">
              AVISO: VOCÊ PRECISARÁ REAUTENTICAR TODOS OS SEUS DISPOSITIVOS VISION.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
