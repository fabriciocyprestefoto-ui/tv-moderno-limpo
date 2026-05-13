import React, { useState, useEffect } from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import { DollarSign, Users, Plus, Trash2, Save, Edit2 } from 'lucide-react';
import {
  getAllPlans,
  getPaymentSettings,
  updatePlan,
  deletePlan,
  updatePaymentSettings,
  Plan,
  PaymentSettingsDB,
} from '../../services/supabaseService';
import { useToast } from '@/contexts/ToastContext';
import { logger } from '@/utils/logger';

type PaymentSettings = PaymentSettingsDB;

const Finance: React.FC = () => {
  const { showToast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({
    id: '',
    pix_key: '',
    pix_name: '',
    bank_name: '',
    bank_agency: '',
    bank_account: '',
    instructions: '',
  });
  const [_loading, setLoading] = useState(true);

  // Edit Plan State
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isNewPlan, setIsNewPlan] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([getAllPlans(), getPaymentSettings()]);
      setPlans(p);
      if (s) setPaymentSettings(s);
    } catch (error) {
      logger.error('Erro ao carregar dados financeiros:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePayment = async () => {
    const updated = await updatePaymentSettings(paymentSettings);
    if (updated) showToast('Dados bancários atualizados!', 'success');
  };

  const handleSavePlan = async () => {
    if (!editingPlan) return;
    const saved = await updatePlan(editingPlan);
    if (saved) {
      if (isNewPlan) {
        setPlans([...plans, saved]);
      } else {
        setPlans(plans.map((p) => (p.id === saved.id ? saved : p)));
      }
      setEditingPlan(null);
      setIsNewPlan(false);
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este plano?')) {
      const success = await deletePlan(id);
      if (success) {
        setPlans(plans.filter((p) => p.id !== id));
      }
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-1">Financeiro & Planos</h2>
          <p className="text-white/40 text-sm">
            Gerencie preços, assinaturas e dados de recebimento.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Coluna da Esquerda: Planos */}
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Users className="text-blue-500" size={20} /> Planos de Assinatura
              </h3>
              <button
                onClick={() => {
                  setEditingPlan({
                    id: '',
                    name: '',
                    price: 0,
                    description: '',
                    features: [],
                    active: true,
                  });
                  setIsNewPlan(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
              >
                <Plus size={16} /> Novo Plano
              </button>
            </div>

            <div className="grid gap-4">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="bg-[#121217] border border-white/5 p-6 rounded-2xl flex justify-between items-center group hover:border-white/20 transition-all"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="font-bold text-lg">{plan.name}</h4>
                      {plan.active ? (
                        <span className="text-[10px] bg-green-500/20 text-green-500 px-2 py-1 rounded font-bold uppercase">
                          Ativo
                        </span>
                      ) : (
                        <span className="text-[10px] bg-red-500/20 text-red-500 px-2 py-1 rounded font-bold uppercase">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className="text-2xl font-black text-white mb-1">
                      R$ {plan.price.toFixed(2)}
                    </div>
                    <p className="text-sm text-white/40">{plan.description}</p>
                    <div className="flex gap-2 mt-2">
                      {plan.features?.map((f, i) => (
                        <span
                          key={i}
                          className="text-[10px] bg-white/5 px-2 py-1 rounded text-white/60"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingPlan(plan);
                        setIsNewPlan(false);
                      }}
                      className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDeletePlan(plan.id)}
                      className="p-2 hover:bg-red-500/20 rounded-lg text-white/60 hover:text-red-500"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Coluna da Direita: Dados Bancários */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <DollarSign className="text-green-500" size={20} /> Dados de Recebimento
            </h3>

            <div className="bg-[#121217] border border-white/5 p-8 rounded-2xl space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                    Chave PIX
                  </label>
                  <input
                    type="text"
                    value={paymentSettings.pix_key}
                    onChange={(e) =>
                      setPaymentSettings({ ...paymentSettings, pix_key: e.target.value })
                    }
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:border-green-500 outline-none transition-colors font-mono"
                    placeholder="CPF, Email ou Aleatória"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                    Nome do Titular PIX
                  </label>
                  <input
                    type="text"
                    value={paymentSettings.pix_name}
                    onChange={(e) =>
                      setPaymentSettings({ ...paymentSettings, pix_name: e.target.value })
                    }
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:border-green-500 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                    Banco
                  </label>
                  <input
                    type="text"
                    value={paymentSettings.bank_name}
                    onChange={(e) =>
                      setPaymentSettings({ ...paymentSettings, bank_name: e.target.value })
                    }
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:border-green-500 outline-none transition-colors"
                    placeholder="Ex: Nubank"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                    Agência / Conta
                  </label>
                  <input
                    type="text"
                    value={paymentSettings.bank_account}
                    onChange={(e) =>
                      setPaymentSettings({ ...paymentSettings, bank_account: e.target.value })
                    }
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:border-green-500 outline-none transition-colors"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                    Instruções Adicionais
                  </label>
                  <textarea
                    rows={3}
                    value={paymentSettings.instructions}
                    onChange={(e) =>
                      setPaymentSettings({ ...paymentSettings, instructions: e.target.value })
                    }
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:border-green-500 outline-none transition-colors resize-none text-sm"
                    placeholder="Ex: Enviar comprovante para o WhatsApp..."
                  />
                </div>
              </div>

              <button
                onClick={handleSavePayment}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-green-600/20 transition-all flex items-center justify-center gap-2"
              >
                <Save size={18} /> Salvar Dados Bancários
              </button>
            </div>
          </div>
        </div>

        {/* Modal de Edição de Plano */}
        {editingPlan && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1a1a20] w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl p-8 animate-in zoom-in-95 duration-200">
              <h3 className="text-2xl font-bold mb-6">
                {isNewPlan ? 'Novo Plano' : 'Editar Plano'}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                    Nome do Plano
                  </label>
                  <input
                    type="text"
                    value={editingPlan.name}
                    onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:border-blue-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                      Preço (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingPlan.price}
                      onChange={(e) =>
                        setEditingPlan({ ...editingPlan, price: parseFloat(e.target.value) })
                      }
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="flex items-center pt-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingPlan.active}
                        onChange={(e) =>
                          setEditingPlan({ ...editingPlan, active: e.target.checked })
                        }
                        className="w-5 h-5 rounded border-white/20 bg-black/40 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-bold">Plano Ativo</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                    Descrição Curta
                  </label>
                  <input
                    type="text"
                    value={editingPlan.description}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, description: e.target.value })
                    }
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                    Recursos (separados por vírgula)
                  </label>
                  <input
                    type="text"
                    value={editingPlan.features?.join(', ')}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        features: e.target.value.split(',').map((s) => s.trim()),
                      })
                    }
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:border-blue-500 outline-none"
                    placeholder="Ex: 4K, 3 Telas, Download"
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => setEditingPlan(null)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-white/5 hover:bg-white/10 text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavePlan}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  Salvar Plano
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default Finance;
