import React, { memo } from 'react';
import { BookOpen, Globe, Instagram, Star, Trophy, Twitter, Youtube } from 'lucide-react';
import type { FootballTeam } from '@/services/sportsApi';

interface HistoriaTimeProps {
  dadosLocais: FootballTeam | null;
  rowBase?: number;
}

const StatBox: React.FC<{ label: string; value: number; color: string }> = ({
  label,
  value,
  color,
}) => (
  <div
    className={`flex flex-col items-center justify-center rounded-2xl border p-4 min-w-[100px]`}
    style={{ borderColor: `${color}33`, background: `${color}11` }}
  >
    <span className="text-3xl font-black" style={{ color }}>
      {value}
    </span>
    <span className="text-[10px] uppercase tracking-[0.16em] text-white/60 font-bold mt-1 text-center leading-tight">
      {label}
    </span>
  </div>
);

const SocialLink: React.FC<{ url: string | null | undefined; label: string; icon: React.ReactNode }> = ({
  url,
  label,
  icon,
}) => {
  if (!url) return null;
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 bg-white/[0.05] hover:bg-white/[0.10] focus:bg-white/[0.10] transition-colors text-sm font-semibold outline-none focus:ring-2 focus:ring-white/40"
    >
      {icon}
      {label}
    </a>
  );
};

const HistoriaTime: React.FC<HistoriaTimeProps> = memo(({ dadosLocais, rowBase = 20 }) => {
  if (!dadosLocais) return null;

  const {
    historiaCompleta,
    honors,
    conquistasInternacionais,
    conquistasNacionais,
    apelidos,
    mascote,
    presidente,
    socioTorcedor,
    rivais,
    redesSociais,
  } = dadosLocais;

  const hasStats =
    (conquistasInternacionais != null && conquistasInternacionais > 0) ||
    (conquistasNacionais != null && conquistasNacionais > 0);

  const hasSocials =
    redesSociais &&
    Object.values(redesSociais).some(Boolean);

  const hasExtras = apelidos?.length || mascote || presidente || socioTorcedor || rivais?.length;

  if (!historiaCompleta && !hasStats && !honors?.length && !hasSocials && !hasExtras) {
    return null;
  }

  return (
    <section className="max-w-6xl mx-auto px-6 md:px-12 mt-10 space-y-8">
      {/* Conquistas */}
      {hasStats && (
        <div data-nav-row={rowBase}>
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={20} className="text-amber-300" />
            <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight">Conquistas</h2>
          </div>
          <div className="flex flex-wrap gap-4">
            {(conquistasInternacionais ?? 0) > 0 && (
              <StatBox
                label="Títulos Internacionais"
                value={conquistasInternacionais!}
                color="#f59e0b"
              />
            )}
            {(conquistasNacionais ?? 0) > 0 && (
              <StatBox
                label="Títulos Nacionais"
                value={conquistasNacionais!}
                color="#a855f7"
              />
            )}
            {honors && honors.length > 0 && (
              <div className="flex-1 min-w-[240px]">
                <div className="flex flex-wrap gap-2">
                  {honors.map((titulo, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-400/10 border border-amber-400/20 text-amber-300"
                    >
                      <Star size={10} className="inline mr-1 -mt-0.5" />
                      {titulo}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* História completa */}
      {historiaCompleta && (
        <div data-nav-row={rowBase + 1}>
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={20} className="text-white/70" />
            <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight">História</h2>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-white/80 leading-relaxed">{historiaCompleta}</p>
          </div>
        </div>
      )}

      {/* Informações extras */}
      {hasExtras ? (
        <div
          data-nav-row={rowBase + 2}
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6"
        >
          {mascote && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold mb-1">
                Mascote
              </p>
              <p className="text-sm font-bold">{mascote}</p>
            </div>
          )}
          {presidente && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold mb-1">
                Presidente
              </p>
              <p className="text-sm font-bold">{presidente}</p>
            </div>
          )}
          {socioTorcedor && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold mb-1">
                Sócio Torcedor
              </p>
              <p className="text-sm font-bold">{socioTorcedor}</p>
            </div>
          )}
          {apelidos && apelidos.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold mb-1">
                Apelidos
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {apelidos.map((a, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full border border-white/15 bg-white/[0.06] font-semibold"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
          {rivais && rivais.length > 0 && (
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold mb-1">
                Maiores Rivais
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {rivais.map((r, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full border border-red-400/25 bg-red-500/10 text-red-200 font-semibold"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Redes Sociais */}
      {hasSocials && (
        <div data-nav-row={rowBase + 3}>
          <div className="flex items-center gap-2 mb-3">
            <Globe size={18} className="text-white/60" />
            <h3 className="text-base font-black uppercase tracking-tight text-white/80">
              Redes Sociais
            </h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <SocialLink
              url={redesSociais?.instagram}
              label="Instagram"
              icon={<Instagram size={15} />}
            />
            <SocialLink
              url={redesSociais?.twitter}
              label="Twitter / X"
              icon={<Twitter size={15} />}
            />
            <SocialLink
              url={redesSociais?.youtube}
              label="YouTube"
              icon={<Youtube size={15} />}
            />
            <SocialLink
              url={redesSociais?.tiktok}
              label="TikTok"
              icon={<Globe size={15} />}
            />
            <SocialLink
              url={redesSociais?.facebook}
              label="Facebook"
              icon={<Globe size={15} />}
            />
          </div>
        </div>
      )}
    </section>
  );
});

HistoriaTime.displayName = 'HistoriaTime';

export default HistoriaTime;
