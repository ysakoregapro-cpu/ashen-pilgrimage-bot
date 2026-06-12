/** set-bonus-display-check — npx tsx scripts/set-bonus-display-check.ts */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { createPlayer, getPlayer, recalculatePlayerStats } from '../src/systems/playerSystem';
import { addItem } from '../src/systems/inventorySystem';
import { equipItem } from '../src/systems/equipmentSystem';
import {
  buildActiveSetBonusSection,
  formatActiveSetBonusBody,
  getEquippedSetCounts,
  getEquippedSetSummary,
} from '../src/systems/setBonusDisplaySystem';
import { formatEquipmentDisplay } from '../src/systems/equipmentSystem';
import { formatCurrentEquipment } from '../src/systems/prepSystem';
import { playerRecordEmbed } from '../src/utils/townUi';
import { buildAreaDetailView } from '../src/systems/townActionSystem';
import { buildUpgradeConfirmPayload } from '../src/systems/upgradeConfirmSystem';
import { buildEquipChangeConfirmRows } from '../src/systems/equipConfirmSystem';
import { sanitizeComponents } from '../src/utils/componentSafety';

const TEST_USER = 'set-bonus-display-check-user';
const issues: string[] = [];

function assert(cond: boolean, msg: string): void {
  if (!cond) issues.push(msg);
}

function initDb() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);
}

function clearEquipment(userId: string): void {
  getDb().prepare('DELETE FROM player_equipment WHERE user_id = ?').run(userId);
  getDb().prepare('UPDATE player_inventory SET is_equipped = 0 WHERE user_id = ?').run(userId);
}

function equipSeriesPieces(userId: string, setId: string, count: number): void {
  const ids = getDb().prepare(`
    SELECT item_id FROM equipment WHERE series_id = ? ORDER BY slot LIMIT ?
  `).all(setId, count) as Array<{ item_id: string }>;
  for (const row of ids) {
    const invId = addItem(userId, row.item_id, 1);
    equipItem(userId, invId);
  }
  recalculatePlayerStats(userId);
}

function main() {
  initDb();
  if (!getPlayer(TEST_USER)) {
    createPlayer(TEST_USER, 'guild-set-check', 'SetCheck', 'ch-set');
  }
  clearEquipment(TEST_USER);
  getDb().prepare('UPDATE players SET level = 30 WHERE user_id = ?').run(TEST_USER);

  assert(formatActiveSetBonusBody(TEST_USER) === 'なし', 'empty equip should show なし');
  const emptySection = buildActiveSetBonusSection(TEST_USER);
  assert(emptySection.includes('なし'), 'section should include なし when inactive');

  equipSeriesPieces(TEST_USER, 'set_starfield', 3);
  const counts = getEquippedSetCounts(TEST_USER);
  assert(counts.set_starfield === 3, `expected 3 starfield pieces, got ${counts.set_starfield ?? 0}`);

  const summaries = getEquippedSetSummary(TEST_USER);
  assert(summaries.length >= 1, 'expected at least one active set summary');
  const star = summaries.find((s) => s.set_id === 'set_starfield');
  assert(!!star, 'starfield summary missing');
  if (star) {
    assert(star.equipped_count === 3, 'starfield equipped count');
    assert(star.total_pieces === 5, `starfield total pieces expected 5, got ${star.total_pieces}`);
    assert(star.active_bonuses.length === 2, `expected 2 active tiers (2+3), got ${star.active_bonuses.length}`);
    assert(star.active_bonuses.some((b) => b.piece_count === 2), 'missing 2-piece tier');
    assert(star.active_bonuses.some((b) => b.piece_count === 3), 'missing 3-piece tier');
    assert(!star.active_bonuses.some((b) => b.piece_count === 5), '5-piece tier should not activate at 3/5');
  }

  const body = formatActiveSetBonusBody(TEST_USER);
  assert(body.includes('星原'), 'display should include set name');
  assert(body.includes('3/5'), 'display should include 3/5');
  assert(body.includes('2部位'), 'display should include 2-piece effect');

  const equipText = formatEquipmentDisplay(TEST_USER);
  assert(equipText.includes('発動中のセット効果'), 'equip display should include set section');

  const prepText = formatCurrentEquipment(TEST_USER);
  assert(prepText.includes('発動中のセット効果'), 'prep display should include set section');

  const player = getPlayer(TEST_USER)!;
  const embed = playerRecordEmbed(player, TEST_USER);
  const setField = embed.data.fields?.find((f) => f.name === '発動中のセット効果');
  assert(!!setField, 'playerRecordEmbed missing set field');
  assert(setField?.value?.includes('星原'), 'playerRecordEmbed set field content');

  const explore = buildAreaDetailView(TEST_USER, 'area_star_outskirts');
  const exploreLabels = explore.components.flatMap((r) =>
    r.toJSON().components.filter((c) => c.type === 2).map((c) => c.label ?? ''),
  );
  assert(exploreLabels.includes('ひとつ戻る'), 'Phase2.3 explore back broken');
  assert(exploreLabels.includes('街に戻る'), 'Phase2.3 explore town broken');

  const inv = getDb().prepare(`
    SELECT id FROM player_inventory WHERE user_id = ? LIMIT 1
  `).get(TEST_USER) as { id: number };
  const upgradeConfirm = buildUpgradeConfirmPayload(TEST_USER, 'enhance', inv.id);
  sanitizeComponents(upgradeConfirm.components ?? [], 'set-check-upgrade');
  const equipNav = buildEquipChangeConfirmRows(inv.id, 'weapon', 'slash');
  assert(equipNav.length >= 2, 'equip confirm nav rows');

  if (issues.length) {
    console.error('❌ set-bonus-display-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ set-bonus-display-check passed');
}

main();
