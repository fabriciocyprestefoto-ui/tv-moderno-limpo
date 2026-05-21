import React, { useEffect, useState } from 'react';
import { ArrowRight, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSpatialNav } from '../hooks/useSpatialNavigation';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';
import { consumeSafePostLoginRedirect } from '../utils/navigationSecurity';
import {
  ACCESS_CODE_PLACEHOLDER,
  ACCESS_CODE_RAW_LENGTH,
  formatAccessCode,
  isAccessCodeComplete,
  normalizeAccessCode,
} from '../utils/accessCode';
type AuthMode = 'user' | 'admin';

const CODE_MAX_LENGTH = ACCESS_CODE_RAW_LENGTH;
const LOGIN_BG_STYLE: React.CSSProperties = {
  backgroundColor: '#0b0514',
  backgroundImage:
    'linear-gradient(135deg, #0b0514 0%, #1e0a3c 24%, #3b1278 52%, #581c87 78%, #7c3aed 100%)',
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'cover',
};

const Login: React.FC<{ onLogin: () => void; onAdminAccess?: () => void }> = ({
  onLogin,
  onAdminAccess,
}) => {
  const [authMode, setAuthMode] = useState<AuthMode>('user');
  const [accessCode, setAccessCode] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const { setPosition, focusToFirstRow } = useSpatialNav();
  const { signInAsAdmin, signInWithCode } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isAdminMode = authMode === 'admin';

  /**
   * TV Box / WebView: `pushState` + `PopStateEvent` sintético nem sempre atualiza o estado
   * interno do React Router 6 — o utilizador ficava com sessão válida mas na rota errada
   * (ex.: não entrava em `/admin` após login admin). `navigate` é a API suportada.
   */
  const navigateWithinApp = (path: string) => {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    void navigate(normalized, { replace: false });
  };

  useEffect(() => {
    window.__loginActive = true;
    return () => {
      window.__loginActive = false;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(focusToFirstRow, 100);
    return () => clearTimeout(t);
  }, [focusToFirstRow, authMode]);

  const handleModeSwitch = (mode: AuthMode) => {
    setAuthMode(mode);
    setError(null);
    setIsLoading(false);
    if (mode === 'admin') {
      onAdminAccess?.();
    } else {
      setAdminPassword('');
    }
  };

  const completeUserLogin = () => {
    window.setTimeout(onLogin, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isAdminMode) {
        if (!adminPassword.trim()) {
          setError('Digite a senha admin');
          setIsLoading(false);
          return;
        }

        const result = await signInAsAdmin(adminPassword);
        if (!result.ok) {
          setError(result.error);
          setIsLoading(false);
          return;
        }

        setIsLoading(false);
        navigateWithinApp('/admin');
        return;
      }

      // Código de teste 000000: validação só no AuthContext (VITE_TV_TEST_LOGIN / dev)
      const rawInput = accessCode.trim();
      if (rawInput === '000000') {
        const result = await signInWithCode('000000');
        if (!result.ok) {
          setError('Acesso negado: ' + result.error);
          setIsLoading(false);
          return;
        }
        setIsLoading(false);
        const redirect = consumeSafePostLoginRedirect('redx_post_login_redirect', false);
        if (redirect) navigateWithinApp(redirect);
        else completeUserLogin();
        return;
      }

      const code = normalizeAccessCode(accessCode);
      if (!isAccessCodeComplete(code)) {
        setError('Digite a chave completa com 16 caracteres');
        setIsLoading(false);
        return;
      }
      if (code.length > CODE_MAX_LENGTH) {
        setError('Chave de acesso inválida');
        setIsLoading(false);
        return;
      }

      const result = await signInWithCode(code);
      if (!result.ok) {
        setError('Acesso negado: ' + result.error);
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      // isAdmin=false: códigos de acesso nunca redirecionam para /admin
      const redirect = consumeSafePostLoginRedirect('redx_post_login_redirect', false);
      if (redirect) {
        navigateWithinApp(redirect);
      } else {
        completeUserLogin();
      }
    } catch (err) {
      logger.error('Login erro de conexão:', err);
      setError('Erro de conexão');
      setIsLoading(false);
    }
  };

  const modeCopy = isAdminMode
    ? {
        badge: 'Acesso Admin',
        subtitle: 'Painel Administrativo',
        label: 'Senha Admin',
        placeholder: 'Digite a senha admin',
        buttonText: 'Acessar Dashboard',
        inputHint: '',
        footerHint: 'Acesso restrito para administradores do sistema',
        toggleText: 'CHAVE DE ACESSO',
        icon: ShieldCheck,
        inputType: 'password' as const,
      }
    : {
        badge: 'Login do Usuário',
        subtitle: 'Login do Usuário',
        label: 'Chave de Acesso',
        placeholder: ACCESS_CODE_PLACEHOLDER,
        buttonText: 'Entrar Agora',
        inputHint:
          'Use a chave gerada no Admin. Ela precisa ter 16 caracteres e funciona uma única vez.',
        footerHint: '',
        toggleText: 'ADMIN',
        icon: KeyRound,
        inputType: 'text' as const,
      };

  const ActiveIcon = modeCopy.icon;

  return (
    <div
      className="fixed inset-0 z-[50] flex items-center justify-center overflow-hidden font-sans"
      style={LOGIN_BG_STYLE}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_38%),radial-gradient(circle_at_bottom,_rgba(124,58,237,0.25),_transparent_32%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(96,165,250,0.18),_transparent_20%),radial-gradient(circle_at_50%_88%,_rgba(139,92,246,0.32),_transparent_18%)]" />

      <div className="relative z-10 w-full max-w-[440px] px-5 scale-[0.65]">
        <div
          className="relative flex flex-col gap-8 overflow-hidden rounded-[44px] border-[1.5px] border-purple-400/30 p-10 shadow-[0_40px_120px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-[30px] saturate-150 transition-all duration-500"
          style={{
            background:
              'linear-gradient(135deg, rgba(88,28,135,0.38) 0%, rgba(46,16,101,0.56) 38%, rgba(17,24,39,0.68) 100%)',
          }}
        >
          <div className="pointer-events-none absolute inset-[3px] rounded-[40px] border border-white/[0.08]" />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at top center, rgba(255,255,255,0.08), transparent 26%), radial-gradient(circle at 50% 78%, rgba(96,165,250,0.16), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 28%)',
            }}
          />

          <div className="relative flex flex-col gap-8">
            <div className="flex flex-col items-center gap-4 pt-2 text-center">
              <img
                src="/logored.png"
                alt="REDX"
                className="h-16 w-auto object-contain drop-shadow-[0_4px_30px_rgba(168,85,247,0.4)]"
              />
              <p className="text-[12px] font-bold uppercase tracking-[0.5em] text-white/40">
                RED X EXPERIENCE
              </p>
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2 text-left">
                <p className="ml-2 text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
                  {modeCopy.badge}
                </p>
                {isAdminMode && (
                  <p className="ml-2 text-[12px] font-medium tracking-[0.08em] text-white/55">
                    {modeCopy.subtitle}
                  </p>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  aria-live="assertive"
                  data-testid="login-error"
                  className="rounded-[24px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-center text-[12px] font-bold uppercase tracking-[0.18em] text-red-200"
                >
                  {error}
                </div>
              )}

              <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-6"
                autoComplete="off"
                data-testid="login-form"
              >
                <div className="flex flex-col gap-2">
                  <label className="ml-2 text-[10px] font-bold uppercase tracking-[0.3em] text-white/38">
                    {modeCopy.label}
                  </label>

                  <div className="relative" data-nav-row="1">
                    <ActiveIcon
                      size={18}
                      className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20"
                    />
                    <input
                      key={authMode}
                      type={modeCopy.inputType}
                      name={isAdminMode ? 'adminPassword' : 'accessCode'}
                      inputMode={isAdminMode ? 'text' : 'numeric'}
                      autoComplete={isAdminMode ? 'current-password' : 'off'}
                      data-testid={isAdminMode ? 'admin-password' : 'login-access-code'}
                      value={isAdminMode ? adminPassword : accessCode}
                      onChange={(e) => {
                        if (isAdminMode) {
                          setAdminPassword(e.target.value);
                        } else {
                          setAccessCode(formatAccessCode(e.target.value));
                        }
                      }}
                      maxLength={isAdminMode ? undefined : CODE_MAX_LENGTH}
                      onFocus={() => setPosition(1, 0)}
                      onKeyDown={(e) => e.stopPropagation()}
                      placeholder={modeCopy.placeholder}
                      autoFocus
                      className="w-full rounded-[22px] border border-white/10 bg-white/5 py-4.5 pl-14 pr-5 text-[13px] font-bold uppercase tracking-[0.16em] text-white placeholder-white/10 outline-none transition-all duration-300 focus:border-sky-300/40 focus:ring-2 focus:ring-purple-500/50"
                      data-nav-item
                      data-nav-col="0"
                    />
                  </div>

                  {modeCopy.inputHint && (
                    <p className="px-2 text-[10px] leading-relaxed text-white/35">
                      {modeCopy.inputHint}
                    </p>
                  )}
                </div>

                <div data-nav-row="2">
                  <button
                    id="login-submit"
                    data-testid={isAdminMode ? 'admin-submit' : 'login-submit'}
                    type="submit"
                    disabled={isLoading}
                    tabIndex={0}
                    onFocus={() => setPosition(2, 0)}
                    className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-[22px] bg-gradient-to-br from-[#7C3AED] to-[#4C1D95] py-5 text-[14px] font-black uppercase tracking-[0.3em] text-white shadow-[0_10px_40px_rgba(124,58,237,0.4)] transition-all duration-500 outline-none focus:ring-4 focus:ring-white/40 disabled:opacity-50"
                    data-nav-item
                    data-nav-col="0"
                  >
                    <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus:opacity-100">
                      <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.18)_0%,transparent_48%)]" />
                    </span>
                    <span className="relative z-10 flex items-center gap-2">
                      {isLoading ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <>
                          {modeCopy.buttonText}
                          <ArrowRight
                            size={18}
                            className="transition-transform group-hover:translate-x-1"
                          />
                        </>
                      )}
                    </span>
                  </button>
                </div>
              </form>
            </div>

            <div className="flex flex-col items-center gap-6 pt-2" data-nav-row="3">
              <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

              {modeCopy.footerHint && (
                <p className="max-w-[82%] px-2 text-center text-[10px] leading-relaxed text-white/34">
                  {modeCopy.footerHint}
                </p>
              )}

              <button
                type="button"
                onClick={() => handleModeSwitch(isAdminMode ? 'user' : 'admin')}
                tabIndex={0}
                data-nav-item
                data-nav-col="0"
                onFocus={() => setPosition(3, 0)}
                className="rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/20 transition-all outline-none hover:text-white/50 focus:text-white/80 focus:ring-2 focus:ring-white/30"
              >
                {modeCopy.toggleText}
              </button>
            </div>
          </div>
        </div>

        <div className="pointer-events-none mx-auto mt-10 h-12 w-[80%] rounded-full bg-gradient-to-b from-purple-400/40 to-transparent opacity-20 blur-[30px]" />
      </div>
    </div>
  );
};

export default Login;
