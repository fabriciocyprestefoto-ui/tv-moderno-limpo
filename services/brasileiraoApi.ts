/**
 * Serviço para consumir API do Brasileirão
 * Integração com a API Node.js criada
 */

import { ClassificacaoRow, MatchResult } from './brasileiraoData';

// URL da API do Brasileirão (ajuste conforme necessário)
const API_URL = import.meta.env.VITE_BRASILEIRAO_API_URL || 'http://localhost:3001/api';

/**
 * Busca classificação da API
 */
export async function getClassificacao(): Promise<ClassificacaoRow[]> {
  try {
    const response = await fetch(`${API_URL}/tabela`, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Mapear dados da API para o formato esperado
    return data.standings.map((item: any) => ({
      pos: item.position,
      team: item.team,
      pts: item.points,
      j: item.played,
      v: item.won,
      e: item.drawn,
      d: item.lost,
      gp: item.goalsFor,
      gc: item.goalsAgainst,
      sg: item.goalDifference,
      form: item.form || [],
    }));
  } catch (error) {
    console.error('❌ Erro ao buscar classificação da API:', error);
    return [];
  }
}

/**
 * Busca próximos jogos da API
 */
export async function getProximosJogos(): Promise<MatchResult[]> {
  try {
    const response = await fetch(`${API_URL}/jogos/proximos`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Mapear dados da API para o formato esperado
    return data.matches.map((item: any) => ({
      home: item.homeTeam,
      away: item.awayTeam,
      homeScore: item.homeScore || 0,
      awayScore: item.awayScore || 0,
      date: item.date,
      time: item.time,
      venue: item.venue,
      round: item.round,
      status: item.status as 'FT' | 'LIVE' | 'HT' | 'SCHED',
    }));
  } catch (error) {
    console.error('❌ Erro ao buscar próximos jogos da API:', error);
    return [];
  }
}

/**
 * Busca resultados recentes da API
 */
export async function getResultados(): Promise<MatchResult[]> {
  try {
    const response = await fetch(`${API_URL}/jogos/resultados`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    return data.matches.map((item: any) => ({
      home: item.homeTeam,
      away: item.awayTeam,
      homeScore: item.homeScore || 0,
      awayScore: item.awayScore || 0,
      date: item.date,
      time: item.time,
      venue: item.venue,
      round: item.round,
      status: item.status as 'FT' | 'LIVE' | 'HT' | 'SCHED',
    }));
  } catch (error) {
    console.error('❌ Erro ao buscar resultados da API:', error);
    return [];
  }
}

/**
 * Busca artilharia da API
 */
export async function getArtilharia() {
  try {
    const response = await fetch(`${API_URL}/artilharia`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    return data.scorers.map((item: any) => ({
      name: item.playerName,
      team: item.team,
      goals: item.goals,
      assists: item.assists,
    }));
  } catch (error) {
    console.error('❌ Erro ao buscar artilharia da API:', error);
    return [];
  }
}

/**
 * Busca transmissões da API (incluindo Prime Video e CazéTV)
 */
export async function getTransmissoes() {
  try {
    const response = await fetch(`${API_URL}/transmissoes/streaming`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Erro ao buscar transmissões da API:', error);
    return { primeVideo: [], cazeTV: [], total: 0 };
  }
}

/**
 * Busca todos os times da API
 */
export async function getTimes() {
  try {
    const response = await fetch(`${API_URL}/times`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.teams;
  } catch (error) {
    console.error('❌ Erro ao buscar times da API:', error);
    return [];
  }
}

/**
 * Verifica se a API está disponível
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL.replace('/api', '')}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    return response.ok;
  } catch (error) {
    console.error('❌ API não disponível:', error);
    return false;
  }
}
