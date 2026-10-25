import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { AuthService } from '../utils/auth';
import ThemeToggle from './ThemeToggle';

const OFFLINE_MODE_KEY = 'offline_mode';

const PRIMARY_NAV_LINKS = [
  { to: '/skill-passport', label: 'Skill Passport' },
  { to: '/notebooks', label: 'Notebooks' },
  { to: '/visual', label: 'Visual' },
  { to: '/review', label: 'Review' },
  { to: '/settings', label: 'Settings' },
  { to: '/about', label: 'About' },
];

const primaryLinkClass = ({ isActive }) =>
  `hidden whitespace-nowrap text-sm font-medium transition-colors xl:block ${
    isActive ? 'text-accent' : 'text-ink-muted hover:text-ink'
  }`;

const Navbar = () => {
  const navigate = useNavigate();
  const user = AuthService.getCurrentUser();
  const [offlineMode, setOfflineMode] = useState(
    localStorage.getItem(OFFLINE_MODE_KEY) === 'true'
  );
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === OFFLINE_MODE_KEY) {
        setOfflineMode(event.newValue === 'true');
      }
    };

    const handleLocalToggle = () => {
      setOfflineMode(localStorage.getItem(OFFLINE_MODE_KEY) === 'true');
    };

    const handleNavigationState = (event) => {
      setNavigationOpen(Boolean(event.detail?.open));
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('offline-mode-change', handleLocalToggle);
    window.addEventListener('crushlearn-navigation-state', handleNavigationState);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('offline-mode-change', handleLocalToggle);
      window.removeEventListener(
        'crushlearn-navigation-state',
        handleNavigationState
      );
    };
  }, []);

  const toggleNavigation = () => {
    const next = !navigationOpen;
    setNavigationOpen(next);
    window.dispatchEvent(
      new CustomEvent('crushlearn-navigation', { detail: { open: next } })
    );
  };

  const handleLogout = () => {
    AuthService.logout();
    navigate('/');
  };

  const handleOfflineToggle = () => {
    const nextValue = !offlineMode;
    localStorage.setItem(OFFLINE_MODE_KEY, nextValue ? 'true' : 'false');
    setOfflineMode(nextValue);
    window.dispatchEvent(new Event('offline-mode-change'));
  };

  return (
    <nav className="bg-surface shadow-sm border-b border-line fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 2xl:max-w-[1440px]">
        <div className="flex justify-between items-center h-16">
          <div className="flex min-w-0 items-center gap-2">
            {user ? (
              <button
                id="app-navigation-trigger"
                type="button"
                onClick={toggleNavigation}
                aria-expanded={navigationOpen}
                aria-controls="app-mobile-navigation"
                aria-label={navigationOpen ? 'Close navigation' : 'Open navigation'}
                className="rounded-lg border border-line px-2.5 py-2 text-ink-muted hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 lg:hidden"
              >
                <span aria-hidden="true" className="block text-base leading-none">
                  {navigationOpen ? '✕' : '☰'}
                </span>
              </button>
            ) : null}
            <Link
              to="/dashboard"
              className="flex min-w-0 items-center space-x-2"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-600 to-primary-800">
                <span className="text-lg font-bold text-ink-inverse">C</span>
              </div>
              <span className="hidden whitespace-nowrap text-xl font-bold text-ink sm:inline">
                CrushLearn <span className="text-primary-600">AI</span>
              </span>
              <span className="sr-only sm:hidden">CrushLearn AI home</span>
            </Link>
          </div>

          <div className="flex shrink-0 items-center space-x-2 sm:space-x-4">
            {user ? (
              <>
                {PRIMARY_NAV_LINKS.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={primaryLinkClass}
                  >
                    {link.label}
                  </NavLink>
                ))}

                {offlineMode ? (
                  <span className="hidden whitespace-nowrap text-sm font-medium text-ink-subtle 2xl:block">
                    Final Skill Check
                  </span>
                ) : (
                  <NavLink
                    to="/final-skill-check"
                    className={({ isActive }) =>
                      `hidden whitespace-nowrap text-sm font-medium transition-colors 2xl:block ${
                        isActive
                          ? 'text-accent'
                          : 'text-ink-muted hover:text-ink'
                      }`
                    }
                  >
                    Final Skill Check
                  </NavLink>
                )}

                <ThemeToggle />

                <div className="hidden sm:flex items-center space-x-2">
                  <span className="text-xs text-ink-subtle">Offline</span>
                  <button
                    type="button"
                    onClick={handleOfflineToggle}
                    className={`w-10 h-5 rounded-full border border-line ${
                      offlineMode ? 'bg-ink' : 'bg-line'
                    }`}
                    aria-pressed={offlineMode}
                    aria-label="Toggle offline mode"
                  >
                    <span
                      className={`block w-4 h-4 bg-surface rounded-full ${
                        offlineMode ? 'ml-5' : 'ml-1'
                      }`}
                    />
                  </button>
                </div>
                
                <Link to="/profile" className="flex items-center space-x-3">
                  <div className="hidden sm:block text-right">
                    <p className="text-sm font-medium text-ink">{user.name}</p>
                    <p className="text-xs text-ink-subtle">{user.email}</p>
                  </div>
                  
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-primary-700 font-semibold">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </Link>

                <button
                  onClick={handleLogout}
                  className="hidden px-2 py-2 text-sm font-medium text-ink-muted sm:block sm:px-4"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                to="/"
                className="px-4 py-2 bg-accent text-ink-inverse rounded-lg font-medium"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>

      {offlineMode && (
        <div className="border-t border-line bg-line-subtle">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
            <p className="text-sm text-ink-muted">
              Offline Mode Enabled. Demo only with limited functionality.
            </p>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
