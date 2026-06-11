export interface MachineConfig {
  id: string;
  initial: string;
  states: Record<string, any>;
}

export interface MachineImplementations {
  actions?: Record<string, (context: any, event: any) => void>;
  guards?: Record<string, (context: any, event: any) => boolean>;
}

export function createLightMachine(config: MachineConfig, impl: MachineImplementations, onStateChange: (state: string) => void) {
  let currentState = config.initial;

  return {
    getState: () => currentState,
    send: (event: { type: string; [key: string]: any }, context: any) => {
      const stateDef = config.states[currentState];
      if (!stateDef || !stateDef.on || !stateDef.on[event.type]) return; // No-op explícito

      const transition = stateDef.on[event.type];

      // 1. Validar Guards
      if (transition.guards && impl.guards) {
        const allPassed = transition.guards.every((g: string) => impl.guards![g]?.(context, event) ?? true);
        if (!allPassed) return;
      }

      // 2. Ejecutar Ciclo de Salida (onExit)
      if (stateDef.onExit && impl.actions) {
        stateDef.onExit.forEach((a: string) => impl.actions![a]?.(context, event));
      }

      // 3. Cambiar Estado
      const nextState = transition.target;
      const nextStateDef = config.states[nextState];
      currentState = nextState;
      onStateChange(currentState);

      // 4. Ejecutar Acciones de Transición
      if (transition.actions && impl.actions) {
        transition.actions.forEach((a: string) => impl.actions![a]?.(context, event));
      }

      // 5. Ejecutar Ciclo de Entrada (onEnter)
      if (nextStateDef && nextStateDef.onEnter && impl.actions) {
        nextStateDef.onEnter.forEach((a: string) => impl.actions![a]?.(context, event));
      }
    }
  };
}
