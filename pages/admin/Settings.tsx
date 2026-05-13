import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import { Save, Server, Mail, Shield, RefreshCw } from 'lucide-react';
import {
  getAdminConfig,
  updateAdminConfig,
  getSystemHealth,
  type AdminConfig,
} from '../../services/adminService';
import { logger } from '@/utils/logger';

const AdminSettings: React.FC = () => {
  const [config, setConfig] = useState<AdminConfig>({
    instance_name: 'RED X Master Node 01',
    maintenance_mode: false,
    cdn_caching: true,
    smtp_server: 'smtp.sendgrid.net',
    sender_email: 'no-reply@redx.com',
    system_alerts: true,
  });
  const [health, setHealth] = useState<{
    database: boolean;
    storage: boolean;
    latency: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [c, h] = await Promise.allSettled([getAdminConfig(), getSystemHealth()]);
      if (c.status === 'fulfilled') setConfig(c.value);
      if (h.status === 'fulfilled') setHealth(h.value);
    } catch (e) {
      logger.error('Erro ao carregar configurações:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await updateAdminConfig(config);
      setToast({
        message: ok ? 'Configurações salvas com sucesso!' : 'Erro ao salvar configurações',
        type: ok ? 'success' : 'error',
      });
    } catch {
      setToast({ message: 'Erro ao salvar configurações', type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleRefreshHealth = async () => {
    const h = await getSystemHealth();
    setHealth(h);
  };

  const Toggle = ({
    enabled,
    onToggle,
    color = 'green',
  }: {
    enabled: boolean;
    onToggle: () => void;
    color?: string;
  }) => (
    <div
      onClick={onToggle}
      className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${enabled ? (color === 'red' ? 'bg-red-600' : 'bg-green-600') : 'bg-white/10'}`}
    >
      <div
        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all ${enabled ? 'left-7' : 'left-1'}`}
      />
    </div>
  );

  return (
    <AdminLayout>
      <div className="space-y-8 relative">
        {toast && (
          <div
            className={`fixed top-4 right-4 px-6 py-4 rounded-xl shadow-2xl z-50 font-bold ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
          >
            {toast.message}
          </div>
        )}

        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-1 text-white">
              Configurações do Sistema
            </h2>
            <p className="text-white/40 text-sm">Ajustes globais da plataforma RED X.</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-6 py-3 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-[#121217] border border-white/5 rounded-3xl p-8 animate-pulse h-64"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Servidor & Performance */}
            <div className="bg-[#121217] border border-white/5 rounded-3xl p-8 space-y-6">
              <h3 className="font-bold text-lg flex items-center gap-2 mb-4 text-white">
                <Server size={18} className="text-blue-500" /> Servidor & Performance
              </h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                    Nome da Instância
                  </label>
                  <input
                    type="text"
                    value={config.instance_name}
                    onChange={(e) => setConfig((p) => ({ ...p, instance_name: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>
                <div
                  onClick={() =>
                    setConfig((p) => ({ ...p, maintenance_mode: !p.maintenance_mode }))
                  }
                  className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 cursor-pointer hover:bg-white/10 transition-colors group"
                >
                  <div>
                    <p className="font-bold text-sm text-white">Modo de Manutenção</p>
                    <p className="text-xs text-white/40 group-hover:text-white/60">
                      Bloquear acesso de usuários
                    </p>
                  </div>
                  <Toggle
                    enabled={config.maintenance_mode}
                    onToggle={() =>
                      setConfig((p) => ({ ...p, maintenance_mode: !p.maintenance_mode }))
                    }
                    color="red"
                  />
                </div>
                <div
                  onClick={() => setConfig((p) => ({ ...p, cdn_caching: !p.cdn_caching }))}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 cursor-pointer hover:bg-white/10 transition-colors group"
                >
                  <div>
                    <p className="font-bold text-sm text-white">Cache CDN</p>
                    <p className="text-xs text-white/40 group-hover:text-white/60">
                      Cloudflare Edge Caching
                    </p>
                  </div>
                  <Toggle
                    enabled={config.cdn_caching}
                    onToggle={() => setConfig((p) => ({ ...p, cdn_caching: !p.cdn_caching }))}
                  />
                </div>
              </div>
            </div>

            {/* Notificações & Email */}
            <div className="bg-[#121217] border border-white/5 rounded-3xl p-8 space-y-6">
              <h3 className="font-bold text-lg flex items-center gap-2 mb-4 text-white">
                <Mail size={18} className="text-yellow-500" /> Notificações & Email
              </h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                    SMTP Server
                  </label>
                  <input
                    type="text"
                    value={config.smtp_server}
                    onChange={(e) => setConfig((p) => ({ ...p, smtp_server: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                    Email Remetente
                  </label>
                  <input
                    type="text"
                    value={config.sender_email}
                    onChange={(e) => setConfig((p) => ({ ...p, sender_email: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                  />
                </div>
                <div
                  onClick={() => setConfig((p) => ({ ...p, system_alerts: !p.system_alerts }))}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 cursor-pointer hover:bg-white/10 transition-colors group"
                >
                  <div>
                    <p className="font-bold text-sm text-white">Alertas de Sistema</p>
                    <p className="text-xs text-white/40 group-hover:text-white/60">
                      Notificar admins por email
                    </p>
                  </div>
                  <Toggle
                    enabled={config.system_alerts}
                    onToggle={() => setConfig((p) => ({ ...p, system_alerts: !p.system_alerts }))}
                  />
                </div>
              </div>
            </div>

            {/* Status do Sistema */}
            <div className="md:col-span-2 bg-[#121217] border border-white/5 rounded-3xl p-8 space-y-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg flex items-center gap-2 text-white">
                  <Shield size={18} className="text-red-500" /> Status do Sistema
                </h3>
                <button
                  onClick={handleRefreshHealth}
                  className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
                  title="Atualizar status"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
                  <div className="flex items-center gap-4 mb-2">
                    <div
                      className={`w-2 h-2 rounded-full ${health?.database ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
                    />
                    <span className="text-xs font-bold uppercase tracking-widest text-white/40">
                      DATABASE
                    </span>
                  </div>
                  <p className="text-xl font-bold text-white">
                    {health?.database ? 'Conectado' : 'Offline'}
                  </p>
                  <p className="text-xs text-white/30 mt-1">Supabase PostgreSQL</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
                  <div className="flex items-center gap-4 mb-2">
                    <div
                      className={`w-2 h-2 rounded-full ${health?.storage ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
                    />
                    <span className="text-xs font-bold uppercase tracking-widest text-white/40">
                      STORAGE
                    </span>
                  </div>
                  <p className="text-xl font-bold text-white">
                    {health?.storage ? 'Operacional' : 'Offline'}
                  </p>
                  <p className="text-xs text-white/30 mt-1">S3 Compatible / Edge</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
                  <div className="flex items-center gap-4 mb-2">
                    <div
                      className={`w-2 h-2 rounded-full ${health?.latency && health.latency < 500 ? 'bg-green-500 animate-pulse' : 'bg-yellow-500 animate-pulse'}`}
                    />
                    <span className="text-xs font-bold uppercase tracking-widest text-white/40">
                      API LATENCY
                    </span>
                  </div>
                  <p className="text-xl font-bold text-white">{health?.latency ?? '—'}ms</p>
                  <p className="text-xs text-white/30 mt-1">Global Edge Network</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminSettings;
