import { Link } from 'react-router-dom';
import { AuthService } from '../utils/auth';
import { courses } from '../data/mockCourseData';
import { GuidanceEngine } from '../learning/guidanceEngine.mjs';
import ProgressBar from '../components/ProgressBar';
import {
  getTodaysLesson,
  calculateOverallProgress,
  getCourseProgress,
  getUserSkills,
  getWeeklyStats,
} from '../utils/dashboardHelpers';
import { getActivitySummary } from '../utils/learningActivity.mjs';
import { readSettings } from '../utils/settingsStore.mjs';

// GuidanceEngine returns its own recommendation type set; map the types it
// emits to learner-friendly labels.
const RECOMMENDATION_LABELS = {
  start: 'Get Started',
  continue: 'Continue Learning',
  advance: 'Level Up',
};

const Dashboard = () => {
  const user = AuthService.getCurrentUser();
  const settings = readSettings();
  const recommendations = settings.showRecommendations
    ? GuidanceEngine.generateLearningPath(user, courses)
    : [];
  const progressAnalysis = GuidanceEngine.analyzeProgress(
    user.completedLessons || [],
    10
  );

  // Use helper functions for cleaner code
  const todaysLesson = getTodaysLesson(user, courses);
  const overallProgressData = calculateOverallProgress(user, courses);
  const skills = getUserSkills(user, courses);
  const weeklyStats = getWeeklyStats(user);
  // Derived from the learner's own dated activity. It is null when tracking
  // is turned off, which is shown as "off" rather than as a streak of zero.
  const activity = getActivitySummary();
  const learningStreak = activity.streak;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Section with Streak */}
      <div className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-ink mb-2">
              Welcome back, {user.name}! 👋
            </h1>
            <p className="text-ink-muted">
              Continue your learning journey with personalized AI guidance
            </p>
          </div>
          
          {/* Learning Streak */}
          <div className="bg-warning-soft rounded-xl px-6 py-4 border-2 border-warning/40">
            <div className="flex items-center space-x-3">
              <div className="text-3xl">🔥</div>
              <div>
                {learningStreak === null ? (
                  <>
                    <p className="text-2xl font-bold text-warning">Off</p>
                    <p className="text-sm text-warning">
                      Activity tracking is off
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-warning">
                      {learningStreak} {learningStreak === 1 ? 'Day' : 'Days'}
                    </p>
                    <p className="text-sm text-warning">Learning Streak</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Lesson Card */}
      {todaysLesson ? (
        <div className="bg-surface rounded-2xl shadow-lg border-2 border-primary-100 p-6 mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <span className="px-3 py-1 bg-success-soft text-success text-xs font-bold rounded-full">
                  TODAY'S LESSON
                </span>
                <span className="text-ink-subtle text-sm">⏱️ {todaysLesson.lesson.duration}</span>
              </div>
              <h2 className="text-2xl font-bold text-ink mb-2">
                {todaysLesson.lesson.title}
              </h2>
              <p className="text-ink-muted mb-1">
                {todaysLesson.lesson.content}
              </p>
              <p className="text-sm text-ink-subtle">
                From: <span className="font-medium text-primary-600">{todaysLesson.course.title}</span>
              </p>
            </div>
            <div className="text-5xl">📖</div>
          </div>
          
          <Link
            to={`/course/${todaysLesson.course.id}/lesson/${todaysLesson.lesson.id}`}
            className="inline-block px-6 py-3 bg-accent text-ink-inverse rounded-lg hover:bg-accent-strong font-semibold transition shadow-md hover:shadow-lg"
          >
            Start Lesson →
          </Link>
        </div>
      ) : (
        <div className="bg-primary-50 rounded-2xl border-2 border-primary-200 p-8 mb-8 text-center">
          <div className="text-6xl mb-4">🎓</div>
          <h2 className="text-2xl font-bold text-ink mb-2">
            Ready to Start Learning?
          </h2>
          <p className="text-ink-muted mb-6">
            You've completed all available lessons! Check back soon for more content.
          </p>
          <Link
            to="/skill-passport"
            className="inline-block px-6 py-3 bg-accent text-ink-inverse rounded-lg hover:bg-accent-strong font-semibold transition shadow-md hover:shadow-lg"
          >
            View Your Progress →
          </Link>
        </div>
      )}

      {/* Active Recall Entry Point */}
      <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-info/40 bg-surface p-6 shadow-md sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="text-4xl">🔁</div>
          <div>
            <h2 className="text-xl font-bold text-ink">Active Recall Review</h2>
            <p className="mt-1 text-ink-muted">
              Retrieve key concepts from memory, then check the explanation.
              Due and upcoming reviews are scheduled from your evidence.
            </p>
          </div>
        </div>
        <Link
          to="/review"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary-600 px-5 py-3 font-semibold text-ink-inverse transition hover:bg-accent-strong"
        >
          Open review dashboard →
        </Link>
      </div>

      {/* Progress Overview */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {/* Overall Progress */}
        <div className="bg-surface rounded-xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-ink mb-4">Overall Progress</h3>
          <ProgressBar 
            progress={overallProgressData.percentage} 
            label={`${overallProgressData.completedCount} of ${overallProgressData.totalLessons} lessons`}
            showPercentage={true}
          />
          <p className="text-sm text-ink-subtle mt-2">
            Keep going! You're doing great! 🚀
          </p>
        </div>

        {/* Lessons This Week */}
        <div className="bg-surface rounded-xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-ink mb-4">This Week</h3>
          <div className="text-center">
            <p className="text-4xl font-bold text-primary-600 mb-2">
              {weeklyStats.lessonsCompleted}
            </p>
            <p className="text-ink-muted text-sm">Lessons Completed</p>
          </div>
        </div>

        {/* Active Courses */}
        <div className="bg-surface rounded-xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-ink mb-4">Active Courses</h3>
          <div className="text-center">
            <p className="text-4xl font-bold text-success mb-2">
              {weeklyStats.coursesActive}
            </p>
            <p className="text-ink-muted text-sm">In Progress</p>
          </div>
        </div>
      </div>

      {/* Skill Summary */}
      <div className="bg-surface rounded-xl shadow-md p-6 mb-8">
        <h2 className="text-2xl font-bold text-ink mb-4">Skills in Progress</h2>
        
        {skills.length > 0 ? (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {skills.map((skill, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-2 transition hover:shadow-md ${
                  skill.status === 'completed'
                    ? 'bg-success-soft border-success/40'
                    : skill.status === 'in-progress'
                    ? 'bg-info-soft border-info-soft'
                    : 'bg-line-subtle border-line'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-ink text-sm">
                    {skill.name}
                  </span>
                  <span className="text-xl">
                    {skill.status === 'completed' ? '✓' : skill.status === 'in-progress' ? '⏳' : '○'}
                  </span>
                </div>
                
                <span
                  className={`inline-block px-2 py-1 text-xs font-bold rounded-full ${
                    skill.status === 'completed'
                      ? 'bg-success-soft text-success'
                      : skill.status === 'in-progress'
                      ? 'bg-info-soft text-info'
                      : 'bg-line-subtle text-ink'
                  }`}
                >
                  {skill.status === 'completed'
                    ? 'Completed'
                    : skill.status === 'in-progress'
                    ? 'In Progress'
                    : 'Not Started'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-ink-subtle">
            <p className="text-lg mb-2">No skills in progress yet</p>
            <p className="text-sm">Complete lessons to start tracking your skills!</p>
          </div>
        )}
      </div>

      {/* Rule-based recommendations */}
      {settings.showRecommendations ? (
        <div className="bg-gradient-to-r from-primary-500 to-primary-700 rounded-2xl p-6 mb-8 text-ink-inverse shadow-lg">
          <div className="flex items-start space-x-4">
            <div className="text-4xl">🧭</div>
            <div className="flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-bold">Learning Coach</h3>
                <span className="rounded-full bg-surface/20 px-2 py-0.5 text-xs font-semibold">
                  Rule-based
                </span>
              </div>
              {recommendations.map((rec, index) => (
                <p key={index} className="text-primary-50 mb-3">
                  {rec.message}
                </p>
              ))}
              <div className="mt-4">
                <p className="text-sm font-semibold mb-1">
                  {progressAnalysis.motivation}
                </p>
                <p className="text-primary-100 text-sm">
                  Status: {progressAnalysis.message}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-surface rounded-xl shadow-md p-6 mb-8 border border-line">
          <h3 className="text-lg font-semibold text-ink mb-2">
            Learning Coach is turned off
          </h3>
          <p className="text-sm text-ink-muted">
            Rule-based suggestions are hidden. Turn them back on in Profile.
          </p>
        </div>
      )}

      {/* Recommended Next Activity */}
      {settings.showRecommendations && (
        <div className="bg-surface rounded-xl shadow-md p-6 mb-8 border border-primary-100">
          <h3 className="text-xl font-bold text-ink mb-4">
            Recommended Next Activity
          </h3>
          {recommendations.length > 0 && (
          <div className="bg-primary-50 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-2xl">🎯</span>
              <span className="font-semibold text-primary-800">
                {RECOMMENDATION_LABELS[recommendations[0].type] || recommendations[0].type}
              </span>
            </div>
            <p className="text-ink-muted mb-3">
              {recommendations[0].message}
            </p>
            {recommendations[0].actionUrl && (
              <Link
                to={recommendations[0].actionUrl}
                className="inline-block w-full px-4 py-2 bg-accent text-ink-inverse rounded-lg font-medium hover:bg-accent-strong transition"
              >
                Start Now
              </Link>
            )}
          </div>
          )}
        </div>
      )}

      {/* My Courses */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-ink mb-4">My Courses</h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          {user.enrolledCourses.map((courseId) => {
            const course = courses.find((c) => c.id === courseId);
            if (!course) return null;
            
            const progress = getCourseProgress(user, courseId, courses);

            return (
              <Link
                key={course.id}
                to={`/course/${course.id}`}
                className="bg-surface rounded-xl shadow-md hover:shadow-xl transition overflow-hidden group"
              >
                <div className="h-40 overflow-hidden">
                  <img
                    src={course.thumbnail}
                    alt={course.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                </div>
                
                <div className="p-6">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="px-2 py-1 bg-primary-100 text-primary-700 text-xs font-semibold rounded">
                      {course.level}
                    </span>
                    <span className="text-ink-subtle text-sm">
                      {course.duration}
                    </span>
                  </div>
                  
                  <h3 className="text-xl font-bold text-ink mb-2 group-hover:text-primary-600 transition">
                    {course.title}
                  </h3>
                  
                  <p className="text-ink-muted text-sm mb-4">
                    {course.description}
                  </p>
                  
                  <div className="flex items-center justify-between text-sm text-ink-subtle mb-4">
                    <span>👨‍🏫 {course.instructor}</span>
                    <span>⭐ {course.rating}</span>
                  </div>
                  
                  <ProgressBar progress={progress} label="Course Progress" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* All Available Courses */}
      <div>
        <h2 className="text-2xl font-bold text-ink mb-4">
          Explore More Courses
        </h2>
        
        <div className="grid md:grid-cols-3 gap-6">
          {courses
            .filter((course) => !user.enrolledCourses.includes(course.id))
            .map((course) => (
              <div
                key={course.id}
                className="bg-surface rounded-xl shadow-md hover:shadow-xl transition overflow-hidden"
              >
                <div className="h-32 overflow-hidden">
                  <img
                    src={course.thumbnail}
                    alt={course.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                
                <div className="p-5">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="px-2 py-1 bg-line-subtle text-ink-muted text-xs font-semibold rounded">
                      {course.level}
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-bold text-ink mb-2">
                    {course.title}
                  </h3>
                  
                  <p className="text-ink-muted text-sm mb-4">
                    {course.description}
                  </p>
                  
                  <button className="w-full px-4 py-2 bg-accent text-ink-inverse rounded-lg hover:bg-accent-strong font-medium transition">
                    Enroll Now
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
