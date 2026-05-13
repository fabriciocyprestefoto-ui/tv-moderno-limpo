import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Copy,
  Trash2,
  Power,
  RefreshCw,
  CheckCircle,
  XCircle,
  LogOut,
  Infinity as InfinityIcon,
  Clock,
} from 'lucide-react';
import {
  generateAccessCode,
  getAllAccessCodes,
  deactivateAccessCode,
  deleteAccessCode,
  type AccessCode,
} from '@/services/accessCodeService';
import { ACCESS_CODE_PLACEHOLDER, formatAccessCode } from '@/utils/accessCode';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { logger } from '@/utils/logger';

type ConfirmAction = { kind: 'deactivate' | 'delete'; id: string };

export default function AccessCodes() {
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [lastGeneratedCode, setLastGeneratedCode] = useState<AccessCode | null>(null);
  const [signingOutToTest, setSigningOutToTest] = useState(false);
  const { signOut } = useAuth();
  const { showToast } = useToast();

  // Form state
  const [formType, setFormType] = useState<'trial' | 'full' | 'reseller'>('trial');
  const [formDuration, setFormDuration] = useState(7);
  const [formNotes, setFormNotes] = useState('');
  const [formNoExpiry, setFormNoExpiry] = useState(false);
  const [formUnlimitedUses, setFormUnlimitedUses] = useState(false);
  const [formMaxUses, setFormMaxUses] = useState(1);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const confirmPrimaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    loadCodes();
  }, []);

  useEffect(() => {
    if (!confirmAction) return;
    const id = window.setTimeout(() => confirmPrimaryRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [confirmAction]);

  useEffect(() => {
    if (!confirmAction) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Back' || e.key === 'GoBack' || e.key === 'BrowserBack') {
        e.preventDefault();
        setConfirmAction(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirmAction]);

  const loadCodes = async () => {
    setLoading(true);
    const data = await getAllAccessCodes();
    setCodes(data);
    setLoading(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    logger.debug('[AccessCodes] Gerando código:', {
      type: formType,
      duration_days: formDuration,
      max_uses: 1,
      metadata: { notes: formNotes },
    });

    const { code, error } = await generateAccessCode({
      type: formType,
      duration_days: formDuration,
      max_uses: formUnlimitedUses ? null : formMaxUses,
      no_expiry: formNoExpiry,
      metadata: { notes: formNotes },
    });

    logger.debug('[AccessCodes] Resultado:', { code: !!code, error });

    if (error) {
      logger.error('[AccessCodes] Erro ao gerar código:', error);
      showToast(`Erro ao gerar código: ${error}`, 'error', 8000);
    } else if (code) {
      logger.debug('[AccessCodes] Código gerado:', code.id);
      setCodes((prev) => [code, ...prev]);
      setLastGeneratedCode(code);
      setShowForm(false);
      // Reset form
      setFormType('trial');
      setFormDuration(7);
      setFormNotes('');
      setFormNoExpiry(false);
      setFormUnlimitedUses(false);
      setFormMaxUses(1);
      // Copy to clipboard
      const formattedCode = formatAccessCode(code.code);
      navigator.clipboard.writeText(formattedCode);
      const expiryInfo = formNoExpiry
        ? 'sem data de expiração'
        : `válida até ${formatDateTime(code.expires_at)}`;
      const usesInfo = formUnlimitedUses ? 'usos ilimitados' : `máximo ${formMaxUses} uso(s)`;
      showToast(
        `Chave ${formattedCode} gerada e copiada. ${expiryInfo} · ${usesInfo}. Saia da sessão atual no mesmo aparelho antes de testar.`,
        'success',
        9000
      );
    } else {
      logger.error('[AccessCodes] Nenhum código retornado e nenhum erro');
      showToast('Nenhum código foi gerado. Tente de novo ou veja o console (F12).', 'error', 8000);
    }
    setGenerating(false);
  };

  const handleCopy = (code: string) => {
    const formattedCode = formatAccessCode(code);
    navigator.clipboard.writeText(formattedCode);
    showToast(`Chave ${formattedCode} copiada.`, 'success', 4000);
  };

  const handleSignOutToTest = async () => {
    setSigningOutToTest(true);
    try {
      await signOut();
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } finally {
      setSigningOutToTest(false);
    }
  };

  const handleDeactivate = (id: string) => setConfirmAction({ kind: 'deactivate', id });

  const handleDelete = (id: string) => setConfirmAction({ kind: 'delete', id });

  const executeConfirm = async () => {
    if (!confirmAction) return;
    const { kind, id } = confirmAction;
    setConfirmAction(null);
    if (kind === 'deactivate') {
      const success = await deactivateAccessCode(id);
      if (success) {
        setCodes((prev) => prev.map((c) => (c.id === id ? { ...c, is_active: false } : c)));
      }
      return;
    }
    const success = await deleteAccessCode(id);
    if (success) {
      setCodes((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'trial':
        return 'bg-blue-600/20 text-blue-400 border-blue-500/30';
      case 'full':
        return 'bg-green-600/20 text-green-400 border-green-500/30';
      case 'reseller':
        return 'bg-purple-600/20 text-purple-400 border-purple-500/30';
      default:
        return 'bg-gray-600/20 text-gray-400 border-gray-500/30';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'trial':
        return 'Teste';
      case 'full':
        return 'Completo';
      case 'reseller':
        return 'Revenda';
      default:
        return type;
    }
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return 'Sem expiração';
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const previewExpiration = new Date();
  previewExpiration.setDate(previewExpiration.getDate() + formDuration);

  return (
    <div className="min-h-screen bg-transparent text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-black tracking-tight mb-2">Códigos de Acesso</h1>
            <p className="text-white/40 text-sm">
              Gere chaves de 16 caracteres, com letra, número e caractere especial, válidas para um
              único login.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={loadCodes}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center gap-2"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-6 py-2 rounded-xl bg-[#E50914] hover:bg-[#E50914]/90 font-bold transition-colors flex items-center gap-2"
            >
              <Plus size={18} />
              Gerar Código
            </button>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <div className="mb-8 p-6 rounded-2xl bg-white/5 border border-white/10">
            <h3 className="text-xl font-bold mb-4">Novo Código de Acesso</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Tipo */}
              <div>
                <label className="block text-sm font-bold text-white/60 mb-2">Tipo</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as 'trial' | 'full' | 'reseller')}
                  className="w-full px-4 py-2 rounded-xl bg-black/40 border border-white/10 focus:border-[#E50914] outline-none"
                >
                  <option value="trial">Teste (Trial)</option>
                  <option value="full">Completo</option>
                  <option value="reseller">Revenda</option>
                </select>
              </div>

              {/* Duração — desabilitado quando sem expiração */}
              <div>
                <label className="block text-sm font-bold text-white/60 mb-2">Duração (dias)</label>
                <input
                  type="number"
                  value={formDuration}
                  onChange={(e) => setFormDuration(parseInt(e.target.value) || 7)}
                  min={1}
                  disabled={formNoExpiry}
                  className="w-full px-4 py-2 rounded-xl bg-black/40 border border-white/10 focus:border-[#E50914] outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>

              {/* Toggle: Sem expiração */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormNoExpiry((v) => !v)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${formNoExpiry ? 'bg-emerald-500' : 'bg-white/15'}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${formNoExpiry ? 'translate-x-5' : 'translate-x-0.5'}`}
                  />
                </button>
                <div className="flex items-center gap-1.5">
                  <Clock
                    size={14}
                    className={formNoExpiry ? 'text-emerald-400' : 'text-white/40'}
                  />
                  <span
                    className={`text-sm font-bold ${formNoExpiry ? 'text-emerald-300' : 'text-white/60'}`}
                  >
                    {formNoExpiry ? 'Sem expiração' : 'Com expiração'}
                  </span>
                </div>
              </div>

              {/* Toggle: Usos ilimitados + campo de usos */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFormUnlimitedUses((v) => !v)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${formUnlimitedUses ? 'bg-purple-500' : 'bg-white/15'}`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${formUnlimitedUses ? 'translate-x-5' : 'translate-x-0.5'}`}
                    />
                  </button>
                  <div className="flex items-center gap-1.5">
                    <InfinityIcon
                      size={14}
                      className={formUnlimitedUses ? 'text-purple-400' : 'text-white/40'}
                    />
                    <span
                      className={`text-sm font-bold ${formUnlimitedUses ? 'text-purple-300' : 'text-white/60'}`}
                    >
                      {formUnlimitedUses ? 'Usos ilimitados' : 'Limitar usos'}
                    </span>
                  </div>
                </div>
                {!formUnlimitedUses && (
                  <input
                    type="number"
                    value={formMaxUses}
                    onChange={(e) => setFormMaxUses(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                    placeholder="Nº de usos"
                    className="w-full px-4 py-2 rounded-xl bg-black/40 border border-white/10 focus:border-[#E50914] outline-none text-sm"
                  />
                )}
              </div>

              {/* Notas */}
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-white/60 mb-2">
                  Notas (opcional)
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ex: Cliente teste, campanha X"
                  className="w-full px-4 py-2 rounded-xl bg-black/40 border border-white/10 focus:border-[#E50914] outline-none"
                />
              </div>
            </div>

            {/* Preview da chave */}
            <div className="mb-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/40 mb-3">
                Resumo da Chave
              </p>
              <div className="grid gap-3 md:grid-cols-3 text-sm">
                <div>
                  <p className="text-white/40 mb-1">Formato</p>
                  <code className="font-mono text-base text-white">{ACCESS_CODE_PLACEHOLDER}</code>
                </div>
                <div>
                  <p className="text-white/40 mb-1">Usos</p>
                  {formUnlimitedUses ? (
                    <p className="font-semibold text-purple-300 flex items-center gap-1">
                      <InfinityIcon size={14} /> Ilimitado
                    </p>
                  ) : (
                    <p className="font-semibold text-amber-300">{formMaxUses} uso(s) por chave</p>
                  )}
                </div>
                <div>
                  <p className="text-white/40 mb-1">Validade</p>
                  {formNoExpiry ? (
                    <p className="font-semibold text-emerald-300 flex items-center gap-1">
                      <Clock size={14} /> Sem expiração
                    </p>
                  ) : (
                    <p className="font-semibold text-white">
                      {formatDateTime(previewExpiration.toISOString())}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-6 py-2 rounded-xl bg-[#E50914] hover:bg-[#E50914]/90 font-bold transition-colors disabled:opacity-50"
              >
                {generating ? 'Gerando...' : 'Gerar Código'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-6 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {lastGeneratedCode && (
          <div className="mb-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-300/70 mb-2">
              Última chave gerada
            </p>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <code className="block text-2xl font-black tracking-[0.18em] text-white break-all">
                  {formatAccessCode(lastGeneratedCode.code)}
                </code>
                <p className="text-sm text-white/60 mt-2">
                  Válida até {formatDateTime(lastGeneratedCode.expires_at)} e desativada após o
                  primeiro login.
                </p>
                <p className="text-xs text-amber-200/80 mt-2">
                  Para testar no mesmo aparelho, saia da sessão atual antes de usar a chave.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleCopy(lastGeneratedCode.code)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-bold transition-colors hover:bg-white/10"
                >
                  <Copy size={16} />
                  Copiar chave
                </button>
                <button
                  onClick={handleSignOutToTest}
                  disabled={signingOutToTest}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-2 font-bold text-amber-100 transition-colors hover:bg-amber-500/15 disabled:opacity-60"
                >
                  <LogOut size={16} />
                  {signingOutToTest ? 'Saindo...' : 'Sair e testar chave'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <p className="text-white/40 text-xs font-bold uppercase tracking-wider mb-1">Total</p>
            <p className="text-3xl font-black">{codes.length}</p>
          </div>
          <div className="p-4 rounded-xl bg-green-600/10 border border-green-500/30">
            <p className="text-green-400/60 text-xs font-bold uppercase tracking-wider mb-1">
              Ativos
            </p>
            <p className="text-3xl font-black text-green-400">
              {codes.filter((c) => c.is_active && !isExpired(c.expires_at)).length}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-blue-600/10 border border-blue-500/30">
            <p className="text-blue-400/60 text-xs font-bold uppercase tracking-wider mb-1">
              Usos Totais
            </p>
            <p className="text-3xl font-black text-blue-400">
              {codes.reduce((sum, c) => sum + c.current_uses, 0)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-red-600/10 border border-red-500/30">
            <p className="text-red-400/60 text-xs font-bold uppercase tracking-wider mb-1">
              Expirados
            </p>
            <p className="text-3xl font-black text-red-400">
              {codes.filter((c) => isExpired(c.expires_at)).length}
            </p>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12">
            <RefreshCw size={32} className="animate-spin mx-auto text-white/20 mb-4" />
            <p className="text-white/30">Carregando códigos...</p>
          </div>
        ) : codes.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl">
            <p className="text-white/30 mb-4">Nenhum código gerado ainda</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-6 py-2 rounded-xl bg-[#E50914] hover:bg-[#E50914]/90 font-bold transition-colors"
            >
              Gerar Primeiro Código
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-white/40">
                    Código
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-white/40">
                    Tipo
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-white/40">
                    Duração
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-white/40">
                    Usos
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-white/40">
                    Expira em
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-white/40">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-white/40">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {codes.map((code) => {
                  const expired = isExpired(code.expires_at);
                  const used = code.max_uses !== null && code.current_uses >= code.max_uses;
                  const active = code.is_active && !expired && !used;
                  return (
                    <tr key={code.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <code className="text-sm md:text-lg font-mono font-bold tracking-[0.16em] break-all">
                            {formatAccessCode(code.code)}
                          </code>
                          <button
                            onClick={() => handleCopy(code.code)}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                            title="Copiar"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                        {typeof code.metadata?.notes === 'string' && code.metadata.notes.trim() && (
                          <p className="text-xs text-white/30 mt-1">{code.metadata.notes}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${getTypeColor(
                            code.type
                          )}`}
                        >
                          {getTypeLabel(code.type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">{code.duration_days} dias</td>
                      <td className="px-6 py-4 text-sm">
                        {code.current_uses} / {code.max_uses === null ? '∞' : code.max_uses}
                        <p className="text-xs text-white/35 mt-1">
                          {code.max_uses === null
                            ? 'ilimitado'
                            : code.max_uses === 1
                              ? 'uso único'
                              : `${code.max_uses} usos`}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-sm text-white/60">
                        {code.expires_at ? (
                          formatDateTime(code.expires_at)
                        ) : (
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <Clock size={12} /> Sem expiração
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {active ? (
                          <span className="flex items-center gap-1 text-green-400 text-xs font-bold">
                            <CheckCircle size={14} />
                            Ativo
                          </span>
                        ) : used ? (
                          <span className="flex items-center gap-1 text-amber-300 text-xs font-bold">
                            <CheckCircle size={14} />
                            Utilizado
                          </span>
                        ) : expired ? (
                          <span className="flex items-center gap-1 text-red-400 text-xs font-bold">
                            <XCircle size={14} />
                            Expirado
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-gray-400 text-xs font-bold">
                            <Power size={14} />
                            Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          {active && (
                            <button
                              onClick={() => handleDeactivate(code.id)}
                              className="p-2 hover:bg-yellow-600/20 rounded transition-colors"
                              title="Desativar"
                            >
                              <Power size={16} className="text-yellow-400" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(code.id)}
                            className="p-2 hover:bg-red-600/20 rounded transition-colors"
                            title="Deletar"
                          >
                            <Trash2 size={16} className="text-red-400" />
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
      </div>

      {confirmAction && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/75"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="access-code-confirm-title"
        >
          <div className="max-w-md w-full rounded-2xl border border-white/15 bg-[#14141c] p-6 shadow-2xl">
            <h2 id="access-code-confirm-title" className="text-lg font-black mb-2 text-white">
              {confirmAction.kind === 'deactivate'
                ? 'Desativar este código?'
                : 'Deletar permanentemente?'}
            </h2>
            <p className="text-white/55 text-sm mb-6 leading-relaxed">
              {confirmAction.kind === 'deactivate'
                ? 'O código deixará de aceitar novos logins. Você pode gerar outro depois.'
                : 'Esta ação remove o registro do banco e não pode ser desfeita.'}
            </p>
            <div className="flex flex-wrap gap-3 justify-end">
              <button
                type="button"
                data-nav-item
                tabIndex={0}
                onClick={() => setConfirmAction(null)}
                className="px-5 py-2.5 rounded-xl font-bold text-sm border border-white/20 bg-white/5 text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                Cancelar
              </button>
              <button
                ref={confirmPrimaryRef}
                type="button"
                data-nav-item
                tabIndex={0}
                onClick={() => void executeConfirm()}
                className="px-5 py-2.5 rounded-xl font-bold text-sm bg-[#E50914] text-white hover:bg-[#E50914]/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
              >
                {confirmAction.kind === 'deactivate' ? 'Desativar' : 'Deletar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
