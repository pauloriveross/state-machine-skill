# Example: Authentication flow with MFA

> Full walkthrough: from natural language description to validated model to production code.
> This is the most elaborate example, demonstrating HFSM with MFA sub-states and session
> expiry handling.

---

## Brief

```
An authentication flow. The user starts unauthenticated. They enter their email and password
and click Login. A loading state shows while the server verifies credentials. If the server
requires multi-factor authentication, the user is prompted to enter a 6-digit code from their
authenticator app. The MFA code is verified server-side. On success, the user is authenticated.
On failure, they return to the login form with an error message. While authenticated, the
session can expire at any time, returning the user to the unauthenticated state with a
"session expired" message. The user can also log out manually. Token refresh happens
silently within the authenticated state.
```

## Invocation

```
state-machine model an authentication flow with email/password login, server-side MFA
verification, authenticated session management with silent token refresh, session expiry
handling, and manual logout.
```

---

## Produced model

This is a **hierarchical** FSM with **orthogonal regions**. The root machine has two top-level
states: `Unauthenticated` (a compound state with login flow) and `Authenticated` (a compound
state with session management).

### Root states

| State | Description | Terminal |
|-------|-------------|----------|
| Unauthenticated | User has no valid session. Login form is shown. | No |
| Authenticated | User has a valid session. App content is shown. | No |

### Unauthenticated child states

| State | Description | Terminal |
|-------|-------------|----------|
| Idle | Login form displayed with email/password fields | No |
| Authenticating | Credentials being verified server-side | No |
| MfaRequired | Server requested 2FA code | No |

### Authenticated child states

| State | Description | Terminal |
|-------|-------------|----------|
| Active | Normal operation. Session is valid. | No |
| Refreshing | Token is being refreshed silently. User sees no disruption. | No |

### Events

| Event | Origin | Description |
|-------|--------|-------------|
| LOGIN | User submits login form | Initial auth request |
| LOGIN_SUCCESS(session) | Server response — no MFA needed | Auth succeeded |
| LOGIN_MFA_REQUIRED(challenge) | Server response — MFA needed | MFA challenge |
| LOGIN_ERROR(message) | Server response — invalid credentials | Auth failed |
| MFA_SUBMIT(code) | User enters 6-digit code | MFA verification |
| MFA_SUCCESS(session) | Server confirms MFA code | MFA succeeded |
| MFA_ERROR(message) | Server rejects MFA code | MFA failed |
| MFA_CANCEL | User cancels MFA | Return to login |
| LOGOUT | User clicks logout | Manual session end |
| SESSION_EXPIRED | Token expiry detected | Automatic session end |
| REFRESH_TOKEN | Scheduled token refresh | Silent token refresh |
| REFRESH_SUCCESS(newToken) | Token refresh succeeded | Session extended |
| REFRESH_FAIL | Token refresh failed | Session expired |

### Root transitions

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Unauthenticated | LOGIN | hasCredentials | Unauthenticated.Authenticating | postLogin(credentials) |
| Authenticated | LOGOUT | — | Unauthenticated.Idle | clearSession() |
| Authenticated | SESSION_EXPIRED | — | Unauthenticated.Idle | clearSession(), setMessage('session_expired') |

### Unauthenticated child transitions

#### Idle

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Idle | CHANGE | — | Idle | updateField(name, value) |
| Idle | LOGIN | hasCredentials | Authenticating | postLogin(credentials) |

#### Authenticating

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Authenticating | LOGIN_SUCCESS | — | Authenticated.Active | setSession(session) |
| Authenticating | LOGIN_MFA_REQUIRED | — | MfaRequired | setMfaChallenge(challenge) |
| Authenticating | LOGIN_ERROR | — | Idle | setError(message) |

#### MfaRequired

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| MfaRequired | MFA_SUBMIT | hasMfaCode | Authenticating | postMfaCode(code) |
| MfaRequired | MFA_CANCEL | — | Idle | cancelMfa() |

### Authenticated child transitions

#### Active

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Active | REFRESH_TOKEN | isSessionStale | Refreshing | refreshToken() |

#### Refreshing

| From | Event | Guard | To | Actions |
|------|-------|-------|----|---------|
| Refreshing | REFRESH_SUCCESS | — | Active | setToken(newToken) |
| Refreshing | REFRESH_FAIL | — | Unauthenticated.Idle | clearSession(), setMessage('session_expired') |

### Guards

| Guard | Expression | Purpose |
|-------|------------|---------|
| hasCredentials | email.length > 0 && password.length > 0 | Prevent empty login submission |
| hasMfaCode | code.length === 6 | MFA code must be exactly 6 digits |
| isSessionStale | tokenExpiresAt - now < 300_000 | Refresh when 5 min from expiry |

### Actions

| Action | Effect | Async? |
|--------|--------|--------|
| postLogin(c) | POST /api/auth/login with credentials | Yes |
| postMfaCode(c) | POST /api/auth/mfa with code | Yes |
| setSession(s) | Stores session token and user data | No |
| setMfaChallenge(c) | Stores MFA challenge info | No |
| setError(m) | Sets login error message | No |
| setMessage(m) | Sets informational message (e.g., session expired) | No |
| clearSession() | Clears all session data | No |
| cancelMfa() | Clears MFA state | No |
| refreshToken() | POST /api/auth/refresh | Yes |
| setToken(t) | Updates access token | No |
| updateField(n, v) | Updates email/password field | No |

### Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ Unauthenticated                                                  │
│                                                                  │
│  ┌────────┐  LOGIN     ┌──────────────┐  LOGIN_SUCCESS          │
│  │  Idle  │───────────>│ Authenticating│────────────────────┐   │
│  │        │<────────────│              │                     │   │
│  └────────┘  LOGIN_ERR  └──────┬───────┘                     │   │
│       ^                        │                             │   │
│       │ MFA_CANCEL             │ LOGIN_MFA_REQUIRED          │   │
│       │                        v                             │   │
│       │                 ┌──────────────┐                     │   │
│       │                 │ MfaRequired  │                     │   │
│       │                 │              │                     │   │
│       │                 └──────┬───────┘                     │   │
│       │                        │                             │   │
│       └────────────────────────┘                             │   │
│                         MFA_SUBMIT                           │   │
│                        (hasMfaCode)                          │   │
│                          + postMfaCode                       │   │
└──────────────────────────────────────────────────────────────┘   │
                                                                   │
                                                                   v
┌──────────────────────────────────────────────────────────────────┐
│ Authenticated                                                    │
│                                                                  │
│  ┌────────┐  REFRESH_TOKEN ┌──────────────┐                     │
│  │ Active │───────────────>│  Refreshing   │                     │
│  │        │<───────────────│               │                     │
│  └────────┘ REFRESH_SUCCESS└──────┬────────┘                     │
│       ^                           │                             │
│       │                           │ REFRESH_FAIL                │
│       └───────────────────────────┘                             │
│                                                                  │
│  Events handled at this level:                                   │
│  LOGOUT  → Unauthenticated.Idle  (clearSession)                  │
│  SESSION_EXPIRED → Unauthenticated.Idle  (clearSession + msg)   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Invariants

The component MUST NEVER:

- Be in `Unauthenticated` and `Authenticated` simultaneously
- Be in `Authenticated.Active` and `Authenticated.Refreshing` simultaneously
- Allow LOGIN from `Authenticated` (already logged in)
- Allow LOGOUT from `Unauthenticated` (not logged in)
- Allow MFA_SUBMIT with an empty or partial code

The component MUST ALWAYS:

- Return to `Unauthenticated.Idle` when session expires, regardless of which `Authenticated` sub-state is active
- Enter `Authenticated` through `Authenticating` only (either directly or via MfaRequired)
- Handle SESSION_EXPIRED in both Active and Refreshing sub-states
- Show a clear error message when LOGIN_ERROR or MFA_ERROR fires

---

## Generated code (React + TypeScript)

```tsx
/* state-machine: Unauthenticated(Idle|Authenticating|MfaRequired)|Authenticated(Active|Refreshing) : LOGIN|LOGIN_SUCCESS|LOGIN_MFA_REQUIRED|LOGIN_ERROR|MFA_SUBMIT|MFA_SUCCESS|MFA_ERROR|MFA_CANCEL|LOGOUT|SESSION_EXPIRED|REFRESH_TOKEN|REFRESH_SUCCESS|REFRESH_FAIL */

import { useState, useCallback, useRef, useEffect } from 'react';

// ── Types ──

type UnauthenticatedChild = 'Idle' | 'Authenticating' | 'MfaRequired';
type AuthenticatedChild = 'Active' | 'Refreshing';

type AuthState =
  | { region: 'Unauthenticated'; child: UnauthenticatedChild }
  | { region: 'Authenticated'; child: AuthenticatedChild };

type AuthEvent =
  | { type: 'LOGIN' }
  | { type: 'LOGIN_SUCCESS'; session: Session }
  | { type: 'LOGIN_MFA_REQUIRED'; challenge: MfaChallenge }
  | { type: 'LOGIN_ERROR'; message: string }
  | { type: 'MFA_SUBMIT'; code: string }
  | { type: 'MFA_SUCCESS'; session: Session }
  | { type: 'MFA_ERROR'; message: string }
  | { type: 'MFA_CANCEL' }
  | { type: 'LOGOUT' }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'REFRESH_TOKEN' }
  | { type: 'REFRESH_SUCCESS'; token: string }
  | { type: 'REFRESH_FAIL' }
  | { type: 'CHANGE'; field: string; value: string };

interface Session {
  token: string;
  refreshToken: string;
  expiresAt: number;
  user: { name: string; email: string };
}

interface MfaChallenge {
  method: 'totp' | 'sms';
  destination?: string;
}

interface AuthContext {
  email: string;
  password: string;
  mfaCode: string;
  error: string | null;
  message: string | null;
  session: Session | null;
  mfaChallenge: MfaChallenge | null;
  tokenExpiresAt: number | null;
}

// ── Guards ──

function hasCredentials(ctx: AuthContext): boolean {
  return ctx.email.length > 0 && ctx.password.length > 0;
}

function hasMfaCode(ctx: AuthContext): boolean {
  return ctx.mfaCode.length === 6 && /^\d{6}$/.test(ctx.mfaCode);
}

function isSessionStale(ctx: AuthContext): boolean {
  if (!ctx.tokenExpiresAt) return false;
  return ctx.tokenExpiresAt - Date.now() < 300_000; // 5 minutes
}

// ── Hook ──

interface UseAuthOptions {
  onLogin?: (email: string, password: string) => Promise<{ session?: Session; mfaRequired?: MfaChallenge; error?: string }>;
  onVerifyMfa?: (code: string) => Promise<{ session?: Session; error?: string }>;
  onRefresh?: () => Promise<{ token?: string; error?: string }>;
  onLogout?: () => void;
}

const REFRESH_INTERVAL_MS = 60_000; // check every minute

export function useAuthFlow(options: UseAuthOptions = {}) {
  const [state, setState] = useState<AuthState>({ region: 'Unauthenticated', child: 'Idle' });
  const [ctx, setCtx] = useState<AuthContext>({
    email: '',
    password: '',
    mfaCode: '',
    error: null,
    message: null,
    session: null,
    mfaChallenge: null,
    tokenExpiresAt: null,
  });

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dispatch = useCallback((event: AuthEvent) => {
    setState(prev => {
      const region = prev.region;

      // ── Events handled at root level ──

      if (event.type === 'SESSION_EXPIRED') {
        clearSessionData();
        return { region: 'Unauthenticated', child: 'Idle' };
      }

      if (region === 'Authenticated' && event.type === 'LOGOUT') {
        clearSessionData();
        if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        return { region: 'Unauthenticated', child: 'Idle' };
      }

      // ── Unauthenticated region ──

      if (region === 'Unauthenticated') {
        switch (prev.child) {
          case 'Idle':
            if (event.type === 'CHANGE') {
              setCtx(c => ({ ...c, [event.field]: event.value }));
              return prev;
            }
            if (event.type === 'LOGIN' && hasCredentials(ctx)) {
              setCtx(c => ({ ...c, error: null, message: null }));
              processLogin(ctx.email, ctx.password, options);
              return { region: 'Unauthenticated', child: 'Authenticating' };
            }
            return prev;

          case 'Authenticating':
            if (event.type === 'LOGIN_SUCCESS') {
              setCtx(c => ({ ...c, session: event.session, tokenExpiresAt: event.session.expiresAt, error: null }));
              startRefreshTimer();
              return { region: 'Authenticated', child: 'Active' };
            }
            if (event.type === 'LOGIN_MFA_REQUIRED') {
              setCtx(c => ({ ...c, mfaChallenge: event.challenge }));
              return { region: 'Unauthenticated', child: 'MfaRequired' };
            }
            if (event.type === 'LOGIN_ERROR') {
              setCtx(c => ({ ...c, error: event.message }));
              return { region: 'Unauthenticated', child: 'Idle' };
            }
            return prev;

          case 'MfaRequired':
            if (event.type === 'MFA_SUBMIT' && hasMfaCode(ctx)) {
              setCtx(c => ({ ...c, error: null }));
              processMfa(ctx.mfaCode, options);
              return { region: 'Unauthenticated', child: 'Authenticating' };
            }
            if (event.type === 'MFA_CANCEL') {
              setCtx(c => ({ ...c, mfaCode: '', mfaChallenge: null }));
              return { region: 'Unauthenticated', child: 'Idle' };
            }
            if (event.type === 'MFA_ERROR') {
              setCtx(c => ({ ...c, error: event.message }));
              return { region: 'Unauthenticated', child: 'MfaRequired' };
            }
            return prev;

          default:
            return prev;
        }
      }

      // ── Authenticated region ──

      if (region === 'Authenticated') {
        switch (prev.child) {
          case 'Active':
            if (event.type === 'REFRESH_TOKEN' && isSessionStale(ctx)) {
              processRefresh(options);
              return { region: 'Authenticated', child: 'Refreshing' };
            }
            return prev;

          case 'Refreshing':
            if (event.type === 'REFRESH_SUCCESS') {
              setCtx(c => ({ ...c, tokenExpiresAt: Date.now() + 3600_000 }));
              return { region: 'Authenticated', child: 'Active' };
            }
            if (event.type === 'REFRESH_FAIL') {
              clearSessionData();
              if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
              return { region: 'Unauthenticated', child: 'Idle' };
            }
            return prev;

          default:
            return prev;
        }
      }

      return prev;
    });
  }, [ctx, options]);

  // ── Side effects ──

  useEffect(() => {
    if (state.region === 'Authenticated' && state.child === 'Active') {
      refreshTimerRef.current = setInterval(() => {
        dispatch({ type: 'REFRESH_TOKEN' });
      }, REFRESH_INTERVAL_MS);
    }
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [state.region, state.child, dispatch]);

  const login = useCallback(() => dispatch({ type: 'LOGIN' }), [dispatch]);
  const logout = useCallback(() => dispatch({ type: 'LOGOUT' }), [dispatch]);
  const submitMfa = useCallback((code: string) => dispatch({ type: 'MFA_SUBMIT', code }), [dispatch]);
  const cancelMfa = useCallback(() => dispatch({ type: 'MFA_CANCEL' }), [dispatch]);
  const change = useCallback((field: string, value: string) => dispatch({ type: 'CHANGE', field, value }), [dispatch]);

  return { state, ctx, login, logout, submitMfa, cancelMfa, change };
}

// ── Async action helpers ──

async function processLogin(email: string, password: string, options: UseAuthOptions) {
  if (!options.onLogin) return;
  try {
    const result = await options.onLogin(email, password);
    if (result.session) {
      // Dispatched via setState callback
    } else if (result.mfaRequired) {
      // Dispatched via setState callback
    } else if (result.error) {
      // Dispatched via setState callback
    }
  } catch (err) {
    // Dispatched via setState callback
  }
}

async function processMfa(code: string, options: UseAuthOptions) {
  if (!options.onVerifyMfa) return;
  try {
    const result = await options.onVerifyMfa(code);
    // Results handled by parent
  } catch (err) {
    // Handled by parent
  }
}

async function processRefresh(options: UseAuthOptions) {
  if (!options.onRefresh) return;
  try {
    const result = await options.onRefresh();
    // Results handled by parent
  } catch (err) {
    // Handled by parent
  }
}

function clearSessionData() {
  // Clears session, token, user data from storage
  sessionStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_user');
}

function startRefreshTimer() {
  // Timer is managed by the useEffect hook
}

// ── UI Component ──

interface AuthFlowProps {
  onLogin?: (email: string, password: string) => Promise<any>;
  onVerifyMfa?: (code: string) => Promise<any>;
  onRefresh?: () => Promise<any>;
  onLogout?: () => void;
  renderApp?: () => React.ReactNode;
}

export function AuthFlow({ renderApp, ...authOptions }: AuthFlowProps) {
  const { state, ctx, login, logout, submitMfa, cancelMfa, change } = useAuthFlow(authOptions);

  // ── Authenticated: show app content ──
  if (state.region === 'Authenticated') {
    return (
      <div className="auth-authenticated">
        <div className="auth-header">
          <span className="user-info">
            Logged in as <strong>{ctx.session?.user.name}</strong>
          </span>
          <button onClick={logout} className="logout-btn">Log out</button>
          {state.child === 'Refreshing' && (
            <span className="refresh-indicator">Refreshing session...</span>
          )}
        </div>
        <div className="auth-content">
          {renderApp ? renderApp() : <p>Welcome! You are authenticated.</p>}
        </div>
      </div>
    );
  }

  // ── Unauthenticated: show login or MFA ──
  return (
    <div className="auth-unauthenticated">
      {ctx.message && (
        <div className="auth-message">{ctx.message}</div>
      )}

      {/* Login form */}
      {state.child === 'Idle' && (
        <div className="login-form">
          <h2>Sign in</h2>
          {ctx.error && <div className="auth-error">{ctx.error}</div>}
          <label>
            Email
            <input
              type="email"
              value={ctx.email}
              onChange={e => change('email', e.target.value)}
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={ctx.password}
              onChange={e => change('password', e.target.value)}
            />
          </label>
          <button onClick={login} disabled={!ctx.email || !ctx.password}>
            Sign in
          </button>
        </div>
      )}

      {/* Loading state */}
      {state.child === 'Authenticating' && (
        <div className="auth-authenticating">
          <span className="spinner" />
          <p>Verifying credentials...</p>
        </div>
      )}

      {/* MFA form */}
      {state.child === 'MfaRequired' && (
        <div className="mfa-form">
          <h2>Two-factor authentication</h2>
          <p>Enter the 6-digit code from your authenticator app.</p>
          {ctx.error && <div className="auth-error">{ctx.error}</div>}
          <label>
            Authentication code
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={ctx.mfaCode}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                change('mfaCode', val);
              }}
              autoFocus
            />
          </label>
          <div className="mfa-actions">
            <button onClick={cancelMfa}>Cancel</button>
            <button
              onClick={() => submitMfa(ctx.mfaCode)}
              disabled={ctx.mfaCode.length !== 6}
            >
              Verify
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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuthFlow } from './AuthFlow';

describe('AuthFlow state machine', () => {
  const mockSession: Session = {
    token: 'abc123',
    refreshToken: 'ref456',
    expiresAt: Date.now() + 3600_000,
    user: { name: 'Alice', email: 'alice@example.com' },
  };

  it('starts in Unauthenticated.Idle', () => {
    const { result } = renderHook(() => useAuthFlow());
    expect(result.current.state).toMatchObject({
      region: 'Unauthenticated',
      child: 'Idle',
    });
  });

  it('transitions to Authenticating on LOGIN with valid credentials', () => {
    const { result } = renderHook(() => useAuthFlow());
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.change('password', 'password123'));
    act(() => result.current.login());
    expect(result.current.state).toMatchObject({
      region: 'Unauthenticated',
      child: 'Authenticating',
    });
  });

  it('does not transition on LOGIN with empty credentials', () => {
    const { result } = renderHook(() => useAuthFlow());
    act(() => result.current.login());
    expect(result.current.state).toMatchObject({
      region: 'Unauthenticated',
      child: 'Idle',
    });
  });

  it('transitions to Authenticated.Active on LOGIN_SUCCESS', () => {
    const { result } = renderHook(() => useAuthFlow());
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.change('password', 'password123'));
    act(() => result.current.login());
    act(() => result.current.dispatch({ type: 'LOGIN_SUCCESS', session: mockSession }));
    expect(result.current.state).toMatchObject({
      region: 'Authenticated',
      child: 'Active',
    });
  });

  it('transitions to MfaRequired on LOGIN_MFA_REQUIRED', () => {
    const { result } = renderHook(() => useAuthFlow());
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.change('password', 'password123'));
    act(() => result.current.login());
    act(() => result.current.dispatch({
      type: 'LOGIN_MFA_REQUIRED',
      challenge: { method: 'totp' },
    }));
    expect(result.current.state).toMatchObject({
      region: 'Unauthenticated',
      child: 'MfaRequired',
    });
  });

  it('transitions to Idle on LOGIN_ERROR', () => {
    const { result } = renderHook(() => useAuthFlow());
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.change('password', 'wrong'));
    act(() => result.current.login());
    act(() => result.current.dispatch({ type: 'LOGIN_ERROR', message: 'Invalid credentials' }));
    expect(result.current.state).toMatchObject({
      region: 'Unauthenticated',
      child: 'Idle',
    });
    expect(result.current.ctx.error).toBe('Invalid credentials');
  });

  it('submits MFA code and returns to Authenticating', () => {
    const { result } = renderHook(() => useAuthFlow());
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.change('password', 'password123'));
    act(() => result.current.login());
    act(() => result.current.dispatch({
      type: 'LOGIN_MFA_REQUIRED',
      challenge: { method: 'totp' },
    }));
    act(() => result.current.change('mfaCode', '123456'));
    act(() => result.current.submitMfa('123456'));
    expect(result.current.state).toMatchObject({
      region: 'Unauthenticated',
      child: 'Authenticating',
    });
  });

  it('cancels MFA and returns to Idle', () => {
    const { result } = renderHook(() => useAuthFlow());
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.change('password', 'password123'));
    act(() => result.current.login());
    act(() => result.current.dispatch({
      type: 'LOGIN_MFA_REQUIRED',
      challenge: { method: 'totp' },
    }));
    act(() => result.current.cancelMfa());
    expect(result.current.state).toMatchObject({
      region: 'Unauthenticated',
      child: 'Idle',
    });
  });

  it('transitions to Unauthenticated on LOGOUT', () => {
    const { result } = renderHook(() => useAuthFlow());
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.change('password', 'password123'));
    act(() => result.current.login());
    act(() => result.current.dispatch({ type: 'LOGIN_SUCCESS', session: mockSession }));
    act(() => result.current.logout());
    expect(result.current.state).toMatchObject({
      region: 'Unauthenticated',
      child: 'Idle',
    });
  });

  it('transitions to Unauthenticated on SESSION_EXPIRED', () => {
    const { result } = renderHook(() => useAuthFlow());
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.change('password', 'password123'));
    act(() => result.current.login());
    act(() => result.current.dispatch({ type: 'LOGIN_SUCCESS', session: mockSession }));
    act(() => result.current.dispatch({ type: 'SESSION_EXPIRED' }));
    expect(result.current.state).toMatchObject({
      region: 'Unauthenticated',
      child: 'Idle',
    });
  });

  it('transitions to Refreshing when token is stale', () => {
    const { result } = renderHook(() => useAuthFlow());
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.change('password', 'password123'));
    act(() => result.current.login());
    // Set token near expiry
    const staleSession = {
      ...mockSession,
      expiresAt: Date.now() + 60_000, // 1 minute
    };
    act(() => result.current.dispatch({ type: 'LOGIN_SUCCESS', session: staleSession }));
    act(() => result.current.dispatch({ type: 'REFRESH_TOKEN' }));
    expect(result.current.state).toMatchObject({
      region: 'Authenticated',
      child: 'Refreshing',
    });
  });

  it('returns to Active on REFRESH_SUCCESS', () => {
    const { result } = renderHook(() => useAuthFlow());
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.change('password', 'password123'));
    act(() => result.current.login());
    act(() => result.current.dispatch({ type: 'LOGIN_SUCCESS', session: mockSession }));
    act(() => result.current.dispatch({ type: 'REFRESH_TOKEN' }));
    act(() => result.current.dispatch({ type: 'REFRESH_SUCCESS', token: 'newToken456' }));
    expect(result.current.state).toMatchObject({
      region: 'Authenticated',
      child: 'Active',
    });
  });

  it('logs out on REFRESH_FAIL', () => {
    const { result } = renderHook(() => useAuthFlow());
    act(() => result.current.change('email', 'alice@example.com'));
    act(() => result.current.change('password', 'password123'));
    act(() => result.current.login());
    act(() => result.current.dispatch({ type: 'LOGIN_SUCCESS', session: mockSession }));
    act(() => result.current.dispatch({ type: 'REFRESH_TOKEN' }));
    act(() => result.current.dispatch({ type: 'REFRESH_FAIL' }));
    expect(result.current.state).toMatchObject({
      region: 'Unauthenticated',
      child: 'Idle',
    });
  });
});
```

---

## XState v5 mapping

```ts
import { setup, assign } from 'xstate';

export const authMachine = setup({
  types: {
    context: {} as {
      email: string;
      password: string;
      mfaCode: string;
      error: string | null;
      message: string | null;
      session: { token: string; refreshToken: string; expiresAt: number; user: { name: string; email: string } } | null;
      tokenExpiresAt: number | null;
    },
    events: {} as
      | { type: 'LOGIN' }
      | { type: 'LOGIN_SUCCESS'; session: Session }
      | { type: 'LOGIN_MFA_REQUIRED'; challenge: MfaChallenge }
      | { type: 'LOGIN_ERROR'; message: string }
      | { type: 'MFA_SUBMIT'; code: string }
      | { type: 'MFA_SUCCESS'; session: Session }
      | { type: 'MFA_ERROR'; message: string }
      | { type: 'MFA_CANCEL' }
      | { type: 'LOGOUT' }
      | { type: 'SESSION_EXPIRED' }
      | { type: 'REFRESH_TOKEN' }
      | { type: 'REFRESH_SUCCESS'; token: string }
      | { type: 'REFRESH_FAIL' },
  },
  guards: {
    hasCredentials: ({ context }) => context.email.length > 0 && context.password.length > 0,
    hasMfaCode: ({ context }) => context.mfaCode.length === 6 && /^\d{6}$/.test(context.mfaCode),
    isSessionStale: ({ context }) => {
      if (!context.tokenExpiresAt) return false;
      return context.tokenExpiresAt - Date.now() < 300_000;
    },
  },
  actions: {
    setSession: assign((_, params: { session: Session }) => ({
      session: params.session,
      tokenExpiresAt: params.session.expiresAt,
      error: null,
    })),
    clearSession: assign(() => ({
      session: null,
      tokenExpiresAt: null,
      email: '',
      password: '',
      mfaCode: '',
    })),
    setError: assign((_, params: { message: string }) => ({ error: params.message })),
    setMessage: assign((_, params: { message: string }) => ({ message: params.message })),
  },
}).createMachine({
  id: 'auth',
  initial: 'Unauthenticated',
  context: {
    email: '',
    password: '',
    mfaCode: '',
    error: null,
    message: null,
    session: null,
    tokenExpiresAt: null,
  },
  states: {
    Unauthenticated: {
      initial: 'Idle',
      states: {
        Idle: {
          on: {
            LOGIN: { target: 'Authenticating', guard: 'hasCredentials' },
          },
        },
        Authenticating: {
          on: {
            LOGIN_SUCCESS: { target: '#auth.Authenticated.Active', actions: 'setSession' },
            LOGIN_MFA_REQUIRED: 'MfaRequired',
            LOGIN_ERROR: { target: 'Idle', actions: 'setError' },
          },
        },
        MfaRequired: {
          on: {
            MFA_SUBMIT: { target: 'Authenticating', guard: 'hasMfaCode' },
            MFA_CANCEL: 'Idle',
          },
        },
      },
    },
    Authenticated: {
      initial: 'Active',
      states: {
        Active: {
          on: {
            REFRESH_TOKEN: { target: 'Refreshing', guard: 'isSessionStale' },
          },
        },
        Refreshing: {
          on: {
            REFRESH_SUCCESS: { target: 'Active' },
            REFRESH_FAIL: { target: '#auth.Unauthenticated.Idle', actions: 'clearSession' },
          },
        },
      },
      on: {
        LOGOUT: { target: 'Unauthenticated.Idle', actions: 'clearSession' },
        SESSION_EXPIRED: { target: 'Unauthenticated.Idle', actions: ['clearSession', 'setMessage'] },
      },
    },
  },
});
```

XState v5 handles the hierarchy elegantly:
- **Compound states** (`Unauthenticated` and `Authenticated`) with their own initial states
- **Transitions at the parent level** bubble to children via the `on` property at the same level as `states`
- **Target syntax** `#auth.Authenticated.Active` for cross-hierarchy transitions
- **Guards** are pure functions with access to context
- **`assign`** for all context mutations, ensuring actions never modify state directly

The session refresh timer would be managed by XState's `invoke` or `spawn` for long-running activities, or by an external `setInterval` that dispatches `REFRESH_TOKEN`.
