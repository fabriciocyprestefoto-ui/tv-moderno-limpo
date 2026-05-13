import React, { useState, useEffect } from 'react';
import {
  Home,
  Film,
  Tv,
  List,
  Radio,
  Menu,
  X,
  Settings,
  Smile,
  Search,
  LayoutGrid,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Page } from '../types';
import { playSelectSound, playBackSound } from '@/utils/soundEffects';
import { normalizeRemoteKey } from '@/hooks/useRemoteControl';

interface HamburgerMenuProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  profile: any;
  onProfileClick: () => void;
}

const HamburgerMenu: React.FC<HamburgerMenuProps> = ({
  currentPage,
  onNavigate,
  profile,
  onProfileClick,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { id: Page.HOME, icon: Home, label: 'Início' },
    { id: Page.GENRES, icon: LayoutGrid, label: 'Gêneros' },
    { id: Page.MOVIES, icon: Film, label: 'Filmes' },
    { id: Page.SERIES, icon: Tv, label: 'Séries' },
    { id: Page.LIVE, icon: Radio, label: 'Canais ao Vivo' },
    { id: Page.KIDS, icon: Smile, label: 'Espaço Kids' },
    { id: Page.MY_LIST, icon: List, label: 'Minha Lista' },
    { id: Page.SEARCH, icon: Search, label: 'Buscar' },
    { id: Page.ADMIN, icon: Settings, label: 'Painel Admin' },
  ];

  const toggleMenu = () => setIsOpen(!isOpen);

  const handleNavigate = (page: Page) => {
    playSelectSound();
    onNavigate(page);
    setIsOpen(false);
  };

  // Escape to close menu
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      const key = normalizeRemoteKey(e);
      if (key === 'Escape' || key === 'Backspace') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        e.stopPropagation();
        playBackSound();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isOpen]);

  return (
    <>
      <div className="fixed top-6 left-6 z-[101] pointer-events-none flex items-center h-[50px]">
        <img
          src="/logored.png"
          alt="Redflix"
          className="h-7 w-auto object-contain drop-shadow-[0_0_15px_rgba(168,85,247,0.3)] ml-14"
        />
      </div>

      <button
        onClick={toggleMenu}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            playSelectSound();
            toggleMenu();
          }
        }}
        tabIndex={0}
        className="fixed top-6 left-6 z-[100] p-3 glass rounded-full hover:bg-white/10 transition-all border border-white/20 group active:scale-90 focus:outline-none focus:ring-2 focus:ring-[#A855F7] focus:bg-white/10"
      >
        {isOpen ? (
          <X size={24} className="text-white" />
        ) : (
          <Menu size={24} className="text-white" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={toggleMenu}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[80]"
            />

            {/* Sidebar Lateral */}
            <motion.div
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="fixed top-20 left-4 bottom-4 w-[330px] bg-white/[0.08] backdrop-blur-xl border border-white/10 z-[90] p-8 flex flex-col shadow-[0_40px_100px_rgba(0,0,0,0.6)] rounded-[40px]"
            >
              <div className="flex-1 space-y-2 overflow-y-auto hide-scrollbar">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleNavigate(item.id);
                      }
                    }}
                    tabIndex={0}
                    className={`
                      w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all group focus:outline-none focus:ring-2 focus:ring-[#A855F7]
                      ${
                        currentPage === item.id
                          ? 'bg-[#A855F7] text-white shadow-[0_10px_20px_rgba(168,85,247,0.2)]'
                          : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                      }
                    `}
                  >
                    <item.icon size={22} className="transition-transform group-hover:scale-110" />
                    <span className="font-bold uppercase tracking-widest text-xs">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>

              {profile && (
                <div className="pt-8 border-t border-white/5 space-y-4">
                  <button
                    onClick={() => {
                      onProfileClick();
                      setIsOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        playSelectSound();
                        onProfileClick();
                        setIsOpen(false);
                      }
                    }}
                    tabIndex={0}
                    className="flex items-center gap-4 px-5 py-4 w-full text-zinc-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-[#A855F7] focus:text-white rounded-xl"
                  >
                    <div className="w-10 h-10 rounded-full border border-white/20 overflow-hidden">
                      <img
                        src={profile.avatar}
                        alt={profile.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="text-left">
                      <div className="text-xs font-bold uppercase tracking-widest">
                        {profile.name}
                      </div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-widest">
                        Trocar Perfil
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </>
  );
};

export default HamburgerMenu;
