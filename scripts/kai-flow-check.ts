/** kai-flow-check — npx tsx scripts/kai-flow-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { JOB_STARTER_WEAPONS, STARTER_UNIQUE_TARGETS } from '../src/db/seedData/jobStarterWeapons';
import { totalDuplicatesForMaxAwakening, MAX_AWAKENING_LEVEL } from '../src/db/seedData/awakeningMaster';
import {
  canKaiUnique, canKaiSrc, getKaiSrcCandidates,
} from '../src/systems/kaiForgeSystem';
import { setStoryFlag } from '../src/systems/storySystem';
import { createPlayer, getPlayer, addGold } from '../src/systems/playerSystem';
import { addItem } from '../src/systems/inventorySystem';
import { MAT_STARFALL_OBSIDIAN, MAT_BLACK_LANTERN_CINDER, SRC_FORGE_MATERIAL_ID } from '../src/db/seedData/forgeMaster';
import {
  buildWeaponPowerComparison, collectPowerBalanceIssues, formatStaffDetailTable, formatWeaponPowerTable,
} from '../src/systems/weaponPowerComparison';
import { calcUpgradeStatBonuses } from '../src/systems/enhanceSystem';

const TEST_USER = 'kai-flow-check-user';

function ensureTestPlayer() {
  if (!getPlayer(TEST_USER)) {
    createPlayer(TEST_USER, 'test-guild', 'Test', 'test-channel');
  }
  addGold(TEST_USER, 50000);
  setStoryFlag(TEST_USER, 'chapter_completed:ch2_silver');
  setStoryFlag(TEST_USER, 'chapter_completed:ch7_furnace');
}

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureTestPlayer();

  const issues: string[] = [];
  const starters = Object.values(JOB_STARTER_WEAPONS);
  if (starters.length !== 8) issues.push(`初期武器 ${starters.length} 種 (expected 8)`);
  if (STARTER_UNIQUE_TARGETS.wpn_training_shield) issues.push('訓練用盾がUni対象');
  if (STARTER_UNIQUE_TARGETS.wpn_mist_staff !== 'wpn_unique_mist_lantern') issues.push('杖ルート未更新');

  const nrTotal = totalDuplicatesForMaxAwakening('R');
  if (nrTotal !== 11) issues.push(`N/R最大覚醒 ${nrTotal} 本 (expected 11)`);

  db.prepare('DELETE FROM player_inventory WHERE user_id = ?').run(TEST_USER);
  db.prepare(`
    INSERT INTO player_inventory (user_id, item_id, quantity, awakening_level, upgrade_level, durability_state, is_equipped, is_pending_reward, created_at, updated_at)
    VALUES (?, 'wpn_mist_staff', 1, ?, 0, '良好', 0, 0, datetime('now'), datetime('now'))
  `).run(TEST_USER, MAX_AWAKENING_LEVEL);
  const inv = db.prepare('SELECT id FROM player_inventory WHERE user_id = ? AND item_id = ?').get(TEST_USER, 'wpn_mist_staff') as { id: number };

  const noMat = canKaiUnique(TEST_USER, inv.id);
  if (noMat.ok) issues.push('素材なしでUni化可になっている');

  addItem(TEST_USER, MAT_STARFALL_OBSIDIAN, 1);
  addItem(TEST_USER, MAT_BLACK_LANTERN_CINDER, 1);
  const withMat = canKaiUnique(TEST_USER, inv.id);
  if (!withMat.ok) issues.push(`素材ありでもUni化不可: ${withMat.reason}`);

  const srcCandidates = getKaiSrcCandidates(TEST_USER);
  if (srcCandidates.some((c) => c.name.includes('静寂'))) issues.push('静寂の聖印がSrc候補');

  db.prepare(`
    INSERT INTO player_inventory (user_id, item_id, quantity, awakening_level, upgrade_level, durability_state, is_equipped, is_pending_reward, created_at, updated_at)
    VALUES (?, 'wpn_unique_mist_lantern', 1, 0, 0, '良好', 0, 0, datetime('now'), datetime('now'))
  `).run(TEST_USER);
  const uniInv = db.prepare('SELECT id FROM player_inventory WHERE user_id = ? AND item_id = ?').get(TEST_USER, 'wpn_unique_mist_lantern') as { id: number };
  const noEcho = canKaiSrc(TEST_USER, uniInv.id);
  if (noEcho.ok) issues.push('星巡の残響なしでSrc化可');
  addItem(TEST_USER, SRC_FORGE_MATERIAL_ID, 1);
  const withEcho = canKaiSrc(TEST_USER, uniInv.id);
  if (!withEcho.ok) issues.push(`素材ありでSrc化不可: ${withEcho.reason}`);

  const powerRows = buildWeaponPowerComparison(db, calcUpgradeStatBonuses);
  issues.push(...collectPowerBalanceIssues(powerRows));

  const silenceRow = db.prepare(`
    SELECT i.rarity, e.is_unique, e.src_weapon_id FROM items i JOIN equipment e ON i.id = e.item_id WHERE i.id = 'wpn_unique_silence'
  `).get() as { rarity: string; is_unique: number; src_weapon_id: string | null } | undefined;
  if (silenceRow?.rarity !== 'SR' || silenceRow.is_unique || silenceRow.src_weapon_id) {
    issues.push('静寂の聖印が一般SRとして維持されていない');
  }

  console.log('kai-flow-check');
  console.log('\n## WEAPON_POWER_COMPARISON\n');
  console.log(formatWeaponPowerTable(powerRows));
  console.log('\n## STAFF_DETAIL\n');
  console.log(formatStaffDetailTable(db, calcUpgradeStatBonuses));

  if (issues.length) {
    console.error('FAIL');
    for (const i of issues) console.error(' -', i);
    process.exit(1);
  }
  console.log('OK — 8 starters, max awaken, Uni gate, Src gate, silence excluded');
}

main();
