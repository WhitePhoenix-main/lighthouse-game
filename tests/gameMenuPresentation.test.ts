import { describe, expect, it } from 'vitest';
import { gameMenuChapter, gameMenuLayout, referenceGameMenu } from '../src/presentation/menu/gameMenu';
import { LighthouseApplication } from '../src/application/gameApplication';
import { emptySave } from '../src/application/saves';
import { NIGHT_CONFIG } from '../src/content/night';
import { NIGHT_CATALOG } from '../src/content/nights';

describe('game menu layout and actual campaign context', () => {
  it.each([[320, 568], [390, 844], [568, 320], [844, 390], [768, 1024], [1024, 768], [1280, 720], [1672, 941], [2560, 1080]])(
    'keeps keyboard/touch controls visible and separated at %i × %i', (width, height) => {
      const layout = gameMenuLayout(width, height);
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
      expect(layout.info.y + layout.info.height).toBeLessThanOrEqual(layout.continue.y);
    });
  it('projects the next actual campaign night instead of hard-coded example data', () => {
    const save = emptySave(); save.profile.wonNightIds = ['first-light', 'broken-shore'];
    const app = new LighthouseApplication({ read: () => JSON.stringify(save), write: () => {} }, NIGHT_CONFIG, () => ({ id: 'menu', seed: 1 }), undefined, NIGHT_CATALOG);
    app.openGameMenu();
    expect(gameMenuChapter(app.view)).toEqual({ chapter: 'Туманный берег', number: 1, night: 3 });
    expect(referenceGameMenu(app.view)).toContain('data-game-control="continue" data-action="continue-game" >');
  });
  it('uses the gate beside the choices at 640×360 and the harbor above them at 360×640', () => {
    const landscape = gameMenuLayout(640, 360);
    const portrait = gameMenuLayout(360, 640);
    expect(landscape.art).toEqual({ x: 0, y: 0, width: 346, height: 360 });
    expect(portrait.art).toEqual({ x: 0, y: 0, width: 360, height: 232 });
    expect(landscape.art.width).toBeLessThan(landscape.info.x);
    expect(portrait.art.height).toBeLessThan(portrait.info.y);
    for (const layout of [landscape, portrait]) {
      expect(layout.continue.y + layout.continue.height).toBeLessThan(layout.newGame.y);
      expect(layout.newGame.y + layout.newGame.height).toBeLessThan(layout.trials.y);
      expect(layout.trials.y + layout.trials.height).toBeLessThan(layout.back.y);
    }
  });
  it('keeps continue in the layout but unavailable without creating a profile', () => {
    const app = new LighthouseApplication({ read: () => null, write: () => { throw Error('must not write'); } }, NIGHT_CONFIG, () => ({ id: 'menu', seed: 1 }));
    app.openGameMenu();
    const html = referenceGameMenu(app.view);
    expect(html).toContain('data-action="continue-game" disabled');
    expect(html).toContain('Сохранения пока нет');
    expect(html).not.toContain('Ваш путь');
    expect(html).toContain('watch-gate');
    expect(html).not.toContain('menu-sprites/background');
  });
});
