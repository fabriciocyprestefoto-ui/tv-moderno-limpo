import React, { useState } from 'react';
import { ShieldCheck, X, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface AdminLoginModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const AdminLoginModal: React.FC<AdminLoginModalProps> = ({ onClose, onSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { signInAsAdmin } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError('Digite a senha admin');
      return;
    }
    setIsLoading(true);

    try {
      const result = await signInAsAdmin(password);
      if (!result.ok) {
        setError(result.error);
        setIsLoading(false);
      } else {
        setIsLoading(false);
        onSuccess();
      }
    } catch (err) {
      setError('Erro de conexão');
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
        style={{ transform: 'scale(0.85)' }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-4 -right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X size={20} className="text-white" />
        </button>

        {/* Modal card */}
        <div
          className="rounded-[28px] p-8 flex flex-col gap-6"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow:
              '0 24px 80px rgba(0,0,0,0.6), 0 2px 0 rgba(255,255,255,0.06) inset, 0 -1px 0 rgba(0,0,0,0.3) inset',
          }}
        >
          {/* Header */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <div className="p-3 rounded-2xl bg-red-600/20 border border-red-500/30">
              <ShieldCheck size={32} className="text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-white">Acesso Admin</h2>
            <p className="text-[11px] font-medium tracking-[0.3em] uppercase text-white/30">
              Painel Administrativo
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div
              className="rounded-2xl px-4 py-3 text-[12px] font-semibold text-red-300 text-center"
              style={{
                background: 'rgba(168,85,247,0.1)',
                border: '1px solid rgba(168,85,247,0.2)',
              }}
            >
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-white/40 tracking-[0.2em] ml-1">
                Senha Admin
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite a senha admin"
                autoFocus
                className="w-full rounded-2xl py-3.5 px-4 text-[13px] font-medium text-white placeholder-white/15 outline-none transition-all duration-300 focus:ring-1 focus:ring-white/20"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="relative w-full py-3.5 rounded-2xl font-bold text-[13px] tracking-wide flex items-center justify-center gap-2.5 transition-all duration-300 overflow-hidden group disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background:
                  'linear-gradient(135deg, rgba(168,85,247,0.9) 0%, rgba(126,34,206,0.9) 100%)',
                boxShadow: '0 8px 32px rgba(168,85,247,0.25), 0 2px 0 rgba(255,255,255,0.1) inset',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#ffffff',
              }}
            >
              <span
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%)',
                }}
              />
              <span className="relative z-10 flex items-center gap-2.5">
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    Acessar Dashboard
                    <ArrowRight
                      size={16}
                      className="group-hover:translate-x-0.5 transition-transform duration-200"
                    />
                  </>
                )}
              </span>
            </button>
          </form>

          {/* Info */}
          <div className="text-center">
            <p className="text-[10px] text-white/20 leading-relaxed">
              Acesso restrito para administradores do sistema
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginModal;
