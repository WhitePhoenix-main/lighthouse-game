/** Earliest swept circle contact, including an initial overlap. */
export function contactFraction(x: number, y: number, dx: number, dy: number, radius: number): number | null {
  const c = x*x + y*y - radius*radius;
  if (c <= 1e-9) return 0;
  const a = dx*dx + dy*dy;
  if (a === 0) return null;
  const b = x*dx + y*dy, discriminant = b*b - a*c;
  if (discriminant < -1e-9) return null;
  const fraction = (-b - Math.sqrt(Math.max(0, discriminant))) / a;
  return fraction >= -1e-9 && fraction <= 1 + 1e-9 ? Math.max(0, Math.min(1, fraction)) : null;
}
