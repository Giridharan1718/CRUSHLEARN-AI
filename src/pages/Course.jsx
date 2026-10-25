import { useParams, Link } from 'react-router-dom';
import { getCourseById } from '../data/mockCourseData';
import {
  getActivityTypeDescription,
  getActivityTypeLabel,
} from '../content/index.mjs';
import { AuthService } from '../utils/auth';
import { getCourseCompletionStats, isLessonCompleted } from '../utils/lessonProgress.mjs';
import ProgressBar from '../components/ProgressBar';

const LEVEL_STYLES = {
  Beginner: 'bg-success-soft text-success',
  Intermediate: 'bg-warning-soft text-warning',
  Advanced: 'bg-danger-soft text-danger',
};

function ActivityChips({ course, lesson }) {
  const types = [
    ...new Set((lesson.activities || []).map((activity) => activity.type)),
  ];
  if (types.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {types.map((type) => (
        <span
          key={type}
          title={getActivityTypeDescription(course, type)}
          className="px-2 py-1 text-xs font-medium rounded bg-line-subtle text-ink-muted"
        >
          {getActivityTypeLabel(course, type)}
        </span>
      ))}
    </div>
  );
}

const Course = () => {
  const { courseId } = useParams();
  const course = getCourseById(courseId);
  const user = AuthService.getCurrentUser();

  if (!course) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-ink mb-4">
            Course Not Found
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

  const stats = getCourseCompletionStats(user, course);
  let lessonNumber = 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          to="/dashboard"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* Course header */}
      <div className="bg-surface rounded-2xl shadow-lg overflow-hidden mb-8">
        <div className="md:flex">
          <div className="md:w-2/5">
            <img
              src={course.thumbnail}
              alt={course.title}
              className="w-full h-64 md:h-full object-cover"
            />
          </div>

          <div className="md:w-3/5 p-8">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span
                className={`px-3 py-1 text-sm font-semibold rounded-full ${
                  LEVEL_STYLES[course.level] || 'bg-line-subtle text-ink-muted'
                }`}
              >
                {course.level}
              </span>
              <span className="px-3 py-1 bg-primary-50 text-primary-700 text-sm font-semibold rounded-full">
                {course.subject}
              </span>
              <span className="text-ink-subtle text-sm">{course.duration}</span>
            </div>

            <h1 className="text-3xl font-bold text-ink mb-3">
              {course.title}
            </h1>

            <p className="text-ink-muted text-lg mb-6">{course.description}</p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-muted mb-6">
              <span>{course.instructor}</span>
              <span>{course.enrolled?.toLocaleString?.() ?? 0} students</span>
              <span>{course.rating} rating</span>
            </div>

            <ProgressBar
              progress={stats.percentage}
              label="Overall Progress"
              showPercentage={true}
            />
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Modules and lessons */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-ink">
              Course Content
            </h2>
            <span className="text-sm text-ink-subtle">
              {course.modules.length}{' '}
              {course.modules.length === 1 ? 'module' : 'modules'} ·{' '}
              {course.lessons.length} lessons
            </span>
          </div>

          <div className="space-y-8">
            {course.modules.map((module, moduleIndex) => (
              <section key={module.id}>
                <div className="bg-surface rounded-xl shadow-md p-5 mb-4 border-l-4 border-primary-500">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 mb-1">
                        Module {moduleIndex + 1}
                      </p>
                      <h3 className="text-xl font-bold text-ink">
                        {module.title}
                      </h3>
                      {module.description && (
                        <p className="text-sm text-ink-muted mt-1">
                          {module.description}
                        </p>
                      )}
                    </div>
                    <span
                      className={`flex-shrink-0 px-3 py-1 text-xs font-semibold rounded-full ${
                        LEVEL_STYLES[module.level] ||
                        'bg-line-subtle text-ink-muted'
                      }`}
                    >
                      {module.level}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  {module.lessons.map((lesson) => {
                    lessonNumber += 1;
                    const isCompleted = isLessonCompleted(
                      user,
                      course.id,
                      lesson.id
                    );
                    const prerequisiteLessons = (
                      lesson.prerequisiteLessonIds || []
                    )
                      .map((id) =>
                        course.lessons.find((item) => item.id === id)
                      )
                      .filter(Boolean);

                    return (
                      <Link
                        key={lesson.id}
                        to={`/course/${courseId}/lesson/${lesson.id}`}
                        className="block bg-surface rounded-xl shadow-md hover:shadow-lg transition p-6 group"
                      >
                        <div className="flex items-start space-x-4">
                          <div
                            className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center font-bold ${
                              isCompleted
                                ? 'bg-success-soft text-success'
                                : 'bg-line-subtle text-ink-muted'
                            }`}
                          >
                            {isCompleted ? '✓' : lessonNumber}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-4 mb-2">
                              <h4 className="text-lg font-semibold text-ink group-hover:text-primary-600 transition">
                                {lesson.title}
                              </h4>
                              <span className="flex-shrink-0 text-sm text-ink-subtle">
                                {lesson.duration}
                              </span>
                            </div>

                            <p className="text-ink-muted text-sm mb-3">
                              {lesson.summary}
                            </p>

                            {prerequisiteLessons.length > 0 && (
                              <p className="text-xs text-ink-subtle mb-3">
                                Requires:{' '}
                                {prerequisiteLessons
                                  .map((item) => item.title)
                                  .join(', ')}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <ActivityChips course={course} lesson={lesson} />
                              {isCompleted && (
                                <span className="text-xs text-success font-medium">
                                  ✓ Completed
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="md:col-span-1">
          <div className="bg-surface rounded-xl shadow-md p-6 sticky top-24">
            <h3 className="text-lg font-bold text-ink mb-4">
              Course Stats
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Total Lessons</span>
                <span className="font-semibold text-ink">
                  {stats.total}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Completed</span>
                <span className="font-semibold text-success">
                  {stats.completed}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Remaining</span>
                <span className="font-semibold text-primary-600">
                  {stats.remaining}
                </span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-line">
              <h4 className="font-semibold text-ink mb-3">
                Learning objectives
              </h4>
              <ul className="space-y-3 text-sm text-ink-muted">
                {course.objectives.map((objective) => (
                  <li key={objective.id} className="flex items-start space-x-2">
                    <span className="text-success mt-1">✓</span>
                    <span>{objective.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Course;
