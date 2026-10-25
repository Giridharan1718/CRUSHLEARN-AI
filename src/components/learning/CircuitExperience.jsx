import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_RESISTANCE,
  DEFAULT_VOLTAGE,
  MAX_RESISTANCE,
  MAX_VOLTAGE,
  MIN_RESISTANCE,
  MIN_VOLTAGE,
  calculateCurrent,
  calculatePower,
  evaluateCalculation,
  evaluatePrediction,
  formatAmps,
  formatWatts,
  lampBrightness,
  progressPercent,
} from '../../learning/circuitMath.mjs';

const STORAGE_KEY = 'crushlearn_interactive_experience_circuit_v1';

function loadProgress() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveProgress(progress) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Progress is enhancement only; ignore storage failures.
  }
}

const CircuitExperience = () => {
  const restored = useRef(loadProgress());
  const [voltage, setVoltage] = useState(
    restored.current?.voltage ?? DEFAULT_VOLTAGE
  );
  const [resistance, setResistance] = useState(
    restored.current?.resistance ?? DEFAULT_RESISTANCE
  );
  const [switchClosed, setSwitchClosed] = useState(
    restored.current?.switchClosed ?? true
  );
  const [predictionChoice, setPredictionChoice] = useState(
    restored.current?.predictionChoice ?? ''
  );
  const [predictionResult, setPredictionResult] = useState(
    restored.current?.predictionResult ?? null
  );
  const [calcInput, setCalcInput] = useState(
    restored.current?.calcInput ?? ''
  );
  const [calcResult, setCalcResult] = useState(
    restored.current?.calcResult ?? null
  );
  const [showHint, setShowHint] = useState(false);
  const [quizChoice, setQuizChoice] = useState(restored.current?.quizChoice ?? '');
  const [quizResult, setQuizResult] = useState(restored.current?.quizResult ?? null);

  const current = useMemo(
    () => (switchClosed ? calculateCurrent(voltage, resistance) : 0),
    [switchClosed, voltage, resistance]
  );
  const power = useMemo(
    () => (switchClosed ? calculatePower(voltage, resistance) : 0),
    [switchClosed, voltage, resistance]
  );
  const brightness = lampBrightness(current);

  const completedSteps = [
    true,
    switchClosed !== null,
    predictionResult?.correct === true,
    calcResult?.correct === true,
    quizResult?.correct === true,
  ].filter(Boolean).length;
  const progress = progressPercent(completedSteps, 5);

  useEffect(() => {
    saveProgress({
      voltage,
      resistance,
      switchClosed,
      predictionChoice,
      predictionResult,
      calcInput,
      calcResult,
      quizChoice,
      quizResult,
    });
  }, [
    voltage,
    resistance,
    switchClosed,
    predictionChoice,
    predictionResult,
    calcInput,
    calcResult,
    quizChoice,
    quizResult,
  ]);

  const handlePrediction = (choice) => {
    setPredictionChoice(choice);
    setPredictionResult(evaluatePrediction(choice));
  };

  const handleCalculation = (event) => {
    event.preventDefault();
    setCalcResult(evaluateCalculation(calcInput, voltage, resistance));
  };

  const handleQuiz = (choice) => {
    setQuizChoice(choice);
    setQuizResult({ correct: choice === 'field-fast' });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
              Interactive learning experience
            </p>
            <h2 className="mt-1 text-2xl font-bold text-ink">
              Electricity in a simple circuit
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              Explore how voltage, resistance, current, and power interact. Change
              the circuit, predict what happens, and check your reasoning.
            </p>
          </div>
          <div className="w-full sm:w-48">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Progress
            </p>
            <div className="mt-1 h-2 rounded-full bg-line">
              <div
                className="h-2 rounded-full bg-primary-600 transition-all"
                style={{ width: `${progress}%` }}
                aria-hidden="true"
              />
            </div>
            <p className="mt-1 text-xs text-ink-muted" aria-live="polite">
              {completedSteps} of 5 milestones complete
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">
          1. Opening question
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          If you make a wire thicker, does electricity move faster, or does more
          charge move each second? Make a prediction before changing the controls.
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">
          2. Interactive circuit
        </h3>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <svg
            viewBox="0 0 360 220"
            className="w-full rounded-xl border border-line bg-line-subtle"
            role="img"
            aria-label="Simple circuit with battery, switch, resistor, and lamp"
          >
            <rect x="40" y="40" width="60" height="140" rx="8" fill="#fde68a" stroke="#92400e" strokeWidth="2" />
            <text x="70" y="115" textAnchor="middle" fontSize="12" fill="#78350f">
              Battery
            </text>
            <line x1="100" y1="70" x2="180" y2="70" stroke="#374151" strokeWidth="4" />
            <line x1="100" y1="150" x2="180" y2="150" stroke="#374151" strokeWidth="4" />
            <rect x="180" y="55" width="70" height="30" rx="6" fill="#dbeafe" stroke="#1d4ed8" strokeWidth="2" />
            <text x="215" y="75" textAnchor="middle" fontSize="12" fill="#1e3a8a">
              Resistor
            </text>
            <rect x="180" y="135" width="70" height="30" rx="6" fill="#fee2e2" stroke="#b91c1c" strokeWidth="2" />
            <circle
              cx="215"
              cy="150"
              r="12"
              fill={switchClosed ? '#facc15' : '#9ca3af'}
              stroke="#78350f"
              strokeWidth="2"
              style={{ opacity: brightness || 0.25 }}
            />
            <text x="215" y="154" textAnchor="middle" fontSize="10" fill="#111827">
              Lamp
            </text>
            <g transform="translate(275,95)">
              <rect x="0" y="0" width="45" height="30" rx="6" fill={switchClosed ? '#dcfce7' : '#f3f4f6'} stroke="#374151" strokeWidth="2" />
              <text x="22.5" y="20" textAnchor="middle" fontSize="11" fill="#111827">
                {switchClosed ? 'Closed' : 'Open'}
              </text>
            </g>
            <line x1="250" y1="70" x2="297" y2="95" stroke="#374151" strokeWidth="4" />
            <line x1="250" y1="150" x2="297" y2="125" stroke="#374151" strokeWidth="4" />
          </svg>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-muted" htmlFor="voltage">
                Voltage: {voltage} V
              </label>
              <input
                id="voltage"
                type="range"
                min={MIN_VOLTAGE}
                max={MAX_VOLTAGE}
                value={voltage}
                onChange={(event) => setVoltage(Number(event.target.value))}
                className="mt-2 w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-muted" htmlFor="resistance">
                Resistance: {resistance} Ω
              </label>
              <input
                id="resistance"
                type="range"
                min={MIN_RESISTANCE}
                max={MAX_RESISTANCE}
                value={resistance}
                onChange={(event) => setResistance(Number(event.target.value))}
                className="mt-2 w-full"
              />
            </div>
            <div>
              <button
                type="button"
                onClick={() => setSwitchClosed((value) => !value)}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-accent-strong"
              >
                {switchClosed ? 'Open switch' : 'Close switch'}
              </button>
            </div>
            <div className="rounded-xl border border-line bg-line-subtle p-4 text-sm">
              <p>
                Current: <span className="font-semibold">{formatAmps(current)}</span>
              </p>
              <p>
                Power: <span className="font-semibold">{formatWatts(power)}</span>
              </p>
              <p className="mt-2 text-xs text-ink-muted">
                With the switch open, the path is broken and current is 0 A.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">
          3. Prediction challenge
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Voltage stays at {voltage} V. If resistance increases from {resistance} Ω
          to {resistance * 2} Ω, what happens to the current?
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            ['halves', 'The current is approximately halved.'],
            ['doubles', 'The current doubles.'],
            ['same', 'The current stays the same.'],
            ['increases', 'The current increases.'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => handlePrediction(id)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                predictionChoice === id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-line bg-surface hover:border-primary-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {predictionResult && (
          <p
            className={`mt-3 text-sm font-medium ${
              predictionResult.correct ? 'text-success' : 'text-warning'
            }`}
            aria-live="polite"
          >
            {predictionResult.correct
              ? 'Correct. Current is inversely proportional to resistance when voltage is constant.'
              : 'Not quite. With constant voltage, increasing resistance decreases current.'}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">
          4. Guided practice with hints
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          With the current settings ({voltage} V and {resistance} Ω), calculate the
          current. Enter a number in amperes.
        </p>
        <form onSubmit={handleCalculation} className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            type="number"
            step="0.01"
            value={calcInput}
            onChange={(event) => setCalcInput(event.target.value)}
            className="rounded-lg border border-line px-3 py-2 text-sm"
            aria-label="Current in amperes"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-accent-strong"
          >
            Check
          </button>
          <button
            type="button"
            onClick={() => setShowHint((value) => !value)}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle"
          >
            {showHint ? 'Hide hint' : 'Show hint'}
          </button>
        </form>
        {showHint && (
          <p className="mt-3 rounded-lg bg-warning-soft p-3 text-sm text-warning">
            Use I = V / R. Divide {voltage} by {resistance}.
          </p>
        )}
        {calcResult && (
          <p
            className={`mt-3 text-sm font-medium ${
              calcResult.correct ? 'text-success' : 'text-warning'
            }`}
            aria-live="polite"
          >
            {calcResult.correct
              ? `Correct. The current is ${formatAmps(calcResult.expected)}.`
              : `Try again. The expected current is ${formatAmps(calcResult.expected)}.`}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">
          5. Practical application
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          A household switch opens or closes a circuit. When it is open, the path
          is broken and current stops; when it is closed, the field is established
          and the load receives energy. This is why a loose wire can make a lamp
          flicker.
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">
          6. Understanding check
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Which statement best describes a closed simple circuit?
        </p>
        <div className="mt-3 grid gap-2">
          {[
            ['field-fast', 'Electrons drift slowly, while the electric field is established quickly through the circuit.'],
            ['light-speed', 'Electrons travel from the battery to the lamp at nearly the speed of light.'],
            ['consumes', 'The lamp uses up electrons, so fewer electrons return to the battery.'],
            ['creates', 'A battery creates brand-new electrons at its positive terminal.'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => handleQuiz(id)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                quizChoice === id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-line bg-surface hover:border-primary-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {quizResult && (
          <p
            className={`mt-3 text-sm font-medium ${
              quizResult.correct ? 'text-success' : 'text-warning'
            }`}
            aria-live="polite"
          >
            {quizResult.correct
              ? 'Correct. The field establishes quickly; charge carriers drift slowly.'
              : 'Not quite. Review the field and current steps, then try again.'}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">
          7. Suggested next activity
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Try the compiler pipeline visual to compare sequential process models, or
          open a notebook and ask a source-grounded question about electricity.
        </p>
      </section>
    </div>
  );
};

export default CircuitExperience;