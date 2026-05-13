import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Database,
  DollarSign,
  Film,
  Key,
  LayoutDashboard,
  LogOut,
  MonitorPlay,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TestTube,
  Tv,
  UserPlus,
  Users,
  Waves,
} from 'lucide-react';
import AdminVisionAmbient from '@/components/admin/AdminVisionAmbient';
import { useAuth } from '@/contexts/AuthContext';
import '@/styles/admin-vision.css';

const NAV_ITEMS = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/subscribers', label: 'Assinantes', icon: Users },
  { path: '/admin/finance', label: 'Financeiro', icon: DollarSign },
  { path: '/admin/iptv', label: 'IPTV', icon: Tv },
  { path: '/admin/vod', label: 'VOD', icon: Film },
  { path: '/admin/resellers', label: 'Revendedores', icon: UserPlus },
  { path: '/admin/access-codes', label: 'Códigos de Acesso', icon: Key },
  { path: '/admin/security', label: 'Segurança', icon: ShieldAlert },
  { path: '/admin/ingestion', label: 'Ingestão', icon: Database },
  { path: '/admin/catalog', label: 'Catálogo', icon: Film },
  { path: '/admin/stream-test', label: 'Stream Test', icon: TestTube },
  { path: '/admin/settings', label: 'Config', icon: Settings },
];

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = React.useState(false);

  const activeItem =
    NAV_ITEMS.find((item) => location.pathname === item.path) ??
    NAV_ITEMS.find((item) => location.pathname.startsWith(item.path)) ??
    NAV_ITEMS[0];

  const primaryNav = useMemo(
    () =>
      NAV_ITEMS.filter((item) =>
        [
          '/admin',
          '/admin/subscribers',
          '/admin/iptv',
          '/admin/vod',
          '/admin/access-codes',
        ].includes(item.path)
      ),
    []
  );

  const libraryNav = useMemo(
    () => NAV_ITEMS.filter((item) => !primaryNav.some((navItem) => navItem.path === item.path)),
    [primaryNav]
  );

  const dockItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) =>
        [
          '/admin',
          '/admin/finance',
          '/admin/security',
          '/admin/settings',
          '/admin/catalog',
        ].includes(item.path)
      ),
    []
  );

  const currentDateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'short',
      }).format(new Date()),
    []
  );

  const handleAdminLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate('/', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="admin-vision">
      <AdminVisionAmbient />

      <div className="admin-vision__layout">
        <section className="admin-vision__board">
          <aside className="admin-vision__sidebar" aria-label="Navegação administrativa">
            <div className="admin-vision__window-controls" aria-hidden="true">
              <span className="is-red" />
              <span className="is-yellow" />
              <span className="is-green" />
            </div>

            <div className="admin-vision__brand">
              <div className="admin-vision__brand-mark">
                <MonitorPlay size={22} color="#fff" />
              </div>
              <div className="admin-vision__brand-copy">
                <strong>RED X</strong>
                <span>Painel de Controle</span>
              </div>
            </div>

            <div className="admin-vision__search-shell">
              <Search size={15} />
              <span>Buscar no painel...</span>
            </div>

            <div className="admin-vision__sidebar-group">
              <div className="admin-vision__sidebar-caption">
                <span>Principal</span>
              </div>

              <nav className="admin-vision__sidebar-list">
                {primaryNav.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => navigate(item.path)}
                      className={`admin-vision__sidebar-button ${active ? 'is-active' : ''}`}
                    >
                      <item.icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="admin-vision__sidebar-group">
              <div className="admin-vision__sidebar-caption">
                <span>Ferramentas</span>
              </div>

              <nav className="admin-vision__sidebar-list admin-vision__sidebar-list--compact">
                {libraryNav.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => navigate(item.path)}
                      className={`admin-vision__sidebar-button ${active ? 'is-active' : ''}`}
                    >
                      <item.icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="admin-vision__profile-chip"
            >
              <div className="admin-vision__profile-avatar">
                <ShieldCheck size={18} />
              </div>
              <div className="admin-vision__profile-copy">
                <strong>Voltar ao app</strong>
                <span>Sair do painel</span>
              </div>
              <ArrowLeft size={16} />
            </button>
          </aside>

          <div className="admin-vision__main">
            <div className="admin-vision__toolbar">
              <div className="admin-vision__toolbar-leading">
                <div className="admin-vision__toolbar-arrows">
                  <button type="button" aria-label="Voltar visualmente">
                    <ChevronLeft size={18} />
                  </button>
                  <button type="button" aria-label="Avançar visualmente">
                    <ChevronRight size={18} />
                  </button>
                </div>

                <div className="admin-vision__toolbar-copy">
                  <span>Admin / RedX</span>
                  <strong>{activeItem.label}</strong>
                </div>
              </div>

              <div className="admin-vision__toolbar-actions">
                <div className="admin-vision__chip">
                  <Sparkles size={16} />
                  Premium
                </div>
                <div className="admin-vision__chip">
                  <CalendarDays size={16} />
                  {currentDateLabel}
                </div>
                <div className="admin-vision__chip">
                  <span className="admin-vision__pulse" />
                  Live Sync
                </div>
                <div className="admin-vision__chip admin-vision__chip--wave">
                  <Waves size={16} />
                  Analytics
                </div>
                <button
                  type="button"
                  onClick={handleAdminLogout}
                  disabled={signingOut}
                  className="admin-vision__chip admin-vision__chip-button admin-vision__chip--logout"
                >
                  <LogOut size={16} />
                  {signingOut ? 'Saindo...' : 'Sair'}
                </button>
                <div className="admin-vision__chip admin-vision__chip-avatar">
                  <div className="admin-vision__mini-graph">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            </div>

            <main className="admin-vision__content">{children}</main>

            <nav className="admin-vision__dock" aria-label="Atalhos do admin">
              {dockItems.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className={`admin-vision__dock-button ${active ? 'is-active' : ''}`}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminLayout;
