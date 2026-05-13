import { useState } from 'react';
import { getStreamUrl } from '@/services/streamService';
import { supabase } from '@/services/supabaseService';
import { updateCatalogSettings } from '@/services/catalogService';
import { useToast } from '@/contexts/ToastContext';

export default function StreamTester() {
  const { showToast } = useToast();
  const [tmdbId, setTmdbId] = useState('106379'); // Fallout por padrão
  const [title, setTitle] = useState('Fallout');
  const [type, setType] = useState<'movie' | 'series'>('series');
  const [result, setResult] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) =>
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);

  const testGetStreamUrl = async () => {
    setLogs([]);
    setResult(null);
    addLog(`Iniciando teste getStreamUrl("${title}", "${type}", "${tmdbId}")`);
    try {
      const url = await getStreamUrl(title, type, Number(tmdbId));
      addLog(`Resultado: ${url ? 'SUCESSO' : 'NULL'}`);
      setResult({ url });
    } catch (err: any) {
      addLog(`ERRO: ${err.message}`);
      setResult({ error: err });
    }
  };

  const testDirectQuery = async () => {
    setLogs([]);
    setResult(null);
    const table = type === 'movie' ? 'movies' : 'series';
    addLog(`Query direta na tabela: ${table}`);

    // Teste 1: TMDB ID Numérico
    addLog('1. Buscando por TMDB ID (Number)...');
    const { data: d1, error: e1 } = await supabase
      .from(table)
      .select('id, title, stream_url, tmdb_id')
      .eq('tmdb_id', Number(tmdbId))
      .limit(5);

    if (e1) addLog(`Erro Q1: ${JSON.stringify(e1)}`);
    else addLog(`Sucesso Q1: ${d1?.length} resultados. ${JSON.stringify(d1)}`);

    // Teste 2: Título ILIKE
    addLog(`2. Buscando por Título ILIKE "%${title}%"...`);
    const { data: d2, error: e2 } = await supabase
      .from(table)
      .select('id, title, stream_url, tmdb_id')
      .ilike('title', `%${title}%`)
      .limit(5);

    if (e2) addLog(`Erro Q2: ${JSON.stringify(e2)}`);
    else addLog(`Sucesso Q2: ${d2?.length} resultados. ${JSON.stringify(d2)}`);

    setResult({ d1, e1, d2, e2 });
  };

  const apply2018Filter = async () => {
    setLogs([]);
    addLog('Aplicando filtro: min_year = 2018...');
    try {
      await updateCatalogSettings({ min_year: 2018, max_year: new Date().getFullYear() });
      addLog('SUCESSO: Catálogo configurado para 2018+.');
      showToast('Catálogo configurado para 2018+. Recarregue a página Home.', 'success');
    } catch (e: any) {
      addLog(`ERRO ao atualizar settings: ${e.message}`);
    }
  };

  return (
    <div className="p-8 text-white bg-transparent min-h-screen font-mono">
      <h1 className="text-2xl font-bold mb-4 text-red-500">Stream Diagnostics Tool</h1>

      <div className="flex gap-4 mb-6">
        <input
          className="bg-gray-800 p-2 rounded"
          value={tmdbId}
          onChange={(e) => setTmdbId(e.target.value)}
          placeholder="TMDB ID"
        />
        <input
          className="bg-gray-800 p-2 rounded w-64"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título"
        />
        <select
          className="bg-gray-800 p-2 rounded"
          value={type}
          onChange={(e) => setType(e.target.value as any)}
        >
          <option value="movie">Filme</option>
          <option value="series">Série</option>
        </select>
      </div>

      <div className="flex gap-4 mb-8">
        <button
          onClick={testGetStreamUrl}
          className="bg-blue-600 px-4 py-2 rounded hover:bg-blue-500"
        >
          Testar getStreamUrl()
        </button>
        <button
          onClick={testDirectQuery}
          className="bg-green-600 px-4 py-2 rounded hover:bg-green-500"
        >
          Testar Supabase Direto
        </button>
        <button
          onClick={apply2018Filter}
          className="bg-purple-600 px-4 py-2 rounded hover:bg-purple-500 ml-auto"
        >
          ⚠️ Forçar Filtro 2018+
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 p-4 rounded h-96 overflow-auto border border-gray-700">
          <h3 className="text-gray-400 mb-2 border-b border-gray-700 pb-1">Logs</h3>
          {logs.map((l, i) => (
            <div key={i} className="text-xs mb-1">
              {l}
            </div>
          ))}
        </div>
        <div className="bg-gray-900 p-4 rounded h-96 overflow-auto border border-gray-700">
          <h3 className="text-gray-400 mb-2 border-b border-gray-700 pb-1">Resultado RAW</h3>
          <pre className="text-xs text-green-400 whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
