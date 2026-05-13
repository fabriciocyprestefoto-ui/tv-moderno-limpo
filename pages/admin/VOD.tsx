import React, { useState, useCallback, useMemo, useEffect } from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import {
  Film,
  Tv,
  Search,
  Edit2,
  Trash2,
  Plus,
  Star,
  Save,
  X,
  Upload,
  AlertTriangle,
  Globe,
  List,
} from 'lucide-react';
import {
  uploadImage,
  insertImageUpdate,
  updateMovie,
  updateSeries,
  insertMovie,
  insertSeries,
  getSeasons,
  getEpisodes,
  updateEpisode,
} from '@/services/supabaseService';
import type { SeasonDB, EpisodeDB } from '@/services/supabaseService';
import { searchAnyLang, getWatchProviderName } from '@/services/tmdb';
import { detectPlatformFromUrl } from '@/utils/mediaUtils';
import { useToast } from '@/contexts/ToastContext';
import { logger } from '@/utils/logger';
import { getImageUrl } from '@/services/tmdb';
import { useVODCrud } from '@/hooks/admin/useVODCrud';
import { useVODFilters } from '@/hooks/admin/useVODFilters';

// Helper: resolver URL do poster (trata paths TMDB parciais, URLs completas e vazios)
const resolvePosterUrl = (poster?: string | null): string | null => {
  if (!poster) return null;
  // Já é URL completa
  if (poster.startsWith('http://') || poster.startsWith('https://')) return poster;
  // Path TMDB parcial (ex: /abc123.jpg)
  if (poster.startsWith('/')) return getImageUrl(poster, 'w500') || null;
  return null;
};

const VOD: React.FC = () => {
  const { showToast } = useToast();

  // ── CRUD & loading (extracted hook) ───────────────────────────────────────────
  const {
    items,
    setItems,
    loading,
    stats,
    setStats: _setStats,
    selectedIds,
    setSelectedIds,
    editingItem,
    setEditingItem,
    editForm,
    setEditForm,
    saving,
    setSaving,
    deletingItem,
    setDeletingItem,
    showCreateModal,
    setShowCreateModal,
    createType,
    setCreateType,
    createForm,
    setCreateForm,
    creating,
    setCreating,
    loadItems,
    handleEdit,
    handleSave,
    handleDeleteConfirm,
    handleBulkDelete,
    handleSelect,
    handleSelectAll,
    handleCreate,
  } = useVODCrud();

  // ── Filters (extracted hook) ──────────────────────────────────────────────────
  const {
    searchTerm,
    setSearchTerm,
    filterType,
    setFilterType,
    filterYear,
    setFilterYear,
    filterPlatform,
    setFilterPlatform,
    filterStatus,
    setFilterStatus,
    filterGenre,
    setFilterGenre,
    filteredItems,
    years,
    platforms,
    genres,
  } = useVODFilters(items);

  // ── Temporadas & Episódios (somente para séries) ──────────────────────────────
  const [seriesSeasons, setSeriesSeasons] = useState<SeasonDB[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [seasonEpisodesMap, setSeasonEpisodesMap] = useState<Record<string, EpisodeDB[]>>({});
  const [episodeUrlEdits, setEpisodeUrlEdits] = useState<Record<string, string>>({});
  const [savingEpisodeIds, setSavingEpisodeIds] = useState<Set<string>>(new Set());
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  // Carrega temporadas ao abrir modal de série
  useEffect(() => {
    if (!editingItem || editingItem.type !== 'series') {
      setSeriesSeasons([]);
      setSelectedSeasonId(null);
      setSeasonEpisodesMap({});
      setEpisodeUrlEdits({});
      return;
    }
    getSeasons(editingItem.id)
      .then((seasons) => {
        setSeriesSeasons(seasons);
        if (seasons.length > 0) setSelectedSeasonId(seasons[0].id);
      })
      .catch(() => {});
  }, [editingItem?.id, editingItem?.type]);

  // Carrega episódios da temporada selecionada (lazy — carrega apenas uma vez por temporada)
  useEffect(() => {
    if (!selectedSeasonId || seasonEpisodesMap[selectedSeasonId] !== undefined) return;
    setLoadingEpisodes(true);
    getEpisodes(selectedSeasonId)
      .then((episodes) => {
        setSeasonEpisodesMap((prev) => ({ ...prev, [selectedSeasonId]: episodes }));
        const edits: Record<string, string> = {};
        episodes.forEach((ep) => {
          edits[ep.id] = ep.stream_url || '';
        });
        setEpisodeUrlEdits((prev) => ({ ...prev, ...edits }));
      })
      .catch(() => {})
      .finally(() => setLoadingEpisodes(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeasonId]); // seasonEpisodesMap omitido intencionalmente — guard de "já carregou" é suficiente

  const handleSaveEpisode = useCallback(
    async (episodeId: string) => {
      const url = episodeUrlEdits[episodeId] ?? '';
      setSavingEpisodeIds((prev) => new Set([...prev, episodeId]));
      try {
        await updateEpisode(episodeId, { stream_url: url || undefined });
        setSeasonEpisodesMap((prev) => {
          const next = { ...prev };
          for (const sid of Object.keys(next)) {
            next[sid] = next[sid].map((ep) =>
              ep.id === episodeId ? { ...ep, stream_url: url || undefined } : ep
            );
          }
          return next;
        });
        showToast('Episódio salvo!', 'success');
      } catch {
        showToast('Erro ao salvar episódio.', 'error');
      } finally {
        setSavingEpisodeIds((prev) => {
          const n = new Set(prev);
          n.delete(episodeId);
          return n;
        });
      }
    },
    [episodeUrlEdits, showToast]
  );

  // Batch upload
  const [showBatchUpload, setShowBatchUpload] = useState(false);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [uploadingBatch, setUploadingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    processed: number;
    total: number;
    logs: string[];
    matched: number;
  }>({ processed: 0, total: 0, logs: [], matched: 0 });
  const [batchResults, setBatchResults] = useState<
    {
      fileName: string;
      imageType: 'poster' | 'backdrop' | 'logo';
      matchedId?: string;
      matchedTitle?: string;
      status: 'atualizado' | 'nao_encontrado' | 'upload_erro' | 'update_erro';
      url?: string;
    }[]
  >([]);
  const [batchFilter, setBatchFilter] = useState<
    'Todos' | 'atualizado' | 'nao_encontrado' | 'erros'
  >('Todos');

  const [showImportUpload, setShowImportUpload] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<'file' | 'url'>('file');
  const [importUrl, setImportUrl] = useState('');
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    loaded: number;
    total: number;
    phase: string;
  }>({ loaded: 0, total: 0, phase: '' });
  const [importProgress, setImportProgress] = useState<{
    step: string;
    logs: string[];
    movies: number;
    series: number;
  }>({ step: '', logs: [], movies: 0, series: 0 });
  const [previewMovies, setPreviewMovies] = useState<any[]>([]);
  const [previewSeries, setPreviewSeries] = useState<any[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<{
    movies: Set<number>;
    series: Set<number>;
  }>({ movies: new Set(), series: new Set() });

  // Filtros de importação
  const [importFilterType, setImportFilterType] = useState<'Todos' | 'movie' | 'series'>('Todos');
  const [importFilterKids, setImportFilterKids] = useState<'Todos' | 'kids' | 'adult'>('Todos');
  const [importFilterYearMin, setImportFilterYearMin] = useState<number>(1900);
  const [importFilterYearMax, setImportFilterYearMax] = useState<number>(2030);
  const [importFilterGroup, setImportFilterGroup] = useState<string>('Todos');
  const [importFilterGenre, setImportFilterGenre] = useState<string>('Todos');
  const [importFilterSearch, setImportFilterSearch] = useState<string>('');

  // Enriquecimento de plataformas via TMDB
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0, found: 0, errors: 0 });

  // TMDB search for create
  const [tmdbSearchQuery, setTmdbSearchQuery] = useState('');
  const [tmdbSearchResults, setTmdbSearchResults] = useState<any[]>([]);
  const [searchingTmdb, setSearchingTmdb] = useState(false);

  const handleTmdbSearch = async () => {
    if (!tmdbSearchQuery.trim()) return;
    setSearchingTmdb(true);
    try {
      const results = await searchAnyLang(tmdbSearchQuery);
      const filtered = (results || [])
        .filter((r: any) => {
          if (createType === 'movie') return r.media_type === 'movie';
          return r.media_type === 'tv';
        })
        .slice(0, 10);
      setTmdbSearchResults(filtered);
    } catch (e) {
      logger.error('Erro na busca TMDB:', e);
    } finally {
      setSearchingTmdb(false);
    }
  };

  const fillFromTmdb = async (result: any) => {
    // Converter posters/backdrops TMDB para WebP via canvas e upload ao Supabase Storage
    const convertTmdbUrlToWebP = async (
      tmdbUrl: string,
      bucket: 'posters' | 'backdrops'
    ): Promise<string> => {
      try {
        const response = await fetch(tmdbUrl);
        if (!response.ok) throw new Error('Fetch failed');
        const blob = await response.blob();
        const file = new File([blob], `tmdb-${result.id}-${bucket}.jpg`, { type: blob.type });
        const webpFile = await convertToWebP(file);
        const uploadedUrl = await uploadImage(webpFile, bucket);
        return uploadedUrl || tmdbUrl;
      } catch (err) {
        logger.warn(`[VOD] Falha ao converter poster TMDB para WebP (${bucket}):`, err);
        return tmdbUrl; // Fallback: usar URL TMDB original
      }
    };

    const posterUrl = result.poster_path ? getImageUrl(result.poster_path, 'w500') || '' : '';
    const backdropUrl = result.backdrop_path
      ? getImageUrl(result.backdrop_path, 'w1280') || ''
      : '';

    // Processar conversões em paralelo (sem bloquear UI excessivamente)
    const [finalPoster, finalBackdrop] = await Promise.all([
      posterUrl ? convertTmdbUrlToWebP(posterUrl, 'posters') : Promise.resolve(posterUrl),
      backdropUrl ? convertTmdbUrlToWebP(backdropUrl, 'backdrops') : Promise.resolve(backdropUrl),
    ]);

    setCreateForm((prev) => ({
      ...prev,
      title: result.title || result.name || prev.title,
      description: result.overview || prev.description,
      poster: finalPoster || prev.poster,
      backdrop: finalBackdrop || prev.backdrop,
      year: new Date(result.release_date || result.first_air_date || '').getFullYear() || prev.year,
      tmdb_id: String(result.id),
      rating: result.vote_average?.toFixed(1) || prev.rating,
    }));
    setTmdbSearchResults([]);
    setTmdbSearchQuery('');
  };

  // Enriquecer plataformas via TMDB watch/providers
  const handleEnrichPlatforms = useCallback(async () => {
    const missing = items.filter((i) => !i.platform && i.tmdb_id);
    if (missing.length === 0) {
      showToast('Todos os itens já possuem plataforma definida ou não têm TMDB ID.', 'info');
      return;
    }
    setEnriching(true);
    setEnrichProgress({ done: 0, total: missing.length, found: 0, errors: 0 });
    const BATCH = 8;
    let found = 0,
      errors = 0;
    const updatedMap = new Map<string, string>();
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const provider = await getWatchProviderName(item.tmdb_id!, item.type);
          return { item, provider };
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.provider) {
          const { item, provider } = r.value;
          updatedMap.set(item.id, provider);
          found++;
          // Salvar no Supabase
          try {
            if (item.type === 'movie') await updateMovie(item.id, { platform: provider } as any);
            else await updateSeries(item.id, { platform: provider } as any);
          } catch {
            errors++;
          }
        } else if (r.status === 'rejected') {
          errors++;
        }
      }
      setEnrichProgress({
        done: Math.min(i + BATCH, missing.length),
        total: missing.length,
        found,
        errors,
      });
      // Pequeno delay para não sobrecarregar a API
      if (i + BATCH < missing.length) await new Promise((ok) => setTimeout(ok, 250));
    }
    // Atualizar estado local
    if (updatedMap.size > 0) {
      setItems((prev) =>
        prev.map((item) =>
          updatedMap.has(item.id) ? { ...item, platform: updatedMap.get(item.id) } : item
        )
      );
    }
    setEnriching(false);
    showToast(
      `Concluído! ${found} plataformas encontradas, ${errors} erros, ${missing.length - found - errors} sem dados no TMDB.`,
      'success'
    );
  }, [items, showToast]);

  // ═══════════════════════════════════════════════════════
  // FILE UPLOAD / IMAGE CONVERSION
  // ═══════════════════════════════════════════════════════
  const isConvertibleImage = (file: File): boolean => {
    return ['image/jpeg', 'image/png', 'image/bmp', 'image/tiff'].includes(file.type);
  };

  const convertToWebP = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl); // limpar blob URL imediatamente após carregar
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Conversion failed'));
              return;
            }
            const webpFile = new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
              type: 'image/webp',
            });
            resolve(webpFile);
          },
          'image/webp',
          0.85
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl); // limpar em caso de erro também
        reject(new Error('Failed to load image'));
      };
      img.src = objectUrl;
    });
  };

  const handleFileUpload = useCallback(
    async (
      file: File,
      bucket: 'posters' | 'backdrops' | 'logos',
      field: 'poster' | 'backdrop' | 'logo_url'
    ) => {
      setSaving(true);
      try {
        let processedFile = file;
        if (isConvertibleImage(file)) {
          try {
            processedFile = await convertToWebP(file);
          } catch {
            /* fallback to original */
          }
        }
        const url = await uploadImage(processedFile, bucket);
        if (url) {
          setEditForm((prev) => ({ ...prev, [field]: url }));
          showToast('Imagem enviada com sucesso!', 'success');
        }
      } catch (error: any) {
        logger.error('[VOD] Upload error:', error);
        showToast('Erro ao enviar imagem.', 'error');
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // ═══════════════════════════════════════════════════════
  // EXPORT CSV
  // ═══════════════════════════════════════════════════════
  const handleExportCSV = useCallback(() => {
    const rows = batchResults.map((r) =>
      [r.fileName, r.imageType, r.matchedTitle || '', r.status, r.url || ''].join(',')
    );
    const csv = 'Arquivo,Tipo,Título,Status,URL\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'batch-upload-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [batchResults]);

  // ═══════════════════════════════════════════════════════
  // BATCH UPLOAD
  // ═══════════════════════════════════════════════════════
  const handleBatchUpload = useCallback(async () => {
    if (batchFiles.length === 0) return;
    setUploadingBatch(true);
    setBatchProgress({ processed: 0, total: batchFiles.length, logs: [], matched: 0 });
    setBatchResults([]);
    const results: typeof batchResults = [];
    const addLog = (msg: string) =>
      setBatchProgress((prev) => ({ ...prev, logs: [...prev.logs, msg] }));

    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i];
      const nameNoExt = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]/g, ' ')
        .trim();
      const isWide = await new Promise<boolean>((res) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          res(img.width > img.height);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          res(false);
        };
        img.src = objectUrl;
      });
      const imageType: 'poster' | 'backdrop' | 'logo' = isWide ? 'backdrop' : 'poster';

      // Procurar no catálogo por título similar
      const searchLower = nameNoExt.toLowerCase();
      const match =
        items.find((item) => item.title.toLowerCase() === searchLower) ||
        items.find((item) => item.title.toLowerCase().includes(searchLower)) ||
        items.find((item) => searchLower.includes(item.title.toLowerCase()));

      if (!match) {
        addLog(`❌ ${file.name} → Nenhum título encontrado`);
        results.push({ fileName: file.name, imageType, status: 'nao_encontrado' });
      } else {
        try {
          let processedFile: File = file;
          if (isConvertibleImage(file)) {
            try {
              processedFile = await convertToWebP(file);
            } catch {
              /* use original */
            }
          }
          const uploadedUrl = await uploadImage(
            processedFile,
            imageType === 'poster' ? 'posters' : 'backdrops'
          );
          if (!uploadedUrl) throw new Error('Upload retornou null');

          const updatePayload: any = { [imageType]: uploadedUrl };
          try {
            if (match.type === 'movie') await updateMovie(match.id, updatePayload);
            else await updateSeries(match.id, updatePayload);
            await insertImageUpdate({
              media_id: match.id,
              media_type: match.type,
              image_type: imageType,
              file_name: file.name,
              storage_url: uploadedUrl,
              status: 'atualizado',
            });
            addLog(`✅ ${file.name} → ${match.title} (${imageType})`);
            results.push({
              fileName: file.name,
              imageType,
              matchedId: match.id,
              matchedTitle: match.title,
              status: 'atualizado',
              url: uploadedUrl,
            });
            setItems((prev) =>
              prev.map((it) => (it.id === match.id ? { ...it, [imageType]: uploadedUrl } : it))
            );
          } catch (updateErr) {
            addLog(`⚠️ ${file.name} → Upload OK mas erro ao atualizar DB`);
            results.push({
              fileName: file.name,
              imageType,
              matchedId: match.id,
              matchedTitle: match.title,
              status: 'update_erro',
              url: uploadedUrl,
            });
          }
        } catch (uploadErr) {
          addLog(`❌ ${file.name} → Erro no upload`);
          results.push({
            fileName: file.name,
            imageType,
            matchedId: match.id,
            matchedTitle: match.title,
            status: 'upload_erro',
          });
        }
      }
      setBatchProgress((prev) => ({
        ...prev,
        processed: i + 1,
        matched: results.filter((r) => r.status === 'atualizado').length,
      }));
      setBatchResults([...results]);
    }
    setUploadingBatch(false);
  }, [batchFiles, items]);

  // ═══════════════════════════════════════════════════════
  // M3U / JSON IMPORT — Parse helpers
  // ═══════════════════════════════════════════════════════
  const parseM3UContent = (content: string): { movies: any[]; series: any[] } => {
    const lines = content.split('\n');
    const movies: any[] = [];
    const series: any[] = [];
    let currentMeta: any = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        const titleMatch = line.match(/,(.+)$/);
        const groupMatch = line.match(/group-title="([^"]*)"/i);
        const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
        const yearMatch = titleMatch?.[1]?.match(/\((\d{4})\)/);
        const title = (titleMatch?.[1] || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
        currentMeta = {
          title,
          group_title: groupMatch?.[1] || '',
          logo_url: logoMatch?.[1] || '',
          year: yearMatch ? parseInt(yearMatch[1]) : null,
        };
      } else if (line && !line.startsWith('#') && currentMeta) {
        const entry = { ...currentMeta, stream_url: line };
        const group = (entry.group_title || '').toLowerCase();
        const isKids =
          group.includes('kid') ||
          group.includes('infan') ||
          group.includes('desenho') ||
          group.includes('animaç');
        entry.kids = isKids;
        entry.genre = [];
        if (group.includes('ação') || group.includes('action')) entry.genre.push('Ação');
        if (group.includes('comédia') || group.includes('comedy')) entry.genre.push('Comédia');
        if (group.includes('drama')) entry.genre.push('Drama');
        if (group.includes('terror') || group.includes('horror')) entry.genre.push('Terror');
        if (group.includes('ficção') || group.includes('sci-fi'))
          entry.genre.push('Ficção Científica');

        const isSeries =
          group.includes('séri') ||
          group.includes('serie') ||
          group.includes('novela') ||
          group.includes('tv show');
        if (isSeries) {
          entry._idx = series.length;
          series.push(entry);
        } else {
          entry._idx = movies.length;
          movies.push(entry);
        }
        currentMeta = null;
      }
    }
    return { movies, series };
  };

  const handleImportParse = useCallback(async () => {
    if (!importFile) return;
    setImporting(true);
    setImportProgress({ step: 'Lendo arquivo', logs: [], movies: 0, series: 0 });
    try {
      const text = await importFile.text();
      let parsed: { movies: any[]; series: any[] };

      if (importFile.name.endsWith('.json')) {
        const json = JSON.parse(text);
        const arr = Array.isArray(json) ? json : json.items || json.movies || json.data || [];
        const movies = arr
          .filter((i: any) => i.type === 'movie' || !i.type)
          .map((i: any, idx: number) => ({ ...i, _idx: idx }));
        const series = arr
          .filter((i: any) => i.type === 'series')
          .map((i: any, idx: number) => ({ ...i, _idx: idx }));
        parsed = { movies, series };
      } else {
        parsed = parseM3UContent(text);
      }

      setPreviewMovies(parsed.movies);
      setPreviewSeries(parsed.series);
      // Auto-selecionar todos
      setSelectedPreview({
        movies: new Set(parsed.movies.map((_: any, i: number) => i)),
        series: new Set(parsed.series.map((_: any, i: number) => i)),
      });
      setImportProgress({
        step: 'Pronto para inserir',
        logs: [`Encontrados: ${parsed.movies.length} filmes, ${parsed.series.length} séries`],
        movies: 0,
        series: 0,
      });
    } catch (error: any) {
      logger.error('[VOD] Erro ao parsear importação:', error);
      setImportProgress({
        step: '',
        logs: [`Erro ao ler arquivo: ${error.message}`],
        movies: 0,
        series: 0,
      });
    } finally {
      setImporting(false);
    }
  }, [importFile]);

  const handleImportFromUrl = useCallback(async () => {
    if (!importUrl.trim()) return;
    setFetchingUrl(true);
    setImporting(true);
    setImportProgress({ step: 'Baixando da URL', logs: [], movies: 0, series: 0 });
    setDownloadProgress({ loaded: 0, total: 0, phase: 'Conectando...' });
    try {
      const response = await fetch(importUrl.trim());
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      setDownloadProgress((prev) => ({ ...prev, total: contentLength, phase: 'Baixando...' }));

      let text: string;
      if (contentLength > 0 && response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          setDownloadProgress((prev) => ({ ...prev, loaded, phase: 'Baixando...' }));
        }
        const allChunks = new Uint8Array(loaded);
        let pos = 0;
        for (const chunk of chunks) {
          allChunks.set(chunk, pos);
          pos += chunk.length;
        }
        text = new TextDecoder().decode(allChunks);
      } else {
        text = await response.text();
      }

      setDownloadProgress((prev) => ({ ...prev, phase: 'Analisando conteúdo...' }));

      let parsed: { movies: any[]; series: any[] };
      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const json = JSON.parse(trimmed);
        const arr = Array.isArray(json) ? json : json.items || json.movies || json.data || [];
        const movies = arr
          .filter((i: any) => i.type === 'movie' || !i.type)
          .map((i: any, idx: number) => ({ ...i, _idx: idx }));
        const series = arr
          .filter((i: any) => i.type === 'series')
          .map((i: any, idx: number) => ({ ...i, _idx: idx }));
        parsed = { movies, series };
      } else {
        parsed = parseM3UContent(trimmed);
      }

      setPreviewMovies(parsed.movies);
      setPreviewSeries(parsed.series);
      setSelectedPreview({
        movies: new Set(parsed.movies.map((_: any, i: number) => i)),
        series: new Set(parsed.series.map((_: any, i: number) => i)),
      });
      setImportProgress({
        step: 'Pronto para inserir',
        logs: [`Encontrados: ${parsed.movies.length} filmes, ${parsed.series.length} séries`],
        movies: 0,
        series: 0,
      });
    } catch (error: any) {
      logger.error('[VOD] Erro ao importar da URL:', error);
      const msg = error.message?.includes('Failed to fetch')
        ? 'Erro de CORS ou rede. Tente baixar o arquivo manualmente e usar "Upload de Arquivo".'
        : `Erro: ${error.message}`;
      setImportProgress({ step: '', logs: [msg], movies: 0, series: 0 });
    } finally {
      setFetchingUrl(false);
      setImporting(false);
      setDownloadProgress({ loaded: 0, total: 0, phase: '' });
    }
  }, [importUrl]);

  const handleImportInsert = useCallback(async () => {
    if (selectedPreview.movies.size + selectedPreview.series.size === 0) return;
    setImporting(true);
    setImportProgress({
      step: 'Inserindo no banco',
      logs: ['Iniciando inserção...'],
      movies: 0,
      series: 0,
    });

    const BATCH_SIZE = 20;
    let insertedMovies = 0;
    let insertedSeries = 0;

    // Inserir filmes selecionados
    const selectedMovies = previewMovies.filter((m) => selectedPreview.movies.has(m._idx));
    for (let i = 0; i < selectedMovies.length; i += BATCH_SIZE) {
      const batch = selectedMovies.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((m) =>
          insertMovie({
            title: m.title,
            description: m.description || null,
            poster: m.poster || m.logo_url || null,
            stream_url: m.stream_url || null,
            year: m.year || null,
            genre: Array.isArray(m.genre) ? m.genre : [],
            platform: m.platform || null,
            status: 'published',
          } as any)
        )
      );
      insertedMovies += results.filter((r) => r.status === 'fulfilled' && r.value).length;
      setImportProgress((prev) => ({
        ...prev,
        movies: insertedMovies,
        logs: [
          ...prev.logs,
          `Filmes: lote ${Math.floor(i / BATCH_SIZE) + 1} processado (${insertedMovies} inseridos)`,
        ],
      }));
    }

    // Inserir séries selecionadas
    const selectedSeriesItems = previewSeries.filter((s) => selectedPreview.series.has(s._idx));
    for (let i = 0; i < selectedSeriesItems.length; i += BATCH_SIZE) {
      const batch = selectedSeriesItems.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((s) =>
          insertSeries({
            title: s.title,
            description: s.description || null,
            poster: s.poster || s.logo_url || null,
            stream_url: s.stream_url || null,
            year: s.year || null,
            genre: Array.isArray(s.genre) ? s.genre : [],
            platform: s.platform || null,
            status: 'published',
          } as any)
        )
      );
      insertedSeries += results.filter((r) => r.status === 'fulfilled' && r.value).length;
      setImportProgress((prev) => ({
        ...prev,
        series: insertedSeries,
        logs: [
          ...prev.logs,
          `Séries: lote ${Math.floor(i / BATCH_SIZE) + 1} processado (${insertedSeries} inseridas)`,
        ],
      }));
    }

    setImportProgress((prev) => ({
      step: 'Finalizado',
      movies: insertedMovies,
      series: insertedSeries,
      logs: [
        ...prev.logs,
        `✅ Concluído! ${insertedMovies} filmes + ${insertedSeries} séries inseridos.`,
      ],
    }));
    setImporting(false);

    // Recarregar lista
    loadItems();
  }, [selectedPreview, previewMovies, previewSeries, loadItems]);

  // ═══════════════════════════════════════════════════════
  // IMPORT FILTER DERIVED VARIABLES
  // ═══════════════════════════════════════════════════════
  const applyImportFilters = (list: any[]): any[] => {
    let result = list;
    if (importFilterKids === 'kids') result = result.filter((i) => i.kids);
    if (importFilterKids === 'adult') result = result.filter((i) => !i.kids);
    if (importFilterGenre !== 'Todos')
      result = result.filter((i) => Array.isArray(i.genre) && i.genre.includes(importFilterGenre));
    if (importFilterYearMin > 1900)
      result = result.filter((i) => (i.year || 0) >= importFilterYearMin);
    if (importFilterYearMax < 2030)
      result = result.filter((i) => (i.year || 9999) <= importFilterYearMax);
    if (importFilterGroup !== 'Todos')
      result = result.filter((i) => i.group_title === importFilterGroup);
    if (importFilterSearch.trim()) {
      const q = importFilterSearch.toLowerCase();
      result = result.filter((i) => (i.title || '').toLowerCase().includes(q));
    }
    return result;
  };

  const filteredImportMovies = useMemo(
    () => applyImportFilters(previewMovies),
    [
      previewMovies,
      importFilterKids,
      importFilterGenre,
      importFilterYearMin,
      importFilterYearMax,
      importFilterGroup,
      importFilterSearch,
    ]
  );
  const filteredImportSeries = useMemo(
    () => applyImportFilters(previewSeries),
    [
      previewSeries,
      importFilterKids,
      importFilterGenre,
      importFilterYearMin,
      importFilterYearMax,
      importFilterGroup,
      importFilterSearch,
    ]
  );
  const filteredImportItems = useMemo(
    () => [...filteredImportMovies, ...filteredImportSeries],
    [filteredImportMovies, filteredImportSeries]
  );

  const importKidsCount = useMemo(() => {
    return previewMovies.filter((m) => m.kids).length + previewSeries.filter((s) => s.kids).length;
  }, [previewMovies, previewSeries]);

  const importMinYear = useMemo(() => {
    const all = [...previewMovies, ...previewSeries].map((i) => i.year).filter(Boolean) as number[];
    return all.length > 0 ? Math.min(...all) : 1900;
  }, [previewMovies, previewSeries]);

  const importMaxYear = useMemo(() => {
    const all = [...previewMovies, ...previewSeries].map((i) => i.year).filter(Boolean) as number[];
    return all.length > 0 ? Math.max(...all) : 2030;
  }, [previewMovies, previewSeries]);

  const importAvailableGenres = useMemo(() => {
    const set = new Set<string>();
    [...previewMovies, ...previewSeries].forEach((i) => {
      if (Array.isArray(i.genre)) i.genre.forEach((g: string) => set.add(g));
    });
    return Array.from(set).sort();
  }, [previewMovies, previewSeries]);

  const importAvailableGroups = useMemo(() => {
    const set = new Set<string>();
    [...previewMovies, ...previewSeries].forEach((i) => {
      if (i.group_title) set.add(i.group_title);
    });
    return Array.from(set).sort();
  }, [previewMovies, previewSeries]);

  // ═══════════════════════════════════════════════════════
  // IMPORT SELECTION HELPERS
  // ═══════════════════════════════════════════════════════
  const togglePreviewSelect = useCallback((type: 'movies' | 'series', idx: number) => {
    setSelectedPreview((prev) => {
      const next = { ...prev, [type]: new Set(prev[type]) };
      if (next[type].has(idx)) next[type].delete(idx);
      else next[type].add(idx);
      return next;
    });
  }, []);

  const selectOnlyFiltered = useCallback(() => {
    setSelectedPreview({
      movies: new Set(filteredImportMovies.map((m: any) => m._idx)),
      series: new Set(filteredImportSeries.map((s: any) => s._idx)),
    });
  }, [filteredImportMovies, filteredImportSeries]);

  const selectAllFiltered = useCallback(() => {
    setSelectedPreview((prev) => {
      const movies = new Set(prev.movies);
      const series = new Set(prev.series);
      filteredImportMovies.forEach((m: any) => movies.add(m._idx));
      filteredImportSeries.forEach((s: any) => series.add(s._idx));
      return { movies, series };
    });
  }, [filteredImportMovies, filteredImportSeries]);

  const deselectAllFiltered = useCallback(() => {
    setSelectedPreview((prev) => {
      const movies = new Set(prev.movies);
      const series = new Set(prev.series);
      filteredImportMovies.forEach((m: any) => movies.delete(m._idx));
      filteredImportSeries.forEach((s: any) => series.delete(s._idx));
      return { movies, series };
    });
  }, [filteredImportMovies, filteredImportSeries]);

  return (
    <AdminLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-linear-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
              Catálogo VOD
            </h1>
            <p className="text-white/60 mt-1">Gerencie filmes, séries e metadados.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-700 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all flex items-center gap-2"
            >
              <Plus size={18} /> Novo Conteúdo
            </button>
            <button
              onClick={() => setShowBatchUpload(true)}
              className="px-6 py-3 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all flex items-center gap-2"
            >
              <Upload size={18} /> Upload em Massa
            </button>
            <button
              onClick={() => setShowImportUpload(true)}
              className="px-6 py-3 rounded-xl font-bold text-sm bg-purple-600 hover:bg-purple-700 text-white transition-all flex items-center gap-2"
            >
              <Upload size={18} /> Importar M3U/JSON
            </button>
            <button
              onClick={handleEnrichPlatforms}
              disabled={enriching || loading}
              className="px-6 py-3 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-all flex items-center gap-2"
              title="Buscar plataforma real via TMDB para itens sem plataforma definida"
            >
              <Globe size={18} /> {enriching ? 'Buscando...' : 'Enriquecer Plataformas'}
            </button>
          </div>
        </div>

        {/* Barra de progresso do enriquecimento */}
        {enriching && (
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-400 font-bold">Buscando plataformas no TMDB...</span>
              <span className="text-white/60">
                {enrichProgress.done}/{enrichProgress.total} processados · {enrichProgress.found}{' '}
                encontrados · {enrichProgress.errors} erros
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all"
                style={{
                  width: `${enrichProgress.total ? (enrichProgress.done / enrichProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#121217] p-4 rounded-2xl border border-white/5">
            <p className="text-xs uppercase tracking-widest text-white/40 mb-1">Total Filmes</p>
            <p className="text-2xl font-bold text-white">
              {loading ? '...' : stats.movies.toLocaleString()}
            </p>
          </div>
          <div className="bg-[#121217] p-4 rounded-2xl border border-white/5">
            <p className="text-xs uppercase tracking-widest text-white/40 mb-1">Total Séries</p>
            <p className="text-2xl font-bold text-white">
              {loading ? '...' : stats.series.toLocaleString()}
            </p>
          </div>
          <div className="bg-[#121217] p-4 rounded-2xl border border-white/5">
            <p className="text-xs uppercase tracking-widest text-white/40 mb-1">Sem Plataforma</p>
            <p className="text-2xl font-bold text-yellow-500">
              {loading
                ? '...'
                : items.filter((i) => !i.platform && i.tmdb_id).length.toLocaleString()}
            </p>
          </div>
          <div className="bg-[#121217] p-4 rounded-2xl border border-white/5">
            <p className="text-xs uppercase tracking-widest text-white/40 mb-1">Com Stream URL</p>
            <p className="text-2xl font-bold text-emerald-500">
              {loading ? '...' : items.filter((i) => i.stream_url).length.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[#121217] border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar título..."
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm"
            >
              <option value="Todos">Tipo: Todos</option>
              <option value="movie">Filmes</option>
              <option value="series">Séries</option>
            </select>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm"
            >
              <option value="Todos">Ano: Todos</option>
              {years.map((year) => (
                <option key={year as any} value={year as any}>
                  {year}
                </option>
              ))}
            </select>
            <select
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm"
            >
              <option value="Todos">Plataforma: Todas</option>
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={filterGenre}
              onChange={(e) => setFilterGenre(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm"
            >
              <option value="Todos">Gênero: Todos</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm"
            >
              <option value="Todos">Status: Todos</option>
              <option value="published">Publicados</option>
              <option value="draft">Rascunhos</option>
            </select>
          </div>
        </div>

        {/* Bulk Action Bar - Shows when items are selected */}
        {selectedIds.size > 0 && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-4 flex items-center justify-between animate-in slide-in-from-top-2 fade-in">
            <div className="flex items-center gap-3">
              <div className="bg-red-500 text-white font-bold w-8 h-8 rounded-lg flex items-center justify-center text-sm">
                {selectedIds.size}
              </div>
              <span className="text-white font-medium">Itens selecionados</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
              >
                <Trash2 size={16} /> Excluir Selecionados
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-bold transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-[#121217] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-white/40 text-xs uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-6 py-4 w-10">
                    <input
                      type="checkbox"
                      onChange={() => handleSelectAll(filteredItems)}
                      checked={
                        filteredItems.length > 0 && selectedIds.size === filteredItems.length
                      }
                      className="rounded border-white/20 bg-black/20 text-red-600 focus:ring-offset-0 focus:ring-white/35"
                    />
                  </th>
                  <th className="px-6 py-4">Mídia</th>
                  <th className="px-6 py-4">Título</th>
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4">Plataforma</th>
                  <th className="px-6 py-4">Stream URL</th>
                  <th className="px-6 py-4">Ano</th>
                  <th className="px-6 py-4">Rating</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8">
                      Carregando...
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-white/5 transition-colors group ${selectedIds.has(item.id) ? 'bg-white/5' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => handleSelect(item.id)}
                          className="rounded border-white/20 bg-black/20 text-red-600 focus:ring-offset-0 focus:ring-white/35"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-[5.6rem] bg-white/10 rounded overflow-hidden relative group-hover:scale-105 transition-transform duration-300 shrink-0">
                            {resolvePosterUrl(item.poster) ? (
                              <a
                                href={resolvePosterUrl(item.poster)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block w-full h-full"
                              >
                                <img
                                  src={resolvePosterUrl(item.poster)!}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              </a>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white/20 text-[8px]">
                                Sem Imagem
                              </div>
                            )}
                          </div>
                          {resolvePosterUrl(item.poster) && (
                            <div className="max-w-50 hidden xl:block">
                              <a
                                href={resolvePosterUrl(item.poster)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] text-blue-400/70 hover:text-blue-300 font-mono break-all line-clamp-2 underline decoration-blue-400/30"
                                title={resolvePosterUrl(item.poster)!}
                              >
                                {resolvePosterUrl(item.poster)!}
                              </a>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold">{item.title}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`flex items-center gap-2 text-xs font-bold px-2 py-1 rounded-md w-fit ${item.type === 'movie' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}
                          >
                            {item.type === 'movie' ? <Film size={12} /> : <Tv size={12} />}
                            {item.type === 'movie' ? 'Filme' : 'Série'}
                          </span>
                          <span
                            className={`text-[10px] uppercase font-bold ${item.status === 'draft' ? 'text-yellow-500' : 'text-green-500'}`}
                          >
                            {item.status === 'draft' ? 'Rascunho' : 'Publicado'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const plat = item.platform || detectPlatformFromUrl(item.stream_url);
                          if (plat) {
                            return (
                              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                {plat}
                              </span>
                            );
                          }
                          return <span className="text-[10px] text-white/20 italic">—</span>;
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        {item.stream_url ? (
                          <div className="max-w-65">
                            <a
                              href={item.stream_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-mono break-all line-clamp-3 underline decoration-emerald-400/40 leading-relaxed"
                              title={item.stream_url}
                            >
                              {item.stream_url}
                            </a>
                          </div>
                        ) : (
                          <span className="text-xs text-red-400/80 font-bold uppercase tracking-wide bg-red-500/10 px-2 py-1 rounded">
                            Sem URL
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-white/60">{item.year || '-'}</td>
                      <td className="px-6 py-4 flex items-center gap-1 text-yellow-500 font-bold">
                        <Star size={12} fill="currentColor" /> {item.rating ?? '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => setDeletingItem(item)}
                            className="p-2 hover:bg-red-500/20 rounded-lg text-white/60 hover:text-red-500"
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
        </div>

        {/* Batch Upload Modal */}
        {showBatchUpload && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1a1a20] w-full max-w-3xl rounded-2xl border border-white/10 shadow-2xl p-8 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <Upload className="text-blue-500" /> Upload Inteligente em Massa
              </h3>
              <p className="text-white/40 text-sm mb-6">
                Arraste várias imagens de uma vez. O sistema identificará automaticamente se é
                Poster (Vertical) ou Backdrop (Horizontal) e associará ao filme correto pelo nome do
                arquivo.
              </p>

              {!uploadingBatch && batchProgress.processed === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl p-12 bg-black/20 mb-6">
                  <Upload size={48} className="text-white/20 mb-4" />
                  <p className="text-lg font-bold text-white/60 mb-2">Arraste seus arquivos aqui</p>
                  <p className="text-sm text-white/40 mb-6">ou clique para selecionar</p>
                  <input
                    id="batch-file-input"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => e.target.files && setBatchFiles(Array.from(e.target.files))}
                    className="hidden"
                  />
                  <label
                    htmlFor="batch-file-input"
                    className="px-6 py-3 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                  >
                    Selecionar Imagens
                  </label>
                  {batchFiles.length > 0 && (
                    <div className="mt-4 text-center">
                      <p className="font-bold text-green-400">
                        {batchFiles.length} arquivos selecionados
                      </p>
                    </div>
                  )}
                </div>
              )}

              {(uploadingBatch || batchProgress.processed > 0) && (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2 font-bold">
                      <span>Processando...</span>
                      <span>
                        {batchProgress.processed} / {batchProgress.total}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{
                          width: `${batchProgress.total ? (batchProgress.processed / batchProgress.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex-1 bg-black/40 rounded-xl p-4 overflow-y-auto font-mono text-xs space-y-2 border border-white/5 max-h-75">
                    {batchProgress.logs.length === 0 ? (
                      <p className="text-center text-white/20 py-8">Aguardando início...</p>
                    ) : (
                      batchProgress.logs.map((log, i) => (
                        <div key={i} className="p-2 rounded text-white/80">
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                  {batchProgress.processed > 0 && (
                    <div className="mt-4 space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-[#121217] p-4 rounded-2xl border border-white/5">
                          <p className="text-xs uppercase tracking-widest text-white/40 mb-1">
                            Encontrados
                          </p>
                          <p className="text-2xl font-bold text-white">
                            {batchResults.filter((r) => r.status !== 'nao_encontrado').length}
                          </p>
                        </div>
                        <div className="bg-[#121217] p-4 rounded-2xl border border-white/5">
                          <p className="text-xs uppercase tracking-widest text-white/40 mb-1">
                            Atualizados
                          </p>
                          <p className="text-2xl font-bold text-green-500">
                            {batchResults.filter((r) => r.status === 'atualizado').length}
                          </p>
                        </div>
                        <div className="bg-[#121217] p-4 rounded-2xl border border-white/5">
                          <p className="text-xs uppercase tracking-widest text-white/40 mb-1">
                            Não encontrados
                          </p>
                          <p className="text-2xl font-bold text-yellow-500">
                            {batchResults.filter((r) => r.status === 'nao_encontrado').length}
                          </p>
                        </div>
                        <div className="bg-[#121217] p-4 rounded-2xl border border-white/5">
                          <p className="text-xs uppercase tracking-widest text-white/40 mb-1">
                            Erros
                          </p>
                          <p className="text-2xl font-bold text-red-500">
                            {
                              batchResults.filter(
                                (r) => r.status === 'upload_erro' || r.status === 'update_erro'
                              ).length
                            }
                          </p>
                        </div>
                      </div>
                      {batchProgress.processed === batchProgress.total &&
                        batchResults.length > 0 && (
                          <div className="bg-[#121217] border border-white/5 rounded-2xl">
                            <div className="flex items-center justify-between p-4">
                              <p className="text-xs uppercase tracking-widest text-white/40">
                                Resumo
                              </p>
                              <div className="flex items-center gap-2">
                                <select
                                  value={batchFilter}
                                  onChange={(e) => setBatchFilter(e.target.value as any)}
                                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-white"
                                >
                                  <option value="Todos">Mostrar: Todos</option>
                                  <option value="atualizado">Atualizados</option>
                                  <option value="nao_encontrado">Não encontrados</option>
                                  <option value="erros">Erros</option>
                                </select>
                                <button
                                  onClick={handleExportCSV}
                                  className="px-3 py-2 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-white"
                                >
                                  Exportar CSV
                                </button>
                              </div>
                            </div>
                            <div className="max-h-56 overflow-y-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-white/5 text-white/40 uppercase tracking-wider font-bold">
                                  <tr>
                                    <th className="px-4 py-2">Arquivo</th>
                                    <th className="px-4 py-2">Tipo</th>
                                    <th className="px-4 py-2">Título</th>
                                    <th className="px-4 py-2">Status</th>
                                    <th className="px-4 py-2">URL</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {(batchFilter === 'Todos'
                                    ? batchResults
                                    : batchResults.filter((r) =>
                                        batchFilter === 'erros'
                                          ? r.status === 'upload_erro' || r.status === 'update_erro'
                                          : r.status === batchFilter
                                      )
                                  ).map((r, i) => (
                                    <tr key={i}>
                                      <td className="px-4 py-2">{r.fileName}</td>
                                      <td className="px-4 py-2">{r.imageType}</td>
                                      <td className="px-4 py-2">{r.matchedTitle || '-'}</td>
                                      <td
                                        className={`px-4 py-2 ${r.status === 'atualizado' ? 'text-green-500' : r.status === 'nao_encontrado' ? 'text-yellow-500' : 'text-red-500'}`}
                                      >
                                        {r.status}
                                      </td>
                                      <td className="px-4 py-2">
                                        {r.url ? (
                                          <a
                                            href={r.url}
                                            target="_blank"
                                            className="text-blue-400"
                                            rel="noreferrer"
                                          >
                                            abrir
                                          </a>
                                        ) : (
                                          '-'
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-4 mt-6 pt-6 border-t border-white/5">
                <button
                  onClick={() => {
                    setShowBatchUpload(false);
                    setBatchFiles([]);
                    setBatchProgress({ processed: 0, total: 0, logs: [], matched: 0 });
                  }}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-white/5 hover:bg-white/10 text-white"
                >
                  Fechar
                </button>
                {!uploadingBatch && batchFiles.length > 0 && batchProgress.processed === 0 && (
                  <button
                    onClick={handleBatchUpload}
                    className="flex-1 py-3 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Iniciar Processamento
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showImportUpload && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1a1a20] w-full max-w-5xl rounded-2xl border border-white/10 shadow-2xl p-8 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] overflow-y-auto">
              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <Upload className="text-purple-500" /> Importar Conteúdo M3U/JSON
              </h3>
              {!importing && importProgress.step === '' && !importProgress.logs.length && (
                <>
                  {/* Abas: Upload de Arquivo / Importar via URL */}
                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={() => setImportMode('file')}
                      className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-all ${importMode === 'file' ? 'bg-purple-600/20 border-purple-500 text-purple-400 shadow-[0_0_15px_rgba(147,51,234,0.2)]' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}
                    >
                      <Upload size={18} /> Upload de Arquivo
                    </button>
                    <button
                      onClick={() => setImportMode('url')}
                      className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-all ${importMode === 'url' ? 'bg-cyan-600/20 border-cyan-500 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}
                    >
                      <Globe size={18} /> Importar via URL
                    </button>
                  </div>

                  {importMode === 'file' && (
                    <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl p-12 bg-black/20 mb-6">
                      <Upload size={48} className="text-white/20 mb-4" />
                      <p className="text-lg font-bold text-white/60 mb-2">Arraste o arquivo aqui</p>
                      <p className="text-sm text-white/40 mb-6">
                        ou clique para selecionar (.m3u, .m3u8, .json)
                      </p>
                      <input
                        id="import-file-input"
                        type="file"
                        accept=".m3u,.m3u8,.json,application/json,text/plain"
                        onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <label
                        htmlFor="import-file-input"
                        className="px-6 py-3 rounded-xl font-bold text-sm bg-purple-600 hover:bg-purple-700 text-white cursor-pointer"
                      >
                        Selecionar Arquivo
                      </label>
                      {importFile && (
                        <div className="mt-4 text-center">
                          <p className="font-bold text-green-400">{importFile.name}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {importMode === 'url' && (
                    <div className="flex-1 flex flex-col border-2 border-dashed border-white/10 rounded-2xl p-8 bg-black/20 mb-6">
                      <Globe size={48} className="text-white/20 mb-4 mx-auto" />
                      <p className="text-lg font-bold text-white/60 mb-2 text-center">
                        Cole a URL da lista M3U ou JSON
                      </p>
                      <p className="text-sm text-white/40 mb-6 text-center">
                        Ex: http://servidor.com/playlist/usuario/senha/m3u_plus
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={importUrl}
                          onChange={(e) => setImportUrl(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleImportFromUrl()}
                          placeholder="https://servidor.com/playlist/...m3u_plus"
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-cyan-500/50 placeholder:text-white/20"
                        />
                      </div>
                      {importUrl.trim() && (
                        <div className="mt-4 bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-3 flex items-start gap-2">
                          <Globe size={14} className="text-cyan-400 mt-0.5 shrink-0" />
                          <p className="text-xs text-white/50">
                            A URL será acessada diretamente pelo navegador. Se houver erro de CORS,
                            baixe o arquivo e use a aba "Upload de Arquivo".
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {/* Logs de erro (CORS, etc) */}
              {!importing && importProgress.step === '' && importProgress.logs.length > 0 && (
                <div className="mb-6 space-y-3">
                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-2">
                    {importProgress.logs.map((log, i) => (
                      <p key={i} className="text-sm text-red-400">
                        {log}
                      </p>
                    ))}
                  </div>
                  <button
                    onClick={() => setImportProgress({ step: '', logs: [], movies: 0, series: 0 })}
                    className="text-xs text-white/40 hover:text-white/60 underline"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}
              {importProgress.step === 'Pronto para inserir' && (
                <div className="flex-1 overflow-hidden flex flex-col gap-4">
                  {/* Barra de resumo com contadores por tipo */}
                  <div className="grid grid-cols-5 gap-2">
                    <div className="bg-blue-600/10 border border-blue-600/20 rounded-xl p-3 text-center">
                      <p className="text-xl font-black text-blue-400">
                        {previewMovies.length + previewSeries.length}
                      </p>
                      <p className="text-[9px] uppercase tracking-widest text-white/40">Total</p>
                    </div>
                    <div className="bg-red-600/10 border border-red-600/20 rounded-xl p-3 text-center">
                      <p className="text-xl font-black text-red-400">{previewMovies.length}</p>
                      <p className="text-[9px] uppercase tracking-widest text-white/40">Filmes</p>
                    </div>
                    <div className="bg-purple-600/10 border border-purple-600/20 rounded-xl p-3 text-center">
                      <p className="text-xl font-black text-purple-400">{previewSeries.length}</p>
                      <p className="text-[9px] uppercase tracking-widest text-white/40">Séries</p>
                    </div>
                    <div className="bg-yellow-600/10 border border-yellow-600/20 rounded-xl p-3 text-center">
                      <p className="text-xl font-black text-yellow-400">{importKidsCount}</p>
                      <p className="text-[9px] uppercase tracking-widest text-white/40">Kids</p>
                    </div>
                    <div className="bg-green-600/10 border border-green-600/20 rounded-xl p-3 text-center">
                      <p className="text-xl font-black text-green-400">
                        {selectedPreview.movies.size + selectedPreview.series.size}
                      </p>
                      <p className="text-[9px] uppercase tracking-widest text-white/40">
                        Selecionados
                      </p>
                    </div>
                  </div>

                  {/* Painel de Filtros */}
                  <div className="bg-black/40 rounded-xl p-4 border border-white/5 space-y-3">
                    <p className="text-xs font-bold text-white/60 uppercase tracking-widest">
                      Filtros — escolha o que deseja importar
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {/* Tipo */}
                      <div>
                        <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">
                          Tipo
                        </label>
                        <select
                          value={importFilterType}
                          onChange={(e) => setImportFilterType(e.target.value as any)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="Todos">Todos</option>
                          <option value="movie">Filmes</option>
                          <option value="series">Séries</option>
                        </select>
                      </div>
                      {/* Kids */}
                      <div>
                        <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">
                          Público
                        </label>
                        <select
                          value={importFilterKids}
                          onChange={(e) => setImportFilterKids(e.target.value as any)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="Todos">Todos</option>
                          <option value="kids">🧒 Apenas Kids</option>
                          <option value="adult">🎬 Apenas Adulto</option>
                        </select>
                      </div>
                      {/* Gênero */}
                      <div>
                        <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">
                          Gênero
                        </label>
                        <select
                          value={importFilterGenre}
                          onChange={(e) => setImportFilterGenre(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="Todos">Todos</option>
                          {importAvailableGenres.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </div>
                      {/* Ano mínimo */}
                      <div>
                        <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">
                          Ano mínimo
                        </label>
                        <input
                          type="number"
                          value={importFilterYearMin}
                          onChange={(e) => setImportFilterYearMin(parseInt(e.target.value) || 1900)}
                          min={importMinYear}
                          max={importMaxYear}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        />
                      </div>
                      {/* Ano máximo */}
                      <div>
                        <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">
                          Ano máximo
                        </label>
                        <input
                          type="number"
                          value={importFilterYearMax}
                          onChange={(e) => setImportFilterYearMax(parseInt(e.target.value) || 2030)}
                          min={importMinYear}
                          max={importMaxYear}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Categoria/Grupo */}
                      <div>
                        <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">
                          Categoria M3U
                        </label>
                        <select
                          value={importFilterGroup}
                          onChange={(e) => setImportFilterGroup(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="Todos">Todas</option>
                          {importAvailableGroups.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </div>
                      {/* Busca por nome */}
                      <div className="relative">
                        <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">
                          Busca
                        </label>
                        <div className="relative">
                          <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                            size={14}
                          />
                          <input
                            type="text"
                            placeholder="Buscar por título..."
                            value={importFilterSearch}
                            onChange={(e) => setImportFilterSearch(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 placeholder:text-white/20"
                          />
                        </div>
                      </div>
                    </div>
                    {/* Atalhos de seleção rápida por ano */}
                    <div className="flex flex-wrap gap-2">
                      <p className="text-[10px] text-white/30 mr-1 self-center">Rápido:</p>
                      {[2026, 2024, 2022, 2020, 2015, 2010].map((y) => (
                        <button
                          key={y}
                          onClick={() => {
                            setImportFilterYearMin(y);
                            setImportFilterYearMax(2030);
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${importFilterYearMin === y ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                        >
                          {y}+
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setImportFilterYearMin(1900);
                          setImportFilterYearMax(2030);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${importFilterYearMin === 1900 ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                      >
                        Todos
                      </button>
                    </div>
                    {/* Botões de seleção em massa */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                      <button
                        onClick={selectOnlyFiltered}
                        className="px-4 py-1.5 rounded-lg text-xs font-bold bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-all"
                      >
                        ✅ Selecionar filtrados ({filteredImportItems.length})
                      </button>
                      <button
                        onClick={selectAllFiltered}
                        className="px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-all"
                      >
                        + Adicionar filtrados
                      </button>
                      <button
                        onClick={deselectAllFiltered}
                        className="px-4 py-1.5 rounded-lg text-xs font-bold bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-all"
                      >
                        − Remover filtrados
                      </button>
                      <button
                        onClick={() => setSelectedPreview({ movies: new Set(), series: new Set() })}
                        className="px-4 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-white/40 hover:bg-white/10 transition-all ml-auto"
                      >
                        Limpar tudo
                      </button>
                    </div>
                  </div>

                  {/* Info de distribuição */}
                  {selectedPreview.movies.size + selectedPreview.series.size > 0 && (
                    <div className="bg-green-500/5 border border-green-500/15 rounded-xl p-3">
                      <p className="text-xs text-white/60">
                        📌 <strong className="text-white/80">Distribuição automática:</strong>{' '}
                        Filmes vão para <span className="text-red-400">pág. Filmes</span> +{' '}
                        <span className="text-blue-400">Home</span> • Séries vão para{' '}
                        <span className="text-purple-400">pág. Séries</span> +{' '}
                        <span className="text-blue-400">Home</span> • Conteúdo kids vai para{' '}
                        <span className="text-yellow-400">pág. Kids</span>
                      </p>
                    </div>
                  )}

                  {/* Lista filtrada com detalhes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
                    {/* Filmes */}
                    {(importFilterType === 'Todos' || importFilterType === 'movie') && (
                      <div className="bg-black/40 rounded-xl p-4 border border-white/5 flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-bold text-white flex items-center gap-2">
                            <Film size={14} className="text-red-400" /> Filmes
                          </p>
                          <p className="text-white/40 text-xs">
                            {filteredImportMovies.length} filtrados •{' '}
                            <span className="text-green-400">
                              {selectedPreview.movies.size} selecionados
                            </span>
                          </p>
                        </div>
                        <div className="max-h-72 overflow-y-auto space-y-1 flex-1 custom-scrollbar pr-1">
                          {filteredImportMovies.length === 0 && (
                            <p className="text-white/20 text-xs text-center py-4">
                              Nenhum filme com esses filtros
                            </p>
                          )}
                          {filteredImportMovies.map((m) => (
                            <label
                              key={`m-${m._idx}`}
                              className={`flex items-center gap-3 text-xs py-2 px-3 rounded-xl cursor-pointer transition-all border ${selectedPreview.movies.has(m._idx) ? 'bg-green-600/10 border-green-500/20' : 'border-transparent hover:bg-white/5'}`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedPreview.movies.has(m._idx)}
                                onChange={() => togglePreviewSelect('movies', m._idx)}
                                className="accent-green-500 shrink-0"
                              />
                              {m.logo_url && (
                                <img
                                  src={m.logo_url}
                                  className="w-7 h-10 rounded object-cover shrink-0 bg-white/5"
                                  alt=""
                                  onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold line-clamp-1">{m.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {m.year && <span className="text-white/40">{m.year}</span>}
                                  {m.kids && (
                                    <span className="text-yellow-400 text-[10px]">🧒 Kids</span>
                                  )}
                                  {Array.isArray(m.genre) && m.genre.length > 0 && (
                                    <span className="text-white/25 line-clamp-1">
                                      {m.genre.slice(0, 3).join(', ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {m.platform && (
                                <span className="text-[10px] text-white/20 shrink-0 max-w-20 truncate">
                                  {m.platform}
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Séries */}
                    {(importFilterType === 'Todos' || importFilterType === 'series') && (
                      <div className="bg-black/40 rounded-xl p-4 border border-white/5 flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-bold text-white flex items-center gap-2">
                            <Tv size={14} className="text-purple-400" /> Séries
                          </p>
                          <p className="text-white/40 text-xs">
                            {filteredImportSeries.length} filtrados •{' '}
                            <span className="text-green-400">
                              {selectedPreview.series.size} selecionados
                            </span>
                          </p>
                        </div>
                        <div className="max-h-72 overflow-y-auto space-y-1 flex-1 custom-scrollbar pr-1">
                          {filteredImportSeries.length === 0 && (
                            <p className="text-white/20 text-xs text-center py-4">
                              Nenhuma série com esses filtros
                            </p>
                          )}
                          {filteredImportSeries.map((s) => (
                            <label
                              key={`s-${s._idx}`}
                              className={`flex items-center gap-3 text-xs py-2 px-3 rounded-xl cursor-pointer transition-all border ${selectedPreview.series.has(s._idx) ? 'bg-purple-600/10 border-purple-500/20' : 'border-transparent hover:bg-white/5'}`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedPreview.series.has(s._idx)}
                                onChange={() => togglePreviewSelect('series', s._idx)}
                                className="accent-purple-500 shrink-0"
                              />
                              {s.logo_url && (
                                <img
                                  src={s.logo_url}
                                  className="w-7 h-10 rounded object-cover shrink-0 bg-white/5"
                                  alt=""
                                  onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold line-clamp-1">{s.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {s.year && <span className="text-white/40">{s.year}</span>}
                                  {s.kids && (
                                    <span className="text-yellow-400 text-[10px]">🧒 Kids</span>
                                  )}
                                  {Array.isArray(s.genre) && s.genre.length > 0 && (
                                    <span className="text-white/25 line-clamp-1">
                                      {s.genre.slice(0, 3).join(', ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {s.platform && (
                                <span className="text-[10px] text-white/20 shrink-0 max-w-20 truncate">
                                  {s.platform}
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {(importing ||
                importProgress.step === 'Inserindo no banco' ||
                importProgress.step === 'Finalizado') && (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2 font-bold">
                      <span
                        className={importProgress.step === 'Finalizado' ? 'text-green-400' : ''}
                      >
                        {importProgress.step === 'Finalizado'
                          ? '✅ Importação Concluída'
                          : importProgress.step || 'Processando...'}
                      </span>
                      <span>
                        {importProgress.movies} filmes • {importProgress.series} séries
                      </span>
                    </div>
                    {/* Barra de progresso */}
                    {importing && (
                      <div className="space-y-2">
                        <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden border border-white/10">
                          {downloadProgress.total > 0 ? (
                            <div
                              className="h-full rounded-full bg-linear-to-r from-purple-600 via-cyan-500 to-purple-600 transition-all duration-300 ease-out"
                              style={{
                                width: `${Math.min((downloadProgress.loaded / downloadProgress.total) * 100, 100)}%`,
                              }}
                            />
                          ) : importProgress.step === 'Inserindo no banco' &&
                            importProgress.movies + importProgress.series > 0 ? (
                            <div
                              className="h-full rounded-full bg-linear-to-r from-green-600 via-emerald-500 to-green-600 transition-all duration-300 ease-out"
                              style={{
                                width: `${Math.min(((importProgress.movies + importProgress.series) / Math.max(previewMovies.length > 0 || previewSeries.length > 0 ? selectedPreview.movies.size + selectedPreview.series.size : 1, 1)) * 100, 100)}%`,
                              }}
                            />
                          ) : (
                            <div
                              className="h-full rounded-full bg-linear-to-r from-purple-600 via-cyan-500 to-purple-600 animate-pulse"
                              style={{
                                width: '100%',
                                animation:
                                  'pulse 1.5s ease-in-out infinite, shimmer 2s linear infinite',
                              }}
                            />
                          )}
                        </div>
                        <div className="flex justify-between text-[11px] text-white/40">
                          {downloadProgress.phase && <span>{downloadProgress.phase}</span>}
                          {downloadProgress.total > 0 && (
                            <span>
                              {formatBytes(downloadProgress.loaded)} /{' '}
                              {formatBytes(downloadProgress.total)} (
                              {Math.round((downloadProgress.loaded / downloadProgress.total) * 100)}
                              %)
                            </span>
                          )}
                          {downloadProgress.total === 0 && downloadProgress.phase && (
                            <span className="animate-pulse">Aguarde, processando...</span>
                          )}
                          {importProgress.step === 'Inserindo no banco' && (
                            <span>Inserindo lotes no Supabase...</span>
                          )}
                          {importProgress.step === 'Lendo arquivo' && (
                            <span>Lendo e analisando arquivo...</span>
                          )}
                        </div>
                      </div>
                    )}
                    {importProgress.step === 'Finalizado' && (
                      <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden border border-white/10">
                        <div
                          className="h-full rounded-full bg-linear-to-r from-green-600 to-emerald-400"
                          style={{ width: '100%' }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 bg-black/40 rounded-xl p-4 overflow-y-auto font-mono text-xs space-y-2 border border-white/5 max-h-75">
                    {importProgress.logs.length === 0 ? (
                      <p className="text-center text-white/20 py-8">Aguardando...</p>
                    ) : (
                      importProgress.logs.map((log, i) => (
                        <div key={i} className="p-2 rounded text-white/80">
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              <div className="flex gap-4 mt-6 pt-6 border-t border-white/5">
                <button
                  onClick={() => {
                    setShowImportUpload(false);
                    setImportFile(null);
                    setImportUrl('');
                    setImportMode('file');
                    setImportProgress({ step: '', logs: [], movies: 0, series: 0 });
                    setPreviewMovies([]);
                    setPreviewSeries([]);
                    setSelectedPreview({ movies: new Set(), series: new Set() });
                    setImportFilterType('Todos');
                    setImportFilterKids('Todos');
                    setImportFilterYearMin(1900);
                    setImportFilterYearMax(2030);
                    setImportFilterGroup('Todos');
                    setImportFilterGenre('Todos');
                    setImportFilterSearch('');
                  }}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-white/5 hover:bg-white/10 text-white"
                >
                  Fechar
                </button>
                {!importing &&
                  importMode === 'file' &&
                  importFile &&
                  importProgress.step === '' &&
                  !importProgress.logs.length && (
                    <button
                      onClick={handleImportParse}
                      className="flex-1 py-3 rounded-xl font-bold text-sm bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      Ler Arquivo
                    </button>
                  )}
                {!importing &&
                  importMode === 'url' &&
                  importUrl.trim() &&
                  importProgress.step === '' &&
                  !importProgress.logs.length && (
                    <button
                      onClick={handleImportFromUrl}
                      disabled={fetchingUrl}
                      className="flex-1 py-3 rounded-xl font-bold text-sm bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {fetchingUrl ? (
                        'Baixando...'
                      ) : (
                        <>
                          <Globe size={16} /> Ler da URL
                        </>
                      )}
                    </button>
                  )}
                {!importing &&
                  importProgress.step === 'Pronto para inserir' &&
                  selectedPreview.movies.size + selectedPreview.series.size > 0 && (
                    <button
                      onClick={handleImportInsert}
                      className="flex-1 py-3 rounded-xl font-bold text-sm bg-green-600 hover:bg-green-700 text-white"
                    >
                      Inserir {selectedPreview.movies.size + selectedPreview.series.size}{' '}
                      Selecionados
                    </button>
                  )}
              </div>
            </div>
          </div>
        )}

        {/* Create New Content Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1a1a20] w-full max-w-6xl max-h-[95vh] overflow-y-auto rounded-2xl border border-white/10 shadow-2xl">
              <div className="sticky top-0 bg-[#1a1a20] p-6 border-b border-white/5 flex justify-between items-center z-10">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Plus size={20} className="text-green-500" /> Novo Conteúdo
                </h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 hover:bg-white/10 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-8">
                {/* Tipo */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setCreateType('movie')}
                    className={`flex-1 py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all border ${createType === 'movie' ? 'bg-red-600/20 border-red-500 text-red-400 shadow-[0_0_20px_rgba(220,38,38,0.2)]' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}
                  >
                    <Film size={20} /> Filme
                  </button>
                  <button
                    onClick={() => setCreateType('series')}
                    className={`flex-1 py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all border ${createType === 'series' ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.2)]' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}
                  >
                    <Tv size={20} /> Série
                  </button>
                </div>

                {/* Busca TMDB - Preencher automaticamente */}
                <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                  <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                    Buscar no TMDB (opcional — preenche automaticamente)
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tmdbSearchQuery}
                      onChange={(e) => setTmdbSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleTmdbSearch()}
                      placeholder={`Buscar ${createType === 'movie' ? 'filme' : 'série'} no TMDB...`}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-600/50 placeholder:text-white/20"
                    />
                    <button
                      onClick={handleTmdbSearch}
                      disabled={searchingTmdb}
                      className="px-6 py-3 rounded-xl font-bold text-sm bg-white/10 hover:bg-white/20 text-white disabled:opacity-50"
                    >
                      {searchingTmdb ? 'Buscando...' : 'Buscar'}
                    </button>
                  </div>
                  {tmdbSearchResults.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 max-h-64 overflow-y-auto custom-scrollbar">
                      {tmdbSearchResults.map((r: any) => (
                        <button
                          key={r.id}
                          onClick={() => fillFromTmdb(r)}
                          className="bg-white/5 hover:bg-white/10 rounded-xl p-2 text-left transition-all group border border-transparent hover:border-red-500/30"
                        >
                          <div className="aspect-2/3 bg-white/10 rounded-lg overflow-hidden mb-2">
                            {r.poster_path ? (
                              <img
                                src={getImageUrl(r.poster_path, 'w200') || ''}
                                className="w-full h-full object-cover"
                                alt=""
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                                Sem imagem
                              </div>
                            )}
                          </div>
                          <p className="text-xs font-bold line-clamp-2 group-hover:text-red-400 transition-colors">
                            {r.title || r.name}
                          </p>
                          <p className="text-[10px] text-white/40 mt-0.5">
                            {new Date(r.release_date || r.first_air_date || '').getFullYear() ||
                              '—'}{' '}
                            • ⭐ {r.vote_average?.toFixed(1) || '—'}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Formulário */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Coluna esquerda — Dados */}
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                        Título *
                      </label>
                      <input
                        type="text"
                        value={createForm.title}
                        onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-600/50"
                        placeholder="Nome do filme ou série"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                        Descrição
                      </label>
                      <textarea
                        rows={4}
                        value={createForm.description}
                        onChange={(e) =>
                          setCreateForm({ ...createForm, description: e.target.value })
                        }
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white resize-none focus:outline-none focus:border-red-600/50"
                        placeholder="Sinopse..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                          Ano
                        </label>
                        <input
                          type="number"
                          value={createForm.year}
                          onChange={(e) =>
                            setCreateForm({ ...createForm, year: parseInt(e.target.value) || 0 })
                          }
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-600/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                          TMDB ID
                        </label>
                        <input
                          type="text"
                          value={createForm.tmdb_id}
                          onChange={(e) =>
                            setCreateForm({ ...createForm, tmdb_id: e.target.value })
                          }
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-red-600/50"
                          placeholder="Ex: 550"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                          Gêneros (vírgula)
                        </label>
                        <input
                          type="text"
                          value={createForm.genre}
                          onChange={(e) => setCreateForm({ ...createForm, genre: e.target.value })}
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-600/50"
                          placeholder="Ação, Drama, Ficção"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                          Nota
                        </label>
                        <input
                          type="text"
                          value={createForm.rating}
                          onChange={(e) => setCreateForm({ ...createForm, rating: e.target.value })}
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-600/50"
                          placeholder="8.5"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                        URL do Stream
                      </label>
                      <input
                        type="text"
                        value={createForm.stream_url}
                        onChange={(e) =>
                          setCreateForm({ ...createForm, stream_url: e.target.value })
                        }
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-xs focus:outline-none focus:border-red-600/50"
                        placeholder="https://... .mp4 ou .m3u8"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                        Poster (URL)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={createForm.poster}
                          onChange={(e) => setCreateForm({ ...createForm, poster: e.target.value })}
                          className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-mono focus:outline-none focus:border-red-600/50"
                          placeholder="URL da imagem vertical"
                        />
                        <label className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center cursor-pointer shrink-0">
                          <Upload size={16} className="text-white/60" />
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={async (e) => {
                              if (!e.target.files?.[0]) return;
                              setCreating(true);
                              let file = e.target.files[0];
                              if (isConvertibleImage(file)) {
                                try {
                                  file = await convertToWebP(file);
                                } catch {}
                              }
                              const url = await uploadImage(file, 'posters');
                              if (url) setCreateForm((prev) => ({ ...prev, poster: url }));
                              setCreating(false);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                        Backdrop (URL)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={createForm.backdrop}
                          onChange={(e) =>
                            setCreateForm({ ...createForm, backdrop: e.target.value })
                          }
                          className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-mono focus:outline-none focus:border-red-600/50"
                          placeholder="URL da imagem horizontal"
                        />
                        <label className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center cursor-pointer shrink-0">
                          <Upload size={16} className="text-white/60" />
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={async (e) => {
                              if (!e.target.files?.[0]) return;
                              setCreating(true);
                              let file = e.target.files[0];
                              if (isConvertibleImage(file)) {
                                try {
                                  file = await convertToWebP(file);
                                } catch {}
                              }
                              const url = await uploadImage(file, 'backdrops');
                              if (url) setCreateForm((prev) => ({ ...prev, backdrop: url }));
                              setCreating(false);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                          Plataforma
                        </label>
                        <select
                          value={createForm.platform}
                          onChange={(e) =>
                            setCreateForm({ ...createForm, platform: e.target.value })
                          }
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-600/50"
                        >
                          <option value="">Nenhuma</option>
                          <option value="Netflix">Netflix</option>
                          <option value="Prime Video">Prime Video</option>
                          <option value="Disney+">Disney+</option>
                          <option value="HBO Max">HBO Max</option>
                          <option value="Apple TV+">Apple TV+</option>
                          <option value="Globoplay">Globoplay</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                          Status
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setCreateForm({ ...createForm, status: 'published' })}
                            className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${createForm.status === 'published' ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-black/20 border-white/10 text-white/40'}`}
                          >
                            Publicado
                          </button>
                          <button
                            type="button"
                            onClick={() => setCreateForm({ ...createForm, status: 'draft' })}
                            className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${createForm.status === 'draft' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' : 'bg-black/20 border-white/10 text-white/40'}`}
                          >
                            Rascunho
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Coluna direita — Preview */}
                  <div className="space-y-6">
                    <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                      <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4">
                        Preview
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-white/30 mb-2">Poster Vertical</p>
                          <div className="aspect-2/3 bg-white/5 rounded-lg overflow-hidden">
                            {resolvePosterUrl(createForm.poster) ? (
                              <img
                                src={resolvePosterUrl(createForm.poster)!}
                                className="w-full h-full object-cover"
                                alt="Preview poster"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                                Sem imagem
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/30 mb-2">Backdrop Horizontal</p>
                          <div className="aspect-video bg-white/5 rounded-lg overflow-hidden">
                            {createForm.backdrop ? (
                              <img
                                src={createForm.backdrop}
                                className="w-full h-full object-cover"
                                alt="Preview backdrop"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                                Sem imagem
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Resumo */}
                    <div className="bg-black/40 rounded-xl p-4 border border-white/5 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-white/40">
                        Dados Preenchidos
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${createForm.title ? 'bg-green-500' : 'bg-white/20'}`}
                          />
                          <span className={createForm.title ? 'text-white' : 'text-white/30'}>
                            Título
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${createForm.description ? 'bg-green-500' : 'bg-white/20'}`}
                          />
                          <span className={createForm.description ? 'text-white' : 'text-white/30'}>
                            Descrição
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${createForm.poster ? 'bg-green-500' : 'bg-white/20'}`}
                          />
                          <span className={createForm.poster ? 'text-white' : 'text-white/30'}>
                            Poster
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${createForm.backdrop ? 'bg-green-500' : 'bg-white/20'}`}
                          />
                          <span className={createForm.backdrop ? 'text-white' : 'text-white/30'}>
                            Backdrop
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${createForm.stream_url ? 'bg-green-500' : 'bg-yellow-500'}`}
                          />
                          <span
                            className={createForm.stream_url ? 'text-white' : 'text-yellow-500/60'}
                          >
                            Stream URL
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${createForm.tmdb_id ? 'bg-green-500' : 'bg-white/20'}`}
                          />
                          <span className={createForm.tmdb_id ? 'text-white' : 'text-white/30'}>
                            TMDB ID
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${createForm.genre ? 'bg-green-500' : 'bg-white/20'}`}
                          />
                          <span className={createForm.genre ? 'text-white' : 'text-white/30'}>
                            Gêneros
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${createForm.year ? 'bg-green-500' : 'bg-white/20'}`}
                          />
                          <span className={createForm.year ? 'text-white' : 'text-white/30'}>
                            Ano
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-white/5 flex justify-end gap-3 sticky bottom-0 bg-[#1a1a20]">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-3 rounded-xl font-bold text-sm hover:bg-white/10 text-white/60 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !createForm.title.trim()}
                  className="px-8 py-3 rounded-xl font-bold text-sm bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)]"
                >
                  {creating ? (
                    'Salvando...'
                  ) : (
                    <>
                      <Plus size={18} /> Criar {createType === 'movie' ? 'Filme' : 'Série'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingItem && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1a1a20] w-full max-w-6xl max-h-[95vh] overflow-y-auto rounded-2xl border border-white/10 shadow-2xl">
              <div className="sticky top-0 bg-[#1a1a20] p-6 border-b border-white/5 flex justify-between items-center z-10">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Edit2 size={20} className="text-red-500" /> Editar{' '}
                  {editingItem.type === 'movie' ? 'Filme' : 'Série'}
                </h3>
                <button
                  onClick={() => setEditingItem(null)}
                  className="p-2 hover:bg-white/10 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Left column */}
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                      Título
                    </label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                      Descrição
                    </label>
                    <textarea
                      rows={5}
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 resize-none"
                    ></textarea>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                      Poster Vertical
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editForm.poster}
                        onChange={(e) => setEditForm({ ...editForm, poster: e.target.value })}
                        className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono"
                        placeholder="URL ou Upload"
                      />
                      <label className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center cursor-pointer">
                        <Upload size={16} className="text-white/60" />
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={(e) =>
                            e.target.files?.[0] &&
                            handleFileUpload(e.target.files[0], 'posters', 'poster')
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                      Backdrop Horizontal
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editForm.backdrop}
                        onChange={(e) => setEditForm({ ...editForm, backdrop: e.target.value })}
                        className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono"
                        placeholder="URL ou Upload"
                      />
                      <label className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center cursor-pointer">
                        <Upload size={16} className="text-white/60" />
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={(e) =>
                            e.target.files?.[0] &&
                            handleFileUpload(e.target.files[0], 'backdrops', 'backdrop')
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                      Logo
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editForm.logo_url}
                        onChange={(e) => setEditForm({ ...editForm, logo_url: e.target.value })}
                        className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono"
                        placeholder="URL ou Upload"
                      />
                      <label className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center cursor-pointer">
                        <Upload size={16} className="text-white/60" />
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={(e) =>
                            e.target.files?.[0] &&
                            handleFileUpload(e.target.files[0], 'logos', 'logo_url')
                          }
                        />
                      </label>
                    </div>
                    <p className="text-[10px] text-white/30 mt-1">
                      Logo em PNG transparente que substitui o título texto.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                      Plataforma
                    </label>
                    <select
                      value={editForm.platform}
                      onChange={(e) => setEditForm({ ...editForm, platform: e.target.value })}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3"
                    >
                      <option value="">Nenhuma</option>
                      <option value="Netflix">Netflix</option>
                      <option value="Prime Video">Prime Video</option>
                      <option value="Disney+">Disney+</option>
                      <option value="HBO Max">HBO Max</option>
                      <option value="Apple TV+">Apple TV+</option>
                      <option value="Hulu">Hulu</option>
                      <option value="Paramount+">Paramount+</option>
                      <option value="Globoplay">Globoplay</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                      Status
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, status: 'published' })}
                        className={`flex-1 py-3 rounded-xl text-xs font-bold ${editForm.status === 'published' ? 'bg-green-500/20 border-green-500 text-green-500' : 'bg-black/20 border-white/10 text-white/40'}`}
                      >
                        Publicado
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, status: 'draft' })}
                        className={`flex-1 py-3 rounded-xl text-xs font-bold ${editForm.status === 'draft' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' : 'bg-black/20 border-white/10 text-white/40'}`}
                      >
                        Rascunho
                      </button>
                    </div>
                  </div>

                  {editingItem.type === 'movie' && (
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                        Stream (URL)
                      </label>
                      <input
                        type="text"
                        value={editForm.stream_url}
                        onChange={(e) => setEditForm({ ...editForm, stream_url: e.target.value })}
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono"
                      />
                      <p className="text-[10px] text-white/30 mt-1">URL do vídeo MP4 ou M3U8.</p>
                    </div>
                  )}
                </div>

                {/* Right column: previews */}
                <div className="space-y-8">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                      <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4">
                        Vertical
                      </p>
                      <div className="w-full aspect-2/3 bg-white/5 rounded-lg overflow-hidden">
                        {resolvePosterUrl(editForm.poster) ? (
                          <img
                            src={resolvePosterUrl(editForm.poster)!}
                            className="w-full h-full object-cover"
                            alt="Poster"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/20">
                            Sem Imagem
                          </div>
                        )}
                        {editForm.logo_url && (
                          <img
                            src={editForm.logo_url}
                            className="absolute bottom-4 left-0 right-0 w-3/4 mx-auto object-contain h-12"
                            alt="Logo"
                          />
                        )}
                      </div>
                    </div>

                    <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                      <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4">
                        Horizontal (Hover)
                      </p>
                      <div className="w-full aspect-video bg-white/5 rounded-lg overflow-hidden relative">
                        {editForm.use_trailer && editForm.trailer_url ? (
                          <div className="w-full h-full bg-black flex items-center justify-center">
                            <div
                              className="absolute inset-0 opacity-50 bg-cover bg-center"
                              style={{ backgroundImage: `url(${editForm.backdrop})` }}
                            />
                            <div className="z-10 bg-red-600/20 p-2 rounded-full border border-red-500" />
                          </div>
                        ) : editForm.backdrop ? (
                          <img
                            src={editForm.backdrop}
                            className="w-full h-full object-cover opacity-60"
                            alt="Backdrop"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/20">
                            Sem Imagem
                          </div>
                        )}
                        {!editForm.use_trailer && (
                          <div className="absolute bottom-4 left-4">
                            {editForm.logo_url ? (
                              <img
                                src={editForm.logo_url}
                                className="h-8 object-contain mb-2"
                                alt="Logo"
                              />
                            ) : (
                              <h3 className="text-sm font-bold mb-1 line-clamp-1">
                                {editForm.title}
                              </h3>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-bold uppercase tracking-widest text-white/40">
                        Mídia de Destaque (Hover)
                      </p>
                      <label className="flex items-center cursor-pointer gap-2">
                        <span className="text-xs text-white/60">
                          {editForm.use_trailer ? 'Trailer' : 'Imagem'}
                        </span>
                        <div className="relative">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={editForm.use_trailer}
                            onChange={(e) =>
                              setEditForm({ ...editForm, use_trailer: e.target.checked })
                            }
                          />
                          <div
                            className={`block w-10 h-6 rounded-full ${editForm.use_trailer ? 'bg-red-600' : 'bg-white/10'}`}
                          ></div>
                          <div
                            className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full ${editForm.use_trailer ? 'transform translate-x-4' : ''}`}
                          ></div>
                        </div>
                      </label>
                    </div>

                    {editForm.use_trailer && (
                      <div>
                        <input
                          type="text"
                          value={editForm.trailer_url}
                          onChange={(e) =>
                            setEditForm({ ...editForm, trailer_url: e.target.value })
                          }
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono"
                          placeholder="URL do Trailer (MP4/YouTube)"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Temporadas & Episódios — exibido somente para séries */}
              {editingItem.type === 'series' && (
                <div className="px-8 pb-6 border-t border-white/5 pt-6">
                  <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/40 mb-4">
                    <List size={16} className="text-red-500" /> Temporadas &amp; Episódios
                  </h4>

                  {seriesSeasons.length === 0 ? (
                    <p className="text-white/30 text-xs italic">
                      Nenhuma temporada cadastrada para esta série.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {/* Tabs de temporadas */}
                      <div className="flex flex-wrap gap-2">
                        {seriesSeasons.map((season) => (
                          <button
                            key={season.id}
                            type="button"
                            onClick={() => setSelectedSeasonId(season.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${selectedSeasonId === season.id ? 'bg-red-600 text-white' : 'bg-white/5 hover:bg-white/10 text-white/60'}`}
                          >
                            T{season.season_number}
                            {season.title ? ` — ${season.title}` : ''}
                          </button>
                        ))}
                      </div>

                      {/* Lista de episódios da temporada selecionada */}
                      {selectedSeasonId && (
                        <div className="bg-black/20 rounded-xl border border-white/5 overflow-hidden">
                          {loadingEpisodes ? (
                            <p className="text-white/30 text-xs p-4">Carregando episódios...</p>
                          ) : (seasonEpisodesMap[selectedSeasonId] || []).length === 0 ? (
                            <p className="text-white/30 text-xs p-4 italic">
                              Nenhum episódio cadastrado para esta temporada.
                            </p>
                          ) : (
                            <div className="divide-y divide-white/5">
                              {(seasonEpisodesMap[selectedSeasonId] || []).map((ep) => (
                                <div key={ep.id} className="flex items-center gap-3 px-4 py-3">
                                  <span className="text-white/40 text-xs font-mono w-8 shrink-0">
                                    E{ep.episode_number}
                                  </span>
                                  <span
                                    className="text-white/80 text-xs font-semibold truncate w-40 shrink-0"
                                    title={ep.title}
                                  >
                                    {ep.title}
                                  </span>
                                  <input
                                    type="text"
                                    value={episodeUrlEdits[ep.id] ?? ''}
                                    onChange={(e) =>
                                      setEpisodeUrlEdits((prev) => ({
                                        ...prev,
                                        [ep.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="URL do stream (M3U8/MP4)..."
                                    className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white/80 placeholder-white/20 focus:border-red-500 outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEpisode(ep.id)}
                                    disabled={savingEpisodeIds.has(ep.id)}
                                    className="shrink-0 px-3 py-2 rounded-lg text-xs font-bold bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/20 disabled:opacity-40 transition-colors"
                                  >
                                    {savingEpisodeIds.has(ep.id) ? '...' : <Save size={13} />}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="p-6 border-t border-white/5 flex justify-end gap-3 sticky bottom-0 bg-[#1a1a20]">
                <button
                  onClick={() => setEditingItem(null)}
                  className="px-6 py-3 rounded-xl font-bold text-sm hover:bg-white/10 text-white/60"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-8 py-3 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                >
                  {saving ? (
                    <>Salvando...</>
                  ) : (
                    <>
                      <Save size={18} /> Salvar Alterações
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm */}
        {deletingItem && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1a1a20] w-full max-w-md rounded-2xl border border-red-500/20 shadow-2xl p-8 text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} className="text-red-500" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Excluir Conteúdo?</h3>
              <p className="text-white/60 mb-8">
                Tem certeza que deseja excluir <strong>{deletingItem.title}</strong>? Esta ação não
                pode ser desfeita.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setDeletingItem(null)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-white/5 hover:bg-white/10 text-white"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-700 text-white"
                >
                  Sim, Excluir
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default VOD;
