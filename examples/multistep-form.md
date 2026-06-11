# Example: Multi-step Registration Form

## 1. Behavior Specification
A 3-step registration form. Step 1: name and email. Step 2: password and confirmation. Step 3: review and submit. Each step validates before advancing. The user can go back to previous steps. On submit a loading state is shown, server errors allow retry. Cancel is available from any step.

## 2. Structural Contract (`model.json`)
This JSON block strictly conforms to `schemas/fsm.schema.json` and is the artifact read by the linter.

```json
{
  "id": "multistep-form",
  "initial": "Step1",
  "states": {
    "Step1": {
      "type": "atomic",
      "on": {
        "NEXT": { "target": "Step2", "guard": "isStep1Valid", "actions": ["saveStep1"] },
        "CANCEL": { "target": "Cancelled" }
      }
    },
    "Step2": {
      "type": "atomic",
      "on": {
        "NEXT": { "target": "Step3", "guard": "isStep2Valid", "actions": ["saveStep2"] },
        "PREV": { "target": "Step1", "actions": ["restoreStep1"] },
        "CANCEL": { "target": "Cancelled" }
      }
    },
    "Step3": {
      "type": "atomic",
      "on": {
        "SUBMIT": { "target": "Submitting", "guard": "isAccepted", "actions": ["submitRegistration"] },
        "PREV": { "target": "Step2", "actions": ["restoreStep2"] },
        "CANCEL": { "target": "Cancelled" }
      }
    },
    "Submitting": {
      "type": "atomic",
      "on": {
        "SUBMIT_SUCCESS": { "target": "Success", "actions": ["onSuccess"] },
        "SUBMIT_ERROR": { "target": "Error", "actions": ["setServerError"] }
      }
    },
    "Success": { "type": "final" },
    "Error": {
      "type": "atomic",
      "on": {
        "RETRY": { "target": "Submitting", "actions": ["submitRegistration"] },
        "CANCEL": { "target": "Cancelled" }
      }
    },
    "Cancelled": { "type": "final" }
  }
}
```

## 3. Transition Diagram (ASCII)
```
                    ┌─────────────────────────────────────────────┐
                    │                                             │
                    v  CANCEL                                     │
┌────────┐  NEXT   ┌────────┐  NEXT   ┌────────┐  SUBMIT         │
│ Step1  │────────>│ Step2  │────────>│ Step3  │────────────┐   │
│        │         │        │         │        │            │   │
└───┬────┘         └───┬────┘         └────────┘            │   │
    │ PREV              │ PREV                               │   │
    └───────────────────┘                                    │   │
                                                             │   │
                              ┌────────────┐                 │   │
                              │ Submitting │◄────────────────┘   │
                              └──────┬─────┘                     │
                                     │                           │
                         ┌───────────┼──────────┐                │
                         v           v          │                │
                    ┌─────────┐ ┌─────────┐     │                │
                    │ Success │ │  Error  │     │                │
                    └─────────┘ └────┬────┘     │                │
                                     │          │                │
                             ┌───────┼──────┐   │                │
                             │ RETRY │CANCEL│   │                │
                             v       v      │   │                │
                         ┌────────┐ ┌────────┐│  │               │
                         │Submitting│Cancelled││  │               │
                         └────────┘ └────────┘│  │               │
                             │                │  │               │
                             └────────────────┘  │               │
                                                │               │
                                                └───────────────┘
```

## 4. Production Implementation (`implement`)
Reference code generated using the injectable core runtime from `src/core/fsm.ts`.

```ts
import { createLightMachine } from '../src/core/fsm';

// 1. Configuration identical to the JSON contract
const formConfig = {
  id: "multistep-form",
  initial: "Step1",
  states: {
    Step1: {
      type: "atomic",
      on: {
        NEXT: { target: "Step2", guard: "isStep1Valid", actions: ["saveStep1"] },
        CANCEL: { target: "Cancelled" }
      }
    },
    Step2: {
      type: "atomic",
      on: {
        NEXT: { target: "Step3", guard: "isStep2Valid", actions: ["saveStep2"] },
        PREV: { target: "Step1", actions: ["restoreStep1"] },
        CANCEL: { target: "Cancelled" }
      }
    },
    Step3: {
      type: "atomic",
      on: {
        SUBMIT: { target: "Submitting", guard: "isAccepted", actions: ["submitRegistration"] },
        PREV: { target: "Step2", actions: ["restoreStep2"] },
        CANCEL: { target: "Cancelled" }
      }
    },
    Submitting: {
      type: "atomic",
      on: {
        SUBMIT_SUCCESS: { target: "Success", actions: ["onSuccess"] },
        SUBMIT_ERROR: { target: "Error", actions: ["setServerError"] }
      }
    },
    Success: { type: "final" },
    Error: {
      type: "atomic",
      on: {
        RETRY: { target: "Submitting", actions: ["submitRegistration"] },
        CANCEL: { target: "Cancelled" }
      }
    },
    Cancelled: { type: "final" }
  }
};

// 2. Isolated side effects (Actions)
const implementations = {
  guards: {
    isStep1Valid: (ctx: any) => ctx.name?.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ctx.email),
    isStep2Valid: (ctx: any) => ctx.password?.length >= 8 && ctx.password === ctx.confirmPassword,
    isAccepted: (ctx: any) => ctx.accepted === true
  },
  actions: {
    saveStep1: (ctx: any) => { ctx.savedStep1 = { name: ctx.name, email: ctx.email }; },
    saveStep2: (ctx: any) => { ctx.savedStep2 = { password: ctx.password, confirmPassword: ctx.confirmPassword }; },
    restoreStep1: (ctx: any) => { ctx.name = ctx.savedStep1?.name ?? ''; ctx.email = ctx.savedStep1?.email ?? ''; },
    restoreStep2: (ctx: any) => { ctx.password = ctx.savedStep2?.password ?? ''; ctx.confirmPassword = ctx.savedStep2?.confirmPassword ?? ''; },
    submitRegistration: async (ctx: any, event: any) => {
      try {
        const res = await fetch('/api/register', { method: 'POST', body: JSON.stringify(ctx) });
        const data = await res.json();
        machine.send({ type: 'SUBMIT_SUCCESS', response: data }, ctx);
      } catch (err) {
        machine.send({ type: 'SUBMIT_ERROR', message: (err as Error).message }, ctx);
      }
    },
    onSuccess: (ctx: any, event: any) => { ctx.response = event.response; },
    setServerError: (ctx: any, event: any) => { ctx.serverError = event.message; }
  }
};

// 3. Component / Machine initialization
let context = { name: '', email: '', password: '', confirmPassword: '', accepted: false, savedStep1: null, savedStep2: null, serverError: null, response: null };
const machine = createLightMachine(formConfig, implementations, (nextState) => {
  console.log(`UI Update: Render step [${nextState}]`);
});
```
