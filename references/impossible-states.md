# Impossible States Catalog

> 20 concrete anti-patterns that produce impossible UI states, with the correct model that eliminates them.

---

## How to read each entry

```
## #N — Anti-pattern name

**Code that generates it:**   ← what developers actually write
**Why it is impossible:**     ← formal contradiction
**Model that eliminates it:** ← correct FSM replacement
```

---

## #1 — Loading with data

**Code that generates it:**
```tsx
const [isLoading, setIsLoading] = useState(false);
const [data, setData] = useState(null);
// <div>{isLoading ? <Spinner /> : data ? <Content /> : <Empty />}</div>
// Both isLoading and data can be true at the same time
```

**Why it is impossible:**
Loading means "no data yet." Data present means "loading is done." Both true simultaneously means the component shows a spinner over content, or content behind a spinner, depending on render order.

**Model that eliminates it:**
```
States: Idle | Loading | Success | Error
Transitions:
  Idle    → FETCH      → Loading
  Loading → FETCH_SUCCESS → Success  (data is set HERE)
  Loading → FETCH_ERROR   → Error
```

A single `state` variable replaces two booleans. `Success` implies data exists. `Loading` implies data does not exist. They are mutually exclusive by construction.

---

## #2 — Error state without error message

**Code that generates it:**
```tsx
const [isError, setIsError] = useState(false);
const [error, setError] = useState(null);
// setError(null); setIsError(true);  // error set to null but isError true
```

**Why it is impossible:**
The component declares "I am in error" but has nothing to show the user. This produces a blank error toast, an empty red banner, or a generic "Something went wrong" with no detail.

**Model that eliminates it:**
```
States: Idle | Loading | Success | Error(errorMessage)
Context: errorMessage is REQUIRED when state === 'Error'
Transition:
  Loading → FETCH_ERROR → Error  (must set errorMessage)
  Error   → RETRY       → Loading (clears errorMessage)
```

The state machine enforces that entering `Error` always carries a payload. No payload → no transition to Error.

---

## #3 — Wizard step out of bounds

**Code that generates it:**
```tsx
const [currentStep, setCurrentStep] = useState(0);
// setCurrentStep(prev => prev + 1);  // no upper bound check
// currentStep can become 5 when there are only 4 steps
```

**Why it is impossible:**
The step counter is a free integer. Nothing prevents incrementing past the last step or decrementing below 0. The component renders an undefined step.

**Model that eliminates it:**
```
States: Step1 | Step2 | Step3 | Completed
Transitions:
  Step1 → NEXT → Step2
  Step2 → NEXT → Step3
  Step3 → NEXT → Completed
  Step3 → SUBMIT → Submitting
```

The state alphabet (`Step1, Step2, Step3, Completed`) defines all valid positions. There is no integer to overflow. `currentStep > totalSteps` is structurally impossible.

---

## #4 — Open and closing simultaneously

**Code that generates it:**
```tsx
const [isOpen, setIsOpen] = useState(false);
const [isAnimating, setIsAnimating] = useState(false);
// setIsAnimating(true); setIsOpen(false);  // brief moment where isOpen is true but isAnimating is true
```

**Why it is impossible:**
If `isAnimating` means "exit animation is playing," then the modal should not be considered "open." But the boolean `isOpen` is still true until the animation callback fires. Any code checking `isOpen` gets the wrong answer.

**Model that eliminates it:**
```
States: Closed | Opening | Open | Closing
Transitions:
  Closed  → TRIGGER → Opening
  Opening → <done>  → Open
  Open    → CLOSE   → Closing
  Closing → <done>  → Closed
```

Each animation phase is its own state. `Open` and `Closing` cannot overlap. Code checking "is the modal interactive?" checks for `state === 'Open'` only.

---

## #5 — Authenticated without user

**Code that generates it:**
```tsx
const [isAuthenticated, setIsAuthenticated] = useState(false);
const [user, setUser] = useState(null);
// setIsAuthenticated(true);  // forgot to set user
```

**Why it is impossible:**
Authentication logically implies a known identity. If `isAuthenticated` is true but `user` is null, the component has no identity to display, no roles to check permissions against, and no session to refresh.

**Model that eliminates it:**
```
States: Unauthenticated | Authenticating | Authenticated(user)
Context: user is REQUIRED when state === 'Authenticated'
Transition:
  Authenticating → AUTH_SUCCESS(user) → Authenticated
```

The user object is part of the state payload. You cannot enter `Authenticated` without providing it.

---

## #6 — Multiple selection simultaneously contradictory

**Code that generates it:**
```tsx
const [selectedItems, setSelectedItems] = useState([]);
const [isAllSelected, setIsAllSelected] = useState(false);
// After deselecting all: selectedItems = [], isAllSelected = true
```

**Why it is impossible:**
`isAllSelected` claims every item is selected, but `selectedItems` is empty. Any code that checks `isAllSelected` before rendering will show a checked checkbox while the list has no selections.

**Model that eliminates it:**
```
Derive isAllSelected from selectedItems:
  isAllSelected = selectedItems.length === totalItems

Never store selection state in two places. One source of truth.
```

No state machine needed — this is a derived value, not a state. The anti-pattern is storing redundant boolean flags that can diverge from the source array.

---

## #7 — Empty success state

**Code that generates it:**
```tsx
const [status, setStatus] = useState('idle');
// setStatus('success');  // but data is still null — "success with nothing"
```

**Why it is impossible:**
"Success" means the operation completed with a result. If the result is null/undefined, either the operation didn't actually succeed or the success payload was lost. The component renders an empty success view.

**Model that eliminates it:**
```
States: Idle | Loading | Success(data) | Error(errorMessage)
Transition:
  Loading → FETCH_SUCCESS(data) → Success  (data is part of the transition payload)
```

Make the data payload mandatory on the transition. No payload → the transition cannot fire.

---

## #8 — Form submitted while invalid

**Code that generates it:**
```tsx
function handleSubmit(e) {
  e.preventDefault();
  if (!isFormValid) return;  // guard, but it's external to state
  setIsSubmitting(true);
}
// A race condition or refactoring removes the guard, and submit fires with invalid data
```

**Why it is impossible:**
A guard that lives inside the event handler is not enforced by the state machine. If a developer later moves the `setIsSubmitting(true)` call without the guard, the form submits with invalid data.

**Model that eliminates it:**
```
States: Idle | Dirty | Validating | Submitting | Success | Error
Transition:
  Dirty → SUBMIT → if isFormValid → Submitting
                → if !isFormValid → Validating
```

The guard is part of the transition definition. The machine refuses to enter `Submitting` unless the guard passes. The guard cannot be bypassed by changing the UI code.

---

## #9 — Idle state with stale data

**Code that generates it:**
```tsx
const [data, setData] = useState(null);
const [isLoading, setIsLoading] = useState(false);
// data from a previous session persists when component resets to "idle"
```

**Why it is impossible:**
"I don't have data" (idle/empty) and "I have data" should be mutually exclusive. But if the data variable is not cleared when the component resets, the user sees old content labeled as fresh.

**Model that eliminates it:**
```
States: Empty | Loading | Success | Error
Context: data is CLEARED on entering Empty
Transition:
  Any → RESET → Empty  (actions: setData(null))
```

Entering `Empty` always clears data. The state machine enforces that context is initialized on entry.

---

## #10 — Disabled button in loading state

**Code that generates it:**
```tsx
<button disabled={isSubmitting || !isFormValid}>
  {isSubmitting ? 'Saving...' : 'Save'}
</button>
// button says "Saving..." but is also disabled — redundant
```

**Why it is impossible:**
If the user sees "Saving..." they know the form is submitting. Disabling the button is redundant with the visual state. Worse, if `isSubmitting` is true but the button is somehow not disabled, the user can click "Saving..." and trigger another submit.

**Model that eliminates it:**
```
States: Idle | Dirty | Submitting | Success | Error
The button renders as:
  Dirty     → enabled,  label="Save"
  Submitting → disabled, label="Saving..."
  Success/Error → disabled until auto-reset
```

The button's `disabled` and `label` are derived from the state. One source of truth. No disconnect between what the user sees and what the button does.

---

## #11 — Multiple simultaneous overlays

**Code that generates it:**
```tsx
const [showModal, setShowModal] = useState(false);
const [showDrawer, setShowDrawer] = useState(false);
const [showPopover, setShowPopover] = useState(false);
// All three can be true simultaneously — three overlapping layers
```

**Why it is impossible:**
A modal, drawer, and popover all compete for the user's attention. The user cannot interact with all three at once. Z-index conflicts, focus trap conflicts, and scroll lock conflicts arise.

**Model that eliminates it:**
```
Parent machine layer:
States: Default | ModalOpen | DrawerOpen | PopoverOpen

Or use a stacking model:
States: Default | Overlay(modal|drawer|popover)
Only ONE overlay active at any time.
```

Enforce that entering any overlay state exits the previous one. If the product requires stacked overlays (modal on top of drawer), model it explicitly with orthogonal regions.

---

## #12 — Fetch success after component unmounted

**Code that generates it:**
```tsx
fetch('/api/data')
  .then(res => res.json())
  .then(data => {
    setData(data);       // BUG: component may be unmounted
    setIsLoading(false); // sets state on unmounted component
  });
```

**Why it is impossible:**
The component left the DOM (should be in a terminal state or destroyed) but receives an event that tries to transition it. React logs "Can't perform a React state update on an unmounted component." The data is set but never rendered.

**Model that eliminates it:**
```
Solution: cancel the fetch on unmount, or use a request ID guard.
Transition:
  Loading → FETCH_SUCCESS(requestId) → Success
  Guard: requestId === currentRequestId
```

Each request gets a unique ID. When the component unmounts, `currentRequestId` is nullified. Late responses are ignored because the guard fails. The state machine never receives the transition.

---

## #13 — Optimistic update with no rollback

**Code that generates it:**
```tsx
setOptimistic(true);
patchServer(value)
  .catch(() => {
    // catch block is empty — optimistic update is never rolled back
  });
```

**Why it is impossible:**
The user sees the optimistic state (button says "On") but the server rejected the change. The UI never reverts. The user believes the action succeeded when it did not.

**Model that eliminates it:**
```
States: Off | PendingOn | On | PendingOff | Off | Error
Transitions:
  Off       → TOGGLE → PendingOn    (optimistic On)
  PendingOn → CONFIRM → On          (server confirms)
  PendingOn → REJECT → Off          (server rejects — rollback)
  PendingOn → ERROR   → Error       (network error)
```

Every `Pending*` state MUST have both a `CONFIRM` and a `REJECT` target. No pending state without an exit for failure. (See Pattern 4 in component-patterns.md.)

---

## #14 — Token refresh with no fallback

**Code that generates it:**
```tsx
const refreshToken = async () => {
  const response = await fetch('/api/auth/refresh');
  const data = await response.json();
  setToken(data.token);  // if refresh fails, token is undefined
};
```

**Why it is impossible:**
If the refresh request fails, `data.token` is undefined. The token becomes undefined silently. The next API call fails with 401, but the user appears "authenticated" until they try to do something.

**Model that eliminates it:**
```
States: Authenticated | Refreshing | SessionExpired
Transition:
  Authenticated → REFRESH_TOKEN → Refreshing
  Refreshing    → REFRESH_SUCCESS(token) → Authenticated
  Refreshing    → REFRESH_FAIL → SessionExpired  (explicit degraded state)
```

`SessionExpired` is a named state, not an undefined token. The component can show a "Your session expired" banner instead of silently breaking.

---

## #15 — Accordion with multiple panels "expanded" but no content

**Code that generates it:**
```tsx
const [expandedPanels, setExpandedPanels] = useState({});
// togglePanel('panel1'): setExpandedPanels(prev => ({...prev, panel1: !prev.panel1}))
// When a panel is removed from the DOM, its key stays in expandedPanels forever
```

**Why it is impossible:**
A panel that does not exist in the DOM is listed as "expanded." The accordion claims to show content that isn't there. If panels are dynamically rendered, a removed panel's expanded state leaks.

**Model that eliminates it:**
```
For each panel: collapsed | expanded | removed
When the panel is unmounted, transition to removed and clear from context.
Or: use an array of panel IDs as the source of truth; derive expanded from the array.
```

Better: model the accordion as a collection of independent toggle machines, each destroyed when its panel unmounts. No stale keys.

---

## #16 — Scroll position in wrong state

**Code that generates it:**
```tsx
const [scrollPosition, setScrollPosition] = useState(0);
// User scrolls in Loading state — scrollPosition keeps updating
// When content loads, scroll jumps to the loading-era position
```

**Why it is impossible:**
Scroll position captured during a loading state (when content height may be different) is applied after content loads. The user lands at a meaningless scroll offset.

**Model that eliminates it:**
```
States: Idle | Loading | Success | Error
Action on entering Loading: store scrollPosition = null
Action on entering Success: if scrollPosition was saved → restore it
                             else → scrollTo(0,0)
```

Scroll position is context that depends on the state. Reset it when entering states where it is invalid. Only restore it from the correct state.

---

## #17 — Pagination with currentPage > totalPages

**Code that generates it:**
```tsx
const [currentPage, setCurrentPage] = useState(1);
const [totalPages, setTotalPages] = useState(10);
// setCurrentPage(15);  // no upper bound enforcement
```

**Why it is impossible:**
The UI shows "Page 15 of 10." Next page button is enabled but there are no more pages. The user clicks next and gets an error or blank page.

**Model that eliminates it:**
```
States: Page1 | Page2 | ... | PageN
Transitions:
  PageK → NEXT → if K < N → Page(K+1)
               → if K >= N → EndOfList
```

Or use a state machine with context:
```
States: Active | EndOfList
Context: currentPage (1..totalPages)
Guard on NEXT: currentPage < totalPages
Guard on PREV: currentPage > 1
```

The guard prevents advancing past the last page. The machine cannot enter `currentPage > totalPages` because the transition is guarded.

---

## #18 — Dirty form that was never touched

**Code that generates it:**
```tsx
const [isDirty, setIsDirty] = useState(false);
const [touched, setTouched] = useState({});
// isDirty = true but touched = {} — form claims to be modified but no field was touched
```

**Why it is impossible:**
"Dirty" should mean "at least one field was modified." If no field was touched, dirty is a lie. The save button is enabled but there is nothing to save.

**Model that eliminates it:**
```
States: Idle | Dirty | Submitting
Derive isDirty: const isDirty = state !== 'Idle'
Transition:
  Idle  → CHANGE → Dirty  (a field changed)
  Dirty → SUBMIT → Submitting
  Dirty → RESET  → Idle
```

`isDirty` is derived from the state, not stored separately. It is true iff the state is `Dirty`, which can only be entered via a CHANGE event.

---

## #19 — Notification with no message

**Code that generates it:**
```tsx
const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });
// setToast({ visible: true, message: '', type: 'error' });
// Toast is visible but has no text
```

**Why it is impossible:**
A visible toast with an empty message renders an empty box. The user sees a floating UI element with nothing to read. This is confusing and unhelpful.

**Model that eliminates it:**
```
States: Hidden | Entering | Visible | Exiting
Context: message is REQUIRED on entering Entering
Transition:
  Hidden → SHOW(message, type) → Entering
  Guard: message.length > 0
```

The guard ensures empty messages never produce a visible notification. If the message is empty, the SHOW event is ignored.

---

## #20 — Checkbox that is checked but disabled

**Code that generates it:**
```tsx
const [isChecked, setIsChecked] = useState(true);
const [isDisabled, setIsDisabled] = useState(true);
// Checkbox shows a checkmark but user cannot uncheck it
// No visual feedback that it's read-only
```

**Why it is impossible:**
A checked-and-disabled checkbox is visually ambiguous. Is it checked because the value is true, or is it disabled because the value is locked? Users click it expecting feedback and get nothing.

**Model that eliminates it:**
```
States: Unchecked(interactive) | Checked(interactive) | Unchecked(readonly) | Checked(readonly)
Or, simpler:
States: Unchecked | Checked
Prop: readonly (orthogonal concern)
```

If readonly, render a badge or text instead of a checkbox. If interactive, allow toggling. Never render an interactive-looking element that ignores clicks.

---

## #21 — Tab content mismatch with active tab

**Code that generates it:**
```tsx
const [activeTab, setActiveTab] = useState('tab1');
const [tabContent, setTabContent] = useState({});
// setTabContent(prev => ({...prev, tab1: 'new content' }));
// But active tab is now 'tab2' — the update was for the wrong tab
```

**Why it is impossible:**
A data update arrives for a tab that is no longer active. The user sees stale content when they switch back, or the content is updated in a hidden panel that the user didn't intend to change.

**Model that eliminates it:**
```
States: Tab1 | Tab2 | Tab3
Each tab has its own loading/loaded sub-machine:
  Tab1: Idle | Loading | Loaded
  Tab2: Idle | Loading | Loaded
  Tab3: Idle | Loading | Loaded

Transitions for data:
  Any → SWITCH_TAB(target) → target
  TabK.Loading → FETCH_SUCCESS(data) → TabK.Loaded  (only updates active tab's content)
```

Content updates are scoped to the active tab's machine instance. When switching away, the tab's machine is paused (not destroyed), so stale updates do not affect the visible tab.

---

## #22 — Download completing but no file reference

**Code that generates it:**
```tsx
const [isDownloading, setIsDownloading] = useState(false);
// When download completes: setIsDownloading(false)
// The file reference (blob URL, path) is never stored
```

**Why it is impossible:**
The download finished successfully but the component has no reference to the result. The user cannot open or save the file. The loading state disappeared but nothing replaced it.

**Model that eliminates it:**
```
States: Idle | Downloading | Complete(blobUrl) | Error
Transition:
  Downloading → DOWNLOAD_SUCCESS(blobUrl) → Complete
```

`Complete` carries the file reference. If the blob URL is null/undefined, the transition to `Complete` cannot fire. The component stays in `Downloading` or goes to `Error`.

---

## #23 — ConnectedWebSocket but disconnected

**Code that generates it:**
```tsx
const [isConnected, setIsConnected] = useState(false);
// WebSocket 'close' event handler is attached but never fires
// isConnected stays true even after the socket disconnects
```

**Why it is impossible:**
The application believes it has a live WebSocket connection, but the socket is actually closed. The user sees live-updating data that isn't updating. Messages sent are silently lost.

**Model that eliminates it:**
```
States: Disconnected | Connecting | Connected | Reconnecting
Transition:
  Connected → WS_CLOSE → Disconnected (set isConnected = false)
  Connected → WS_ERROR  → Reconnecting (auto-retry)
  Reconnecting → WS_OPEN → Connected
  Reconnecting → WS_CLOSE → Disconnected (give up)
```

Both `WS_CLOSE` and `WS_ERROR` events transition out of `Connected`. The machine cannot remain in `Connected` when the socket is gone.

---

## #24 — Timer negative or NaN

**Code that generates it:**
```tsx
const [timer, setTimer] = useState(60);
// setTimer(prev => prev - 1);  // no lower bound
// timer can become -1, -2, or NaN if dercrement is miswired
```

**Why it is impossible:**
A countdown displays negative numbers. The user sees "-3 seconds remaining." The component may try to render a progress bar wider than 100%.

**Model that eliminates it:**
```
States: Running(seconds) | Expired
Transition:
  Running → TICK → if seconds > 0 → Running(seconds - 1)
                 → if seconds <= 0 → Expired
```

The guard `seconds > 0` prevents the counter from going negative. When seconds reach 0, the machine transitions to `Expired` instead of continuing to decrement.

---

## #25 — Drop zone hovering while disabled

**Code that generates it:**
```tsx
const [isDragOver, setIsDragOver] = useState(false);
const [isDisabled, setIsDisabled] = useState(false);
// isDragOver = true, isDisabled = true — drop zone shows hover state but rejects drops
```

**Why it is impossible:**
The visual hover effect promises "you can drop here" but the disabled state prevents it. The user drops the file and nothing happens. No feedback.

**Model that eliminates it:**
```
States: Idle | Active | DragOver | Uploading | Error | Disabled
Transition:
  Active → DRAG_ENTER → DragOver
  Disabled → DRAG_ENTER → Disabled (no visual change)
  Idle → DRAG_ENTER → Idle (if drag is not enabled)
```

No transition to `DragOver` from `Disabled`. The hover CSS class is only added when `state === 'DragOver'`. If disabled, `DRAG_ENTER` is not handled (or is a self-transition with no visual change).

---

## #26 — Multiple radio buttons selected

**Code that generates it:**
```tsx
const [selectedValue, setSelectedValue] = useState(null);
// setSelectedValue('option1');
// setSelectedValue('option2');  // overwrites, so only one is selected
// But if using checked={isSelected} per button:
//   <input checked={selectedValue === 'option1'} />  // only one is checked
//   <input checked={selectedValue === 'option2'} />  // by definition
```

This one is usually handled correctly in controlled components. The anti-pattern appears in **uncontrolled** mode or when a custom `SelectAll` interacts with radios:

```tsx
const [selected, setSelected] = useState({});
// toggleRadio('option1') → selected = { option1: true }
// toggleRadio('option2') → selected = { option1: true, option2: true }
// Two radio buttons checked
```

**Model that eliminates it:**
```
States: NoneSelected | Option1 | Option2 | Option3
Transition:
  Any → SELECT(option) → OptionK
```

Each radio maps to one state. Selecting a new option automatically leaves the previous one. No two states can be active at once.

---

## #27 — Progress bar at 100% but not complete

**Code that generates it:**
```tsx
const [progress, setProgress] = useState(0);
const [status, setStatus] = useState('uploading');
// setProgress(100);  // progress bar fills completely
// status is still 'uploading' — no transition to 'complete'
```

**Why it is impossible:**
The progress bar shows "done" (100%) but the status says "uploading." The user thinks the upload is finished and navigates away, losing the upload.

**Model that eliminates it:**
```
States: Idle | Uploading(progress) | Complete | Error
Transition:
  Uploading → UPLOAD_PROGRESS(pct) → if pct < 100 → Uploading(pct)
                                    → if pct >= 100 → Complete
```

At 100%, the machine **must** transition to `Complete`. Progress is context within `Uploading`, but reaching 100% triggers a state change automatically.

---

## #28 — Delete button visible on deleted item

**Code that generates it:**
```tsx
// Item shows a "Delete" button, user clicks it
// Optimistic: item removed from list
// Then RESTORE is called — item comes back with user data but button says "Delete"
// The item was already "deleted" but the delete button is still there
```

**Why it is impossible:**
An item in the "deleted" state still shows the "Delete" action. The user can try to delete something that is already deleted, causing an error or duplicate request.

**Model that eliminates it:**
```
States: Active | Deleting | Deleted(undoAvailable) | DeletedPermanently
Transitions:
  Active → DELETE → Deleting
  Deleting → DELETE_SUCCESS → Deleted(undoAvailable)
  Deleting → DELETE_ERROR → Active
  Deleted → UNDO → Active
  Deleted → CONFIRM_PERMANENT → DeletedPermanently
```

The "Delete" button renders when `state === 'Active'`. In `Deleted(undoAvailable)`, render "Undo" instead. The delete action is structurally absent from the UI.

---

## #29 — Search results mixed between queries

**Code that generates it:**
```tsx
const [query, setQuery] = useState('');
const [results, setResults] = useState([]);
// User types "a" → fetch("?q=a")
// User types "ab" → fetch("?q=ab")  // fast network
// "a" response arrives LATER → setResults from "a" overwrites "ab" results
```

**Why it is impossible:**
The user searched for "ab" but sees results for "a." The UI says "Results for 'ab'" because `query` is "ab", but `results` is from the stale "a" request.

**Model that eliminates it:**
```
States: Idle | Searching(query) | Results(query) | Error
Transition:
  Searching → FETCH_SUCCESS(requestQuery) → if requestQuery === currentQuery → Results
                                           → if requestQuery !== currentQuery → Searching (discard)
```

The guard compares the response's query against the current query. If they don't match, the response is discarded and the machine stays in `Searching`.

---

## #30 — Timer running while component is hidden

**Code that generates it:**
```tsx
useEffect(() => {
  const id = setInterval(() => setCount(c => c + 1), 1000);
  return () => clearInterval(id);
}, []);
// Timer keeps running even when tab is backgrounded or component is hidden
```

**Why it is impossible:**
The component is invisible (hidden tab, minimized window) but still consuming resources, updating state, and potentially triggering re-renders. On mobile, this drains battery.

**Model that eliminates it:**
```
States: Visible | Hidden
Transition:
  Visible → VISIBILITY_CHANGE(hidden) → Hidden (clearInterval)
  Hidden  → VISIBILITY_CHANGE(visible) → Visible (setInterval)
```

The timer is started on entering `Visible` and stopped on entering `Hidden`. The interval ID is cleaned up by the machine's exit action.

---

## #31 — Form submitted with missing required fields

**Code that generates it:**
```tsx
<form onSubmit={handleSubmit}>
  <input required name="email" />
  <button type="submit">Submit</button>
</form>
// If using JavaScript validation that doesn't check HTML5 required
// or if the required attribute is removed dynamically
```

**Why it is impossible:**
The form submits without the required field. The server returns a 422, the user has to scroll back, and the error is confusing because "I clicked Submit — why did it fail?"

**Model that eliminates it:**
```
States: Idle | Dirty | Validating | Submitting | Success | Error
Transition:
  Dirty → SUBMIT → if allRequiredFieldsFilled → Submitting
                 → if !allRequiredFieldsFilled → Validating (highlight missing fields)
```

The guard `allRequiredFieldsFilled` is part of the transition definition. If it fails, the form enters `Validating`, not `Submitting`. The submit action never fires.

---

## #32 — Toast that never disappears

**Code that generates it:**
```tsx
const [toasts, setToasts] = useState([]);
// addToast('message') pushes a toast
// But the auto-dismiss timer is never set
// Toasts accumulate forever
```

**Why it is impossible:**
A toast with no dismiss mechanism (no timeout, no close button) occupies screen space indefinitely. Accumulated toasts block the UI. On mobile, they cover the entire viewport.

**Model that eliminates it:**
```
States: Hidden | Entering | Visible | Exiting
Transition:
  Visible → TIMEOUT → if hasTimeout → Exiting
           → TIMEOUT → if !hasTimeout → Visible (no-op)
  Visible → DISMISS → if canDismiss → Exiting
```

Every toast enters `Visible` with a context `{ duration: number }`. If `duration > 0`, a setTimeout is started on entry. When it fires, `TIMEOUT` transitions to `Exiting`. If `duration === 0`, the toast requires manual dismiss (acceptable for critical errors). But the model makes this explicit, not accidental.

---

## #33 — Step indicator says "Complete" but step was skipped

**Code that generates it:**
```tsx
const steps = ['Welcome', 'Profile', 'Payment', 'Done'];
const [completedSteps, setCompletedSteps] = useState(new Set());
// User skips Profile step
// setCompletedSteps(prev => new Set([...prev, 'Profile']));
// Step indicator shows a green checkmark on Profile — but it was skipped
```

**Why it is impossible:**
The step indicator claims the step was completed, but the user never filled in the data. A skipped step should show "Skipped" (or similar), not "Completed."

**Model that eliminates it:**
```
States: Welcome | Step1 | Step2_Skipped | Step3 | Completed
Transition:
  Welcome → NEXT → Step1
  Step1   → SKIP → Step2_Skipped  (skipped is a distinct state)
  Step1   → NEXT → Step2
```

Skipped steps are their own states. The progress indicator checks the actual state name rather than a boolean. `Step2_Skipped` renders differently from `Step2`.

---

## #34 — Both prev and next buttons disabled

**Code that generates it:**
```tsx
<button disabled={currentStep === 0}>Previous</button>
<button disabled={currentStep === totalSteps - 1}>Next</button>
// On step 0: Previous disabled, Next enabled
// On last step: Previous enabled, Next disabled
// But if totalSteps is 1: BOTH disabled — user is stuck
```

**Why it is impossible:**
A wizard with one step shows both "Previous" and "Next" disabled. The user has no way to proceed or go back. The only option is to close the browser tab.

**Model that eliminates it:**
```
States: SingleStep | MultiStep(first | middle | last)
When totalSteps === 1:
  Transition: SingleStep → SUBMIT → Completed
  No NEXT or PREV events handled.
```

For single-step wizards, the NEXT/PREV events are not handled. The button renders as "Submit" instead of "Next." The user can only submit or cancel. No deadlock.

---

## #35 — Scroll restoration with wrong content

**Code that generates it:**
```tsx
useEffect(() => {
  const savedPosition = sessionStorage.getItem('scrollPosition');
  if (savedPosition) window.scrollTo(0, parseInt(savedPosition));
}, []);
// Content changed between saves and restores
// User scrolls to position 500 but content at that position is now different
```

**Why it is impossible:**
Scroll position is restored without checking whether the content matches. The user lands on a different section than expected. If the content is shorter than the saved position, the page scrolls past the bottom.

**Model that eliminates it:**
```
States: Initial | Loaded(contentId) | Restoring(contentId) | Scrolled(contentId)
Transition:
  Loaded → RESTORE_SCROLL(savedContentId, savedPosition)
        → if savedContentId === currentContentId → Restoring(contentId)  (scrollTo)
        → if savedContentId !== currentContentId → Loaded  (no restore, content changed)
```

The guard compares the content identity. If the content changed between saves, scroll restoration is skipped. The user starts at the top of the new content.

---

## Quick reference

| # | Anti-pattern | Root cause | Fix |
|---|-------------|------------|-----|
| 1 | Loading with data | Two booleans → 4 states | Union state |
| 2 | Error without message | setError(null) + setIsError(true) | Payload required on Error |
| 3 | Step out of bounds | Integer counter | Finite state alphabet |
| 4 | Open and closing | Two booleans for 4 phases | Named animation states |
| 5 | Authenticated no user | setAuth(true) without user | Payload required on Authenticated |
| 6 | Selection inconsistency | Redundant boolean flag | Derive from source |
| 7 | Success with no data | setStatus('success') without payload | Payload required on Success |
| 8 | Submit while invalid | Guard in handler (bypassable) | Guard on transition |
| 9 | Idle with stale data | Context not cleared on entry | Clear on entry action |
| 10 | Disabled + loading | Redundant with visual state | Derive from state |
| 11 | Multiple overlays | Independent booleans | Single overlay machine |
| 12 | Late response on unmounted | No request identity | Guard: request ID match |
| 13 | Optimistic no rollback | Empty catch block | REJECT target required |
| 14 | Token refresh no fallback | Undefined token | SessionExpired state |
| 15 | Stale expanded panel | Key in object after unmount | Per-instance machine |
| 16 | Wrong scroll position | State-dependent context | Reset on entry |
| 17 | Page > total pages | Integer without bound | Guard on NEXT |
| 18 | Dirty but untouched | Redundant boolean | Derive from state |
| 19 | Empty notification | Missing message guard | Guard: message.length > 0 |
| 20 | Checked + disabled | Ambiguous visual | Readonly state or hide |
| 21 | Tab content mismatch | Update for wrong tab | Scoped per-tab machines |
| 22 | Done but no file | Missing payload | Payload required on Complete |
| 23 | Connected WebSocket but disconnected | Missing close handler | WS_CLOSE handler required |
| 24 | Negative timer | Missing lower bound | Guard: seconds > 0 |
| 25 | Drop hover while disabled | Visual state not tied to machine | Derive from state |
| 26 | Multiple radios selected | Uncontrolled mode | One state per option |
| 27 | 100% but not complete | Progress not tied to state | Auto-transition at 100% |
| 28 | Delete on deleted | Action on wrong state | Conditional render from state |
| 29 | Mixed query results | Stale response overwrites | Request ID guard |
| 30 | Timer in hidden tab | No visibility awareness | Stop on hidden, start on visible |
| 31 | Missing required field | Guard bypassed | Guard on transition |
| 32 | Toast never disappears | Missing timeout | TIMEOUT event with guard |
| 33 | Complete but skipped | Single boolean | Distinct "skipped" state |
| 34 | Both prev/next disabled | Single-step deadlock | Conditional render from state |
| 35 | Wrong scroll restore | Content identity mismatch | Guard: content ID match |

---

*This file is part of the state-machine skill. See SKILL.md for the full table of contents.*
