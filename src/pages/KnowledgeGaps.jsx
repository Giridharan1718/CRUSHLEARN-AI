import { useState } from 'react';
import { getGapAnalysisSummary, formatGapsForDisplay } from '../utils/knowledgeGaps';
import { getQuizAttemptsByCourse } from '../utils/quizAnalytics';

/**
 * Knowledge Gaps Dashboard
 *
 * Displays a user's knowledge gaps and learning progress.
 * Shows which areas need improvement and provides recommendations.
 */
const KnowledgeGaps = ({ user }) => {
  const [courseId, setCourseId] = useState(null);

  // Get user's quiz attempts from localStorage
  const quizAttempts = user?.enrolledCourses
    ? user.enrolledCourses.flatMap((courseId) => getQuizAttemptsByCourse(courseId))
    : [];

  // Get course data for reference
  const courses = JSON.parse(localStorage.getItem('crushlearn_courses') || 'null');
  const mockCourses = [
    {
      id: 'web-dev-101',
      title: 'Web Development Fundamentals',
      level: 'Beginner',
      lessons: [
        { id: 'lesson-1', title: 'Introduction to HTML', completed: false },
        { id: 'lesson-2', title: 'CSS Styling Basics', completed: false },
        { id: 'lesson-3', title: 'JavaScript Essentials', completed: false },
        { id: 'lesson-4', title: 'Building Your First Website', completed: false },
      ],
    },
    {
      id: 'python-basics',
      title: 'Python Programming for Beginners',
      level: 'Beginner',
      lessons: [
        { id: 'lesson-1', title: 'Python Setup & Syntax', completed: false },
        { id: 'lesson-2', title: 'Control Flow & Functions', completed: false },
        { id: 'lesson-3', title: 'Data Structures', completed: false },
      ],
    },
    {
      id: 'react-advanced',
      title: 'Advanced React Patterns',
      level: 'Advanced',
      lessons: [
        { id: 'lesson-1', title: 'Custom Hooks Deep Dive', completed: false },
        { id: 'lesson-2', title: 'Performance Optimization', completed: false },
      ],
    },
  ];

  // Get course data
  const selectedCourse = courseId
    ? courses?.find((c) => c.id === courseId) || mockCourses.find((c) => c.id === courseId)
    : null;

  // Get quiz attempts for selected course
  const courseAttempts = courseId
    ? quizAttempts.filter((a) => a.courseId === courseId)
    : [];

  // Get lesson attempts for the selected course
  const lessonAttempts = selectedCourse
    ? mockCourses.find((c) => c.id === courseId)?.lessons.map((l) => ({
        lessonId: l.id,
        attempts: courseAttempts.filter((a) => a.lessonId === l.id),
      }))
    : [];

  // Get gaps for the selected course
  const gaps = courseId
    ? getGapAnalysisSummary(courseAttempts, mockCourses.find((c) => c.id === courseId)?.lessons.length || 0)
    : { hasGaps: false, totalGaps: 0 };

  // Select first course if none selected
  const selectedCourseId = courseId || 'web-dev-101';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          📊 Knowledge Gaps Analysis
        </h1>
        <p className="text-gray-600">
          Track your learning progress and identify areas for improvement
        </p>
      </div>

      {/* Course Selector */}
      <div className="bg-white rounded-xl shadow-md p-4 mb-6">
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          Select Course:
        </label>
        <select
          value={selectedCourseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          {mockCourses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title} ({course.level})
            </option>
          ))}
        </select>
      </div>

      {/* Course Stats */}
      {selectedCourse && (
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <div className="md:col-span-1">
            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {selectedCourse.title}
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Lessons:</span>
                  <span className="font-semibold text-gray-900">
                    {selectedCourse.lessons.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Completed:</span>
                  <span className="font-semibold text-green-600">
                    {selectedCourse.lessons.filter((l) => l.completed).length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Quiz Attempts:</span>
                  <span className="font-semibold text-primary-600">
                    {courseAttempts.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Average Score:</span>
                  <span className="font-semibold text-primary-600">
                    {courseAttempts.length > 0
                      ? `${Math.round(
                          courseAttempts.reduce((sum, a) => sum + a.score, 0) /
                            courseAttempts.length
                        )}%`
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Mastery Summary */}
          <div className="md:col-span-3 bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Gap Analysis Summary
            </h3>

            {gaps.hasGaps ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">🎯</span>
                    <div>
                      <p className="font-semibold text-red-800">
                        {gaps.totalGaps} knowledge gaps found
                      </p>
                      <p className="text-sm text-red-600">
                        Review lessons to improve your understanding
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold">
                    Needs Attention
                  </span>
                </div>

                {/* Gap Details */}
                {gaps.gapDetails.length > 0 && (
                  <div className="space-y-3">
                    {gaps.gapDetails.map((gap, idx) => (
                      <div
                        key={idx}
                        className="p-4 bg-yellow-50 rounded-lg border border-yellow-200"
                      >
                        <div className="flex items-start space-x-3">
                          <span className="text-yellow-500 text-xl">⚠️</span>
                          <div className="flex-1">
                            <p className="font-semibold text-yellow-800">
                              Lesson: {gap.lessonId}
                            </p>
                            <p className="text-sm text-yellow-700">
                              Average score: {gap.score}% across {gaps.totalGaps} attempts
                            </p>
                            <p className="text-sm text-yellow-600 mt-1">
                              Recommendation: {gap.suggestion}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-5xl mb-4">🎉</div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">
                  No Knowledge Gaps Detected!
                </h4>
                <p className="text-gray-600">
                  You've completed all lessons with excellent scores.
                  Keep up the great work!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* All Gaps Overview */}
      {quizAttempts.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            All Courses - Gap Overview
          </h3>

          <div className="grid md:grid-cols-3 gap-6">
            {mockCourses.map((course) => {
              const courseGaps = getGapAnalysisSummary(
                quizAttempts.filter((a) => a.courseId === course.id),
                course.lessons?.length || 0
              );

              return (
                <div
                  key={course.id}
                  className={`p-5 rounded-xl border-2 transition hover:shadow-lg ${
                    courseGaps.hasGaps
                      ? 'bg-yellow-50 border-yellow-300'
                      : 'bg-green-50 border-green-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-900">
                      {course.title}
                    </h4>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        courseGaps.hasGaps
                          ? 'bg-yellow-200 text-yellow-800'
                          : 'bg-green-200 text-green-800'
                      }`}
                    >
                      {courseGaps.totalGaps > 0 ? 'Needs Review' : 'Excellent'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">
                      Quiz Attempts: <strong>{courseGaps.totalGaps}</strong>
                    </p>
                    <p className="text-sm text-gray-600">
                      Lessons: <strong>{course.lessons?.length || 0}</strong>
                    </p>
                    {courseGaps.hasGaps && (
                      <p className="text-sm text-yellow-600">
                        Avg Score: <strong>{gaps.gapDetails[0]?.score || 'N/A'}%</strong>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Learning Recommendations */}
      {quizAttempts.length > 0 && (
        <div className="bg-gradient-to-br from-primary-50 to-blue-50 rounded-xl shadow-md p-6 mb-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            📈 Learning Effectiveness
          </h3>

          <div className="grid md:grid-cols-3 gap-6">
            {mockCourses.map((course) => {
              const effectiveness = getLearningEffectiveness(
                course.id,
                quizAttempts.filter((a) => a.courseId === course.id)
              );

              return (
                <div
                  key={course.id}
                  className={`p-4 rounded-lg ${
                    effectiveness.percentageEffective === 100
                      ? 'bg-green-100'
                      : 'bg-yellow-100'
                  }`}
                >
                  <h4 className="font-semibold text-gray-900 mb-2">
                    {course.title}
                  </h4>
                  <p className="text-sm text-gray-600">
                    {effectiveness.recommendation}
                  </p>
                  {effectiveness.percentageEffective !== null && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Effective</span>
                        <span className="font-semibold">
                          {effectiveness.percentageEffective}%
                        </span>
                      </div>
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            effectiveness.percentageEffective === 100
                              ? 'bg-green-500'
                              : 'bg-yellow-500'
                          }`}
                          style={{
                            width: `${effectiveness.percentageEffective}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeGaps;
