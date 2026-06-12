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

