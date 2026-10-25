// Lesson journey content.
//
// Content only: no scoring, retry or completion logic lives here (that is in
// src/learning/journeyEngine.mjs). A journey is authored for a specific
// course + lesson pair so progress stays course-scoped even when lesson ids
// repeat across courses.

export const learningJourneys = {
  'web-dev-101:lesson-1': {
    schemaVersion: 1,
    courseId: 'web-dev-101',
    lessonId: 'lesson-1',
    title: 'Introduction to HTML',
    policy: {
      passingScore: 80,
      maxAssessmentAttempts: 3,
      maxPracticeAttempts: 2,
    },

    objectives: [
      {
        id: 'html-document-structure',
        title: 'Describe the three main parts of an HTML document',
        description:
          '<html> wraps the document, <head> holds metadata and <body> holds the visible content.',
      },
      {
        id: 'html-tag-anatomy',
        title: 'Read and write HTML tags and attributes',
        description:
          'Recognize opening and closing tags and how attributes add information to an element.',
      },
      {
        id: 'html-semantics',
        title: 'Choose semantic elements for page regions',
        description:
          'Pick <header>, <nav>, <main> and <footer> based on what a region actually does.',
      },
    ],

    explanation: {
      title: 'How an HTML page is put together',
      paragraphs: [
        'HTML (HyperText Markup Language) gives a web page its structure. The browser reads your HTML and builds the elements a visitor sees.',
        'Every document has three main parts: <html> wraps the whole document, <head> holds information about the page, and <body> holds everything visible.',
        'You describe content with tags. Most tags come in pairs: an opening tag like <p> and a closing tag like </p>. Attributes inside the opening tag add extra information, such as <img src="cat.jpg" alt="A cat">.',
        'Semantic elements such as <header>, <nav>, <main> and <footer> describe what a region is. They help browsers, search engines and screen readers understand your page.',
      ],
      keyPoints: [
        '<head> is metadata; <body> is visible content.',
        'Every element has an opening tag and (usually) a matching closing tag.',
        'Attributes live in the opening tag and use name="value".',
        'Semantic tags describe the role of a region.',
        'Indentation is for humans; the browser ignores extra whitespace.',
      ],
    },

    workedExample: {
      title: 'Build a tiny page, step by step',
      introduction:
        'We will build the smallest complete HTML page and grow it into a structured document.',
      steps: [
        {
          title: 'Step 1 — Start with the document type',
          code: '<!DOCTYPE html>',
          note: 'Tells the browser this is a modern HTML5 document. It always goes first.',
        },
        {
          title: 'Step 2 — Wrap everything in <html> and add the <head>',
          code: '<html lang="en">\n  <head>\n    <title>My First Page</title>\n  </head>',
          note: 'The <head> is not visible. The <title> becomes the text on the browser tab.',
        },
        {
          title: 'Step 3 — Add a <body> for visible content',
          code: '  <body>\n    <h1>My First Page</h1>\n  </body>\n</html>',
          note: 'The <h1> heading is now rendered on the page.',
        },
        {
          title: 'Step 4 — Structure the body with semantic regions',
          code:
            '  <body>\n    <header>\n      <h1>My First Page</h1>\n    </header>\n    <main>\n      <p>I am learning HTML.</p>\n    </main>\n    <footer>\n      <p>Built during my first lesson.</p>\n    </footer>\n  </body>',
          note: 'header, main and footer each describe what their region does.',
        },
        {
          title: 'Step 5 — Close every tag in the right order',
          code: '</footer>\n  </body>\n</html>',
          note: 'Tags close in the reverse order they were opened (like nested boxes).',
        },
      ],
      result: {
        title: 'The finished page',
        code:
          '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <title>My First Page</title>\n  </head>\n  <body>\n    <header>\n      <h1>My First Page</h1>\n    </header>\n    <main>\n      <p>I am learning HTML.</p>\n    </main>\n    <footer>\n      <p>Built during my first lesson.</p>\n    </footer>\n  </body>\n</html>',
      },
    },

    guidedPractice: {
      title: 'Guided practice',
      instructions:
        'Answer each question, check your answer and read the feedback. You can retry once if you miss it.',
      items: [
        {
          id: 'gp-1',
          kind: 'single_choice',
          objectiveId: 'html-document-structure',
          prompt: 'Which element holds the content that is visible in the browser window?',
          options: ['<head>', '<body>', '<title>', '<meta>'],
          correctIndex: 1,
          hint: 'Think about which part of the document a visitor actually sees.',
          errorMap: {
            0: 'The <head> stores metadata about the page, not visible content.',
            2: 'The <title> only sets the text shown on the browser tab.',
            3: 'The <meta> tag describes the page to browsers and search engines.',
          },
          errorPatterns: [
            {
              id: 'gp1-head-vs-body',
              category: 'concept_misunderstanding',
              optionIndex: 0,
              misconception: 'Confusing document metadata with visible content.',
              feedback:
                '<head> describes the page; it is not rendered in the viewport. Look for the element that contains what a visitor actually sees.',
              hint: 'Ask which element would still be visible if the page had no styling.',
            },
            {
              id: 'gp1-title-vs-body',
              category: 'concept_misunderstanding',
              optionIndex: 2,
              misconception: 'Confusing the browser-tab title with the body content.',
              feedback:
                '<title> sets the text on the browser tab. It does not hold the page content.',
              hint: 'Metadata changes the tab or describes the page; it does not display the page body.',
            },
            {
              id: 'gp1-meta-vs-body',
              category: 'concept_misunderstanding',
              optionIndex: 3,
              misconception: 'Treating metadata as visible page content.',
              feedback:
                '<meta> gives browsers and search engines information about the page. It is not the visible content container.',
              hint: 'Separate “information about the page” from “content shown on the page”.',
            },
          ],
          feedback: {
            correct: 'Right — <body> contains everything rendered on the page.',
            incorrect: 'Not quite. The visible content lives in one of these four elements.',
          },
          explanation:
            '<body> contains all rendered content. <head> holds metadata such as <title> and <meta> tags.',
        },
        {
          id: 'gp-2',
          kind: 'single_choice',
          objectiveId: 'html-tag-anatomy',
          prompt: 'What is missing from this tag: <p>Hello</p',
          options: [
            'Nothing — it is valid',
            'The closing angle bracket >',
            'A closing slash',
            'An attribute',
          ],
          correctIndex: 1,
          hint: 'Compare the opening tag <p> with the broken closing tag character by character.',
          errorMap: {
            0: 'A tag must be closed properly before the browser can render it.',
            2: 'The slash is already there: </p. What comes after it?',
            3: 'Attributes are optional; a missing one would not break the tag.',
          },
          errorPatterns: [
            {
              id: 'gp2-no-close-verify',
              category: 'procedural_error',
              optionIndex: 0,
              misconception: 'Skipping the final check that a closing tag is complete.',
              feedback:
                'The tag is not valid yet. Check every character of the closing tag before deciding it is complete.',
              hint: 'Compare the opening tag <p> with the closing tag </p character by character.',
            },
            {
              id: 'gp2-misread-slash',
              category: 'syntax_error',
              optionIndex: 2,
              misconception: 'Misreading the closing slash as the missing piece.',
              feedback:
                'The slash is present in </p. What is still missing at the very end of the tag?',
              hint: 'Look at the final character after the tag name.',
            },
            {
              id: 'gp2-attribute-confusion',
              category: 'concept_misunderstanding',
              optionIndex: 3,
              misconception: 'Confusing optional attributes with required tag closure.',
              feedback:
                'Attributes add information to an element, but they are not required to close a tag.',
              hint: 'A tag needs a complete opening or closing form before attributes matter.',
            },
          ],
          feedback: {
            correct: 'Exactly — the closing tag must be </p>.',
            incorrect: 'Look closely at the very end of the broken tag.',
          },
          explanation:
            'The closing tag must be </p>. Here the > is missing, so the browser never sees the end of the tag.',
        },
      ],
    },

    independentPractice: {
      title: 'Independent practice',
      instructions:
        'Now try on your own. Check your answer after each question — you get one retry, then the answer is revealed.',
      items: [
        {
          id: 'ip-1',
          kind: 'single_choice',
          objectiveId: 'html-semantics',
          prompt: 'Which semantic element should wrap the main navigation links of a site?',
          options: ['<nav>', '<section>', '<aside>', '<div>'],
          correctIndex: 0,
          errorMap: {
            1: '<section> is a generic grouping element, not specifically navigation.',
            2: '<aside> is for tangential content such as sidebars.',
            3: '<div> works but carries no meaning for browsers or assistive technology.',
          },
          errorPatterns: [
            {
              id: 'ip1-section-vs-nav',
              category: 'concept_misunderstanding',
              optionIndex: 1,
              misconception: 'Treating a generic section as a navigation landmark.',
              feedback:
                '<section> groups related content but does not identify navigation. Choose the element whose meaning is navigation.',
              hint: 'Match the element name to the job the region performs.',
            },
            {
              id: 'ip1-aside-vs-nav',
              category: 'concept_misunderstanding',
              optionIndex: 2,
              misconception: 'Confusing tangential content with navigation.',
              feedback:
                '<aside> is for tangential content such as sidebars, not the main navigation links.',
              hint: 'Navigation links help users move around the site.',
            },
            {
              id: 'ip1-div-vs-nav',
              category: 'concept_misunderstanding',
              optionIndex: 3,
              misconception: 'Choosing a generic container when a semantic element exists.',
              feedback:
                '<div> can hold links but carries no meaning. Prefer the element that describes navigation.',
              hint: 'Semantic elements communicate the role of a region.',
            },
          ],
          feedback: {
            correct: 'Correct — <nav> is the semantic element for navigation blocks.',
            incorrect: 'There is an element whose purpose is navigation. Pick that one.',
          },
          explanation:
            '<nav> is reserved for major navigation blocks. Semantic elements describe the role of a region.',
        },
        {
          id: 'ip-2',
          kind: 'short_text',
          objectiveId: 'html-document-structure',
          prompt: 'What does HTML stand for? (Spelling matters; capitalization does not.)',
          answer: 'HyperText Markup Language',
          acceptedAnswers: [
            'hypertext markup language',
            'hyper text markup language',
          ],
          errorPatterns: [
            {
              id: 'ip2-hyperlink-confusion',
              category: 'concept_misunderstanding',
              match: { type: 'includes', value: 'hyperlink' },
              misconception: 'Confusing hypertext with hyperlinks.',
              feedback:
                'Hypertext is text that can link to other documents; the L in HTML stands for Language, not link.',
              hint: 'Expand each word: HyperText Markup Language.',
            },
            {
              id: 'ip2-missing-language',
              category: 'incomplete_answer',
              match: {
                type: 'regex',
                pattern: '^\\s*hyper\\s*text\\s+markup\\s*$',
              },
              feedback:
                'You have two of the three words. The full name includes the word “Language”.',
              hint: 'Say the full expansion aloud and check that all three words are present.',
            },
          ],
          feedback: {
            correct: 'Correct — HyperText Markup Language.',
            incorrect:
              'Not quite. It is the language used to mark up the structure of documents on the web.',
          },
          explanation:
            'HTML stands for HyperText Markup Language: hypertext (linked documents) described with markup tags.',
        },
        {
          id: 'ip-3',
          kind: 'single_choice',
          objectiveId: 'html-tag-anatomy',
          prompt: 'Which element creates the largest heading on a page?',
          options: ['<h6>', '<h1>', '<head>', '<header>'],
          correctIndex: 1,
          errorMap: {
            0: '<h6> is the smallest heading level.',
            2: '<head> is the metadata container, not a heading.',
            3: '<header> is a semantic region, not a heading by itself.',
          },
          errorPatterns: [
            {
              id: 'ip3-heading-scale-reversed',
              category: 'concept_misunderstanding',
              optionIndex: 0,
              misconception: 'Reversing the heading-level scale.',
              feedback:
                'Heading numbers work in the opposite direction: <h1> is the largest and <h6> is the smallest.',
              hint: 'Start at h1 for the most important heading and count up for smaller ones.',
            },
            {
              id: 'ip3-head-vs-heading',
              category: 'concept_misunderstanding',
              optionIndex: 2,
              misconception: 'Confusing the metadata container with a heading.',
              feedback:
                '<head> holds metadata and is never displayed as a heading. It only looks similar to the word “heading”.',
              hint: 'Look for the element whose name means a heading level, not the document head.',
            },
            {
              id: 'ip3-header-vs-heading',
              category: 'concept_misunderstanding',
              optionIndex: 3,
              misconception: 'Confusing a header region with a heading element.',
              feedback:
                '<header> describes a region; it is not itself a heading. The heading element uses h plus a number.',
              hint: 'A region can contain a heading, but it is not the heading element.',
            },
          ],
          feedback: {
            correct: 'Right — <h1> is the largest heading.',
            incorrect: 'Heading levels run from <h1> (largest) to <h6> (smallest).',
          },
          explanation:
            '<h1> is the top-level heading. <h6> is smallest, while <head> and <header> are not headings.',
        },
      ],
    },

    assessment: {
      title: 'Mastery check',
      instructions:
        'Answer all questions, then submit. You need the pass score shown below. Feedback appears after you submit, and you can retry if you do not pass.',
      items: [
        {
          id: 'as-1',
          kind: 'single_choice',
          objectiveId: 'html-document-structure',
          prompt: 'Which element contains metadata such as the page title?',
          options: ['<head>', '<body>', '<main>', '<footer>'],
          correctIndex: 0,
          errorMap: {
            1: '<body> holds visible content, not metadata.',
            2: '<main> marks the primary content region.',
            3: '<footer> marks the closing region of the page.',
          },
          explanation:
            '<head> holds metadata: the <title>, character set and other information about the document.',
        },
        {
          id: 'as-2',
          kind: 'single_choice',
          objectiveId: 'html-tag-anatomy',
          prompt: 'Which of these is a correctly written closing tag?',
          options: ['<section/>', '</section>', '<\\section>', '</Section>'],
          correctIndex: 1,
          errorMap: {
            0: '<section/> is a self-closing opening tag, not a closing tag.',
            2: 'The backslash is not part of HTML tag syntax.',
            3: 'HTML tag names are case-insensitive, but </Section> is not conventional; </section> is the standard form.',
          },
          explanation:
            'A closing tag starts with </, repeats the element name and ends with >: </section>.',
        },
        {
          id: 'as-3',
          kind: 'single_choice',
          objectiveId: 'html-semantics',
          prompt: 'Which element should wrap the primary content of a page?',
          options: ['<main>', '<nav>', '<aside>', '<span>'],
          correctIndex: 0,
          errorMap: {
            1: '<nav> is for navigation blocks.',
            2: '<aside> is for tangential content such as sidebars.',
            3: '<span> is an inline container with no page-level meaning.',
          },
          explanation:
            '<main> marks the dominant content of the page and should be used once per page.',
        },
        {
          id: 'as-4',
          kind: 'single_choice',
          objectiveId: 'html-tag-anatomy',
          prompt: 'Which attribute provides a text alternative for an image?',
          options: ['title', 'src', 'alt', 'href'],
          correctIndex: 2,
          errorMap: {
            0: 'title shows a tooltip but is not the alternative text.',
            1: 'src points at the image file itself.',
            3: 'href is used by links, not images.',
          },
          explanation:
            'alt describes the image for screen readers and when the image cannot load.',
        },
        {
          id: 'as-5',
          kind: 'single_choice',
          objectiveId: 'html-document-structure',
          prompt: 'Which form correctly sets the language of a document to English?',
          options: [
            '<html language="en">',
            '<html lang="en">',
            '<html langs="en">',
            '<meta language="en">',
          ],
          correctIndex: 1,
          errorMap: {
            0: 'The attribute is not called "language".',
            2: 'The attribute is not called "langs".',
            3: 'The lang attribute belongs on <html>, not on a <meta> tag.',
          },
          explanation:
            'The lang attribute on <html> declares the document language, for example <html lang="en">.',
        },
      ],
    },

    completion: {
      title: 'Lesson complete: Introduction to HTML',
      message:
        'You worked through the explanation, the worked example, guided practice, independent practice and the mastery check. Your progress for this lesson is saved — come back any time and continue where you left off.',
    },
  },
};

export function getLearningJourney(courseId, lessonId) {
  if (!courseId || !lessonId) return null;
  return learningJourneys[`${courseId}:${lessonId}`] || null;
}
