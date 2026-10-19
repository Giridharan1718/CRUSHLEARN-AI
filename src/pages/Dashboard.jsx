import { Link } from 'react-router-dom';
import { AuthService } from '../utils/auth';
import { courses } from '../data/mockCourseData';
import { GuidanceEngine } from '../ai/guidanceEngine';
import ProgressBar from '../components/ProgressBar';
import {
  getTodaysLesson,
  calculateOverallProgress,
  getCourseProgress,
  getUserSkills,
  getWeeklyStats,
} from '../utils/dashboardHelpers';

const Dashboard = () => {
  const user = AuthService.getCurrentUser();
  const recommendations = GuidanceEngine.generateLearningPath(user, courses);
  const progressAnalysis = GuidanceEngine.analyzeProgress(
    user.completedLessons || [],
    10
  );

  // Use helper functions for cleaner code
  const todaysLesson = getTodaysLesson(user, courses);
  const overallProgressData = calculateOverallProgress(user, courses);
  const skills = getUserSkills(user, courses);
  const weeklyStats = getWeeklyStats(user);
  const learningStreak = user.learningStreak || 5;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Section with Streak */}
      <div className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Welcome back, {user.name}! 👋
            </h1>
            <p className="text-gray-600">
              Continue your learning journey with personalized AI guidance
            </p>
          </div>
          
          {/* Learning Streak */}
          <div className="bg-gradient-to-br from-orange-100 to-orange-50 rounded-xl px-6 py-4 border-2 border-orange-200">
            <div className="flex items-center space-x-3">
              <div className="text-3xl">🔥</div>
              <div>
                <p className="text-2xl font-bold text-orange-700">{learningStreak} Days</p>
                <p className="text-sm text-orange-600">Learning Streak</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Lesson Card */}
      {todaysLesson ? (
        <div className="bg-white rounded-2xl shadow-lg border-2 border-primary-100 p-6 mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                  TODAY'S LESSON
                </span>
                <span className="text-gray-500 text-sm">⏱️ {todaysLesson.lesson.duration}</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {todaysLesson.lesson.title}
              </h2>
              <p className="text-gray-600 mb-1">
                {todaysLesson.lesson.content}
              </p>
              <p className="text-sm text-gray-500">
                From: <span className="font-medium text-primary-600">{todaysLesson.course.title}</span>
              </p>
            </div>
            <div className="text-5xl">📖</div>
          </div>
          
          <Link
            to={`/course/${todaysLesson.course.id}/lesson/${todaysLesson.lesson.id}`}
            className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold transition shadow-md hover:shadow-lg"
          >
            Start Lesson →
          </Link>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-primary-50 to-blue-50 rounded-2xl border-2 border-primary-200 p-8 mb-8 text-center">
          <div className="text-6xl mb-4">🎓</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Ready to Start Learning?
          </h2>
          <p className="text-gray-600 mb-6">
            You've completed all available lessons! Check back soon for more content.
          </p>
          <Link
            to="/skill-passport"
            className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold transition shadow-md hover:shadow-lg"
          >
            View Your Progress →
          </Link>
        </div>
      )}

      {/* Progress Overview */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {/* Overall Progress */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Overall Progress</h3>
          <ProgressBar 
            progress={overallProgressData.percentage} 
            label={`${overallProgressData.completedCount} of ${overallProgressData.totalLessons} lessons`}
            showPercentage={true}
          />
          <p className="text-sm text-gray-500 mt-2">
            Keep going! You're doing great! 🚀
          </p>
        </div>

        {/* Lessons This Week */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">This Week</h3>
          <div className="text-center">
            <p className="text-4xl font-bold text-primary-600 mb-2">
              {weeklyStats.lessonsCompleted}
            </p>
            <p className="text-gray-600 text-sm">Lessons Completed</p>
          </div>
        </div>

        {/* Active Courses */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Courses</h3>
          <div className="text-center">
            <p className="text-4xl font-bold text-green-600 mb-2">
              {weeklyStats.coursesActive}
            </p>
            <p className="text-gray-600 text-sm">In Progress</p>
          </div>
        </div>
      </div>

      {/* Skill Summary */}
      <div className="bg-white rounded-xl shadow-md p-6 mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Skills in Progress</h2>
        
        {skills.length > 0 ? (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {skills.map((skill, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-2 transition hover:shadow-md ${
                  skill.status === 'completed'
                    ? 'bg-green-50 border-green-200'
                    : skill.status === 'in-progress'
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900 text-sm">
                    {skill.name}
                  </span>
                  <span className="text-xl">
                    {skill.status === 'completed' ? '✓' : skill.status === 'in-progress' ? '⏳' : '○'}
                  </span>
                </div>
                
                <span
                  className={`inline-block px-2 py-1 text-xs font-bold rounded-full ${
                    skill.status === 'completed'
                      ? 'bg-green-200 text-green-800'
                      : skill.status === 'in-progress'
                      ? 'bg-blue-200 text-blue-800'
                      : 'bg-gray-200 text-gray-600'
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
          <div className="text-center py-8 text-gray-500">
            <p className="text-lg mb-2">No skills in progress yet</p>
            <p className="text-sm">Complete lessons to start tracking your skills!</p>
          </div>
        )}
      </div>

      {/* AI Recommendations */}
      <div className="bg-gradient-to-r from-primary-500 to-blue-600 rounded-2xl p-6 mb-8 text-white shadow-lg">
        <div className="flex items-start space-x-4">
          <div className="text-4xl">🤖</div>
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-2">AI Learning Coach</h3>
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

      {/* Recommended Next Activity */}
      <div className="bg-white rounded-xl shadow-md p-6 mb-8 border border-primary-100">
        <h3 className="text-xl font-bold text-gray-900 mb-4">
          Recommended Next Activity
        </h3>
        {recommendations.length > 0 && (
          <div className="bg-primary-50 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-2xl">🎯</span>
              <span className="font-semibold text-primary-800">
                {getRecommendationLabel(recommendations[0].type)}
              </span>
            </div>
            <p className="text-gray-700 mb-3">
              {recommendations[0].message}
            </p>
            {recommendations[0].actionUrl && (
              <Link
                to={recommendations[0].actionUrl}
                className="inline-block w-full px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
              >
                Start Now
              </Link>
            )}
          </div>
        )}
      </div>

      {/* My Courses */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">My Courses</h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          {user.enrolledCourses.map((courseId) => {
            const course = courses.find((c) => c.id === courseId);
            if (!course) return null;
            
            const progress = getCourseProgress(user, courseId, courses);

            return (
              <Link
                key={course.id}
                to={`/course/${course.id}`}
                className="bg-white rounded-xl shadow-md hover:shadow-xl transition overflow-hidden group"
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
                    <span className="text-gray-500 text-sm">
                      {course.duration}
                    </span>
                  </div>
                  
                  <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-primary-600 transition">
                    {course.title}
                  </h3>
                  
                  <p className="text-gray-600 text-sm mb-4">
                    {course.description}
                  </p>
                  
                  <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
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
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Explore More Courses
        </h2>
        
        <div className="grid md:grid-cols-3 gap-6">
          {courses
            .filter((course) => !user.enrolledCourses.includes(course.id))
            .map((course) => (
              <div
                key={course.id}
                className="bg-white rounded-xl shadow-md hover:shadow-xl transition overflow-hidden"
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
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded">
                      {course.level}
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {course.title}
                  </h3>
                  
                  <p className="text-gray-600 text-sm mb-4">
                    {course.description}
                  </p>
                  
                  <button className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition">
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
