import { describe, it, expect } from 'vitest';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { emptySave } from '../../src/application/saves';
import { NIGHT_CONFIG } from '../../src/content/night';
import { createBattle } from '../../src/simulation/battle';
import { battleDevicePanel, deviceSymbols } from '../../src/presentation/shared/devices';
import { focusStatus, focusDescription, lensUpgradeEffect } from '../../src/presentation/shared/lenses';
import { screenContent, upgradeValue } from '../../src/presentation/screens';
import { translate } from '../../src/presentation/shared/localization';
import { LENS_UPGRADES } from '../../src/content/lenses';

describe('expanded development presentation', () => {
  it('reports the full data-driven catalog and meaningful reduction/rotation units', () => {
    const app = new LighthouseApplication({ read: () => JSON.stringify(emptySave()), write: () => {} }, NIGHT_CONFIG, () => ({ id: 'ui', seed: 1 }));
    const html = screenContent({ ...app.view, screen: 'development' }, undefined, false);
    expect(html.match(/data-action="select-upgrade"/g)).toHaveLength(82);
    expect(html.match(/data-action="purchase-lens-upgrade"/g)).toHaveLength(33);
    expect(html.match(/data-action="purchase-lens"/g)).toHaveLength(7);
    expect(upgradeValue('cannonIntervalReduction', .7)).toBe('0.7 с');
    expect(upgradeValue('turnSpeed', Math.PI / 2)).toBe('90°/с');
    expect(upgradeValue('harpoon', 1)).toBe('открыто');
    const effect = lensUpgradeEffect(LENS_UPGRADES.find(n => n.id === 'focused-hold-1')!);
    expect(effect).toBe('урон после удержания +5%');
    expect(translate(effect, 'en')).toBe('damage after sustained illumination +5%');
  });
  it('offers flying targets only to the harpoon and leaves battle/aim unchanged', () => {
    const app = new LighthouseApplication({ read: () => JSON.stringify(emptySave()), write: () => {} }, NIGHT_CONFIG, () => ({ id: 'ui', seed: 1 }));
    const battle = createBattle(NIGHT_CONFIG, 1, undefined, [{ id: 1, kind: 'harpoon', x: -90, y: 0 }, { id: 2, kind: 'cannon', x: -150, y: 0 }]);
    battle.enemies.push({ id: 50, kind: 'bat', x: 120, y: 0, health: 10, armor: 0 } as typeof battle.enemies[number]);
    const view = { ...app.view, screen: 'battle' as const, battle };
    const before = JSON.stringify(battle);
    expect(battleDevicePanel(view, 1, true, '')).toContain('data-enemy-id="50"');
    expect(battleDevicePanel(view, 2, true, '')).not.toContain('data-enemy-id="50"');
    expect(deviceSymbols.harpoon).not.toBe(deviceSymbols.cannon);
    expect(JSON.stringify(battle)).toBe(before);
  });
  it('projects actual simulation focus progress and reset, including paused snapshots', () => {
    const config = structuredClone(NIGHT_CONFIG);
    config.lens = { id: 'focused', slowMultiplier: 1, armorMultiplier: 1, focus: { seconds: 1.5, damageBonus: .2 } };
    const battle = createBattle(config, 1);
    expect(focusStatus(battle, config)).toContain('сброшен');
    battle.focus = { targetId: 17, ticks: 15 };
    expect(focusStatus(battle, config)).toContain('0.5 / 1.5 с');
    battle.focus.ticks = 45;
    expect(focusStatus(battle, config)).toContain('готов · цель #17 · +20%');
    expect(focusDescription(config)).toContain('Каждое щупальце считается отдельно');
    expect(focusDescription(config)).toContain('Корабль не накапливает фокус');
    battle.focus = { targetId: null, ticks: 0 };
    expect(focusStatus(battle, config)).toContain('сброшен');
  });
});
