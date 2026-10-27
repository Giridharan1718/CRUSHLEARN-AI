import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AuthService } from '../utils/auth';
import { GuidanceEngine } from '../learning/guidanceEngine.mjs';
import { courses } from '../data/mockCourseData';
import { classifyEvidence, ASSESSMENT_STATES, getStateLabel, getStateColor, getStateIcon } from '../utils/evidenceClassification';
import { getRecommendationLabel } from '../utils/recommendationEngine';
import {
  countCompletedLessons,
  getCourseCompletionStats,
} from '../utils/lessonProgress.mjs';
import { getProgressForAllSubjects } from '../utils/prerequisiteProgress.mjs';
import { getLessonObjectiveObjects } from '../content/index.mjs';

const RESULT_KEY = 'final_skill_check_result';

const SkillPassport = () => {
  const user = AuthService.getCurrentUser();
  
  // Get skills from completed courses
  const skills = GuidanceEngine.assessSkills(user.enrolledCourses || []);
  
  // Calculate overall stats
  const totalLessonsCompleted = countCompletedLessons(user, courses);
  const coursesInProgress = user.enrolledCourses?.length || 0;

  // Derive a per-course evidence summary from the learner's recorded progress.
  const evidenceStates = useMemo(() => {
    const summary = {};
    (user.enrolledCourses || []).forEach((courseId) => {
      const course = courses.find((item) => item.id === courseId);
      if (!course) return;
      const completedCount = getCourseCompletionStats(user, course).completed;
      const totalLessons = course.lessons.length || 1;
      let state = ASSESSMENT_STATES.NOT_ASSESSED;
      if (completedCount >= totalLessons) {
        state = ASSESSMENT_STATES.DEMONSTRATED;
      } else if (completedCount > 0) {
        state = ASSESSMENT_STATES.DEVELOPING;
      }
      summary[course.title] = {
        state,
        note:
          completedCount === 0
            ? 'No lessons completed yet'
            : `${completedCount} of ${totalLessons} lessons completed`,
      };
    });
    return summary;
  }, [user.enrolledCourses, user.completedLessons]);

  const completedObjectiveIds = useMemo(() => {
    const ids = new Set();
    (user.completedLessons || []).forEach((lessonId) => {
      const course = courses.find((item) =>
        item.lessons.some((lesson) => lesson.id === lessonId)
      );
      const lesson = course?.lessons.find((item) => item.id === lessonId);
      const objectives =
        course && lesson ? getLessonObjectiveObjects(course, lesson) : [];
      objectives.forEach((objective) => ids.add(objective.id));
    });
    return [...ids];
  }, [user.completedLessons]);

  const objectiveProgress = useMemo(
    () => getProgressForAllSubjects(completedObjectiveIds),
    [completedObjectiveIds]
  );

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
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink mb-2">
          Skill Passport 🎓
        </h1>
        <p className="text-ink-muted">
          Track your learning achievements and showcase your skills
        </p>
      </div>

      {/* Profile Card */}
      <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl shadow-xl p-8 mb-8 text-ink-inverse">
        <div className="flex items-center space-x-6">
          <div className="w-24 h-24 bg-surface rounded-full flex items-center justify-center">
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
      <div className="bg-surface rounded-2xl shadow-lg p-8 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-ink">My Skills</h2>
          <span className="px-3 py-1 bg-success-soft text-success text-sm font-semibold rounded-full">
            {skills.length} skills
          </span>
        </div>

        {skills.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {skills.map((skill, index) => (
              <div
                key={index}
                className="bg-gradient-to-br from-accent-soft to-info-soft rounded-xl p-4 text-center border-2 border-primary-100 hover:border-primary-300 transition"
              >
                <div className="text-3xl mb-2">✨</div>
                <p className="font-semibold text-ink">{skill}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎯</div>
            <p className="text-ink-muted mb-4">
              Complete lessons to unlock skills
            </p>
            <Link
              to="/dashboard"
              className="inline-block px-6 py-3 bg-accent text-ink-inverse rounded-lg font-medium hover:bg-accent-strong transition"
            >
              Start Learning
            </Link>
          </div>
        )}
      </div>

      {/* Evidence States Section */}
      <div className="bg-surface rounded-2xl shadow-lg p-8 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-ink">Evidence States</h2>
          <span className="text-sm text-ink-subtle">
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
              <p className="font-semibold text-ink">{label}</p>
              <p className="text-xs text-ink-subtle mt-1">
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
          <h3 className="text-lg font-bold text-ink mb-4">
            Subject Evidence Summary
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {Object.entries(evidenceStates).map(([subject, evidence]) => (
              <div key={subject} className="bg-line-subtle rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <span className="font-semibold text-ink">{subject}</span>
                  <span className={`px-2 py-1 text-xs font-bold rounded-full ${getStateColor(evidence?.state || 'NOT_ASSESSED')}`}>
                    {getStateLabel(evidence?.state || 'NOT_ASSESSED')}
                  </span>
                </div>
                <p className="text-sm text-ink-muted">{evidence?.note || 'No evidence collected yet'}</p>
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

      {/* Objective Progress Section */}
      <div className="bg-surface rounded-2xl shadow-lg p-8 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-ink">Objective Progress</h2>
          <span className="text-sm text-ink-subtle">
            Reusable learning objectives completed across subjects
          </span>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {Object.entries(objectiveProgress).map(([subject, progress]) => (
            <div key={subject} className="bg-line-subtle rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-ink capitalize">
                  {subject}
                </span>
                <span className="text-sm text-ink-muted">
                  {progress.completedObjectives}/{progress.totalObjectives}
                </span>
              </div>
              <div className="w-full bg-line rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-primary-500 to-primary-600 h-2 rounded-full"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Certificates Section */}
      <div className="bg-surface rounded-2xl shadow-lg p-8 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-ink">Certificates</h2>
          <span className="px-3 py-1 bg-primary-100 text-primary-700 text-sm font-semibold rounded-full">
            {certificates.filter((c) => c.status === 'completed').length} earned
          </span>
        </div>

        {!hasPassedFinal && (
          <div className="border border-line bg-line-subtle rounded-lg p-4 mb-4">
            <p className="text-sm text-ink-muted">
              Complete the Final Skill Check to unlock your certificate.
            </p>
            <Link
              to="/final-skill-check"
              className="inline-block mt-3 px-4 py-2 bg-ink text-ink-inverse rounded-md text-sm font-semibold"
            >
              Start Final Skill Check
            </Link>
          </div>
        )}

        <div className="space-y-4">
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="border-2 border-line rounded-xl p-6 hover:border-primary-300 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-bold text-ink">
                      {cert.title}
                    </h3>
                    {cert.status === 'in-progress' ? (
                      <span className="px-2 py-1 bg-warning-soft text-warning text-xs font-semibold rounded">
                        In Progress
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-success-soft text-success text-xs font-semibold rounded">
                        ✓ Completed
                      </span>
                    )}
                  </div>
                  
                  <p className="text-ink-muted text-sm mb-3">
                    Issue Date: {cert.issueDate}
                  </p>

                  {cert.status === 'in-progress' && (
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-ink-muted">Progress</span>
                        <span className="font-semibold text-primary-600">
                          {cert.progress}%
                        </span>
                      </div>
                      <div className="w-full bg-line rounded-full h-2">
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
                    className="ml-4 px-4 py-2 bg-accent text-ink-inverse rounded-lg hover:bg-accent-strong font-medium transition"
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
            <p className="text-ink-muted mb-4">
              No certificates yet. Complete courses to earn certificates!
            </p>
          </div>
        )}
      </div>

      {/* Learning Journey */}
      <div className="bg-surface rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-ink mb-6">
          Learning Journey
        </h2>

        <div className="space-y-6">
          {user.enrolledCourses.map((courseId, index) => {
            const course = courses.find((c) => c.id === courseId);
            if (!course) return null;

            const { completed, percentage } = getCourseCompletionStats(
              user,
              course
            );

            return (
              <div key={courseId} className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center font-bold text-primary-700">
                  {index + 1}
                </div>
                
                <div className="flex-1">
                  <Link
                    to={`/course/${courseId}`}
                    className="text-lg font-semibold text-ink hover:text-primary-600 transition"
                  >
                    {course.title}
                  </Link>
                  <p className="text-ink-muted text-sm mb-2">
                    {completed} of {course.lessons.length} lessons completed
                  </p>
                  
                  <div className="w-full bg-line rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-success to-success-strong h-2 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
};

export default SkillPassport;
