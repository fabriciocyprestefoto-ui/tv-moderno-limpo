import { logger } from '@/utils/logger';
import {
  normalizeAccessCode,
  ACCESS_CODE_RAW_LENGTH,
  ACCESS_CODE_SPECIAL_CHARS,
  hasAccessCodeComplexity,
} from '@/utils/accessCode';

export interface LocalAccessCodeRecord {
  id: string;
  code: string;
  type: 'trial' | 'full' | 'reseller';
  duration_days: number;
  max_uses: number | null;
  current_uses: number;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
  metadata: Record<string, any>;
}

const LOCAL_ACCESS_CODES_KEY = 'redx-local-access-codes-v1';
const ACCESS_CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ACCESS_CODE_NUMBERS = '23456789';
const ACCESS_CODE_MIXED_CHARS =
  ACCESS_CODE_LETTERS + ACCESS_CODE_NUMBERS + ACCESS_CODE_SPECIAL_CHARS;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function sortCodes(codes: LocalAccessCodeRecord[]): LocalAccessCodeRecord[] {
  return [...codes].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  );
}

function readLocalAccessCodes(): LocalAccessCodeRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_ACCESS_CODES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sortCodes(parsed as LocalAccessCodeRecord[]) : [];
  } catch (error) {
    logger.warn('Falha ao ler códigos locais:', error);
    return [];
  }
}

function writeLocalAccessCodes(codes: LocalAccessCodeRecord[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(LOCAL_ACCESS_CODES_KEY, JSON.stringify(sortCodes(codes)));
  } catch (error) {
    logger.warn('Falha ao salvar códigos locais:', error);
  }
}

function pickRandomChar(source: string): string {
  return source.charAt(Math.floor(Math.random() * source.length));
}

function shuffleChars(chars: string[]): string[] {
  const next = [...chars];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function generateRandomCode(length: number = ACCESS_CODE_RAW_LENGTH): string {
  const chars = [
    pickRandomChar(ACCESS_CODE_LETTERS),
    pickRandomChar(ACCESS_CODE_NUMBERS),
    pickRandomChar(ACCESS_CODE_SPECIAL_CHARS),
  ];

  while (chars.length < length) {
    chars.push(pickRandomChar(ACCESS_CODE_MIXED_CHARS));
  }

  return shuffleChars(chars).join('');
}

function generateUniqueCode(
  existingCodes: LocalAccessCodeRecord[],
  preferredCode?: string
): string {
  const preferred = preferredCode ? normalizeAccessCode(preferredCode) : '';
  if (
    preferred.length === ACCESS_CODE_RAW_LENGTH &&
    hasAccessCodeComplexity(preferred) &&
    !existingCodes.some((entry) => entry.code === preferred)
  ) {
    return preferred;
  }

  let candidate = generateRandomCode();
  while (
    !hasAccessCodeComplexity(candidate) ||
    existingCodes.some((entry) => entry.code === candidate)
  ) {
    candidate = generateRandomCode();
  }
  return candidate;
}

function buildId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `local-${crypto.randomUUID()}`;
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isExpired(expiresAt: string | null): boolean {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
}

function persistRecord(record: LocalAccessCodeRecord): LocalAccessCodeRecord {
  const codes = readLocalAccessCodes();
  const nextCodes = [
    record,
    ...codes.filter((entry) => entry.code !== record.code && entry.id !== record.id),
  ];
  writeLocalAccessCodes(nextCodes);
  return record;
}

export function createLocalAccessCode(params: {
  type: 'trial' | 'full' | 'reseller';
  duration_days: number;
  max_uses?: number | null;
  metadata?: Record<string, any>;
  code?: string;
}): LocalAccessCodeRecord {
  const existingCodes = readLocalAccessCodes();
  const rawCode = generateUniqueCode(existingCodes, params.code);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt);
  expiresAt.setDate(expiresAt.getDate() + params.duration_days);

  const record: LocalAccessCodeRecord = {
    id: buildId(),
    code: rawCode,
    type: params.type,
    duration_days: params.duration_days,
    max_uses: 1,
    current_uses: 0,
    created_by: null,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    is_active: true,
    metadata: {
      ...(params.metadata ?? {}),
      one_time_use: true,
      source: 'local',
    },
  };

  return persistRecord(record);
}

export function listLocalAccessCodes(): LocalAccessCodeRecord[] {
  return readLocalAccessCodes();
}

export function validateLocalAccessCode(code: string): {
  success: boolean;
  message: string;
  data: { type: string; duration_days: number; metadata: Record<string, any> } | null;
} {
  const normalizedCode = normalizeAccessCode(code);
  const codes = readLocalAccessCodes();
  const recordIndex = codes.findIndex((entry) => entry.code === normalizedCode);

  if (recordIndex === -1) {
    return { success: false, message: 'Código inválido', data: null };
  }

  const record = codes[recordIndex];
  if (!record.is_active) {
    return { success: false, message: 'Código inativo', data: null };
  }

  if (isExpired(record.expires_at)) {
    return { success: false, message: 'Código expirado', data: null };
  }

  if (record.max_uses !== null && record.current_uses >= record.max_uses) {
    return { success: false, message: 'Código já atingiu o limite de usos', data: null };
  }

  const updatedRecord: LocalAccessCodeRecord = {
    ...record,
    current_uses: record.current_uses + 1,
  };

  const nextCodes = [...codes];
  nextCodes[recordIndex] = updatedRecord;
  writeLocalAccessCodes(nextCodes);

  return {
    success: true,
    message: 'Código válido',
    data: {
      type: updatedRecord.type,
      duration_days: updatedRecord.duration_days,
      metadata: updatedRecord.metadata ?? {},
    },
  };
}

export function mirrorAccessCodeRecord(record: LocalAccessCodeRecord): LocalAccessCodeRecord {
  return persistRecord({
    ...record,
    code: normalizeAccessCode(record.code),
    max_uses: record.max_uses ?? 1,
    metadata: {
      ...(record.metadata ?? {}),
      one_time_use: true,
    },
  });
}

export function consumeLocalAccessCode(code: string): boolean {
  const normalizedCode = normalizeAccessCode(code);
  const codes = readLocalAccessCodes();
  const recordIndex = codes.findIndex((entry) => entry.code === normalizedCode);
  if (recordIndex === -1) return false;

  const record = codes[recordIndex];
  const updatedRecord: LocalAccessCodeRecord = {
    ...record,
    current_uses: Math.max(record.current_uses + 1, record.max_uses ?? 1),
    is_active: false,
  };
  const nextCodes = [...codes];
  nextCodes[recordIndex] = updatedRecord;
  writeLocalAccessCodes(nextCodes);
  return true;
}

export function deactivateLocalAccessCode(id: string): boolean {
  const codes = readLocalAccessCodes();
  const nextCodes = codes.map((entry) =>
    entry.id === id ? { ...entry, is_active: false } : entry
  );
  if (nextCodes.length === codes.length && !codes.some((entry) => entry.id === id)) {
    return false;
  }
  writeLocalAccessCodes(nextCodes);
  return true;
}

export function deleteLocalAccessCode(id: string): boolean {
  const codes = readLocalAccessCodes();
  const nextCodes = codes.filter((entry) => entry.id !== id);
  if (nextCodes.length === codes.length) return false;
  writeLocalAccessCodes(nextCodes);
  return true;
}
