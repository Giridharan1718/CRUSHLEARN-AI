import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthService } from '../utils/auth';

const OFFLINE_MODE_KEY = 'offline_mode';

const Navbar = () => {
  const navigate = useNavigate();
  const user = AuthService.getCurrentUser();
  const [offlineMode, setOfflineMode] = useState(
    localStorage.getItem(OFFLINE_MODE_KEY) === 'true'
  );

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === OFFLINE_MODE_KEY) {
        setOfflineMode(event.newValue === 'true');
      }
    };

    const handleLocalToggle = () => {
      setOfflineMode(localStorage.getItem(OFFLINE_MODE_KEY) === 'true');
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('offline-mode-change', handleLocalToggle);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('offline-mode-change', handleLocalToggle);
    };
  }, []);

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
    <nav className="bg-white shadow-sm border-b border-gray-200 fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/dashboard" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="text-xl font-bold text-gray-900">
              CrushLearn <span className="text-primary-600">AI</span>
            </span>
          </Link>

          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <Link
                  to="/skill-passport"
                  className="hidden sm:block text-gray-700 font-medium"
                >
                  Skill Passport
                </Link>

                <Link
                  to="/about"
                  className="hidden sm:block text-gray-700 font-medium"
                >
                  About
                </Link>

                {offlineMode ? (
                  <span className="hidden sm:block text-gray-400 font-medium">
                    Final Skill Check
                  </span>
                ) : (
                  <Link
                    to="/final-skill-check"
                    className="hidden sm:block text-gray-700 font-medium"
                  >
                    Final Skill Check
                  </Link>
                )}

                <div className="hidden sm:flex items-center space-x-2">
                  <span className="text-xs text-gray-500">Offline</span>
                  <button
                    type="button"
                    onClick={handleOfflineToggle}
                    className={`w-10 h-5 rounded-full border border-gray-300 ${
                      offlineMode ? 'bg-gray-900' : 'bg-gray-200'
                    }`}
                    aria-pressed={offlineMode}
                    aria-label="Toggle offline mode"
                  >
                    <span
                      className={`block w-4 h-4 bg-white rounded-full ${
                        offlineMode ? 'ml-5' : 'ml-1'
                      }`}
                    />
                  </button>
                </div>
                
                <Link to="/profile" className="flex items-center space-x-3">
                  <div className="hidden sm:block text-right">
                    <p className="text-sm font-medium text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                  
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-primary-700 font-semibold">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </Link>

                <button
                  onClick={handleLogout}
                  className="px-4 py-2 text-sm font-medium text-gray-700"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                to="/"
                className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>

      {offlineMode && (
        <div className="border-t border-gray-200 bg-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
            <p className="text-sm text-gray-700">
              Offline Mode Enabled. Demo only with limited functionality.
            </p>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
