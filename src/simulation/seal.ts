import type { BattleState, NightConfig, SealMark } from '../contracts';

const EPSILON = 1e-9;
const ticksFor = (seconds: number, config: NightConfig): number => Math.ceil(seconds / config.stepSeconds - EPSILON);

/** Runtime owns readiness and cooldown; an invalid location never mutates the cast. */
export function castSeal(state: BattleState, config: NightConfig, target: { x: number; y: number }): boolean {
  const rules = config.ability;
  const ability = state.ability;
  if (rules?.abilityId !== 'seal' || ability?.id !== 'seal' || state.outcome !== 'playing'
    || !Number.isFinite(target.x) || !Number.isFinite(target.y)
    || Math.hypot(target.x, target.y) > Math.min(rules.targetingRange, config.worldRadius) + EPSILON) return false;
  const untilTick = state.tick + ticksFor(rules.durationSeconds, config);
  ability.seal = { castId: ability.nextCastId++, x: target.x, y: target.y, untilTick, enteredIds: [] };
  ability.activeUntilTick = untilTick;
  return true;
}

/** Run before movement. Body intersections and all lifetimes use the fixed simulation tick. */
export function updateSeal(state: BattleState, config: NightConfig): void {
  const rules = config.ability;
  if (rules?.abilityId !== 'seal' || state.ability?.id !== 'seal') return;
  const area = state.ability.seal;
  const active = area && state.tick < area.untilTick;
  const targets = [
    ...state.enemies.filter(enemy => enemy.health > 0).map(target => ({ target, radius: config.enemies[target.kind].radius })),
    ...(state.boss && state.boss.health > 0 && config.boss
      ? state.boss.tentacles.map(target => ({ target, radius: config.boss!.radius })) : []),
  ];
  for (const { target, radius } of targets) {
    if (active && Math.hypot(target.x - area.x, target.y - area.y) <= rules.radius + radius + EPSILON) {
      const firstEntry = !area.enteredIds.includes(target.id);
      if (firstEntry) area.enteredIds.push(target.id);
      // The final in-area movement step is followed by exactly N lingering steps.
      // Refresh only while inside a live area, never while a lingering mark survives.
      const entryUntilTick = firstEntry ? state.tick + ticksFor(rules.entrySeconds, config)
        : target.sealMark?.castId === area.castId ? target.sealMark.entryUntilTick : 0;
      target.sealMark = { castId: area.castId, untilTick: state.tick + 1 + ticksFor(rules.lingeringSeconds, config), entryUntilTick };
    } else if (target.sealMark) {
      // An exit (including area expiry) cannot carry the stronger entry impulse.
      target.sealMark.entryUntilTick = 0;
      if (state.tick >= target.sealMark.untilTick) delete target.sealMark;
    }
  }
  if (area && !active) delete state.ability.seal;
}

/** Compose with every other movement effect using Math.min; this never stuns. */
export function sealSlowMultiplier(target: { sealMark?: SealMark }, state: BattleState, config: NightConfig): number {
  const rules = config.ability;
  const mark = target.sealMark;
  if (rules?.abilityId !== 'seal' || state.ability?.id !== 'seal' || !mark || state.tick >= mark.untilTick) return 1;
  const ordinary = Math.max(rules.minimumSpeedMultiplier, rules.speedMultiplier);
  return state.tick < mark.entryUntilTick
    ? Math.min(ordinary, Math.max(rules.minimumSpeedMultiplier, rules.entrySpeedMultiplier)) : ordinary;
}
