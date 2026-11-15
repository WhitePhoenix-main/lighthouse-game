/** Hit zones may share an owner (e.g. future boss tentacles). An area effect
 * applies once per owner, while beam damage remains per illuminated zone. */
export function applyRadialEffect<T, Owner>(
  zones: readonly T[], x: number, y: number, radius: number,
  geometry: (zone: T) => { x: number; y: number; radius: number },
  owner: (zone: T) => Owner, apply: (zone: T) => void,
): void {
  const affected = new Set<Owner>();
  for (const zone of zones) {
    const body = geometry(zone);
    if (Math.hypot(body.x - x, body.y - y) > radius + body.radius + 1e-9) continue;
    const id = owner(zone);
    if (affected.has(id)) continue;
    affected.add(id);
    apply(zone);
  }
}
