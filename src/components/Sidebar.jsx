import { Link, useLocation } from 'react-router-dom';
import { AuthService } from '../utils/auth';

const Sidebar = () => {
  const location = useLocation();
  const user = AuthService.getCurrentUser();

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📚' },
    { path: '/skill-passport', label: 'Skill Passport', icon: '🎓' },
    { path: '/about', label: 'About', icon: 'ℹ️' },
    { path: '/profile', label: 'Profile', icon: '👤' },
  ];

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <aside className="hidden md:block w-64 bg-white border-r border-gray-200 fixed left-0 top-16 bottom-0 overflow-y-auto">
      <div className="p-4 space-y-2">
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Navigation
          </h3>
        </div>

        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition ${
              isActive(item.path)
                ? 'bg-primary-50 text-primary-700 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        {/* AI Guidance Section */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            AI Assistance
          </h3>
          
          <div className="bg-gradient-to-br from-primary-50 to-blue-50 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <span className="text-2xl">🤖</span>
              <div>
                <h4 className="font-semibold text-gray-900 text-sm mb-1">
                  AI Learning Coach
                </h4>
                <p className="text-xs text-gray-600">
                  Get personalized guidance and suggestions as you learn.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mt-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Progress
          </h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Courses Enrolled</span>
              <span className="font-semibold text-gray-900">
                {user?.enrolledCourses?.length || 0}
              </span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Lessons Completed</span>
              <span className="font-semibold text-primary-600">
                {user?.completedLessons?.length || 0}
              </span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Learning Streak</span>
              <span className="font-semibold text-orange-600">
                {user?.learningStreak || 0} 🔥
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
