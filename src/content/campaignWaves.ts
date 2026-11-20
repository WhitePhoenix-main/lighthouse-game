import type { EnemyKind, WaveDefinition } from '../contracts';

const creatures: Readonly<Record<string, EnemyKind>> = {
  g: 'ghost', t: 'turtle', m: 'minotaur', b: 'bat',
  s: 'shieldbearer', c: 'scavenger', r: 'ray',
  w: 'witch', k: 'rootweaver', u: 'brood',
  o: 'siege-beast', l: 'golem', i: 'carrier',
  y: 'siren', a: 'boarder', p: 'bomber',
  n: 'mirror-knight', f: 'snuffer',
};

interface NightPlan {
  name: string;
  briefing: string;
  waves: string;
}

// A space separates waves. Uppercase sends the enemy along the other approach.
// Each row describes the full ordinary schedule, including a boss's independent waves.
const plans: readonly (readonly NightPlan[])[] = [
  [
    { name: 'Первый свет', briefing: 'Поворачивайте луч заранее. Броня черепахи сохраняет повреждения после переключения.', waves: 'ggTgggTggg GtgGgtgggg tgggTggGgg GgTgggTggg' },
    { name: 'Разбитый берег', briefing: 'Остановите готовящийся рывок и проверьте, где барьер выиграет время.', waves: 'ggmgtGgtg GtgMggTgg gtggmgTgg GgMgtggTg' },
    { name: 'Крылатый прилив', briefing: 'Летучие мыши атакуют устройства с воды. Пушка не достаёт летающих.', waves: 'gbgTgggBgt GggMgtgBgg gbgTgggmgt GgbgggBgTg' },
    { name: 'Обратный прилив', briefing: 'Переключайтесь между двумя подходами. Черепаха впереди может закрыть минотавра.', waves: 'tggMggGbgg GbgTggmGgg gggtMgBgTg TggbGgmggg' },
    { name: 'Огни на отмели', briefing: 'Проверьте вспышку и разнесите устройства по двум подходам.', waves: 'bggGmTgggg gGtGgbgmgg tGgGbggMtg gMgggTgbgg' },
    { name: 'Страж глубин', briefing: 'Срывайте атаки щупалец, пока с берега подходят наземные волны.', waves: 'ggTggBgg gMggTggg GgTgBgGg gggTgg' },
  ],
  [
    { name: 'Дальний берег', briefing: 'Генератор и гарпун доступны для покупки. Утопленник прикрывается щитом.', waves: 'ggSggggt tggGsGgg gsGgtggg TgGsGggg gSggGggg' },
    { name: 'Следы на косе', briefing: 'Падальщики быстро доходят с тыла. Поймайте их до смены фронта.', waves: 'gscgggG cGgtgsg ggcSggc TgCggst gsgcGgg' },
    { name: 'Крыло над водой', briefing: 'Гарпун держит ската и мышь над водой, пока луч работает по суше.', waves: 'ggrtgGg BrgGgsg ggRgCgt bgCgrsg gRgggSt' },
    { name: 'Щиты у косы', briefing: 'Щитоносец может закрыть быстрого падальщика на одном подходе.', waves: 'SGcggTg ggSGcgr scgGgTG GCsGgsg gscggRg' },
    { name: 'Два огня', briefing: 'Разведите огонь и поле по разным подходам.', waves: 'rgggMggs CggSrggg gRggcggs TgCggbgs gSgcggRg' },
    { name: 'Последняя отмель', briefing: 'Сначала скат, затем щиты и быстрая атака с другого направления.', waves: 'rggSggCg sGcgrgTg Rgggsgcg GcggMrgS TgBggcgg' },
    { name: 'Затонувший капитан', briefing: 'Сорванная команда сокращает подкрепление босса. Волны с берега всё равно придут.', waves: 'gsGggCg ggRggsg TgCgggr gSggrgC gggtGgg' },
  ],
  [
    { name: 'Шёпот тростника', briefing: 'Колокол может удержать группу. Ведьма лечит раненых рядом.', waves: 'gwggSggtg GgWggsgtg GggTggswg tgWgggSgg gwgSggcgg' },
    { name: 'Корни на тропе', briefing: 'Корнеплёт предупреждает, прежде чем связать устройство.', waves: 'gkggTggsg gTGgKggwg KgSggGCgg GTggkgWgg gSgKggcgg' },
    { name: 'Выводок', briefing: 'На месте погибшего выводка появляются призраки. Ловушка полезна на сухой тропе.', waves: 'guggctgsg GgUggsgWg UgTggCGgg gSgWggugT ggUgGkgsg' },
    { name: 'Сухие тропы', briefing: 'Используйте сухие обходы для перехвата. Острова пригодны для орудий.', waves: 'TggwGkggc gcgUggCsg UgTgGcgWg gRgkggSgu kgSggcGgt' },
    { name: 'Чёрная заводь', briefing: 'Отвлеките поддержку лучом, ловушкой или колоколом.', waves: 'kggWgRggs wgSggugCg ugCsgGGtg sGgKgTggu wggRggSkg' },
    { name: 'Глухой обход', briefing: 'Выводок прикрывает ведьму; оставьте оборону на второй тропе.', waves: 'ugSgWgCgg tggKggSgg WgUgCggsg sggTgkgRg gUgSggkgg' },
    { name: 'Ведьмин круг', briefing: 'Сравните широкий луч и Печать против поддержки с двух сторон.', waves: 'wgTgUgCgg gKgsggwgT UgCGgWggs sgkGgtgRg gWuGgSgKg' },
    { name: 'Сердце топи', briefing: 'Разбейте корни до подавления. Следите за ведьмами на сухих подходах.', waves: 'wggSggCgg ggKgguggg GgWggsgCg gUgGgtggg GkgSggggg' },
  ],
  [
    { name: 'За проломом', briefing: 'Дальнобойная линза и Залп доступны для покупки. Осадник предупреждает перед выстрелом.', waves: 'ggOggStgg gtgoggCgg gTgOggSgg stggogGgg ggSggOgTg gtgogggCg' },
    { name: 'Обвал', briefing: 'Голем распадается после гибели. Оставьте свет или орудие для мелких целей.', waves: 'gLggtgCgg tgggLsggg gglggGggO SgTgglggg lggTgggCg ggLggsgog' },
    { name: 'Осадный обоз', briefing: 'Носитель прикрывает голема и перелетает барьеры.', waves: 'gIggsglgg oGGtgIggg tggiglgCg ggOgGgSgi ggtgLggig TgIggOggg' },
    { name: 'Дальний выстрел', briefing: 'Перехватывайте осадников прежде, чем они закончат подготовку.', waves: 'ogSgglCgG tgOggCggg gggOglgIg GgLggoggg tgOgsgigg gggogcggT' },
    { name: 'Каменная гряда', briefing: 'Ломайте броню впереди или временно удерживайте подход мортирой.', waves: 'LgtgIgCgg OgGglggsg lggTgCigg gIgSlggog TggLgOggg lgsGogcgg' },
    { name: 'Раскалённый ветер', briefing: 'Атаки приходят с обоих краёв плато. Найдите время для поворота.', waves: 'iGgsgOgCg ggOgTgigg grgLgoggg iTggOggsg ggLggCgOg oggIggTgg' },
    { name: 'Последняя осада', briefing: 'Совместите дальний перехват и устройство, прикрывающее второй подход.', waves: 'oGggLgCgg iGgTgOgsg gLggOgCgg sggIgLggg ggOlggTgC ggOggIgsg' },
    { name: 'Пепельный колосс', briefing: 'Разрушение оружия Колосса отменяет его выстрелы. Осадники продолжают наступать.', waves: 'gOggLggsg TGgigGggg gggLggCgg ggOgsgGgg gIgGgTggg ggOggCggg' },
  ],
  [
    { name: 'Звон над фарватером', briefing: 'Сирена ускоряет ближайших существ. Ремонтный фонарь доступен в развитии.', waves: 'gygBGsgtgg gYggRggcgg bgGyggSggg GgCgRgYggg rggygGggsg ggYggGgtgg' },
    { name: 'На абордаж', briefing: 'Абордажники идут к устройствам. Укройте огневую позицию общим полем.', waves: 'AgtgRggSgg ggaggYggTg gGgYgaggRg gAggsGGggc bgYgaggTgg ggAggRggsg' },
    { name: 'Горящие обломки', briefing: 'Бомбардир показывает место удара. Разнесите уязвимые устройства.', waves: 'pggTagGggs GgyggPggbg gAgpggRgTg RgPyggGggs gggaggpGgg ggPggsgGyg' },
    { name: 'Погоня за сиреной', briefing: 'Уберите сирену, пока ускоренная группа ещё за берегом.', waves: 'YggAgggrgg gygGgagTgg GgYgCgpgTg aGrgyggSgg ggPggYggTg gYggGaRgsg' },
    { name: 'Тесная гавань', briefing: 'Пользуйтесь разнесёнными площадками, чтобы один залп не задел всю оборону.', waves: 'PgggAgsgyg ggaggPggTg RgGgPgyggs gpggGagTgg yggAggPgRg gTggaGgpyg' },
    { name: 'Шторм над мачтами', briefing: 'Смена направления проверяет связку гарпуна с лучом или мортирой.', waves: 'rgpggAggTg gYggRggasg AgGggpgygg gBrggYgAgg gPgGgagTgg ygsgAgRgpg' },
    { name: 'Якорная цепь', briefing: 'Оборона должна выдержать и ускоренную группу, и дальний обстрел.', waves: 'gygPgGaggg AgRggygTgg pgggSgYggg ggPggagGrg ggAggYggTg rgagGgPgyg' },
    { name: 'Ход мёртвых судов', briefing: 'Проверьте, когда выгоднее остановить выстрел, а когда ослабить отряд.', waves: 'pgAggyggRg ggYggPggTg agGgRgYggg ygAgPggGtg ggRgygaggP gPggYggAgg' },
    { name: 'Вечерний звон', briefing: 'Уничтожайте орудия корабля до залпа и держите подход со стороны причалов.', waves: 'gAgGggTygg RggYggsGgg ggPggagTgg ggAggRggGg gggYggCggg gggPggsGgg' },
  ],
  [
    { name: 'Первое отражение', briefing: 'Зеркальный рыцарь меняет защиту. Следите за его стойкой.', waves: 'gngtggCgGg ggNGgsgTgg NgTGgGggsg ggCggNgygg ggnGgRggTg gNgGGggsgg tGnggTgggg' },
    { name: 'У погасшей башни', briefing: 'Гаситель предупреждает перед остановкой орудия. Отбейте его или дождитесь восстановления.', waves: 'fgTggNggsg ggFggBggtg gnggfgCgSg NgGGggfggs gRggFgTggg ggngggFsgg fgGgnggTgg' },
    { name: 'Двое ворот', briefing: 'Начинайте поворот до того, как вторая группа зайдёт за опоры.', waves: 'ngCgfgGgTg GgfgNgTggg ggNgFgRggs ggfgCgNgTg fgggngggYg ggNgogFgsg ggYggfGgNg' },
    { name: 'Разбитые зеркала', briefing: 'Проверяйте, когда выгоднее луч, а когда подготовленный огонь устройств.', waves: 'NggtgNgggg fggNgTggRg gsGggnGfgG nGGtGgfgsg gFgngggTgg ggNggRgngg FgGgsggNgg' },
    { name: 'Третья башня', briefing: 'Гасители и бомбардиры требуют разных ответов. Держите запасной фронт.', waves: 'pgFggNggGg gnggPgfgsg gFgGgpgTgg gggPgNggfg NggfggygTg PggGgFgnGG gfggngRgpg' },
    { name: 'Тёмный караул', briefing: 'Рыцарь прикрывает других существ, пока вы ведёте луч по противоположной стороне.', waves: 'NgTggCgfgg ggFggnRggg iGGNgYggtg gNgFGggGgg ggogNgTgfg gRgfggnGgg tNGgpgfggg' },
    { name: 'Кольцо руин', briefing: 'Срывайте подавление и переводите огонь между двумя путями через руины.', waves: 'fGgNgCgygG gTggFgngsg YgNggfgGgg fggoggNgcg pgNGgFgTgg ggNgagFggg ogggfNgRgg' },
    { name: 'Перед затмением', briefing: 'Способность и вторая линия устройств дают время на позднее переключение.', waves: 'nGgfgPgRgG FgTgNgAgGg gyggFgpgNg pgNggfggYg NgkgRgfgTg fggNggogGg aGnfggPgTg' },
    { name: 'Падший хранитель', briefing: 'Следите за стойкой хранителя и стороной следующей атаки.', waves: 'fggNggCggg ggRggfggTg NgTgggCggg ggPggFggGg ggnggRgggg ygFggTgggg ggNggogggg' },
  ],
  [
    { name: 'Сигнал в разломе', briefing: 'Освободите один подход и оставьте орудия против волны с другого.', waves: 'ggTggNggRg gMgfgTggcg ggOgsgWgGg ggAgRggPgg kggUgCggtg ggFggLggYg gSggnGggpg rgogGgmggg' },
    { name: 'Возвращение прилива', briefing: 'Сирена на воде и ведьма на суше помогают разным группам.', waves: 'ygGgrggCgg kggWggtgsg ggYggPgAgg TgWggKgngg rGygfgCggg gUggtggWgg rggYgLggpg gfgWgRggTg' },
    { name: 'Два мыса', briefing: 'Смотрите на предупреждения у разлома, пока сухие подходы удерживают устройства.', waves: 'oGggPgAgfg gRgNgfggtg pgYgGRggsc gggKggWgOg gylGggkggT gggNgFggTg OgTggYggag gFgOgNggcg' },
    { name: 'Час осадников', briefing: 'Выбирайте между уничтожением дальнего осадника и срывом ближнего залпа.', waves: 'ogtggpgcgG ggOgTggagg ggsgIgpgGg gyggOgnRgg oggLgPgfgg GgOggTggag ggogGGyggT gOgFgggRgg' },
    { name: 'Остатки флота', briefing: 'Хорошая расстановка удержит часть угроз, пока луч занят на другом берегу.', waves: 'agPgRggFgg rgGgYgAggt ggTgNggpGg PgYggagGgg gfgOggRgyg ggAgpgSggg AgGgYgPggg gggRggPgag' },
    { name: 'Вторая тень', briefing: 'Сохраняйте ответ на подавление, если броня вынуждает удерживать луч.', waves: 'nGgfggPgTg ggNgfggCgg fgLggNggRg kgNggFggaG NgTgogfgGg gfggPgRgnG ggNggFgTgg fgYggWggNg' },
    { name: 'Два предупреждения', briefing: 'Сроки двух атак различаются. Начните с угрозы, которую ещё можно сорвать.', waves: 'pggNggOgfg fgSggKgRgg ggOggpgGsg aggFgNggpg ggOgYLgggg NgFggOgsgg gyggggPgfG FgGgOgNgpg' },
    { name: 'До последнего огня', briefing: 'Используйте знакомые ответы на броню, поддержку и быструю атаку.', waves: 'ggFggRggWg gOgGggkgyg GgSggPgfgG NgRggggLfg gYGgWggAgg NgpgRgOgTg ggFggKggyg AgPggNggog' },
    { name: 'Сердце тумана', briefing: 'Фазы повторяют знакомые угрозы. Доведите оборону до рассвета после гибели босса.', waves: 'gSggTgCggg ygGggRgggg gwgTggKggg gOggLggggT ggPggAgGgg fggNggCgGg ggRggogggg NggYggFgGg' },
  ],
];

const chapterTiming = [
  { waveInterval: 30, spawnInterval: 3.4, bossInterval: 30 },
  { waveInterval: 27, spawnInterval: 3.6, bossInterval: 27 },
  { waveInterval: 30, spawnInterval: 3.1, bossInterval: 28 },
  { waveInterval: 29, spawnInterval: 2.9, bossInterval: 26 },
  { waveInterval: 32, spawnInterval: 2.8, bossInterval: 28 },
  { waveInterval: 30, spawnInterval: 2.6, bossInterval: 27 },
  { waveInterval: 29, spawnInterval: 2.5, bossInterval: 25 },
] as const;

const rushRhythm = [0, .27, .84, 1.05, 1.7, 2.1, 2.38, 2.59, 3.26, 3.58];

function rushOffsets(count: number, interval: number): number[] {
  const total = (count - 1) * interval;
  return Array.from({ length: count }, (_, index) => rushRhythm[index]! * total / rushRhythm[count - 1]!);
}

export function campaignNightPlan(chapterIndex: number, position: number, boss: boolean) {
  const plan = plans[chapterIndex]?.[position - 1];
  const timing = chapterTiming[chapterIndex];
  if (!plan || !timing) throw new Error('Для ночи кампании нет расписания.');
  const waves = plan.waves.split(' ').map((codes, index): WaveDefinition => {
    const enemies = Array.from(codes, code => {
      const kind = creatures[code.toLowerCase()];
      if (!kind) throw new Error(`Неизвестный вид в расписании ${plan.name}: ${code}`);
      return kind;
    });
    const burst = chapterIndex >= 3 && (boss || position > 2) && index % 2 === 1;
    return { id: `wave-${index + 1}`, enemies, spawnInterval: timing.spawnInterval,
      ...(burst ? { spawnOffsets: rushOffsets(enemies.length, timing.spawnInterval) } : {}),
      fronts: Array.from(codes, code => code === code.toUpperCase() ? 'south' : 'north') };
  });
  return { ...plan, waves, waveInterval: boss ? timing.bossInterval : timing.waveInterval };
}
