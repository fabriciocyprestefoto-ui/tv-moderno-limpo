import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Film,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import {
  ImageMatchResult,
  processMultipleFiles,
  detectOrientation,
  cleanFileName,
} from '../../services/imageMatchService';

interface ImageUploaderProps {
  onComplete?: (results: ImageMatchResult[]) => void;
}

interface FileEntry {
  id: string;
  file: File;
  previewUrl: string;
  orientation: 'poster' | 'backdrop';
  cleanTitle: string;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onComplete }) => {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [results, setResults] = useState<ImageMatchResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(async (incoming: FileList | File[]) => {
    const fileArray = Array.from(incoming).filter((f) => ACCEPTED_TYPES.includes(f.type));
    if (fileArray.length === 0) return;

    const newEntries: FileEntry[] = await Promise.all(
      fileArray.map(async (file) => {
        const previewUrl = URL.createObjectURL(file);
        // detectOrientation retorna {orientation, width, height} — desestruturamos só o que precisamos
        const { orientation } = await detectOrientation(file);
        const cleanTitle = cleanFileName(file.name);
        return {
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
          file,
          previewUrl,
          orientation,
          cleanTitle,
        };
      })
    );

    setFiles((prev) => [...prev, ...newEntries]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
    setResults([]);
    setProgress(0);
  }, [files]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
        e.target.value = '';
      }
    },
    [addFiles]
  );

  const startProcessing = useCallback(async () => {
    if (files.length === 0 || processing) return;

    setProcessing(true);
    setProgress(0);
    setResults([]);

    const rawFiles = files.map((f) => f.file);
    const total = rawFiles.length;

    try {
      // processMultipleFiles emite ImageMatchResult[] após cada arquivo
      const matchResults = await processMultipleFiles(rawFiles, (currentResults) => {
        // Estados terminais: done, error, not_found
        const completed = currentResults.filter(
          (r) => r.status === 'done' || r.status === 'error' || r.status === 'not_found'
        ).length;
        setProgress(Math.round((completed / total) * 100));
        setResults([...currentResults]);
      });

      setResults(matchResults);
      setProgress(100);
      onComplete?.(matchResults);
    } catch (err) {
      console.error('[ImageUploader] Erro ao processar:', err);
    } finally {
      setProcessing(false);
    }
  }, [files, processing, onComplete]);

  // Contadores usando os status corretos do serviço
  const doneCount = results.filter((r) => r.status === 'done').length;
  const matchedWithNoStream = results.filter((r) => r.status === 'matched').length;
  const notFoundCount = results.filter(
    (r) => r.status === 'not_found' || r.status === 'error'
  ).length;

  return (
    <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-600/20 rounded-xl">
            <Film className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Upload de Imagens</h2>
            <p className="text-sm text-white/60">
              Arraste imagens para corresponder e enviar ao catálogo
            </p>
          </div>
        </div>
        {files.length > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Limpar tudo
          </button>
        )}
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-4
          min-h-[200px] rounded-2xl border-2 border-dashed cursor-pointer
          transition-all duration-300 ease-out
          ${
            dragOver
              ? 'border-purple-500 bg-purple-500/10 scale-[1.01]'
              : 'border-white/20 bg-[#12121a] hover:border-white/30 hover:bg-[#12121a]/80'
          }
        `}
      >
        <div
          className={`p-4 rounded-full transition-colors duration-300 ${
            dragOver ? 'bg-purple-500/20' : 'bg-white/5'
          }`}
        >
          <Upload
            className={`w-8 h-8 transition-colors duration-300 ${
              dragOver ? 'text-purple-400' : 'text-white/40'
            }`}
          />
        </div>
        <div className="text-center">
          <p className="text-white font-medium">Arraste imagens aqui</p>
          <p className="text-sm text-white/40 mt-1">ou clique para selecionar · JPG, PNG, WebP</p>
          <p className="text-xs text-white/30 mt-1">
            Vertical = poster · Horizontal = backdrop · Envie apenas o poster para buscar backdrop
            via TMDB
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-xl transition-colors"
        >
          Selecionar Arquivos
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {/* Preview Grid — visível antes de processar */}
      {files.length > 0 && results.length === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-white/60">
            {files.length} {files.length === 1 ? 'imagem' : 'imagens'} selecionada
            {files.length === 1 ? '' : 's'}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {files.map((entry) => (
              <div
                key={entry.id}
                className="group relative bg-[#12121a] rounded-xl border border-white/5 overflow-hidden transition-all hover:border-white/15"
              >
                <div
                  className={`relative overflow-hidden bg-black/50 ${
                    entry.orientation === 'backdrop' ? 'aspect-video' : 'aspect-[3/4]'
                  }`}
                >
                  <img
                    src={entry.previewUrl}
                    alt={entry.cleanTitle}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removeFile(entry.id)}
                    className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>
                  <div className="absolute top-2 left-2">
                    {entry.orientation === 'poster' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 rounded-md backdrop-blur-sm">
                        <ImageIcon className="w-3 h-3" />
                        Poster
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 rounded-md backdrop-blur-sm">
                        <ImageIcon className="w-3 h-3" />
                        Backdrop
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="text-xs text-white font-medium truncate" title={entry.cleanTitle}>
                    {entry.cleanTitle}
                  </p>
                  <p className="text-[10px] text-white/40 truncate mt-0.5" title={entry.file.name}>
                    {entry.file.name}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Start Processing */}
          <div className="flex justify-center pt-2">
            <button
              onClick={startProcessing}
              disabled={processing || files.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
            >
              {processing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Iniciar Correspondência
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Progress Bar — visível durante processamento */}
      {processing && (
        <div className="space-y-2">
          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-white/40 text-center">{progress}% concluído</p>
        </div>
      )}

      {/* Results — visível durante e após o processamento */}
      {results.length > 0 && (
        <div className="space-y-4">
          {/* Summary */}
          {!processing && (
            <div className="flex items-center justify-between bg-[#12121a] rounded-xl border border-white/5 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Check className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Processamento concluído</p>
                  <p className="text-xs text-white/50">
                    {doneCount} de {results.length} imagens enviadas ao Supabase
                  </p>
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1 text-green-400">
                  <Check className="w-3.5 h-3.5" />
                  {doneCount} enviadas
                </span>
                <span className="flex items-center gap-1 text-yellow-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {matchedWithNoStream} sem stream
                </span>
                <span className="flex items-center gap-1 text-red-400">
                  <X className="w-3.5 h-3.5" />
                  {notFoundCount} não encontradas
                </span>
              </div>
            </div>
          )}

          {/* Result Rows */}
          <div className="space-y-2">
            {results.map((result, index) => (
              <ResultRow key={index} result={result} />
            ))}
          </div>

          {!processing && (
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={clearAll}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-xl border border-white/10 transition-colors"
              >
                Nova Importação
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Result Row                                                         */
/* ------------------------------------------------------------------ */

const STATUS_LABELS: Record<ImageMatchResult['status'], string> = {
  pending: 'Aguardando',
  matching: 'Identificando...',
  matched: 'Encontrado (sem stream)',
  not_found: 'Não encontrado',
  uploading: 'Enviando...',
  done: 'Enviado',
  error: 'Erro',
};

const ResultRow: React.FC<{ result: ImageMatchResult }> = ({ result }) => {
  const isDone = result.status === 'done';
  const isMatched = result.status === 'matched';
  const isNotFound = result.status === 'not_found';
  const isError = result.status === 'error';
  const isInProgress =
    result.status === 'pending' || result.status === 'matching' || result.status === 'uploading';

  // Título a exibir: título do item matchado > título limpo > nome do arquivo
  const displayTitle = result.matchedItem?.title || result.cleanTitle || result.fileName;

  return (
    <div className="flex items-center gap-4 bg-[#12121a] rounded-xl border border-white/5 p-3 hover:border-white/10 transition-colors">
      {/* Thumbnail */}
      <div className="flex-shrink-0 w-12 h-16 rounded-lg overflow-hidden bg-black/50">
        {result.previewUrl ? (
          <img
            src={result.previewUrl}
            alt={result.fileName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-white/20" />
          </div>
        )}
      </div>

      {/* Status Icon */}
      <div className="flex-shrink-0">
        {isDone && (
          <div className="p-1.5 bg-green-500/20 rounded-lg">
            <Check className="w-4 h-4 text-green-400" />
          </div>
        )}
        {isMatched && (
          <div className="p-1.5 bg-yellow-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
          </div>
        )}
        {(isNotFound || isError) && (
          <div className="p-1.5 bg-red-500/20 rounded-lg">
            <X className="w-4 h-4 text-red-400" />
          </div>
        )}
        {isInProgress && (
          <div className="p-1.5 bg-white/5 rounded-lg">
            <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium truncate" title={displayTitle}>
          {displayTitle}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {/* Status label */}
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              isDone
                ? 'bg-green-500/20 text-green-300'
                : isMatched
                  ? 'bg-yellow-500/20 text-yellow-300'
                  : isNotFound || isError
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-white/10 text-white/40'
            }`}
          >
            {STATUS_LABELS[result.status]}
          </span>

          {/* Match source */}
          {result.matchSource && (
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                result.matchSource === 'database'
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'bg-blue-500/20 text-blue-300'
              }`}
            >
              {result.matchSource === 'database' ? 'Banco' : 'TMDB'}
            </span>
          )}

          {/* Orientation */}
          {result.orientation && (
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                result.orientation === 'poster'
                  ? 'bg-purple-500/15 text-purple-400'
                  : 'bg-blue-500/15 text-blue-400'
              }`}
            >
              {result.orientation === 'poster' ? 'Poster' : 'Backdrop'}
            </span>
          )}

          {/* TMDB fallback info */}
          {result.tmdbResult && !result.matched && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400">
              TMDB: {result.tmdbResult.title}
            </span>
          )}
        </div>
      </div>

      {/* URL or error */}
      <div className="flex-shrink-0 text-right max-w-[220px]">
        {result.newUrl ? (
          <a
            href={result.newUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-green-400/80 hover:text-green-400 truncate max-w-[200px]"
            title={result.newUrl}
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{result.newUrl.replace(/^https?:\/\/[^/]+/, '')}</span>
          </a>
        ) : result.error ? (
          <p className="text-[10px] text-red-400/70 truncate" title={result.error}>
            {result.error}
          </p>
        ) : (
          <p className="text-[10px] text-white/30">
            {isNotFound ? 'Sem correspondência no banco' : '—'}
          </p>
        )}
      </div>
    </div>
  );
};

export default ImageUploader;
