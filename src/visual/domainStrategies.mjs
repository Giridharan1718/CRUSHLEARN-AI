// Domain strategies for the Universal Visual Learning Engine.
//
// These strategies guide representation selection; they are not a list of
// supported subjects. Unknown domains fall back to the general strategy.
// Only the "process" visual type has a renderer in this vertical slice.

export const DOMAIN_ORDER = [
  'ai',
  'mathematics',
  'programming',
  'science',
  'business',
  'history',
  'languages',
  'design',
  'research',
  'general',
];

export const DOMAIN_STRATEGIES = Object.freeze({
  ai: {
    id: 'ai',
    label: 'AI and machine learning',
    keywords: [
      'neural network',
      'machine learning',
      'deep learning',
      'gradient descent',
      'backpropagation',
      'transformer',
      'tensor',
      'embedding',
      'overfitting',
      'training data',
    ],
    recommendedVisualTypes: [
      'process',
      'interactive_diagram',
      'graphs',
      'annotated_example',
    ],
    exampleFormats: [
      'Training-step walkthroughs',
      'Tensor-shape diagrams',
      'Loss-curve plots',
      'Model architecture maps',
    ],
    interactions: [
      'Adjust a learning rate',
      'Inspect a tensor shape',
      'Trace one training step',
    ],
    validationRequirements: [
      'Distinguish illustrative models from measured results',
      'State dataset and optimisation assumptions',
      'Keep tensor dimensions consistent',
    ],
    pitfalls: [
      'Presenting a simplified network as a real trained model',
      'Hiding the difference between training and inference',
      'Using an unexplained loss curve as evidence of quality',
    ],
  },

  mathematics: {
    id: 'mathematics',
    label: 'Mathematics',
    keywords: [
      'calculus',
      'derivative',
      'integral',
      'equation',
      'algebra',
      'geometry',
      'probability',
      'matrix',
      'fraction',
      'theorem',
      'function',
      'graph',
    ],
    recommendedVisualTypes: [
      'graphs',
      'annotated_example',
      'process',
      'interactive_diagram',
    ],
    exampleFormats: [
      'Worked solutions',
      'Coordinate graphs',
      'Geometric constructions',
      'Step-by-step proofs',
    ],
    interactions: [
      'Change a parameter and observe the graph',
      'Reveal one solution step at a time',
      'Compare two representations of the same relation',
    ],
    validationRequirements: [
      'Check symbolic manipulation and arithmetic',
      'State the domain and assumptions',
      'Keep graph scales and units accurate',
    ],
    pitfalls: [
      'Showing a graph without labelled axes or units',
      'Skipping the step where an equation is transformed',
      'Treating an approximate plot as an exact proof',
    ],
  },

  programming: {
    id: 'programming',
    label: 'Programming and software',
    keywords: [
      'compiler',
      'source code',
      'programming',
      'algorithm',
      'data structure',
      'database',
      'debug',
      'javascript',
      'python',
      'software',
      'api',
      'runtime',
    ],
    recommendedVisualTypes: [
      'process',
      'code_trace',
      'flowchart',
      'annotated_example',
    ],
    exampleFormats: [
      'Execution traces',
      'Control-flow diagrams',
      'Annotated code',
      'Data-structure layouts',
    ],
    interactions: [
      'Step through code execution',
      'Inspect variable values',
      'Change an input and compare outputs',
    ],
    validationRequirements: [
      'Keep the displayed code runnable or clearly pseudocode',
      'Show inputs, outputs and error cases',
      'Do not imply untrusted code was executed',
    ],
    pitfalls: [
      'Mixing up compile-time and runtime behaviour',
      'Showing only the happy path',
      'Hiding state changes between steps',
    ],
  },

  science: {
    id: 'science',
    label: 'Science and physics',
    keywords: [
      'electricity',
      'circuit',
      'physics',
      'force',
      'motion',
      'atom',
      'molecule',
      'thermodynamics',
      'photosynthesis',
      'energy',
      'voltage',
      'current',
    ],
    recommendedVisualTypes: [
      'process',
      'simulation',
      'interactive_diagram',
      'graphs',
    ],
    exampleFormats: [
      'Force diagrams',
      'Energy-flow maps',
      'Process animations',
      'Measured data plots',
    ],
    interactions: [
      'Change a physical parameter',
      'Trace energy through a system',
      'Compare a prediction with an observation',
    ],
    validationRequirements: [
      'State simplifications and units',
      'Distinguish a model from a measurement',
      'Respect conservation laws where applicable',
    ],
    pitfalls: [
      'Describing a simplified model as physical truth',
      'Mixing conventional current with electron flow',
      'Omitting the return path or energy loss',
    ],
  },

  business: {
    id: 'business',
    label: 'Business and economics',
    keywords: [
      'startup',
      'revenue',
      'profit',
      'business',
      'market',
      'customer',
      'pricing',
      'economics',
      'cash flow',
      'supply and demand',
      'business model',
    ],
    recommendedVisualTypes: [
      'process',
      'flowchart',
      'comparison',
      'graphs',
    ],
    exampleFormats: [
      'Revenue-cycle maps',
      'Decision trees',
      'Unit-economics tables',
      'Case-study comparisons',
    ],
    interactions: [
      'Change a price or conversion rate',
      'Compare revenue with profit',
      'Trace a customer through a funnel',
    ],
    validationRequirements: [
      'Separate revenue, cost, profit and cash',
      'State the time period and assumptions',
      'Avoid presenting a model as financial advice',
    ],
    pitfalls: [
      'Calling revenue profit',
      'Ignoring acquisition or delivery costs',
      'Treating one startup as a universal pattern',
    ],
  },

  history: {
    id: 'history',
    label: 'History and geography',
    keywords: [
      'history',
      'world war',
      'revolution',
      'empire',
      'civilization',
      'timeline',
      'causes of',
      'historical',
      'geography',
      'war',
    ],
    recommendedVisualTypes: [
      'timeline',
      'concept_map',
      'process',
      'comparison',
    ],
    exampleFormats: [
      'Annotated timelines',
      'Cause-and-effect maps',
      'Map sequences',
      'Source comparisons',
    ],
    interactions: [
      'Move through a timeline',
      'Toggle a cause or consequence',
      'Compare two accounts of an event',
    ],
    validationRequirements: [
      'Date claims and identify uncertainty',
      'Separate evidence from interpretation',
      'Include relevant context and competing explanations',
    ],
    pitfalls: [
      'Presenting one cause as the only cause',
      'Removing dates and geographic context',
      'Treating a simplified timeline as complete history',
    ],
  },

  languages: {
    id: 'languages',
    label: 'Languages and communication',
    keywords: [
      'grammar',
      'language',
      'sentence',
      'verb',
      'pronoun',
      'tense',
      'vocabulary',
      'translation',
      'english',
      'conversation',
    ],
    recommendedVisualTypes: [
      'annotated_example',
      'concept_map',
      'comparison',
      'process',
    ],
    exampleFormats: [
      'Annotated sentences',
      'Conversation scenarios',
      'Word-family maps',
      'Grammar comparisons',
    ],
    interactions: [
      'Highlight parts of a sentence',
      'Compare two tenses',
      'Build a sentence from labelled parts',
    ],
    validationRequirements: [
      'Use natural example sentences',
      'Label grammatical roles consistently',
      'Note register and context where relevant',
    ],
    pitfalls: [
      'Presenting one dialect as the only correct form',
      'Using unnatural sentences to force a rule',
      'Confusing meaning with grammatical function',
    ],
  },

  design: {
    id: 'design',
    label: 'Design and creative subjects',
    keywords: [
      'color theory',
      'design',
      'typography',
      'composition',
      'layout',
      'contrast',
      'branding',
      'visual hierarchy',
      'colour',
    ],
    recommendedVisualTypes: [
      'comparison',
      'annotated_example',
      'concept_map',
      'process',
    ],
    exampleFormats: [
      'Side-by-side visual comparisons',
      'Annotated layouts',
      'Colour palettes',
      'Process boards',
    ],
    interactions: [
      'Toggle a palette',
      'Compare contrast ratios',
      'Move a layout element',
    ],
    validationRequirements: [
      'Explain the design principle behind each choice',
      'Include accessibility considerations',
      'Do not present taste as a universal rule',
    ],
    pitfalls: [
      'Using colour alone to carry meaning',
      'Presenting one style as objectively best',
      'Ignoring contrast and legibility',
    ],
  },

  research: {
    id: 'research',
    label: 'Research and technical documentation',
    keywords: [
      'research',
      'methodology',
      'literature review',
      'hypothesis',
      'evidence',
      'paper',
      'tensor decomposition',
      'statistical significance',
      'experiment',
    ],
    recommendedVisualTypes: [
      'concept_map',
      'process',
      'comparison',
      'annotated_example',
    ],
    exampleFormats: [
      'Methodology diagrams',
      'Evidence tables',
      'Concept maps',
      'Annotated paper sections',
    ],
    interactions: [
      'Inspect a claim and its evidence',
      'Compare two methods',
      'Trace a study from question to conclusion',
    ],
    validationRequirements: [
      'Keep citations attached to claims',
      'Distinguish correlation from causation',
      'Mark uncertainty and limitations',
    ],
    pitfalls: [
      'Inventing citations or results',
      'Turning a correlation into a causal claim',
      'Hiding uncertainty behind a clean diagram',
    ],
  },

  general: {
    id: 'general',
    label: 'General knowledge and everyday systems',
    keywords: [],
    recommendedVisualTypes: [
      'process',
      'concept_map',
      'comparison',
      'annotated_example',
    ],
    exampleFormats: [
      'Everyday process walkthroughs',
      'Cause-and-effect maps',
      'Annotated examples',
      'Simple comparisons',
    ],
    interactions: [
      'Step through a process',
      'Reveal one explanation at a time',
      'Try a prediction question',
    ],
    validationRequirements: [
      'Label simplifications',
      'Avoid unsupported precision',
      'Use familiar examples without overgeneralising',
    ],
    pitfalls: [
      'Presenting a metaphor as a complete mechanism',
      'Hiding exceptions behind a tidy process',
      'Using jargon without an explanation',
    ],
  },
});

export function getDomainStrategy(domainId) {
  return DOMAIN_STRATEGIES[domainId] || DOMAIN_STRATEGIES.general;
}

export const GENERAL_DOMAIN_STRATEGY = DOMAIN_STRATEGIES.general;
