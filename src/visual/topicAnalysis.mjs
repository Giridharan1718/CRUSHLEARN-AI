// Deterministic topic analysis for the visual learning vertical slice.
//
// This is a transparent keyword heuristic, not an AI model. It identifies a
// likely domain, an explanation goal and the first useful representation. The
// UI must not present the result as a definitive subject classification.

import {
  DOMAIN_ORDER,
  DOMAIN_STRATEGIES,
  getDomainStrategy,
} from './domainStrategies.mjs';

export const VISUAL_TYPE_LABELS = Object.freeze({
  process: 'Step-by-step process',
  concept_map: 'Concept map',
  flowcharts: 'Flowchart',
  flowchart: 'Flowchart',
  timeline: 'Timeline',
  comparison: 'Comparison view',
  graphs: 'Graphs and charts',
  annotated_example: 'Annotated example',
  code_trace: 'Code execution trace',
  simulation: 'Interactive simulation',
  interactive_diagram: 'Interactive diagram',
});

export const TOPIC_MIN_LENGTH = 2;
export const TOPIC_MAX_LENGTH = 300;

export function normalizeTopicText(topic) {
  return String(topic ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsPhrase(haystack, phrase) {
  const normalizedPhrase = normalizeTopicText(phrase);
  if (!normalizedPhrase) return false;
  const escaped = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'u').test(haystack);
}

function scoreDomain(normalizedTopic, strategy) {
  const matched = [];
  let score = 0;

  strategy.keywords.forEach((keyword) => {
    if (!containsPhrase(normalizedTopic, keyword)) return;
    matched.push(keyword);
    const words = keyword.split(/\s+/).length;
    score += words * 1.4 + Math.min(keyword.length / 20, 1.2);
  });

  return { score, matched };
}

function detectExplanationGoal(topic) {
  const normalized = normalizeTopicText(topic);
  if (/\b(vs|versus|compare|comparison|difference between)\b/.test(normalized)) {
    return 'comparison';
  }
  if (/\b(timeline|history of|evolution of|causes of|why did)\b/.test(normalized)) {
    return 'timeline';
  }
  if (/\b(how does|how do|how is|how are|steps|process|work|works|flow|compile|make money|keep .* cold)\b/.test(normalized)) {
    return 'process';
  }
  if (/\b(what is|what are|relationship|connect|explain|meaning of)\b/.test(normalized)) {
    return 'relationship';
  }
  return 'general';
}

function orderVisualTypes(types, goal) {
  const unique = [...new Set(types)];
  // Relationship questions keep the domain's own preference order. Reordering
  // every "explain" question toward one representation would override a domain
  // such as mathematics, where a graph is usually the better first choice.
  const preferred = {
    process: ['process', 'flowchart', 'flowcharts'],
    comparison: ['comparison'],
    timeline: ['timeline'],
  }[goal];

  if (!preferred) return unique;

  const preferredMatch = unique.find((type) => preferred.includes(type));
  if (!preferredMatch) return unique;
  return [preferredMatch, ...unique.filter((type) => type !== preferredMatch)];
}

export function analyzeTopic(topic, { supportedVisualTypes = ['process'] } = {}) {
  if (typeof topic !== 'string' || topic.trim().length < TOPIC_MIN_LENGTH) {
    return {
      ok: false,
      errors: [`Enter a topic between ${TOPIC_MIN_LENGTH} and ${TOPIC_MAX_LENGTH} characters.`],
      analysis: null,
    };
  }

  const trimmed = topic.trim();
  if (trimmed.length > TOPIC_MAX_LENGTH) {
    return {
      ok: false,
      errors: [`Enter a topic between ${TOPIC_MIN_LENGTH} and ${TOPIC_MAX_LENGTH} characters.`],
      analysis: null,
    };
  }

  const normalizedTopic = normalizeTopicText(trimmed);
  let best = {
    domainId: 'general',
    score: 0,
    matchedKeywords: [],
  };

  DOMAIN_ORDER.forEach((domainId) => {
    if (domainId === 'general') return;
    const strategy = DOMAIN_STRATEGIES[domainId];
    const result = scoreDomain(normalizedTopic, strategy);
    if (result.score > best.score) {
      best = {
        domainId,
        score: result.score,
        matchedKeywords: result.matched,
      };
    }
  });

  const domainId = best.score > 0 ? best.domainId : 'general';
  const strategy = getDomainStrategy(domainId);
  const explanationGoal = detectExplanationGoal(trimmed);
  const recommendedVisualTypes = orderVisualTypes(
    strategy.recommendedVisualTypes,
    explanationGoal
  ).filter((type) => typeof type === 'string' && type);

  const supported = recommendedVisualTypes.filter((type) =>
    supportedVisualTypes.includes(type)
  );

  const confidence =
    best.score >= 2.4
      ? 'high'
      : best.score > 0.5
        ? 'medium'
        : 'low';

  return {
    ok: true,
    errors: [],
    analysis: {
      topic: trimmed,
      normalizedTopic,
      domainId,
      domainLabel: strategy.label,
      confidence,
      explanationGoal,
      matchedKeywords: best.matchedKeywords,
      recommendedVisualTypes,
      supportedVisualTypes: supported,
      primaryVisualType: recommendedVisualTypes[0] || null,
      strategy,
      isFallbackDomain: domainId === 'general',
    },
  };
}

export function selectVisualStrategy(
  analysis,
  { supportedVisualTypes = ['process'] } = {}
) {
  if (!analysis || !Array.isArray(analysis.recommendedVisualTypes)) {
    return {
      supported: false,
      type: null,
      preferredType: null,
      label: 'No supported visualization',
      reason: 'No topic analysis was available.',
    };
  }

  const preferredType = analysis.recommendedVisualTypes[0] || null;
  if (preferredType && supportedVisualTypes.includes(preferredType)) {
    return {
      supported: true,
      type: preferredType,
      preferredType,
      label: VISUAL_TYPE_LABELS[preferredType] || preferredType,
      reason:
        analysis.explanationGoal === 'process'
          ? 'A process representation matches the question and the selected domain.'
          : 'This is the first recommended representation for the selected domain.',
    };
  }

  return {
    supported: false,
    type: null,
    preferredType,
    label: preferredType
      ? VISUAL_TYPE_LABELS[preferredType] || preferredType
      : 'No supported visualization',
    reason: preferredType
      ? `The recommended ${VISUAL_TYPE_LABELS[preferredType] || preferredType} renderer is not available in this build.`
      : 'This build has no renderer for the recommended representation.',
  };
}
