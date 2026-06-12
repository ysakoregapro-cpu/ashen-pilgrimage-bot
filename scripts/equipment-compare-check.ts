/** equipment-compare-check — npx tsx scripts/equipment-compare-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { getEquipmentComparison } from '../src/systems/itemDetailSystem';
import { equipItem } from '../src/systems/equipmentSystem';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { addItem } from '../src/systems/inventorySystem';

const TEST_USER = 'equipment-compare-user';
const issues: string[] = [];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  if (!getPlayer(TEST_USER)) createPlayer(TEST_USER, 'g', 'Test', 'c');

  db.prepare('DELETE FROM player_inventory WHERE user_id = ?').run(TEST_USER);
  db.prepare('DELETE FROM player_equipment WHERE user_id = ?').run(TEST_USER);

  addItem(TEST_USER, 'wpn_traveler_sword', 1);
  addItem(TEST_USER, 'wpn_old_road_knife', 1);
  const sword = db.prepare('SELECT id FROM player_inventory WHERE user_id = ? AND item_id = ?').get(TEST_USER, 'wpn_traveler_sword') as { id: number };
  const knife = db.prepare('SELECT id FROM player_inventory WHERE user_id = ? AND item_id = ?').get(TEST_USER, 'wpn_old_road_knife') as { id: number };

  equipItem(TEST_USER, sword.id);
  const sameCompare = getEquipmentComparison(TEST_USER, sword.id);
  if (!sameCompare.includes('現在装備中') && !sameCompare.includes('変化なし')) {
    issues.push('装備中アイテム比較に「現在装備中/変化なし」なし');
  }

  const diffCompare = getEquipmentComparison(TEST_USER, knife.id);
  if (!diffCompare.includes('差分') && !diffCompare.includes('攻撃') && !diffCompare.includes('現在装備')) {
    issues.push('別装備比較に差分表示なし');
  }
  if (diffCompare.includes('基礎ボーナス')) {
    issues.push('旧「基礎ボーナス」表示が残存（effective stats 未使用の可能性）');
  }

  db.prepare('UPDATE player_inventory SET upgrade_level = 3 WHERE id = ?').run(knife.id);
  const upgCompare = getEquipmentComparison(TEST_USER, knife.id);
  if (!upgCompare.includes('+') && !upgCompare.includes('攻撃')) {
    issues.push('強化値込み比較が反映されていない可能性');
  }

  if (issues.length) {
    console.error('❌ equipment-compare-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ equipment-compare-check passed');
}

main();
