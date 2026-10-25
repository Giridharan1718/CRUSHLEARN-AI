import ProcessExplorer from './ProcessExplorer';

const VisualExplanationRenderer = ({ explanation, level = 'intermediate' }) => {
  if (!explanation) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-sm text-ink-muted">
        Visual explanation unavailable.
      </div>
    );
  }

  if (explanation.visualType === 'process') {
    return <ProcessExplorer explanation={explanation} level={level} />;
  }

  return (
    <div className="rounded-2xl border border-warning/40 bg-warning-soft p-6 text-sm text-warning">
      No renderer is available for the visual type "
      {explanation.visualType || 'unknown'}". This build only implements
      step-by-step process diagrams.
    </div>
  );
};

export default VisualExplanationRenderer;
