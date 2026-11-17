import { describe, it, expect } from 'vitest';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { UPGRADES } from '../../src/content/upgrades';
import { NIGHT_CONFIG } from '../../src/content/night';
import { emptySave } from '../../src/application/saves';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { lensDevelopment, lensUpgradeEffect, lensSelection } from '../../src/presentation/shared/lenses';
import { screenContent, upgradeValue } from '../../src/presentation/screens';
import { translate } from '../../src/presentation/shared/localization';

describe('stage seven lens presentation', () => {
  function scenario() {
    const seed = emptySave();
    Object.assign(seed.profile, { resources: 10000, bossMaterials: 100, bossLevel: 2, unlockedLenses: LENSES.map(l => l.id), purchasedUpgrades: UPGRADES.map(n => n.id), wonNightIds: ['first-light','broken-shore','winged-tide','abyss-warden'], lensUpgrades: LENS_UPGRADES.slice(0,27).map(n => n.id) });
    for (const kind of ['cannon','barrier','generator','harpoon','mortar','bell','light-trap','repair-lamp'] as const) seed.profile.devices.push({ id:seed.profile.nextDeviceId++, kind, health:NIGHT_CONFIG.devices.definitions[kind].health, consumed:false, position:null, ...(kind === 'light-trap' ? {trapCharges:1} : {}) });
    let saved = JSON.stringify(seed);
    const app = new LighthouseApplication({ read: () => saved, write: raw => { saved = raw; } }, NIGHT_CONFIG, () => ({ id: 'stage7-ui', seed: 42 }));
    expect(app.view.error).toBeNull(); return app;
  }
  it('renders 82 main nodes, 33 lens nodes and seven paid unlocks', () => {
    const app = scenario(); app.openDevelopment();
    const html = screenContent(app.view, undefined, false);
    expect(html).toContain('82 улучшений маяка · 33 улучшений линз · 7 открытия линз');
    expect(82 + LENS_UPGRADES.length + LENSES.filter(l => l.materialCost > 0).length).toBe(122);
    expect(html.match(/data-action="purchase-lens-upgrade"/g)).toHaveLength(33);
  });
  it('shows every new description, exact price, dependency and effect in RU and EN', () => {
    const app = scenario(), html = lensDevelopment(app.view);
    for (const node of LENS_UPGRADES.slice(27)) {
      expect(html).toContain(node.description + ' ' + lensUpgradeEffect(node));
      expect(html).toContain(`Купить · ${node.cost} ◈ + ${node.materialCost} Жемчуг глубин`);
      for (const id of node.requires) expect(html).toContain(LENS_UPGRADES.find(n => n.id === id)!.name);
      expect(translate(node.name + ' ' + node.description + ' ' + lensUpgradeEffect(node), 'en')).not.toMatch(/[А-Яа-яЁё]/);
    }
    expect(lensUpgradeEffect(LENS_UPGRADES.find(n => n.id === 'armor-breaker-width')!)).toBe('полная ширина +4°');
  });
  it('preparation projects the chosen lens stats after all six upgrades', () => {
    const app = scenario(); app.openDevelopment(); for (const node of LENS_UPGRADES.slice(27)) app.purchaseLensUpgrade(node.id);
    app.openPreparation();
    for (const id of ['expanded','slowing','armor-breaker'] as const) {
      app.selectLens(id);
      const html = screenContent(app.view, undefined, false);
      expect(lensSelection(app.view)).toContain(`data-lens="${id}" aria-pressed="true"`);
      expect(html).toContain(upgradeValue('damagePerSecond', app.view.config.beam.damagePerSecond));
      expect(html).toContain(String(app.view.config.beam.range));
      expect(html).toContain(`урон броне ×${app.view.config.lens!.armorMultiplier}`);
    }
  });
});
