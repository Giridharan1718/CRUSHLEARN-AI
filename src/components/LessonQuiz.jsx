import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getCourseById, getLessonById } from '../data/mockCourseData';

const LessonQuiz = ({ courseId, lessonId, onQuizComplete }) => {
  const navigate = useNavigate();
  const course = getCourseById(courseId);
  const lesson = getLessonById(courseId, lessonId);
  const user = JSON.parse(localStorage.getItem('crushlearn_user') || 'null');

  if (!course || !lesson) {
    return null;
  }

  // Get quiz data from lesson; fallback to empty array
  const quiz = lesson.quiz || [];

  // Track state
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState(Array(quiz.length).fill(null));
  const [showResults, setShowResults] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Total score calculation
  const correctCount = quiz.filter((q, i) => answers[i] === q.correctIndex).length;
  const score = quiz.length > 0 ? Math.round((correctCount / quiz.length) * 100) : 0;

  // Navigate to next lesson on completion
  const handleQuizComplete = () => {
    setShowResults(true);
    setSubmitted(true);
    if (onQuizComplete) {
      onQuizComplete(score);
    }
  };

  // Handle answer selection
  const handleAnswerSelect = (questionIndex, selectedIndex) => {
    const newAnswers = [...answers];
    newAnswers[questionIndex] = selectedIndex;
    setAnswers(newAnswers);
    setShowExplanation(true);
  };

  // Go to next question or finish
  const handleNext = () => {
    if (currentQuestion < quiz.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setShowExplanation(false);
    } else {
      handleQuizComplete();
    }
  };

  // Reset quiz state (e.g., when navigating away and coming back)
  useEffect(() => {
    // Reset when lesson changes
    setCurrentQuestion(0);
    setAnswers(Array(quiz.length).fill(null));
    setShowResults(false);
    setShowExplanation(false);
    setSubmitted(false);
  }, [lessonId, quiz.length]);

  // If no quiz exists, return a message
  if (quiz.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="bg-surface rounded-2xl shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold text-ink mb-3">
            No Quiz Available
          </h2>
          <p className="text-ink-muted">
            This lesson does not have a quiz yet. You can proceed to the next lesson.
          </p>
          <Link
            to={`/course/${courseId}/lesson/${lessonId}`}
            className="inline-block mt-4 px-6 py-3 bg-accent text-ink-inverse rounded-lg font-medium hover:bg-accent-strong transition"
          >
            Back to Lesson
          </Link>
        </div>
      </div>
    );
  }

  // If all questions answered, show results
  if (submitted && showResults) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="bg-surface rounded-2xl shadow-lg p-8 text-center">
          <h2 className="text-3xl font-bold text-ink mb-3">
            {score >= 80 ? '🎉 Quiz Complete!' : 'Quiz Results'}
          </h2>
          <p className="text-lg text-ink-muted mb-6">
            Score: {score}%
          </p>
          {score >= 80 && (
            <p className="text-success font-semibold mb-6">
              Congratulations! You passed the quiz with 80% or higher.
            </p>
          )}
          {score < 80 && (
            <p className="text-danger font-semibold mb-6">
              Keep practicing! You need 80% to unlock the next lesson.
            </p>
          )}
          <div className="mb-6">
            <h3 className="text-xl font-bold text-ink mb-3">Questions and Answers</h3>
            {quiz.map((q, idx) => (
              <div key={idx} className="bg-line-subtle rounded-lg p-4 mb-3">
                <p className="font-semibold text-ink-muted mb-2">
                  Q{idx + 1}: {q.question}
                </p>
                <p className={`text-sm ${
                  answers[idx] === q.correctIndex ? 'text-success' : 'text-danger'
                }`}
                >
                  Your answer: {q.options[answers[idx]] || 'Not answered'}
                </p>
                <p className="text-success mt-1">
                  {q.explanation}
                </p>
              </div>
            ))}
          </div>
          <div className="flex justify-space-around">
            <button
              onClick={() => navigate(`/course/${courseId}/lesson/${lessonId}`)}
              className="px-6 py-3 bg-accent text-ink-inverse rounded-lg font-medium hover:bg-accent-strong transition"
            >
              ← Back to Lesson
            </button>
            {score >= 80 && (
              <button
                onClick={() => onQuizComplete ? onQuizComplete(score) : navigate(`/course/${courseId}/lesson/${lessonId}`)}
                className="px-6 py-3 bg-success text-ink-inverse rounded-lg font-medium hover:bg-success-strong transition"
              >
                Next Lesson →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Render quiz questions
  const currentQ = quiz[currentQuestion];
  const isLastQuestion = currentQuestion === quiz.length - 1;

  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="bg-surface rounded-2xl shadow-lg p-8">
        {/* Quiz Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-ink">
              Quiz: {lesson.title}
            </h2>
            <p className="text-ink-subtle">
              {currentQuestion + 1} of {quiz.length} questions
            </p>
          </div>
          <button
            onClick={() => navigate(`/course/${courseId}/lesson/${lessonId}`)}
            className="text-ink-subtle hover:text-primary-600 transition"
          >
            ← Back
          </button>
        </div>

        {/* Progress Bar */}
        <div className="bg-line-subtle rounded-full h-2 mb-4">
          <div
            className={`bg-primary-600 h-2 rounded-full transition-all duration-300 ${
              currentQuestion > 0
                ? `width: ${((currentQuestion) / quiz.length) * 100}%`
                : '0%'
            }`}
          />
        </div>

        {/* Question Area */}
        {showResults ? null : (
          <div className="mb-6">
            <p className="text-lg font-medium text-ink-muted mb-2">
              {currentQuestion + 1}. {currentQ.question}
            </p>
          </div>

          {/* Options */}
          <div className="space-y-3">
            {currentQ.options.map((option, optionIndex) => (
              <button
                key={optionIndex}
                onClick={() => handleAnswerSelect(currentQuestion, optionIndex)}
                className={`
                  w-full py-3 rounded-lg font-medium transition
                  ${answers[currentQuestion] === optionIndex
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-line-subtle text-ink-muted hover:bg-line'}
                  disabled={submitted ? true : false}
                `}
              >
                {option}
              </button>
            ))}
          </div>

          {/* Explanation (shown after answer) */}
          {showExplanation && !submitted && (
            <div className="mt-4 p-4 bg-line-subtle rounded-lg">
              <p className="text-success font-medium">
                {currentQ.explanation}
              </p>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex justify-between">
            {currentQuestion > 0 && (
              <button
                onClick={() => setCurrentQuestion(currentQuestion - 1)}
                className="px-4 py-2 bg-line-subtle text-ink rounded-lg font-medium hover:bg-line transition"
              >
                Previous
              </button>
            )}
            {!isLastQuestion ? (
              <button
                onClick={handleNext}
                className="px-4 py-2 bg-accent text-ink-inverse rounded-lg font-medium hover:bg-accent-strong transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-4 py-2 bg-success text-ink-inverse rounded-lg font-medium hover:bg-success-strong transition"
              >
                Submit →
              </button>
            )}
          </div>
        )}

        {/* Show explanation after answer selection (before navigating) */}
        {showExplanation && submitted && (
          <div className="mt-6 p-4 bg-line-subtle rounded-lg text-center">
            <p className="text-success font-medium">
              {currentQ.explanation}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LessonQuiz;