# Свет Авалона · макеты и пиксельная графика

Самостоятельный дизайн-проход GPT‑6.2 Astra с уровнем рассуждения Max, 20 ноября 2026. Стартовый экран с двумя медными кнопками задаёт масштаб всего интерфейса. Дальше игрок открывает записки смотрителя, готовит тот же берег, который будет защищать, и считывает опасность по источнику, направлению и состоянию цели.

**Открыть [галерею всех макетов](gallery.html)**. В ней можно переключать экран, размер окна, язык и размер текста, а также открыть PNG в исходном размере. Для первого сравнения есть [маршрут от меню до боя на ПК](sheets/desktop/landfall.png) и [тот же маршрут на телефоне](sheets/phone-portrait/landfall.png).

В комплекте 47 состояний, 564 полноразмерных макета, 108 отдельных прозрачных спрайтов, восемь сюжетных гравюр, четыре материала берега и 54 листа переходов. Отдельный [лист в масштабе 1:1](sheets/native-detail.png) сопоставляет исходную кнопочную графику с новой. В сценариях проставлены иллюстративные значения профиля. Исходная геометрия берега, цены, награды, правила и допущения перечислены в материалах ниже.

- [Стандарт оформления](STYLE.md) — размеры, палитра, текст, компоненты и общий мир.
- [Ресурсы и данные](SOURCES.md) — источники, создание мастеров, режимы прототипа и примеры расчётов.
- [Проверки и ограничения](CHECKS.md) — размеры, язык, шрифты, масштаб и читаемость боевых состояний.
- [Атлас и координаты](sprites/atlas.json) · [отдельные спрайты](sprites/) · [сцены глав и материалы](plates/) · [эталонное меню](reference/).
- Все четыре текстовых матрицы имеют прямые ссылки на PNG. [RU обычный](boards/INDEX.md) · [RU крупный](locales/ru-large/INDEX.md) · [EN обычный](locales/en-normal/INDEX.md) · [EN крупный](locales/en-large/INDEX.md).

## Экраны и состояния

| Экран | ПК 1280 × 720 | Телефон 844 × 390 | Телефон 390 × 844 |
| --- | --- | --- | --- |
| Выбор игры | [ПК](boards/desktop/game-select.png) | [Горизонтально](boards/phone-landscape/game-select.png) | [Вертикально](boards/phone-portrait/game-select.png) |
| Настройки | [ПК](boards/desktop/settings.png) | [Горизонтально](boards/phone-landscape/settings.png) | [Вертикально](boards/phone-portrait/settings.png) |
| Хроника · оглавление | [ПК](boards/desktop/chronicle-chapters.png) | [Горизонтально](boards/phone-landscape/chronicle-chapters.png) | [Вертикально](boards/phone-portrait/chronicle-chapters.png) |
| Хроника · выбор ночи | [ПК](boards/desktop/chronicle-nights.png) | [Горизонтально](boards/phone-landscape/chronicle-nights.png) | [Вертикально](boards/phone-portrait/chronicle-nights.png) |
| Испытания прототипа | [ПК](boards/desktop/trials.png) | [Горизонтально](boards/phone-landscape/trials.png) | [Вертикально](boards/phone-portrait/trials.png) |
| Вступление · Туманный берег | [ПК](boards/desktop/story-01.png) | [Горизонтально](boards/phone-landscape/story-01.png) | [Вертикально](boards/phone-portrait/story-01.png) |
| Вступление · Дальний берег | [ПК](boards/desktop/story-02.png) | [Горизонтально](boards/phone-landscape/story-02.png) | [Вертикально](boards/phone-portrait/story-02.png) |
| Вступление · Терновые топи | [ПК](boards/desktop/story-03.png) | [Горизонтально](boards/phone-landscape/story-03.png) | [Вертикально](boards/phone-portrait/story-03.png) |
| Вступление · Пепельные утёсы | [ПК](boards/desktop/story-04.png) | [Горизонтально](boards/phone-landscape/story-04.png) | [Вертикально](boards/phone-portrait/story-04.png) |
| Вступление · Кладбище кораблей | [ПК](boards/desktop/story-05.png) | [Горизонтально](boards/phone-landscape/story-05.png) | [Вертикально](boards/phone-portrait/story-05.png) |
| Вступление · Затмение Авалона | [ПК](boards/desktop/story-06.png) | [Горизонтально](boards/phone-landscape/story-06.png) | [Вертикально](boards/phone-portrait/story-06.png) |
| Вступление · Последний рассвет | [ПК](boards/desktop/story-07.png) | [Горизонтально](boards/phone-landscape/story-07.png) | [Вертикально](boards/phone-portrait/story-07.png) |
| Подготовка · карта | [ПК](boards/desktop/preparation.png) | [Горизонтально](boards/phone-landscape/preparation.png) | [Вертикально](boards/phone-portrait/preparation.png) |
| Устройства · магазин | [ПК](boards/desktop/devices.png) | [Горизонтально](boards/phone-landscape/devices.png) | [Вертикально](boards/phone-portrait/devices.png) |
| Оснащение · линза | [ПК](boards/desktop/lens.png) | [Горизонтально](boards/phone-landscape/lens.png) | [Вертикально](boards/phone-portrait/lens.png) |
| Оснащение · способность | [ПК](boards/desktop/ability.png) | [Горизонтально](boards/phone-landscape/ability.png) | [Вертикально](boards/phone-portrait/ability.png) |
| Расстановка экземпляра | [ПК](boards/desktop/placement.png) | [Горизонтально](boards/phone-landscape/placement.png) | [Вертикально](boards/phone-portrait/placement.png) |
| Обслуживание экземпляра | [ПК](boards/desktop/service.png) | [Горизонтально](boards/phone-landscape/service.png) | [Вертикально](boards/phone-portrait/service.png) |
| Позиция за границей суши | [ПК](boards/desktop/invalid-placement.png) | [Горизонтально](boards/phone-landscape/invalid-placement.png) | [Вертикально](boards/phone-portrait/invalid-placement.png) |
| Разведка | [ПК](boards/desktop/scouting.png) | [Горизонтально](boards/phone-landscape/scouting.png) | [Вертикально](boards/phone-portrait/scouting.png) |
| Осколки и недоступное видео | [ПК](boards/desktop/currency.png) | [Горизонтально](boards/phone-landscape/currency.png) | [Вертикально](boards/phone-portrait/currency.png) |
| Развитие кампании | [ПК](boards/desktop/development.png) | [Горизонтально](boards/phone-landscape/development.png) | [Вертикально](boards/phone-portrait/development.png) |
| Древо улучшений прототипа | [ПК](boards/desktop/prototype-tree.png) | [Горизонтально](boards/phone-landscape/prototype-tree.png) | [Вертикально](boards/phone-portrait/prototype-tree.png) |
| Покупка | [ПК](boards/desktop/purchase.png) | [Горизонтально](boards/phone-landscape/purchase.png) | [Вертикально](boards/phone-portrait/purchase.png) |
| Покупка · нехватка средств | [ПК](boards/desktop/purchase-locked.png) | [Горизонтально](boards/phone-landscape/purchase-locked.png) | [Вертикально](boards/phone-portrait/purchase-locked.png) |
| Коллекция · получение награды | [ПК](boards/desktop/collection.png) | [Горизонтально](boards/phone-landscape/collection.png) | [Вертикально](boards/phone-portrait/collection.png) |
| Бой · угрозы и цели | [ПК](boards/desktop/battle.png) | [Горизонтально](boards/phone-landscape/battle.png) | [Вертикально](boards/phone-portrait/battle.png) |
| Бой · Страж глубин | [ПК](boards/desktop/boss.png) | [Горизонтально](boards/phone-landscape/boss.png) | [Вертикально](boards/phone-portrait/boss.png) |
| Бой · команда пушки | [ПК](boards/desktop/device-command.png) | [Горизонтально](boards/phone-landscape/device-command.png) | [Вертикально](boards/phone-portrait/device-command.png) |
| Бой · выбор цели Печати | [ПК](boards/desktop/target-ability.png) | [Горизонтально](boards/phone-landscape/target-ability.png) | [Вертикально](boards/phone-portrait/target-ability.png) |
| Пауза | [ПК](boards/desktop/pause.png) | [Горизонтально](boards/phone-landscape/pause.png) | [Вертикально](boards/phone-portrait/pause.png) |
| Подтверждение прерывания | [ПК](boards/desktop/confirm-abandon.png) | [Горизонтально](boards/phone-landscape/confirm-abandon.png) | [Вертикально](boards/phone-portrait/confirm-abandon.png) |
| Победа | [ПК](boards/desktop/victory.png) | [Горизонтально](boards/phone-landscape/victory.png) | [Вертикально](boards/phone-portrait/victory.png) |
| Поражение после гибели босса | [ПК](boards/desktop/defeat.png) | [Горизонтально](boards/phone-landscape/defeat.png) | [Вертикально](boards/phone-portrait/defeat.png) |
| Эпилог и итог финальной ночи | [ПК](boards/desktop/epilogue.png) | [Горизонтально](boards/phone-landscape/epilogue.png) | [Вертикально](boards/phone-portrait/epilogue.png) |
| Подтверждение новой игры | [ПК](boards/desktop/confirm-new.png) | [Горизонтально](boards/phone-landscape/confirm-new.png) | [Вертикально](boards/phone-portrait/confirm-new.png) |
| Ошибка сохранения результата | [ПК](boards/desktop/save-error.png) | [Горизонтально](boards/phone-landscape/save-error.png) | [Вертикально](boards/phone-portrait/save-error.png) |
| Подтверждение перечитывания | [ПК](boards/desktop/reload-confirm.png) | [Горизонтально](boards/phone-landscape/reload-confirm.png) | [Вертикально](boards/phone-portrait/reload-confirm.png) |
| Ошибка записи настроек | [ПК](boards/desktop/settings-error.png) | [Горизонтально](boards/phone-landscape/settings-error.png) | [Вертикально](boards/phone-portrait/settings-error.png) |
| Профиль открыт в другой вкладке | [ПК](boards/desktop/profile-lock.png) | [Горизонтально](boards/phone-landscape/profile-lock.png) | [Вертикально](boards/phone-portrait/profile-lock.png) |
| Возврат после прерывания | [ПК](boards/desktop/interrupted.png) | [Горизонтально](boards/phone-landscape/interrupted.png) | [Вертикально](boards/phone-portrait/interrupted.png) |
| Подтверждение на стенде видеонаград | [ПК](boards/desktop/reward-test.png) | [Горизонтально](boards/phone-landscape/reward-test.png) | [Вертикально](boards/phone-portrait/reward-test.png) |
| Выбор игры · новый профиль | [ПК](boards/desktop/new-profile.png) | [Горизонтально](boards/phone-landscape/new-profile.png) | [Вертикально](boards/phone-portrait/new-profile.png) |
| Выбор игры · профиль прототипа | [ПК](boards/desktop/prototype-select.png) | [Горизонтально](boards/phone-landscape/prototype-select.png) | [Вертикально](boards/phone-portrait/prototype-select.png) |
| Разведка · режим испытания прототипа | [ПК](boards/desktop/trial-modes.png) | [Горизонтально](boards/phone-landscape/trial-modes.png) | [Вертикально](boards/phone-portrait/trial-modes.png) |
| Бой · общее поле генераторов | [ПК](boards/desktop/battle-shield.png) | [Горизонтально](boards/phone-landscape/battle-shield.png) | [Вертикально](boards/phone-portrait/battle-shield.png) |
| Пересмотр вступления из Хроники | [ПК](boards/desktop/story-replay.png) | [Горизонтально](boards/phone-landscape/story-replay.png) | [Вертикально](boards/phone-portrait/story-replay.png) |

## Сравнительные листы

Каждый лист содержит четыре полноразмерных изображения одного и того же окна. Подпись вынесена в отдельную полосу. Галерея умеет показывать 1:1 и вписывать лист в окно.

| Соседние состояния | 1280 × 720 | 844 × 390 | 390 × 844 |
| --- | --- | --- | --- |
| Главное меню, выбор игры, настройки и Хроника | [ПК](sheets/desktop/navigation.png) | [Горизонтально](sheets/phone-landscape/navigation.png) | [Вертикально](sheets/phone-portrait/navigation.png) |
| Главное меню, главы, ночи и испытания | [ПК](sheets/desktop/chronicle.png) | [Горизонтально](sheets/phone-landscape/chronicle.png) | [Вертикально](sheets/phone-portrait/chronicle.png) |
| Переход из Хроники к первым записям | [ПК](sheets/desktop/journal-first.png) | [Горизонтально](sheets/phone-landscape/journal-first.png) | [Вертикально](sheets/phone-portrait/journal-first.png) |
| Записи глав IV–VII | [ПК](sheets/desktop/journal-coasts.png) | [Горизонтально](sheets/phone-landscape/journal-coasts.png) | [Вертикально](sheets/phone-portrait/journal-coasts.png) |
| Меню, журнал, высадка и бой | [ПК](sheets/desktop/landfall.png) | [Горизонтально](sheets/phone-landscape/landfall.png) | [Вертикально](sheets/phone-portrait/landfall.png) |
| Карта, каталог устройств и оснащение | [ПК](sheets/desktop/equipment.png) | [Горизонтально](sheets/phone-landscape/equipment.png) | [Вертикально](sheets/phone-portrait/equipment.png) |
| Карта, расстановка, обслуживание и неверная позиция | [ПК](sheets/desktop/maintenance.png) | [Горизонтально](sheets/phone-landscape/maintenance.png) | [Вертикально](sheets/phone-portrait/maintenance.png) |
| Развитие, покупка и граф прототипа | [ПК](sheets/desktop/upgrades.png) | [Горизонтально](sheets/phone-landscape/upgrades.png) | [Вертикально](sheets/phone-portrait/upgrades.png) |
| Нехватка средств, коллекция, осколки и стенд | [ПК](sheets/desktop/rewards.png) | [Горизонтально](sheets/phone-landscape/rewards.png) | [Вертикально](sheets/phone-portrait/rewards.png) |
| Один берег в подготовке, бою, на боссе и при команде | [ПК](sheets/desktop/combat.png) | [Горизонтально](sheets/phone-landscape/combat.png) | [Вертикально](sheets/phone-portrait/combat.png) |
| Разведка, угроза, Печать и пауза | [ПК](sheets/desktop/defense.png) | [Горизонтально](sheets/phone-landscape/defense.png) | [Вертикально](sheets/phone-portrait/defense.png) |
| Страж, победа, поражение и эпилог | [ПК](sheets/desktop/outcomes.png) | [Горизонтально](sheets/phone-landscape/outcomes.png) | [Вертикально](sheets/phone-portrait/outcomes.png) |
| Выбор, сброс, пауза и прерывание | [ПК](sheets/desktop/decisions.png) | [Горизонтально](sheets/phone-landscape/decisions.png) | [Вертикально](sheets/phone-portrait/decisions.png) |
| Сохранение, перечитывание, настройки и вторая вкладка | [ПК](sheets/desktop/recovery.png) | [Горизонтально](sheets/phone-landscape/recovery.png) | [Вертикально](sheets/phone-portrait/recovery.png) |
| Главная, новый профиль, прерывание и подготовка | [ПК](sheets/desktop/return.png) | [Горизонтально](sheets/phone-landscape/return.png) | [Вертикально](sheets/phone-portrait/return.png) |
| Доступный путь прототипа и граф | [ПК](sheets/desktop/prototype.png) | [Горизонтально](sheets/phone-landscape/prototype.png) | [Вертикально](sheets/phone-portrait/prototype.png) |
| Обычный бой, общее поле, Печать, команда | [ПК](sheets/desktop/battle-states.png) | [Горизонтально](sheets/phone-landscape/battle-states.png) | [Вертикально](sheets/phone-portrait/battle-states.png) |
| Первое чтение и повторное чтение из Хроники | [ПК](sheets/desktop/replay.png) | [Горизонтально](sheets/phone-landscape/replay.png) | [Вертикально](sheets/phone-portrait/replay.png) |

## Пересборка

Из корня репозитория в PowerShell. При ином расположении Python укажите интерпретатор с Pillow. Сохранённые мастера входят в комплект.

~~~powershell
$python = 'C:\Users\enixm\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$design = 'art/concepts/menu-led-redesign-astra-max-2026-11-20'
$target = 'test-results/menu-led-redesign-astra-max-work/independent-rebuild'
& $python "$design/build.py" --out $target
& $python "$design/verify.py" --out $target
~~~

Сборка создаёт каталоги экспортов в указанном месте. Проверка записывает [протокол](audit/verification.json) и [контрольные суммы PNG и атласа](audit/sha256.json). Для быстрого прогона верстки у сборщика есть `--layout-only`. Для указанных состояний или языков можно передать `--scene boss` и `--view en-large`. Игровой код, ресурсы публикации и сохранения пользователя в этот комплект не входят.
