import { useState, useEffect } from 'react';

/**
 * Active Recall Exercise Component
 *
 * A spaced-repetition-based active recall exercise component.
 * Users are presented with questions and must recall the answer
 * before seeing the correct response. This uses spaced repetition
 * to improve long-term retention.
 *
 * Features:
 * - Start by recalling the answer
 * - Reveal the correct answer
 * - Rate confidence (confidence-based spaced repetition)
 * - Track progress across sessions
 * - Adaptive difficulty based on performance
 */
const ActiveRecall = ({
  questions,
  onComplete,
  onProgress,
  initialConfidence = 3, // 1-5 scale
  timeLimit = 30, // seconds
}) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [confidence, setConfidence] = useState(initialConfidence);
  const [score, setScore] = useState({
    correct: 0,
    incorrect: 0,
    total: 0,
  });
  const [timer, setTimer] = useState(timeLimit);
  const [isComplete, setIsComplete] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Reset state when question changes
  useEffect(() => {
    setUserAnswer('');
    setShowAnswer(false);
    setFeedback(null);
    setTimer(timeLimit);
    setConfidence(initialConfidence);
  }, [currentQuestion, questions.length]);

  // Timer effect
  useEffect(() => {
    if (timer <= 0) {
      handleAnswerReveal(false);
      return;
    }

    const interval = setInterval(() => {
      setTimer((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timer]);

  // Handle answer reveal
  const handleAnswerReveal = (autoSubmitted = false) => {
    setShowAnswer(true);

    const isCorrect = userAnswer.trim().toLowerCase() ===
      questions[currentQuestion]?.answer?.toLowerCase();

    setScore((prev) => ({
      correct: isCorrect ? prev.correct + 1 : prev.correct,
      incorrect: isCorrect ? prev.incorrect : prev.incorrect + 1,
      total: prev.total + 1,
    }));

    setFeedback({
      isCorrect,
      userAnswer: userAnswer.trim(),
      correctAnswer: questions[currentQuestion].answer,
      timeTaken: timeLimit - timer,
      autoSubmitted,
    });

    // Update confidence for next question (spaced repetition)
    setConfidence((prev) => {
      const delta = isCorrect ? 1 : -1;
      return Math.min(5, Math.max(1, prev + delta));
    });

    // Update progress
    if (onProgress) {
      onProgress({
        index: currentQuestion,
        score: score.correct + score.incorrect,
        correct: score.correct,
        confidence,
        isCorrect,
      });
    }

    // Check if complete
    if (currentQuestion === questions.length - 1) {
      setIsComplete(true);
      if (onComplete) {
        onComplete({
          score: {
            correct: score.correct,
            incorrect: score.incorrect,
            total: score.total,
            percentage: score.total > 0 ? (score.correct / score.total) * 100 : 0,
          },
          confidence,
          duration: timeLimit * questions.length,
        });
      }
    }
  };

  // Handle user submission
  const handleSubmit = () => {
    handleAnswerReveal(false);
  };

  // Handle next question
  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
      setShowAnswer(false);
      setUserAnswer('');
      setFeedback(null);
      setTimer(timeLimit);
    } else {
      setIsComplete(true);
      if (onComplete) {
        onComplete({
          score: {
            correct: score.correct,
            incorrect: score.incorrect,
            total: score.total,
            percentage: score.total > 0 ? (score.correct / score.total) * 100 : 0,
          },
          confidence,
          duration: timeLimit * questions.length,
        });
      }
    }
  };

  // Handle skip
  const handleSkip = () => {
    setShowAnswer(true);
    setScore((prev) => ({ ...prev, total: prev.total + 1 }));
    setFeedback({ isCorrect: null, skipped: true });

    if (onProgress) {
      onProgress({
        index: currentQuestion,
        score: score.correct + score.incorrect,
        correct: score.correct,
        skipped: true,
      });
    }

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
      setShowAnswer(false);
      setUserAnswer('');
      setFeedback(null);
      setTimer(timeLimit);
    } else {
      setIsComplete(true);
      if (onComplete) {
        onComplete({
          score: {
            correct: score.correct,
            incorrect: score.incorrect,
            total: score.total,
            percentage: score.total > 0 ? (score.correct / score.total) * 100 : 0,
          },
          confidence,
          duration: timeLimit * questions.length,
        });
      }
    }
  };

  if (!questions || questions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-ink-subtle">No questions available for this exercise.</p>
      </div>
    );
  }

  const q = questions[currentQuestion];
  const isLast = currentQuestion === questions.length - 1;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="bg-surface rounded-2xl shadow-lg p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-ink">
              Active Recall Practice
            </h2>
            <p className="text-ink-subtle">
              {currentQuestion + 1} of {questions.length} questions
            </p>
          </div>
          <div className="text-right">
            <span className="text-sm font-medium text-ink-muted">
              Score: {score.correct}/{score.total}
            </span>
            <span className="text-sm font-medium text-ink-muted">
              ({Math.round((score.total > 0 ? score.correct / score.total : 0) * 100)}%)
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-line-subtle rounded-full h-2 mb-6">
          <div
            className="bg-primary-600 h-2 rounded-full transition-all duration-300"
            style={{
              width: `${(currentQuestion / questions.length) * 100}%`,
            }}
          />
        </div>

        {/* Question Card */}
        <div
          className={`p-6 rounded-xl ${
            showAnswer
              ? 'bg-line-subtle border border-line'
              : 'bg-primary-50 border border-primary-200'
          }`}
        >
          {!showAnswer ? (
            <>
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-ink">
                  Question {currentQuestion + 1}
                </h3>
                <p className="text-ink-muted mt-2">{q.question}</p>
              </div>

              {/* Answer Input */}
              <div className="mb-4">
                <label
                  htmlFor="answer"
                  className="block text-sm font-medium text-ink-muted mb-2"
                >
                  Your Answer
                </label>
                <textarea
                  id="answer"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  className="w-full px-4 py-3 border border-line rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y"
                  placeholder="Type your answer here..."
                  rows={4}
                />
              </div>

              {/* Confidence Rating */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-ink-muted mb-3">
                  Your Confidence (1-5)
                </label>
                <div className="flex space-x-2">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setConfidence(level)}
                      className={`w-10 h-10 rounded-lg font-bold transition ${
                        confidence >= level
                          ? 'bg-accent text-ink-inverse'
                          : 'bg-line-subtle text-ink-muted hover:bg-line'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-ink-subtle mt-2">
                  How confident are you in your answer?
                </p>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!userAnswer.trim()}
                className="w-full px-6 py-3 bg-accent text-ink-inverse rounded-lg font-semibold hover:bg-accent-strong transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Show Answer
              </button>
            </>
          ) : (
            <div className="space-y-4">
              {/* Revealed Answer */}
              <div
                className={`p-4 rounded-lg ${
                  feedback?.isCorrect
                    ? 'bg-success-soft border border-success/40'
                    : 'bg-danger-soft border border-danger/40'
                }`}
              >
                <p
                  className={`font-semibold ${
                    feedback?.isCorrect
                      ? 'text-success'
                      : 'text-danger'
                  }`}
                >
                  {feedback?.isCorrect ? '✓ Correct!' : '✗ Incorrect'}
                </p>
                <p className="text-ink-muted mt-2">
                  Your answer: <span className="font-medium">{feedback?.userAnswer}</span>
                </p>
                <p className="text-ink font-medium mt-2">
                  Correct answer: <span className="font-bold">{feedback?.correctAnswer}</span>
                </p>
                {feedback.timeTaken > 0 && (
                  <p className="text-sm text-ink-subtle mt-2">
                    Time taken: {feedback.timeTaken}s
                  </p>
                )}
                {feedback.skipped && (
                  <p className="text-sm text-warning">
                    Question skipped
                  </p>
                )}
              </div>

              {/* Confidence Feedback */}
              <div className="p-4 bg-line-subtle rounded-lg">
                <p className="text-sm text-ink-muted">
                  Your confidence:{' '}
                  <span className="font-medium">
                    {['Low', 'Low', 'Medium', 'High', 'Very High'][confidence - 1]}
                  </span>
                  {' '}
                  ({confidence}/5)
                </p>
                <p className="text-xs text-ink-subtle mt-1">
                  {feedback?.isCorrect
                    ? 'Good job! You are confident about this topic.'
                    : 'Keep reviewing this topic. Your confidence will improve with practice.'}
                </p>
              </div>

              {/* Navigation */}
              <div className="flex justify-between">
                <button
                  onClick={() => setCurrentQuestion((prev) => Math.max(0, prev - 1))}
                  disabled={currentQuestion === 0}
                  className="px-4 py-2 bg-line-subtle text-ink rounded-lg font-medium hover:bg-line transition disabled:opacity-50"
                >
                  Previous
                </button>
                {!isLast ? (
                  <button
                    onClick={handleNext}
                    className="px-4 py-2 bg-accent text-ink-inverse rounded-lg font-medium hover:bg-accent-strong transition"
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="px-4 py-2 bg-success text-ink-inverse rounded-lg font-medium hover:bg-success-strong transition"
                  >
                    Complete!
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActiveRecall;
