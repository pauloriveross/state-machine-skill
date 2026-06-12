<div align="center">

# 🔄 state-machine

**Model UI behavior before you code it. Eliminate impossible states before they exist.**

[![npm version](https://img.shields.io/npm/v/state-machine-skill?label=1.2.3)](https://www.npmjs.com/package/state-machine-skill)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Works with Claude Code](https://img.shields.io/badge/Claude%20Code-ready-7C3AED)](https://claude.ai)
[![Works with Cursor](https://img.shields.io/badge/Cursor-ready-000000)](https://cursor.com)
[![Works with Windsurf](https://img.shields.io/badge/Windsurf-ready-2563EB)](https://codeium.com/windsurf)
[![Works with OpenCode](https://img.shields.io/badge/OpenCode-ready-22C55E)](https://opencode.ai)

Compatible with **Claude Code** · **Cursor** · **Windsurf** · **OpenCode** · Any AI coding agent

</div>

---

## Why state machines for UI?

Three booleans. Eight possible states. Five of them impossible.

```tsx
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

Every impossible state is a bug waiting to happen. A race condition, a missed reset, a late network response — and your UI shows a spinner over content, or an error over a success view.

**A state machine replaces N booleans with one state variable.** Instead of 2^N combinations (most invalid), you get exactly N states — all valid. If a state isn't in the alphabet, the component cannot enter it.

---

## How it works: two-phase workflow

```
┌──────────┐     ┌──────────────┐     ┌────────────┐     ┌──────────┐
│ Describe │────>│  model verb  │────>│ implement  │────>│  Ready   │
│ behavior │     │  (blueprint) │     │ verb (code) │     │ component│
│ in NL    │     │  .md output  │     │ .ts + .test │     │  shipped │
└──────────┘     └──────────────┘     └────────────┘     └──────────┘
```

**Phase 1 — `model`**: You describe the component behavior in natural language. The agent produces a validated JSON contract + ASCII diagram saved as a `.md` file. This is the **blueprint** — committable design documentation.

**Phase 2 — `implement`**: You point the agent to the blueprint. It injects the micro-runtime (`createLightMachine`), generates the component code wired to the state machine, and writes unit tests covering every transition.

---

## Install

| Agent | Command |
|-------|---------|
| **Any agent** | `npx skills add pauloriveross/state-machine-skill` |
| **Claude Code** | `npx skills add pauloriveross/state-machine-skill` |
| **Cursor** | Copy `SKILL.md` → `.cursor/rules/state-machine.mdc`, `references/` → `.cursor/rules/state-machine/` |
| **Windsurf** | `cp SKILL.md .windsurf/rules/state-machine.md` + `cp -r references/ .windsurf/rules/state-machine-references/` |
| **OpenCode** | `cp -r * .agent/skills/state-machine/` (or just open the repo — auto-detected) |
| **Manual** | Copy `SKILL.md` + `references/` into your agent's skill directory |

---

## Three verbs. One guarantee.

### `model` — From natural language to validated blueprint

**Input:** A natural language description of component behavior.

**Output:** A `.md` file containing the validated JSON contract + ASCII transition diagram.

**How the agent executes it:**

1. Translates your description into a hierarchical JSON conforming to `schemas/fsm.schema.json`
2. Saves to `.state-machine/temp-model.json`
3. Runs `node scripts/validate-model.js .state-machine/temp-model.json`
4. If validation fails, fixes the JSON and re-runs — **no intermediate output, no asking for help**
5. On success, outputs the final markdown block with the validated JSON and ASCII diagram

**Example:**

```
> state-machine model a toggle that switches on and off
```

The agent returns:

`````markdown
## Model: Toggle

### Contract (`model.json`)

```json
{
  "id": "toggle",
  "initial": "Off",
  "states": {
    "Off": { "type": "atomic", "on": { "TOGGLE": { "target": "On" } } },
    "On":  { "type": "atomic", "on": { "TOGGLE": { "target": "Off" } } }
  }
}
```

### ASCII Diagram

```
┌────────┐  TOGGLE  ┌────────┐
│   Off  │────────>│   On   │
└────────┘<────────└────────┘
└────────┘  TOGGLE  └────────┘
```

✅ All 13 gates passed.
`````

This `.md` is saved in your project. Commit it alongside the component.

---

### `implement` — From blueprint to production code

**Input:** The validated model from the previous `model` step (or a model you provide).

**Output:** Production component files injected into your project.

**How the agent executes it:**

1. Reads the validated JSON contract
2. Copies `src/core/fsm.ts` into your project as the runtime (e.g., `components/ui/fsm.ts`)
3. Generates the UI component wired to `createLightMachine`
4. Writes unit tests that simulate 100% of transitions

**Example:**

```
> state-machine model a modal with async loading...

> state-machine implement the modal using createLightMachine in components/ui/Modal.tsx
```

The agent writes:

```
components/ui/
├── fsm.ts              # Runtime (copied from src/core/fsm.ts)
├── Modal.tsx           # Component wired to createLightMachine
└── Modal.test.ts       # Tests covering every transition
```

**Every component carries a guarantee:**

```tsx
/* state-machine: Closed|Loading|Success|Error : TRIGGER|FETCH_SUCCESS|FETCH_ERROR|CLOSE|RETRY */
```

This component **cannot** enter a state that was not explicitly modeled.

---

### `audit` — Detect impossible states in legacy code

**Input:** A file path to an existing component using boolean flags (`useState`, `ref`, boolean fields).

**Output:** A structured JSON report with detected flags, combinatorial complexity, and impossible state analysis.

**How the agent executes it:**

1. Scans the file for reactive boolean variables (`const [isXxx, ...]`, `const [hasXxx, ...]`)
2. Runs `node scripts/audit-processor.js file.tsx`
3. Computes the 2^n combinatorial matrix
4. Identifies which combinations have no visual representation or coherent logic
5. Outputs a ranked punch list

**Example:**

```
> state-machine audit components/ui/OldModal.tsx
```

Output:

```json
{
  "detectedFlags": ["isLoading", "isError", "isSuccess"],
  "complexity": "3 flags = 8 combinaciones posibles",
  "impossibleStatesDetected": [
    {
      "combination": { "isLoading": true, "isError": true },
      "severity": "CRITICAL",
      "description": "Loading spinner and error message simultaneously"
    }
  ]
}
```

---

## Model format: two ways to write your JSON

The linter auto-detects which format you're using.

### Flat format (simple)

```json
{
  "states": ["Closed*", "Loading", "Success", "Error"],
  "transitions": [
    { "From": "Closed", "Event": "TRIGGER", "To": "Loading" },
    { "From": "Loading", "Event": "FETCH_SUCCESS", "To": "Success" },
    { "From": "Loading", "Event": "FETCH_ERROR", "To": "Error" }
  ]
}
```

### Hierarchical format (schema — per `schemas/fsm.schema.json`)

Supports compound states, guards, actions, lifecycle hooks, and cross-hierarchy targets.

```json
{
  "id": "async-modal",
  "initial": "Closed",
  "states": {
    "Closed": {
      "type": "atomic",
      "on": {
        "TRIGGER": { "target": "Loading" }
      }
    },
    "Loading": {
      "type": "atomic",
      "onEnter": ["fetchData"],
      "on": {
        "FETCH_SUCCESS": { "target": "Success", "actions": ["storeData"] },
        "FETCH_ERROR": { "target": "Error", "actions": ["logError"] }
      }
    },
    "Success": {
      "type": "atomic",
      "on": {
        "CLOSE": { "target": "Closed", "actions": ["clearData"] }
      }
    },
    "Error": {
      "type": "atomic",
      "on": {
        "RETRY": { "target": "Loading" },
        "CLOSE": { "target": "Closed" }
      }
    }
  }
}
```

For compound (nested) states with cross-hierarchy targets:

```json
{
  "id": "auth-flow",
  "initial": "Unauthenticated",
  "states": {
    "Unauthenticated": {
      "type": "compound",
      "initial": "Idle",
      "states": {
        "Idle": { "type": "atomic", "on": { "LOGIN": { "target": "Authenticating" } } },
        "Authenticating": { "type": "atomic" },
        "MfaRequired": { "type": "atomic" }
      }
    },
    "Authenticated": {
      "type": "compound",
      "initial": "Active",
      "states": {
        "Active": {
          "type": "atomic",
          "on": {
            "LOGOUT": { "target": "#auth-flow.Unauthenticated.Idle", "actions": ["clearSession"] }
          }
        }
      }
    }
  }
}
```

---

## 4 worked examples

Each example demonstrates the full pipeline in the unified 4-section format: behavior specification → structural JSON contract → ASCII diagram → production implementation.

<details>
<summary><b>📋 Modal with async loading</b> — 4 states, 5 events, 7 transitions</summary>

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

File: [`examples/modal.md`](examples/modal.md)
</details>

<details>
<summary><b>📋 Multi-step registration form</b> — 7 states, 8 events, 11 transitions</summary>

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

File: [`examples/multistep-form.md`](examples/multistep-form.md)
</details>

<details>
<summary><b>📋 Async toggle with optimistic update</b> — 5 states, 5 events, 8 transitions</summary>

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

File: [`examples/toggle-async.md`](examples/toggle-async.md)
</details>

<details>
<summary><b>📋 Auth flow with MFA</b> — HFSM, compound states, 13 events, 16 transitions</summary>

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

File: [`examples/auth-flow.md`](examples/auth-flow.md)
</details>

---

## Scripts

| Script | Purpose |
|--------|---------|
| `node scripts/validate-model.js model.json` | Validate model against gates 01–13 + structural pre-check |
| `node scripts/validate-model.js model.json --light` | Fast-track: skip warnings, compact diagram |
| `node scripts/ascii-viz.js model.json` | Render ASCII transition diagram only |
| `node scripts/audit-processor.js file.tsx` | Analyze boolean flags in legacy code |

All scripts are zero-dependency. Exit code 0 = valid, 1 = invalid with gate report.

---

## Project structure

| File | Purpose |
|------|---------|
| [`SKILL.md`](SKILL.md) | Mandatory execution protocol — tells the AI agent exactly how to handle each verb |
| [`src/core/fsm.ts`](src/core/fsm.ts) | Injectable micro-runtime (`createLightMachine`) — copied into your project by `implement` |
| [`schemas/fsm.schema.json`](schemas/fsm.schema.json) | Canonical JSON Schema for hierarchical FSM models |
| [`scripts/validate-model.js`](scripts/validate-model.js) | Model validator — 13 gates + graph structural check, auto-detects flat/hierarchical format |
| [`scripts/ascii-viz.js`](scripts/ascii-viz.js) | Terminal ASCII transition diagram renderer |
| [`scripts/audit-processor.js`](scripts/audit-processor.js) | Boolean flag analyzer — detects impossible state combinations in legacy code |
| [`references/verb-dispatch.md`](references/verb-dispatch.md) | Exact output format specification for each verb |
| [`references/slop-gates.md`](references/slop-gates.md) | 38 validation gates (model 1–13, code 14–23, audit 24–38) |
| [`references/state-theory.md`](references/state-theory.md) | FSM/HFSM fundamentals applied to UI components |
| [`references/component-patterns.md`](references/component-patterns.md) | 12 canonical UI patterns with pre-built models and invariants |
| [`references/impossible-states.md`](references/impossible-states.md) | 35 anti-patterns with elimination strategies |
| [`references/xstate-compat.md`](references/xstate-compat.md) | Full mapping to XState v5 for every pattern |
| [`references/framework-adapters.md`](references/framework-adapters.md) | `useMachine` adapter for React, Vue, Svelte, Vanilla JS |
| [`examples/`](examples/) | 4 worked examples in unified format (modal, toggle, form, auth) |

---

## XState v5 compatible

Every generated model maps directly to XState v5. Use the machine in any framework via `@xstate/react`, `@xstate/vue`, or `@xstate/svelte`.

```ts
import { setup } from 'xstate';

export const modalMachine = setup({
  types: { /* ... */ },
  actions: { fetchData: () => fetch('/api/data') },
}).createMachine({
  id: 'modal',
  initial: 'Closed',
  states: {
    Closed: { on: { TRIGGER: 'Loading' } },
    Loading: {
      on: {
        FETCH_SUCCESS: 'Success',
        FETCH_ERROR: 'Error',
        CLOSE: 'Closed',
      },
    },
    Success: { on: { CLOSE: 'Closed' } },
    Error: { on: { CLOSE: 'Closed', RETRY: 'Loading' } },
  },
});
```

See [`references/xstate-compat.md`](references/xstate-compat.md).

---

## Framework support

| Framework | Mechanism |
|-----------|----------|
| React | `useMachine(config, impl)` via `useState` + `useRef` |
| Vue | `useMachine(config, impl)` via `ref` + `readonly` |
| Svelte | `useMachine(config, impl)` via `writable` store |
| Vanilla JS | `createMachine(config, impl)` closure factory |
| XState v5 | `setup()` + `createMachine()` |

---

## Contributing

1. Add a new component pattern to `references/component-patterns.md`
2. Add corresponding anti-patterns to `references/impossible-states.md`
3. Add validation gates to `references/slop-gates.md`
4. Run `node scripts/validate-model.js` on the example models

---

## License

MIT © 2026

---

<div align="center">
<strong>state-machine</strong> — model before you build.
</div>
