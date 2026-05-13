import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import {
  Users,
  DollarSign,
  UserPlus,
  TrendingUp,
  Edit2,
  Trash2,
  RefreshCw,
  X,
  Save,
  Search,
} from 'lucide-react';
import {
  getResellers,
  createReseller,
  updateReseller,
  deleteReseller,
  getResellersStats,
  type Reseller,
} from '@/services/adminService';
import { logger } from '@/utils/logger';

const Resellers: React.FC = () => {
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [stats, setStats] = useState({ total: 0, totalBalance: 0, totalCommissions: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingReseller, setEditingReseller] = useState<Reseller | null>(null);
  const [form, setForm] = useState({ admin_id: '', commission_rate: 10, pix_key: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.allSettled([getResellers(), getResellersStats()]);
      if (r.status === 'fulfilled') setResellers(r.value);
      if (s.status === 'fulfilled') setStats(s.value);
    } catch (e) {
      logger.error('Erro ao carregar revendedores:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = resellers.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (r.admin?.name || '').toLowerCase().includes(term) ||
      (r.admin?.email || '').toLowerCase().includes(term) ||
      (r.pix_key || '').toLowerCase().includes(term)
    );
  });

  const openModal = (reseller?: Reseller) => {
    if (reseller) {
      setEditingReseller(reseller);
      setForm({
        admin_id: reseller.admin_id,
        commission_rate: reseller.commission_rate,
        pix_key: reseller.pix_key || '',
        notes: reseller.notes || '',
      });
    } else {
      setEditingReseller(null);
      setForm({ admin_id: '', commission_rate: 10, pix_key: '', notes: '' });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingReseller) {
        const ok = await updateReseller(editingReseller.id, form);
        if (ok) {
          setResellers((prev) =>
            prev.map((r) => (r.id === editingReseller.id ? { ...r, ...form } : r))
          );
          setShowModal(false);
        }
      } else {
        if (!form.admin_id.trim()) return;
        const created = await createReseller({ ...form, balance: 0 });
        if (created) {
          setResellers((prev) => [created, ...prev]);
          setStats((prev) => ({ ...prev, total: prev.total + 1 }));
          setShowModal(false);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este revendedor?')) return;
    const ok = await deleteReseller(id);
    if (ok) {
      setResellers((prev) => prev.filter((r) => r.id !== id));
      setStats((prev) => ({ ...prev, total: prev.total - 1 }));
    }
  };

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-1">Revendedores</h2>
            <p className="text-white/40 text-sm">
              Gerencie parceiros e comissões.{' '}
              <span className="text-white/20">{stats.total} revendedores</span>
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
              onClick={() => openModal()}
              className="px-6 py-3 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all flex items-center gap-2"
            >
              <UserPlus size={18} /> Novo Revendedor
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#121217] border border-white/5 rounded-3xl p-6">
            <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20 w-fit mb-4">
              <Users size={24} />
            </div>
            <h3 className="text-4xl font-black text-white mb-1">{loading ? '—' : stats.total}</h3>
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest">
              Total de Revendedores
            </p>
          </div>
          <div className="bg-[#121217] border border-white/5 rounded-3xl p-6">
            <div className="p-3 rounded-2xl bg-green-500/10 text-green-500 border border-green-500/20 w-fit mb-4">
              <DollarSign size={24} />
            </div>
            <h3 className="text-4xl font-black text-white mb-1">
              {loading ? '—' : fmt(stats.totalBalance)}
            </h3>
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest">
              Saldo Total Pendente
            </p>
          </div>
          <div className="bg-[#121217] border border-white/5 rounded-3xl p-6">
            <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-500 border border-purple-500/20 w-fit mb-4">
              <TrendingUp size={24} />
            </div>
            <h3 className="text-4xl font-black text-white mb-1">
              {loading ? '—' : `${stats.totalCommissions.toFixed(1)}%`}
            </h3>
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest">
              Comissão Média
            </p>
          </div>
        </div>

        {/* Tabela */}
        <div className="bg-[#121217] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-white/5">
            <div className="relative w-full md:w-96">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                size={18}
              />
              <input
                type="text"
                placeholder="Buscar revendedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-red-600/50 placeholder:text-white/20"
              />
            </div>
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw size={32} className="mx-auto animate-spin text-white/20 mb-4" />
              <p className="text-white/30 font-bold">Carregando revendedores...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center">
              <Users size={48} className="mx-auto text-white/10 mb-4" />
              <p className="text-white/30 font-bold text-lg">Nenhum revendedor encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-white/40 text-xs uppercase tracking-wider font-bold">
                  <tr>
                    <th className="px-6 py-4">Revendedor</th>
                    <th className="px-6 py-4">Comissão</th>
                    <th className="px-6 py-4">Saldo</th>
                    <th className="px-6 py-4">PIX</th>
                    <th className="px-6 py-4">Criado em</th>
                    <th className="px-6 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((reseller) => (
                    <tr key={reseller.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-900 flex items-center justify-center font-bold text-sm border border-white/10">
                            {(reseller.admin?.name || reseller.admin_id || '?')
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-white">{reseller.admin?.name || 'N/A'}</p>
                            <p className="text-white/40 text-xs">
                              {reseller.admin?.email || reseller.admin_id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          {reseller.commission_rate}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-green-400 font-bold">
                        {fmt(reseller.balance || 0)}
                      </td>
                      <td className="px-6 py-4 text-white/50 text-xs font-mono">
                        {reseller.pix_key || '—'}
                      </td>
                      <td className="px-6 py-4 text-white/40 text-xs">
                        {new Date(reseller.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openModal(reseller)}
                            className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(reseller.id)}
                            className="p-2 hover:bg-red-500/20 rounded-lg text-white/40 hover:text-red-500 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a20] w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">
                {editingReseller ? 'Editar Revendedor' : 'Novo Revendedor'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              {!editingReseller && (
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                    Admin ID
                  </label>
                  <input
                    type="text"
                    value={form.admin_id}
                    onChange={(e) => setForm((p) => ({ ...p, admin_id: e.target.value }))}
                    placeholder="UUID do admin"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-red-500/50"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                    Comissão (%)
                  </label>
                  <input
                    type="number"
                    value={form.commission_rate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, commission_rate: parseFloat(e.target.value) || 0 }))
                    }
                    min={0}
                    max={100}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                    Chave PIX
                  </label>
                  <input
                    type="text"
                    value={form.pix_key}
                    onChange={(e) => setForm((p) => ({ ...p, pix_key: e.target.value }))}
                    placeholder="CPF, email ou chave"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                  Observações
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  placeholder="Notas sobre este revendedor..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default Resellers;
