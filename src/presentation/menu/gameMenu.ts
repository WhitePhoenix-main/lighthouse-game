import type { ApplicationView } from '../../contracts';
import { watchIcon } from '../shared/watchArtwork';

interface MenuRect { x: number; y: number; width: number; height: number }

/** Grow the view through the gate on wider phones. Keep its two landmarks in the aperture. */
export function gameMenuLayout(width: number, height: number) {
  const portrait = height >= width;
  const scale = Math.min(width / (portrait ? 360 : 640), height / (portrait ? 640 : 360));
  const cut = Math.round(width * .54);
  const artHeight = portrait ? Math.round(232 * scale) : height;
  const x = portrait ? Math.round(22 * scale) : cut + Math.round(17 * scale);
  const top = portrait ? artHeight + Math.round(12 * scale) : Math.round(19 * scale);
  const buttonWidth = Math.round(width - x - (portrait ? 22 : 18) * scale);
  const buttonHeight = Math.max(44, Math.round(46 * scale));
  const gap = Math.max(3, Math.round(3 * scale));
  const actionsY = top + Math.round(99 * scale);
  const row = (i: number): MenuRect => ({ x, y: actionsY + i * (buttonHeight + gap), width: buttonWidth, height: buttonHeight });
  const back = row(3);
  back.y = Math.max(back.y, top + Math.round((portrait ? 303 : 270) * scale));
  if (!portrait) back.width = Math.max(80, Math.round(118 * scale));
  return { portrait, art: { x: 0, y: 0, width: portrait ? width : cut, height: artHeight },
    info: { x, y: top, width: buttonWidth, height: actionsY - top },
    continue: row(0), newGame: row(1), trials: row(2), back };
}

export function gameMenuChapter(view: ApplicationView): { chapter: string; number: number; night: number } {
  const main = view.nights.filter(night => !night.optional);
  const selected = main.find(night => night.id === view.selectedNightId) ?? main[0];
  const chapters = [...new Set(main.map(night => night.chapter))];
  return { chapter: selected?.chapter ?? 'Туманный берег',
    number: Math.max(1, chapters.indexOf(selected?.chapter ?? '') + 1),
    night: Math.max(1, main.filter(night => night.chapter === selected?.chapter).findIndex(night => night.id === selected?.id) + 1) };
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]!);

export function referenceGameMenu(view: ApplicationView, confirmReset = false): string {
  const chapter = gameMenuChapter(view);
  const night = view.nights.find(item => item.id === view.selectedNightId);
  const blocked = Boolean(view.error);
  const control = (key: string, action: string, label: string, icon: string, disabled = false, primary = false) =>
    `<button class="watch-button game-menu-control game-menu-${key}${primary ? ' watch-primary' : ''}" data-game-control="${key}" data-action="${action}" ${disabled ? 'disabled' : ''}>${watchIcon(icon)}<span>${label}</span></button>`;
  return `<section class="reference-game-menu" data-ready="true" aria-labelledby="game-menu-title">
    <div class="game-menu-board"><div class="watch-gate" aria-hidden="true"><div></div></div>
    <div class="game-menu-information"><h1 class="watch-title" id="game-menu-title" tabindex="-1">Выбор игры</h1><div class="watch-rail"></div>
    ${view.hasProgress ? `<p>Глава ${chapter.number} · ${escape(chapter.chapter)}</p><p>Ночь ${chapter.night} · ${escape(night?.name ?? '')}</p>` : '<p>Сохранения пока нет. Начните новую игру.</p>'}</div>
    ${control('continue','continue-game','Продолжить','play',blocked || !view.hasProgress,view.hasProgress)}
    ${control('new-game','new-game','Новая игра','light',blocked,!view.hasProgress)}
    ${control('trials','trials','Испытания',view.campaign ? 'lock' : 'book',blocked || !!view.campaign)}
    ${control('back','game-menu-back','Назад','back',blocked)}</div>
    ${confirmReset ? `<div class="game-menu-confirm-scrim watch-dialog-shade"><section class="game-menu-confirm watch-dialog watch-gold" role="alertdialog" aria-modal="true" aria-labelledby="new-game-title" aria-describedby="new-game-description"><h2 id="new-game-title">${watchIcon(view.error ? 'repair' : 'light')}${view.hasProgress ? 'Начать новую игру?' : 'Не удалось начать игру'}</h2><div class="watch-rail"></div><p id="new-game-description">${view.error ? escape(view.error) : 'Текущее прохождение, ресурсы и улучшения будут удалены. Настройки сохранятся.'}</p><div class="watch-dialog-actions"><button class="watch-button watch-primary" data-action="cancel-new-game">Отмена</button>${view.error ? `<button class="watch-button" data-action="save">Повторить сохранение</button>${view.campaign ? '<button class="watch-button" data-action="reload-campaign">Перечитать сохранение</button>' : ''}` : '<button class="watch-button" data-action="confirm-new-game">Начать заново</button>'}</div></section></div>` : ''}</section>`;
}

export function layoutGameMenu(root: HTMLElement): void {
  const menu = root.querySelector<HTMLElement>('.reference-game-menu');
  if (!menu?.clientWidth || !menu.clientHeight) return;
  const layout = gameMenuLayout(menu.clientWidth, menu.clientHeight);
  menu.dataset.orientation = layout.portrait ? 'portrait' : 'landscape';
  const place = (selector: string, rect: MenuRect) => {
    const element = menu.querySelector<HTMLElement>(selector)!;
    Object.assign(element.style, { left: rect.x+'px', top: rect.y+'px', width: rect.width+'px', height: rect.height+'px' });
  };
  place('.watch-gate', layout.art);
  place('.game-menu-information', layout.info);
  for (const key of ['continue','newGame','trials','back'] as const) place(`[data-game-control="${key === 'newGame' ? 'new-game' : key}"]`, layout[key]);
}
