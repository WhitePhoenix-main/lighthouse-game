import { describe, expect, it } from 'vitest';
import { gameMenuChapter, gameMenuLayout, referenceGameMenu } from '../src/presentation/gameMenu';
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
        expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
      }
      expect(layout.floor !== null).toBe(!layout.mobile);
    });
  it('projects the next actual campaign night instead of hard-coded example data', () => {
    const save = emptySave(); save.profile.wonNightIds = ['first-light', 'broken-shore'];
    const app = new LighthouseApplication({ read: () => JSON.stringify(save), write: () => {} }, NIGHT_CONFIG, () => ({ id: 'menu', seed: 1 }), undefined, NIGHT_CATALOG);
    app.openGameMenu();
    expect(gameMenuChapter(app.view)).toEqual({ chapter: 'Туманный берег', number: 1, night: 3 });
    expect(referenceGameMenu(app.view)).toContain('data-game-control="continue" data-action="continue-game" >');
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
