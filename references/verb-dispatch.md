# Verb Dispatch

> Public API of the state-machine skill. Every request must start with one of these two verbs.

## How dispatch works

The skill router reads the first word of the request. That word determines the pipeline:

```
Request starts with "model" → pipeline: NL → formal model → validation → output
                                → auto-prompt: implement? → discover folders → code + tests
Request starts with "audit" → pipeline: code → reverse-model → analysis → report
```

If the request does not start with one of these two verbs, the router prepends `model` and treats the entire request as the behavior description.

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

You MUST return exactly **3 sections**, in order, with no extra text before or after:

#### Section 1 — Behavior Specification

Rephrase the user's description as a concise specification paragraph.

Format:
```
## 1. Behavior Specification
A modal component that opens on a trigger event, shows a loading spinner while...
```

#### Section 2 — Structural Contract (`model.json`)

Present the validated JSON inside a `json` code block. This JSON MUST:
- Strictly conform to `schemas/fsm.schema.json`
- Use the hierarchical format (`id`, `initial`, `states` as object)
- Include `onEnter`, `actions`, and `guard` references where applicable
- Be the exact JSON that passed `validate-model.js`

Format:
```
## 2. Structural Contract (`model.json`)
```json
{
  "id": "async-modal",
  "initial": "Closed",
  "states": { ... }
}
```
```

#### Section 3 — Transition Diagram (ASCII)

Run `node scripts/ascii-viz.js .state-machine/temp-model.json` and include its output inside a code block.

Format:
```
## 3. Transition Diagram (ASCII)
```
┌────────┐ TRIGGER  ┌─────────┐
│ Closed │─────────>│ Loading │
└────────┘          └─────────┘
```
```

### Validation gates applied

After producing the model, run `node scripts/validate-model.js .state-machine/temp-model.json`. If it fails, fix the JSON and re-run until exit code 0.

### Post-model prompt

After the 3 sections are output, the agent MUST ask the user:

> "Do you want me to generate the component code from this model?"

If the user accepts:

1. **Discover project folders**: Scan the workspace for `package.json`, `src/`, `components/`, `app/` directories. Present the candidate folders to the user.
2. **Confirm target folder**: Ask the user which folder should receive the component.
3. **Execute the Implementation sub-flow** (see below).

---

## `implement` (sub-flow — not a user command)

This flow is executed by the agent after the user accepts the post-model prompt. It is NOT dispatched as a standalone verb.

**Purpose:** Take the validated model and generate production-ready component code with embedded model and unit tests.

**Preconditions:**
- A validated JSON model exists from the preceding `model` step
- The user confirmed they want implementation
- A target folder has been agreed upon

### Output requirements

The agent MUST produce each of the following, in order:

#### 1. Model comment

The first line of the generated file MUST contain the machine encoded as a comment:

```tsx
/* state-machine: Closed|Opening|Loading|Success|Error|Closing : OPEN|<done>|FETCH_SUCCESS|FETCH_ERROR|CLOSE|RETRY */
```

Pattern: `/* state-machine: <states> : <events> */`

#### 2. Runtime injection

Copy `src/core/fsm.ts` into the target folder as `fsm.ts` if it does not already exist.

#### 3. Component code

Generate the UI component using `createLightMachine`. The config object MUST be identical to the validated JSON contract. Every state maps to a render branch. Every event maps to a dispatch. Guards are implemented as conditionals before the dispatch.

```tsx
import { createLightMachine } from './fsm';

const config = { ... }; // identical to validated JSON

const implementations = {
  actions: { ... },
  guards: { ... }
};

let context = { ... };
const machine = createLightMachine(config, implementations, (nextState) => {
  // framework render hook
});
```

Do NOT add states that are not in the model. Do NOT add transitions that are not in the table.

#### 4. Unit tests

Generate tests that verify every row of the transition table:

```tsx
describe('Component state machine', () => {
  it('transitions from Closed to Opening on OPEN', () => {
    // ...
  });
  // one test per transition row
});
```

#### 5. Implicit state warning

If the implementation requires something not in the model, emit a warning:

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
I can model the behavior and then generate a clean implementation.
```

### Validation gates applied

After producing the audit, apply gates 24–38 from `references/slop-gates.md`. Report any failures.

---

## Error handling

| Situation | Behavior |
|-----------|----------|
| No verb matched | Default to `model` |
| File not found for audit | Request the code inline or provide the correct path |
| Model validation fails | Return the model with failures annotated; do NOT proceed to implementation prompt |
| Guard references undefined guard | Reject the model, list missing guard definitions |

## Router logic

```pseudocode
function dispatch(request):
    verb = extractFirstWord(request)
    if verb == "model": return handleModel(request.withoutFirstWord())
    if verb == "audit": return handleAudit(request.withoutFirstWord())
    return handleModel(request)  // default
```

---

*This file is part of the state-machine skill. See SKILL.md for the full table of contents.*
