#!/usr/bin/env node
/**
 * validate-model.js — Zero-dependency model validator.
 *
 * Usage:
 *   node scripts/validate-model.js model.json
 *
 * Checks gates 01–10 from references/slop-gates.md.
 * Exit code 0 = valid, 1 = invalid with list of failed gates.
 */

const fs = require('fs');
const path = require('path');

const GATES = [
  gate01_atLeast2States,
  gate02_atLeast1Transition,
  gate03_exactly1Initial,
  gate04_everyStateReachable,
  gate05_terminalOrCycle,
  gate06_stateNamesAreNouns,
  gate07_eventNamesAreVerbs,
  gate08_noUnreachableStates,
  gate09_noDeadNonTerminal,
  gate10_noDuplicateEventPairs,
];

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/validate-model.js model.json');
    process.exit(1);
  }

  let raw;
  try {
    raw = fs.readFileSync(path.resolve(filePath), 'utf-8');
  } catch (err) {
    console.error(`Cannot read file: ${filePath}`);
    console.error(err.message);
    process.exit(1);
  }

  let model;
  try {
    model = JSON.parse(raw);
  } catch (err) {
    console.error('Invalid JSON:', err.message);
    process.exit(1);
  }

  const errors = [];
  for (const gate of GATES) {
    const result = gate(model);
    if (result !== null) {
      errors.push(result);
    }
  }

  if (errors.length === 0) {
    console.log('All gates passed.');
    process.exit(0);
  }

  console.error(`${errors.length} gate(s) failed:\n`);
  for (const err of errors) {
    console.error(`  ❌ GATE ${err.gate} FAILED: ${err.name}`);
    console.error(`     Problem: ${err.problem}`);
    console.error(`     Fix: ${err.fix}`);
    console.error();
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

function hasProp(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function safeStr(v) {
  return v == null ? '' : String(v);
}

// ---------------------------------------------------------------------------
// Gate implementations
// ---------------------------------------------------------------------------

/**
 * Gate 01 — At least 2 states.
 */
function gate01_atLeast2States(model) {
  const states = model.states;
  if (!states || !Array.isArray(states) || states.length < 2) {
    return {
      gate: '01',
      name: 'At least 2 states',
      problem: `Model defines ${states ? states.length : 0} state(s). A machine needs at least 2 states to transition between.`,
      fix: 'Add at least one more state to the "states" array. Even a trivial machine needs two states (e.g., Off, On).',
    };
  }
  return null;
}

/**
 * Gate 02 — At least 1 transition.
 */
function gate02_atLeast1Transition(model) {
  const transitions = model.transitions;
  if (!transitions || !Array.isArray(transitions) || transitions.length < 1) {
    return {
      gate: '02',
      name: 'At least 1 transition',
      problem: 'Transition table is empty. States exist but nothing connects them.',
      fix: 'Add at least one transition between two different states, or add a self-transition with an action.',
    };
  }
  return null;
}

/**
 * Gate 03 — Exactly 1 initial state.
 * The initial state is the first entry in the states array.
 */
function gate03_exactly1Initial(model) {
  const states = model.states;
  if (!states || !Array.isArray(states)) {
    return null; // already caught by gate 01
  }

  if (states.length === 0) {
    return null;
  }

  const initials = states.filter(s => safeStr(s).endsWith('*'));
  if (initials.length > 1) {
    return {
      gate: '03',
      name: 'Exactly 1 initial state',
      problem: `Found ${initials.length} states marked with *: ${initials.join(', ')}. Only one initial state allowed.`,
      fix: 'Remove the * marker from all but one state. The initial state is the first entry in the states array.',
    };
  }

  if (initials.length === 0 && states.length > 0) {
    // Implicit: first state is initial. This is the convention used in the patterns.
    // So we accept it as valid.
    return null;
  }

  return null;
}

/**
 * Gate 04 — Every non-initial state has at least one incoming transition.
 */
function gate04_everyStateReachable(model) {
  const states = model.states;
  const transitions = model.transitions;
  if (!states || !transitions) return null;

  const initialName = getInitialStateName(states);
  const targetNames = new Set(
    transitions
      .filter(t => t.To && safeStr(t.To) !== initialName)
      .map(t => safeStr(t.To))
  );

  for (const state of states) {
    const name = safeStr(state).replace(/\*$/, '');
    if (name === initialName) continue;
    if (!targetNames.has(name)) {
      return {
        gate: '04',
        name: 'Every state reachable',
        problem: `State "${name}" has no incoming transitions. It can never be entered.`,
        fix: `Add at least one transition that targets "${name}", or remove it from the model.`,
      };
    }
  }
  return null;
}

/**
 * Gate 05 — Terminal state or valid cycle.
 * At least one state marked terminal, or the graph has a cycle back to an active state.
 */
function gate05_terminalOrCycle(model) {
  const states = model.states;
  const transitions = model.transitions;
  if (!states || !transitions) return null;

  // Check for explicit terminal states (marked with (terminal) or ends with T)
  const hasTerminal = states.some(s => {
    const str = safeStr(s).toLowerCase();
    return str.includes('terminal') || str.includes('(t)') || str === safeStr(s).replace(/\*$/, '') + 'T'.toLowerCase();
  });

  // Also allow end-of-list / completed / skipped as terminal
  const terminalKeywords = ['completed', 'end', 'endOfList', 'end_of_list', 'done', 'skipped', 'deletedpermanently'];
  const hasTerminalByName = states.some(s => {
    const name = safeStr(s).replace(/\*$/, '').toLowerCase().replace(/\s/g, '');
    return terminalKeywords.includes(name);
  });

  if (hasTerminal || hasTerminalByName) return null;

  // Check for cycle: trace reachability from initial, look for back-edges
  const initial = getInitialStateName(states);
  const graph = buildGraph(transitions);
  const visited = new Set();
  const stack = [initial];
  let hasCycle = false;
  while (stack.length > 0) {
    const current = stack.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    const edges = graph.get(current) || [];
    for (const edge of edges) {
      if (edge.to === initial || visited.has(edge.to)) {
        hasCycle = true;
        break;
      }
      stack.push(edge.to);
    }
    if (hasCycle) break;
  }

  if (!hasCycle) {
    return {
      gate: '05',
      name: 'Terminal state or valid cycle',
      problem: 'No terminal state found and no cycle detected. The machine may reach a dead end with no way to reset or exit.',
      fix: 'Either mark a state as terminal (e.g., name it "Completed" or "Done"), or ensure there is a cycle back to an active state (e.g., On → Off → On).',
    };
  }
  return null;
}

/**
 * Gate 06 — State names are nouns or adjectives (not verbs or booleans).
 */
function gate06_stateNamesAreNouns(model) {
  const states = model.states;
  if (!states) return null;

  const verbPatterns = [
    /^is[A-Z]/,       // isLoading, isError
    /^has[A-Z]/,      // hasData
    /^fetch/,          // fetching, fetchData
    /ing$/,            // loading (but Loading is OK as adjective)
    /^on[A-Z]/,        // onClick, onOpen
  ];

  const badNames = [];
  for (const state of states) {
    const name = safeStr(state).replace(/\*$/, '');

    // Allow common valid state names even if they look like verbs
    const allowList = ['Loading', 'Opening', 'Closing', 'Entering', 'Exiting', 'Uploading', 'Downloading',
      'Searching', 'Validating', 'Submitting', 'Authenticating', 'Selecting', 'PendingOn', 'PendingOff',
      'LoadingMore', 'Refreshing', 'Restoring', 'Reconnecting', 'Deleting'];
    if (allowList.includes(name)) continue;

    for (const pattern of verbPatterns) {
      if (pattern.test(name)) {
        badNames.push(name);
        break;
      }
    }
  }

  if (badNames.length > 0) {
    return {
      gate: '06',
      name: 'State names are nouns or adjectives',
      problem: `State names look like verbs or booleans: ${badNames.join(', ')}. State names must describe what the user sees.`,
      fix: `Rename states to nouns or adjectives (e.g., "Loading" instead of "isLoading", "Success" instead of "fetching").`,
    };
  }
  return null;
}

/**
 * Gate 07 — Event names are past-tense or imperative verbs.
 */
function gate07_eventNamesAreVerbs(model) {
  const transitions = model.transitions;
  if (!transitions) return null;

  const badEvents = [];
  const seen = new Set();
  for (const t of transitions) {
    const event = safeStr(t.Event || t.event);
    if (!event || seen.has(event)) continue;
    seen.add(event);

    // Skip <done> (internal event)
    if (event.startsWith('<') && event.endsWith('>')) continue;

    // Check: should be SCREAMING_SNAKE_CASE or PascalCase
    const validPattern = /^[A-Z][A-Z_]*(?:_[A-Z_]+)*$/; // SUBMIT, FETCH_SUCCESS
    const validPascal = /^[A-Z][a-z]+$/; // Submit, Cancel

    if (!validPattern.test(event) && !validPascal.test(event)) {
      badEvents.push(event);
    }
  }

  if (badEvents.length > 0) {
    return {
      gate: '07',
      name: 'Event names are past-tense or imperative verbs',
      problem: `Event names may not follow conventions: ${badEvents.join(', ')}. Events should be past-tense (FETCH_SUCCESS) or imperative (SUBMIT, CANCEL).`,
      fix: `Use SCREAMING_SNAKE_CASE: past tense for responses (FETCH_SUCCESS) and imperative for user actions (SUBMIT, CANCEL, RETRY). Avoid gerunds (loading) or nouns (data).`,
    };
  }
  return null;
}

/**
 * Gate 08 — No unreachable states from initial.
 */
function gate08_noUnreachableStates(model) {
  const states = model.states;
  const transitions = model.transitions;
  if (!states || !transitions) return null;

  const initial = getInitialStateName(states);
  const graph = buildGraph(transitions);
  const reachable = new Set();
  const queue = [initial];
  while (queue.length > 0) {
    const current = queue.shift();
    if (reachable.has(current)) continue;
    reachable.add(current);
    const edges = graph.get(current) || [];
    for (const edge of edges) {
      queue.push(edge.to);
    }
  }

  const unreachable = states
    .map(s => safeStr(s).replace(/\*$/, ''))
    .filter(name => !reachable.has(name));

  if (unreachable.length > 0) {
    return {
      gate: '08',
      name: 'No unreachable states',
      problem: `States cannot be reached from initial state "${initial}": ${unreachable.join(', ')}.`,
      fix: `Add transitions from reachable states to "${unreachable.join('", "')}", or remove them. Trace the graph starting from "${initial}".`,
    };
  }
  return null;
}

/**
 * Gate 09 — No dead non-terminal states.
 * Every non-terminal state must have at least one outgoing transition.
 */
function gate09_noDeadNonTerminal(model) {
  const states = model.states;
  const transitions = model.transitions;
  if (!states || !transitions) return null;

  const terminalNames = new Set(
    states
      .filter(s => {
        const str = safeStr(s).toLowerCase();
        return str.includes('(terminal)') || str.includes('(t)');
      })
      .map(s => safeStr(s).replace(/\(terminal\)/i, '').replace(/\(t\)/i, '').trim())
  );

  const terminalKeywords = ['completed', 'end', 'endoflist', 'done', 'skipped', 'deletedpermanently'];
  for (const s of states) {
    const name = safeStr(s).replace(/\*$/, '').toLowerCase().replace(/\s/g, '');
    if (terminalKeywords.includes(name)) {
      terminalNames.add(safeStr(s).replace(/\*$/, ''));
    }
  }

  const outgoing = new Set();
  for (const t of transitions) {
    outgoing.add(safeStr(t.From || t.from));
  }

  const dead = states
    .map(s => safeStr(s).replace(/\*$/, ''))
    .filter(name => !terminalNames.has(name) && !outgoing.has(name));

  if (dead.length > 0) {
    return {
      gate: '09',
      name: 'No dead non-terminal states',
      problem: `Non-terminal states have no outgoing transitions: ${dead.join(', ')}. Users would be stuck in these states.`,
      fix: `Add outgoing transitions to "${dead.join('", "')}", or mark them as terminal with "(terminal)".`,
    };
  }
  return null;
}

/**
 * Gate 10 — No duplicate (state, event) pairs without guards.
 */
function gate10_noDuplicateEventPairs(model) {
  const transitions = model.transitions;
  if (!transitions) return null;

  const seen = new Map();
  for (const t of transitions) {
    const from = safeStr(t.From || t.from);
    const event = safeStr(t.Event || t.event);
    const key = `${from}::${event}`;

    if (seen.has(key)) {
      const prev = seen.get(key);
      const hasGuard = safeStr(t.Guard || t.guard || prev.Guard || prev.guard).trim();
      if (!hasGuard || hasGuard === '—' || hasGuard === '-') {
        return {
          gate: '10',
          name: 'No duplicate (state, event) pairs',
          problem: `Duplicate transition "${key}" with no guards to distinguish them. Non-deterministic.`,
          fix: `Add guards to distinguish the two "${event}" transitions from "${from}", or merge them into a single deterministic transition.`,
        };
      }
    } else {
      seen.set(key, t);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitialStateName(states) {
  if (!states || states.length === 0) return '';
  // First marked with * wins
  const marked = states.find(s => safeStr(s).includes('*'));
  if (marked) return safeStr(marked).replace(/\*$/, '');
  // Otherwise first state
  return safeStr(states[0]).replace(/\*$/, '');
}

function buildGraph(transitions) {
  const graph = new Map();
  for (const t of transitions) {
    const from = safeStr(t.From || t.from);
    const to = safeStr(t.To || t.to);
    if (!from || !to) continue;
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push({ event: safeStr(t.Event || t.event), to });
  }
  return graph;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

if (require.main === module) {
  main();
}

module.exports = { GATES };
