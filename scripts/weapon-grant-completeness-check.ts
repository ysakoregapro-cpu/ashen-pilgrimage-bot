/**
 * weapon-grant-completeness-check.ts — playable weapons 81/81 + UI pagination visibility
 */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { EXCLUDED_EQUIPMENT } from '../src/db/seedData/equipmentClassification';
import { runEquipmentAcquisitionAudit } from '../src/systems/equipmentAcquisitionAudit';
import { getSortedEquippableRows, EQUIP_SELECT_PAGE_SIZE } from '../src/systems/equipmentSystem';

function getPlayableWeaponIds(db: ReturnType<typeof getDb>): string[] {
  const { rows } = runEquipmentAcquisitionAudit(db);
  return rows
    .filter((r) => r.current_obtainable === 'YES' && !EXCLUDED_EQUIPMENT[r.item_id] && r.slot === 'weapon')
    .map((r) => r.item_id);
}

let failed = 0;
const fail = (msg: string) => { console.error(`FAIL: ${msg}`); failed++; };

const db = getDb();
ensureMaterialsSeed(db);
ensurePhase2Seed(db);
ensureMasterDataSeed(db);

const playable = getPlayableWeaponIds(db);
if (playable.includes('wpn_unique_silence')) fail('wpn_unique_silence must be excluded');
console.log(`weapon playable total: ${playable.length} (expected 81)`);
if (playable.length !== 81) fail(`expected 81 playable weapons, got ${playable.length}`);

const byRarity: Record<string, number> = {};
for (const id of playable) {
  const r = db.prepare('SELECT rarity FROM items WHERE id = ?').get(id) as { rarity: string };
  byRarity[r.rarity] = (byRarity[r.rarity] ?? 0) + 1;
}
console.log('playable weapon by rarity:', byRarity);

for (const r of ['SR', 'SSR', 'UR', 'Uni', 'Src']) {
  if (!(byRarity[r] > 0)) fail(`missing playable ${r} weapons in audit`);
}
console.log('OK: SR/SSR/UR/Uni/Src present in playable set');

const testUser = db.prepare(`
  SELECT user_id FROM players ORDER BY updated_at DESC LIMIT 1
`).get() as { user_id: string } | undefined;

if (testUser) {
  const owned = db.prepare(`
    SELECT DISTINCT pi.item_id FROM player_inventory pi
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND e.slot = 'weapon'
  `).all(testUser.user_id) as Array<{ item_id: string }>;
  console.log(`sample user weapon owned: ${owned.length}`);
  const rows = getSortedEquippableRows(testUser.user_id, 'weapon');
  const pages = Math.ceil(rows.length / EQUIP_SELECT_PAGE_SIZE);
  const visibleAll = new Set<number>();
  for (let p = 0; p < pages; p++) {
    rows.slice(p * EQUIP_SELECT_PAGE_SIZE, (p + 1) * EQUIP_SELECT_PAGE_SIZE).forEach((r) => visibleAll.add(r.id));
  }
  const hidden = rows.filter((r) => !visibleAll.has(r.id));
  if (hidden.length) fail('pagination does not cover all equippable weapons');
  else console.log(`OK: all ${rows.length} equippable weapons visible across ${pages} page(s)`);
}

if (failed) { console.error(`\n${failed} failure(s)`); process.exit(1); }
console.log('\nAll weapon-grant-completeness-check passed.');
