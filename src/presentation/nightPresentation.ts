import type { EnemyState, ShipState, NightConfig, BattleState, TentacleState, DeviceState } from '../contracts';

export function tentacleStatus(tentacle: TentacleState, battle: Readonly<BattleState>, _config: NightConfig): string {
  const bell = bellSlowStatus(tentacle, battle.tick, battle.devices);
  if ((battle.boss?.stunnedUntilTick ?? 0) > battle.tick) return ['ОГЛУШЕНО · атака остановлена', bell].filter(Boolean).join(' · ');
  if (battle.blockedTentacleIds.includes(tentacle.id)) return ['ПЕРЕКРЫТО', bell].filter(Boolean).join(' · ');
  if (battle.litTentacleIds.includes(tentacle.id)) return ['В СВЕТЕ · замедлено · атака остановлена', bell].filter(Boolean).join(' · ');
  return bell || 'Щупальце';
}

export function bossStatus(battle: Readonly<BattleState>, config: NightConfig, compact = false): string {
  if (!battle.boss || !config.boss) return '';
  if (battle.boss.health <= 0) return `${config.boss.name} уничтожен · отбей оставшиеся волны для награды`;
  if (compact) return `${config.boss.name} · ур. ${config.boss.level} · ${Math.ceil(battle.boss.health)}/${config.boss.health} HP · свет: ${battle.litTentacleIds.length}${battle.boss.stunnedUntilTick > battle.tick ? ' · ОГЛУШЁН' : ''}`;
  return `${config.boss.name} · ур. ${config.boss.level} · общее здоровье ${Math.ceil(battle.boss.health)} / ${config.boss.health}${battle.boss.stunnedUntilTick > battle.tick ? ' · ОГЛУШЕНИЕ' : ''}`;
}

export function enemyThreat(enemy: EnemyState): string {
  if (enemy.kind === 'minotaur') return ({ ready: 'Готовит рывок', windup: 'РАЗБЕГ! Усиленный удар', charging: 'РЫВОК! Усиленный удар', spent: 'Рывок израсходован' })[enemy.chargePhase ?? 'ready'];
  if (enemy.kind === 'bat') return 'Летает · пушки не атакуют';
  return '';
}

export function shipStatus(ship: ShipState, config: NightConfig): string {
  if (ship.status === 'rescued') return `✓ Корабль спасён · +${config.ship?.reward ?? 0} ◈ за ночь`;
  if (ship.status === 'lost') return 'Корабль упущен · бой продолжается';
  return `⚑ Корабль: ${ship.lit ? 'в свете' : 'ждёт света'} · ${ship.progress.toFixed(1)}/${config.ship?.rescueSeconds ?? 0} с · осталось ${Math.ceil(ship.remaining)} с`;
}

export function bellSlowStatus(target: Pick<EnemyState, 'bellSlows'>, tick: number, devices: readonly DeviceState[] = []): string {
  const active = (target.bellSlows ?? []).filter(slow => slow.untilTick > tick);
  const multiplier = Math.min(1, ...active.map(slow => slow.multiplier));
  const source = active.find(slow => slow.multiplier === multiplier);
  const kind = devices.find(device => device.id === source?.sourceId)?.kind;
  const label = kind === 'barrier' ? 'ОБЛОМКИ' : kind === 'harpoon' ? 'ГАРПУН' : 'КОЛОКОЛ';
  return multiplier < 1 ? `${label} · скорость ×${Number(multiplier.toFixed(2))}` : '';
}

export function shieldStatus(battle: Readonly<BattleState> | null, config: NightConfig): string {
  if (!battle?.shield.maximum) return '◇ Поле отсутствует: нет действующих генераторов';
  const living = battle.devices.some(device => device.kind === 'generator' && device.health > 0 && !device.consumed);
  const residual = Math.max(0, ...battle.devices.filter(device => device.kind === 'generator').map(device => (device.residualUntilTick ?? 0) - battle.tick));
  const state = !living ? 'Без живых генераторов поле не восстанавливается.' : battle.shield.recoveryRemaining > 0 ? 'Восстановление через ' + Math.ceil(battle.shield.recoveryRemaining) + ' с. Удары по полю и защищаемым целям сбрасывают задержку.' : battle.shield.current < battle.shield.maximum ? 'Восстановление +' + config.shield.regenerationPerSecond + '/с' : 'Полный запас';
  return '◇ Общее поле: ' + Math.ceil(battle.shield.current) + ' / ' + battle.shield.maximum + ' · ' + state + (residual > 0 ? ' · Остаточное поле активно: ' + (residual * config.stepSeconds).toFixed(1) + ' с.' : '');
}
