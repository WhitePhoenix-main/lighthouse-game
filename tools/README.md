# Инструменты проекта

Все команды выполняются из корня репозитория. Инструменты не входят в игру.

`pnpm test:legacy:baseline` запускает legacy и сравнивает идентификаторы ошибок
с `tests/legacy/BASELINE.json`. Он блокирует новые падения, пропуски и потерю
покрытия; известные ошибки остаются техническим долгом. Исправленную suite
следует вернуть в основной набор и отметить её путь полем `restoredTo`.

| Каталог | Назначение |
| --- | --- |
| `browser/` | Проверки интерфейса и готовой сборки; общий владелец временного профиля Chrome |
| `assets/` | Подготовка текущих ресурсов и художественного референса первой главы |
| `archive/` | Конвертеры заменённых статичных меню и настроек |

## Проверки текущих экранов

`node tools/browser/verify-avalon-watch.cjs` запускает Chrome и локальный Vite без HMR. Нужны установленный Google Chrome и Playwright, путь к модулю можно передать через `LIGHTHOUSE_PLAYWRIGHT_PATH`. При заданном `LIGHTHOUSE_TEST_URL` используется существующий localhost-стенд. Проверка создаёт отдельный профиль для каждого размера окна, языка и размера текста. Переходы выполняются мышью либо эмулированными касаниями. Ночи ускоряются штатными фиксированными шагами симуляции, финальная глава запускается из подготовленного тестового сохранения. PNG и результаты записываются в `test-results/avalon-watch-runtime/`.

Для попарной сверки `WATCH_ART_PASS=after` включает в `verify-avalon-watch.cjs` три точных размера эталонов и дополнительные состояния. `capture-watch-world.cjs` снимает берег с размещёнными устройствами и Стража, `capture-watch-workshop.cjs` открывает заданные страницы и покупки. Пары PNG собирает `tools/assets/compare-avalon-watch.py`. [Полная последовательность команд](../art/reviews/avalon-watch/README.md)

При работающем `pnpm dev --port 5189 --strictPort`:

```powershell
node tools/browser/verify-preparation.cjs http://127.0.0.1:5189
node tools/browser/verify-battle.cjs http://127.0.0.1:5189
node tools/browser/verify-battle.cjs http://127.0.0.1:5189 --gpu
node tools/browser/verify-campaign.cjs http://127.0.0.1:5189
node tools/browser/verify-campaign-presentation-rewards.cjs http://127.0.0.1:5189
node tools/browser/verify-skill-tree.cjs http://127.0.0.1:5189
node tools/browser/verify-settings-screen.cjs http://127.0.0.1:5189
node tools/browser/verify-settings-navigation.cjs http://127.0.0.1:5189
node --test tools/browser/check-browser-profile.cjs
```

Эти проверки используют установленный Chrome и временные профили внутри
`test-results/`. Путь можно задать через `LIGHTHOUSE_BROWSER_PATH`.
`verify-preparation --layout-only` запускает только матрицу размеров.

`verify-build`, `verify-game-menu`, `verify-menu`, `verify-menu-buttons`,
`verify-menu-title`, `verify-fog` и `verify-settings` используют внешний Playwright:
`LIGHTHOUSE_PLAYWRIGHT_PATH` задаёт путь к пакету. Для пиксельного анализа тумана и
названия нужен также внешний `sharp` (`LIGHTHOUSE_SHARP_PATH`). Эти пакеты не
являются зависимостями игры. `verify-settings.cjs` принимает путь Playwright
первым аргументом; остальные принимают URL.

Проверка production после `pnpm build` и `pnpm preview`:

```powershell
node tools/browser/verify-build.cjs http://127.0.0.1:4173
node tools/browser/verify-battle.cjs http://127.0.0.1:4173 --gpu --production-only
```

`node tools/browser/verify-pages-build.mjs` запускает ту же проверку боя для
готового `dist/` по префиксу `/lighthouse-game/`. Обёртка сама запускает и
закрывает локальный сервер. GitHub Actions выполняет этот сценарий до загрузки
артефакта Pages. На Ubuntu он использует установленный Google Chrome со
SwiftShader для WebGL на сервере без аппаратного GPU.

`verify-menu` проверяет работающий интерфейс. Дополнительная проверка покрытия
исходных художественных масок включается только через
`LIGHTHOUSE_AMBIENT_COVERAGE_PATH`; исторический отчёт масок отсутствует в checkout.
Без него этот результат не заявляется.

`verify-stage2`–`verify-stage7`, `verify-devices`, `verify-expansion`,
`verify-rewards`, `verify-turning` и `verify-late-modes` сохраняют сценарии отдельных
этапов. Их ожидания требуют отдельной ревизии после смены экранов; они не заменяют
проверки текущей подготовки и древа. Стенды находятся в `tests/browser/`.

## Ресурсы

```powershell
node tools/assets/prepare-menu-scenery.mjs
node tools/assets/prepare-game-menu.mjs
pwsh -File tools/assets/prepare-preparation-ui.ps1
pwsh -File tools/assets/prepare-preparation-stone.ps1
pwsh -File tools/assets/prepare-skill-tree-chart.ps1
pwsh -File tools/assets/prepare-skill-tree-chrome.ps1
python tools/assets/prepare-chronicle-book.py
python tools/assets/prepare-campaign-art.py
```

`prepare-menu-scenery` копирует готовые атласы из `sprites/` без внешних пакетов.
`prepare-campaign-art.py` использует Pillow и мастера в `art/campaign-f/masters/`.
`prepare-game-menu` использует внешний `sharp` и исходники `art/game-menu-v2/`.
PowerShell-генератор подготовки использует System.Drawing и источники из
`art/concepts/preparation-2026-11-17/`.
`prepare-skill-tree-chart.ps1` собирает два PNG-фона дерева из спрайтов мыса
первой главы. `prepare-skill-tree-chrome.ps1` рисует пиксельные рамки и собирает
маяк на скальном основании. Оба используют Windows с System.Drawing.

`prepare-menu-buttons.mjs` сохранён как рецепт действующих атласов, но его входы
`art/menu-buttons-v2/lettering.mjs` и `art/menu-buttons-reference-v1/` сейчас
отсутствуют. Его нельзя считать воспроизводимым генератором до восстановления
источников. Готовые `sprites/menu-buttons-v2/` остаются действующими.
`prepare-headland-reference.ps1` создаёт отдельный художественный референс,
а не ресурсы боевого мира. `encode-menu-audio.ps1` требует предоставленный WAV и ffmpeg.
Происхождение и ограничения прав сохранены в [реестре](../art/ASSETS.md).

Архивные конвертеры пишут в `test-results/archive/` и не возвращают старые WebP
в `public/`. Их исходные художественные файлы могут отсутствовать; сохранённые
результаты находятся в [art/archive/runtime/](../art/archive/runtime/README.md).
