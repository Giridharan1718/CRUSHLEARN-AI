import { useState, useEffect } from 'react';

const Simulation = ({ taskId, taskData, onComplete }) => {
  const [userInput, setUserInput] = useState('');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState(null); // 'correct', 'incorrect', or null
  const [attempts, setAttempts] = useState(0);
  const [hint, setHint] = useState('');
  const [isPassed, setIsPassed] = useState(false);

  // Load saved progress from localStorage
  useEffect(() => {
    const savedProgress = localStorage.getItem(`simulation_${taskId}`);
    if (savedProgress) {
      const progress = JSON.parse(savedProgress);
      setIsPassed(progress.passed || false);
      setAttempts(progress.attempts || 0);
      
      if (progress.passed) {
        setStatus('correct');
        setOutput(progress.lastOutput || '');
      }
    }
  }, [taskId]);

  // Save progress to localStorage
  const saveProgress = (passed, currentAttempts, lastOutput) => {
    const progress = {
      passed,
      attempts: currentAttempts,
      lastOutput,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(`simulation_${taskId}`, JSON.stringify(progress));
  };

  // Validate user input
  const validateInput = (input, expected) => {
    // Apply validation rules based on task type
    const normalizedInput = input.trim();
    const normalizedExpected = expected.trim();

    // Case-insensitive comparison if specified
    if (taskData.caseSensitive === false) {
      return normalizedInput.toLowerCase() === normalizedExpected.toLowerCase();
    }

    // Flexible matching for numeric outputs
    if (taskData.type === 'numeric') {
      const inputNum = parseFloat(normalizedInput);
      const expectedNum = parseFloat(normalizedExpected);
      return Math.abs(inputNum - expectedNum) < 0.001;
    }

    // Exact match for default
    return normalizedInput === normalizedExpected;
  };

  // Get contextual hint based on attempt count and error type
  const getHint = (attemptCount, userOutput) => {
    const hints = taskData.hints || [];
    
    // Progressive hints based on attempt count
    if (attemptCount === 1 && hints[0]) {
      return hints[0];
    } else if (attemptCount === 2 && hints[1]) {
      return hints[1];
    } else if (attemptCount >= 3 && hints[2]) {
      return hints[2];
    }

    // Generic hints based on common errors
    if (!userOutput || userOutput.trim() === '') {
      return "Try entering some output. Look at the task description carefully.";
    }

    if (taskData.expectedOutput && userOutput.length < taskData.expectedOutput.length / 2) {
      return "Your output seems shorter than expected. Are you including everything?";
    }

    return "Review the task requirements. What might be different about your output?";
  };

  // Handle run button click
  const handleRun = () => {
    // Simple simulation: treat textarea content as "code" and expected output
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);

    // For simple tasks, the user input IS the output
    // In a real scenario, this would execute code and capture output
    const simulatedOutput = userInput.trim();
    setOutput(simulatedOutput);

    // Validate against expected output
    const isCorrect = validateInput(simulatedOutput, taskData.expectedOutput);

    if (isCorrect) {
      setStatus('correct');
      setHint('');
      setIsPassed(true);
      saveProgress(true, newAttempts, simulatedOutput);
      
      // Notify parent component
      if (onComplete) {
        onComplete(true);
      }
    } else {
      setStatus('incorrect');
      const newHint = getHint(newAttempts, simulatedOutput);
      setHint(newHint);
      saveProgress(false, newAttempts, simulatedOutput);
    }
  };

  // Handle reset/retry
  const handleReset = () => {
    setUserInput('');
    setOutput('');
    setStatus(null);
    setHint('');
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold text-gray-900">
            💻 Practice Simulation
          </h2>
          {isPassed && (
            <span className="px-4 py-2 bg-green-100 text-green-700 rounded-lg font-semibold">
              ✓ Passed
            </span>
          )}
        </div>
        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <span>📝 Attempts: {attempts}</span>
          {taskData.difficulty && (
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
              {taskData.difficulty}
            </span>
          )}
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <p className="text-xs text-gray-600">
          AI guidance is disabled during skill verification.
        </p>
      </div>

      {/* Task Description */}
      <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
        <h3 className="font-bold text-gray-900 mb-2">📋 Task:</h3>
        <p className="text-gray-700">{taskData.description}</p>
        
        {taskData.requirements && taskData.requirements.length > 0 && (
          <div className="mt-3">
            <p className="font-semibold text-gray-900 mb-1">Requirements:</p>
            <ul className="space-y-1 text-sm text-gray-700">
              {taskData.requirements.map((req, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <span className="text-blue-600 mt-0.5">•</span>
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          Your Solution:
        </label>
        <textarea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          disabled={isPassed}
          placeholder={taskData.placeholder || "Enter your solution here..."}
          className="w-full h-40 px-4 py-3 border-2 border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
          spellCheck="false"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-3">
        <button
          onClick={handleRun}
          disabled={!userInput.trim() || isPassed}
          className="px-6 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ▶ Run
        </button>
        
        {!isPassed && userInput && (
          <button
            onClick={handleReset}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
          >
            ↻ Reset
          </button>
        )}

        {isPassed && (
          <span className="flex items-center space-x-2 text-green-600 font-semibold">
            <span className="text-xl">🎉</span>
            <span>Great job! You completed the task!</span>
          </span>
        )}
      </div>

      {/* Output Area */}
      {output && (
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Output:
          </label>
          <div className="bg-gray-900 text-green-400 px-4 py-3 rounded-lg font-mono text-sm whitespace-pre-wrap">
            {output || '(no output)'}
          </div>
        </div>
      )}

      {/* Status Messages */}
      {status === 'correct' && (
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <span className="text-2xl">✓</span>
            <div>
              <h4 className="font-bold text-green-900 mb-1">Correct!</h4>
              <p className="text-green-700 text-sm">
                {taskData.successMessage || 
                 "Excellent work! Your solution produces the expected output. You've completed this practice successfully."}
              </p>
            </div>
          </div>
        </div>
      )}

      {status === 'incorrect' && (
        <div className="space-y-4">
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <span className="text-2xl">✗</span>
              <div>
                <h4 className="font-bold text-red-900 mb-1">Not Quite Right</h4>
                <p className="text-red-700 text-sm">
                  The output doesn't match what's expected. Review the task requirements and try again.
                </p>
              </div>
            </div>
          </div>

          {/* Hint Section */}
          {hint && (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <span className="text-2xl">💡</span>
                <div>
                  <h4 className="font-bold text-yellow-900 mb-1">Hint:</h4>
                  <p className="text-yellow-800 text-sm">{hint}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Help Section */}
      {!isPassed && (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-2 flex items-center space-x-2">
            <span>💭</span>
            <span>Tips:</span>
          </h4>
          <ul className="space-y-1 text-sm text-gray-600">
            <li>• Read the task description carefully</li>
            <li>• Check for exact spelling and formatting</li>
            <li>• Pay attention to spaces and capitalization</li>
            <li>• You can try multiple times - learning from mistakes is part of the process!</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default Simulation;
