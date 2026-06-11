---
name: state-machine
description: >
  Model UI component behavior as FSMs before writing code. Verbs:
  `model` (FSM from description), `implement` (code from model),
  `audit` (detect impossible states in existing code). Framework-agnostic,
  XState v5 compatible. Eliminates impossible states at design time.
version: 1.1.0
---

# state-machine Skill

Model before you build. Every UI bug is a state you never modeled.

## Verbs

| Verb | Input → Output | When |
|------|---------------|------|
| `model` | NL description → FSM (states, transitions, guards, actions, diagram, invariants) | Before writing any code |
| `implement` | NL / existing model → code + tests + embedded model comment | Ready to generate production code |
| `audit` | File path → reconstructed model + impossible state analysis + punch list | Debugging or inheriting existing code |

## Protocol

1. **Load**: `references/verb-dispatch.md` (output format) + component pattern from `references/component-patterns.md` + applicable gates from `references/slop-gates.md` (1–13 model, 1–23 implement, 24–38 audit) + framework adapter from `references/framework-adapters.md` (implement only)
2. **Run all applicable gates** before emitting output
3. **If any gate fails**: stop, report gate number + problem + fix, do not proceed
4. **Fast-track**: `node scripts/validate-model.js model.json --light` skips linguistic warnings, keeps ASCII diagram for ≤6 states

## Reference Library

| File | Contents |
|------|----------|
| `references/verb-dispatch.md` | Exact output format for each verb |
| `references/component-patterns.md` | 12 reusable patterns (modal, form, toggle, auth, etc.) |
| `references/impossible-states.md` | 35 anti-patterns with elimination strategies |
| `references/slop-gates.md` | 38 validation gates (model 1–13, code 14–23, audit 24–38) |
| `references/framework-adapters.md` | useMachine(config, implementations) for React/Vue/Svelte/Vanilla |
| `references/xstate-compat.md` | XState v5 mapping |
| `references/state-theory.md` | FSM/HFSM theory applied to UI |
| `examples/` | modal.md, toggle-async.md, multistep-form.md, auth-flow.md |

## Validation

```bash
node scripts/validate-model.js path/to/model.json        # full check + ASCII diagram
node scripts/validate-model.js path/to/model.json --light # fast-track (compact)
node scripts/ascii-viz.js path/to/model.json              # diagram only
```

## Output Formats (see `references/verb-dispatch.md`)

- **model**: States, Transitions, Guards, Actions, ASCII Diagram, Invariants, ✅ Gates 1–13
- **implement**: Model recap, component code, tests, ✅ Gates 1–23
- **audit**: Reconstructed model, impossible states, unhandled transitions, severity punch list, ✅ Gates 24–38

---

*state-machine — model before you build.*
