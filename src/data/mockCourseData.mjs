// Backwards-compatible data entry point.
//
// Authored course content now lives in src/content/courses/*.mjs. The content
// catalog exposes the flat `course.lessons` shape this application has always
// consumed, as well as the structured modules/blocks/activities used by the
// reusable course renderers.

export {
  courseCatalog,
  courses,
  getAllSubjects,
  getCourseById,
  getCourseLessonCountById,
  getCourseModules,
  getCourseObjectives,
  getLessonById,
  getLessonContext,
  getLessonObjectiveObjects,
  getModuleForLesson,
  getPrerequisiteLessonsForLesson,
} from '../content/index.mjs';
