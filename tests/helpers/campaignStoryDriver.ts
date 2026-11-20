import type { BattleCommand, BattleState, NightConfig } from '../../src/contracts';
import { angleDifference, selectBeamTargets } from '../../src/simulation/beam';

const radiansTo = ({ x, y }: { x: number; y: number }) => Math.atan2(y, x);
const distance = ({ x, y }: { x: number; y: number }) => Math.hypot(x, y);
const supportEnemies = new Set(['witch', 'siren', 'siege-beast', 'bomber', 'snuffer']);

/** React to the current board. The policy cannot read a future spawn or execute a combat effect. */
export function campaignStoryDriver(config: NightConfig, early: boolean) {
  const reactionSeconds = [.68, .82, .75, .96, .88];
  let nextDecision = 0;
  let decisions = 0;
  let previousTarget: number | undefined;

  return (state: BattleState): readonly BattleCommand[] => {
    if (state.elapsed < nextDecision) return [];
    nextDecision = state.elapsed + reactionSeconds[decisions++ % reactionSeconds.length]!;
    const commands: BattleCommand[] = [];
    if (early && state.nextWaveAt - state.elapsed >= 6.5 && state.enemies.length <= 2
      && state.waves.some(wave => !wave.started)
      && state.waves.every((wave, index) => !wave.started || config.waves[index]!.enemies.length - wave.spawned <= 2)) {
      commands.push({ type: 'callWave' });
    }

    const boss = state.boss && state.boss.health > 0 ? state.boss : null;
    const enemies = state.enemies;
    const warning = boss?.campaign?.telegraph;
    const scores = new Map<number, number>();
    for (const enemy of enemies) {
      const definition = config.enemies[enemy.kind];
      const cast = enemy.campaign?.cast;
      const approach = Math.max(0, distance(enemy) - config.lighthouseRadius - definition.radius) / definition.speed;
      const tough = (enemy.health + enemy.armor) / config.beam.damagePerSecond;
      const preparing = enemy.chargePhase === 'windup' || enemy.chargePhase === 'charging';
      const imminent = cast || preparing;
      const support = supportEnemies.has(enemy.kind);
      const stunned = state.tick < (enemy.stunnedUntilTick ?? 0);
      const base = 4.3 - Math.min(8, approach) * .37 - Math.min(3, tough) * .24;
      scores.set(enemy.id, base + (support ? .6 : 0) + (imminent ? 2.2 : 0) - (stunned ? .7 : 0)
        + (enemy.id === previousTarget ? 1.0 : 0));
    }
    for (const zone of boss?.tentacles ?? []) {
      const part = boss?.campaign?.parts.find(part => part.zoneId === zone.id);
      const attacking = warning?.sourceZoneId === zone.id;
      scores.set(zone.id, (part?.health == null ? 1.45 : 1.2) + (attacking ? 3 : 0)
        + (zone.id === previousTarget ? .7 : 0));
    }

    let best: { angle: number; target?: number; score: number } | undefined;
    const targets = [...enemies, ...(boss?.tentacles ?? [])];
    for (const target of targets) {
      const angle = radiansTo(target);
      const turn = Math.abs(angleDifference(angle, state.beamAngle));
      const selection = selectBeamTargets(enemies, config, angle, state.ship, boss);
      const lit = [...selection.lit, ...(selection.litTentacles ?? [])];
      const primary = lit.reduce<number | undefined>((chosen, id) => chosen === undefined || scores.get(id)! > scores.get(chosen)! ? id : chosen, undefined);
      // When still out of range, pre-aim for the approaching body to reduce idle time.
      const score = primary === undefined
        ? (target.id > 0 && distance(target) > config.beam.range ? .25 - turn * .13 : -Infinity)
        : scores.get(primary)! + .45 * lit.filter(id => id !== primary).reduce((sum, id) => sum + scores.get(id)!, 0) - turn * .72;
      if (!best || score > best.score) best = { angle, target: primary ?? target.id, score };
    }
    if (best && Number.isFinite(best.score)) {
      commands.push({ type: 'aim', angle: best.angle });
      previousTarget = best.target;
    } else previousTarget = undefined;

    const flashTargets = enemies.filter(enemy => distance(enemy) <= config.flash.radius);
    if (config.flash.enabled && state.flash.cooldownRemaining <= config.stepSeconds
      && (flashTargets.length >= 2 || flashTargets.some(enemy => distance(enemy) < 110 || enemy.campaign?.cast || enemy.chargePhase === 'windup')
        || boss?.tentacles.some(zone => distance(zone) <= config.flash.radius))) {
      commands.push({ type: 'flash' });
    }

    const ability = config.ability;
    if (!ability || !state.ability || state.tick < state.ability.readyTick) return commands;
    if (ability.abilityId === 'seal') {
      let bestCluster = 1;
      let center: (typeof enemies)[number] | undefined;
      for (const target of enemies.filter(enemy => distance(enemy) <= ability.targetingRange)) {
        const cluster = enemies.filter(other => Math.hypot(other.x - target.x, other.y - target.y) <= ability.radius).length;
        if (cluster <= bestCluster) continue;
        bestCluster = cluster;
        center = target;
      }
      if (center) commands.push({ type: 'use-ability', target: { x: center.x, y: center.y } });
    }
    if (ability.abilityId === 'barrage') {
      const target = targets.filter(target => distance(target) <= ability.targetingRange && state.devices.some(device =>
        device.health > 0 && ['mortar', 'harpoon', 'cannon'].includes(device.kind)
        && Math.hypot(device.x - target.x, device.y - target.y) <= config.devices.definitions[device.kind].range
        && (device.kind === 'harpoon' || !('kind' in target) || config.enemies[target.kind].movement !== 'flying')))
        .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))[0];
      if (target) commands.push({ type: 'use-ability', target: { x: target.x, y: target.y, enemyId: target.id } });
    }
    return commands;
  };
}
