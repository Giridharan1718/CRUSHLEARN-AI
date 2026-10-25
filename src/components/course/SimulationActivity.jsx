import Simulation from '../Simulation';

export default function SimulationActivity({ activity, onComplete, scope }) {
  if (!activity?.task) {
    return (
      <p className="rounded-lg bg-warning-soft p-4 text-sm text-warning">
        This simulation is missing its task configuration.
      </p>
    );
  }

  return (
    <Simulation
      taskId={scope ? `${scope}:${activity.id}` : activity.id}
      taskData={activity.task}
      onComplete={(passed) => {
        if (passed) onComplete?.();
      }}
    />
  );
}
