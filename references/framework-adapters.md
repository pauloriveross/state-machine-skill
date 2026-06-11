# Framework Adapters

> How to implement the state-machine model in each target framework.

---

## Generic adapter pattern

Every adapter follows the **config + implementations** pattern:

```
config (states, transitions, guard names, action names)
  + implementations (actual guard/action functions)
  → adapter(config, implementations)
  → { state, context, send, matches, done }
```

Key design rules:
1. **Config** is fully declarative — states, transitions, guard names (strings), action names (strings)
2. **Implementations** provides the actual functions for guards and actions
3. Actions can be sync (return `Partial<Context>` to merge) or async (return `Promise<void>` and call `send()` when done)
4. Async actions acquire a "pending lock" that blocks external `send` calls until the async action resolves
5. Internal `send` calls (from inside actions) bypass the pending lock
6. The pattern encapsulates async execution — the consumer never manually dispatches events for async results

### Model JSON schema (validator format)

The canonical model JSON validated by `scripts/validate-model.js` uses this structure:

```json
{
  "states": [
    "Closed*",
    { "name": "Opening", "onEnter": "onOpen" },
    "Loading",
    "Success"
  ],
  "transitions": [
    { "From": "Closed", "Event": "TRIGGER", "To": "Opening", "Actions": "onOpen" },
    { "From": "Opening", "Event": "<done>", "To": "Loading", "Actions": "fetchData" }
  ],
  "actions": {
    "onOpen":     { "description": "Opens the modal", "async": false },
    "fetchData":  { "description": "Fetches API data", "async": true }
  }
}
```

- **`states`**: Array of strings or `{ name, onEnter?, onExit?, type? }` objects. Mark initial with `*` suffix or `type: "initial"`.
- **`transitions`**: Array of `{ From, Event, Guard?, To, Actions? }` rows. The `Actions` column references declared action names (space/comma-separated).
- **`actions`** (optional but recommended): Object map of action names to descriptors, or array of action name strings. Every action referenced in transitions or state lifecycle hooks must appear here.

### Programmatic Types

```tsx
type MachineConfig<State, Event, Context> = {
  initial: State;
  context: Context;
  states: Record<State, {
    type?: 'final';
    on?: Record<string, {
      target?: State;
      guard?: string;
      actions?: string[];
    }>;
  }>;
};

type MachineImplementations<Context, Event> = {
  actions?: Record<string, (
    ctx: Context,
    event: Event,
    send: (event: Event) => void
  ) => Partial<Context> | void | Promise<void>>;
  guards?: Record<string, (ctx: Context, event: Event) => boolean>;
};
```

### Send internals

```
send(event, fromAction = false):
  if pendingRef.current && !fromAction → return

  lookup handler in current state for event.type
  if handler.guard → evaluate guard function
  if guard fails → return

  for each action in handler.actions:
    result = action(ctx, event, send(fromAction=true))
    if result is Promise → push to async queue
    else if result is object → merge into context

  if async queue has items → set pendingRef.current = true
  transition to handler.target state
```

### Modal example (shared across all adapters)

```tsx
type State = 'Closed' | 'Opening' | 'Loading' | 'Success' | 'Error' | 'Closing';
type Event =
  | { type: 'TRIGGER' }
  | { type: '<done>' }
  | { type: 'FETCH_SUCCESS'; data: unknown }
  | { type: 'FETCH_ERROR'; message: string }
  | { type: 'CLOSE' }
  | { type: 'RETRY' };

interface ModalContext {
  data: unknown;
  error: string | null;
}
```

```tsx
const modalConfig: MachineConfig<State, Event, ModalContext> = {
  initial: 'Closed',
  context: { data: null, error: null },
  states: {
    Closed: {
      on: {
        TRIGGER: { target: 'Opening', actions: ['openAnimation'] },
      },
    },
    Opening: {
      on: {
        '<done>': { target: 'Loading', actions: ['fetchContent'] },
        CLOSE: { target: 'Closing' },
      },
    },
    Loading: {
      on: {
        FETCH_SUCCESS: { target: 'Success', actions: ['assignData'] },
        FETCH_ERROR: { target: 'Error', actions: ['assignError'] },
        CLOSE: { target: 'Closing', guard: 'canAbort' },
      },
    },
    Success: {
      on: {
        CLOSE: { target: 'Closing', actions: ['closeAnimation'] },
      },
    },
    Error: {
      on: {
        CLOSE: { target: 'Closing' },
        RETRY: { target: 'Loading', actions: ['fetchContent'] },
      },
    },
    Closing: {
      on: {
        '<done>': { target: 'Closed', actions: ['resetContext'] },
      },
    },
  },
};
```

```tsx
const modalImpl: MachineImplementations<ModalContext, Event> = {
  guards: {
    canAbort: (ctx) => ctx.data === null,
  },
  actions: {
    openAnimation: () => {},
    closeAnimation: () => {},
    assignData: (ctx, event) => ({
      data: (event as { type: 'FETCH_SUCCESS'; data: unknown }).data,
      error: null,
    }),
    assignError: (ctx, event) => ({
      error: (event as { type: 'FETCH_ERROR'; message: string }).message,
    }),
    resetContext: () => ({ data: null, error: null }),
    fetchContent: async (ctx, event, send) => {
      try {
        const res = await fetch('/api/data');
        const data = await res.json();
        send({ type: 'FETCH_SUCCESS', data });
      } catch (err) {
        send({ type: 'FETCH_ERROR', message: (err as Error).message });
      }
    },
  },
};
```

---

## React — useMachine

```tsx
import { useState, useRef, useCallback } from 'react';

function useMachine<State extends string, Event extends { type: string }, Context>(
  config: MachineConfig<State, Event, Context>,
  implementations?: MachineImplementations<Context, Event>
) {
  const [state, setState] = useState<State>(config.initial);
  const [context, setContext] = useState<Context>(config.context);
  const pendingRef = useRef(false);
  const stateRef = useRef(state);
  const contextRef = useRef(context);

  stateRef.current = state;
  contextRef.current = context;

  const sendRef = useRef<(event: Event, fromAction?: boolean) => void>();

  sendRef.current = (event: Event, fromAction = false) => {
    if (pendingRef.current && !fromAction) return;

    const currentState = stateRef.current;
    const currentContext = contextRef.current;
    const stateCfg = config.states[currentState];
    const handler = stateCfg?.on?.[event.type];
    if (!handler) return;

    if (handler.guard) {
      const guardFn = implementations?.guards?.[handler.guard];
      if (guardFn && !guardFn(currentContext, event)) return;
    }

    let newContext = currentContext;
    const asyncActions: Promise<void>[] = [];

    if (handler.actions) {
      for (const name of handler.actions) {
        const actionFn = implementations?.actions?.[name];
        if (!actionFn) continue;
        const result = actionFn(newContext, event, (e: Event) => sendRef.current!(e, true));
        if (result instanceof Promise) {
          asyncActions.push(result);
        } else if (result !== undefined) {
          newContext = { ...newContext, ...result };
        }
      }
    }

    if (asyncActions.length > 0) {
      pendingRef.current = true;
      Promise.all(asyncActions).finally(() => {
        pendingRef.current = false;
      });
    }

    if (handler.target) {
      setContext(newContext);
      setState(handler.target);
    }
  };

  const send = useCallback((event: Event) => sendRef.current!(event), []);

  const matches = useCallback((...states: State[]) =>
    states.includes(stateRef.current), []);

  const done = config.states[state]?.type === 'final';

  return { state, context, send, matches, done };
}
```

### Usage

```tsx
function Modal() {
  const { state, context, send, matches } = useMachine(modalConfig, modalImpl);

  if (state === 'Closed') return null;

  return (
    <div className="modal-backdrop" onClick={() => send({ type: 'CLOSE' })}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {matches('Opening', 'Closing') && <div className="animating" />}
        {state === 'Loading' && <div className="loading">Loading...</div>}
        {state === 'Success' && (
          <>
            <button className="close" onClick={() => send({ type: 'CLOSE' })}>&times;</button>
            <div>{JSON.stringify(context.data)}</div>
          </>
        )}
        {state === 'Error' && (
          <>
            <p className="error">{context.error}</p>
            <button onClick={() => send({ type: 'RETRY' })}>Retry</button>
          </>
        )}
      </div>
    </div>
  );
}
```

### Key points

- `sendRef` pattern avoids stale closures in async action callbacks
- Guards are named strings in config, mapped to functions in implementations
- Sync actions return `Partial<Context>` merged into current context
- Async actions receive a wrapped `send` with `fromAction=true` that bypasses the pending lock
- `matches(...)` checks current state against one or more values — useful for grouping states
- `done` is true when the current state has `type: 'final'`

---

## Vue — useMachine

```tsx
import { ref, computed, readonly } from 'vue';

function useMachine<State extends string, Event extends { type: string }, Context>(
  config: MachineConfig<State, Event, Context>,
  implementations?: MachineImplementations<Context, Event>
) {
  const state = ref<State>(config.initial);
  const context = ref<Context>(config.context);
  const pending = ref(false);

  function send(event: Event, fromAction = false) {
    if (pending.value && !fromAction) return;

    const handler = config.states[state.value]?.on?.[event.type];
    if (!handler) return;

    if (handler.guard) {
      const guardFn = implementations?.guards?.[handler.guard];
      if (guardFn && !guardFn(context.value, event)) return;
    }

    let newContext = context.value;
    const asyncActions: Promise<void>[] = [];

    if (handler.actions) {
      for (const name of handler.actions) {
        const actionFn = implementations?.actions?.[name];
        if (!actionFn) continue;
        const result = actionFn(newContext, event, (e: Event) => send(e, true));
        if (result instanceof Promise) {
          asyncActions.push(result);
        } else if (result !== undefined) {
          newContext = { ...newContext, ...result };
        }
      }
    }

    if (asyncActions.length > 0) {
      pending.value = true;
      Promise.all(asyncActions).finally(() => { pending.value = false; });
    }

    if (handler.target) {
      context.value = newContext;
      state.value = handler.target;
    }
  }

  const matches = (...states: State[]) => states.includes(state.value);
  const done = computed(() => config.states[state.value]?.type === 'final');

  return { state: readonly(state), context: readonly(context), send, matches, done };
}
```

### Usage

```vue
<script setup lang="ts">
const { state, context, send, matches } = useMachine(modalConfig, modalImpl);
</script>

<template>
  <div v-if="state !== 'Closed'" class="modal-backdrop" @click="send({ type: 'CLOSE' })">
    <div class="modal-content" @click.stop>
      <div v-if="matches('Opening', 'Closing')" class="animating" />
      <div v-else-if="state === 'Loading'" class="loading">Loading...</div>
      <div v-else-if="state === 'Success'">
        <button class="close" @click="send({ type: 'CLOSE' })">&times;</button>
        <div>{{ context.data }}</div>
      </div>
      <div v-else-if="state === 'Error'">
        <p class="error">{{ context.error }}</p>
        <button @click="send({ type: 'RETRY' })">Retry</button>
      </div>
    </div>
  </div>
</template>
```

### Key points

- `ref` provides reactive state and context — templates auto-track
- `readonly` prevents external mutation of state and context
- `matches` is a plain function that reads `state.value` — Vue's reactivity tracks the dependency during template rendering
- `done` is a computed ref, updated whenever state changes

---

## Svelte — useMachine

```tsx
import { writable, derived, get } from 'svelte/store';

function useMachine<State extends string, Event extends { type: string }, Context>(
  config: MachineConfig<State, Event, Context>,
  implementations?: MachineImplementations<Context, Event>
) {
  const state = writable<State>(config.initial);
  const context = writable<Context>(config.context);
  const pending: { current: boolean } = { current: false };

  function send(event: Event, fromAction = false) {
    if (pending.current && !fromAction) return;

    const currentState = get(state);
    const currentContext = get(context);
    const handler = config.states[currentState]?.on?.[event.type];
    if (!handler) return;

    if (handler.guard) {
      const guardFn = implementations?.guards?.[handler.guard];
      if (guardFn && !guardFn(currentContext, event)) return;
    }

    let newContext = currentContext;
    const asyncActions: Promise<void>[] = [];

    if (handler.actions) {
      for (const name of handler.actions) {
        const actionFn = implementations?.actions?.[name];
        if (!actionFn) continue;
        const result = actionFn(newContext, event, (e: Event) => send(e, true));
        if (result instanceof Promise) {
          asyncActions.push(result);
        } else if (result !== undefined) {
          newContext = { ...newContext, ...result };
        }
      }
    }

    if (asyncActions.length > 0) {
      pending.current = true;
      Promise.all(asyncActions).finally(() => { pending.current = false; });
    }

    if (handler.target) {
      context.set(newContext);
      state.set(handler.target);
    }
  }

  const matchesStore = derived(state, ($s) => (...states: State[]) => states.includes($s));
  const done = derived(state, ($s) => config.states[$s]?.type === 'final');

  const matches = (...states: State[]) => states.includes(get(state));

  return { state, context, send, matches: matchesStore, done };
}
```

### Usage

```svelte
<script lang="ts">
const { state, context, send, matches, done } = useMachine(modalConfig, modalImpl);
</script>

{#if $state !== 'Closed'}
<div class="modal-backdrop" on:click={() => send({ type: 'CLOSE' })}>
  <div class="modal-content" on:click|stopPropagation>
    {#if $matches('Opening', 'Closing')}
      <div class="animating" />
    {:else if $state === 'Loading'}
      <div class="loading">Loading...</div>
    {:else if $state === 'Success'}
      <button class="close" on:click={() => send({ type: 'CLOSE' })}>&times;</button>
      <div>{JSON.stringify($context.data)}</div>
    {:else if $state === 'Error'}
      <p class="error">{$context.error}</p>
      <button on:click={() => send({ type: 'RETRY' })}>Retry</button>
    {/if}
  </div>
</div>
{/if}
```

### Key points

- `writable` stores hold state and context — `$prefix` auto-subscribes in templates
- `matches` is a `derived` store that returns a function — `$matches(...)` in the template is fully reactive
- `get()` reads the current value synchronously inside `send` without creating a subscription
- `pending` is a plain object ref (not a store) since it's internal and doesn't need reactivity
- `done` is a `derived` boolean store

---

## Vanilla JS — createMachine

```ts
function createMachine<State extends string, Event extends { type: string }, Context>(
  config: MachineConfig<State, Event, Context>,
  implementations?: MachineImplementations<Context, Event>
) {
  let state: State = config.initial;
  let context: Context = { ...config.context };
  let pending = false;
  const listeners = new Set<() => void>();

  function send(event: Event, fromAction = false) {
    if (pending && !fromAction) return;

    const handler = config.states[state]?.on?.[event.type];
    if (!handler) return;

    if (handler.guard) {
      const guardFn = implementations?.guards?.[handler.guard];
      if (guardFn && !guardFn(context, event)) return;
    }

    let newContext = context;
    const asyncActions: Promise<void>[] = [];

    if (handler.actions) {
      for (const name of handler.actions) {
        const actionFn = implementations?.actions?.[name];
        if (!actionFn) continue;
        const result = actionFn(newContext, event, (e: Event) => send(e, true));
        if (result instanceof Promise) {
          asyncActions.push(result);
        } else if (result !== undefined) {
          newContext = { ...newContext, ...result };
        }
      }
    }

    if (asyncActions.length > 0) {
      pending = true;
      Promise.all(asyncActions).finally(() => { pending = false; });
    }

    if (handler.target) {
      context = newContext;
      state = handler.target;
      listeners.forEach(fn => fn());
    }
  }

  return {
    getState: () => state,
    getContext: () => context,
    send: (event: Event) => send(event),
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    matches: (...states: State[]) => states.includes(state),
  };
}
```

### Usage

```ts
const modal = createMachine(modalConfig, modalImpl);

modal.subscribe(() => {
  render(modal.getState(), modal.getContext());
});

function render(state: State, context: ModalContext) {
  const container = document.getElementById('modal-root');
  if (!container) return;

  if (state === 'Closed') { container.innerHTML = ''; return; }

  let content = '';
  if (modal.matches('Opening', 'Closing')) {
    content = '<div class="animating"></div>';
  } else if (state === 'Loading') {
    content = '<div class="loading">Loading...</div>';
  } else if (state === 'Success') {
    content = `
      <button class="close" onclick="modal.send({type:'CLOSE'})">&times;</button>
      <div>${JSON.stringify(context.data)}</div>`;
  } else if (state === 'Error') {
    content = `
      <p class="error">${context.error}</p>
      <button onclick="modal.send({type:'RETRY'})">Retry</button>`;
  }

  container.innerHTML = `
    <div class="modal-backdrop" onclick="modal.send({type:'CLOSE'})">
      <div class="modal-content" onclick="event.stopPropagation()">${content}</div>
    </div>`;
}
```

### Key points

- Machine is a closure — no external mutation of state or context
- `subscribe` returns an unsubscribe function (same pattern as Svelte stores)
- `matches` is a plain function for checking current state
- `getState()` / `getContext()` provide read-only access
- No framework dependency — testable in isolation

---

## Comparison

| Aspect | React | Vue | Svelte | Vanilla |
|--------|-------|-----|--------|---------|
| Adapter | `useMachine(config, impl)` | `useMachine(config, impl)` | `useMachine(config, impl)` | `createMachine(config, impl)` |
| Reactive state | `useState` + `useRef` | `ref` + `readonly` | `writable` store | Closure `let` |
| State queries | `matches(...)` function | `matches(...)` function | `$matches(...)` derived store function | `matches(...)` function |
| Completion flag | `done` boolean | `done` computed ref | `$done` derived store | User-defined |
| Async lock | `useRef(false)` | `ref(false)` | Plain `{ current: false }` | Plain `boolean` |
| Side effects | Async actions | Async actions | Async actions | Async actions |
| XState alt | `@xstate/react` | `@xstate/vue` | `@xstate/svelte` | `createMachine()` |

---

## When to use each adapter

| Your stack | Adapter |
|------------|---------|
| React 18+ | `useMachine(config, implementations)` |
| Vue 3 Composition API | `useMachine(config, implementations)` |
| Svelte 4+ | `useMachine(config, implementations)` |
| No framework / any framework | `createMachine(config, implementations)` |
| Declarative config with named actions/guards | Config + implementations pattern |
| Need full XState tooling (inspect, typegen) | XState adapter (`@xstate/react`, etc.) |

---

*This file is part of the state-machine skill. See SKILL.md for the full table of contents.*
