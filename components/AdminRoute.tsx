import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldAlert } from 'lucide-react';
import { useTvBackHandler } from '@/hooks/useTvBackHandler';
import { runtimeFlags } from '@/config/runtimeFlags';

/** BACK na área admin: volta no histórico interno ou para a Home do app */
const AdminTvBackShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  useTvBackHandler(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  });
  return <>{children}</>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, isAdmin } = useAuth();

  // Bypass explícito: apenas se VITE_ADMIN_BYPASS=true (nunca em build de produção)
  const adminBypass = runtimeFlags.adminBypassEnabled;
  if (adminBypass) {
    return <AdminTvBackShell>{children}</AdminTvBackShell>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-transparent">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-[#A855F7]" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (isAdmin) {
    return <AdminTvBackShell>{children}</AdminTvBackShell>;
  }

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#121217] border border-red-600/30 rounded-2xl p-8 shadow-2xl text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <ShieldAlert size={18} className="text-red-500" />
          <h2 className="text-white font-bold">Acesso negado</h2>
        </div>
        <p className="text-white/60 text-sm">
          Sua conta nao possui role <code>admin</code> em <code>app_metadata</code>.
        </p>
      </div>
    </div>
  );
};

export default AdminRoute;
