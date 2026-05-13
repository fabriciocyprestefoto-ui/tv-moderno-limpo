/**
 * services/sportsApi.ts
 * Cliente para a API de esportes (sports.bzzoiro.com)
 */

import { env } from '../config/env';

const API_BASE = 'https://sports.bzzoiro.com/api';
const API_TOKEN = env.sportsApiToken;

const headers = {
  Authorization: `Token ${API_TOKEN}`,
  'Content-Type': 'application/json',
};

// --- Types ---

export interface League {
  id: number;
  name: string;
  country?: string;
  logo?: string | null;
  season?: string;
}

export interface Team {
  id: number;
  name: string;
  logo?: string | null;
  country?: string;
}

export interface SportEvent {
  id: number;
  home_team: string;
  away_team: string;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  league?: string;
  league_logo?: string | null;
  date: string;
  time?: string;
  status?: string;
  venue?: string;
  round?: string;
}

export interface LiveMatch {
  id: number;
  home_team: string;
  away_team: string;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  league?: string;
  league_logo?: string | null;
  status?: string;
  elapsed?: number | string | null;
  venue?: string;
}

export interface Prediction {
  id: number;
  home_team: string;
  away_team: string;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  league?: string;
  date: string;
  prediction?: string;
  confidence?: number | null;
}

// --- Fetch helpers ---

async function apiFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`Sports API error: ${res.status}`);
  return res.json();
}

// --- API methods ---

export async function getLeagues(): Promise<League[]> {
  try {
    const data = await apiFetch<any>('/leagues/');
    return Array.isArray(data) ? data : (data?.results ?? []);
  } catch (e) {
    console.error('[SportsAPI] getLeagues error:', e);
    return [];
  }
}

export async function getTeams(country?: string): Promise<Team[]> {
  try {
    const params: Record<string, string> = {};
    if (country) params.country = country;
    const data = await apiFetch<any>('/teams/', params);
    return Array.isArray(data) ? data : (data?.results ?? []);
  } catch (e) {
    console.error('[SportsAPI] getTeams error:', e);
    return [];
  }
}

export async function getEvents(filters?: {
  date_from?: string;
  date_to?: string;
  league?: string;
  status?: string;
}): Promise<SportEvent[]> {
  try {
    const params: Record<string, string> = {};
    if (filters?.date_from) params.date_from = filters.date_from;
    if (filters?.date_to) params.date_to = filters.date_to;
    if (filters?.league) params.league = filters.league;
    if (filters?.status) params.status = filters.status;
    const data = await apiFetch<any>('/events/', params);
    return Array.isArray(data) ? data : (data?.results ?? []);
  } catch (e) {
    console.error('[SportsAPI] getEvents error:', e);
    return [];
  }
}

export async function getLiveMatches(): Promise<LiveMatch[]> {
  try {
    const data = await apiFetch<any>('/live/');
    return Array.isArray(data) ? data : (data?.results ?? []);
  } catch (e) {
    console.error('[SportsAPI] getLiveMatches error:', e);
    return [];
  }
}

export async function getPredictions(upcoming?: boolean): Promise<Prediction[]> {
  try {
    const params: Record<string, string> = {};
    if (upcoming) params.upcoming = 'true';
    const data = await apiFetch<any>('/predictions/', params);
    return Array.isArray(data) ? data : (data?.results ?? []);
  } catch (e) {
    console.error('[SportsAPI] getPredictions error:', e);
    return [];
  }
}

// --- Utility ---

export function formatMatchDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d
      .toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
      .toUpperCase();
  } catch {
    return dateStr;
  }
}

export function formatMatchTime(dateStr: string, timeStr?: string): string {
  if (timeStr) {
    const m = timeStr.match(/^(\d{2}:\d{2})/);
    if (m) return m[1];
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}
