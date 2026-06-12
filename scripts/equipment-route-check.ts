/** equipment-route-check — npx tsx scripts/equipment-route-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { KAI_UNIQUE_TARGETS } from '../src/db/seedData/awakeningMaster';
import { STARTER_UNIQUE_TARGETS, STARTER_WEAPON_IDS } from '../src/db/seedData/jobStarterWeapons';
import { AREAS } from '../src/db/seedData/areas';
import {
  buildWeaponPowerComparison,
  collectPowerBalanceIssues,
  formatStaffDetailTable,
  formatWeaponPowerTable,
} from '../src/systems/weaponPowerComparison';
import { calcUpgradeStatBonuses } from '../src/systems/enhanceSystem';
import { EQUIP_SLOT_WEIGHTS, CHEST_LOOT_TABLES, REMATCH_LOOT_TABLE } from '../src/systems/equipmentDropSystem';
import { UNI_FORGE_MATERIAL_IDS, MAT_STARFALL_OBSIDIAN, MAT_BLACK_LANTERN_CINDER } from '../src/db/seedData/forgeMaster';

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);

  const issues: string[] = [];
  const rows = db.prepare(`
    SELECT i.id, i.name, i.rarity, i.source_text, e.slot, e.weapon_type, e.is_unique, e.src_weapon_id
    FROM items i JOIN equipment e ON i.id = e.item_id
    WHERE e.slot IN ('weapon', 'head', 'body', 'arms', 'legs', 'feet', 'accessory1', 'accessory2')
  `).all() as Array<{
    id: string; name: string; rarity: string; source_text: string | null; slot: string;
    is_unique: number; src_weapon_id: string | null;
  }>;

  const areaRewards = new Set<string>();
  for (const a of AREAS) for (const r of a.rewards) areaRewards.add(r);

  for (const r of rows) {
    if (!r.source_text?.trim()) issues.push(`${r.id}: source_text 空 (${r.name})`);
    if (r.rarity === 'Uni' && !r.is_unique) issues.push(`${r.id}: Uni だが is_unique=0`);
    if (r.rarity === 'Uni' && !r.src_weapon_id) issues.push(`${r.id}: Uni だが Src 未リンク`);
    if (r.rarity === 'Src' && r.slot === 'weapon') {
      const src = db.prepare('SELECT 1 FROM src_weapons WHERE src_item_id = ?').get(r.id);
      if (!src) issues.push(`${r.id}: Src武器が src_weapons 未登録`);
    }
  }

  for (const [starter, target] of Object.entries(STARTER_UNIQUE_TARGETS)) {
    if (!KAI_UNIQUE_TARGETS[starter]) issues.push(`KAI未紐付: ${starter}`);
    const item = db.prepare('SELECT rarity, src_weapon_id FROM items i JOIN equipment e ON i.id=e.item_id WHERE i.id=?').get(target) as {
      rarity: string; src_weapon_id: string | null;
    } | undefined;
    if (!item) issues.push(`Uni武器未存在: ${target}`);
    else {
      if (item.rarity !== 'Uni') issues.push(`${target} rarity=${item.rarity} (expected Uni)`);
      if (!item.src_weapon_id) issues.push(`${target} に src_weapon_id なし`);
    }
  }

  if (STARTER_UNIQUE_TARGETS.wpn_mist_staff !== 'wpn_unique_mist_lantern') {
    issues.push('霧払いの杖 → 新Uni杖 未接続');
  }

  const silence = db.prepare(`
    SELECT i.rarity, e.is_unique, e.src_weapon_id FROM items i JOIN equipment e ON i.id = e.item_id WHERE i.id = 'wpn_unique_silence'
  `).get() as { rarity: string; is_unique: number; src_weapon_id: string | null } | undefined;
  if (silence) {
    if (silence.rarity !== 'SR') issues.push(`静寂の聖印 rarity=${silence.rarity}`);
    if (silence.is_unique) issues.push('静寂の聖印 is_unique=1');
    if (silence.src_weapon_id) issues.push('静寂の聖印 src_weapon_id 残存');
  }
  if (KAI_UNIQUE_TARGETS.wpn_mist_staff === 'wpn_unique_silence') issues.push('霧払いの杖が静寂の聖印を指している');
  if (STARTER_UNIQUE_TARGETS.wpn_training_shield) issues.push('訓練用盾がUni対象');

  const armorUni = db.prepare(`
    SELECT COUNT(*) c FROM items i JOIN equipment e ON i.id = e.item_id
    WHERE i.rarity IN ('Uni','Src') AND e.slot IN ('head','body','arms','legs','feet')
  `).get() as { c: number };
  if (armorUni.c > 0) issues.push(`防具にUni/Srcが存在 (${armorUni.c}件)`);

  const slotSum = Object.values(EQUIP_SLOT_WEIGHTS).reduce((a, b) => a + b, 0);
  if (slotSum !== 100) issues.push(`部位抽選比率合計 ${slotSum} (expected 100)`);
  if (EQUIP_SLOT_WEIGHTS.weapon !== 35) issues.push('武器部位比率が35%でない');

  const lateSsr = CHEST_LOOT_TABLES.late.find((e) => e.rarity === 'SSR');
  if (!lateSsr || lateSsr.weight !== 15) issues.push(`late宝箱SSR=${lateSsr?.weight ?? 0} (expected 15)`);
  const valUr = CHEST_LOOT_TABLES.valhalla.find((e) => e.rarity === 'UR');
  if (!valUr || valUr.weight !== 15) issues.push(`valhalla宝箱UR=${valUr?.weight ?? 0} (expected 15)`);

  for (const tier of Object.values(CHEST_LOOT_TABLES)) {
    const sum = tier.reduce((a, e) => a + e.weight, 0);
    if (sum !== 100) issues.push(`宝箱${tier[0]?.kind} tier weight sum=${sum}`);
  }

  if (UNI_FORGE_MATERIAL_IDS.length !== 2) issues.push('Uni専用素材が2種類でない');
  if (!UNI_FORGE_MATERIAL_IDS.includes(MAT_STARFALL_OBSIDIAN)) issues.push('星見の残光がUni素材に未登録');
  if (!UNI_FORGE_MATERIAL_IDS.includes(MAT_BLACK_LANTERN_CINDER)) issues.push('黒灯の残滓がUni素材に未登録');

  const cinderInArea = db.prepare(`
    SELECT COUNT(*) c FROM exploration_areas WHERE reward_pool_json LIKE ?
  `).get(`%${MAT_BLACK_LANTERN_CINDER}%`) as { c: number };
  if (cinderInArea.c > 0) issues.push('黒灯の残滓が探索報酬に残存');

  const mistUni = db.prepare('SELECT name FROM items WHERE id = ?').get('wpn_unique_mist_lantern') as { name: string } | undefined;
  if (!mistUni) issues.push('wpn_unique_mist_lantern 未seed');

  const powerRows = buildWeaponPowerComparison(db, calcUpgradeStatBonuses);
  issues.push(...collectPowerBalanceIssues(powerRows));

  console.log(`equipment-route-check: ${rows.length} items, ${areaRewards.size} area reward refs`);
  console.log('\n## WEAPON_POWER_COMPARISON\n');
  console.log(formatWeaponPowerTable(powerRows));
  console.log('\n## STAFF_DETAIL\n');
  console.log(formatStaffDetailTable(db, calcUpgradeStatBonuses));

  if (issues.length) {
    console.error('FAIL');
    for (const i of issues) console.error(' -', i);
    process.exit(1);
  }
  console.log('OK — Uni/Src links, silence demotion, mist staff route, training shield excluded');
}

main();
