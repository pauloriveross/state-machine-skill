#!/usr/bin/env node
/**
 * ascii-viz.js — Draw ASCII transition diagrams from model JSON.
 *
 * Usage:
 *   node scripts/ascii-viz.js path/to/model.json
 *   node scripts/ascii-viz.js path/to/model.json --light
 *
 * Exports renderGraph(model) for programmatic use.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStateName(s) {
  if (s == null) return '';
  if (typeof s === 'object') return (s.name || '').replace(/\*$/, '').trim();
  return String(s).replace(/\*$/, '').trim();
}

function getStateLabel(s) {
  if (s == null) return '';
  if (typeof s === 'object') return s.name || '';
  return String(s);
}

function isInitial(s, states) {
  if (s == null) return false;
  const raw = typeof s === 'object' ? s.name : String(s);
  if (raw.includes('*')) return true;
  if (states && states.length > 0 && getStateName(s) === getStateName(states[0])) return true;
  return false;
}

function safeStr(v) {
  return v == null ? '' : String(v);
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

function buildGraph(model) {
  const states = model.states || [];
  const transitions = model.transitions || [];
  const graph = new Map();
  const allStateNames = new Set(states.map(getStateName).filter(Boolean));

  for (const t of transitions) {
    const from = safeStr(t.From || t.from);
    const to = safeStr(t.To || t.to);
    const event = safeStr(t.Event || t.event);
    if (!from || !to) continue;
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push({ event, to });
  }

  return { graph, allStateNames };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

/**
 * Compact tree render: one line per root-branch path.
 */
function renderCompact(model) {
  const s = model.states || [];
  const { graph } = buildGraph(model);
  const initial = getStateName(s.find(st => isInitial(st, s)) || s[0] || '');

  const lines = [];
  const visited = new Set();

  function walk(from, prefix, isLast) {
    const label = from + (visited.has(from) ? ' (cycle)' : '');
    lines.push(prefix + (isLast ? '└── ' : '├── ') + label);
    if (visited.has(from)) return;
    visited.add(from);
    const edges = graph.get(from) || [];

    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const conn = i === edges.length - 1 ? '└── ' : '├── ';
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      // Draw event label
      lines.push(childPrefix + conn + '[' + e.event + ']');
      walk(e.to, childPrefix + (i === edges.length - 1 ? '    ' : '│   '), i === edges.length - 1);
    }
  }

  lines.push('── ' + initial);
  const edges = graph.get(initial) || [];
  for (let i = 0; i < edges.length; i++) {
    const prefix = i === edges.length - 1 ? '└── ' : '├── ';
    lines.push('  ' + prefix + '[' + edges[i].event + ']');
    walk(edges[i].to, '  ' + (i === edges.length - 1 ? '    ' : '│   '), i === edges.length - 1);
  }

  return lines.join('\n');
}

/**
 * Flow render: sequential arrows between states.
 */
function renderFlow(model) {
  const s = model.states || [];
  const { graph } = buildGraph(model);
  const initial = getStateName(s.find(st => isInitial(st, s)) || s[0] || '');

  const lines = [];
  const visited = new Set();
  const terminalKeywords = ['completed', 'done', 'end', 'terminal'];

  function walk(from, depth) {
    if (visited.has(from)) return;
    visited.add(from);
    const edges = graph.get(from) || [];
    if (edges.length === 0) {
      const isTerminal = terminalKeywords.some(k => from.toLowerCase().includes(k));
      lines.push('  '.repeat(depth) + '◉ ' + from + (isTerminal ? ' [terminal]' : ''));
      return;
    }
    if (edges.length === 1 && from === edges[0].to) {
      lines.push('  '.repeat(depth) + '◉ ' + from + ' ──[' + edges[0].event + ']──→ (self)');
      return;
    }
    if (edges.length === 1) {
      lines.push('  '.repeat(depth) + '◉ ' + from + ' ──[' + edges[0].event + ']──→');
      walk(edges[0].to, depth + 1);
      return;
    }
    lines.push('  '.repeat(depth) + '◉ ' + from);
    for (const e of edges) {
      lines.push('  '.repeat(depth + 1) + '├──[' + e.event + ']──→ ' + e.to + (visited.has(e.to) ? ' (cycle)' : ''));
    }
    for (const e of edges) {
      if (!visited.has(e.to)) walk(e.to, depth + 1);
    }
  }

  walk(initial, 0);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function renderGraph(model, opts = {}) {
  const mode = opts.light ? 'flow' : 'compact';
  const header = opts.header !== false;
  const output = [];

  if (header) {
    const states = (model.states || []).map(s => getStateLabel(s)).join(', ');
    const transitionCount = (model.transitions || []).length;
    output.push('─'.repeat(40));
    output.push('  State Machine: ' + (model.name || 'unnamed'));
    output.push('  States: ' + states);
    output.push('  Transitions: ' + transitionCount);
    output.push('─'.repeat(40));
    output.push('');
  }

  const diagram = mode === 'compact' ? renderCompact(model) : renderFlow(model);
  output.push(diagram);

  return output.join('\n');
}

function main() {
  const filePath = process.argv[2];
  const lightFlag = process.argv.includes('--light');

  if (!filePath) {
    console.error('Usage: node scripts/ascii-viz.js path/to/model.json [--light]');
    process.exit(1);
  }

  let model;
  try {
    const fs = require('fs');
    const path = require('path');
    model = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf-8'));
  } catch (err) {
    console.error('Error reading model:', err.message);
    process.exit(1);
  }

  console.log(renderGraph(model, { light: lightFlag }));
}

if (require.main === module) {
  main();
}

module.exports = { renderGraph };
