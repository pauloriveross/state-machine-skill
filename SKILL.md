---
name: state-machine
description: >
  Model UI component behavior as finite state machines before writing
  implementation code. Use when building components with multiple states
  (modals, forms, wizards, toggles, auth flows, file uploads). Verbs:
  `model` (FSM from description), `implement` (code from model),
  `audit` (detect impossible states in existing code). Eliminates
  impossible states before they exist. XState v5 compatible.
  Framework-agnostic.
version: 1.0.0
---

# state-machine Skill

> Model UI behavior as finite state machines *before* writing implementation code.
> Compatible with Claude Code, Cursor, Windsurf, OpenCode, and any AI coding agent.

## Philosophy

UI bugs are not random — they are states the developer never modeled. Every time a modal shows a spinner over content, a form submits with invalid data, or a toggle displays the wrong value, the root cause is the same: the component was in a combination of boolean flags that was never intended. This skill eliminates that class of bug entirely by replacing ad-hoc boolean logic with a formal finite state machine *before* a single line of implementation is written.

The skill is agnostic: it works with any framework (React, Vue, Svelte, Vanilla) and any state library (XState v5, Zustand, useReducer, reactive()). The output is always the same: a provably-correct state model expressed as states, transitions, guards, and actions. Code is derived from the model, not the other way around. If a behavior is not in the model, it cannot appear in the component.

## Verbs

| Verb | Input | Output | When to use |
|------|-------|--------|-------------|
| `model` | Natural-language behavior description | Formal FSM model: states, transitions, guards, actions, ASCII diagram, invariants | Before writing any code. Validate your understanding of the component. |
| `implement` | Natural-language description (or existing model from same conversation) | Model + component code + unit tests + embedded model comment | When you are ready to generate production code from a validated model. |
| `audit` | File path or code snippet | Reconstructed model + impossible state analysis + unhandled transitions + severity-ranked punch list | When you inherit a component, are debugging a bug, or want to validate an existing implementation. |

## Decision flow — which verb to use

```
You have a new component to build?
  ├─ Yes, and I want to think through states first
  │   └─ Use: model "<behavior description>"
  ├─ Yes, and I want code directly
  │   └─ Use: implement <framework> "<behavior description>"
  │
You have existing code that might have impossible states?
  ├─ Yes, paste a file or snippet
  │   └─ Use: audit <path or snippet>
  │
You already have a model from this session and want code?
  └─ Use: implement <framework>
```

## Reference loading protocol

Before processing any request, the agent MUST:

1. **Load** `references/verb-dispatch.md` to get the exact output format for the requested verb
2. **Load** the relevant component pattern from `references/component-patterns.md` that matches the requested behavior
3. **Load** `references/slop-gates.md` and determine which gates apply (1–10 for model, 1–20 for implement, 21–35 for audit)
4. **Load** the relevant framework adapter from `references/framework-adapters.md` if implementation code is requested

## Gate protocol

Before emitting ANY output, the agent MUST:

1. **Run all applicable gates** from `references/slop-gates.md` against the model or code
2. If ANY gate fails: stop immediately, report the failure with the gate number, problem description, and fix instructions
3. Do not proceed past a failed gate until the issue is resolved
4. Only emit output when all applicable gates pass

## Output format

### model output

```
## Model: <component name>

### States
...

### Transitions
...

### Guards
...

### Actions
...

### Diagram
...
(ASCII state diagram)

### Invariants
...
(what the component MUST NEVER / MUST ALWAYS do)

### Gate results
✅ All gates 1–10 passed.
```

### implement output

```
## Implementation: <component name>

### Model recap
... (states, transitions, guards, actions)

### File: <filename>
... (embedded model comment + component code)

### File: <filename>.test
... (unit tests)

### Warnings
... (if any)

### Gate results
✅ All gates 1–20 passed.
```

### audit output

```
## Audit: <component name>

### Reconstructed model
...

### Impossible state analysis
...

### Unhandled transitions
...

### Punch list (sorted by severity)
...

### Conversion offer
...

### Gate results
✅ All gates 21–35 passed.
```

## Reference library

| Document | Contents |
|----------|----------|
| `references/state-theory.md` | FSM, HFSM, statechart theory applied to UI |
| `references/component-patterns.md` | 12 reusable patterns: modal, form, wizard, toggle, auth, etc. |
| `references/impossible-states.md` | 35 anti-patterns with elimination strategies |
| `references/xstate-compat.md` | Mapping to XState v5 `setup()` and `createMachine()` |
| `references/framework-adapters.md` | React (`useReducer`), Vue (`reactive`), Svelte (`writable`), vanilla |
| `references/verb-dispatch.md` | Full instructions for `model`, `implement`, `audit` verbs |
| `references/slop-gates.md` | 35 validation gates every model must pass |

## Examples

| File | Component | Key technique |
|------|-----------|---------------|
| `examples/modal.md` | Modal with async loading | Guarded transitions, parallel substates |
| `examples/multistep-form.md` | Multi-step registration form | Compound states, history transitions |
| `examples/toggle-async.md` | Toggle with optimistic update | Race condition prevention via state checks |
| `examples/auth-flow.md` | Login/signup with error handling | Orthogonal regions, persistent context |

## Validation script

```bash
node scripts/validate-model.js path/to/model.json
```

## Contract

**This skill guarantees:** every generated component cannot enter a state that was not explicitly modeled. If a transition fires for an unhandled event, the component remains in its current state (fail-safe) or raises a structured error (fail-fast). No undefined states. No ghost transitions.

---

*state-machine — model before you build.*
