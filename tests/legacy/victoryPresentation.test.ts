import { describe, expect, it } from 'vitest';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { emptySave } from '../../src/application/saves';
import { NIGHT_CONFIG } from '../../src/content/night';
import { screenContent } from '../../src/presentation/screens';
import { translate } from '../../src/presentation/shared/localization';

describe('victory reward presentation', () => {
  const view = () => new LighthouseApplication({ read: () => JSON.stringify(emptySave()), write: () => {} }, NIGHT_CONFIG, () => ({ id: 'reward', seed: 1 })).view;
  it('promises the configured reward on every clear including repeats', () => {
    const source = view(); source.screen = 'preparation';
    source.config = { ...source.config, victoryReward: 83 };
    source.nights = source.nights.map(night => ({ ...night, completed: true }));
    const html = screenContent(source, undefined, false);
    expect(html).toContain('За каждую победу: +83 ◈');
    expect(html).toContain('включая повторное прохождение.');
    expect(translate(html, 'en')).toContain('For every victory: +83 ◈');
  });
  it.each([true, false])('shows the application total and separate rewards, saved=%s', saved => {
    const source = view(); source.screen = 'result';
    source.result = { attemptId: 'reward', nightId: 'first-light', outcome: 'victory', resources: 4, bonus: 3, rescue: 12, victoryReward: 83, totalResources: 102, kills: 1, saved, bossMaterials: 0, bossDefeated: false };
    const html = screenContent(source, undefined, false);
    for (const [label, amount] of [['За существ', 4], ['За досрочные волны', 3], ['За спасение корабля', 12], ['За победу', 83], ['Итого', 102]]) expect(html).toContain(label + '</dt><dd>+' + amount);
    expect(html).not.toContain('начислено');
    expect(html).toContain(saved ? '✓ Результат сохранён' : 'Результат ещё не сохранён');
    expect(translate(html, 'en')).toContain('Victory reward</dt><dd>+83');
    source.result = { ...source.result, outcome: 'defeat', victoryReward: 0, totalResources: 19 };
    const defeat = screenContent(source, undefined, false);
    expect(defeat).toContain('За победу</dt><dd>+0');
    expect(defeat).toContain('Итого</dt><dd>+19');
  });
});
