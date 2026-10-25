// Typed schema for visual explanations.
//
// The renderer reads only the known fields below. Unknown fields, including
// arbitrary HTML, are ignored rather than executed or rendered.

import { DOMAIN_STRATEGIES } from './domainStrategies.mjs';

export const VISUAL_EXPLANATION_SCHEMA_VERSION = 1;
export const MIN_PROCESS_STEPS = 3;
export const MAX_PROCESS_STEPS = 10;
export const MAX_TOPIC_LENGTH = 300;
export const MAX_TEXT_LENGTH = 1600;

export const LEVELS = Object.freeze(['beginner', 'intermediate', 'advanced']);

export const LEVEL_LABELS = Object.freeze({
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
});

export const SUPPORTED_VISUAL_TYPES = Object.freeze({
  PROCESS: 'process',
});

export const FUTURE_VISUAL_TYPES = Object.freeze([
  'interactive_diagram',
  'concept_map',
  'timeline',
  'flowchart',
  'comparison',
  'graphs',
  'annotated_example',
  'code_trace',
  'simulation',
  'three_d',
]);

function validateText(value, field, errors, { max = MAX_TEXT_LENGTH, min = 1 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min) {
    errors.push(`${field} is required.`);
    return false;
  }
  if (value.trim().length > max) {
    errors.push(`${field} must be ${max} characters or fewer.`);
    return false;
  }
  return true;
}

function validateLevelMap(value, field, errors, { max = MAX_TEXT_LENGTH } = {}) {
  if (!value || typeof value !== 'object') {
    errors.push(`${field} must contain beginner, intermediate and advanced text.`);
    return false;
  }
  let valid = true;
  LEVELS.forEach((level) => {
    if (!validateText(value[level], `${field}.${level}`, errors, { max })) {
      valid = false;
    }
  });
  return valid;
}

export function validateVisualExplanation(explanation) {
  const errors = [];

  if (!explanation || typeof explanation !== 'object') {
    return { ok: false, errors: ['A visual explanation object is required.'] };
  }

  if (explanation.schemaVersion !== VISUAL_EXPLANATION_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${VISUAL_EXPLANATION_SCHEMA_VERSION}.`
    );
  }

  validateText(explanation.id, 'id', errors, { max: 100 });
  validateText(explanation.topic, 'topic', errors, { max: MAX_TOPIC_LENGTH });
  validateText(explanation.title, 'title', errors, { max: 160 });
  validateText(explanation.learningObjective, 'learningObjective', errors, {
    max: 500,
  });

  if (typeof explanation.durationMinutes !== 'number' || explanation.durationMinutes <= 0) {
    errors.push('durationMinutes must be a positive number.');
  }

  if (!DOMAIN_STRATEGIES[explanation.domainId]) {
    errors.push(`Unknown domain "${explanation.domainId}".`);
  }

  if (explanation.visualType !== SUPPORTED_VISUAL_TYPES.PROCESS) {
    errors.push(
      `Unsupported visual type "${explanation.visualType}". Only process diagrams are implemented.`
    );
  }

  const domainStrategy = DOMAIN_STRATEGIES[explanation.domainId];
  if (
    domainStrategy &&
    explanation.visualType &&
    !domainStrategy.recommendedVisualTypes.includes(explanation.visualType)
  ) {
    errors.push(
      `Visual type "${explanation.visualType}" is not recommended for domain "${explanation.domainId}".`
    );
  }

  if (!Array.isArray(explanation.aliases) || explanation.aliases.length === 0) {
    errors.push('aliases must contain at least one search phrase.');
  } else if (
    explanation.aliases.some(
      (alias) => typeof alias !== 'string' || !alias.trim() || alias.length > 160
    )
  ) {
    errors.push('Every alias must be non-empty text of 160 characters or fewer.');
  }

  validateLevelMap(explanation.intro, 'intro', errors);

  const process = explanation.process;
  if (!process || typeof process !== 'object') {
    errors.push('process is required.');
  } else {
    if (
      !Array.isArray(process.steps) ||
      process.steps.length < MIN_PROCESS_STEPS ||
      process.steps.length > MAX_PROCESS_STEPS
    ) {
      errors.push(
        `process.steps must contain between ${MIN_PROCESS_STEPS} and ${MAX_PROCESS_STEPS} steps.`
      );
    } else {
      const stepIds = new Set();
      process.steps.forEach((step, index) => {
        const prefix = `process.steps[${index}]`;
        if (!step || typeof step !== 'object') {
          errors.push(`${prefix} must be an object.`);
          return;
        }
        validateText(step.id, `${prefix}.id`, errors, { max: 80 });
        if (stepIds.has(step.id)) {
          errors.push(`${prefix}.id must be unique within the process.`);
        }
        stepIds.add(step.id);
        validateText(step.title, `${prefix}.title`, errors, { max: 100 });
        validateText(step.summary, `${prefix}.summary`, errors, { max: 400 });
        validateLevelMap(step.details, `${prefix}.details`, errors);

        if (step.annotations !== undefined) {
          if (
            !Array.isArray(step.annotations) ||
            step.annotations.length > 5 ||
            step.annotations.some(
              (annotation) =>
                typeof annotation !== 'string' ||
                !annotation.trim() ||
                annotation.length > 240
            )
          ) {
            errors.push(
              `${prefix}.annotations must contain up to five short text annotations.`
            );
          }
        }
      });
    }

    if (
      !Array.isArray(process.limitations) ||
      process.limitations.length === 0 ||
      process.limitations.length > 6 ||
      process.limitations.some(
        (limitation) =>
          typeof limitation !== 'string' ||
          !limitation.trim() ||
          limitation.length > 400
      )
    ) {
      errors.push('process.limitations must contain between one and six explanations.');
    }
  }

  validateText(
    explanation.accessibilityDescription,
    'accessibilityDescription',
    errors,
    { max: 600 }
  );

  if (!explanation.workedExample || typeof explanation.workedExample !== 'object') {
    errors.push('workedExample is required.');
  } else {
    validateText(explanation.workedExample.title, 'workedExample.title', errors, {
      max: 160,
    });
    validateText(explanation.workedExample.body, 'workedExample.body', errors, {
      max: 1200,
    });
  }

  if (!explanation.application || typeof explanation.application !== 'object') {
    errors.push('application is required.');
  } else {
    validateText(explanation.application.title, 'application.title', errors, {
      max: 160,
    });
    validateText(explanation.application.body, 'application.body', errors, {
      max: 1200,
    });
  }

  const practice = explanation.practice;
  if (!practice || typeof practice !== 'object') {
    errors.push('practice is required.');
  } else {
    validateText(practice.question, 'practice.question', errors, { max: 500 });
    if (
      !Array.isArray(practice.options) ||
      practice.options.length < 2 ||
      practice.options.length > 6 ||
      practice.options.some(
        (option) =>
          typeof option !== 'string' || !option.trim() || option.length > 300
      )
    ) {
      errors.push('practice.options must contain between two and six options.');
    } else if (new Set(practice.options.map((option) => option.trim())).size !== practice.options.length) {
      errors.push('practice.options must be unique.');
    }
    if (
      !Number.isInteger(practice.correctIndex) ||
      !Array.isArray(practice.options) ||
      practice.correctIndex < 0 ||
      practice.correctIndex >= practice.options.length
    ) {
      errors.push('practice.correctIndex must point to an available option.');
    }
    validateText(practice.explanation, 'practice.explanation', errors, {
      max: 1000,
    });
    if (practice.hint !== undefined) {
      validateText(practice.hint, 'practice.hint', errors, { max: 500 });
    }
  }

  if (!explanation.provenance || typeof explanation.provenance !== 'object') {
    errors.push('provenance is required.');
  } else {
    if (!['authored', 'source_grounded'].includes(explanation.provenance.kind)) {
      errors.push('provenance.kind must be "authored" or "source_grounded".');
    }
    validateText(explanation.provenance.note, 'provenance.note', errors, {
      max: 500,
    });
    if (
      explanation.provenance.kind === 'source_grounded' &&
      (!Array.isArray(explanation.sources) || explanation.sources.length === 0)
    ) {
      errors.push('Source-grounded explanations must include at least one source reference.');
    }
  }

  if (explanation.sources !== undefined) {
    if (!Array.isArray(explanation.sources)) {
      errors.push('sources must be an array when provided.');
    } else if (
      explanation.sources.some(
        (source) =>
          !source ||
          typeof source !== 'object' ||
          typeof source.sourceId !== 'string' ||
          !source.sourceId.trim() ||
          typeof source.title !== 'string' ||
          !source.title.trim()
      )
    ) {
      errors.push('Every source reference needs a source id and title.');
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateVisualCatalog(catalog) {
  const errors = [];
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return { ok: false, errors: ['The visual catalog must contain at least one explanation.'] };
  }

  const ids = new Set();
  catalog.forEach((explanation, index) => {
    const result = validateVisualExplanation(explanation);
    result.errors.forEach((error) => {
      errors.push(`catalog[${index}]: ${error}`);
    });
    if (explanation?.id) {
      if (ids.has(explanation.id)) {
        errors.push(`catalog[${index}]: duplicate explanation id "${explanation.id}".`);
      }
      ids.add(explanation.id);
    }
  });

  return { ok: errors.length === 0, errors };
}

export function evaluatePracticeAnswer(explanation, answerIndex) {
  const validation = validateVisualExplanation(explanation);
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      isCorrect: false,
      correctIndex: null,
      explanation: '',
    };
  }

  if (
    !Number.isInteger(answerIndex) ||
    answerIndex < 0 ||
    answerIndex >= explanation.practice.options.length
  ) {
    return {
      ok: false,
      errors: ['Choose one of the available answers.'],
      isCorrect: false,
      correctIndex: explanation.practice.correctIndex,
      explanation: explanation.practice.explanation,
    };
  }

  return {
    ok: true,
    errors: [],
    isCorrect: answerIndex === explanation.practice.correctIndex,
    correctIndex: explanation.practice.correctIndex,
    correctAnswer: explanation.practice.options[explanation.practice.correctIndex],
    explanation: explanation.practice.explanation,
  };
}
