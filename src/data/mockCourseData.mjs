// Mock course data for the platform

export const courses = [
  {
    id: 'web-dev-101',
    title: 'Web Development Fundamentals',
    description: 'Learn the basics of web development with HTML, CSS, and JavaScript',
    instructor: 'Dr. Sarah Mitchell',
    duration: '8 weeks',
    level: 'Beginner',
    thumbnail: 'https://via.placeholder.com/400x250/0ea5e9/ffffff?text=Web+Dev+101',
    enrolled: 1234,
    rating: 4.8,
    lessons: [
      {
        id: 'lesson-1',
        title: 'Introduction to HTML',
        duration: '45 min',
        type: 'video',
        completed: false,
        content: 'Learn the fundamentals of HTML structure and semantic markup.',
        slides: [
          'https://via.placeholder.com/800x600/0ea5e9/ffffff?text=Slide+1:+What+is+HTML',
          'https://placeholder.com/800x600/3b82f6/ffffff?text=Slide+2:+HTML+Structure',
          'https://placeholder.com/800x600/6366f1/ffffff?text=Slide+3:+Basic+Tags',
          'https://placeholder.com/800x600/8b5cf6/ffffff?text=Slide+4:+Semantic+HTML',
          'https://placeholder.com/800x600/a855f7/ffffff?text=Slide+5:+Practice+Examples',
        ],
        analogies: ['HTML is like the skeleton of a house — it provides the structure that everything else sits on.', 'Semantic HTML tags are like labeled boxes — they tell browsers what kind of content goes inside.'],
        prerequisiteLessonIds: [],
        quiz: [
          {
            question: 'What does HTML stand for?',
            options: ['Hyper Text Markup Language', 'High Tech Modern Language', 'Hyper Transfer Markup Language', 'Home Tool Markup Language'],
            correctIndex: 0,
            explanation: 'HTML stands for Hyper Text Markup Language. It is the standard markup language for documents designed to be displayed in a web browser.'
          },
          {
            question: 'Which HTML element is used to define the document title?',
            options: ['<title>', '<head>', '<meta>', '<body>'],
            correctIndex: 0,
            explanation: '<title> goes inside the <head> element and defines the title shown in the browser tab.'
          },
          {
            question: 'What is the correct HTML element for inserting a line break?',
            options: ['<break>', '<newline>', '<br>', '<line>'],
            correctIndex: 2,
            explanation: '<br> is the HTML element for line breaks.'
          }
        ],
        videoUrl: 'https://commonsware.com/misc/vid-bigbuckbunny-320x180.mp4',
        simulation: {
          id: 'lesson-1_simulation',
          description: 'Create a heading that displays: Welcome to HTML',
          requirements: [
            'Output must be exactly "Welcome to HTML"',
            'Check spelling and capitalization',
            'No extra spaces before or after'
          ],
          expectedOutput: 'Welcome to HTML',
          caseSensitive: true,
          type: 'text',
          difficulty: 'Beginner',
          placeholder: 'Type your output here...',
          hints: [
            'Make sure "Welcome" starts with a capital W and "HTML" is all caps.',
            'Check that there are single spaces between each word.',
            'Verify there are no extra spaces at the beginning or end of your text.'
          ],
          successMessage: 'Excellent! You correctly created the heading. This is how HTML displays text content!'
        },
      },
      {
        id: 'lesson-2',
        title: 'CSS Styling Basics',
        duration: '60 min',
        type: 'video',
        completed: false,
        content: 'Master CSS selectors, properties, and the box model.',
        slides: [
          'https://via.placeholder.com/800x600/10b981/ffffff?text=Slide+1:+CSS+Introduction',
          'https://via.placeholder.com/800x600/14b8a6/ffffff?text=Slide+2:+Selectors',
          'https://via.placeholder.com/800x600/06b6d4/ffffff?text=Slide+3:+Box+Model',
          'https://via.placeholder.com/800x600/0284c7/ffffff?text=Slide+4:+Colors+%26+Fonts',
          'https://via.placeholder.com/800x600/0369a1/ffffff?text=Slide+5:+Layout+Basics',
        ],
        videoUrl: 'https://commonsware.com/misc/vid-bigbuckbunny-320x180.mp4',
        prerequisiteLessonIds: ['lesson-1'],
        prerequisiteObjectiveIds: ['prog-variable', 'prog-boolean'],
        simulation: {
          id: 'lesson-2_simulation',
          description: 'Create CSS property declaration: color: blue;',
          requirements: [
            'Must include property name "color"',
            'Must include colon (:)',
            'Must include value "blue"',
            'Must end with semicolon (;)',
            'Format: property: value;'
          ],
          expectedOutput: 'color: blue;',
          caseSensitive: false,
          type: 'text',
          difficulty: 'Beginner',
          placeholder: 'Write CSS property here...',
          hints: [
            'CSS properties follow the pattern: property-name: value;',
            'Don\'t forget the colon after "color".',
            'Make sure to end with a semicolon.'
          ],
          successMessage: 'Perfect! You\'ve written a valid CSS property declaration. This is the foundation of CSS styling!'
        },
      },
      {
        id: 'lesson-3',
        title: 'JavaScript Essentials',
        duration: '90 min',
        type: 'video',
        completed: false,
        content: 'Get started with JavaScript variables, functions, and DOM manipulation.',
        slides: [
          'https://via.placeholder.com/800x600/f59e0b/ffffff?text=Slide+1:+JavaScript+Intro',
          'https://via.placeholder.com/800x600/f97316/ffffff?text=Slide+2:+Variables+%26+Types',
          'https://via.placeholder.com/800x600/ef4444/ffffff?text=Slide+3:+Functions',
          'https://via.placeholder.com/800x600/dc2626/ffffff?text=Slide+4:+DOM+Basics',
          'https://via.placeholder.com/800x600/b91c1c/ffffff?text=Slide+5:+Events',
          'https://via.placeholder.com/800x600/991b1b/ffffff?text=Slide+6:+Practice+Time',
        ],
        videoUrl: 'https://commonsware.com/misc/vid-bigbuckbunny-320x180.mp4',
        prerequisiteLessonIds: ['lesson-1', 'lesson-2'],
        prerequisiteObjectiveIds: ['prog-variable', 'prog-boolean', 'prog-loop'],
        simulation: {
          id: 'lesson-3_simulation',
          description: 'Calculate the result of: 5 + 3',
          requirements: [
            'Perform the addition',
            'Enter only the numeric result',
            'No extra text or symbols'
          ],
          expectedOutput: '8',
          caseSensitive: false,
          type: 'numeric',
          difficulty: 'Beginner',
          placeholder: 'Enter the result...',
          hints: [
            'What is 5 plus 3?',
            'Use basic arithmetic to add the two numbers.',
            'The answer should be a single number.'
          ],
          successMessage: 'Great! You calculated the correct result. JavaScript can perform mathematical operations just like this!'
        },
      },
      {
        id: 'lesson-4',
        title: 'Building Your First Website',
        duration: '120 min',
        type: 'project',
        completed: false,
        content: 'Apply your knowledge by building a complete personal portfolio website.',
        slides: [
          'https://via.placeholder.com/800x600/ec4899/ffffff?text=Slide+1:+Project+Overview',
          'https://via.placeholder.com/800x600/d946ef/ffffff?text=Slide+2:+Planning',
          'https://via.placeholder.com/800x600/c026d3/ffffff?text=Slide+3:+HTML+Structure',
          'https://via.placeholder.com/800x600/a21caf/ffffff?text=Slide+4:+Styling',
          'https://via.placeholder.com/800x600/86198f/ffffff?text=Slide+5:+JavaScript',
          'https://via.placeholder.com/800x600/701a75/ffffff?text=Slide+6:+Deployment',
        ],
        videoUrl: 'https://commonsware.com/misc/vid-bigbuckbunny-320x180.mp4',
        prerequisiteLessonIds: ['lesson-1', 'lesson-2', 'lesson-3'],
        prerequisiteObjectiveIds: ['prog-variable', 'prog-boolean', 'prog-loop'],
      },
    ],
  },
  {
    id: 'python-basics',
    title: 'Python Programming for Beginners',
    description: 'Master Python fundamentals and start building real applications',
    instructor: 'Prof. James Chen',
    duration: '6 weeks',
    level: 'Beginner',
    thumbnail: 'https://via.placeholder.com/400x250/10b981/ffffff?text=Python+Basics',
    enrolled: 2156,
    rating: 4.9,
    lessons: [
      {
        id: 'lesson-1',
        title: 'Python Setup & Syntax',
        duration: '40 min',
        type: 'video',
        completed: false,
        content: 'Install Python and learn basic syntax and data types.',
        slides: [
          'https://via.placeholder.com/800x600/10b981/ffffff?text=Slide+1:+Why+Python',
          'https://placeholder.com/800x600/059669/ffffff?text=Slide+2:+Installation',
          'https://placeholder.com/800x600/047857/ffffff?text=Slide+3:+Variables',
          'https://placeholder.com/800x600/065f46/ffffff?text=Slide+4:+Data+Types',
        ],
        analogies: ['Python is like a Swiss army knife — versatile and useful for many tasks, from scripting to data science to web development.', 'Variables are like labeled boxes — you put data in one and take it out later.'],
        prerequisiteLessonIds: [],
        quiz: [
          {
            question: 'Which of the following is a valid Python comment?',
            options: ['// This is a comment', '/* This is a comment */', '# This is a comment', 'Both # This is a comment and /* This is a comment */'],
            correctIndex: 3,
            explanation: 'Python uses # for single-line comments and /* */ for multi-line comments, like many C-derived languages.'
          },
          {
            question: 'What is the correct file extension for Python files?',
            options: ['.python', '.pyn', '.py', '.python_script'],
            correctIndex: 2,
            explanation: '.py is the standard file extension for Python source code files.'
          },
          {
            question: 'Which function returns the type of an object?',
            options: ['typeof()', 'dataType()', 'type()', 'objectType()'],
            correctIndex: 2,
            explanation: 'The built-in type() function returns the type of the object passed to it as an argument.'
          }
        ],
        videoUrl: 'https://commonsware.com/misc/vid-bigbuckbunny-320x180.mp4',
      },
      {
        id: 'lesson-2',
        title: 'Control Flow & Functions',
        duration: '55 min',
        type: 'video',
        completed: false,
        content: 'Master if statements, loops, and function definitions.',
        slides: [
          'https://via.placeholder.com/800x600/3b82f6/ffffff?text=Slide+1:+If+Statements',
          'https://via.placeholder.com/800x600/2563eb/ffffff?text=Slide+2:+Loops',
          'https://via.placeholder.com/800x600/1d4ed8/ffffff?text=Slide+3:+Functions',
          'https://via.placeholder.com/800x600/1e40af/ffffff?text=Slide+4:+Parameters',
          'https://via.placeholder.com/800x600/1e3a8a/ffffff?text=Slide+5:+Practice',
        ],
        videoUrl: 'https://commonsware.com/misc/vid-bigbuckbunny-320x180.mp4',
        prerequisiteLessonIds: ['lesson-1'],
        prerequisiteObjectiveIds: ['prog-variable', 'prog-boolean'],
      },
      {
        id: 'lesson-3',
        title: 'Data Structures',
        duration: '70 min',
        type: 'video',
        completed: false,
        content: 'Work with lists, dictionaries, sets, and tuples.',
        slides: [
          'https://via.placeholder.com/800x600/f59e0b/ffffff?text=Slide+1:+Lists',
          'https://via.placeholder.com/800x600/d97706/ffffff?text=Slide+2:+Dictionaries',
          'https://via.placeholder.com/800x600/b45309/ffffff?text=Slide+3:+Sets',
          'https://via.placeholder.com/800x600/92400e/ffffff?text=Slide+4:+Tuples',
          'https://via.placeholder.com/800x600/78350f/ffffff?text=Slide+5:+Comparison',
        ],
        videoUrl: 'https://commonsware.com/misc/vid-bigbuckbunny-320x180.mp4',
        prerequisiteLessonIds: ['lesson-1', 'lesson-2'],
        prerequisiteObjectiveIds: ['prog-variable', 'prog-boolean', 'prog-loop'],
      },
    ],
  },
  {
    id: 'react-advanced',
    title: 'Advanced React Patterns',
    description: 'Take your React skills to the next level with advanced patterns and best practices',
    instructor: 'Emma Rodriguez',
    duration: '10 weeks',
    level: 'Advanced',
    thumbnail: 'https://via.placeholder.com/400x250/8b5cf6/ffffff?text=Advanced+React',
    enrolled: 892,
    rating: 4.7,
    lessons: [
      {
        id: 'lesson-1',
        title: 'Custom Hooks Deep Dive',
        duration: '65 min',
        type: 'video',
        completed: false,
        content: 'Learn to create powerful custom hooks for code reuse.',
        analogies: ['Custom hooks are like utility belts for React — they let you package and reuse behavior across components without wrapping them in inheritance.', 'Hooks let you "hook into" React state and lifecycle features from function components.'],
        prerequisiteLessonIds: [],
        quiz: [
          {
            question: 'Which hook is used to add local state to a function component?',
            options: ['useEffect', 'useState', 'useReducer', 'useContext'],
            correctIndex: 1,
            explanation: 'useState lets you add local state to function components. It returns the current state value and a function to update it.'
          },
          {
            question: 'Which hook is used for side effects in function components?',
            options: ['useState', 'useRef', 'useEffect', 'useContext'],
            correctIndex: 2,
            explanation: 'useEffect runs after render and is used for side effects like data fetching, subscriptions, or manually changing the DOM.'
          },
          {
            question: 'Can you use useState inside a regular function (not a component)?',
            options: ['Yes', 'No', 'Only if it is wrapped in useCallback', 'Only if it is wrapped in useEffect'],
            correctIndex: 1,
            explanation: 'Hooks like useState only work inside React function components or custom hooks. They do not work in regular JavaScript functions.'
          }
        ],
        videoUrl: 'https://commonsware.com/misc/vid-bigbuckbunny-320x180.mp4',
      },
      {
        id: 'lesson-2',
        title: 'Performance Optimization',
        duration: '80 min',
        type: 'video',
        completed: false,
        content: 'Master React.memo, useMemo, useCallback, and code splitting.',
        prerequisiteLessonIds: ['lesson-1'],
        prerequisiteObjectiveIds: ['prog-variable', 'prog-boolean', 'prog-loop'],
      },
    ],
  },
];

export const getCourseById = (courseId) => {
  return courses.find((course) => course.id === courseId);
};

export const getLessonById = (courseId, lessonId) => {
  const course = getCourseById(courseId);
  if (!course) return null;
  return course.lessons.find((lesson) => lesson.id === lessonId);
};
