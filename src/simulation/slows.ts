import type { BellSlow } from '../contracts';

type SlowTarget = { bellSlows?: BellSlow[] };

/** Independent movement effects expire before the step at untilTick. */
export function movementSlowMultiplier(target: { readonly bellSlows?: readonly BellSlow[] }, tick: number): number {
  return (target.bellSlows ?? []).reduce((slow, effect) => tick < effect.untilTick ? Math.min(slow, effect.multiplier) : slow, 1);
}

export function applyMovementSlow(target: SlowTarget, sourceId: number, untilTick: number, multiplier: number, tick: number): void {
  target.bellSlows = [...(target.bellSlows ?? []).filter(effect => effect.sourceId !== sourceId && tick < effect.untilTick),
    { sourceId, untilTick, multiplier }];
}
