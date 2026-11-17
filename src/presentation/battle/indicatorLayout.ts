export interface IndicatorRect { x: number; y: number; width: number; height: number }
export interface IndicatorRequest extends IndicatorRect { id: number }

export function overlaps(a: IndicatorRect, b: IndicatorRect, gap = 3): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

/** Screen-space layout only: preserve every bar, its size and its owner. */
export function layoutIndicators(
  requests: readonly IndicatorRequest[], viewport: { width: number; height: number },
  bodies: readonly IndicatorRect[], reserved: readonly IndicatorRect[] = [],
): IndicatorRequest[] {
  const placed: IndicatorRequest[] = [];
  // IDs keep coincident threats deterministic even if the caller changes order.
  for (const request of [...requests].sort((a, b) => a.id - b.id)) {
    const clamp = (x: number, y: number): IndicatorRequest => ({ ...request,
      x: Math.max(3, Math.min(viewport.width - request.width - 3, x)),
      y: Math.max(3, Math.min(viewport.height - request.height - 3, y)),
    });
    const candidates: IndicatorRequest[] = [];
    for (let row = 0; row < 4; row++) {
      for (const column of [0, -1, 1]) {
        candidates.push(clamp(request.x + column * (request.width + 5), request.y - row * (request.height + 5)));
      }
    }
    const free = (candidate: IndicatorRequest): boolean => ![...placed, ...reserved].some((other) => overlaps(candidate, other));
    let available = candidates.filter(free);
    // Exceptionally dense groups still keep all health visible. Search the
    // remaining screen only if the four local rows have no free position.
    if (!available.length) {
      for (let y = 3; y + request.height <= viewport.height - 3; y += request.height + 5) {
        for (let x = 3; x + request.width <= viewport.width - 3; x += request.width + 5) {
          const candidate = clamp(x, y);
          if (free(candidate)) available.push(candidate);
        }
      }
    }
    const cost = (candidate: IndicatorRequest): number =>
      bodies.filter((body) => overlaps(candidate, body, 2)).length * 1000 +
      Math.abs(candidate.x - request.x) * 1.1 + Math.abs(candidate.y - request.y);
    available.sort((a, b) => cost(a) - cost(b) || a.y - b.y || a.x - b.x);
    placed.push(available[0] ?? clamp(request.x, request.y));
  }
  return placed;
}
