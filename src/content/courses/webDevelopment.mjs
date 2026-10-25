import {
  baseMasteryCriteria,
  cloneMasteryCriteria,
  journeyAssessmentMasteryCriteria,
} from '../masteryPresets.mjs';

const VIDEO_URL =
  'https://commonsware.com/misc/vid-bigbuckbunny-320x180.mp4';

export const webDevelopmentCourse = {
  schemaVersion: 1,
  id: 'web-dev-101',
  title: 'Web Development Fundamentals',
  subject: 'Web Development',
  description:
    'Learn how browsers turn HTML, CSS and JavaScript into accessible, interactive pages.',
  instructor: 'Dr. Sarah Mitchell',
  duration: '8 weeks',
  level: 'Beginner',
  thumbnail:
    'https://via.placeholder.com/400x250/0ea5e9/ffffff?text=Web+Development',
  enrolled: 1234,
  rating: 4.8,
  activityExtensions: {},
  objectives: [
    {
      id: 'html-document-structure',
      title: 'Describe the three main parts of an HTML document',
      description:
        '<html> wraps the document, <head> holds metadata and <body> holds the visible content.',
      prerequisiteIds: [],
      masteryCriteria: cloneMasteryCriteria(journeyAssessmentMasteryCriteria),
    },
    {
      id: 'html-tag-anatomy',
      title: 'Read and write HTML tags and attributes',
      description:
        'Recognize opening and closing tags and how attributes add information to an element.',
      prerequisiteIds: ['html-document-structure'],
      masteryCriteria: cloneMasteryCriteria(journeyAssessmentMasteryCriteria),
    },
    {
      id: 'html-semantics',
      title: 'Choose semantic elements for page regions',
      description:
        'Pick <header>, <nav>, <main> and <footer> based on what a region actually does.',
      prerequisiteIds: ['html-document-structure', 'html-tag-anatomy'],
      masteryCriteria: cloneMasteryCriteria(journeyAssessmentMasteryCriteria),
    },
    {
      id: 'css-selectors',
      title: 'Select elements with CSS',
      description:
        'Write selectors that target the elements you intend to style.',
      prerequisiteIds: ['html-tag-anatomy'],
      masteryCriteria: cloneMasteryCriteria(baseMasteryCriteria),
    },
    {
      id: 'css-box-model',
      title: 'Explain the CSS box model',
      description:
        'Describe content, padding, border and margin and how they affect size.',
      prerequisiteIds: ['css-selectors'],
      masteryCriteria: cloneMasteryCriteria(baseMasteryCriteria),
    },
    {
      id: 'javascript-dom-basics',
      title: 'Update a page with JavaScript',
      description:
        'Read a value, respond to an event and change visible page content safely.',
      prerequisiteIds: ['html-document-structure'],
      masteryCriteria: cloneMasteryCriteria(baseMasteryCriteria),
    },
    {
      id: 'portfolio-project',
      title: 'Plan and build a small portfolio page',
      description:
        'Combine semantic structure, styling and interaction in a reviewable project.',
      prerequisiteIds: [
        'html-document-structure',
        'html-tag-anatomy',
        'html-semantics',
        'css-selectors',
        'javascript-dom-basics',
      ],
      masteryCriteria: cloneMasteryCriteria(baseMasteryCriteria),
    },
  ],
  modules: [
    {
      id: 'web-html-css-foundations',
      title: 'Page Structure and Styling',
      description:
        'Build the document skeleton, add semantic regions and style them with CSS.',
      level: 'Beginner',
      lessons: [
        {
          id: 'lesson-1',
          title: 'Introduction to HTML',
          summary:
            'Learn how a browser reads a document and how semantic markup describes page regions.',
          duration: '45 min',
          level: 'Beginner',
          objectiveIds: [
            'html-document-structure',
            'html-tag-anatomy',
            'html-semantics',
          ],
          prerequisites: { lessonIds: [], objectiveIds: [] },
          blocks: [
            {
              id: 'html-lesson-1-text',
              type: 'text',
              title: 'A document made of parts',
              paragraphs: [
                'HTML gives a page its structure. The browser reads the markup and builds the elements a visitor sees.',
                'Every document has three main parts: <html> wraps the document, <head> holds information about the page, and <body> holds everything visible.',
              ],
              bullets: [
                '<head> is metadata; <body> is visible content.',
                'Opening and closing tags work as a pair.',
                'Semantic tags describe the role of a region.',
              ],
            },
            {
              id: 'html-lesson-1-image',
              type: 'image',
              title: 'The three parts of an HTML document',
              src: 'https://via.placeholder.com/960x540/0ea5e9/ffffff?text=html+%E2%86%92+head+%2B+body',
              alt: 'Diagram showing html wrapping a head section and a body section.',
              caption:
                'The html element contains both head metadata and body content.',
            },
            {
              id: 'html-lesson-1-video',
              type: 'video',
              title: 'Watch: from tags to a rendered page',
              src: VIDEO_URL,
              poster:
                'https://via.placeholder.com/960x540/0369a1/ffffff?text=HTML+video',
              transcript:
                'The browser parses tags into elements, builds a document tree, then paints the visible body content.',
            },
          ],
          activities: [
            {
              id: 'activity-html-quiz',
              type: 'quiz',
              title: 'Check the document model',
              instructions: 'Answer all questions, then submit for feedback.',
              passingScore: 80,
              questions: [
                {
                  id: 'q-html-head',
                  prompt: 'Which element contains metadata such as the page title?',
                  options: ['<head>', '<body>', '<main>', '<footer>'],
                  correctIndex: 0,
                  explanation:
                    '<head> contains metadata. <body> contains the content rendered in the viewport.',
                },
                {
                  id: 'q-html-body',
                  prompt: 'Which element holds the content a visitor sees?',
                  options: ['<head>', '<body>', '<title>', '<meta>'],
                  correctIndex: 1,
                  explanation:
                    '<body> wraps the rendered content of the page.',
                },
              ],
            },
            {
              id: 'activity-html-simulation',
              type: 'simulation',
              title: 'Write the visible heading',
              task: {
                id: 'web-lesson-1-heading',
                description: 'Create a heading that displays: Welcome to HTML',
                requirements: [
                  'Output must be exactly "Welcome to HTML"',
                  'Check spelling and capitalization',
                  'No extra spaces before or after',
                ],
                expectedOutput: 'Welcome to HTML',
                caseSensitive: true,
                type: 'text',
                difficulty: 'Beginner',
                placeholder: 'Type your output here...',
                hints: [
                  'Make sure Welcome starts with a capital W and HTML is all caps.',
                  'Use single spaces between the words.',
                  'Remove any extra spaces at the beginning or end.',
                ],
                successMessage:
                  'Correct. A heading is text content placed inside a page structure.',
              },
            },
          ],
          completion: {
            requiredActivityIds: [
              'activity-html-quiz',
              'activity-html-simulation',
            ],
          },
        },
        {
          id: 'lesson-2',
          title: 'CSS Styling Basics',
          summary:
            'Master selectors, properties and the box model so the page is readable and intentional.',
          duration: '60 min',
          level: 'Beginner',
          objectiveIds: ['css-selectors', 'css-box-model'],
          prerequisites: {
            lessonIds: ['lesson-1'],
            objectiveIds: [
              'html-document-structure',
              'html-tag-anatomy',
              'html-semantics',
            ],
          },
          blocks: [
            {
              id: 'css-lesson-2-text',
              type: 'text',
              title: 'Selectors connect HTML and CSS',
              paragraphs: [
                'A CSS rule chooses elements with a selector, then applies declarations inside a block.',
                'The box model explains how content, padding, border and margin combine to determine the space an element occupies.',
              ],
              bullets: [
                'Element selector: p { color: #334155; }',
                'Class selector: .card { padding: 1rem; }',
                'The content box sits inside padding, border and margin.',
              ],
            },
            {
              id: 'css-lesson-2-image',
              type: 'image',
              title: 'The CSS box model',
              src: 'https://via.placeholder.com/960x540/10b981/ffffff?text=content+%2B+padding+%2B+border+%2B+margin',
              alt: 'Nested boxes labelled content, padding, border and margin.',
              caption:
                'Margin is outside the border. Padding is inside the border.',
            },
            {
              id: 'css-lesson-2-video',
              type: 'video',
              title: 'Watch: styling one component',
              src: VIDEO_URL,
              poster:
                'https://via.placeholder.com/960x540/047857/ffffff?text=CSS+video',
              transcript:
                'Start with layout, then spacing, then colour and typography. Inspect the box model when spacing feels wrong.',
            },
          ],
          activities: [
            {
              id: 'activity-css-quiz',
              type: 'quiz',
              title: 'CSS selector check',
              passingScore: 80,
              questions: [
                {
                  id: 'q-css-class',
                  prompt: 'Which selector targets class="card"?',
                  options: ['#card', '.card', 'card', '*card'],
                  correctIndex: 1,
                  explanation:
                    'A class selector begins with a dot, for example .card.',
                },
                {
                  id: 'q-css-margin',
                  prompt: 'Which part of the box model sits outside the border?',
                  options: ['content', 'padding', 'border', 'margin'],
                  correctIndex: 3,
                  explanation:
                    'Margin is the outermost layer of the box model.',
                },
                {
                  id: 'q-css-cascade',
                  prompt: 'What does a more specific selector usually do?',
                  options: [
                    'It always wins over every later rule',
                    'It can take precedence when specificity resolves a conflict',
                    'It deletes less specific rules',
                    'It disables inheritance',
                  ],
                  correctIndex: 1,
                  explanation:
                    'Specificity helps the browser decide between competing declarations.',
                },
              ],
            },
            {
              id: 'activity-css-exercise',
              type: 'exercise',
              title: 'Write a declaration',
              prompt: 'Write a CSS declaration that makes the text blue.',
              acceptedAnswers: ['color: blue;', 'color:blue;', 'color: blue'],
              explanation:
                'A declaration has a property, a colon, a value and usually a semicolon.',
            },
            {
              id: 'activity-css-simulation',
              type: 'simulation',
              title: 'Create a valid CSS declaration',
              task: {
                id: 'web-lesson-2-css',
                description: 'Create the CSS property declaration: color: blue;',
                requirements: [
                  'Must include the property name "color"',
                  'Must include a colon',
                  'Must include the value "blue"',
                  'Must end with a semicolon',
                ],
                expectedOutput: 'color: blue;',
                caseSensitive: false,
                type: 'text',
                difficulty: 'Beginner',
                placeholder: 'Write the CSS declaration here...',
                hints: [
                  'Properties follow the pattern property: value;',
                  'Put the colon after color.',
                  'Finish the declaration with a semicolon.',
                ],
                successMessage:
                  'That is a valid CSS declaration and the foundation of a style rule.',
              },
            },
          ],
          completion: {
            requiredActivityIds: [
              'activity-css-quiz',
              'activity-css-exercise',
              'activity-css-simulation',
            ],
          },
        },
      ],
    },
    {
      id: 'web-javascript-interactivity',
      title: 'Making Pages Interactive',
      description:
        'Use JavaScript values and DOM updates to react to a learner action.',
      level: 'Intermediate',
      lessons: [
        {
          id: 'lesson-3',
          title: 'JavaScript Essentials',
          summary:
            'Work with values, functions and the DOM to update a page after an event.',
          duration: '90 min',
          level: 'Intermediate',
          objectiveIds: ['javascript-dom-basics'],
          prerequisites: {
            lessonIds: ['lesson-1', 'lesson-2'],
            objectiveIds: ['html-document-structure', 'css-selectors'],
          },
          blocks: [
            {
              id: 'js-lesson-3-text',
              type: 'text',
              title: 'Values, functions and the DOM',
              paragraphs: [
                'JavaScript stores values in variables, combines them in expressions and packages reusable work in functions.',
                'The Document Object Model exposes the page as objects. A program can select an element, listen for an event and update text safely.',
              ],
              bullets: [
                'let count = 0;',
                'A function can read inputs and return a result.',
                'Use textContent for plain text instead of injecting untrusted HTML.',
              ],
            },
            {
              id: 'js-lesson-3-image',
              type: 'image',
              title: 'From event to visible change',
              src: 'https://via.placeholder.com/960x540/f59e0b/ffffff?text=event+%E2%86%92+function+%E2%86%92+DOM+update',
              alt: 'Flow diagram from a click event through a function to a DOM update.',
              caption:
                'An event handler runs a function, which updates the page model.',
            },
            {
              id: 'js-lesson-3-video',
              type: 'video',
              title: 'Watch: a small DOM interaction',
              src: VIDEO_URL,
              poster:
                'https://via.placeholder.com/960x540/b45309/ffffff?text=JavaScript+video',
              transcript:
                'Select the button, attach a click listener, update a counter and write the new value into an element.',
            },
          ],
          activities: [
            {
              id: 'activity-js-quiz',
              type: 'quiz',
              title: 'JavaScript fundamentals',
              passingScore: 80,
              questions: [
                {
                  id: 'q-js-variable',
                  prompt: 'Which declaration creates a reassignable variable?',
                  options: ['const x = 1;', 'let x = 1;', 'fixed x = 1;', 'value x = 1;'],
                  correctIndex: 1,
                  explanation:
                    'let creates a block-scoped variable that can be reassigned.',
                },
                {
                  id: 'q-js-dom-text',
                  prompt: 'Which property updates an element with plain text safely?',
                  options: ['innerHTML', 'textContent', 'outerText', 'styleText'],
                  correctIndex: 1,
                  explanation:
                    'textContent treats the value as text rather than parsing markup.',
                },
              ],
            },
            {
              id: 'activity-js-exercise',
              type: 'exercise',
              title: 'Predict a function result',
              prompt: 'What number does 5 + 3 produce? Enter only the number.',
              acceptedAnswers: ['8'],
              explanation:
                'The addition expression evaluates to 8 before anything else happens.',
            },
            {
              id: 'activity-js-simulation',
              type: 'simulation',
              title: 'Calculate the result',
              task: {
                id: 'web-lesson-3-sum',
                description: 'Calculate the result of: 5 + 3',
                requirements: [
                  'Perform the addition',
                  'Enter only the numeric result',
                  'No extra text or symbols',
                ],
                expectedOutput: '8',
                caseSensitive: false,
                type: 'numeric',
                difficulty: 'Intermediate',
                placeholder: 'Enter the result...',
                hints: ['Add the two numbers.', 'The answer is a single digit.', 'Do not include text.'],
                successMessage:
                  'Correct. JavaScript evaluates arithmetic expressions before using the result.',
              },
            },
          ],
          completion: {
            requiredActivityIds: [
              'activity-js-quiz',
              'activity-js-exercise',
              'activity-js-simulation',
            ],
          },
        },
      ],
    },
    {
      id: 'web-portfolio-project',
      title: 'Portfolio Project',
      description:
        'Plan, build and review a small page that combines structure, style and interaction.',
      level: 'Intermediate',
      lessons: [
        {
          id: 'lesson-4',
          title: 'Building Your First Website',
          summary:
            'Apply the course by planning and building a complete personal portfolio page.',
          duration: '120 min',
          level: 'Intermediate',
          objectiveIds: ['portfolio-project'],
          prerequisites: {
            lessonIds: ['lesson-1', 'lesson-2', 'lesson-3'],
            objectiveIds: [
              'html-document-structure',
              'css-selectors',
              'javascript-dom-basics',
            ],
          },
          blocks: [
            {
              id: 'project-lesson-4-text',
              type: 'text',
              title: 'From plan to page',
              paragraphs: [
                'A portfolio is a small, complete product. Decide who it is for, what they should learn and what action they should take.',
                'Build the content structure first, style it second, then add one meaningful interaction. Review the page against the rubric before submitting.',
              ],
              bullets: [
                'One clear heading and a short introduction.',
                'Semantic regions for navigation, main content and footer.',
                'Readable contrast, spacing and focus states.',
                'One interaction that helps the visitor.',
              ],
            },
            {
              id: 'project-lesson-4-image',
              type: 'image',
              title: 'A simple portfolio layout',
              src: 'https://via.placeholder.com/960x540/ec4899/ffffff?text=plan+%E2%86%92+build+%E2%86%92+review',
              alt: 'Three-panel layout showing planning, building and reviewing a portfolio.',
              caption:
                'A small scope with clear structure is better than a large unfinished page.',
            },
            {
              id: 'project-lesson-4-video',
              type: 'video',
              title: 'Watch: project walkthrough',
              src: VIDEO_URL,
              poster:
                'https://via.placeholder.com/960x540/be185d/ffffff?text=Project+video',
              transcript:
                'Start with semantic HTML, add a stylesheet and script, then test keyboard navigation and one interaction.',
            },
          ],
          activities: [
            {
              id: 'activity-portfolio-project',
              type: 'project',
              title: 'Build and self-review a portfolio page',
              brief:
                'Build a one-page portfolio for a fictional or real person. Include a semantic header, a main project section, a contact action and one small JavaScript interaction.',
              requirements: [
                'Use semantic HTML landmarks.',
                'Apply a consistent colour, spacing and type scale.',
                'Include at least one image with useful alternative text.',
                'Add and test one JavaScript interaction.',
                'Make the page usable with a keyboard.',
              ],
              deliverables: [
                'A link or archived folder for the page.',
                'A short note describing the intended audience.',
                'A reflection on one trade-off you made.',
              ],
              reflectionPrompt:
                'Describe the audience and one trade-off or improvement you would make next.',
              rubric: [
                {
                  id: 'rubric-structure',
                  title: 'Semantic structure',
                  description:
                    'The page uses meaningful landmarks and a logical heading order.',
                  levels: {
                    emerging: 'The page renders but regions are mostly generic divs.',
                    proficient:
                      'Header, main, navigation and footer are clear and headings are ordered.',
                    advanced:
                      'Semantic structure is clear, consistent and supports assistive technology.',
                  },
                },
                {
                  id: 'rubric-visual',
                  title: 'Visual communication',
                  description:
                    'Spacing, colour and typography make the content easy to scan.',
                  levels: {
                    emerging: 'Styling is inconsistent or makes some content hard to read.',
                    proficient:
                      'A consistent scale and readable contrast support the content.',
                    advanced:
                      'Visual choices reinforce hierarchy and the intended tone.',
                  },
                },
                {
                  id: 'rubric-interaction',
                  title: 'Interaction',
                  description:
                    'The JavaScript interaction is useful, understandable and safe.',
                  levels: {
                    emerging: 'The interaction is missing or does not work reliably.',
                    proficient:
                      'The interaction works and provides clear feedback.',
                    advanced:
                      'The interaction handles edge cases and communicates state accessibly.',
                  },
                },
                {
                  id: 'rubric-review',
                  title: 'Reflection and review',
                  description:
                    'The learner can explain choices and identify a next improvement.',
                  levels: {
                    emerging: 'The reflection restates the task without evaluating choices.',
                    proficient:
                      'The reflection explains a trade-off and a realistic next step.',
                    advanced:
                      'The reflection connects evidence from testing to a specific improvement.',
                  },
                },
              ],
            },
          ],
          completion: {
            requiredActivityIds: ['activity-portfolio-project'],
          },
        },
      ],
    },
  ],
};
