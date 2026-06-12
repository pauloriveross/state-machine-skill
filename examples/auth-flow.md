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

