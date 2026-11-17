import { describe, expect, it } from 'vitest';
import type { ApplicationView } from '../../src/contracts';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { NIGHT_CONFIG } from '../../src/content/night';
import { lateModeSelector, nightLabel, screenContent } from '../../src/presentation/screens';
import { translate } from '../../src/presentation/shared/localization';
import { lateNightModeOptions } from '../../src/content/lateModes';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { createBattle } from '../../src/simulation/battle';

function view(): ApplicationView {
  const app = new LighthouseApplication({ read: () => null, write: () => {} }, NIGHT_CONFIG, () => ({ id: 'mode-ui', seed: 1 }));
  return {
    ...app.view, screen: 'preparation', selectedNightId: 'armored-front',
    config: { ...app.view.config, lateMode: 'transition' },
    nights: [{ id: 'armored-front', name: 'Броневой фронт', description: 'Позднее испытание', chapter: 'Поздние испытания', optional: true, available: true, completed: true, reason: '' }],
    lateNightModes: [
      { id: 'transition', name: 'Переходный', description: 'Для частичной сборки', totalReward: 190 },
      { id: 'assault', name: 'Штурм', description: 'Для развитой обороны', totalReward: 260 }
    ]
  };
}

function resultView(): ApplicationView {
  const v = view();
  return { ...v, screen: 'result', config: { ...v.config, lateMode: 'transition' }, result: {
    attemptId: 'mode-ui', nightId: 'armored-front', lateMode: 'assault', outcome: 'victory', saved: true,
    resources: 80, victoryReward: 180, totalResources: 260, bonus: 0, kills: 48, rescue: 0, bossMaterials: 0, bossDefeated: false
  } };
}

describe('explicit late trial modes in presentation', () => {
  it('renders both modes, their data-driven rewards and the selected mode without separate completion marks', () => {
    const v = view();
    const html = lateModeSelector(v);
    expect(html.match(/data-action="select-late-mode"/g)).toHaveLength(2);
    expect(html).toContain('data-mode="transition" aria-pressed="true"');
    expect(html).toContain('data-mode="assault" aria-pressed="false"');
    expect(html).toContain('Полная зачистка: 190 ◈');
    expect(html).toContain('Полная зачистка: 260 ◈');
    expect(html).toContain('Прохождение ночи общее для обоих режимов.');
    expect(html).not.toContain('completed');
    expect(html).not.toContain('✓');
    v.lateNightModes = v.lateNightModes!.map(mode => ({ ...mode, totalReward: mode.totalReward + 7 }));
    expect(lateModeSelector(v)).toContain('Полная зачистка: 197 ◈');
  });

  it('keeps mode selection and retry before the long night list and explains the reward total', () => {
    const preparation = screenContent(view(), undefined, false);
    expect(preparation.indexOf('class="late-mode-selection"')).toBeLessThan(preparation.indexOf('class="night-selection"'));
    const result = screenContent(resultView(), undefined, false);
    expect(result.indexOf('data-action="start"')).toBeLessThan(result.indexOf('class="night-selection"'));
    expect(preparation).toContain('Награда включает существ и победу; досрочные бонусы отдельно.');
    expect(translate('Награда включает существ и победу; досрочные бонусы отдельно.', 'en')).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('disables changes on a save error or unsaved result and hides controls in battle and early nights', () => {
    const v = view();
    expect(lateModeSelector({ ...v, error: 'Ошибка записи' }).match(/ disabled/g)).toHaveLength(2);
    const r = resultView();
    expect(lateModeSelector({ ...r, result: { ...r.result!, saved: false } }).match(/ disabled/g)).toHaveLength(2);
    expect(lateModeSelector(r).match(/ disabled/g)).toHaveLength(2);
    expect(lateModeSelector({ ...v, screen: 'battle', paused: true })).toBe('');
    expect(lateModeSelector({ ...v, lateNightModes: undefined })).toBe('');
  });

  it('labels preparation and battle with the chosen mode but labels the result with the completed attempt mode', () => {
    const v = view();
    expect(screenContent(v, undefined, false)).toContain('Броневой фронт · Переходный / ПОДГОТОВКА');
    expect(nightLabel(v)).toBe('Броневой фронт · Переходный');
    expect(nightLabel({ ...v, config: { ...v.config, lateMode: 'assault' } })).toBe('Броневой фронт · Штурм');
    expect(screenContent(resultView(), undefined, false)).toContain('Броневой фронт · Штурм / ИТОГ');
    expect(nightLabel({ ...v, config: { ...v.config, lateMode: undefined } })).toBe('Броневой фронт');
  });

  it('renders controls without changing battle aim, devices or profile', () => {
    const v = view(); v.battle = createBattle(v.config, 7);
    const before = JSON.stringify(v);
    screenContent(v, undefined, false);
    expect(JSON.stringify(v)).toBe(before);
    expect(translate('Режим позднего испытания · Переходный · Штурм · Полная зачистка: 190 ◈', 'en'))
      .toBe('Late trial mode · Transition · Assault · Full clear: 190 ◈');
    expect(translate('Прохождение ночи общее для обоих режимов.', 'en')).toBe('Night completion is shared across both modes.');
    const modes = lateNightModeOptions(NIGHT_CATALOG.find(night => night.id === 'armored-front')!.config);
    for (const mode of modes) expect(translate(mode.description, 'en')).not.toMatch(/[А-Яа-яЁё]/);
  });
});
