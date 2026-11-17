import { describe, expect, it } from 'vitest';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { emptySave } from '../../src/application/saves';
import { NIGHT_CONFIG } from '../../src/content/night';
import { createBattle } from '../../src/simulation/battle';
import { lensDevelopment, lensSelection } from '../../src/presentation/shared/lenses';
import { nightSelector, screenContent } from '../../src/presentation/screens';
import { bossStatus, tentacleStatus } from '../../src/presentation/battle/nightPresentation';
import type { ApplicationView } from '../../src/contracts';

function view(): ApplicationView {
  const save = emptySave();
  return new LighthouseApplication({ read: () => JSON.stringify(save), write: () => {} }, NIGHT_CONFIG, () => ({ id: 'lens-ui', seed: 1 })).view;
}

describe('lens and boss presentation', () => {
  it('marks exactly one selected lens, disables closed ones and offers no purchases in preparation', () => {
    const source = { ...view(), screen: 'preparation' as const };
    const before = JSON.stringify(source);
    const html = lensSelection(source);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/data-lens="expanded"[^>]*disabled/);
    expect(html).toContain('Закрыта · 2 Жемчуг глубин');
    expect(html).not.toContain('data-action="purchase-lens"');
    expect(html).toContain('Выбор бесплатный');
    expect(JSON.stringify(source)).toBe(before);
    expect(lensSelection({ ...source, screen: 'battle', paused: true })).toBe('');
  });

  it('keeps lens trees separate and shows both currencies and sequential requirements', () => {
    const source = { ...view(), screen: 'development' as const };
    const html = lensDevelopment(source);
    expect(html.match(/data-action="purchase-lens"/g)).toHaveLength(7);
    expect(html.match(/data-action="purchase-lens-upgrade"/g)).toHaveLength(33);
    expect(html).toContain('45 ◈ + 1 Жемчуг глубин');
    expect(html).toContain('Требования: Широкий сектор');
    expect(html).toContain('множитель скорости -0.15');
    expect(html).toContain('Перезарядка вспышки не меняется');
    expect(screenContent(source, undefined, false).match(/data-action="select-upgrade"/g)).toHaveLength(82);
  });

  it('groups chapters using content and lists optional trials separately', () => {
    const source = view();
    source.nights = [
      { id: 'abyss-warden', name: 'Босс', description: '', chapter: 'Берег', optional: false, available: true, completed: true, reason: '', bossLevel: 3, materialReward: 4 },
      { id: 'far-shore', name: 'Дальний берег', description: '', chapter: 'За морем', optional: false, available: true, completed: false, reason: '' },
      { id: 'rescue-trial', name: 'Спасение', description: '', chapter: 'Берег', optional: true, available: true, completed: false, reason: '' },
    ];
    const html = nightSelector(source);
    expect(html).toContain('Глава 1 · Берег');
    expect(html).toContain('Глава 2 · За морем');
    expect(html.indexOf('Спасение')).toBeGreaterThan(html.indexOf('Отдельное испытание'));
    expect(html).toContain('уровень 3 · награда 4');
    expect(html).not.toContain('Продолжение истории пока недоступно');
  });

  it('distinguishes boss death from victory and waits for persistence confirmation', () => {
    const source = { ...view(), screen: 'result' as const };
    source.result = { attemptId: 'result', nightId: 'abyss-warden', outcome: 'defeat', resources: 4, victoryReward: 0, totalResources: 4, bonus: 0, rescue: 0, kills: 1, saved: true, bossMaterials: 0, bossDefeated: true };
    expect(screenContent(source, undefined, false)).toContain('материал не выдан, следующая глава не открыта');
    source.result = { ...source.result, outcome: 'victory', bossMaterials: 2, saved: false };
    expect(screenContent(source, undefined, false)).toContain('Жемчуг глубин: +2 · ожидает сохранения');
    expect(screenContent(source, undefined, false)).not.toContain('материал сохранён');
    source.result = { ...source.result, saved: true };
    expect(screenContent(source, undefined, false)).toContain('материал сохранён за победу во всей ночи');
  });

  it('projects one owner health and distinct slowed, stopped, blocked and stunned states', () => {
    const config = { ...NIGHT_CONFIG, boss: { id: 'abyss-warden' as const, name: 'Страж', level: 2, health: 300, materialReward: 3, tentacleCount: 2, spawnRadius: 250, radius: 15, speed: 10, attackDamage: 10, attackInterval: 1, litSpeedMultiplier: .5 } };
    const battle = createBattle(config, 1);
    battle.boss = { id: 'abyss-warden', health: 180, stunnedUntilTick: 0, tentacles: [{ id: -1001, x: 200, y: 0, attackCooldown: 0 }] };
    const tip = battle.boss.tentacles[0]!;
    battle.litTentacleIds = [tip.id];
    const before = JSON.stringify(battle);
    expect(bossStatus(battle, config)).toContain('общее здоровье 180 / 300');
    expect(tentacleStatus(tip, battle, config)).toContain('замедлено');
    expect(JSON.stringify(battle)).toBe(before);
    expect(tentacleStatus({ ...tip, x: 0 }, battle, config)).toContain('атака остановлена');
    battle.blockedTentacleIds = [tip.id];
    expect(tentacleStatus(tip, battle, config)).toBe('ПЕРЕКРЫТО');
    battle.boss.stunnedUntilTick = battle.tick + 2;
    expect(tentacleStatus(tip, battle, config)).toContain('ОГЛУШЕНО');
    battle.boss.health = 0;
    expect(bossStatus(battle, config)).toContain('отбей оставшиеся волны');
  });
});
