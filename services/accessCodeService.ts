import { supabase } from './supabaseService';
import { logger } from '../utils/logger';
import {
  consumeLocalAccessCode,
  createLocalAccessCode,
  deactivateLocalAccessCode,
  deleteLocalAccessCode,
  listLocalAccessCodes,
  mirrorAccessCodeRecord,
  validateLocalAccessCode,
} from '@/services/localAccessCodes';
import {
  ACCESS_CODE_RAW_LENGTH,
  ACCESS_CODE_SPECIAL_CHARS,
  hasAccessCodeComplexity,
  normalizeAccessCode,
} from '@/utils/accessCode';

export interface AccessCode {
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
  metadata: Record<string, unknown>;
}

function generateCodeLocally(length: number = ACCESS_CODE_RAW_LENGTH): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const chars = letters + numbers + ACCESS_CODE_SPECIAL_CHARS;
  const seed = [
    letters.charAt(Math.floor(Math.random() * letters.length)),
    numbers.charAt(Math.floor(Math.random() * numbers.length)),
    ACCESS_CODE_SPECIAL_CHARS.charAt(Math.floor(Math.random() * ACCESS_CODE_SPECIAL_CHARS.length)),
  ];

  while (seed.length < length) {
    seed.push(chars.charAt(Math.floor(Math.random() * chars.length)));
  }

  for (let index = seed.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [seed[index], seed[swapIndex]] = [seed[swapIndex], seed[index]];
  }

  const code = seed.join('');
  return hasAccessCodeComplexity(code) ? code : generateCodeLocally(length);
}

export async function generateAccessCode(params: {
  type: 'trial' | 'full' | 'reseller';
  duration_days: number;
  max_uses?: number | null;
  no_expiry?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<{ code: AccessCode | null; error: string | null }> {
  try {
    const generatedCode = generateCodeLocally(ACCESS_CODE_RAW_LENGTH);
    const maxUses = params.max_uses ?? 1;
    const expiresAt = params.no_expiry
      ? null
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() + params.duration_days);
          return d.toISOString();
        })();

    const { data, error } = await supabase
      .from('access_codes')
      .insert({
        code: generatedCode,
        type: params.type,
        duration_days: params.duration_days,
        max_uses: maxUses === 0 ? null : maxUses,
        expires_at: expiresAt,
        metadata: {
          ...(params.metadata || {}),
          one_time_use: maxUses === 1,
          unlimited_uses: maxUses === 0 || maxUses === null,
          no_expiry: params.no_expiry ?? false,
        },
      })
      .select()
      .single();

    if (error) {
      logger.warn('Erro ao criar código remoto, usando geração local:', error);
      const localCode = createLocalAccessCode({
        type: params.type,
        duration_days: params.duration_days,
        max_uses: maxUses === 0 ? null : maxUses,
        metadata: params.metadata,
        code: generatedCode,
      });
      return { code: localCode as AccessCode, error: null };
    }

    mirrorAccessCodeRecord(data as AccessCode);
    return { code: data as AccessCode, error: null };
  } catch (err) {
    logger.error('Erro ao gerar código de acesso:', err);
    const localCode = createLocalAccessCode({
      type: params.type,
      duration_days: params.duration_days,
      max_uses: params.max_uses ?? 1,
      metadata: params.metadata,
    });
    return { code: localCode as AccessCode, error: null };
  }
}

export async function validateAccessCode(code: string): Promise<{
  success: boolean;
  message: string;
  data: { type: string; duration_days: number; metadata: Record<string, unknown> } | null;
}> {
  try {
    const normalizedCode = normalizeAccessCode(code);

    const { data, error } = await supabase.rpc('validate_and_use_access_code', {
      code_input: normalizedCode,
    });

    if (error) {
      logger.error('❌ validateAccessCode - Erro RPC:', error);
      return validateLocalAccessCode(normalizedCode);
    }

    if (!data || data.length === 0) {
      return validateLocalAccessCode(normalizedCode);
    }

    const result = data[0];

    if (!result.success) {
      return {
        success: false,
        message: result.message || 'Código inválido ou expirado',
        data: null,
      };
    }

    consumeLocalAccessCode(normalizedCode);
    return {
      success: result.success,
      message: result.message,
      data: result.success ? result.code_data : null,
    };
  } catch (err) {
    logger.error('❌ validateAccessCode - Erro catch:', err);
    return validateLocalAccessCode(code);
  }
}

export async function getAllAccessCodes(): Promise<AccessCode[]> {
  const localCodes = listLocalAccessCodes() as AccessCode[];
  try {
    const { data, error } = await supabase
      .from('access_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Erro ao buscar códigos:', error);
      return localCodes;
    }

    const merged = new Map<string, AccessCode>();
    [...localCodes, ...((data as AccessCode[]) || [])].forEach((entry) => {
      merged.set(entry.code, entry);
    });
    return [...merged.values()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  } catch (err) {
    logger.error('Erro ao buscar códigos:', err);
    return localCodes;
  }
}

export async function deactivateAccessCode(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('access_codes').update({ is_active: false }).eq('id', id);

    if (error) {
      logger.error('Erro ao desativar código:', error);
      return deactivateLocalAccessCode(id);
    }
    return true;
  } catch (err) {
    logger.error('Erro ao desativar código:', err);
    return deactivateLocalAccessCode(id);
  }
}

export async function deleteAccessCode(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('access_codes').delete().eq('id', id);

    if (error) {
      logger.error('Erro ao deletar código:', error);
      return deleteLocalAccessCode(id);
    }
    return true;
  } catch (err) {
    logger.error('Erro ao deletar código:', err);
    return deleteLocalAccessCode(id);
  }
}
