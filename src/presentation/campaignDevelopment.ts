import type { ApplicationView, DeviceKind } from '../contracts';
import type { CampaignTreeCategory } from '../content/campaignTreeDraft';
import type { CampaignPurchaseBlocker, CampaignPurchaseStat, CampaignPurchaseView } from '../progression/campaignProgression';
import { resolveLanguage, translate, type Language } from './shared/localization';
import { preparationEscape as escape } from './preparation/preparationArtwork';
import { watchAsset, watchIcon, watchIllustration } from './shared/watchArtwork';
import './campaignEconomy.css';

const groups = ['general', 'device', 'lens', 'ability'] as const;
const groupNames = {
  all: ['Все', 'All'], available: ['Только доступные', 'Available only'],
  general: ['Общие', 'General'], device: ['Устройства', 'Devices'],
  lens: ['Линзы', 'Lenses'], ability: ['Способности', 'Abilities'],
} as const;
const commonBranches = {
  light: ['Свет и оптика', 'Light and optics'], hull: ['Корпус', 'Hull'],
  field: ['Поле', 'Shield'], engineering: ['Инженерия', 'Engineering'],
} as const;
const statNames: Record<string, readonly [string, string]> = {
  damagePerSecond: ['Урон в секунду', 'Damage per second'], range: ['Дальность', 'Range'],
  halfAngle: ['Полуугол сектора', 'Sector half-angle'], turnSpeed: ['Скорость поворота', 'Turn speed'],
  cooldownSeconds: ['Перезарядка, с', 'Cooldown, s'], durationSeconds: ['Длительность, с', 'Duration, s'],
  damageBonus: ['Бонус урона', 'Damage bonus'], health: ['Прочность', 'Health'],
  lighthouseHealth: ['Прочность маяка', 'Lighthouse health'], radius: ['Радиус', 'Radius'],
  maxTargets: ['Предел целей', 'Maximum targets'], unlocked: ['Доступ', 'Access'],
  maxObjects: ['Лимит объектов', 'Maximum devices'], typeSlots: ['Слоты типов', 'Type slots'],
  damageReduction: ['Снижение урона', 'Damage reduction'], pairedDamageBonus: ['Урон по двум целям', 'Paired damage bonus'],
  abilityReductionCap: ['Предел защиты способности', 'Ability protection cap'],
  additionalAttacksPerWeapon: ['Добавочные выстрелы на орудие', 'Extra attacks per weapon'],
  airDamageBonus: ['Бонус урона по воздуху', 'Damage bonus against air'],
  armorDamageBonus: ['Бонус урона по броне', 'Armor damage bonus'],
  blastRadiusBonus: ['Бонус радиуса взрыва', 'Blast radius bonus'],
  damageBonusCap: ['Предел бонуса урона', 'Damage bonus cap'],
  entrySeconds: ['Длительность замедления при входе, с', 'Entry slow duration, s'],
  entrySpeedMultiplier: ['Множитель скорости при входе', 'Entry speed multiplier'],
  fadeReduction: ['Остаточное снижение урона', 'Residual damage reduction'],
  fadeSeconds: ['Длительность остаточной защиты, с', 'Residual protection duration, s'],
  guidanceDamageBonus: ['Бонус урона от наведения', 'Guidance damage bonus'],
  heavyReduction: ['Защита от тяжёлых ударов', 'Heavy attack reduction'],
  initiallyReady: ['Готовность в начале ночи', 'Ready at night start'],
  lingeringSeconds: ['Остаточное замедление, с', 'Lingering slow, s'],
  litDamageBonus: ['Бонус урона по освещённым', 'Damage bonus against lit targets'],
  mechanismReduction: ['Защита корпусов', 'Device protection'],
  minimumSpeedMultiplier: ['Минимальный множитель скорости', 'Minimum speed multiplier'],
  projectileSpeedBonus: ['Бонус скорости снаряда', 'Projectile speed bonus'],
  speedMultiplier: ['Множитель скорости', 'Speed multiplier'],
  targetingRange: ['Дальность наведения', 'Targeting range'],
  totalReductionCap: ['Общий предел защиты', 'Total protection cap'],
  turnSpeedBonus: ['Бонус скорости поворота', 'Turn speed bonus'],
  turnSpeedBonusCap: ['Предел бонуса скорости поворота', 'Turn speed bonus cap'],
  durationMultiplier: ['Множитель длительности', 'Duration multiplier'],
  reduction: ['Снижение урона', 'Damage reduction'],
  totalDeviceReductionCap: ['Общий предел защиты устройств', 'Total device protection cap'],
  additionalSeconds: ['Добавочная длительность, с', 'Additional duration, s'],
  bonus: ['Бонус урона', 'Damage bonus'],
  combinedConditionalBonusCap: ['Суммарный предел ситуативных бонусов', 'Combined conditional bonus cap'],
  totalHullReductionCap: ['Общий предел защиты маяка', 'Total lighthouse protection cap'],
  fadeInSeconds: ['Нарастание эффекта, с', 'Ramp-up, s'],
  fadeOutSeconds: ['Угасание эффекта, с', 'Fade-out, s'],
  fullBonusAngle: ['Угол полного бонуса', 'Full bonus angle'],
  normalSpeedAngle: ['Угол обычной скорости', 'Normal speed angle'],
  speedBonus: ['Бонус скорости', 'Speed bonus'],
  regenerationBonus: ['Бонус восстановления', 'Regeneration bonus'],
  breakSlowMultiplier: ['Множитель скорости после разрушения', 'Speed multiplier after destruction'],
  chargeDamageMultiplier: ['Множитель урона рывка', 'Charge damage multiplier'],
  incomingDamageMultiplier: ['Множитель входящего урона', 'Incoming damage multiplier'],
  repairCostMultiplier: ['Множитель стоимости ремонта', 'Repair cost multiplier'],
  duration: ['Длительность, с', 'Duration, s'],
  firstPulseSlowMultiplier: ['Множитель скорости при первом импульсе', 'First pulse speed multiplier'],
  armorMultiplier: ['Множитель урона броне', 'Armor damage multiplier'],
  manualDamageBonus: ['Бонус прицельного залпа', 'Manual volley bonus'],
  attackInterval: ['Интервал атак, с', 'Attack interval, s'],
  damage: ['Урон', 'Damage'],
  lastStandEnabled: ['Последний рубеж', 'Last stand'],
  residualSeconds: ['Остаточное поле, с', 'Residual field, s'],
  flyingDamageMultiplier: ['Множитель урона по летающим', 'Damage multiplier against flying targets'],
  slowMultiplier: ['Множитель скорости цели', 'Target speed multiplier'],
  blastRadius: ['Радиус взрыва', 'Blast radius'],
  projectileSpeed: ['Скорость снаряда', 'Projectile speed'],
  charges: ['Заряды', 'Charges'],
  emergencyEnabled: ['Аварийный ремонт', 'Emergency repair'],
  healAmount: ['Прочность за ремонт', 'Health restored'],
  cooldown: ['Перезарядка, с', 'Cooldown, s'],
  damagedArmorBonus: ['Бонус по повреждённой броне', 'Damage bonus against damaged armor'],
  enabled: ['Доступ', 'Access'],
  reloadAssist: ['Ускорение перезарядки, с', 'Cooldown reduction, s'],
  stunDuration: ['Оглушение, с', 'Stun duration, s'],
  seconds: ['Длительность, с', 'Duration, s'],
  id: ['Линза', 'Lens'],
  beamArmorBonus: ['Бонус урона луча по броне', 'Beam armor damage bonus'],
  beamExecuteBonus: ['Бонус луча по ослабленным целям', 'Beam damage bonus against weakened targets'],
  lighthouseDamageReduction: ['Защита маяка', 'Lighthouse protection'],
  lighthouseEmergencyReduction: ['Аварийная защита маяка', 'Emergency lighthouse protection'],
  lighthouseHeavyReduction: ['Защита маяка от тяжёлых ударов', 'Lighthouse protection against heavy attacks'],
  lighthouseWaveRepair: ['Прочность за завершённую волну', 'Health restored per cleared wave'],
  litDeviceDamageBonus: ['Бонус орудий по освещённым', 'Weapon damage bonus against lit targets'],
  shieldRestoreReduction: ['Защита при восстановлении щита', 'Protection on shield recovery'],
  rechargeCostMultiplier: ['Множитель стоимости зарядов', 'Recharge cost multiplier'],
  capacityPerGenerator: ['Прочность поля на генератор', 'Shield capacity per generator'],
  regenerationDelay: ['Задержка восстановления, с', 'Recovery delay, s'],
  regenerationPerSecond: ['Восстановление в секунду', 'Recovery per second'],
};
const angleValues = new Set(['halfAngle', 'normalSpeedAngle', 'fullBonusAngle', 'turnSpeed']);
const numberFormats = { ru: new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }), en: new Intl.NumberFormat('en', { maximumFractionDigits: 2 }) };

const languageOf = (view: ApplicationView): Language => resolveLanguage(view.settings.language, undefined, typeof navigator === 'undefined' ? [] : navigator.languages);
type Group = CampaignTreeCategory | 'all' | 'available';

function nodeName({ node }: CampaignPurchaseView, language: Language): string {
  const rank = node.name.match(/^(.+) (I|II|III|IV|V|VI)$/);
  const name = translate(node.name, language);
  return escape(name === node.name && language === 'en' && rank ? `${translate(rank[1]!, language)} ${rank[2]}` : name);
}

function branchId({ node }: CampaignPurchaseView): string {
  return node.category === 'general' && node.branch === 'optics' ? 'general:light' : `${node.category}:${node.branch}`;
}

function branchName(view: ApplicationView, entry: CampaignPurchaseView, language: Language): string {
  const { node } = entry;
  if (node.category === 'general') return commonBranches[node.branch === 'optics' ? 'light' : node.branch as keyof typeof commonBranches][language === 'en' ? 1 : 0];
  if (node.category === 'ability') {
    const ability = view.campaign?.abilities.find(item => item.id === node.branch);
    if (ability) return ability[language];
  }
  const label = node.category === 'device' ? view.config.devices.definitions[node.branch as DeviceKind]?.name
    : view.lenses.find(lens => lens.definition.id === node.branch)?.definition.name;
  return translate(label ?? node.branch, language);
}

function artwork({ node }: CampaignPurchaseView): string {
  if (node.category === 'device') {
    const sprite = node.branch === 'cannon' ? 'shore-cannon' : node.branch === 'barrier' ? 'palisade' : node.branch;
    return watchAsset('world/' + sprite);
  }
  if (node.category === 'ability') return watchAsset('ui/icon-charge');
  if (node.branch === 'hull') return watchAsset('ui/icon-heart');
  if (node.branch === 'field') return watchAsset('ui/icon-shield');
  if (node.branch === 'engineering') return watchAsset('ui/icon-gear');
  if (node.id.startsWith('beam-width-')) return watchAsset('ui/icon-target');
  return watchAsset(node.id.includes('paired') ? 'navigation/paired-optic' : 'navigation/optic');
}

function status(entry: CampaignPurchaseView, en: boolean): string {
  return entry.purchased ? en ? 'Purchased' : 'Куплено'
    : entry.available ? en ? 'Available' : 'Доступно' : en ? 'Locked' : 'Недоступно';
}

function nodeAction(id: string, filter: Group, key: string): string {
  return `data-action="campaign-select-node" data-node="${escape(id)}" data-filter="${filter}" data-focus-key="${escape(key + id)}"`;
}

const opticalPlate = new Map([
  ['beam-power-1', { x: 86, y: 39 }], ['beam-power-2', { x: 250, y: 39 }],
  ['beam-width-1', { x: 86, y: 142 }], ['beam-width-2', { x: 250, y: 142 }],
  ['paired-light', { x: 263, y: 94 }],
]);

function circuit(entries: readonly CampaignPurchaseView[], selected: CampaignPurchaseView, filter: Group, lang: Language): string {
  const byId = new Map(entries.map(entry => [entry.node.id, entry]));
  const engraved = [...opticalPlate.keys()].every(id => byId.has(id));
  const depths = new Map<string, number>();
  const depth = (entry: CampaignPurchaseView): number => {
    const { id, requires } = entry.node;
    if (!depths.has(id)) depths.set(id, Math.max(0, ...requires.flatMap(parent => {
      const input = byId.get(parent);
      return input ? [1 + depth(input)] : [];
    })));
    return depths.get(id)!;
  };
  const columns = Array.from({ length: Math.max(...entries.map(depth)) + 1 }, () => [] as CampaignPurchaseView[]);
  for (const entry of entries) {
    if (!engraved || !opticalPlate.has(entry.node.id)) columns[depth(entry)]!.push(entry);
  }
  const height = 188;
  const positions = engraved ? new Map(opticalPlate) : new Map<string, { x: number; y: number }>();
  let width = engraved ? 350 : 0;
  for (const column of columns) {
    for (let offset = 0; offset < column.length; offset += 3) {
      const lane = column.slice(offset, offset + 3);
      for (const [row, entry] of lane.entries()) {
        positions.set(entry.node.id, { x: width + 72, y: (row + .43) * height / lane.length });
      }
      width += 144;
    }
  }
  const paths = entries.flatMap(entry => entry.node.requires.flatMap(parent => {
    const start = positions.get(parent), end = positions.get(entry.node.id);
    if (!start || !end) return [];
    const lead = Math.sign(end.x - start.x) * Math.min(38, Math.abs(end.x - start.x) / 3);
    const offPlate = engraved && !(opticalPlate.has(parent) && opticalPlate.has(entry.node.id));
    return [`<path data-from="${escape(parent)}" data-to="${escape(entry.node.id)}" data-related="${entry.node.id === selected.node.id}" data-met="${byId.get(parent)!.purchased}" data-off-plate="${offPlate}" d="M${start.x} ${start.y} H${start.x + lead} L${end.x - lead} ${end.y} H${end.x}"/>`];
  }));
  return `<div class="campaign-circuit" style="--circuit-w:${width}px;${engraved ? `--optical-span:${width / 3.5}cqw;` : ''}">
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${paths.join('')}</svg>
    ${entries.map(entry => {
      const { id } = entry.node, point = positions.get(id)!, current = id === selected.node.id;
      const state = entry.purchased ? 'purchased' : entry.available ? 'available' : 'locked';
      const socket = id === 'paired-light' ? 'paired' : id.startsWith('beam-width-') ? 'wide' : 'round';
      const medal = watchAsset(`navigation/optics-${socket}-${current ? 'selected' : state === 'locked' ? 'locked' : 'available'}`);
      return `<button type="button" class="campaign-circuit-node" ${nodeAction(id, filter, 'campaign-select-')}
        data-state="${state}" data-socket="${socket}" aria-pressed="${current}"
        aria-label="${nodeName(entry, lang)} · ${status(entry, lang === 'en')}"
        style="left:${point.x / width * 100}%;top:${point.y / height * 100}%;--circuit-medal:url('${medal}')">
        <span class="campaign-circuit-medal"><img src="${artwork(entry)}" alt="" draggable="false"></span>
        ${state === 'available' ? '' : `<span class="campaign-circuit-mark">${watchIcon(state === 'purchased' ? 'check' : 'lock')}</span>`}
        <span class="campaign-circuit-label">${nodeName(entry, lang)}</span>
      </button>`;
    }).join('')}</div>`;
}

function requirement(id: string, byId: ReadonlyMap<string, CampaignPurchaseView>, filter: Group, lang: Language): string {
  const parent = byId.get(id);
  if (!parent) return '';
  const fits = filter === 'all' || (filter === 'available' ? parent.available : parent.node.category === filter);
  return `<li data-met="${parent.purchased}">${watchIcon(parent.purchased ? 'check' : 'lock')}<button type="button" ${nodeAction(id, fits ? filter : 'all', 'campaign-requirement-')}>${nodeName(parent, lang)}</button></li>`;
}

function reasonText(reason: CampaignPurchaseBlocker, en: boolean): string {
  switch (reason.code) {
    case 'purchased': return en ? 'Purchased' : 'Куплено';
    case 'wins': return en ? `Story victories required: ${reason.required} (${reason.missing} missing)`
      : `Нужно сюжетных побед: ${reason.required} (не хватает ${reason.missing})`;
    case 'requires': return '';
    case 'shards': return en ? `Missing shards: ${reason.missing}` : `Не хватает осколков: ${reason.missing}`;
    case 'pearls': return en ? `Missing pearls: ${reason.missing}` : `Не хватает жемчуга: ${reason.missing}`;
  }
}

function statValue(view: ApplicationView, key: string, value: CampaignPurchaseStat['current'], lang: Language): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return (lang === 'en' ? ['No', 'Yes'] : ['Нет', 'Да'])[Number(value)]!;
  if (typeof value === 'string') return escape(translate(view.lenses.find(lens => lens.definition.id === value)?.definition.name ?? value, lang));
  if (angleValues.has(key)) return `${numberFormats[lang].format(value * 180 / Math.PI)}°${key === 'turnSpeed' ? lang === 'en' ? '/s' : '/с' : ''}`;
  if (/Bonus(Cap)?$|Reduction(Cap)?$|^bonus$|^reduction$/.test(key) && key !== 'beamArmorBonus') {
    return `${numberFormats[lang].format(value * 100)}%`;
  }
  return numberFormats[lang].format(value);
}

function inspector(view: ApplicationView, entry: CampaignPurchaseView, byId: ReadonlyMap<string, CampaignPurchaseView>, filter: Group, lang: Language): string {
  const { node, stats, reasons, available, purchased } = entry, en = lang === 'en';
  const price = [node.shards ? `<span>${watchIcon('coin')}${node.shards} ${en ? 'shards' : 'осколков'}</span>` : '',
    node.pearls ? `<span>${watchIcon('pearl')}${node.pearls} ${en ? 'pearls' : 'жемчужин'}</span>` : ''].filter(Boolean).join('');
  const reason = reasons.map(blocker => reasonText(blocker, en)).filter(Boolean);
  const caption = `${groupNames[node.category][en ? 1 : 0]} · ${branchName(view, entry, lang)}`;
  return `<aside class="campaign-upgrade-inspector watch-panel watch-gold" aria-labelledby="campaign-upgrade-title">
    <div class="economy-inspector-body">
      <div class="economy-relic"><img src="${watchIllustration('relic')}" alt="" draggable="false"></div>
      <p class="economy-branch">${escape(caption)}</p>
      <h2 id="campaign-upgrade-title" tabindex="-1" data-purchase-heading="${escape(node.id)}" data-focus-key="campaign-heading-${escape(node.id)}">${nodeName(entry, lang)}</h2>
      ${stats.length ? `<dl class="campaign-upgrade-stats">${stats.map(stat => {
        const name = stat.key.split('.').at(-1) ?? stat.key;
        const label = stat.key.startsWith('deviceUnlocked.') ? statNames.unlocked![en ? 1 : 0] : statNames[name]?.[en ? 1 : 0] ?? name;
        return `<div><dt>${escape(label)}</dt><dd>${statValue(view, name, stat.current, lang)} <span>→</span> ${statValue(view, name, stat.next, lang)}</dd></div>`;
      }).join('')}</dl>` : ''}
      ${node.requires.length ? `<ul class="campaign-requirements" aria-label="${en ? 'Prerequisites' : 'Требования'}">${node.requires.map(id => requirement(id, byId, filter, lang)).join('')}</ul>` : ''}
      ${reason.length ? `<ul class="campaign-blockers">${reason.map(line => `<li>${escape(line)}</li>`).join('')}</ul>` : ''}
    </div>
    <footer class="campaign-upgrade-actions">${price ? `<p id="campaign-upgrade-price" class="economy-price">${price}</p>` : ''}
      <button class="watch-button watch-primary" type="button" data-action="campaign-purchase" data-node="${escape(node.id)}" data-focus-key="campaign-node-${escape(node.id)}"
        ${price ? 'aria-describedby="campaign-upgrade-price"' : ''} ${!available || view.error ? 'disabled' : ''}>${watchIcon(purchased ? 'check' : available ? node.shards ? 'coin' : 'pearl' : 'lock')}
        ${purchased ? en ? 'Purchased' : 'Куплено' : available ? en ? 'Purchase' : 'Купить' : en ? 'Unavailable' : 'Недоступно'}</button>
    </footer>
  </aside>`;
}

export function campaignDevelopment(view: ApplicationView, requestedFilter: string, selectedId?: string): string {
  if (!view.campaign) return '';
  const filter: Group = Object.hasOwn(groupNames, requestedFilter) ? requestedFilter as Group : 'all';
  const lang = languageOf(view), en = lang === 'en';
  const purchases = view.campaign.purchases;
  const byId = new Map(purchases.map(entry => [entry.node.id, entry]));
  const shown = purchases.filter(entry => filter === 'all' || (filter === 'available' ? entry.available : entry.node.category === filter));
  const first = shown[0];
  const selected = shown.find(entry => entry.node.id === selectedId)
    ?? (first && shown.find(entry => entry.available && branchId(entry) === branchId(first)))
    ?? first;
  const branches = new Map<string, CampaignPurchaseView>();
  for (const entry of shown) if (!branches.has(branchId(entry))) branches.set(branchId(entry), entry);
  const activeBranch = selected ? branchId(selected) : '';
  const branchEntries = shown.filter(entry => branchId(entry) === activeBranch);
  const filters = ['all', ...groups] as const;
  const filterButton = (id: Group) => `<button type="button" class="watch-button" data-action="campaign-filter" data-filter="${id}" data-focus-key="campaign-filter-${id}" aria-pressed="${id === filter}">${groupNames[id][en ? 1 : 0]}</button>`;
  return `<section class="campaign-development economy-screen" data-text-size="${view.settings.textSize}">
    <header class="economy-header"><button type="button" class="watch-button economy-back" data-action="back" aria-label="${en ? 'Back' : 'Назад'}">${watchIcon('back')}</button>
      <h1 tabindex="-1">${en ? 'Upgrades' : 'Улучшения'}</h1><div class="economy-wallet">
        <span aria-label="${view.profile.resources} ${en ? 'shards' : 'осколков'}">${watchIcon('coin')}${view.profile.resources}</span>
        <span aria-label="${view.profile.bossMaterials} ${en ? 'pearls' : 'жемчужин'}">${watchIcon('pearl')}${view.profile.bossMaterials}</span>
      </div></header>
    <nav class="campaign-filters" aria-label="${en ? 'Upgrade filters' : 'Фильтры улучшений'}">
      <details name="campaign-upgrade-menus" class="campaign-chart-picker campaign-group-picker"><summary class="watch-button" data-focus-key="campaign-groups"
        aria-label="${en ? 'Upgrade group' : 'Группа улучшений'}: ${groupNames[filter === 'available' ? 'all' : filter][en ? 1 : 0]}">${groupNames[filter === 'available' ? 'all' : filter][en ? 1 : 0]} <span aria-hidden="true">▾</span></summary>
        <div class="watch-panel">${filters.map(filterButton).join('')}</div></details>
      ${selected ? `<details name="campaign-upgrade-menus" class="campaign-chart-picker"><summary class="watch-button" data-focus-key="campaign-branches">${en ? 'Branches' : 'Ветви'}</summary>
        <div class="watch-panel">${[...branches].map(([id, entry]) => `<button type="button" class="watch-button" ${nodeAction(entry.node.id, filter, 'campaign-branch-')} aria-pressed="${id === activeBranch}">${escape(branchName(view, entry, lang))}</button>`).join('')}</div></details>` : ''}
      ${filterButton('available')}
    </nav>
    <div class="campaign-development-board">
      <section class="campaign-circuit-board watch-panel" aria-label="${en ? 'Upgrade diagram' : 'Схема улучшений'}">
        <header class="campaign-circuit-header">
          <h2>${selected ? escape(branchName(view, selected, lang)) : en ? 'Available only' : 'Только доступные'}</h2>
          ${selected ? `<details name="campaign-upgrade-menus" class="campaign-chart-picker"><summary class="watch-button" data-focus-key="campaign-catalog" aria-label="${en ? 'Upgrade list' : 'Список улучшений'}">${watchIcon('tree')}</summary>
            <div class="watch-panel">${[...branches].map(([id, entry]) => `<section><h3>${escape(branchName(view, entry, lang))}</h3>${shown.filter(item => branchId(item) === id).map(item => `<button type="button" class="watch-button" ${nodeAction(item.node.id, filter, 'campaign-list-')} data-campaign-catalog data-available="${item.available}" aria-pressed="${item.node.id === selected.node.id}">${nodeName(item, lang)} · ${status(item, en)}</button>`).join('')}</section>`).join('')}</div></details>` : ''}
        </header>
        ${selected ? `<div class="campaign-circuit-viewport" tabindex="0" data-branch="${escape(activeBranch)}" aria-label="${en ? 'Scrollable upgrade diagram' : 'Прокручиваемая схема улучшений'}">
          ${circuit(branchEntries, selected, filter, lang)}</div>`
          : `<p class="economy-empty" role="status">${en ? 'No available upgrades' : 'Нет доступных покупок'}</p>`}
        <footer>${purchases.filter(entry => entry.purchased).length} / ${purchases.length}</footer>
      </section>
      ${selected ? inspector(view, selected, byId, filter, lang) : ''}
    </div>
    </section>`;
}

export function layoutCampaignDevelopment(root: HTMLElement): void {
  const viewport = root.querySelector<HTMLElement>('.campaign-circuit-viewport');
  const selected = viewport?.querySelector('.campaign-circuit-node[aria-pressed="true"]');
  if (!viewport || !selected) return;
  const node = selected.getBoundingClientRect(), board = viewport.getBoundingClientRect();
  if (node.left < board.left || node.right > board.right) viewport.scrollLeft += (node.left + node.right - board.left - board.right) / 2;
  if (node.top < board.top || node.bottom > board.bottom) viewport.scrollTop += (node.top + node.bottom - board.top - board.bottom) / 2;
  const markScrolled = () => viewport.toggleAttribute('data-optics-scrolled', viewport.scrollLeft > 1);
  markScrolled();
  viewport.onscroll = markScrolled;
}
