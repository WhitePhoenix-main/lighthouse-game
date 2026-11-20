(() => {
const GLYPHS={"0":["00111100","01100110","11000011","11000111","11011011","11100011","11000011","01100110","00111100"],"1":["00011000","00111000","01111000","00011000","00011000","00011000","00011000","00011000","01111110"],"2":["01111100","11000110","00000110","00001100","00011000","00110000","01100000","11000000","11111110"],"3":["01111100","11000110","00000110","00001100","00111000","00001100","00000110","11000110","01111100"],"4":["00001100","00011100","00111100","01101100","11001100","11111110","00001100","00001100","00011110"],"5":["11111111","11000000","11000000","11111100","00000110","00000011","00000011","11000110","01111100"],"6":["00111100","01100000","11000000","11111100","11000110","11000011","11000011","01100110","00111100"],"7":["11111111","11000011","00000110","00001100","00011000","00011000","00110000","00110000","00110000"],"8":["00111100","01100110","11000011","01100110","00111100","01100110","11000011","01100110","00111100"],"9":["00111100","01100110","11000011","11000011","01100111","00111110","00000110","00001100","01111000"],"Ж":["11011011","01111110","00111100","00011000","00111100","01111110","11011011","11011011","11011011"],"А":["00111000","01111100","01101100","11000110","11000110","11111110","11000110","11000110","11101111"],"Б":["11111111","01100011","01100001","01100000","01111100","01100110","01100110","01100110","11111100"],"В":["11111100","01100110","01100110","01100110","01111100","01100110","01100110","01100110","11111100"],"Г":["11111111","01100011","01100001","01100000","01100000","01100000","01100000","01100000","11110000"],"Д":["00111110","00011010","00011010","00011010","00011010","00110010","00110010","01111111","11000011"],"Е":["11111111","01100011","01100001","01101000","01111000","01101000","01100001","01100011","11111111"],"З":["01111100","11000110","10000110","00001100","00111000","00001100","10000110","11000110","01111100"],"И":["11100111","01100110","01100110","01101110","01101110","01110110","01110110","01100110","11100111"],"Й":["11100111","01100110","01100110","01101110","01101110","01110110","01110110","01100110","11100111"],"К":["11101111","01100110","01101100","01111000","01111000","01101100","01100110","01100110","11101111"],"Л":["00111111","00011010","00011010","00011010","00110010","00110010","00110010","01100010","11000111"],"М":["11000011","11100111","11111111","11011011","11000011","11000011","11000011","11000011","11100111"],"Н":["11101111","01100110","01100110","01100110","01111110","01100110","01100110","01100110","11101111"],"О":["00111100","01111110","11000011","11000011","11000011","11000011","11000011","01111110","00111100"],"П":["11111111","01100110","01100110","01100110","01100110","01100110","01100110","01100110","11101111"],"Р":["11111100","01100110","01100110","01100110","01111100","01100000","01100000","01100000","11110000"],"С":["00111111","01110011","11000001","11000000","11000000","11000000","11000001","01110011","00111110"],"Т":["11111111","11011011","10011001","00011000","00011000","00011000","00011000","00011000","00111100"],"У":["11100111","01100110","01100110","00111100","00011000","00011000","00011000","00110000","11100000"],"Х":["11100111","01100110","00111100","00011000","00011000","00111100","01100110","01100110","11100111"],"Ч":["11101111","01100110","01100110","01100110","00111110","00000110","00000110","00000110","00001111"],"Ы":["11100111","01100011","01100011","01111011","01101111","01101111","01101111","01101111","11111011"],"Ь":["11110000","01100000","01100000","01111100","01100110","01100110","01100110","01100110","11111100"],"Я":["00111111","01100110","01100110","01100110","00111110","00011110","00110110","01100110","11101111"],"E":["11111111","01100011","01100001","01101000","01111000","01101000","01100001","01100011","11111111"],"N":["11100111","01100110","01110110","01110110","01111110","01101110","01101110","01100110","11100110"],"G":["00111111","01110011","11000001","11000000","11001111","11000110","11000110","01110110","00111100"],"L":["11110000","01100000","01100000","01100000","01100000","01100000","01100001","01100011","11111111"],"I":["11111111","00111100","00011000","00011000","00011000","00011000","00011000","00111100","11111111"],"S":["01111111","11000011","11000000","01100000","00111100","00000110","00000011","11000011","11111110"],"H":["11101111","01100110","01100110","01100110","01111110","01100110","01100110","01100110","11101111"],"%":["01100001","10010010","10010100","01101000","00010000","00101100","01010010","10010010","00001100"],"A":["00111000","01111100","01101100","11000110","11000110","11111110","11000110","11000110","11101111"],"B":["11111100","01100110","01100110","01100110","01111100","01100110","01100110","01100110","11111100"],"C":["00111111","01110011","11000001","11000000","11000000","11000000","11000001","01110011","00111110"],"K":["11101111","01100110","01101100","01111000","01111000","01101100","01100110","01100110","11101111"],"M":["11000011","11100111","11111111","11011011","11000011","11000011","11000011","11000011","11100111"],"O":["00111100","01111110","11000011","11000011","11000011","11000011","11000011","01111110","00111100"],"P":["11111100","01100110","01100110","01100110","01111100","01100000","01100000","01100000","11110000"],"T":["11111111","11011011","10011001","00011000","00011000","00011000","00011000","00011000","00111100"],"X":["11100111","01100110","00111100","00011000","00011000","00111100","01100110","01100110","11100111"],"Y":["11100111","01100110","01100110","00111100","00011000","00011000","00011000","00110000","11100000"],"D":["11111100","01100110","01100011","01100011","01100011","01100011","01100011","01100110","11111100"],"F":["11111111","01100011","01100001","01101000","01111000","01101000","01100000","01100000","11110000"],"J":["00011111","00000110","00000110","00000110","00000110","00000110","11000110","01101100","00111000"],"Q":["00111100","01111110","11000011","11000011","11000011","11011011","11001110","01111100","00000111"],"R":["11111100","01100110","01100110","01100110","01111100","01101100","01100110","01100110","11100111"],"U":["11100111","01100110","01100110","01100110","01100110","01100110","01100110","01111110","00111100"],"V":["11100111","01100110","01100110","01100110","01100110","01100110","00111100","00111100","00011000"],"W":["11100111","11000011","11000011","11000011","11011011","11011011","11111111","01100110","01100110"],"Z":["11111111","11000011","00000110","00001100","00011000","00110000","01100000","11000011","11111111"],"Ц":["11100111","01100110","01100110","01100110","01100110","01100110","01100110","11111111","00000011"],"Ш":["11011011","11011011","11011011","11011011","11011011","11011011","11011011","11011011","11111111"],"Щ":["11011011","11011011","11011011","11011011","11011011","11011011","11011011","11111111","00000011"],"Ю":["11001110","11011011","11011011","11011011","11111011","11011011","11011011","11011011","11001110"],"Э":["01111100","11000110","00000011","00000011","00111111","00000011","00000011","11000110","01111100"],"Ф":["00011000","01111110","11011011","11011011","11011011","01111110","00011000","00011000","00111100"],"Ъ":["11110000","00110000","00110000","00111100","00110110","00110110","00110110","00110110","01111100"],".":["00000000","00000000","00000000","00000000","00000000","00000000","00000000","00011000","00011000"],"·":["00000000","00000000","00000000","00000000","00011000","00011000","00000000","00000000","00000000"],"+":["00000000","00011000","00011000","00011000","11111111","00011000","00011000","00011000","00000000"],"-":["00000000","00000000","00000000","00000000","01111110","00000000","00000000","00000000","00000000"],"×":["00000000","11000011","01100110","00111100","00011000","00111100","01100110","11000011","00000000"],"←":["00000000","00010000","00110000","01111111","11111111","01111111","00110000","00010000","00000000"],"→":["00000000","00001000","00001100","11111110","11111111","11111110","00001100","00001000","00000000"],"/":["00000011","00000110","00000110","00001100","00011000","00110000","01100000","01100000","11000000"]}
;
const A = '../../public/images/';
const chapterTitles = ['Туманный берег', 'Дальний берег', 'Терновые топи', 'Пепельные утёсы', 'Кладбище кораблей', 'Затмение Авалона', 'Последний рассвет'];
const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const openingNights = ['Первый свет', 'Дальний берег', 'Шёпот тростника', 'За проломом', 'Звон над фарватером', 'Первое отражение', 'Сигнал в разломе'];
const bossNights = ['Страж глубин', 'Затонувший капитан', 'Сердце топи', 'Пепельный колосс', 'Вечерний звон', 'Падший хранитель', 'Сердце тумана'];
const nightCounts = [6, 7, 8, 8, 9, 9, 9];
const waveCounts = [4, 5, 5, 6, 6, 7, 8];

const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const glyphPaths = Object.fromEntries(Object.entries(GLYPHS).map(([char, rows]) =>
  [char, rows.flatMap((row, y) => [...row].map((dot, x) => dot === '1' ? `M${x} ${y}h1v1h-1z` : '')).join('')]));
glyphPaths['Й'] = glyphPaths['И'] + 'M2 -3h1v1h2v-1h1v2H2z';
glyphPaths['Ё'] = glyphPaths['Е'] + 'M2 -2h1v1H2zM5 -2h1v1H5z';
glyphPaths[':'] = 'M3 2h2v2H3zM3 6h2v2H3z';
glyphPaths['?'] = 'M1 1h1V0h4v1h1v3H6v1H5v1H3V4h2V3h1V2H5V1H3v1H1zM3 8h2v1H3z';
const px = (value, cls = '') => {
  const words = String(value).toUpperCase().split(' ');
  const visual = words.map(word => `<span class="pixel-word">${[...word].map(char => glyphPaths[char] ?
    `<svg viewBox="0 -3 8 12" aria-hidden="true"><path d="${glyphPaths[char]}"/></svg>` : `<span class="pixel-symbol">${escape(char)}</span>`).join('')}</span>`).join('');
  return `<span class="pixel ${cls}"><span class="sr-only">${escape(value)}</span><span class="pixel-drawing" aria-hidden="true">${visual}</span></span>`;
};
const img = (path, cls = '') => `<img class="${cls}" src="${A}${path}" alt="">`;
const sprite = (name, cls = '') => `<img class="${cls}" src="assets/${name}.png" alt="">`;
const icon = name => img('preparation/ui/' + name + '.png', 'icon');
const button = (label, kind = '', picture = '', detail = '') => `<button type="button" class="stone ${kind}" ${kind.includes('disabled') ? 'disabled' : ''} ${kind.includes('selected') ? 'aria-pressed="true"' : ''}>${picture ? icon(picture) : ''}<span class="button-copy">${px(label)}${detail ? `<small>${detail}</small>` : ''}</span></button>`;
const heading = name => `<h1>${px(name)}</h1>`;
const subhead = name => `<h2>${px(name)}</h2>`;
const tag = (label, state = '') => `<span class="tag ${state}">${label}</span>`;
const art = (number, cls = '') => img('campaign/chapter-' + number + '.webp', cls);
const actions = (...items) => `<div class="actions">${items.join('')}</div>`;
const line = (name, value) => `<div class="line"><span>${name}</span><b>${value}</b></div>`;
const notice = (content, kind = '') => `<div class="notice ${kind}">${content}</div>`;
const card = (name, content, kind = '', picture = '') => `<article class="card ${kind}">${picture}<div class="card-copy"><h3>${px(name)}</h3>${content}</div></article>`;
const backdrop = () => '<div class="night-bg"><i class="moon-sprite"></i><i class="lantern-glow"></i></div>';
const scenePage = (content, kind = '') => `${backdrop()}<div class="scene-page ${kind}">${content}</div>`;
const panel = (name, content, options = {}) => `<section class="panel frame ${options.kind ?? ''}"><header class="panel-head"><div>${options.context ? `<span class="eyebrow">${options.context}</span>` : ''}${heading(name)}</div>${button(options.back ?? 'Закрыть', 'small neutral')}</header><div class="panel-scroll">${content}</div>${options.footer ? `<footer>${options.footer}</footer>` : ''}</section>`;
const modal = (name, body, controls, style = '') => `<div class="veil"></div><section class="modal frame ${style}">${heading(name)}${body}${controls}</section>`;
const mainMenu = () => `${backdrop()}<div class="menu-scene"><div class="logo" role="img" aria-label="Свет Авалона"></div><div class="menu-actions">${button('Играть', 'primary')}${button('Настройки')}</div></div>`;
const gameMenu = (orientation, empty = false, trials = false) => {
  const mode = orientation === 'portrait' ? 'mobile' : 'desktop';
  const monolith = (name, label, state, description) => `<button class="monolith ${name} ${state}" type="button" ${state === 'locked' ? 'disabled' : ''} style="--monolith:url('${A}game-menu/${name}-${mode}.png')"><span>${px(label)}<small>${description}</small></span></button>`;
  return `${backdrop()}<div class="game-menu">${button('Назад', 'small menu-back')}<h1 class="sr-only">Выбор игры</h1>${img('game-menu/floor-' + mode + '.png', 'game-floor')}<div class="monoliths">${monolith('continue', 'Продолжить', empty ? 'locked' : 'current', empty ? 'Сохранения пока нет' : 'Глава I · Ночь 2 · Разбитый берег')}${monolith('trials', 'Испытания', trials ? 'current' : 'locked', trials ? 'Отдельные задачи' : 'Недоступны в кампании')}${monolith('new-game', 'Новая игра', empty ? 'current' : '', 'Глава I · Первый свет')}</div></div>`;
};
const startup = problem => `${backdrop()}${modal(problem === 'read' ? 'Профиль не прочитан' : 'Профиль занят',
  `<p>${problem === 'read' ? 'Не удалось прочитать сохранение на этом устройстве. Повторите загрузку профиля.' : 'Игра открыта в другой вкладке. Закройте её и повторите загрузку.'}</p>`,
  actions(button('Повторить загрузку', 'primary')), 'service')}`;
const reset = orientation => `${gameMenu(orientation)}${modal('Начать новую игру?', '<p>Текущее прохождение, ресурсы и улучшения будут удалены. Настройки сохранятся.</p>', actions(button('Отмена', 'primary'), button('Начать заново', 'danger')), 'confirmation')}`;

const segment = (name, choices, selected = 0) => `<section class="setting-group"><h2>${px(name)}</h2><div class="segments">${choices.map((entry, index) => button(entry, index === selected ? 'selected small' : 'small')).join('')}</div></section>`;
const slider = (label, value) => `<section class="setting-group volume"><div>${subhead(label)}<strong>${value}%</strong></div><div class="slider" style="--value:${value}%"><i></i></div></section>`;
const settings = (paused = false, error = false) => {
  const surface = `<section class="settings-sheet frame"><header class="panel-head"><div>${paused ? '<span class="eyebrow">Ночь на паузе</span>' : ''}${heading('Настройки')}</div></header><div class="settings-columns panel-scroll"><div>${segment('Звук', ['Вкл', 'Выкл'])}${slider('Музыка', 50)}${slider('Эффекты', 70)}</div><div>${segment('Язык', ['Авто', 'Русский', 'English'], 1)}${segment('Текст', ['Обычный', 'Крупный'])}${error ? notice('<strong>Не удалось сохранить настройки</strong><p>Попробуйте ещё раз или верните прежние значения.</p>', 'danger') : ''}</div></div><footer>${error ? actions(button('Повторить сохранение', 'primary'), button('Отменить изменения')) : button(paused ? 'К паузе' : 'Назад', 'primary')}</footer></section>`;
  return paused ? battle(1, 'pause-settings', `<div class="veil"></div><div class="scene-page settings-page">${surface}</div>`) : scenePage(surface, 'settings-page');
};

const stage = (number, content = '', type = '') => `<div class="field chapter-${number} ${type}" style="--field-wide:url('assets/chapter-field-${number}.png');--field-portrait:url('assets/chapter-field-${number}-portrait.png')">${content}</div>`;
const counter = (label, value, picture) => `<button class="stone small currency-control" type="button" aria-label="${label}, ${value}. Пополнение">${icon(picture)}${px(value + ' +')}</button>`;
const prepTop = (n, name, trial = false) => `<div class="prep-top">${button('Назад', 'small neutral back')}${button(name, 'night-choice', '', trial ? 'Книга испытаний' : 'Глава ' + roman[n - 1] + ' · ' + chapterTitles[n - 1] + ' ▾')}${counter('Осколки', n === 1 ? 0 : 186, 'shard')}${counter('Жемчужины', n === 1 ? 0 : 2, 'pearl')}<div class="prep-utility">${button('Улучшения', 'small', 'upgrades')}${button('Разведка', 'small', 'recon')}</div></div>`;
const prepBottom = (state, n) => `<div class="prep-bottom">${button('Устройства', 'device-count', 'devices', state ? '1 на поле · 0 в запасе' : '0 на поле · 0 в запасе')}${button('Базовая', 'small loadout', 'lens', 'Линза')}${button(n > 2 ? 'Печать' : 'Пусто', 'small loadout', 'flash', 'Способность')}${button('Начать ночь', state === 'placement' || state === 'invalid' ? 'primary disabled' : 'primary')}${!state ? '' : '<span class="sr-only">Состояние расстановки</span>'}</div>`;
const meter = (value, kind = '') => `<div class="meter ${kind}" style="--value:${value}%"><i></i></div>`;
const worldDevice = (type, x, y, kind = '') => `<div class="world-device world-pin ${kind}" style="--x:${x}%;--y:${y}%">${sprite('device-' + type)}${kind.includes('target') ? '<span class="target-brackets"></span>' : ''}</div>`;
const prep = (n = 1, overlay = '', state = '', trial = false) => {
  let extra = '';
  let scene = '';
  if (state === 'placement') {
    scene = worldDevice('cannon', 49, 61, 'placing target');
    extra = `<div class="field-notice">${notice('<strong>Пушка №1 · можно установить</strong><p>Нажмите на выделенный участок суши.</p>', 'good')}${button('Отменить расстановку', 'small')}</div>`;
  }
  if (state === 'inspect' || state === 'invalid') {
    scene = worldDevice('cannon', state === 'invalid' ? 63 : 49, 61, state === 'invalid' ? 'target invalid' : 'target');
    extra = `<div class="field-notice"><section class="command frame ${state === 'invalid' ? 'alert' : ''}">${subhead('Пушка №1')}<p>${state === 'invalid' ? 'Позиция вне суши. Переставьте пушку или верните её в запас.' : 'Прочность 42 / 70 · На поле'}</p>${actions(button('Переставить', 'primary small'), button('В запас', 'small'), button('Ремонт и заряды', 'small'), button('Закрыть', 'small'))}</section></div>`;
  }
  const mapTools = `<div class="prep-field-tools"><div class="field-legend"><b>Волн: ${trial ? 4 : waveCounts[n - 1]}</b><span><i></i> Свет маяка</span><span><i></i> Выход из тумана</span></div><div class="map-links">${button('План', 'small', 'zoom')}${button('Коллекция', 'small')}</div></div>`;
  return `<div class="prep-stage">${prepTop(n, trial ? 'Сигнал бедствия' : openingNights[n - 1], trial)}${stage(n, mapTools + scene + extra, 'preparation-field')}${prepBottom(state, n)}</div>${overlay ? `<div class="drawer-wrap">${overlay}</div>` : ''}`;
};
const drawer = (title, content, footer = '') => panel(title, content, { kind: 'drawer', footer });
const supplyCards = () => {
  const stock = card('Пушка №1', `<p>В запасе · Прочность 70 / 70</p>${actions(button('Расставить', 'primary small'))}`, 'selected-card with-icon', sprite('device-cannon', 'card-icon'));
  const trap = card('Световая ловушка №2', `<p>На поле · Прочность 22 / 30 · Заряды 0 / 1</p>${actions(button('Ремонт · 2 ◈', 'small'), button('Перезарядить · 2 ◈', 'small'), button('В запас', 'small'))}`, 'with-icon', icon('flash'));
  const catalog = ['Пушка', 'Гарпунная башня', 'Мортира', 'Колокол сдерживания', 'Ремонтный фонарь', 'Наземный барьер', 'Генератор', 'Световая ловушка'];
  return `${subhead('Мои устройства')}${stock}${trap}${subhead('Каталог типов')}<div class="card-grid two">${catalog.map((name, i) => card(name, i === 0 ? '<p>В запасе готово: 1 · На поле: 0 / 2</p>' + button('Купить · 20 ◈', 'small') : i === 7 ? '<p>В запасе готово: 0 · На поле: 1 / 2</p>' + button('Купить · 16 ◈', 'small') : '<p>Откройте тип в развитии.</p>' + button('Закрыто', 'small disabled'), i && i !== 7 ? 'locked-card' : '')).join('')}</div>`;
};
const recon = (trial = false) => drawer('Разведка', `${notice('<strong>' + (trial ? 'Сигнал бедствия' : 'Первый свет') + '</strong><p>' + (trial ? 'Освещайте корабль 6 секунд до истечения срока.' : 'Поворачивайте луч заранее. Броня черепахи сохраняет повреждения после переключения.') + '</p>')}${subhead('Маяк')}${line('Прочность', '120 HP')}${line('Урон луча', '30 / с')}${line('Цели в луче', 'до 2')}${trial ? subhead('Торговый корабль') + line('Провести светом', '6 с из 24 с') + line('Спасение', '+12 ◈') : ''}${subhead('Волны')}${[1, 2, 3, 4].map(n => line('Волна ' + n, trial ? '8 существ' : '10 существ · Север и юг')).join('')}`);
const lenses = () => drawer('Линза', `<p class="muted">Одна линза на ночь. Выбор сохраняется сразу.</p><div class="choice-list">${[
  ['Базовая', 'Ровный свет · до 2 целей'], ['Расширенная', 'Шире сектор · до 3 целей'], ['Замедляющая', 'Медленнее движение в свете'], ['Противоброневая', 'Узкий сектор · больше урона броне'],
  ['Фокусирующая', 'Бонус за непрерывный свет'], ['Тлеющая', 'Остаточное горение'], ['Резонансная', 'Бонус за 2 цели'], ['Дальнобойная', 'Больше дальность · уже луч']
].map(([name, description], i) => button(name, i === 0 ? 'selected' : i === 1 ? '' : 'disabled', 'lens', (i === 0 ? 'Выбрана · ' : i > 1 ? 'Закрыта · ' : '') + description)).join('')}</div>`);
const ability = () => drawer('Способность', `<div class="choice-list">${[
  ['Без способности', '', ''], ['Вспышка', 'Оглушает врагов рядом с маяком', ''], ['Перегрузка света', 'Усиливает и ускоряет луч', ''],
  ['Печать сдерживания', 'Замедляет существ в выбранной области', 'selected'], ['Орудийный залп', 'Приказывает орудиям ударить по цели', 'disabled'], ['Бастион Авалона', 'Снижает входящий урон', 'disabled']
].map(([name, text, status], i) => button(name, status, i ? 'flash' : '', (status === 'selected' ? 'Выбрана · ' : status === 'disabled' ? 'Закрыта · ' : '') + text)).join('')}</div>`);
const currency = (pearl = false, test = false) => drawer(pearl ? 'Жемчужины' : 'Осколки', `<div class="currency-callout">${icon(pearl ? 'pearl' : 'shard')}<strong>${pearl ? 'Жемчуг глубин' : 'Осколки'}</strong></div>${notice(test ? '<strong>Тестовое предложение ожидает подтверждения</strong><p>+1 жемчужина · осталось 1 из 1 за 24 ч.</p>' : pearl ? '<strong>Доступ после победы над Стражем глубин</strong><p>Жемчуг выдаётся за первую полную победу над боссом.</p>' : '<strong>Видео сейчас недоступно</strong><p>Осколки можно получить за существ и победы в ночах.</p>')}${test ? actions(button('Имитировать подтверждение', 'primary small'), button('Имитировать отсутствие видео', 'small'), button('Отменить предложение', 'small')) : ''}`);


const bookNightNames = [
  ['Первый свет', 'Разбитый берег', 'Крылатый прилив', 'Обратный прилив', 'Огни на отмели', 'Страж глубин'],
  ['Дальний берег', 'Следы на косе', 'Крыло над водой', 'Щиты у косы', 'Два огня', 'Последняя отмель', 'Затонувший капитан'],
  ['Шёпот тростника', 'Корни на тропе', 'Выводок', 'Сухие тропы', 'Чёрная заводь', 'Глухой обход', 'Ведьмин круг', 'Сердце топи'],
  ['За проломом', 'Обвал', 'Осадный обоз', 'Дальний выстрел', 'Каменная гряда', 'Раскалённый ветер', 'Последняя осада', 'Пепельный колосс'],
  ['Звон над фарватером', 'На абордаж', 'Горящие обломки', 'Погоня за сиреной', 'Тесная гавань', 'Шторм над мачтами', 'Якорная цепь', 'Ход мёртвых судов', 'Вечерний звон'],
  ['Первое отражение', 'У погасшей башни', 'Двое ворот', 'Разбитые зеркала', 'Третья башня', 'Тёмный караул', 'Кольцо руин', 'Перед затмением', 'Падший хранитель'],
  ['Сигнал в разломе', 'Возвращение прилива', 'Два мыса', 'Час осадников', 'Остатки флота', 'Вторая тень', 'Два предупреждения', 'До последнего огня', 'Сердце тумана']
];
const firstNightArt = ['first-light', 'broken-shore', 'winged-tide', 'cross-current', 'sky-siege', 'abyss-warden'];
const bookImage = file => img('chronicle/book/' + file + '.png', 'night-art');
const chapterEntry = (name, i) => `<button class="chapter-entry ${i === 0 ? 'chosen' : ''}" type="button"><b>${roman[i]}</b><span>${px(name)}<small>${i === 0 ? 'Выбрана · 1 из 6 пройдена' : 'Закрыта · победите в главе ' + roman[i - 1]}</small></span></button>`;
const nightEntry = (name, index, n, selected, passed, trial) => {
  const isBoss = !trial && index === nightCounts[n - 1] - 1;
  const locked = index > passed;
  const picture = trial ? bookImage('rescue-trial') : n === 1 ? bookImage(firstNightArt[index]) : art(n, 'night-art generic-art');
  const emblem = isBoss && n !== 1 ? atlas('boss', n - 2, 'night-emblem') : '';
  const state = locked ? 'Закрыта' : index < passed ? 'Пройдена · можно повторить' : 'Доступна';
  return `<article class="night-card ${selected ? 'chosen' : ''} ${locked ? 'locked' : ''}"><button type="button" ${locked ? 'disabled' : ''} aria-pressed="${selected}"><div class="night-picture">${picture}${emblem}</div><span class="night-title">${px(name)}</span><small>${selected ? '◆ Выбрана' : index < passed ? '✓ ' + state : locked ? '× ' + state : state}</small>${locked ? `<small>После победы в ночи ${index}</small>` : ''}</button></article>`;
};
const book = (mode = 'nights', n = 1, page = 1) => {
  const trial = mode === 'trials';
  const contents = mode === 'contents';
  const passed = mode === 'locked' ? -1 : mode === 'progress' ? 1 : n === 7 ? 8 : 0;
  const selected= trial ? 0 : passed;
  const nights = trial ? ['Сигнал бедствия'] : bookNightNames[n - 1];
  const title = trial ? 'Сигнал бедствия' : chapterTitles[n - 1];
  const featureImage = trial ? bookImage('rescue-trial-feature-wide') : art(n, 'chapter-image');
  const context = trial ? 'Книга испытаний' : 'Глава ' + roman[n - 1];
  const pagination = trial || contents ? '' : `<nav class="book-pagination" aria-label="Листы Хроники"><button type="button" ${page === 1 ? 'disabled' : ''} aria-label="Предыдущий лист">‹</button><span>Лист ${page} из ${Math.ceil(nights.length / 4)}</span><button type="button" ${page * 4 >= nights.length ? 'disabled' : ''} aria-label="Следующий лист">›</button></nav>`;
  const right = contents ? `${subhead('Оглавление')}<div class="chapter-list">${chapterTitles.map(chapterEntry).join('')}</div>` :
    `${subhead(trial ? 'Испытания' : 'Ночи главы')}<div class="book-nights">${nights.slice((page - 1) * 4, page * 4).map((name, i) => {
      const index = (page - 1) * 4 + i;
      return nightEntry(name, index, n, index === selected, passed, trial);
    }).join('')}</div>${pagination}`;
  return `${backdrop()}<div class="book ${mode}"><div class="book-spread"><div class="book-feature"><span class="eyebrow">${context}</span>${heading(title)}${featureImage}${trial ? '<p>Помогите кораблю светом. Удерживайте курс, пока он проходит сквозь туман.</p>' : mode === 'locked' ? '<p>Откроется после победы над Стражем глубин.</p>' : button('Смотреть вступление', 'small')}</div><div class="book-right">${right}</div></div><footer class="book-footer">${button('Назад', 'small')}${!trial ? button(contents ? 'Ночи главы' : 'Оглавление', 'small neutral') : ''}${button('К подготовке', 'small primary' + (mode === 'locked' ? ' disabled' : ''))}</footer></div>`;
};
const story = (replay = false) => scenePage(`<article class="story frame">${art(1, 'story-image')}<div class="story-copy"><span class="eyebrow">Глава I · Запись смотрителя</span>${heading('Туманный берег')}<p>Я зажёг маяк в ответ на огни за каменным причалом. К берегу уже тянулись твари из тумана. У самой кромки света я увидел щупальце Стража глубин.</p>${replay ? actions(button('К Хронике', 'primary')) : actions(button('Продолжить', 'primary'), button('Пропустить вступление', 'small'))}</div></article>`, 'story-page');

const filters = (active, list) => `<div class="filters">${list.map(label => button(label, 'small' + (active === label ? ' selected' : ''))).join('')}</div>`;
const development = (empty = false) => {
  const family = ['Все', 'Доступные', 'Маяк', 'Устройства', 'Линзы', 'Способности'];
  const branch = `<div class="upgrade-branch"><h2>${px('Луч маяка')}</h2>${button('Мощность I', 'selected', 'upgrades', 'Выбрано · доступно')}${button('Мощность II', 'disabled', '', 'Нужно улучшение I')}${button('Ширина I', '', '', 'Доступно')}${button('Привод I', '', '', 'Куплено')}${button('Срыв подготовки I', 'disabled', '', 'Откроется в следующих главах')}</div>`;
  const details = `<article class="upgrade-detail"><span class="eyebrow">Маяк · Луч</span>${subhead('Мощность I')}${tag('Можно купить', 'good')}<p>Усиливает прямой урон по всем доступным целям в свете.</p><div class="comparison"><div><small>Сейчас</small><strong>30</strong></div><span>→</span><div><small>После покупки</small><strong>36</strong></div><small>урона в секунду</small></div>${line('Требования', 'Нет')}${line('Цена', '45 ◈')}${actions(button('Купить · 45', 'primary', 'shard'))}</article>`;
  return scenePage(panel('Развитие кампании', `${filters(empty ? 'Доступные' : 'Маяк', family)}${empty ?
    `<div class="empty-state">${icon('upgrades')}${subhead('Доступных покупок пока нет')}<p>Завершите ночь и соберите осколки для первых улучшений.</p>${button('Все улучшения', 'primary')}</div>` :
    `<div class="development-layout">${branch}${details}</div>`}`, { back: 'Назад', context: empty ? '0 ◈ · 0 ◎ · 0 / 256' : '186 ◈ · 2 ◎ · 8 / 256', kind: 'development-panel' }));
};
const rewardRows = [
  ['Осадная пушка', 'Осадный обоз', 'Урон +25%, интервал между выстрелами +25%.', 'claim', 'weapon'],
  ['Дальний гарпун', 'Раскалённый ветер', 'Дальность +15%, урон −15%.', 'locked', 'harpoon'],
  ['Лунный луч', 'Сердце топи', 'Серебристо-голубой свет.', 'equipped', 'lens'],
  ['Бронзовые устройства', 'Вечерний звон', 'Бронзовая отделка устройств.', 'equip', 'devices'],
  ['Маяк рассвета', 'Сердце тумана', 'Медно-золотая отделка башни.', 'locked', 'tower']
];
const rewardControl = state => state === 'claim' ? button('Забрать награду', 'primary small') :
  state === 'equipped' ? button('Применён', 'selected small') :
  state === 'equip' ? button('Применить', 'small') : tag('× Закрыто', 'locked');
const collection = () => scenePage(panel('Коллекция', `<div class="collection-grid">${rewardRows.map(([name, night, detail, state, picture]) => {
  const image = picture === 'weapon' ? sprite('device-cannon', 'reward-sprite') : picture === 'tower' ? img('preparation/world/lighthouse-main.png', 'reward-sprite') : icon(picture === 'harpoon' ? 'devices' : picture);
  return card(name, `<p>${detail}</p><small class="muted">Условие: победа в ночи «${night}»</small><div class="reward-control">${rewardControl(state)}</div>`, 'reward-card ' + (state === 'claim' ? 'selected-card' : state === 'locked' ? 'locked-card' : ''), image);
}).join('')}</div>`, { back: 'Назад', kind: 'collection-panel' }));

const atlas = (type, slot, cls = '') => `<span class="atlas atlas-${type} ${cls}" style="--col:${slot % 4};--row:${Math.floor(slot / 4)}"></span>`;
const position = (x, y) => `--x:${x}%;--y:${y}%`;
const enemy = (asset, x, y, hp, flags = '', caption = '', armor = 0) => `<div class="world-pin enemy ${flags}" style="${position(x,y)}">
  <div class="enemy-bars">${meter(hp, 'hostile')}${armor ? meter(armor, 'armor') : ''}</div>${typeof asset === 'number' ? atlas('enemy', asset) : sprite('foe-' + asset)}
  ${flags.includes('target') ? '<span class="target-brackets"></span>' : ''}${caption ? `<span class="pin-label">${caption}</span>` : ''}</div>`;
const bossPart = (part, slot, x, y, hp, state = '', atlasType = 'boss') => `<div class="world-pin boss-part ${state}" style="${position(x,y)}">${hp ? meter(hp, 'hostile') : ''}${atlas(atlasType, slot)}<span class="pin-label">${part}${state.includes('blocked') ? '<b>× Перекрыт</b>' : ''}</span></div>`;
const warning = (label, x, y) => `<div class="world-pin strike-zone" style="${position(x,y)}"><span class="pin-label">${label}</span></div>`;
const bossData = {
  2: { max: 660, hp: 520, phases: 2, parts: [['Капитан', 0, 63, 57, 0], ['Сигнал · призыв', 0, 59, 31, 84, 'warning'], ['Штандарт', 0, 59, 72, 48]], warning: 'Призыв · 3 с', zone: [76, 30], enemy: 0 },
  3: { max: 820, hp: 505, phases: 2, parts: [['Сердце', 1, 35, 54, 0], ['Корень · подавление', 1, 40, 29, 64, 'warning'], ['Корень', 1, 40, 70, 40]], warning: 'Подавление · 4 с', zone: [51, 52], enemy: 3 },
  4: { max: 1040, hp: 712, phases: 2, parts: [['Ядро', 2, 39, 57, 0], ['Молот', 7, 43, 29, 43], ['Горн · залп', 2, 39, 73, 62, 'warning furnace']], warning: 'Залп · 3 с', zone: [56, 50], enemy: 6 },
  5: { max: 1240, hp: 905, phases: 2, parts: [['Корпус', 3, 65, 52, 0], ['Орудие · залп', 6, 62, 31, 68, 'warning'], ['Орудие', 6, 58, 68, 42]], warning: 'Залп · 2 с', zone: [48, 65], enemy: 10 },
  6: { max: 1410, hp: 1056, phases: 3, parts: [['Ядро · защита', 4, 64, 53, 0], ['Клинок · удар', 7, 42, 29, 54, 'warning'], ['Клинок', 7, 40, 72, 77]], warning: 'Удар · 3 с', zone: [44, 52], enemy: 12 },
  7: { max: 1740, hp: 1214, phases: 3, parts: [['Сердце', 5, 66, 58, 0], ['Разлом · призыв', 5, 62, 31, 65, 'warning rift blocked'], ['Корень', 1, 39, 34, 84], ['Орудие', 6, 59, 71, 42]], warning: 'Призыв · 2 с', zone: [75, 22], enemy: 0 }
};
const bossScene = n => {
  const config = bossData[n];
  return `${config.parts.map(part => bossPart(...part)).join('')}${warning(config.warning, ...config.zone)}${n === 7 ? enemy(config.enemy, 56, 30, 68, 'lit shield-blocker', '', 54) : enemy(config.enemy, n === 4 || n === 3 ? 62 : 41, 77, 68, 'ordinary')}${enemy('ghost', n === 4 || n === 3 ? 67 : 49, 68, 42)}`;
};
const battleHud = (n, mode, boss) => {
  const waves = mode === 'ship' ? 4 : mode === 'warden' ? 4 : n === 7 ? 8 : n === 6 ? 7 : n >= 4 ? 6 : waveCounts[n - 1];
  const name = boss || mode === 'warden' ? bossNights[n - 1] : mode === 'ship' ? 'Сигнал бедствия' : mode === 'ability-aim' ? 'Шёпот тростника' : openingNights[n - 1];
  const status = mode === 'ship' ? 'Волна 1 / 4 · Отбито 0' : `Волна 2 / ${waves} · Отбито 1`;
  return `<header class="battle-top"><div class="battle-health">${img('preparation/world/lighthouse-main.png', 'beacon-icon')}<div><div class="health-label">${px('Маяк')}<strong>96 / 120</strong></div>${meter(80)}</div></div><div class="battle-night">${px(name)}<small>${status}</small></div><span class="battle-clock">${px(mode === 'ship' ? '00:13' : '00:48')}</span><button class="pause-control stone small" type="button" aria-label="Пауза"><b>Ⅱ</b></button></header>
  ${boss || mode === 'warden' ? `<div class="boss-strip"><b>Фаза 1 / ${boss?.phases ?? 2}</b>${meter(boss ? boss.hp / boss.max * 100 : 70, 'boss')}${boss ? `<span>${boss.hp} / ${boss.max} HP</span>` : '<span>294 / 420 HP</span>'}</div>` : ''}`;
};
const battleFooter = (mode, n) => {
  const state = mode === 'ability-aim' ? ['Печать', 'Выберите цель', 'selected'] : mode === 'cooldown' ? ['Печать', 'Перезарядка · 00:17', 'disabled'] :
    n > 2 ? ['Печать', 'Готова', ''] : ['Без способности', 'Пустой слот', 'disabled'];
  return `<footer class="battle-bottom"><div class="battle-equipment">${icon('lens')}<div>${px('Базовая')}<small>В свете 1 / 2</small></div></div>${button(state[0], state[2] + ' ability-control', 'flash', state[1])}${button('Вызвать волну', 'wave-control', '', 'Через 00:12 · бонус после отбоя')}</footer>`;
};
const battle = (n = 1, mode = '', overlay = '') => {
  const config = mode === 'boss' ? bossData[n] : undefined;
  const support = mode === 'shield' ? '<div class="objective shield"><strong>Поле истощено</strong><small>Восстановление через 4 с</small></div>' :
    mode === 'ship' ? '<div class="objective ship"><strong>Торговец · 4 / 6 с в луче</strong><small>До потери сигнала 00:11</small></div>' : '';
  const briefing = mode === 'help' ? `<section class="brief command frame">${subhead('Сведения о бое')}<p>Подводите свет к следующей угрозе заранее.</p><div class="battle-legend"><span class="legend-hp">Здоровье</span><span class="legend-armor">Броня</span><span class="legend-light">Получает урон</span><span class="legend-stun">Оглушено</span></div>${button('Закрыть', 'small')}</section>` : '';
  const aim = mode === 'device-command' || mode === 'ability-aim';
  const command = mode === 'device-panel' ? `<section class="battle-command command frame">${subhead('Устройства на берегу')}<p><b>Пушка №1</b> · готова</p>${actions(button('Выбрать цель', 'primary small'), button('Закрыть', 'small'))}</section>` :
    aim ? `<section class="battle-command command frame targeting">${subhead(mode === 'ability-aim' ? 'Печать' : 'Пушка №1')}<p>Выберите цель. Направление луча сохранится.</p>${button('Отменить прицеливание', 'small')}</section>` : '';
  const base = mode === 'ship' ? `<div class="world-pin merchant" style="${position(62,55)}"><i></i><span class="pin-label">Торговец</span></div>${enemy('turtle', 42, 67, 58, '', '', 71)}` :
    mode === 'warden' ? `${bossPart('Страж', 0, 67, 55, 0, '', 'warden')}${bossPart('Щупальце · удар', 1, 60, 31, 68, 'warning', 'warden')}${bossPart('Замедлено светом', 1, 60, 72, 38, 'lit', 'warden')}${warning('Удар · 2 с', 55, 53)}${enemy('turtle', 44, 73, 61, '', '', 47)}` :
    config ? bossScene(n) : `${enemy(n === 3 ? 4 : 'turtle', 46, 41, 58, aim ? 'lit target' : 'lit', aim ? 'Выбранная цель' : 'В свете', 42)}${enemy('ghost', 42, 53, 32, 'obscured', aim ? '' : 'Перекрыт')}${enemy('ghost', 61, 69, 79)}${n === 3 ? enemy(3, 44, 62, 72) : ''}`;
  const devices = ['device-command', 'device-panel', 'shield'].includes(mode) ? worldDevice('cannon', 45, 59, aim ? 'target' : '') +
    (mode === 'shield' ? worldDevice('barrier', 42, 65) : '') : '';
  const field = `<div class="battle-beam"></div>${support}${base}${devices}${button('i', 'small info neutral', '', '')}${button('Устройства', 'small device-access neutral', 'devices')}${briefing}${command}`;
  return `<div class="battle-stage ${mode} battle-chapter-${n}">${battleHud(n, mode, config)}${stage(n, field, 'battle-field')}${battleFooter(mode, n)}</div>${overlay}`;
};
const pause = () => battle(1, '', modal('Тихая минута', '<p>Направление света сохранено.</p>', actions(button('Продолжить ночь', 'primary'), button('Настройки'), button('Прервать ночь', 'danger')), 'pause-dialog'));
const abandon = () => battle(1, '', modal('Прервать эту ночь?', '<p>Награды и новые встречи этой ночи будут потеряны. Устройства вернутся к состоянию перед стартом. Покупки и ремонт подготовки сохранятся.</p>',
  actions(button('Остаться в паузе', 'primary'), button('В подготовку', 'danger'), button('В главное меню', 'danger')), 'confirmation'));
const result = (mode = 'victory') => {
  const loss = mode === 'defeat', saveError = mode === 'save', epilogue = mode === 'epilogue', rescue = mode === 'rescue', prize = mode === 'reward';
  const title = epilogue ? 'Рассвет Авалона' : loss ? 'Свет погас' : 'До рассвета';
  const context = epilogue ? 'Сердце тумана · Глава VII' : rescue ? 'Сигнал бедствия · Итог' : prize ? 'Осадный обоз · Итог' : 'Первый свет · Итог';
  const copy = epilogue ? 'Туман отступил. Семь маяков встретили рассвет, и корабли снова видят путь домой.' :
    loss ? 'Маяк разрушен. Попробуй раньше переключаться между угрозами.' : rescue ? 'Маяк выстоял. Торговец прошёл сквозь туман.' : 'Маяк выстоял. Берег снова принадлежит тебе.';
  const totals = loss ? [24, 28, 3, 0, 0] : epilogue ? [80, 126, 5, 295, 160] : prize ? [54, 70, 3, 130, 70] : rescue ? [32, 39, 2, 64, 0] : [40, 48, 3, 45, 20];
  const [kills, enemyReward, early, victory, first] = totals;
  const ledger = `<div class="ledger">${line('Уничтожено', kills)}${line('За существ', '+' + enemyReward + ' ◈')}${line('За досрочные волны', '+' + early + ' ◈')}${rescue ? line('За спасение корабля', '+12 ◈') : ''}${victory ? line('За победу', '+' + victory + ' ◈') : ''}${first ? line('Первая победа', '+' + first + ' ◈') : ''}${epilogue ? line('Жемчуг глубин', '+4 ◎') : ''}</div>`;
  const status = saveError ? tag('! Не удалось сохранить итог', 'warning') : tag('✓ Результат сохранён', 'good');
  const control = saveError ? button('Повторить сохранение', 'primary') : epilogue || loss || rescue ? button('Подготовка к повтору', 'primary') : button('Следующая ночь', 'primary', '', prize ? 'Дальний выстрел' : 'Разбитый берег');
  return scenePage(`<section class="result frame ${mode}"><div class="result-layout panel-scroll"><div class="result-copy"><span class="eyebrow">${context}</span>${heading(title)}${epilogue ? img('campaign/epilogue.webp', 'epilogue-image') : ''}<p>${copy}</p>${saveError ? '<p class="result-error">Повторите запись, чтобы получить награды и продолжить.</p>' : ''}${prize ? notice('<strong>Осадная пушка</strong>' + button('Забрать награду', 'primary small')) : ''}</div><div><div class="result-total"><span>Итого</span><strong>+${enemyReward + early + victory + first + (rescue ? 12 : 0)} ◈</strong></div>${ledger}${status}</div></div><footer>${actions(control, button('Коллекция', 'small' + (saveError ? ' disabled' : '')), !loss && !epilogue && !rescue && !saveError ? button('К повтору', 'small') : '', saveError ? button('Перечитать сохранение', 'small') : button('Главное меню', 'small'))}</footer></section>`, 'result-page');
};

const make = (id, label, group, render) => ({ id, label, group, render });
const menu = 'Меню', bookGroup = 'Хроника', prepGroup = 'Подготовка', progress = 'Прогресс', fight = 'Бой', outcomes = 'Итоги', service = 'Служебные';
const defs = [
  make('startup', 'Профиль занят', service, () => startup('locked')),
  make('startup-read-error', 'Ошибка чтения профиля', service, () => startup('read')),
  make('menu', 'Главная', menu, mainMenu),
  make('game-menu', 'Выбор игры', menu, o => gameMenu(o)),
  make('game-menu-empty', 'Выбор игры · нет профиля', menu, o => gameMenu(o, true)),
  make('game-menu-trials', 'Выбор игры · испытания доступны', menu, o => gameMenu(o, false, true)),
  make('reset', 'Подтверждение новой игры', menu, reset),
  make('settings', 'Настройки', menu, () => settings()),
  make('settings-error', 'Настройки · ошибка записи', menu, () => settings(false, true)),
  make('story', 'Сюжетная запись', bookGroup, () => story()),
  make('story-replay', 'Повтор сюжета', bookGroup, () => story(true)),
  make('chronicle', 'Хроника · выбор ночи', bookGroup, () => book()),
  make('chronicle-progress', 'Хроника · пройденная и доступная ночи', bookGroup, () => book('progress')),
  make('chronicle-locked', 'Хроника · закрытая глава', bookGroup, () => book('locked', 2)),
  make('chronicle-contents', 'Оглавление Хроники', bookGroup, () => book('contents')),
  make('chronicle-final', 'Хроника · финальная ночь', bookGroup, () => book('nights', 7, 3)),
  make('trials', 'Книга испытаний · прототип', bookGroup, () => book('trials')),
  make('preparation', 'Подготовка · Туманный берег', prepGroup, () => prep()),
  ...chapterTitles.slice(1).map((label, i) => make('preparation-chapter-' + (i + 2), 'Подготовка · ' + label, prepGroup, () => prep(i + 2))),
  make('prep-placement', 'Расстановка · выбор позиции', prepGroup, () => prep(1, '', 'placement')),
  make('prep-device-inspector', 'Расстановка · выбранное устройство', prepGroup, () => prep(1, '', 'inspect')),
  make('prep-invalid', 'Расстановка · недопустимая позиция', prepGroup, () => prep(1, '', 'invalid')),
  make('devices', 'Устройства · ремонт и заряды', prepGroup, () => prep(3, drawer('Устройства', supplyCards()))),
  make('recon', 'Разведка', prepGroup, () => prep(1, recon())),
  make('recon-trial', 'Разведка · спасение торговца', prepGroup, () => prep(1, recon(true), '', true)),
  make('lens', 'Линза', prepGroup, () => prep(2, lenses())),
  make('ability', 'Способность', prepGroup, () => prep(3, ability())),
  make('currency', 'Пополнение · осколки', prepGroup, () => prep(1, currency())),
  make('currency-pearls', 'Пополнение · жемчужины', prepGroup, () => prep(1, currency(true))),
  make('currency-test', 'Пополнение · предложение тестового стенда', prepGroup, () => prep(2, currency(true, true))),
  make('development', 'Развитие · покупка', progress, () => development()),
  make('development-empty', 'Развитие · пустой фильтр', progress, () => development(true)),
  make('collection', 'Коллекция · получение и применение', progress, collection),
  make('battle', 'Бой · Туманный берег', fight, () => battle()),
  make('battle-help', 'Бой · справка', fight, () => battle(1, 'help')),
  make('battle-shield', 'Бой · истощённое поле', fight, () => battle(2, 'shield')),
  make('battle-ship', 'Бой · спасение торговца', fight, () => battle(1, 'ship')),
  make('device-panel', 'Бой · команды устройства', fight, () => battle(1, 'device-panel')),
  make('device-command', 'Бой · прицеливание устройства', fight, () => battle(1, 'device-command')),
  make('ability-aim', 'Бой · прицеливание Печати', fight, () => battle(3, 'ability-aim')),
  make('ability-cooldown', 'Бой · перезарядка Печати', fight, () => battle(3, 'cooldown')),
  make('boss-warden', 'Босс · Страж глубин', fight, () => battle(1, 'warden')),
  ...bossNights.slice(1,-1).map((label, i) => make('boss-chapter-' + (i + 2), 'Босс · ' + label, fight, () => battle(i + 2, 'boss'))),
  make('boss', 'Босс · Сердце тумана', fight, () => battle(7, 'boss')),
  make('pause', 'Пауза', fight, pause),
  make('pause-settings', 'Настройки из паузы', fight, () => settings(true)),
  make('abandon', 'Прерывание ночи', fight, abandon),
  make('result-victory', 'Победа', outcomes, () => result()),
  make('result-defeat', 'Поражение', outcomes, () => result('defeat')),
  make('result-save', 'Итог · ошибка сохранения', outcomes, () => result('save')),
  make('result-rescue', 'Итог · корабль спасён', outcomes, () => result('rescue')),
  make('result-reward', 'Итог · особая награда', outcomes, () => result('reward')),
  make('epilogue', 'Эпилог', outcomes, () => result('epilogue'))
];
window.avalonMockups = defs;
})();

