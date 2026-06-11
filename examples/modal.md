# Example: Modal with async loading

> Full walkthrough: from natural language description to validated model to production code.

---

## Brief

```
A modal dialog that opens when a button is clicked. While opening, it plays a fade-in
animation. Once open, it fetches data from an API and shows a loading spinner. On success,
it displays the content. On failure, it shows an error message with a retry button.
The user can close the modal by clicking the close button, pressing Escape, or clicking
the overlay backdrop. The modal plays a fade-out animation before being removed from the DOM.
The modal cannot be closed while data is loading.
```

## Invocation

```
state-machine model a modal dialog that opens when a button is clicked, plays a fade-in animation,
fetches data showing a spinner, displays content on success or an error with retry on failure,
and closes via close button, Escape, or overlay click with a fade-out animation. The modal
cannot be dismissed while loading.
```

---

## Produced model

### States

| State | Description | Terminal |
|-------|-------------|----------|
| Closed | Modal is not rendered. No DOM elements exist. | No |
| Opening | CSS fade-in animation is playing. User sees backdrop appear. | No |
| Loading | Spinner is visible. API request is in flight. | No |
| Success | Content is displayed. User can read and interact. | No |
| Error | Error message and Retry button are displayed. | No |
| Closing | CSS fade-out animation is playing. User sees backdrop disappear. | No |

### Events

| Event | Origin | Description |
|-------|--------|-------------|
| TRIGGER | User clicks "Open" button | Requests modal to open |
| <done> | Internal (animation end) | Signals that animation completed |
| FETCH_SUCCESS | Network response (2xx) | Data was retrieved |
| FETCH_ERROR | Network response (4xx/5xx) | Data retrieval failed |
| CLOSE | User: close btn, Escape, overlay click | Requests modal to close |
| RETRY | User clicks Retry button | Retry the failed fetch |

### Transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Closed | TRIGGER | — | Opening | onOpen callback |
| Opening | <done> | — | Loading | fetchData() |
| Loading | FETCH_SUCCESS | — | Success | setData(response) |
| Loading | FETCH_ERROR | — | Error | setError(message) |
| Success | CLOSE | — | Closing | — |
| Error | CLOSE | — | Closing | — |
| Error | RETRY | — | Loading | fetchData() |
| Closing | <done> | — | Closed | onClose callback |
| Opening | CLOSE | — | Closing | — |

### Guards

| Guard | Expression | Purpose |
|-------|------------|---------|
| — | — | No guards needed for this model |

### Actions

| Action | Effect | Async? |
|--------|--------|--------|
| onOpen callback | Calls props.onOpen() if provided | No |
| fetchData() | GET /api/data, dispatches FETCH_SUCCESS or FETCH_ERROR | Yes |
| setData(r) | Stores response in context and updates content | No |
| setError(m) | Stores error message in context | No |
| onClose callback | Calls props.onClose() if provided | No |

### Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │                  CLOSE                      │
                    v                                             │
┌────────┐ TRIGGER ┌──────────┐ <done> ┌──────────┐             │
│ Closed │────────>│ Opening  │───────>│ Loading  │             │
└────────┘         └──┬───────┘        └────┬─────┘             │
                      │                     │                   │
                      │ CLOSE     ┌─────────┼───────┐           │
                      v           v         v       │           │
                  ┌────────┐ ┌─────────┐ ┌─────────┐ │          │
                  │Closing │ │ Success │ │  Error  │ │          │
                  └───┬────┘ └────┬────┘ └────┬────┘ │          │
                      │          │           │      │          │
                      │          │   RETRY   │      │          │
                      │          v           v      │          │
                      │      ┌──────────┐ ┌──────────┐│         │
                      │      │ Closing  │ │ Loading  ││         │
                      │      └──────────┘ └──────────┘│         │
                      │          │                    │         │
                      └──────────┴────────────────────┘         │
                                 <done>                         │
                                 v                              │
                             ┌────────┐                         │
                             │ Closed │─────────────────────────┘
                             └────────┘
```

---

## Invariants

The component MUST NEVER:

- Be in `Loading` and `Success` simultaneously
- Be in `Loading` and `Error` simultaneously
- Be in `Opening` and accept user input (it is animating)
- Allow dismissal while in `Loading`
- Enter an unnamed state

The component MUST ALWAYS:

- Return to `Closed` after `Closing` animation completes
- Handle CLOSE in `Opening` (go directly to `Closing`)
- Ignore CLOSE in `Loading` (dismissal blocked)

---

## Generated code (React + TypeScript)

```tsx
/* state-machine: Closed|Opening|Loading|Success|Error|Closing : TRIGGER|<done>|FETCH_SUCCESS|FETCH_ERROR|CLOSE|RETRY */

import { useState, useEffect, useCallback } from 'react';

type ModalState = 'Closed' | 'Opening' | 'Loading' | 'Success' | 'Error' | 'Closing';
type ModalEvent = 'TRIGGER' | '<done>' | 'FETCH_SUCCESS' | 'FETCH_ERROR' | 'CLOSE' | 'RETRY';

interface ModalData {
  content: unknown;
  error: string | null;
}

interface UseModalOptions {
  fetchData?: () => Promise<unknown>;
  onOpen?: () => void;
  onClose?: () => void;
}

const ANIMATION_DURATION_MS = 200;

function useModal(options: UseModalOptions = {}) {
  const [state, setState] = useState<ModalState>('Closed');
  const [data, setData] = useState<ModalData>({ content: null, error: null });

  const dispatch = useCallback((event: ModalEvent, payload?: unknown) => {
    setState(prev => {
      switch (prev) {
        case 'Closed':
          if (event === 'TRIGGER') {
            options.onOpen?.();
            return 'Opening';
          }
          return prev;

        case 'Opening':
          if (event === 'CLOSE') return 'Closing';
          if (event === '<done>') {
            fetchContent();
            return 'Loading';
          }
          return prev;

        case 'Loading':
          if (event === 'FETCH_SUCCESS') {
            setData({ content: payload, error: null });
            return 'Success';
          }
          if (event === 'FETCH_ERROR') {
            setData({ content: null, error: payload as string });
            return 'Error';
          }
          return prev;

        case 'Success':
          if (event === 'CLOSE') return 'Closing';
          return prev;

        case 'Error':
          if (event === 'CLOSE') return 'Closing';
          if (event === 'RETRY') return 'Loading';
          return prev;

        case 'Closing':
          if (event === '<done>') {
            options.onClose?.();
            return 'Closed';
          }
          return prev;

        default:
          return prev;
      }
    });
  }, [options]);

  const fetchContent = useCallback(async () => {
    if (!options.fetchData) return;
    try {
      const result = await options.fetchData();
      dispatch('FETCH_SUCCESS', result);
    } catch (err) {
      dispatch('FETCH_ERROR', err instanceof Error ? err.message : 'An error occurred');
    }
  }, [options.fetchData, dispatch]);

  const trigger = useCallback(() => dispatch('TRIGGER'), [dispatch]);
  const close = useCallback(() => dispatch('CLOSE'), [dispatch]);
  const retry = useCallback(() => dispatch('RETRY'), [dispatch]);

  useEffect(() => {
    if (state === 'Opening' || state === 'Closing') {
      const id = setTimeout(() => dispatch('<done>'), ANIMATION_DURATION_MS);
      return () => clearTimeout(id);
    }
  }, [state, dispatch]);

  return { state, data, trigger, close, retry, dispatch };
}

interface ModalProps extends UseModalOptions {
  renderContent?: (data: unknown) => React.ReactNode;
}

export function Modal({ fetchData, onOpen, onClose, renderContent }: ModalProps) {
  const { state, data, trigger, close, retry } = useModal({ fetchData, onOpen, onClose });

  if (state === 'Closed') return null;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {state === 'Opening' && <div className="modal-animating" />}

        {state === 'Loading' && (
          <div className="modal-loading">
            <span className="spinner" />
            <p>Loading...</p>
          </div>
        )}

        {state === 'Success' && (
          <div className="modal-body">
            <button className="modal-close" onClick={close}>&times;</button>
            {renderContent ? renderContent(data.content) : <p>Content loaded</p>}
          </div>
        )}

        {state === 'Error' && (
          <div className="modal-body">
            <button className="modal-close" onClick={close}>&times;</button>
            <div className="modal-error">
              <p className="error-message">{data.error}</p>
              <button onClick={retry}>Retry</button>
            </div>
          </div>
        )}

        {state === 'Closing' && <div className="modal-animating" />}
      </div>
    </div>
  );
}
```

---

## Generated tests (Vitest)

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModal } from './Modal';

describe('Modal state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('starts in Closed', () => {
    const { result } = renderHook(() => useModal());
    expect(result.current.state).toBe('Closed');
  });

  it('transitions Closed → Opening on TRIGGER', () => {
    const { result } = renderHook(() => useModal());
    act(() => result.current.dispatch('TRIGGER'));
    expect(result.current.state).toBe('Opening');
  });

  it('transitions Opening → Loading on <done>', () => {
    const { result } = renderHook(() => useModal());
    act(() => result.current.dispatch('TRIGGER'));
    act(() => result.current.dispatch('<done>'));
    expect(result.current.state).toBe('Loading');
  });

  it('transitions Loading → Success on FETCH_SUCCESS', () => {
    const { result } = renderHook(() => useModal({ fetchData: () => Promise.resolve('data') }));
    act(() => result.current.dispatch('TRIGGER'));
    act(() => result.current.dispatch('<done>'));
    act(() => vi.runAllTimers());
    expect(result.current.state).toBe('Success');
  });

  it('transitions Loading → Error on FETCH_ERROR', async () => {
    const { result } = renderHook(() => useModal({ fetchData: () => Promise.reject(new Error('fail')) }));
    act(() => result.current.dispatch('TRIGGER'));
    act(() => result.current.dispatch('<done>'));
    await act(async () => { /* flush promises */ });
    expect(result.current.state).toBe('Error');
  });

  it('transitions Success → Closing on CLOSE', () => {
    const { result } = renderHook(() => useModal({
      fetchData: () => Promise.resolve('data'),
    }));
    act(() => result.current.dispatch('TRIGGER'));
    act(() => result.current.dispatch('<done>'));
    act(() => result.current.dispatch('FETCH_SUCCESS'));
    act(() => result.current.dispatch('CLOSE'));
    expect(result.current.state).toBe('Closing');
  });

  it('transitions Error → Closing on CLOSE', () => {
    const { result } = renderHook(() => useModal());
    act(() => result.current.dispatch('TRIGGER'));
    act(() => result.current.dispatch('<done>'));
    act(() => result.current.dispatch('FETCH_ERROR'));
    act(() => result.current.dispatch('CLOSE'));
    expect(result.current.state).toBe('Closing');
  });

  it('transitions Error → Loading on RETRY', () => {
    const { result } = renderHook(() => useModal());
    act(() => result.current.dispatch('TRIGGER'));
    act(() => result.current.dispatch('<done>'));
    act(() => result.current.dispatch('FETCH_ERROR'));
    act(() => result.current.dispatch('RETRY'));
    expect(result.current.state).toBe('Loading');
  });

  it('transitions Closing → Closed on <done>', () => {
    const { result } = renderHook(() => useModal());
    act(() => result.current.dispatch('TRIGGER'));
    act(() => result.current.dispatch('CLOSE'));
    act(() => result.current.dispatch('<done>'));
    expect(result.current.state).toBe('Closed');
  });

  it('ignores CLOSE while in Loading', () => {
    const { result } = renderHook(() => useModal());
    act(() => result.current.dispatch('TRIGGER'));
    act(() => result.current.dispatch('<done>'));
    act(() => result.current.dispatch('CLOSE'));
    expect(result.current.state).toBe('Loading');
  });

  it('allows CLOSE from Opening (direct to Closing)', () => {
    const { result } = renderHook(() => useModal());
    act(() => result.current.dispatch('TRIGGER'));
    act(() => result.current.dispatch('CLOSE'));
    expect(result.current.state).toBe('Closing');
  });

  it('calls onOpen when TRIGGER fires', () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() => useModal({ onOpen }));
    act(() => result.current.dispatch('TRIGGER'));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('calls onClose when fully closed', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useModal({ onClose }));
    act(() => result.current.dispatch('TRIGGER'));
    act(() => result.current.dispatch('CLOSE'));
    act(() => result.current.dispatch('<done>'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

---

## XState v5 mapping

For teams using XState v5, the same model maps directly:

```ts
import { setup, assign } from 'xstate';

export const modalMachine = setup({
  types: {
    context: {} as {
      content: unknown;
      error: string | null;
    },
    events: {} as
      | { type: 'TRIGGER' }
      | { type: '<done>' }
      | { type: 'FETCH_SUCCESS'; data: unknown }
      | { type: 'FETCH_ERROR'; message: string }
      | { type: 'CLOSE' }
      | { type: 'RETRY' },
  },
  actions: {
    fetchData: () => { /* ... */ },
    setData: assign((_, params: { data: unknown }) => ({
      content: params.data,
      error: null,
    })),
    setError: assign((_, params: { message: string }) => ({
      error: params.message,
      content: null,
    })),
  },
}).createMachine({
  id: 'modal',
  initial: 'Closed',
  states: {
    Closed: {
      on: { TRIGGER: 'Opening' },
    },
    Opening: {
      after: { 200: 'Loading' },
      on: { CLOSE: 'Closing' },
    },
    Loading: {
      on: {
        FETCH_SUCCESS: { target: 'Success', actions: 'setData' },
        FETCH_ERROR: { target: 'Error', actions: 'setError' },
      },
    },
    Success: {
      on: { CLOSE: 'Closing' },
    },
    Error: {
      on: {
        CLOSE: 'Closing',
        RETRY: 'Loading',
      },
    },
    Closing: {
      after: { 200: 'Closed' },
    },
  },
});
```

Key differences from the vanilla React version:
- `<done>` is replaced with XState's `after` delay syntax
- Context mutations use `assign` instead of manual setState
- Events are typed in the `types.events` config
- The machine is a plain object, not a hook — usable in any framework via `@xstate/react`, `@xstate/vue`, etc.
