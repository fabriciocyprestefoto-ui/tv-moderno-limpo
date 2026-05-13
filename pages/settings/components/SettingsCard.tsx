import React from 'react';
import { playSelectSound } from '../../../utils/soundEffects';

interface SettingsCardProps {
  title: string;
  description?: string;
  icon: React.ReactNode;
  badge?: string;
  onClick?: () => void;
  accent?: boolean;
}

export const SettingsCard: React.FC<SettingsCardProps> = ({
  title,
  description,
  icon,
  badge,
  onClick,
  accent,
}) => (
  <div
    className={`relative group cursor-pointer rounded-2xl lg:rounded-[1.25rem] border transition-all duration-300 ease-out
            ${
              accent
                ? 'border-violet-500/25 bg-violet-500/[0.06]'
                : 'border-white/[0.07] bg-white/[0.03]'
            }
            backdrop-blur-xl
            shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)]
            hover:bg-white/[0.07] hover:border-white/[0.14] hover:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]
            hover:-translate-y-0.5
            focus-within:bg-white/[0.07] focus-within:border-violet-400/40 focus-within:shadow-[0_0_0_2px_rgba(139,92,246,0.25)]
            flex items-center justify-between
            px-4 sm:px-5 lg:px-6 py-3.5 sm:py-4 lg:py-5
            outline-none`}
    onClick={() => {
      playSelectSound();
      onClick?.();
    }}
    tabIndex={0}
    role="button"
    onKeyDown={(e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        playSelectSound();
        onClick?.();
      }
    }}
  >
    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
      <div
        className={`w-10 h-10 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300
                ${
                  accent
                    ? 'bg-gradient-to-br from-violet-500/50 to-purple-700/40 text-white shadow-[0_4px_14px_rgba(139,92,246,0.3)]'
                    : 'bg-white/[0.06] text-white/50 group-hover:text-white group-hover:bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <h5 className="text-sm lg:text-[15px] font-semibold tracking-tight flex items-center gap-2 flex-wrap text-white/90 group-hover:text-white">
          <span className="truncate">{title}</span>
          {badge && (
            <span
              className={`text-[7px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded-md shrink-0
                            ${
                              accent
                                ? 'text-violet-300 bg-violet-500/15 border border-violet-400/20'
                                : 'text-white/40 bg-white/[0.06] border border-white/[0.08]'
                            }`}
            >
              {badge}
            </span>
          )}
        </h5>
        {description && (
          <p className="text-[11px] sm:text-xs text-white/35 font-light leading-relaxed line-clamp-2 mt-0.5">
            {description}
          </p>
        )}
      </div>
    </div>
    <svg
      className="w-4 h-4 text-white/10 group-hover:text-white/40 transition-all duration-300 transform group-hover:translate-x-0.5 shrink-0 ml-3"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
    </svg>
  </div>
);
