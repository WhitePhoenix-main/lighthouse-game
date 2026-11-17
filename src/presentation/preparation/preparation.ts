import type { ApplicationView, DeviceKind } from '../../contracts';
import { deviceSymbols, repairLampDescription, defenseDeviceDescription } from '../shared/devices';

const kinds: readonly DeviceKind[] = ['cannon', 'harpoon', 'mortar', 'bell', 'repair-lamp', 'barrier', 'generator', 'light-trap'];
const escape = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** World coordinates belong to application; SVG scaling changes presentation only. */
export function preparationDevices(view: ApplicationView): string {
  const { preparation: prep, config } = view;
  const rules = config.devices;
  const radius = Math.max(rules.placementRadius, config.shield.radius) + 28;
  const showShield = prep.inventory.some(entry => entry.kind === 'generator' && entry.health > 0 && !entry.consumed && (entry.position !== null || prep.selectedType === 'generator'));
  const symbols = deviceSymbols;
  const protectedText = (x: number, y: number, bodyRadius: number): string => showShield ? (Math.hypot(x, y) + bodyRadius <= config.shield.radius ? ' · внутри поля' : ' · вне поля') : '';
  const usedTypes = new Set(prep.placements.map((entry) => entry.kind)).size;
  return `<section class="device-preparation" aria-labelledby="devices-title">
    <div class="eyebrow">ЗАЩИТА БЕРЕГА</div><h2 id="devices-title">Расставить устройства</h2>
    <p>Выбери тип, затем нажми на поле. Клавиатура: Tab на поле, стрелки — прицел, Enter — установить. До старта можно удалить любой объект. Расстановка бесплатна и сохраняется между ночами и перезагрузками.</p>
    <p class="coast-note">${config.terrain?.landOnlyPlacement ? 'Устройства только на суше: весь круг объекта должен находиться слева от прямой береговой линии. Маяк стоит на границе суши и моря.' : 'Круговая область расстановки: весь объект должен помещаться внутри пунктирной границы.'}</p>
    <div class="device-types">${kinds.map((kind) => {
      const definition = rules.definitions[kind];
      const available = !config.availableDevices || config.availableDevices.includes(kind);
      const count = prep.placements.filter((entry) => entry.kind === kind).length;
      const ready = prep.inventory.filter(entry => entry.kind === kind && !entry.position && entry.health > 0 && !entry.consumed).length;
      return `<div class="device-type-card"><button data-action="device-type" data-kind="${kind}" aria-pressed="${prep.selectedType === kind}" ${view.error || !available || !ready ? 'disabled' : ''}><strong>${symbols[kind]} ${escape(definition.name)}</strong><small>${escape(definition.description)}</small>${!available ? '<small>Закрыто · открой тип на экране развития маяка</small>' : ''}<small>${definition.health} прочности${kind === 'cannon' || kind === 'harpoon' || kind === 'mortar' ? ` · ${definition.damage} урона / ${Number(definition.attackInterval.toFixed(2))} с · дальность ${definition.range}` : ''}${kind === 'bell' ? ` · радиус ${definition.range} · интервал ${Number(definition.attackInterval.toFixed(2))} с · замедление ${rules.bell.duration} с · скорость ×${rules.bell.slowMultiplier} · без урона` : ''}${kind === 'mortar' ? ` · радиус взрыва ${rules.mortar.blastRadius} · скорость снаряда ${rules.mortar.projectileSpeed} · урон броне ×${rules.mortar.armorMultiplier}` : ''} · объектов ${count}/${rules.perType[kind]} · в запасе готово ${ready}</small></button><button data-action="purchase-device" data-kind="${kind}" ${view.error || !available || view.profile.resources < definition.cost ? 'disabled' : ''}>Купить экземпляр · ${definition.cost} ◈</button></div>`;
    }).join('')}</div>
    ${(['cannon', 'harpoon', 'barrier', 'generator', 'light-trap'] as const).filter(kind => config.availableDevices?.includes(kind)).map(kind => `<p class="device-abilities"><strong>${escape(rules.definitions[kind].name)}</strong> · ${defenseDeviceDescription(view, kind)}</p>`).join('')}
    <h3>Мои устройства</h3><p>Открытие типа даёт первый экземпляр. Полный ремонт — до 25% цены. Повреждённые устройства работают; разрушенные и израсходованные требуют восстановления.</p>
    ${config.availableDevices?.includes('repair-lamp') ? `<p class="repair-explanation">✚ ${repairLampDescription(view)}</p>` : ''}
    <ul class="device-inventory">${prep.inventory.map(entry => `<li><strong>${escape(rules.definitions[entry.kind].name)} #${entry.id}</strong><span>${entry.position ? 'На поле' : 'В запасе'} · ${entry.health <= 0 ? 'Разрушено' : 'Прочность'} ${Number(entry.health.toFixed(1))}/${entry.maxHealth}${entry.kind === 'repair-lamp' ? ` · ${rules.repairLamp.charges} зарядов на ночь · предел — прочность цели на старте ночи` : ''}${entry.kind === 'light-trap' ? ` · Заряды ${entry.trapCharges ?? (entry.consumed ? 0 : 1)}/${rules.trap.charges}` : ''}</span><div><button data-action="repair-device" data-device-id="${entry.id}" ${view.error || entry.health >= entry.maxHealth || view.profile.resources < entry.repairCost ? 'disabled' : ''}>Ремонт · ${entry.repairCost} ◈</button>${entry.kind === 'light-trap' ? `<button data-action="recharge-device" data-device-id="${entry.id}" ${view.error || entry.rechargeCost <= 0 || view.profile.resources < entry.rechargeCost ? 'disabled' : ''}>Перезарядить · ${entry.rechargeCost} ◈</button>` : ''}</div></li>`).join('')}</ul>
    ${config.flash.enabled === false ? '<p>✧ Вспышка закрыта — открой её в развитии маяка.</p>' : '<p>✧ Вспышка доступна во время боя.</p>'}<div class="placement-limits">Слоты типов: ${usedTypes}/${rules.typeSlots} · Объекты: ${prep.placements.length}/${rules.maxObjects}</div>
    <svg class="placement-map" data-placement-map data-focus-key="placement-map" tabindex="0" viewBox="${-radius} ${-radius} ${radius * 2} ${radius * 2}" role="group" aria-label="Поле расстановки. Стрелки перемещают прицел, Enter устанавливает устройство. Маяк в центре, пунктир — граница установки">
      <rect x="${-radius}" y="${-radius}" width="${radius * 2}" height="${radius * 2}" fill="#0a202c"/>
      <path d="M ${-radius} ${-radius} H 0 V ${radius} H ${-radius} Z" fill="#233a35"/>
      <path d="M 0 ${-radius} V ${radius}" fill="none" stroke="#91a69a" stroke-opacity=".6" stroke-width="3"/>
      <text x="${-radius * .65}" y="${-radius * .8}" text-anchor="middle" fill="#b3c2aa" font-size="18">СУША</text>
      <text x="${radius * .65}" y="${-radius * .8}" text-anchor="middle" fill="#a6c5cc" font-size="18">МОРЕ</text>
      <g transform="translate(${radius * .8} ${radius * .67})" opacity=".55" fill="#8c9e99" stroke="#93a6a2"><path d="M -13 0 H 13 L 5 6 H -7 Z"/><path d="M 0 0 V -28 M -2 -25 L -12 -3 H -2 Z"/></g>
      <circle r="${rules.placementRadius}" fill="none" stroke="#91b4a5" stroke-dasharray="5 8"/>
      <path d="M ${-rules.placementRadius} 0 H ${rules.placementRadius} M 0 ${-rules.placementRadius} V ${rules.placementRadius}" stroke="#39524b" stroke-width="1"/>
      ${showShield ? `<circle r="${config.shield.radius}" fill="#80d9f7" fill-opacity=".05" stroke="#80d9f7" stroke-width="3"/><text y="${-config.shield.radius + 20}" text-anchor="middle" fill="#a6e9ff" font-size="16">ОБЩЕЕ ПОЛЕ</text>` : ''}
      <circle r="${config.lighthouseRadius}" fill="#e7d7ae" stroke="#f9e7ac"/>
      <text y="8" text-anchor="middle" fill="#1a3438" font-size="22">◈</text>
      ${prep.placements.map((entry) => {
        const definition = rules.definitions[entry.kind];
        const owned = prep.inventory.find(device => device.id === entry.id);
        const destroyed = owned !== undefined && owned.health <= 0;
        const spent = owned?.consumed === true;
        const condition = destroyed ? 'Разрушено' : spent ? 'Заряд израсходован' : 'Прочность';
        return `<g data-device-condition="${destroyed ? 'destroyed' : spent ? 'spent' : 'ready'}" transform="translate(${entry.x} ${entry.y})"><title>${escape(definition.name)} #${entry.id} · ${condition}</title><g opacity="${destroyed || spent ? '.45' : '1'}"><circle r="${definition.radius}" fill="${entry.kind === 'mortar' ? '#e39a6b' : entry.kind === 'harpoon' ? '#7fd8e0' : entry.kind === 'cannon' ? '#cfb66f' : '#8eada3'}" stroke="#e7e4bd" stroke-width="2"/><text y="6" text-anchor="middle" fill="#10282b" font-size="18">${symbols[entry.kind]}</text></g>${destroyed ? '<path d="M -12 -12 L 12 12 M 12 -12 L -12 12" stroke="#ff988f" stroke-width="3"/>' : spent ? '<circle r="10" fill="none" stroke="#ffcf83" stroke-width="3" stroke-dasharray="3 3"/>' : ''}<text y="${definition.radius + 19}" text-anchor="middle" fill="#e8e2cc" font-size="18">${entry.id}</text></g>`;
      }).join('')}
      <g data-placement-preview pointer-events="none"></g>
    </svg>
    <p class="placement-feedback" data-placement-feedback role="status">${prep.selectedType ? `Нажми на свободное место внутри пунктирного круга${config.terrain?.landOnlyPlacement ? ' на суше' : ''}.` : 'Сначала выбери тип устройства.'}</p>
    <ul class="placement-list">${prep.placements.map((entry) => `<li><span>${escape(rules.definitions[entry.kind].name)} #${entry.id}${protectedText(entry.x, entry.y, rules.definitions[entry.kind].radius)}</span><button data-action="remove-device" data-device-id="${entry.id}" ${view.error ? 'disabled' : ''}>В запас</button></li>`).join('')}</ul>
    ${showShield ? `<p class="shield-explanation">Голубая граница — одно общее поле вокруг маяка. Защищены объекты, полностью находящиеся внутри. Генератор добавляет ${config.shield.capacityPerGenerator} прочности; восстановление остаётся ${config.shield.regenerationPerSecond}/с после ${config.shield.regenerationDelay} с без ударов по полю или защищаемым целям.</p>` : ''}
    <button class="clear-devices" data-action="clear-devices" ${!prep.placements.length || view.error ? 'disabled' : ''}>Все устройства в запас</button>
    <dl class="placement-budget"><div><dt>Сохранённый баланс</dt><dd>${view.profile.resources} ◈</dd></div><div><dt>Расстановка бесплатна</dt><dd>${prep.cost} ◈</dd></div><div class="${prep.remaining < 0 ? 'insufficient' : ''}"><dt>Баланс после старта</dt><dd>${prep.remaining} ◈</dd></div></dl>
    <p class="placement-reason">${escape(prep.reason)}</p>
    <button class="primary" data-action="start" ${view.error || !prep.canStart ? 'disabled' : ''}>Начать ночь · бесплатно <span>→</span></button>
    <small class="balance-note">Экземпляры, прочность, заряд и расстановка сохраняются.<br>Лимиты, цены и характеристики предварительные.</small>
  </section>`;
}

export function renderPlacementPreview(root: HTMLElement, view: ApplicationView): void {
  const preview = view.preparation.preview;
  const marker = root.querySelector('[data-placement-preview]');
  const feedback = root.querySelector<HTMLElement>('[data-placement-feedback]');
  const selected = view.preparation.selectedType;
  if (!marker || !feedback || !preview || !selected) return;
  const definition = view.config.devices.definitions[selected];
  const color = preview.valid ? '#8de3ac' : '#ff988f';
  marker.innerHTML = `<circle cx="${preview.x}" cy="${preview.y}" r="${definition.radius}" fill="${color}" fill-opacity=".35" stroke="${color}" stroke-width="3"/>${definition.range ? `<circle cx="${preview.x}" cy="${preview.y}" r="${definition.range}" fill="none" stroke="${color}" stroke-opacity=".45" stroke-dasharray="4 7"/>` : ''}`;
  feedback.textContent = preview.valid ? '✓ Можно установить. Нажми для размещения.' : `× ${preview.reason}`;
  feedback.style.color = color;
}
