import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthService } from '../utils/auth';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Validation
    if (!formData.name || !formData.email || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setPending(true);

    try {
      const result = await AuthService.register(
        formData.name,
        formData.email,
        formData.password
      );

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          navigate('/dashboard');
        }, 900);
      } else {
        setError(result.error);
      }
    } catch (registerError) {
      setError(
        registerError?.message ||
          'The account could not be created in this browser.'
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent-soft via-surface to-info-soft flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl mb-4">
            <span className="text-ink-inverse font-bold text-3xl">C</span>
          </Link>
          <h1 className="text-4xl font-bold text-ink mb-2">
            Join CrushLearn <span className="text-primary-600">AI</span>
          </h1>
          <p className="text-ink-muted">
            Start your learning journey today
          </p>
        </div>

        {/* Registration Card */}
        <div className="bg-surface rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-ink mb-6">Create Account</h2>

          {error && (
            <div className="mb-4 p-3 bg-danger-soft border border-danger/40 rounded-lg text-danger text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-success-soft border border-success/40 rounded-lg text-success text-sm">
              Account created! Redirecting to dashboard...
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-muted mb-2">
                Full Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-line rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="John Doe"
                required
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
                className="w-full px-4 py-3 border border-line rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-muted mb-2">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-line rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="••••••••"
                required
              />
              <p className="text-xs text-ink-subtle mt-1">
                Must be at least 8 characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-muted mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-line rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="w-full bg-accent text-ink-inverse py-3 rounded-lg font-semibold hover:bg-accent-strong transition shadow-lg hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          {/* Sign In Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-ink-muted">
              Already have an account?{' '}
              <Link to="/" className="text-primary-600 hover:text-primary-700 font-semibold">
                Sign In
              </Link>
            </p>
          </div>

          {/* Info */}
          <p className="mt-6 text-center text-sm text-ink-subtle">
            Your account and all learning data stay in this browser. Nothing is
            sent to a server.
          </p>
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl mb-1">📚</div>
            <p className="text-xs text-ink-muted">Expert Courses</p>
          </div>
          <div>
            <div className="text-2xl mb-1">🧭</div>
            <p className="text-xs text-ink-muted">Study Tools</p>
          </div>
          <div>
            <div className="text-2xl mb-1">🎓</div>
            <p className="text-xs text-ink-muted">Certificates</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
