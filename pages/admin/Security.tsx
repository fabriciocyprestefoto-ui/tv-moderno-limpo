import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import { ShieldAlert, Lock, Activity, Globe, Trash2, Plus, RefreshCw, X, Save } from 'lucide-react';
import { logger } from '@/utils/logger';
import {
  getAuditLogs,
  getIPBlacklist,
  addIPToBlacklist,
  removeIPFromBlacklist,
  getSecuritySettings,
  updateSecuritySettings,
  type AuditLog,
  type IPBlacklist as IPBlacklistType,
  type SecuritySettings,
} from '@/services/adminService';

const Security: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [blacklist, setBlacklist] = useState<IPBlacklistType[]>([]);
  const [settings, setSettings] = useState<SecuritySettings>({
    geo_block_enabled: false,
    ddos_protection: false,
    admin_2fa_required: false,
    max_login_attempts: 5,
    session_timeout_hours: 24,
  });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Modal IP
  const [showIPModal, setShowIPModal] = useState(false);
  const [ipForm, setIpForm] = useState({ ip_address: '', reason: '', expires_at: '' });
  const [savingIP, setSavingIP] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [l, b, s] = await Promise.allSettled([
        getAuditLogs(50),
        getIPBlacklist(),
        getSecuritySettings(),
      ]);
      if (l.status === 'fulfilled') setLogs(l.value);
      if (b.status === 'fulfilled') setBlacklist(b.value);
      if (s.status === 'fulfilled') setSettings(s.value);
    } catch (e) {
      logger.error('Erro ao carregar segurança:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = async (key: keyof SecuritySettings) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    setSavingSettings(true);
    await updateSecuritySettings(newSettings);
    setSavingSettings(false);
  };

  const handleAddIP = async () => {
    if (!ipForm.ip_address.trim()) return;
    setSavingIP(true);
    try {
      const created = await addIPToBlacklist({
        ip_address: ipForm.ip_address,
        reason: ipForm.reason,
        blocked_by: 'admin',
        expires_at: ipForm.expires_at || null,
      });
      if (created) {
        setBlacklist((prev) => [created, ...prev]);
        setShowIPModal(false);
        setIpForm({ ip_address: '', reason: '', expires_at: '' });
      }
    } finally {
      setSavingIP(false);
    }
  };

  const handleRemoveIP = async (id: string) => {
    if (!confirm('Remover este IP da blacklist?')) return;
    const ok = await removeIPFromBlacklist(id);
    if (ok) setBlacklist((prev) => prev.filter((b) => b.id !== id));
  };

  const getActionColor = (action: string) => {
    if (action.includes('DELETE') || action.includes('FAIL') || action.includes('BLOCK'))
      return 'bg-red-500/10 text-red-500 border-red-500/20';
    if (action.includes('UPDATE') || action.includes('WARN'))
      return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    return 'bg-green-500/10 text-green-500 border-green-500/20';
  };

  const Toggle = ({
    enabled,
    onToggle,
    loading: l,
  }: {
    enabled: boolean;
    onToggle: () => void;
    loading?: boolean;
  }) => (
    <div
      onClick={l ? undefined : onToggle}
      className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${enabled ? 'bg-green-600' : 'bg-white/10'} ${l ? 'opacity-50' : ''}`}
    >
      <div
        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all ${enabled ? 'right-1' : 'left-1'}`}
      />
    </div>
  );

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-1">Segurança</h2>
            <p className="text-white/40 text-sm">
              Auditoria e controle de acesso.{' '}
              <span className="text-white/20">
                {logs.length} logs • {blacklist.length} IPs bloqueados
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold flex items-center gap-2"
            >
              <RefreshCw size={16} /> Atualizar
            </button>
            <button
              onClick={() => setShowIPModal(true)}
              className="px-6 py-3 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-700 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all flex items-center gap-2"
            >
              <ShieldAlert size={18} /> Bloquear IP
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="bg-[#121217] border border-white/5 rounded-3xl p-12 animate-pulse h-64"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Logs de Auditoria */}
            <div className="bg-[#121217] border border-white/5 rounded-3xl overflow-hidden">
              <div className="p-6 border-b border-white/5 flex justify-between items-center">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Activity size={18} className="text-blue-500" /> Logs de Auditoria ({logs.length})
                </h3>
              </div>
              {logs.length === 0 ? (
                <div className="p-12 text-center text-white/20">
                  <Activity size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="font-bold">Nenhum log encontrado</p>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[400px]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white/5 text-white/40 text-xs uppercase tracking-wider font-bold sticky top-0">
                      <tr>
                        <th className="px-6 py-4">Ação</th>
                        <th className="px-6 py-4">Admin</th>
                        <th className="px-6 py-4">IP</th>
                        <th className="px-6 py-4">Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-3">
                            <span
                              className={`px-2 py-1 rounded border text-xs font-mono ${getActionColor(log.action)}`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-white/60 text-xs">
                            {log.admin?.name || log.admin?.email || log.admin_id || '—'}
                          </td>
                          <td className="px-6 py-3 text-white/40 font-mono text-xs">
                            {log.ip_address || '—'}
                          </td>
                          <td className="px-6 py-3 text-white/40 text-xs">
                            {new Date(log.created_at).toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* IP Blacklist */}
            <div className="bg-[#121217] border border-white/5 rounded-3xl overflow-hidden">
              <div className="p-6 border-b border-white/5 flex justify-between items-center">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Lock size={18} className="text-red-500" /> Lista Negra ({blacklist.length})
                </h3>
                <button
                  onClick={() => setShowIPModal(true)}
                  className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white"
                  title="Adicionar IP"
                >
                  <Plus size={18} />
                </button>
              </div>
              {blacklist.length === 0 ? (
                <div className="p-12 text-center text-white/20">
                  <Lock size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="font-bold">Nenhum IP bloqueado</p>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[400px]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white/5 text-white/40 text-xs uppercase tracking-wider font-bold sticky top-0">
                      <tr>
                        <th className="px-6 py-4">IP</th>
                        <th className="px-6 py-4">Motivo</th>
                        <th className="px-6 py-4">Expira</th>
                        <th className="px-6 py-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {blacklist.map((item) => (
                        <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                          <td className="px-6 py-3 font-mono text-xs font-bold text-red-400">
                            {item.ip_address}
                          </td>
                          <td className="px-6 py-3 text-white/60 text-xs">{item.reason || '—'}</td>
                          <td className="px-6 py-3 text-white/40 text-xs">
                            {item.expires_at
                              ? new Date(item.expires_at).toLocaleDateString('pt-BR')
                              : 'Permanente'}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <button
                              onClick={() => handleRemoveIP(item.id)}
                              className="p-1.5 hover:bg-red-500/20 rounded-lg text-white/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                              title="Remover"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Configurações de Segurança */}
        <div className="bg-[#121217] border border-white/5 rounded-3xl p-8">
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
            <Globe size={18} className="text-purple-500" /> Configurações de Acesso Global
            {savingSettings && <RefreshCw size={14} className="animate-spin text-white/30" />}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm">Bloqueio Geográfico</h4>
                <p className="text-xs text-white/40 mt-1">Permitir apenas IPs do Brasil</p>
              </div>
              <Toggle
                enabled={settings.geo_block_enabled}
                onToggle={() => handleToggle('geo_block_enabled')}
                loading={savingSettings}
              />
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm">Proteção DDoS</h4>
                <p className="text-xs text-white/40 mt-1">Cloudflare Under Attack Mode</p>
              </div>
              <Toggle
                enabled={settings.ddos_protection}
                onToggle={() => handleToggle('ddos_protection')}
                loading={savingSettings}
              />
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm">2FA Obrigatório</h4>
                <p className="text-xs text-white/40 mt-1">Para todos os administradores</p>
              </div>
              <Toggle
                enabled={settings.admin_2fa_required}
                onToggle={() => handleToggle('admin_2fa_required')}
                loading={savingSettings}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                Máximo de Tentativas de Login
              </label>
              <input
                type="number"
                value={settings.max_login_attempts}
                onChange={(e) =>
                  setSettings((p) => ({ ...p, max_login_attempts: parseInt(e.target.value) || 5 }))
                }
                min={1}
                max={20}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none"
              />
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                Timeout da Sessão (horas)
              </label>
              <input
                type="number"
                value={settings.session_timeout_hours}
                onChange={(e) =>
                  setSettings((p) => ({
                    ...p,
                    session_timeout_hours: parseInt(e.target.value) || 24,
                  }))
                }
                min={1}
                max={720}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>
          <button
            onClick={async () => {
              setSavingSettings(true);
              await updateSecuritySettings(settings);
              setSavingSettings(false);
            }}
            disabled={savingSettings}
            className="mt-6 px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {savingSettings ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            {savingSettings ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </div>

      {/* Modal Bloquear IP */}
      {showIPModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a20] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Bloquear IP</h3>
              <button
                onClick={() => setShowIPModal(false)}
                className="p-2 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                  Endereço IP
                </label>
                <input
                  type="text"
                  value={ipForm.ip_address}
                  onChange={(e) => setIpForm((p) => ({ ...p, ip_address: e.target.value }))}
                  placeholder="Ex: 192.168.1.100"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-red-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                  Motivo
                </label>
                <input
                  type="text"
                  value={ipForm.reason}
                  onChange={(e) => setIpForm((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Ex: Tentativas de login excessivas"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                  Expira em (opcional)
                </label>
                <input
                  type="date"
                  value={ipForm.expires_at}
                  onChange={(e) => setIpForm((p) => ({ ...p, expires_at: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none"
                />
                <p className="text-xs text-white/20 mt-1">Deixe vazio para bloqueio permanente</p>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowIPModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddIP}
                disabled={savingIP || !ipForm.ip_address.trim()}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingIP ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <ShieldAlert size={16} />
                )}
                {savingIP ? 'Bloqueando...' : 'Bloquear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default Security;
