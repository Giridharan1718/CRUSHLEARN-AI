import {
  baseMasteryCriteria,
  cloneMasteryCriteria,
} from '../masteryPresets.mjs';

const VIDEO_URL =
  'https://commonsware.com/misc/vid-bigbuckbunny-320x180.mp4';

export const pythonProgrammingCourse = {
  schemaVersion: 1,
  id: 'python-basics',
  title: 'Python Programming for Beginners',
  subject: 'Programming',
  description:
    'Build a practical Python foundation: syntax, control flow, data structures and a reviewed mini project.',
  instructor: 'Prof. James Chen',
  duration: '6 weeks',
  level: 'Beginner',
  thumbnail:
    'https://via.placeholder.com/400x250/10b981/ffffff?text=Python+Programming',
  enrolled: 2156,
  rating: 4.9,
  activityExtensions: {
    python_trace: {
      label: 'Python output trace',
      description:
        'Read a short Python snippet and predict the value it prints.',
      requiredFields: ['code', 'expectedOutput'],
    },
  },
  objectives: [
    {
      id: 'python-syntax',
      title: 'Read and write basic Python statements',
      description:
        'Use comments, assignment and simple output with correct Python syntax.',
      prerequisiteIds: [],
      masteryCriteria: cloneMasteryCriteria(baseMasteryCriteria),
    },
    {
      id: 'python-control-flow',
      title: 'Use conditionals, loops and functions',
      description:
        'Choose and combine control-flow statements to express a small algorithm.',
      prerequisiteIds: ['python-syntax'],
      masteryCriteria: {
        ...cloneMasteryCriteria(baseMasteryCriteria),
        minimumDistinctSources: 1,
      },
    },
    {
      id: 'python-data-structures',
      title: 'Choose and use Python collections',
      description:
        'Select lists, dictionaries, sets or tuples for a small data task.',
      prerequisiteIds: ['python-syntax', 'python-control-flow'],
      masteryCriteria: cloneMasteryCriteria(baseMasteryCriteria),
    },
    {
      id: 'python-project',
      title: 'Build a reviewed Python mini project',
      description:
        'Combine input, control flow and collections in a small program with a clear review rubric.',
      prerequisiteIds: [
        'python-syntax',
        'python-control-flow',
        'python-data-structures',
      ],
      masteryCriteria: cloneMasteryCriteria(baseMasteryCriteria),
    },
  ],
  modules: [
    {
      id: 'python-foundations',
      title: 'Python Foundations',
      description:
        'Install the language, read errors and write small programs with syntax and control flow.',
      level: 'Beginner',
      lessons: [
        {
          id: 'lesson-1',
          title: 'Python Setup & Syntax',
          summary:
            'Install Python and learn comments, assignment, data types and output.',
          duration: '40 min',
          level: 'Beginner',
          objectiveIds: ['python-syntax'],
          prerequisites: { lessonIds: [], objectiveIds: [] },
          blocks: [
            {
              id: 'python-lesson-1-text',
              type: 'text',
              title: 'A Python program is a sequence of statements',
              paragraphs: [
                'Python runs statements from top to bottom. Names are bound to values with a single equals sign, and print writes a value to standard output.',
                'Comments begin with # and are ignored by the interpreter. They are useful for explaining why code exists, not for restating what is obvious.',
              ],
              bullets: [
                'x = 5 binds the name x to the integer 5.',
                'print("hi") writes hi to standard output.',
                '# starts a single-line comment.',
                'Python source files use the .py extension.',
              ],
            },
            {
              id: 'python-lesson-1-image',
              type: 'image',
              title: 'From source to output',
              src: 'https://via.placeholder.com/960x540/10b981/ffffff?text=source+code+%E2%86%92+interpreter+%E2%86%92+output',
              alt: 'Diagram of Python source code passing through an interpreter to produce output.',
              caption:
                'The interpreter reads the source file and executes each statement.',
            },
            {
              id: 'python-lesson-1-video',
              type: 'video',
              title: 'Watch: running your first script',
              src: VIDEO_URL,
              poster:
                'https://via.placeholder.com/960x540/047857/ffffff?text=Python+setup+video',
              transcript:
                'Create a .py file, write a comment and a print statement, then run the file from a terminal.',
            },
          ],
          activities: [
            {
              id: 'activity-python-quiz',
              type: 'quiz',
              title: 'Syntax fundamentals',
              passingScore: 80,
              questions: [
                {
                  id: 'q-python-comment',
                  prompt: 'Which symbol starts a Python comment?',
                  options: ['//', '#', '<!--', '--'],
                  correctIndex: 1,
                  explanation: 'Python comments begin with a hash symbol.',
                },
                {
                  id: 'q-python-extension',
                  prompt: 'Which extension identifies a Python source file?',
                  options: ['.js', '.py', '.css', '.md'],
                  correctIndex: 1,
                  explanation: 'Conventional Python source files use .py.',
                },
              ],
            },
            {
              id: 'activity-python-trace',
              type: 'python_trace',
              title: 'Trace a short Python program',
              instructions:
                'Read the snippet and type the value it prints. Do not include extra words.',
              code:
                'total = 0\nfor number in [1, 2, 3]:\n    total += number\nprint(total)',
              expectedOutput: '6',
              explanation:
                'The loop adds 1, 2 and 3 into total. The final print displays 6.',
            },
          ],
          completion: {
            requiredActivityIds: [
              'activity-python-quiz',
              'activity-python-trace',
            ],
          },
        },
        {
          id: 'lesson-2',
          title: 'Control Flow & Functions',
          summary:
            'Master if statements, loops and reusable functions with parameters.',
          duration: '55 min',
          level: 'Beginner',
          objectiveIds: ['python-control-flow'],
          prerequisites: {
            lessonIds: ['lesson-1'],
            objectiveIds: ['python-syntax'],
          },
          blocks: [
            {
              id: 'python-lesson-2-text',
              type: 'text',
              title: 'Programs make decisions and repeat work',
              paragraphs: [
                'An if statement chooses a branch based on a condition. A for loop visits each item in a sequence. A function packages a reusable block behind a name.',
                'Parameters let a function accept input, and return sends a result back to the caller. Clear names and small functions make behaviour easier to test.',
              ],
              bullets: [
                'if score >= 80: print("pass")',
                'for item in items: print(item)',
                'def double(value): return value * 2',
                'Indentation defines blocks in Python.',
              ],
            },
            {
              id: 'python-lesson-2-image',
              type: 'image',
              title: 'A loop and a function together',
              src: 'https://via.placeholder.com/960x540/3b82f6/ffffff?text=condition+%2B+loop+%2B+function',
              alt: 'Flow chart showing a condition, a loop and a function call.',
              caption:
                'Control flow describes the path a program takes through its statements.',
            },
            {
              id: 'python-lesson-2-video',
              type: 'video',
              title: 'Watch: from loop to function',
              src: VIDEO_URL,
              poster:
                'https://via.placeholder.com/960x540/1d4ed8/ffffff?text=Control+flow+video',
              transcript:
                'Write a loop, notice repeated work, then move that work into a function with a parameter and a return value.',
            },
          ],
          activities: [
            {
              id: 'activity-python-control-quiz',
              type: 'quiz',
              title: 'Control-flow check',
              passingScore: 80,
              questions: [
                {
                  id: 'q-python-if',
                  prompt: 'Which keyword starts a conditional branch?',
                  options: ['if', 'for', 'def', 'while'],
                  correctIndex: 0,
                  explanation:
                    'if evaluates a condition and chooses whether to run its block.',
                },
                {
                  id: 'q-python-for',
                  prompt: 'Which loop is designed to visit each item in a sequence?',
                  options: ['if', 'for', 'def', 'return'],
                  correctIndex: 1,
                  explanation:
                    'A for loop iterates over items from an iterable.',
                },
              ],
            },
            {
              id: 'activity-python-exercise',
              type: 'exercise',
              title: 'Write a function header',
              prompt:
                'Write the first line of a function named greet that accepts one parameter named name.',
              acceptedAnswers: ['def greet(name):', 'def greet(name) :'],
              explanation:
                'A function definition begins with def, then the name, parameter list and a colon.',
            },
            {
              id: 'activity-python-simulation',
              type: 'simulation',
              title: 'Calculate a loop total',
              task: {
                id: 'python-lesson-2-total',
                description:
                  'A loop adds the numbers 1, 2 and 3. Enter the final total.',
                requirements: [
                  'Add all three numbers',
                  'Enter only the numeric result',
                  'No words or punctuation',
                ],
                expectedOutput: '6',
                caseSensitive: false,
                type: 'numeric',
                difficulty: 'Beginner',
                placeholder: 'Enter the total...',
                hints: [
                  'Start from zero.',
                  'Add 1, then 2, then 3.',
                  'The result is a single digit.',
                ],
                successMessage:
                  'Correct. A loop can accumulate a result across iterations.',
              },
            },
          ],
          completion: {
            requiredActivityIds: [
              'activity-python-control-quiz',
              'activity-python-exercise',
              'activity-python-simulation',
            ],
          },
        },
      ],
    },
    {
      id: 'python-data',
      title: 'Working with Data',
      description:
        'Choose collections and combine them with the control flow from the previous module.',
      level: 'Intermediate',
      lessons: [
        {
          id: 'lesson-3',
          title: 'Data Structures',
          summary:
            'Work with lists, dictionaries, sets and tuples and choose the right collection for a task.',
          duration: '70 min',
          level: 'Intermediate',
          objectiveIds: ['python-data-structures'],
          prerequisites: {
            lessonIds: ['lesson-1', 'lesson-2'],
            objectiveIds: ['python-syntax', 'python-control-flow'],
          },
          blocks: [
            {
              id: 'python-lesson-3-text',
              type: 'text',
              title: 'Collections give data a shape',
              paragraphs: [
                'Lists keep an ordered sequence that can change. Dictionaries map keys to values. Sets store unique items. Tuples are ordered and immutable.',
                'Choosing a collection is a design decision: it changes which operations are cheap, which guarantees you get, and how readable the surrounding code becomes.',
              ],
              bullets: [
                'scores = [72, 88, 91]',
                'learner = {"name": "Sam", "level": "Beginner"}',
                'unique_tags = {"html", "css"}',
                'point = (4, 7)',
              ],
            },
            {
              id: 'python-lesson-3-image',
              type: 'image',
              title: 'Four collections, four purposes',
              src: 'https://via.placeholder.com/960x540/f59e0b/ffffff?text=list+%7C+dict+%7C+set+%7C+tuple',
              alt: 'Four panels showing a list, dictionary, set and tuple.',
              caption:
                'Pick a collection based on ordering, mutation and uniqueness needs.',
            },
            {
              id: 'python-lesson-3-video',
              type: 'video',
              title: 'Watch: choosing a collection',
              src: VIDEO_URL,
              poster:
                'https://via.placeholder.com/960x540/b45309/ffffff?text=Data+structures+video',
              transcript:
                'Start with the question: does order matter, will the data change, and must values be unique?',
            },
          ],
          activities: [
            {
              id: 'activity-python-data-quiz',
              type: 'quiz',
              title: 'Collection choice',
              passingScore: 80,
              questions: [
                {
                  id: 'q-python-dict',
                  prompt: 'Which collection maps keys to values?',
                  options: ['list', 'tuple', 'dictionary', 'set'],
                  correctIndex: 2,
                  explanation:
                    'A dictionary stores key-value pairs and looks values up by key.',
                },
                {
                  id: 'q-python-set',
                  prompt: 'Which collection stores unique items without relying on order?',
                  options: ['list', 'tuple', 'dictionary', 'set'],
                  correctIndex: 3,
                  explanation:
                    'A set is designed for membership and uniqueness.',
                },
              ],
            },
            {
              id: 'activity-python-data-exercise',
              type: 'exercise',
              title: 'Choose a collection',
              prompt:
                'Which collection should store a learner name, level and streak together? Type one word.',
              acceptedAnswers: ['dictionary', 'dict'],
              explanation:
                'A dictionary keeps named fields together as key-value pairs.',
            },
            {
              id: 'activity-python-data-project',
              type: 'project',
              title: 'Design a small data model',
              brief:
                'Design the data model for a personal study tracker. Decide which collection stores learners, sessions and unique topics, then explain the trade-offs.',
              requirements: [
                'Name the fields for a learner and a study session.',
                'Choose a collection for learners and one for unique topics.',
                'Describe one operation the model makes easy.',
                'Describe one operation the model makes harder.',
              ],
              deliverables: [
                'A short written data model.',
                'One example learner record.',
                'A note on one trade-off.',
              ],
              reflectionPrompt:
                'Explain why your chosen collections fit the operations your tracker needs.',
              rubric: [
                {
                  id: 'rubric-model',
                  title: 'Data model',
                  description:
                    'Fields and collections match the described study tracker.',
                  levels: {
                    emerging: 'The model is incomplete or mixes unrelated fields.',
                    proficient:
                      'The model names the important fields and uses suitable collections.',
                    advanced:
                      'The model is coherent, minimal and handles realistic edge cases.',
                  },
                },
                {
                  id: 'rubric-tradeoff',
                  title: 'Trade-off reasoning',
                  description:
                    'The learner explains what the design makes easy and harder.',
                  levels: {
                    emerging: 'The response lists choices without explaining them.',
                    proficient:
                      'The response explains one concrete advantage and one cost.',
                    advanced:
                      'The response connects the trade-off to a specific future operation.',
                  },
                },
              ],
            },
          ],
          completion: {
            requiredActivityIds: [
              'activity-python-data-quiz',
              'activity-python-data-exercise',
              'activity-python-data-project',
            ],
          },
        },
      ],
    },
    {
      id: 'python-capstone',
      title: 'Python Mini Project',
      description:
        'Combine the whole course in a small, reviewed program.',
      level: 'Advanced',
      lessons: [
        {
          id: 'lesson-4',
          title: 'Mini Project: Study Tracker',
          summary:
            'Build a command-line study tracker with functions and collections, then review it against a rubric.',
          duration: '120 min',
          level: 'Advanced',
          objectiveIds: ['python-project'],
          prerequisites: {
            lessonIds: ['lesson-1', 'lesson-2', 'lesson-3'],
            objectiveIds: [
              'python-syntax',
              'python-control-flow',
              'python-data-structures',
            ],
          },
          blocks: [
            {
              id: 'python-lesson-4-text',
              type: 'text',
              title: 'Ship a small program end to end',
              paragraphs: [
                'A capstone is not a bigger syntax quiz. It is a chance to make decisions, handle input, test a few paths and explain what you would change next.',
                'Keep the scope small. A tracker that records sessions and reports a total is enough if the code is clear and reviewed.',
              ],
              bullets: [
                'Use functions with descriptive names.',
                'Validate input before using it.',
                'Keep data in a dictionary or list with a clear shape.',
                'Test a normal path, a bad input and an empty state.',
              ],
            },
            {
              id: 'python-lesson-4-image',
              type: 'image',
              title: 'A small program has clear seams',
              src: 'https://via.placeholder.com/960x540/8b5cf6/ffffff?text=input+%E2%86%92+validate+%E2%86%92+store+%E2%86%92+report',
              alt: 'Pipeline diagram from input through validation and storage to a report.',
              caption:
                'Small functions make each seam easy to test and explain.',
            },
            {
              id: 'python-lesson-4-video',
              type: 'video',
              title: 'Watch: reviewing a mini project',
              src: VIDEO_URL,
              poster:
                'https://via.placeholder.com/960x540/6d28d9/ffffff?text=Capstone+review',
              transcript:
                'Test the happy path first, then an empty state and invalid input. Review names, boundaries and the explanation.',
            },
          ],
          activities: [
            {
              id: 'activity-python-capstone',
              type: 'project',
              title: 'Build and review a study tracker',
              brief:
                'Build a small command-line study tracker. It should record study sessions with a topic and minutes, then report a total and the most-studied topic.',
              requirements: [
                'Use at least two functions with clear responsibilities.',
                'Store sessions in a list of dictionaries.',
                'Validate that minutes are a positive number.',
                'Handle an empty tracker without crashing.',
                'Explain how you tested the program.',
              ],
              deliverables: [
                'The Python source file or a link to it.',
                'A short test log with normal, invalid and empty cases.',
                'A reflection on one improvement.',
              ],
              reflectionPrompt:
                'Describe one edge case you tested and one improvement you would make next.',
              rubric: [
                {
                  id: 'rubric-program',
                  title: 'Working program',
                  description:
                    'The tracker records sessions and produces the required report.',
                  levels: {
                    emerging: 'The program runs only on a narrow happy path.',
                    proficient:
                      'The program records sessions and handles the main paths.',
                    advanced:
                      'The program handles edge cases and invalid input deliberately.',
                  },
                },
                {
                  id: 'rubric-structure',
                  title: 'Code structure',
                  description:
                    'Functions, names and data shapes make the program easy to follow.',
                  levels: {
                    emerging: 'Logic is duplicated or hidden in one long block.',
                    proficient:
                      'Functions separate input, storage and reporting.',
                    advanced:
                      'Responsibilities and boundaries are clear and consistently named.',
                  },
                },
                {
                  id: 'rubric-evidence',
                  title: 'Testing evidence',
                  description:
                    'The learner describes normal, invalid and empty-state checks.',
                  levels: {
                    emerging: 'No testing evidence is provided.',
                    proficient:
                      'The learner describes at least two meaningful checks.',
                    advanced:
                      'The learner connects test evidence to a code change or trade-off.',
                  },
                },
              ],
            },
          ],
          completion: {
            requiredActivityIds: ['activity-python-capstone'],
          },
        },
      ],
    },
  ],
};
