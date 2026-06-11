# XState v5 Compatibility

> How to map every state-machine skill model to XState v5's `setup()` and `createMachine()` API.

---

## Quick reference

| Skill concept | XState v5 equivalent |
|---------------|----------------------|
| State | `states: { stateName: { ... } }` |
| Initial state | `initial: 'stateName'` |
| Event | `on: { EVENT_NAME: 'target' }` or `on: { EVENT_NAME: { target: '...' } }` |
| Guard | `guard: 'guardName'` — defined in `setup({ guards: { ... } })` |
| Action | `actions: 'actionName'` — defined in `setup({ actions: { ... } })` |
| Context | `context: { ... }` — initial data, mutated via `assign` |
| Context mutation | `assign({ key: (_, params) => value })` inside actions |
| <done> / after delay | `after: { 200: 'target' }` — 200ms delay |
| HFSM (compound) | `states: { parent: { initial: '...', states: { child: { ... } } } }` |
| Terminal state | `type: 'final'` |
| History | `history: 'shallow'` or `history: 'deep'` |
| Actor (spawned machine) | `invoke: { src: 'machineName', ... }` |
| TypeScript types | `types: { context: {} as ..., events: {} as ... }` |

---

## setup() — The entry point

Every XState v5 machine starts with `setup()`, which declares the types, guards, actions,
and services BEFORE the machine definition. This is the key difference from v4.

```ts
import { setup, assign } from 'xstate';

export const machine = setup({
  // ── TypeScript types ──
  types: {
    context: {} as {
      data: unknown;
      error: string | null;
    },
    events: {} as
      | { type: 'TRIGGER' }
      | { type: 'FETCH_SUCCESS'; data: unknown }
      | { type: 'FETCH_ERROR'; message: string }
      | { type: 'CLOSE' },
  },

  // ── Guards (pure boolean functions) ──
  guards: {
    canDismiss: ({ context }) => context.error === null,
    isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
  },

  // ── Actions (side effects) ──
  actions: {
    setData: assign((_, params: { data: unknown }) => ({
      data: params.data,
      error: null,
    })),
    setError: assign((_, params: { message: string }) => ({
      error: params.message,
      data: null,
    })),
    logEvent: (_, params) => console.log('Event:', params),
    fetchData: () => { /* side effect */ },
  },
}).createMachine({ /* machine definition */ });
```

### Mapping the model output to setup()

| Model section | setup() field |
|---------------|---------------|
| Guards (pure functions) | `guards: { guardName: ({ context, event }) => boolean }` |
| Actions (side effects) | `actions: { actionName: (_, params) => void }` |
| Context (data) | `types.context` + initial `context` in `createMachine()` |
| Events | `types.events` as a union of `{ type: 'NAME'; payload?: T }` |

---

## States, transitions, and events

### Simple transition

**Model:**
```
| From | Event | To |
|------|-------|----|
| Idle | FETCH  | Loading |
```

**XState:**
```ts
states: {
  Idle: { on: { FETCH: 'Loading' } },
  Loading: { /* ... */ },
}
```

### Guarded transition

**Model:**
```
| From | Event | Guard | To |
|------|-------|-------|----|
| Idle | SUBMIT | isFormValid | Submitting |
```

**XState:**
```ts
states: {
  Idle: {
    on: {
      SUBMIT: { target: 'Submitting', guard: 'isFormValid' },
    },
  },
}
```

### Transition with actions

**Model:**
```
| From | Event | To | Actions |
|------|-------|----|---------|
| Loading | FETCH_SUCCESS | Success | setData(response), trackEvent('success') |
```

**XState:**
```ts
states: {
  Loading: {
    on: {
      FETCH_SUCCESS: {
        target: 'Success',
        actions: ['setData', 'logEvent'],
      },
    },
  },
}
```

### Self-transition (same state)

**Model:**
```
| From | Event | To | Actions |
|------|-------|----|---------|
| Uploading | UPLOAD_PROGRESS | Uploading | setProgress(pct) |
```

**XState:**
```ts
Uploading: {
  on: {
    UPLOAD_PROGRESS: { target: 'Uploading', actions: 'setProgress' },
  },
},
```

### Wildcard / any-state transition

**Model:**
```
| From | Event | Guard | To |
|------|-------|-------|----|
| Any | CLICK_OUTSIDE | isOpen | Closing |
```

**XState:**
```ts
states: {
  Open: { on: { CLICK_OUTSIDE: { target: 'Closing', guard: 'isOpen' } } },
  Searching: { on: { CLICK_OUTSIDE: { target: 'Closing', guard: 'isOpen' } } },
  // Must be defined per-state; XState does not support global wildcard
},
```

If you need a global handler, add it at each state or use a parent compound state.

---

## Compound states (HFSM)

**Model:**
```
MultiStepForm (root)
  ├── Step1 (compound)
  │     ├── Idle*
  │     ├── Dirty
  │     └── Validating
  ├── Step2 (compound)
  │     ├── Idle*
  │     ├── Dirty
  │     └── Validating
  └── Completed (final)
```

**XState:**
```ts
createMachine({
  id: 'multiStepForm',
  initial: 'Step1',
  states: {
    Step1: {
      initial: 'Idle',
      states: {
        Idle: { on: { CHANGE: 'Dirty' } },
        Dirty: { on: { CHANGE: 'Dirty' } },
        Validating: {
          on: {
            VALIDATION_PASS: 'Idle',
            VALIDATION_FAIL: 'Dirty',
          },
        },
      },
      on: {
        NEXT: { target: 'Step2', guard: 'isStep1Valid' },
        PREV: { target: 'Step1' }, // no-op, already in Step1
      },
    },
    Step2: {
      initial: 'Idle',
      // ... same structure
      on: {
        NEXT: { target: 'Step3', guard: 'isStep2Valid' },
        PREV: 'Step1',
      },
    },
    Completed: { type: 'final' },
  },
});
```

### Bubble-up rule

Events defined at the parent level (`on` at the same level as `states`) are handled when
no child state handles them. In the example above, `NEXT` and `PREV` are handled at the
`Step1` / `Step2` level, not inside the child states.

---

## Transient states and delays

**Model:**
```
Opening → <done> (after 200ms) → Loading
```

**XState uses `after`:**
```ts
Opening: {
  after: {
    200: 'Loading',
  },
},
```

For variable delays, use a context value:

```ts
Opening: {
  after: {
    ANIM_DURATION: 'Loading',
  },
},
// where ANIM_DURATION is defined as:
// after: { 0: { target: 'Loading', guard: 'hasCustomDuration' } }
```

Or define the delay in `setup()`:

```ts
setup({
  delays: {
    ANIM_DURATION: ({ context }) => context.animDuration || 200,
  },
}).createMachine({
  states: {
    Opening: {
      after: { ANIM_DURATION: 'Loading' },
    },
  },
});
```

---

## Terminal states

**Model:**
```
Completed (terminal)
```

**XState:**
```ts
Completed: { type: 'final' },
```

A final state stops the machine. To restart, send a `RESET` event or spawn a new actor.

---

## Actors (spawned machines)

For complex scenarios like the auth flow's refresh timer, use `invoke`:

```ts
setup({
  actors: {
    refreshTimer: fromCallback(({ sendBack }) => {
      const id = setInterval(() => sendBack({ type: 'REFRESH_TOKEN' }), 60_000);
      return () => clearInterval(id);
    }),
  },
}).createMachine({
  states: {
    Authenticated: {
      initial: 'Active',
      invoke: { src: 'refreshTimer' },
      states: {
        Active: { on: { REFRESH_TOKEN: 'Refreshing' } },
        Refreshing: { /* ... */ },
      },
    },
  },
});
```

---

## Guards

**Model:**
```
| Guard | Expression |
|-------|------------|
| isFormValid | validationErrors.size === 0 |
```

**XState:**
```ts
guards: {
  isFormValid: ({ context }) => context.validationErrors.size === 0,
},
```

### Guard access

| Param | Contents |
|-------|----------|
| `{ context }` | Current machine context |
| `{ event }` | The event that triggered the transition |
| `{ cond }` | Additional inline condition |

Multiple guards on one transition:

```ts
on: {
  SUBMIT: {
    target: 'Submitting',
    guard: [{ type: 'isFormValid' }, { type: 'isOnline' }], // AND logic
  },
},
```

---

## Actions

**Model:**
```
| Action | Effect |
|--------|--------|
| setData(r) | Stores response in context |
```

**XState:**
```ts
actions: {
  setData: assign(({ context }, params: { data: unknown }) => ({
    data: params.data,
    error: null,
  })),
},
```

### Action types

| Pattern | When to use |
|---------|-------------|
| `assign(...)` | Mutate context |
| Named function | Side effect (network, analytics) |
| `sendParent(...)` | Send event to parent machine |
| `sendTo(...)` | Send event to a specific actor |

### Entry and exit actions

```ts
Loading: {
  entry: ['clearData', 'logLoading'],
  exit: 'cancelPendingRequest',
  on: { FETCH_SUCCESS: { target: 'Success', actions: 'setData' } },
},
```

---

## Context

**Model:**
```
Context: { data: null, error: null }
```

**XState:**
```ts
createMachine({
  context: { data: null, error: null },
  // ...
});
```

### Context updates via assign

```ts
actions: {
  setError: assign(({ context }, params: { message: string }) => ({
    error: params.message,
    data: null,
  })),
},
```

Always return a partial object. Values not included are preserved.

---

## Quick translation table

| Skill model | XState v5 |
|-------------|-----------|
| `States: [A*, B, C]` | `initial: 'A', states: { A: ..., B: ..., C: ... }` |
| `| A | EV | — | B |` | `A: { on: { EV: 'B' } }` |
| `| A | EV | guard | B |` | `A: { on: { EV: { target: 'B', guard: 'guard' } } }` |
| `| A | EV | — | B | act() |` | `A: { on: { EV: { target: 'B', actions: 'act' } } }` |
| `(<done>)` | `after: { delay: 'target' }` |
| Compound states | `parent: { initial, states: { child: ... }, on: {...} }` |
| Terminal state | `type: 'final'` |
| Actions with context | `assign(...)` inside `actions` |
| Guards (pure) | `guards: { name: ({context, event}) => bool }` |

---

## Typegen (automatic type inference)

XState v5 includes a typegen that infers all types from the machine definition.
To enable it, run `npx xstate typegen "src/**/*.ts"` after defining the machine.

The generated `*.typegen.ts` file provides fully typed context, events, and actions
without manual `types` declarations. Remove the `types: { ... }` block after running typegen.

---

## Common pitfalls

| Pitfall | Solution |
|---------|----------|
| Forgetting `setup()` | Every machine must wrap in `setup().createMachine()` |
| Direct context mutation | Use `assign()` — never do `context.foo = bar` |
| Missing event payload type | Add payload field in `types.events` union |
| Guard returns non-boolean | Guards must always return `true` or `false` |
| Action ordering | `entry` actions run BEFORE the state is entered; `exit` actions run AFTER |
| Machine doesn't start | Check `initial` state name matches a defined state |

---

*This file is part of the state-machine skill. See SKILL.md for the full table of contents.*
