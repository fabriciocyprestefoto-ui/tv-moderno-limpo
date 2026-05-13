import React from 'react';

// Sistema de logging persistente para debug
const debugLogs: string[] = [];
const MAX_LOGS = 100;

export const addDebugLog = (message: string, data?: any) => {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}`;

  debugLogs.push(logEntry);
  if (debugLogs.length > MAX_LOGS) {
    debugLogs.shift();
  }

  // Salvar no localStorage
  try {
    localStorage.setItem('livetv_debug_logs', JSON.stringify(debugLogs));
  } catch (e) {
    console.warn('Failed to save debug logs to localStorage');
  }

  console.log(logEntry);
};

// Função para obter logs salvos
export const getDebugLogs = (): string[] => {
  try {
    const saved = localStorage.getItem('livetv_debug_logs');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
};

// Função para limpar logs
export const clearDebugLogs = () => {
  debugLogs.length = 0;
  localStorage.removeItem('livetv_debug_logs');
};

interface DebugOverlayProps {
  show: boolean;
  onToggle: () => void;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({ show, onToggle }) => {
  if (!show) {
    return (
      <button
        onClick={onToggle}
        className="absolute top-4 right-4 z-50 bg-red-600 text-white px-3 py-1 rounded text-xs font-bold"
        style={{ zIndex: 9999 }}
      >
        DEBUG OFF
      </button>
    );
  }

  return (
    <>
      <button
        onClick={onToggle}
        className="absolute top-4 right-4 z-50 bg-green-600 text-white px-3 py-1 rounded text-xs font-bold"
        style={{ zIndex: 9999 }}
      >
        DEBUG ON
      </button>

      <div
        className="absolute top-12 right-4 w-80 h-96 bg-black/90 text-green-400 text-xs font-mono p-2 rounded overflow-auto z-40"
        style={{ zIndex: 9998, maxHeight: '70vh' }}
      >
        <div className="mb-2 flex justify-between">
          <span className="font-bold">LiveTV Debug Logs</span>
          <button
            onClick={clearDebugLogs}
            className="bg-red-600 text-white px-2 py-1 rounded text-xs"
          >
            CLEAR
          </button>
        </div>
        <div className="space-y-1">
          {getDebugLogs()
            .slice(-20)
            .map((log, index) => (
              <div key={index} className="border-b border-gray-600 pb-1">
                <pre className="whitespace-pre-wrap wrap-break-word">{log}</pre>
              </div>
            ))}
        </div>
      </div>
    </>
  );
};
