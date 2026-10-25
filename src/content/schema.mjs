// Structured course content schema, validation and pure selectors.
//
// Course data lives in src/content/courses/*.mjs. This module contains no
// subject-specific content and no React code, so the same validation and
// lookup functions work for every subject. Subject-specific activity types
// are declared by a course and rendered through the activity registry in
// src/components/course.

export const COURSE_SCHEMA_VERSION = 1;
export const COURSE_LEVELS = Object.freeze([
  'Beginner',
  'Intermediate',
  'Advanced',
]);
export const CONTENT_BLOCK_TYPES = Object.freeze(['text', 'video', 'image']);
export const CORE_ACTIVITY_TYPES = Object.freeze([
  'quiz',
  'exercise',
  'simulation',
  'project',
]);
export const RUBRIC_LEVELS = Object.freeze([
  'emerging',
  'proficient',
  'advanced',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function formatPath(path, key) {
  return path ? `${path}.${key}` : key;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function getModuleLessons(module) {
  return module && Array.isArray(module.lessons) ? module.lessons : [];
}

export function flattenCourseLessons(course) {
  if (!course || !Array.isArray(course.modules)) return [];
  return course.modules.flatMap((module) =>
    getModuleLessons(module).map((lesson) => ({
      ...lesson,
      moduleId: module.id,
      moduleTitle: module.title,
      moduleLevel: module.level,
    }))
  );
}

export function findLesson(course, lessonId) {
  if (!course || !lessonId) return null;
  return (
    flattenCourseLessons(course).find((lesson) => lesson.id === lessonId) ||
    null
  );
}

export function findModuleForLesson(course, lessonId) {
  if (!course || !Array.isArray(course.modules)) return null;
  const directMatch = course.modules.find(
    (module) =>
      module &&
      Array.isArray(module.lessons) &&
      module.lessons.some((lesson) => lesson.id === lessonId)
  );
  if (directMatch) return directMatch;
  const lesson = findLesson(course, lessonId);
  if (!lesson) return null;
  return (
    course.modules.find((module) => module.id === lesson.moduleId) || null
  );
}

export function getLessonContext(course, lessonId) {
  if (!course || !lessonId) return null;
  const lessons = flattenCourseLessons(course);
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) return null;
  const lesson = lessons[index];
  const module = findModuleForLesson(course, lessonId);
  const objectives = (
    Array.isArray(course.objectives) ? course.objectives : []
  ).filter((objective) =>
    (lesson.objectiveIds || objectiveIdsOf(lesson)).includes(objective.id)
  );
  const prerequisiteLessonIds = lesson.prerequisites?.lessonIds || [];
  const prerequisiteLessons = prerequisiteLessonIds
    .map((id) => findLesson(course, id))
    .filter(Boolean);

  return {
    course,
    module,
    lesson,
    objectives,
    prerequisiteLessons,
    previousLesson: index > 0 ? lessons[index - 1] : null,
    nextLesson: index < lessons.length - 1 ? lessons[index + 1] : null,
    index,
    lessonNumber: index + 1,
    totalLessons: lessons.length,
  };
}

function objectiveIdsOf(lesson) {
  return Array.isArray(lesson.objectiveIds) ? lesson.objectiveIds : [];
}

export function getRequiredActivityIds(lesson) {
  if (!lesson) return [];
  const activities = Array.isArray(lesson.activities) ? lesson.activities : [];
  const required = lesson.completion?.requiredActivityIds;
  if (Array.isArray(required)) {
    const activityIds = new Set(activities.map((activity) => activity.id));
    return required.filter((id) => activityIds.has(id));
  }
  return activities.map((activity) => activity.id);
}

export function getActivityById(lesson, activityId) {
  if (!lesson || !Array.isArray(lesson.activities)) return null;
  return (
    lesson.activities.find((activity) => activity.id === activityId) || null
  );
}

export function getLessonObjectives(course, lesson) {
  if (!course || !lesson) return [];
  const objectiveIds = objectiveIdsOf(lesson);
  return (course.objectives || []).filter((objective) =>
    objectiveIds.includes(objective.id)
  );
}

export function getPrerequisiteLessons(course, lesson) {
  if (!course || !lesson) return [];
  return (lesson.prerequisites?.lessonIds || [])
    .map((lessonId) => findLesson(course, lessonId))
    .filter(Boolean);
}

export function getCourseLessonCount(course) {
  return flattenCourseLessons(course).length;
}

const CORE_ACTIVITY_LABELS = Object.freeze({
  quiz: 'Quiz',
  exercise: 'Exercise',
  simulation: 'Simulation',
  project: 'Project',
});

export function getActivityTypeLabel(course, type) {
  return (
    course?.activityExtensions?.[type]?.label ||
    CORE_ACTIVITY_LABELS[type] ||
    type ||
    'Activity'
  );
}

export function getActivityTypeDescription(course, type) {
  return (
    course?.activityExtensions?.[type]?.description ||
    {
      quiz: 'Check understanding with immediate feedback.',
      exercise: 'Practise one focused skill.',
      simulation: 'Apply the skill in a guided task.',
      project: 'Build something and review it against a rubric.',
    }[type] ||
    ''
  );
}

export function getContentBlockTypeLabel(type) {
  return (
    {
      text: 'Reading',
      video: 'Video',
      image: 'Image',
    }[type] ||
    type ||
    'Content'
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateCourseCatalog(catalog) {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return ['course catalog must be a non-empty array'];
  }

  const errors = [];
  const courseIds = new Set();
  catalog.forEach((course, index) => {
    if (!course || !course.id) {
      errors.push(`course[${index}] needs an id`);
      return;
    }
    if (courseIds.has(course.id)) {
      errors.push(`duplicate course id "${course.id}"`);
    }
    courseIds.add(course.id);
    errors.push(...validateCourse(course, `course[${course.id}]`));
  });
  return errors;
}

export function validateCourse(course, path = 'course') {
  if (!isPlainObject(course)) return [`${path} must be an object`];

  const errors = [];
  const requiredStrings = [
    'id',
    'title',
    'subject',
    'description',
    'instructor',
    'duration',
    'thumbnail',
  ];
  requiredStrings.forEach((key) => {
    if (!isNonEmptyString(course[key])) {
      errors.push(`${path}.${key} is required`);
    }
  });

  if (course.schemaVersion !== undefined && course.schemaVersion !== COURSE_SCHEMA_VERSION) {
    errors.push(`${path}.schemaVersion must be ${COURSE_SCHEMA_VERSION}`);
  }
  if (!COURSE_LEVELS.includes(course.level)) {
    errors.push(
      `${path}.level must be one of ${COURSE_LEVELS.join(', ')}`
    );
  }

  const extensions = isPlainObject(course.activityExtensions)
    ? course.activityExtensions
    : {};
  if (
    course.activityExtensions !== undefined &&
    !isPlainObject(course.activityExtensions)
  ) {
    errors.push(`${path}.activityExtensions must be an object when provided`);
  }
  Object.entries(extensions).forEach(([type, definition]) => {
    const extensionPath = `${path}.activityExtensions.${type}`;
    if (!isPlainObject(definition)) {
      errors.push(`${extensionPath} must be an object`);
      return;
    }
    if (!isNonEmptyString(definition.label)) {
      errors.push(`${extensionPath}.label is required`);
    }
    if (
      definition.requiredFields !== undefined &&
      (!Array.isArray(definition.requiredFields) ||
        definition.requiredFields.some((field) => !isNonEmptyString(field)))
    ) {
      errors.push(`${extensionPath}.requiredFields must be an array of strings`);
    }
  });

  const objectives = Array.isArray(course.objectives) ? course.objectives : [];
  if (objectives.length === 0) {
    errors.push(`${path}.objectives must be a non-empty array`);
  }
  const objectiveIds = new Set();
  objectives.forEach((objective, index) => {
    const objectivePath = `${path}.objectives[${index}]`;
    if (!isPlainObject(objective)) {
      errors.push(`${objectivePath} must be an object`);
      return;
    }
    if (!isNonEmptyString(objective.id)) {
      errors.push(`${objectivePath}.id is required`);
      return;
    }
    if (objectiveIds.has(objective.id)) {
      errors.push(`duplicate objective id "${objective.id}"`);
    }
    objectiveIds.add(objective.id);
    if (!isNonEmptyString(objective.title)) {
      errors.push(`${objectivePath}.title is required`);
    }
    if (!isNonEmptyString(objective.description)) {
      errors.push(`${objectivePath}.description is required`);
    }
    if (
      objective.masteryCriteria !== undefined &&
      !isPlainObject(objective.masteryCriteria)
    ) {
      errors.push(`${objectivePath}.masteryCriteria must be an object`);
    }
  });
  // Check prerequisite references after all objective ids are collected so a
  // valid forward reference is not reported as unknown.
  objectives.forEach((objective, index) => {
    if (!isPlainObject(objective) || !objective.id) return;
    const objectivePath = `${path}.objectives[${index}]`;
    (Array.isArray(objective.prerequisiteIds)
      ? objective.prerequisiteIds
      : []
    ).forEach((prerequisiteId) => {
      if (!objectiveIds.has(prerequisiteId)) {
        errors.push(
          `${objectivePath} references unknown prerequisite "${prerequisiteId}"`
        );
      }
      if (prerequisiteId === objective.id) {
        errors.push(`${objectivePath} cannot require itself`);
      }
    });
  });
  if (hasObjectivePrerequisiteCycle(objectives)) {
    errors.push(`${path}.objectives contain a prerequisite cycle`);
  }

  if (!Array.isArray(course.modules) || course.modules.length === 0) {
    errors.push(`${path}.modules must be a non-empty array`);
    return errors;
  }

  const lessonIds = new Set();
  const activityIds = new Set();
  const modules = [];
  course.modules.forEach((module, moduleIndex) => {
    const modulePath = `${path}.modules[${moduleIndex}]`;
    if (!isPlainObject(module)) {
      errors.push(`${modulePath} must be an object`);
      return;
    }
    if (!isNonEmptyString(module.id)) {
      errors.push(`${modulePath}.id is required`);
    }
    if (!isNonEmptyString(module.title)) {
      errors.push(`${modulePath}.title is required`);
    }
    if (!COURSE_LEVELS.includes(module.level)) {
      errors.push(`${modulePath}.level must be one of ${COURSE_LEVELS.join(', ')}`);
    }
    if (!Array.isArray(module.lessons) || module.lessons.length === 0) {
      errors.push(`${modulePath}.lessons must be a non-empty array`);
      return;
    }
    modules.push(module);
    module.lessons.forEach((lesson) => {
      if (!lesson || !lesson.id) return;
      if (lessonIds.has(lesson.id)) {
        errors.push(`duplicate lesson id "${lesson.id}" in ${path}`);
      }
      lessonIds.add(lesson.id);
      if (Array.isArray(lesson.activities)) {
        lesson.activities.forEach((activity) => {
          if (!activity || !activity.id) return;
          if (activityIds.has(activity.id)) {
            errors.push(`duplicate activity id "${activity.id}" in ${path}`);
          }
          activityIds.add(activity.id);
        });
      }
    });
  });

  const moduleIds = new Set();
  modules.forEach((module) => {
    if (moduleIds.has(module.id)) {
      errors.push(`duplicate module id "${module.id}" in ${path}`);
    }
    moduleIds.add(module.id);
  });

  modules.forEach((module, moduleIndex) => {
    module.lessons.forEach((lesson, lessonIndex) => {
      errors.push(
        ...validateLesson({
          lesson,
          course,
          objectiveIds,
          lessonIds,
          activityIds,
          extensions,
          path: `${path}.modules[${moduleIndex}].lessons[${lessonIndex}]`,
        })
      );
    });
  });

  if (hasLessonPrerequisiteCycle(modules)) {
    errors.push(`${path}.modules contain a lesson prerequisite cycle`);
  }

  return errors;
}

function validateLesson({
  lesson,
  course,
  objectiveIds,
  lessonIds,
  activityIds,
  extensions,
  path,
}) {
  if (!isPlainObject(lesson)) return [`${path} must be an object`];
  const errors = [];

  if (!isNonEmptyString(lesson.id)) errors.push(`${path}.id is required`);
  if (!isNonEmptyString(lesson.title)) errors.push(`${path}.title is required`);
  if (!isNonEmptyString(lesson.summary)) {
    errors.push(`${path}.summary is required`);
  }
  if (!isNonEmptyString(lesson.duration)) {
    errors.push(`${path}.duration is required`);
  }
  if (!COURSE_LEVELS.includes(lesson.level)) {
    errors.push(`${path}.level must be one of ${COURSE_LEVELS.join(', ')}`);
  }

  const lessonObjectiveIds = Array.isArray(lesson.objectiveIds)
    ? lesson.objectiveIds
    : [];
  if (lessonObjectiveIds.length === 0) {
    errors.push(`${path}.objectiveIds must be a non-empty array`);
  }
  const seenObjectiveIds = new Set();
  lessonObjectiveIds.forEach((objectiveId) => {
    if (!objectiveIds.has(objectiveId)) {
      errors.push(`${path} references unknown objective "${objectiveId}"`);
    }
    if (seenObjectiveIds.has(objectiveId)) {
      errors.push(`${path} lists objective "${objectiveId}" more than once`);
    }
    seenObjectiveIds.add(objectiveId);
  });

  const prerequisites = lesson.prerequisites;
  if (prerequisites !== undefined && !isPlainObject(prerequisites)) {
    errors.push(`${path}.prerequisites must be an object when provided`);
  }
  const prerequisiteLessonIds = prerequisites?.lessonIds || [];
  if (!Array.isArray(prerequisiteLessonIds)) {
    errors.push(`${path}.prerequisites.lessonIds must be an array`);
  } else {
    prerequisiteLessonIds.forEach((lessonId) => {
      if (!lessonIds.has(lessonId)) {
        errors.push(`${path} references unknown prerequisite lesson "${lessonId}"`);
      }
      if (lessonId === lesson.id) {
        errors.push(`${path} cannot require itself as a prerequisite`);
      }
    });
  }
  const prerequisiteObjectiveIds = prerequisites?.objectiveIds || [];
  if (!Array.isArray(prerequisiteObjectiveIds)) {
    errors.push(`${path}.prerequisites.objectiveIds must be an array`);
  } else {
    prerequisiteObjectiveIds.forEach((objectiveId) => {
      if (!objectiveIds.has(objectiveId)) {
        errors.push(
          `${path} references unknown prerequisite objective "${objectiveId}"`
        );
      }
    });
  }

  const blocks = Array.isArray(lesson.blocks) ? lesson.blocks : [];
  if (blocks.length === 0) {
    errors.push(`${path}.blocks must be a non-empty array`);
  }
  const blockIds = new Set();
  blocks.forEach((block, index) => {
    errors.push(
      ...validateContentBlock(block, `${path}.blocks[${index}]`, blockIds)
    );
  });

  const activities = Array.isArray(lesson.activities) ? lesson.activities : [];
  if (activities.length === 0) {
    errors.push(`${path}.activities must be a non-empty array`);
  }
  activities.forEach((activity, index) => {
    errors.push(
      ...validateActivity({
        activity,
        path: `${path}.activities[${index}]`,
        activityIds,
        extensions,
      })
    );
  });

  if (lesson.completion !== undefined) {
    if (!isPlainObject(lesson.completion)) {
      errors.push(`${path}.completion must be an object when provided`);
    } else if (lesson.completion.requiredActivityIds !== undefined) {
      const requiredIds = lesson.completion.requiredActivityIds;
      if (!Array.isArray(requiredIds) || requiredIds.length === 0) {
        errors.push(
          `${path}.completion.requiredActivityIds must be a non-empty array`
        );
      } else {
        const activityIdSet = new Set(
          activities.map((activity) => activity && activity.id).filter(Boolean)
        );
        requiredIds.forEach((activityId) => {
          if (!activityIdSet.has(activityId)) {
            errors.push(
              `${path}.completion references unknown activity "${activityId}"`
            );
          }
        });
      }
    }
  }

  return errors;
}

function validateContentBlock(block, path, blockIds) {
  if (!isPlainObject(block)) return [`${path} must be an object`];
  const errors = [];
  if (!isNonEmptyString(block.id)) {
    errors.push(`${path}.id is required`);
  } else if (blockIds.has(block.id)) {
    errors.push(`duplicate content block id "${block.id}"`);
  } else {
    blockIds.add(block.id);
  }
  if (!CONTENT_BLOCK_TYPES.includes(block.type)) {
    errors.push(`${path}.type must be one of ${CONTENT_BLOCK_TYPES.join(', ')}`);
    return errors;
  }
  if (!isNonEmptyString(block.title)) {
    errors.push(`${path}.title is required`);
  }

  if (block.type === 'text') {
    const hasParagraphs =
      Array.isArray(block.paragraphs) && block.paragraphs.length > 0;
    if (!hasParagraphs && !isNonEmptyString(block.body)) {
      errors.push(`${path} needs paragraphs or a body`);
    }
    if (
      block.paragraphs !== undefined &&
      (!Array.isArray(block.paragraphs) ||
        block.paragraphs.some((paragraph) => !isNonEmptyString(paragraph)))
    ) {
      errors.push(`${path}.paragraphs must be an array of strings`);
    }
    if (
      block.bullets !== undefined &&
      (!Array.isArray(block.bullets) ||
        block.bullets.some((bullet) => !isNonEmptyString(bullet)))
    ) {
      errors.push(`${path}.bullets must be an array of strings`);
    }
  }

  if (block.type === 'video') {
    if (!isNonEmptyString(block.src)) errors.push(`${path}.src is required`);
    if (block.transcript !== undefined && typeof block.transcript !== 'string') {
      errors.push(`${path}.transcript must be a string when provided`);
    }
  }

  if (block.type === 'image') {
    if (!isNonEmptyString(block.src)) errors.push(`${path}.src is required`);
    if (!isNonEmptyString(block.alt)) errors.push(`${path}.alt is required`);
    if (block.caption !== undefined && typeof block.caption !== 'string') {
      errors.push(`${path}.caption must be a string when provided`);
    }
  }

  return errors;
}

function validateActivity({ activity, path, activityIds, extensions }) {
  if (!isPlainObject(activity)) return [`${path} must be an object`];
  const errors = [];
  if (!isNonEmptyString(activity.id)) {
    errors.push(`${path}.id is required`);
  } else if (activityIds.has(activity.id)) {
    // Duplicate activity ids are reported during the first pass. Keep this
    // check lightweight here so the error is not repeated for every activity.
  }
  if (!isNonEmptyString(activity.title)) {
    errors.push(`${path}.title is required`);
  }
  if (!isNonEmptyString(activity.type)) {
    errors.push(`${path}.type is required`);
    return errors;
  }

  const extension = extensions[activity.type];
  const isCore = CORE_ACTIVITY_TYPES.includes(activity.type);
  if (!isCore && !extension) {
    errors.push(
      `${path}.type "${activity.type}" is not a core activity or a declared extension`
    );
    return errors;
  }

  if (!isCore) {
    (extension.requiredFields || []).forEach((field) => {
      if (!hasMeaningfulValue(activity[field])) {
        errors.push(`${path}.${field} is required for "${activity.type}"`);
      }
    });
    return errors;
  }

  if (activity.type === 'quiz') {
    const questions = Array.isArray(activity.questions) ? activity.questions : [];
    if (questions.length === 0) {
      errors.push(`${path}.questions must be a non-empty array`);
    }
    const questionIds = new Set();
    questions.forEach((question, index) => {
      errors.push(
        ...validateQuizQuestion(
          question,
          `${path}.questions[${index}]`,
          questionIds
        )
      );
    });
  }

  if (activity.type === 'exercise') {
    const answers = activity.acceptedAnswers;
    if (!Array.isArray(answers) || answers.length === 0) {
      errors.push(`${path}.acceptedAnswers must be a non-empty array`);
    } else if (answers.some((answer) => !isNonEmptyString(answer))) {
      errors.push(`${path}.acceptedAnswers must contain non-empty strings`);
    }
    if (!isNonEmptyString(activity.prompt)) {
      errors.push(`${path}.prompt is required`);
    }
  }

  if (activity.type === 'simulation') {
    if (!isPlainObject(activity.task)) {
      errors.push(`${path}.task must be an object`);
    } else {
      if (!isNonEmptyString(activity.task.description)) {
        errors.push(`${path}.task.description is required`);
      }
      if (!hasMeaningfulValue(activity.task.expectedOutput)) {
        errors.push(`${path}.task.expectedOutput is required`);
      }
    }
  }

  if (activity.type === 'project') {
    if (!isNonEmptyString(activity.brief)) {
      errors.push(`${path}.brief is required`);
    }
    if (!isNonEmptyString(activity.reflectionPrompt)) {
      errors.push(`${path}.reflectionPrompt is required`);
    }
    const rubric = Array.isArray(activity.rubric) ? activity.rubric : [];
    if (rubric.length < 2) {
      errors.push(`${path}.rubric needs at least two criteria`);
    }
    const rubricIds = new Set();
    rubric.forEach((criterion, index) => {
      const criterionPath = `${path}.rubric[${index}]`;
      if (!isPlainObject(criterion)) {
        errors.push(`${criterionPath} must be an object`);
        return;
      }
      if (!isNonEmptyString(criterion.id)) {
        errors.push(`${criterionPath}.id is required`);
      } else if (rubricIds.has(criterion.id)) {
        errors.push(`duplicate rubric criterion id "${criterion.id}"`);
      }
      rubricIds.add(criterion.id);
      if (!isNonEmptyString(criterion.title)) {
        errors.push(`${criterionPath}.title is required`);
      }
      if (!isNonEmptyString(criterion.description)) {
        errors.push(`${criterionPath}.description is required`);
      }
      RUBRIC_LEVELS.forEach((level) => {
        if (!isNonEmptyString(criterion.levels?.[level])) {
          errors.push(`${criterionPath}.levels.${level} is required`);
        }
      });
    });
  }

  return errors;
}

function validateQuizQuestion(question, path, questionIds) {
  if (!isPlainObject(question)) return [`${path} must be an object`];
  const errors = [];
  if (!isNonEmptyString(question.id)) {
    errors.push(`${path}.id is required`);
  } else if (questionIds.has(question.id)) {
    errors.push(`${path}.id "${question.id}" is duplicated in this quiz`);
  } else {
    questionIds.add(question.id);
  }
  if (!isNonEmptyString(question.prompt)) {
    errors.push(`${path}.prompt is required`);
  }
  const options = Array.isArray(question.options) ? question.options : [];
  if (options.length < 2) {
    errors.push(`${path}.options needs at least two choices`);
  } else if (options.some((option) => !isNonEmptyString(option))) {
    errors.push(`${path}.options must contain non-empty strings`);
  }
  if (
    !Number.isInteger(question.correctIndex) ||
    question.correctIndex < 0 ||
    question.correctIndex >= options.length
  ) {
    errors.push(`${path}.correctIndex must point at an option`);
  }
  if (question.explanation !== undefined && typeof question.explanation !== 'string') {
    errors.push(`${path}.explanation must be a string when provided`);
  }
  return errors;
}

function hasObjectivePrerequisiteCycle(objectives) {
  const byId = new Map(
    objectives
      .filter((objective) => objective && objective.id)
      .map((objective) => [objective.id, objective])
  );
  const visiting = new Set();
  const visited = new Set();

  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const objective = byId.get(id);
    for (const prerequisiteId of objective?.prerequisiteIds || []) {
      if (byId.has(prerequisiteId) && visit(prerequisiteId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  return [...byId.keys()].some((id) => visit(id));
}

function hasLessonPrerequisiteCycle(modules) {
  const lessons = modules.flatMap((module) => getModuleLessons(module));
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const visiting = new Set();
  const visited = new Set();

  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const lesson = byId.get(id);
    for (const prerequisiteId of lesson?.prerequisites?.lessonIds || []) {
      if (byId.has(prerequisiteId) && visit(prerequisiteId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  return [...byId.keys()].some((id) => visit(id));
}
