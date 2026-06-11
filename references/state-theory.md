# State Theory for UI Components

> Operational rules, not academic theory. What the agent needs to know to model correctly.

---

## 1. Finite State Machine (FSM) — The 3 rules

A UI component is a valid FSM iff it satisfies all three:

### Rule 1: Finite states

The component can be in exactly **one** of a finite set of named states at any time.

```
✅ Good:  Closed, Opening, Loading, Success, Error, Closing
❌ Bad:  true, false, null, undefined, "some string"   (ad-hoc values)
❌ Bad:  isLoading, isError, isSuccess                  (booleans are not states)
```

A state name **must** be a noun or adjective describing what the user sees, not what the code is doing.

```
✅ Good:  Empty, Loading, Success, Error
❌ Bad:  fetching, loadingComplete, hasError    (these are events or flags)
```

### Rule 2: Deterministic transitions

From a given state, a given event always leads to the same next state (or stays in place).

```
✅ Good:  Loading + FETCH_SUCCESS → Success     (always)
❌ Bad:   Loading + FETCH_SUCCESS → sometimes Success, sometimes Error
❌ Bad:   Loading + FETCH_SUCCESS → undefined   (unhandled)
```

If the outcome depends on a condition, that condition must be a **named guard** (see Rule 4 in the Guards section).

### Rule 3: Complete transition table

Every (state, event) pair must be accounted for. The table must have `States × Events` rows, either handled or explicitly marked as "not handled" (component stays in place, no-op).

```
✅ Good:                                    ❌ Bad (missing rows):
                                           Loading → CLOSE:    ???
                                           Success → RETRY:    ???
```

---

## 2. Hierarchical FSM (HFSM) — When states contain states

Use nesting when a group of states share the same entry/exit behavior or when you need to reason about them as a group.

### When to nest

- A parent state always enters through the same child (e.g., `Authenticated` always starts in `Idle`)
- A parent state has exit transitions that apply to all children (e.g., `LOGOUT` from any child of `Authenticated` returns to `Unauthenticated`)
- A group of states share context (e.g., `Authenticated` has a `user` object that all children need)

### Notation

```
Authenticated (compound)
  ├── Idle         (initial)
  ├── Loading
  ├── Refreshing
  └── Error
```

When the component is in `Authenticated.Loading`, it is also in `Authenticated`. Events not handled by `Loading` bubble up to `Authenticated`.

### The bubble-up rule

If a child state does not handle an event, the parent state's handler for that event is used. If neither handles it, the event is unhandled (no-op).

```
Authenticated handles: LOGOUT → Unauthenticated
Loading does NOT handle: LOGOUT
→ When in Loading, LOGOUT fires LOGOUT on Authenticated → goes to Unauthenticated
```

### Nesting depth limit

Do not nest more than 3 levels deep. Deeper nesting indicates the model is over-engineered.

```
✅ Good:  Authenticated > Loading
✅ Good:  Authenticated > Form > Validating
❌ Bad:   App > Workspace > Panel > Section > Item > Editing > Validating
```

---

## 3. The boolean trap — Why booleans are not states

This is the single most common source of impossible UI states.

### The math

`n` independent booleans produce `2^n` possible combinations.

| Booleans | Combinations | Valid states (typical) | Waste |
|----------|-------------|----------------------|-------|
| 1        | 2           | 2                    | 0%    |
| 2        | 4           | 3                    | 25%   |
| 3        | 8           | 4                    | 50%   |
| 4        | 16          | 5                    | 69%   |
| 5        | 32          | 6                    | 81%   |

### The rule

A UI component MUST NOT use more than 1 boolean to represent mutually exclusive states. Replace `n` booleans with a single union type of `n+1` states.

```
❌ Bad:
const [isLoading, setIsLoading] = useState(false);
const [isError, setIsError] = useState(false);
const [isSuccess, setIsSuccess] = useState(false);
// 8 possible states, only 4 valid

✅ Good:
type State = 'Idle' | 'Loading' | 'Success' | 'Error';
const [state, setState] = useState<State>('Idle');
// 4 possible states, all 4 valid
```

### The audit rule

When auditing code, for every group of `n` booleans that appear together in conditionals, enumerate all `2^n` combinations and mark each as valid or impossible. This is the impossible-state analysis.

### Exception

A single boolean-toggle is acceptable for a trivial two-state component (e.g., `isOpen` for a simple toggle that has no loading/error states). But even then, a named state is preferred.

---

## 4. Events vs. States — The cardinal distinction

An event is something that **happens**. A state is something that **persists**.

| Event (happens once) | State (persists) |
|----------------------|-------------------|
| Button clicked | Modal is open |
| Network response received | Data is loading |
| Timer expired | Form is validating |
| User pressed Escape | Panel is collapsed |
| Form submitted | Request is in flight |

### The litmus test

If you can say "the component **is** <word>", it is a state. If you can say "the component **was** <word> **when** <something>", it is an event.

```
"the modal is loading"       → Loading is a state
"the modal finished loading" → FETCH_SUCCESS is an event (it happened, then state changed)
```

### Common mistake

Naming a state after the event that enters it:

```
❌ Bad:  State called "OnClick"       (an event, not a state)
❌ Bad:  State called "Fetching"      (ambiguous — is this Loading or Refreshing?)
✅ Good: State called "Loading"       (describes what user sees)
✅ Good: State called "Submitting"    (describes what user sees)
```

### Events are past-tense or imperative

```
FETCH_SUCCESS      ✅ (past tense — the fetch succeeded)
FETCH_ERROR        ✅ (past tense — the fetch errored)
CLOSE              ✅ (imperative — request to close)
SUBMIT             ✅ (imperative — request to submit)
fetching           ❌ (gerund — ambiguous with state)
```

---

## 5. Actions — Side effects are not transitions

An action is something that happens **because** a transition occurs. Actions must never change the state directly.

### The rule

State transitions are caused by events. Actions are triggered **after** the transition is computed. An action can dispatch new events, but it must not call `setState`.

```
Event arrives → Guard evaluates → Target state computed → Actions fire (in order)
                                                           ↓
                                                    Future events may be dispatched
```

### Action types

| Type | Example | Async? |
|------|---------|--------|
| Context mutation | `setData(response)` | No |
| Network call | `fetchData()` | Yes |
| Callback invocation | `props.onClose()` | No |
| Analytics | `trackEvent('modal_opened')` | No |
| DOM mutation | `scrollToTop()` | No |

### Action ordering

If multiple actions are listed for a single transition, they execute in the order listed. Async actions execute but the transition is already committed — the action result arrives as a **new event**.

```
Transition: Loading → Loading (self) on RETRY
Actions: [cancelPendingRequest(), fetchData()]

Order:
1. cancelPendingRequest()     (sync)
2. fetchData()                (async — dispatches FETCH_SUCCESS or FETCH_ERROR later)
```

### Anti-pattern: action that changes state

```
❌ Bad:
case 'FETCH_SUCCESS':
  setState('Success');        // transition
  setState('Idle');           // BUG: overrides the transition
  break;

✅ Good:
case 'FETCH_SUCCESS':
  setState('Success');        // only one transition per event
  resetForm();                // action, not transition
  break;
```

---

## 6. Guards — Conditional transitions

A guard is a **pure boolean function** that determines whether a transition is allowed. It is evaluated before the transition is taken.

### Guard naming

Guards are named as `has<Condition>`, `is<Condition>`, or `can<Action>`.

```
canDismiss    → props.dismissible === true
hasMinLength  → context.input.length >= 3
isLastStep    → context.step === totalSteps - 1
isFormValid   → !errors.some(e => e)
```

### Guard evaluation

If a guard returns `false`, the transition is not taken. The state does not change. The event is consumed (not re-dispatched).

If multiple guards apply to the same (state, event) pair, they are evaluated left-to-right and ALL must return true (AND logic). For OR logic, use separate event names.

```
| From    | Event  | Guard           | To       |
|---------|--------|-----------------|----------|
| Idle    | SUBMIT | hasMinLength    | Loading  |
| Idle    | SUBMIT | isFormValid     | Loading  |
# Both guards must pass → SUBMIT is only valid when input >= 3 AND form is valid
```

### Guard purity

A guard MUST NOT:
- Have side effects (no network calls, no mutations)
- Dispatch events
- Depend on random values
- Depend on time (except via explicit context)

---

## 7. The finite-ness guarantee

Every correctly modeled UI component satisfies:

```
∀ state ∈ States, ∀ event ∈ Events:
    ∃! transition(state, event) = (guard(state, event) → target(state, event), actions(state, event))
    ∨ transition(state, event) = noop
```

Or in English: For every possible state and every possible event, there is exactly one defined outcome — either a deterministic target state with a list of actions, or an explicit no-op.

No undefined behavior. No ghost states. No unhandled cases.

---

## Quick reference card

| Concept | Rule |
|---------|------|
| State names | Noun/adjective describing what user sees |
| Event names | Past-tense or imperative verb |
| Transition table | Every (state, event) pair accounted for |
| Booleans | Replace n booleans with a union of n+1 states |
| Actions | Never call setState — only dispatch events |
| Guards | Pure boolean functions, no side effects |
| Nesting | Max 3 levels, use for shared exit logic |
| Determinism | Same (state, event) → same target every time |

---

*This file is part of the state-machine skill. See SKILL.md for the full table of contents.*
