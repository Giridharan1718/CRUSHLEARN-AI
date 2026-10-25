// Course-scoped activity progress for structured lessons.
//
// A course can be shown in more than one subject, and lesson or activity ids
// only need to be unique inside a course. Progress is therefore stored under a
// course-and-lesson key with a small validated envelope. A missing storage
// adapter (for example during server rendering or tests) is treated as an
// empty, read-only store.

export const ACTIVITY_PROGRESS_VERSION = 1;

export function getActivityProgressKey(courseId, lessonId) {
  return `crushlearn_activity_progress_${courseId}_${lessonId}`;
}

function createEmptyState() {
  return [];
}

function isValidStorage(storage) {
  return (
    storage &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function'
  );
}

export function createActivityProgressStore(storage) {
  const usable = isValidStorage(storage);

  function load(courseId, lessonId, knownActivityIds) {
    if (!usable || !courseId || !lessonId) return createEmptyState();
    let parsed;
    try {
      const raw = storage.getItem(getActivityProgressKey(courseId, lessonId));
      if (!raw) return createEmptyState();
      parsed = JSON.parse(raw);
    } catch {
      return createEmptyState();
    }
    if (!parsed || typeof parsed !== 'object') return createEmptyState();
    if (parsed.version !== ACTIVITY_PROGRESS_VERSION) return createEmptyState();
    if (parsed.courseId !== courseId || parsed.lessonId !== lessonId) {
      return createEmptyState();
    }
    const validIds = new Set(
      Array.isArray(knownActivityIds) ? knownActivityIds : []
    );
    return (Array.isArray(parsed.completedActivityIds)
      ? parsed.completedActivityIds
      : []
    ).filter((id) => typeof id === 'string' && validIds.has(id));
  }

  function save(courseId, lessonId, completedActivityIds) {
    if (!usable || !courseId || !lessonId) return false;
    const envelope = {
      version: ACTIVITY_PROGRESS_VERSION,
      courseId,
      lessonId,
      completedActivityIds: [
        ...new Set(
          (Array.isArray(completedActivityIds)
            ? completedActivityIds
            : []
          ).filter((id) => typeof id === 'string')
        ),
      ],
      updatedAt: new Date().toISOString(),
    };
    try {
      storage.setItem(
        getActivityProgressKey(courseId, lessonId),
        JSON.stringify(envelope)
      );
      return true;
    } catch {
      return false;
    }
  }

  function clear(courseId, lessonId) {
    if (
      !usable ||
      typeof storage.removeItem !== 'function' ||
      !courseId ||
      !lessonId
    ) {
      return false;
    }
    try {
      storage.removeItem(getActivityProgressKey(courseId, lessonId));
      return true;
    } catch {
      return false;
    }
  }

  return { load, save, clear };
}
