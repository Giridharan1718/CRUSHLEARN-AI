import { getActivityRenderer } from './activityRegistry';
import { getActivityTypeLabel } from '../../content/index.mjs';
import './activityRenderers';

function MissingActivity({ activity }) {
  return (
    <div
      role="note"
      className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-warning"
    >
      <p className="font-semibold">Activity unavailable</p>
      <p className="mt-1">
        {activity?.type
          ? `No renderer is registered for "${activity.type}" activities.`
          : 'This activity is missing from the lesson.'}
      </p>
    </div>
  );
}

export default function ActivityRenderer({
  activity,
  course,
  scope,
  completed = false,
  onComplete,
}) {
  if (!activity || typeof activity !== 'object') {
    return <MissingActivity activity={activity} />;
  }
  const Renderer = getActivityRenderer(activity.type);
  if (!Renderer) {
    return <MissingActivity activity={activity} />;
  }

  return (
    <section
      aria-label={activity.title}
      className="rounded-xl border border-line bg-surface p-6 shadow-sm"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">
            {getActivityTypeLabel(course, activity.type)}
          </p>
          <h3 className="text-lg font-bold text-ink mt-1">
            {activity.title}
          </h3>
        </div>
        {completed && (
          <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">
            ✓ Complete
          </span>
        )}
      </div>
      <Renderer
        activity={activity}
        scope={scope}
        completed={completed}
        onComplete={onComplete}
      />
    </section>
  );
}
