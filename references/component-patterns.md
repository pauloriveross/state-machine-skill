# Component Patterns

> Catalog of 12 canonical UI component state machines. Each pattern includes the model, ASCII diagram, invariants, and edge cases.

---

## Pattern 1 — Modal (basic)

### States

| State | Description | Terminal |
|-------|-------------|----------|
| Closed | Modal is not rendered or hidden | No |
| Opening | CSS transition / animation playing in | No |
| Open | Modal is visible with full content | No |
| Closing | CSS transition / animation playing out | No |

### Transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Closed | TRIGGER | — | Opening | onOpen callback |
| Opening | <done> | — | Open | trapFocus() |
| Open | DISMISS | canDismiss | Closing | — |
| Open | CLOSE_BTN | — | Closing | — |
| Open | ESC | canDismiss | Closing | — |
| Open | OVERLAY_CLICK | canDismiss | Closing | — |
| Closing | <done> | — | Closed | releaseFocus(), onClose callback |

### Guards

| Guard | Expression | Purpose |
|-------|------------|---------|
| canDismiss | !props.disableClose && !context.isBlocking | Allow or block dismiss |

### Diagram

```
                    ┌──────────────────────────────────────┐
                    │    DISMISS / CLOSE_BTN / ESC /       │
                    │        OVERLAY_CLICK                 │
                    v          (canDismiss)                │
┌────────┐ TRIGGER ┌──────────┐ <done> ┌──────┐           │
│ Closed │────────>│ Opening  │───────>│ Open │           │
└────────┘         └──────────┘        └──┬───┘           │
                                          │                │
                                          │ DISMISS/       │
                                          │ CLOSE_BTN/ESC/ │
                                          │ OVERLAY_CLICK  │
                                          v                │
                                      ┌────────┐          │
                                      │Closing │──────────┘
                                      └───┬────┘ <done>
                                          │
                                          v
                                      ┌────────┐
                                      │ Closed │
                                      └────────┘
```

### Invariants

- Opening and Closing are **transient** — the component MUST NOT wait for user input in these states
- <done> is a machine-internal event, never dispatched from outside
- At any point, DISMISS returns the modal to Closed through Closing (or stays in place if canDismiss is false)

### Edge cases

| Edge case | Handling |
|-----------|----------|
| TRIGGER while Opening | No-op (event not handled) |
| TRIGGER while Open | No-op (already open) |
| Double-click close button | First CLOSE_BTN → Closing; second is no-op |
| ESC while animating out | No-op (Closing ignores ESC) |
| Browser back button | Must be handled externally via beforeunload |

---

## Pattern 2 — Modal with async content

### States

| State | Description | Terminal |
|-------|-------------|----------|
| Closed | Not rendered | No |
| Opening | Animating in | No |
| Loading | Spinner visible, fetching data | No |
| Success | Content displayed | No |
| Error | Error message displayed with retry | No |
| Closing | Animating out | No |

### Transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Closed | TRIGGER | — | Opening | onOpen callback |
| Opening | <done> | — | Loading | fetchData() |
| Loading | FETCH_SUCCESS | — | Success | setData(response) |
| Loading | FETCH_ERROR | — | Error | setError(message) |
| Success | DISMISS | canDismiss | Closing | — |
| Error | DISMISS | canDismiss | Closing | — |
| Error | RETRY | — | Loading | fetchData() |
| Closing | <done> | — | Closed | onClose callback |

### Guards

Same as Pattern 1.

### Diagram

```
                    ┌────────────────────────────────────────┐
                    │              DISMISS                    │
                    v              (canDismiss)               │
┌────────┐ TRIGGER ┌──────────┐   ┌──────────┐              │
│ Closed │────────>│ Opening  │──>│ Loading  │              │
└────────┘         └──────────┘   └────┬─────┘              │
                                       │                    │
                              ┌────────┼──────┐             │
                              v        v      │             │
                         ┌─────────┐ ┌─────────┐ │           │
                         │ Success │ │  Error  │ │           │
                         └────┬────┘ └────┬────┘ │           │
                              │           │      │           │
                              │    RETRY  │      │           │
                              │           v      │           │
                              │       ┌─────────┐│           │
                              │       │ Loading ││           │
                              │       └─────────┘│           │
                              └───────┬──────────┘           │
                                      v                     │
                                  ┌────────┐                │
                                  │Closing │◄───────────────┘
                                  └───┬────┘ DISMISS
                                      │
                                      │ <done>
                                      v
                                  ┌────────┐
                                  │ Closed │
                                  └────────┘
```

### Invariants

- The component MUST NOT be dismissible while Loading (unless explicitly specified)
- RETRY from Error re-enters Loading, not Opening
- FETCH_SUCCESS and FETCH_ERROR are only valid in Loading

### Edge cases

| Edge case | Handling |
|-----------|----------|
| FETCH_SUCCESS arrives after user dismissed | Ignored (no handler in Closing) |
| Network timeout | FETCH_ERROR dispatched with timeout message |
| Stale response (two rapid TRIGGERs) | Cancel previous request; ignore late response via request ID guard |
| TRIGGER while already open | No-op; user must close first |

---

## Pattern 3 — Toggle (simple)

### States

| State | Description | Terminal |
|-------|-------------|----------|
| Off | Off state (default unchecked) | No |
| On | On state (checked) | No |

### Transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Off | TOGGLE | — | On | onChange(true) |
| On | TOGGLE | — | Off | onChange(false) |

### Diagram

```
     TOGGLE (onChange(false))
┌──────┐ ◄─────────────────── ┌──────┐
│ Off  │                      │  On  │
└──────┘ ───────────────────► └──────┘
     TOGGLE (onChange(true))
```

### Invariants

- The component is always in exactly one of two states
- Every TOGGLE event changes the state

### Edge cases

| Edge case | Handling |
|-----------|----------|
| TOGGLE while disabled | Guard: isEnabled must be true |
| Controlled vs uncontrolled | Controlled: state comes from props; TOGGLE only calls onChange |

---

## Pattern 4 — Toggle (async with optimistic UI)

### States

| State | Description | Terminal |
|-------|-------------|----------|
| Off | Toggle is off | No |
| PendingOn | Optimistically showing On, awaiting server | No |
| On | Server confirmed On | No |
| PendingOff | Optimistically showing Off, awaiting server | No |
| Error | Server rejected the change | No |

### Transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Off | TOGGLE | — | PendingOn | setOptimistic(true), patchServer(true) |
| PendingOn | CONFIRM | — | On | onChange(true) |
| PendingOn | REJECT | — | Off | rollback(false), setError(message) |
| On | TOGGLE | — | PendingOff | setOptimistic(false), patchServer(false) |
| PendingOff | CONFIRM | — | Off | onChange(false) |
| PendingOff | REJECT | — | On | rollback(true), setError(message) |
| Error | DISMISS | — | Off | clearError() |
| Error | RETRY | — | PendingOn | patchServer(true) |
| Off | RETRY | — | PendingOn | patchServer(true) |

### Guards

| Guard | Expression | Purpose |
|-------|------------|---------|
| isOnline | navigator.onLine === true | Prevent toggle when offline |

### Diagram

```
                 ┌──────────────────────────────────────────────┐
                 │         TOGGLE + isOnline                    │
                 v                                              │
    ┌────────┐       ┌────────────┐ CONFIRM ┌────────┐        │
    │  Off   │──────>│ PendingOn  │────────>│   On   │        │
    └───┬────┘       └──────┬─────┘         └───┬────┘        │
        │                   │ REJECT             │             │
        │                   v                    │             │
        │               ┌───────┐                │             │
        │               │ Error │                │             │
        │               └───┬───┘                │             │
        │                   │ TOGGLE             │             │
        │                   │ (RETRY)            │             │
        │                   v                    │             │
        │               ┌────────────┐           │             │
        │               │ PendingOn  │           │             │
        │               └────────────┘           │             │
        │                                        │             │
        │              ┌─────────────────────────┘             │
        │              v          TOGGLE + isOnline            │
        │    ┌────────────┐ CONFIRM ┌────────┐                │
        │    │ PendingOff │────────>│  Off   │────────────────┘
        │    └──────┬─────┘         └────────┘
        │           │ REJECT
        │           v
        │       ┌───────┐
        └──────>│ Error │
                └───────┘
```

### Invariants

- The component is NEVER in PendingOn and On simultaneously
- The component is NEVER in PendingOff and Off simultaneously
- REJECT from PendingOn always returns to Off (rollback)
- REJECT from PendingOff always returns to On (rollback)
- User can RETRY from Error to retry the failed operation

### Edge cases

| Edge case | Handling |
|-----------|----------|
| User toggles while pending | TOGGLE is not handled in PendingOn/PendingOff |
| CONFIRM arrives late after user left page | Ignored (component unmounted) |
| Rapid toggles (Off→PendingOn→REJECT→Off→TOGGLE) | Each TOGGLE starts fresh; pending requests are cancelled |
| Offline toggle | Guard isOnline blocks the transition; show offline message |

---

## Pattern 5 — Form (single-step)

### States

| State | Description | Terminal |
|-------|-------------|----------|
| Idle | Form rendered with default/empty values | No |
| Dirty | User has modified at least one field | No |
| Validating | Client-side validation in progress | No |
| Submitting | Sending data to server | No |
| Success | Submission confirmed | Yes (transient to Idle) |
| Error | Server returned an error | No |

### Transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Idle | CHANGE | hasChanges | Dirty | updateField(name, value) |
| Dirty | CHANGE | — | Dirty | updateField(name, value) |
| Dirty | SUBMIT | isFormValid | Submitting | onSubmit(formData) |
| Dirty | SUBMIT | !isFormValid | Validating | validateAll() |
| Dirty | RESET | — | Idle | resetForm() |
| Validating | VALIDATION_PASS | — | Submitting | onSubmit(formData) |
| Validating | VALIDATION_FAIL | — | Dirty | setErrors(errors) |
| Submitting | SUBMIT_SUCCESS | — | Success | onSuccess(response) |
| Submitting | SUBMIT_ERROR | — | Error | setServerError(message) |
| Success | <done> | — | Idle | resetForm() |
| Error | CHANGE | — | Dirty | clearServerError(), updateField() |
| Error | RETRY | isFormValid | Submitting | onSubmit(formData) |

### Guards

| Guard | Expression | Purpose |
|-------|------------|---------|
| hasChanges | context.dirtyFields.size > 0 | Distinguish Idle from Dirty |
| isFormValid | validationErrors.size === 0 | Allow or block submission |

### Diagram

```
                    ┌────────────────────────────────────────────┐
                    │              CHANGE (isFormValid)          │
                    v                                            │
┌──────┐ CHANGE ┌────────┐ SUBMIT ┌────────────┐ SUBMIT_SUCCESS┐│
│ Idle │───────>│ Dirty  │───────>│ Submitting │───────────────┘│
└──────┘        └───┬────┘        └─────┬──────┘               │
     ▲              │                    │                       │
     │              │ SUBMIT + !valid    │ SUBMIT_ERROR          │
     │              v                    v                       │
     │ RESET   ┌────────────┐     ┌──────────┐                  │
     │         │ Validating │     │  Error   │──────────────────┘
     │         └───────┬────┘     └────┬─────┘ CHANGE (clears)
     │                 │               │ RETRY (isFormValid)
     │     VALIDATION_FAIL            v
     │                 │          ┌────────────┐
     │                 └─────────>│  Dirty     │
     │                            └────────────┘
     │
     └────────────────────────────────────────── <done> from Success
                                                  (auto-reset)
```

### Invariants

- SUBMIT from Dirty only proceeds if isFormValid passes; otherwise goes to Validating
- Validating is a transient state — the component never waits for user input there
- Success is a terminal state that auto-transitions to Idle after <done>
- CHANGE from Error clears server errors and returns to Dirty

### Edge cases

| Edge case | Handling |
|----------|----------|
| Double-click submit | First SUBMIT → Submitting; second is no-op (not handled) |
| Browser refresh during submit | Form data lost; Idle on mount |
| Server validation errors | Set field-level errors, return to Dirty for user to fix |
| Stale form (user changed tab for 1 hour) | No timeout in model; add IdleTimer guard if needed |

---

## Pattern 6 — Form (multi-step)

### Structure

This is a **hierarchical** FSM. The root machine has a state per step, and each step is itself a mini-form machine.

```
MultiStepForm (root)
  ├── Step1 (compound)
  │     ├── Idle*
  │     ├── Dirty
  │     └── Validating
  ├── Step2 (compound)
  │     ├── Idle*
  │     ├── Dirty
  │     └── Validating
  ├── Step3 (compound)
  │     ├── Idle*
  │     ├── Dirty
  │     └── Validating
  └── Completed (final)
```

### Root transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Step1 | NEXT | isStepValid | Step2 | saveStep1(data) |
| Step2 | PREV | — | Step1 | restoreStep1() |
| Step2 | NEXT | isStepValid | Step3 | saveStep2(data) |
| Step3 | PREV | — | Step2 | restoreStep2() |
| Step3 | SUBMIT | isStepValid && isLastStep | Submitting | submitAll() |

Each step's internal model follows Pattern 5 (single-step form) with Idle → Dirty → Validating, but without the Submitting/Success/Error states (those are at the root level).

### Invariants

- The component is in exactly one Step at any time
- NEXT from StepN goes to StepN+1; PREV from StepN goes to StepN-1
- PREV from Step1 is not handled (no-op or disabled)
- Each step saves its data on NEXT (not on SUBMIT)
- The final step dispatches SUBMIT instead of NEXT

### Edge cases

| Edge case | Handling |
|-----------|----------|
| User refreshes on Step2 | Restore Step1 from saved data; Step2 re-initializes |
| Browser back button | Must sync with PREV event or block navigation |
| Step validation fails | Stay in current step, show validation errors |
| PDF upload on Step2 while filling Step3 | Not possible — component is in Step3 |

---

## Pattern 7 — Onboarding wizard

### States

| State | Description | Terminal |
|-------|-------------|----------|
| Welcome | Introduction screen | No |
| Step1 | First configuration step | No |
| Step2 | Second configuration step | No |
| Step3 | Third configuration step | No |
| Completed | All steps done | Yes |
| Skipped | User opted out | Yes |

### Transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Welcome | START | — | Step1 | trackEvent('wizard_started') |
| Welcome | SKIP | — | Skipped | trackEvent('wizard_skipped') |
| Step1 | NEXT | isStepValid | Step2 | save(data) |
| Step1 | SKIP | isSkippable | Step2 | trackEvent('step1_skipped') |
| Step2 | NEXT | isStepValid | Step3 | save(data) |
| Step2 | PREV | — | Step1 | restoreStep1() |
| Step2 | SKIP | isSkippable | Step3 | trackEvent('step2_skipped') |
| Step3 | FINISH | isStepValid | Completed | submitAll(), trackEvent('completed') |
| Step3 | PREV | — | Step2 | restoreStep2() |

### Guards

| Guard | Expression | Purpose |
|-------|------------|---------|
| isSkippable | steps[step].canSkip === true | Allow skipping non-required steps |

### Diagram

```
        START
┌──────────┐ ────────────> ┌────────┐  NEXT (isValid)  ┌────────┐
│ Welcome  │               │ Step1  │ ────────────────> │ Step2  │
└─────┬────┘               └───┬────┘                   └───┬────┘
      │ SKIP                   │ SKIP (isSkippable)         │ SKIP
      v                        v                            v
┌──────────┐             ┌──────────┐              ┌──────────┐
│ Skipped  │             │ Skipped  │              │ Skipped  │
└──────────┘             └──────────┘              └──────────┘
                                                    │ FINISH
                                                    v
                                              ┌───────────┐
                                              │ Completed │
                                              └───────────┘
```

### Invariants

- Skipped is a leaf state — once skipped, the wizard does not return to active steps
- PREV from Step1 is not handled
- SKIP on a non-skippable step is blocked by isSkippable guard
- Completed and Skipped are terminal states

### Edge cases

| Edge case | Handling |
|-----------|----------|
| User presses SKIP on mandatory step | Guard isSkippable blocks it |
| User restarts after completing | New session; start fresh from Welcome |
| Step validation fails on FINISH | Stay in Step3, show errors |

---

## Pattern 8 — Dropdown / Combobox

### States

| State | Description | Terminal |
|-------|-------------|----------|
| Closed | Dropdown not visible | No |
| Opening | Animating in | No |
| Open | Dropdown visible, no search | No |
| Searching | User is typing to filter | No |
| Closing | Animating out | No |

### Transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Closed | TRIGGER | — | Opening | — |
| Opening | <done> | — | Open | — |
| Open | CLOSE | — | Closing | — |
| Open | SELECT | — | Closing | onChange(item) |
| Open | SEARCH | hasInput | Searching | setQuery(value) |
| Searching | CLOSE | — | Closing | — |
| Searching | SELECT | — | Closing | onChange(item) |
| Searching | SEARCH | — | Searching | setQuery(value) |
| Searching | CLEAR | — | Open | clearQuery() |
| Searching | <noResults> | isQueryStale | Searching | showEmptyState() |
| Closing | <done> | — | Closed | — |
| Any | CLICK_OUTSIDE | isOpen | Closing | — |

### Guards

| Guard | Expression | Purpose |
|-------|------------|---------|
| hasInput | event.value.length > 0 | Only search with non-empty input |
| isOpen | state in (Open, Searching) | CLICK_OUTSIDE guard |
| isQueryStale | lastQuery !== currentQuery | Debounce stale results |

### Invariants

- CLICK_OUTSIDE is handled in any open state
- SELECT always transitions to Closing (immediate close on selection)
- CLEAR from Searching returns to Open (no search query)
- Searching is a stable state (user can type freely)

### Edge cases

| Edge case | Handling |
|-----------|----------|
| Click outside while animating in | Not handled; wait for <done> |
| Select while loading search results | Ignore late results; SELECT references selection, not search |
| Empty search results | Stay in Searching; show "No results" UI |
| Keyboard ESC | Mapped to CLOSE event |

---

## Pattern 9 — Infinite scroll

### States

| State | Description | Terminal |
|-------|-------------|----------|
| Idle | Initial state, first page loaded or empty | No |
| LoadingMore | Fetching next page | No |
| EndOfList | All items fetched | Yes |
| Error | Failed to fetch next page | No |

### Transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Idle | SCROLL_NEAR_BOTTOM | hasMorePages | LoadingMore | fetchNextPage() |
| Idle | SCROLL_NEAR_BOTTOM | !hasMorePages | EndOfList | — |
| LoadingMore | FETCH_SUCCESS | hasMorePages | Idle | appendItems(data) |
| LoadingMore | FETCH_SUCCESS | !hasMorePages | EndOfList | appendItems(data) |
| LoadingMore | FETCH_ERROR | — | Error | setError(message) |
| Error | RETRY | — | LoadingMore | fetchNextPage() |

### Guards

| Guard | Expression | Purpose |
|-------|------------|---------|
| hasMorePages | context.currentPage < context.totalPages | End condition |

### Diagram

```
┌──────┐ SCROLL_NEAR_BOTTOM ┌─────────────┐
│ Idle │───────────────────>│ LoadingMore  │
└──┬───┘                    └──────┬───────┘
   │                               │
   │                    ┌──────────┼──────────┐
   │                    v          v          │
   │           ┌────────────┐ ┌───────────┐   │
   │           │ EndOfList  │ │   Error   │   │
   │           └────────────┘ └─────┬─────┘   │
   │                                │ RETRY   │
   │                                v         │
   │                          ┌─────────────┐ │
   │       (hasMorePages) ───>│ LoadingMore │─┘
   └──────────────────────────┘─────────────┘
```

### Invariants

- EndOfList is terminal — no further events transition out of it
- FETCH_SUCCESS from LoadingMore always checks hasMorePages to decide next state
- SCROLL_NEAR_BOTTOM in LoadingMore is not handled (prevents duplicate fetches)
- The component starts in Idle even if data is preloaded

### Edge cases

| Edge case | Handling |
|-----------|----------|
| Rapid scroll past threshold | Only first SCROLL_NEAR_BOTTOM fires; subsequent are no-op while LoadingMore |
| Refresh from top (pull-to-refresh) | Add PullToRefresh state parallel to the main machine |
| Empty initial state | Idle shows empty state; SCROLL_NEAR_BOTTOM with !hasMorePages → EndOfList |
| Network error on retry | Stay in Error; allow retry without limit |

---

## Pattern 10 — File upload

### States

| State | Description | Terminal |
|-------|-------------|----------|
| Idle | Drop zone / upload button visible | No |
| Selecting | Native file picker open | No |
| Validating | Client-side validation (size, type) | No |
| Uploading | File transfer in progress | No |
| Success | Upload complete | Yes (transient) |
| Error | Upload failed or validation failed | No |

### Transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Idle | SELECT | — | Selecting | openFilePicker() |
| Idle | DROP | isValidFile | Validating | processDroppedFile(file) |
| Idle | DROP | !isValidFile | Error | setValidationError(reason) |
| Selecting | FILE_SELECTED | isValidFile | Validating | processSelectedFile(file) |
| Selecting | FILE_SELECTED | !isValidFile | Error | setValidationError(reason) |
| Selecting | CANCEL | — | Idle | — |
| Validating | VALIDATION_PASS | — | Uploading | uploadFile(file) |
| Validating | VALIDATION_FAIL | — | Error | setValidationError(reason) |
| Uploading | UPLOAD_PROGRESS | — | Uploading | setProgress(percent) |
| Uploading | UPLOAD_SUCCESS | — | Success | onSuccess(response) |
| Uploading | UPLOAD_ERROR | — | Error | setError(message) |
| Uploading | CANCEL | — | Idle | cancelUpload() |
| Success | <done> | — | Idle | resetState() |
| Error | RETRY | — | Uploading | uploadFile(file) |
| Error | DISMISS | — | Idle | resetState() |

### Guards

| Guard | Expression | Purpose |
|-------|------------|---------|
| isValidFile | validateType(file) && validateSize(file) | Client-side file validation |

### Progress sub-model

UPLOAD_PROGRESS is a self-transition on Uploading that updates progress context. It does not change the state.

```
Uploading + UPLOAD_PROGRESS → Uploading (setProgress)
```

### Invariants

- Success auto-transitions to Idle after <done> (default 2s delay)
- CANCEL from Selecting, Uploading, or Validating always returns to Idle
- RETRY from Error re-enters Uploading (not Selecting)
- UPLOAD_PROGRESS does not change state — only updates context

### Edge cases

| Edge case | Handling |
|-----------|----------|
| File too large during selection | isValidFile false → Error with validation reason |
| User closes browser during upload | Upload continues in background or cancels on unload |
| Duplicate file upload | Check in isValidFile or handle in guard |
| Multiple files | If multi-file: Uploading holds a queue; each file transitions through its own cycle |
| Drag file over drop zone | This is a hover event, not a state transition. Track via local hover state outside the machine |

---

## Pattern 11 — Auth flow

### States

| State | Description | Terminal |
|-------|-------------|----------|
| Unauthenticated | User has no session | No |
| Authenticating | Login/signup request in flight | No |
| Authenticated | User has valid session | No |
| MfaRequired | 2FA challenge required | No |

### Transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Unauthenticated | LOGIN | hasCredentials | Authenticating | postLogin(credentials) |
| Unauthenticated | SIGNUP | hasCredentials | Authenticating | postSignup(credentials) |
| Authenticating | AUTH_SUCCESS | requiresMfa | MfaRequired | setMfaChallenge(challenge) |
| Authenticating | AUTH_SUCCESS | !requiresMfa | Authenticated | setSession(token, user) |
| Authenticating | AUTH_ERROR | — | Unauthenticated | setError(message) |
| MfaRequired | MFA_SUBMIT | hasMfaCode | Authenticating | postMfa(code) |
| MfaRequired | CANCEL | — | Unauthenticated | cancelMfa() |
| Authenticated | LOGOUT | — | Unauthenticated | clearSession() |
| Authenticated | SESSION_EXPIRED | — | Unauthenticated | clearSession(), setError('session_expired') |
| Authenticated | REFRESH | isSessionStale | Authenticated | refreshToken() |

### Guards

| Guard | Expression | Purpose |
|-------|------------|---------|
| hasCredentials | email && password | Prevent empty submit |
| requiresMfa | response.mfaRequired === true | Branch after auth |
| hasMfaCode | code.length === 6 | MFA code completeness |
| isSessionStale | tokenExpiresAt - now < 300_000 | Refresh within 5min of expiry |

### Orthogonal region note

Authenticated can have its own child machine: `Authenticated.Idle`, `Authenticated.Refreshing` if the token refresh is a visible loading state.

### Invariants

- AUTH_SUCCESS from Authenticating either goes to MfaRequired or Authenticated — never both
- LOGOUT from Authenticated clears all session data
- MFA flow always returns to Authenticating (not directly to Authenticated) so the MFA code is verified server-side
- SESSION_EXPIRED can fire at any time from Authenticated

### Edge cases

| Edge case | Handling |
|-----------|----------|
| Token expires during long form fill | SESSION_EXPIRED → Unauthenticated; form data is lost |
| Rapid LOGIN/SIGNUP spam | First event goes to Authenticating; subsequent are no-op |
| MFA code expired | MFA_SUBMIT returns AUTH_ERROR with 'code_expired' |
| Refresh token fails | SESSION_EXPIRED from Authenticated.Refreshing |

---

## Pattern 12 — Toast / Notification

### States

| State | Description | Terminal |
|-------|-------------|----------|
| Hidden | Toast not in DOM | No |
| Entering | Slide-in / fade-in animation | No |
| Visible | Toast displayed with message | No |
| Exiting | Slide-out / fade-out animation | No |

### Transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Hidden | SHOW | — | Entering | setMessage(text), setType(type) |
| Entering | <done> | — | Visible | — |
| Visible | DISMISS | canDismiss | Exiting | — |
| Visible | TIMEOUT | hasTimeout | Exiting | — |
| Visible | <done> | isAutoClose | Exiting | — |
| Exiting | <done> | — | Hidden | onClose callback |

### Guards

| Guard | Expression | Purpose |
|-------|------------|---------|
| canDismiss | type !== 'critical' | Critical toasts cannot be manually dismissed |
| hasTimeout | props.duration > 0 | Only auto-dismiss if duration is set |
| isAutoClose | elapsed >= props.duration | Auto-dismiss after duration |

### Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │   DISMISS (canDismiss) / TIMEOUT / <done>   │
                    v                   (isAutoClose)             │
┌────────┐  SHOW  ┌──────────┐ <done> ┌────────┐                 │
│ Hidden │───────>│ Entering │───────>│ Visible │                 │
└───┬────┘        └──────────┘        └───┬────┘                 │
    │                                      │                      │
    │                                      │ DISMISS/TIMEOUT     │
    │                                      v                      │
    │                                  ┌────────┐                 │
    │                                  │ Exiting│─────────────────┘
    │                                  └───┬────┘ <done>
    │                                      │
    └──────────────────────────────────────┘
```

### Invariants

- Entering and Exiting are transient states
- DISMISS on a critical toast is blocked by canDismiss guard
- TIMEOUT only fires if duration > 0 (hasTimeout guard)
- New SHOW while Visible: either queue the toast (see extension) or replace current

### Toast queue extension

For multiple toasts, add a queue context:

```
Visible + SHOW → Visible (enqueue next toast)
           guard: isQueueEnabled
           actions: [enqueueToast(next)]
Hidden → Entering
           guard: hasQueuedToasts
           actions: [dequeueToast()]
```

### Edge cases

| Edge case | Handling |
|-----------|----------|
| User hovers over toast | Pause the auto-close timeout; keep Visible |
| Toast appears during exiting animation | Queue it; show after <done> from Exiting |
| Rapid SHOW bursts | Queue all; show sequentially |
| Critical toast + user dismiss attempt | canDismiss=false → DISMISS is not handled |

---

## Summary: Which pattern to use

| If the component... | Use pattern |
|--------------------|-------------|
| Opens and closes with animation | 1 or 2 |
| Has a loading state between open and content | 2 |
| Is a simple on/off switch | 3 |
| Needs optimistic UI + server confirmation | 4 |
| Has a form with validation | 5 |
| Has multiple sequential form steps | 6 |
| Guides user through setup with skip option | 7 |
| Has a searchable list that opens/closes | 8 |
| Loads content progressively as user scrolls | 9 |
| Handles file selection → validation → upload | 10 |
| Manages authentication lifecycle | 11 |
| Shows timed notifications | 12 |

---

*This file is part of the state-machine skill. See SKILL.md for the full table of contents.*
