import { supabase, supabaseAdmin } from './supabaseService';
import { UserProfile } from '../types';
import { logger } from '../utils/logger';

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

// Lock para evitar race condition em createBucket concorrente
let bucketEnsured = false;

// Cores de avatar predefinidas
export const AVATAR_COLORS = [
  'bg-red-600',
  'bg-blue-600',
  'bg-green-600',
  'bg-purple-600',
  'bg-yellow-500',
  'bg-pink-600',
  'bg-cyan-500',
  'bg-orange-500',
];

// Classificações etárias brasileiras
export const PARENTAL_RATINGS = [
  {
    label: 'L',
    value: 'L',
    level: 0,
    color: 'bg-green-500',
    description: 'Livre para todas as idades',
  },
  {
    label: '10+',
    value: '10+',
    level: 10,
    color: 'bg-blue-500',
    description: 'Não recomendado para menores de 10 anos',
  },
  {
    label: '12+',
    value: '12+',
    level: 12,
    color: 'bg-yellow-500',
    description: 'Não recomendado para menores de 12 anos',
  },
  {
    label: '14+',
    value: '14+',
    level: 14,
    color: 'bg-orange-500',
    description: 'Não recomendado para menores de 14 anos',
  },
  {
    label: '16+',
    value: '16+',
    level: 16,
    color: 'bg-red-500',
    description: 'Não recomendado para menores de 16 anos',
  },
  {
    label: '18+',
    value: '18+',
    level: 18,
    color: 'bg-red-800',
    description: 'Não recomendado para menores de 18 anos',
  },
];

const PIN_HASH_PREFIX = 'sha256:';
const LOCAL_PROFILE_STORAGE_PREFIX = 'redx-local-profiles:';

const isHashedPin = (pin: string): boolean => pin.startsWith(PIN_HASH_PREFIX);
const isLocalProfileUser = (userId: string): boolean => userId.startsWith('local-');

const getLocalProfilesKey = (userId: string): string => `${LOCAL_PROFILE_STORAGE_PREFIX}${userId}`;

const readLocalProfiles = (userId: string): UserProfile[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getLocalProfilesKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UserProfile[]) : [];
  } catch {
    return [];
  }
};

const writeLocalProfiles = (userId: string, profiles: UserProfile[]): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getLocalProfilesKey(userId), JSON.stringify(profiles));
};

const findLocalProfileOwner = (profileId: string): string | null => {
  if (typeof window === 'undefined') return null;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(LOCAL_PROFILE_STORAGE_PREFIX)) continue;
    const userId = key.replace(LOCAL_PROFILE_STORAGE_PREFIX, '');
    const profiles = readLocalProfiles(userId);
    if (profiles.some((profile) => profile.id === profileId)) {
      return userId;
    }
  }
  return null;
};

const buildDefaultLocalProfile = (userId: string): UserProfile => {
  const now = new Date().toISOString();
  return {
    id: `${userId}-default-profile`,
    name: 'Redx',
    avatarColor: AVATAR_COLORS[0],
    isKids: false,
    language: 'pt-BR',
    parentalRating: '18+',
    parentalPin: '',
    parentalEnabled: false,
    maturityLevel: 18,
    autoPlayNext: true,
    created_at: now,
    updated_at: now,
  };
};

const sha256Fallback = (input: string): string => {
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
    0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
    0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
    0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
    0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
  ];
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) { bytes.push(0xc0 | (c >> 6)); bytes.push(0x80 | (c & 0x3f)); }
    else { bytes.push(0xe0 | (c >> 12)); bytes.push(0x80 | ((c >> 6) & 0x3f)); bytes.push(0x80 | (c & 0x3f)); }
  }
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 56; i >= 0; i -= 8) bytes.push((bitLen >>> i) & 0xff);

  let [h0, h1, h2, h3, h4, h5, h6, h7] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const r = (n: number, b: number) => (n >>> b) | (n << (32 - b));
  for (let off = 0; off < bytes.length; off += 64) {
    const w = new Array<number>(64);
    for (let i = 0; i < 16; i++) w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let i = 0; i < 64; i++) {
      const S1 = r(e, 6) ^ r(e, 11) ^ r(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + k[i] + w[i]) | 0;
      const S0 = r(a, 2) ^ r(a, 13) ^ r(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
};

const hashPin = async (pin: string): Promise<string> => {
  if (!pin) return '';
  if (isHashedPin(pin)) return pin;

  if (globalThis.crypto?.subtle) {
    const encoded = new TextEncoder().encode(pin);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    const hash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    return `${PIN_HASH_PREFIX}${hash}`;
  }

  return `${PIN_HASH_PREFIX}${sha256Fallback(pin)}`;
};

// Mapear dados do DB para UserProfile
export const mapDBToProfile = (data: any): UserProfile => ({
  id: data.id,
  name: data.name,
  avatar: data.avatar_url || undefined,
  avatarColor: data.avatar_color || 'bg-blue-600',
  isKids: data.is_kids || false,
  language: 'pt-BR',
  parentalRating: data.parental_rating || '18+',
  parentalPin: data.parental_pin || '',
  parentalEnabled: data.parental_enabled || false,
  maturityLevel: data.maturity_level ?? 18,
  autoPlayNext: data.auto_play_next ?? true,
});

export const uploadAvatar = async (file: File, userId: string): Promise<string | null> => {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    logger.error(`[uploadAvatar] Tipo não permitido: ${file.type}`);
    return null;
  }
  if (file.size > MAX_AVATAR_SIZE) {
    logger.error(`[uploadAvatar] Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
    return null;
  }

  try {
    logger.debug(
      '[uploadAvatar] Starting upload for file:',
      file.name,
      'size:',
      file.size,
      'type:',
      file.type
    );
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${userId}/${Date.now()}.${fileExt}`;

    // Tentar usar admin client se disponível para evitar bloqueios de RLS
    const storageClient = supabaseAdmin || supabase;
    logger.debug(`[uploadAvatar] Using ${supabaseAdmin ? 'ADMIN' : 'ANON'} client for storage`);

    let { data: _uploadData, error: uploadError } = await storageClient.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      console.warn('[uploadAvatar] Initial upload to "avatars" failed:', uploadError.message);

      if (!bucketEnsured) {
        logger.debug('[uploadAvatar] Attempting to ensure bucket "avatars"...');
        const { error: createError } = await storageClient.storage.createBucket('avatars', {
          public: true,
        });

        if (createError) {
          console.error('[uploadAvatar] Failed to create bucket:', createError.message);
          logger.debug('[uploadAvatar] Using fallback "posters" bucket');
          const fallbackPath = `avatars/${fileName}`;
          const { error: fallbackError } = await storageClient.storage
            .from('posters')
            .upload(fallbackPath, file, { upsert: true });

          if (fallbackError) {
            console.error('[uploadAvatar] Fallback upload also failed:', fallbackError.message);
            return null;
          }
          const { data } = storageClient.storage.from('posters').getPublicUrl(fallbackPath);
          return data.publicUrl;
        }
        bucketEnsured = true;
        const retry = await storageClient.storage
          .from('avatars')
          .upload(fileName, file, { upsert: true });
        uploadError = retry.error;
      }
    }

    if (uploadError) {
      console.error('[uploadAvatar] Upload permanent error:', uploadError);
      return null;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
    logger.debug('[uploadAvatar] Success! Public URL:', data.publicUrl);
    return data.publicUrl;
  } catch (err) {
    logger.error('[uploadAvatar] Erro inesperado:', err);
    return null;
  }
};

// Recuperar perfis do usuário
export const getProfiles = async (userId: string): Promise<UserProfile[]> => {
  if (isLocalProfileUser(userId)) {
    const localProfiles = readLocalProfiles(userId);
    if (localProfiles.length > 0) return localProfiles;
    const fallback = [buildDefaultLocalProfile(userId)];
    writeLocalProfiles(userId, fallback);
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Erro ao buscar perfis:', error);
      return [];
    }

    return (data || []).map(mapDBToProfile);
  } catch (error) {
    logger.error('Erro inesperado ao buscar perfis:', error);
    return [];
  }
};

export const createProfile = async (
  userId: string,
  data: {
    name: string;
    isKids?: boolean;
    avatarColor?: string;
    parentalRating?: string;
    parentalPin?: string;
    parentalEnabled?: boolean;
    maturityLevel?: number;
    avatarFile?: File | null;
    autoPlayNext?: boolean;
  }
): Promise<UserProfile | null> => {
  if (isLocalProfileUser(userId)) {
    const now = new Date().toISOString();
    const profile: UserProfile = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `local-profile-${crypto.randomUUID()}`
          : `local-profile-${userId}-${Date.now()}`,
      name: data.name,
      avatar: null as unknown as string,
      avatarColor:
        data.avatarColor || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      isKids: data.isKids || false,
      language: 'pt-BR',
      parentalRating: data.parentalRating || (data.isKids ? 'L' : '18+'),
      parentalPin: data.parentalPin ? await hashPin(data.parentalPin) : '',
      parentalEnabled: Boolean(data.parentalPin) || Boolean(data.isKids),
      maturityLevel: data.maturityLevel ?? (data.isKids ? 0 : 18),
      autoPlayNext: data.autoPlayNext ?? true,
      created_at: now,
      updated_at: now,
    };
    const nextProfiles = [...readLocalProfiles(userId), profile];
    writeLocalProfiles(userId, nextProfiles);
    return profile;
  }

  try {
    let avatarUrl = null;
    if (data.avatarFile) {
      avatarUrl = await uploadAvatar(data.avatarFile, userId);
    }

    const isKids = data.isKids || false;
    const normalizedPin = (data.parentalPin || '').trim();
    const newProfile: any = {
      user_id: userId,
      name: data.name,
      avatar_url: avatarUrl,
      avatar_color:
        data.avatarColor || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      is_kids: isKids,
      parental_rating: data.parentalRating || (isKids ? 'L' : '18+'),
      parental_pin: normalizedPin ? await hashPin(normalizedPin) : '',
      parental_enabled: !!normalizedPin || isKids,
      maturity_level: data.maturityLevel ?? (isKids ? 0 : 18),
      auto_play_next: data.autoPlayNext ?? true,
    };

    const storageClient = supabaseAdmin || supabase;
    const { data: inserted, error } = await storageClient
      .from('user_profiles')
      .insert([newProfile])
      .select()
      .single();

    if (error) throw new Error(`Erro ao salvar perfil: ${error.message}`);
    return mapDBToProfile(inserted);
  } catch (error) {
    logger.error('Erro no serviço de perfil:', error);
    throw error;
  }
};

export const deleteProfile = async (profileId: string, avatarUrl?: string): Promise<boolean> => {
  const localProfileOwner = findLocalProfileOwner(profileId);
  if (localProfileOwner) {
    const userId = localProfileOwner;
    const nextProfiles = readLocalProfiles(userId).filter((profile) => profile.id !== profileId);
    writeLocalProfiles(userId, nextProfiles);
    return true;
  }

  try {
    if (avatarUrl) {
      const pathParts = avatarUrl.split('/avatars/');
      if (pathParts.length > 1) {
        await supabase.storage.from('avatars').remove([pathParts[1]]);
      }
    }

    const storageClient = supabaseAdmin || supabase;
    const { error } = await storageClient.from('user_profiles').delete().eq('id', profileId);
    if (error) {
      logger.error('Erro ao deletar perfil:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const updateProfile = async (
  profileId: string,
  userId: string,
  updates: {
    name?: string;
    avatarFile?: File | null;
    isKids?: boolean;
    avatarColor?: string;
    parentalRating?: string;
    parentalPin?: string;
    parentalEnabled?: boolean;
    maturityLevel?: number;
    autoPlayNext?: boolean;
  }
): Promise<UserProfile | null> => {
  if (userId.startsWith('local-')) {
    const profiles = readLocalProfiles(userId);
    const profile = profiles.find((entry) => entry.id === profileId);
    if (!profile) return null;
    const updated: UserProfile = {
      ...profile,
      name: updates.name ?? profile.name,
      isKids: updates.isKids ?? profile.isKids,
      avatarColor: updates.avatarColor ?? profile.avatarColor,
      parentalRating: updates.parentalRating ?? profile.parentalRating,
      parentalPin: updates.parentalPin ? await hashPin(updates.parentalPin) : profile.parentalPin,
      parentalEnabled:
        updates.parentalEnabled ??
        (Boolean(updates.parentalPin) || Boolean(profile.parentalEnabled)),
      maturityLevel: updates.maturityLevel ?? profile.maturityLevel,
      autoPlayNext: updates.autoPlayNext ?? profile.autoPlayNext,
      updated_at: new Date().toISOString(),
    };
    writeLocalProfiles(
      userId,
      profiles.map((entry) => (entry.id === profileId ? updated : entry))
    );
    return updated;
  }

  try {
    const payload: any = {};

    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.isKids !== undefined) payload.is_kids = updates.isKids;
    if (updates.avatarColor !== undefined) payload.avatar_color = updates.avatarColor;
    if (updates.parentalRating !== undefined) payload.parental_rating = updates.parentalRating;
    if (updates.parentalPin !== undefined) {
      const normalizedPin = updates.parentalPin.trim();
      payload.parental_pin = normalizedPin ? await hashPin(normalizedPin) : '';
    }
    if (updates.parentalEnabled !== undefined) payload.parental_enabled = updates.parentalEnabled;
    if (updates.maturityLevel !== undefined) payload.maturity_level = updates.maturityLevel;
    if (updates.autoPlayNext !== undefined) payload.auto_play_next = updates.autoPlayNext;

    if (updates.avatarFile) {
      const uploadedUrl = await uploadAvatar(updates.avatarFile, userId);
      if (uploadedUrl) payload.avatar_url = uploadedUrl;
    }

    if (Object.keys(payload).length === 0) return null;

    const storageClient = supabaseAdmin || supabase;
    const { data, error } = await storageClient
      .from('user_profiles')
      .update(payload)
      .eq('id', profileId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao atualizar: ${error.message}`);
    return mapDBToProfile(data);
  } catch (error) {
    logger.error('Erro ao atualizar perfil:', error);
    throw error;
  }
};

// Verificar PIN de controle parental (migra PINs legados plaintext → hash on verify)
export const verifyParentalPin = async (
  profile: UserProfile,
  inputPin: string
): Promise<boolean> => {
  if (!profile.parentalEnabled || !profile.parentalPin) return true;

  const storedPin = profile.parentalPin;
  if (isHashedPin(storedPin)) {
    return storedPin === (await hashPin(inputPin));
  }

  // Legacy plaintext PIN — verify then migrate to hash
  if (storedPin !== inputPin) return false;

  try {
    const hashed = await hashPin(inputPin);
    if (profile.id) {
      await supabase
        .from('profiles')
        .update({ parental_pin: hashed, updated_at: new Date().toISOString() })
        .eq('id', profile.id);
    }
    saveParentalPinLocal(profile.id, inputPin);
  } catch { /* best-effort migration */ }

  return true;
};

// Salvar/Ler PIN do localStorage (fallback)
export const saveParentalPinLocal = async (profileId: string, pin: string) => {
  try {
    const pins = JSON.parse(localStorage.getItem('redx_parental_pins') || '{}');
    pins[profileId] = await hashPin(pin);
    localStorage.setItem('redx_parental_pins', JSON.stringify(pins));
  } catch {
    /* ignorar */
  }
};

export const getParentalPinLocal = (profileId: string): string => {
  try {
    const pins = JSON.parse(localStorage.getItem('redx_parental_pins') || '{}');
    return pins[profileId] || '';
  } catch {
    return '';
  }
};

// Verificar se perfil pode acessar conteúdo baseado na classificação
export const canAccessContent = (
  profile: UserProfile,
  contentRating: string | number = 0
): boolean => {
  // 1. Obter nível numérico do conteúdo
  let contentLevel = 0;

  if (typeof contentRating === 'number') {
    contentLevel = contentRating;
  } else {
    // Parsing básico de string para número
    const r = String(contentRating)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (['L', 'G', '0', 'SC', 'TVY', 'TVG'].includes(r)) contentLevel = 0;
    else if (r.includes('10') || r.includes('PG')) contentLevel = 10;
    else if (r.includes('12') || r.includes('PG13')) contentLevel = 12;
    else if (r.includes('14')) contentLevel = 14;
    else if (r.includes('16')) contentLevel = 16;
    else if (r.includes('18') || r.includes('TVMA') || r.includes('R')) contentLevel = 18;
    else contentLevel = 0; // Default seguro
  }

  // 2. Obter nível permitido do perfil
  // Se não tiver rating definido, assume 18 (liberado)
  const profileRatingObj = PARENTAL_RATINGS.find((pr) => pr.value === profile.parentalRating);
  const profileLevel = profileRatingObj ? profileRatingObj.level : 18;

  // 3. Comparar
  return contentLevel <= profileLevel;
};
