// Public access to the authored visual catalog plus topic-to-explanation
// matching. The matcher is deliberately narrow: if it cannot identify a
// verified explanation, it returns no explanation instead of inventing one.

import { visualExplanations } from '../content/visual/index.mjs';
import { getDomainStrategy } from './domainStrategies.mjs';
import { analyzeTopic, normalizeTopicText } from './topicAnalysis.mjs';
import {
  validateVisualCatalog,
  validateVisualExplanation,
} from './visualSchema.mjs';

export const SUPPORTED_VISUAL_TYPES = Object.freeze(['process']);

export const VISUAL_CATALOG_VALIDATION = validateVisualCatalog(visualExplanations);

// Filler words must not create a match. Without this, a generic question such
// as "how does it work?" would overlap with every "how does ... work" alias.
const MATCH_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'do',
  'does',
  'for',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'through',
  'to',
  'what',
  'why',
  'with',
  'work',
  'works',
]);

function tokenSet(value) {
  return new Set(
    normalizeTopicText(value)
      .split(' ')
      .filter((token) => token && !MATCH_STOPWORDS.has(token))
  );
}

function overlapScore(topic, alias) {
  const topicTokens = tokenSet(topic);
  const aliasTokens = tokenSet(alias);
  let overlap = 0;
  aliasTokens.forEach((token) => {
    if (topicTokens.has(token)) overlap += 1;
  });
  return {
    overlap,
    aliasTokenCount: aliasTokens.size,
    topicTokenCount: topicTokens.size,
  };
}

export function scoreTopicMatch(topic, explanation) {
  const normalizedTopic = normalizeTopicText(topic);
  if (!normalizedTopic) return 0;

  let best = 0;
  (explanation.aliases || []).forEach((alias) => {
    const normalizedAlias = normalizeTopicText(alias);
    if (!normalizedAlias) return;

    if (normalizedTopic === normalizedAlias) {
      best = Math.max(best, 100);
      return;
    }

    const { overlap, aliasTokenCount } = overlapScore(
      normalizedTopic,
      normalizedAlias
    );

    if (
      normalizedTopic.includes(normalizedAlias) ||
      normalizedAlias.includes(normalizedTopic)
    ) {
      best = Math.max(best, 40 + overlap);
      return;
    }

    if (
      overlap >= 2 &&
      aliasTokenCount > 0 &&
      overlap / aliasTokenCount >= 0.6
    ) {
      best = Math.max(best, 20 + overlap);
    }
  });

  return best;
}

export function findVisualExplanationForTopic(topic, catalog = visualExplanations) {
  const analysisResult = analyzeTopic(topic, {
    supportedVisualTypes: SUPPORTED_VISUAL_TYPES,
  });

  if (!analysisResult.ok) {
    return {
      ok: false,
      errors: analysisResult.errors,
      analysis: null,
      explanation: null,
      matchScore: 0,
    };
  }

  let best = null;
  catalog.forEach((explanation) => {
    if (!explanation) return;
    const score = scoreTopicMatch(topic, explanation);
    if (!best || score > best.score) {
      best = { explanation, score };
    }
  });

  if (!best || best.score < 20) {
    return {
      ok: true,
      errors: [],
      analysis: analysisResult.analysis,
      explanation: null,
      matchScore: 0,
    };
  }

  return {
    ok: true,
    errors: [],
    analysis: analysisResult.analysis,
    explanation: best.explanation,
    matchScore: best.score,
  };
}

export function getVisualExplanationById(id) {
  return visualExplanations.find((explanation) => explanation.id === id) || null;
}

export function listVisualTopics(catalog = visualExplanations) {
  return catalog.map((explanation) => {
    const strategy = getDomainStrategy(explanation.domainId);
    return {
      id: explanation.id,
      topic: explanation.topic,
      title: explanation.title,
      domainId: explanation.domainId,
      domainLabel: strategy.label,
      visualType: explanation.visualType,
      durationMinutes: explanation.durationMinutes,
      stepCount: explanation.process?.steps?.length || 0,
      provenanceKind: explanation.provenance?.kind || 'authored',
    };
  });
}

export function validateCatalogExplanation(explanation) {
  return validateVisualExplanation(explanation);
}
