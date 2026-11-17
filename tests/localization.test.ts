import { describe, expect, it } from 'vitest';
import { localizeRoot, resolveLanguage, translate } from '../src/presentation/shared/localization';
import { LighthouseApplication } from '../src/application/gameApplication';
import { NIGHT_CONFIG } from '../src/content/night';
import { NIGHT_CATALOG } from '../src/content/nights';
import { screenContent } from '../src/presentation/screens';
import { createPreparationUiState } from '../src/presentation/preparation/preparationState';
import { ENEMIES } from '../src/content/enemies';
import type { SaveStore } from '../src/contracts';

// Minimal DOM surface makes the reversible projection testable without a browser or a DOM dependency.
class TextNode {
  readonly nodeType = 3;
  readonly childNodes: Node[] = [];
  constructor(public nodeValue: string) {}
}
class ElementNode {
  readonly nodeType = 1;
  readonly attributes = new Map<string, string>();
  constructor(readonly childNodes: (TextNode | ElementNode)[] = [], readonly tagName = 'DIV') {}
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}
const rootOf = (node: ElementNode): HTMLElement => node as unknown as HTMLElement;

describe('language resolution', () => {
  it('honors explicit preference, then platform, then browser, then Russian', () => {
    expect(resolveLanguage('en', 'ru', ['ru'])).toBe('en');
    expect(resolveLanguage('ru', 'en', ['en'])).toBe('ru');
    expect(resolveLanguage('auto', 'EN-us', ['ru'])).toBe('en');
    expect(resolveLanguage('auto', 'ru-RU', ['en'])).toBe('ru');
    expect(resolveLanguage('auto', null, ['en-GB', 'ru'])).toBe('en');
    expect(resolveLanguage('auto', '', ['en_US'])).toBe('en');
    expect(resolveLanguage('auto')).toBe('ru');
  });
  it('uses Russian for unsupported source without trying lower-priority preferences', () => {
    expect(resolveLanguage('auto', 'de', ['en'])).toBe('ru');
    expect(resolveLanguage('auto', null, ['fr', 'en'])).toBe('ru');
    expect(resolveLanguage('auto', null, [])).toBe('ru');
  });
});

describe('reversible DOM localization', () => {
  it('translates text and accessibility strings repeatedly, preserves data attributes, and restores Russian', () => {
    const text = new TextNode('В свете: 2 / 3'); const element = new ElementNode([text]);
    element.setAttribute('aria-label', 'Выбор ночи'); element.setAttribute('title', 'Настройки');
    element.setAttribute('data-action', 'select-night'); element.setAttribute('id', 'night-title');
    const root = rootOf(element); localizeRoot(root, 'en'); localizeRoot(root, 'en');
    expect(text.nodeValue).toBe('Lit: 2 / 3'); expect(element.getAttribute('aria-label')).toBe('Night Selection');
    expect(element.getAttribute('title')).toBe('Settings');
    expect(element.getAttribute('data-action')).toBe('select-night'); expect(element.getAttribute('id')).toBe('night-title');
    localizeRoot(root, 'ru'); expect(text.nodeValue).toBe('В свете: 2 / 3');
    expect(element.getAttribute('aria-label')).toBe('Выбор ночи');
  });
  it('recognizes updated dynamic text and attributes, then restores their newest source', () => {
    const text = new TextNode('В свете: 1 / 2'); const element = new ElementNode([text]);
    element.setAttribute('title', 'Пауза'); const root = rootOf(element); localizeRoot(root, 'en');
    text.nodeValue = 'В свете: 2 / 2'; element.setAttribute('title', 'Продолжить'); localizeRoot(root, 'en');
    expect(text.nodeValue).toBe('Lit: 2 / 2'); expect(element.getAttribute('title')).toBe('Continue');
    localizeRoot(root, 'ru'); expect(text.nodeValue).toBe('В свете: 2 / 2'); expect(element.getAttribute('title')).toBe('Продолжить');
  });
  it('does not modify scripts or styles or user input', () => {
    for (const tagName of ['SCRIPT', 'STYLE', 'TEXTAREA']) {
      const text = new TextNode('Настройки'); localizeRoot(rootOf(new ElementNode([text], tagName)), 'en');
      expect(text.nodeValue).toBe('Настройки');
    }
  });
});

describe('complete current screen and content translations', () => {
  it('translates dynamic economy, shield, boss, and save notices without altering numbers', () => {
    for (const text of [
      'За ночь: 18 ◈ + 4 бонус + 10 спасение · черновик',
      '◇ Общее поле: 12 / 100 · Восстановление через 3 с. Удары по полю и защищаемым целям сбрасывают задержку.',
      'Страж глубин · ур. 2 · общее здоровье 150 / 500 · ОГЛУШЕНИЕ',
      'Требуется 25 осколков и 2 материала босса',
      'Настройки не подтверждены: Настройки изменились извне. Перезагрузите игру.. Повторите запись или вернитесь к сохранённым настройкам.',
    ]) {
      const translated = translate(text, 'en'); expect(translated).not.toMatch(/[А-Яа-яЁё]/);
      expect(translated.match(/\d+/g)).toEqual(text.match(/\d+/g)); expect(translate(text, 'ru')).toBe(text);
    }
    expect(translate('Мощность I · 12 урона/с', 'en')).toBe('Power I · 12 damage/s');
  });
  it('covers current enemy descriptions and every preparation night, settings and upgrade details', () => {
    const store: SaveStore = { read: () => null, write: () => undefined };
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'translation', seed: 1 }), undefined, NIGHT_CATALOG);
    for (const screen of ['menu', 'settings', 'development', 'preparation'] as const) {
      app.view.screen = screen;
      for (const node of app.view.upgrades) {
        const html = translate(screenContent(app.view, node.definition.id, false), 'en');
        expect(html.match(/[А-Яа-яЁё][А-Яа-яЁё ]*/g) ?? [], screen + ':' + node.definition.id).toEqual([]);
      }
    }
    for (const night of NIGHT_CATALOG) {
      app.view.config = night.config; app.view.selectedNightId = night.id; app.view.screen = 'preparation';
      for (const panel of [null, 'devices', 'lens', 'ability', 'recon', 'night', 'shards', 'pearls'] as const) {
        const state = { ...createPreparationUiState(), panel };
        const html = translate(screenContent(app.view, undefined, false, false, undefined, state), 'en');
        expect(html.match(/[А-Яа-яЁё][А-Яа-яЁё ]*/g) ?? [], night.id + ':' + panel).toEqual([]);
      }
    }
    for (const enemy of Object.values(ENEMIES)) expect(translate(enemy.name + ': ' + enemy.description, 'en')).not.toMatch(/[А-Яа-яЁё]/);
  });
});
