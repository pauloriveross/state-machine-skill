# Example: Toggle with async (optimistic update)

> Full walkthrough: from natural language description to validated model to production code.

---

## Brief

```
A toggle switch that sends its new state to the server on every toggle. The UI updates
optimistically — the toggle moves immediately before the server responds. If the server
confirms, the toggle stays. If the server rejects, the toggle reverts. If the network
fails, the toggle reverts and shows an error. The user can retry from the error state.
The toggle is disabled while a request is in flight (no double-toggles).
```

## Invocation

```
state-machine model a toggle switch that optimistically updates on toggle, sends the new
state to the server, confirms or reverts based on the server response, and shows an error
on network failure with a retry option. The toggle is disabled while a request is pending.
```

---

## Produced model

### States

| State | Description | Terminal |
|-------|-------------|----------|
| Off | Toggle is in the off position. User sees unchecked/off state. | No |
| PendingOn | Optimistically showing On. Spinner or pulsing indicator visible. Request in flight. | No |
| On | Server confirmed the On state. Toggle is fully on. | No |
| PendingOff | Optimistically showing Off. Spinner or pulsing indicator visible. Request in flight. | No |
| Error | Server or network rejected the change. Error message visible with Retry. | No |

### Events

| Event | Origin | Description |
|-------|--------|-------------|
| TOGGLE | User clicks/taps the toggle | Requests state change |
| CONFIRM | Server response (2xx) | Server accepted the new state |
| REJECT | Server response (4xx) | Server rejected the new state |
| DISMISS | User clicks dismiss on error | Clears error, returns to Off |
| RETRY | User clicks Retry | Retries the failed operation |

### Transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Off | TOGGLE | isOnline | PendingOn | setOptimistic(true), patchServer(true) |
| PendingOn | CONFIRM | — | On | onChange(true) |
| PendingOn | REJECT | — | Off | rollback(), setError(message) |
| On | TOGGLE | isOnline | PendingOff | setOptimistic(false), patchServer(false) |
| PendingOff | CONFIRM | — | Off | onChange(false) |
| PendingOff | REJECT | — | On | rollback(), setError(message) |
| Error | DISMISS | — | Off | clearError() |
| Error | RETRY | isOnline | PendingOn | patchServer(true) |

### Guards

| Guard | Expression | Purpose |
|-------|------------|---------|
| isOnline | navigator.onLine === true | Prevent toggle when offline |

### Actions

| Action | Effect | Async? |
|--------|--------|--------|
| setOptimistic(v) | Sets toggle visual to `v` immediately | No |
| patchServer(v) | PATCH /api/toggle { value: v }, dispatches CONFIRM or REJECT | Yes |
| onChange(v) | Calls props.onChange(v) if provided | No |
| rollback() | Returns toggle to previous visual state | No |
| setError(m) | Stores error message in context | No |
| clearError() | Clears error message from context | No |

### Diagram

```
                 ┌───────────────────────────────────────────────────┐
                 │               TOGGLE + isOnline                   │
                 v                                                   │
    ┌────────┐       ┌────────────┐ CONFIRM ┌────────┐             │
    │  Off   │──────>│ PendingOn  │────────>│   On   │             │
    └───┬────┘       └──────┬─────┘         └───┬────┘             │
        │                   │ REJECT             │                  │
        │                   v                    │                  │
        │               ┌───────┐                │                  │
        │               │ Error │                │                  │
        │               └───┬───┘                │                  │
        │                   │                    │                  │
        │          ┌────────┼────────┐           │                  │
        │          │ RETRY  │DISMISS │           │                  │
        │          v        v        │           │                  │
        │     ┌────────────┐ ┌──────┐│           │                  │
        │     │ PendingOn  │ │  Off ││           │                  │
        │     └────────────┘ └──────┘│           │                  │
        │                            │           │                  │
        │              ┌─────────────┘           │                  │
        │              v                         │                  │
        │              TOGGLE + isOnline          │                  │
        │    ┌────────────┐ CONFIRM ┌────────┐    │                 │
        │    │ PendingOff │────────>│  Off   │────┘                 │
        │    └──────┬─────┘         └────────┘                      │
        │           │ REJECT                                        │
        │           v                                               │
        │       ┌───────┐                                           │
        └──────>│ Error │───────────────────────────────────────────┘
                └───────┘
```

---

## Invariants

The component MUST NEVER:

- Be in `PendingOn` and `On` simultaneously
- Be in `PendingOff` and `Off` simultaneously
- Accept TOGGLE while in any Pending state
- Stay in a Pending state indefinitely (timeout guard is recommended in production)

The component MUST ALWAYS:

- Return to the previous stable state on REJECT (rollback)
- Show an error message when entering Error
- Support RETRY from Error to re-attempt the failed operation

---

## Generated code (React + TypeScript)

```tsx
/* state-machine: Off|PendingOn|On|PendingOff|Error : TOGGLE|CONFIRM|REJECT|DISMISS|RETRY */

import { useState, useCallback, useRef, useMemo } from 'react';

type ToggleState = 'Off' | 'PendingOn' | 'On' | 'PendingOff' | 'Error';
type ToggleEvent =
  | { type: 'TOGGLE' }
  | { type: 'CONFIRM' }
  | { type: 'REJECT'; message: string }
  | { type: 'DISMISS' }
  | { type: 'RETRY' };

interface ToggleContext {
  error: string | null;
  previousState: 'Off' | 'On';
}

interface UseAsyncToggleOptions {
  onToggle?: (newValue: boolean) => Promise<void>;
  onChange?: (value: boolean) => void;
  initial?: boolean;
}

interface MachineConfig<State, Context> {
  initial: State;
  context: Context;
  states: Record<string, {
    on: Record<string, {
      target?: string;
      guard?: string;
      actions?: string[];
    }>;
  }>;
}

interface MachineImplementations<Context, Event> {
  actions?: Record<string, (ctx: Context, event: Event, send: (event: Event) => void) => Partial<Context> | Promise<void>>;
  guards?: Record<string, (ctx: Context, event: Event) => boolean>;
}

function useMachine<State extends string, Event extends { type: string }, Context>(
  config: MachineConfig<State, Context>,
  implementations?: MachineImplementations<Context, Event>,
) {
  const [state, setState] = useState<State>(config.initial);
  const [context, setContext] = useState<Context>(config.context);
  const stateRef = useRef(state);
  const contextRef = useRef(context);
  stateRef.current = state;
  contextRef.current = context;

  const send = useCallback((event: Event) => {
    const s = stateRef.current;
    const c = contextRef.current;
    const transition = config.states[s]?.on?.[event.type];
    if (!transition) return;

    if (transition.guard) {
      const guardFn = implementations?.guards?.[transition.guard];
      if (guardFn && !guardFn(c, event)) return;
    }

    if (transition.target) {
      setState(transition.target as State);
      stateRef.current = transition.target as State;
    }

    if (transition.actions) {
      let merged = c;
      for (const name of transition.actions) {
        const fn = implementations?.actions?.[name];
        if (fn) {
          const result = fn(merged, event, send);
          if (result instanceof Promise) continue;
          if (result) merged = { ...merged, ...result };
        }
      }
      if (merged !== c) {
        contextRef.current = merged;
        setContext(merged);
      }
    }
  }, [config, implementations]);

  const matches = useCallback((...states: State[]) => states.includes(state), [state]);

  return { state, context, send, matches, done: false };
}

function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function useAsyncToggle(options: UseAsyncToggleOptions = {}) {
  const initial: ToggleState = options.initial ? 'On' : 'Off';

  const config: MachineConfig<ToggleState, ToggleContext> = useMemo(() => ({
    initial,
    context: { error: null, previousState: initial },
    states: {
      Off: {
        on: {
          TOGGLE: { target: 'PendingOn', guard: 'isOnline', actions: ['setOptimisticOn', 'patchServer'] },
        },
      },
      PendingOn: {
        on: {
          CONFIRM: { target: 'On', actions: ['onChangeTrue'] },
          REJECT: { target: 'Error', actions: ['setError'] },
        },
      },
      On: {
        on: {
          TOGGLE: { target: 'PendingOff', guard: 'isOnline', actions: ['setOptimisticOff', 'patchServer'] },
        },
      },
      PendingOff: {
        on: {
          CONFIRM: { target: 'Off', actions: ['onChangeFalse'] },
          REJECT: { target: 'Error', actions: ['setError'] },
        },
      },
      Error: {
        on: {
          DISMISS: { target: 'Off', actions: ['clearError'] },
          RETRY: { target: 'PendingOn', guard: 'isOnline', actions: ['patchServer'] },
        },
      },
    },
  }), [initial]);

  const implementations = useMemo<MachineImplementations<ToggleContext, ToggleEvent>>(() => ({
    actions: {
      setOptimisticOn: () => ({ previousState: 'Off' as const }),
      setOptimisticOff: () => ({ previousState: 'On' as const }),
      onChangeTrue: () => { options.onChange?.(true); },
      onChangeFalse: () => { options.onChange?.(false); },
      setError: (_, event) => ({ error: (event as ToggleEvent & { type: 'REJECT' }).message ?? 'Request failed' }),
      clearError: () => ({ error: null }),
      patchServer: async (ctx, _, send) => {
        const newValue = ctx.previousState === 'Off';
        try {
          await options.onToggle?.(newValue);
          send({ type: 'CONFIRM' });
        } catch (err) {
          send({ type: 'REJECT', message: err instanceof Error ? err.message : 'Request failed' });
        }
      },
    },
    guards: {
      isOnline,
    },
  }), [options]);

  const { state, context, send, matches } = useMachine(config, implementations);

  const toggle = useCallback(() => send({ type: 'TOGGLE' }), [send]);
  const dismiss = useCallback(() => send({ type: 'DISMISS' }), [send]);
  const retry = useCallback(() => send({ type: 'RETRY' }), [send]);

  const isPending = state === 'PendingOn' || state === 'PendingOff';
  const isOn = state === 'On' || state === 'PendingOn';

  return { state, context, send, matches, isOn, isPending, toggle, dismiss, retry, done: false };
}

interface AsyncToggleProps {
  onToggle?: (newValue: boolean) => Promise<void>;
  onChange?: (value: boolean) => void;
  initial?: boolean;
  label?: { on: string; off: string };
}

export function AsyncToggle({
  onToggle,
  onChange,
  initial = false,
  label,
}: AsyncToggleProps) {
  const { state, isOn, isPending, context, toggle, dismiss, retry } = useAsyncToggle({
    onToggle,
    onChange,
    initial,
  });

  return (
    <div className="async-toggle">
      {state === 'Error' && context.error && (
        <div className="toggle-error">
          <span className="error-text">{context.error}</span>
          <button onClick={retry} className="retry-btn">Retry</button>
          <button onClick={dismiss} className="dismiss-btn">&times;</button>
        </div>
      )}

      <button
        className={`toggle-btn ${isOn ? 'on' : 'off'} ${isPending ? 'pending' : ''}`}
        onClick={toggle}
        disabled={isPending}
        aria-label={isOn ? 'Turn off' : 'Turn on'}
      >
        <span className="toggle-track">
          <span className="toggle-thumb" />
        </span>
        {isPending && <span className="toggle-spinner" />}
      </button>

      <span className="toggle-label">
        {isPending
          ? 'Updating...'
          : isOn
            ? (label?.on ?? 'On')
            : (label?.off ?? 'Off')}
      </span>
    </div>
  );
}
```

---

## Generated tests (Vitest)

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAsyncToggle } from './AsyncToggle';

describe('AsyncToggle state machine', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('starts in Off by default', () => {
    const { result } = renderHook(() => useAsyncToggle());
    expect(result.current.state).toBe('Off');
    expect(result.current.isOn).toBe(false);
  });

  it('starts in On when initial=true', () => {
    const { result } = renderHook(() => useAsyncToggle({ initial: true }));
    expect(result.current.state).toBe('On');
    expect(result.current.isOn).toBe(true);
  });

  it('transitions Off → PendingOn on TOGGLE', () => {
    const { result } = renderHook(() => useAsyncToggle());
    act(() => result.current.send({ type: 'TOGGLE' }));
    expect(result.current.state).toBe('PendingOn');
    expect(result.current.isOn).toBe(true);
  });

  it('transitions PendingOn → On on CONFIRM', () => {
    const { result } = renderHook(() => useAsyncToggle());
    act(() => result.current.send({ type: 'TOGGLE' }));
    act(() => result.current.send({ type: 'CONFIRM' }));
    expect(result.current.state).toBe('On');
    expect(result.current.isOn).toBe(true);
  });

  it('transitions PendingOn → Error on REJECT', () => {
    const { result } = renderHook(() => useAsyncToggle());
    act(() => result.current.send({ type: 'TOGGLE' }));
    act(() => result.current.send({ type: 'REJECT', message: 'Server error' }));
    expect(result.current.state).toBe('Error');
  });

  it('transitions On → PendingOff on TOGGLE', () => {
    const { result } = renderHook(() => useAsyncToggle({ initial: true }));
    act(() => result.current.send({ type: 'TOGGLE' }));
    expect(result.current.state).toBe('PendingOff');
    expect(result.current.isOn).toBe(false);
  });

  it('transitions PendingOff → Off on CONFIRM', () => {
    const { result } = renderHook(() => useAsyncToggle({ initial: true }));
    act(() => result.current.send({ type: 'TOGGLE' }));
    act(() => result.current.send({ type: 'CONFIRM' }));
    expect(result.current.state).toBe('Off');
    expect(result.current.isOn).toBe(false);
  });

  it('transitions PendingOff → Error on REJECT', () => {
    const { result } = renderHook(() => useAsyncToggle({ initial: true }));
    act(() => result.current.send({ type: 'TOGGLE' }));
    act(() => result.current.send({ type: 'REJECT', message: 'Unauthorized' }));
    expect(result.current.state).toBe('Error');
  });

  it('transitions Error → Off on DISMISS', () => {
    const { result } = renderHook(() => useAsyncToggle());
    act(() => result.current.send({ type: 'TOGGLE' }));
    act(() => result.current.send({ type: 'REJECT', message: 'fail' }));
    act(() => result.current.send({ type: 'DISMISS' }));
    expect(result.current.state).toBe('Off');
  });

  it('transitions Error → PendingOn on RETRY', () => {
    const { result } = renderHook(() => useAsyncToggle());
    act(() => result.current.send({ type: 'TOGGLE' }));
    act(() => result.current.send({ type: 'REJECT', message: 'fail' }));
    act(() => result.current.send({ type: 'RETRY' }));
    expect(result.current.state).toBe('PendingOn');
  });

  it('does not toggle while pending', () => {
    const { result } = renderHook(() => useAsyncToggle());
    act(() => result.current.send({ type: 'TOGGLE' }));
    act(() => result.current.send({ type: 'TOGGLE' }));
    expect(result.current.state).toBe('PendingOn');
  });

  it('blocks toggle when offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { result } = renderHook(() => useAsyncToggle());
    act(() => result.current.send({ type: 'TOGGLE' }));
    expect(result.current.state).toBe('Off');
  });

  it('calls onChange(true) when confirmed On', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useAsyncToggle({ onChange }));
    act(() => result.current.send({ type: 'TOGGLE' }));
    act(() => result.current.send({ type: 'CONFIRM' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange(false) when confirmed Off', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useAsyncToggle({ onChange, initial: true }));
    act(() => result.current.send({ type: 'TOGGLE' }));
    act(() => result.current.send({ type: 'CONFIRM' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
```

---

## XState v5 mapping

```ts
import { setup, assign } from 'xstate';

export const toggleMachine = setup({
  types: {
    context: {} as {
      error: string | null;
      previousState: 'Off' | 'On';
    },
    events: {} as
      | { type: 'TOGGLE' }
      | { type: 'CONFIRM' }
      | { type: 'REJECT'; message: string }
      | { type: 'DISMISS' }
      | { type: 'RETRY' },
  },
  guards: {
    isOnline: () => navigator.onLine,
  },
  actions: {
    setError: assign((_, params: { message: string }) => ({ error: params.message })),
    clearError: assign(() => ({ error: null })),
    savePreviousState: assign((_, params: { state: 'Off' | 'On' }) => ({
      previousState: params.state,
    })),
    callOnToggle: () => { /* ... */ },
    callOnChange: () => { /* ... */ },
  },
}).createMachine({
  id: 'asyncToggle',
  initial: 'Off',
  context: { error: null, previousState: 'Off' },
  states: {
    Off: {
      on: {
        TOGGLE: {
          target: 'PendingOn',
          guard: 'isOnline',
          actions: ['savePreviousState', 'callOnToggle'],
        },
      },
    },
    PendingOn: {
      on: {
        CONFIRM: { target: 'On', actions: 'callOnChange' },
        REJECT: { target: 'Error', actions: 'setError' },
      },
    },
    On: {
      on: {
        TOGGLE: {
          target: 'PendingOff',
          guard: 'isOnline',
          actions: ['savePreviousState', 'callOnToggle'],
        },
      },
    },
    PendingOff: {
      on: {
        CONFIRM: { target: 'Off', actions: 'callOnChange' },
        REJECT: { target: 'Error', actions: 'setError' },
      },
    },
    Error: {
      on: {
        DISMISS: { target: 'Off', actions: 'clearError' },
        RETRY: {
          target: 'PendingOn',
          guard: 'isOnline',
        },
      },
    },
  },
});
```

XState handles several things automatically:
- Guard evaluation before transition
- `assign` for context mutations
- Event payload typing via `types.events`
- The `isOnline` guard runs naturally as a pure function
