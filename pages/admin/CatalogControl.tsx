import React, { useState, useEffect } from 'react';
import { Save, Filter, Calendar, Layers, Check, AlertCircle, RefreshCw } from 'lucide-react';
import {
  getCatalogSettings,
  updateCatalogSettings,
  CatalogSettings,
} from '@/services/catalogService';
import { getAllMovies, getAllSeries } from '@/services/supabaseService';
import { enrichPlatformFromTmdb } from '@/services/platformEnrichment';

// Mock genres list - ideally fetch from DB or TMDB
const GENRES = [
  'Ação',
  'Aventura',
  'Animação',
  'Comédia',
  'Crime',
  'Documentário',
  'Drama',
  'Família',
  'Fantasia',
  'História',
  'Terror',
  'Música',
  'Mistério',
  'Romance',
  'Ficção Científica',
  'Cinema TV',
  'Thriller',
  'Guerra',
  'Faroeste',
];

const AdminCatalogControl: React.FC = () => {
  const [settings, setSettings] = useState<CatalogSettings>({
    id: 1,
    min_year: 1990,
    max_year: new Date().getFullYear(),
    selected_genres: [],
    content_type: 'mixed',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const data = await getCatalogSettings();
    if (data) {
      setSettings(data);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updateCatalogSettings(settings);
      setMessage({ type: 'success', text: 'Configurações salvas com sucesso!' });
      // Optional: Trigger a reload or re-fetch in the main app via Context or Event
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro ao salvar configurações.' });
    } finally {
      setSaving(false);
    }
  };

  const handleEnrichPlatforms = async () => {
    setEnriching(true);
    setMessage(null);
    try {
      const [dbMovies, dbSeries] = await Promise.all([getAllMovies(), getAllSeries()]);
      const movies = dbMovies.map((m) => ({ ...m, type: 'movie' as const }));
      const series = dbSeries.map((s) => ({ ...s, type: 'series' as const }));
      const all = [...movies, ...series];
      const result = await enrichPlatformFromTmdb(all, (done, total) => {
        setEnrichProgress({ done, total });
      });
      setEnrichProgress(null);
      setMessage({
        type: 'success',
        text: `Plataformas atualizadas: ${result.updated} itens. Sem dados TMDB: ${result.noProvider}. Erros: ${result.failed}.`,
      });
    } catch (err) {
      setEnrichProgress(null);
      setMessage({ type: 'error', text: 'Erro ao enriquecer plataformas via TMDB.' });
    } finally {
      setEnriching(false);
    }
  };

  const toggleGenre = (genre: string) => {
    setSettings((prev) => {
      const genres = prev.selected_genres || [];
      if (genres.includes(genre)) {
        return { ...prev, selected_genres: genres.filter((g) => g !== genre) };
      } else {
        return { ...prev, selected_genres: [...genres, genre] };
      }
    });
  };

  if (loading) return <div className="p-8 text-white">Carregando configurações...</div>;

  return (
    <div className="min-h-screen bg-transparent text-white p-8 font-sans">
      <header className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Filter className="text-red-600" />
          Controle Inteligente de Catálogo
        </h1>
        <p className="text-gray-400 mt-2">Defina exatamente o que aparece para os usuários.</p>
      </header>

      {message && (
        <div
          className={`p-4 rounded-lg mb-6 flex items-center gap-2 ${message.type === 'success' ? 'bg-green-900/50 text-green-200 border border-green-700' : 'bg-red-900/50 text-red-200 border border-red-700'}`}
        >
          {message.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Year Filter */}
        <section className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Calendar className="text-red-500" size={20} />
            Filtro por Ano
          </h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Ano Mínimo: <span className="text-white font-bold">{settings.min_year}</span>
              </label>
              <input
                type="range"
                min="1900"
                max={new Date().getFullYear()}
                value={settings.min_year}
                onChange={(e) => setSettings({ ...settings, min_year: parseInt(e.target.value) })}
                className="w-full accent-red-600 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Ano Máximo: <span className="text-white font-bold">{settings.max_year}</span>
              </label>
              <input
                type="range"
                min="1900"
                max={new Date().getFullYear() + 1}
                value={settings.max_year}
                onChange={(e) => setSettings({ ...settings, max_year: parseInt(e.target.value) })}
                className="w-full accent-red-600 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() =>
                  setSettings({ ...settings, min_year: 2018, max_year: new Date().getFullYear() })
                }
                className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors"
              >
                Recentes (2018+)
              </button>
              <button
                onClick={() =>
                  setSettings({
                    ...settings,
                    min_year: new Date().getFullYear() - 1,
                    max_year: new Date().getFullYear(),
                  })
                }
                className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors"
              >
                Lançamentos (Últimos 2 anos)
              </button>
            </div>
          </div>
        </section>

        {/* Content Type */}
        <section className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Layers className="text-blue-500" size={20} />
            Tipo de Conteúdo
          </h2>

          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => setSettings({ ...settings, content_type: 'mixed' })}
              className={`p-4 rounded-xl border-2 transition-all ${settings.content_type === 'mixed' ? 'border-red-600 bg-red-600/10 text-white' : 'border-transparent bg-white/5 text-gray-400 hover:bg-white/10'}`}
            >
              <div className="font-bold mb-1">Misturado</div>
              <div className="text-xs opacity-70">Filmes e Séries</div>
            </button>
            <button
              onClick={() => setSettings({ ...settings, content_type: 'movies' })}
              className={`p-4 rounded-xl border-2 transition-all ${settings.content_type === 'movies' ? 'border-red-600 bg-red-600/10 text-white' : 'border-transparent bg-white/5 text-gray-400 hover:bg-white/10'}`}
            >
              <div className="font-bold mb-1">Apenas Filmes</div>
              <div className="text-xs opacity-70">Remove Séries</div>
            </button>
            <button
              onClick={() => setSettings({ ...settings, content_type: 'series' })}
              className={`p-4 rounded-xl border-2 transition-all ${settings.content_type === 'series' ? 'border-red-600 bg-red-600/10 text-white' : 'border-transparent bg-white/5 text-gray-400 hover:bg-white/10'}`}
            >
              <div className="font-bold mb-1">Apenas Séries</div>
              <div className="text-xs opacity-70">Remove Filmes</div>
            </button>
          </div>
        </section>

        {/* Genres Filter */}
        <section className="bg-white/5 border border-white/10 rounded-2xl p-6 lg:col-span-2">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Filter className="text-purple-500" size={20} />
            Filtro por Gênero
          </h2>

          <p className="text-sm text-gray-400 mb-4">
            Selecione os gêneros permitidos. Se nenhum for selecionado, todos serão exibidos.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {GENRES.map((genre) => (
              <button
                key={genre}
                onClick={() => toggleGenre(genre)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between ${
                  (settings.selected_genres || []).includes(genre)
                    ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {genre}
                {(settings.selected_genres || []).includes(genre) && <Check size={14} />}
              </button>
            ))}
          </div>
        </section>

        {/* Enriquecimento de plataformas via TMDB */}
        <section className="bg-white/5 border border-white/10 rounded-2xl p-6 lg:col-span-2">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <RefreshCw className="text-amber-500" size={20} />
            Plataformas via TMDB
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            Identifica a qual plataforma cada filme/série pertence (Netflix, Prime, Disney+, etc.)
            via API TMDB e atualiza o Supabase.
          </p>
          <button
            onClick={handleEnrichPlatforms}
            disabled={enriching}
            className="px-6 py-3 rounded-xl font-bold bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
          >
            {enriching ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                {enrichProgress
                  ? `${enrichProgress.done}/${enrichProgress.total}`
                  : 'Enriquecendo...'}
              </>
            ) : (
              <>
                <RefreshCw size={18} />
                Enriquecer todo o catálogo
              </>
            )}
          </button>
        </section>
      </div>

      <div className="fixed bottom-8 right-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-full font-bold shadow-xl flex items-center gap-3 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
        >
          {saving ? (
            <>Salvando...</>
          ) : (
            <>
              <Save size={20} />
              Salvar Configuração
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default AdminCatalogControl;
