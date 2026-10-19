import { useParams, Link } from 'react-router-dom';
import { getCourseById } from '../data/mockCourseData';
import { AuthService } from '../utils/auth';
import ProgressBar from '../components/ProgressBar';

const Course = () => {
  const { courseId } = useParams();
  const course = getCourseById(courseId);
  const user = AuthService.getCurrentUser();

  if (!course) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
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

  const completedLessons = user.completedLessons?.filter((id) =>
    course.lessons.some((lesson) => lesson.id === id)
  ) || [];

  const progress = (completedLessons.length / course.lessons.length) * 100;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          to="/dashboard"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* Course Header */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-8">
        <div className="md:flex">
          <div className="md:w-2/5">
            <img
              src={course.thumbnail}
              alt={course.title}
              className="w-full h-64 md:h-full object-cover"
            />
          </div>
          
          <div className="md:w-3/5 p-8">
            <div className="flex items-center space-x-2 mb-3">
              <span className="px-3 py-1 bg-primary-100 text-primary-700 text-sm font-semibold rounded-full">
                {course.level}
              </span>
              <span className="text-gray-500 text-sm">
                {course.duration}
              </span>
            </div>
            
            <h1 className="text-3xl font-bold text-gray-900 mb-3">
              {course.title}
            </h1>
            
            <p className="text-gray-600 text-lg mb-6">
              {course.description}
            </p>
            
            <div className="flex items-center space-x-6 text-sm text-gray-600 mb-6">
              <div className="flex items-center space-x-2">
                <span>👨‍🏫</span>
                <span>{course.instructor}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span>👥</span>
                <span>{course.enrolled.toLocaleString()} students</span>
              </div>
              <div className="flex items-center space-x-2">
                <span>⭐</span>
                <span>{course.rating} rating</span>
              </div>
            </div>
            
            <ProgressBar
              progress={progress}
              label="Overall Progress"
              showPercentage={true}
            />
          </div>
        </div>
      </div>

      {/* Course Content */}
      <div className="grid md:grid-cols-3 gap-8">
        {/* Lessons List */}
        <div className="md:col-span-2">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Course Content
          </h2>
          
          <div className="space-y-4">
            {course.lessons.map((lesson, index) => {
              const isCompleted = completedLessons.includes(lesson.id);
              
              return (
                <Link
                  key={lesson.id}
                  to={`/course/${courseId}/lesson/${lesson.id}`}
                  className="block bg-white rounded-xl shadow-md hover:shadow-lg transition p-6 group"
                >
                  <div className="flex items-start space-x-4">
                    <div
                      className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center font-bold ${
                        isCompleted
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {isCompleted ? '✓' : index + 1}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition">
                          {lesson.title}
                        </h3>
                        <span className="text-sm text-gray-500">
                          {lesson.duration}
                        </span>
                      </div>
                      
                      <p className="text-gray-600 text-sm mb-3">
                        {lesson.content}
                      </p>
                      
                      <div className="flex items-center space-x-3">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            lesson.type === 'video'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {lesson.type === 'video' ? '🎥 Video' : '💻 Project'}
                        </span>
                        
                        {isCompleted && (
                          <span className="text-xs text-green-600 font-medium">
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
        </div>

        {/* Sidebar Info */}
        <div className="md:col-span-1">
          <div className="bg-white rounded-xl shadow-md p-6 sticky top-24">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Course Stats
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Total Lessons</span>
                <span className="font-semibold text-gray-900">
                  {course.lessons.length}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Completed</span>
                <span className="font-semibold text-green-600">
                  {completedLessons.length}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Remaining</span>
                <span className="font-semibold text-primary-600">
                  {course.lessons.length - completedLessons.length}
                </span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="font-semibold text-gray-900 mb-3">
                What you'll learn
              </h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start space-x-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Build real-world projects</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Master core concepts</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Get AI-powered guidance</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Earn a certificate</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Course;
