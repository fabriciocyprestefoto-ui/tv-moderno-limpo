import React, { useState, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { UserProfile } from '../types';
import { AVATAR_COLORS } from '../services/profileService';
import { playSelectSound, playNavigateSound } from '../utils/soundEffects';
import { Camera } from 'lucide-react';

interface ProfileFormProps {
  profile?: UserProfile;
  onSave: (data: {
    name: string;
    isKids: boolean;
    avatarColor: string;
    avatarFile?: File | null;
  }) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

const ProfileForm: React.FC<ProfileFormProps> = ({ profile, onSave, onCancel, isSaving }) => {
  const [name, setName] = useState(profile?.name || '');
  const [isKids, setIsKids] = useState(profile?.isKids || false);
  const [avatarColor, setAvatarColor] = useState(profile?.avatarColor || AVATAR_COLORS[0]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar || null);

  // Set initial focus
  useEffect(() => {
    const input = document.getElementById('profile-name-input');
    input?.focus();
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    playSelectSound();
    onSave({
      name: name.trim(),
      isKids,
      avatarColor,
      avatarFile,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="w-full flex flex-col gap-8 animate-in fade-in zoom-in duration-300">
      {/* Header com Voltar */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => {
            playSelectSound();
            onCancel();
          }}
          onFocus={() => playNavigateSound()}
          className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all outline-none focus:ring-2 focus:ring-purple-500"
          data-nav-item
          data-nav-row="form-header"
        >
          <ChevronLeft size={24} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-white">
            {profile ? 'Editar Perfil' : 'Adicionar Perfil'}
          </h2>
          <p className="text-white/40 text-sm uppercase tracking-widest">
            Nova identidade no ecossistema
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-12 items-start mt-4">
        {/* Form Side */}
        <div className="flex-1 w-full space-y-8">
          {/* Input Nome */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] ml-2">
              Nome do Perfil
            </label>
            <input
              id="profile-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como devemos chamar você?"
              data-nav-item
              data-nav-row="form-name"
              className="w-full h-14 px-6 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:bg-white/10 focus:border-purple-500/50 outline-none transition-all"
            />
          </div>

          {/* Toggle Kids */}
          <div
            className="flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer"
            onClick={() => setIsKids(!isKids)}
            data-nav-item
            data-nav-row="form-kids"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"></path>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                  <line x1="9" y1="9" x2="9.01" y2="9"></line>
                  <line x1="15" y1="9" x2="15.01" y2="9"></line>
                </svg>
              </div>
              <div>
                <p className="text-white font-medium">Perfil Kids?</p>
                <p className="text-white/30 text-xs text-balance">
                  Exibe apenas conteúdos recomendados para crianças.
                </p>
              </div>
            </div>
            <div
              className={`w-12 h-6 rounded-full transition-all relative ${isKids ? 'bg-purple-600' : 'bg-white/10'}`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isKids ? 'left-7' : 'left-1'}`}
              />
            </div>
          </div>

          {/* Color Picker */}
          <div className="space-y-4">
            <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] ml-2">
              Escolha um ícone espacial
            </label>
            <div className="flex flex-wrap gap-4">
              {AVATAR_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setAvatarColor(color)}
                  onFocus={() => playNavigateSound()}
                  data-nav-item
                  data-nav-row="form-colors"
                  className={`w-12 h-12 rounded-2xl transition-all relative ${color} ${avatarColor === color ? 'ring-4 ring-white scale-110 z-10' : 'opacity-60 hover:opacity-100 hover:scale-105'}`}
                >
                  {avatarColor === color && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-2xl"></div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Preview Side */}
        <div className="w-full lg:w-72 flex flex-col items-center gap-6">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">
            Prévia do Perfil
          </p>
          <div className="relative group">
            <div
              className={`w-48 h-48 rounded-[40px] ${!avatarPreview ? avatarColor : ''} overflow-hidden flex items-center justify-center shadow-2xl transition-all duration-500 border-4 border-white/10`}
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-6xl font-black text-white/90 drop-shadow-md">
                  {name ? name.charAt(0).toUpperCase() : '?'}
                </span>
              )}
            </div>

            {/* Botão de Upload de Foto */}
            <label
              className="absolute -bottom-2 -right-2 w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center text-white shadow-xl cursor-pointer hover:bg-purple-500 hover:scale-110 active:scale-95 transition-all outline-none focus-within:ring-4 focus-within:ring-white/40"
              data-nav-item
              data-nav-row="form-avatar-action"
            >
              <Camera size={24} />
              <input type="file" className="sr-only" accept="image/*" onChange={handleFileChange} />
            </label>

            {/* Decoration */}
            <div className="absolute -inset-4 bg-purple-500/20 blur-3xl -z-10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {avatarPreview && (
            <button
              onClick={() => {
                setAvatarFile(null);
                setAvatarPreview(null);
              }}
              data-nav-item
              data-nav-row="form-avatar-action"
              className="text-[10px] font-bold text-white/40 hover:text-red-400 uppercase tracking-widest transition-colors mb-2"
            >
              Remover Foto
            </button>
          )}

          <h3 className="text-xl font-bold text-white mt-2 truncate w-full text-center">
            {name || 'Novo Perfil'}
          </h3>
          {isKids && (
            <span className="px-3 py-1 bg-green-500/20 text-green-400 text-[10px] font-black uppercase tracking-widest rounded-full border border-green-500/30">
              Kids Safe
            </span>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex gap-4 mt-auto pt-8 border-t border-white/5">
        <button
          onClick={() => {
            playSelectSound();
            onCancel();
          }}
          onFocus={() => playNavigateSound()}
          data-nav-item
          data-nav-row="form-actions"
          data-nav-col="0"
          className="flex-1 h-14 rounded-2xl bg-white/5 text-white font-bold hover:bg-white/10 transition-all outline-none focus:ring-2 focus:ring-white/20"
        >
          CANCELAR
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || isSaving}
          onFocus={() => playNavigateSound()}
          data-nav-item
          data-nav-row="form-actions"
          data-nav-col="1"
          className={`flex-1 h-14 rounded-2xl font-bold text-white transition-all outline-none focus:ring-2 focus:ring-purple-400/50 shadow-lg ${!name.trim() || isSaving ? 'bg-white/5 opacity-50' : 'bg-linear-to-r from-purple-600 to-indigo-600 hover:brightness-110 active:scale-[0.98]'}`}
        >
          {isSaving ? (
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
          ) : (
            'SALVAR PERFIL'
          )}
        </button>
      </div>
    </div>
  );
};

export default ProfileForm;
