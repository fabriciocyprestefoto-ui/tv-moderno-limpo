import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import {
  Tv,
  RefreshCw,
  Play,
  Trash2,
  Plus,
  List,
  X,
  Save,
  Search,
  Edit2,
  Globe,
} from 'lucide-react';
import {
  getM3USources,
  createM3USource,
  updateM3USource,
  deleteM3USource,
  getChannelsAdmin,
  createChannel,
  updateChannel,
  deleteChannel,
  type M3USource,
} from '@/services/adminService';
import { logger } from '@/utils/logger';

const IPTV: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'sources' | 'channels'>('sources');
  const [sources, setSources] = useState<M3USource[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todos');

  // Modal de fonte
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [editingSource, setEditingSource] = useState<M3USource | null>(null);
  const [sourceForm, setSourceForm] = useState({
    name: '',
    url: '',
    auto_update: true,
    update_interval: 24,
  });
  const [savingSource, setSavingSource] = useState(false);

  // Modal de canal
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<any>(null);
  const [channelForm, setChannelForm] = useState({ nome: '', logo: '', genero: '', url: '' });
  const [savingChannel, setSavingChannel] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.allSettled([getM3USources(), getChannelsAdmin()]);
      if (s.status === 'fulfilled') setSources(s.value);
      if (c.status === 'fulfilled') setChannels(c.value);
    } catch (e) {
      logger.error('Erro ao carregar IPTV:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const categories = Array.from(new Set(channels.map((c: any) => c.genero).filter(Boolean))).sort();

  const filteredChannels = channels.filter((c: any) => {
    const matchSearch =
      !searchTerm || (c.nome || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = categoryFilter === 'Todos' || c.genero === categoryFilter;
    return matchSearch && matchCat;
  });

  // --- Handlers Fontes ---
  const openSourceModal = (source?: M3USource) => {
    if (source) {
      setEditingSource(source);
      setSourceForm({
        name: source.name,
        url: source.url,
        auto_update: source.auto_update,
        update_interval: source.update_interval,
      });
    } else {
      setEditingSource(null);
      setSourceForm({ name: '', url: '', auto_update: true, update_interval: 24 });
    }
    setShowSourceModal(true);
  };

  const handleSaveSource = async () => {
    if (!sourceForm.name.trim() || !sourceForm.url.trim()) return;
    setSavingSource(true);
    try {
      if (editingSource) {
        const ok = await updateM3USource(editingSource.id, sourceForm);
        if (ok)
          setSources((prev) =>
            prev.map((s) => (s.id === editingSource.id ? { ...s, ...sourceForm } : s))
          );
      } else {
        const created = await createM3USource({ ...sourceForm, status: 'active' });
        if (created) setSources((prev) => [created, ...prev]);
      }
      setShowSourceModal(false);
    } finally {
      setSavingSource(false);
    }
  };

  const handleDeleteSource = async (id: string) => {
    if (!confirm('Excluir esta fonte M3U?')) return;
    const ok = await deleteM3USource(id);
    if (ok) setSources((prev) => prev.filter((s) => s.id !== id));
  };

  // --- Handlers Canais ---
  const openChannelModal = (channel?: any) => {
    if (channel) {
      setEditingChannel(channel);
      setChannelForm({
        nome: channel.nome || '',
        logo: channel.logo || '',
        genero: channel.genero || '',
        url: channel.url || '',
      });
    } else {
      setEditingChannel(null);
      setChannelForm({ nome: '', logo: '', genero: '', url: '' });
    }
    setShowChannelModal(true);
  };

  const handleSaveChannel = async () => {
    if (!channelForm.nome.trim()) return;
    setSavingChannel(true);
    try {
      if (editingChannel) {
        const ok = await updateChannel(editingChannel.id, channelForm);
        if (ok)
          setChannels((prev) =>
            prev.map((c) => (c.id === editingChannel.id ? { ...c, ...channelForm } : c))
          );
      } else {
        const created = await createChannel(channelForm);
        if (created) setChannels((prev) => [...prev, created]);
      }
      setShowChannelModal(false);
    } finally {
      setSavingChannel(false);
    }
  };

  const handleDeleteChannel = async (id: string) => {
    if (!confirm('Excluir este canal?')) return;
    const ok = await deleteChannel(id);
    if (ok) setChannels((prev) => prev.filter((c) => c.id !== id));
  };

  const handleTestChannel = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-1">IPTV & Canais</h2>
            <p className="text-white/40 text-sm">
              Gerencie fontes M3U e organize a grade de canais.{' '}
              <span className="text-white/20">
                {channels.length} canais • {sources.length} fontes
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            {activeTab === 'sources' ? (
              <button
                onClick={() => openSourceModal()}
                className="px-6 py-3 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-700 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all flex items-center gap-2"
              >
                <Plus size={18} /> Nova Fonte M3U
              </button>
            ) : (
              <button
                onClick={() => openChannelModal()}
                className="px-6 py-3 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-700 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all flex items-center gap-2"
              >
                <Plus size={18} /> Novo Canal
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-white/10 pb-1">
          <button
            onClick={() => setActiveTab('sources')}
            className={`pb-3 px-4 text-sm font-bold transition-colors relative ${activeTab === 'sources' ? 'text-white' : 'text-white/40 hover:text-white'}`}
          >
            Fontes M3U ({sources.length})
            {activeTab === 'sources' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('channels')}
            className={`pb-3 px-4 text-sm font-bold transition-colors relative ${activeTab === 'channels' ? 'text-white' : 'text-white/40 hover:text-white'}`}
          >
            Lista de Canais ({channels.length})
            {activeTab === 'channels' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
            )}
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-[#121217] border border-white/5 rounded-3xl p-6 animate-pulse h-64"
              />
            ))}
          </div>
        ) : activeTab === 'sources' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sources.map((source) => (
              <div
                key={source.id}
                className="bg-[#121217] border border-white/5 rounded-3xl p-6 group hover:border-white/20 transition-all"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                    <List size={24} className="text-white/80" />
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${source.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}
                  >
                    {source.status === 'active' ? 'Online' : source.status}
                  </span>
                </div>
                <h3 className="text-xl font-bold mb-2">{source.name}</h3>
                <p className="text-white/40 text-xs font-mono bg-black/20 p-2 rounded-lg truncate mb-4">
                  {source.url}
                </p>
                <div className="flex justify-between items-center text-sm text-white/60 mb-6">
                  <span>Atualização: {source.update_interval}h</span>
                  <span className="text-xs text-white/30">
                    {source.last_updated
                      ? new Date(source.last_updated).toLocaleString('pt-BR')
                      : 'Nunca'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openSourceModal(source)}
                    className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <Edit2 size={16} /> Editar
                  </button>
                  <button
                    onClick={() => handleDeleteSource(source.id)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
            {sources.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-white/20">
                <Globe size={48} className="mb-4 opacity-30" />
                <p className="font-bold text-lg">Nenhuma fonte M3U cadastrada</p>
                <p className="text-sm text-white/15 mt-1">
                  Clique em "Nova Fonte M3U" para começar
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#121217] border border-white/5 rounded-3xl overflow-hidden">
            <div className="p-4 border-b border-white/5 flex gap-4">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="Buscar canal..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-red-600/50"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none"
              >
                <option value="Todos">Todas Categorias</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-white/40 text-xs uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-6 py-4">Nome</th>
                  <th className="px-6 py-4">Categoria</th>
                  <th className="px-6 py-4">URL</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredChannels.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-white/20">
                      <Tv size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="font-bold">Nenhum canal encontrado</p>
                    </td>
                  </tr>
                ) : (
                  filteredChannels.map((channel: any) => (
                    <tr key={channel.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4 font-bold flex items-center gap-3">
                        {channel.logo ? (
                          <img
                            src={channel.logo}
                            alt=""
                            className="w-8 h-8 rounded object-cover bg-white/10"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center">
                            <Tv size={16} />
                          </div>
                        )}
                        {channel.nome}
                      </td>
                      <td className="px-6 py-4 text-white/60">{channel.genero || '—'}</td>
                      <td className="px-6 py-4 text-white/30 text-xs font-mono truncate max-w-48">
                        {channel.url}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleTestChannel(channel.url)}
                            className="p-2 hover:text-green-400 text-white/40"
                            title="Testar"
                          >
                            <Play size={16} />
                          </button>
                          <button
                            onClick={() => openChannelModal(channel)}
                            className="p-2 hover:text-white text-white/40"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteChannel(channel.id)}
                            className="p-2 hover:text-red-500 text-white/40"
                            title="Excluir"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Fonte M3U */}
      {showSourceModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a20] w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">
                {editingSource ? 'Editar Fonte' : 'Nova Fonte M3U'}
              </h3>
              <button
                onClick={() => setShowSourceModal(false)}
                className="p-2 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                  Nome
                </label>
                <input
                  type="text"
                  value={sourceForm.name}
                  onChange={(e) => setSourceForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Provedor Principal"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                  URL M3U
                </label>
                <input
                  type="url"
                  value={sourceForm.url}
                  onChange={(e) => setSourceForm((p) => ({ ...p, url: e.target.value }))}
                  placeholder="http://servidor.com/list.m3u"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-red-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div
                  className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 cursor-pointer"
                  onClick={() => setSourceForm((p) => ({ ...p, auto_update: !p.auto_update }))}
                >
                  <span className="text-sm font-bold">Auto-update</span>
                  <div
                    className={`w-10 h-5 rounded-full relative transition-colors ${sourceForm.auto_update ? 'bg-green-600' : 'bg-white/10'}`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${sourceForm.auto_update ? 'left-5' : 'left-0.5'}`}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                    Intervalo (h)
                  </label>
                  <input
                    type="number"
                    value={sourceForm.update_interval}
                    onChange={(e) =>
                      setSourceForm((p) => ({
                        ...p,
                        update_interval: parseInt(e.target.value) || 24,
                      }))
                    }
                    min={1}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowSourceModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveSource}
                disabled={savingSource || !sourceForm.name.trim() || !sourceForm.url.trim()}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingSource ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                {savingSource ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Canal */}
      {showChannelModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a20] w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">
                {editingChannel ? 'Editar Canal' : 'Novo Canal'}
              </h3>
              <button
                onClick={() => setShowChannelModal(false)}
                className="p-2 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                  Nome do Canal
                </label>
                <input
                  type="text"
                  value={channelForm.nome}
                  onChange={(e) => setChannelForm((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Globo SP"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                  URL do Stream
                </label>
                <input
                  type="url"
                  value={channelForm.url}
                  onChange={(e) => setChannelForm((p) => ({ ...p, url: e.target.value }))}
                  placeholder="http://stream.tv/canal.m3u8"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-red-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                    Categoria
                  </label>
                  <input
                    type="text"
                    value={channelForm.genero}
                    onChange={(e) => setChannelForm((p) => ({ ...p, genero: e.target.value }))}
                    placeholder="Ex: Esportes"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                    Logo URL
                  </label>
                  <input
                    type="url"
                    value={channelForm.logo}
                    onChange={(e) => setChannelForm((p) => ({ ...p, logo: e.target.value }))}
                    placeholder="https://..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none"
                  />
                </div>
              </div>
              {channelForm.logo && (
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                  <img
                    src={channelForm.logo}
                    alt="Preview"
                    className="w-12 h-12 rounded object-cover bg-black/30"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                  <span className="text-xs text-white/40">Preview do logo</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowChannelModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveChannel}
                disabled={savingChannel || !channelForm.nome.trim()}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingChannel ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                {savingChannel ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default IPTV;
