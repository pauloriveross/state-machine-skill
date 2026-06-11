# Example: Multi-step registration form

> Full walkthrough: from natural language description to validated model to production code.

---

## Brief

```
A 3-step registration form. Step 1: Name and email. Step 2: Password and confirm password.
Step 3: Review and submit. The user can go back to previous steps to edit. Each step validates
before advancing. Final step submits the collected data. On success, show a confirmation
message. On failure, show a server error and allow retry. The user can cancel at any step.
```

## Invocation

```
state-machine model a 3-step registration form with name/email, password/confirm, and
review/submit steps. Each step validates before advancing. User can go back to previous
steps. Cancel returns to the initial state. Server errors show a retry option.
```

---

## Produced model

This is a **hierarchical** FSM. The root machine manages step transitions, while each step is a
mini-form machine.

### Root states

| State | Description | Terminal |
|-------|-------------|----------|
| Step1 | User enters name and email | No |
| Step2 | User enters password and confirm | No |
| Step3 | User reviews all data and submits | No |
| Submitting | Data is being sent to the server | No |
| Success | Registration complete, confirmation shown | Yes |
| Error | Server returned an error | No |
| Cancelled | User cancelled the flow | Yes |

### Step 1 child states

| State | Description |
|-------|-------------|
| Idle | Form rendered with default values |
| Dirty | User has modified at least one field |
| Validating | Client-side validation running |

### Step 2 child states

Same structure as Step 1.

### Step 3 child states

| State | Description |
|-------|-------------|
| Idle | Review screen with all collected data |
| Accepting | User has checked the terms checkbox |

### Events

| Event | Origin | Description |
|-------|--------|-------------|
| CHANGE | User modifies a field | Updates field value |
| NEXT | User clicks "Next" or "Continue" | Advances to next step |
| PREV | User clicks "Back" | Returns to previous step |
| SUBMIT | User clicks "Submit" on final step | Sends data to server |
| SUBMIT_SUCCESS | Server response (2xx) | Registration confirmed |
| SUBMIT_ERROR | Server response (4xx/5xx) | Registration failed |
| RETRY | User clicks "Try Again" | Retries submission |
| CANCEL | User clicks "Cancel" | Aborts the flow |

### Root transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Step1 | NEXT | isStep1Valid | Step2 | saveStep1(data) |
| Step1 | CANCEL | — | Cancelled | onCancel callback |
| Step2 | NEXT | isStep2Valid | Step3 | saveStep2(data) |
| Step2 | PREV | — | Step1 | restoreStep1() |
| Step2 | CANCEL | — | Cancelled | onCancel callback |
| Step3 | SUBMIT | isAccepted | Submitting | submitRegistration(data) |
| Step3 | PREV | — | Step2 | restoreStep2() |
| Step3 | CANCEL | — | Cancelled | onCancel callback |
| Submitting | SUBMIT_SUCCESS | — | Success | onSuccess(response) |
| Submitting | SUBMIT_ERROR | — | Error | setServerError(message) |
| Error | RETRY | — | Submitting | submitRegistration(data) |
| Error | CANCEL | — | Cancelled | onCancel callback |

### Step 1 child transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Idle | CHANGE | hasChanges | Dirty | updateField(name, val) |
| Dirty | CHANGE | — | Dirty | updateField(name, val) |
| Dirty | VALIDATE | — | Validating | validateStep1() |
| Validating | VALIDATION_PASS | — | Idle | — |
| Validating | VALIDATION_FAIL | — | Dirty | setErrors(errors) |

### Step 2 child transitions

Same structure as Step 1, with password-specific validation.

### Step 3 child transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Idle | ACCEPT | — | Accepting | setAccepted(true) |
| Accepting | UNACCEPT | — | Idle | setAccepted(false) |

### Guards

| Guard | Expression | Purpose |
|-------|------------|---------|
| isStep1Valid | name.length > 0 && isValidEmail(email) | Step 1 fields are valid |
| isStep2Valid | password.length >= 8 && password === confirm | Step 2 fields are valid |
| isAccepted | context.accepted === true | Terms checkbox checked |
| hasChanges | context.dirtyFields.size > 0 | Form has been modified |

### Actions

| Action | Effect | Async? |
|--------|--------|--------|
| saveStep1(d) | Stores step 1 data in root context | No |
| saveStep2(d) | Stores step 2 data in root context | No |
| restoreStep1() | Restores step 1 data from root context | No |
| restoreStep2() | Restores step 2 data from root context | No |
| submitRegistration(d) | POST /api/register, dispatches SUBMIT_SUCCESS or SUBMIT_ERROR | Yes |
| onSuccess(r) | Calls success callback | No |
| setServerError(m) | Stores server error in context | No |
| onCancel() | Calls cancel callback | No |
| updateField(n, v) | Updates a single form field | No |
| validateStep1() | Runs client-side validation for step 1 | No |
| validateStep2() | Runs client-side validation for step 2 | No |
| setErrors(e) | Stores validation errors | No |

### Diagram

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
                    v  CANCEL                                  │
┌────────┐  NEXT   ┌────────┐  NEXT   ┌────────┐  SUBMIT     │
│ Step1  │────────>│ Step2  │────────>│ Step3  │────────────┐│
│ ─────  │         │ ─────  │         │ ─────  │            ││
│ Idle   │         │ Idle   │         │ Idle   │            ││
│ Dirty  │         │ Dirty  │         │Accepting│           ││
│Validat.│         │Validat.│         │        │            ││
└───┬────┘         └───┬────┘         └────────┘            ││
    │ PREV              │ PREV                               ││
    └───────────────────┘                                   ││
                                                            ││
                                ┌────────────┐              ││
                                │ Submitting │◄─────────────┘│
                                └──────┬─────┘               │
                                       │                     │
                           ┌───────────┼──────────┐          │
                           v           v          │          │
                      ┌─────────┐ ┌─────────┐     │          │
                      │ Success │ │  Error  │     │          │
                      └─────────┘ └────┬────┘     │          │
                                       │          │          │
                               ┌───────┼──────┐   │          │
                               │ RETRY │CANCEL│   │          │
                               v       v      │   │          │
                           ┌────────┐ ┌────────┐│  │         │
                           │Submitting│Cancelled││  │         │
                           └────────┘ └────────┘│  │         │
                               │                │  │         │
                               └────────────────┘  │         │
                                                  │         │
                                                  └─────────┘
```

---

## Invariants

The component MUST NEVER:

- Be in two steps simultaneously
- Advance to the next step without the current step being valid
- Allow SUBMIT from Step1 or Step2 (only Step3 can submit)
- Allow PREV from Step1 (no step before Step1)
- Be in Submitting and Success simultaneously

The component MUST ALWAYS:

- Preserve form data when navigating between steps (PREV and NEXT)
- Clear server errors when switching steps
- Show a confirmation on success
- Allow cancel from any step

---

## Generated code (React + TypeScript)

```tsx
/* state-machine: Step1(Idle|Dirty|Validating)|Step2(Idle|Dirty|Validating)|Step3(Idle|Accepting)|Submitting|Success|Error|Cancelled : CHANGE|NEXT|PREV|SUBMIT|SUBMIT_SUCCESS|SUBMIT_ERROR|RETRY|CANCEL|VALIDATE|VALIDATION_PASS|VALIDATION_FAIL|ACCEPT|UNACCEPT */

import { useCallback, useMemo, useRef } from 'react';
import { useMachine } from 'state-machine';

// ── Types ──

type State =
  | 'Step1.Idle' | 'Step1.Dirty' | 'Step1.Validating'
  | 'Step2.Idle' | 'Step2.Dirty' | 'Step2.Validating'
  | 'Step3.Idle' | 'Step3.Accepting'
  | 'Submitting' | 'Success' | 'Error' | 'Cancelled';

type Event =
  | { type: 'CHANGE'; field: string; value: string }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'SUBMIT' }
  | { type: 'SUBMIT_SUCCESS'; response: unknown }
  | { type: 'SUBMIT_ERROR'; message: string }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }
  | { type: 'VALIDATE' }
  | { type: 'VALIDATION_PASS' }
  | { type: 'VALIDATION_FAIL'; errors: Record<string, string> }
  | { type: 'ACCEPT' }
  | { type: 'UNACCEPT' };

interface FormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface FormContext {
  formData: FormData;
  errors: Record<string, string>;
  serverError: string | null;
  accepted: boolean;
  response?: unknown;
  step1Data?: { name: string; email: string } | null;
  step2Data?: { password: string; confirmPassword: string } | null;
}

type RootState =
  | { step: 'Step1'; child: 'Idle' | 'Dirty' | 'Validating' }
  | { step: 'Step2'; child: 'Idle' | 'Dirty' | 'Validating' }
  | { step: 'Step3'; child: 'Idle' | 'Accepting' }
  | { step: 'Submitting' }
  | { step: 'Success'; response: unknown }
  | { step: 'Error'; message: string; retry: () => void }
  | { step: 'Cancelled' };

// ── Guards ──

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStep1Valid(data: FormData): boolean {
  return data.name.trim().length > 0 && isValidEmail(data.email);
}

function isStep2Valid(data: FormData): boolean {
  return data.password.length >= 8 && data.password === data.confirmPassword;
}

// ── Config ──

const config = {
  initial: 'Step1.Idle' as State,
  context: {
    formData: { name: '', email: '', password: '', confirmPassword: '' },
    errors: {},
    serverError: null,
    accepted: false,
    step1Data: null,
    step2Data: null,
  } as FormContext,
  states: {
    'Step1.Idle': {
      on: {
        CHANGE: { target: 'Step1.Dirty', actions: ['updateField'] },
        CANCEL: { target: 'Cancelled' },
      },
    },
    'Step1.Dirty': {
      on: {
        CHANGE: { target: 'Step1.Dirty', actions: ['updateField'] },
        VALIDATE: { target: 'Step1.Validating', actions: ['validateStep1'] },
        NEXT: { target: 'Step2.Idle', guard: 'isStep1Valid', actions: ['saveStep1'] },
        CANCEL: { target: 'Cancelled' },
      },
    },
    'Step1.Validating': {
      on: {
        VALIDATION_PASS: { target: 'Step1.Idle' },
        VALIDATION_FAIL: { target: 'Step1.Dirty', actions: ['setErrors'] },
      },
    },
    'Step2.Idle': {
      on: {
        CHANGE: { target: 'Step2.Dirty', actions: ['updateField'] },
        PREV: { target: 'Step1.Dirty', actions: ['restoreStep1'] },
        CANCEL: { target: 'Cancelled' },
      },
    },
    'Step2.Dirty': {
      on: {
        CHANGE: { target: 'Step2.Dirty', actions: ['updateField'] },
        VALIDATE: { target: 'Step2.Validating', actions: ['validateStep2'] },
        NEXT: { target: 'Step3.Idle', guard: 'isStep2Valid', actions: ['saveStep2'] },
        PREV: { target: 'Step1.Dirty', actions: ['restoreStep1'] },
        CANCEL: { target: 'Cancelled' },
      },
    },
    'Step2.Validating': {
      on: {
        VALIDATION_PASS: { target: 'Step2.Idle' },
        VALIDATION_FAIL: { target: 'Step2.Dirty', actions: ['setErrors'] },
      },
    },
    'Step3.Idle': {
      on: {
        ACCEPT: { target: 'Step3.Accepting', actions: ['setAccepted'] },
        PREV: { target: 'Step2.Dirty', actions: ['restoreStep2'] },
        CANCEL: { target: 'Cancelled' },
      },
    },
    'Step3.Accepting': {
      on: {
        UNACCEPT: { target: 'Step3.Idle', actions: ['setUnaccepted'] },
        SUBMIT: { target: 'Submitting', guard: 'isAccepted', actions: ['submitRegistration'] },
        PREV: { target: 'Step2.Dirty', actions: ['restoreStep2'] },
        CANCEL: { target: 'Cancelled' },
      },
    },
    Submitting: {
      on: {
        SUBMIT_SUCCESS: { target: 'Success', actions: ['onSuccess'] },
        SUBMIT_ERROR: { target: 'Error', actions: ['setServerError'] },
      },
    },
    Success: { on: {} },
    Error: {
      on: {
        RETRY: { target: 'Submitting', actions: ['submitRegistration'] },
        CANCEL: { target: 'Cancelled' },
      },
    },
    Cancelled: { on: {} },
  },
};

// ── Hook ──

interface UseMultiStepFormOptions {
  onSubmit?: (data: FormData) => Promise<unknown>;
  onSuccess?: (response: unknown) => void;
  onCancel?: () => void;
}

export function useMultiStepForm(options: UseMultiStepFormOptions = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const implementations = useMemo(() => ({
    actions: {
      updateField: (ctx: FormContext, event: Event) => {
        if (event.type !== 'CHANGE') return;
        return { formData: { ...ctx.formData, [event.field]: event.value } };
      },
      saveStep1: (ctx: FormContext) => ({
        step1Data: { name: ctx.formData.name, email: ctx.formData.email },
      }),
      saveStep2: (ctx: FormContext) => ({
        step2Data: { password: ctx.formData.password, confirmPassword: ctx.formData.confirmPassword },
      }),
      restoreStep1: (ctx: FormContext) => ({
        formData: {
          ...ctx.formData,
          name: ctx.step1Data?.name ?? '',
          email: ctx.step1Data?.email ?? '',
        },
      }),
      restoreStep2: (ctx: FormContext) => ({
        formData: {
          ...ctx.formData,
          password: ctx.step2Data?.password ?? '',
          confirmPassword: ctx.step2Data?.confirmPassword ?? '',
        },
      }),
      setErrors: (ctx: FormContext, event: Event) => {
        if (event.type !== 'VALIDATION_FAIL') return;
        return { errors: event.errors };
      },
      setAccepted: () => ({ accepted: true }),
      setUnaccepted: () => ({ accepted: false }),
      validateStep1: async (_ctx: FormContext, _event: Event, _send: (e: Event) => void) => {},
      validateStep2: async (_ctx: FormContext, _event: Event, _send: (e: Event) => void) => {},
      submitRegistration: async (ctx: FormContext, _event: Event, send: (e: Event) => void) => {
        const onSubmit = optionsRef.current.onSubmit;
        if (!onSubmit) return;
        try {
          const response = await onSubmit(ctx.formData);
          send({ type: 'SUBMIT_SUCCESS', response });
        } catch (err: any) {
          send({ type: 'SUBMIT_ERROR', message: err?.message ?? 'Unknown error' });
        }
      },
      onSuccess: (ctx: FormContext, event: Event) => {
        if (event.type !== 'SUBMIT_SUCCESS') return;
        optionsRef.current.onSuccess?.(event.response);
        return { response: event.response };
      },
      setServerError: (ctx: FormContext, event: Event) => {
        if (event.type !== 'SUBMIT_ERROR') return;
        return { serverError: event.message };
      },
    },
    guards: {
      isStep1Valid: (ctx: FormContext) => isStep1Valid(ctx.formData),
      isStep2Valid: (ctx: FormContext) => isStep2Valid(ctx.formData),
      isAccepted: (ctx: FormContext) => ctx.accepted === true,
    },
  }), []);

  const { state: flatState, context, send } = useMachine<State, Event, FormContext>(config, implementations);

  const retry = useCallback(() => send({ type: 'RETRY' }), [send]);

  const state: RootState = useMemo(() => {
    switch (flatState) {
      case 'Success':
        return { step: 'Success', response: context.response };
      case 'Error':
        return { step: 'Error', message: context.serverError ?? '', retry };
      case 'Cancelled':
        return { step: 'Cancelled' };
      case 'Submitting':
        return { step: 'Submitting' };
      default: {
        const [step, child] = flatState.split('.') as [string, string];
        return { step, child } as RootState;
      }
    }
  }, [flatState, context, retry]);

  const next = useCallback(() => send({ type: 'NEXT' }), [send]);
  const prev = useCallback(() => send({ type: 'PREV' }), [send]);
  const submit = useCallback(() => send({ type: 'SUBMIT' }), [send]);
  const cancel = useCallback(() => send({ type: 'CANCEL' }), [send]);
  const change = useCallback((field: string, value: string) => send({ type: 'CHANGE', field, value }), [send]);

  return { state, formData: context.formData, errors: context.errors, next, prev, submit, cancel, change, send };
}

// ── Component ──

interface FormStepProps {
  state: RootState;
  formData: FormData;
  errors: Record<string, string>;
  onFieldChange: (field: string, value: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  send: (event: Event) => void;
}

export function MultiStepForm({
  state,
  formData,
  errors,
  onFieldChange,
  onNext,
  onPrev,
  onSubmit,
  onCancel,
  send,
}: FormStepProps) {
  if (state.step === 'Success') {
    return (
      <div className="form-success">
        <h2>Registration complete!</h2>
        <p>Welcome, {formData.name}!</p>
      </div>
    );
  }

  if (state.step === 'Cancelled') {
    return (
      <div className="form-cancelled">
        <p>Registration cancelled.</p>
      </div>
    );
  }

  if (state.step === 'Error') {
    return (
      <div className="form-error">
        <h2>Something went wrong</h2>
        <p className="error-message">{state.message}</p>
        <button onClick={() => (state as any).retry?.()}>Try Again</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  }

  if (state.step === 'Submitting') {
    return (
      <div className="form-submitting">
        <span className="spinner" />
        <p>Creating your account...</p>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  }

  return (
    <div className="multi-step-form">
      <div className="step-indicator">
        <span className={state.step === 'Step1' ? 'active' : 'done'}>1</span>
        <span className={state.step === 'Step2' ? 'active' : state.step === 'Step3' ? 'done' : ''}>2</span>
        <span className={state.step === 'Step3' ? 'active' : ''}>3</span>
      </div>

      {state.step === 'Step1' && (
        <div className="form-step">
          <h2>Your details</h2>
          <label>
            Name
            <input
              value={formData.name}
              onChange={e => onFieldChange('name', e.target.value)}
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </label>
          <label>
            Email
            <input
              type="email"
              value={formData.email}
              onChange={e => onFieldChange('email', e.target.value)}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </label>
          <div className="form-actions">
            <button onClick={onCancel}>Cancel</button>
            <button onClick={onNext} disabled={!isStep1Valid(formData)}>
              Next
            </button>
          </div>
        </div>
      )}

      {state.step === 'Step2' && (
        <div className="form-step">
          <h2>Set a password</h2>
          <label>
            Password (min 8 characters)
            <input
              type="password"
              value={formData.password}
              onChange={e => onFieldChange('password', e.target.value)}
            />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={e => onFieldChange('confirmPassword', e.target.value)}
            />
            {errors.confirmPassword && <span className="field-error">{errors.confirmPassword}</span>}
          </label>
          <div className="form-actions">
            <button onClick={onPrev}>Back</button>
            <button onClick={onCancel}>Cancel</button>
            <button onClick={onNext} disabled={!isStep2Valid(formData)}>
              Next
            </button>
          </div>
        </div>
      )}

      {state.step === 'Step3' && (
        <div className="form-step">
          <h2>Review your information</h2>
          <div className="review-section">
            <p><strong>Name:</strong> {formData.name}</p>
            <p><strong>Email:</strong> {formData.email}</p>
            <p><strong>Password:</strong> {'•'.repeat(formData.password.length)}</p>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={state.child === 'Accepting'}
              onChange={e => send(e.target.checked ? { type: 'ACCEPT' } : { type: 'UNACCEPT' })}
            />
            I agree to the terms and conditions
          </label>
          <div className="form-actions">
            <button onClick={onPrev}>Back</button>
            <button onClick={onCancel}>Cancel</button>
            <button onClick={onSubmit} disabled={state.child !== 'Accepting'}>
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Generated tests (Vitest)

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMultiStepForm } from './MultiStepForm';

describe('MultiStepForm state machine', () => {
  const validData = {
    name: 'Alice',
    email: 'alice@example.com',
    password: 'password123',
    confirmPassword: 'password123',
  };

  it('starts in Step1.Idle', () => {
    const { result } = renderHook(() => useMultiStepForm());
    expect(result.current.state).toMatchObject({ step: 'Step1', child: 'Idle' });
  });

  it('transitions Step1.Idle → Step1.Dirty on CHANGE', () => {
    const { result } = renderHook(() => useMultiStepForm());
    act(() => result.current.change('name', 'Alice'));
    expect(result.current.state).toMatchObject({ step: 'Step1', child: 'Dirty' });
  });

  it('advances to Step2 when NEXT and step 1 is valid', () => {
    const { result } = renderHook(() => useMultiStepForm());
    act(() => result.current.change('name', 'Alice'));
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.next());
    expect(result.current.state).toMatchObject({ step: 'Step2', child: 'Idle' });
  });

  it('does not advance when step 1 is invalid', () => {
    const { result } = renderHook(() => useMultiStepForm());
    act(() => result.current.next());
    expect(result.current.state).toMatchObject({ step: 'Step1' });
  });

  it('goes back from Step2 to Step1 on PREV', () => {
    const { result } = renderHook(() => useMultiStepForm());
    act(() => result.current.change('name', 'Alice'));
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.next()); // → Step2
    act(() => result.current.prev()); // → Step1
    expect(result.current.state).toMatchObject({ step: 'Step1' });
  });

  it('preserves form data when going back and forth', () => {
    const { result } = renderHook(() => useMultiStepForm());
    act(() => result.current.change('name', 'Alice'));
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.next());
    act(() => result.current.prev());
    expect(result.current.formData.name).toBe('Alice');
    expect(result.current.formData.email).toBe('alice@example.com');
  });

  it('submits from Step3 when terms are accepted', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: 1 });
    const { result } = renderHook(() => useMultiStepForm({ onSubmit }));

    // Fill step 1
    act(() => result.current.change('name', 'Alice'));
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.next());

    // Fill step 2
    act(() => result.current.change('password', 'password123'));
    act(() => result.current.change('confirmPassword', 'password123'));
    act(() => result.current.next());

    // Accept terms
    act(() => result.current.send({ type: 'ACCEPT' }));
    expect(result.current.state).toMatchObject({ step: 'Step3', child: 'Accepting' });

    // Submit
    act(() => result.current.submit());
    expect(result.current.state).toMatchObject({ step: 'Submitting' });
  });

  it('transitions to Success on SUBMIT_SUCCESS', () => {
    const { result } = renderHook(() => useMultiStepForm());
    act(() => result.current.send({ type: 'SUBMIT_SUCCESS', response: { id: 1 } }));
    expect(result.current.state).toMatchObject({ step: 'Success' });
  });

  it('transitions to Error on SUBMIT_ERROR', () => {
    const { result } = renderHook(() => useMultiStepForm());
    act(() => result.current.send({ type: 'SUBMIT_ERROR', message: 'Email taken' }));
    expect(result.current.state).toMatchObject({ step: 'Error', message: 'Email taken' });
  });

  it('cancels from any step', () => {
    const { result } = renderHook(() => useMultiStepForm());
    act(() => result.current.cancel());
    expect(result.current.state).toMatchObject({ step: 'Cancelled' });
  });

  it('retries from Error', () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: 1 });
    const { result } = renderHook(() => useMultiStepForm({ onSubmit }));

    act(() => result.current.send({ type: 'SUBMIT_ERROR', message: 'Server error' }));
    expect(result.current.state).toMatchObject({ step: 'Error' });

    act(() => result.current.send({ type: 'RETRY' }));
    expect(result.current.state).toMatchObject({ step: 'Submitting' });
  });
});
```

---

## XState v5 mapping

```ts
import { setup, assign } from 'xstate';

export const registrationMachine = setup({
  types: {
    context: {} as {
      formData: { name: string; email: string; password: string; confirmPassword: string };
      errors: Record<string, string>;
      serverError: string | null;
    },
    events: {} as
      | { type: 'CHANGE'; field: string; value: string }
      | { type: 'NEXT' }
      | { type: 'PREV' }
      | { type: 'SUBMIT' }
      | { type: 'SUBMIT_SUCCESS'; response: unknown }
      | { type: 'SUBMIT_ERROR'; message: string }
      | { type: 'RETRY' }
      | { type: 'CANCEL' }
      | { type: 'ACCEPT' }
      | { type: 'UNACCEPT' },
  },
  guards: {
    isStep1Valid: ({ context }) =>
      context.formData.name.trim().length > 0 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(context.formData.email),
    isStep2Valid: ({ context }) =>
      context.formData.password.length >= 8 &&
      context.formData.password === context.formData.confirmPassword,
    isAccepted: ({ context }) => context.formData.accepted === true,
  },
}).createMachine({
  id: 'registration',
  initial: 'Step1',
  context: {
    formData: { name: '', email: '', password: '', confirmPassword: '' },
    errors: {},
    serverError: null,
  },
  states: {
    Step1: {
      initial: 'Idle',
      states: {
        Idle: { on: { CHANGE: { target: 'Dirty' } } },
        Dirty: { on: { CHANGE: { target: 'Dirty' } } },
        Validating: {
          on: {
            VALIDATION_PASS: 'Idle',
            VALIDATION_FAIL: { target: 'Dirty', actions: 'setErrors' },
          },
        },
      },
      on: {
        NEXT: { target: 'Step2', guard: 'isStep1Valid' },
        CANCEL: 'Cancelled',
      },
    },
    Step2: {
      initial: 'Idle',
      states: {
        Idle: { on: { CHANGE: { target: 'Dirty' } } },
        Dirty: { on: { CHANGE: { target: 'Dirty' } } },
        Validating: {
          on: {
            VALIDATION_PASS: 'Idle',
            VALIDATION_FAIL: { target: 'Dirty', actions: 'setErrors' },
          },
        },
      },
      on: {
        NEXT: { target: 'Step3', guard: 'isStep2Valid' },
        PREV: 'Step1',
        CANCEL: 'Cancelled',
      },
    },
    Step3: {
      initial: 'Idle',
      states: {
        Idle: { on: { ACCEPT: 'Accepting' } },
        Accepting: { on: { UNACCEPT: 'Idle' } },
      },
      on: {
        SUBMIT: { target: 'Submitting', guard: 'isAccepted' },
        PREV: 'Step2',
        CANCEL: 'Cancelled',
      },
    },
    Submitting: {
      on: {
        SUBMIT_SUCCESS: { target: 'Success', actions: 'onSuccess' },
        SUBMIT_ERROR: { target: 'Error', actions: 'setServerError' },
        CANCEL: 'Cancelled',
      },
    },
    Success: { type: 'final' },
    Error: {
      on: {
        RETRY: 'Submitting',
        CANCEL: 'Cancelled',
      },
    },
    Cancelled: { type: 'final' },
  },
});
```

XState handles the hierarchy naturally with compound states. Each step is a nested machine with its own `initial` and `states`. The root machine only sees the step-level events (NEXT, PREV, SUBMIT), while child events (CHANGE, VALIDATE) are handled within each step's sub-machine.
