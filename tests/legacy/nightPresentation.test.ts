import { describe, expect, it } from 'vitest';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { emptySave } from '../../src/application/saves';
import { NIGHT_CONFIG } from '../../src/content/night';
import { NIGHT_CATALOG } from '../../src/content/nights';
import type { ApplicationView, EnemyState, ShipState } from '../../src/contracts';
import { nightSelector, screenContent, upgradeValue, waveIntelligence } from '../../src/presentation/screens';
import { enemyThreat, shipStatus } from '../../src/presentation/battle/nightPresentation';
import { preparationDevices } from '../../src/presentation/preparation/preparation';

function view(): ApplicationView {
  const save = emptySave();
  const app = new LighthouseApplication({ read: () => JSON.stringify(save), write: () => {} }, NIGHT_CONFIG, () => ({ id: 'presentation', seed: 1 }));
  return { ...app.view, nights: NIGHT_CATALOG.map((night, index) => ({ ...night, available: index === 0, completed: false, reason: index === 0 ? 'Открыта' : 'Победи в предыдущей ночи' })) };
}

describe('chapter presentation', () => {
  it('hides identities and unknown variety while ignoring enemy spawn ordering', () => {
    const source = view();
    source.profile = { ...source.profile, encountered: ['ghost'] };
    source.config = { ...source.config, waves: [{ id: 'intel', enemies: ['bat', 'ghost', 'bat', 'minotaur'], spawnInterval: 1 }] };
    const before = JSON.stringify(source);
    const html = waveIntelligence(source);
    expect(html).toContain('4 существ');
    expect(html).toContain(source.config.enemies.ghost.name);
    expect(html).not.toContain(source.config.enemies.bat.name);
    expect(html).not.toContain(source.config.enemies.minotaur.name);
    expect(html.match(/Неизвестное существо/g)).toHaveLength(1);
    expect(JSON.stringify(source)).toBe(before);
    source.config = { ...source.config, waves: [{ id: 'intel', enemies: ['minotaur', 'bat', 'ghost', 'bat'], spawnInterval: 1 }] };
    expect(waveIntelligence(source)).toBe(html);
    source.config = { ...source.config, waves: [{ id: 'intel', enemies: ['bat', 'bat', 'ghost', 'bat'], spawnInterval: 1 }] };
    expect(waveIntelligence(source)).toBe(html);
  });

  it('explains locked nights and separates optional completion from chapter completion', () => {
    const source = view();
    const html = nightSelector(source);
    expect(html).toMatch(/data-night="broken-shore"[^>]*disabled/);
    expect(html).toContain('Победи в предыдущей ночи');
    expect(html).toContain('Не продвигает главу');
    expect(html).not.toContain('Все обычные ночи главы 1 пройдены');
    source.nights = source.nights.map((night) => ({ ...night, completed: !night.optional, available: true }));
    expect(nightSelector(source)).toContain('✓ Пройдена · можно повторить');
    expect(nightSelector(source)).not.toContain('Продолжение истории пока недоступно');
    expect(nightSelector({ ...source, screen: 'battle' })).toBe('');
  });

  it('projects unlocks, integer slots and the conditional hostile-target bonus', () => {
    expect(upgradeValue('cannon', 0)).toBe('закрыто');
    expect(upgradeValue('flash', 1)).toBe('открыто');
    expect(upgradeValue('typeSlots', 3)).toBe('3 слота типов');
    expect(upgradeValue('pairedDamageBonus', .2)).toBe('20% при освещении ≥2 врагов');
    const source = view();
    source.screen = 'development';
    source.profile = { ...source.profile, legacyEquipment: true };
    const html = screenContent(source, 'unlock-cannon', false);
    expect(html.match(/class="tree-branch"/g)).toHaveLength(6);
    expect(html.match(/data-action="select-upgrade"/g)).toHaveLength(82);
    expect(html).toContain('закрыто → открыто');
    expect(html).toContain('Повторно покупать прежнее оснащение не требуется');
    expect(html).toContain('Победа: Первый свет');
  });

  it('shows locked equipment and the exact straight shore while keeping free start', () => {
    const source = view();
    source.config = { ...source.config, terrain: { shoreX: 0, landOnlyPlacement: true }, availableDevices: [], flash: { ...source.config.flash, enabled: false } };
    const html = preparationDevices(source);
    expect(html).toMatch(/data-kind="cannon"[^>]*disabled/);
    expect(html).toContain('Вспышка закрыта');
    expect(html).toContain('весь круг объекта');
    expect(html).not.toContain(' Q ');
    expect(html).toContain('Расстановка бесплатна');
    expect(html).toMatch(/data-action="start" >Начать ночь · бесплатно/);
  });
});

describe('combat presentation facts', () => {
  it('distinguishes the minotaur windup, active charge and exhausted charge', () => {
    const enemy: EnemyState = { id: 1, kind: 'minotaur', waveIndex: 0, x: 0, y: 0, health: 10, armor: 0, attackCooldown: 0 };
    expect(enemyThreat({ ...enemy, chargePhase: 'windup' })).toContain('РАЗБЕГ');
    expect(enemyThreat({ ...enemy, chargePhase: 'charging' })).toContain('РЫВОК');
    expect(enemyThreat({ ...enemy, chargePhase: 'spent' })).toBe('Рывок израсходован');
    expect(enemyThreat({ ...enemy, kind: 'bat' })).toContain('пушки не атакуют');
  });

  it('uses ship state for waiting, lit, rescued and lost feedback without changing it', () => {
    const config = NIGHT_CATALOG.find((night) => night.id === 'rescue-trial')!.config;
    const ship: ShipState = { x: 220, y: 90, radius: 18, progress: 2, remaining: 12, status: 'waiting', lit: false };
    const before = JSON.stringify(ship);
    expect(shipStatus(ship, config)).toContain('ждёт света · 2.0/6 с');
    expect(shipStatus({ ...ship, lit: true }, config)).toContain('в свете');
    expect(shipStatus({ ...ship, status: 'rescued' }, config)).toContain('+12 ◈');
    expect(shipStatus({ ...ship, status: 'lost' }, config)).toContain('бой продолжается');
    expect(JSON.stringify(ship)).toBe(before);
    const source = view();
    source.screen = 'preparation';
    source.config = config;
    const briefing = screenContent(source, undefined, false);
    expect(briefing).toContain('Корабль и существа перекрывают друг друга по общим правилам луча');
    expect(briefing).not.toContain('не перекрывает');
    source.screen = 'result';
    source.result = { attemptId: 'result', nightId: 'rescue-trial', outcome: 'defeat', resources: 4, victoryReward: 0, totalResources: 19, bonus: 3, rescue: 12, kills: 1, saved: true, bossMaterials: 0, bossDefeated: false };
    const html = screenContent(source, undefined, false);
    expect(html).toContain('Сигнал бедствия / ИТОГ');
    expect(html).toContain('За спасение корабля</dt><dd>+12 ◈');
  });
});
