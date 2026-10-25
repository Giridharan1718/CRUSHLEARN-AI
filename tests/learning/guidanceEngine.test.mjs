// The guidance engine is a rule engine over local course state. It is not a
// model, and it must not show one course's hints to a learner in another.

import test from 'node:test';
import assert from 'node:assert/strict';

import { GuidanceEngine } from '../../src/learning/guidanceEngine.mjs';

test('hints are scoped to the course, because lesson ids repeat across courses', () => {
  const webHints = GuidanceEngine.getHints('lesson-1', 'web-dev-101');
  const pythonHints = GuidanceEngine.getHints('lesson-1', 'python-basics');
  const reactHints = GuidanceEngine.getHints('lesson-1', 'react-advanced');

  assert.ok(webHints.length > 0);
  assert.ok(pythonHints.length > 0);
  assert.ok(reactHints.length > 0);

  // The three courses define different lesson-1 content. Showing the HTML
  // hint to a learner studying Python would be a wrong-content bug.
  assert.notDeepEqual(webHints, pythonHints);
  assert.notDeepEqual(webHints, reactHints);
  assert.notDeepEqual(pythonHints, reactHints);

  assert.match(webHints.join(' '), /HTML/i);
  assert.doesNotMatch(pythonHints.join(' '), /HTML/i);
});

test('an unknown lesson falls back to generic guidance rather than another course content', () => {
  const hints = GuidanceEngine.getHints('lesson-999', 'web-dev-101');
  assert.ok(hints.length > 0);
  assert.doesNotMatch(hints.join(' '), /HTML/i);
});

test('an ambiguous lesson id without a course does not pick one course hints', () => {
  // lesson-1 is defined by three courses, so a lesson-id-only lookup is
  // ambiguous and must not silently resolve to one of them.
  const hints = GuidanceEngine.getHints('lesson-1');
  assert.ok(hints.length > 0);
  assert.doesNotMatch(hints.join(' '), /HTML|CSS3|Python 3|React Hooks/i);
});

test('progress analysis does not divide by zero when there are no lessons', () => {
  const result = GuidanceEngine.analyzeProgress([], 0);
  assert.equal(result.level, 'beginner');
  assert.ok(result.message);
});

test('skills are credited only for authored course ids', () => {
  const skills = GuidanceEngine.assessSkills([
    'web-dev-101',
    'a-course-that-does-not-exist',
  ]);
  assert.ok(skills.includes('HTML5'));
  assert.equal(
    skills.some((skill) => skill.includes('a-course-that-does-not-exist')),
    false
  );
});
