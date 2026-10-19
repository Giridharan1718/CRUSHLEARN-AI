// Learning Objectives and Prerequisite Detection
// Defines reusable learning objectives with prerequisite relationships
// for adaptive learning across subjects.

/**
 * Learning Objective Definition
 * A reusable learning objective with prerequisite relationships.
 *
 * The mechanism supports multiple subjects:
 * - Programming: variables, Boolean conditions, loops
 * - Mathematics: fractions, equations, functions
 * - Science: cells, forces, energy
 * - Languages: vocabulary, grammar, writing
 * - Business: case studies, decision making
 * - Design: create, critique, iterate
 */
export const LEARNING_OBJECTIVES = {
  // Programming subject
  programming: {
    subject: 'Programming',
    color: '#3b82f6',
    objectives: [
      {
        id: 'prog-variable',
        title: 'Understand variables',
        description: 'Learn to store and retrieve data in named containers.',
        skills: ['variables', 'data-types', 'memory'],
        prerequisiteIds: [],
        difficulty: 'beginner',
      },
      {
        id: 'prog-boolean',
        title: 'Understand Boolean conditions',
        description: 'Learn to evaluate true/false conditions and use logical operators.',
        skills: ['boolean-logic', 'comparison', 'conditionals'],
        prerequisiteIds: ['prog-variable'],
        difficulty: 'beginner',
      },
      {
        id: 'prog-loop',
        title: 'Understand loops',
        description: 'Learn to repeat actions using loops.',
        skills: ['iteration', 'control-flow', 'patterns'],
        prerequisiteIds: ['prog-variable', 'prog-boolean'],
        difficulty: 'intermediate',
      },
    ],
  },

  // Mathematics subject
  mathematics: {
    subject: 'Mathematics',
    color: '#10b981',
    objectives: [
      {
        id: 'math-fraction',
        title: 'Understand fractions',
        description: 'Learn numerator, denominator, and equivalence.',
        skills: ['fractions', 'ratios', 'number-sense'],
        prerequisiteIds: [],
        difficulty: 'beginner',
      },
      {
        id: 'math-equation',
        title: 'Solve equations',
        description: 'Learn to isolate variables and solve linear equations.',
        skills: ['algebra', 'variables', 'problem-solving'],
        prerequisiteIds: ['math-fraction'],
        difficulty: 'intermediate',
      },
    ],
  },

  // Science subject
  science: {
    subject: 'Science',
    color: '#8b5cf6',
    objectives: [
      {
        id: 'sci-cells',
        title: 'Understand cells',
        description: 'Learn the basic unit of life and its structures.',
        skills: ['biology', 'microscopy', 'structures'],
        prerequisiteIds: [],
        difficulty: 'beginner',
      },
      {
        id: 'sci-forces',
        title: 'Understand forces',
        description: 'Learn how forces interact and cause motion.',
        skills: ['physics', 'motion', 'energy'],
        prerequisiteIds: ['sci-cells'],
        difficulty: 'intermediate',
      },
    ],
  },

  // Language subject
  languages: {
    subject: 'Languages',
    color: '#f59e0b',
    objectives: [
      {
        id: 'lang-vocab',
        title: 'Build vocabulary',
        description: 'Learn common words and phrases.',
        skills: ['vocabulary', 'memory', 'recall'],
        prerequisiteIds: [],
        difficulty: 'beginner',
      },
      {
        id: 'lang-grammar',
        title: 'Learn grammar',
        description: 'Learn sentence structure and verb conjugation.',
        skills: ['grammar', 'syntax', 'structure'],
        prerequisiteIds: ['lang-vocab'],
        difficulty: 'beginner',
      },
    ],
  },

  // Business subject
  business: {
    subject: 'Business',
    color: '#ec4899',
    objectives: [
      {
        id: 'biz-case',
        title: 'Understand case studies',
        description: 'Learn to analyze real-world business scenarios.',
        skills: ['analysis', 'case-studies', 'critical-thinking'],
        prerequisiteIds: [],
        difficulty: 'beginner',
      },
      {
        id: 'biz-decide',
        title: 'Make decisions',
        description: 'Learn to evaluate options and make informed decisions.',
        skills: ['decision-making', 'strategy', 'analysis'],
        prerequisiteIds: ['biz-case'],
        difficulty: 'intermediate',
      },
    ],
  },

  // Design subject
  design: {
    subject: 'Design',
    color: '#14b8a6',
    objectives: [
      {
        id: 'des-create',
        title: 'Create work',
        description: 'Learn to produce original design work.',
        skills: ['creation', 'production', 'execution'],
        prerequisiteIds: [],
        difficulty: 'beginner',
      },
      {
        id: 'des-critique',
        title: 'Critique work',
        description: 'Learn to evaluate design work objectively.',
        skills: ['analysis', 'evaluation', 'criticism'],
        prerequisiteIds: ['des-create'],
        difficulty: 'intermediate',
      },
      {
        id: 'des-iterate',
        title: 'Iterate',
        description: 'Learn to refine work based on feedback.',
        skills: ['iteration', 'improvement', 'refinement'],
        prerequisiteIds: ['des-create', 'des-critique'],
        difficulty: 'advanced',
      },
    ],
  },
};

/**
 * Get all learning objectives for a subject or all subjects.
 *
 * @param {string} [subject] - Subject key (e.g., 'programming')
 * @returns {Array} Array of objective objects
 */
export const getLearningObjectives = (subject) => {
  if (!subject) {
    // Return all objectives from all subjects
    const all = [];
    Object.values(LEARNING_OBJECTIVES).forEach((subjectDef) => {
      all.push(...subjectDef.objectives);
    });
    return all;
  }

  const subjectDef = LEARNING_OBJECTIVES[subject];
  if (!subjectDef) {
    return [];
  }
  return subjectDef.objectives;
};

/**
 * Get the subject definition for a given subject key.
 *
 * @param {string} subject - Subject key
 * @returns {Object|null} Subject definition
 */
export const getSubjectDefinition = (subject) => {
  return LEARNING_OBJECTIVES[subject] || null;
};

/**
 * Get prerequisites for an objective.
 *
 * @param {string} objectiveId - Objective ID
 * @param {string} [subject] - Subject key (optional, for lookup)
 * @returns {Array} Array of prerequisite objective IDs
 */
export const getObjectivePrerequisites = (objectiveId, subject) => {
  const allObjectives = getLearningObjectives(subject);
  const objective = allObjectives.find((o) => o.id === objectiveId);
  return objective?.prerequisiteIds || [];
};

/**
 * Get objective by ID.
 *
 * @param {string} objectiveId - Objective ID
 * @param {string} [subject] - Subject key
 * @returns {Object|null} Objective object
 */
export const getObjectiveById = (objectiveId, subject) => {
  const allObjectives = getLearningObjectives(subject);
  return allObjectives.find((o) => o.id === objectiveId) || null;
};

/**
 * Check if a learner has met all prerequisites for an objective.
 *
 * @param {Array} completedObjectiveIds - Array of completed objective IDs
 * @param {string} targetObjectiveId - Objective ID to check
 * @returns {Object} Object with `met` (boolean) and `missing` (array)
 */
export const checkObjectivePrerequisites = (
  completedObjectiveIds,
  targetObjectiveId
) => {
  const prerequisites = getObjectivePrerequisites(targetObjectiveId);
  const completedSet = new Set(completedObjectiveIds);
  const missing = prerequisites.filter(
    (prereqId) => !completedSet.has(prereqId)
  );

  return {
    met: missing.length === 0,
    missing,
  };
};

/**
 * Get a learning path (ordered list of objective IDs) for a subject.
 *
 * Uses topological sort: prerequisites first, then dependents.
 *
 * @param {string} subject - Subject key
 * @returns {Array} Ordered array of objective IDs
 */
export const getLearningPath = (subject) => {
  const objectives = getLearningObjectives(subject);
  const idToObj = new Map(objectives.map((o) => [o.id, o]));
  const visited = new Set();
  const result = [];

  const visit = (objectiveId) => {
    if (visited.has(objectiveId)) return;
    const obj = idToObj.get(objectiveId);
    if (!obj) return;

    obj.prerequisiteIds.forEach((prereqId) => visit(prereqId));
    visited.add(objectiveId);
    result.push(objectiveId);
  };

  objectives.forEach((obj) => visit(obj.id));
  return result;
};

/**
 * Get the skill group associated with an objective.
 *
 * @param {string} objectiveId - Objective ID
 * @returns {string|null} Skill group name
 */
export const getObjectiveSkillGroup = (objectiveId) => {
  const objective = getObjectiveById(objectiveId);
  if (!objective) return null;

  const skill = objective.skills?.[0];
  if (!skill) return null;

  // Map skills to readable skill groups
  const skillGroups = {
    variables: 'Programming Basics',
    'data-types': 'Programming Basics',
    memory: 'Programming Basics',
    'boolean-logic': 'Programming Logic',
    comparison: 'Programming Logic',
    conditionals: 'Programming Logic',
    iteration: 'Programming Logic',
    'control-flow': 'Programming Logic',
    patterns: 'Programming Logic',
    fractions: 'Mathematics Basics',
    ratios: 'Mathematics Basics',
    'number-sense': 'Mathematics Basics',
    algebra: 'Algebra',
    'problem-solving': 'Problem Solving',
    biology: 'Biology',
    microscopy: 'Biology',
    structures: 'Biology',
    physics: 'Physics',
    motion: 'Physics',
    energy: 'Physics',
    vocabulary: 'Vocabulary',
    memory: 'Vocabulary',
    recall: 'Vocabulary',
    grammar: 'Grammar',
    syntax: 'Grammar',
    structure: 'Grammar',
    analysis: 'Business Analysis',
    'case-studies': 'Business Analysis',
    'critical-thinking': 'Business Analysis',
    'decision-making': 'Business Strategy',
    strategy: 'Business Strategy',
    creation: 'Design Creation',
    production: 'Design Creation',
    execution: 'Design Creation',
    'critical-analysis': 'Design Critique',
    iteration: 'Design Iteration',
    improvement: 'Design Iteration',
    refinement: 'Design Iteration',
  };

  return skillGroups[skill] || skill;
};
