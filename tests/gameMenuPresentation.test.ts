import { describe, expect, it } from 'vitest';
import { GAME_MENU_COMPOSITIONS, gameMenuChapter, gameMenuLayout, gameMenuMetadataLayout, referenceGameMenu } from '../src/presentation/menu/gameMenu';
import { LighthouseApplication } from '../src/application/gameApplication';
import { emptySave } from '../src/application/saves';
import { NIGHT_CONFIG } from '../src/content/night';
import { NIGHT_CATALOG } from '../src/content/nights';

describe('game menu layout and actual campaign context', () => {
  it.each([[320, 568, true], [390, 844, true], [568, 320, true], [844, 390, true], [768, 1024, true], [1024, 768, true], [1280, 720, false], [1672, 941, false], [2560, 1080, false]])(
    'keeps keyboard/touch controls visible and separated at %i × %i', (width, height, coarse) => {
      const layout = gameMenuLayout(width, height, coarse);
      const buttons = [layout.back, layout.continue, layout.trials, layout.newGame];
      for (const button of buttons) {
        expect(button.x).toBeGreaterThanOrEqual(0); expect(button.y).toBeGreaterThanOrEqual(0);
        expect(button.width).toBeGreaterThanOrEqual(44); expect(button.height).toBeGreaterThanOrEqual(44);
        expect(button.x + button.width).toBeLessThanOrEqual(width);
        expect(button.y + button.height).toBeLessThanOrEqual(height);
      }
      for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
        const a = buttons[i]!, b = buttons[j]!;
        // Source crops include a few transparent pixels around the irregular stones.
        const margin = Math.min(a.width, a.height, b.width, b.height) * .03;
        expect(a.x + a.width - margin <= b.x + margin || b.x + b.width - margin <= a.x + margin
          || a.y + a.height - margin <= b.y + margin || b.y + b.height - margin <= a.y + margin).toBe(true);
      }
      expect(layout.floor).not.toBeNull();
    });
  it('projects the next actual campaign night instead of hard-coded example data', () => {
    const save = emptySave(); save.profile.wonNightIds = ['first-light', 'broken-shore'];
    const app = new LighthouseApplication({ read: () => JSON.stringify(save), write: () => {} }, NIGHT_CONFIG, () => ({ id: 'menu', seed: 1 }), undefined, NIGHT_CATALOG);
    app.openGameMenu();
    expect(gameMenuChapter(app.view)).toEqual({ chapter: 'Туманный берег', number: 1, night: 3 });
    expect(referenceGameMenu(app.view)).toContain('data-game-control="continue" data-action="continue-game" >');
  });
  it.each(['desktop', 'mobile'] as const)('matches approved %s stone bounds at the reference viewport', (family) => {
    const source = GAME_MENU_COMPOSITIONS[family];
    const layout = gameMenuLayout(source.width, source.height, family === 'mobile');
    for (const name of ['continue', 'trials', 'newGame', 'back', 'floor'] as const) expect(layout[name]).toEqual(source[name]);
  });
  it('uses the vertical icon-and-text order on desktop and a bottom return on portrait phones', () => {
    const desktop = gameMenuLayout(1672, 941);
    const mobile = gameMenuLayout(841, 1870, true);
    expect(desktop.back.y + desktop.back.height).toBeLessThan(desktop.continue.y);
    expect(desktop.trials.y).toBe(desktop.newGame.y);
    expect(mobile.continue.y + mobile.continue.height).toBeLessThanOrEqual(mobile.trials.y);
    expect(mobile.newGame.y + mobile.newGame.height).toBeLessThan(mobile.back.y);
  });
  it.each([[320, 568], [568, 320], [390, 844], [844, 390], [1280, 720], [1672, 941]])(
    'keeps large metadata and its Й accent above the divider at %i × %i', (width, height) => {
      const layout = gameMenuLayout(width, height, true);
      const mobile = layout.mobile && !layout.horizontal;
      const source = GAME_MENU_COMPOSITIONS[mobile ? 'mobile' : 'desktop'];
      const size = Math.max(12, (mobile ? 28 : 22) * layout.continue.width / source.continue.width) / 9 * 1.12;
      const rows = gameMenuMetadataLayout(layout.continue.height, size, mobile);
      const inkHeight = size * 9 + 2;
      expect(rows.name - size * 3).toBeGreaterThanOrEqual(rows.chapter + inkHeight + 1);
      if (rows.night !== null) expect(rows.night).toBeGreaterThanOrEqual(rows.name + inkHeight + 1);
      expect((rows.night ?? rows.name) + inkHeight).toBeLessThanOrEqual(layout.continue.height * (mobile ? .53 : .58) - 2);
    });
  it('keeps continue in the layout but unavailable without creating a profile', () => {
    const app = new LighthouseApplication({ read: () => null, write: () => { throw Error('must not write'); } }, NIGHT_CONFIG, () => ({ id: 'menu', seed: 1 }));
    app.openGameMenu();
    const html = referenceGameMenu(app.view);
    expect(html).toContain('data-action="continue-game" disabled');
    expect(html).toContain('Сохранения пока нет');
    expect(html).not.toContain('Ваш путь');
    expect(html).toContain('floor-desktop.png');
    expect(html).not.toContain('menu-sprites/background');
  });
});
