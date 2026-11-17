import { describe, expect, it } from 'vitest';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { emptySave } from '../../src/application/saves';
import { NIGHT_CONFIG } from '../../src/content/night';
import { createBattle } from '../../src/simulation/battle';
import { battleDevicePanel, deviceCondition } from '../../src/presentation/shared/devices';
import { preparationDevices } from '../../src/presentation/preparation/preparation';
import { translate } from '../../src/presentation/shared/localization';
import type { ApplicationView } from '../../src/contracts';

function view(): ApplicationView {
  const save = emptySave(); save.profile.resources = 500;
  const app = new LighthouseApplication({ read: () => JSON.stringify(save), write: () => {} }, NIGHT_CONFIG, () => ({ id: 'ui', seed: 1 }));
  return { ...app.view, battle: createBattle(NIGHT_CONFIG, 1, undefined, [
    { id: 1, kind: 'cannon', x: 100, y: 0 },
    { id: 2, kind: 'generator', x: 0, y: 100 },
    { id: 3, kind: 'light-trap', x: -100, y: 0 },
  ]) };
}

describe('device presentation', () => {
  it('offers all four preparation types and marks whole-body shield coverage', () => {
    const source = view();
    source.preparation = { ...source.preparation, selectedType: 'generator', placements: [
      { id: 1, kind: 'generator', x: 80, y: 0 },
      { id: 2, kind: 'barrier', x: NIGHT_CONFIG.shield.radius - 1, y: 0 },
    ] };
    source.preparation.inventory = [{ id: 1, kind: 'generator', health: 60, maxHealth: 60, consumed: false, position: { x: 80, y: 0 }, repairCost: 0, rechargeCost: 0 }];
    const html = preparationDevices(source);
    for (const kind of ['cannon', 'barrier', 'generator', 'light-trap']) expect(html).toContain(`data-kind="${kind}"`);
    expect(html).toContain('ОБЩЕЕ ПОЛЕ');
    expect(html).toContain('#1 · внутри поля');
    expect(html).toContain('#2 · вне поля');
  });
  it('shows condition, reserve, separate purchase and restoration controls with affordability', () => {
    const source = view(); source.profile = { ...source.profile, resources: 0 };
    source.preparation.inventory = [
      { id: 11, kind: 'cannon', health: 0, maxHealth: 80, consumed: false, position: null, repairCost: 5, rechargeCost: 0 },
      { id: 12, kind: 'light-trap', health: 0, maxHealth: 20, consumed: true, position: { x: -100, y: 0 }, repairCost: 0, rechargeCost: 2 },
    ];
    const before = JSON.stringify(source); const html = preparationDevices(source);
    expect(html).toContain('В запасе · Разрушено 0/80');
    expect(html).toContain('На поле · Разрушено 0/20 · Заряд израсходован');
    expect(html).toContain('data-action="repair-device" data-device-id="11" disabled');
    expect(html).toContain('data-action="recharge-device" data-device-id="12" disabled');
    expect(html).toContain('data-action="repair-device" data-device-id="12" >');
    expect(html).toContain('data-action="purchase-device" data-kind="cannon" disabled');
    expect(html).toContain('до 25% цены');
    expect(html).toContain('Начать ночь · бесплатно');
    expect(html).not.toContain('Черновик');
    expect(JSON.stringify(source)).toBe(before);
    expect(translate('Мои устройства', 'en')).toBe('My devices');
    expect(translate('Заряд израсходован', 'en')).toBe('Charge spent');
  });
  it('hides the shield from destroyed generators and marks inactive map objects', () => {
    const source = view();
    source.preparation.selectedType = 'generator';
    source.preparation.inventory = [
      { id: 21, kind: 'generator', health: 0, maxHealth: 60, consumed: false, position: { x: -80, y: 0 }, repairCost: 7, rechargeCost: 0 },
      { id: 22, kind: 'light-trap', health: 20, maxHealth: 30, consumed: true, position: { x: -140, y: 0 }, repairCost: 1, rechargeCost: 2 },
    ];
    source.preparation.placements = source.preparation.inventory.map(d => ({ id: d.id, kind: d.kind, x: d.position!.x, y: d.position!.y }));
    const html = preparationDevices(source);
    expect(html).not.toContain('ОБЩЕЕ ПОЛЕ');
    expect(html).toContain('data-device-condition="destroyed"');
    expect(html).toContain('data-device-condition="spent"');
    expect(html).toContain('<title>Генератор #21 · Разрушено</title>');
    expect(html).toContain('<title>Световая ловушка #22 · Заряд израсходован</title>');
    expect(html).toContain('opacity=".45"');
    source.preparation.inventory = source.preparation.inventory.map(d => d.id === 21 ? { ...d, health: 1 } : d);
    expect(preparationDevices(source)).toContain('ОБЩЕЕ ПОЛЕ');
  });
  it('keeps pinned targets outside range and explains waiting rather than automatic switching', () => {
    const source = view(); const battle = source.battle!;
    battle.devices[0]!.targetId = 7;
    battle.enemies.push({ id: 7, kind: 'ghost', waveIndex: 0, x: -300, y: 0, health: 10, armor: 0, attackCooldown: 0 });
    const before = JSON.stringify(source);
    const html = battleDevicePanel(source, 1, true, '');
    expect(html).toContain('Вне дальности — устройство ждёт её приближения');
    expect(html).toContain('data-enemy-id="7"');
    expect(html).toContain('data-action="auto-target"');
    expect(JSON.stringify(source)).toBe(before);
  });
  it('distinguishes spent traps from destroyed devices and limits non-cannon menus to information', () => {
    const source = view(); const trap = source.battle!.devices[2]!;
    trap.consumed = true; trap.health = 0;
    expect(deviceCondition(trap)).toBe('Израсходована');
    trap.consumed = false;
    expect(deviceCondition(trap)).toBe('Разрушено');
    for (const id of [2, 3]) {
      const html = battleDevicePanel(source, id, false, '');
      expect(html).not.toContain('data-action="cannon-priority"');
      expect(html).not.toContain('data-action="choose-target"');
      expect(html).toContain('data-action="close-device"');
    }
  });
});
