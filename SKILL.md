---
name: state-machine
description: >
  Model UI component behavior as FSMs before writing code. Verbs:
  `model` (FSM from description → auto-prompt for code generation),
  `audit` (detect impossible states in existing code). Framework-agnostic,
  XState v5 compatible. Eliminates impossible states at design time.
version: 1.3.0
---

# state-machine Skill

Model before you build. Every UI bug is a state you never modeled.

## Verbs

| Verb | Input → Output | When |
|------|---------------|------|
| `model` | NL description → 3-section FSM blueprint, then auto-prompt: ask user if they want to implement, discover project folders, generate code + tests | Before writing any code |
| `audit` | File path → reconstructed model + impossible state analysis + punch list | Debugging or inheriting existing code |

## Mandatory Execution Protocol for the Agent (AI)

You MUST strictly follow this algorithmic workflow for any user command:

### `model` Verb Execution
1. **Generate Structure**: Translate the user's description into a structured JSON that strictly conforms to `schemas/fsm.schema.json`. Save temporarily to `.state-machine/temp-model.json`.
2. **Self-Validation**: Immediately run `node scripts/validate-model.js .state-machine/temp-model.json`.
3. **Error Handling**: 
   - If the command fails (Exit code 1), read the script output, re-model the JSON fixing the broken gate, and repeat step 2.
   - Do NOT ask the user for help or show intermediate code until the script returns Exit code 0.
 4. **Final Output**: Return a markdown block with exactly **3 sections** in order:

   **Section 1 — Behavior Specification**: Rephrase the user's description as a concise specification in English.

   **Section 2 — Structural Contract**: Present the validated JSON inside a `json` code block. This is the exact JSON that passed validation.

   **Section 3 — Transition Diagram**: Run `node scripts/ascii-viz.js .state-machine/temp-model.json` and include its output inside a code block.

   Format:

   ````
   ## 1. Behavior Specification
   ...

   ## 2. Structural Contract (`model.json`)
   ```json
   { ... }
   ```

   ## 3. Transition Diagram (ASCII)
   ```
   ...
   ```
   ````

   Do NOT include any text before or after these 3 sections.

5. **Post-model prompt**: After outputting the 3 sections, ask the user:
   - "Do you want me to generate the component code from this model?"
   - If yes, scan the workspace for existing project directories (look for `package.json`, `src/`, `components/`, etc.) and present the viable folders to the user.
   - Ask which folder the component should be placed in.
   - Execute the **Implementation sub-flow** (see below).

### Implementation sub-flow (agent-initiated, not a user verb)

1. **Read Contract**: Take the JSON validated in the prior step.
2. **Inject Runtime**: Copy the base code from `src/core/fsm.ts` into the user's chosen directory as `fsm.ts` if it does not exist.
3. **Generate Component**: Generate the UI component coupling state exclusively through the `createLightMachine` hook/function.
4. **Compile Tests**: Write a unit test file (`.test.ts` / `.test.js`) that sequentially simulates 100% of the JSON transitions and verifies the resulting state.

### `audit` Verb Execution
1. **Scan Code**: Search the user's file for reactive variables (`useState`, `ref`, boolean fields).
2. **Generate Matrix**: Run an internal bit-combinatorics simulation ($2^n$) over those booleans.
3. **Write Punch List**: Identify which combinations have no visual representation or coherent logic.

## Reference Library

| File | Contents |
|------|----------|
| `references/verb-dispatch.md` | Exact output format for each verb |
| `references/component-patterns.md` | 12 reusable patterns (modal, form, toggle, auth, etc.) |
| `references/impossible-states.md` | 35 anti-patterns with elimination strategies |
| `references/slop-gates.md` | 38 validation gates (model 1–13, code 14–23, audit 24–38) |
| `references/framework-adapters.md` | useMachine(config, implementations) for React/Vue/Svelte/Vanilla |
| `references/xstate-compat.md` | XState v5 mapping |
| `schemas/fsm.schema.json` | Canonical JSON Schema for FSM models (hierarchical format) |
| `references/state-theory.md` | FSM/HFSM theory applied to UI |
| `examples/` | modal.md, toggle-async.md, multistep-form.md, auth-flow.md |

## Validation

```bash
node scripts/validate-model.js path/to/model.json        # full check + ASCII diagram
node scripts/validate-model.js path/to/model.json --light # fast-track (compact)
node scripts/ascii-viz.js path/to/model.json              # diagram only
```

## Output Formats (see `references/verb-dispatch.md`)

- **model**: Behavior Specification, Structural Contract (JSON), ASCII Diagram, ✅ Gates 1–13; then auto-prompt → component code + tests, ✅ Gates 1–23
- **audit**: Reconstructed model, impossible states, unhandled transitions, severity punch list, ✅ Gates 24–38

---

*state-machine — model before you build.*
