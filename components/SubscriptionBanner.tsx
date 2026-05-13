import React, { useEffect, useState } from 'react';
import { Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { storageGet } from '../services/platformStorage';

interface LocalAuthSession {
  mode: 'admin' | 'access_code';
  expiresAt: string;
  isAdmin: boolean;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  expired: boolean;
}

function getTimeLeft(expiresAt: string): TimeLeft {
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  const diff = exp - now;

  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, expired: true };

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return { days, hours, minutes, expired: false };
}

async function readLocalSession(): Promise<LocalAuthSession | null> {
  try {
    const raw = await storageGet('redx-local-auth-session-v1');
    if (!raw) return null;
    return JSON.parse(raw) as LocalAuthSession;
  } catch {
    return null;
  }
}

const SubscriptionBanner: React.FC = () => {
  const { isAdmin } = useAuth();
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    void readLocalSession().then((session) => {
      if (cancelled) return;
      // Só mostrar para sessões de código de acesso (não admin, não Supabase auth)
      if (!session || session.mode !== 'access_code' || session.isAdmin || isAdmin) {
        setVisible(false);
        return;
      }

      const update = () => {
        const t = getTimeLeft(session.expiresAt);
        setTimeLeft(t);
        // Só exibe quando expirado ou faltarem menos de 4 dias
        setVisible(t.expired || t.days < 4);
      };

      update();
      interval = setInterval(update, 60_000); // atualiza a cada minuto
    });

    return () => {
      cancelled = true;
      if (interval !== null) clearInterval(interval);
    };
  }, [isAdmin]);

  if (!visible || !timeLeft) return null;

  // Determinar cor e ícone baseado no tempo restante
  const isExpired = timeLeft.expired;
  const isCritical = !isExpired && timeLeft.days < 3;
  const isWarning = !isExpired && timeLeft.days >= 3 && timeLeft.days < 7;

  const getLabel = () => {
    if (isExpired) return 'Acesso expirado';
    if (timeLeft.days >= 1)
      return `Acesso por mais ${timeLeft.days} dia${timeLeft.days > 1 ? 's' : ''}`;
    if (timeLeft.hours >= 1) return `Expira em ${timeLeft.hours}h ${timeLeft.minutes}min`;
    return `Expira em ${timeLeft.minutes} minuto${timeLeft.minutes !== 1 ? 's' : ''}`;
  };

  const Icon = isExpired ? XCircle : isCritical ? AlertTriangle : isWarning ? Clock : CheckCircle;

  const colorClass = isExpired
    ? 'bg-red-950/80 border-red-500/40 text-red-300'
    : isCritical
      ? 'bg-red-950/60 border-red-400/30 text-red-300 animate-pulse'
      : isWarning
        ? 'bg-yellow-950/70 border-yellow-500/30 text-yellow-300'
        : 'bg-black/50 border-white/10 text-white/70';

  const iconColor = isExpired
    ? 'text-red-400'
    : isCritical
      ? 'text-red-400'
      : isWarning
        ? 'text-yellow-400'
        : 'text-green-400';

  return (
    <div
      className={`
        fixed top-3 right-3 z-[300]
        flex items-center gap-2 px-3 py-2
        rounded-full border text-xs font-semibold
        backdrop-blur-xl shadow-lg
        transition-all duration-300
        ${colorClass}
      `}
    >
      <Icon size={13} className={iconColor} />
      <span>{getLabel()}</span>
    </div>
  );
};

export default SubscriptionBanner;
