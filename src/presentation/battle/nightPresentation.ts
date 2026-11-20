import type { EnemyState, ShipState, NightConfig, BattleState, TentacleState, DeviceState } from '../../contracts';
import { campaignDeviceRooted } from '../../simulation/campaignEnemies';
import type { Language } from '../shared/localization';

const bossActions = { strike: 'УДАР ПО МАЯКУ', salvo: 'ЗАЛП', root: 'ПОДАВЛЕНИЕ', summon: 'ПРИЗЫВ' } as const;
const bossParts: Record<string, string> = {
  core: 'Сердце', hammer: 'Молот', furnace: 'Горн', rift: 'Разлом', root: 'Корень', cannon: 'Орудие',
  'north-tentacle': 'Северное щупальце', 'south-tentacle': 'Южное щупальце',
  standard: 'Знамя', signal: 'Сигнал', 'north-root': 'Северный корень', 'south-root': 'Южный корень',
  'fore-gun': 'Носовое орудие', 'aft-gun': 'Кормовое орудие', 'north-blade': 'Северный клинок', 'south-blade': 'Южный клинок',
};
const enemyCasts = { heal: 'ЛЕЧЕНИЕ', root: 'КОРНИ', siege: 'ОБСТРЕЛ МАЯКА', haste: 'ПЕСНЯ',
  bombard: 'ОБСТРЕЛ УСТРОЙСТВ', mirror: 'СМЕНА СТОЙКИ', suppress: 'ПОДАВЛЕНИЕ' } as const;

export function campaignDeviceStatus(device: DeviceState, battle: Readonly<BattleState>): string {
  if (device.health <= 0 || device.consumed) return '';
  if (campaignDeviceRooted(battle, device.id)) return 'СВЯЗАНО';
  return battle.tick < (device.suppressedUntilTick ?? 0) ? 'ПОДАВЛЕНО' : '';
}

export function tentacleStatus(tentacle: TentacleState, battle: Readonly<BattleState>, config: NightConfig, language: Language = 'ru'): string {
  const bell = bellSlowStatus(tentacle, battle.tick, battle.devices);
  if (battle.boss?.campaign) {
    const { parts, telegraph } = battle.boss.campaign;
    const part = parts.find(entry => entry.zoneId === tentacle.id);
    const name = part ? bossParts[part.id] ?? 'Часть' : 'Цель';
    const blocked = battle.blockedTentacleIds.includes(tentacle.id);
    if (telegraph?.sourceZoneId === tentacle.id) {
      const seconds = Math.max(0, (telegraph.resolveTick - battle.tick) * config.stepSeconds);
      const warning = `${bossActions[telegraph.kind]} · ${seconds.toFixed(1)} ${language === 'en' ? 's' : 'с'}`;
      return blocked ? `${name} · ПЕРЕКРЫТО · ${warning}` : warning;
    }
    const condition = part?.health == null ? name : `${name} · ${Math.ceil(part.health)} HP`;
    return blocked ? `${condition} · ПЕРЕКРЫТО` : condition;
  }
  if ((battle.boss?.stunnedUntilTick ?? 0) > battle.tick) return ['ОГЛУШЕНО · атака остановлена', bell].filter(Boolean).join(' · ');
  if (battle.blockedTentacleIds.includes(tentacle.id)) return ['ПЕРЕКРЫТО', bell].filter(Boolean).join(' · ');
  if (battle.litTentacleIds.includes(tentacle.id)) return ['В СВЕТЕ · замедлено · атака остановлена', bell].filter(Boolean).join(' · ');
  return bell || 'Щупальце';
}

export function bossStatus(battle: Readonly<BattleState>, config: NightConfig, compact = false): string {
  if (!battle.boss || !config.boss) return '';
  if (battle.boss.health <= 0) return `${config.boss.name} уничтожен · отбей оставшиеся волны для награды`;
  if (battle.boss.campaign) {
    const { phase, stance, telegraph } = battle.boss.campaign;
    return [config.boss.name, `Фаза ${phase}`, `${Math.ceil(battle.boss.health)}/${config.boss.health} HP`,
      stance === 'guarded' ? 'ЗАЩИТА' : stance === 'exposed' ? 'ОТКРЫТ' : '', telegraph ? bossActions[telegraph.kind] : ''].filter(Boolean).join(' · ');
  }
  if (compact) return `${config.boss.name} · ур. ${config.boss.level} · ${Math.ceil(battle.boss.health)}/${config.boss.health} HP · свет: ${battle.litTentacleIds.length}${battle.boss.stunnedUntilTick > battle.tick ? ' · ОГЛУШЁН' : ''}`;
  return `${config.boss.name} · ур. ${config.boss.level} · общее здоровье ${Math.ceil(battle.boss.health)} / ${config.boss.health}${battle.boss.stunnedUntilTick > battle.tick ? ' · ОГЛУШЕНИЕ' : ''}`;
}

export function enemyThreat(enemy: EnemyState, config?: NightConfig): string {
  if (enemy.campaign?.cast) return enemyCasts[enemy.campaign.cast.kind];
  if (enemy.campaign?.mirror) return 'ЗЕРКАЛО';
  if (enemy.kind === 'minotaur') {
    if (config?.enemies.minotaur.campaignAttack?.impactArea && enemy.chargePhase === 'windup') return 'РАЗБЕГ! Обстрел устройств';
    if (config?.enemies.minotaur.campaignAttack?.impactArea && enemy.chargePhase === 'charging') return 'РЫВОК! Обстрел устройств';
    return ({ ready: 'Готовит рывок', windup: 'РАЗБЕГ! Усиленный удар', charging: 'РЫВОК! Усиленный удар', spent: 'Рывок израсходован' })[enemy.chargePhase ?? 'ready'];
  }
  if (enemy.kind === 'bat') return config?.enemies.bat.campaignAttack?.suppressionSeconds && !enemy.suppressionUsed
    ? 'Летает · подавляет орудие' : 'Летает · пушки не атакуют';
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
