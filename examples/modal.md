# Example: Modal Component with Async Loading

## 1. Behavior Specification
A modal component that opens on a trigger event, shows a loading spinner while fetching data, transitions to success or error based on the result, and allows closing or retrying the operation.

## 2. Structural Contract (`model.json`)
This JSON block strictly conforms to `schemas/fsm.schema.json` and is the artifact read by the linter.

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
        "FETCH_ERROR": { "target": "Error", "actions": ["logError"] },
        "CLOSE": { "target": "Closed", "actions": ["abortFetch"] }
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

## 3. Transition Diagram (ASCII)
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

## 4. Production Implementation (`implement`)
Reference code generated using the injectable core runtime from `src/core/fsm.ts`.

```ts
import { createLightMachine } from '../src/core/fsm';

// 1. Configuration identical to the JSON contract
const modalConfig = {
  id: "async-modal",
  initial: "Closed",
  states: {
    Closed: { type: "atomic", on: { TRIGGER: { target: "Loading" } } },
    Loading: {
      type: "atomic",
      onEnter: ["fetchData"],
      on: {
        FETCH_SUCCESS: { target: "Success", actions: ["storeData"] },
        FETCH_ERROR: { target: "Error", actions: ["logError"] },
        CLOSE: { target: "Closed", actions: ["abortFetch"] }
      }
    },
    Success: { type: "atomic", on: { CLOSE: { target: "Closed", actions: ["clearData"] } } },
    Error: { type: "atomic", on: { RETRY: { target: "Loading" }, CLOSE: { target: "Closed" } } }
  }
};

// 2. Isolated side effects (Actions)
const implementations = {
  actions: {
    fetchData: async (context: any, event: any) => {
      try {
        const res = await fetch('/api/data');
        const data = await res.json();
        machine.send({ type: 'FETCH_SUCCESS', data }, context);
      } catch (err) {
        machine.send({ type: 'FETCH_ERROR', err }, context);
      }
    },
    storeData: (context: any, event: any) => { context.data = event.data; },
    logError: (context: any, event: any) => { console.error(event.err); },
    abortFetch: () => { /* AbortController logic */ },
    clearData: (context: any) => { context.data = null; }
  }
};

// 3. Component / Machine initialization
let context = { data: null };
const machine = createLightMachine(modalConfig, implementations, (nextState) => {
  console.log(`UI Update: Render view for state [${nextState}]`);
  // The framework (React/Vue) maps state directly to UI here
});
```
