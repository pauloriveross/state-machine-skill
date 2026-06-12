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

