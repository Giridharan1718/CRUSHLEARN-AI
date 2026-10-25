// Activity renderer registry.
//
// The core course platform knows how to render quizzes, exercises,
// simulations and projects. A subject can add its own activity type by
// declaring it in course data and registering a renderer here. Registration is
// intentionally small and explicit: content stays as plain data, while the
// subject-specific React component lives with the other renderers.

const renderers = new Map();

export function registerActivityRenderer(type, component) {
  if (typeof type !== 'string' || type.trim().length === 0) {
    throw new Error('Activity renderer type must be a non-empty string');
  }
  if (typeof component !== 'function') {
    throw new Error(`Activity renderer for "${type}" must be a component`);
  }
  renderers.set(type, component);
}

export function getActivityRenderer(type) {
  return renderers.get(type) || null;
}

export function getRegisteredActivityTypes() {
  return [...renderers.keys()];
}

export function hasActivityRenderer(type) {
  return renderers.has(type);
}
