import type { IndicatorRequest, IndicatorRect } from './indicatorLayout';

export interface BattleBarStyle { width: number; fillHeight: number; gap: number; padding: number; height: number }

/** CSS pixels, never scaled by camera zoom or backing-store DPR. */
export function battleBarStyle(armor: boolean, largeText: boolean, bodyWidth = 0, device = false,
    density: 'standard' | 'compact' | 'focused' = 'standard'): BattleBarStyle {
  if (!largeText && !device && density !== 'standard') {
    const focused = density === 'focused';
    const width = Math.max(focused ? 32 : 24, Math.min(focused ? 48 : 34, Math.round(bodyWidth)));
    const fillHeight = focused ? 4 : 3;
    const padding = 1, gap = 2;
    return { width, fillHeight, gap, padding, height: padding * 2 + fillHeight * (armor ? 2 : 1) + (armor ? gap : 0) };
  }
  const fillHeight = largeText ? 8 : device ? 5 : 6;
  const padding = 2, gap = 3;
  const width = Math.max(device ? 34 : largeText ? 54 : 44, Math.min(80, bodyWidth));
  return { width, fillHeight, gap, padding, height: padding * 2 + fillHeight * (armor ? 2 : 1) + (armor ? gap : 0) };
}

export function enemyBarDensity(fieldWidth: number, priority: boolean): 'standard' | 'compact' | 'focused' {
  return fieldWidth > 900 ? 'standard' : priority ? 'focused' : 'compact';
}

export function enemyBarRequest(id: number, body: IndicatorRect, style: BattleBarStyle): IndicatorRequest {
  return { id, x: body.x + body.width / 2 - style.width / 2, y: body.y - style.height - 5, width: style.width, height: style.height };
}

export function clampBarFraction(value: number, maximum: number): number {
  return maximum > 0 ? Math.max(0, Math.min(1, value / maximum)) : 0;
}
