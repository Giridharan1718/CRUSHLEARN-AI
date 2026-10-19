import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const TOTAL_SECONDS = 10 * 60;
const START_TIME_KEY = 'final_skill_check_start_time';
const SUBMITTED_KEY = 'final_skill_check_submitted';
const RESULT_KEY = 'final_skill_check_result';
const CERT_LOCK_KEY = 'certificate_locked';
const OFFLINE_MODE_KEY = 'offline_mode';

const FinalSkillCheck = () => {
  const navigate = useNavigate();
  const [userInput, setUserInput] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [status, setStatus] = useState('in-progress');
  const [message, setMessage] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [isOffline, setIsOffline] = useState(
    localStorage.getItem(OFFLINE_MODE_KEY) === 'true'
  );
  const hasSubmittedRef = useRef(false);

  const task = useMemo(() => ({
    id: 'final_skill_check_v1',
    description:
      'Produce the exact output of a function that returns the array [2, 4, 6, 8] and then joins the values with a dash (-).',
    expectedOutput: '2-4-6-8',
    caseSensitive: true,
    type: 'text',
  }), []);

  const validateInput = (input, expected) => {
    const normalizedInput = input.trim();
    const normalizedExpected = expected.trim();

    if (task.caseSensitive === false) {
      return normalizedInput.toLowerCase() === normalizedExpected.toLowerCase();
    }

    if (task.type === 'numeric') {
      const inputNum = parseFloat(normalizedInput);
      const expectedNum = parseFloat(normalizedExpected);
      return Math.abs(inputNum - expectedNum) < 0.001;
    }

    return normalizedInput === normalizedExpected;
  };

  const finalizeAttempt = (passed, reason) => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    const resultPayload = {
      passed,
      submittedAt: new Date().toISOString(),
      reason,
      input: userInput.trim(),
    };

    localStorage.setItem(SUBMITTED_KEY, 'true');
    localStorage.setItem(RESULT_KEY, JSON.stringify(resultPayload));

    if (passed) {
      localStorage.setItem(CERT_LOCK_KEY, 'false');
      setStatus('passed');
      setMessage('Passed. Your result has been recorded.');
      setIsLocked(true);
      navigate('/skill-passport', { replace: true });
      return;
    }

    localStorage.setItem(CERT_LOCK_KEY, 'true');
    setStatus('failed');
    setMessage('Failed. You did not meet the required output.');
    setIsLocked(true);
  };

  const handleSubmit = (reason) => {
    if (isLocked || hasSubmittedRef.current) return;
    const passed = validateInput(userInput, task.expectedOutput);
    finalizeAttempt(passed, reason || 'manual');
  };

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === OFFLINE_MODE_KEY) {
        setIsOffline(event.newValue === 'true');
      }
    };

    const handleLocalToggle = () => {
      setIsOffline(localStorage.getItem(OFFLINE_MODE_KEY) === 'true');
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('offline-mode-change', handleLocalToggle);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('offline-mode-change', handleLocalToggle);
    };
  }, []);

  useEffect(() => {
    if (isOffline) return;

    const wasSubmitted = localStorage.getItem(SUBMITTED_KEY) === 'true';
    if (wasSubmitted) {
      const storedResult = localStorage.getItem(RESULT_KEY);
      if (storedResult) {
        const parsed = JSON.parse(storedResult);
        setStatus(parsed.passed ? 'passed' : 'failed');
        setMessage(parsed.passed ? 'Passed. Your result has been recorded.' : 'Failed. You did not meet the required output.');
        setIsLocked(true);
      }
      return;
    }

    const existingStart = localStorage.getItem(START_TIME_KEY);
    const startTime = existingStart ? Number(existingStart) : Date.now();
    if (!existingStart) {
      localStorage.setItem(START_TIME_KEY, String(startTime));
    }

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(TOTAL_SECONDS - elapsed, 0);
      setSecondsLeft(remaining);
      if (remaining === 0) {
        handleSubmit('timeout');
      }
    };

    tick();
    const intervalId = setInterval(tick, 1000);

    return () => clearInterval(intervalId);
  }, [isOffline]);

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  if (isOffline) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Final Skill Check</h1>
          <p className="text-sm text-gray-600">
            Offline Mode is enabled. The Final Skill Check is unavailable while offline.
          </p>
          <Link to="/dashboard" className="text-sm font-medium text-gray-900">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Final Skill Check</h1>
          <p className="text-sm text-gray-600">
            This is a timed, single-attempt assessment. Keep your answer concise and exact.
          </p>
        </div>

        <div className="border border-gray-200 bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-600">
            AI guidance is disabled during skill verification.
          </p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <p className="text-sm font-semibold text-gray-900 mb-2">Task Description</p>
          <p className="text-sm text-gray-700">{task.description}</p>
        </div>

        <div className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Time Remaining</p>
            <p className="text-2xl font-semibold text-gray-900">{minutes}:{seconds}</p>
          </div>
          <div className="text-xs text-gray-500 text-right">
            <p>Assessment Window</p>
            <p>10 minutes</p>
          </div>
        </div>

        <div className="border border-red-200 bg-red-50 rounded-lg p-4">
          <p className="text-sm font-semibold text-red-700">
            This is a skill check. No hints will be provided.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Your Final Attempt
          </label>
          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            disabled={isLocked}
            className="w-full h-40 px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-400 resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
            placeholder="Type the exact output here..."
            spellCheck="false"
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => handleSubmit('manual')}
            disabled={isLocked || !userInput.trim()}
            className="px-6 py-3 bg-gray-900 text-white rounded-md text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit Final Attempt
          </button>
          <span className="text-xs text-gray-500">
            Submission is final. No retries.
          </span>
        </div>

        {status === 'failed' && (
          <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-red-700">{message}</p>
            <p className="text-sm text-red-700">
              Remediation: Review array methods, string joining, and exact output formatting before reattempting in a new session.
            </p>
            <p className="text-xs text-red-600">Certificate access is locked.</p>
          </div>
        )}

        {status === 'passed' && (
          <div className="border border-green-200 bg-green-50 rounded-lg p-4">
            <p className="text-sm font-semibold text-green-700">{message}</p>
            <p className="text-xs text-green-600">Redirecting to Skill Passport...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinalSkillCheck;
