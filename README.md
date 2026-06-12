<div align="center">

# 🔄 state-machine

**Model UI behavior before you code it. Eliminate impossible states before they exist.**

[![npm version](https://img.shields.io/npm/v/state-machine-skill?label=1.2.2)](https://www.npmjs.com/package/state-machine-skill)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Works with Claude Code](https://img.shields.io/badge/Claude%20Code-ready-7C3AED)](https://claude.ai)
[![Works with Cursor](https://img.shields.io/badge/Cursor-ready-000000)](https://cursor.com)
[![Works with Windsurf](https://img.shields.io/badge/Windsurf-ready-2563EB)](https://codeium.com/windsurf)
[![Works with OpenCode](https://img.shields.io/badge/OpenCode-ready-22C55E)](https://opencode.ai)

Compatible with **Claude Code** · **Cursor** · **Windsurf** · **OpenCode** · Any AI coding agent

</div>

---

## The problem: boolean explosion

Three booleans. Eight possible states. Five of them impossible.

```tsx
// ❌ The boolean trap — 3 flags = 8 combinations
const [isLoading, setIsLoading] = useState(false);
const [isError, setIsError] = useState(false);
const [isSuccess, setIsSuccess] = useState(false);
```

| isLoading | isError | isSuccess | Result |
|-----------|---------|-----------|--------|
| ❌ | ❌ | ❌ | `Idle` — valid |
| ✅ | ❌ | ❌ | `Loading` — valid |
| ❌ | ✅ | ❌ | `Error` — valid |
| ❌ | ❌ | ✅ | `Success` — valid |
| ✅ | ✅ | ❌ | **IMPOSSIBLE** — loading and erroring at once |
| ✅ | ❌ | ✅ | **IMPOSSIBLE** — loading and succeeded at once |
| ❌ | ✅ | ✅ | **IMPOSSIBLE** — error and success at once |
| ✅ | ✅ | ✅ | **IMPOSSIBLE** — all three at once |

Every impossible state is a bug waiting to happen. A race condition, a missed state reset,
a late network response — and your UI shows a spinner over content, or an error message
over a success view.

**This is the single most common source of UI bugs in modern frontend code.**

---

## The solution: model first, code second

Replace ad-hoc booleans with a formal finite state machine. The state alphabet defines exactly
which states exist. Everything else is structurally impossible.

```tsx
// ✅ The state machine approach — 4 states, all valid
type State = 'Idle' | 'Loading' | 'Success' | 'Error';
const [state, setState] = useState<State>('Idle');
```

```
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌──────────┐
│ Describe │────>│ Model it  │────>│ Validate   │────>│ Generate │
│ behavior │     │ (states,  │     │ (38 gates) │     │ code     │
│ in NL    │     │ events)   │     │            │     │          │
└──────────┘     └───────────┘     └────────────┘     └──────────┘
```

The model comes first. Code is derived from it, not the other way around.

---

## Three verbs. One guarantee.

| Verb | Input | Output |
|------|-------|--------|
| `state-machine model "..."` | Natural-language description | Formal FSM: states, transitions, guards, actions, ASCII diagram, invariants |
| `state-machine implement <framework>` | Model (from current session) | Production component code + unit tests + embedded model comment |
| `state-machine audit <path>` | Existing component code | Reconstructed model + impossible state analysis + ranked punch list |

**Every component carries a guarantee:**

```tsx
/* state-machine: Closed|Opening|Loading|Success|Error|Closing : TRIGGER|<done>|FETCH_SUCCESS|FETCH_ERROR|CLOSE|RETRY */
```

This component **cannot** enter a state that was not explicitly modeled.

---

## Install

| Agent | Command |
|-------|---------|
| **Any agent** | `npx skills add pauloriveross/state-machine-skill` |
| **Claude Code** | `npx skills add pauloriveross/state-machine-skill` — installs to `~/.claude/skills/state-machine/` |
| **Cursor** | Copy `SKILL.md` body → `.cursor/rules/state-machine.mdc`, references → `.cursor/rules/state-machine/` |
| **Windsurf** | `cp SKILL.md .windsurf/rules/state-machine.md` + `cp -r references .windsurf/rules/state-machine-references/` |
| **OpenCode** | `cp -r * .agent/skills/state-machine/` |
| **Manual** | Copy `SKILL.md` + `references/` into agent's skill directory |

Then use it:

```
state-machine model a modal that opens on click, shows a spinner while fetching,
displays content on success or an error on failure, and closes on Escape
```

---

## 4 worked examples

Each example follows the same 4-section structure: behavior specification → structural JSON contract →
ASCII diagram → production implementation using `createLightMachine` from `src/core/fsm.ts`.

<details>
<summary><b>📋 Modal with async loading</b></summary>

```
┌────────┐ TRIGGER  ┌─────────┐ FETCH_SUCCESS ┌─────────┐
│ Closed │─────────>│ Loading │──────────────>│ Success │
└────────┘          └────┬────┘               └────┬────┘
                         │                         │ CLOSE
                   CLOSE │                         v
                         │                    ┌─────────┐
                         └───────────────────>│  Closed  │
                                              └─────────┘
```

Full example: [`examples/modal.md`](examples/modal.md) — 4 states, 5 events, 7 transitions
</details>

<details>
<summary><b>📋 Multi-step registration form</b></summary>

```
┌────────┐  NEXT   ┌────────┐  NEXT   ┌────────┐  SUBMIT
│ Step1  │────────>│ Step2  │────────>│ Step3  │────────────┐
└───┬────┘         └───┬────┘         └────────┘            │
    │ PREV              │ PREV                               │
    └───────────────────┘                                    │
                              ┌────────────┐                 │
                              │ Submitting │◄────────────────┘
                              └──────┬─────┘
                         ┌───────────┼──────────┐
                         v           v          │
                    ┌─────────┐ ┌─────────┐     │
                    │ Success │ │  Error  │─────┘
                    └─────────┘ └────┬────┘
                                     │ RETRY
                                     v
                                 ┌────────────┐
                                 │ Submitting │
                                 └────────────┘
```

Full example: [`examples/multistep-form.md`](examples/multistep-form.md) — 7 states, 8 events, 11 transitions
</details>

<details>
<summary><b>📋 Toggle with optimistic update</b></summary>

```
     ┌────────┐      ┌────────────┐ CONFIRM ┌────────┐
     │  Off   │─────>│ PendingOn  │───────>│   On   │
     └───┬────┘      └──────┬─────┘        └───┬────┘
         │                  │ REJECT            │
         │                  v                   │
         │              ┌───────┐               │
         └─────────────>│ Error │<──────────────┘
                        └───┬───┘
                      RETRY  │  DISMISS
                             v
                        ┌────────┐
                        │Pending │
                        └────────┘
```

Full example: [`examples/toggle-async.md`](examples/toggle-async.md) — 5 states, 5 events, 8 transitions
</details>

<details>
<summary><b>📋 Auth flow with MFA</b></summary>

```
┌──────────────────────────────────────────┐
│ Unauthenticated                          │
│  ┌────────┐  LOGIN     ┌──────────────┐ │
│  │  Idle  │───────────>│ Authenticating│ │
│  └────────┘<────────────│              │ │
│       ^       LOGIN_ERR └──────┬───────┘ │
│       │ MFA_CANCEL    LOGIN_MFA│         │
│       │                 ┌──────v───────┐ │
│       └─────────────────│ MfaRequired  │ │
│                  MFA_SUBMIT(hasMfaCode) │ │
└──────────────────────────────────────────┘
                    │ LOGIN_SUCCESS
                    v
┌──────────────────────────────────────────┐
│ Authenticated                            │
│  ┌────────┐  REFRESH_TOKEN ┌────────────┐│
│  │ Active │───────────────>│ Refreshing  ││
│  └───┬────┘<───────────────│            ││
│      │    REFRESH_SUCCESS  └──────┬─────┘│
│      │                    REFRESH_FAIL   │
│      └──────────────────────────────┘    │
│  LOGOUT → Unauthenticated.Idle           │
│  SESSION_EXPIRED → Unauthenticated.Idle  │
└──────────────────────────────────────────┘
```

Full example: [`examples/auth-flow.md`](examples/auth-flow.md) — HFSM with compound states, 3+2 child states, 13 events, 16 transitions
</details>

---

## Why state machines for UI?

**Booleans are not states.** Three booleans create eight possible combinations, but most UIs
only have 3-4 valid visual states. The other 4-5 combinations are impossible states — bugs
that haven't happened yet. Every time a modal shows a spinner over content, a form submits
with invalid data, or a toggle displays the wrong value, the root cause is the same:
the component was in a combination of boolean flags that was never designed.

**A state machine replaces N booleans with one state variable.** Instead of 2^N possible
combinations (most of which are invalid), you get exactly N states — all of them valid.
The state alphabet IS the specification. If a state isn't in the alphabet, the component
cannot enter it. Not by accident, not by race condition, not by a missed code path.

**The model is the source of truth.** Code is generated from the model, not the other way
around. The 38 validation gates (see `references/slop-gates.md`) catch every common mistake
before it reaches your codebase. The result is a component that is provably correct with
respect to its state model — and a test suite that covers every transition, every guard,
and every action.

---

## XState v5 compatible

Every generated model maps directly to XState v5. Use the machine in any framework via
`@xstate/react`, `@xstate/vue`, or `@xstate/svelte`.

```ts
// From the modal example: direct XState v5 mapping
import { setup } from 'xstate';

export const modalMachine = setup({
  types: { /* ... */ },
  actions: { fetchData: () => fetch('/api/data'), /* ... */ },
}).createMachine({
  id: 'modal',
  initial: 'Closed',
  states: {
    Closed: { on: { TRIGGER: 'Opening' } },
    Opening: { after: { 200: 'Loading' }, on: { CLOSE: 'Closing' } },
    Loading: { on: { FETCH_SUCCESS: 'Success', FETCH_ERROR: 'Error' } },
    Success: { on: { CLOSE: 'Closing' } },
    Error: { on: { CLOSE: 'Closing', RETRY: 'Loading' } },
    Closing: { after: { 200: 'Closed' } },
  },
});
```

See [`references/xstate-compat.md`](references/xstate-compat.md) for the full mapping guide.

---

## Project structure

| File | Contents |
|------|----------|
| [`SKILL.md`](SKILL.md) | Mandatory execution protocol for AI agents |
| [`src/core/fsm.ts`](src/core/fsm.ts) | Injectable micro-runtime (`createLightMachine`) |
| [`scripts/validate-model.js`](scripts/validate-model.js) | Zero-dep model validator — gates 01–13 + graph structural check |
| [`scripts/ascii-viz.js`](scripts/ascii-viz.js) | ASCII transition diagram renderer |
| [`scripts/audit-processor.js`](scripts/audit-processor.js) | Boolean flag analyzer for legacy code audit |
| [`schemas/fsm.schema.json`](schemas/fsm.schema.json) | Canonical JSON Schema for hierarchical FSM models |
| [`references/verb-dispatch.md`](references/verb-dispatch.md) | Output format for model, implement, audit |
| [`references/state-theory.md`](references/state-theory.md) | FSM/HFSM fundamentals applied to UI |
| [`references/component-patterns.md`](references/component-patterns.md) | 12 canonical patterns with models and invariants |
| [`references/impossible-states.md`](references/impossible-states.md) | 35 anti-patterns with elimination strategies |
| [`references/slop-gates.md`](references/slop-gates.md) | 38 validation gates every output must pass |
| [`references/xstate-compat.md`](references/xstate-compat.md) | Mapping every pattern to XState v5 |
| [`references/framework-adapters.md`](references/framework-adapters.md) | React, Vue, Svelte, Vanilla adapters |
| [`examples/`](examples/) | 4 worked examples (modal, toggle, form, auth) |

---

## Scripts (CI-ready)

| Script | Purpose |
|--------|---------|
| `node scripts/validate-model.js model.json` | Validates model against gates 01–13 + graph structural check |
| `node scripts/validate-model.js model.json --light` | Fast-track: skips warnings, compact diagram |
| `node scripts/ascii-viz.js model.json` | ASCII transition diagram standalone |
| `node scripts/audit-processor.js file.tsx` | Detects boolean flag explosion in legacy code |

Zero dependencies. Exit code 0 = valid, 1 = invalid with gate report.

**Auto-detects both flat format** (state array + transitions) and **hierarchical format** (nested `states` per `schemas/fsm.schema.json`). The hierarchical format supports compound states with `initial`, `#machineId.State.SubState` cross-hierarchy targets, guards, and actions.

---

## Framework support

All frameworks use the unified `useMachine(config, implementations)` pattern:

| Framework | Mechanism |
|-----------|----------|
| React | `useMachine(config, impl)` — `useState` + `useRef` |
| Vue | `useMachine(config, impl)` — `ref` + `readonly` |
| Svelte | `useMachine(config, impl)` — `writable` store |
| Vanilla JS | `createMachine(config, impl)` — closure factory |
| XState v5 | `setup()` + `createMachine()` |

---

## Contributing

1. Add a new component pattern to `references/component-patterns.md`
2. Add corresponding anti-patterns to `references/impossible-states.md`
3. Add validation gates to `references/slop-gates.md` if needed
4. Run `node scripts/validate-model.js` on the example models

---

## License

MIT © 2026

---

<div align="center">
<strong>state-machine</strong> — model before you build.
</div>
