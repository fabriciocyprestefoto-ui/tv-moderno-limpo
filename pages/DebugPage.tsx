import React, { useState, useEffect } from 'react';
import { getDebugLogs, clearDebugLogs } from '../components/DebugOverlay';

const DebugPage: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const updateLogs = () => setLogs(getDebugLogs());
    updateLogs();

    if (!autoRefresh) return undefined;
    const interval = setInterval(updateLogs, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleClearLogs = () => {
    clearDebugLogs();
    setLogs([]);
  };

  const handleExportLogs = () => {
    const logText = logs.join('\n\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `livetv-debug-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-transparent text-white p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-red-400">🔧 LiveTV Debug Console</h1>

        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Debug Logs ({logs.length})</h2>
            <div className="flex gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Auto-refresh</span>
              </label>
              <button
                onClick={handleClearLogs}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium"
              >
                Clear Logs
              </button>
              <button
                onClick={handleExportLogs}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium"
              >
                Export Logs
              </button>
            </div>
          </div>

          <div className="bg-black rounded p-4 h-96 overflow-auto font-mono text-sm">
            {logs.length === 0 ? (
              <div className="text-gray-500 italic">
                No debug logs available. Try using LiveTV to generate logs.
              </div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="mb-4 pb-2 border-b border-gray-700 last:border-b-0">
                  <pre className="text-green-400 whitespace-pre-wrap break-words">{log}</pre>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3 text-yellow-400">📊 Como Usar</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>• Vá para a seção LiveTV do app</li>
              <li>• Clique no botão "DEBUG OFF" no canto superior direito</li>
              <li>• Selecione um canal para gerar logs</li>
              <li>• Os logs aparecerão em tempo real no overlay</li>
              <li>• Use esta página para ver logs históricos</li>
            </ul>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3 text-blue-400">🔍 O que Analisar</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>
                • <strong>Fetch test result</strong>: Verifica se URL é acessível
              </li>
              <li>
                • <strong>Event: loadedmetadata</strong>: Metadados carregados
              </li>
              <li>
                • <strong>computedStyles</strong>: CSS pode estar ocultando vídeo
              </li>
              <li>
                • <strong>videoWidth/videoHeight</strong>: Dimensões do vídeo
              </li>
              <li>
                • <strong>readyState</strong>: Estado de carregamento do vídeo
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-6 bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3 text-red-400">🚨 Problemas Comuns</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium text-yellow-300 mb-2">Tela Preta com Áudio</h4>
              <ul className="space-y-1 text-gray-300">
                <li>• Verificar opacity: 0 no CSS</li>
                <li>• Video dimensions 0x0</li>
                <li>• Elemento sobreposto (z-index)</li>
                <li>• WebView bloqueando renderização</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-yellow-300 mb-2">Vídeo Não Carrega</h4>
              <ul className="space-y-1 text-gray-300">
                <li>• Fetch test falhando</li>
                <li>• CORS restrictions</li>
                <li>• Network connectivity</li>
                <li>• Invalid stream URL</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugPage;
