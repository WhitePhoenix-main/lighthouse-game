import type { DeviceKind, DevicePlacement, NightConfig, PlacementCheck } from '../contracts';

const invalid = (reason: string): PlacementCheck => ({ valid: false, reason });

/** Pure world-space check; selecting a tool does not occupy a type slot. */
export function checkPlacement(config: NightConfig, placements: readonly DevicePlacement[], kind: DeviceKind, x: number, y: number): PlacementCheck {
  const rules = config.devices;
  const definition = rules.definitions[kind];
  if (!definition || !Number.isFinite(x) || !Number.isFinite(y)) return invalid('Недопустимые координаты или тип устройства.');
  if (config.availableDevices !== undefined && !config.availableDevices.includes(kind)) return invalid('Устройство ещё не открыто в дереве развития.');
  if (config.terrain?.landOnlyPlacement && x + definition.radius > config.terrain.shoreX + 1e-9) return invalid('Устройство должно целиком находиться на суше.');
  if (placements.length >= rules.maxObjects) return invalid(`Общий предел: ${rules.maxObjects} объекта.`);
  if (placements.filter(item => item.kind === kind).length >= rules.perType[kind]) return invalid(`Предел для «${definition.name}»: ${rules.perType[kind]}.`);
  const types = new Set(placements.map(item => item.kind));
  if (!types.has(kind) && types.size >= rules.typeSlots) return invalid(`Заняты все слоты типов: ${rules.typeSlots}.`);
  if (Math.hypot(x, y) + definition.radius > Math.min(rules.placementRadius, config.worldRadius) + 1e-9) return invalid('За границей области размещения: объект должен целиком помещаться внутри.');
  if (Math.hypot(x, y) < config.lighthouseRadius + definition.radius - 1e-9) return invalid('Пересечение с маяком.');
  if (placements.some(item => Math.hypot(item.x - x, item.y - y) < definition.radius + rules.definitions[item.kind].radius - 1e-9)) return invalid('Пересечение с другим устройством.');
  return { valid: true, reason: 'Можно разместить.' };
}

export function placementCost(config: NightConfig, placements: readonly DevicePlacement[]): number {
  return placements.reduce((sum, item) => sum + config.devices.definitions[item.kind].cost, 0);
}

export function checkDraft(config: NightConfig, placements: readonly DevicePlacement[]): PlacementCheck {
  const checked: DevicePlacement[] = [];
  for (const item of placements) {
    if (!Number.isSafeInteger(item.id) || item.id < 1 || checked.some(other => other.id === item.id)) return invalid('Повторный или недопустимый id устройства.');
    const result = checkPlacement(config, checked, item.kind, item.x, item.y);
    if (!result.valid) return result;
    checked.push(item);
  }
  return { valid: true, reason: '' };
}

