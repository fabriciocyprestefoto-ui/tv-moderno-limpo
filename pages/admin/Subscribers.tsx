import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import {
  Search,
  Edit2,
  Ban,
  Trash2,
  CheckCircle,
  RefreshCw,
  Users,
  X,
  Save,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import {
  getSubscribers,
  updateSubscription,
  updateSubscriptionStatus,
  deleteSubscription,
  createSubscriber,
  type SubscriberRow,
} from '@/services/adminService';
import { getAllPlans, type Plan } from '@/services/supabaseService';
import { logger } from '@/utils/logger';

const PAGE_SIZE = 15;

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: 'Ativo', color: 'text-green-400' },
  inactive: { label: 'Inativo', color: 'text-yellow-400' },
  canceled: { label: 'Cancelado', color: 'text-red-400' },
  blocked: { label: 'Bloqueado', color: 'text-red-500' },
  expired: { label: 'Expirado', color: 'text-orange-400' },
};

const Subscribers: React.FC = () => {
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [planFilter, setPlanFilter] = useState('Todos');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modal de edição
  const [editingSub, setEditingSub] = useState<SubscriberRow | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editPlanId, setEditPlanId] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [saving, setSaving] = useState(false);

  // Modal de novo usuário
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPlanId, setCreatePlanId] = useState('');
  const [createDuration, setCreateDuration] = useState(30);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSubscribers(page, PAGE_SIZE, searchTerm, statusFilter, planFilter);
      setSubscribers(result.data);
      setTotal(result.total);
    } catch (e) {
      logger.error('Erro ao carregar assinantes:', e);
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, statusFilter, planFilter]);

  useEffect(() => {
    loadData();
    getAllPlans()
      .then(setPlans)
      .catch((err) => logger.error('Erro ao carregar planos:', err));
  }, [loadData]);

  // Debounce de search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchTerm(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === subscribers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(subscribers.map((s) => s.id)));
    }
  };

  const handleEditSub = (sub: SubscriberRow) => {
    setEditingSub(sub);
    setEditStatus(sub.subscription?.status || 'active');
    setEditPlanId((sub as any).subscription?.plan_id || ''); // Assumindo que o DB retorna plan_id ou mapeamos do name
    // Se não tiver plan_id, tentamos achar pelo nome
    if (!(sub as any).subscription?.plan_id && sub.subscription?.plan_name) {
      const p = plans.find((pl) => pl.name === sub.subscription?.plan_name);
      if (p) setEditPlanId(p.id);
    }
    setEditExpiresAt(sub.subscription?.current_period_end?.split('T')[0] || '');
  };

  const handleSaveStatus = async () => {
    if (!editingSub) return;
    setSaving(true);
    try {
      const ok = await updateSubscription(editingSub.id, {
        status: editStatus,
        plan_id: editPlanId,
        expires_at: editExpiresAt ? new Date(editExpiresAt).toISOString() : undefined,
      });
      if (ok) {
        setSubscribers((prev) =>
          prev.map((s) =>
            s.id === editingSub.id
              ? {
                  ...s,
                  subscription: {
                    ...s.subscription!,
                    status: editStatus,
                    plan_name:
                      plans.find((p) => p.id === editPlanId)?.name ||
                      s.subscription?.plan_name ||
                      'N/A',
                    current_period_end: editExpiresAt || s.subscription?.current_period_end || '',
                  },
                }
              : s
          )
        );
        setEditingSub(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sub: SubscriberRow) => {
    if (!confirm(`Excluir assinatura de ${sub.email}?`)) return;
    const ok = await deleteSubscription(sub.id);
    if (ok) {
      setSubscribers((prev) => prev.filter((s) => s.id !== sub.id));
      setTotal((prev) => prev - 1);
    }
  };

  const handleCreate = async () => {
    if (!createName.trim()) {
      setCreateError('Nome obrigatório');
      return;
    }
    setCreating(true);
    setCreateError(null);
    const { success, error } = await createSubscriber({
      name: createName,
      email: createEmail,
      plan_id: createPlanId,
      duration_days: createDuration,
    });
    setCreating(false);
    if (!success) {
      setCreateError(error || 'Erro ao criar');
      return;
    }
    setShowCreateModal(false);
    setCreateName('');
    setCreateEmail('');
    setCreatePlanId('');
    setCreateDuration(30);
    loadData();
  };

  const handleBulkBlock = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Bloquear ${selected.size} assinantes selecionados?`)) return;
    const promises = Array.from(selected).map((id) => updateSubscriptionStatus(id, 'blocked'));
    await Promise.allSettled(promises);
    setSelected(new Set());
    loadData();
  };

  const getStatusInfo = (status?: string) =>
    statusMap[status || ''] || { label: status || 'N/A', color: 'text-white/40' };
  const getPlanColor = (plan?: string) => {
    if (!plan) return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    const p = plan.toLowerCase();
    if (p.includes('premium')) return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    if (p.includes('standard')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-1">Assinantes</h2>
            <p className="text-white/40 text-sm">
              Gerencie todos os usuários da plataforma.{' '}
              <span className="text-white/20">{total} assinantes</span>
            </p>
          </div>
          <div className="flex gap-2">
            {selected.size > 0 && (
              <button
                onClick={handleBulkBlock}
                className="px-4 py-3 rounded-xl bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 font-bold text-sm flex items-center gap-2"
              >
                <Ban size={16} /> Bloquear ({selected.size})
              </button>
            )}
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center gap-2"
            >
              <span className="text-lg leading-none">+</span> Novo Usuário
            </button>
            <button
              onClick={loadData}
              className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold flex items-center gap-2"
            >
              <RefreshCw size={16} /> Atualizar
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-[#121217] border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
            <input
              type="text"
              placeholder="Buscar por email ou ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-600/50 transition-all placeholder:text-white/20"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium outline-none cursor-pointer"
            >
              <option value="Todos">Status: Todos</option>
              <option value="active">Ativos</option>
              <option value="blocked">Bloqueados</option>
              <option value="canceled">Cancelados</option>
              <option value="expired">Expirados</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium outline-none cursor-pointer"
            >
              <option value="Todos">Plano: Todos</option>
              <option value="Premium">Premium</option>
              <option value="Standard">Standard</option>
              <option value="Básico">Básico</option>
            </select>
          </div>
        </div>

        {/* Tabela */}
        <div className="bg-[#121217] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw size={32} className="mx-auto animate-spin text-white/20 mb-4" />
              <p className="text-white/30 font-bold">Carregando assinantes...</p>
            </div>
          ) : subscribers.length === 0 ? (
            <div className="p-16 text-center">
              <Users size={48} className="mx-auto text-white/10 mb-4" />
              <p className="text-white/30 font-bold text-lg">Nenhum assinante encontrado</p>
              <p className="text-white/15 text-sm mt-1">Tente ajustar os filtros</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white/5 text-white/40 text-xs uppercase tracking-wider font-bold border-b border-white/5">
                  <tr>
                    <th className="px-6 py-5">
                      <input
                        type="checkbox"
                        checked={selected.size === subscribers.length && subscribers.length > 0}
                        onChange={toggleAll}
                        className="rounded border-white/20 bg-white/5 cursor-pointer"
                      />
                    </th>
                    <th className="px-6 py-5">Usuário</th>
                    <th className="px-6 py-5">Plano</th>
                    <th className="px-6 py-5">Status</th>
                    <th className="px-6 py-5">Vencimento</th>
                    <th className="px-6 py-5">Criado em</th>
                    <th className="px-6 py-5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {subscribers.map((sub) => {
                    const st = getStatusInfo(sub.subscription?.status);
                    return (
                      <tr
                        key={sub.id}
                        className={`hover:bg-white/5 transition-colors group ${selected.has(sub.id) ? 'bg-red-600/5' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selected.has(sub.id)}
                            onChange={() => toggleSelect(sub.id)}
                            className="rounded border-white/20 bg-white/5 cursor-pointer"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center font-bold text-sm border border-white/10">
                              {(sub.email || '?').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-white text-sm">{sub.email || sub.id}</p>
                              <p className="text-white/30 text-xs font-mono">
                                {sub.id.slice(0, 8)}…
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold border ${getPlanColor(sub.subscription?.plan_name)}`}
                          >
                            {sub.subscription?.plan_name || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {sub.subscription?.status === 'active' ? (
                              <CheckCircle size={14} className="text-green-500" />
                            ) : (
                              <AlertTriangle size={14} className={st.color} />
                            )}
                            <span className={`text-sm font-medium ${st.color}`}>{st.label}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-white/60 font-mono">
                          {sub.subscription?.current_period_end
                            ? new Date(sub.subscription.current_period_end).toLocaleDateString(
                                'pt-BR'
                              )
                            : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-white/40">
                          {new Date(sub.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEditSub(sub)}
                              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                              title="Editar Status"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(sub)}
                              className="p-2 rounded-lg hover:bg-red-500/20 text-white/60 hover:text-red-500 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          {!loading && total > 0 && (
            <div className="p-4 border-t border-white/5 flex justify-between items-center text-sm text-white/40">
              <p>
                Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de{' '}
                {total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 flex items-center gap-1"
                >
                  <ChevronLeft size={16} /> Anterior
                </button>
                <span className="px-4 py-2 text-white/60 font-mono">
                  {page}/{totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 flex items-center gap-1"
                >
                  Próximo <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Criar Usuário */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a20] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Novo Assinante</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              {createError && (
                <div className="p-3 rounded-xl bg-red-600/10 border border-red-500/20 text-red-400 text-sm">
                  {createError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                  Nome / Identificação
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Ex: João Silva"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50 placeholder:text-white/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                  Email (opcional)
                </label>
                <input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50 placeholder:text-white/20"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                  Plano
                </label>
                <select
                  value={createPlanId}
                  onChange={(e) => setCreatePlanId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50"
                  title="Selecione o plano"
                >
                  <option value="">Selecione um plano...</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                  Duração (dias)
                </label>
                <input
                  type="number"
                  value={createDuration}
                  onChange={(e) => setCreateDuration(parseInt(e.target.value) || 30)}
                  min={1}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                {creating ? 'Criando...' : 'Criar Assinante'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edição de Status */}
      {editingSub && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a20] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Editar Assinatura</h3>
              <button
                onClick={() => setEditingSub(null)}
                className="p-2 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-white/5 rounded-xl">
                <p className="text-xs text-white/40 uppercase tracking-widest font-bold mb-1">
                  Usuário
                </p>
                <p className="font-bold">{editingSub.email}</p>
                <p className="text-xs text-white/30 font-mono">{editingSub.id}</p>
              </div>
              <div className="p-4 bg-white/5 rounded-xl">
                <p className="text-xs text-white/40 uppercase tracking-widest font-bold mb-1">
                  Plano Atual
                </p>
                <p className="font-bold">{editingSub.subscription?.plan_name || 'N/A'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                    Plano
                  </label>
                  <select
                    value={editPlanId}
                    onChange={(e) => setEditPlanId(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50"
                  >
                    <option value="">Selecione...</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                    <option value="blocked">Bloqueado</option>
                    <option value="canceled">Cancelado</option>
                    <option value="expired">Expirado</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                  Vencimento
                </label>
                <input
                  type="date"
                  value={editExpiresAt}
                  onChange={(e) => setEditExpiresAt(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setEditingSub(null)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveStatus}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
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

export default Subscribers;
