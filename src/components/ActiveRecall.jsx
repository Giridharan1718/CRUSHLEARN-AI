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
        <p className="text-gray-500">No questions available for this exercise.</p>
      </div>
    );
  }

  const q = questions[currentQuestion];
  const isLast = currentQuestion === questions.length - 1;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="bg-white rounded-2xl shadow-lg p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Active Recall Practice
            </h2>
            <p className="text-gray-500">
              {currentQuestion + 1} of {questions.length} questions
            </p>
          </div>
          <div className="text-right">
            <span className="text-sm font-medium text-gray-600">
              Score: {score.correct}/{score.total}
            </span>
            <span className="text-sm font-medium text-gray-600">
              ({Math.round((score.total > 0 ? score.correct / score.total : 0) * 100)}%)
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-gray-100 rounded-full h-2 mb-6">
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
              ? 'bg-gray-50 border border-gray-200'
              : 'bg-primary-50 border border-primary-200'
          }`}
        >
          {!showAnswer ? (
            <>
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Question {currentQuestion + 1}
                </h3>
                <p className="text-gray-600 mt-2">{q.question}</p>
              </div>

              {/* Answer Input */}
              <div className="mb-4">
                <label
                  htmlFor="answer"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Your Answer
                </label>
                <textarea
                  id="answer"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y"
                  placeholder="Type your answer here..."
                  rows={4}
                />
              </div>

              {/* Confidence Rating */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-3">
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
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  How confident are you in your answer?
                </p>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!userAnswer.trim()}
                className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
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
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}
              >
                <p
                  className={`font-semibold ${
                    feedback?.isCorrect
                      ? 'text-green-800'
                      : 'text-red-800'
                  }`}
                >
                  {feedback?.isCorrect ? '✓ Correct!' : '✗ Incorrect'}
                </p>
                <p className="text-gray-700 mt-2">
                  Your answer: <span className="font-medium">{feedback?.userAnswer}</span>
                </p>
                <p className="text-gray-900 font-medium mt-2">
                  Correct answer: <span className="font-bold">{feedback?.correctAnswer}</span>
                </p>
                {feedback.timeTaken > 0 && (
                  <p className="text-sm text-gray-500 mt-2">
                    Time taken: {feedback.timeTaken}s
                  </p>
                )}
                {feedback.skipped && (
                  <p className="text-sm text-yellow-600">
                    Question skipped
                  </p>
                )}
              </div>

              {/* Confidence Feedback */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  Your confidence:{' '}
                  <span className="font-medium">
                    {['Low', 'Low', 'Medium', 'High', 'Very High'][confidence - 1]}
                  </span>
                  {' '}
                  ({confidence}/5)
                </p>
                <p className="text-xs text-gray-500 mt-1">
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
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition disabled:opacity-50"
                >
                  Previous
                </button>
                {!isLast ? (
                  <button
                    onClick={handleNext}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition"
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
