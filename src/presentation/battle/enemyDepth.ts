import type { EnemyState } from '../../contracts';
import type { IndicatorRect } from './indicatorLayout';

export function enemiesInDrawOrder(enemies: readonly EnemyState[]): EnemyState[] {
  return [...enemies].sort((a, b) => a.y - b.y);
}

export function frontEnemyAt(enemies: readonly EnemyState[], x: number, y: number,
  bounds: (enemy: EnemyState) => IndicatorRect): EnemyState | undefined {
  return enemiesInDrawOrder(enemies).reverse().find(enemy => {
    if (enemy.health <= 0) return false;
    const body = bounds(enemy);
    return x >= body.x - 6 && x <= body.x + body.width + 6
      && y >= body.y - 6 && y <= body.y + body.height + 6;
  });
}
