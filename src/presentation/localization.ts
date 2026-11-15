import type { LanguagePreference } from '../contracts';

export type Language = 'ru' | 'en';
/** An unsupported supplied language falls back to Russian, rather than skipping to a lower-priority source. */
export function resolveLanguage(preference: LanguagePreference, platformLanguage?: string | null, browserLanguages: readonly string[] = []): Language {
  if (preference !== 'auto') return preference;
  const source = platformLanguage?.trim() || browserLanguages.find(value => value.trim()) || 'ru';
  return /^en(?:[-_]|$)/i.test(source) ? 'en' : 'ru';
}

// Presentation-only dictionary. Content identifiers and simulation data remain language independent.
const entries = `
Сила широкого света I|Wide Light Power I
Сила широкого света II|Wide Light Power II
Дальность контроля|Control Range
Сила контроля II|Control Power II
Ширина пробоя|Piercing Width
Сила пробоя II|Piercing Power II
Урон луча +2.|Beam damage +2.
Урон луча ещё +2.|Beam damage +2 more.
Урон луча ещё +8.|Beam damage +8 more.
Точная цена ремонта показана в подготовке.|The exact repair price is shown in preparation.

Прочность между волнами не восстанавливается.|Health does not recover between waves.

Урон пушек II|Cannon Damage II
Скорострельность пушек II|Cannon Fire Rate II
Прицельный залп|Aimed Volley
Бронебойные ядра|Armor-piercing Cannonballs
Прочность барьеров I|Barrier Health I
Прочность барьеров II|Barrier Health II
Прочность барьеров III|Barrier Health III
Защита барьера|Barrier Protection
Упор против рывка|Charge Resistance
Сдерживающие обломки|Hindering Debris
Ремонтные скобы|Repair Brackets
Прочность генераторов I|Generator Health I
Прочность генераторов II|Generator Health II
Прочность генераторов III|Generator Health III
Защита генератора I|Generator Protection I
Защита генератора II|Generator Protection II
Остаточное поле|Residual Field
Аварийный предохранитель|Emergency Fuse
прицельного залпа|aimed volley
урона броне|armor damage
прочности корпуса|body health
урона рывка|charge damage
скорости после разрушения|speed after destruction
стоимости ремонта|repair cost
с остаточного поля|s of residual field
Прицельный залп:|Aimed Volley:
к первому выстрелу по вручную закреплённому врагу, один раз на врага для каждой пушки за ночь.|on the first shot at a manually pinned enemy, once per enemy for each cannon per night.
Смена цели не обновляет бонус; все щупальца — один босс.|Changing targets does not reset the bonus; all tentacles share one boss.
Бонус использован по целям:|Targets with bonus spent:
Входящий урон|Incoming damage
урон рывка|charge damage
При разрушении: радиус|On destruction: radius
скорость врагов|enemy speed
на|for
Со светом и колоколом применяется сильнейшее замедление.|The strongest slow from light, bells and debris applies.
Стоимость ремонта|Repair cost
полный ремонт|full repair
Входящий урон корпуса|Body incoming damage
Каждый генератор добавляет|Each generator adds
к максимуму общего поля; скорость восстановления общая.|to the shared field maximum; recovery rate is shared.
Аварийный предохранитель: один раз за ночь переживает смертельный удар с не более 1 HP, без лечения.|Emergency fuse: once per night survives a lethal hit with at most 1 HP, without healing.
Предохранитель использован.|Fuse spent.
Предохранитель готов.|Fuse ready.
Остаточное поле: после разрушения сохраняет вклад в максимум на|Residual field: after destruction retains its maximum contribution for
Не добавляет заряд.|Adds no charge.
Без живых генераторов поле не восстанавливается.|The field cannot recover without living generators.
Остаточное поле активно:|Residual field active:
ОБЛОМКИ|DEBRIS

Бой продолжается. Направление наведения сохраняется до закрытия меню.|Combat continues. Aim direction is kept until the menu closes.
Ремонтный фонарь|Repair Lamp
Ремонтные фонари|Repair Lamps
Сила ремонта I|Repair Power I
Сила ремонта II|Repair Power II
Дальность ремонта|Repair Range
Запас ремонта I|Repair Charges I
Запас ремонта II|Repair Charges II
Защита фонаря|Lamp Protection
Аварийный ремонт|Emergency Repair
Аварийный ремонт использован.|Emergency repair used.
Аварийный ремонт готов.|Emergency repair ready.
Дальнобойная|Long-range
Сила дальнего света I|Long-range Power I
Сила дальнего света II|Long-range Power II
Ширина дальнего света I|Long-range Width I
Ширина дальнего света II|Long-range Width II
Дальность света +15%; сектор уже на 20%, урон ниже на 20%.|Beam range +15%; sector 20% narrower, damage 20% lower.
Урон луча ещё +4.|Beam damage +4 more.
Полная ширина сектора ещё +2°.|Full sector width +2° more.
Ограниченные заряды восстанавливают только потерянную в этой ночи прочность других устройств. Не ремонтирует фонари, маяк и щит.|Limited charges restore only health lost by other devices this night. Does not repair lamps, the lighthouse or shield.
Автоматический ремонт|Automatic repair
Заряды бесплатно обновляются при начале ночи.|Charges reset for free when a night starts.
Сначала ремонтируется наиболее повреждённое устройство по доле прочности.|Repairs the most damaged device by health ratio first.
Только повреждения текущей ночи, не выше прочности на старте.|Only damage from this night, capped at starting health.
Не ремонтирует себя, другие фонари, разрушенные или израсходованные устройства, маяк и поле.|Does not repair itself, other lamps, destroyed or consumed devices, the lighthouse or field.
Прочность на старте|Starting health
заряды|charges
зарядов на ночь|charges per night
предел — прочность цели на старте ночи|ceiling: target health at night start
предел ремонта|repair ceiling
прочности за ремонт|health per repair
один раз за ночь при прочности цели|once per night when target health is
от максимума, объём|of maximum, amount
один заряд, без ожидания интервала.|one charge, ignoring cooldown.

Мортира|Mortar
Мортиры|Mortars
Тлеющая|Smoldering
Урон мортир I|Mortar Damage I
Урон мортир II|Mortar Damage II
Взрыв мортир I|Mortar Blast I
Взрыв мортир II|Mortar Blast II
Быстрые снаряды|Fast Shells
Перезарядка мортир|Mortar Reload
Бронебойные осколки|Armor-piercing Shrapnel
Сила тления|Smoldering Power
Жар I|Heat I
Жар II|Heat II
Долгое тление|Long Smolder
Прямой урон луча +3.|Direct beam damage +3.
Урон горения +2 в секунду.|Burn damage +2 per second.
Урон горения ещё +2 в секунду.|Burn damage +2 more per second.
Остаточное горение длится ещё 1 с.|Residual burn lasts 1 s longer.
Прямой урон ниже; выбранные светом цели горят ещё 2 с. Горение обновляется, но не складывается.|Lower direct damage; targets selected by the beam burn for 2 s afterward. Burn refreshes without stacking.
Снаряд летит в выбранную точку и взрывается по наземным целям. Быстрые враги могут уйти из зоны взрыва.|The shell flies to a fixed point and explodes against ground targets. Fast enemies may escape the blast area.
Мортира бьёт по наземным целям и щупальцам. Снаряд летит в точку выстрела: быстрый враг может выйти из взрыва. Союзники не получают урон.|The mortar attacks ground targets and tentacles. Its shell flies to the firing point: fast enemies may escape the blast. Allies take no damage.
Это устройство не атакует летучих мышей.|This device cannot attack bats.
радиус взрыва|blast radius
радиуса взрыва|blast radius
скорость снаряда|shell speed
скорости снаряда|shell speed
множителя урона броне|armor damage multiplier
Горение|Burn
горение|burn
урон горения/с|burn damage/s
длительность горения|burn duration
после света|after illumination
Обновляется без сложения. Не занимает цели луча; у босса одно общее горение.|Refreshes without stacking. Does not occupy beam targets; the boss shares one burn.
ещё|more
Горят|Burning
ТЛЕЕТ|BURNING

Характеристики выбранного луча с улучшениями показаны ниже.|The selected beam stats including upgrades are shown below.

урона|damage

Одиночный выстрел по наземным и летающим целям, включая призраков.|Single shot against ground and flying enemies, including ghosts.
улучшений маяка|lighthouse upgrades
улучшений линз|lens upgrades
открытия линз|lens unlocks
к интервалу|to interval

Гарпунная башня|Harpoon Tower
Гарпунные башни|Harpoon Towers
Гарпун|Harpoon
Гарпун атакует наземные и летающие цели, а также щупальца.|The harpoon attacks ground enemies, flying enemies and tentacles.
Фокусирующая|Focused
Высокий урон одной цели; после 1,5 с непрерывного освещения урон ещё на 10% выше.|High damage to one target; after 1.5 s of continuous illumination, damage increases by another 10%.
Привод I|Rotation I
Привод II|Rotation II
Корпус маяка I|Lighthouse Hull I
Корпус маяка II|Lighthouse Hull II
Ёмкость поля I|Field Capacity I
Восстановление поля I|Field Recovery I
Сила вспышки I|Flash Power I
Восстановление вспышки I|Flash Recovery I
Урон пушек I|Cannon Damage I
Скорострельность пушек I|Cannon Fire Rate I
Дальность пушек I|Cannon Range I
Урон гарпунов I|Harpoon Damage I
Скорострельность гарпунов I|Harpoon Fire Rate I
Дальность гарпунов I|Harpoon Range I
Ровное сияние I|Steady Glow I
Ровное сияние II|Steady Glow II
Ширина света|Light Width
Дальний свет|Long Reach
Совместное освещение|Shared Illumination
Сила фокуса|Focus Power
Дальний фокус|Distant Focus
Удержание I|Sustained Focus I
Удержание II|Sustained Focus II
Урон луча +3.|Beam damage +3.
Урон луча ещё +3.|Beam damage +3 more.
Полная ширина сектора +2°.|Full sector width +2°.
Дальность луча +10.|Beam range +10.
Урон +10% при освещении двух подходящих целей.|Damage +10% while illuminating two eligible targets.
Урон луча +4.|Beam damage +4.
Дальность луча +15.|Beam range +15.
Бонус за непрерывное освещение ещё +5 п.п.|Continuous illumination bonus +5 percentage points.
Улучшения линз не меняют перезарядку вспышки.|Lens upgrades do not change the flash cooldown.
прочности маяка|lighthouse health
прочности на генератор|health per generator
щита/с|shield/s
урона вспышки|flash damage
урона за выстрел|damage per shot
с сокращения интервала|s of interval reduction
с к интервалу|s to interval
дальности|range
урон при освещении ≥2 врагов|damage while illuminating ≥2 enemies
урон после удержания|damage after sustained illumination
Удерживай одну враждебную зону в свете|Keep one hostile zone illuminated for
Смена цели, перекрытие или потеря света сбрасывают фокус.|Switching targets, occlusion or loss of illumination resets focus.
Каждое щупальце считается отдельно.|Each tentacle counts separately.
Корабль не накапливает фокус.|Ships cannot build focus.
Фокус сброшен · освети одну враждебную зону|Focus reset · illuminate one hostile zone
Фокус готов|Focus ready
Фокус|Focus
затем|then
удержание|sustained illumination
Устройство атакует её в пределах дальности.|The device attacks it while it is in range.
устройство ждёт её приближения.|the device waits for it to approach.
Устройство снова выбирает автоматически.|The device resumes automatic targeting.

НАСТРОЙКИ|SETTINGS
ЗВУК|SOUND
ВКЛ|ON
ВЫКЛ|OFF
МУЗЫКА|MUSIC
ЗВУКИ|EFFECTS
ЯЗЫК|LANGUAGE
АВТОМАТИЧЕСКИ|AUTOMATIC
РУССКИЙ|RUSSIAN
ТЕКСТ|TEXT
ОБЫЧНЫЙ|NORMAL
КРУПНЫЙ|LARGE
СОХРАНЯЕТСЯ АВТОМАТИЧЕСКИ|SAVED AUTOMATICALLY
НАЗАД|BACK
Свет Авалона|Light of Avalon
СВЕТ АВАЛОНА|LIGHT OF AVALON
СВЕТ|LIGHT OF
АВАЛОНА|AVALON
Маяк — ночной дозор|Lighthouse — Night Watch
МАЯК|LIGHTHOUSE
НОЧНОЙ ДОЗОР|NIGHT WATCH
ЛОКАЛЬНЫЙ ПРОТОТИП|LOCAL PROTOTYPE
СЕВЕРНЫЙ БЕРЕГ|NORTHERN SHORE
ПРОЧНОСТЬ МАЯКА|LIGHTHOUSE HEALTH
ПОДГОТОВКА|PREPARATION
Первый свет|First Light
Разбитый берег|Broken Shore
Крылатый прилив|Winged Tide
Сигнал бедствия|Distress Signal
Страж глубин|Warden of the Depths
Туманный берег|Misty Shore
Дальний берег|Far Shore
Удерживайте свет и учитесь переключать угрозы.|Keep the light steady and learn to switch between threats.
Быстрые угрозы испытывают прочность защиты.|Fast enemies put your defenses to the test.
Защищайте маяк и расстановку от угроз с обеих сторон.|Defend the lighthouse and your devices from both sides.
Необязательное испытание: помогите кораблю светом.|Optional challenge: guide the ship with your light.
Щупальца и общая угроза: завершите всю ночь.|Tentacles share one health pool. Survive the entire night.
Первая ночь новой главы.|The first night of a new chapter.
Защитите маяк.|Defend the lighthouse.
Искажённая летучая мышь|Twisted Bat
Искажённая черепаха|Twisted Turtle
Искажённый минотавр|Twisted Minotaur
Призрак|Ghost
Проходит сквозь барьеры. Медленно приближается, слабые удары.|Passes through barriers. Approaches slowly and deals weak blows.
Крепкая броня. Повреждения брони сохраняются при смене цели.|Heavy armor. Armor damage persists when you switch targets.
Готовит один рывок с усиленным ударом. Затем атакует обычно.|Prepares one charge with a powerful hit, then attacks normally.
Летит к ближайшему устройству, игнорирует барьеры и пушки.|Flies toward the nearest device, ignoring barriers and cannons.
Ближайшая цель; одиночный выстрел. Существа на пути могут её разрушить.|Fires single shots at the nearest target. Enemies can destroy it.
Задерживает черепаху. Призрак проходит насквозь.|Blocks turtles. Ghosts pass through.
Поддерживает общее поле вокруг маяка. Второй увеличивает запас щита.|Maintains a shared field around the lighthouse. A second generator increases shield capacity.
Одноразовый автоматический взрыв рядом с существом. Не оглушает.|Explodes automatically near an enemy. Single use; does not stun.
Наземный барьер|Ground Barrier
Световая ловушка|Light Trap
Генераторы щита|Shield Generators
Световые ловушки|Light Traps
Генератор|Generator
Пушка|Cannon
Пушки|Cannons
Барьеры|Barriers
Мощность II|Power II
Мощность I|Power I
Ширина II|Width II
Ширина I|Width I
Дальность II|Range II
Дальность I|Range I
Третий тип устройств|Third Device Type
Четвёртый тип устройств|Fourth Device Type
Связанный свет|Linked Light
Базовая|Basic
Расширенная|Expanded
Замедляющая|Slowing
Противоброневая|Armor Breaker
Ровный свет без компромиссов.|Balanced light with no trade-offs.
Шире сектор и больше целей; урон ниже.|Wider beam and more targets, with lower damage.
Замедляет выбранные светом цели; урон ниже.|Slows illuminated targets, with lower damage.
Быстрее разрушает броню одной цели узким лучом.|A narrow beam that breaks one target's armor faster.
Широкий сектор|Wide Beam
Четвёртая цель|Fourth Target
Глубокое замедление|Deep Slow
Сила контроля|Control Power
Разрушение брони|Armor Shatter
Сила пробоя|Piercing Power
Шире сектор света.|Widens the beam.
Ещё одна цель луча.|Adds one beam target.
Сильнее замедляет выбранные цели.|Slows selected targets further.
Увеличивает урон.|Increases damage.
Больше урона броне.|Increases armor damage.
Жемчуг глубин|Abyssal Pearls
Играть|Play
Настройки|Settings
Главное меню|Main Menu
Развитие маяка|Lighthouse Development
Назад|Back
Звук|Sound
Музыка|Music
Звуки|Effects
Эффекты|Effects
Вкл|On
Выкл|Off
Язык|Language
Автоматически|Automatic
Авто|Auto
Русский|Russian
Английский|English
Размер текста|Text Size
Обычный|Normal
Крупный|Large
Свет держит туман на расстоянии. Выбирай угрозу и защищай маяк.|Light keeps the fog at bay. Choose your target and defend the lighthouse.
Повторить сохранение|Retry Save
Вернуться к сохранённому|Restore Saved Settings
Изменения сохраняются автоматически.|Changes are saved automatically.
Ночь была прервана. Временные награды отброшены, стоимость устройств возвращена.|The night was interrupted. Temporary rewards were discarded and device costs refunded.
ПОСТОЯННОЕ РАЗВИТИЕ|PERMANENT DEVELOPMENT
Искусство света|The Art of Light
Баланс|Balance
Выбери знак, чтобы изучить его. Линии связывают улучшения с необходимыми предыдущими узлами.|Select a symbol to inspect it. Lines connect upgrades to their prerequisites.
Дерево улучшений|Upgrade Tree
Покупки сохраняются между ночами. Цены и эффекты предварительные.|Purchases persist between nights. Prices and effects are provisional.
Устройства и вспышка сохранены из старого профиля. Повторно покупать прежнее оснащение не требуется.|Devices and flash were retained from your previous profile. You do not need to buy them again.
ВЫБРАННОЕ УЛУЧШЕНИЕ|SELECTED UPGRADE
Куплено|Purchased
Доступно|Available
Закрыто: см. требования|Locked: see requirements
Не хватает осколков|Not enough shards
Текущее значение|Current Value
Сейчас → после покупки|Now → After Purchase
Без требований|No requirements
Требования|Requirements
Эффект|Effect
Цена|Price
Купить|Buy
Осколки|Shards
Мощность|Power
Ширина|Width
Дальность|Range
Устройства|Devices
Оборона|Defense
Переходы|Navigation
Выбор ночи|Night Selection
Глава|Chapter
Отдельное испытание|Separate Challenge
Необязательное событие. Не продвигает главу.|Optional event. Does not advance the chapter.
Пройдена · можно повторить|Completed · replay available
Доступна|Available
Закрыта|Locked
Неизвестное существо|Unknown Creature
существ|creatures
открыто|unlocked
закрыто|locked
слота типов|device type slots
при освещении ≥2 врагов|when lighting ≥2 enemies
урона/с|damage/s
ед.|units
НОЧЬ|NIGHT
Не дай свету|Keep the light
погаснуть.|burning.
Удерживай свет на угрозе и решай, кого остановить первым.|Keep the light on a threat and decide which enemy to stop first.
Разведка: состав волн|Scouting: Wave Composition
Постоянные улучшения доступны на отдельном экране развития. Черновик расстановки сохраняется при переходах, до старта или перезагрузки.|Permanent upgrades are available on the development screen. Your placement draft remains until you start a night or reload.
Полная ширина|Full Width
ИТОГ|RESULT
До рассвета.|Until Dawn.
Свет погас.|The Light Went Out.
Маяк выстоял. Берег снова принадлежит тебе.|The lighthouse survived. The shore is yours again.
Маяк разрушен. Попробуй раньше переключаться между угрозами.|The lighthouse fell. Try switching targets sooner.
Уничтожено|Defeated
За каждую победу|For every victory
включая повторное прохождение.|including repeat clears.
При победе|On victory
За победу|Victory reward
Итого|Total
За существ|Enemy Rewards
За досрочные волны|Early Wave Rewards
За спасение корабля|Ship Rescue Reward
Босс уничтожен, но ночь проиграна: материал не выдан, следующая глава не открыта, уровень босса не повышен.|The boss was defeated, but the night was lost: no materials, chapter unlock or boss level increase.
материал сохранён за победу во всей ночи|materials saved for surviving the entire night
ожидает сохранения результата|awaiting result save
Результат сохранён на этом устройстве|Result saved on this device
Результат ещё не сохранён. Повторите сохранение выше.|Result not saved yet. Retry saving above.
К новой подготовке|Prepare Again
ДЕЖУРСТВО ПРИОСТАНОВЛЕНО|WATCH PAUSED
Тихая минута.|A Quiet Moment.
Ночь ждёт. Направление света сохранено.|The night waits. Your beam direction is preserved.
Прервать эту ночь?|Abandon this night?
Все награды и новые встречи этой ночи будут потеряны. Стоимость расстановки|All rewards and new encounters from this night will be lost. Placement cost
будет возвращена один раз.|will be refunded once.
Остаться в паузе|Stay Paused
Прервать → подготовка|Abandon → Preparation
Прервать → главное меню|Abandon → Main Menu
Продолжить ночь|Continue Night
Прервать ночь|Abandon Night
ЗАЩИТА БЕРЕГА|SHORE DEFENSE
Расставить устройства|Place Devices
Выбери тип, затем нажми на поле. Клавиатура: Tab на поле, стрелки — прицел, Enter — установить. До старта можно удалить любой объект. Списание — только при начале ночи.|Select a type, then click the map. Keyboard: Tab to focus the map, arrows to aim, Enter to place. Remove any device before starting. Costs are charged when the night begins.
Устройства только на суше: весь круг объекта должен находиться слева от прямой береговой линии. Маяк стоит на границе суши и моря.|Place devices on land: their full circle must be left of the straight shoreline. The lighthouse stands at the edge of land and sea.
Круговая область расстановки: весь объект должен помещаться внутри пунктирной границы.|Circular placement area: the full device must fit inside the dashed boundary.
Закрыто · открой тип на экране развития маяка|Locked · unlock this type on the development screen
прочности|health
объектов|objects
Вспышка закрыта — открой её в развитии маяка.|Flash is locked — unlock it on the development screen.
Вспышка доступна во время боя.|Flash is available during battle.
Слоты типов|Type slots
Объекты|Objects
Поле расстановки. Стрелки перемещают прицел, Enter устанавливает устройство. Маяк в центре, пунктир — граница установки|Placement map. Arrow keys move the cursor, Enter places a device. The lighthouse is in the center; the dashed line is the placement boundary
СУША|LAND
МОРЕ|SEA
ОБЩЕЕ ПОЛЕ|SHARED FIELD
Нажми на свободное место внутри пунктирного круга|Click a free spot inside the dashed circle
на суше|on land
Сначала выбери тип устройства.|Select a device type first.
внутри поля|inside the field
вне поля|outside the field
Удалить|Remove
Голубая граница — одно общее поле вокруг маяка. Защищены объекты, полностью находящиеся внутри. Генератор добавляет|The blue boundary marks one shared field around the lighthouse. Objects fully inside are protected. Each generator adds
прочности; восстановление остаётся|capacity; regeneration stays at
с без ударов по полю или защищаемым целям.|s without hits to the field or protected targets.
Очистить расстановку|Clear Placement
Сохранённый баланс|Saved Balance
Цена расстановки|Placement Cost
После старта|After Start
Начать ночь|Start Night
Без устройств — бесплатно. Черновик не сохраняется при перезагрузке.|Free without devices. The draft is lost on reload.
Лимиты, цены и характеристики предварительные.|Limits, prices and stats are provisional.
Можно установить. Нажми для размещения.|Placement valid. Click to place.
Линзы и их улучшения|Lenses and Their Upgrades
Линзы · собственное развитие|Lenses · Individual Upgrades
Одна линза выбирается в подготовке. Постоянные улучшения маяка действуют с любой линзой. Параметры и цены предварительные.|Choose one lens during preparation. Permanent lighthouse upgrades apply to every lens. Stats and prices are provisional.
Базовые параметры|Base Stats
Открыта|Unlocked
Открыть|Unlock
открытая линза|unlocked lens
Перезарядка вспышки не меняется. Замедление луча действует только на выбранные цели; с замедлением босса применяется сильнейшее.|Flash cooldown stays unchanged. The beam slows only selected targets; the stronger of beam and boss slowing applies.
Выбор одной линзы|Single Lens Selection
Одна линза на ночь|One Lens per Night
Выбор бесплатный. До старта это черновик; выбранная линза сохраняется при начале ночи. Во время боя линзу менять нельзя. Закрытые линзы открываются в развитии.|Selection is free and remains a draft until the night starts. The lens is saved when you start. You cannot change lenses in battle. Unlock lenses on the development screen.
Текущие эффекты: скорость выбранной цели|Current effects: selected target speed
урон броне|armor damage
Противоброневая линза не усиливает урон здоровью.|The armor-breaking lens does not increase health damage.
Характеристики выбранного луча с улучшениями показаны ниже. Перезарядка вспышки не меняется.|The selected beam's upgraded stats appear below. Flash cooldown stays unchanged.
полная ширина|full width
множитель скорости|speed multiplier
множитель урона броне|armor damage multiplier
скорость цели|target speed
целей|targets
Урон|Damage
ширина|width
дальность|range
урон/с|damage/s
Израсходована|Consumed
Разрушено|Destroyed
Устройства на берегу|Devices on Shore
Устройства не установлены|No devices placed
Закреплено щупальце|Pinned tentacle
Закреплена цель|Pinned target
Вне дальности — пушка ждёт её приближения.|Out of range — the cannon waits for it to approach.
Пушка атакует её в пределах дальности.|The cannon attacks it while in range.
Автоматический выбор цели.|Automatic target selection.
Меню устройства|Device Menu
Закрыть|Close
Пушки не атакуют летучих мышей: их останавливает луч. Бой продолжается. Направление наведения сохраняется до закрытия меню.|Cannons cannot attack bats; use the beam. Battle continues. The aim direction is held until you close this menu.
Автоматический приоритет|Automatic Priority
Ближайший|Nearest
Самый сильный|Strongest
Самый слабый|Weakest
Указать врага|Choose Enemy
Сбросить в авто|Reset to Auto
Нажми на врага на поле или выбери из списка. Можно закрепить живую цель вне дальности|Click an enemy on the map or choose from the list. You can pin a living target beyond range
пушка ждёт её приближения. После смерти цели или сброса возвращается автоматический выбор.|the cannon waits for it to approach. Automatic selection resumes when the target dies or is reset.
Сейчас врагов нет|No enemies currently
Щупальце|Tentacle
общее здоровье босса|shared boss health
Автоматическая одноразовая ловушка|Automatic single-use trap
урона в радиусе|damage within radius
Без оглушения. После срабатывания израсходована.|No stun. Consumed on activation.
Поддерживает общее поле вокруг маяка. Каждый генератор добавляет|Maintains a shared field around the lighthouse. Each generator adds
к максимуму, скорость восстановления общая.|to capacity; regeneration is shared.
Преграда работает самостоятельно. Прочность между волнами не восстанавливается.|The barrier works on its own. Health does not regenerate between waves.
Устройство разрушено и больше не принимает команды.|The device is destroyed and cannot receive commands.
ОГЛУШЕНО|STUNNED
атака остановлена|attack stopped
ПЕРЕКРЫТО|BLOCKED
ПЕРЕКРЫТ|BLOCKED
Перекрыт|Blocked
В СВЕТЕ|LIT
замедлено|slowed
ЗАМЕДЛЕНО|SLOWED
СТОП АТАКИ|ATTACK STOPPED
уничтожен · отбей оставшиеся волны для награды|defeated · survive the remaining waves to earn the reward
ур.|lv.
свет|light
ОГЛУШЁН|STUNNED
ОГЛУШЕНИЕ|STUNNED
общее здоровье|shared health
Готовит рывок|Preparing charge
РАЗБЕГ! Усиленный удар|WINDUP! Heavy hit
РЫВОК! Усиленный удар|CHARGE! Heavy hit
Рывок израсходован|Charge spent
Летает · пушки не атакуют|Flying · cannons cannot attack
Корабль спасён|Ship rescued
Корабль упущен · бой продолжается|Ship lost · battle continues
Корабль|Ship
в свете|lit
ждёт света|waiting for light
осталось|remaining
за ночь|for the night
Цель недоступна: выбери живого врага.|Target unavailable: choose a living enemy.
Цель уничтожена или сброшена. Пушка снова выбирает автоматически.|Target defeated or reset. The cannon resumes automatic selection.
Закрыта · открой в развитии|Locked · unlock in development
Готова через|Ready in
Готова · урон + оглушение|Ready · damage + stun
Открой вспышку на экране развития маяка|Unlock flash on the development screen
Радиус|Radius
урон|damage
оглушение|stun
Общее поле|Shared Field
Восстановление через|Regeneration in
Удары по полю и защищаемым целям сбрасывают задержку.|Hits to the field or protected targets reset the delay.
Восстановление|Regeneration
Полный запас|Full capacity
Поле отсутствует: нет действующих генераторов|No field: no working generators
У босса общее здоровье. Свет замедляет освещённые щупальца и останавливает их атаки.|The boss has shared health. Light slows illuminated tentacles and stops their attacks.
Продолжить|Continue
Пауза|Pause
Состояние ночи|Night Status
Общее здоровье босса|Shared Boss Health
Берег ждёт|The shore awaits
Ночь приостановлена|Night paused
Все волны на берегу|All waves have arrived
Вызвать досрочно|Call Early
До следующей|Next wave in
бонус после её завершения|bonus after completion
Бонус — за завершённую досрочную волну|Bonus for completing an early wave
В свете|Lit
Базовая линза · до|Basic lens · up to
цель полностью закрыта другим существом|target fully blocked by another creature
Мышь — наведение · Касание — удержание и движение|Mouse to aim · Touch and drag to aim
За ночь|This night
бонус|bonus
спасение|rescue
черновик|draft
Команда выбора цели отправлена.|Target selection command sent.
Свет всегда включён|The light is always on
Следующая волна|Next Wave
Пунктир — дальность света|Dashed line — beam range
◇ — наведение · Поворот света|◇ — aim · Beam turning speed
°/с|°/s
Побережье с маяком: суша слева, море справа. Направляйте свет движением мыши или касанием.|Lighthouse coast: land on the left, sea on the right. Aim the light with your mouse or touch.
здоровье|health
броня|armor
получает урон|taking damage
меню / пауза|menu / pause
ВОЛНЫ|WAVES
ОТБИТО|CLEARED
Вспышка|Flash
Босс|Boss
уровень|level
награда|reward
за победу во всей ночи|for surviving the entire night
Требуется победа|Victory required
Оснащение сохранено из старого профиля|Equipment retained from the previous profile
Уже куплено|Already purchased
Требуется победа в ночи|Win this night first
Требуется|Requires
Не хватает ресурсов|Not enough resources
Можно купить за|Available for
Уже открыта|Already unlocked
Открыть за|Unlock for
материала босса|boss materials
Сначала откройте линзу и предыдущее улучшение|Unlock this lens and its prerequisite first
Купить за|Buy for
осколков и|shards and
Не хватает|Missing
осколков. Удалите устройства или начните без них.|shards. Remove devices or start without them.
Ночь изменена. Неоплаченная расстановка сброшена; ресурсы не списаны.|Night changed. The unpaid placement draft was cleared; no resources charged.
Выберите тип устройства.|Select a device type.
Не удалось сохранить или прочитать прогресс|Could not save or read progress
Настройки не подтверждены|Settings not confirmed
Повторите запись или вернитесь к сохранённым настройкам.|Retry saving or restore your saved settings.
Неизвестные или повреждённые настройки. Запись не изменена.|Unknown or corrupted settings. The stored record was not changed.
Настройки изменились извне. Перезагрузите игру.|Settings were changed externally. Reload the game.
Недопустимые координаты или тип устройства.|Invalid coordinates or device type.
Устройство ещё не открыто в дереве развития.|This device has not been unlocked in the upgrade tree.
Устройство должно целиком находиться на суше.|The entire device must be on land.
Общий предел|Total limit
объекта|objects
Предел для|Limit for
Заняты все слоты типов|All device type slots are occupied
За границей области размещения: объект должен целиком помещаться внутри.|Outside the placement area: the entire device must fit inside.
Пересечение с маяком.|Overlaps the lighthouse.
Пересечение с другим устройством.|Overlaps another device.
Можно разместить.|Placement valid.
Повторный или недопустимый id устройства.|Duplicate or invalid device ID.
Неизвестная версия сохранения. Файл не изменён.|Unknown save version. The file was not changed.
Повреждён профиль.|Corrupted profile.
Поля новой схемы в старом профиле.|New schema fields found in an old profile.
Повреждены открытия профиля.|Corrupted profile unlocks.
Повреждена запись попытки.|Corrupted attempt record.
Поля новой схемы в старой попытке.|New schema fields found in an old attempt.
Повреждён итог попытки.|Corrupted attempt result.
Несогласованная запись попытки.|Inconsistent attempt record.
Повреждено дерево улучшений.|Corrupted upgrade tree.
Нарушен порядок открытия ночей.|Invalid night unlock order.
Активная ночь ещё не открыта.|The active night is not unlocked yet.
Нарушены условия открытия улучшения.|Upgrade unlock conditions are not met.
Повреждены материалы или линзы.|Corrupted materials or lenses.
Уровень босса не соответствует победам.|Boss level does not match victories.
Линза попытки не открыта.|The attempt's lens is not unlocked.
Повреждены правила босса попытки.|Corrupted boss rules for this attempt.
Босс в обычной ночи.|Boss found in a regular night.
Сохранение изменилось в другой вкладке. Перезагрузите игру.|The save changed in another tab. Reload the game.
Улучшения доступны только между попытками.|Upgrades are available only between attempts.
Линзы доступны между попытками.|Lenses are available between attempts.
Предыдущая попытка ещё активна.|The previous attempt is still active.
Идентификатор попытки уже использован.|Attempt ID has already been used.
Устаревшие правила босса.|Outdated boss rules.
Недостаточно ресурсов.|Not enough resources.
Активная попытка не совпадает с результатом.|The active attempt does not match the result.
Неверная награда.|Invalid reward.
Неизвестная линза.|Unknown lens.
Неизвестное улучшение линзы.|Unknown lens upgrade.
Сигнал бедствия: держи корабль в свете|Distress signal: keep the ship in the light for
с до|s before
с. Он занимает одну цель луча. Корабль и существа перекрывают друг друга по общим правилам луча. Награда|s. It occupies one beam target. The ship and enemies block each other under the usual beam rules. Reward
спасение не требуется для победы.|rescue is not required for victory.
Все щупальца имеют общее здоровье|All tentacles share one health pool of
Свет замедляет щупальце и останавливает его атаку. Урон по освещённым щупальцам суммируется. Награда|Light slows a tentacle and stops its attack. Damage to illuminated tentacles is added together. Reward
и открытие следующей главы — только за победу во всей ночи.|and the next chapter unlock require surviving the entire night.
Каждая из|Each of the
целей получает полный урон. Полностью закрытые существом цели не получают свет.|targets takes full damage. Targets fully blocked by another creature receive no light.
Победа|Victory
после|after
до|up to
с|s
Для|For
требуется|requires
Пустой каталог ночей.|Empty night catalog.
Повторный идентификатор ночи.|Duplicate night ID.
Неверное определение ночи.|Invalid night definition.
Неверные правила ночи.|Invalid night rules.
Неверные правила корабля.|Invalid ship rules.
Неверные правила волны.|Invalid wave rules.
Неизвестная или недопустимая зависимость ночи.|Unknown or invalid night dependency.
Цикл зависимостей ночей.|Circular night dependencies.
Повторный идентификатор линзы или улучшения.|Duplicate lens or upgrade ID.
Неверные параметры линзы.|Invalid lens parameters.
Неверная цена или линза улучшения.|Invalid upgrade cost or lens.
Неверный эффект улучшения линзы.|Invalid lens upgrade effect.
Неизвестная зависимость улучшения линзы.|Unknown lens upgrade dependency.
Зависимость относится к другой линзе.|Dependency belongs to another lens.
Цикл зависимостей улучшений линз.|Circular lens upgrade dependencies.
Эффекты выводят параметры линзы за допустимые границы.|Effects put lens parameters outside their allowed range.
Повреждены открытия линз.|Corrupted lens unlocks.
Повторное улучшение линзы.|Duplicate lens upgrade.
Нарушены зависимости линз.|Invalid lens dependencies.
Повторный идентификатор улучшения|Duplicate upgrade ID
Неверная цена улучшения|Invalid upgrade cost
Неверный эффект улучшения|Invalid upgrade effect
Неверная ветвь или условие улучшения|Invalid upgrade branch or prerequisite
Цикл зависимостей улучшений|Circular upgrade dependencies
Неизвестная зависимость улучшения|Unknown upgrade dependency
Неизвестное улучшение|Unknown upgrade
Повторная покупка улучшения в сохранении|Duplicate upgrade purchase in save
Расстановка бесплатна и сохраняется между ночами и перезагрузками.|Placement is free and persists between nights and reloads.
в запасе готово|ready in reserve
Купить экземпляр|Buy device
Мои устройства|My devices
Открытие типа даёт первый экземпляр. Полный ремонт — до 25% цены. Повреждённые устройства работают; разрушенные и израсходованные требуют восстановления.|Unlocking a type grants its first device. Full repair costs up to 25% of its price. Damaged devices work; destroyed and spent devices require restoration.
На поле|Deployed
В запасе|In reserve
В запас|Move to reserve
Прочность|Health
Заряд израсходован|Charge spent
Заряд готов|Charge ready
Ремонт|Repair
Перезарядить|Recharge
Все устройства в запас|Move all devices to reserve
Расстановка бесплатна|Free placement
Баланс после старта|Balance after start
Начать ночь · бесплатно|Start night · free
Экземпляры, прочность, заряд и расстановка сохраняются.|Devices, health, charges and placement are saved.
Устройства и расстановка сохраняются между ночами и перезагрузками.|Devices and placement persist between nights and reloads.
Устройства вернутся к состоянию перед началом ночи. Покупки и ремонт подготовки сохраняются.|Devices return to their state before the night. Preparation purchases and repairs are kept.
Не хватает осколков для покупки.|Not enough shards to buy.
Не хватает осколков для ремонта.|Not enough shards to repair.
Не хватает осколков для перезарядки.|Not enough shards to recharge.
Выбери тип, затем нажми на поле. Клавиатура: Tab на поле, стрелки — прицел, Enter — установить. До старта можно удалить любой объект.|Select a type, then click the map. Keyboard: Tab to focus the map, arrows to aim, Enter to place. Remove any device before starting.
Нет готового экземпляра в запасе. Купите, восстановите или уберите устройство с поля.|No ready device in reserve. Buy, restore or move a deployed device to reserve.
Ночь была прервана. Временные награды отброшены; устройства восстановлены к состоянию начала ночи.|The night was interrupted. Temporary rewards were discarded; devices were restored to their state before the night.
Постоянные улучшения доступны на отдельном экране развития.|Permanent upgrades are available on the development screen.

Колокола сдерживания|Containment bells
Колокол сдерживания|Containment bell
Автоматические импульсы замедляют существ и щупальца, включая летающих. Не наносит урон.|Automatic pulses slow creatures and tentacles, including flying enemies. Deals no damage.
Радиус колокола|Bell radius
Долгий звон|Long toll
Частый звон|Frequent toll
Защита колокола|Bell protection
Первый набат|First alarm
Резонансная|Resonant
После 2 с непрерывного освещения нескольких вражеских зон прямой урон +25%. При потере пары резонанс сбрасывается.|After 2 s of continuously lighting multiple hostile zones, direct damage increases by 25%. Losing the pair resets resonance.
Сила резонанса|Resonance power
Ширина резонанса|Resonance width
Созвучие|Harmony
Прямой урон луча +4.|Direct beam damage +4.
Полная ширина сектора +4°.|Full sector width +4°.
Бонус резонанса ещё +10 п.п.|Resonance bonus increases by 10 percentage points.
Колокол автоматически замедляет наземных и летающих врагов и щупальца. Не наносит урон и не останавливает атаки.|The bell automatically slows ground and flying enemies and tentacles. Deals no damage and does not stop attacks.
Применяется сильнейшее замедление.|Only the strongest slow applies.
Щупальца считаются отдельно; корабль не считается.|Tentacles count separately; ships do not count.
При менее двух зонах резонанс сбрасывается.|Fewer than two zones resets resonance.
Бонус складывается со связанным светом.|The bonus adds to paired light.
Резонанс сброшен|Resonance reset
освети ≥2 враждебные зоны|light ≥2 hostile zones
Резонанс готов|Resonance ready
Резонанс|Resonance
резонанс ≥2 зон|resonance ≥2 zones
урон резонанса|resonance damage
входящего урона|incoming damage
скорости первого импульса|first pulse speed
с замедления|s of slow
радиуса|radius
без урона|no damage
радиус|radius
интервал|interval
импульс каждые|pulse every
с при наличии врага|s while enemies are present
замедление|slow
скорость|speed
первый импульс|first pulse
входящий урон|incoming damage
КОЛОКОЛ|BELL
Держи любые ≥2 враждебные зоны в свете|Keep any ≥2 hostile zones lit for
затем|then
зарядов|charges
Без оглушения.|No stun.
Автоматический взрыв рядом с существом. Остаток зарядов сохраняется между ночами; перезарядка оплачивается отдельно. Не оглушает.|Explodes automatically near an enemy. Remaining charges persist between nights; recharging is paid separately. Does not stun.
ГАРПУН|HARPOON
Заряды|Charges
Следующий взрыв через|Next explosion in
Готова к срабатыванию|Ready to trigger
Автоматическая ловушка|Automatic trap
радиус срабатывания|trigger radius
задержка между взрывами|delay between explosions
Расходует один заряд за взрыв.|Uses one charge per explosion.
Ремонт корпуса и платное пополнение зарядов независимы.|Hull repair and paid charge refill are independent.
Трос: скорость|Tether: speed
с после попадания.|s after a hit.
Только движение; атаки продолжаются.|Movement only; attacks continue.
Со светом, колоколом и обломками применяется сильнейшее замедление.|Only the strongest slow from light, bells, debris and harpoons applies.
скорости троса|tether speed
урона летающим|flying damage
урон летающим|flying damage
урона взрыва|explosion damage
Урон гарпунов II|Harpoon damage II
Скорострельность гарпунов II|Harpoon fire rate II
Сдерживающий трос|Restraining tether
Воздушный перехват|Air interception
Урон ловушек I|Trap damage I
Урон ловушек II|Trap damage II
Радиус взрыва I|Blast radius I
Радиус взрыва II|Blast radius II
Прочный корпус ловушки|Sturdy trap hull
Бронебойная вспышка|Armor-piercing blast
Второй заряд|Second charge
`.trim().split('\n').filter(line => line.trim()).map(line => line.split('|') as [string, string]);

const dictionary = new Map(entries);
const alternatives = entries.map(([source]) => source).sort((a, b) => b.length - a.length)
  .map(source => source.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&')).join('|');
const matcher = new RegExp('(?<![\\p{L}])(?:' + alternatives + ')(?![\\p{L}])', 'gu');

export function translate(text: string, language: Language): string {
  return language === 'ru' ? text : text.replace(matcher, source => dictionary.get(source)!);
}

type Original = { source: string; rendered: string };
const originalText = new WeakMap<Node, Original>();
const originalAttributes = new WeakMap<Element, Map<string, Original>>();
const localizedAttributes = ['aria-label', 'aria-description', 'aria-valuetext', 'title', 'placeholder', 'alt'];
function update(current: string, previous: Original | undefined, language: Language): Original {
  const source = previous && current === previous.rendered ? previous.source : current;
  return { source, rendered: translate(source, language) };
}
/** Idempotent, reversible projection; fresh Russian text written by the HUD replaces the stored source. */
export function localizeRoot(root: HTMLElement, language: Language): void {
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      const result = update(node.nodeValue ?? '', originalText.get(node), language);
      originalText.set(node, result);
      if (node.nodeValue !== result.rendered) node.nodeValue = result.rendered;
      return;
    }
    if (node.nodeType === 1) {
      const element = node as Element;
      if (['SCRIPT', 'STYLE', 'TEXTAREA'].includes(element.tagName)) return;
      const attributes = originalAttributes.get(element) ?? new Map<string, Original>();
      originalAttributes.set(element, attributes);
      for (const name of localizedAttributes) {
        const value = element.getAttribute(name);
        if (value === null) { attributes.delete(name); continue; }
        const result = update(value, attributes.get(name), language);
        attributes.set(name, result);
        if (value !== result.rendered) element.setAttribute(name, result.rendered);
      }
    }
    for (const child of node.childNodes) visit(child);
  };
  visit(root);
}
