import React, { useState, useRef, useEffect } from 'react';
import { logger } from '../utils/logger';
import { playNavigateSound, playSelectSound, playBackSound } from '../utils/soundEffects';
import { normalizeRemoteKey } from '../hooks/useRemoteControl';
import { useToast } from '@/contexts/ToastContext';
import { useSpatialNav } from '../hooks/useSpatialNavigation';
import { useAuth } from '../contexts/AuthContext';
import {
  getUserSettings,
  getUserSubscription,
  getAllPlans,
  getPaymentMethods,
  getUserDevices,
  addDevice as apiAddDevice,
  removeDevice as apiRemoveDevice,
  getUserProfiles,
  UserSettings,
  Plan,
  Subscription,
  PaymentMethod,
  Device,
  UserProfileDB,
} from '../services/supabaseService';

// Tabs
import { OverviewTab } from '@/pages/settings/tabs/OverviewTab';
import { SubscriptionTab } from '@/pages/settings/tabs/SubscriptionTab';
import { SecurityTab } from '@/pages/settings/tabs/SecurityTab';
import { DevicesTab } from '@/pages/settings/tabs/DevicesTab';
import { ProfilesTab } from '@/pages/settings/tabs/ProfilesTab';

// SubViews
import { PaymentMethodSubView } from '@/pages/settings/subviews/PaymentMethodSubView';
import { CheckoutSubView } from '@/pages/settings/subviews/CheckoutSubView';
import { PlansSubView } from '@/pages/settings/subviews/PlansSubView';
import { RedeemCodeSubView } from '@/pages/settings/subviews/RedeemCodeSubView';
import { ParentalControlSubView } from '@/pages/settings/subviews/ParentalControlSubView';
import { AddProfileSubView } from '@/pages/settings/subviews/AddProfileSubView';
import {
  ChangePasswordSubView,
  TwoFactorSubView,
  PasskeysSubView,
  SignOutAllSubView,
} from '@/pages/settings/subviews/SecuritySubViews';
import { PlanSuccessSubView } from '@/pages/settings/subviews/PlanSuccessSubView';

const Settings: React.FC<{ onBack: () => void; initialTab?: string; initialSubView?: string }> = ({
  onBack,
  initialTab,
  initialSubView,
}) => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { setEnabled } = useSpatialNav();
  useEffect(() => {
    setEnabled(false);
    return () => setEnabled(true);
  }, [setEnabled]);

  const [activeTab, setActiveTab] = useState(initialTab || 'profiles');
  const [currentSubView, setCurrentSubView] = useState<string | null>(initialSubView || null);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
    if (initialSubView) setCurrentSubView(initialSubView);
  }, [initialTab, initialSubView]);

  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [_subscription, setSubscription] = useState<Subscription | null>(null);
  const [_paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [profiles, setProfiles] = useState<UserProfileDB[]>([]);

  const [currentPlanId, setCurrentPlanId] = useState('premium');
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);

  const [cardNumber, setCardNumber] = useState('•••• •••• •••• 4412');
  const [cardHolder, setCardHolder] = useState('FABRICIO SILVA');
  const [cardExpiry, setCardExpiry] = useState('12/28');

  const DEFAULT_PLANS = [
    {
      id: 'basic',
      name: 'Basic',
      price: 'R$ 25,90',
      quality: 'HD (720p)',
      screens: '1 tela',
      features: ['Downloads limitados', 'Com anúncios leves', 'Som Estéreo'],
      color: 'bg-zinc-600',
      deviceLimit: 1,
    },
    {
      id: 'standard',
      name: 'Standard',
      price: 'R$ 44,90',
      quality: 'Full HD (1080p)',
      screens: '2 telas',
      features: ['Downloads ilimitados', 'Sem anúncios', 'Som Surround 5.1'],
      color: 'bg-blue-600',
      deviceLimit: 2,
    },
    {
      id: 'premium',
      name: 'Premium Spatial',
      price: 'R$ 59,90',
      quality: 'Spatial 4K + Vision',
      screens: '4 telas',
      features: [
        '4 telas simultâneas',
        'Downloads ilimitados',
        'Sem anúncios',
        'Spatial Audio Experience',
      ],
      color: 'bg-red-600',
      deviceLimit: 3,
    },
  ];

  useEffect(() => {
    if (!userId) {
      setPlans(DEFAULT_PLANS as any);
      setSubscription(null);
      setPaymentMethods([]);
      setDevices([
        {
          id: '1',
          name: 'Apple Vision Pro',
          type: 'Spatial Computer',
          icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
          last_active: new Date().toISOString(),
          is_current_session: true,
        },
      ]);
      setProfiles([
        { id: '1', name: 'FABRICIO', avatar_color: 'bg-blue-600', is_kids: false },
        { id: '2', name: 'Infantil', avatar_color: 'bg-green-600', is_kids: true },
      ]);
      setUserSettings(null);
      return;
    }

    const loadData = async () => {
      try {
        const [p, sub, methods, devs, profs, settings] = await Promise.all([
          getAllPlans(),
          getUserSubscription(userId),
          getPaymentMethods(userId),
          getUserDevices(userId),
          getUserProfiles(userId),
          getUserSettings(userId),
        ]);

        setPlans(p.length > 0 ? p : (DEFAULT_PLANS as any));
        setSubscription(sub);
        setPaymentMethods(methods);
        setDevices(
          devs.length > 0
            ? devs
            : [
                {
                  id: '1',
                  name: 'Apple Vision Pro',
                  type: 'Spatial Computer',
                  icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
                  last_active: new Date().toISOString(),
                  is_current_session: true,
                },
              ]
        );
        setProfiles(
          profs.length > 0
            ? profs
            : [
                { id: '1', name: 'FABRICIO', avatar_color: 'bg-blue-600', is_kids: false },
                { id: '2', name: 'Infantil', avatar_color: 'bg-green-600', is_kids: true },
              ]
        );
        setUserSettings(
          settings || {
            id: '1',
            user_id: userId,
            email: user?.email || '',
            name: user?.user_metadata?.name || user?.email || 'Usuário',
            two_factor_enabled: true,
          }
        );

        if (sub?.plan_id) setCurrentPlanId(sub.plan_id);
      } catch (err) {
        logger.error('Error loading settings:', err);
        setPlans(DEFAULT_PLANS as any);
        setUserSettings({
          id: '1',
          user_id: userId,
          email: user?.email || '',
          name: user?.user_metadata?.name || user?.email || 'Usuário',
          two_factor_enabled: true,
        });
        setProfiles([
          { id: '1', name: 'FABRICIO', avatar_color: 'bg-blue-600', is_kids: false },
          { id: '2', name: 'Infantil', avatar_color: 'bg-green-600', is_kids: true },
        ]);
        setDevices([
          {
            id: '1',
            name: 'Apple Vision Pro',
            type: 'Spatial Computer',
            icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
            last_active: new Date().toISOString(),
            is_current_session: true,
          },
        ]);
      }
    };
    loadData();
  }, [userId, user?.email, user?.user_metadata?.name]);

  const currentPlan = (plans.find((p) => p.id === currentPlanId) ||
    plans[2] ||
    DEFAULT_PLANS[2]) as any;
  const pendingPlan = (plans.find((p) => p.id === pendingPlanId) || null) as any;

  const handleRemoveDevice = async (id: string) => {
    setDevices((prev) => prev.filter((d) => d.id !== id));
    await apiRemoveDevice(id);
  };

  const handleAddDevice = async () => {
    if (!userId) return;
    if (devices.length >= currentPlan.deviceLimit) {
      showToast(
        `Limite de aparelhos atingido para o plano ${currentPlan.name}. Por favor, remova um dispositivo ou faça upgrade do plano.`,
        'warning'
      );
      return;
    }
    const pool = [
      {
        name: 'Apple TV 4K',
        type: 'Set-top Box',
        icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
      },
      { name: 'PlayStation 5', type: 'Console', icon: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      {
        name: 'iPad Pro M4',
        type: 'Tablet',
        icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
      },
      {
        name: 'MacBook Air',
        type: 'Laptop',
        icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
      },
    ];
    const random = pool[Math.floor(Math.random() * pool.length)];
    const newDevice = await apiAddDevice({
      user_id: userId,
      name: random.name,
      type: random.type,
      icon: random.icon,
      is_current_session: false,
    });
    if (newDevice) setDevices((prev) => [...prev, newDevice]);
  };

  const menuItems = [
    {
      id: 'overview',
      label: 'Visão geral',
      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    },
    {
      id: 'subscription',
      label: 'Assinatura',
      icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
    },
    {
      id: 'security',
      label: 'Segurança',
      icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    },
    {
      id: 'devices',
      label: 'Aparelhos',
      icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
    },
    {
      id: 'profiles',
      label: 'Perfis',
      icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    },
  ];

  const handleTabChange = (id: string) => {
    playSelectSound();
    setActiveTab(id);
    setCurrentSubView(null);
  };

  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [focusedMenuIdx, setFocusedMenuIdx] = useState(-1);

  const isInsideMain = () => {
    const active = document.activeElement as HTMLElement | null;
    return !!(active && mainRef.current?.contains(active));
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const key = normalizeRemoteKey(e);

      if (key === 'Escape' || key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        playBackSound();
        if (currentSubView) {
          setCurrentSubView(null);
        } else {
          onBack();
        }
        return;
      }

      // ArrowLeft from main content → return focus to sidebar
      if (key === 'ArrowLeft' && isInsideMain()) {
        e.preventDefault();
        const idx =
          focusedMenuIdx >= 0 ? focusedMenuIdx : menuItems.findIndex((m) => m.id === activeTab);
        const target =
          sidebarRef.current?.querySelectorAll<HTMLButtonElement>('[data-settings-nav]')?.[
            idx >= 0 ? idx : 0
          ];
        if (target) {
          target.focus();
          setFocusedMenuIdx(idx >= 0 ? idx : 0);
          playNavigateSound();
        }
        return;
      }

      if (!currentSubView) {
        if (key === 'ArrowDown') {
          e.preventDefault();
          if (isInsideMain()) {
            // Navigate between focusable items in main content
            const items = Array.from(
              mainRef.current?.querySelectorAll<HTMLElement>('[tabindex="0"]') ?? []
            );
            const idx = items.indexOf(document.activeElement as HTMLElement);
            const next = items[idx + 1];
            if (next) {
              playNavigateSound();
              next.focus();
            }
          } else {
            const next = Math.min(focusedMenuIdx + 1, menuItems.length - 1);
            if (next !== focusedMenuIdx) {
              playNavigateSound();
              setFocusedMenuIdx(next);
              sidebarRef.current
                ?.querySelectorAll<HTMLButtonElement>('[data-settings-nav]')
                ?.[next]?.focus();
            }
          }
        } else if (key === 'ArrowUp') {
          e.preventDefault();
          if (isInsideMain()) {
            const items = Array.from(
              mainRef.current?.querySelectorAll<HTMLElement>('[tabindex="0"]') ?? []
            );
            const idx = items.indexOf(document.activeElement as HTMLElement);
            const prev = items[idx - 1];
            if (prev) {
              playNavigateSound();
              prev.focus();
            }
          } else {
            const prev = Math.max(focusedMenuIdx - 1, 0);
            if (prev !== focusedMenuIdx) {
              playNavigateSound();
              setFocusedMenuIdx(prev);
              sidebarRef.current
                ?.querySelectorAll<HTMLButtonElement>('[data-settings-nav]')
                ?.[prev]?.focus();
            }
          }
        } else if (key === 'ArrowRight' && focusedMenuIdx >= 0 && !isInsideMain()) {
          // Move focus from sidebar → first item in main content
          e.preventDefault();
          const firstItem = mainRef.current?.querySelector<HTMLElement>('[tabindex="0"]');
          if (firstItem) {
            playNavigateSound();
            firstItem.focus();
            setFocusedMenuIdx(-1);
          }
        } else if (key === 'Enter' && focusedMenuIdx >= 0) {
          e.preventDefault();
          handleTabChange(menuItems[focusedMenuIdx].id);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentSubView, focusedMenuIdx, menuItems, onBack, activeTab]);

  const renderContent = () => {
    if (currentSubView) {
      switch (currentSubView) {
        case 'payment-method':
          return (
            <PaymentMethodSubView
              setCurrentSubView={setCurrentSubView}
              cardNumber={cardNumber}
              setCardNumber={setCardNumber}
              cardHolder={cardHolder}
              setCardHolder={setCardHolder}
              cardExpiry={cardExpiry}
              setCardExpiry={setCardExpiry}
            />
          );
        case 'checkout':
          return (
            <CheckoutSubView
              userSettings={userSettings}
              pendingPlan={pendingPlan}
              pendingPlanId={pendingPlanId || 'premium'}
              cardNumber={cardNumber}
              setCurrentSubView={setCurrentSubView}
              setCurrentPlanId={setCurrentPlanId}
            />
          );
        case 'change-plan':
          return (
            <PlansSubView
              plans={plans}
              currentPlanId={currentPlanId}
              setPendingPlanId={setPendingPlanId}
              setCurrentSubView={setCurrentSubView}
            />
          );
        case 'redeem-code':
          return <RedeemCodeSubView setCurrentSubView={setCurrentSubView} />;
        case 'plan-success':
          return (
            <PlanSuccessSubView
              currentPlan={currentPlan}
              setCurrentSubView={setCurrentSubView}
              setActiveTab={setActiveTab}
            />
          );
        case 'parental-control':
          return <ParentalControlSubView setCurrentSubView={setCurrentSubView} />;
        case 'add-profile':
          return (
            <AddProfileSubView
              setCurrentSubView={setCurrentSubView}
              setProfiles={setProfiles}
              userId={userId}
            />
          );
        case 'change-password':
          return <ChangePasswordSubView setCurrentSubView={setCurrentSubView} />;
        case 'two-factor':
          return (
            <TwoFactorSubView setCurrentSubView={setCurrentSubView} userSettings={userSettings} />
          );
        case 'passkeys':
          return <PasskeysSubView setCurrentSubView={setCurrentSubView} />;
        case 'sign-out-all':
          return (
            <SignOutAllSubView setCurrentSubView={setCurrentSubView} userSettings={userSettings} />
          );
        default:
          return null;
      }
    }

    switch (activeTab) {
      case 'overview':
        return (
          <OverviewTab
            userSettings={userSettings}
            currentPlanId={currentPlanId}
            currentPlan={currentPlan}
            devices={devices}
            cardNumber={cardNumber}
          />
        );
      case 'subscription':
        return (
          <SubscriptionTab
            currentPlan={currentPlan}
            currentPlanId={currentPlanId}
            setCurrentSubView={setCurrentSubView}
            cardNumber={cardNumber}
            cardExpiry={cardExpiry}
          />
        );
      case 'security':
        return <SecurityTab userSettings={userSettings} setCurrentSubView={setCurrentSubView} />;
      case 'devices':
        return (
          <DevicesTab
            devices={devices}
            currentPlan={currentPlan}
            handleAddDevice={handleAddDevice}
            handleRemoveDevice={handleRemoveDevice}
          />
        );
      case 'profiles':
      default:
        return (
          <ProfilesTab
            profiles={profiles}
            setCurrentSubView={setCurrentSubView}
            prepareAddProfile={() => setCurrentSubView('add-profile')}
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in duration-500 overflow-hidden">
      {/* visionOS ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_20%_30%,rgba(109,40,217,0.25),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_85%_70%,rgba(76,29,149,0.2),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.5)_0%,rgba(2,6,23,0.85)_100%)]" />
      </div>

      {/* Sidebar — visionOS floating panel */}
      <aside
        ref={sidebarRef}
        aria-label="Painel de configurações"
        className="relative flex flex-col w-[72px] lg:w-[240px] xl:w-[260px] shrink-0 m-3 lg:m-4 xl:m-5 transition-all duration-300"
      >
        <div className="flex flex-col flex-1 rounded-[1.4rem] lg:rounded-[1.8rem] xl:rounded-[2rem] border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04),inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden">
          {/* Back button */}
          <button
            onClick={() => {
              playBackSound();
              onBack();
            }}
            tabIndex={0}
            aria-label="Voltar ao app"
            className="flex items-center justify-center lg:justify-start gap-3 px-3 lg:px-5 py-4 lg:py-5 hover:bg-white/[0.06] transition-all group border-b border-white/[0.06] outline-none focus:ring-2 focus:ring-violet-400/60 focus:ring-inset focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-inset"
          >
            <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-2xl bg-white/[0.06] flex items-center justify-center group-hover:bg-violet-600/40 group-focus-visible:bg-violet-600/40 transition-all shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
              <svg
                className="w-4 h-4 text-white/70 group-hover:text-white transition-colors"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </div>
            <span
              className="hidden lg:block text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 group-hover:text-white/70 transition-colors truncate"
              aria-hidden="true"
            >
              Voltar
            </span>
          </button>

          {/* Navigation items */}
          <nav
            aria-label="Seções de configuração"
            className="flex-1 flex flex-col gap-1 p-2 lg:p-3 overflow-y-auto scrollbar-none"
          >
            {menuItems.map((item) => (
              <button
                key={item.id}
                data-settings-nav
                tabIndex={0}
                onClick={() => handleTabChange(item.id)}
                aria-current={activeTab === item.id ? 'page' : undefined}
                aria-label={item.label}
                className={`relative flex items-center justify-center lg:justify-start gap-3 lg:gap-3.5 px-3 lg:px-4 py-3 lg:py-3.5 rounded-2xl transition-all duration-200 outline-none group focus:ring-2 focus:ring-violet-400/60 focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                  activeTab === item.id
                    ? 'bg-white/[0.1] text-white shadow-[0_2px_12px_rgba(139,92,246,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]'
                    : 'text-white/50 hover:bg-white/[0.05] hover:text-white/75 focus-visible:bg-white/[0.06] focus-visible:text-white/75'
                }`}
              >
                {activeTab === item.id && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.5)]"
                    aria-hidden="true"
                  />
                )}
                <div
                  className={`w-9 h-9 lg:w-10 lg:h-10 rounded-xl lg:rounded-[0.85rem] flex items-center justify-center shrink-0 transition-all duration-200 ${
                    activeTab === item.id
                      ? 'bg-violet-600/30 text-white shadow-[0_0_12px_rgba(139,92,246,0.25)]'
                      : 'bg-white/[0.04] group-hover:bg-white/[0.08]'
                  }`}
                >
                  <svg
                    className="w-[18px] h-[18px]"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                      d={item.icon}
                    />
                  </svg>
                </div>
                <span
                  className="hidden lg:block text-[11px] font-semibold tracking-wide truncate"
                  aria-hidden="true"
                >
                  {item.label}
                </span>
              </button>
            ))}
          </nav>

          {/* Settings footer badge */}
          <div className="border-t border-white/[0.06] px-3 lg:px-5 py-3 lg:py-4 flex items-center justify-center lg:justify-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/40 to-purple-700/30 flex items-center justify-center shrink-0">
              <svg
                className="w-3.5 h-3.5 text-violet-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <span className="hidden lg:block text-[9px] font-bold uppercase tracking-[0.25em] text-white/20">
              Configurações
            </span>
          </div>
        </div>
      </aside>

      {/* Main content — fills remaining horizontal space */}
      <main
        ref={mainRef}
        className="flex-1 flex flex-col min-w-0 m-3 ml-0 lg:m-4 lg:ml-0 xl:m-5 xl:ml-0"
      >
        <div className="flex-1 rounded-[1.4rem] lg:rounded-[1.8rem] xl:rounded-[2rem] border border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04),inset_0_1px_0_rgba(255,255,255,0.06)] overflow-y-auto overflow-x-hidden scrollbar-none">
          <div className="p-5 lg:p-7 xl:p-9 min-h-full">{renderContent()}</div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
