// Rule-based guidance engine for the course pages.
//
// This is deterministic code that reads local course progress. It is not a
// language model and does not generate explanations or answer questions.
//
// It lives in `src/learning/` rather than `src/ai/` because it implements none
// of the orchestration service contract: it is a plain rule engine over local
// course state, and calling it an "AI" service would overstate it.
//
// Every value it returns is derived from the learner's own stored progress or
// from authored course content. It never claims to have analysed anything.

/**
 * The hints for a lesson, keyed by course and lesson.
 *
 * Lesson ids repeat across courses — `lesson-1` exists in all three — so the
 * key is the pair. A hint written for the web development course must never
 * be shown to a learner studying Python.
 */
const LESSON_HINTS = Object.freeze({
  'web-dev-101:lesson-1': [
    'Start by understanding the basic HTML structure: DOCTYPE, html, head, and body tags.',
    'Use semantic HTML elements like <header>, <nav>, <main>, and <footer> for better accessibility.',
    'Remember: every opening tag needs a closing tag!',
  ],
  'web-dev-101:lesson-2': [
    'Think of CSS as layers: start with layout, then add colors and typography.',
    'The box model includes content, padding, border, and margin - master this concept first.',
    'Use Chrome DevTools to experiment with styles in real-time.',
  ],
  'web-dev-101:lesson-3': [
    'Variables are like containers - think about what type of data you need to store.',
    'Functions are reusable blocks of code - write them once, use them many times.',
    'Practice selecting DOM elements before trying to manipulate them.',
  ],
  'python-basics:lesson-1': [
    'Start with the smallest program that runs, then change one thing at a time.',
    'Read the error message from the last line backwards - it names the line that failed.',
    'Keep a scratch file open so you can test a single line before writing it into the program.',
  ],
  'python-basics:lesson-2': [
    'Decide the shape of the data first: a list, a dictionary, or a tuple.',
    'Write the loop for one item before you write it for many.',
    'Name variables after what they hold, not after how they were created.',
  ],
  'python-basics:lesson-3': [
    'Choose the structure to match the question you will ask of the data.',
    'A function that takes a list and returns a list is easier to test than one that changes things as it goes.',
    'Check the empty case first - that is where most bugs hide.',
  ],
  'react-advanced:lesson-1': [
    'A hook is a function that lets a component use React features.',
    'Rules of hooks: call them at the top level, and call them in the same order every render.',
    'If a hook seems to need a condition, the condition probably belongs inside the hook.',
  ],
  'react-advanced:lesson-2': [
    'Measure before you optimise - the profiler names the component that is actually slow.',
    'Memoisation costs memory and complexity. Skip it until the profile says to.',
    'A render that produces the same output for the same input is the goal.',
  ],
});

const DEFAULT_HINTS = Object.freeze([
  'Re-read the objective at the top of the lesson before you start.',
  'Work one small example at a time rather than the whole task.',
  'If you are stuck, write down what you expected and what actually happened.',
]);

/**
 * The skills credited for a completed course.
 *
 * The course ids here are the authored course ids in `src/content/courses/`.
 */
const COURSE_SKILLS = Object.freeze({
  'web-dev-101': [
    'HTML5',
    'CSS3',
    'JavaScript ES6',
    'Responsive Design',
  ],
  'python-basics': [
    'Python 3',
    'Data Structures',
    'Functions',
    'Control Flow',
  ],
  'react-advanced': [
    'React Hooks',
    'Performance Optimization',
    'Advanced Patterns',
  ],
});

export const GuidanceEngine = {
  // Generate personalized learning path based on user progress
  generateLearningPath: (user, courses) => {
    const completedCount = user.completedLessons?.length || 0;

    const recommendations = [];

    if (completedCount === 0) {
      recommendations.push({
        type: 'start',
        message:
          'Welcome to CrushLearn AI! Start with Web Development Fundamentals to build a strong foundation.',
        suggestedCourse: 'web-dev-101',
      });
    } else if (completedCount < 5) {
      recommendations.push({
        type: 'continue',
        message:
          'Great progress! Keep going with your current course to maintain momentum.',
      });
    } else {
      recommendations.push({
        type: 'advance',
        message:
          "You're doing amazing! Consider exploring Advanced React Patterns to level up your skills.",
        suggestedCourse: 'react-advanced',
      });
    }

    return recommendations;
  },

  /**
   * Provide contextual hints for the current lesson.
   *
   * Takes the course id as well as the lesson id, because lesson ids repeat
   * across courses. A learner in `python-basics:lesson-1` must not be shown
   * the HTML hints written for `web-dev-101:lesson-1`.
   */
  getHints: (lessonId, courseId = null) => {
    const scoped = courseId
      ? LESSON_HINTS[`${courseId}:${lessonId}`]
      : null;
    if (scoped) return [...scoped];

    // Fall back to a lesson-id-only match only when it is unambiguous. If more
    // than one course defines hints for this lesson id, none of them can be
    // trusted to be the right one.
    const matches = Object.keys(LESSON_HINTS)
      .filter((key) => key.endsWith(`:${lessonId}`))
      .map((key) => LESSON_HINTS[key]);
    if (matches.length === 1) return [...matches[0]];

    return [...DEFAULT_HINTS];
  },

  // Analyze progress and provide feedback
  analyzeProgress: (completedLessons, totalLessons) => {
    const completed = Array.isArray(completedLessons) ? completedLessons.length : 0;
    const total = Number(totalLessons) || 0;
    const progress = total > 0 ? (completed / total) * 100 : 0;

    if (progress === 0) {
      return {
        level: 'beginner',
        message:
          'Ready to start your learning journey! Take it one step at a time.',
        motivation: 'Every expert was once a beginner.',
      };
    } else if (progress < 30) {
      return {
        level: 'getting-started',
        message: "You're off to a great start! Keep up the consistency.",
        motivation: 'Small daily progress leads to big results.',
      };
    } else if (progress < 70) {
      return {
        level: 'intermediate',
        message: "Halfway there! You're making excellent progress.",
        motivation:
          'The middle is where most people quit - but not you!',
      };
    } else {
      return {
        level: 'advanced',
        message: "Almost complete! You're in the final stretch.",
        motivation: 'Finish strong - your certificate awaits!',
      };
    }
  },

  // Generate skill assessment
  assessSkills: (completedCourses) => {
    const skills = [];

    (Array.isArray(completedCourses) ? completedCourses : []).forEach(
      (courseId) => {
        const credited = COURSE_SKILLS[courseId];
        if (credited) skills.push(...credited);
      }
    );

    return skills;
  },
};
