import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthService } from '../utils/auth';
import { courses } from '../data/mockCourseData';
import { countCompletedLessons } from '../utils/lessonProgress.mjs';
import { getActivitySummary } from '../utils/learningActivity.mjs';
import { readSettings, writeSettings } from '../utils/settingsStore.mjs';

const Profile = () => {
  const user = AuthService.getCurrentUser();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(() => readSettings());

  const updateSetting = (patch) => {
    const result = writeSettings(patch);
    if (result.ok) {
      setSettings(result.settings);
    }
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      navigate('/');
    }
  }, [user, navigate]);

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    bio: user?.bio || '',
    learningGoal: user?.learningGoal || '',
  });

  const [isEditing, setIsEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  // The streak is derived from the learner's own dated activity.
  const activity = getActivitySummary();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setPending(true);

    // The address is the account's identity, so it is changed through the
    // account store, which checks it and refuses a collision.
    const emailChanged =
      formData.email.trim().toLowerCase() !== (user?.email || '').toLowerCase();

    if (emailChanged) {
      const result = await AuthService.updateEmail(formData.email);
      if (!result.success) {
        setError(result.error || 'The email address could not be changed.');
        setPending(false);
        return;
      }
    }

    AuthService.updateUser({
      name: formData.name,
      bio: formData.bio,
      learningGoal: formData.learningGoal,
    });

    setIsEditing(false);
    setSaved(true);
    setPending(false);

    setTimeout(() => {
      setSaved(false);
    }, 3000);
  };

  // Don't render if user is not logged in
  if (!user) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink mb-2">Profile Settings</h1>
        <p className="text-ink-muted">Manage your account and preferences</p>
      </div>

      {saved && (
        <div className="mb-6 p-4 bg-success-soft border border-success/40 rounded-lg text-success">
          ✓ Profile updated successfully!
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-6 p-4 bg-danger-soft border border-danger/40 rounded-lg text-danger"
        >
          {error}
        </div>
      )}

      {/* Profile Card */}
      <div className="bg-surface rounded-2xl shadow-lg p-8 mb-6">
        <div className="flex items-center space-x-6 mb-8">
          {/* Avatar */}
          <div className="w-24 h-24 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
            <span className="text-ink-inverse font-bold text-4xl">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>

          <div className="flex-1">
            <h2 className="text-2xl font-bold text-ink">{user.name}</h2>
            <p className="text-ink-muted">{user.email}</p>
            <div className="mt-2 flex items-center space-x-4">
              <span className="px-3 py-1 bg-primary-100 text-primary-700 text-sm font-semibold rounded-full">
                Learner
              </span>
              {user.createdAt && (
                <span className="text-sm text-ink-subtle">
                  Member since {new Date(user.createdAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-line-subtle text-ink-muted rounded-lg hover:bg-line font-medium transition"
            >
              Edit Profile
            </button>
          )}
        </div>

        {/* Profile Form */}
        <form onSubmit={handleSave}>
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-ink-muted mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  disabled={!isEditing}
                  className="w-full px-4 py-3 border border-line rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition disabled:bg-line-subtle disabled:text-ink-subtle"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-muted mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={!isEditing}
                  className="w-full px-4 py-3 border border-line rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition disabled:bg-line-subtle disabled:text-ink-subtle"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-muted mb-2">
                Bio
              </label>
              <textarea
                name="bio"
                value={formData.bio}
                onChange={handleChange}
                disabled={!isEditing}
                rows="3"
                className="w-full px-4 py-3 border border-line rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition disabled:bg-line-subtle disabled:text-ink-subtle"
                placeholder="Tell us about yourself..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-muted mb-2">
                Learning Goal
              </label>
              <input
                type="text"
                name="learningGoal"
                value={formData.learningGoal}
                onChange={handleChange}
                disabled={!isEditing}
                className="w-full px-4 py-3 border border-line rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition disabled:bg-line-subtle disabled:text-ink-subtle"
                placeholder="What do you want to achieve?"
              />
            </div>

            {isEditing && (
              <div className="flex items-center space-x-4">
                <button
                  type="submit"
                  disabled={pending}
                  className="px-6 py-3 bg-accent text-ink-inverse rounded-lg hover:bg-accent-strong font-semibold transition disabled:opacity-50"
                >
                  {pending ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-6 py-3 bg-line-subtle text-ink-muted rounded-lg hover:bg-line font-medium transition"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Account Stats */}
      <div className="grid md:grid-cols-3 gap-6 mb-6">
        <div className="bg-surface rounded-xl shadow-md p-6 text-center">
          <p className="text-3xl font-bold text-primary-600 mb-2">
            {user.enrolledCourses?.length || 0}
          </p>
          <p className="text-ink-muted">Courses Enrolled</p>
        </div>

        <div className="bg-surface rounded-xl shadow-md p-6 text-center">
          <p className="text-3xl font-bold text-success mb-2">
            {countCompletedLessons(user, courses)}
          </p>
          <p className="text-ink-muted">Lessons Completed</p>
        </div>

        <div className="bg-surface rounded-xl shadow-md p-6 text-center">
          <p className="text-3xl font-bold text-warning mb-2">
            {activity.streak === null ? '—' : activity.streak}
          </p>
          <p className="text-ink-muted">
            {activity.streak === null ? 'Day Streak (tracking off)' : 'Day Streak'}
          </p>
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-surface rounded-2xl shadow-lg p-8 mb-6">
        <h3 className="text-xl font-bold text-ink mb-6">Preferences</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-line-subtle rounded-lg">
            <div>
              <p className="font-semibold text-ink">Course Recommendations</p>
              <p className="text-sm text-ink-muted">
                Show rule-based course suggestions from local progress
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.showRecommendations}
                onChange={(event) =>
                  updateSetting({ showRecommendations: event.target.checked })
                }
              />
              <div className="w-11 h-6 bg-line peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface after:border-line after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-line-subtle rounded-lg">
            <div>
              <p className="font-semibold text-ink">Email Notifications</p>
              <p className="text-sm text-ink-muted">
                Not available — this app has no server to send email from
              </p>
            </div>
            <span className="text-xs font-semibold text-ink-subtle">Not connected</span>
          </div>

          <div className="flex items-center justify-between p-4 bg-line-subtle rounded-lg">
            <div>
              <p className="font-semibold text-ink">Daily Reminders</p>
              <p className="text-sm text-ink-muted">
                Not available — this app has no server to schedule reminders
              </p>
            </div>
            <span className="text-xs font-semibold text-ink-subtle">Not connected</span>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-surface rounded-2xl shadow-lg p-8 border-2 border-danger/40">
        <h3 className="text-xl font-bold text-danger mb-4">Danger Zone</h3>
        <p className="text-ink-muted mb-4">
          Deleting removes your account and every piece of learning data in this
          browser. Export your data first if you want to keep it. Settings has
          the export, import and delete controls.
        </p>
        <Link
          to="/settings"
          className="inline-block px-6 py-3 bg-danger text-ink-inverse rounded-lg hover:bg-danger-strong font-semibold transition"
        >
          Go to Settings
        </Link>
      </div>
    </div>
  );
};

export default Profile;
