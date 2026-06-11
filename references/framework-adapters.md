# Framework Adapters

> How to implement the state-machine model in each target framework.

---

## Generic adapter pattern

Every framework adapter follows the same pattern:

1. **State** is a single union type
2. **Dispatch** is a function that takes the current state, an event, and returns the next state
3. **Render** is a function of the current state

```
model (states, events, guards, actions)
  → dispatch(currentState, event) → nextState
  → render(nextState) → UI
```

---

## React — useReducer

The `useReducer` hook is the idiomatic React adapter. The reducer IS the transition table.

### Pattern

```tsx
import { useReducer, useCallback } from 'react';

// ── Types matching the model ──
type State = 'Closed' | 'Opening' | 'Loading' | 'Success' | 'Error' | 'Closing';
type Event =
  | { type: 'TRIGGER' }
  | { type: '<done>' }
  | { type: 'FETCH_SUCCESS'; data: unknown }
  | { type: 'FETCH_ERROR'; message: string }
  | { type: 'CLOSE' };

interface Context {
  data: unknown;
  error: string | null;
}

// ── Guards (pure functions, defined outside reducer) ──
function canDismiss(state: State): boolean {
  return state !== 'Loading'; // can't dismiss while loading
}

// ── Reducer = transition table ──
function reducer(state: State, event: Event): State {
  switch (state) {
    case 'Closed':
      if (event.type === 'TRIGGER') return 'Opening';
      return state;

    case 'Opening':
      if (event.type === '<done>') return 'Loading';
      if (event.type === 'CLOSE') return 'Closing';
      return state;

    case 'Loading':
      if (event.type === 'FETCH_SUCCESS') return 'Success';
      if (event.type === 'FETCH_ERROR') return 'Error';
      return state;

    case 'Success':
      if (event.type === 'CLOSE') return 'Closing';
      return state;

    case 'Error':
      if (event.type === 'CLOSE') return 'Closing';
      if (event.type === 'RETRY') return 'Loading';
      return state;

    case 'Closing':
      if (event.type === '<done>') return 'Closed';
      return state;

    default:
      return state;
  }
}

// ── Hook ──
function useModal() {
  const [state, dispatch] = useReducer(reducer, 'Closed');
  const contextRef = useRef<Context>({ data: null, error: null });

  const trigger = useCallback(() => dispatch({ type: 'TRIGGER' }), []);
  const close = useCallback(() => {
    if (canDismiss(state)) dispatch({ type: 'CLOSE' });
  }, [state]);
  const retry = useCallback(() => dispatch({ type: 'RETRY' }), []);

  return { state, context: contextRef.current, trigger, close, retry };
}
```

### Key points

- The reducer IS the transition table — every `case` is a state, every `if` is an event handler
- `useReducer` guarantees that dispatch is stable and state transitions are deterministic
- Guards are called BEFORE dispatching (or inside the reducer before returning)
- Side effects live in `useEffect` or are triggered by the dispatch caller

### When to use useReducer vs useState

| Scenario | Use |
|----------|-----|
| 2–5 states, simple transitions | `useReducer` |
| 6+ states, complex guards | `useReducer` |
| Need to test transitions in isolation | `useReducer` (export the reducer) |
| Single boolean toggle | `useState` (trivial) |

---

## Vue — reactive

Vue 3's Composition API with `reactive` and `computed` provides the state machine foundation.

### Pattern

```vue
<script setup lang="ts">
import { reactive, computed } from 'vue';

// ── Types ──
type State = 'Closed' | 'Opening' | 'Loading' | 'Success' | 'Error' | 'Closing';
type Event =
  | { type: 'TRIGGER' }
  | { type: '<done>' }
  | { type: 'FETCH_SUCCESS'; data: unknown }
  | { type: 'FETCH_ERROR'; message: string }
  | { type: 'CLOSE' }
  | { type: 'RETRY' };

// ── Machine ──
const machine = reactive({
  state: 'Closed' as State,
  data: null as unknown,
  error: null as string | null,
});

function dispatch(event: Event) {
  switch (machine.state) {
    case 'Closed':
      if (event.type === 'TRIGGER') { machine.state = 'Opening'; }
      break;
    case 'Opening':
      if (event.type === '<done>') { machine.state = 'Loading'; fetchContent(); }
      if (event.type === 'CLOSE') { machine.state = 'Closing'; }
      break;
    case 'Loading':
      if (event.type === 'FETCH_SUCCESS') {
        machine.data = event.data;
        machine.error = null;
        machine.state = 'Success';
      }
      if (event.type === 'FETCH_ERROR') {
        machine.error = event.message;
        machine.state = 'Error';
      }
      break;
    case 'Success':
      if (event.type === 'CLOSE') { machine.state = 'Closing'; }
      break;
    case 'Error':
      if (event.type === 'CLOSE') { machine.state = 'Closing'; }
      if (event.type === 'RETRY') { machine.state = 'Loading'; fetchContent(); }
      break;
    case 'Closing':
      if (event.type === '<done>') { machine.state = 'Closed'; }
      break;
  }
}

// ── Derived state ──
const isOpen = computed(() =>
  ['Opening', 'Loading', 'Success', 'Error', 'Closing'].includes(machine.state)
);
const isLoading = computed(() => machine.state === 'Loading');
const isError = computed(() => machine.state === 'Error');

// ── Side effects ──
async function fetchContent() {
  try {
    const response = await fetch('/api/data');
    const data = await response.json();
    dispatch({ type: 'FETCH_SUCCESS', data });
  } catch (err) {
    dispatch({ type: 'FETCH_ERROR', message: (err as Error).message });
  }
}
</script>

<template>
  <div v-if="machine.state !== 'Closed'" class="modal-backdrop" @click="dispatch({ type: 'CLOSE' })">
    <div class="modal-content" @click.stop>
      <div v-if="machine.state === 'Opening'" class="animating" />
      <div v-else-if="isLoading" class="loading"><span class="spinner" /> Loading...</div>
      <div v-else-if="machine.state === 'Success'" class="body">
        <button class="close" @click="dispatch({ type: 'CLOSE' })">&times;</button>
        {{ machine.data }}
      </div>
      <div v-else-if="isError" class="body">
        <p class="error">{{ machine.error }}</p>
        <button @click="dispatch({ type: 'RETRY' })">Retry</button>
      </div>
      <div v-else-if="machine.state === 'Closing'" class="animating" />
    </div>
  </div>
</template>
```

### Key points

- `reactive` object holds state AND context — no separate useRef
- `computed` provides derived booleans from current state
- Side effects are async functions called from dispatch cases
- Template uses `v-if` chains matching each state

---

## Svelte — writable

Svelte's stores provide the reactive foundation.

### Pattern

```svelte
<script lang="ts">
import { writable, derived } from 'svelte/store';

// ── Types ──
type State = 'Closed' | 'Opening' | 'Loading' | 'Success' | 'Error' | 'Closing';
type Event =
  | { type: 'TRIGGER' }
  | { type: '<done>' }
  | { type: 'FETCH_SUCCESS'; data: unknown }
  | { type: 'FETCH_ERROR'; message: string }
  | { type: 'CLOSE' }
  | { type: 'RETRY' };

// ── Machine store ──
interface MachineStore {
  state: State;
  data: unknown;
  error: string | null;
}

const machine = writable<MachineStore>({
  state: 'Closed',
  data: null,
  error: null,
});

// ── Derived stores ──
const isOpen = derived(machine, $m =>
  ['Opening', 'Loading', 'Success', 'Error', 'Closing'].includes($m.state)
);
const isLoading = derived(machine, $m => $m.state === 'Loading');

// ── Dispatch ──
function dispatch(event: Event) {
  machine.update($m => {
    switch ($m.state) {
      case 'Closed':
        if (event.type === 'TRIGGER') return { ...$m, state: 'Opening' as const };
        return $m;

      case 'Opening':
        if (event.type === '<done>') return { ...$m, state: 'Loading' as const };
        if (event.type === 'CLOSE') return { ...$m, state: 'Closing' as const };
        return $m;

      case 'Loading':
        if (event.type === 'FETCH_SUCCESS') {
          return { ...$m, state: 'Success' as const, data: event.data, error: null };
        }
        if (event.type === 'FETCH_ERROR') {
          return { ...$m, state: 'Error' as const, error: event.message };
        }
        return $m;

      case 'Success':
        if (event.type === 'CLOSE') return { ...$m, state: 'Closing' as const };
        return $m;

      case 'Error':
        if (event.type === 'CLOSE') return { ...$m, state: 'Closing' as const };
        if (event.type === 'RETRY') {
          fetchContent();
          return { ...$m, state: 'Loading' as const };
        }
        return $m;

      case 'Closing':
        if (event.type === '<done>') {
          return { state: 'Closed' as const, data: null, error: null };
        }
        return $m;

      default:
        return $m;
    }
  });
}

async function fetchContent() {
  try {
    const res = await fetch('/api/data');
    const data = await res.json();
    dispatch({ type: 'FETCH_SUCCESS', data });
  } catch (err) {
    dispatch({ type: 'FETCH_ERROR', message: (err as Error).message });
  }
}
</script>

<!-- Template -->
{#if $machine.state !== 'Closed'}
<div class="modal-backdrop" on:click={() => dispatch({ type: 'CLOSE' })}>
  <div class="modal-content" on:click|stopPropagation>
    {#if $machine.state === 'Opening'}
      <div class="animating" />
    {:else if $isLoading}
      <div class="loading"><span class="spinner" /> Loading...</div>
    {:else if $machine.state === 'Success'}
      <button class="close" on:click={() => dispatch({ type: 'CLOSE' })}>&times;</button>
      {$machine.data}
    {:else if $machine.state === 'Error'}
      <p class="error">{$machine.error}</p>
      <button on:click={() => dispatch({ type: 'RETRY' })}>Retry</button>
    {:else if $machine.state === 'Closing'}
      <div class="animating" />
    {/if}
  </div>
</div>
{/if}
```

### Key points

- `writable` store holds the entire machine state + context in one object
- `derived` stores provide computed booleans (replaces `computed` in Vue, `useMemo` in React)
- `machine.update()` is the dispatch function — it receives current state and returns new state
- The store is reactive by default — no subscriptions needed in the template

---

## Vanilla JS — state object

For any framework or no framework, the state machine is a plain object with a dispatch method.

### Pattern

```ts
// ── Types ──
type State = 'Closed' | 'Opening' | 'Loading' | 'Success' | 'Error' | 'Closing';
type Event =
  | { type: 'TRIGGER' }
  | { type: '<done>' }
  | { type: 'FETCH_SUCCESS'; data: unknown }
  | { type: 'FETCH_ERROR'; message: string }
  | { type: 'CLOSE' }
  | { type: 'RETRY' };

interface MachineContext {
  data: unknown;
  error: string | null;
}

// ── Machine factory ──
function createModalMachine(options: {
  fetchData?: () => Promise<unknown>;
  onOpen?: () => void;
  onClose?: () => void;
} = {}) {
  let state: State = 'Closed';
  let context: MachineContext = { data: null, error: null };
  const listeners = new Set<() => void>();

  function dispatch(event: Event) {
    const prevState = state;

    switch (state) {
      case 'Closed':
        if (event.type === 'TRIGGER') { state = 'Opening'; options.onOpen?.(); }
        break;
      case 'Opening':
        if (event.type === '<done>') { state = 'Loading'; fetchContent(); }
        if (event.type === 'CLOSE') { state = 'Closing'; }
        break;
      case 'Loading':
        if (event.type === 'FETCH_SUCCESS') {
          context = { data: event.data, error: null };
          state = 'Success';
        }
        if (event.type === 'FETCH_ERROR') {
          context = { data: null, error: event.message };
          state = 'Error';
        }
        break;
      case 'Success':
        if (event.type === 'CLOSE') { state = 'Closing'; }
        break;
      case 'Error':
        if (event.type === 'CLOSE') { state = 'Closing'; }
        if (event.type === 'RETRY') { state = 'Loading'; fetchContent(); }
        break;
      case 'Closing':
        if (event.type === '<done>') { state = 'Closed'; options.onClose?.(); }
        break;
    }

    if (state !== prevState) {
      listeners.forEach(fn => fn());
    }
  }

  async function fetchContent() {
    if (!options.fetchData) return;
    try {
      const data = await options.fetchData();
      dispatch({ type: 'FETCH_SUCCESS', data });
    } catch (err) {
      dispatch({ type: 'FETCH_ERROR', message: (err as Error).message });
    }
  }

  return {
    getState: () => state,
    getContext: () => context,
    dispatch,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// ── Usage ──
const modal = createModalMachine({
  fetchData: () => fetch('/api/data').then(r => r.json()),
});

modal.subscribe(() => {
  render(modal.getState(), modal.getContext());
});

function render(state: State, context: MachineContext) {
  const container = document.getElementById('modal-root');
  if (!container) return;

  if (state === 'Closed') {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-content">
        ${state === 'Opening' ? '<div class="animating"></div>' : ''}
        ${state === 'Loading' ? '<div class="loading">Loading...</div>' : ''}
        ${state === 'Success' ? `
          <button class="close" onclick="modal.dispatch({type:'CLOSE'})">&times;</button>
          <div>${JSON.stringify(context.data)}</div>
        ` : ''}
        ${state === 'Error' ? `
          <p class="error">${context.error}</p>
          <button onclick="modal.dispatch({type:'RETRY'})">Retry</button>
        ` : ''}
        ${state === 'Closing' ? '<div class="animating"></div>' : ''}
      </div>
    </div>
  `;
}
```

### Key points

- The machine is a closure with `let state` and `let context`
- `dispatch` is the only way to change state — no external mutations
- `subscribe` returns an unsubscribe function (same pattern as Svelte stores)
- The machine is framework-agnostic; rendering is handled by the subscriber
- Testable: create a machine, dispatch events, assert state

---

## Comparison

| Aspect | React | Vue | Svelte | Vanilla |
|--------|-------|-----|--------|---------|
| State container | `useReducer` | `reactive()` | `writable()` | Closure |
| Derived values | `useMemo` | `computed()` | `derived()` | Computed in getter |
| Side effects | `useEffect` | `watch()` / async | Reactive statements | Subscriber pattern |
| TypeScript | Native | `defineComponent` | `lang="ts"` | Native |
| Testability | Export reducer | Export dispatch | Export store | Export machine |
| Learning curve | Low | Medium | Low | Low |
| XState integration | `@xstate/react` | `@xstate/vue` | `@xstate/svelte` | Direct `createMachine()` |

---

## When to use each adapter

| Your stack | Adapter |
|------------|---------|
| React 18+ with hooks | `useReducer` |
| React with XState | `@xstate/react` (`useMachine`) |
| Vue 3 Composition API | `reactive` + `computed` |
| Vue with XState | `@xstate/vue` |
| Svelte 4+ | `writable` + `derived` |
| Svelte with XState | `@xstate/svelte` |
| No framework / any framework | Vanilla closure |
| Need full XState tooling (inspect, typegen) | XState adapter |

---

*This file is part of the state-machine skill. See SKILL.md for the full table of contents.*
