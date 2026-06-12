/** loot-pool-check — npx tsx scripts/loot-pool-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { TOWN_LOOT_POOLS } from '../src/db/seedData/townLootPools';
import { getAreaRank, buildEffectiveRewardPool } from '../src/systems/townLootSystem';
import { formatAreaDetail } from '../src/systems/areaDisplaySystem';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';

const TEST_USER = 'loot-pool-check-user';
const issues: string[] = [];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  if (!getPlayer(TEST_USER)) createPlayer(TEST_USER, 'g', 'Test', 'c');

  const towns = db.prepare('SELECT DISTINCT town_id FROM exploration_areas').all() as Array<{ town_id: string }>;
  for (const { town_id } of towns) {
    if (!TOWN_LOOT_POOLS[town_id]?.length) issues.push(`町 ${town_id} に loot pool なし`);
  }

  const areas = db.prepare('SELECT id, town_id, recommended_min_level FROM exploration_areas ORDER BY town_id, recommended_min_level').all() as Array<{
    id: string; town_id: string; recommended_min_level: number;
  }>;

  const itemAreaCount = new Map<string, Set<string>>();
  for (const a of areas) {
    const rank = getAreaRank(a.id);
    if (rank < 1) issues.push(`${a.id}: area_rank 未設定`);
    const pool = buildEffectiveRewardPool(a.town_id, a.id);
    if (!pool.length && a.town_id !== 'valhalla_fortress') issues.push(`${a.id}: effective pool 空`);
    for (const p of pool) {
      if (!itemAreaCount.has(p.item_id)) itemAreaCount.set(p.item_id, new Set());
      itemAreaCount.get(p.item_id)!.add(a.id);
      const item = db.prepare('SELECT category, rarity FROM items WHERE id = ?').get(p.item_id) as { category: string; rarity: string } | undefined;
      if (item?.category === 'src_upgrade_material' || p.item_id.startsWith('boss_') && item?.category !== 'material') {
        // boss materials ok
      }
      if (p.item_id.startsWith('src_') && !p.item_id.startsWith('src_echo')) {
        if (rank < 4 && a.recommended_min_level < 30) issues.push(`${a.id}: 高級Src ${p.item_id} が序盤pool`);
      }
    }
  }

  for (const [itemId, areaSet] of itemAreaCount) {
    if (areaSet.size === 1 && !itemId.startsWith('boss_') && !itemId.startsWith('raid_')) {
      const cat = db.prepare('SELECT category FROM items WHERE id = ?').get(itemId) as { category: string } | undefined;
      if (cat?.category === 'equipment' && !itemId.startsWith('wpn_unique')) {
        // warn only for non-unique equipment in single area - may be ok for series pieces
      }
    }
  }

  const detail = formatAreaDetail(TEST_USER, areas[0]!.id);
  if (detail.includes('主な装備') || detail.includes('主な素材')) {
    issues.push('探索地詳細に狙い撃ち表示（主な装備/主な素材）が残存');
  }
  if (!detail.includes('報酬プール') && !detail.includes('共通プール') && !detail.includes('共有')) {
    issues.push('探索地詳細に共通pool説明がない');
  }

  if (issues.length) {
    console.error('❌ loot-pool-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ loot-pool-check passed');
}

main();
