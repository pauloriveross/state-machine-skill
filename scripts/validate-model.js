#!/usr/bin/env node
/**
 * validate-model.js — Zero-dependency model validator.
 *
 * Usage:
 *   node scripts/validate-model.js model.json           # full output
 *   node scripts/validate-model.js model.json --light   # fast-track (skip warnings, compact)
 *
 * Checks gates 01–13 from references/slop-gates.md.
 * Exit code 0 = valid, 1 = invalid with list of failed gates.
 * Warnings are printed to stdout but do not cause exit code 1.
 * --light skips linguistic warnings and renders compact ASCII diagram.
 *
 * Auto-detects model format:
 *   - Flat: { states: [...], transitions: [...] }
 *   - Hierarchical (schema): { initial, states: { name: { type, on, ... } } }
 *
 * ── Module breakdown ──────────────────────────────────────────────────
 *  validateGraph   — structural pre-check: initial exists, targets exist (both formats)
 *  printResults    — consolidated output: warnings, ASCII diagram, pass/fail
 *  GATES[01..13]   — linguistic + graph gates on normalized flat model
 *  normalizeModel  — converts hierarchical → flat before gates run
 *  renderGraph     — ASCII state-machine diagram (ascii-viz.js)
 * ──────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');
const {
  analyzeStateName,
  analyzeEventName,
  SCORE_OK,
} = require('./linguistic-analyzer');
const { renderGraph } = require('./ascii-viz');

// ---------------------------------------------------------------------------
// Gate list
// ---------------------------------------------------------------------------

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
  gate11_actionsDeclared,
  gate12_transitionActionsExist,
  gate13_stateLifecycleActionsExist,
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const lightFlag = args.includes('--light');
  const filePath = args.find(a => !a.startsWith('--'));

  if (!filePath) {
    console.error('Usage: node scripts/validate-model.js model.json [--light]');
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
  const warnings = [];

  // Structural graph validation (pre-check on raw model before normalization)
  const graphErrors = validateGraph(model);
  for (const ge of graphErrors) {
    errors.push({
      gate: ge.gate || 'STRUCT',
      name: ge.name || 'Graph integrity',
      problem: ge.problem,
      fix: ge.fix,
    });
  }
  if (errors.length > 0) {
    printResults(errors, warnings, lightFlag, model, true);
  }

  // Normalize: detect schema (hierarchical) format and convert to flat format
  model = normalizeModel(model);

  for (const gate of GATES) {
    const result = gate(model, { warnings });
    if (result !== null) {
      errors.push(result);
    }
  }

  // Fast-track: skip warnings in light mode; skip diagram for large machines
  const isLarge = (model.states || []).length > 12 || (model.transitions || []).length > 25;

  if (!lightFlag) {
    if (warnings.length > 0) {
      console.log(`\n${warnings.length} linguistic warning(s):\n`);
      for (const w of warnings) {
        console.log(`  ⚠️  ${w}`);
      }
      console.log();
    }
  }

  printResults(errors, warnings, lightFlag, model);
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
 */
function gate03_exactly1Initial(model) {
  const states = model.states;
  if (!states || !Array.isArray(states)) return null;
  if (states.length === 0) return null;

  const initials = states.filter(s => {
    if (s == null) return false;
    if (typeof s === 'object') return String(s.name).includes('*');
    return safeStr(s).endsWith('*');
  });
  if (initials.length > 1) {
    const labels = initials.map(getStateLabel).join(', ');
    return {
      gate: '03',
      name: 'Exactly 1 initial state',
      problem: `Found ${initials.length} states marked with *: ${labels}. Only one initial state allowed.`,
      fix: 'Remove the * marker from all but one state. The initial state is the first entry in the states array.',
    };
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
    const name = getStateName(state);
    if (!name || name === initialName) continue;
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
 */
function gate05_terminalOrCycle(model) {
  const states = model.states;
  const transitions = model.transitions;
  if (!states || !transitions) return null;

  const hasTerminal = states.some(isTerminalState);
  if (hasTerminal) return null;

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
 * Gate 06 — State names are nouns or adjectives (score-based).
 * Names scoring >= SCORE_OK produce warnings instead of errors.
 */
function gate06_stateNamesAreNouns(model, { warnings }) {
  const states = model.states;
  if (!states) return null;

  const badNames = [];

  for (const state of states) {
    const fullName = getStateName(state);
    if (!fullName) continue;
    // For compound names (e.g., "Unauthenticated.Authenticating"), analyze the leaf
    const leafName = fullName.includes('.') ? fullName.split('.').pop() : fullName;

    const { score, warnings: nameWarnings } = analyzeStateName(leafName);

    for (const w of nameWarnings) {
      if (score >= SCORE_OK) {
        warnings.push(`[Gate 06 / ${fullName}] ${w}`);
      }
    }

    if (score < SCORE_OK) {
      badNames.push({ name: fullName, score });
    }
  }

  if (badNames.length > 0) {
    const detail = badNames.map(n => `"${n.name}" (score: ${n.score})`).join(', ');
    return {
      gate: '06',
      name: 'State names are nouns or adjectives',
      problem: `State names look like verbs or booleans: ${detail}. State names must describe what the user sees.`,
      fix: 'Rename states to nouns or adjectives (e.g., "Loading" instead of "isLoading", "Success" instead of "fetching").',
    };
  }
  return null;
}

/**
 * Gate 07 — Event names are past-tense or imperative verbs (score-based).
 * Names scoring >= SCORE_OK produce warnings instead of errors.
 */
function gate07_eventNamesAreVerbs(model, { warnings }) {
  const transitions = model.transitions;
  if (!transitions) return null;

  const badEvents = [];
  const seen = new Set();

  for (const t of transitions) {
    const event = safeStr(t.Event || t.event);
    if (!event || seen.has(event)) continue;
    seen.add(event);

    const { score, warnings: nameWarnings } = analyzeEventName(event);

    for (const w of nameWarnings) {
      if (score >= SCORE_OK) {
        warnings.push(`[Gate 07 / ${event}] ${w}`);
      }
    }

    if (score < SCORE_OK) {
      badEvents.push({ name: event, score });
    }
  }

  if (badEvents.length > 0) {
    const detail = badEvents.map(e => `"${e.name}" (score: ${e.score})`).join(', ');
    return {
      gate: '07',
      name: 'Event names are past-tense or imperative verbs',
      problem: `Event names may not follow conventions: ${detail}. Events should be past-tense (FETCH_SUCCESS) or imperative (SUBMIT, CANCEL).`,
      fix: 'Use SCREAMING_SNAKE_CASE: past tense for responses (FETCH_SUCCESS) and imperative for user actions (SUBMIT, CANCEL, RETRY). Avoid gerunds (loading) or nouns (data).',
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
    .map(s => getStateName(s))
    .filter(name => name && !reachable.has(name));

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
 */
function gate09_noDeadNonTerminal(model) {
  const states = model.states;
  const transitions = model.transitions;
  if (!states || !transitions) return null;

  const terminalNames = new Set(
    states.filter(isTerminalState).map(s => getStateName(s))
  );

  const outgoing = new Set();
  for (const t of transitions) {
    outgoing.add(safeStr(t.From || t.from));
  }

  const dead = states
    .map(s => getStateName(s))
    .filter(name => name && !terminalNames.has(name) && !outgoing.has(name));

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
      if (!hasGuard || hasGuard === '\u2014' || hasGuard === '-') {
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

/**
 * Gate 11 — Actions node is declared and well-structured.
 */
function gate11_actionsDeclared(model, { warnings }) {
  const actions = model.actions || model.effects;
  if (!actions) {
    warnings.push('[Gate 11] No "actions" or "effects" node found. Models should declare all side effects in a top-level "actions" node.');
    return null;
  }

  if (Array.isArray(actions)) {
    const invalid = actions.filter(a => {
      if (a == null) return true;
      if (typeof a === 'string') return false;
      if (typeof a === 'object' && safeStr(a.name).trim()) return false;
      return true;
    });
    if (invalid.length > 0) {
      return {
        gate: '11',
        name: 'Actions node structure',
        problem: `${invalid.length} action(s) in the array are invalid. Each must be a string (action name) or an object with a "name" property.`,
        fix: 'Ensure every entry in the "actions" array is either a string name or an object { name, description, async }.',
      };
    }
    return null;
  }

  if (typeof actions === 'object' && actions !== null) {
    const keys = Object.keys(actions);
    if (keys.length === 0) {
      warnings.push('[Gate 11] "actions" object is empty. Either add at least one action or omit the node.');
      return null;
    }
    for (const key of keys) {
      if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
        return {
          gate: '11',
          name: 'Actions node structure',
          problem: `Action key "${key}" is not a valid JavaScript identifier. Action names must be valid camelCase identifiers.`,
          fix: `Rename "${key}" to a camelCase name (e.g., "onOpen", "fetchData").`,
        };
      }
    }
    return null;
  }

  return {
    gate: '11',
    name: 'Actions node structure',
    problem: '"actions" must be an array of strings/objects or an object map of name → descriptor.',
    fix: 'Restructure the "actions" node as either an array of action names or an object map with action names as keys.',
  };
}

/**
 * Gate 12 — Transition actions reference declared actions.
 * Extracts action names from the transition Actions column and checks
 * at least one parsed name matches a declared action.
 * Non-matching words (e.g., "callback", "function") are treated as
 * descriptive noise and do not trigger errors.
 */
function gate12_transitionActionsExist(model) {
  const transitions = model.transitions;
  const actions = model.actions || model.effects;
  if (!transitions || !actions) return null;

  const actionNames = Array.isArray(actions)
    ? new Set(actions.map(a => (typeof a === 'object' ? safeStr(a.name) : safeStr(a))).filter(Boolean))
    : new Set(Object.keys(actions));

  if (actionNames.size === 0) return null;

  const noMatch = [];

  for (const t of transitions) {
    const actionsField = safeStr(t.Actions || t.actions);
    const parsed = parseActionsField(actionsField);
    if (parsed.length === 0) continue;
    const matched = parsed.filter(n => actionNames.has(n));
    if (matched.length === 0) {
      noMatch.push({ from: safeStr(t.From || t.from), event: safeStr(t.Event || t.event), names: parsed });
    }
  }

  if (noMatch.length > 0) {
    const detail = noMatch.map(m => `transition ${m.from} → ${m.event} mentions [${m.names.join(', ')}]`).join('; ');
    return {
      gate: '12',
      name: 'Transition actions reference declared actions',
      problem: `Transition Actions column values do not match any declared action: ${detail}.`,
      fix: `Either add the missing action(s) to the "actions" node, or correct the transition Actions column to use declared action names.`,
    };
  }
  return null;
}

/**
 * Gate 13 — State onEnter/onExit actions reference declared actions.
 */
function gate13_stateLifecycleActionsExist(model) {
  const states = model.states;
  const actions = model.actions || model.effects;
  if (!states || !actions) return null;

  const actionNames = Array.isArray(actions)
    ? new Set(actions.map(a => (typeof a === 'object' ? safeStr(a.name) : safeStr(a))).filter(Boolean))
    : new Set(Object.keys(actions));

  if (actionNames.size === 0) return null;

  const missing = [];

  for (const state of states) {
    if (state == null || typeof state !== 'object') continue;
    const sName = getStateName(state);
    const enters = getStateOnEnterList(state);
    const exits = getStateOnExitList(state);
    for (const name of enters) {
      if (!actionNames.has(name)) {
        missing.push({ state: sName, lifecycle: 'onEnter', name });
      }
    }
    for (const name of exits) {
      if (!actionNames.has(name)) {
        missing.push({ state: sName, lifecycle: 'onExit', name });
      }
    }
  }

  if (missing.length > 0) {
    const detail = missing.map(m => `"${m.name}" (${m.lifecycle}) of state "${m.state}"`).join(', ');
    return {
      gate: '13',
      name: 'State lifecycle actions reference declared actions',
      problem: `State onEnter/onExit references names not in "actions" node: ${detail}.`,
      fix: `Add the missing action(s) to the "actions" node, or correct the state's onEnter/onExit to use declared action names.`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStateName(s) {
  if (s == null) return '';
  if (typeof s === 'object') return safeStr(s.name).replace(/\*$/, '').replace(/\(terminal\)/i, '').replace(/\(t\)/i, '').trim();
  return safeStr(s).replace(/\*$/, '').replace(/\(terminal\)/i, '').replace(/\(t\)/i, '').trim();
}

function getStateLabel(s) {
  if (s == null) return '';
  if (typeof s === 'object') return safeStr(s.name);
  return safeStr(s);
}

function isTerminalState(s) {
  if (s == null) return false;
  const type = s.type;
  if (type === 'final') return true;
  const str = typeof s === 'object' ? safeStr(s.name) : safeStr(s);
  const lower = str.toLowerCase();
  if (lower.includes('terminal') || lower.includes('(t)')) return true;
  const keywords = ['completed', 'end', 'endoflist', 'done', 'skipped', 'deletedpermanently'];
  return keywords.includes(lower.replace(/\s/g, ''));
}

function getStateOnEnter(s) {
  if (s == null || typeof s !== 'object') return null;
  return s.onEnter || null;
}

function getStateOnExit(s) {
  if (s == null || typeof s !== 'object') return null;
  return s.onExit || null;
}

function getStateOnEnterList(s) {
  if (s == null || typeof s !== 'object') return [];
  const v = s.onEnter;
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function getStateOnExitList(s) {
  if (s == null || typeof s !== 'object') return [];
  const v = s.onExit;
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function getInitialStateName(states) {
  if (!states || states.length === 0) return '';
  const marked = states.find(s => {
    if (s == null) return false;
    if (typeof s === 'object') return String(s.name).includes('*');
    return safeStr(s).includes('*');
  });
  if (marked) return getStateName(marked);
  return getStateName(states[0]);
}

/**
 * Parse the Actions column of a transition row into an array of action name strings.
 * Handles "fetchData()", "onOpen callback", "setData(r)", comma-separated lists.
 */
function parseActionsField(text) {
  if (!text || !safeStr(text).trim()) return [];
  const str = safeStr(text).trim();
  if (str === '\u2014' || str === '-') return [];
  const tokens = str.split(/[\s,;]+/);
  return tokens
    .map(t => t.replace(/[()]/g, '').trim())
    .filter(t => t.length > 0 && /^[a-zA-Z_]/.test(t));
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
// Schema normalizer — converts hierarchical (XState/schema) → flat format
// ---------------------------------------------------------------------------

function normalizeModel(model) {
  // Already flat format — nothing to do
  if (model.states && Array.isArray(model.states)) return model;

  // Not hierarchical format either — pass through
  if (!model.states || typeof model.states !== 'object' || Array.isArray(model.states)) {
    return model;
  }

  // Hierarchical format: model.states is a Record<name, StateDef>
  const flatStates = [];
  const flatTransitions = [];
  const allActions = new Set();
  const id = model.id || 'unnamed';

  function walkState(name, def, prefix) {
    const fullName = prefix ? `${prefix}.${name}` : name;
    const type = def.type || 'atomic';

    // Collect lifecycle actions
    if (def.onEnter) {
      const arr = Array.isArray(def.onEnter) ? def.onEnter : [def.onEnter];
      arr.forEach(a => allActions.add(a));
    }
    if (def.onExit) {
      const arr = Array.isArray(def.onExit) ? def.onExit : [def.onExit];
      arr.forEach(a => allActions.add(a));
    }

    // Process nested compound states FIRST — parent containers skip the flat list
    const hasChildren = def.states && typeof def.states === 'object' && Object.keys(def.states).length > 0;

    if (hasChildren) {
      for (const [childName, childDef] of Object.entries(def.states)) {
        walkState(childName, childDef, fullName);
      }
    } else {
      // Leaf state — add to flat states list
      flatStates.push({
        name: fullName,
        type: type === 'final' ? 'final' : undefined,
        onEnter: def.onEnter,
        onExit: def.onExit,
      });
    }

    // Process transitions from 'on' events on this state
    if (def.on && typeof def.on === 'object') {
      for (const [event, handler] of Object.entries(def.on)) {
        if (!handler || typeof handler !== 'object') continue;
        const target = handler.target || handler.target;
        if (!target) continue;

        let resolvedTarget = target.startsWith('#') ? target.slice(1) : (prefix ? `${prefix}.${target}` : target);
        // Strip machine-id segment from cross-hierarchy refs (#machineId.State.SubState → State.SubState)
        if (target.startsWith('#') && resolvedTarget.startsWith(id + '.')) {
          resolvedTarget = resolvedTarget.slice(id.length + 1);
        }
        const transition = {
          From: fullName,
          Event: event,
          To: resolvedTarget,
        };

        if (handler.guards && Array.isArray(handler.guards)) {
          transition.Guard = handler.guards.join(', ');
        }

        if (handler.actions && Array.isArray(handler.actions)) {
          transition.Actions = handler.actions.join(', ');
          handler.actions.forEach(a => allActions.add(a));
        }

        flatTransitions.push(transition);
      }
    }
  }

  // Walk all top-level states
  for (const [name, def] of Object.entries(model.states)) {
    walkState(name, def, '');
  }

  // Resolve initial: follow compound initial chains to find leaf state
  function resolveInitial(stateName, statesDef) {
    if (!statesDef || !statesDef[stateName]) return stateName;
    const def = statesDef[stateName];
    if (def.states && typeof def.states === 'object' && def.initial) {
      return resolveInitial(`${stateName}.${def.initial}`, { [def.initial]: def.states[def.initial] });
    }
    const segments = stateName.split('.');
    let current = { ...model.states };
    for (let i = 0; i < segments.length - 1; i++) {
      current = current[segments[i]]?.states || {};
    }
    const lastDef = current[segments[segments.length - 1]];
    if (lastDef && lastDef.states && typeof lastDef.states === 'object' && lastDef.initial) {
      return resolveInitial(`${stateName}.${lastDef.initial}`, lastDef.states);
    }
    return stateName;
  }

  const initialName = model.initial
    ? resolveInitial(model.initial, model.states)
    : (flatStates.length > 0 ? flatStates[0].name : '');
  for (const s of flatStates) {
    if (s.name === initialName) {
      s.name = s.name + '*';
      break;
    }
  }

  // Build actions node from collected action names
  const actions = {};
  if (allActions.size > 0) {
    // Also copy any existing actions meta from the original model
    if (model.actions && typeof model.actions === 'object' && !Array.isArray(model.actions)) {
      for (const key of Object.keys(model.actions)) {
        actions[key] = model.actions[key];
      }
    }
    for (const name of allActions) {
      if (!actions[name]) {
        actions[name] = { description: `Auto-detected from schema: ${name}`, async: false };
      }
    }
  }

  return {
    name: id,
    states: flatStates,
    transitions: flatTransitions,
    actions: Object.keys(actions).length > 0 ? actions : undefined,
  };
}

// ---------------------------------------------------------------------------
// Print results
// ---------------------------------------------------------------------------

function printResults(errors, warnings, lightFlag, model, earlyExit) {
  const isLarge = model && (model.states || []).length > 12 || (model.transitions || []).length > 25;

  if (!lightFlag) {
    if (warnings.length > 0) {
      console.log(`\n${warnings.length} linguistic warning(s):\n`);
      for (const w of warnings) {
        console.log(`  ⚠️  ${w}`);
      }
      console.log();
    }
  }

  if (errors.length === 0) {
    if (!isLarge && !earlyExit) {
      try {
        const viz = renderGraph(model, { light: true, header: true });
        if (!lightFlag || (model.states || []).length <= 6) {
          console.log(viz);
          console.log();
        }
      } catch (_) { /* viz optional */ }
    }
    console.log(`✅ All ${GATES.length} gates passed.`);
    process.exit(0);
  }

  console.error(`❌ ${errors.length} gate(s) failed:\n`);
  for (const err of errors) {
    console.error(`   Gate ${err.gate}: ${err.name}`);
    console.error(`   Problem: ${err.problem}`);
    console.error(`   Fix: ${err.fix}`);
    console.error();
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Graph structural validator — pre-check on raw model
// ---------------------------------------------------------------------------

function validateGraph(model) {
  const found = [];

  // --- Hierarchical format (schema) ---
  if (model.states && typeof model.states === 'object' && !Array.isArray(model.states)) {
    const stateNames = Object.keys(model.states);

    // Initial state must exist
    if (model.initial && !stateNames.includes(model.initial)) {
      found.push({
        gate: '02',
        name: 'Initial state exists',
        problem: `Initial state "${model.initial}" is not defined in the states object.`,
        fix: `Add a state named "${model.initial}" to the "states" object, or change "initial" to one of: ${stateNames.join(', ')}.`,
      });
    }

    // Every transition target must exist
    for (const [stateName, stateDef] of Object.entries(model.states)) {
      if (!stateDef.on || typeof stateDef.on !== 'object') continue;
      for (const [eventName, handler] of Object.entries(stateDef.on)) {
        if (!handler || typeof handler !== 'object') continue;
        const target = handler.target;
        if (!target) continue;

        // Resolve #ref and compound paths
        const cleanTarget = target.replace(/^#/, '');
        const targetSegments = cleanTarget.split('.');

        // Skip machine-id segment for cross-hierarchy refs (#machineId.State.SubState)
        let targetRoot = targetSegments[0];
        if (targetSegments.length > 1 && !stateNames.includes(targetRoot) && targetRoot === model.id) {
          targetRoot = targetSegments[1];
        } else if (targetSegments.length > 1 && !stateNames.includes(targetRoot)) {
          // if first segment isn't a state, try the second (could be implicit machine id)
          targetRoot = targetSegments[1];
        }

        if (!stateNames.includes(targetRoot)) {
          found.push({
            gate: '05',
            name: 'Transition target exists',
            problem: `Transition "${stateName}" → "${eventName}" targets "${target}", but "${targetRoot}" is not a defined state.`,
            fix: `Define state "${targetRoot}" in the "states" object, or correct the target to one of: ${stateNames.join(', ')}.`,
          });
        }
      }
    }

    return found;
  }

  // --- Flat format ---
  if (model.states && Array.isArray(model.states)) {
    const stateNames = new Set();
    const getFlatName = s => {
      if (s == null) return '';
      if (typeof s === 'object') return (s.name || '').replace(/\*$/, '').replace(/\(terminal\)/i, '').trim();
      return String(s).replace(/\*$/, '').replace(/\(terminal\)/i, '').trim();
    };
    for (const s of model.states) {
      const n = getFlatName(s);
      if (n) stateNames.add(n);
    }

    const transitions = model.transitions || [];
    for (let i = 0; i < transitions.length; i++) {
      const t = transitions[i];
      const from = String(t.From || t.from || '');
      const to = String(t.To || t.to || '');
      if (from && to && !stateNames.has(to)) {
        found.push({
          gate: '05',
          name: 'Transition target exists',
          problem: `Transition #${i + 1}: "${from}" → "${to}" targets "${to}", which is not a defined state.`,
          fix: `Define state "${to}" in the "states" array, or correct the transition target.`,
        });
      }
    }

    return found;
  }

  return found;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

if (require.main === module) {
  main();
}

module.exports = { GATES, normalizeModel };
