import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_ACTIVITY_TYPES,
  CONTENT_BLOCK_TYPES,
  COURSE_LEVELS,
  courseCatalog,
  courses,
  getActivityTypeLabel,
  getCourseById,
  getCourseObjectives,
  getLessonById,
  getLessonContext,
  getRequiredActivityIds,
  validateCourse,
  validateCourseCatalog,
} from '../../src/content/index.mjs';
import { getCourseLearningMap } from '../../src/data/courseLearningMaps.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

test('the course catalog is valid and covers multiple subjects', () => {
  assert.deepEqual(validateCourseCatalog(courseCatalog), []);

  const subjects = new Set(courses.map((course) => course.subject));
  assert.ok(subjects.size >= 2, 'at least two subjects share the same engine');

  courses.forEach((course) => {
    assert.ok(course.modules.length > 0, `${course.id} has modules`);
    assert.equal(
      course.lessons.length,
      course.modules.reduce(
        (total, module) => total + module.lessons.length,
        0
      )
    );
    const lessonIds = new Set(course.lessons.map((lesson) => lesson.id));
    assert.equal(lessonIds.size, course.lessons.length);
  });
});

test('every lesson declares objectives, content blocks and activities', () => {
  const blockTypes = new Set();
  const activityTypes = new Set();
  const levels = new Set();

  courses.forEach((course) => {
    const objectiveIds = new Set(
      getCourseObjectives(course).map((objective) => objective.id)
    );
    levels.add(course.level);

    course.modules.forEach((module) => {
      levels.add(module.level);
      module.lessons.forEach((lesson) => {
        levels.add(lesson.level);
        assert.ok(lesson.blocks.length > 0, `${lesson.id} has content`);
        assert.ok(lesson.activities.length > 0, `${lesson.id} has activities`);
        assert.ok(
          lesson.objectiveIds.length > 0,
          `${lesson.id} declares objectives`
        );
        lesson.objectiveIds.forEach((objectiveId) => {
          assert.ok(
            objectiveIds.has(objectiveId),
            `${lesson.id} objective ${objectiveId} is authored on the course`
          );
        });

        lesson.blocks.forEach((block) => blockTypes.add(block.type));
        lesson.activities.forEach((activity) =>
          activityTypes.add(activity.type)
        );

        const activityIds = new Set(
          lesson.activities.map((activity) => activity.id)
        );
        getRequiredActivityIds(lesson).forEach((activityId) => {
          assert.ok(
            activityIds.has(activityId),
            `${lesson.id} completion references ${activityId}`
          );
        });
      });
    });
  });

  CONTENT_BLOCK_TYPES.forEach((type) => {
    assert.ok(blockTypes.has(type), `catalog demonstrates ${type} content`);
  });
  CORE_ACTIVITY_TYPES.forEach((type) => {
    assert.ok(activityTypes.has(type), `catalog demonstrates ${type} activities`);
  });
  COURSE_LEVELS.forEach((level) => {
    assert.ok(levels.has(level), `catalog demonstrates the ${level} level`);
  });
});

test('a subject-specific activity type is declared and has a label', () => {
  const pythonCourse = getCourseById('python-basics');
  const traceActivity = pythonCourse.lessons
    .flatMap((lesson) => lesson.activities)
    .find((activity) => activity.type === 'python_trace');

  assert.ok(traceActivity, 'the Python course uses its extension activity');
  assert.ok(
    pythonCourse.activityExtensions.python_trace,
    'the extension is declared in course content'
  );
  assert.equal(
    getActivityTypeLabel(pythonCourse, 'python_trace'),
    'Python output trace'
  );
});

test('course and lesson lookup handles unknown ids without throwing', () => {
  assert.equal(getCourseById('missing-course'), null);
  assert.equal(getCourseById(), null);
  assert.equal(getLessonById('web-dev-101', 'missing-lesson'), null);
  assert.equal(getLessonById('missing-course', 'lesson-1'), null);
  assert.equal(getLessonContext('missing-course', 'lesson-1'), null);
  assert.deepEqual(getRequiredActivityIds(null), []);
  assert.deepEqual(getCourseObjectives('missing-course'), []);
});

test('lesson context resolves modules, objectives, prerequisites and navigation', () => {
  const context = getLessonContext('web-dev-101', 'lesson-4');
  assert.ok(context);
  assert.equal(context.module.id, 'web-portfolio-project');
  assert.equal(context.lesson.id, 'lesson-4');
  assert.equal(context.lessonNumber, 4);
  assert.equal(context.totalLessons, 4);
  assert.equal(context.previousLesson.id, 'lesson-3');
  assert.equal(context.nextLesson, null);
  assert.ok(context.objectives.length > 0);
  assert.deepEqual(
    context.prerequisiteLessons.map((lesson) => lesson.id),
    ['lesson-1', 'lesson-2', 'lesson-3']
  );

  const python = getLessonContext('python-basics', 'lesson-3');
  assert.ok(python);
  assert.equal(python.module.id, 'python-data');
  assert.deepEqual(
    python.prerequisiteLessons.map((lesson) => lesson.id),
    ['lesson-1', 'lesson-2']
  );
});

test('learning maps reuse the objectives authored with course content', () => {
  ['web-dev-101', 'python-basics'].forEach((courseId) => {
    const course = getCourseById(courseId);
    const map = getCourseLearningMap(courseId);
    assert.deepEqual(
      map.objectives.map((objective) => objective.id),
      getCourseObjectives(course).map((objective) => objective.id)
    );
    map.objectives.forEach((objective) => {
      assert.ok(objective.masteryCriteria, `${objective.id} has criteria`);
    });
  });
});

test('validation reports missing course structure and activity data', () => {
  assert.equal(validateCourse(null)[0], 'course must be an object');
  assert.deepEqual(validateCourseCatalog([]), [
    'course catalog must be a non-empty array',
  ]);

  const noModules = clone(courseCatalog[0]);
  delete noModules.modules;
  assert.ok(
    validateCourse(noModules).some((error) =>
      error.includes('modules must be a non-empty array')
    )
  );

  const badQuiz = clone(courseCatalog[0]);
  badQuiz.modules[0].lessons[0].activities[0].questions[0].correctIndex = 99;
  assert.ok(
    validateCourse(badQuiz).some((error) =>
      error.includes('correctIndex must point at an option')
    )
  );

  const undeclaredType = clone(courseCatalog[0]);
  undeclaredType.modules[0].lessons[0].activities.push({
    id: 'activity-undeclared',
    type: 'mystery_task',
    title: 'Mystery',
  });
  assert.ok(
    validateCourse(undeclaredType).some((error) =>
      error.includes('is not a core activity or a declared extension')
    )
  );

  const missingExtensionField = clone(courseCatalog[1]);
  const trace = missingExtensionField.modules[0].lessons[0].activities.find(
    (activity) => activity.type === 'python_trace'
  );
  trace.code = '';
  assert.ok(
    validateCourse(missingExtensionField).some((error) =>
      error.includes('code is required')
    )
  );
});

test('validation reports duplicate ids and broken prerequisites', () => {
  const duplicate = clone(courseCatalog[0]);
  duplicate.modules[1].lessons[0].id = duplicate.modules[0].lessons[0].id;
  assert.ok(
    validateCourse(duplicate).some((error) =>
      error.includes('duplicate lesson id')
    )
  );

  const brokenPrerequisite = clone(courseCatalog[0]);
  brokenPrerequisite.modules[0].lessons[1].prerequisites.lessonIds.push(
    'lesson-does-not-exist'
  );
  assert.ok(
    validateCourse(brokenPrerequisite).some((error) =>
      error.includes('unknown prerequisite lesson')
    )
  );

  const brokenObjective = clone(courseCatalog[0]);
  brokenObjective.modules[0].lessons[1].objectiveIds.push(
    'objective-does-not-exist'
  );
  assert.ok(
    validateCourse(brokenObjective).some((error) =>
      error.includes('unknown objective')
    )
  );

  const missingRubric = clone(courseCatalog[1]);
  const project = missingRubric.modules[2].lessons[0].activities[0];
  project.rubric = [];
  assert.ok(
    validateCourse(missingRubric).some((error) =>
      error.includes('rubric needs at least two criteria')
    )
  );
});
