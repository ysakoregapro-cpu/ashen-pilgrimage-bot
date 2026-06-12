/** starter-weapon-route-check — npx tsx scripts/starter-weapon-route-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import {
  JOB_STARTER_WEAPONS, STARTER_UNIQUE_TARGETS, STARTER_WEAPON_IDS,
} from '../src/db/seedData/jobStarterWeapons';
import { TOWN_LOOT_POOLS } from '../src/db/seedData/townLootPools';
import { getAreaRank, buildEffectiveRewardPool } from '../src/systems/townLootSystem';
import { isJobStarterWeapon } from '../src/db/seedData/jobStarterWeapons';

const issues: string[] = [];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);

  const jobs = Object.keys(JOB_STARTER_WEAPONS);
  if (jobs.length !== 8) issues.push(`職業数 ${jobs.length} (expected 8)`);

  for (const [job, wpnId] of Object.entries(JOB_STARTER_WEAPONS)) {
    const item = db.prepare('SELECT name, rarity FROM items WHERE id = ?').get(wpnId) as { name: string; rarity: string } | undefined;
    if (!item) issues.push(`${job}: 初期武器 ${wpnId} 未存在`);
    else if (!STARTER_WEAPON_IDS.has(wpnId)) issues.push(`${wpnId} が STARTER_WEAPON_IDS に未登録`);

    const uni = STARTER_UNIQUE_TARGETS[wpnId];
    if (!uni) issues.push(`${wpnId}: Uni対象なし`);
    else {
      const uniRow = db.prepare('SELECT rarity FROM items WHERE id = ?').get(uni) as { rarity: string } | undefined;
      if (!uniRow) issues.push(`Uni未存在: ${uni}`);
      else if (uniRow.rarity !== 'Uni') issues.push(`${uni} rarity=${uniRow.rarity}`);
      const src = db.prepare('SELECT src_weapon_id FROM equipment WHERE item_id = ?').get(uni) as { src_weapon_id: string | null } | undefined;
      if (!src?.src_weapon_id) issues.push(`${uni}: src_weapon_id なし`);
    }

    const awaken = db.prepare('SELECT awakening_level FROM player_inventory LIMIT 0').run;
    void awaken;
  }

  // Starter in town pools rank 1-3 only
  for (const [townId, pool] of Object.entries(TOWN_LOOT_POOLS)) {
    const starters = pool.filter((e) => isJobStarterWeapon(e.item_id));
    for (const s of starters) {
      if (s.max_area_rank > 3) issues.push(`${townId}: 初期武器 ${s.item_id} が rank4+ に含まれる`);
      if (s.base_weight > 5) issues.push(`${townId}: 初期武器 ${s.item_id} weight=${s.base_weight} (高すぎ)`);
    }
  }

  const areas = db.prepare('SELECT id, town_id FROM exploration_areas').all() as Array<{ id: string; town_id: string }>;
  for (const a of areas) {
    const rank = getAreaRank(a.id);
    const pool = buildEffectiveRewardPool(a.town_id, a.id);
    const startersInPool = pool.filter((p) => STARTER_WEAPON_IDS.has(p.item_id));
    if (rank <= 3 && TOWN_LOOT_POOLS[a.town_id]?.some((e) => isJobStarterWeapon(e.item_id))) {
      if (!startersInPool.length) issues.push(`${a.id} rank${rank}: 初期武器候補なし`);
    }
    if (rank >= 4 && startersInPool.length) {
      issues.push(`${a.id} rank${rank}: 初期武器が通常poolに残存 (${startersInPool.map((s) => s.item_id).join(',')})`);
    }
  }

  if (issues.length) {
    console.error('❌ starter-weapon-route-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ starter-weapon-route-check passed');
}

main();
