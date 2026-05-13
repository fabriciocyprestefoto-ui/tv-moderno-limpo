import React, { useState, useEffect, useCallback, useRef } from 'react';
import { setSignal } from '../utils/appSignals';
import { UserProfile } from '../types';
import { logger } from '../utils/logger';
import { useAuth } from '../contexts/AuthContext';
import { useSpatialNav } from '../hooks/useSpatialNavigation';
import {
  createProfile,
  getProfiles,
  updateProfile,
  deleteProfile,
  AVATAR_COLORS,
  PARENTAL_RATINGS,
  verifyParentalPin,
} from '../services/profileService';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Baby, Trash2, Check, X, Loader2, Plus, Pencil, Camera } from 'lucide-react';
import { playSelectSound, playNavigateSound, playBackSound } from '../utils/soundEffects';
import { normalizeRemoteKey } from '../hooks/useRemoteControl';

interface ProfilesProps {
  onSelect: (profile: UserProfile) => void;
  onBackToSelect?: () => void;
  initialEditMode?: boolean;
  initialShowAddModal?: boolean;
}

const AvatarDisplay: React.FC<{
  profile?: UserProfile | null;
  avatarPreview?: string;
  avatarColor?: string;
  name?: string;
  size?: number;
  onClick?: () => void;
  showEditOverlay?: boolean;
}> = ({ profile, avatarPreview, avatarColor, name, size = 128, onClick, showEditOverlay }) => {
  const src =
    avatarPreview ||
    (profile?.avatar
      ? `${profile.avatar}?t=${new Date(profile.updated_at || Date.now()).getTime()}`
      : null);
  const color = avatarColor || profile?.avatarColor || 'bg-red-600';
  const letter = (name || profile?.name || '?')[0]?.toUpperCase();
  const borderRadius = Math.round(size * 0.18);

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden ${onClick ? 'cursor-pointer group' : ''}`}
      style={{ width: size, height: size, borderRadius, flexShrink: 0 }}
    >
      {src ? (
        <img src={src} alt={name || profile?.name} className="w-full h-full object-cover" />
      ) : (
        <div className={`w-full h-full ${color} flex items-center justify-center`}>
          <span className="font-bold text-white/90" style={{ fontSize: size * 0.38 }}>
            {letter}
          </span>
        </div>
      )}
      {showEditOverlay && (
        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-1 group-hover:bg-black/60 transition-all">
          <Camera size={size * 0.28} className="text-white animate-pulse" />
          <span className="text-white text-[9px] font-black uppercase tracking-widest\">FOTO</span>
        </div>
      )}
    </div>
  );
};

const Profiles: React.FC<ProfilesProps> = ({
  onSelect,
  onBackToSelect,
  initialEditMode = false,
  initialShowAddModal = false,
}) => {
  const { user } = useAuth();
  const { setPosition } = useSpatialNav();

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(initialEditMode);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);

  // modals
  const [showPinModal, setShowPinModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(initialShowAddModal);
  const [showFullEdit, setShowFullEdit] = useState(false);

  // PIN
  const [pinCurrent, setPinCurrent] = useState('');
  const [pinError, setPinError] = useState('');

  // form (Add / Full Edit)
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputEditRef = useRef<HTMLInputElement | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');

  const [formData, setFormData] = useState<{
    name: string;
    isKids: boolean;
    avatarColor: string;
    parentalRating: string;
    parentalPin: string;
    autoPlayNext: boolean;
    avatar?: string;
  }>({
    name: '',
    isKids: false,
    avatarColor: AVATAR_COLORS[0],
    parentalRating: 'L',
    parentalPin: '',
    autoPlayNext: true,
  });

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(avatarPreview);
        } catch {
          /* no-op */
        }
      }
    };
  }, [avatarPreview]);

  const loadProfiles = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await Promise.race([
        getProfiles(user.id),
        new Promise<UserProfile[]>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 10000)
        ),
      ]);
      setProfiles(data || []);
    } catch {
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // TV Box: sinalizar para __dispatchTVKey__ enviar setas ao window
  useEffect(() => {
    window.__profilesActive = true;
    return () => {
      window.__profilesActive = false;
    };
  }, []);

  useEffect(() => {
    if (!loading && profiles.length > 0) {
      setTimeout(() => {
        setPosition(0, 0);
        const firstBtn = document.querySelector('[data-nav-item]') as HTMLElement;
        if (firstBtn) firstBtn.focus();
      }, 100);
    }
  }, [loading, profiles, setPosition]);

  const resetForm = useCallback(() => {
    setAvatarFile(null);
    setSaveError('');
    setAvatarPreview('');
    setFormData({
      name: '',
      isKids: false,
      avatarColor: AVATAR_COLORS[0],
      parentalRating: 'L',
      parentalPin: '',
      autoPlayNext: true,
    });
  }, []);

  const handleProfileClick = (profile: UserProfile) => {
    if (!profile) return;
    playSelectSound();
    if (isEditMode) {
      setSelectedProfile(profile);
      setSaveError('');
      setAvatarFile(null);
      setAvatarPreview(profile.avatar || '');
      setFormData({
        name: profile.name,
        isKids: profile.isKids,
        avatarColor: profile.avatarColor || AVATAR_COLORS[0],
        parentalRating: profile.parentalRating || 'L',
        parentalPin: '',
        autoPlayNext: profile.autoPlayNext || false,
        avatar: profile.avatar,
      });
      setShowFullEdit(true);
    } else {
      if (profile.parentalPin) {
        setSelectedProfile(profile);
        setPinCurrent('');
        setPinError('');
        setShowPinModal(true);
      } else {
        onSelect(profile);
      }
    }
  };

  const handlePinSubmit = async () => {
    if (!selectedProfile) return;
    if (await verifyParentalPin(selectedProfile, pinCurrent)) {
      playSelectSound();
      setShowPinModal(false);
      onSelect(selectedProfile);
    } else {
      playBackSound();
      setPinError('PIN Incorreto');
      setPinCurrent('');
    }
  };

  const handleSaveProfile = async () => {
    if (!user || !formData.name?.trim()) {
      setSaveError('O nome do perfil é obrigatório');
      return;
    }
    playSelectSound();
    setSaveError('');
    setSaving(true);
    try {
      if (selectedProfile) {
        const updated = await updateProfile(selectedProfile.id, user.id, {
          name: formData.name,
          isKids: formData.isKids,
          avatarColor: formData.avatarColor,
          parentalRating: formData.parentalRating,
          parentalPin: formData.parentalPin || undefined,
          avatarFile,
          autoPlayNext: formData.autoPlayNext,
        });

        if (updated) {
          setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          setShowFullEdit(false);
        } else {
          setSaveError('Falha ao atualizar perfil');
        }
      } else {
        const newProfile = await createProfile(user.id, {
          name: formData.name,
          isKids: formData.isKids || false,
          avatarColor: formData.avatarColor,
          parentalRating: formData.parentalRating,
          parentalPin: formData.parentalPin,
          avatarFile,
          autoPlayNext: formData.autoPlayNext ?? true,
        });

        console.log('[Profiles] Profile creation result:', newProfile);
        if (newProfile) {
          setProfiles((prev) => [...prev, newProfile]);
          setShowAddModal(false);
        } else {
          console.error('[Profiles] createProfile returned null');
          setSaveError('Falha ao criar perfil: Dados não retornados');
        }
      }
      setSelectedProfile(null);
      resetForm();
    } catch (error) {
      logger.error('Erro ao salvar perfil:', error);
      const msg = error instanceof Error ? error.message : 'Erro ao salvar perfil';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!selectedProfile) return;
    if (window.confirm(`Tem certeza que deseja excluir o perfil ${selectedProfile.name}?`)) {
      await deleteProfile(selectedProfile.id);
      setProfiles((prev) => prev.filter((p) => p.id !== selectedProfile.id));
      setShowFullEdit(false);
      setSelectedProfile(null);
    }
  };

  const toggleEditMode = () => {
    if (isEditMode && onBackToSelect) onBackToSelect();
    setIsEditMode(!isEditMode);
    playSelectSound();
  };

  useEffect(() => {
    if (!showPinModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = normalizeRemoteKey(e);
      if (e.key >= '0' && e.key <= '9') {
        if (pinCurrent.length < 4) {
          setPinCurrent((prev) => prev + e.key);
          playNavigateSound();
        }
      } else if (key === 'Backspace') {
        setPinCurrent((prev) => prev.slice(0, -1));
        playBackSound();
      } else if (key === 'Enter') {
        if (pinCurrent.length === 4) handlePinSubmit();
      } else if (key === 'Escape' || key === 'Backspace') {
        setShowPinModal(false);
        setPinCurrent('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPinModal, pinCurrent, selectedProfile, handlePinSubmit]);

  useEffect(() => {
    const active = showAddModal || showFullEdit;
    setSignal('modalKeyTrap', active);
    if (active) {
      const handleKeyDown = (e: KeyboardEvent) => {
        const key = normalizeRemoteKey(e);
        if (key === 'Escape' || key === 'Backspace') {
          if (showAddModal) setShowAddModal(false);
          if (showFullEdit) {
            setShowFullEdit(false);
            setSelectedProfile(null);
          }
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        setSignal('modalKeyTrap', false);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
    return () => {
      setSignal('modalKeyTrap', false);
    };
  }, [showAddModal, showFullEdit]);

  const handleAvatarFile = (file: File | null) => {
    if (!file) return;
    if (avatarPreview?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(avatarPreview);
      } catch {
        /* no-op */
      }
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setFormData((prev) => ({ ...prev, avatar: undefined }));
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden font-sans"
      data-nav-row="0"
    >
      {/* Background Purple/Red Glow (VisionOS style) - Identical to Login */}
      <div className="absolute inset-0 bg-[#0B0514]">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-purple-900/40 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-red-900/20 blur-[100px]" />
      </div>

      {/* Principal Glass Card - Matches AdminLoginModal dimensions */}
      <div className="relative z-10 w-full max-w-md px-5" style={{ transform: 'scale(0.7)' }}>
        <div
          className="rounded-[28px] p-8 flex flex-col gap-6"
          style={{
            background:
              'linear-gradient(135deg, rgba(88, 28, 135, 0.45) 0%, rgba(30, 10, 60, 0.65) 100%)',
            border: '1.5px solid rgba(167, 139, 250, 0.3)',
            boxShadow: '0 40px 120px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.15)',
            backdropFilter: 'blur(50px)',
            WebkitBackdropFilter: 'blur(50px)',
          }}
        >
          {/* Título - Sem logo e centralizado */}
          <div className="flex flex-col items-center justify-center border-b border-white/10 pb-4">
            <h1 className="text-xl font-black text-white tracking-widest uppercase mb-1">
              {isEditMode ? 'Gerenciar' : 'Perfil'}
            </h1>
            <p className="text-[10px] font-black tracking-[0.4em] uppercase text-white/20">
              {isEditMode ? 'Ajuste suas preferências' : 'Identifique-se'}
            </p>
          </div>

          {/* Perfis - Grid flex wrap para largura menor */}
          <div className="flex flex-row flex-wrap items-center justify-center gap-x-8 gap-y-8 w-full pb-2 min-h-[220px]">
            {loading ? (
              <div className="flex items-center gap-3 py-12 w-full justify-center">
                <Loader2 size={24} className="animate-spin text-white/60" />
                <span className="text-white/40 text-sm font-medium">Carregando...</span>
              </div>
            ) : (
              <>
                {profiles.map((profile, idx) => (
                  <motion.div
                    key={profile.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.1 }}
                    className="group flex flex-col items-center min-w-[100px] text-center cursor-pointer flex-shrink-0 outline-none focus:outline-none"
                    onClick={() => handleProfileClick(profile)}
                    tabIndex={0}
                    data-nav-item
                    data-nav-col={idx}
                    onKeyDown={(e) => {
                      if (normalizeRemoteKey(e) === 'Enter') {
                        e.preventDefault();
                        handleProfileClick(profile);
                      }
                    }}
                  >
                    {/* Avatar com lápis no modo editar */}
                    <div className="relative mb-4 transition-all duration-300 group-focus:scale-110 group-focus:ring-4 group-focus:ring-purple-500/50">
                      <AvatarDisplay profile={profile} size={100} showEditOverlay={isEditMode} />
                      {isEditMode && (
                        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-lg">
                          <Pencil size={14} className="text-black" />
                        </div>
                      )}
                      {!isEditMode && profile.parentalPin && (
                        <div className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 border border-white/10 backdrop-blur-md">
                          <Lock size={12} className="text-white/80" />
                        </div>
                      )}
                    </div>
                    <h2 className="text-[14px] font-bold text-white mb-1 uppercase tracking-wide group-focus:text-purple-300">
                      {profile.name}
                    </h2>
                    <p className="text-white/30 text-[10px] tracking-widest uppercase mt-0.5 group-focus:text-white/50">
                      {profile.isKids ? 'Kids' : idx === 0 ? 'Admin' : 'Membro'}
                    </p>
                  </motion.div>
                ))}

                {/* Adicionar perfil */}
                {profiles.length < 5 && (
                  <div
                    className="group flex flex-col items-center min-w-[100px] text-center cursor-pointer flex-shrink-0 outline-none"
                    onClick={() => {
                      resetForm();
                      setSelectedProfile(null);
                      setAvatarFile(null);
                      setAvatarPreview('');
                      setShowAddModal(true);
                      playSelectSound();
                    }}
                    tabIndex={0}
                    data-nav-item
                    data-nav-col={profiles.length}
                    onKeyDown={(e) => {
                      if (normalizeRemoteKey(e) === 'Enter') {
                        e.preventDefault();
                        resetForm();
                        setSelectedProfile(null);
                        setShowAddModal(true);
                        playSelectSound();
                      }
                    }}
                  >
                    <div
                      className="w-[100px] h-[100px] rounded-[28px] flex items-center justify-center mb-4 transition-all duration-300 group-focus:scale-110 group-focus:ring-4 group-focus:ring-purple-500/50"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '2px dashed rgba(255,255,255,0.2)',
                      }}
                    >
                      <Plus size={32} className="text-white/30 group-focus:text-white/70" />
                    </div>
                    <h2 className="text-[14px] font-bold text-white/40 group-focus:text-white/70">
                      Adicionar
                    </h2>
                    <p className="text-white/20 text-[10px] tracking-widest uppercase mt-0.5 group-focus:text-white/40">
                      Novo Perfil
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Action Button - Login Style */}
          <button
            onClick={toggleEditMode}
            onFocus={() => playNavigateSound()}
            tabIndex={0}
            data-nav-item
            data-nav-col={profiles.length + 1}
            className="relative w-full py-5 rounded-[22px] font-black text-[14px] tracking-[0.3em] flex items-center justify-center gap-3 transition-all duration-300 focus:scale-105 outline-none uppercase"
            style={{
              background: isEditMode
                ? 'rgba(255,255,255,0.1)'
                : 'linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)',
              boxShadow: isEditMode ? 'none' : '0 10px 40px rgba(124, 58, 237, 0.4)',
              color: '#ffffff',
              border: isEditMode ? '1.5px solid rgba(255,255,255,0.2)' : 'none',
            }}
          >
            {isEditMode ? 'CONCLUÍDO' : 'GERENCIAR PERFIS'}
          </button>
        </div>
      </div>

      {/* ============ MODAL: PIN ============ */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="p-10 rounded-[40px] max-w-sm w-full mx-5 flex flex-col items-center gap-6"
              style={{
                background:
                  'linear-gradient(135deg, rgba(88, 28, 135, 0.45) 0%, rgba(30, 10, 60, 0.65) 100%)',
                border: '1px solid rgba(167, 139, 250, 0.3)',
                boxShadow: '0 40px 100px rgba(0,0,0,0.8)',
              }}
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                <Lock size={26} className="text-white/70" />
              </div>
              <h3 className="text-xl font-bold text-white uppercase tracking-wider">
                PIN do Perfil
              </h3>
              <p className="text-white/40 text-center text-[12px] uppercase tracking-widest">
                Digite o PIN de <span className="text-purple-400">{selectedProfile?.name}</span>
              </p>
              <div className="flex gap-4 my-4">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-14 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold transition-all duration-200"
                    style={{
                      border: `1px solid ${pinError ? 'rgba(248,113,113,0.5)' : i < pinCurrent.length ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
                      background:
                        i < pinCurrent.length ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                    }}
                  >
                    <span className={i < pinCurrent.length ? 'text-white' : 'text-transparent'}>
                      ●
                    </span>
                  </div>
                ))}
              </div>
              {pinError && (
                <p className="text-red-400 font-bold text-[11px] uppercase tracking-widest">
                  {pinError}
                </p>
              )}
              <button
                onClick={() => {
                  setShowPinModal(false);
                  setPinCurrent('');
                }}
                tabIndex={0}
                className="text-white/30 hover:text-white/70 text-[11px] uppercase tracking-[0.3em] font-bold transition-all focus:outline-none focus:text-white/70"
              >
                Cancelar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============ MODAL: ADICIONAR PERFIL ============ */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-lg mx-5 rounded-[40px] overflow-hidden"
              style={{
                background:
                  'linear-gradient(135deg, rgba(88, 28, 135, 0.45) 0%, rgba(30, 10, 60, 0.65) 100%)',
                border: '1.5px solid rgba(167, 139, 250, 0.3)',
                boxShadow: '0 40px 120px rgba(0,0,0,0.8)',
              }}
            >
              <div className="flex items-center justify-between px-10 pt-10 pb-6 border-b border-white/10">
                <div>
                  <h2 className="text-2xl font-bold text-white uppercase tracking-tight">
                    Novo Perfil
                  </h2>
                  <p className="text-[11px] text-white/40 mt-1 uppercase tracking-[0.2em]">
                    Crie uma nova identidade Red X
                  </p>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-white/30 hover:text-white/70 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="px-10 py-8 flex flex-col gap-6">
                <div className="flex items-center gap-6">
                  <div
                    className="relative cursor-pointer group"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <AvatarDisplay
                      avatarPreview={avatarPreview || undefined}
                      avatarColor={formData.avatarColor}
                      name={formData.name || '?'}
                      size={100}
                      showEditOverlay={true}
                    />
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleAvatarFile(e.target.files?.[0] || null)}
                    />
                  </div>

                  <div className="flex-1">
                    <label className="text-[10px] uppercase font-bold text-white/30 tracking-[0.3em] mb-2 block ml-1">
                      Nome do Perfil
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Como devemos chamar você?"
                      className="w-full rounded-2xl py-4 px-6 text-[15px] font-bold text-white placeholder-white/20 outline-none transition-all focus:ring-2 focus:ring-purple-500/50"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.15)',
                      }}
                      autoFocus
                    />
                  </div>
                </div>

                {saveError && (
                  <p className="text-[11px] text-red-400 font-bold uppercase tracking-widest">
                    {saveError}
                  </p>
                )}

                <div className="flex gap-2 flex-wrap">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        setAvatarFile(null);
                        setAvatarPreview('');
                        setFormData((prev) => ({ ...prev, avatarColor: color }));
                      }}
                      className={`w-8 h-8 rounded-full ${color} transition-all duration-200 ${formData.avatarColor === color ? 'ring-4 ring-white shadow-xl scale-110' : 'opacity-40 hover:opacity-100 hover:scale-110'}`}
                    />
                  ))}
                </div>

                <div
                  className="flex items-center justify-between rounded-2xl px-6 py-4 cursor-pointer transition-all hover:bg-white/5"
                  onClick={() => setFormData((prev) => ({ ...prev, isKids: !prev.isKids }))}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <Baby size={20} className="text-blue-400" />
                    </div>
                    <div>
                      <p className="text-[14px] font-bold text-white uppercase tracking-tight">
                        Perfil Kids
                      </p>
                      <p className="text-[10px] text-white/30 uppercase tracking-widest">
                        Apenas conteúdo infantil
                      </p>
                    </div>
                  </div>
                  <div
                    className={`w-12 h-6 rounded-full relative transition-all duration-300 ${formData.isKids ? 'bg-purple-600' : 'bg-white/10'}`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-xl transition-all duration-300 ${formData.isKids ? 'translate-x-6' : ''}`}
                    />
                  </div>
                </div>
              </div>

              <div className="px-10 pb-10 flex flex-col gap-4 border-t border-white/10 pt-8 mt-2">
                <button
                  onClick={handleSaveProfile}
                  disabled={saving || !formData.name?.trim()}
                  className="w-full py-4 rounded-2xl text-[14px] font-bold tracking-[0.2em] uppercase flex items-center justify-center gap-3 transition-all disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)',
                    boxShadow: '0 10px 30px rgba(124, 58, 237, 0.4)',
                    color: '#fff',
                  }}
                >
                  {saving && <Loader2 size={18} className="animate-spin" />}
                  Salvar Perfil
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="w-full py-3 text-[12px] font-bold text-white/30 hover:text-white/70 uppercase tracking-[0.3em] transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============ MODAL: EDIÇÃO COMPLETA ============ */}
      <AnimatePresence>
        {showFullEdit && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md overflow-y-auto py-12"
          >
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-4xl mx-5 rounded-[44px] relative"
              style={{
                background:
                  'linear-gradient(135deg, rgba(88, 28, 135, 0.45) 0%, rgba(30, 10, 60, 0.65) 100%)',
                border: '1.5px solid rgba(167, 139, 250, 0.3)',
                boxShadow: '0 40px 120px rgba(0,0,0,0.8)',
              }}
            >
              <div className="flex items-center justify-between px-10 pt-10 pb-6 border-b border-white/10">
                <h2 className="text-2xl font-bold text-white uppercase tracking-tight">
                  Editar Perfil
                </h2>
                <button
                  onClick={() => {
                    setShowFullEdit(false);
                    setSelectedProfile(null);
                  }}
                  className="text-white/30 hover:text-white/70 transition-colors"
                >
                  <X size={26} />
                </button>
              </div>

              <div className="px-10 py-10 flex flex-col md:flex-row gap-12">
                <div className="flex flex-col items-center gap-6 min-w-[200px]">
                  <div
                    className="relative cursor-pointer group"
                    onClick={() => avatarInputEditRef.current?.click()}
                  >
                    <AvatarDisplay
                      profile={selectedProfile}
                      avatarPreview={avatarPreview || undefined}
                      avatarColor={formData.avatarColor}
                      name={formData.name || selectedProfile?.name}
                      size={150}
                      showEditOverlay={true}
                    />
                    <input
                      ref={avatarInputEditRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleAvatarFile(e.target.files?.[0] || null)}
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    {AVATAR_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          setAvatarFile(null);
                          setAvatarPreview('');
                          setFormData((prev) => ({
                            ...prev,
                            avatarColor: color,
                            avatar: undefined,
                          }));
                        }}
                        className={`w-9 h-9 rounded-full ${color} transition-all duration-200 ${formData.avatarColor === color ? 'ring-4 ring-white scale-110 shadow-lg' : 'opacity-40 hover:opacity-100 hover:scale-110'}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-8">
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] uppercase font-bold text-white/30 tracking-[0.3em] ml-1">
                      Nome
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-2xl py-4 px-6 text-[15px] font-bold text-white outline-none focus:ring-2 focus:ring-purple-500/50"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.15)',
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
                      className="flex items-center justify-between rounded-2xl px-6 py-4 cursor-pointer transition-all hover:bg-white/5"
                      onClick={() => setFormData((prev) => ({ ...prev, isKids: !prev.isKids }))}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Baby size={18} className="text-blue-400" />
                        <p className="text-[13px] font-bold text-white uppercase tracking-tight">
                          Kids
                        </p>
                      </div>
                      <div
                        className={`w-10 h-5 rounded-full relative transition-all duration-300 ${formData.isKids ? 'bg-purple-600' : 'bg-white/10'}`}
                      >
                        <div
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300 ${formData.isKids ? 'translate-x-5' : ''}`}
                        />
                      </div>
                    </div>

                    <div
                      className="flex items-center justify-between rounded-2xl px-6 py-4 cursor-pointer transition-all hover:bg-white/5"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, autoPlayNext: !prev.autoPlayNext }))
                      }
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Check size={18} className="text-green-400" />
                        <p className="text-[13px] font-bold text-white uppercase tracking-tight">
                          Autoplay
                        </p>
                      </div>
                      <div
                        className={`w-10 h-5 rounded-full relative transition-all duration-300 ${formData.autoPlayNext ? 'bg-purple-600' : 'bg-white/10'}`}
                      >
                        <div
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300 ${formData.autoPlayNext ? 'translate-x-5' : ''}`}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 p-6 rounded-3xl bg-black/20 border border-white/5">
                    <h3 className="text-[12px] font-bold text-white/50 uppercase tracking-widest flex items-center gap-2">
                      <Lock size={14} className="text-purple-500" /> Segurança & Controle
                    </h3>
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] uppercase font-bold text-white/30 tracking-[0.2em]">
                          Classificação Máxima
                        </label>
                        <div className="flex gap-2 flex-wrap">
                          {PARENTAL_RATINGS.map((rating) => (
                            <button
                              key={rating.value}
                              onClick={() =>
                                setFormData((prev) => ({ ...prev, parentalRating: rating.value }))
                              }
                              className={`px-3 py-2 rounded-lg text-[11px] font-bold min-w-[44px] transition-all ${rating.color} ${formData.parentalRating === rating.value ? 'ring-2 ring-white scale-110 opacity-100 shadow-lg' : 'opacity-30 hover:opacity-60'}`}
                            >
                              {rating.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] uppercase font-bold text-white/30 tracking-[0.2em]">
                          PIN de 4 Dígitos
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          value={formData.parentalPin}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val.length <= 4)
                              setFormData((prev) => ({ ...prev, parentalPin: val }));
                          }}
                          className="w-32 rounded-xl py-3 px-5 text-center tracking-[0.6em] font-mono text-[16px] font-bold text-white outline-none focus:ring-2 focus:ring-purple-500/50"
                          style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.15)',
                          }}
                          placeholder="----"
                        />
                      </div>
                    </div>
                  </div>
                  {saveError && (
                    <p className="text-[11px] text-red-400 font-bold uppercase tracking-widest">
                      {saveError}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 px-10 py-8 border-t border-white/10 pt-10">
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="px-10 py-4 rounded-2xl text-[14px] font-bold tracking-[0.2em] uppercase flex items-center gap-3 transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)',
                    color: '#fff',
                  }}
                >
                  {saving && <Loader2 size={18} className="animate-spin" />}
                  Atualizar
                </button>
                <button
                  onClick={() => {
                    setShowFullEdit(false);
                    setSelectedProfile(null);
                  }}
                  className="px-8 py-4 rounded-2xl text-[14px] font-bold text-white/30 hover:text-white/70 transition-all uppercase tracking-[0.2em]"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Cancelar
                </button>
                {selectedProfile && (
                  <button
                    onClick={handleDeleteProfile}
                    className="ml-auto flex items-center gap-2 px-6 py-4 rounded-2xl text-[12px] font-bold text-red-400/50 hover:text-red-400 transition-all uppercase tracking-widest"
                  >
                    <Trash2 size={18} /> Excluir
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default Profiles;
