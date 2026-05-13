/**
 * useVODCrud.ts — CRUD operations for VOD admin page.
 *
 * Extraído de pages/admin/VOD.tsx para separar a lógica de dados da UI.
 * Handles: load, create, edit, delete, bulk-delete.
 */

import { useState, useCallback, useEffect } from 'react';
import { Media } from '../../types';
import {
  getAllMovies,
  getAllSeries,
  insertMovie,
  insertSeries,
  updateMovie,
  updateSeries,
  deleteMovie,
  deleteSeries,
} from '../../services/supabaseService';
import { getCacheService } from '../../services/cacheService';
import { logger } from '../../utils/logger';
import { useToast } from '@/contexts/ToastContext';

/** Invalida todas as camadas de cache do catálogo após uma mutação no admin. */
function invalidateCatalogCaches(): void {
  // Camada 1: localStorage (cache canónico: redx-catalog-cache-v8 em useCatalogLoader)
  try {
    localStorage.removeItem('redx-catalog-cache');
  } catch {}
  // Camada 2: CacheService IndexedDB (prefix 'catalog:')
  getCacheService()
    .invalidateByPrefix('catalog:')
    .catch(() => {});
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type VODStatus = 'published' | 'draft';

export interface CreateFormState {
  title: string;
  description: string;
  poster: string;
  backdrop: string;
  logo_url: string;
  stream_url: string;
  trailer_url: string;
  use_trailer: boolean;
  platform: string;
  year: number;
  genre: string;
  tmdb_id: string;
  rating: string;
  status: VODStatus;
}

export interface EditFormState {
  title: string;
  description: string;
  poster: string;
  backdrop: string;
  logo_url: string;
  stream_url: string;
  trailer_url: string;
  use_trailer: boolean;
  platform: string;
  status: VODStatus;
}

const EMPTY_CREATE_FORM: CreateFormState = {
  title: '',
  description: '',
  poster: '',
  backdrop: '',
  logo_url: '',
  stream_url: '',
  trailer_url: '',
  use_trailer: false,
  platform: '',
  year: new Date().getFullYear(),
  genre: '',
  tmdb_id: '',
  rating: '',
  status: 'published',
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVODCrud() {
  const { showToast } = useToast();

  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ movies: 0, series: 0 });

  // Edit
  const [editingItem, setEditingItem] = useState<Media | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    title: '',
    description: '',
    poster: '',
    backdrop: '',
    logo_url: '',
    stream_url: '',
    trailer_url: '',
    use_trailer: false,
    platform: '',
    status: 'published',
  });
  const [saving, setSaving] = useState(false);

  // Delete
  const [deletingItem, setDeletingItem] = useState<Media | null>(null);

  // Create
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState<'movie' | 'series'>('movie');
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [creating, setCreating] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ─── Load ────────────────────────────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const [movies, series] = await Promise.all([getAllMovies(), getAllSeries()]);
      const combined: Media[] = [
        ...movies.map((m: any) => ({ ...m, type: 'movie' as const })),
        ...series.map((s: any) => ({ ...s, type: 'series' as const })),
      ];
      setItems(combined);
      setStats({ movies: movies.length, series: series.length });
    } catch (e) {
      logger.error('[VOD] Erro ao carregar dados:', e);
      showToast('Erro ao carregar catálogo.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // ─── Edit ────────────────────────────────────────────────────────────────────

  const handleEdit = useCallback((item: Media) => {
    setEditingItem(item);
    setEditForm({
      title: item.title || '',
      description: item.description || '',
      poster: item.poster || '',
      backdrop: item.backdrop || '',
      logo_url: item.logo_url || '',
      stream_url: item.stream_url || '',
      trailer_url: item.trailer_url || '',
      use_trailer: item.use_trailer || false,
      platform: item.platform || '',
      status: (item.status as VODStatus) || 'published',
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingItem) return;
    setSaving(true);
    try {
      const payload: any = {
        title: editForm.title.trim(),
        description: editForm.description || null,
        poster: editForm.poster || null,
        backdrop: editForm.backdrop || null,
        logo_url: editForm.logo_url || null,
        stream_url: editForm.stream_url || null,
        trailer_url: editForm.trailer_url || null,
        use_trailer: editForm.use_trailer,
        platform: editForm.platform || null,
        status: editForm.status,
      };
      if (editingItem.type === 'movie') await updateMovie(editingItem.id, payload);
      else await updateSeries(editingItem.id, payload);
      invalidateCatalogCaches();
      setItems((prev) => prev.map((i) => (i.id === editingItem.id ? { ...i, ...payload } : i)));
      setEditingItem(null);
      showToast('Alterações salvas com sucesso!', 'success');
    } catch (error: any) {
      logger.error('[VOD] Erro ao salvar:', error);
      showToast(`Erro: ${error.message || 'Falha ao salvar'}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [editingItem, editForm, showToast]);

  // ─── Delete ──────────────────────────────────────────────────────────────────

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingItem) return;
    try {
      if (deletingItem.type === 'movie') await deleteMovie(deletingItem.id);
      else await deleteSeries(deletingItem.id);
      invalidateCatalogCaches();
      setItems((prev) => prev.filter((i) => i.id !== deletingItem.id));
      setStats((prev) => ({
        movies: deletingItem.type === 'movie' ? prev.movies - 1 : prev.movies,
        series: deletingItem.type === 'series' ? prev.series - 1 : prev.series,
      }));
      showToast(`"${deletingItem.title}" excluído.`, 'success');
    } catch (error: any) {
      logger.error('[VOD] Erro ao excluir:', error);
      showToast(`Erro: ${error.message || 'Falha ao excluir'}`, 'error');
    } finally {
      setDeletingItem(null);
    }
  }, [deletingItem, showToast]);

  // ─── Bulk delete ─────────────────────────────────────────────────────────────

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const confirm = window.confirm(
      `Excluir ${count} itens selecionados? Esta ação não pode ser desfeita.`
    );
    if (!confirm) return;
    let deleted = 0;
    for (const id of selectedIds) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      try {
        if (item.type === 'movie') await deleteMovie(id);
        else await deleteSeries(id);
        deleted++;
      } catch (e) {
        logger.error(`[VOD] Erro ao excluir ${id}:`, e);
      }
    }
    setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
    setStats((prev) => {
      const deletedMovies = items.filter((i) => selectedIds.has(i.id) && i.type === 'movie').length;
      const deletedSeries = items.filter(
        (i) => selectedIds.has(i.id) && i.type === 'series'
      ).length;
      return { movies: prev.movies - deletedMovies, series: prev.series - deletedSeries };
    });
    setSelectedIds(new Set());
    showToast(`${deleted} itens excluídos.`, 'success');
  }, [selectedIds, items, showToast]);

  // ─── Selection ───────────────────────────────────────────────────────────────

  const handleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((filteredItems: Media[]) => {
    setSelectedIds((prev) =>
      prev.size === filteredItems.length ? new Set() : new Set(filteredItems.map((i) => i.id))
    );
  }, []);

  // ─── Create ──────────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    if (!createForm.title.trim()) {
      showToast('Título é obrigatório.', 'warning');
      return;
    }
    setCreating(true);
    try {
      const payload: any = {
        title: createForm.title.trim(),
        description: createForm.description || null,
        poster: createForm.poster || null,
        backdrop: createForm.backdrop || null,
        logo_url: createForm.logo_url || null,
        stream_url: createForm.stream_url || null,
        trailer_url: createForm.trailer_url || null,
        use_trailer: createForm.use_trailer || false,
        platform: createForm.platform || null,
        year: createForm.year || null,
        genre: createForm.genre
          ? createForm.genre
              .split(',')
              .map((g) => g.trim())
              .filter(Boolean)
          : [],
        status: createForm.status,
      };
      if (createForm.tmdb_id) payload.tmdb_id = parseInt(createForm.tmdb_id) || null;
      if (createForm.rating) payload.rating = parseFloat(createForm.rating) || null;

      const result =
        createType === 'movie' ? await insertMovie(payload) : await insertSeries(payload);

      if (result) {
        invalidateCatalogCaches();
        const newItem = { ...result, type: createType } as Media;
        setItems((prev) => [newItem, ...prev]);
        setStats((prev) => ({
          movies: createType === 'movie' ? prev.movies + 1 : prev.movies,
          series: createType === 'series' ? prev.series + 1 : prev.series,
        }));
        setShowCreateModal(false);
        setCreateForm(EMPTY_CREATE_FORM);
        showToast(`${createType === 'movie' ? 'Filme' : 'Série'} criado com sucesso!`, 'success');
      }
    } catch (error: any) {
      logger.error('Erro ao criar:', error);
      showToast(`Erro: ${error.message || 'Falha ao criar'}`, 'error');
    } finally {
      setCreating(false);
    }
  }, [createForm, createType, showToast]);

  return {
    // State
    items,
    setItems,
    loading,
    stats,
    setStats,
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
    // Actions
    loadItems,
    handleEdit,
    handleSave,
    handleDeleteConfirm,
    handleBulkDelete,
    handleSelect,
    handleSelectAll,
    handleCreate,
  };
}
