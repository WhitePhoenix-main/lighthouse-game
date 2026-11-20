import type { BattleState, NightConfig, TentacleState } from '../contracts';
import { damageBossHealth } from './boss';
import { damageEnemy } from './devices';

/** A lit step refreshes a single effect and preserves every residual damage step. */
export function updateBurning(state: BattleState, config: NightConfig, litBossZone: TentacleState | undefined): void {
  const rules = config.lens?.burn;
  if (!rules) return;
  const ticks = Math.ceil(rules.seconds / config.stepSeconds - 1e-9);
  const damage = rules.damagePerSecond * config.stepSeconds;
  for (const enemy of state.enemies) {
    if (enemy.health <= 0) { delete enemy.burn; continue; }
    const lit = state.litEnemyIds.includes(enemy.id);
    if (lit) enemy.burn = { remainingTicks: ticks };
    if (!enemy.burn) continue;
    damageEnemy(enemy, damage, state);
    if (!lit) enemy.burn.remainingTicks--;
    if (enemy.health <= 0 || enemy.burn.remainingTicks <= 0) delete enemy.burn;
  }
  const boss = state.boss;
  if (!boss) return;
  if (boss.health <= 0) { delete boss.burn; return; }
  if (litBossZone) boss.burn = { remainingTicks: ticks };
  if (!boss.burn) return;
  // Residual events use the campaign core as their visual anchor when the light moves away.
  const coreZoneId = boss.campaign?.parts.find(part => part.health === null)?.zoneId;
  const eventPosition = litBossZone ?? boss.tentacles.find(zone => zone.id === coreZoneId) ?? boss.tentacles[0] ?? { x: 0, y: 0 };
  damageBossHealth(state, damage, eventPosition);
  if (!litBossZone) boss.burn.remainingTicks--;
  if (boss.health <= 0 || boss.burn.remainingTicks <= 0) delete boss.burn;
}
