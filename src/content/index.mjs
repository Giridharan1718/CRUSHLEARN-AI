import {
  CORE_ACTIVITY_TYPES,
  CONTENT_BLOCK_TYPES,
  COURSE_LEVELS,
  COURSE_SCHEMA_VERSION,
  RUBRIC_LEVELS,
  findLesson,
  findModuleForLesson,
  flattenCourseLessons,
  getActivityById,
  getActivityTypeDescription,
  getActivityTypeLabel,
  getContentBlockTypeLabel,
  getCourseLessonCount,
  getLessonContext as resolveLessonContext,
  getLessonObjectives,
  getModuleLessons,
  getPrerequisiteLessons,
  getRequiredActivityIds,
  validateCourse,
  validateCourseCatalog,
} from './schema.mjs';
import { webDevelopmentCourse } from './courses/webDevelopment.mjs';
import { pythonProgrammingCourse } from './courses/pythonProgramming.mjs';
import { advancedReactCourse } from './courses/advancedReact.mjs';

// Canonical authored content. Each course is plain data in its own module.
export const courseCatalog = [
  webDevelopmentCourse,
  pythonProgrammingCourse,
  advancedReactCourse,
];

// The rest of the application historically consumes flat `course.lessons`
// objects. Build that compatibility view from the structured modules instead of
// duplicating authored content. New screens can use blocks, activities and
// modules directly.
function toLegacyQuiz(lesson) {
  const quizActivity = (lesson.activities || []).find(
    (activity) => activity.type === 'quiz'
  );
  if (!quizActivity) return undefined;
  return (quizActivity.questions || []).map((question) => ({
    question: question.prompt,
    options: question.options,
    correctIndex: question.correctIndex,
    explanation: question.explanation || '',
    skill: question.skill,
    category: question.category,
  }));
}

function toLegacySimulation(lesson) {
  const simulationActivity = (lesson.activities || []).find(
    (activity) => activity.type === 'simulation'
  );
  if (!simulationActivity || !simulationActivity.task) return undefined;
  return {
    ...simulationActivity.task,
    id: simulationActivity.task.id || simulationActivity.id,
    difficulty: simulationActivity.task.difficulty || lesson.level,
  };
}

function toLegacyLesson(course, lesson) {
  const blocks = Array.isArray(lesson.blocks) ? lesson.blocks : [];
  const images = blocks.filter((block) => block.type === 'image');
  const video = blocks.find((block) => block.type === 'video');
  const hasProject = (lesson.activities || []).some(
    (activity) => activity.type === 'project'
  );
  return {
    ...lesson,
    content: lesson.summary,
    type: hasProject ? 'project' : video ? 'video' : 'interactive',
    slides:
      images.length > 0
        ? images.map((image) => image.src)
        : [course.thumbnail],
    videoUrl: video?.src,
    quiz: toLegacyQuiz(lesson),
    simulation: toLegacySimulation(lesson),
    prerequisiteLessonIds: lesson.prerequisites?.lessonIds || [],
    prerequisiteObjectiveIds: lesson.prerequisites?.objectiveIds || [],
    objectiveIds: Array.isArray(lesson.objectiveIds) ? lesson.objectiveIds : [],
  };
}

function createCourseView(course) {
  const lessons = [];
  const modules = (course.modules || []).map((module) => {
    const moduleLessons = getModuleLessons(module).map((lesson) => {
      const viewLesson = {
        ...toLegacyLesson(course, lesson),
        moduleId: module.id,
        moduleTitle: module.title,
        moduleLevel: module.level,
      };
      lessons.push(viewLesson);
      return viewLesson;
    });
    return { ...module, lessons: moduleLessons };
  });
  return {
    ...course,
    modules,
    lessons,
    lessonCount: lessons.length,
  };
}

export const courses = courseCatalog.map(createCourseView);

const coursesById = new Map(courses.map((course) => [course.id, course]));

export function getCourseById(courseId) {
  if (!courseId) return null;
  return coursesById.get(courseId) || null;
}

export function getLessonById(courseId, lessonId) {
  const course = getCourseById(courseId);
  if (!course) return null;
  return findLesson(course, lessonId);
}

export function getCourseModules(courseId) {
  const course = getCourseById(courseId);
  return course && Array.isArray(course.modules) ? course.modules : [];
}

export function getModuleForLesson(courseId, lessonId) {
  const course = getCourseById(courseId);
  return course ? findModuleForLesson(course, lessonId) : null;
}

// A resolved context is what the structured lesson page needs: the course,
// module, canonical lesson, objective objects, prerequisite lessons and
// previous/next navigation.
export function getLessonContext(courseId, lessonId) {
  const course = getCourseById(courseId);
  return course ? resolveLessonContext(course, lessonId) : null;
}

export function getCourseObjectives(courseOrId) {
  const course =
    typeof courseOrId === 'string' ? getCourseById(courseOrId) : courseOrId;
  return course && Array.isArray(course.objectives) ? course.objectives : [];
}

export function getLessonObjectiveObjects(courseOrId, lesson) {
  const course =
    typeof courseOrId === 'string' ? getCourseById(courseOrId) : courseOrId;
  return getLessonObjectives(course, lesson);
}

export function getPrerequisiteLessonsForLesson(courseId, lessonId) {
  const context = getLessonContext(courseId, lessonId);
  if (!context) return [];
  return getPrerequisiteLessons(context.course, context.lesson);
}

export function getCourseLessonCountById(courseId) {
  const course = getCourseById(courseId);
  return course ? getCourseLessonCount(course) : 0;
}

export function getAllSubjects() {
  return [...new Set(courses.map((course) => course.subject))];
}

export {
  CORE_ACTIVITY_TYPES,
  CONTENT_BLOCK_TYPES,
  COURSE_LEVELS,
  COURSE_SCHEMA_VERSION,
  RUBRIC_LEVELS,
  findLesson,
  flattenCourseLessons,
  getActivityById,
  getActivityTypeDescription,
  getActivityTypeLabel,
  getContentBlockTypeLabel,
  getCourseLessonCount,
  getRequiredActivityIds,
  validateCourse,
  validateCourseCatalog,
};
