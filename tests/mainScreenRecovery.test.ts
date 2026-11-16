import { describe, expect, it } from 'vitest';
import { LighthouseApplication } from '../src/application/gameApplication';
import { emptySave } from '../src/application/saves';
import { NIGHT_CONFIG } from '../src/content/night';
import { NIGHT_CATALOG } from '../src/content/nights';
import { screenContent } from '../src/presentation/screens';
import { translate } from '../src/presentation/localization';
import { drawSettingsPixelText } from '../src/presentation/settingsLettering';

function application(saved = false): LighthouseApplication {
  let raw = saved ? JSON.stringify(emptySave()) : null;
  return new LighthouseApplication({ read: () => raw, write: value => { raw = value; } }, NIGHT_CONFIG,
    () => ({ id: 'screen-recovery', seed: 42 }), undefined, NIGHT_CATALOG);
}

describe('main screen registration after the partial merge', () => {
  it('renders the actual game menu after Play without falling through to battle markup', () => {
    const app = application(); app.openGameMenu();
    const html = screenContent(app.view, undefined, false);
    expect(html).toContain('class="reference-game-menu"');
    expect(html).toContain('data-action="continue-game" disabled');
    expect(html).toContain('data-action="trials"');
    expect(html).toContain('data-action="new-game"');
    expect(html).not.toContain('preparation-panel');
    expect(html).not.toContain('battle');
  });
  it('passes the reset confirmation state through screenContent', () => {
    const app = application(true); app.openGameMenu();
    expect(screenContent(app.view, undefined, false)).not.toContain('role="alertdialog"');
    const html = screenContent(app.view, undefined, false, true);
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('data-action="cancel-new-game"');
    expect(html).toContain('data-action="confirm-new-game"');
  });
  it('keeps retry and cancellation inside the failed reset dialog and escapes error text', () => {
    const app = application(true); app.openGameMenu(); app.view.error = '<script>broken</script>';
    const html = screenContent(app.view, undefined, false, true);
    expect(html).toContain('data-action="save"');
    expect(html).toContain('data-action="cancel-new-game"');
    expect(html).toContain('&lt;script&gt;broken&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
  it('registers optional trials and keeps unopened trials disabled', () => {
    const app = application(); app.openGameMenu(); app.openTrials();
    const html = screenContent(app.view, undefined, false);
    expect(html).toContain('trials-panel');
    expect(html).toContain('data-night="rescue-trial" disabled');
    expect(html).not.toContain('data-night="first-light"');
    expect(html).not.toContain('preparation-panel');
  });
  it('fully translates game menu, reset and error states', () => {
    for (const saved of [false, true]) {
      const app = application(saved); app.openGameMenu();
      const html = screenContent(app.view, undefined, false, saved);
      expect(translate(html, 'en')).not.toMatch(/[А-Яа-яЁё]/);
    }
    for (const label of ['Ночь', 'Сохранения нет', 'Новая игра', 'Испытания', 'Не удалось начать игру', 'Продолжить — сохранения нет']) {
      expect(translate(label, 'en')).not.toMatch(/[А-Яа-яЁё]/);
    }
  });
  it('can paint every visible Russian and English menu label with the shared pixel font', () => {
    let painted = 0;
    const context = { getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      save() {}, restore() {}, resetTransform() {}, fillRect() { painted++; }, fillStyle: '' } as unknown as CanvasRenderingContext2D;
    for (const label of ['ПРОДОЛЖИТЬ', 'ИСПЫТАНИЯ', 'НОВАЯ ИГРА', 'СОХРАНЕНИЯ НЕТ', 'ГЛАВА I', 'ТУМАННЫЙ БЕРЕГ', 'НОЧЬ 3', 'CONTINUE', 'TRIALS', 'NEW GAME', 'NO SAVED GAME', 'CHAPTER I', 'MISTY SHORE', 'NIGHT 3']) {
      expect(() => drawSettingsPixelText(context, label, 0, 0, 1, '#fff')).not.toThrow();
    }
    expect(painted).toBeGreaterThan(0);
  });
});
