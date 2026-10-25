# Multi-subject course platform

The course platform separates authored content from rendering and learning
logic. The same content schema, validation and activity renderers are used by
Web Development, Python Programming and Advanced React.

## Content layout

- `src/content/courses/webDevelopment.mjs`
- `src/content/courses/pythonProgramming.mjs`
- `src/content/courses/advancedReact.mjs`
- `src/content/index.mjs` builds the public catalog and compatibility views
- `src/content/schema.mjs` validates content and provides pure selectors
- `src/content/masteryPresets.mjs` holds reusable mastery criteria presets

Course files export plain objects. They contain no React and no application
logic. A course has:

```js
{
  id,
  title,
  subject,
  description,
  instructor,
  duration,
  level: 'Beginner' | 'Intermediate' | 'Advanced',
  thumbnail,
  objectives: [
    { id, title, description, prerequisiteIds, masteryCriteria },
  ],
  activityExtensions: {
    // Optional subject-specific activity types
    python_trace: {
      label,
      description,
      requiredFields: ['code', 'expectedOutput'],
    },
  },
  modules: [
    {
      id,
      title,
      description,
      level,
      lessons: [
        {
          id,
          title,
          summary,
          duration,
          level,
          objectiveIds: [],
          prerequisites: { lessonIds: [], objectiveIds: [] },
          blocks: [],
          activities: [],
          completion: { requiredActivityIds: [] },
        },
      ],
    },
  ],
}
```

### Content blocks

- `text`: `title` plus `paragraphs` or `body`, with optional `bullets`
- `video`: `title`, `src`, optional `poster` and `transcript`
- `image`: `src`, required `alt`, optional `title` and `caption`

`ContentBlockRenderer` is reusable and renders an honest unavailable state if a
block is missing or uses an unknown type.

### Activities

Core activity types:

- `quiz`: questions with options, `correctIndex` and optional explanations
- `exercise`: a short answer validated against `acceptedAnswers`
- `simulation`: a guided practical task with `expectedOutput`
- `project`: brief, requirements, deliverables, reflection and rubric

A project rubric requires at least two criteria. Each criterion has an id,
title, description and `emerging`, `proficient` and `advanced` level
descriptions.

## Subject-specific activity types

Extension mechanism:

1. Declare the type on the course in `activityExtensions` and list its required
   fields.
2. Add the activity to lesson content using that type.
3. Register a React renderer with `registerActivityRenderer(type, Component)`.
4. Import the extension module from `src/components/course/activityRenderers.jsx`.

The Python course demonstrates this with `python_trace` in
`src/components/course/subjectExtensions.jsx`. The generic `ActivityRenderer`
does not contain Python-specific rules. An unregistered type renders a safe
"activity unavailable" state instead of crashing.

## Validation

`validateCourseCatalog` and `validateCourse` check required course, module,
lesson, objective, block and activity data. They reject:

- duplicate course, module, lesson, objective, block, activity or rubric ids
- unknown objective and prerequisite references, including cycles
- missing levels, titles, summaries, durations and content
- invalid quiz answer indexes and incomplete options
- missing exercise answers, simulation configuration or project rubrics
- unsupported activity types and missing extension fields

The catalog is validated in `tests/content/courseCatalog.test.mjs`. Corrupt
course objects are also exercised so missing-data paths stay safe.

## Rendering

- `Course.jsx` renders modules, levels, objectives, prerequisites and activity
  type chips.
- `StructuredLesson.jsx` renders content blocks, activities, objectives,
  prerequisite links, progress and completion.
- `ContentBlockRenderer.jsx` renders text, video and images.
- `ActivityRenderer.jsx` delegates to the activity registry.
- `QuizActivity`, `ExerciseActivity`, `SimulationActivity` and
  `ProjectActivity` are generic subject-agnostic components.

The legacy flat lesson shape is still produced by `src/content/index.mjs`, so
existing routes, dashboards and older components continue to work without a
second copy of the course content.

## Progress and completion

Structured activity progress is stored per course and lesson under
`crushlearn_activity_progress_<courseId>_<lessonId>`.

Lesson completion now uses `courseId:lessonId` keys through
`src/utils/lessonProgress.mjs`. This prevents `lesson-1` in Python from being
treated as complete just because `lesson-1` in Web Development was completed.
Bare legacy ids remain valid for the original `web-dev-101` starter data.

## Tests

- `tests/content/courseCatalog.test.mjs` loads and validates every course,
  checks multi-subject coverage, prerequisites, missing data and malformed
  content.
- `tests/content/contentRendering.test.mjs` renders content blocks, every core
  activity type, the Python extension, structured lessons and missing-content
  fallbacks.
- `tests/content/lessonProgress.test.mjs` verifies course-scoped completion and
  legacy progress compatibility.
- `tests/content/activityProgress.test.mjs` verifies persistence, isolation and
  corruption handling.
