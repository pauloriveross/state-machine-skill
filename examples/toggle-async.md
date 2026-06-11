# Example: Async Toggle with Optimistic Update

## 1. Behavior Specification
A toggle switch that optimistically updates its visual state when clicked, sends the new value to the server, and reverts if the response is an error. Shows an error with a retry option. Disabled while a request is in-flight.

## 2. Structural Contract (`model.json`)
This JSON block strictly conforms to `schemas/fsm.schema.json` and is the artifact read by the linter.

```json
{
  "id": "async-toggle",
  "initial": "Off",
  "states": {
    "Off": {
      "type": "atomic",
      "on": {
        "TOGGLE": { "target": "PendingOn", "guard": "isOnline", "actions": ["setOptimistic", "patchServer"] }
      }
    },
    "PendingOn": {
      "type": "atomic",
      "on": {
        "CONFIRM": { "target": "On", "actions": ["onChange"] },
        "REJECT": { "target": "Error", "actions": ["rollback", "setError"] }
      }
    },
    "On": {
      "type": "atomic",
      "on": {
        "TOGGLE": { "target": "PendingOff", "guard": "isOnline", "actions": ["setOptimistic", "patchServer"] }
      }
    },
    "PendingOff": {
      "type": "atomic",
      "on": {
        "CONFIRM": { "target": "Off", "actions": ["onChange"] },
        "REJECT": { "target": "Error", "actions": ["rollback", "setError"] }
      }
    },
    "Error": {
      "type": "atomic",
      "on": {
        "DISMISS": { "target": "Off", "actions": ["clearError"] },
        "RETRY": { "target": "PendingOn", "guard": "isOnline", "actions": ["patchServer"] }
      }
    }
  }
}
```

## 3. Transition Diagram (ASCII)
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

## 4. Production Implementation (`implement`)
Reference code generated using the injectable core runtime from `src/core/fsm.ts`.

```ts
import { createLightMachine } from '../src/core/fsm';

// 1. Configuration identical to the JSON contract
const toggleConfig = {
  id: "async-toggle",
  initial: "Off",
  states: {
    Off: {
      type: "atomic",
      on: {
        TOGGLE: { target: "PendingOn", guard: "isOnline", actions: ["setOptimistic", "patchServer"] }
      }
    },
    PendingOn: {
      type: "atomic",
      on: {
        CONFIRM: { target: "On", actions: ["onChange"] },
        REJECT: { target: "Error", actions: ["rollback", "setError"] }
      }
    },
    On: {
      type: "atomic",
      on: {
        TOGGLE: { target: "PendingOff", guard: "isOnline", actions: ["setOptimistic", "patchServer"] }
      }
    },
    PendingOff: {
      type: "atomic",
      on: {
        CONFIRM: { target: "Off", actions: ["onChange"] },
        REJECT: { target: "Error", actions: ["rollback", "setError"] }
      }
    },
    Error: {
      type: "atomic",
      on: {
        DISMISS: { target: "Off", actions: ["clearError"] },
        RETRY: { target: "PendingOn", guard: "isOnline", actions: ["patchServer"] }
      }
    }
  }
};

// 2. Isolated side effects (Actions)
const implementations = {
  guards: {
    isOnline: () => typeof navigator !== 'undefined' ? navigator.onLine : true
  },
  actions: {
    setOptimistic: (context: any) => {
      context.previousState = context.currentState;
    },
    patchServer: async (context: any, event: any) => {
      try {
        await fetch('/api/toggle', { method: 'PATCH', body: JSON.stringify({ value: context.targetValue }) });
        machine.send({ type: 'CONFIRM' }, context);
      } catch (err) {
        machine.send({ type: 'REJECT', message: (err as Error).message }, context);
      }
    },
    onChange: (context: any, event: any) => { /* props.onChange callback */ },
    rollback: (context: any) => { context.currentState = context.previousState; },
    setError: (context: any, event: any) => { context.error = event.message; },
    clearError: (context: any) => { context.error = null; }
  }
};

// 3. Component / Machine initialization
let context = { currentState: 'Off', previousState: 'Off', targetValue: false, error: null };
const machine = createLightMachine(toggleConfig, implementations, (nextState) => {
  console.log(`UI Update: Render toggle in state [${nextState}]`);
});
```
