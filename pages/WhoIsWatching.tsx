import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit } from 'lucide-react';
import { UserProfile } from '../types';
import * as profileService from '../services/profileService';
import ProfileForm from '../components/ProfileForm';
import { supabase } from '../services/supabaseService';

type ViewMode = 'LIST' | 'MANAGE' | 'ADD' | 'EDIT';

const WhoIsWatching = () => {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('LIST');
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    window.__whoIsWatchingActive = true;
    return () => {
      window.__whoIsWatchingActive = false;
    };
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        loadProfiles(session.user.id);
      } else {
        navigate('/login');
      }
    };
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (loading || viewMode === 'ADD' || viewMode === 'EDIT') return;

    const focusFirst = () => {
      const first = document.querySelector<HTMLElement>('[data-nav-item]');
      if (!first || first.getBoundingClientRect().width === 0) return false;
      first.focus({ preventScroll: true });
      return true;
    };

    if (focusFirst()) return;

    const retry100 = window.setTimeout(focusFirst, 100);
    const retry300 = window.setTimeout(focusFirst, 300);
    return () => {
      window.clearTimeout(retry100);
      window.clearTimeout(retry300);
    };
  }, [loading, viewMode, profiles.length]);

  // Handle Back button to return to LIST mode if MANAGE/ADD/EDIT
  useEffect(() => {
    const handleBack = (e: CustomEvent) => {
      if (viewMode !== 'LIST') {
        e.preventDefault();
        if (viewMode === 'ADD' || viewMode === 'EDIT' || viewMode === 'MANAGE') {
          setViewMode('LIST');
          setEditingProfile(null);
        }
      }
    };
    window.addEventListener('redx-native-back' as any, handleBack);
    return () => window.removeEventListener('redx-native-back' as any, handleBack);
  }, [viewMode]);

  const loadProfiles = async (uid: string) => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await profileService.getProfiles(uid);
      setProfiles(data);
    } catch (error) {
      console.error('Erro ao carregar perfis:', error);
      setLoadError('Não foi possível carregar os perfis. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleProfileSelect = (profile: UserProfile) => {
    if (viewMode === 'MANAGE') {
      window.dispatchEvent(new CustomEvent('spatial-nav-click'));
      setEditingProfile(profile);
      setViewMode('EDIT');
      return;
    }
    localStorage.setItem('selectedProfile', JSON.stringify(profile));
    navigate('/');
  };

  const handleAddProfile = () => {
    window.dispatchEvent(new CustomEvent('spatial-nav-click'));
    setEditingProfile(null);
    setViewMode('ADD');
  };

  const handleSave = async (profileData: any) => {
    if (!userId) return;
    try {
      setIsSaving(true);
      setSaveError(null);
      if (viewMode === 'EDIT' && editingProfile) {
        await profileService.updateProfile(editingProfile.id, userId, {
          name: profileData.name,
          isKids: profileData.isKids,
          avatarColor: profileData.avatarColor,
          avatarFile: profileData.avatarFile,
        });
      } else {
        await profileService.createProfile(userId, {
          name: profileData.name,
          isKids: profileData.isKids,
          avatarColor: profileData.avatarColor,
          avatarFile: profileData.avatarFile,
        });
      }
      setViewMode('LIST');
      loadProfiles(userId);
    } catch (error) {
      console.error('Erro ao salvar perfil:', error);
      setSaveError('Não foi possível salvar o perfil. Verifique sua conexão e tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  if (viewMode === 'ADD' || viewMode === 'EDIT') {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center p-8 animate-page-in overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-purple-900/20 to-transparent pointer-events-none" />
        <div className="relative w-full max-w-4xl">
          {saveError && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm text-center">
              {saveError}
            </div>
          )}
          <ProfileForm
            profile={editingProfile || undefined}
            onSave={handleSave}
            onCancel={() => {
              setViewMode('LIST');
              setSaveError(null);
            }}
            isSaving={isSaving}
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-6 p-8">
        <div className="w-14 h-14 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
          <span className="text-red-400 text-2xl">!</span>
        </div>
        <p className="text-white/70 text-center max-w-sm">{loadError}</p>
        <button
          onClick={() => userId && loadProfiles(userId)}
          className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center p-8 animate-page-in overflow-hidden">
      {/* Background with focal point */}
      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-purple-900/20 to-transparent pointer-events-none" />

      <div className="relative w-full max-w-6xl text-center space-y-12">
        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
          {viewMode === 'MANAGE' ? 'Gerenciar Perfis' : 'Quem está assistindo?'}
        </h1>

        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
          {profiles.map((profile, idx) => (
            <div key={profile.id} className="group flex flex-col items-center">
              <button
                data-nav-item
                data-nav-row="1"
                data-nav-col={idx + 1}
                data-nav-custom-focus
                onClick={() => handleProfileSelect(profile)}
                className={`
                  relative w-32 h-32 md:w-40 md:h-40 rounded-xl overflow-hidden
                  transition-all duration-300 transform outline-none
                  focus:scale-110 focus:ring-4 focus:ring-purple-500
                  hover:scale-105 active:scale-95
                  ${viewMode === 'MANAGE' ? 'opacity-80' : 'opacity-100'}
                `}
              >
                <img
                  src={
                    profile.avatar ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.name}`
                  }
                  alt={profile.name}
                  className="w-full h-full object-cover"
                />

                {viewMode === 'MANAGE' && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Edit className="w-10 h-10 text-white animate-pulse" />
                  </div>
                )}

                {/* Kids Badge */}
                {profile.isKids && (
                  <div className="absolute top-2 right-2 bg-yellow-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
                    Kids
                  </div>
                )}
              </button>

              <div className="mt-4">
                <span className="text-xl md:text-2xl text-gray-400 group-focus-within:text-white group-hover:text-white transition-colors">
                  {profile.name}
                </span>
              </div>
            </div>
          ))}

          {profiles.length < 5 && (
            <div className="group flex flex-col items-center">
              <button
                data-nav-item
                data-nav-row="1"
                data-nav-col={profiles.length + 1}
                data-nav-item-priority="true"
                data-nav-custom-focus
                onClick={handleAddProfile}
                className="
                  w-32 h-32 md:w-40 md:h-40 rounded-xl flex items-center justify-center outline-none
                  bg-white/5 border-2 border-dashed border-white/20
                  transition-all duration-300 transform
                  focus:scale-110 focus:bg-white/10 focus:border-purple-500 focus:ring-4 focus:ring-purple-500
                  hover:bg-white/10 hover:border-white/40
                "
              >
                <Plus className="w-16 h-16 text-gray-400 group-focus-within:text-white group-hover:text-white" />
              </button>
              <div className="mt-4">
                <span className="text-xl md:text-2xl text-gray-400 group-focus-within:text-white group-hover:text-white transition-colors">
                  Adicionar Perfil
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="pt-8">
          <button
            data-nav-item
            data-nav-row="2"
            data-nav-col="1"
            data-nav-custom-focus
            onClick={() => setViewMode(viewMode === 'MANAGE' ? 'LIST' : 'MANAGE')}
            className={`
              px-8 py-2 text-lg font-medium border-2 outline-none
              transition-all duration-300 rounded-md
              focus:scale-110 focus:bg-white focus:text-black focus:ring-4 focus:ring-purple-500/50
              ${
                viewMode === 'MANAGE'
                  ? 'bg-white text-black border-white'
                  : 'bg-transparent text-gray-400 border-gray-600 hover:text-white hover:border-white'
              }
            `}
          >
            {viewMode === 'MANAGE' ? 'Pronto' : 'Gerenciar Perfis'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WhoIsWatching;
