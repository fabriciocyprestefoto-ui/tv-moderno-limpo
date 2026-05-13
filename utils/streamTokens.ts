/**
 * Stream Tokens
 *
 * O cliente nunca deve assinar ou validar tokens com segredo local. As funções
 * abaixo delegam para Edge Functions/Supabase, mantendo o secret fora do bundle JS.
 */

import { supabase } from '../services/supabaseService';
import { getDeviceFingerprint } from './deviceFingerprint';

interface StreamTokenPayload {
  userId: string;
  mediaId: string;
  mediaType: 'movie' | 'series';
  deviceFingerprint: string;
  expiresAt: number;
  iat: number;
  jti: string;
}

type GenerateTokenResponse = {
  token?: string;
};

type ValidateTokenResponse = {
  valid?: boolean;
  payload?: StreamTokenPayload;
};

/**
 * Gera token para streaming de vídeo via backend/Edge Function.
 */
export async function generateStreamToken(
  userId: string,
  mediaId: string,
  mediaType: 'movie' | 'series',
  expirationMinutes: number = 30
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<GenerateTokenResponse>(
    'create-stream-token',
    {
      body: {
        userId,
        mediaId,
        mediaType,
        expirationMinutes,
        deviceFingerprint: getDeviceFingerprint(),
      },
    }
  );

  if (error) {
    throw new Error(error.message || 'Erro ao gerar token de streaming');
  }

  if (!data?.token) {
    throw new Error('Backend não retornou token de streaming');
  }

  return data.token;
}

/**
 * Valida token de streaming via backend/Edge Function.
 */
export async function validateStreamToken(token: string): Promise<StreamTokenPayload | null> {
  const { data, error } = await supabase.functions.invoke<ValidateTokenResponse>(
    'validate-stream-token',
    {
      body: {
        token,
        deviceFingerprint: getDeviceFingerprint(),
      },
    }
  );

  if (error || !data?.valid) return null;
  return data.payload ?? null;
}

/**
 * Adiciona token a uma URL de streaming.
 */
export function addTokenToStreamUrl(url: string, token: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

/**
 * Extrai token de uma URL.
 */
export function extractTokenFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('token');
  } catch {
    return null;
  }
}

/**
 * Verifica se URL tem token válido.
 */
export async function hasValidToken(url: string): Promise<boolean> {
  const token = extractTokenFromUrl(url);
  if (!token) return false;

  const payload = await validateStreamToken(token);
  return payload !== null;
}

/**
 * Gera URL assinada com expiração.
 */
export async function generateSignedUrl(
  baseUrl: string,
  userId: string,
  mediaId: string,
  mediaType: 'movie' | 'series',
  expirationMinutes: number = 30
): Promise<string> {
  const token = await generateStreamToken(userId, mediaId, mediaType, expirationMinutes);
  return addTokenToStreamUrl(baseUrl, token);
}
