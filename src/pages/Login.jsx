import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthService } from '../utils/auth';
import { DEMO_EMAIL, ensureDemoAccount } from '../utils/demoAccount.mjs';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setPending(true);

    try {
      const result = await AuthService.login(email, password);

      if (result.success) {
        navigate('/dashboard');
      } else {
        setError(result.error);
      }
    } catch (loginError) {
      setError(
        loginError?.message || 'Sign-in could not be completed in this browser.'
      );
    } finally {
      setPending(false);
    }
  };

  // The demo account is a real account with a real password verifier. It is
  // created on first use so this button works without a seeded credential.
  const handleDemoLogin = async () => {
    setError('');
    setPending(true);
    setEmail(DEMO_EMAIL);

    try {
      await ensureDemoAccount();
      const result = await AuthService.login(DEMO_EMAIL, 'demo1234');
      if (result.success) {
        navigate('/dashboard');
      } else {
        setError(result.error);
      }
    } catch (demoError) {
      setError(
        demoError?.message || 'The demo account could not be opened in this browser.'
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
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl mb-4">
            <span className="text-ink-inverse font-bold text-3xl">C</span>
          </div>
          <h1 className="text-4xl font-bold text-ink mb-2">
            CrushLearn <span className="text-primary-600">AI</span>
          </h1>
          <p className="text-ink-muted">
            Master new skills with guided practice and real study tools
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-surface rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-ink mb-6">Welcome Back</h2>

          {error && (
            <div className="mb-4 p-3 bg-danger-soft border border-danger/40 rounded-lg text-danger text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-muted mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-line rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-muted mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-line rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <div className="mt-2 text-right">
                <Link to="/forgot-password" className="text-sm text-primary-600 hover:text-primary-700">
                  Forgot password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={pending}
              className="w-full bg-accent text-ink-inverse py-3 rounded-lg font-semibold hover:bg-accent-strong transition shadow-lg hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Demo Login */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-line" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-surface text-ink-subtle">Or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={pending}
              className="mt-4 w-full bg-line-subtle text-ink-muted py-3 rounded-lg font-medium hover:bg-line transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              🚀 Try Demo Account
            </button>
          </div>

          {/* Sign Up Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-ink-muted">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary-600 hover:text-primary-700 font-semibold">
                Sign Up
              </Link>
            </p>
          </div>

          {/* Info */}
          <p className="mt-4 text-center text-sm text-ink-subtle">
            Accounts live in this browser only. Nothing is sent to a server.
          </p>
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl mb-1">🎓</div>
            <p className="text-xs text-ink-muted">Expert Courses</p>
          </div>
          <div>
            <div className="text-2xl mb-1">🧭</div>
            <p className="text-xs text-ink-muted">Study Tools</p>
          </div>
          <div>
            <div className="text-2xl mb-1">📜</div>
            <p className="text-xs text-ink-muted">Certificates</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
