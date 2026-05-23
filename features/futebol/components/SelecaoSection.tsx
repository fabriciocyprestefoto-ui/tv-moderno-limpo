/**
 * SelecaoSection — bloco da Seleção Brasileira para FutebolPage.
 *
 * Gradiente descoado verde-amarelo-azul + efeito visionOS glassmorphism.
 * Dados estáticos (Copa do Mundo 2026) + countdown dinâmico.
 */

import React, { memo, useEffect, useState } from 'react';
import '@/features/futebol/selecaoVisionOS.css';

// ── Próximos jogos estáticos (Eliminatórias / Copa 2026) ──────────────────
const PROXIMOS_JOGOS = [
  {
    id: 1,
    homeFlag: '🇧🇷',
    homeName: 'Brasil',
    awayFlag: '🇧🇴',
    awayName: 'Bolívia',
    data: '12 Jun 2025',
    horario: '22h00',
    local: 'Belém, PA',
    status: 'live' as const,
  },
  {
    id: 2,
    homeFlag: '🇨🇱',
    homeName: 'Chile',
    awayFlag: '🇧🇷',
    awayName: 'Brasil',
    data: '19 Jun 2025',
    horario: '21h30',
    local: 'Santiago, CHI',
    status: 'scheduled' as const,
  },
  {
    id: 3,
    homeFlag: '🇧🇷',
    homeName: 'Brasil',
    awayFlag: '🇺🇾',
    awayName: 'Uruguai',
    data: '08 Jul 2025',
    horario: '21h45',
    local: 'Brasília, DF',
    status: 'scheduled' as const,
  },
];

const CONVOCADOS = [
  { nome: 'Alisson',    posicao: 'Goleiro',    emoji: '🧤' },
  { nome: 'Marquinhos', posicao: 'Zagueiro',   emoji: '🛡️' },
  { nome: 'Raphinha',   posicao: 'Atacante',   emoji: '⚡' },
  { nome: 'Rodrygo',    posicao: 'Atacante',   emoji: '⚽' },
  { nome: 'Vini Jr.',   posicao: 'Ponta Esq.', emoji: '🌟' },
  { nome: 'Gerson',     posicao: 'Meia',       emoji: '🎯' },
];

// ── Countdown hook ────────────────────────────────────────────────────────
const COPA_START = new Date('2026-06-11T16:00:00Z');

function useCopa2026Countdown() {
  const [time, setTime] = useState({ dias: 0, horas: 0, minutos: 0, iniciada: false });

  useEffect(() => {
    function calc() {
      const diff = COPA_START.getTime() - Date.now();
      if (diff <= 0) {
        setTime({ dias: 0, horas: 0, minutos: 0, iniciada: true });
        return;
      }
      setTime({
        dias: Math.floor(diff / 86_400_000),
        horas: Math.floor((diff % 86_400_000) / 3_600_000),
        minutos: Math.floor((diff % 3_600_000) / 60_000),
        iniciada: false,
      });
    }
    calc();
    const id = setInterval(calc, 30_000);
    return () => clearInterval(id);
  }, []);

  return time;
}

// ── Sub-componentes ───────────────────────────────────────────────────────

const CountdownDigit: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <div className="selecao-cd-digit">
    <span className="selecao-cd-num">{String(value).padStart(2, '0')}</span>
    <span className="selecao-cd-lbl">{label}</span>
  </div>
);

const StatusChip: React.FC<{ status: 'live' | 'scheduled' }> = ({ status }) => {
  if (status === 'live') {
    return (
      <span className="selecao-chip-live">
        <span className="selecao-live-dot" aria-hidden="true" />
        Ao vivo
      </span>
    );
  }
  return <span className="selecao-chip-sched">Agendado</span>;
};

// ── Componente principal ──────────────────────────────────────────────────

const SelecaoSection: React.FC = memo(() => {
  const cd = useCopa2026Countdown();

  return (
    <section className="selecao-root" aria-label="Seleção Brasileira">
      {/* ── Gradiente descoado de fundo ── */}
      <div className="selecao-ambient" aria-hidden="true" />
      <div className="selecao-ambient-overlay" aria-hidden="true" />

      {/* ── Hero card principal ── */}
      <div className="selecao-hero-card selecao-glass-panel">
        {/* Stripe bandeira no topo */}
        <div className="selecao-flag-stripe" aria-hidden="true" />

        {/* Header */}
        <div className="selecao-hero-header">
          <div className="selecao-trophy-badge" aria-hidden="true">🏆</div>
          <div className="selecao-hero-info">
            <div className="selecao-chips-row">
              <span className="selecao-chip-verde">🇧🇷 Seleção Brasileira</span>
              <span className="selecao-chip-amarelo">Copa 2026</span>
              <span className="selecao-chip-azul">Eliminatórias</span>
            </div>
            <h2 className="selecao-hero-title">Brasil</h2>
            <p className="selecao-hero-sub">5× Campeão Mundial · Pentacampeão</p>
          </div>
        </div>

        {/* Stats */}
        <div className="selecao-stats-row selecao-glass-dark">
          <div className="selecao-stat">
            <span className="selecao-stat-num">5</span>
            <span className="selecao-stat-lbl">Copas</span>
          </div>
          <div className="selecao-stat-divider" aria-hidden="true" />
          <div className="selecao-stat">
            <span className="selecao-stat-num">237</span>
            <span className="selecao-stat-lbl">Vitórias</span>
          </div>
          <div className="selecao-stat-divider" aria-hidden="true" />
          <div className="selecao-stat">
            <span className="selecao-stat-num">1.458</span>
            <span className="selecao-stat-lbl">Gols</span>
          </div>
          <div className="selecao-stat-divider" aria-hidden="true" />
          <div className="selecao-stat">
            <span className="selecao-stat-num">6°</span>
            <span className="selecao-stat-lbl">FIFA</span>
          </div>
        </div>

        {/* Countdown Copa 2026 */}
        <div className="selecao-copa-row selecao-glass-dark">
          <div className="selecao-copa-info">
            <p className="selecao-copa-eyebrow">Copa do Mundo FIFA 2026</p>
            <p className="selecao-copa-paises">EUA · México · Canadá</p>
            <p className="selecao-copa-datas">11 Jun – 19 Jul 2026</p>
          </div>
          {!cd.iniciada ? (
            <div className="selecao-countdown">
              <CountdownDigit value={cd.dias} label="dias" />
              <span className="selecao-cd-sep" aria-hidden="true">:</span>
              <CountdownDigit value={cd.horas} label="hrs" />
              <span className="selecao-cd-sep" aria-hidden="true">:</span>
              <CountdownDigit value={cd.minutos} label="min" />
            </div>
          ) : (
            <span className="selecao-chip-live">
              <span className="selecao-live-dot" />
              Em andamento
            </span>
          )}
        </div>

        {/* Próximos jogos */}
        <div className="selecao-jogos-section">
          <p className="selecao-eyebrow">Próximos Jogos — Eliminatórias</p>
          <div className="selecao-jogos-list">
            {PROXIMOS_JOGOS.map((j) => (
              <div
                key={j.id}
                className="selecao-jogo-row"
                tabIndex={0}
                data-nav-item
                role="button"
                aria-label={`${j.homeName} vs ${j.awayName} — ${j.data}`}
              >
                <span className="selecao-flag-pill">{j.homeFlag}</span>
                <div className="selecao-jogo-info">
                  <span className="selecao-jogo-teams">
                    {j.homeName}
                    <span className="selecao-vs">VS</span>
                    {j.awayName}
                  </span>
                  <span className="selecao-jogo-meta">
                    {j.data} · {j.horario} · {j.local}
                  </span>
                </div>
                <span className="selecao-flag-pill">{j.awayFlag}</span>
                <StatusChip status={j.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Convocados cards ── */}
      <div className="selecao-convocados-grid">
        {CONVOCADOS.map((p, i) => (
          <div key={p.nome} className="selecao-player-card selecao-glass-card">
            <span className="selecao-player-emoji" aria-hidden="true">{p.emoji}</span>
            <span className="selecao-player-nome">{p.nome}</span>
            <span className="selecao-player-pos">{p.posicao}</span>
            {/* stripe decorativa com cor rotacionada */}
            <div
              className="selecao-player-stripe"
              style={{
                background: [
                  'linear-gradient(90deg,#009C3B,#FFDF00)',
                  'linear-gradient(90deg,#FFDF00,#002776)',
                  'linear-gradient(90deg,#002776,#009C3B)',
                ][i % 3],
              }}
              aria-hidden="true"
            />
          </div>
        ))}
      </div>
    </section>
  );
});

SelecaoSection.displayName = 'SelecaoSection';
export default SelecaoSection;
