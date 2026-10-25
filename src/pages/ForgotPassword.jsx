import { useState } from 'react';
import { Link } from 'react-router-dom';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    // Mock password reset
    setSubmitted(true);
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
            Reset Password
          </h1>
          <p className="text-ink-muted">
            Enter your email to receive reset instructions
          </p>
        </div>

        {/* Reset Password Card */}
        <div className="bg-surface rounded-2xl shadow-xl p-8">
          {!submitted ? (
            <>
              <h2 className="text-2xl font-bold text-ink mb-6">Forgot Password?</h2>

              {error && (
                <div className="mb-4 p-3 bg-danger-soft border border-danger/40 rounded-lg text-danger text-sm">
                  {error}
                </div>
              )}

              <p className="text-ink-muted mb-6">
                No worries! Enter your email address and we'll send you instructions to reset your password.
              </p>

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
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-accent text-ink-inverse py-3 rounded-lg font-semibold hover:bg-accent-strong transition shadow-lg hover:shadow-xl"
                >
                  Send Reset Link
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-success-soft rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✉️</span>
              </div>
              <h3 className="text-2xl font-bold text-ink mb-3">Check Your Email</h3>
              <p className="text-ink-muted mb-6">
                We've sent password reset instructions to <strong>{email}</strong>
              </p>
              <p className="text-sm text-ink-subtle mb-6">
                Didn't receive the email? Check your spam folder or try again.
              </p>
              <button
                onClick={() => setSubmitted(false)}
                className="text-primary-600 hover:text-primary-700 font-semibold"
              >
                Try Another Email
              </button>
            </div>
          )}

          {/* Back to Sign In */}
          <div className="mt-6 text-center">
            <Link to="/" className="text-sm text-ink-muted hover:text-ink flex items-center justify-center space-x-1">
              <span>←</span>
              <span>Back to Sign In</span>
            </Link>
          </div>

          {/* Info */}
          <p className="mt-6 text-center text-sm text-ink-subtle">
            This is a demo app. No actual email will be sent!
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
