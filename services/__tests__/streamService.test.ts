/**
 * services/__tests__/streamService.test.ts
 *
 * Testa a cadeia de fallback de getStreamUrl e getEpisodeStreamUrl.
 * Estratégia: mockar supabase para controlar cada etapa da cadeia:
 *   1. tmdb_id numérico → 2. tmdb_id string → 3. título exato → 4. título parcial
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// vi.hoisted garante que estas variáveis existam antes do vi.mock (que é hoisted pelo Vitest)
const { mockRange, mockOrder, mockIlike, mockEq, mockSelect, mockFrom } = vi.hoisted(() => {
  const mockRange = vi.fn();
  const mockOrder = vi.fn().mockReturnThis();
  const mockIlike = vi.fn().mockReturnThis();
  const mockEq = vi.fn().mockReturnThis();
  const mockSelect = vi.fn().mockReturnThis();
  const mockFrom = vi.fn().mockReturnValue({
    select: mockSelect,
    eq: mockEq,
    ilike: mockIlike,
    order: mockOrder,
    range: mockRange,
    limit: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  });
  return { mockRange, mockOrder, mockIlike, mockEq, mockSelect, mockFrom };
});

vi.mock('../supabaseService', () => ({
  supabase: {
    from: mockFrom,
    storage: {
      from: vi.fn().mockReturnValue({
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: '' } }),
      }),
    },
  },
}));

// Deps auxiliares
vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../utils/securityGate', () => ({
  isTrusted: vi.fn().mockReturnValue(true),
}));

vi.mock('../../utils/safeUnicodeNormalize', () => ({
  stripDiacriticsSafe: vi.fn((s: string) => s),
}));

vi.mock('../../utils/imageProxy', () => ({
  toWebP: vi.fn((url: string) => url),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Configura mockRange para retornar os dados e erro dados */
function mockRangeResult(data: unknown[] | null, error: unknown = null) {
  mockRange.mockResolvedValueOnce({ data, error });
}

// ── Importar o módulo APÓS os mocks ──────────────────────────────────────────

import { getStreamUrl, getNextEpisode, clearStreamCache } from '../streamService';

// ── Testes ────────────────────────────────────────────────────────────────────

describe('getStreamUrl — filmes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStreamCache();
    // Reconfigurar o builder depois de clearAllMocks
    mockSelect.mockReturnThis();
    mockEq.mockReturnThis();
    mockIlike.mockReturnThis();
    mockOrder.mockReturnThis();
    mockFrom.mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      ilike: mockIlike,
      order: mockOrder,
      range: mockRange,
      limit: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
  });

  it('happy path: retorna stream_url pelo tmdb_id numérico (1a query)', async () => {
    mockRangeResult([{ stream_url: 'https://stream.redflix.tv/movie.m3u8' }]);

    const url = await getStreamUrl('Inception', 'movie', 27205);

    expect(url).toBe('https://stream.redflix.tv/movie.m3u8');
  });

  it('fallback tmdb_id string: retorna quando query numérica devolve vazio', async () => {
    // 1a query (numeric) → vazio
    mockRangeResult([]);
    // 2a query (string) → resultado
    mockRangeResult([{ stream_url: 'https://stream.redflix.tv/movie-str.m3u8' }]);

    const url = await getStreamUrl('Inception', 'movie', 27205);

    expect(url).toBe('https://stream.redflix.tv/movie-str.m3u8');
  });

  it('fallback título exato: retorna quando tmdb_id queries falham', async () => {
    mockRangeResult([]); // tmdb numeric
    mockRangeResult([]); // tmdb string
    mockRangeResult([{ stream_url: 'https://stream.redflix.tv/exact.m3u8' }]); // exact title

    const url = await getStreamUrl('Inception', 'movie', 27205);

    expect(url).toBe('https://stream.redflix.tv/exact.m3u8');
  });

  it('fallback parcial: retorna quando título exato falha', async () => {
    mockRangeResult([]); // tmdb numeric
    mockRangeResult([]); // tmdb string
    mockRangeResult([]); // exact title
    mockRangeResult([
      { title: 'Inception Extended', stream_url: 'https://stream.redflix.tv/partial.m3u8' },
    ]); // partial

    const url = await getStreamUrl('Inception', 'movie', 27205);

    expect(url).toBe('https://stream.redflix.tv/partial.m3u8');
  });

  it('not found: retorna null quando todos os fallbacks falham', async () => {
    mockRangeResult([]); // tmdb numeric
    mockRangeResult([]); // tmdb string
    mockRangeResult([]); // exact title
    mockRangeResult([]); // partial

    const url = await getStreamUrl('NonExistent Movie', 'movie', 99999);

    expect(url).toBeNull();
  });

  it('sem tmdb_id: pula direto para busca por título', async () => {
    mockRangeResult([{ stream_url: 'https://stream.redflix.tv/by-title.m3u8' }]); // exact title

    const url = await getStreamUrl('Inception', 'movie');

    expect(url).toBe('https://stream.redflix.tv/by-title.m3u8');
  });

  it('título vazio sem tmdb_id: retorna null imediatamente', async () => {
    const url = await getStreamUrl('', 'movie');

    expect(url).toBeNull();
    // Não deve ter chamado o supabase
    expect(mockRange).not.toHaveBeenCalled();
  });

  it('usa cache: segunda chamada idêntica não faz nova query supabase', async () => {
    mockRangeResult([{ stream_url: 'https://stream.redflix.tv/cached.m3u8' }]);

    const first = await getStreamUrl('Inception', 'movie', 27205);
    const second = await getStreamUrl('Inception', 'movie', 27205);

    expect(first).toBe('https://stream.redflix.tv/cached.m3u8');
    expect(second).toBe('https://stream.redflix.tv/cached.m3u8');
    // Supabase só chamado uma vez (resultado em cache)
    expect(mockRange).toHaveBeenCalledTimes(1);
  });
});

describe('getStreamUrl — retry com exception', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStreamCache();
    mockSelect.mockReturnThis();
    mockEq.mockReturnThis();
    mockIlike.mockReturnThis();
    mockOrder.mockReturnThis();
    mockFrom.mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      ilike: mockIlike,
      order: mockOrder,
      range: mockRange,
      limit: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
  });

  it('retorna null e não lança quando supabase lança exception', async () => {
    mockRange.mockRejectedValue(new Error('Network error'));

    const url = await getStreamUrl('Inception', 'movie', 27205);

    expect(url).toBeNull();
  });
});

// ── normalizeTitle (testado via getStreamUrl) ─────────────────────────────────
describe('normalizeTitle — comportamento via getStreamUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStreamCache();
    mockSelect.mockReturnThis();
    mockEq.mockReturnThis();
    mockIlike.mockReturnThis();
    mockOrder.mockReturnThis();
    mockFrom.mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      ilike: mockIlike,
      order: mockOrder,
      range: mockRange,
      limit: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
  });

  it('preserva & no título ao buscar por ilike', async () => {
    // Sem tmdb_id: vai direto para busca por título
    // Exact match retorna resultado
    mockRangeResult([{ stream_url: 'https://stream.redflix.tv/liga.m3u8' }]);

    const url = await getStreamUrl('Liga & Copa', 'movie');

    expect(url).toBe('https://stream.redflix.tv/liga.m3u8');
    // ilike foi chamado com um padrão que inclui &
    const ilikeCalls = mockIlike.mock.calls as [string, string][];
    expect(ilikeCalls.some(([, pattern]) => pattern.includes('&'))).toBe(true);
  });

  it('título com apenas espaços: retorna null sem query', async () => {
    const url = await getStreamUrl('   ', 'movie');

    expect(url).toBeNull();
    expect(mockRange).not.toHaveBeenCalled();
  });
});

// ── getNextEpisode — timeout + cache ─────────────────────────────────────────
describe('getNextEpisode — timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStreamCache();
    vi.useFakeTimers();
    mockSelect.mockReturnThis();
    mockEq.mockReturnThis();
    mockIlike.mockReturnThis();
    mockOrder.mockReturnThis();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna null após 8s quando supabase não responde', async () => {
    // Simula supabase travado (nunca resolve)
    const neverResolve = new Promise<never>(() => {});
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue(neverResolve),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnValue(neverResolve),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      maybeSingle: vi.fn().mockReturnValue(neverResolve),
    });

    const resultPromise = getNextEpisode(12345, 1, 1);
    // Avança 8001ms para disparar o timeout
    await vi.advanceTimersByTimeAsync(8001);

    const result = await resultPromise;
    expect(result).toBeNull();
  });
});

describe('getNextEpisode — cache hit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStreamCache();
    mockSelect.mockReturnThis();
    mockEq.mockReturnThis();
    mockIlike.mockReturnThis();
    mockOrder.mockReturnThis();
    mockFrom.mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      ilike: mockIlike,
      order: mockOrder,
      range: mockRange,
      limit: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
  });

  it('segunda chamada idêntica usa cache e não consulta supabase novamente', async () => {
    // Série não encontrada → null armazenado no cache
    const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: limitMock,
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const first = await getNextEpisode(99999, 1, 1);
    const callsAfterFirst = limitMock.mock.calls.length;

    const second = await getNextEpisode(99999, 1, 1);

    expect(first).toBeNull();
    expect(second).toBeNull();
    // Supabase não foi consultado na segunda chamada
    expect(limitMock.mock.calls.length).toBe(callsAfterFirst);
  });
});
