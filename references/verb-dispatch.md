# Verb Dispatch

> Public API of the state-machine skill. Every request must start with one of these three verbs.

## How dispatch works

The skill router reads the first word of the request. That word determines the pipeline:

```
Request starts with "model"     → pipeline: NL → formal model → validation → output
Request starts with "implement" → pipeline: NL → model → validation → code + tests
Request starts with "audit"     → pipeline: code → reverse-model → analysis → report
```

If the request does not start with one of these three verbs, the router prepends `model` and treats the entire request as the behavior description.

---

## `model`

**Purpose:** Transform a natural-language behavior description into a provably-correct finite state machine model.

**Syntax:**
```
model <behavior description>
```

**Input:** A description of what the component should do. The description must cover what the user sees, what events happen, and what side effects occur.

**Example input:**
```
model a modal dialog that opens when a button is clicked, shows a loading spinner while fetching data, displays content on success or an error message on failure, and closes when the user clicks the close button or presses Escape
```

### Output requirements

You MUST produce each of the following sections, in order:

#### 1. Named states with clear semantics

List every state the component can occupy. Each state has:
- **Name** (PascalCase)
- **Description** (what the user sees)
- **Is it a final/terminal state?** (yes/no)

```
### States

| State        | Description                          | Terminal |
|--------------|--------------------------------------|----------|
| Closed       | Modal is not visible                 | No       |
| Opening      | Modal is animating in                | No       |
| Loading      | Spinner is visible, fetching data    | No       |
| Success      | Content is displayed                 | No       |
| Error        | Error message is displayed           | No       |
| Closing      | Modal is animating out               | No       |
```

Empty/atoms states MUST be listed first. The initial state is always listed first.

#### 2. Transition table

A complete state × event matrix. Every (state, event) pair maps to exactly one of:
- A target state
- A guard expression (conditionally selects target)
- The same state (self-transition, allowed only with an action)
- "Not handled" (explicitly documented — component stays in place)

Format:

```
### Transitions

| From        | Event         | Guard          | To        | Actions                 |
|-------------|---------------|----------------|-----------|-------------------------|
| Closed      | OPEN          | —              | Opening   | onOpen callback         |
| Opening     | <done>        | —              | Loading   | fetchData()             |
| Loading     | FETCH_SUCCESS | —              | Success   | setData(response)       |
| Loading     | FETCH_ERROR   | —              | Error     | setError(err)           |
| Success     | CLOSE         | —              | Closing   | —                       |
| Error       | CLOSE         | —              | Closing   | —                       |
| Error       | RETRY         | —              | Loading   | fetchData()             |
| Closing     | <done>        | —              | Closed    | onClose callback        |
| Any except  | CLOSE         | isDismissible  | Closing   | —                       |
```

The header row MUST use exactly these column names: `From`, `Event`, `Guard`, `To`, `Actions`.

#### 3. Guard definitions

Every guard referenced in the transition table must be defined here. A guard is a pure boolean function with a single responsibility.

```
### Guards

| Guard           | Expression                           | Purpose                         |
|-----------------|--------------------------------------|---------------------------------|
| isDismissible   | props.dismissible === true           | Only close if dismissible prop  |
| hasMinLength    | context.input.length >= 3            | Enable next step                |
| isLastStep      | context.step === totalSteps - 1      | Last step shows "Submit"        |
```

Header row: `Guard`, `Expression`, `Purpose`.

#### 4. Actions (side effects)

Every action referenced in the transition table must be defined here. Actions describe what happens outside the state machine (network calls, DOM mutations, analytics, callbacks).

```
### Actions

| Action        | Effect                                         | Async? |
|---------------|------------------------------------------------|--------|
| fetchData()   | GET /api/data, dispatches FETCH_SUCCESS/ERROR  | Yes    |
| setData(d)    | Stores response in context                    | No     |
| setError(e)   | Stores error message in context               | No     |
| onOpen cb     | Calls props.onOpen() if provided              | No     |
| onClose cb    | Calls props.onClose() if provided             | No     |
```

Header row: `Action`, `Effect`, `Async?`.

#### 5. ASCII state diagram

A visual representation of the automaton using only ASCII characters.

```
                    ┌─────────────────────────────────────┐
                    │              CLOSE                  │
                    v                                     │
┌────────┐   OPEN   ┌──────────┐  <done>  ┌──────────┐   │
│ Closed │────────> │ Opening  │────────> │ Loading  │   │
└────────┘          └──────────┘          └────┬─────┘   │
                                               │         │
                              ┌────────────────┼────┐    │
                              v                v    │    │
                         ┌─────────┐     ┌─────────┐ │    │
                         │ Success │     │  Error  │ │    │
                         └────┬────┘     └────┬────┘ │    │
                              │               │      │    │
                              └───────┬───────┘      │    │
                                      │ RETRY        │    │
                                      v              │    │
                                  ┌────────┐         │    │
                                  │Closing │<────────┘    │
                                  └───┬────┘  CLOSE       │
                                      │                   │
                                      │ <done>            │
                                      v                   │
                                  ┌────────┐             │
                                  │ Closed │──────────────┘
                                  └────────┘
```

#### 6. Invariant declaration

A formal statement of what the component guarantees.

```
### Invariants

The component MUST NEVER:
- Be in `Loading` and `Success` simultaneously
- Be in `Loading` and `Error` simultaneously
- Be in `Success` and `Error` simultaneously
- Transition from `Closed` to anything other than `Opening`
- Be in an unnamed or intermediate state

The component MUST ALWAYS:
- Return to `Closed` after `Closing` completes
- Handle every event in every state (unhandled events are silently ignored)
```

### Validation gates applied

After producing the model, apply gates 1–23 from `references/slop-gates.md`. Report any failures.

**Note:** Gates 06 (state names) and 07 (event names) use a **score/tolerance** system defined in `scripts/linguistic-analyzer.js`. Scores ≥ 0.7 produce non-blocking warnings instead of errors. Scores < 0.7 are hard failures.

**Fast-track:** `node scripts/validate-model.js model.json --light` skips linguistic warnings and renders a compact ASCII diagram for quick feedback.

---

## `implement`

**Purpose:** Take a validated model and generate production-ready component code with embedded model and unit tests.

**Syntax:**
```
implement <framework> <behavior description>
```

Or, after a `model` has been produced in the same conversation:
```
implement <framework>
```

**Supported frameworks:** `react`, `vue`, `svelte`, `vanilla` (see `references/framework-adapters.md`).

**Example input:**
```
implement react a toggle switch that fetches data on toggle, shows loading, handles errors, and has optimistic UI
```

### Output requirements

You MUST produce each of the following sections, in order:

#### 1. Model recap

Reproduce the full model (states, transitions, guards, actions, invariants) from the behavior description. If a `model` was produced earlier in the same conversation, reference it. Otherwise, run an implicit `model` step first.

#### 2. Model embedded as comment

The first line of the generated file MUST contain the machine encoded as a comment:

```tsx
/* state-machine: Closed|Opening|Loading|Success|Error|Closing : OPEN|<done>|FETCH_SUCCESS|FETCH_ERROR|CLOSE|RETRY */
```

Pattern: `/* state-machine: <states> : <events> */`

#### 3. Component code

The component MUST be derived directly from the transition table. Every state maps to a render branch. Every event maps to a dispatch. Guards are implemented as conditionals before the dispatch.

```tsx
function Modal() {
  const [state, setState] = useState('Closed');

  function dispatch(event, payload) {
    switch (state) {
      case 'Closed':
        if (event === 'OPEN') setState('Opening');
        break;
      case 'Loading':
        if (event === 'FETCH_SUCCESS') setState('Success');
        if (event === 'FETCH_ERROR') setState('Error');
        break;
      // ...
    }
  }

  switch (state) {
    case 'Closed': return null;
    case 'Loading': return <Spinner />;
    case 'Success': return <Content />;
    case 'Error': return <ErrorView onRetry={() => dispatch('RETRY')} />;
  }
}
```

Do NOT add states that are not in the model. Do NOT add transitions that are not in the table.

#### 4. Unit tests

Generate tests that verify every row of the transition table:

```tsx
describe('Modal state machine', () => {
  it('transitions from Closed to Opening on OPEN', () => {
    const { result } = renderHook(() => useModal());
    act(() => result.current.dispatch('OPEN'));
    expect(result.current.state).toBe('Opening');
  });

  it('handles FETCH_SUCCESS from Loading', () => {
    const { result } = renderHook(() => useModal());
    act(() => result.current.dispatch('OPEN'));
    act(() => /* advance animation */);
    act(() => result.current.dispatch('FETCH_SUCCESS'));
    expect(result.current.state).toBe('Success');
  });

  // one test per transition row
});
```

#### 5. Implicit state warning

If the implementation requires something not in the model (e.g., a "submitting" state for a form), emit a warning:

```
⚠️ WARNING: The description mentions "submitting" but no Submitting state exists in the model.
   Run `model <description>` first to add it, or confirm it is already covered by Loading.
```

### Validation gates applied

After generating code, apply gates 1–38 from `references/slop-gates.md`. Report any failures.

**Note:** Gates 06 and 07 use the score/tolerance system from `scripts/linguistic-analyzer.js`. Non-blocking warnings are printed for marginal scores (≥ 0.7).

**Fast-track:** `node scripts/validate-model.js model.json --light` for compact validation output.

---

## `audit`

**Purpose:** Reverse-engineer the implicit state machine from existing component code and produce a quality report.

**Syntax:**
```
audit <file path or code snippet>
```

**Input:** A path to a component file, or a code snippet pasted inline.

### Output requirements

You MUST produce each of the following sections, in order:

#### 1. Reconstructed model

Read every conditional (`if`, `switch`, ternary) and boolean flag in the component. Infer the implicit states and transitions.

```
### Reconstructed model

| Implicit State | Condition                                   |
|----------------|---------------------------------------------|
| Idle           | !isLoading && !isError && !data             |
| Loading        | isLoading === true                          |
| Error          | isError === true                            |
| Success        | data !== null && !isLoading && !isError     |

| Transition        | Present? | Code location     |
|-------------------|----------|-------------------|
| Idle → Loading    | Yes      | Line 42           |
| Loading → Success | Yes      | Line 58           |
| Loading → Error   | Yes      | Line 63           |
| Error → Loading   | Yes      | Line 71           |
```

#### 2. Impossible state analysis

Identify boolean flag combinations that are self-contradictory.

```
### Impossible states detected

| Flags                          | Why impossible                  | Line |
|--------------------------------|---------------------------------|------|
| isLoading && isError           | Can't load and error at once    | 12   |
| isLoading && isSuccess         | Can't load and succeed at once  | 12   |
| isError && isSuccess           | Can't error and succeed at once | 12   |
| !isLoading && !isError         | Four states from two bits?      | 12   |
| && !isSuccess && !data         | Missing Idle state              |      |
```

#### 3. Unhandled transition analysis

List events that reach the component but have no handler in certain states.

```
### Unhandled transitions

| Event       | Unhandled in | Risk        |
|-------------|--------------|-------------|
| RETRY       | Success      | Low (no-op) |
| CLOSE       | Loading      | High — modal can't be dismissed while loading |
```

#### 4. Punch list (sorted by severity)

| Severity | Issue                                        | Recommendation                            |
|----------|----------------------------------------------|-------------------------------------------|
| 🔴 High  | isLoading + isError impossible combination   | Replace booleans with a union state type  |
| 🔴 High  | CLOSE not handled in Loading                 | Allow dismiss during loading              |
| 🟡 Medium| No explicit Idle state                       | Add Idle state for initial render         |
| 🟢 Low   | FETCH_SUCCESS handler missing timeout guard  | Add stale-response guard                  |

#### 5. Conversion offer

```
Would you like me to convert this component to use a proper state machine?
Run `implement <framework> <description>` to generate a clean implementation.
```

### Validation gates applied

After producing the audit, apply gates 24–38 from `references/slop-gates.md`. Report any failures.

---

## Error handling

| Situation | Behavior |
|-----------|----------|
| No verb matched | Default to `model` |
| Unsupported framework | List supported frameworks from `references/framework-adapters.md` |
| File not found for audit | Request the code inline or provide the correct path |
| Model validation fails | Return the model with failures annotated; do NOT proceed to `implement` |
| Guard references undefined guard | Reject the model, list missing guard definitions |

## Router logic

```pseudocode
function dispatch(request):
    verb = extractFirstWord(request)
    if verb == "model":    return handleModel(request.withoutFirstWord())
    if verb == "implement": return handleImplement(request.withoutFirstWord())
    if verb == "audit":    return handleAudit(request.withoutFirstWord())
    return handleModel(request)  // default
```

---

*This file is part of the state-machine skill. See SKILL.md for the full table of contents.*
