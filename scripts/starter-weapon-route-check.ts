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
import { REMATCH_MATERIAL_BOSSES } from '../src/db/seedData/forgeMaster';

const issues: string[] = [];
const BAD_UNI_IDS = ['wpn_rain_bow', 'wpn_twilight_bow', 'wpn_training_shield'];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);

  console.log('## 全職業 初期武器→Uni→Src\n');
  console.log('| 職業 | 初期武器 | Uni | Src | 覚醒 |');
  console.log('| --- | --- | --- | --- | --- |');

  for (const [job, wpnId] of Object.entries(JOB_STARTER_WEAPONS)) {
    const item = db.prepare('SELECT name, rarity FROM items WHERE id = ?').get(wpnId) as { name: string; rarity: string } | undefined;
    if (!item) issues.push(`${job}: 初期武器 ${wpnId} 未存在`);
    if (item && item.rarity === 'Uni') issues.push(`${wpnId} が既にUni`);
    if (wpnId === 'wpn_rain_bow') issues.push('狩人初期が雨濡れの弓になっている');

    const uni = STARTER_UNIQUE_TARGETS[wpnId];
    if (!uni) issues.push(`${wpnId}: Uni対象なし`);
    if (BAD_UNI_IDS.includes(uni ?? '')) issues.push(`R装備がUni導線: ${uni}`);

    const src = uni ? db.prepare('SELECT src_weapon_id FROM equipment WHERE item_id = ?').get(uni) as { src_weapon_id: string | null } : undefined;
    console.log(`| ${job} | ${item?.name ?? wpnId} | ${uni ?? '-'} | ${src?.src_weapon_id ?? '-'} | 可 |`);
  }

  console.log('\n## 初期武器ドロップ配置（rank1-3）\n');
  for (const [townId, pool] of Object.entries(TOWN_LOOT_POOLS)) {
    const starters = pool.filter((e) => isJobStarterWeapon(e.item_id));
    if (!starters.length) continue;
    console.log(`### ${townId}`);
    for (const s of starters) {
      console.log(`- ${s.item_id} weight=${s.base_weight} max_rank=${s.max_area_rank}`);
      if (s.max_area_rank > 3) issues.push(`${townId}: ${s.item_id} rank4+`);
      if (s.base_weight > 5) issues.push(`${townId}: ${s.item_id} weight=${s.base_weight}`);
    }
  }

  const areas = db.prepare('SELECT id, town_id FROM exploration_areas').all() as Array<{ id: string; town_id: string }>;
  for (const a of areas) {
    const rank = getAreaRank(a.id);
    const pool = buildEffectiveRewardPool(a.town_id, a.id);
    const startersInPool = pool.filter((p) => STARTER_WEAPON_IDS.has(p.item_id));
    if (rank >= 4 && startersInPool.length) {
      issues.push(`${a.id} rank${rank}: 初期武器残存`);
    }
  }

  // R装備がUni昇華対象になっていないか
  for (const [wpn, uni] of Object.entries(STARTER_UNIQUE_TARGETS)) {
    const r = db.prepare('SELECT rarity FROM items WHERE id = ?').get(uni) as { rarity: string } | undefined;
    if (r && r.rarity !== 'Uni') issues.push(`${uni} rarity=${r.rarity}`);
    if (wpn.startsWith('wpn_') && !STARTER_WEAPON_IDS.has(wpn)) issues.push(`Uni元が初期外: ${wpn}`);
  }

  void REMATCH_MATERIAL_BOSSES;

  if (issues.length) {
    console.error('\n❌ starter-weapon-route-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('\n✅ starter-weapon-route-check passed');
}

main();
