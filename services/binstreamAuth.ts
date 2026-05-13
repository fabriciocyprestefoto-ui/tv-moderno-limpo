import { logger } from '../utils/logger';

const DEFAULT_AUTH_SERVER = import.meta.env.VITE_BINSTREAM_AUTH_SERVER || '';
const DEFAULT_AUTH_SERVER_LIST = (import.meta.env.VITE_BINSTREAM_AUTH_SERVERS || '')
  .split(',')
  .map((value: string) => value.trim())
  .filter(Boolean);
const DEFAULT_USER = import.meta.env.VITE_BINSTREAM_USER || '';
const DEFAULT_DOMAIN = import.meta.env.VITE_BINSTREAM_DOMAIN || '';

type JsonRecord = Record<string, unknown>;

export interface BinstreamCredentials {
  authServer?: string;
  authServers?: string[];
  user?: string;
  password?: string;
  domain?: string;
}

export interface BinstreamAuthResult {
  authServer: string;
  token?: string;
  session?: string;
  sourceUrl?: string;
  manifestUrl?: string;
  trackerUrls: string[];
  iceServers: RTCIceServer[];
  swarmId?: string;
  headers: Record<string, string>;
  raw: unknown;
}

export class BinstreamAuthError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'BinstreamAuthError';
    this.status = status;
    this.body = body;
  }
}

interface AuthAttempt {
  label: string;
  headers: Record<string, string>;
  body: BodyInit;
}

interface AuthFailure {
  server: string;
  label: string;
  status: number;
  payload: unknown;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeUrl(value: unknown): string | undefined {
  const candidate = normalizeString(value);
  if (!candidate) return undefined;
  if (/^(https?:|wss?:|blob:)/i.test(candidate)) return candidate;
  return undefined;
}

function visitValue(
  value: unknown,
  callback: (key: string, nestedValue: unknown) => void,
  seen = new Set<unknown>()
): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) visitValue(item, callback, seen);
    return;
  }

  for (const [key, nestedValue] of Object.entries(value as JsonRecord)) {
    callback(key, nestedValue);
    visitValue(nestedValue, callback, seen);
  }
}

function collectMatchingValues(payload: unknown, keys: string[]): unknown[] {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const matches: unknown[] = [];

  visitValue(payload, (key, value) => {
    if (wanted.has(key.toLowerCase())) matches.push(value);
  });

  return matches;
}

function pickFirstString(payload: unknown, keys: string[]): string | undefined {
  for (const value of collectMatchingValues(payload, keys)) {
    const candidate = normalizeString(value);
    if (candidate) return candidate;
  }
  return undefined;
}

function pickFirstUrl(payload: unknown, keys: string[]): string | undefined {
  for (const value of collectMatchingValues(payload, keys)) {
    const candidate = normalizeUrl(value);
    if (candidate) return candidate;
  }
  return undefined;
}

function extractStringArray(payload: unknown, keys: string[]): string[] {
  const result = new Set<string>();

  for (const value of collectMatchingValues(payload, keys)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const candidate = normalizeString(item);
        if (candidate) result.add(candidate);
      }
      continue;
    }

    const candidate = normalizeString(value);
    if (candidate) result.add(candidate);
  }

  return [...result];
}

function extractHeaders(payload: unknown): Record<string, string> {
  const keys = ['headers', 'requestHeaders', 'authHeaders'];

  for (const value of collectMatchingValues(payload, keys)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;

    const mapped = Object.entries(value as JsonRecord).reduce<Record<string, string>>(
      (acc, [key, item]) => {
        const normalized = normalizeString(item);
        if (normalized) acc[key] = normalized;
        return acc;
      },
      {}
    );

    if (Object.keys(mapped).length > 0) return mapped;
  }

  return {};
}

function extractIceServers(payload: unknown): RTCIceServer[] {
  const keys = ['iceServers', 'rtcConfig', 'rtc', 'stunServers', 'turnServers'];
  const iceServers: RTCIceServer[] = [];

  for (const value of collectMatchingValues(payload, keys)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          iceServers.push({ urls: item });
          continue;
        }

        if (!item || typeof item !== 'object') continue;
        const candidate = item as Record<string, unknown>;
        const urls = candidate.urls ?? candidate.url;
        if (!urls) continue;
        iceServers.push({
          urls: Array.isArray(urls) ? urls.map((entry) => String(entry)) : String(urls),
          username: normalizeString(candidate.username),
          credential: normalizeString(candidate.credential),
        });
      }
      continue;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const nested = value as Record<string, unknown>;
    if (Array.isArray(nested.iceServers)) {
      for (const server of nested.iceServers) {
        if (server && typeof server === 'object') {
          const candidate = server as Record<string, unknown>;
          const urls = candidate.urls ?? candidate.url;
          if (!urls) continue;
          iceServers.push({
            urls: Array.isArray(urls) ? urls.map((entry) => String(entry)) : String(urls),
            username: normalizeString(candidate.username),
            credential: normalizeString(candidate.credential),
          });
        }
      }
    }
  }

  return iceServers;
}

function normalizeAuthPayload(authServer: string, payload: unknown): BinstreamAuthResult {
  const token = pickFirstString(payload, ['token', 'accessToken', 'access_token', 'jwt']);
  const session = pickFirstString(payload, ['session', 'sessionId', 'session_id']);
  const manifestUrl = pickFirstUrl(payload, [
    'manifestUrl',
    'manifest_url',
    'playlistUrl',
    'playlist_url',
    'playlist',
  ]);
  const sourceUrl =
    manifestUrl ||
    pickFirstUrl(payload, ['streamUrl', 'stream_url', 'sourceUrl', 'source_url', 'url', 'src']);
  const trackerUrls = extractStringArray(payload, [
    'tracker',
    'trackers',
    'trackerUrl',
    'trackerUrls',
    'announceTrackers',
  ]);
  const headers = extractHeaders(payload);
  const iceServers = extractIceServers(payload);
  const swarmId = pickFirstString(payload, [
    'swarmId',
    'swarm_id',
    'swarm',
    'contentId',
    'content_id',
    'channelId',
  ]);

  if (!headers.Authorization && token) {
    headers.Authorization = /^Bearer /i.test(token) ? token : `Bearer ${token}`;
  }

  if (!headers['X-Session-Id'] && session) {
    headers['X-Session-Id'] = session;
  }

  return {
    authServer,
    token,
    session,
    sourceUrl,
    manifestUrl,
    trackerUrls,
    iceServers,
    swarmId,
    headers,
    raw: payload,
  };
}

function buildEmail(user: string, domain: string): string {
  const cleanDomain = domain.startsWith('@') ? domain.slice(1) : domain;
  return `${user}@${cleanDomain}`;
}

function buildAuthAttempts(user: string, password: string, domain: string): AuthAttempt[] {
  const email = buildEmail(user, domain);
  const jsonAttempts: Array<{ label: string; payload: Record<string, string> }> = [
    { label: 'json-user', payload: { user, password } },
    { label: 'json-username', payload: { username: user, password } },
    { label: 'json-user-domain', payload: { user, password, domain } },
    { label: 'json-username-domain', payload: { username: user, password, domain } },
    { label: 'json-email', payload: { email, password } },
  ];

  const formAttempts: Array<{ label: string; payload: Record<string, string> }> = [
    { label: 'form-user', payload: { user, password } },
    { label: 'form-username', payload: { username: user, password } },
    { label: 'form-user-domain', payload: { user, password, domain } },
    { label: 'form-email', payload: { email, password } },
  ];

  return [
    ...jsonAttempts.map(({ label, payload }) => ({
      label,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
      },
      body: JSON.stringify(payload),
    })),
    ...formAttempts.map(({ label, payload }) => ({
      label,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/json, text/plain, */*',
      },
      body: new URLSearchParams(payload),
    })),
  ];
}

function unique(values: Array<string | undefined>): string[] {
  const result = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (trimmed) result.add(trimmed);
  }
  return [...result];
}

function buildAuthServerCandidates(primaryAuthServer: string, extraServers: string[]): string[] {
  return unique([...extraServers, primaryAuthServer]);
}

async function runAuthAttempt(
  authServer: string,
  attempt: AuthAttempt,
  signal?: AbortSignal
): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const response = await fetch(authServer, {
    method: 'POST',
    headers: attempt.headers,
    body: attempt.body,
    credentials: 'include',
    signal,
  });

  const rawText = await response.text();
  const payload = rawText ? safeParseJson(rawText) : null;
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

export async function loginBinstream(
  credentials: BinstreamCredentials = {},
  signal?: AbortSignal
): Promise<BinstreamAuthResult> {
  const authServer = credentials.authServer || DEFAULT_AUTH_SERVER;
  const authServers = buildAuthServerCandidates(
    authServer,
    credentials.authServers || DEFAULT_AUTH_SERVER_LIST
  );
  const user = credentials.user || DEFAULT_USER;
  const password = credentials.password || '';
  const domain = credentials.domain || DEFAULT_DOMAIN;
  const failures: AuthFailure[] = [];

  if (!password.trim()) {
    throw new BinstreamAuthError(
      'Credenciais Binstream indisponiveis no cliente. A senha nao deve ser enviada no bundle; autentique via backend/proxy seguro ou forneca a senha em tempo de execucao.',
      0,
      { code: 'missing_binstream_password' }
    );
  }

  for (const server of authServers) {
    for (const attempt of buildAuthAttempts(user, password, domain)) {
      try {
        const result = await runAuthAttempt(server, attempt, signal);
        if (!result.ok) {
          failures.push({
            server,
            label: attempt.label,
            status: result.status,
            payload: result.payload,
          });
          continue;
        }

        const normalized = normalizeAuthPayload(server, result.payload);
        logger.debug('[Binstream] auth success');
        return normalized;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error;
        }
        failures.push({
          server,
          label: attempt.label,
          status: 0,
          payload: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  const lastFailure = failures.at(-1) || null;
  throw new BinstreamAuthError(
    `Falha na autenticacao Binstream${lastFailure ? ` (${lastFailure.status || 'network'}) via ${lastFailure.server} / ${lastFailure.label}` : ''}`,
    lastFailure?.status || 0,
    {
      triedServers: authServers,
      failures,
    }
  );
}

export function getDefaultBinstreamCredentials(): Required<BinstreamCredentials> {
  return {
    authServer: DEFAULT_AUTH_SERVER,
    authServers: buildAuthServerCandidates(DEFAULT_AUTH_SERVER, DEFAULT_AUTH_SERVER_LIST),
    user: DEFAULT_USER,
    password: '',
    domain: DEFAULT_DOMAIN,
  };
}
