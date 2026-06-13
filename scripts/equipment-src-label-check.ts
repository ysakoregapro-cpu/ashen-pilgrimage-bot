/** equipment-src-label-check — npx tsx scripts/equipment-src-label-check.ts */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { addItem } from '../src/systems/inventorySystem';
import {
  formatOwnedEquipmentLabel,
  formatUpgradeTag,
  mapInventoryRowToEquipmentSelect,
} from '../src/systems/equipmentLabelSystem';
import { getEquipmentComparison } from '../src/systems/itemDetailSystem';

const TEST_USER = 'equipment-src-label-check-user';
const fails: string[] = [];

function assert(cond: boolean, msg: string) {
  if (!cond) fails.push(msg);
}

function labelFor(itemId: string, patch?: Partial<{ upgrade_level: number; src_level: number }>): string {
  const db = getDb();
  const row = db.prepare(`
    SELECT pi.id, pi.upgrade_level, pi.src_level, pi.awakening_level, pi.durability_state, pi.is_equipped,
      i.name, i.rarity, e.slot
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND pi.item_id = ?
    LIMIT 1
  `).get(TEST_USER, itemId) as {
    id: number; name: string; rarity: string; upgrade_level: number; src_level: number;
    awakening_level: number; durability_state: string; is_equipped: number; slot: string;
  };
  if (patch?.upgrade_level != null) row.upgrade_level = patch.upgrade_level;
  if (patch?.src_level != null) row.src_level = patch.src_level;
  return formatOwnedEquipmentLabel(mapInventoryRowToEquipmentSelect(row));
}

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);

  if (!getPlayer(TEST_USER)) {
    createPlayer(TEST_USER, 'src-label-guild', 'SrcLabel', 'ch-src');
  }
  db.prepare('DELETE FROM player_inventory WHERE user_id = ?').run(TEST_USER);

  // 霧払いの杖 — R weapon, src_level=1 must NOT show Src+1 (regression #1395)
  addItem(TEST_USER, 'wpn_mist_staff', 1);
  db.prepare(`
    UPDATE player_inventory SET upgrade_level = 1, src_level = 1, awakening_level = 0
    WHERE user_id = ? AND item_id = 'wpn_mist_staff'
  `).run(TEST_USER);

  const mistLabel = labelFor('wpn_mist_staff');
  assert(!mistLabel.includes('Src'), `R weapon with src_level=1 must not show Src: ${mistLabel}`);
  assert(mistLabel.includes('+1'), `R weapon upgrade_level=1 should show +1: ${mistLabel}`);

  const mistTag = formatUpgradeTag({ rarity: 'R', upgrade_level: 1, src_level: 1 });
  assert(mistTag === '+1', `formatUpgradeTag R+src_level → ${mistTag}`);

  const inv = db.prepare(`
    SELECT id FROM player_inventory WHERE user_id = ? AND item_id = 'wpn_mist_staff'
  `).get(TEST_USER) as { id: number };
  const compare = getEquipmentComparison(TEST_USER, inv.id);
  assert(!compare.includes('Src+'), `comparison must not show Src for R gear: ${compare.slice(0, 120)}`);

  db.prepare('DELETE FROM player_inventory WHERE user_id = ?').run(TEST_USER);

  addItem(TEST_USER, 'wpn_traveler_sword', 1);
  db.prepare(`UPDATE player_inventory SET upgrade_level = 2, src_level = 0 WHERE user_id = ? AND item_id = 'wpn_traveler_sword'`).run(TEST_USER);
  const nLabel = labelFor('wpn_traveler_sword');
  assert(nLabel.includes('+2') && !nLabel.includes('Src'), `N/SR normal enhance: ${nLabel}`);

  db.prepare('DELETE FROM player_inventory WHERE user_id = ?').run(TEST_USER);

  const srcRow = db.prepare(`
    SELECT i.id AS item_id FROM items i WHERE i.rarity = 'Src' AND i.category = 'equipment' LIMIT 1
  `).get() as { item_id: string } | undefined;
  if (srcRow) {
    addItem(TEST_USER, srcRow.item_id, 1);
    db.prepare(`
      UPDATE player_inventory SET src_level = 1, upgrade_level = 0 WHERE user_id = ? AND item_id = ?
    `).run(TEST_USER, srcRow.item_id);
    const srcLabel = labelFor(srcRow.item_id);
    assert(srcLabel.includes('Src+1'), `Src rarity should show Src+1: ${srcLabel}`);
  } else {
    console.warn('WARN: no Src equipment in DB — skipped Src positive case');
  }

  console.log('## equipment-src-label-check\n');
  if (fails.length) {
    console.error('FAIL');
    for (const f of fails) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log('OK — R/SR no false Src; upgrade +1 not Src+1; Src rarity shows Src+N');
}

main();
