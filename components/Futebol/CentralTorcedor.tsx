import React, { memo } from 'react';
import { motion } from 'framer-motion';

interface TeamBadge {
  teamId: string;
  team: string;
  badge: string;
}

interface CentralTorcedorProps {
  times: TeamBadge[];
  onTeamClick?: (teamId: string) => void;
}

const CentralTorcedor: React.FC<CentralTorcedorProps> = memo(({ times, onTeamClick }) => {
  if (!times || times.length === 0) return null;

  // Dividir times em rows de ~10
  const row1 = times.slice(0, 10);
  const row2 = times.slice(10, 20);

  const renderRow = (items: TeamBadge[], rowIndex: number) => (
    <div
      className="flex gap-3 overflow-x-auto pb-2 px-1 scrollbar-hide"
      data-nav-row={rowIndex + 1}
    >
      {items.map((t, idx) => (
        <motion.button
          key={t.teamId}
          tabIndex={0}
          data-nav-item
          data-nav-col={idx}
          onClick={() => onTeamClick?.(t.teamId)}
          whileHover={{ scale: 1.1 }}
          whileFocus={{ scale: 1.1 }}
          className="flex-shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center outline-none focus:ring-2 focus:ring-white/50 transition-all"
          style={{
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
          title={t.team}
        >
          <img
            src={t.badge}
            alt={t.team}
            className="w-9 h-9 md:w-10 md:h-10 object-contain"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '';
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </motion.button>
      ))}
    </div>
  );

  return (
    <section className="px-6 md:px-12 max-w-7xl mx-auto mt-6">
      <h2 className="text-lg md:text-xl font-black uppercase tracking-tight mb-4 text-white/80">
        Central do Torcedor
      </h2>
      <div
        className="rounded-2xl p-4 space-y-3"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {renderRow(row1, 0)}
        {row2.length > 0 && renderRow(row2, 1)}
      </div>
    </section>
  );
});

CentralTorcedor.displayName = 'CentralTorcedor';
export default CentralTorcedor;
