import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AuthService } from '../utils/auth';
import { GuidanceEngine } from '../ai/guidanceEngine';
import { courses } from '../data/mockCourseData';
import { findLessonById, getCourseProgress, getSkillMastery, getEvidenceStates } from '../utils/prerequisiteProgress';
import { classifyEvidence, ASSESSMENT_STATES, getStateLabel, getStateColor, getStateIcon } from '../utils/evidenceClassification';
import { getRecommendationLabel } from '../utils/recommendationEngine';

const RESULT_KEY = 'final_skill_check_result';

const SkillPassport = () => {
  const user = AuthService.getCurrentUser();
  
  // Get skills from completed courses
  const skills = GuidanceEngine.assessSkills(user.enrolledCourses || []);
  
  // Calculate overall stats
  const totalLessonsCompleted = user.completedLessons?.length || 0;
  const coursesInProgress = user.enrolledCourses?.length || 0;

  const finalResult = useMemo(() => {
    const raw = localStorage.getItem(RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  }, []);

  const hasPassedFinal = Boolean(finalResult?.passed);
  const issuedDate = finalResult?.submittedAt
    ? new Date(finalResult.submittedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Pending';

  const certificates = [
    {
      id: 'cert-1',
      title: 'Web Development Fundamentals',
      issueDate: hasPassedFinal ? issuedDate : 'Pending',
      status: hasPassedFinal ? 'completed' : 'in-progress',
      progress: hasPassedFinal ? 100 : 0,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Skill Passport 🎓
        </h1>
        <p className="text-gray-600">
          Track your learning achievements and showcase your skills
        </p>
      </div>

      {/* Profile Card */}
      <div className="bg-gradient-to-br from-primary-500 to-blue-600 rounded-2xl shadow-xl p-8 mb-8 text-white">
        <div className="flex items-center space-x-6">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center">
            <span className="text-primary-700 font-bold text-4xl">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
          
          <div className="flex-1">
            <h2 className="text-3xl font-bold mb-2">{user.name}</h2>
            <p className="text-primary-100 mb-4">{user.email}</p>
            
            <div className="flex items-center space-x-6">
              <div>
                <p className="text-3xl font-bold">{totalLessonsCompleted}</p>
                <p className="text-primary-100 text-sm">Lessons Completed</p>
              </div>
              <div>
                <p className="text-3xl font-bold">{coursesInProgress}</p>
                <p className="text-primary-100 text-sm">Courses in Progress</p>
              </div>
              <div>
                <p className="text-3xl font-bold">{skills.length}</p>
                <p className="text-primary-100 text-sm">Skills Acquired</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Skills Section */}
      <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">My Skills</h2>
          <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-semibold rounded-full">
            {skills.length} skills
          </span>
        </div>

        {skills.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {skills.map((skill, index) => (
              <div
                key={index}
                className="bg-gradient-to-br from-primary-50 to-blue-50 rounded-xl p-4 text-center border-2 border-primary-100 hover:border-primary-300 transition"
              >
                <div className="text-3xl mb-2">✨</div>
                <p className="font-semibold text-gray-900">{skill}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎯</div>
            <p className="text-gray-600 mb-4">
              Complete lessons to unlock skills
            </p>
            <Link
              to="/dashboard"
              className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
            >
              Start Learning
            </Link>
          </div>
        )}
      </div>

      {/* Evidence States Section */}
      <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Evidence States</h2>
          <span className="text-sm text-gray-500">
            Current assessment of your knowledge across subjects
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Object.entries(ASSESSMENT_STATES).map(([state, label]) => (
            <div
              key={state}
              className={`rounded-xl p-4 border-2 transition ${getStateColor(state === 'NOT_ASSESSED' ? 'NOT_ASSESSED' : state)}`}
            >
              <div className="text-3xl mb-2">{getStateIcon(state)}</div>
              <p className="font-semibold text-gray-900">{label}</p>
              <p className="text-xs text-gray-500 mt-1">
                {state === 'NOT_ASSESSED' && 'Never assessed'}
                {state === 'NEEDS_PRACTICE' && 'Needs targeted practice'}
                {state === 'DEVELOPING' && 'Improving but not confident'}
                {state === 'DEMONSTRATED' && 'Can apply independently'}
                {state === 'REVIEW_RECOMMENDED' && 'Revisit soon'}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            Subject Evidence Summary
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {Object.entries(evidenceStates).map(([subject, evidence]) => (
              <div key={subject} className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <span className="font-semibold text-gray-900">{subject}</span>
                  <span className={`px-2 py-1 text-xs font-bold rounded-full ${getStateColor(evidence?.state || 'NOT_ASSESSED')}`}>
                    {getStateLabel(evidence?.state || 'NOT_ASSESSED')}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{evidence?.note || 'No evidence collected yet'}</p>
                {evidence?.recommendedActivity && (
                  <p className="text-xs text-primary-600 mt-2">
                    Suggested: {getRecommendationLabel(evidence.recommendedActivity)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Certificates Section */}
      <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Certificates</h2>
          <span className="px-3 py-1 bg-primary-100 text-primary-700 text-sm font-semibold rounded-full">
            {certificates.filter((c) => c.status === 'completed').length} earned
          </span>
        </div>

        {!hasPassedFinal && (
          <div className="border border-gray-200 bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-700">
              Complete the Final Skill Check to unlock your certificate.
            </p>
            <Link
              to="/final-skill-check"
              className="inline-block mt-3 px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-semibold"
            >
              Start Final Skill Check
            </Link>
          </div>
        )}

        <div className="space-y-4">
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="border-2 border-gray-200 rounded-xl p-6 hover:border-primary-300 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-bold text-gray-900">
                      {cert.title}
                    </h3>
                    {cert.status === 'in-progress' ? (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded">
                        In Progress
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">
                        ✓ Completed
                      </span>
                    )}
                  </div>
                  
                  <p className="text-gray-600 text-sm mb-3">
                    Issue Date: {cert.issueDate}
                  </p>

                  {cert.status === 'in-progress' && (
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Progress</span>
                        <span className="font-semibold text-primary-600">
                          {cert.progress}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-primary-500 to-primary-600 h-2 rounded-full"
                          style={{ width: `${cert.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {cert.status === 'completed' && (
                  <Link
                    to={`/certificate/${cert.id}`}
                    className="ml-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition"
                  >
                    View Certificate
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {certificates.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📜</div>
            <p className="text-gray-600 mb-4">
              No certificates yet. Complete courses to earn certificates!
            </p>
          </div>
        )}
      </div>

      {/* Learning Journey */}
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Learning Journey
        </h2>

        <div className="space-y-6">
          {user.enrolledCourses.map((courseId, index) => {
            const course = courses.find((c) => c.id === courseId);
            if (!course) return null;

            const completedLessons = user.completedLessons?.filter((id) =>
              course.lessons.some((lesson) => lesson.id === id)
            ) || [];

            const progress =
              (completedLessons.length / course.lessons.length) * 100;

            return (
              <div key={courseId} className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center font-bold text-primary-700">
                  {index + 1}
                </div>
                
                <div className="flex-1">
                  <Link
                    to={`/course/${courseId}`}
                    className="text-lg font-semibold text-gray-900 hover:text-primary-600 transition"
                  >
                    {course.title}
                  </Link>
                  <p className="text-gray-600 text-sm mb-2">
                    {completedLessons.length} of {course.lessons.length} lessons
                    completed
                  </p>
                  
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SkillPassport;
