# Slop Gates — 38 Validation Gates

> Every output from this skill must pass all applicable gates before being emitted.
> If a gate fails: stop, report which gate failed, and provide instructions to fix.

## How gates work

```
model     → gates 1–13  (model integrity)
implement → gates 1–23  (model + code integrity)
audit     → gates 24–38 (audit integrity)
```

Each gate is a yes/no question. Answer `NO` → failure. The agent MUST stop and report:

```
❌ GATE 0X FAILED: <gate name>
   Problem: <description of what is wrong>
   Fix: <specific instructions to correct>
```

Do NOT proceed to the next gate until the current failure is resolved.
Do NOT emit any output until all gates pass.

---

## Model gates (1–13)

Run these on every model, whether from `model`, `implement`, or any derived workflow.

### Gate 01 — At least 2 states

**Check:** Does the model define at least 2 named states?

**Why:** A machine with 1 state cannot transition anywhere. It is not a machine.

**Fail example:**
```
States: [Loading]
→ A single-state machine cannot model any behavior change.
```

**Pass example:**
```
States: [Closed, Open]
→ 2 states, transitions possible between them.
```

**Fix:** Add at least one additional state. Even a trivial machine needs two states (e.g., Off/On).

---

### Gate 02 — At least 1 transition

**Check:** Does the transition table have at least 1 row?

**Why:** States without transitions are dead. The machine can enter them but never leave.

**Fail example:**
```
Transitions: (empty)
→ States exist but nothing connects them.
```

**Pass example:**
```
| From   | Event | To   |
|--------|-------|------|
| Closed | OPEN  | Open |
```

**Fix:** Define at least one transition between two different states, or add a self-transition with an action.

---

### Gate 03 — Exactly 1 initial state

**Check:** Is there exactly one state marked as initial (first listed, or annotated)?

**Why:** Zero initial states means the machine cannot start. Two means ambiguous startup.

**Fail examples:**
```
States: [Closed, Open]  ← which one is initial?
States: [Closed*, Open*] ← two initials
```

**Pass example:**
```
States: [Closed, Open]
Closed is the initial state. ← explicitly stated or first in list
```

**Fix:** Designate exactly one state as initial. List it first in the states table.

---

### Gate 04 — Every state reachable (except initial)

**Check:** Does every non-initial state have at least one incoming transition?

**Why:** A state with no incoming transitions can never be entered. It is dead code.

**Fail example:**
```
States: Closed*, Error
Transitions: [Closed → OPEN → Open]
Error has no incoming transition → unreachable.
```

**Pass example:**
```
States: Closed*, Open, Error
Transitions:
  Closed → OPEN → Open
  Open   → FAIL → Error
  Closed → FAIL → Error  (Error has at least one incoming path)
```

**Fix:** Add at least one transition that targets each non-initial state. Or remove the unreachable state.

---

### Gate 05 — Terminal state or valid cycle

**Check:** Does the machine have at least one terminal state OR a guaranteed cycle that prevents deadlock?

**Why:** A machine with no terminal state must cycle back to the initial state or some active state. Otherwise the component reaches a dead state and the user is stuck.

**Fail example:**
```
States: Step1*, Step2, Done
Transitions: [Step1 → NEXT → Step2]
Step2 has no outgoing transitions and is not terminal → deadlock.
```

**Pass examples:**
```
States: Step1*, Step2, Done
Transitions:
  Step1 → NEXT → Step2
  Step2 → NEXT → Done    ← Done is terminal; user can restart externally
```
```
States: Off*, On
Transitions:
  Off → TOGGLE → On
  On  → TOGGLE → Off     ← infinite cycle, no terminal state needed
```

**Fix:** Either mark one or more states as terminal (component exits, resets, or becomes inert), or ensure there is a cycle that returns to an active state.

---

### Gate 06 — State names are nouns or adjectives

**Check:** Are all state names nouns or adjectives describing what the user sees, not verbs describing what the code is doing?

**Why:** Verb-named states create confusion between states and events. `Loading` is a state (user sees a spinner). `load` is an event.

**Scoring (0–1):** The validator assigns a score to each name. Names scoring ≥ 0.7 produce **warnings** (printed, non-blocking). Names scoring < 0.7 produce **errors** (blocking).

| Score | Meaning | Example |
|-------|---------|---------|
| 1.0 | Perfect — known allowlist or clear noun/adjective | `Closed`, `Success` |
| 0.7–0.99 | Acceptable — minor convention mismatch | PascalCase `OnClick` (mild warning) |
| 0.3–0.6 | Marginal — name looks like boolean or verb | `isLoading`, `fetchData` |
| < 0.3 | Fail — strongly violates naming rules | `fetching data` (spaces + verb) |

**Allowlist:** Common -ing state names are pre-approved: Loading, Opening, Closing, Uploading, Downloading, Searching, Validating, Submitting, Authenticating, Refreshing, etc.

**Fail names:**
```
fetching       (gerund/verb)
onClick        (event)
loadingData    (verb phrase)
hasError       (boolean pattern)
```

**Pass names:**
```
Loading        (adjective — user sees a spinner)
Success        (noun — user sees content)
Error          (noun — user sees error message)
Closed         (adjective — modal is hidden)
Empty          (adjective — no data)
```

**Fix:** Rename each state to a noun or adjective. Use the "what does the user see?" test.

---

### Gate 07 — Event names are past-tense or imperative verbs

**Check:** Are event names past-tense (FETCH_SUCCESS) or imperative (SUBMIT, CANCEL, RETRY)?

**Why:** Events are actions that happen. Past tense for reactive events (server responded). Imperative for user-triggered events.

**Scoring (0–1):** Same score system as Gate 06. ≥ 0.7 = warning, < 0.7 = error.

| Score | Meaning | Example |
|-------|---------|---------|
| 1.0 | Perfect SCREAMING_SNAKE_CASE | `FETCH_SUCCESS`, `SUBMIT` |
| 0.8 | PascalCase — acceptable, warning issued | `FetchSuccess`, `Submit` |
| 0.4–0.5 | Lowercase or ambiguous | `fetchSuccess`, `data` |
| 0.3 | Gerund — strongly discouraged | `loading`, `fetching` |

**Internal events** (`<done>`, `<error>`) are skipped automatically (score: 1.0).

**Fail names:**
```
loading             (gerund — ambiguous with state)
success             (noun — is this a state or event?)
data                (noun — unclear what happened)
toggle              (OK as imperative, but ambiguous if it's both event and state)
```

**Pass names:**
```
FETCH_SUCCESS       (past tense — server response)
FETCH_ERROR         (past tense — server error)
SUBMIT              (imperative — user action)
CANCEL              (imperative — user action)
RETRY               (imperative — user action)
DISMISS             (imperative — user action)
TIMEOUT             (noun but clear — timer expired)
```

**Fix:** Rename each event to past tense or imperative. Use SCREAMING_SNAKE_CASE convention to distinguish events from states.

---

### Gate 08 — No unreachable states

**Check:** Starting from the initial state and following every transition, can every state be reached?

**Why:** Unreachable states are dead code. They add complexity without ever being used.

**Fail example:**
```
States: A*, B, C
Transitions: [A → EV1 → B]
C has no incoming path → unreachable.
```

**Pass example:**
```
States: A*, B, C
Transitions:
  A → EV1 → B
  B → EV2 → C
```

**Fix:** Trace the reachability graph. Add transitions to unreachable states, merge them with reachable states, or remove them.

---

### Gate 09 — No dead non-terminal states

**Check:** Does every non-terminal state have at least one outgoing transition?

**Why:** A non-terminal state with no outgoing transitions is a dead end. The user is stuck.

**Fail example:**
```
States: Step1*, Step2
Transitions: [Step1 → NEXT → Step2]
Step2 has no transitions out and is not terminal → stuck.
```

**Pass example:**
```
States: Step1*, Step2, Done
Transitions:
  Step1 → NEXT → Step2
  Step2 → NEXT → Done
Step2 has an outgoing transition. Done is terminal.
```

**Fix:** Add outgoing transitions to all non-terminal states, or mark the state as terminal.

---

### Gate 10 — No duplicate (state, event) pairs

**Check:** Does the transition table have two or more rows with the same (From, Event) pair but no guards to distinguish them?

**Why:** Without guards, the machine cannot decide which transition to take. Non-deterministic.

**Fail example:**
```
| From | Event | To       |
|------|-------|----------|
| Idle | SUBMIT | Loading |
| Idle | SUBMIT | Error   |  ← non-deterministic
```

**Pass example:**
```
| From | Event | Guard        | To       |
|------|-------|--------------|----------|
| Idle | SUBMIT | isFormValid | Loading  |
| Idle | SUBMIT | !isFormValid| Error    |
```

**Fix:** Add guards to distinguish duplicate (state, event) pairs, or merge them into a single deterministic transition.

---

### Gate 11 — Actions node is declared

**Check:** Does the model have a top-level `actions` (or `effects`) node that declares every side effect the machine can perform?

**Why:** Side effects (API calls, callbacks, timers, animations) must be declared explicitly so the framework can bind them to state transitions. Undeclared side effects cannot be tested, traced, or guarded.

**Fail examples:**
```json
{ "states": ["A*", "B"], "transitions": [...] }
// No "actions" node — side effects are invisible to the framework
```

```json
{ "actions": [null, ""] }
// Array contains invalid entries
```

**Pass example:**
```json
{
  "states": ["Closed*", "Opening", "Loading"],
  "transitions": [...],
  "actions": {
    "onOpen":  { "description": "Opens the modal", "async": false },
    "fetchData": { "description": "Fetches API data", "async": true }
  }
}
```

**Fix:** Add an `actions` node as either:
- An **object map** where each key is a camelCase action name and each value is a descriptor `{ description, async }`.
- An **array** of action name strings or `{ name, description, async }` objects.

---

### Gate 12 — Transition actions reference declared actions

**Check:** Does every action name in the transition `Actions` column correspond to a key in the top-level `actions` node?

**Why:** An action called in a transition but not declared in the `actions` node cannot be bound by the framework. The component would crash at runtime.

**Fail example:**
```json
{
  "transitions": [{ "From": "A", "Event": "GO", "To": "B", "Actions": "onGo" }],
  "actions": { "onOpen": {} }
}
// "onGo" is not declared in "actions"
```

**Pass example:**
```json
{
  "transitions": [{ "From": "A", "Event": "GO", "To": "B", "Actions": "onGo" }],
  "actions": { "onGo": {}, "onOpen": {} }
}
```

**Fix:** Either add the missing action to the `actions` node, or correct the transition's Actions column to use a declared action name.

---

### Gate 13 — State lifecycle actions reference declared actions

**Check:** For state objects that declare `onEnter` or `onExit` lifecycle hooks, do the referenced action names exist in the top-level `actions` node?

**Why:** Lifecycle hooks that reference undeclared actions cannot be bound by the framework, leaving the machine in an unpredictable state during entry/exit.

**Fail example:**
```json
{
  "states": ["A*", { "name": "B", "onEnter": "setup" }],
  "actions": { "teardown": {} }
}
// "setup" is referenced by B.onEnter but not declared in "actions"
```

**Pass example:**
```json
{
  "states": ["A*", { "name": "B", "onEnter": "setup", "onExit": "teardown" }],
  "actions": { "setup": {}, "teardown": {} }
}
```

**Fix:** Add the missing action to the `actions` node, or correct the state's `onEnter`/`onExit` to reference a declared action.

---

## Implementation gates (14–23)

Run these on every generated implementation, in addition to gates 1–13.

### Gate 14 — State render branches match model states

**Check:** Does every `switch` / `if-else` render branch correspond to exactly one state in the model? Are there extra branches or missing branches?

**Why:** Extra branches add states not in the model. Missing branches leave states without visual representation.

**Fail example:**
```tsx
switch (state) {
  case 'Closed': return null;
  case 'Open': return <Content />;
  // Error state exists in model but has no branch
}
```

**Pass example:**
```tsx
switch (state) {
  case 'Closed': return null;
  case 'Loading': return <Spinner />;
  case 'Success': return <Content />;
  case 'Error': return <ErrorView />;
}
```

**Fix:** Add or remove render branches to match the state list exactly.

---

### Gate 15 — No redundant boolean flags

**Check:** Does the implementation avoid storing boolean flags that could be derived from the current state?

**Why:** Each redundant boolean doubles the possible states. See the Boolean Trap in state-theory.md.

**Fail example:**
```tsx
const [state, setState] = useState('Idle');
const [isLoading, setIsLoading] = useState(false);  // REDUNDANT: derived from state === 'Loading'
```

**Pass example:**
```tsx
const [state, setState] = useState('Idle');
const isLoading = state === 'Loading';  // derived
```

**Fix:** Replace each boolean flag with `state === '<StateName>'`. Remove the useState/useRef for the flag.

---

### Gate 16 — Impossible state combinations impossible

**Check:** Is there any code path that can produce two mutually exclusive states simultaneously?

**Why:** The whole point of the skill. The code must structurally prevent the anti-patterns in impossible-states.md.

**Fail example:**
```tsx
if (isError) setState('Error');
if (data) setState('Success');
// Both can execute in the same render cycle → ambiguous state
```

**Pass example:**
```tsx
if (event === 'FETCH_SUCCESS') setState('Success');
if (event === 'FETCH_ERROR') setState('Error');
// Mutually exclusive — only one fires per event
```

**Fix:** Ensure all state changes happen through a single dispatch function that processes one event at a time. No direct `setState` calls outside dispatch.

---

### Gate 17 — Each event handler dispatches exactly 1 event to the machine

**Check:** Does each user interaction (click, keypress, network response) dispatch exactly one event to the state machine?

**Why:** Dispatching multiple events in one handler causes intermediate states that were never modeled.

**Fail example:**
```tsx
function handleClick() {
  dispatch('CLOSE');      // Closing
  dispatch('RESET');      // tries to transition from Closing → NOT IN MODEL
}
```

**Pass example:**
```tsx
function handleClick() {
  dispatch('CLOSE');
  // <done> event is dispatched internally after animation completes
}
```

**Fix:** Each handler fires one event. If two things need to happen, define a single composite event or chain through <done>.

---

### Gate 18 — Side effects are in actions, not transitions

**Check:** Is every side effect (network call, callback, analytics, DOM mutation) defined as a named action in the model and called from the transition's action list, not inline in the dispatch function?

**Why:** Side effects mixed with transition logic make the machine non-deterministic and hard to test.

**Fail example:**
```tsx
function dispatch(event) {
  if (state === 'Idle' && event === 'SUBMIT') {
    setState('Submitting');
    fetch('/api/submit', { ... });  // side effect inline
  }
}
```

**Pass example:**
```tsx
function dispatch(event) {
  if (state === 'Idle' && event === 'SUBMIT') {
    setState('Submitting');
    onSubmit(formData);  // named action
  }
}
```

**Fix:** Extract every side effect into a named action function. Call the action by name from the transition handler.

---

### Gate 19 — Async actions dispatch events on completion

**Check:** Does every async action (network call, timer, animation) dispatch SUCCESS/ERROR events when it completes?

**Why:** Async actions that don't dispatch events leave the machine with no way to know the operation finished.

**Fail example:**
```tsx
async function fetchData() {
  const response = await api.get('/data');
  // response received but no event dispatched
  // machine stays in Loading forever
}
```

**Pass example:**
```tsx
async function fetchData() {
  try {
    const response = await api.get('/data');
    dispatch('FETCH_SUCCESS', response.data);
  } catch (err) {
    dispatch('FETCH_ERROR', err.message);
  }
}
```

**Fix:** Every async action must dispatch an event on both success and failure paths.

---

### Gate 20 — <done> events have timeouts or guards

**Check:** For every <done> event (used for animations, transitions, delays), is there a timeout or guard that prevents infinite waiting?

**Why:** A <done> event that never fires leaves the machine stuck in a transient state forever.

**Fail example:**
```
Opening → <done> → Open
// <done> depends on an animation that might never fire
// (e.g., CSS animation is removed during a refactor)
```

**Pass example:**
```
Opening → <done> → Open
// <done> has a fallback timeout of 300ms
// If animationend doesn't fire, timeout dispatches <done>
```

**Fix:** Add a timeout or maximum duration for every transient state. The machine should have a fallback path.

---

### Gate 21 — Guards are pure functions

**Check:** Is every guard a pure function (no side effects, no randomness, no network calls, no state mutations)?

**Why:** Impure guards make the machine non-deterministic and untestable.

**Fail example:**
```
Guard: isOnline()
Implementation: navigator.onLine  ← impure (depends on external state)
```

OK, this is impure but necessary. The rule is: **guard purity is aspirational but must be documented**. For impure guards:
1. The impurity must be documented in the guard definition.
2. The guard must be testable (mockable).

**Fail example:**
```
Guard: isLucky()
Implementation: Math.random() > 0.5  ← non-deterministic, untestable
```

**Fix:** Remove non-deterministic guards. Replace with explicit events (e.g., `WIN` / `LOSE` instead of `isLucky()`).

---

### Gate 22 — Context is initialized and reset correctly

**Check:** Does the model specify what context (data, error messages, form values) is initialized on entering each state? Is stale context cleared?

**Why:** Stale context from a previous state leaks and causes the anti-patterns in impossible-states.md (#9, #22, #29).

**Fail example:**
```
Entering Success: (no action specified)
// data from a previous session might still be in context
```

**Pass example:**
```
Entering Success: (setData(response))
// data is explicitly set when entering Success

Entering Loading: (clearData())
// stale data is cleared when entering Loading
```

**Fix:** For each state transition, specify which context variables are set, cleared, or preserved. Add entry actions to clear stale data.

---

### Gate 23 — Unit test covers every transition row

**Check:** Does the generated test suite have one `it()` for each row of the transition table?

**Why:** Missing test = no guarantee that the transition works.

**Fail example:**
```
Transition table has 6 rows.
Test suite has 4 tests.
→ 2 transitions untested.
```

**Pass example:**
```
Transition table has 6 rows.
Test suite has 6 tests, one per row.
→ Full coverage.

Each test:
  1. Set up the initial state
  2. Dispatch the event
  3. Assert the resulting state
  4. Assert the actions (if applicable)
```

**Fix:** Generate one test per transition row. Each test must assert the target state and verify any actions were called.

---

## Audit gates (24–38)

Run these on every audit output, in addition to gates 1–13.

### Gate 24 — Audit correctly reconstructed all implicit states

**Check:** Does the reconstructed model cover all code paths in the audited component?

**Why:** Missing a code path means the audit is incomplete and the user gets a false sense of security.

**Fail example:**
```
Component has a ternary: isLoading ? <Spinner /> : data ? <Content /> : <Empty />
Reconstructed model only has [Loading, Success]
→ Missing Empty state.
```

**Pass example:**
```
Reconstructed model: [Empty, Loading, Success, Error]
→ All four render branches accounted for.
```

**Fix:** Trace every conditional render path in the component. Map each to a reconstructed state. If a path has no matching state, add it.

---

### Gate 25 — Boolean explosion enumerated

**Check:** Did the audit enumerate all 2^n combinations of boolean flags used in the component?

**Why:** Without enumerating, the user doesn't see the full scope of the boolean trap.

**Fail example:**
```
Found booleans: isLoading, isError
2^2 = 4 combinations enumerated:
  isLoading=false, isError=false → OK (Idle or Success)
  isLoading=true,  isError=false → OK (Loading)
  isLoading=false, isError=true  → OK (Error)
  isLoading=true,  isError=true  → IMPOSSIBLE
```

**Pass example:**
Same as above — all 4 combinations listed, each marked valid or impossible.

**Fix:** For every group of n booleans used together in conditionals, list all 2^n combinations and mark each as valid or impossible.

---

### Gate 26 — Each impossible state has a severity

**Check:** Does every detected impossible state have a severity rating (🔴 High, 🟡 Medium, 🟢 Low)?

**Why:** Without severity, the user doesn't know what to fix first.

**Fail example:**
```
isLoading && isError → impossible
// No severity rating
```

**Pass example:**
```
🔴 High: isLoading && isError
   Can't load and error simultaneously. Render is undefined.
```

**Fix:** Rate each impossible state:
- 🔴 High: causes render crash, wrong data display, or user gets stuck
- 🟡 Medium: causes confusing UI but no data loss
- 🟢 Low: causes minor visual glitch, no functional impact

---

### Gate 27 — Unhandled transitions identified across ALL states

**Check:** For each event the component can receive, did the audit check every state for the handler?

**Why:** An event might be handled in one state but not another. The audit must check all combinations.

**Fail example:**
```
Event: CLOSE
Checked: Open, Loading
Not checked: Error, Success
→ CLOSE might be unhandled in Error/Success.
```

**Pass example:**
```
Event: CLOSE
Checked all states: Open, Loading, Error, Success
Unhandled in: Loading ← identified as 🔴 High
```

**Fix:** Build a state × event matrix for the reconstructed model. Check each cell for handler presence.

---

### Gate 28 — Audit report sorted by severity

**Check:** Is the punch list sorted with 🔴 High issues first, then 🟡 Medium, then 🟢 Low?

**Why:** Sorting by severity helps the user prioritize fixes.

**Fail example:**
```
🟢 Low: Minor animation flicker
🔴 High: isLoading && isError simultaneously
// High severity buried at the bottom
```

**Pass example:**
```
🔴 High: isLoading && isError simultaneously
🔴 High: CLOSE not handled in Loading
🟡 Medium: No explicit Idle state
🟢 Low: Minor animation flicker
```

**Fix:** Reorder the punch list so 🔴 High items appear first.

---

### Gate 29 — Detected "Loading with data" (anti-pattern #1)

**Check:** Did the audit detect when both a loading flag and data are simultaneously present?

**Detection pattern:**
```tsx
const [isLoading, setIsLoading] = useState(...);
const [data, setData] = useState(...);
// Both defined as independent state variables
```

**Why:** Anti-pattern #1. The component can be loading and have data simultaneously, producing a spinner-over-content race.

**Fix:** Report as 🔴 High. Recommend replacing with named states: Empty, Loading, Success, Error.

---

### Gate 30 — Detected "Error without message" (anti-pattern #2)

**Check:** Did the audit detect when an error flag is true but the error message is null/empty?

**Detection pattern:**
```tsx
const [isError, setIsError] = useState(false);
const [error, setError] = useState(null);
// Can set isError=true while error=null
```

**Fix:** Report as 🔴 High. Recommend tying error message to error state: Error(message) where message is required.

---

### Gate 31 — Detected "Open and closing simultaneously" (anti-pattern #4)

**Check:** Did the audit detect overlapping boolean flags for different animation phases?

**Detection pattern:**
```tsx
const [isOpen, setIsOpen] = useState(false);
const [isAnimating, setIsAnimating] = useState(false);
```

**Fix:** Report as 🟡 Medium. Recommend 4 named states: Closed, Opening, Open, Closing.

---

### Gate 32 — Detected "Authenticated without user" (anti-pattern #5)

**Check:** Did the audit detect when auth state and user object are stored independently?

**Detection pattern:**
```tsx
const [isAuthenticated, setIsAuthenticated] = useState(false);
const [user, setUser] = useState(null);
```

**Fix:** Report as 🔴 High. Recommend Authenticated(user) state with mandatory user payload.

---

### Gate 33 — Detected "Multiple overlays" (anti-pattern #11)

**Check:** Did the audit detect independent boolean flags for modal, drawer, popover, etc.?

**Detection pattern:**
```tsx
const [showModal, setShowModal] = useState(false);
const [showDrawer, setShowDrawer] = useState(false);
```

**Fix:** Report as 🟡 Medium. Recommend a single overlay state machine with one active overlay at a time.

---

### Gate 34 — Detected "Submit while invalid" (anti-pattern #8)

**Check:** Did the audit detect form submission logic that depends on a guard outside the transition?

**Detection pattern:**
```tsx
function handleSubmit(e) {
  e.preventDefault();
  if (!isFormValid) return;  // guard lives here, not in the machine
  setIsSubmitting(true);
}
```

**Fix:** Report as 🔴 High. Recommend moving the guard into the transition: Dirty → SUBMIT → if isFormValid → Submitting else → Validating.

---

### Gate 35 — Detected "Page > total pages" (anti-pattern #17)

**Check:** Did the audit detect unbounded pagination integers?

**Detection pattern:**
```tsx
const [currentPage, setCurrentPage] = useState(1);
// setCurrentPage(n) with no upper/lower guard
```

**Fix:** Report as 🟡 Medium. Recommend states: Active(currentPage) with guards on NEXT/PREV, plus EndOfList terminal state.

---

### Gate 36 — Detected "Dirty but untouched" (anti-pattern #18)

**Check:** Did the audit detect dirty flag that can be true without any field being touched?

**Detection pattern:**
```tsx
const [isDirty, setIsDirty] = useState(false);
const [touched, setTouched] = useState({});
// isDirty can be set without touching any field
```

**Fix:** Report as 🟢 Low. Recommend deriving isDirty from state (Idle vs Dirty) and only entering Dirty via a CHANGE event.

---

### Gate 37 — Detected "Checked and disabled" (anti-pattern #20)

**Check:** Did the audit detect a checkbox or toggle that is both checked and disabled?

**Detection pattern:**
```tsx
<input type="checkbox" checked={true} disabled={true} />
```

**Fix:** Report as 🟢 Low. Recommend either using a read-only variant (no checkbox) or distinguishing interactive vs. read-only states.

---

### Gate 38 — Detected "Progress 100% but not complete" (anti-pattern #27)

**Check:** Did the audit detect progress/percentage stored independently from a completion state?

**Detection pattern:**
```tsx
const [progress, setProgress] = useState(0);
const [status, setStatus] = useState('uploading');
// progress can reach 100 while status stays 'uploading'
```

**Fix:** Report as 🟡 Medium. Recommend auto-transition from Uploading(progress) to Complete when progress >= 100.

---

## Gate failure protocol

When a gate fails:

```
❌ GATE <NN> FAILED: <gate name>
   Problem: <specific what and where>
   Fix: <step-by-step instructions>
```

The agent MUST NOT:
- Emit any output (model, code, or audit report)
- Proceed to the next gate
- Attempt to "work around" the failed gate

The agent MUST:
- Stop immediately
- Report the failure with problem and fix
- Wait for the user to resolve or instruct

## Gate pass protocol

When all applicable gates pass:

```
✅ All gates passed.
<emit output>
```

### Warnings (non-blocking)

Gates 06 and 07 use a **score/tolerance** system. Names that partially match the convention (score ≥ 0.7) produce **warnings** instead of errors. Warnings are printed to stdout and do not block the process:

```
⚠️  [Gate 06 / OnClick] "OnClick" looks like an event handler (on*) pattern.
    State names should be nouns or adjectives describing what the user sees.
```

Warnings are informational. The user may choose to address them or ignore them.

### External semantic validation

An optional **external validator hook** can be registered in `scripts/linguistic-analyzer.js` via `setExternalValidator(fn)`. When configured and a name scores in the marginal range (0.5–0.99), the external validator (NLP function or LLM call) can confirm the name's validity and raise its score. If the external tool approves, the gate passes with an **attenuated approval flag**:

```
✓ External validator confirmed "OnClick" as a valid state name (score: 0.85)
```

This is purely opt-in. The default behavior uses only the built-in regex patterns.

---

*This file is part of the state-machine skill. See SKILL.md for the full table of contents.*
