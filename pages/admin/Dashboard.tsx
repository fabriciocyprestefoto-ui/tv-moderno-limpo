/**
 * Dashboard — admin panel overview
 * Tab-based layout: each section has its own panel, no outer scrollbar.
 * visionOS aesthetic with the Login page purple palette.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, DollarSign, Film, LayoutDashboard, RefreshCw, Tv, Users } from 'lucide-react';
import {
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import AdminLayout from '@/layouts/AdminLayout';
import {
  getDashboardStats,
  getLiveAudienceStats,
  getMonthlyRevenue,
  getRecentTransactions,
  getTopWatchedContent,
  type DashboardStats,
  type LiveAudienceStats,
  type TopWatchedItem,
  type TopWatchedSummary,
} from '@/services/adminService';
import { logger } from '@/utils/logger';

/* ─── helpers ────────────────────────────────────────────── */
const fmt = new Intl.NumberFormat('pt-BR');
const fmtCur = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtClock = (v?: string | null) => {
  if (!v) return '--:--';
  const d = new Date(v);
  return isNaN(d.getTime())
    ? '--:--'
    : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
const fmtDate = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

/* ─── AnimatedNumber ─────────────────────────────────────── */
const AnimatedNumber: React.FC<{
  value: number;
  formatter?: (v: number) => string;
  className?: string;
}> = ({ value, formatter = (v) => fmt.format(Math.round(v)), className }) => {
  const [display, setDisplay] = useState(value);
  const cur = useRef(value);
  useEffect(() => {
    const from = cur.current;
    const to = value;
    const dur = 700;
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 4);
      const next = from + (to - from) * e;
      setDisplay(next);
      cur.current = next;
      if (p < 1) raf = requestAnimationFrame(tick);
      else setDisplay(to);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{formatter(display)}</span>;
};

/* ─── accent palette ─────────────────────────────────────── */
const A = {
  violet: '#7c3aed',
  cyan: '#22d3ee',
  green: '#34d399',
  pink: '#f472b6',
  amber: '#fbbf24',
} as const;

/* ─── glass card shell ───────────────────────────────────── */
const Glass: React.FC<{
  children: React.ReactNode;
  className?: string;
  accent?: string;
  style?: React.CSSProperties;
}> = ({ children, className = '', accent, style }) => (
  <div
    className={`relative overflow-hidden rounded-2xl border ${className}`}
    style={{
      borderColor: accent ? `${accent}28` : 'rgba(124,58,237,0.16)',
      background: 'linear-gradient(160deg,rgba(255,255,255,0.055) 0%,rgba(255,255,255,0.018) 100%)',
      backdropFilter: 'blur(20px) saturate(160%)',
      WebkitBackdropFilter: 'blur(20px) saturate(160%)',
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.07), 0 12px 28px rgba(0,0,0,0.22)${accent ? `, 0 0 0 1px ${accent}10` : ''}`,
      ...style,
    }}
  >
    {accent && (
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg,transparent,${accent}55,transparent)` }}
      />
    )}
    {children}
  </div>
);

/* ─── KPI mini-card ──────────────────────────────────────── */
const KpiCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent: string;
  live?: boolean;
}> = ({ label, value, sub, icon: Icon, accent, live }) => (
  <Glass accent={accent} className="p-4 flex flex-col gap-3">
    <div className="flex items-center justify-between">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{label}</p>
      <div
        className="relative flex h-9 w-9 items-center justify-center rounded-xl"
        style={{ background: `${accent}1a`, border: `1px solid ${accent}30` }}
      >
        {live && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
        )}
        <Icon size={16} color={accent} />
      </div>
    </div>
    <p className="text-xl font-black tracking-tight text-white leading-none">{value}</p>
    {sub && <p className="text-[10px] text-white/35 truncate">{sub}</p>}
  </Glass>
);

/* ─── Donut ──────────────────────────────────────────────── */
const DONUT_PALETTE = [A.violet, A.cyan, A.pink, A.green, A.amber];
const Donut: React.FC<{
  items: { label: string; value: number; color?: string }[];
  size?: number;
}> = ({ items, size = 96 }) => {
  const data = items.map((it, i) => ({
    ...it,
    color: it.color ?? DONUT_PALETTE[i % DONUT_PALETTE.length],
  }));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <div style={{ width: size, height: size, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={size * 0.32}
              outerRadius={size * 0.46}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'rgba(14,5,28,0.95)',
                border: '1px solid rgba(124,58,237,0.22)',
                borderRadius: 10,
                color: '#fff',
                fontSize: 11,
              }}
              formatter={(v: number | undefined) => [
                `${fmt.format(v ?? 0)} (${total > 0 ? Math.round(((v ?? 0) / total) * 100) : 0}%)`,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        {data.map((d) => (
          <div key={d.label} className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="truncate text-white/55">{d.label}</span>
            </div>
            <span className="font-bold text-white/80 tabular-nums shrink-0">
              {total > 0 ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── Ranking row ────────────────────────────────────────── */
const RankRow: React.FC<{
  item: TopWatchedItem;
  peak: number;
  accent: string;
  rank: number;
}> = ({ item, peak, accent, rank }) => {
  const artwork = item.poster ?? item.backdrop;
  const barW = `${Math.max(10, (item.uniqueViewers / peak) * 100)}%`;
  return (
    <div
      className="flex items-center gap-3 py-2.5 border-b last:border-0"
      style={{ borderColor: 'rgba(124,58,237,0.10)' }}
    >
      {/* poster/rank */}
      <div
        className="relative h-10 w-8 shrink-0 overflow-hidden rounded-lg border"
        style={{ borderColor: 'rgba(124,58,237,0.15)' }}
      >
        {artwork ? (
          <img
            src={artwork}
            alt={item.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-[10px] font-black"
            style={{ background: `${accent}20`, color: accent }}
          >
            {rank}
          </div>
        )}
      </div>
      {/* title + bar */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white">{item.title}</p>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full"
            style={{
              width: barW,
              background: `linear-gradient(90deg,${accent},rgba(255,255,255,0.4))`,
            }}
          />
        </div>
      </div>
      {/* viewers */}
      <div className="text-right shrink-0">
        <p className="text-xs font-bold text-white tabular-nums">
          {fmt.format(item.uniqueViewers)}
        </p>
        <p className="text-[10px] text-white/30">{fmtDate(item.lastWatched)}</p>
      </div>
    </div>
  );
};

/* ─── Tabs definition ────────────────────────────────────── */
type Tab = 'overview' | 'subscribers' | 'content' | 'revenue' | 'live';
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'subscribers', label: 'Assinantes', icon: Users },
  { id: 'content', label: 'Catálogo', icon: Film },
  { id: 'revenue', label: 'Receita', icon: DollarSign },
  { id: 'live', label: 'Ao Vivo', icon: Activity },
];

/* ─── Main component ─────────────────────────────────────── */
const Dashboard: React.FC = () => {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [live, setLive] = useState<LiveAudienceStats | null>(null);
  const [top, setTop] = useState<TopWatchedSummary | null>(null);
  const [revenue, setRevenue] = useState<{ month: string; receita: number; novos: number }[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [barHover, setBarHover] = useState<number | null>(null);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    try {
      const [sRes, lRes, tRes, rRes, txRes] = await Promise.allSettled([
        getDashboardStats(),
        getLiveAudienceStats(),
        getTopWatchedContent(5, 30),
        getMonthlyRevenue(),
        getRecentTransactions(5),
      ]);
      if (sRes.status === 'fulfilled') setStats(sRes.value);
      if (lRes.status === 'fulfilled') setLive(lRes.value);
      if (tRes.status === 'fulfilled') setTop(tRes.value);
      if (rRes.status === 'fulfilled') setRevenue(rRes.value);
      if (txRes.status === 'fulfilled') setTransactions(txRes.value);
      setLastSync(new Date().toISOString());
    } catch (e) {
      logger.error('Dashboard:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const liveT = setInterval(async () => {
      try {
        const s = await getLiveAudienceStats();
        setLive(s);
      } catch {
        /* silent */
      }
    }, 20_000);
    const dashT = setInterval(() => load(), 120_000);
    return () => {
      clearInterval(liveT);
      clearInterval(dashT);
    };
  }, [load]);

  const health = useMemo(
    () =>
      stats?.totalSubscribers && stats.activeSubscribers
        ? Math.round((stats.activeSubscribers / stats.totalSubscribers) * 100)
        : 0,
    [stats]
  );

  const share = useMemo(
    () =>
      stats?.totalSubscribers && live?.onlineUsers
        ? Math.round((live.onlineUsers / stats.totalSubscribers) * 100)
        : 0,
    [stats, live]
  );

  const totalCatalog =
    (stats?.totalMovies ?? 0) + (stats?.totalSeries ?? 0) + (stats?.totalChannels ?? 0);

  const kpis = useMemo(
    () => [
      {
        label: 'Total Assinantes',
        icon: Users,
        accent: A.violet,
        value: fmt.format(stats?.totalSubscribers ?? 0),
        sub: `${fmt.format(stats?.activeSubscribers ?? 0)} ativos · ${health}% OK`,
      },
      {
        label: 'Online Agora',
        icon: Activity,
        accent: A.cyan,
        live: true,
        value: fmt.format(live?.onlineUsers ?? 0),
        sub: `${share}% da base · ${fmtClock(lastSync)}`,
      },
      {
        label: 'Receita',
        icon: DollarSign,
        accent: A.green,
        value: fmtCur(stats?.totalRevenue ?? 0),
        sub: `Atualizado ${fmtClock(lastSync)}`,
      },
      {
        label: 'Catálogo',
        icon: Film,
        accent: A.pink,
        value: fmt.format(totalCatalog),
        sub: `${fmt.format(stats?.totalMovies ?? 0)} filmes · ${fmt.format(stats?.totalSeries ?? 0)} séries`,
      },
    ],
    [stats, live, health, share, lastSync, totalCatalog]
  );

  const contentItems = useMemo(
    () => [
      { label: 'Filmes', value: stats?.totalMovies ?? 0, color: A.violet },
      { label: 'Séries', value: stats?.totalSeries ?? 0, color: A.cyan },
      { label: 'Canais', value: stats?.totalChannels ?? 0, color: A.pink },
    ],
    [stats]
  );

  const healthItems = useMemo(
    () => [
      { label: 'Ativos', value: stats?.activeSubscribers ?? 0, color: A.green },
      {
        label: 'Inativos',
        value: Math.max(0, (stats?.totalSubscribers ?? 0) - (stats?.activeSubscribers ?? 0)),
        color: '#4b5563',
      },
    ],
    [stats]
  );

  const tpMovies = top?.movies ?? [];
  const tpSeries = top?.series ?? [];
  const peakM = Math.max(...tpMovies.map((i) => i.uniqueViewers), 1);
  const peakS = Math.max(...tpSeries.map((i) => i.uniqueViewers), 1);

  const revBarData = revenue.map((r) => ({ label: r.month, v: r.receita, n: r.novos }));

  /* ── skeleton */
  if (loading && !stats) {
    return (
      <AdminLayout>
        <div className="flex h-full flex-col gap-4 animate-pulse">
          <div className="h-10 w-72 rounded-xl bg-white/[0.05]" />
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-white/[0.04]" />
            ))}
          </div>
          <div className="flex-1 rounded-2xl bg-white/[0.03]" />
        </div>
      </AdminLayout>
    );
  }

  /* ── Tooltip style shared */
  const ttStyle = {
    background: 'rgba(11,5,20,0.96)',
    border: '1px solid rgba(124,58,237,0.22)',
    borderRadius: 12,
    color: '#fff',
    fontSize: 11,
  };

  return (
    <AdminLayout>
      {/* This div must fill the content area with no overflow */}
      <div
        className="flex h-full flex-col gap-0 overflow-hidden"
        style={{ padding: '20px 26px 16px' }}
      >
        {/* ── Header row ── */}
        <div className="flex items-center justify-between gap-4 pb-4 shrink-0">
          <div>
            <h2 className="text-xl font-black tracking-tight text-white leading-none">Dashboard</h2>
            <p className="mt-0.5 text-[11px] text-white/35">
              Live sync a cada 20s · {fmtClock(lastSync)}
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold text-white/80 transition hover:text-white disabled:opacity-50"
            style={{ borderColor: 'rgba(124,58,237,0.22)', background: 'rgba(124,58,237,0.08)' }}
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>

        {/* ── KPI row ── */}
        <div className="grid grid-cols-4 gap-3 shrink-0 pb-4">
          {kpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>

        {/* ── Tab bar ── */}
        <div className="flex items-center gap-1 pb-3 shrink-0">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                style={{
                  color: active ? '#fff' : 'rgba(255,255,255,0.42)',
                  background: active ? 'rgba(124,58,237,0.22)' : 'transparent',
                  border: `1px solid ${active ? 'rgba(124,58,237,0.38)' : 'transparent'}`,
                  boxShadow: active ? 'inset 0 1px 0 rgba(167,117,255,0.14)' : 'none',
                }}
              >
                <t.icon size={13} color={active ? A.violet : undefined} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Tab content (fills remaining height, no scroll) ── */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div className="grid h-full grid-cols-[1fr_320px] gap-3">
              {/* left: bar chart */}
              <Glass accent={A.violet} className="flex flex-col p-5">
                <div className="mb-3 flex items-center justify-between shrink-0">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                      Novos assinantes
                    </p>
                    <AnimatedNumber
                      value={stats?.totalSubscribers ?? 0}
                      className="block text-2xl font-black text-white"
                    />
                  </div>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-bold text-emerald-300"
                    style={{
                      background: 'rgba(52,211,153,0.12)',
                      border: '1px solid rgba(52,211,153,0.20)',
                    }}
                  >
                    {health}% saudáveis
                  </span>
                </div>
                <div className="min-h-0 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revBarData} barSize={12} onMouseLeave={() => setBarHover(null)}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(124,58,237,0.10)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        stroke="rgba(255,255,255,0.28)"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="rgba(255,255,255,0.28)"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => fmt.format(v)}
                      />
                      <Tooltip
                        contentStyle={ttStyle}
                        formatter={(v: number | undefined) => [fmt.format(v ?? 0), 'Novos']}
                      />
                      <Bar
                        dataKey="n"
                        radius={[5, 5, 0, 0]}
                        onMouseEnter={(_: unknown, i: number) => setBarHover(i)}
                      >
                        {revBarData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={i === barHover ? A.violet : 'rgba(124,58,237,0.45)'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Glass>

              {/* right column */}
              <div className="flex flex-col gap-3 h-full min-h-0">
                {/* content donut */}
                <Glass accent={A.pink} className="p-4">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                    Catálogo
                  </p>
                  <Donut items={contentItems} size={88} />
                </Glass>
                {/* health donut */}
                <Glass accent={A.green} className="p-4">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                    Saúde
                  </p>
                  <Donut items={healthItems} size={88} />
                </Glass>
                {/* top titles */}
                <Glass accent={A.cyan} className="p-4 min-h-0 flex-1 overflow-hidden">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                    Destaques
                  </p>
                  <div className="space-y-1.5">
                    {[
                      { icon: Film, label: top?.movies[0]?.title ?? '—', accent: A.pink },
                      { icon: Tv, label: top?.series[0]?.title ?? '—', accent: A.cyan },
                    ].map(({ icon: Icon, label, accent }) => (
                      <div
                        key={label}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-white"
                        style={{ background: `${accent}12`, border: `1px solid ${accent}20` }}
                      >
                        <Icon size={12} color={accent} />
                        <span className="truncate">{label}</span>
                      </div>
                    ))}
                  </div>
                </Glass>
              </div>
            </div>
          )}

          {/* ── SUBSCRIBERS ── */}
          {tab === 'subscribers' && (
            <div className="grid h-full grid-cols-[1fr_260px] gap-3">
              {/* stat cards column */}
              <div className="flex flex-col gap-3 h-full min-h-0">
                <div className="grid grid-cols-3 gap-3 shrink-0">
                  {[
                    {
                      label: 'Total',
                      value: fmt.format(stats?.totalSubscribers ?? 0),
                      accent: A.violet,
                    },
                    {
                      label: 'Ativos',
                      value: fmt.format(stats?.activeSubscribers ?? 0),
                      accent: A.green,
                    },
                    { label: 'Online', value: fmt.format(live?.onlineUsers ?? 0), accent: A.cyan },
                  ].map((s) => (
                    <Glass key={s.label} accent={s.accent} className="p-4 text-center">
                      <p className="text-[10px] uppercase tracking-widest text-white/35">
                        {s.label}
                      </p>
                      <p className="mt-1 text-2xl font-black text-white">{s.value}</p>
                    </Glass>
                  ))}
                </div>

                {/* subscribers bar chart */}
                <Glass accent={A.violet} className="flex-1 min-h-0 p-5 flex flex-col">
                  <p className="mb-3 shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                    Crescimento mensal
                  </p>
                  <div className="min-h-0 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={revBarData}
                        barSize={10}
                        onMouseLeave={() => setBarHover(null)}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(124,58,237,0.10)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          stroke="rgba(255,255,255,0.28)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="rgba(255,255,255,0.28)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={ttStyle}
                          formatter={(v: number | undefined) => [fmt.format(v ?? 0), 'Novos']}
                        />
                        <Bar
                          dataKey="n"
                          radius={[4, 4, 0, 0]}
                          onMouseEnter={(_: unknown, i: number) => setBarHover(i)}
                        >
                          {revBarData.map((_, i) => (
                            <Cell
                              key={i}
                              fill={i === barHover ? A.violet : 'rgba(124,58,237,0.42)'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Glass>
              </div>

              {/* right: donut + radar */}
              <div className="flex flex-col gap-3 h-full">
                <Glass accent={A.green} className="p-4">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                    Saúde
                  </p>
                  <Donut items={healthItems} size={96} />
                </Glass>
                <Glass accent={A.cyan} className="p-4 flex-1">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                    Live Stats
                  </p>
                  <div className="space-y-3">
                    {[
                      { label: 'Online', value: fmt.format(live?.onlineUsers ?? 0), color: A.cyan },
                      {
                        label: 'Dispositivos',
                        value: fmt.format(live?.activeDevices ?? 0),
                        color: A.violet,
                      },
                      {
                        label: 'Janela (min)',
                        value: String(live?.windowMinutes ?? 5),
                        color: A.green,
                      },
                      { label: 'Heartbeat', value: fmtClock(live?.lastHeartbeat), color: A.pink },
                      { label: 'Índice saúde', value: `${health}%`, color: A.amber },
                    ].map((item) => (
                      <div key={item.label} className="flex justify-between text-xs">
                        <span className="text-white/40">{item.label}</span>
                        <span className="font-bold tabular-nums" style={{ color: item.color }}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </Glass>
              </div>
            </div>
          )}

          {/* ── CONTENT ── */}
          {tab === 'content' && (
            <div className="grid h-full grid-cols-2 gap-3">
              {/* left: distribution */}
              <div className="flex flex-col gap-3 h-full">
                <div className="grid grid-cols-3 gap-3 shrink-0">
                  {[
                    {
                      label: 'Filmes',
                      value: fmt.format(stats?.totalMovies ?? 0),
                      accent: A.violet,
                    },
                    { label: 'Séries', value: fmt.format(stats?.totalSeries ?? 0), accent: A.cyan },
                    {
                      label: 'Canais',
                      value: fmt.format(stats?.totalChannels ?? 0),
                      accent: A.pink,
                    },
                  ].map((s) => (
                    <Glass key={s.label} accent={s.accent} className="p-4 text-center">
                      <p className="text-[10px] uppercase tracking-widest text-white/35">
                        {s.label}
                      </p>
                      <p className="mt-1 text-xl font-black text-white">{s.value}</p>
                    </Glass>
                  ))}
                </div>
                <Glass accent={A.violet} className="flex-1 min-h-0 p-5 flex flex-col">
                  <p className="mb-3 shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                    Distribuição do catálogo
                  </p>
                  <div className="flex-1 flex items-center justify-center">
                    <Donut items={contentItems} size={140} />
                  </div>
                </Glass>
              </div>

              {/* right: top movies + top series */}
              <div className="grid grid-rows-2 gap-3 h-full">
                <Glass accent={A.pink} className="p-4 flex flex-col min-h-0">
                  <div className="flex items-center gap-2 mb-2 shrink-0">
                    <Film size={13} color={A.pink} />
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                      Top Filmes
                    </p>
                  </div>
                  <div className="min-h-0 overflow-hidden flex-1">
                    {tpMovies.length === 0 ? (
                      <p className="text-xs text-white/25 mt-4 text-center">Sem dados</p>
                    ) : (
                      tpMovies
                        .slice(0, 4)
                        .map((m, i) => (
                          <RankRow
                            key={m.mediaId}
                            item={m}
                            peak={peakM}
                            accent={A.pink}
                            rank={i + 1}
                          />
                        ))
                    )}
                  </div>
                </Glass>
                <Glass accent={A.cyan} className="p-4 flex flex-col min-h-0">
                  <div className="flex items-center gap-2 mb-2 shrink-0">
                    <Tv size={13} color={A.cyan} />
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                      Top Séries
                    </p>
                  </div>
                  <div className="min-h-0 overflow-hidden flex-1">
                    {tpSeries.length === 0 ? (
                      <p className="text-xs text-white/25 mt-4 text-center">Sem dados</p>
                    ) : (
                      tpSeries
                        .slice(0, 4)
                        .map((s, i) => (
                          <RankRow
                            key={s.mediaId}
                            item={s}
                            peak={peakS}
                            accent={A.cyan}
                            rank={i + 1}
                          />
                        ))
                    )}
                  </div>
                </Glass>
              </div>
            </div>
          )}

          {/* ── REVENUE ── */}
          {tab === 'revenue' && (
            <div className="grid h-full grid-cols-[1fr_280px] gap-3">
              {/* chart */}
              <Glass accent={A.green} className="p-5 flex flex-col">
                <div className="mb-3 shrink-0 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                      Receita acumulada
                    </p>
                    <AnimatedNumber
                      value={stats?.totalRevenue ?? 0}
                      formatter={fmtCur}
                      className="block text-2xl font-black text-white"
                    />
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revBarData} barSize={12} onMouseLeave={() => setBarHover(null)}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(52,211,153,0.10)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        stroke="rgba(255,255,255,0.28)"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="rgba(255,255,255,0.28)"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `R$${Math.round(v / 1000)}k`}
                      />
                      <Tooltip
                        contentStyle={ttStyle}
                        formatter={(v: number | undefined) => [fmtCur(v ?? 0), 'Receita']}
                      />
                      <Bar
                        dataKey="v"
                        radius={[5, 5, 0, 0]}
                        onMouseEnter={(_: unknown, i: number) => setBarHover(i)}
                      >
                        {revBarData.map((_, i) => (
                          <Cell key={i} fill={i === barHover ? A.green : 'rgba(52,211,153,0.40)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Glass>

              {/* transactions */}
              <Glass accent={A.amber} className="flex flex-col overflow-hidden">
                <div
                  className="flex items-center gap-2 border-b px-4 py-3 shrink-0"
                  style={{ borderColor: 'rgba(251,191,36,0.12)' }}
                >
                  <DollarSign size={13} color={A.amber} />
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                    Últimos pagamentos
                  </p>
                </div>
                <div
                  className="flex-1 overflow-hidden divide-y"
                  style={{ borderColor: 'rgba(251,191,36,0.08)' }}
                >
                  {transactions.length === 0 ? (
                    <p className="p-4 text-center text-xs text-white/25">Sem transações</p>
                  ) : (
                    transactions.map((tx: any) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white tabular-nums">
                            {fmtCur(parseFloat(tx.amount) || 0)}
                          </p>
                          <p className="text-[10px] text-white/30 uppercase">
                            {(tx.payment_method || 'N/A').toString()}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0 ${
                            tx.status === 'paid'
                              ? 'text-emerald-300'
                              : tx.status === 'pending'
                                ? 'text-amber-300'
                                : 'text-rose-300'
                          }`}
                          style={{
                            background:
                              tx.status === 'paid'
                                ? 'rgba(52,211,153,0.12)'
                                : tx.status === 'pending'
                                  ? 'rgba(251,191,36,0.12)'
                                  : 'rgba(244,63,94,0.12)',
                          }}
                        >
                          {tx.status === 'paid'
                            ? 'Pago'
                            : tx.status === 'pending'
                              ? 'Pendente'
                              : tx.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Glass>
            </div>
          )}

          {/* ── LIVE ── */}
          {tab === 'live' && (
            <div className="grid h-full grid-cols-[1fr_1fr_1fr] gap-3">
              {/* big live number */}
              <Glass accent={A.cyan} className="p-6 flex flex-col justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400 opacity-70" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </span>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                    Online Agora
                  </p>
                </div>
                <div>
                  <AnimatedNumber
                    value={live?.onlineUsers ?? 0}
                    className="block text-5xl font-black text-white"
                  />
                  <p className="mt-1 text-xs text-white/35">{share}% da base conectada</p>
                </div>
                <p className="text-[10px] text-white/25">
                  Heartbeat: {fmtClock(live?.lastHeartbeat)}
                </p>
              </Glass>

              {/* devices */}
              <Glass accent={A.violet} className="p-6 flex flex-col justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                  Dispositivos
                </p>
                <AnimatedNumber
                  value={live?.activeDevices ?? 0}
                  className="block text-5xl font-black text-white"
                />
                <p className="text-[10px] text-white/25">Janela: {live?.windowMinutes ?? 5} min</p>
              </Glass>

              {/* trend */}
              <Glass accent={A.green} className="p-5 flex flex-col">
                <p className="mb-3 shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                  Tendência ({live?.windowMinutes ?? 5}min buckets)
                </p>
                <div className="min-h-0 flex-1">
                  {(live?.trend ?? []).length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={live?.trend ?? []} barSize={10}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(52,211,153,0.10)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          stroke="rgba(255,255,255,0.28)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="rgba(255,255,255,0.28)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={ttStyle}
                          formatter={(v: number | undefined) => [fmt.format(v ?? 0), 'Online']}
                        />
                        <Bar dataKey="users" radius={[4, 4, 0, 0]} fill={A.green} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-white/25">
                      Sem dados de tendência
                    </div>
                  )}
                </div>
              </Glass>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default Dashboard;
