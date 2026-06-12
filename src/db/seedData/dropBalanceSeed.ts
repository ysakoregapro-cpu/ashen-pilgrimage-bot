import type Database from 'better-sqlite3';
import { AREAS } from './areas';
import { AREA_REWARD_WEIGHTS, NORMAL_EXPLORE_POOL_EXCLUDED } from './dropBalanceMaster';

function buildWeightedPool(areaId: string, rewards: string[]): Array<{ item_id: string; weight: number }> {
  const overrides = AREA_REWARD_WEIGHTS[areaId] ?? {};
  return rewards
    .filter((id) => !NORMAL_EXPLORE_POOL_EXCLUDED.has(id))
    .map((item_id) => ({ item_id, weight: overrides[item_id] ?? 10 }));
}

/** Idempotent — 探索 area reward pool の weight / 除外を適用 */
export function ensureDropBalanceSeed(db: Database.Database): void {
  const upd = db.prepare('UPDATE exploration_areas SET reward_pool_json = ? WHERE id = ?');
  for (const area of AREAS) {
    const pool = buildWeightedPool(area.id, area.rewards);
    upd.run(JSON.stringify(pool), area.id);
  }

  // 砂時計系から月下素材を除去（進行度外）
  for (const areaId of ['area_hourglass_ruins', 'area_memory_vault']) {
    const row = db.prepare('SELECT reward_pool_json FROM exploration_areas WHERE id = ?').get(areaId) as {
      reward_pool_json: string;
    } | undefined;
    if (!row) continue;
    const pool = JSON.parse(row.reward_pool_json) as Array<{ item_id: string; weight: number }>;
    upd.run(JSON.stringify(pool.filter((p) => p.item_id !== 'mat_moon_ink')), areaId);
  }
}
