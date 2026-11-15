import type Phaser from 'phaser';
import type { BattleState, CombatEvent, NightConfig } from '../contracts';

type Point = { x: number; y: number };

/** Stateless, bounded rendering: paused ticks retain the exact same marks. */
export function drawCombatFeedback(
  g: Phaser.GameObjects.Graphics, battle: Readonly<BattleState>, config: NightConfig,
  point: (x: number, y: number) => Point, unit: number,
): void {
  // Continuous beam damage produces many facts. Keep only the latest mark per
  // target and type, rather than stacking a flash for every simulation step.
  const marks = new Map<string, { event: CombatEvent; age: number; duration: number }>();
  for (const event of battle.events) {
    if (event.type === 'wave-started' || event.type === 'wave-completed') continue;
    const duration = event.type === 'flash-used' || event.type === 'trap-triggered' ? .65 : event.type === 'armor-broken' || event.type === 'device-destroyed' ? .65 : event.type === 'enemy-died' ? .45 : .24;
    const age = (battle.tick - event.tick) * config.stepSeconds;
    if (age < 0 || age >= duration) continue;
    const target = 'enemyId' in event ? event.enemyId : 'deviceId' in event ? event.deviceId : 'tower';
    marks.set(`${event.type}:${target}`, { event, age, duration });
  }
  for (const { event, age, duration } of marks.values()) {
    const progress = age / duration, alpha = 1 - progress;
    // Follow living moving targets; final marks stay at their factual location.
    const enemy = 'enemyId' in event ? battle.enemies.find((entry) => entry.id === event.enemyId) : undefined;
    const p = point(enemy?.x ?? event.x, enemy?.y ?? event.y);
    const radius = 'enemyKind' in event ? Math.max(7, config.enemies[event.enemyKind].radius * unit)
      : 'deviceKind' in event ? Math.max(6, config.devices.definitions[event.deviceKind].radius * unit)
        : Math.max(12, config.lighthouseRadius * unit);
    if (event.type === 'barrier-slow') {
      g.lineStyle(1.5, 0x8fe4ca, alpha * .65);
      g.strokeEllipse(p.x, p.y, event.radius * unit * 2 * (.5 + progress * .5), event.radius * unit * 1.68 * (.5 + progress * .5));
    } else if (event.type === 'generator-saved' || event.type === 'generator-residual') {
      g.lineStyle(2, 0xb5edff, alpha * .8);
      g.strokeEllipse(p.x, p.y, radius * (2.4 + progress), radius * (1.8 + progress));
    } else if (event.type === 'flash-used' || event.type === 'trap-triggered') {
      const range = (event.type === 'flash-used' ? config.flash.radius : config.devices.trap.blastRadius) * unit;
      g.lineStyle(3, event.type === 'flash-used' ? 0xe1dcff : 0xd7adff, alpha);
      g.strokeEllipse(p.x, p.y, range * 2 * (.3 + progress * .7), range * 1.68 * (.3 + progress * .7));
    } else if (event.type === 'shield-hit' || event.type === 'shield-broken' || event.type === 'shield-restored') {
      const center = point(0, 0), range = config.shield.radius * unit;
      g.lineStyle(event.type === 'shield-broken' ? 3 : 2, event.type === 'shield-broken' ? 0xffbca3 : 0xb5edff, alpha);
      g.strokeEllipse(center.x, center.y, range * 2, range * 1.68);
    } else if (event.type === 'enemy-hit') {
      // A short local nick, distinct from the warm selected-target outline.
      g.lineStyle(2, event.armorDamage > 0 ? 0xbde5ff : 0xffbca3, alpha * .9);
      g.lineBetween(p.x - radius * .6, p.y - radius * .6, p.x - radius * .15, p.y - radius * .2);
      g.lineBetween(p.x + radius * .3, p.y + radius * .1, p.x + radius * .7, p.y + radius * .45);
    } else if (event.type === 'armor-broken') {
      g.lineStyle(2, 0xc3e8ff, alpha);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + .5, distance = radius + progress * 5;
        const x = p.x + Math.cos(a) * distance, y = p.y + Math.sin(a) * distance * .84;
        g.lineBetween(x, y, x + Math.cos(a + .6) * 4, y + Math.sin(a + .6) * 4);
      }
    } else if (event.type === 'enemy-died') {
      g.lineStyle(1.5, 0xcbd8c3, alpha * .8);
      g.strokeEllipse(p.x, p.y, radius * 2 + progress * 5, radius * 1.68 + progress * 4);
    } else {
      g.lineStyle(2, 0xffa68b, alpha);
      if (event.type === 'device-destroyed') {
        g.lineBetween(p.x - radius, p.y - radius * .6, p.x - radius * .35, p.y);
        g.lineBetween(p.x + radius, p.y - radius * .6, p.x + radius * .35, p.y);
      } else {
        g.strokeEllipse(p.x, p.y, radius * 2.3, radius * 1.8);
      }
    }
  }
}
