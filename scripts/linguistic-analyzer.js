#!/usr/bin/env node
/**
 * linguistic-analyzer.js — Score-based linguistic validation for state names and event names.
 *
 * Exports:
 *   analyzeStateName(name) → { score, warnings }
 *   analyzeEventName(name) → { score, warnings }
 *   setExternalValidator(fn) → void
 *   classifyEventName(name) → { tense, style }
 */

// ---------------------------------------------------------------------------
// State name patterns (ordered by severity)
// ---------------------------------------------------------------------------

const STATE_VERB_PATTERNS = [
  { pattern: /^is[A-Z]/, label: 'boolean (is*)', penalty: 0.3 },
  { pattern: /^has[A-Z]/, label: 'boolean (has*)', penalty: 0.3 },
  { pattern: /^on[A-Z]/, label: 'event handler (on*)', penalty: 0.3 },
  { pattern: /^fetch/i, label: 'verb prefix (fetch*)', penalty: 0.4 },
];

const STATE_ALLOW_LIST = [
  'Loading', 'Opening', 'Closing', 'Entering', 'Exiting',
  'Uploading', 'Downloading', 'Searching', 'Validating',
  'Submitting', 'Authenticating', 'Selecting', 'PendingOn',
  'PendingOff', 'LoadingMore', 'Refreshing', 'Restoring',
  'Reconnecting', 'Deleting', 'Processing', 'Duplicating',
  'Merging', 'Syncing', 'Synchronizing', 'Retrying',
];

const EVENT_SKIP_PATTERN = /^<[^>]+>$/; // <done>, <error>, etc.

const EVENT_VALID_PATTERNS = [
  { pattern: /^[A-Z][A-Z_]*(?:_[A-Z_]+)*$/, style: 'SCREAMING_SNAKE_CASE' },
  { pattern: /^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/, style: 'PascalCase' },
];

// ---------------------------------------------------------------------------
// External validator hook
// ---------------------------------------------------------------------------

let externalValidator = null;

/**
 * Register an optional external validator (NLP / LLM).
 * The function receives (name, type) where type is 'state' or 'event',
 * and must return { valid: boolean, score?: number, reason?: string }
 * or null/undefined if it cannot determine.
 */
function setExternalValidator(fn) {
  externalValidator = fn;
}

async function tryExternal(name, type) {
  if (!externalValidator) return null;
  try {
    const result = await externalValidator(name, type);
    if (result && typeof result.valid === 'boolean') return result;
  } catch {
    // fall through
  }
  return null;
}

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

function classifyEventName(name) {
  for (const { pattern, style } of EVENT_VALID_PATTERNS) {
    if (pattern.test(name)) return { style, match: true };
  }
  return { style: 'unknown', match: false };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze a state name.
 * Returns { score (0–1), warnings (string[]), external (object|null) }.
 */
function analyzeStateName(name) {
  const warnings = [];

  if (STATE_ALLOW_LIST.includes(name)) {
    return { score: 1.0, warnings: [], external: null };
  }

  let score = 1.0;

  for (const { pattern, label, penalty } of STATE_VERB_PATTERNS) {
    if (pattern.test(name)) {
      warnings.push(`"${name}" looks like a ${label} pattern. State names should be nouns or adjectives describing what the user sees.`);
      score = Math.min(score, penalty);
    }
  }

  if (/ing$/.test(name) && !STATE_ALLOW_LIST.includes(name)) {
    warnings.push(`"${name}" ends with -ing. If it describes what the user sees (a spinner, an animation), it is OK. If it describes an action the code is performing, rename to a noun or adjective.`);
    score = Math.min(score, 0.6);
  }

  if (/^[a-z]/.test(name)) {
    warnings.push(`"${name}" starts with lowercase. State names should be PascalCase (e.g., "Loading").`);
    score = Math.min(score, 0.5);
  }

  if (/\s/.test(name)) {
    warnings.push(`"${name}" contains spaces. State names should be a single PascalCase word.`);
    score = Math.min(score, 0.4);
  }

  return { score, warnings, external: null };
}

/**
 * Analyze an event name.
 * Returns { score (0–1), warnings (string[]), external (object|null) }.
 */
function analyzeEventName(name) {
  const warnings = [];

  if (EVENT_SKIP_PATTERN.test(name)) {
    return { score: 1.0, warnings: [], external: null };
  }

  let score = 1.0;
  const classified = classifyEventName(name);

  if (classified.match) {
    if (classified.style === 'PascalCase') {
      warnings.push(`"${name}" uses PascalCase. SCREAMING_SNAKE_CASE is preferred for events (e.g., "FETCH_SUCCESS" instead of "FetchSuccess").`);
      score = Math.min(score, 0.8);
    }
  } else {
    if (/ing$/.test(name)) {
      warnings.push(`"${name}" is a gerund (-ing). Events should be past tense (FETCH_SUCCESS) or imperative (SUBMIT, CANCEL).`);
      score = Math.min(score, 0.3);
    } else if (/^[a-z]/.test(name)) {
      warnings.push(`"${name}" starts with lowercase. Events should be SCREAMING_SNAKE_CASE (e.g., "FETCH_SUCCESS").`);
      score = Math.min(score, 0.4);
    } else if (/^[A-Z][a-z]/.test(name) && classified.style === 'unknown') {
      warnings.push(`"${name}" looks like a state name. Events should be SCREAMING_SNAKE_CASE to distinguish from states.`);
      score = Math.min(score, 0.5);
    } else {
      warnings.push(`"${name}" does not follow SCREAMING_SNAKE_CASE convention. Events should be past tense (FETCH_SUCCESS) or imperative (SUBMIT).`);
      score = Math.min(score, 0.4);
    }
  }

  return { score, warnings, external: null };
}

/**
 * Run extended analysis: if the score is marginal (0.5–0.99) and an
 * external validator is registered, call it to potentially raise the score.
 * This is the "attenuated approval" path.
 */
async function analyzeWithExternal(name, type) {
  const result = type === 'state' ? analyzeStateName(name) : analyzeEventName(name);

  if (result.score >= 0.5 && result.score < 1.0) {
    const ext = await tryExternal(name, type);
    if (ext) {
      result.external = ext;
      if (ext.valid && ext.score != null && ext.score > result.score) {
        result.score = Math.min(1.0, ext.score);
        result.warnings.push(`✓ External validator confirmed "${name}" as a valid ${type} name (score: ${ext.score})`);
      } else if (ext.valid && ext.score == null) {
        result.score = Math.min(1.0, result.score + 0.2);
        result.warnings.push(`✓ External validator approved "${name}" as a valid ${type} name`);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Threshold constants
// ---------------------------------------------------------------------------

const SCORE_OK = 0.7;       // >= 0.7 → warning only, no error
const SCORE_FAIL = 0.7;     // < 0.7  → error

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
  analyzeStateName,
  analyzeEventName,
  analyzeWithExternal,
  setExternalValidator,
  classifyEventName,
  SCORE_OK,
  SCORE_FAIL,
  STATE_ALLOW_LIST,
};
