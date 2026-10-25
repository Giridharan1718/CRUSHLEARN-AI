import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getCourseById, getLessonById, getLessonContext } from '../data/mockCourseData';
import { GuidanceEngine } from '../learning/guidanceEngine.mjs';
import { AuthService } from '../utils/auth';
import { createDiagnosticAssessment, getDiagnosticScore } from '../utils/diagnosticAssessment';
import { classifyEvidence, ASSESSMENT_STATES, getStateLabel, getStateColor } from '../utils/evidenceClassification';
import { isLessonCompleted, markLessonCompleted } from '../utils/lessonProgress.mjs';
import { recordActivity } from '../utils/learningActivity.mjs';
import Simulation from '../components/Simulation';
import LessonJourney from '../components/learning/LessonJourney';
import DiagnosticCheck from '../components/learning/DiagnosticCheck';
import StructuredLesson from '../components/course/StructuredLesson';
import { getLearningJourney } from '../data/learningJourneys';
import {
  getCourseLearningMap,
  getLessonLearningSpec,
} from '../data/courseLearningMaps';

const Lesson = () => {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const course = getCourseById(courseId);
  const lesson = getLessonById(courseId, lessonId);
  const user = AuthService.getCurrentUser();
  const learningMap = getCourseLearningMap(courseId);
  const learningSpec = getLessonLearningSpec(courseId, lessonId);
  const hasAuthoredReadiness = Boolean(
    learningSpec && learningSpec.diagnostic
  );
  const videoRef = useRef(null);
  const simulationRef = useRef(null);
  const [isOffline, setIsOffline] = useState(
    localStorage.getItem('offline_mode') === 'true'
  );

  // Existing state
  const [showHints, setShowHints] = useState(false);
  const [completed, setCompleted] = useState(
    isLessonCompleted(user, courseId, lessonId)
  );
  
    // New state for slides, video, and quiz
    const [activeTab, setActiveTab] = useState('slides'); // 'slides' or 'video' or 'quiz'
  const [currentSlide, setCurrentSlide] = useState(0);
  const [viewedSlides, setViewedSlides] = useState(new Set());
  const [videoPlayed, setVideoPlayed] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Simulation state
  const [simulationPassed, setSimulationPassed] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);

  // Diagnostic assessment state
  const [diagnostic, setDiagnostic] = useState(null);
  const [diagnosticAnswers, setDiagnosticAnswers] = useState({});

  // Evidence classification state
  const [skillEvidence, setSkillEvidence] = useState(null);

  // Quiz + mastery gate state (declared before any early return to keep hook order stable)
  const [quizScore, setQuizScore] = useState(null);
  const [masteryPassed, setMasteryPassed] = useState(false);
  const [showMasteryWarning, setShowMasteryWarning] = useState(false);

  // A deferred mastery decision can open targeted practice in the readiness
  // panel above the journey. The token lets the panel distinguish a deliberate
  // request from an ordinary evidence refresh.
  const [practiceRequest, setPracticeRequest] = useState({
    token: 0,
    objectiveIds: [],
  });

  // Mock slide data - in production, this would come from lesson data
  const slides = lesson?.slides || [
    'https://via.placeholder.com/800x600/0ea5e9/ffffff?text=Slide+1:+Introduction',
    'https://via.placeholder.com/800x600/3b82f6/ffffff?text=Slide+2:+Key+Concepts',
    'https://via.placeholder.com/800x600/8b5cf6/ffffff?text=Slide+3:+Examples',
    'https://via.placeholder.com/800x600/ec4899/ffffff?text=Slide+4:+Practice',
    'https://via.placeholder.com/800x600/10b981/ffffff?text=Slide+5:+Summary',
    'https://via.placeholder.com/800x600/f59e0b/ffffff?text=Slide+6:+Next+Steps',
  ];

  // Mock video URL - in production, use actual video files
  const videoUrl = lesson?.videoUrl || 'https://www.w3schools.com/html/mov_bbb.mp4';

  // Mock simulation task data - in production, this would come from lesson data
  const simulationTask = lesson?.simulation || {
    id: `${lessonId}_simulation`,
    description: 'Create output that displays: Hello World',
    requirements: [
      'Output must be exactly "Hello World"',
      'Check spelling and capitalization',
      'No extra spaces or characters'
    ],
    expectedOutput: 'Hello World',
    caseSensitive: true,
    type: 'text',
    difficulty: 'Beginner',
    placeholder: 'Type your output here...',
    hints: [
      'Make sure you spell "Hello World" correctly with a capital H and W.',
      'Is there a space between "Hello" and "World"?',
      'Check that you don\'t have any extra characters before or after the text.'
    ],
    successMessage: 'Perfect! You\'ve successfully completed the practice task. You understand how to produce the expected output!'
  };

  // Load simulation progress from localStorage
  useEffect(() => {
    const savedSimProgress = localStorage.getItem(`simulation_${simulationTask.id}`);
    if (savedSimProgress) {
      const progress = JSON.parse(savedSimProgress);
      setSimulationPassed(progress.passed || false);
    }
  }, [simulationTask.id]);

  // Load progress from localStorage
  useEffect(() => {
    const savedProgress = localStorage.getItem(`lesson_${lessonId}_progress`);
    if (savedProgress) {
      const progress = JSON.parse(savedProgress);
      setViewedSlides(new Set(progress.viewedSlides || []));
      setVideoPlayed(progress.videoPlayed || false);
    }
  }, [lessonId]);

  // Mark current slide as viewed
  useEffect(() => {
    const newViewedSlides = new Set(viewedSlides);
    newViewedSlides.add(currentSlide);
    setViewedSlides(newViewedSlides);
    
    // Save progress
    saveProgress(newViewedSlides, videoPlayed);
  }, [currentSlide]);

  // Save progress to localStorage
  const saveProgress = (viewed, videoStatus) => {
    const progress = {
      viewedSlides: Array.from(viewed),
      videoPlayed: videoStatus,
    };
    localStorage.setItem(`lesson_${lessonId}_progress`, JSON.stringify(progress));
  };

  // Load the legacy diagnostic only when no authored readiness check exists.
  useEffect(() => {
    if (hasAuthoredReadiness) {
      setDiagnostic(null);
      return;
    }
    const diag = createDiagnosticAssessment(lesson, courseId, lessonId);
    if (diag) {
      const answers = JSON.parse(localStorage.getItem(`diagnostic_answers_${courseId}_${lessonId}`) || '[]');
      setDiagnostic(diag);
      setDiagnosticAnswers(answers);
    }
  }, [courseId, lessonId, lesson, hasAuthoredReadiness]);

  // Check if all requirements are met
  const allSlidesViewed = viewedSlides.size === slides.length;
  const canProceedToSimulation = allSlidesViewed && videoPlayed;
  const canCompleteLesson = canProceedToSimulation && simulationPassed;

  // Handle simulation completion
  const handleSimulationComplete = (passed) => {
    if (passed) {
      setSimulationPassed(true);
    }
  };

  // Handle "Go to Practice" button click
  const handleGoToPractice = () => {
    setShowSimulation(true);
    setTimeout(() => {
      simulationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleStartRemediation = (objectiveIds = []) => {
    setPracticeRequest((previous) => ({
      token: previous.token + 1,
      objectiveIds: [...new Set(objectiveIds)],
    }));
    setTimeout(() => {
      document
        .getElementById('readiness-check')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Handle video play event
  const handleVideoPlay = () => {
    if (!videoPlayed) {
      setVideoPlayed(true);
      saveProgress(viewedSlides, true);
    }
  };

  // Handle playback speed change
  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  // Navigate slides
  const goToNextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const goToPrevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  // Mark the lesson complete for the signed-in learner (idempotent).
  const handleMarkComplete = () => {
    const updatedUser = markLessonCompleted(user, courseId, lessonId);
    AuthService.updateUser({
      completedLessons: updatedUser.completedLessons,
    });
    // The streak is derived from dated activity, so the completion is
    // recorded rather than a counter being incremented.
    recordActivity('lesson_completed', `${courseId} / ${lessonId}`);
    setCompleted(true);
  };

  if (!course || !lesson) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-ink mb-4">
            Lesson Not Found
          </h2>
          <Link
            to="/dashboard"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (isOffline && !completed) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-surface border border-line rounded-xl p-8 text-center">
          <h2 className="text-2xl font-bold text-ink mb-3">
            Offline Mode Restriction
          </h2>
          <p className="text-ink-muted mb-6">
            Only completed lessons are accessible while Offline Mode is enabled.
          </p>
          <Link
            to={`/course/${courseId}`}
            className="text-ink font-medium"
          >
            Return to Course
          </Link>
        </div>
      </div>
    );
  }

  // Lessons with authored journey content use the complete guided learning
  // journey (explanation → example → practice → assessment → completion).
  const journeyContent = getLearningJourney(courseId, lessonId);

  // Shared, subject-agnostic readiness panel. Content comes from the course
  // learning map; the panel contains no lesson or subject-specific logic.
  const readinessPanel =
    hasAuthoredReadiness && learningMap && learningSpec ? (
      <div id="readiness-check" className="scroll-mt-24">
        <DiagnosticCheck
          key={`${courseId}:${lessonId}`}
          courseId={courseId}
          lessonId={lessonId}
          courseMap={learningMap}
          lessonSpec={learningSpec}
          focusObjectiveIds={practiceRequest.objectiveIds}
          practiceRequestToken={practiceRequest.token}
        />
      </div>
    ) : null;

  if (journeyContent) {
    const journeyIndex = course.lessons.findIndex((l) => l.id === lessonId);
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            to={`/course/${courseId}`}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            ← Back to {course.title}
          </Link>
        </div>

        <div className="bg-surface rounded-2xl shadow-lg p-8 mb-8">
          <div className="flex items-center space-x-2 mb-3">
            <span className="px-3 py-1 bg-primary-100 text-primary-700 text-sm font-semibold rounded-full">
              Lesson {journeyIndex + 1} of {course.lessons.length}
            </span>
            <span className="px-3 py-1 bg-info-soft text-info text-sm font-semibold rounded-full">
              🧭 Guided learning journey
            </span>
            {completed && (
              <span className="px-3 py-1 bg-success-soft text-success text-sm font-semibold rounded-full">
                ✓ Completed
              </span>
            )}
          </div>

          <h1 className="text-3xl font-bold text-ink mb-3">
            {lesson.title}
          </h1>

          <p className="text-ink-muted text-lg mb-4">{lesson.content}</p>

          <div className="flex items-center space-x-4 text-sm text-ink-subtle">
            <span>⏱️ {lesson.duration}</span>
            <span>📚 {course.title}</span>
          </div>
        </div>

        {readinessPanel}

        <LessonJourney
          content={journeyContent}
          onComplete={handleMarkComplete}
          onBackToCourse={() => navigate(`/course/${courseId}`)}
          onStartRemediation={handleStartRemediation}
        />
      </div>
    );
  }

  // Structured lessons use the reusable content and activity renderers. The
  // legacy slides/quiz/simulation path below remains available for any older
  // lesson that has not been migrated to the structured content model.
  const structuredContext = getLessonContext(courseId, lessonId);
  if (structuredContext) {
    return (
      <StructuredLesson
        key={`${courseId}:${lessonId}`}
        context={structuredContext}
        completed={completed}
        onComplete={handleMarkComplete}
        readinessPanel={readinessPanel}
      />
    );
  }

  const hints = GuidanceEngine.getHints(lessonId, courseId);
  const currentIndex = course.lessons.findIndex((l) => l.id === lessonId);
  const nextLesson = course.lessons[currentIndex + 1];
  const prevLesson = course.lessons[currentIndex - 1];

  // Mastery gate: check if user passed quiz (80%+) or wants to skip simulation
  const lessonQuiz = lesson?.quiz || [];
  const passedQuiz = lessonQuiz.length > 0 && quizScore !== null && quizScore >= 80;

  const handleQuizPassed = (score) => {
    setQuizScore(score);
    recordActivity('quiz_completed', `${courseId} / ${lessonId} (${score}%)`);
    if (score >= 80) {
      setMasteryPassed(true);
      setShowMasteryWarning(false);
    } else {
      setMasteryPassed(false);
      setShowMasteryWarning(true);
    }
  };

  const handleSkipSimulation = () => {
    setMasteryPassed(true);
    setShowMasteryWarning(false);
  };

  const canProceedWithNextLesson = passedQuiz || masteryPassed;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          to={`/course/${courseId}`}
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          ← Back to {course.title}
        </Link>
      </div>

      {/* Lesson Header */}
      <div className="bg-surface rounded-2xl shadow-lg p-8 mb-8">
        <div className="flex items-center space-x-2 mb-3">
          <span className="px-3 py-1 bg-primary-100 text-primary-700 text-sm font-semibold rounded-full">
            Lesson {currentIndex + 1} of {course.lessons.length}
          </span>
          <span
            className={`px-3 py-1 text-sm font-semibold rounded-full ${
              lesson.type === 'video'
                ? 'bg-info-soft text-info'
                : 'bg-info-soft text-info'
            }`}
          >
            {lesson.type === 'video' ? '🎥 Video' : '💻 Project'}
          </span>
          {completed && (
            <span className="px-3 py-1 bg-success-soft text-success text-sm font-semibold rounded-full">
              ✓ Completed
            </span>
          )}
        </div>

        <h1 className="text-3xl font-bold text-ink mb-3">
          {lesson.title}
        </h1>

        <p className="text-ink-muted text-lg mb-4">{lesson.content}</p>

        <div className="flex items-center space-x-4 text-sm text-ink-subtle">
          <span>⏱️ {lesson.duration}</span>
          <span>📚 {course.title}</span>
        </div>
      </div>

      {readinessPanel}

      {/* Main Content Area */}
      <div className="grid md:grid-cols-3 gap-8">
        {/* Lesson Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Diagnostic Assessment (legacy lessons without an authored readiness check) */}
          {diagnostic && !hasAuthoredReadiness && (
            <div className="bg-surface rounded-xl shadow-md p-6 border border-primary-100">
              <div className="flex items-center space-x-2 mb-4">
                <span className="text-2xl">📋</span>
                <h3 className="font-bold text-ink">
                  Diagnostic Assessment
                </h3>
                <span className={`px-2 py-1 text-xs font-bold rounded-full ${getStateColor(skillEvidence?.state || 'NOT_ASSESSED')}`}>
                  {getStateLabel(skillEvidence?.state || 'NOT_ASSESSED')}
                </span>
              </div>
              <p className="text-sm text-ink-muted mb-4">
                Let's check your prerequisite knowledge. This will help us recommend the right lesson for you.
              </p>
              <div className="space-y-3">
                {diagnostic.questions.map((q, qIndex) => {
                  const answer = diagnosticAnswers[qIndex];
                  return (
                    <div key={qIndex} className="bg-line-subtle rounded-lg p-3">
                      <p className="font-medium text-ink">{q.question}</p>
                      <div className="mt-2 space-y-2">
                        {q.options.map((option, optIndex) => {
                          const selected = answer?.selectedIndex === optIndex;
                          const correct = answer?.selectedIndex === q.correctIndex;
                          return (
                            <button
                              key={optIndex}
                              onClick={() => {
                                const newAnswers = { ...diagnosticAnswers };
                                newAnswers[qIndex] = { selectedIndex: optIndex };
                                setDiagnosticAnswers(newAnswers);
                              }}
                              className={`w-full text-left px-3 py-2 rounded border transition ${
                                selected
                                  ? 'border-primary-500 bg-primary-50'
                                  : 'border-line hover:border-primary-300'
                              }`}
                            >
                              <div className="flex items-center space-x-2">
                                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                                  selected
                                    ? 'bg-accent border-accent text-ink-inverse'
                                    : 'border-line'
                                }`}>
                                  {selected ? '✓' : optIndex + 1}
                                </span>
                                <span className="text-sm text-ink-muted">{option}</span>
                              </div>
                              {selected && correct && (
                                <p className="text-xs text-success mt-1">✓ Correct!</p>
                              )}
                              {selected && !correct && (
                                <p className="text-xs text-danger mt-1">✗ Incorrect. The correct answer is {q.options[q.correctIndex]}</p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={() => {
                    const score = getDiagnosticScore(courseId, lessonId);
                    const evidence = classifyEvidence({
                      score: score.score,
                      totalQuestions: score.totalQuestions,
                      correctAnswers: score.correctCount,
                      strength: score.strength,
                      attempts: 1
                    });
                    setSkillEvidence(evidence);
                    if (score.isPassing) {
                      alert('Great! Your diagnostic score is passing. Ready to continue learning!');
                    } else {
                      alert('Your diagnostic score is below the passing threshold. Review the lesson content and try again.');
                    }
                  }}
                  className="w-full px-4 py-2 bg-accent text-ink-inverse rounded-lg font-medium hover:bg-accent-strong transition"
                >
                  Submit Diagnostic
                </button>
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="bg-surface rounded-xl shadow-md overflow-hidden">
            <div className="flex border-b border-line">
              <button
                onClick={() => setActiveTab('slides')}
                className={`flex-1 px-6 py-4 font-semibold transition ${
                  activeTab === 'slides'
                    ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-600'
                    : 'text-ink-muted hover:bg-line-subtle'
                }`}
              >
                📊 Slides ({viewedSlides.size}/{slides.length})
              </button>
              <button
                onClick={() => setActiveTab('video')}
                className={`flex-1 px-6 py-4 font-semibold transition ${activeTab === 'video'
                    ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-600'
                    : 'text-ink-muted hover:bg-line-subtle'}`}
              >
                🎥 Video {videoPlayed && '✓'}
              </button>
              {lesson && lesson.quiz && lesson.quiz.length > 0 && (
                <button
                  onClick={() => setActiveTab('quiz')}
                  className={`flex-1 px-6 py-4 font-semibold transition ${activeTab === 'quiz'
                      ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-600'
                      : 'text-ink-muted hover:bg-line-subtle'}`}
                >
                  📝 Quiz ({lesson.quiz.length})
                </button>
              )}
            </div>

            {/* Slides Viewer */}
            {activeTab === 'slides' && (
              <div className="p-6">
                {/* Slide Display */}
                <div className="bg-line-subtle rounded-lg overflow-hidden mb-4">
                  <div className="aspect-video relative">
                    <img
                      src={slides[currentSlide]}
                      alt={`Slide ${currentSlide + 1}`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>

                {/* Slide Controls */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={goToPrevSlide}
                    disabled={currentSlide === 0}
                    className="px-4 py-2 bg-line-subtle text-ink rounded-lg font-medium hover:bg-line transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Previous
                  </button>

                  <div className="text-center">
                    <p className="text-lg font-bold text-ink">
                      Slide {currentSlide + 1} / {slides.length}
                    </p>
                    <div className="flex items-center space-x-1 mt-2">
                      {slides.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentSlide(index)}
                          className={`w-2 h-2 rounded-full transition ${
                            index === currentSlide
                              ? 'bg-primary-600 w-4'
                              : viewedSlides.has(index)
                              ? 'bg-success-soft0'
                              : 'bg-line'
                          }`}
                          title={`Slide ${index + 1}${viewedSlides.has(index) ? ' (viewed)' : ''}`}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={goToNextSlide}
                    disabled={currentSlide === slides.length - 1}
                    className="px-4 py-2 bg-accent text-ink-inverse rounded-lg font-medium hover:bg-accent-strong transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>

                {/* Progress Indicator */}
                <div className="mt-4 p-4 bg-info-soft rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-ink-muted">
                      Slide Progress
                    </span>
                    <span className="text-sm font-bold text-primary-600">
                      {Math.round((viewedSlides.size / slides.length) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-line rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${(viewedSlides.size / slides.length) * 100}%`,
                      }}
                    />
                  </div>
                  {!allSlidesViewed && (
                    <p className="text-xs text-ink-muted mt-2">
                      View all slides to unlock the next step
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Video Player */}
            {activeTab === 'video' && (
              <div className="p-6">
                {/* Video Element */}
                <div className="bg-ink rounded-lg overflow-hidden mb-4">
                  <video
                    ref={videoRef}
                    className="w-full"
                    controls
                    onPlay={handleVideoPlay}
                    controlsList="nodownload"
                  >
                    <source src={videoUrl} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>

                {/* Playback Speed Controls */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold text-ink-muted">
                      Playback Speed:
                    </span>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => handleSpeedChange(speed)}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                          playbackSpeed === speed
                            ? 'bg-accent text-ink-inverse'
                            : 'bg-line text-ink-muted hover:bg-line'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>

                  {videoPlayed && (
                    <span className="flex items-center space-x-2 text-success font-semibold">
                      <span className="text-lg">✓</span>
                      <span>Video Started</span>
                    </span>
                  )}
                </div>

                {/* Video Info */}
                <div className="p-4 bg-info-soft rounded-lg">
                  <h3 className="font-semibold text-ink mb-2">
                    Video Learning Tips:
                  </h3>
                  <ul className="space-y-1 text-sm text-ink-muted">
                    <li>• Use playback speed controls to learn at your pace</li>
                    <li>• Pause and rewind to review important concepts</li>
                    <li>• Take notes while watching</li>
                    <li>• Watch the video at least once to proceed</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Completion Status Card */}
          <div
            className={`rounded-xl shadow-md p-6 ${
              canCompleteLesson
                ? 'bg-gradient-to-r from-success-soft to-success-soft border-2 border-success/40'
                : canProceedToSimulation
                ? 'bg-gradient-to-r from-info-soft to-info-soft border-2 border-info-soft'
                : 'bg-gradient-to-r from-warning-soft to-warning-soft border-2 border-warning/40'
            }`}
          >
            <h3 className="text-xl font-bold text-ink mb-4">
              {canCompleteLesson 
                ? '🎉 Lesson Complete!' 
                : canProceedToSimulation
                ? '💻 Ready for Practice!'
                : '📋 Lesson Requirements'}
            </h3>

            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    allSlidesViewed
                      ? 'bg-success text-ink-inverse'
                      : 'bg-line text-ink-muted'
                  }`}
                >
                  {allSlidesViewed ? '✓' : '1'}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-ink">
                    View All Slides
                  </p>
                  <p className="text-sm text-ink-muted">
                    {viewedSlides.size} of {slides.length} slides viewed
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    videoPlayed
                      ? 'bg-success text-ink-inverse'
                      : 'bg-line text-ink-muted'
                  }`}
                >
                  {videoPlayed ? '✓' : '2'}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-ink">Watch Video</p>
                  <p className="text-sm text-ink-muted">
                    {videoPlayed ? 'Video started ✓' : 'Start the video to continue'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    simulationPassed
                      ? 'bg-success text-ink-inverse'
                      : canProceedToSimulation
                      ? 'bg-info text-ink-inverse'
                      : 'bg-line text-ink-muted'
                  }`}
                >
                  {simulationPassed ? '✓' : '3'}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-ink">Complete Practice Simulation</p>
                  <p className="text-sm text-ink-muted">
                    {simulationPassed 
                      ? 'Practice completed ✓' 
                      : canProceedToSimulation
                      ? 'Practice simulation unlocked!'
                      : 'Complete slides and video first'}
                  </p>
                </div>
              </div>
            </div>

            {canCompleteLesson && !completed && (
              <button
                onClick={handleMarkComplete}
                className="mt-4 w-full px-6 py-3 bg-success text-ink-inverse rounded-lg font-semibold hover:bg-success-strong transition shadow-lg"
              >
                Mark Lesson as Complete ✓
              </button>
            )}

            {completed && (
              <div className="mt-4 p-3 bg-success-soft rounded-lg text-success text-center font-semibold">
                ✓ Lesson Completed
              </div>
            )}

            {canProceedToSimulation && !showSimulation && !simulationPassed && (
              <button
                onClick={handleGoToPractice}
                className="mt-4 w-full px-6 py-3 bg-info text-ink-inverse rounded-lg font-semibold hover:bg-info-strong transition shadow-lg"
              >
                Go to Practice Simulation →
              </button>
            )}

            {!canProceedToSimulation && (
              <p className="mt-4 text-sm text-ink-muted italic">
                Complete all requirements above to unlock practice simulation
              </p>
            )}
          </div>

          {/* Lesson Description */}
          <div className="bg-surface rounded-xl shadow-md p-6">
            <h2 className="text-xl font-bold text-ink mb-4">
              About This Lesson
            </h2>
            <p className="text-ink-muted mb-4">{lesson.content}</p>
            
            <h3 className="font-semibold text-ink mb-2">
              What You'll Learn:
            </h3>
            <ul className="space-y-2 text-ink-muted">
              <li className="flex items-start space-x-2">
                <span className="text-primary-500 mt-1">•</span>
                <span>Core concepts and fundamentals</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-primary-500 mt-1">•</span>
                <span>Hands-on practical examples</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-primary-500 mt-1">•</span>
                <span>Best practices and common patterns</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-primary-500 mt-1">•</span>
                <span>Real-world applications</span>
              </li>
            </ul>
          </div>

          {/* Practice Simulation */}
          {(showSimulation || simulationPassed) && canProceedToSimulation && (
            <div ref={simulationRef} className="scroll-mt-8">
              <Simulation
                taskId={simulationTask.id}
                taskData={simulationTask}
                onComplete={handleSimulationComplete}
              />
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <button
              onClick={() =>
                prevLesson &&
                navigate(`/course/${courseId}/lesson/${prevLesson.id}`)
              }
              disabled={!prevLesson}
              className="px-6 py-3 bg-line-subtle text-ink-muted rounded-lg font-medium hover:bg-line transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Previous Lesson
            </button>

            <div className="flex items-center space-x-4">
              {completed && (
                <span className="px-4 py-2 bg-success-soft text-success rounded-lg font-semibold">
                  ✓ Completed
                </span>
              )}

              <button
                onClick={() => {
                  if (!canProceedWithNextLesson && nextLesson) {
                    setShowMasteryWarning(true);
                    setTimeout(() => setShowMasteryWarning(false), 3000);
                    return;
                  }
                  nextLesson
                    ? navigate(`/course/${courseId}/lesson/${nextLesson.id}`)
                    : navigate(`/course/${courseId}`);
                }}
                className={`px-6 py-3 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  canProceedWithNextLesson
                    ? 'bg-accent text-ink-inverse hover:bg-accent-strong'
                    : 'bg-line text-ink-subtle cursor-not-allowed'
                }`}
                disabled={!canProceedWithNextLesson}
              >
                {nextLesson ? 'Next Lesson →' : 'Back to Course'}
              </button>
            </div>
          </div>
        </div>

        {/* Mastery Gate Warning */}
        {showMasteryWarning && (
          <div className="mb-6 p-4 bg-warning-soft border border-warning/40 rounded-xl shadow-sm">
            <div className="flex items-start space-x-3">
              <span className="text-warning text-xl">⚠️</span>
              <div>
                <p className="text-warning font-semibold text-sm">
                  Mastery Gate Not Met
                </p>
                <p className="text-warning text-sm mt-1">
                  You need 80% on the quiz OR choose to skip simulation to unlock the
                  next lesson.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Sidebar */}
        <div className="md:col-span-1 space-y-6">
          {/* AI Hints */}
          <div className="bg-gradient-to-br from-accent-soft to-info-soft rounded-xl p-6">
            <div className="flex items-center space-x-2 mb-4">
              <span className="text-2xl">🤖</span>
              <h3 className="font-bold text-ink">AI Learning Hints</h3>
            </div>

            <button
              onClick={() => setShowHints(!showHints)}
              className="w-full px-4 py-2 bg-surface text-primary-700 rounded-lg font-medium hover:bg-primary-50 transition mb-4"
            >
              {showHints ? 'Hide Hints' : 'Show AI Hints'}
            </button>

            {showHints && (
              <div className="space-y-3">
                {hints.map((hint, index) => (
                  <div
                    key={index}
                    className="bg-surface rounded-lg p-3 text-sm text-ink-muted"
                  >
                    <span className="font-semibold text-primary-600">
                      Hint {index + 1}:
                    </span>{' '}
                    {hint}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Course Progress */}
          <div className="bg-surface rounded-xl shadow-md p-6">
            <h3 className="font-bold text-ink mb-4">Course Progress</h3>
            
            <div className="space-y-2">
              {course.lessons.map((l, idx) => (
                <div
                  key={l.id}
                  className={`flex items-center space-x-3 p-2 rounded ${
                    l.id === lessonId ? 'bg-primary-50' : ''
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                      isLessonCompleted(user, courseId, l.id)
                        ? 'bg-success-soft text-success'
                        : l.id === lessonId
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-line-subtle text-ink-subtle'
                    }`}
                  >
                    {isLessonCompleted(user, courseId, l.id) ? '✓' : idx + 1}
                  </div>
                  <span
                    className={`text-sm ${
                      l.id === lessonId
                        ? 'font-semibold text-ink'
                        : 'text-ink-muted'
                    }`}
                  >
                    {l.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lesson;
