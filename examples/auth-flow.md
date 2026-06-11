# Ejemplo: Autenticación con MFA y Sesión

## 1. Especificación del Comportamiento
Un flujo de autenticación con login por email/contraseña, verificación MFA opcional del lado del servidor, sesión autenticada con refresco silencioso de token, expiración de sesión, y cierre de sesión manual.

## 2. Contrato Estructural (`model.json`)
Este bloque JSON cumple estrictamente con `schemas/fsm.schema.json` y es el artefacto que lee el linter. Emplea estados compuestos anidados (HFSM).

```json
{
  "id": "auth-flow",
  "initial": "Unauthenticated",
  "states": {
    "Unauthenticated": {
      "type": "compound",
      "initial": "Idle",
      "states": {
        "Idle": {
          "type": "atomic",
          "on": {
            "LOGIN": { "target": "Authenticating", "guard": "hasCredentials", "actions": ["postLogin"] }
          }
        },
        "Authenticating": {
          "type": "atomic",
          "on": {
            "LOGIN_SUCCESS": { "target": "#auth-flow.Authenticated.Active", "actions": ["setSession"] },
            "LOGIN_MFA_REQUIRED": { "target": "MfaRequired", "actions": ["setMfaChallenge"] },
            "LOGIN_ERROR": { "target": "Idle", "actions": ["setError"] }
          }
        },
        "MfaRequired": {
          "type": "atomic",
          "on": {
            "MFA_SUBMIT": { "target": "Authenticating", "guard": "hasMfaCode", "actions": ["postMfa"] },
            "MFA_CANCEL": { "target": "Idle", "actions": ["cancelMfa"] }
          }
        }
      }
    },
    "Authenticated": {
      "type": "compound",
      "initial": "Active",
      "states": {
        "Active": {
          "type": "atomic",
          "on": {
            "REFRESH_TOKEN": { "target": "Refreshing", "guard": "isSessionStale", "actions": ["doRefresh"] },
            "LOGOUT": { "target": "#auth-flow.Unauthenticated.Idle", "actions": ["clearSession"] },
            "SESSION_EXPIRED": { "target": "#auth-flow.Unauthenticated.Idle", "actions": ["clearSession", "setExpiredMessage"] }
          }
        },
        "Refreshing": {
          "type": "atomic",
          "on": {
            "REFRESH_SUCCESS": { "target": "Active", "actions": ["setToken"] },
            "REFRESH_FAIL": { "target": "#auth-flow.Unauthenticated.Idle", "actions": ["clearSession", "setExpiredMessage"] },
            "LOGOUT": { "target": "#auth-flow.Unauthenticated.Idle", "actions": ["clearSession"] },
            "SESSION_EXPIRED": { "target": "#auth-flow.Unauthenticated.Idle", "actions": ["clearSession", "setExpiredMessage"] }
          }
        }
      }
    }
  }
}
```

## 3. Diagrama de Transición (ASCII)
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
│  LOGOUT → Unauthenticated.Idle                                   │
│  SESSION_EXPIRED → Unauthenticated.Idle                          │
└──────────────────────────────────────────────────────────────────┘
```

## 4. Implementación de Producción (`implement`)
Código de referencia generado usando el core runtime inyectable de `src/core/fsm.ts`.

```ts
import { createLightMachine } from '../src/core/fsm';

// 1. Configuración idéntica al contrato JSON
const authConfig = {
  id: "auth-flow",
  initial: "Unauthenticated",
  states: {
    Unauthenticated: {
      type: "compound",
      initial: "Idle",
      states: {
        Idle: {
          type: "atomic",
          on: {
            LOGIN: { target: "Authenticating", guard: "hasCredentials", actions: ["postLogin"] }
          }
        },
        Authenticating: {
          type: "atomic",
          on: {
            LOGIN_SUCCESS: { target: "#auth-flow.Authenticated.Active", actions: ["setSession"] },
            LOGIN_MFA_REQUIRED: { target: "MfaRequired", actions: ["setMfaChallenge"] },
            LOGIN_ERROR: { target: "Idle", actions: ["setError"] }
          }
        },
        MfaRequired: {
          type: "atomic",
          on: {
            MFA_SUBMIT: { target: "Authenticating", guard: "hasMfaCode", actions: ["postMfa"] },
            MFA_CANCEL: { target: "Idle", actions: ["cancelMfa"] }
          }
        }
      }
    },
    Authenticated: {
      type: "compound",
      initial: "Active",
      states: {
        Active: {
          type: "atomic",
          on: {
            REFRESH_TOKEN: { target: "Refreshing", guard: "isSessionStale", actions: ["doRefresh"] },
            LOGOUT: { target: "#auth-flow.Unauthenticated.Idle", actions: ["clearSession"] },
            SESSION_EXPIRED: { target: "#auth-flow.Unauthenticated.Idle", actions: ["clearSession", "setExpiredMessage"] }
          }
        },
        Refreshing: {
          type: "atomic",
          on: {
            REFRESH_SUCCESS: { target: "Active", actions: ["setToken"] },
            REFRESH_FAIL: { target: "#auth-flow.Unauthenticated.Idle", actions: ["clearSession", "setExpiredMessage"] },
            LOGOUT: { target: "#auth-flow.Unauthenticated.Idle", actions: ["clearSession"] },
            SESSION_EXPIRED: { target: "#auth-flow.Unauthenticated.Idle", actions: ["clearSession", "setExpiredMessage"] }
          }
        }
      }
    }
  }
};

// 2. Efectos secundarios colaterales aislados (Actions)
const implementations = {
  guards: {
    hasCredentials: (ctx: any) => ctx.email?.length > 0 && ctx.password?.length > 0,
    hasMfaCode: (ctx: any) => ctx.mfaCode?.length === 6,
    isSessionStale: (ctx: any) => ctx.tokenExpiresAt ? (ctx.tokenExpiresAt - Date.now() < 300000) : false
  },
  actions: {
    postLogin: async (ctx: any, event: any) => {
      try {
        const res = await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: ctx.email, password: ctx.password }) });
        const data = await res.json();
        if (data.session) machine.send({ type: 'LOGIN_SUCCESS', session: data.session }, ctx);
        else if (data.mfaRequired) machine.send({ type: 'LOGIN_MFA_REQUIRED', challenge: data.mfaRequired }, ctx);
        else machine.send({ type: 'LOGIN_ERROR', message: data.error }, ctx);
      } catch (err) {
        machine.send({ type: 'LOGIN_ERROR', message: (err as Error).message }, ctx);
      }
    },
    postMfa: async (ctx: any, event: any) => {
      try {
        const res = await fetch('/api/auth/mfa', { method: 'POST', body: JSON.stringify({ code: ctx.mfaCode }) });
        const data = await res.json();
        if (data.session) machine.send({ type: 'LOGIN_SUCCESS', session: data.session }, ctx);
        else machine.send({ type: 'LOGIN_ERROR', message: data.error }, ctx);
      } catch (err) {
        machine.send({ type: 'LOGIN_ERROR', message: (err as Error).message }, ctx);
      }
    },
    setSession: (ctx: any, event: any) => { ctx.session = event.session; ctx.tokenExpiresAt = event.session.expiresAt; },
    setMfaChallenge: (ctx: any, event: any) => { ctx.mfaChallenge = event.challenge; },
    setError: (ctx: any, event: any) => { ctx.error = event.message; },
    cancelMfa: (ctx: any) => { ctx.mfaCode = ''; ctx.mfaChallenge = null; },
    doRefresh: async (ctx: any, event: any) => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' });
        const data = await res.json();
        if (data.token) machine.send({ type: 'REFRESH_SUCCESS', token: data.token }, ctx);
        else machine.send({ type: 'REFRESH_FAIL' }, ctx);
      } catch {
        machine.send({ type: 'REFRESH_FAIL' }, ctx);
      }
    },
    setToken: (ctx: any, event: any) => { ctx.tokenExpiresAt = Date.now() + 3600000; },
    clearSession: (ctx: any) => { ctx.session = null; ctx.tokenExpiresAt = null; ctx.error = null; },
    setExpiredMessage: (ctx: any) => { ctx.message = 'session_expired'; }
  }
};

// 3. Inicialización del componente / Máquina
let context = { email: '', password: '', mfaCode: '', error: null, message: null, session: null, mfaChallenge: null, tokenExpiresAt: null };
const machine = createLightMachine(authConfig, implementations, (nextState) => {
  console.log(`UI Update: Renderizar estado de autenticación [${nextState}]`);
});
```
