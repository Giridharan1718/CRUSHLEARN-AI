// Reusable course learning data: objectives, prerequisite links and short
// diagnostic / practice / reassessment content.
//
// This file is content only. Classification, recommendations and persistence
// live in src/learning/gapDetection.mjs and src/learning/evidenceStore.mjs.
// React components receive these objects as props and contain no subject rules.

import { getLearningJourney } from './learningJourneys.mjs';
import { getCourseObjectives } from '../content/index.mjs';
import { baseMasteryCriteria } from '../content/masteryPresets.mjs';

function htmlJourneyPracticeItems() {
  const journey = getLearningJourney('web-dev-101', 'lesson-1');
  if (!journey) return [];
  return [...journey.guidedPractice.items, ...journey.independentPractice.items];
}

// Objective definitions (titles, descriptions, prerequisite links and mastery
// criteria) are authored in src/content/courses/*.mjs. This map borrows them so
// assessment configuration and curriculum content cannot drift apart.

// Adaptive exercises are used only when an error coach recommends a different
// item on the same objective. They are ordinary items with authored error
// patterns, so their answers also flow into the shared evidence store.
const webDevAdaptiveExercises = {
  'html-document-structure': [
    {
      id: 'adaptive-html-structure-1',
      kind: 'single_choice',
      objectiveId: 'html-document-structure',
      prompt: 'Which element holds metadata such as the page title?',
      options: ['<body>', '<head>', '<main>', '<footer>'],
      correctIndex: 1,
      hint: 'Metadata describes the document rather than displaying it.',
      feedback: {
        correct: 'Correct — <head> holds metadata.',
        incorrect: 'Metadata belongs in a container that is not rendered in the viewport.',
      },
      errorPatterns: [
        {
          id: 'adaptive-structure-body-metadata',
          category: 'concept_misunderstanding',
          optionIndex: 0,
          misconception: 'Treating visible body content as document metadata.',
          feedback:
            '<body> holds visible content. Metadata such as the title belongs in a different container.',
          hint: 'Ask whether the element is displayed or describes the document.',
        },
        {
          id: 'adaptive-structure-main-metadata',
          category: 'concept_misunderstanding',
          optionIndex: 2,
          misconception: 'Confusing the primary content region with metadata.',
          feedback:
            '<main> marks the primary visible content. It is not the metadata container.',
          hint: 'Look for the element whose name suggests information about the document.',
        },
        {
          id: 'adaptive-structure-footer-metadata',
          category: 'concept_misunderstanding',
          optionIndex: 3,
          misconception: 'Confusing a page footer with document metadata.',
          feedback:
            '<footer> describes a visible closing region. It does not hold metadata.',
          hint: 'Metadata is not part of the visible page regions.',
        },
      ],
      explanation:
        '<head> contains metadata such as <title> and <meta>. <body> contains rendered content.',
    },
    {
      id: 'adaptive-html-structure-2',
      kind: 'short_text',
      objectiveId: 'html-document-structure',
      prompt:
        'Which element contains the content a visitor sees? Type the tag name only (for example, div).',
      answer: 'body',
      acceptedAnswers: ['body'],
      hint: 'It is the element that wraps everything displayed in the viewport.',
      feedback: {
        correct: 'Correct — <body> contains visible content.',
        incorrect: 'The visible content container is not the metadata container.',
      },
      errorPatterns: [
        {
          id: 'adaptive-structure-head-text',
          category: 'concept_misunderstanding',
          match: { type: 'regex', pattern: '^\\s*<?\\s*head\\s*>?\\s*$' },
          misconception: 'Confusing document metadata with visible content.',
          feedback:
            '<head> describes the page. It is not rendered in the viewport.',
          hint: 'Choose the element a visitor actually sees.',
        },
        {
          id: 'adaptive-structure-title-text',
          category: 'concept_misunderstanding',
          match: { type: 'regex', pattern: '^\\s*<?\\s*title\\s*>?\\s*$' },
          misconception: 'Confusing the browser-tab title with the page body.',
          feedback:
            '<title> changes the text on the browser tab; it does not contain the page content.',
          hint: 'Look for the content container, not the tab title.',
        },
      ],
      explanation:
        '<body> wraps the rendered page. <head> is the metadata container.',
    },
  ],
  'html-tag-anatomy': [
    {
      id: 'adaptive-html-anatomy-1',
      kind: 'single_choice',
      objectiveId: 'html-tag-anatomy',
      prompt: 'Which closing tag correctly matches an opening <section> tag?',
      options: ['<section>', '</section>', '<section/>', '</section/>'],
      correctIndex: 1,
      hint: 'A closing tag begins with a slash and does not self-close.',
      feedback: {
        correct: 'Correct — </section> closes the element.',
        incorrect: 'Compare the shape of the opening and closing forms.',
      },
      errorPatterns: [
        {
          id: 'adaptive-anatomy-reopen',
          category: 'procedural_error',
          optionIndex: 0,
          misconception: 'Repeating the opening tag instead of writing a closing tag.',
          feedback:
            '<section> opens the element. The closing form needs a slash before the name.',
          hint: 'Start the closing tag with </.',
        },
        {
          id: 'adaptive-anatomy-self-close-open',
          category: 'syntax_error',
          optionIndex: 2,
          misconception: 'Self-closing an element that needs a separate closing tag.',
          feedback:
            '<section/> is not the standard closing form for a section element.',
          hint: 'A separate closing tag uses the slash before the tag name.',
        },
        {
          id: 'adaptive-anatomy-self-close-close',
          category: 'syntax_error',
          optionIndex: 3,
          misconception: 'Combining a closing slash and a self-closing slash.',
          feedback:
            '</section/> mixes closing-tag and self-closing forms. Use </section>.',
          hint: 'The closing tag has exactly one slash, immediately after the opening angle bracket.',
        },
      ],
      explanation:
        'A paired element is closed with </section>: a slash before the tag name and no self-closing slash.',
    },
    {
      id: 'adaptive-html-anatomy-2',
      kind: 'short_text',
      objectiveId: 'html-tag-anatomy',
      prompt: 'Type the complete closing tag for a paragraph element.',
      answer: '</p>',
      acceptedAnswers: ['</p>'],
      hint: 'It begins with an opening angle bracket, then a slash, the tag name and a closing angle bracket.',
      feedback: {
        correct: 'Correct — </p> is the closing tag.',
        incorrect: 'Check the slash, the tag name and the final angle bracket.',
      },
      errorPatterns: [
        {
          id: 'adaptive-anatomy-missing-slash-text',
          category: 'procedural_error',
          match: { type: 'regex', pattern: '^\\s*<p>\\s*$' },
          misconception: 'Repeating the opening tag instead of closing it.',
          feedback:
            '<p> opens a paragraph. Closing it requires a slash before the p.',
          hint: 'Write </p>, not <p>.',
        },
        {
          id: 'adaptive-anatomy-space-slash-text',
          category: 'syntax_error',
          match: { type: 'regex', pattern: '^\\s*</\\s+p\\s*>\\s*$' },
          misconception: 'Adding a space between the slash and the tag name.',
          feedback:
            'The slash must be immediately followed by the tag name: </p>.',
          hint: 'Remove the space after the slash.',
        },
        {
          id: 'adaptive-anatomy-missing-angle-text',
          category: 'incomplete_answer',
          match: { type: 'regex', pattern: '^\\s*</p\\s*$' },
          misconception: 'Leaving the closing tag incomplete.',
          feedback:
            'The closing tag is missing its final angle bracket. It must end with >.',
          hint: 'Finish the tag with >.',
        },
      ],
      explanation:
        '</p> closes a paragraph: angle bracket, slash, tag name, angle bracket.',
    },
  ],
  'html-semantics': [
    {
      id: 'adaptive-html-semantics-1',
      kind: 'single_choice',
      objectiveId: 'html-semantics',
      prompt: 'Which element should wrap the main navigation links of a site?',
      options: ['<nav>', '<section>', '<aside>', '<div>'],
      correctIndex: 0,
      hint: 'Choose the element whose role is navigation.',
      feedback: {
        correct: 'Correct — <nav> marks a navigation region.',
        incorrect: 'One element is defined specifically for navigation.',
      },
      errorPatterns: [
        {
          id: 'adaptive-semantics-section-nav',
          category: 'concept_misunderstanding',
          optionIndex: 1,
          misconception: 'Using a generic section for a navigation landmark.',
          feedback:
            '<section> groups content but does not identify navigation. Use <nav>.',
          hint: 'Semantic elements describe the role of the region.',
        },
        {
          id: 'adaptive-semantics-aside-nav',
          category: 'concept_misunderstanding',
          optionIndex: 2,
          misconception: 'Confusing tangential content with navigation.',
          feedback:
            '<aside> is for tangential content such as sidebars, not primary navigation.',
          hint: 'Navigation helps users move around the site.',
        },
        {
          id: 'adaptive-semantics-div-nav',
          category: 'concept_misunderstanding',
          optionIndex: 3,
          misconception: 'Using a generic container instead of a semantic element.',
          feedback:
            '<div> works visually but has no navigation meaning. Prefer <nav>.',
          hint: 'Look for the element whose name matches the region’s job.',
        },
      ],
      explanation:
        '<nav> is the semantic element for major navigation blocks.',
    },
    {
      id: 'adaptive-html-semantics-2',
      kind: 'single_choice',
      objectiveId: 'html-semantics',
      prompt: 'Which element is best for tangential content such as a sidebar?',
      options: ['<aside>', '<nav>', '<main>', '<footer>'],
      correctIndex: 0,
      hint: 'The content is related but not central to the page.',
      feedback: {
        correct: 'Correct — <aside> is for tangential content.',
        incorrect: 'Choose the element that means content beside the main flow.',
      },
      errorPatterns: [
        {
          id: 'adaptive-semantics-nav-aside',
          category: 'concept_misunderstanding',
          optionIndex: 1,
          misconception: 'Treating a related-content sidebar as navigation.',
          feedback:
            '<nav> is for navigation links. A sidebar with related content calls for <aside>.',
          hint: 'Ask whether the region helps users navigate or adds related information.',
        },
        {
          id: 'adaptive-semantics-main-aside',
          category: 'concept_misunderstanding',
          optionIndex: 2,
          misconception: 'Treating tangential content as the primary content.',
          feedback:
            '<main> is for the central content of the page, not a sidebar.',
          hint: 'Side content should not compete with the primary content region.',
        },
        {
          id: 'adaptive-semantics-footer-aside',
          category: 'concept_misunderstanding',
          optionIndex: 3,
          misconception: 'Confusing a page footer with a sidebar.',
          feedback:
            '<footer> is closing information for a page or section. It is not a sidebar container.',
          hint: 'Match the element name to the region’s purpose.',
        },
      ],
      explanation:
        '<aside> holds content that is related to but separate from the main flow.',
    },
  ],
  'css-selectors': [
    {
      id: 'adaptive-css-selectors-1',
      kind: 'single_choice',
      objectiveId: 'css-selectors',
      prompt: 'Which selector targets elements with class="card"?',
      options: ['.card', '#card', 'card', '*card'],
      correctIndex: 0,
      hint: 'Classes use a dot prefix in CSS selectors.',
      feedback: {
        correct: 'Correct — .card selects the card class.',
        incorrect: 'Match the selector prefix to the class attribute.',
      },
      errorPatterns: [
        {
          id: 'adaptive-css-id-selector',
          category: 'concept_misunderstanding',
          optionIndex: 1,
          misconception: 'Confusing a class selector with an ID selector.',
          feedback:
            '#card selects an id. Classes use a dot: .card.',
          hint: 'The # prefix is for IDs; the dot is for classes.',
        },
        {
          id: 'adaptive-css-type-selector',
          category: 'concept_misunderstanding',
          optionIndex: 2,
          misconception: 'Treating a bare name as a class selector.',
          feedback:
            'card selects elements named card, not elements with class="card".',
          hint: 'Class selectors need a dot.',
        },
        {
          id: 'adaptive-css-universal',
          category: 'syntax_error',
          optionIndex: 3,
          misconception: 'Using an invalid wildcard form.',
          feedback:
            '*card is not a valid class selector. Use .card.',
          hint: 'The universal selector is * by itself; classes use .name.',
        },
      ],
      explanation:
        'A class selector starts with a dot: .card matches class="card".',
    },
  ],
  'css-box-model': [
    {
      id: 'adaptive-css-box-model-1',
      kind: 'single_choice',
      objectiveId: 'css-box-model',
      prompt: 'Which part of the CSS box model sits outside the border?',
      options: ['margin', 'padding', 'content', 'border'],
      correctIndex: 0,
      hint: 'Think of the space between the box and neighbouring boxes.',
      feedback: {
        correct: 'Correct — margin is outside the border.',
        incorrect: 'One layer is outside the border; the others are at or inside it.',
      },
      errorPatterns: [
        {
          id: 'adaptive-box-padding-outside',
          category: 'concept_misunderstanding',
          optionIndex: 1,
          misconception: 'Reversing padding and margin.',
          feedback:
            'Padding sits inside the border, between the content and the border.',
          hint: 'Padding is internal space; margin is external space.',
        },
        {
          id: 'adaptive-box-content-outside',
          category: 'concept_misunderstanding',
          optionIndex: 2,
          misconception: 'Placing content outside the border.',
          feedback:
            'Content is the innermost layer of the box model.',
          hint: 'Start at the content and work outward.',
        },
        {
          id: 'adaptive-box-border-outside',
          category: 'concept_misunderstanding',
          optionIndex: 3,
          misconception: 'Treating the border as the outermost layer.',
          feedback:
            'The border surrounds padding and content, but margin sits outside it.',
          hint: 'Ask which layer can create space between two separate boxes.',
        },
      ],
      explanation:
        'From inside out: content, padding, border, margin.',
    },
  ],
};

const pythonAdaptiveExercises = {
  'python-syntax': [
    {
      id: 'adaptive-python-syntax-1',
      kind: 'single_choice',
      objectiveId: 'python-syntax',
      prompt: 'Which line starts a comment in Python?',
      options: ['# note', '// note', '<!-- note -->', '-- note'],
      correctIndex: 0,
      hint: 'Python uses the hash symbol for comments.',
      feedback: {
        correct: 'Correct — # starts a comment.',
        incorrect: 'One symbol is Python’s comment marker.',
      },
      errorPatterns: [
        {
          id: 'adaptive-python-slash-comment',
          category: 'syntax_error',
          optionIndex: 1,
          misconception: 'Using JavaScript-style comment syntax in Python.',
          feedback:
            '// is a comment in some languages, but not Python. Use #.',
          hint: 'Look for the hash symbol.',
        },
        {
          id: 'adaptive-python-html-comment',
          category: 'syntax_error',
          optionIndex: 2,
          misconception: 'Using HTML comment syntax in Python.',
          feedback:
            '<!-- --> is HTML comment syntax. Python comments start with #.',
          hint: 'Python’s comment marker is a single character.',
        },
        {
          id: 'adaptive-python-dash-comment',
          category: 'syntax_error',
          optionIndex: 3,
          misconception: 'Using SQL-style comment syntax in Python.',
          feedback:
            '-- is not a Python comment. Use # for a single-line comment.',
          hint: 'Count the symbols: Python uses one hash.',
        },
      ],
      explanation: 'A Python comment starts with # and runs to the end of the line.',
    },
    {
      id: 'adaptive-python-syntax-2',
      kind: 'short_text',
      objectiveId: 'python-syntax',
      prompt: 'Which symbol starts a single-line comment in Python? Type the symbol only.',
      answer: '#',
      acceptedAnswers: ['#'],
      hint: 'It is the hash symbol.',
      feedback: {
        correct: 'Correct — # starts a comment.',
        incorrect: 'Python uses a different one-character comment marker.',
      },
      errorPatterns: [
        {
          id: 'adaptive-python-short-slash',
          category: 'syntax_error',
          match: { type: 'equals', value: '//' },
          misconception: 'Using a double slash for comments.',
          feedback:
            '// is not a Python comment marker. Use #.',
          hint: 'Try the hash symbol.',
        },
        {
          id: 'adaptive-python-short-dash',
          category: 'syntax_error',
          match: { type: 'equals', value: '--' },
          misconception: 'Using SQL-style comment syntax.',
          feedback:
            '-- is not a Python comment marker. Use #.',
          hint: 'Python uses a single hash character.',
        },
      ],
      explanation: 'Python single-line comments begin with #.',
    },
  ],
  'python-control-flow': [
    {
      id: 'adaptive-python-control-1',
      kind: 'single_choice',
      objectiveId: 'python-control-flow',
      prompt: 'Which keyword starts a conditional branch in Python?',
      options: ['if', 'when', 'case', 'check'],
      correctIndex: 0,
      hint: 'It is the same short word used in many programming languages.',
      feedback: {
        correct: 'Correct — Python conditionals start with if.',
        incorrect: 'One keyword is Python’s conditional keyword.',
      },
      errorPatterns: [
        {
          id: 'adaptive-python-when-keyword',
          category: 'concept_misunderstanding',
          optionIndex: 1,
          misconception: 'Confusing conditional wording with Python syntax.',
          feedback:
            'when is not a Python conditional keyword. Use if.',
          hint: 'Python uses if, elif and else.',
        },
        {
          id: 'adaptive-python-case-keyword',
          category: 'concept_misunderstanding',
          optionIndex: 2,
          misconception: 'Confusing pattern-matching vocabulary with a basic conditional.',
          feedback:
            'case belongs to match statements, not a basic conditional. Use if.',
          hint: 'Look for the keyword that begins if/elif/else.',
        },
        {
          id: 'adaptive-python-check-keyword',
          category: 'syntax_error',
          optionIndex: 3,
          misconception: 'Inventing a keyword instead of using Python syntax.',
          feedback:
            'check is not a Python keyword. A conditional starts with if.',
          hint: 'Recall the if statement from the worked example.',
        },
      ],
      explanation: 'Python conditionals use if, optionally followed by elif and else.',
    },
    {
      id: 'adaptive-python-control-2',
      kind: 'short_text',
      objectiveId: 'python-control-flow',
      prompt: 'Which keyword starts a loop over a sequence in Python? Type the keyword only.',
      answer: 'for',
      acceptedAnswers: ['for'],
      hint: 'It pairs with in.',
      feedback: {
        correct: 'Correct — for starts a sequence loop.',
        incorrect: 'One keyword starts a loop over items in a sequence.',
      },
      errorPatterns: [
        {
          id: 'adaptive-python-while-loop',
          category: 'procedural_error',
          match: { type: 'equals', value: 'while' },
          misconception: 'Choosing a condition-controlled loop instead of a sequence loop.',
          feedback:
            'while repeats while a condition is true. To loop over a sequence, use for.',
          hint: 'The keyword appears immediately before the loop variable and in.',
        },
        {
          id: 'adaptive-python-loop-keyword',
          category: 'syntax_error',
          match: { type: 'equals', value: 'loop' },
          misconception: 'Using an invented keyword.',
          feedback:
            'loop is not a Python keyword. Use for when iterating over a sequence.',
          hint: 'Recall the for item in sequence pattern.',
        },
      ],
      explanation: 'for item in sequence: repeats a block once for each item.',
    },
  ],
};

const webDevDiagnostics = {
  'lesson-1': {
    title: 'Quick check: HTML foundations',
    instructions:
      'Six short questions about the ideas this lesson builds on. Answer without notes. An incorrect answer is treated as a signal, not a diagnosis, and unanswered questions stay not assessed.',
    items: [
      {
        id: 'diag-html-structure-1',
        kind: 'single_choice',
        objectiveId: 'html-document-structure',
        prompt: 'Which element contains the content that is visible in the browser?',
        options: ['<head>', '<body>', '<title>', '<meta>'],
        correctIndex: 1,
        feedback: {
          correct: 'Right — <body> holds the rendered content.',
          incorrect: 'The visible content has its own container in an HTML document.',
        },
        explanation:
          '<body> holds everything rendered in the viewport. <head> holds metadata such as the page title.',
      },
      {
        id: 'diag-html-structure-2',
        kind: 'single_choice',
        objectiveId: 'html-document-structure',
        prompt: 'Where does the <title> element belong?',
        options: ['<body>', '<head>', '<main>', '<footer>'],
        correctIndex: 1,
        feedback: {
          correct: 'Correct — <title> is metadata inside <head>.',
          incorrect: 'The page title is information about the document, not visible body content.',
        },
        explanation:
          '<title> describes the document and appears in the browser tab, so it belongs in <head>.',
      },
      {
        id: 'diag-html-anatomy-1',
        kind: 'single_choice',
        objectiveId: 'html-tag-anatomy',
        prompt: 'Which closing tag correctly matches an opening <section> tag?',
        options: ['<section>', '</section>', '<section/>', '</section/>'],
        correctIndex: 1,
        feedback: {
          correct: 'Right — the closing tag starts with a slash and repeats the tag name.',
          incorrect: 'A closing tag is not self-closing and does not use the same form as an opening tag.',
        },
        explanation:
          'An opening <section> is closed with </section>: a forward slash followed by the tag name in angle brackets.',
      },
      {
        id: 'diag-html-anatomy-2',
        kind: 'single_choice',
        objectiveId: 'html-tag-anatomy',
        prompt: 'Which attribute provides alternative text for an image?',
        options: ['src', 'alt', 'title', 'href'],
        correctIndex: 1,
        feedback: {
          correct: 'Correct — alt text describes the image when it cannot be seen.',
          incorrect: 'One of these attributes exists specifically to describe an image.',
        },
        explanation:
          'The alt attribute is read by screen readers and shown when an image fails to load.',
      },
      {
        id: 'diag-html-semantics-1',
        kind: 'single_choice',
        objectiveId: 'html-semantics',
        prompt: 'Which element should wrap the primary content of a page?',
        options: ['<main>', '<div>', '<span>', '<section>'],
        correctIndex: 0,
        feedback: {
          correct: 'Right — <main> marks the primary content region.',
          incorrect: 'One element is defined specifically for the page’s primary content.',
        },
        explanation:
          '<main> identifies the central content of the document and should not include repeated site-wide chrome.',
      },
      {
        id: 'diag-html-semantics-2',
        kind: 'single_choice',
        objectiveId: 'html-semantics',
        prompt: 'Which element is intended for a page footer?',
        options: ['<footer>', '<bottom>', '<aside>', '<end>'],
        correctIndex: 0,
        feedback: {
          correct: 'Correct — <footer> describes footer content.',
          incorrect: 'HTML uses a semantic element for footers rather than a positional name.',
        },
        explanation:
          '<footer> is the semantic element for closing information such as copyright or related links.',
      },
    ],
    practiceItems: htmlJourneyPracticeItems(),
    reassessmentItems: [
      {
        id: 'reassess-html-structure-1',
        kind: 'single_choice',
        objectiveId: 'html-document-structure',
        prompt: 'Which part of an HTML document holds metadata such as the page title?',
        options: ['<body>', '<head>', '<main>', '<footer>'],
        correctIndex: 1,
        feedback: {
          correct: 'Correct — metadata lives in <head>.',
          incorrect: 'Metadata describes the page rather than displaying it.',
        },
        explanation:
          '<head> contains metadata, including <title> and <meta> elements.',
      },
      {
        id: 'reassess-html-anatomy-1',
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
        feedback: {
          correct: 'Right — the closing tag must end with >.',
          incorrect: 'Compare the broken closing tag with a valid one character by character.',
        },
        explanation:
          'The closing tag must be </p>. Without the final > the browser never sees the end of the tag.',
      },
      {
        id: 'reassess-html-semantics-1',
        kind: 'single_choice',
        objectiveId: 'html-semantics',
        prompt: 'Which semantic element should wrap the main navigation links of a site?',
        options: ['<nav>', '<section>', '<aside>', '<div>'],
        correctIndex: 0,
        feedback: {
          correct: 'Correct — <nav> marks navigation blocks.',
          incorrect: 'One element exists specifically for major navigation regions.',
        },
        explanation:
          '<nav> is reserved for major navigation blocks. <div> has no semantic meaning.',
      },
    ],
  },
  'lesson-2': {
    title: 'Readiness check: CSS Styling Basics',
    instructions:
      'This lesson builds on HTML structure, tags and semantic regions. Four short questions check those prerequisites. A single miss is a signal for practice, not a diagnosis.',
    items: [
      {
        id: 'diag-css-structure-1',
        kind: 'single_choice',
        objectiveId: 'html-document-structure',
        prompt: 'Which element contains the page content that visitors see?',
        options: ['<head>', '<body>', '<title>', '<meta>'],
        correctIndex: 1,
        feedback: {
          correct: 'Right — <body> holds visible content.',
          incorrect: 'One element is rendered in the page viewport.',
        },
        explanation:
          '<body> contains visible content. <head> contains metadata about the page.',
      },
      {
        id: 'diag-css-structure-2',
        kind: 'single_choice',
        objectiveId: 'html-document-structure',
        prompt: 'Where does metadata such as the page title live?',
        options: ['<body>', '<head>', '<main>', '<aside>'],
        correctIndex: 1,
        feedback: {
          correct: 'Correct — metadata is in <head>.',
          incorrect: 'The answer is the part of the document that is not rendered as page content.',
        },
        explanation:
          '<head> contains metadata, including the document title and linked resources.',
      },
      {
        id: 'diag-css-anatomy-1',
        kind: 'single_choice',
        objectiveId: 'html-tag-anatomy',
        prompt: 'Which closing tag correctly matches an opening <article> tag?',
        options: ['<article>', '</article>', '<article/>', '</article/>'],
        correctIndex: 1,
        feedback: {
          correct: 'Right — </article> is the matching closing tag.',
          incorrect: 'Closing tags begin with a slash and keep the tag name.',
        },
        explanation:
          'An opening <article> tag is closed with </article>.',
      },
      {
        id: 'diag-css-semantics-1',
        kind: 'single_choice',
        objectiveId: 'html-semantics',
        prompt: 'Which element is the best choice for a sidebar of related links?',
        options: ['<aside>', '<main>', '<header>', '<footer>'],
        correctIndex: 0,
        feedback: {
          correct: 'Correct — <aside> is for tangential content such as sidebars.',
          incorrect: 'Choose the element whose meaning is “tangential to the main content”.',
        },
        explanation:
          '<aside> represents content that is related but not central to the main content.',
      },
    ],
    practiceItems: [
      {
        id: 'practice-css-prereq-structure',
        kind: 'single_choice',
        objectiveId: 'html-document-structure',
        prompt: 'Which element wraps the entire HTML document?',
        options: ['<html>', '<body>', '<head>', '<main>'],
        correctIndex: 0,
        feedback: {
          correct: 'Correct — <html> is the document root.',
          incorrect: 'Think about the outermost element in a complete HTML document.',
        },
        explanation:
          'A complete document starts with <html> and contains <head> and <body>.',
      },
      {
        id: 'practice-css-prereq-anatomy',
        kind: 'single_choice',
        objectiveId: 'html-tag-anatomy',
        prompt: 'Which attribute supplies the destination URL for an <a> tag?',
        options: ['src', 'href', 'alt', 'class'],
        correctIndex: 1,
        feedback: {
          correct: 'Right — href holds the link target.',
          incorrect: 'One attribute is defined specifically for hyperlinks.',
        },
        explanation:
          'The href attribute on an anchor element contains the URL the link points to.',
      },
      {
        id: 'practice-css-prereq-semantics',
        kind: 'single_choice',
        objectiveId: 'html-semantics',
        prompt: 'Which element is intended for a self-contained piece of content?',
        options: ['<article>', '<span>', '<div>', '<head>'],
        correctIndex: 0,
        feedback: {
          correct: 'Correct — <article> represents self-contained content.',
          incorrect: 'One element’s meaning is a complete, independent piece of content.',
        },
        explanation:
          '<article> is for content that could stand on its own, such as a blog post or card.',
      },
    ],
    reassessmentItems: [
      {
        id: 'reassess-css-structure-1',
        kind: 'single_choice',
        objectiveId: 'html-document-structure',
        prompt: 'Which element is the root of an HTML document?',
        options: ['<body>', '<head>', '<html>', '<main>'],
        correctIndex: 2,
        feedback: {
          correct: 'Right — <html> is the root element.',
          incorrect: 'Look for the outermost element that contains both head and body.',
        },
        explanation:
          '<html> is the document root; <head> and <body> are its two main children.',
      },
      {
        id: 'reassess-css-anatomy-1',
        kind: 'single_choice',
        objectiveId: 'html-tag-anatomy',
        prompt: 'Which closing tag matches an opening <nav> tag?',
        options: ['<nav>', '</nav>', '<nav/>', '</nav/>'],
        correctIndex: 1,
        feedback: {
          correct: 'Correct — </nav> closes the element.',
          incorrect: 'A closing tag starts with a slash and repeats the tag name.',
        },
        explanation: 'The matching closing tag is </nav>.',
      },
      {
        id: 'reassess-css-semantics-1',
        kind: 'single_choice',
        objectiveId: 'html-semantics',
        prompt: 'Which element describes tangential content such as a sidebar?',
        options: ['<main>', '<aside>', '<article>', '<nav>'],
        correctIndex: 1,
        feedback: {
          correct: 'Correct — <aside> is tangential content.',
          incorrect: 'Choose the semantic element for content beside the main flow.',
        },
        explanation:
          '<aside> represents content related to the main content but separate from it.',
      },
    ],
  },
};

const pythonDiagnostics = {
  'lesson-1': {
    title: 'Quick check: Python basics',
    instructions:
      'Two quick questions establish a starting point. Missing evidence is not a gap; the lesson will collect more evidence as you practise.',
    items: [
      {
        id: 'diag-python-comment',
        kind: 'single_choice',
        objectiveId: 'python-syntax',
        prompt: 'Which symbol starts a single-line comment in Python?',
        options: ['//', '#', '<!--', '--'],
        correctIndex: 1,
        feedback: {
          correct: 'Right — Python comments start with #.',
          incorrect: 'Python uses a symbol that is not used for comments in JavaScript or HTML.',
        },
        explanation:
          'Everything after # on a line is a comment in Python.',
      },
      {
        id: 'diag-python-extension',
        kind: 'single_choice',
        objectiveId: 'python-syntax',
        prompt: 'Which file extension is used for Python source files?',
        options: ['.js', '.py', '.html', '.java'],
        correctIndex: 1,
        feedback: {
          correct: 'Correct — Python files use .py.',
          incorrect: 'The extension matches the first two letters of the language name.',
        },
        explanation: 'Python source files conventionally use the .py extension.',
      },
    ],
    practiceItems: [
      {
        id: 'practice-python-assignment',
        kind: 'single_choice',
        objectiveId: 'python-syntax',
        prompt: 'Which line is a valid Python assignment?',
        options: ['x = 5', 'let x = 5', 'var x = 5', 'x := 5'],
        correctIndex: 0,
        feedback: {
          correct: 'Right — Python assigns with a single =.',
          incorrect: 'Python does not use let, var or := for a basic assignment.',
        },
        explanation: 'Python binds a name to a value with x = 5.',
      },
      {
        id: 'practice-python-print',
        kind: 'single_choice',
        objectiveId: 'python-syntax',
        prompt: 'What does print("hi") do?',
        options: [
          'Stores the text in a variable',
          'Displays the text as output',
          'Creates a comment',
          'Deletes the text',
        ],
        correctIndex: 1,
        feedback: {
          correct: 'Correct — print writes output.',
          incorrect: 'print is Python’s built-in output function.',
        },
        explanation: 'print("hi") writes hi to standard output.',
      },
    ],
    reassessmentItems: [
      {
        id: 'reassess-python-comment',
        kind: 'single_choice',
        objectiveId: 'python-syntax',
        prompt: 'Which symbol starts a Python comment?',
        options: ['//', '#', '--', '/*'],
        correctIndex: 1,
        feedback: {
          correct: 'Correct — # starts a comment.',
          incorrect: 'The symbol is a hash.',
        },
        explanation: 'Python comments begin with #.',
      },
      {
        id: 'reassess-python-extension',
        kind: 'single_choice',
        objectiveId: 'python-syntax',
        prompt: 'Which extension identifies a Python source file?',
        options: ['.py', '.js', '.css', '.md'],
        correctIndex: 0,
        feedback: {
          correct: 'Right — .py is the conventional extension.',
          incorrect: 'It is the first two letters of the language name.',
        },
        explanation: 'Python source files use the .py extension.',
      },
    ],
  },
  'lesson-2': {
    title: 'Readiness check: Python Control Flow',
    instructions:
      'This lesson builds on basic Python syntax. Two questions check that prerequisite. One miss is treated as a signal, not a confirmed gap.',
    items: [
      {
        id: 'diag-cf-comment',
        kind: 'single_choice',
        objectiveId: 'python-syntax',
        prompt: 'Which symbol starts a single-line comment in Python?',
        options: ['//', '#', '<!--', '--'],
        correctIndex: 1,
        feedback: {
          correct: 'Right — # starts a Python comment.',
          incorrect: 'Look for the hash symbol.',
        },
        explanation: 'Python comments start with #.',
      },
      {
        id: 'diag-cf-assignment',
        kind: 'single_choice',
        objectiveId: 'python-syntax',
        prompt: 'Which line stores the number 5 in x using valid Python syntax?',
        options: ['x = 5', 'let x = 5', 'var x = 5', 'x := 5'],
        correctIndex: 0,
        feedback: {
          correct: 'Correct — Python assigns with x = 5.',
          incorrect: 'Python uses a single equals sign for assignment.',
        },
        explanation: 'The statement x = 5 assigns the value 5 to the name x.',
      },
    ],
    practiceItems: [
      {
        id: 'practice-cf-print',
        kind: 'single_choice',
        objectiveId: 'python-syntax',
        prompt: 'What does print("hi") do?',
        options: [
          'Stores the text in a variable',
          'Displays the text as output',
          'Creates a comment',
          'Deletes the text',
        ],
        correctIndex: 1,
        feedback: {
          correct: 'Correct — print writes output.',
          incorrect: 'print is the built-in output function.',
        },
        explanation: 'print writes its argument to standard output.',
      },
      {
        id: 'practice-cf-extension',
        kind: 'single_choice',
        objectiveId: 'python-syntax',
        prompt: 'Which extension is used for Python source files?',
        options: ['.js', '.py', '.html', '.java'],
        correctIndex: 1,
        feedback: {
          correct: 'Right — .py is the Python extension.',
          incorrect: 'It starts with the first two letters of Python.',
        },
        explanation: 'Python source files use the .py extension.',
      },
    ],
    reassessmentItems: [
      {
        id: 'reassess-cf-comment',
        kind: 'single_choice',
        objectiveId: 'python-syntax',
        prompt: 'Which line is a Python comment?',
        options: ['// note', '# note', '<!-- note', '-- note'],
        correctIndex: 1,
        feedback: {
          correct: 'Correct — # note is a Python comment.',
          incorrect: 'Python comments start with a hash.',
        },
        explanation: 'A hash starts a single-line comment in Python.',
      },
      {
        id: 'reassess-cf-assignment',
        kind: 'single_choice',
        objectiveId: 'python-syntax',
        prompt: 'Which line assigns 10 to the name score in Python?',
        options: ['score = 10', 'let score = 10', 'var score = 10', 'score := 10'],
        correctIndex: 0,
        feedback: {
          correct: 'Correct — score = 10 is valid Python.',
          incorrect: 'Python uses a single equals sign for assignment.',
        },
        explanation: 'score = 10 binds the name score to the value 10.',
      },
    ],
  },
};

// Authored review concepts. A concept is suitable for active recall only when
// it has at least one existing question that can supply a validated prompt,
// answer and explanation. Source items are listed in fallback order.
const webDevReviewConcepts = [
  {
    id: 'html-visible-body',
    title: 'Visible content lives in <body>',
    objectiveId: 'html-document-structure',
    lessonId: 'lesson-1',
    sourceItemIds: [
      'diag-html-structure-1',
      'gp-1',
      'adaptive-html-structure-2',
    ],
    acceptedAnswers: ['<body>', 'body'],
  },
  {
    id: 'html-closing-bracket',
    title: 'A closing tag needs its final angle bracket',
    objectiveId: 'html-tag-anatomy',
    lessonId: 'lesson-1',
    sourceItemIds: [
      'gp-2',
      'reassess-html-anatomy-1',
      'diag-html-anatomy-1',
    ],
    acceptedAnswers: [
      '>',
      'the closing angle bracket',
      'closing angle bracket',
      'the closing angle bracket >',
      'missing >',
    ],
  },
  {
    id: 'html-nav-semantics',
    title: 'Navigation belongs in <nav>',
    objectiveId: 'html-semantics',
    lessonId: 'lesson-1',
    sourceItemIds: [
      'ip-1',
      'reassess-html-semantics-1',
      'adaptive-html-semantics-1',
    ],
    acceptedAnswers: ['<nav>', 'nav'],
  },
  {
    id: 'html-main-landmark',
    title: 'Primary content belongs in <main>',
    objectiveId: 'html-semantics',
    lessonId: 'lesson-1',
    sourceItemIds: ['as-3', 'diag-html-semantics-1'],
    acceptedAnswers: ['<main>', 'main'],
  },
  {
    id: 'css-class-selector',
    title: 'Class selectors start with a dot',
    objectiveId: 'css-selectors',
    lessonId: 'lesson-2',
    sourceItemIds: ['adaptive-css-selectors-1'],
    acceptedAnswers: ['.card', 'dot card'],
  },
  {
    id: 'css-margin-outside-border',
    title: 'Margin sits outside the border',
    objectiveId: 'css-box-model',
    lessonId: 'lesson-2',
    sourceItemIds: ['adaptive-css-box-model-1'],
    acceptedAnswers: ['margin'],
  },
];

const pythonReviewConcepts = [
  {
    id: 'python-comment-symbol',
    title: 'Comments start with #',
    objectiveId: 'python-syntax',
    lessonId: 'lesson-1',
    sourceItemIds: [
      'diag-python-comment',
      'adaptive-python-syntax-2',
      'reassess-python-comment',
    ],
    acceptedAnswers: ['#', 'hash', 'hash symbol'],
  },
  {
    id: 'python-assignment',
    title: 'Assignment uses a single equals sign',
    objectiveId: 'python-syntax',
    lessonId: 'lesson-1',
    sourceItemIds: [
      'practice-python-assignment',
      'diag-cf-assignment',
      'reassess-cf-assignment',
    ],
    acceptedAnswers: ['x = 5', 'x=5'],
  },
  {
    id: 'python-print-output',
    title: 'print writes output',
    objectiveId: 'python-syntax',
    lessonId: 'lesson-1',
    sourceItemIds: ['practice-python-print', 'practice-cf-print'],
    acceptedAnswers: [
      'displays the text as output',
      'prints text',
      'print text',
      'prints the text',
    ],
  },
  {
    id: 'python-if-keyword',
    title: 'Conditionals start with if',
    objectiveId: 'python-control-flow',
    lessonId: 'lesson-2',
    sourceItemIds: ['adaptive-python-control-1'],
    acceptedAnswers: ['if'],
  },
  {
    id: 'python-for-keyword',
    title: 'Sequence loops start with for',
    objectiveId: 'python-control-flow',
    lessonId: 'lesson-2',
    sourceItemIds: ['adaptive-python-control-2'],
    acceptedAnswers: ['for'],
  },
];

export const courseLearningMaps = {
  'web-dev-101': {
    courseId: 'web-dev-101',
    subject: 'Web Development',
    masteryPolicy: { ...baseMasteryCriteria },
    objectives: getCourseObjectives('web-dev-101'),
    // Calculation errors are not part of this subject's authored evidence model.
    errorCategories: [
      'concept_misunderstanding',
      'procedural_error',
      'prerequisite_gap',
      'syntax_error',
      'incomplete_answer',
      'unknown_error',
    ],
    adaptiveExercises: webDevAdaptiveExercises,
    reviewConcepts: webDevReviewConcepts,
    lessons: {
      'lesson-1': {
        objectiveIds: [
          'html-document-structure',
          'html-tag-anatomy',
          'html-semantics',
        ],
        prerequisiteObjectiveIds: [],
        diagnostic: webDevDiagnostics['lesson-1'],
      },
      'lesson-2': {
        objectiveIds: ['css-selectors', 'css-box-model'],
        prerequisiteObjectiveIds: [
          'html-document-structure',
          'html-tag-anatomy',
          'html-semantics',
        ],
        diagnostic: webDevDiagnostics['lesson-2'],
      },
    },
  },
  'python-basics': {
    courseId: 'python-basics',
    subject: 'Programming',
    masteryPolicy: { ...baseMasteryCriteria },
    objectives: getCourseObjectives('python-basics'),
    errorCategories: [
      'concept_misunderstanding',
      'procedural_error',
      'prerequisite_gap',
      'syntax_error',
      'incomplete_answer',
      'unknown_error',
    ],
    adaptiveExercises: pythonAdaptiveExercises,
    reviewConcepts: pythonReviewConcepts,
    lessons: {
      'lesson-1': {
        objectiveIds: ['python-syntax'],
        prerequisiteObjectiveIds: [],
        diagnostic: pythonDiagnostics['lesson-1'],
      },
      'lesson-2': {
        objectiveIds: ['python-control-flow'],
        prerequisiteObjectiveIds: ['python-syntax'],
        diagnostic: pythonDiagnostics['lesson-2'],
      },
    },
  },
};

export function getCourseLearningMap(courseId) {
  return courseLearningMaps[courseId] || null;
}

export function getLessonLearningSpec(courseId, lessonId) {
  const courseMap = getCourseLearningMap(courseId);
  if (!courseMap) return null;
  return courseMap.lessons[lessonId] || null;
}

export function getReviewConcepts(courseId) {
  const courseMap = getCourseLearningMap(courseId);
  return courseMap && Array.isArray(courseMap.reviewConcepts)
    ? courseMap.reviewConcepts
    : [];
}

/**
 * Build the pool of validated questions that review concepts may cite.
 *
 * The pool deliberately includes only authored learning content: diagnostics,
 * practice, reassessment, journey assessment items and adaptive exercises.
 * Legacy lesson quizzes do not carry objective ids, so they are not eligible
 * for objective-linked recall.
 */
export function getCourseReviewItems(courseId) {
  const courseMap = getCourseLearningMap(courseId);
  if (!courseMap) return [];

  const items = [];
  const seen = new Set();
  const addItems = (list) => {
    (Array.isArray(list) ? list : []).forEach((item) => {
      if (!item || typeof item !== 'object' || !item.id || seen.has(item.id)) {
        return;
      }
      seen.add(item.id);
      items.push(item);
    });
  };

  Object.keys(courseMap.lessons || {}).forEach((lessonId) => {
    const lessonSpec = courseMap.lessons[lessonId];
    if (!lessonSpec) return;
    const diagnostic = lessonSpec.diagnostic;
    if (diagnostic) {
      addItems(diagnostic.items);
      addItems(diagnostic.practiceItems);
      addItems(diagnostic.reassessmentItems);
    }

    const journey = getLearningJourney(courseId, lessonId);
    if (journey) {
      addItems(journey.guidedPractice && journey.guidedPractice.items);
      addItems(
        journey.independentPractice && journey.independentPractice.items
      );
      addItems(journey.assessment && journey.assessment.items);
    }
  });

  Object.values(courseMap.adaptiveExercises || {}).forEach(addItems);
  return items;
}
