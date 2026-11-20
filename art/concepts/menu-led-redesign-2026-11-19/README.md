# Свет Авалона · интерфейс от главного меню

Пакет для передачи художнику и разработчику. В нём 39 статичных состояний, каждое в трёх окнах. Расстановку и бой удобно начать смотреть рядом с эталоном. На обоих кадрах пушка стоит ниже и левее маяка, а две цели в луче имеют янтарную кромку. [Сравнение на ПК](comparisons/watch-desktop.png) · [Телефон горизонтально](comparisons/watch-phone-landscape.png) · [Телефон вертикально](comparisons/watch-phone-portrait.png).

| Что сравнить | ПК | Телефон горизонтально | Телефон вертикально |
| --- | --- | --- | --- |
| Вход, настройки и подтверждение | [Лист](comparisons/entry-desktop.png) | [Лист](comparisons/entry-phone-landscape.png) | [Лист](comparisons/entry-phone-portrait.png) |
| Хроника, запись и подготовка | [Лист](comparisons/journal-desktop.png) | [Лист](comparisons/journal-phone-landscape.png) | [Лист](comparisons/journal-phone-portrait.png) |
| Берег до и после начала ночи | [Лист](comparisons/watch-desktop.png) | [Лист](comparisons/watch-phone-landscape.png) | [Лист](comparisons/watch-phone-portrait.png) |
| Устройства и босс | [Лист](comparisons/field-desktop.png) | [Лист](comparisons/field-phone-landscape.png) | [Лист](comparisons/field-phone-portrait.png) |
| Развитие и коллекция | [Лист](comparisons/purchases-desktop.png) | [Лист](comparisons/purchases-phone-landscape.png) | [Лист](comparisons/purchases-phone-portrait.png) |
| Дерево и покупка | [Лист](comparisons/tree-desktop.png) | [Лист](comparisons/tree-phone-landscape.png) | [Лист](comparisons/tree-phone-portrait.png) |
| Прототип испытаний | [Лист](comparisons/trials-desktop.png) | [Лист](comparisons/trials-phone-landscape.png) | [Лист](comparisons/trials-phone-portrait.png) |
| Победа и поражение | [Лист](comparisons/outcomes-desktop.png) | [Лист](comparisons/outcomes-phone-landscape.png) | [Лист](comparisons/outcomes-phone-portrait.png) |
| Эпилог и его итог | [Лист](comparisons/finale-desktop.png) | [Лист](comparisons/finale-phone-landscape.png) | [Лист](comparisons/finale-phone-portrait.png) |

## Состав поставки

- [Стандарт оформления](STYLE.md) описывает измерения эталона, масштаб, типографику, поведение при повороте и состояния элементов.
- [Исследование кнопки 1:1](reference/material-study.png) сопоставляет три кадра настоящего меню с новыми рамками. [Новые компоненты](reference/component-library.png) показаны без игровых подписей.
- [Манифест спрайтов](sprites/manifest.json) перечисляет 50 исходных PNG. [Атлас](sprites/atlas.png) содержит интерфейс и игровые объекты, включая две рамки с прозрачной серединой для произвольного наполнения. Крупные текстуры суши и воды лежат отдельно.
- [Манифест поставки](manifest.json) содержит список экранов, имена файлов, размеры окон и SHA-256 графических материалов. [Иллюстрации](illustrations/) включают семь записей и финальный рассвет.
- [Примеры доступности](accessibility/) содержат 45 дополнительных кадров настроек, длинной записи, покупки, боя и подтверждения прерывания. Есть английский обычный, русский крупный и английский крупный в каждом из трёх окон. Остальные PNG в каталоге макетов показывают русский обычный режим.

## Открыть отдельный кадр

| Экран или состояние | ПК · 1280×720 | Телефон · 844×390 | Телефон · 390×844 |
| --- | --- | --- | --- |
| Выбор игры | [PNG](mockups/desktop/game-select.png) | [PNG](mockups/phone-landscape/game-select.png) | [PNG](mockups/phone-portrait/game-select.png) |
| Первый запуск без сохранения | [PNG](mockups/desktop/game-select-empty.png) | [PNG](mockups/phone-landscape/game-select-empty.png) | [PNG](mockups/phone-portrait/game-select-empty.png) |
| Замена прохождения | [PNG](mockups/desktop/reset-confirm.png) | [PNG](mockups/phone-landscape/reset-confirm.png) | [PNG](mockups/phone-portrait/reset-confirm.png) |
| Настройки | [PNG](mockups/desktop/settings.png) | [PNG](mockups/phone-landscape/settings.png) | [PNG](mockups/phone-portrait/settings.png) |
| Ошибка записи настроек | [PNG](mockups/desktop/settings-error.png) | [PNG](mockups/phone-landscape/settings-error.png) | [PNG](mockups/phone-portrait/settings-error.png) |
| Хроника, выбор ночи | [PNG](mockups/desktop/chronicle.png) | [PNG](mockups/phone-landscape/chronicle.png) | [PNG](mockups/phone-portrait/chronicle.png) |
| Оглавление глав | [PNG](mockups/desktop/chronicle-index.png) | [PNG](mockups/phone-landscape/chronicle-index.png) | [PNG](mockups/phone-portrait/chronicle-index.png) |
| Книга испытаний прототипа | [PNG](mockups/desktop/trials.png) | [PNG](mockups/phone-landscape/trials.png) | [PNG](mockups/phone-portrait/trials.png) |
| Запись · Туманный берег | [PNG](mockups/desktop/story-01.png) | [PNG](mockups/phone-landscape/story-01.png) | [PNG](mockups/phone-portrait/story-01.png) |
| Запись · Дальний берег | [PNG](mockups/desktop/story-02.png) | [PNG](mockups/phone-landscape/story-02.png) | [PNG](mockups/phone-portrait/story-02.png) |
| Запись · Терновые топи | [PNG](mockups/desktop/story-03.png) | [PNG](mockups/phone-landscape/story-03.png) | [PNG](mockups/phone-portrait/story-03.png) |
| Запись · Пепельные утёсы | [PNG](mockups/desktop/story-04.png) | [PNG](mockups/phone-landscape/story-04.png) | [PNG](mockups/phone-portrait/story-04.png) |
| Запись · Кладбище кораблей | [PNG](mockups/desktop/story-05.png) | [PNG](mockups/phone-landscape/story-05.png) | [PNG](mockups/phone-portrait/story-05.png) |
| Запись · Затмение Авалона | [PNG](mockups/desktop/story-06.png) | [PNG](mockups/phone-landscape/story-06.png) | [PNG](mockups/phone-portrait/story-06.png) |
| Запись · Последний рассвет | [PNG](mockups/desktop/story-07.png) | [PNG](mockups/phone-landscape/story-07.png) | [PNG](mockups/phone-portrait/story-07.png) |
| Повтор записи из Хроники | [PNG](mockups/desktop/story-replay.png) | [PNG](mockups/phone-landscape/story-replay.png) | [PNG](mockups/phone-portrait/story-replay.png) |
| Подготовка | [PNG](mockups/desktop/preparation.png) | [PNG](mockups/phone-landscape/preparation.png) | [PNG](mockups/phone-portrait/preparation.png) |
| Недопустимая позиция | [PNG](mockups/desktop/placement-invalid.png) | [PNG](mockups/phone-landscape/placement-invalid.png) | [PNG](mockups/phone-portrait/placement-invalid.png) |
| Собственная пушка | [PNG](mockups/desktop/device-inventory.png) | [PNG](mockups/phone-landscape/device-inventory.png) | [PNG](mockups/phone-portrait/device-inventory.png) |
| Ремонт корпуса и заряд ловушки | [PNG](mockups/desktop/trap-service.png) | [PNG](mockups/phone-landscape/trap-service.png) | [PNG](mockups/phone-portrait/trap-service.png) |
| Разведка ночи | [PNG](mockups/desktop/recon.png) | [PNG](mockups/phone-landscape/recon.png) | [PNG](mockups/phone-portrait/recon.png) |
| Выбор линзы | [PNG](mockups/desktop/lens.png) | [PNG](mockups/phone-landscape/lens.png) | [PNG](mockups/phone-portrait/lens.png) |
| Выбор способности | [PNG](mockups/desktop/ability.png) | [PNG](mockups/phone-landscape/ability.png) | [PNG](mockups/phone-portrait/ability.png) |
| Недоступное видеопредложение | [PNG](mockups/desktop/currency-unavailable.png) | [PNG](mockups/phone-landscape/currency-unavailable.png) | [PNG](mockups/phone-portrait/currency-unavailable.png) |
| Развитие кампании | [PNG](mockups/desktop/development.png) | [PNG](mockups/phone-landscape/development.png) | [PNG](mockups/phone-portrait/development.png) |
| Граф древа прототипа | [PNG](mockups/desktop/skill-tree.png) | [PNG](mockups/phone-landscape/skill-tree.png) | [PNG](mockups/phone-portrait/skill-tree.png) |
| Карточка покупки | [PNG](mockups/desktop/purchase.png) | [PNG](mockups/phone-landscape/purchase.png) | [PNG](mockups/phone-portrait/purchase.png) |
| Недостаток осколков | [PNG](mockups/desktop/purchase-insufficient.png) | [PNG](mockups/phone-landscape/purchase-insufficient.png) | [PNG](mockups/phone-portrait/purchase-insufficient.png) |
| Коллекция | [PNG](mockups/desktop/collection.png) | [PNG](mockups/phone-landscape/collection.png) | [PNG](mockups/phone-portrait/collection.png) |
| Бой | [PNG](mockups/desktop/battle.png) | [PNG](mockups/phone-landscape/battle.png) | [PNG](mockups/phone-portrait/battle.png) |
| Бой со Стражем глубин | [PNG](mockups/desktop/battle-boss.png) | [PNG](mockups/phone-landscape/battle-boss.png) | [PNG](mockups/phone-portrait/battle-boss.png) |
| Приказ пушке | [PNG](mockups/desktop/battle-command.png) | [PNG](mockups/phone-landscape/battle-command.png) | [PNG](mockups/phone-portrait/battle-command.png) |
| Пауза | [PNG](mockups/desktop/pause.png) | [PNG](mockups/phone-landscape/pause.png) | [PNG](mockups/phone-portrait/pause.png) |
| Прерывание ночи | [PNG](mockups/desktop/abandon-confirm.png) | [PNG](mockups/phone-landscape/abandon-confirm.png) | [PNG](mockups/phone-portrait/abandon-confirm.png) |
| Победа | [PNG](mockups/desktop/victory.png) | [PNG](mockups/phone-landscape/victory.png) | [PNG](mockups/phone-portrait/victory.png) |
| Поражение | [PNG](mockups/desktop/defeat.png) | [PNG](mockups/phone-landscape/defeat.png) | [PNG](mockups/phone-portrait/defeat.png) |
| Ошибка сохранения итога | [PNG](mockups/desktop/save-error.png) | [PNG](mockups/phone-landscape/save-error.png) | [PNG](mockups/phone-portrait/save-error.png) |
| Эпилог | [PNG](mockups/desktop/epilogue.png) | [PNG](mockups/phone-landscape/epilogue.png) | [PNG](mockups/phone-portrait/epilogue.png) |
| Итог финальной ночи | [PNG](mockups/desktop/epilogue-result.png) | [PNG](mockups/phone-landscape/epilogue-result.png) | [PNG](mockups/phone-portrait/epilogue-result.png) |

## Сценарии и данные

Рабочий путь кампании проходит через выбор игры, вступление и подготовку. Строка главы в подготовке открывает Хронику. Из подготовки доступны покупки, обзор угроз, оснащение и устройства. Пауза сохраняет боевую обстановку. Прерывание требует отдельного решения. Обычный итог и финальный итог включают отдельные строки начислений, статус записи и переходы. Основной источник маршрутов — [screenContent](../../../src/presentation/screens.ts) и [описание запуска](../../../docs/CAMPAIGN_RUNTIME.md).

В кампании пункт «Испытания» отключён. Отдельный макет книги использует четыре настоящих испытания докампанейского прототипа. Экран развития кампании показывает категории и покупки из каталога на 256 узлов. Для прототипа с графом подготовлен отдельный кадр со связью «Мощность I» и «Ширина I» → «Связанный свет». [Код выбора игры](../../../src/presentation/menu/gameMenu.ts) · [Построение Хроники](../../../src/presentation/preparation/chronicleState.ts) · [Каталог зависимостей](../../../src/content/upgrades.ts).

Ночные кадры иллюстрируют повтор «Первого света» у игрока с открытой пушкой и экипированной Вспышкой. Показаны вместимость луча 2, маяк на 98 из 120 HP, у купленной пушки в одном из состояний осталось 49 из 70 HP. Сила луча после «Мощности I» растёт с 30 до 36 за 45 осколков. Ремонт ловушки с 15 из 30 HP стоит 2 осколка, отдельный заряд стоит ещё 2. Камерные ракурсы, здоровье в конкретный момент и баланс кошелька иллюстративны. [Базовые характеристики](../../../src/content/night.ts) · [Цены и устройства](../../../src/content/devices.ts) · [Ремонт](../../../src/progression/devices.ts).

Для победы на повторе «Первого света» взяты 32 призрака по одному осколку, 8 черепах по два и доплата 45. Итого 93. Поражение после 10 призраков и 2 черепах приносит 14. Для повторной победы в последней ночи 80 существ по расписанию приносят 108 осколков. Дополнительные два падальщика от голема увеличивают число уничтоженных до 82. С доплатой 295 итог равен 403. На кадре эпилога строка суммы ведёт к развёрнутому итогу той же ночи. У этих примеров бонус за досрочный вызов равен нулю. [Расписания](../../../src/content/campaignWaves.ts) · [Доплаты](../../../src/content/campaignRuntime.ts) · [Расчёт убийств](../../../src/simulation/battle.ts).

## Происхождение и пересборка

Визуальный эталон — действующее главное меню, его фоновый спрайт, два листа кнопок и раздельные надписи. Семь эталонных PNG сняты в Chromium, включая мобильную эмуляцию в двух ориентациях. [Параметры снимков](reference/capture.json) · [Снимок 640×360](reference/native-landscape.png) · [Снимок 360×640](reference/native-portrait.png).

Три новых художественных мастера созданы встроенным ImageGen по [сохранённым промптам](art-source/PROMPTS.txt). В [журнальном листе](art-source/journal.png) восемь отдельных сцен. Мастер [персонажей и устройств](art-source/actors.png) содержит маяк, пушку, призрака и черепаху. [Мастер фактур](art-source/ground.png) даёт землю и море. Код экспорта приводит их к игровой сетке, обрезает границы, ограничивает палитру вида и сохраняет прозрачные игровые объекты. Контур берега взят из числовой геометрии [terrain.ts](../../../src/content/terrain.ts). Рамки, пиктограммы, шкалы, щупальце и все компоновки нарисованы непосредственно на пиксельной сетке. Графика из других экранов или сторонних игр не использовалась.

Шрифт заголовков берётся из [поставки главного меню](../../../public/fonts/menu/OFL.txt). Для наборного текста при сборке используется установленный в Windows Segoe UI. Пакет содержит только изображения текста в макетах и код набора. Шрифтовой файл Windows не распространяется.

Из корня репозитория, в Windows с Python и Pillow 13, выполните:

```powershell
python art/concepts/menu-led-redesign-2026-11-19/source/render.py --check
python art/concepts/menu-led-redesign-2026-11-19/source/render.py --out test-results/menu-led-redesign-rebuild
```

Первая команда строит в памяти все 468 сочетаний состояния, окна, языка и размера текста, проверяет размещение строк, размеры экспортов, хеши и пиксели кадров атласа. Вторая пересобирает графические файлы в указанном каталоге и проверяет результат. Источник — [render.py](source/render.py). Проверены статические композиции и эталон меню в настоящем браузере. Управление новыми экранами мышью, касанием и клавиатурой предстоит проверять при интеграции.

