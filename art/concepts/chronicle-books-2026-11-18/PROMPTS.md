# Запросы ImageGen

Встроенный ImageGen, редактирование по референсам с прозрачным фоном.
Ниже сохранены запросы шести итоговых иллюстраций. Для проверки альфа-канала
использованы исходные PNG, копирование побайтное.

## Кампания, первый лист

Входы по порядку — доработанный разворот из чата (вывод
`exec-e37ed56c-808f-4077-8e8e-b7849454bd38.png`), рисунок фона меню, снимок
подготовки в размере 1280×720. Снимок использовался для пиксельных букв.
[Фон меню](../../../public/images/menu-sprites/background.png).

```text
Use case: style-transfer. Create the first of three matching interaction references for «Свет Авалона»: chapter I, nights page 1 of 2. Image 1 is the book to revise with high fidelity: keep its distinctive size, spread, stitched navy cover, binding, worn warm paper, title, main illustration and the four existing night vignettes and their content. Image 2 is the project's runtime art and the authority for the degree and scale of pixel art. Image 3 is its chunky bitmap lettering reference only. Do not copy the environment or interface from images 2 or 3.

THE MAIN CHANGE IS MEDIUM: redraw all of the book as genuinely chunky handcrafted low-resolution 2D pixel art at the coarseness of the cliffs and waves in image 2. Imagine a ~400 logical pixel wide original magnified 4× with nearest-neighbor. One coherent pixel grid across the whole object. Outlines stair-step by several visible square pixels. The parchment is a small set of flat taupe/ivory shades, built from sparse block-shaped patches and pixel dithering in the folds. No fine grain, realistic crack textures, brushed wash, or blurred gradients. Blue-black leather and amber copper use broken angular chips and two to four shades, with simplified bold folds and binding. The seascape art uses clear interlocked clusters, only hard-edged stepped clouds, waves and silhouette highlights. Keep the original left-page lighthouse dim and the bright completed beacon in the «ПЕРВЫЙ СВЕТ» vignette only. Navy and amber palette and meaningful silhouette like our game, restrained line weight for copper choices.

Add only these on-book navigation elements. Fit a small blue ribbon tab reading «ОГЛАВЛЕНИЕ» into the top of the spread near the central spine, clear of the chapter title and illustrations. The tab looks physically attached and its text is small but legible pixel lettering. On the existing right page keep a tidy 2 by 2 grid of four vignettes, each caption printed directly on the page, preserving the correct labels and states from image 1. Reserve space under the grid in the lower right paper margin for an unobtrusive but clearly legible engraved pager with exactly these three parts on one line: a muted stepped left chevron, «1 / 2», and a copper stepped right chevron. No filled panels behind these tiny navigation affordances. No buttons outside the book.

Text verbatim left «ГЛАВА I», «ТУМАННЫЙ БЕРЕГ». Right in reading order «ПЕРВЫЙ СВЕТ» / «ПРОЙДЕНА», «РАЗБИТЫЙ БЕРЕГ» / «ВЫБРАНА», «КРЫЛАТЫЙ ПРИЛИВ» / «ПОБЕДИ В НОЧИ 2», «СТРАЖ ГЛУБИН» / «ПОБЕДИ В НОЧИ 3». Use a pixel check, a diamond and two inline locks, respectively. Show only the fully visible book with clear transparent margins, alpha outside. No external backdrop, stand, floor, lantern, app buttons, labels, logos or watermark.
```

## Кампания, второй лист и оглавление

У двух отдельных запросов общий первый абзац и один вход — [первый лист](campaign-desktop-sheet-1.png).

```text
Use case: precise-object-edit. This is a different navigation state of the SAME exact game book, not a new book. Strictly preserve the original camera, orientation, book silhouette, navy cover, gold stitching, corner fittings, rings, bookmark, paper colors, and visible bold chunky pixel grid. Keep the left page entirely unchanged including «ГЛАВА I», «ТУМАННЫЙ БЕРЕГ» and all of its illustration. Keep the physical upper tab reading «ОГЛАВЛЕНИЕ» at exactly the same place. Restrict graphical changes to the right page as described below. All text exact Cyrillic and rendered with the existing bitmap lettering scale. True transparent alpha outside the complete book, no outside UI, background, scenery, floor, or watermark. Preserve the framing and leave a few transparent pixels all around rather than cropping the binding.
```

### Второй лист

```text
Show chapter I page 2 of 2, demonstrating the last page of a six-night chapter. Remove all four prior illustrations, names and statuses ONLY from the right page. Keep exactly two equal-sized pixel coastal vignettes in the TOP row in the same two slots and same thumbnail size as the previous spread, using two distinctly framed cold nighttime coasts formed from the established art vocabulary. On the left is a blue rocky inlet under banks of cloud, on the right is a smaller distant lighthouse beyond a mostly open dark sea. No creatures or plot spoilers. Under these two prints put only «НОЧЬ 5» and «НОЧЬ 6», as simple centered names. Leave the lower half of the right page openly aged parchment, without any other illustrations, copy, empty outlined slots or decoration. In the EXACT same lower-right position as before, change the paper pager to a copper stepped left arrow, «2 / 2», and a muted non-glowing gray stepped right arrow. Do not draw a title above the new vignettes.
```

### Оглавление

```text
The right page is now a readable interactive table of contents, printed into the book, and the top «ОГЛАВЛЕНИЕ» tab is indicated open with a subtle copper edging. Remove ALL right-page night illustrations, their names, statuses and pager. On the right page make a single-column list with three spacious entries of engraved pixel type, separated by thin etched rules. Main title «ГЛАВЫ» at the top of the right page. Active entry one: small amber diamond and «ГЛАВА I» with «ТУМАННЫЙ БЕРЕГ» immediately underneath in bold. Locked entry two: small simple pixel lock and «ГЛАВА II» with «ДАЛЬНИЙ БЕРЕГ» immediately underneath in bold, and a small clear condition underneath exactly «ПОБЕДИ СТРАЖА ГЛУБИН». Third entry: «ИСПЫТАНИЯ» with a small diamond. A small unobtrusive left-chevron and «К НОЧАМ» engraved in the lower right near the old pager position offers a clear way back. Include only the specified text on the right. Keep plenty of visual breathing room, no thumbnails on the right, no rectangular cards, no added ornamental blocks, no outside controls.
```

## Испытания, разворот

Входы по порядку — [первый лист кампании](campaign-desktop-sheet-1.png),
[корпус](../../../sprites/frames/ship/frame-01.png) и [парус](../../../sprites/frames/sail/frame-01.png).

```text
Use case: precise-object-edit. Design a separate open Trials book for the original game «Свет Авалона». Image 1 is the exact campaign book to use as a matching visual template. Preserve its book silhouette, size, angle, low-res chunky nearest-neighbor pixel scale, ink typography, aged ivory pages, dark navy stitched cover, copper corners, copper spine stitching, ribbon and transparent canvas. It must read as a companion volume in the same series. Images 2 and 3 are the in-game hull and sail sprite pieces of the same vessel, use them together for the shape and dark blue sail with the pale knot emblem. Same rigid 2D pixel grid from the game, with no blurry photoreal texture.

On the LEFT PAGE replace the campaign heading and chapter name with two centered printed headings «ИСПЫТАНИЯ» and «СИГНАЛ БЕДСТВИЯ». Below, a single large hand-pixelled print shows the selected rescue trial: the recognizable game ship with its single dark blue sail and small warm cabin lights, in open cold dark waves close to the rocky shores, a familiar lighthouse on a distant rocky headland shining a narrow amber beam toward the ship. The ship is distinct and readable, the sea and stone use the same navy and slate blue stepped pixels as the campaign book. Near the bottom of the left paper, put one short readable objective line «ПОМОГИ КОРАБЛЮ СВЕТОМ».

On the RIGHT PAGE keep the exact book's 2 by 2 grid, four illustrations of equal size, same placement and name/status hierarchy. Top left is the chosen rescue trial, «СИГНАЛ БЕДСТВИЯ» then a small copper diamond and «ВЫБРАНО». That vignette shows the ship and has a thin warm copper edge without neon glow. Upper right is «БРОНЕВОЙ ФРОНТ», lower left «ВОЗДУШНЫЙ НАЛЁТ», lower right «СМЕШАННЫЙ ШТУРМ». The three locked scenes are different gray-blue coastal compositions with clear silhouettes, subdued by pixel-block fog: low broken cliff and rocks, a tall coastal tower beneath heavy clouds, and choppy water meeting the coast from both sides. No monsters or character silhouettes. Print a tiny lock and the literal compact line «ПОБЕДИ НА ДАЛЬНЕМ БЕРЕГУ» under each of those three names. All specified words exact Cyrillic, no extra copy. Preserve chapter book lettering fidelity.

Remove the «ОГЛАВЛЕНИЕ» tab and page-number arrows from the template for this four-entry standalone book. Do not draw buttons, menu overlays, external decorations, backgrounds, scenery or shadows outside the book. Keep generous transparent margins on every side and both entire covers visible, no cropping. Actual alpha outside the book.
```

## Кампания, портрет

Вход — [первый лист кампании](campaign-desktop-sheet-1.png).

```text
Use case: precise-object-edit. Create a PORTRAIT mobile design reference of the SAME book, adapted to one visible page for a narrow phone. Render only the physical book isolated on fully transparent alpha. Portrait canvas approximately 1:2.2 (roughly 390 by 844 CSS pixels at display size). No phone device frame, no scene behind the book, no dark solid or checked background, no external interface, bottom buttons or floating control panels. Entire upright book with transparent margin and nothing outside it.

Preserve the previous book's very crisp coarse 2D pixel art and matching surface materials: navy stitched leather, pixel angular copper details, warm sparsely dithered parchment, stacked curved page edges, single thick readable higher-contrast dark pixel font. Use visually large clustered pixel steps consistently in clouds, surf, stitching and shading. Slim binding and a few copper stitches run vertically along the LEFT edge; a very narrow glimpse of an underlying leaf makes it obvious that it is an open book seen on one page. No second full page, and no sideways or shrunken desktop layout. Clear left/right parchment margins. Mobile-first structure: "heading, one WIDE landscape vignette, a compact two-by-two grid, optional page controls." Keep it breathable and legible at 390 CSS px width. Text labels centered, up to two short lines if needed. Use the same pixel palettes and familiar original assets suggested by the reference.

This is the campaign book, leaf one of two, chapter «ТУМАННЫЙ БЕРЕГ». Attach a small blue cloth tab «ОГЛАВЛЕНИЕ» at the TOP near the left binding, without covering the page text. The page headings are «ГЛАВА I» and «ТУМАННЫЙ БЕРЕГ». Under the headings print a wide and fairly shallow panorama of the game lighthouse and coastal ruined arch, dim lit windows without beam. Under this panorama have exactly four vignettes in a balanced 2 by 2 grid. The headlines and statuses in reading order are «ПЕРВЫЙ СВЕТ» and «ПРОЙДЕНА» with a checkmark beneath a glowing finished lighthouse scene; «РАЗБИТЫЙ БЕРЕГ» and «ВЫБРАНА» with a diamond and thin antique copper edge around the dark rocky shore image; «КРЫЛАТЫЙ ПРИЛИВ» and «ПОБЕДИ В НОЧИ 2» with a small inline lock beneath the foggy moon and near arch; «СТРАЖ ГЛУБИН» and «ПОБЕДИ В НОЧИ 3» with a small inline lock beneath more open dark sea and a far-off lighthouse. Make the navigation row BELOW the four vignettes on the parchment, lower right, muted left chevron, «1 / 2» and amber right chevron. Keep all spelling exact in Cyrillic. No additional titles or controls.
```

## Испытания, портрет

Входы по порядку — [портрет кампании](campaign-mobile-portrait.png) и
[разворот испытаний](trials-desktop.png).

```text
Use case: precise-object-edit. Make the portrait phone reference for the standalone Trials book. Image 1 is the EXACT mobile layout, silhouette, one-page book, scale, margins, angle, pixel lettering, and material to preserve. Image 2 is the EXACT Trials content and illustrative source. Transplant the Trials content of image 2 to the one visible page of image 1. Preserve the matching chunky, hand-pixelled low-resolution style, dark navy binding, sparse warm paper patches, existing copper accents and layered lower edge. Keep the same upright portrait page and legible wide single-column heading and 2×2 grid, no shrunken double spread.

From top to bottom within this one page: centered headings «ИСПЫТАНИЯ» and «СИГНАЛ БЕДСТВИЯ», then a wide shallow illustration of the navy sailing ship with the pale triangular knot and a lighthouse shining across cool choppy sea, then one short ink line «ПОМОГИ КОРАБЛЮ СВЕТОМ». Below this exact four-entry 2×2 grid, all illustrations and names drawn from image 2: top left «СИГНАЛ БЕДСТВИЯ» / copper diamond and «ВЫБРАНО» and only this vignette has a thin copper outline. Top right «БРОНЕВОЙ ФРОНТ», bottom left «ВОЗДУШНЫЙ НАЛЁТ», bottom right «СМЕШАННЫЙ ШТУРМ». Keep all three locked images as distinct gray-blue silhouettes. Under each locked name put an inline lock and «ПОБЕДИ НА ДАЛЬНЕМ БЕРЕГУ», allowed to wrap into two lines for readability. Use exact legible Cyrillic. Remove the «ОГЛАВЛЕНИЕ» tab and page arrows / number from the mobile template; close the former tab area with the existing navy binding in matching style. Keep enough clear paper under the last captions. Nothing outside the fully visible book, transparent alpha and a narrow transparent margin, no phone frame, no backdrop, no scene furniture, no external buttons, no watermark.
```
