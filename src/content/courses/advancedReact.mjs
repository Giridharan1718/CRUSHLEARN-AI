import {
  baseMasteryCriteria,
  cloneMasteryCriteria,
} from '../masteryPresets.mjs';

const VIDEO_URL =
  'https://commonsware.com/misc/vid-bigbuckbunny-320x180.mp4';

export const advancedReactCourse = {
  schemaVersion: 1,
  id: 'react-advanced',
  title: 'Advanced React Patterns',
  subject: 'Web Development',
  description:
    'Design reusable hooks and measure performance before optimising a React interface.',
  instructor: 'Emma Rodriguez',
  duration: '10 weeks',
  level: 'Advanced',
  thumbnail:
    'https://via.placeholder.com/400x250/8b5cf6/ffffff?text=Advanced+React',
  enrolled: 892,
  rating: 4.7,
  activityExtensions: {},
  objectives: [
    {
      id: 'react-hooks',
      title: 'Design reusable custom hooks',
      description:
        'Extract behaviour into hooks without hiding state ownership or side effects.',
      prerequisiteIds: [],
      masteryCriteria: cloneMasteryCriteria(baseMasteryCriteria),
    },
    {
      id: 'react-performance',
      title: 'Measure before optimising',
      description:
        'Use profiling evidence to choose between memoisation, splitting and redesign.',
      prerequisiteIds: ['react-hooks'],
      masteryCriteria: cloneMasteryCriteria(baseMasteryCriteria),
    },
  ],
  modules: [
    {
      id: 'react-advanced-patterns',
      title: 'Advanced React Patterns',
      description:
        'Move from component composition to measured performance decisions.',
      level: 'Advanced',
      lessons: [
        {
          id: 'lesson-1',
          title: 'Custom Hooks Deep Dive',
          summary:
            'Package reusable stateful behaviour while keeping the data flow explicit.',
          duration: '65 min',
          level: 'Advanced',
          objectiveIds: ['react-hooks'],
          prerequisites: { lessonIds: [], objectiveIds: [] },
          blocks: [
            {
              id: 'react-lesson-1-text',
              type: 'text',
              title: 'A hook is an interface, not a hiding place',
              paragraphs: [
                'A custom hook packages behaviour that needs React state or lifecycle. It should expose a small, honest interface and keep ownership of state understandable.',
                'Hooks compose. A hook can call other hooks, but it must follow the rules of hooks and avoid hiding surprising side effects.',
              ],
              bullets: [
                'Name hooks with a use prefix.',
                'Return the state and actions callers actually need.',
                'Keep effects focused on one external concern.',
              ],
            },
            {
              id: 'react-lesson-1-image',
              type: 'image',
              title: 'Composing hooks',
              src: 'https://via.placeholder.com/960x540/8b5cf6/ffffff?text=component+%E2%86%92+hook+%E2%86%92+hook',
              alt: 'Diagram of a component calling a custom hook that composes another hook.',
              caption:
                'Hooks let components share behaviour without inheritance.',
            },
            {
              id: 'react-lesson-1-video',
              type: 'video',
              title: 'Watch: extracting a hook',
              src: VIDEO_URL,
              poster:
                'https://via.placeholder.com/960x540/6d28d9/ffffff?text=Custom+hooks',
              transcript:
                'Find repeated stateful behaviour, move it into a use-prefixed function, then narrow the returned interface.',
            },
          ],
          activities: [
            {
              id: 'activity-react-hooks-quiz',
              type: 'quiz',
              title: 'Hook rules and composition',
              passingScore: 80,
              questions: [
                {
                  id: 'q-react-hook-name',
                  prompt: 'Which name convention identifies a custom hook?',
                  options: ['hookName', 'useName', 'withName', 'getName'],
                  correctIndex: 1,
                  explanation:
                    'Custom hooks begin with use so tooling can enforce the rules of hooks.',
                },
                {
                  id: 'q-react-hook-state',
                  prompt: 'Which built-in hook adds local state to a function component?',
                  options: ['useEffect', 'useState', 'useRef', 'useContext'],
                  correctIndex: 1,
                  explanation: 'useState returns a value and a setter.',
                },
              ],
            },
            {
              id: 'activity-react-hooks-exercise',
              type: 'exercise',
              title: 'Name the hook',
              prompt: 'What prefix should a custom hook start with? Type the prefix only.',
              acceptedAnswers: ['use'],
              explanation:
                'The use prefix is how React tooling recognises a hook.',
            },
          ],
          completion: {
            requiredActivityIds: [
              'activity-react-hooks-quiz',
              'activity-react-hooks-exercise',
            ],
          },
        },
        {
          id: 'lesson-2',
          title: 'Performance Optimization',
          summary:
            'Use profiling evidence to decide whether memoisation, splitting or redesign is the right next step.',
          duration: '80 min',
          level: 'Advanced',
          objectiveIds: ['react-performance'],
          prerequisites: {
            lessonIds: ['lesson-1'],
            objectiveIds: ['react-hooks'],
          },
          blocks: [
            {
              id: 'react-lesson-2-text',
              type: 'text',
              title: 'Optimise the measured bottleneck',
              paragraphs: [
                'Performance work starts with a profile and a user-visible symptom. Optimising a component that does not cause the problem adds complexity without improving the experience.',
                'Memoisation trades memory and comparison cost for fewer renders. It is useful only when a render is expensive and its inputs are stable.',
              ],
              bullets: [
                'Measure before changing code.',
                'Prefer fixing unnecessary work over wrapping everything in memo.',
                'Keep optimisation decisions tied to evidence.',
              ],
            },
            {
              id: 'react-lesson-2-image',
              type: 'image',
              title: 'A performance feedback loop',
              src: 'https://via.placeholder.com/960x540/ef4444/ffffff?text=measure+%E2%86%92+change+%E2%86%92+measure',
              alt: 'Loop diagram showing measurement before and after a performance change.',
              caption:
                'A profiling change should be reversible and tied to a measurement.',
            },
            {
              id: 'react-lesson-2-video',
              type: 'video',
              title: 'Watch: reading a render profile',
              src: VIDEO_URL,
              poster:
                'https://via.placeholder.com/960x540/b91c1c/ffffff?text=React+performance',
              transcript:
                'Record an interaction, find the component that dominates render time, then test one focused change.',
            },
          ],
          activities: [
            {
              id: 'activity-react-performance-quiz',
              type: 'quiz',
              title: 'Optimisation decisions',
              passingScore: 80,
              questions: [
                {
                  id: 'q-react-measure',
                  prompt: 'What should come before a React performance change?',
                  options: [
                    'Memoising every component',
                    'A measurement of the bottleneck',
                    'Adding more state',
                    'Removing all effects',
                  ],
                  correctIndex: 1,
                  explanation:
                    'A profile or measurement identifies where optimisation can help.',
                },
                {
                  id: 'q-react-memo',
                  prompt: 'What does React.memo primarily try to avoid?',
                  options: [
                    'Re-rendering a component when props are unchanged',
                    'Fetching data',
                    'Creating state',
                    'Running all effects',
                  ],
                  correctIndex: 0,
                  explanation:
                    'React.memo can skip a re-render when props compare equal.',
                },
              ],
            },
            {
              id: 'activity-react-performance-project',
              type: 'project',
              title: 'Write a measurement plan',
              brief:
                'Choose one slow interaction in an app you know. Write a short plan that measures it, proposes one change and defines how you will know whether it helped.',
              requirements: [
                'Name the user-visible symptom.',
                'Describe the measurement you will take.',
                'Propose one focused change, not a rewrite.',
                'State the evidence that would make you revert the change.',
              ],
              deliverables: [
                'A short measurement plan.',
                'One expected before/after metric.',
                'A note on the trade-off you are accepting.',
              ],
              reflectionPrompt:
                'Explain why your proposed change targets the measured bottleneck rather than a guess.',
              rubric: [
                {
                  id: 'rubric-measurement',
                  title: 'Measurement',
                  description:
                    'The plan starts from observable evidence and names a metric.',
                  levels: {
                    emerging: 'The plan names no measurement or metric.',
                    proficient:
                      'The plan describes a relevant measurement and baseline.',
                    advanced:
                      'The plan defines a repeatable experiment and a decision threshold.',
                  },
                },
                {
                  id: 'rubric-change',
                  title: 'Focused change',
                  description:
                    'The proposed change is proportionate to the measured problem.',
                  levels: {
                    emerging: 'The change is unrelated or a broad rewrite.',
                    proficient:
                      'The change addresses the named bottleneck with limited scope.',
                    advanced:
                      'The change is minimal, reversible and tied to the evidence.',
                  },
                },
                {
                  id: 'rubric-tradeoff',
                  title: 'Trade-off reasoning',
                  description:
                    'The learner explains the cost of the optimisation.',
                  levels: {
                    emerging: 'No trade-off is considered.',
                    proficient:
                      'The learner names a cost such as memory or complexity.',
                    advanced:
                      'The learner defines when the optimisation should be reverted or revisited.',
                  },
                },
              ],
            },
          ],
          completion: {
            requiredActivityIds: [
              'activity-react-performance-quiz',
              'activity-react-performance-project',
            ],
          },
        },
      ],
    },
  ],
};
