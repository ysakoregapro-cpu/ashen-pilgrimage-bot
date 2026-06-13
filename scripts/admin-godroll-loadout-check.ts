/**
 * admin-godroll-loadout-check.ts — god-roll flag semantics (static + optional DB verify)
 */
import { getDb } from '../src/db/database';
import { buildGodRollAffixes } from '../src/db/seedData/equipmentAffixMaster';
import { isArmorOrAccessorySlot } from '../src/db/seedData/equipmentAffixMaster';

const TARGET_USER = '1512670896278470688';

let failed = 0;
const fail = (msg: string) => { console.error(`FAIL: ${msg}`); failed++; };

const god = buildGodRollAffixes();
if (!god.find((a) => a.key === 'attack_percent' && a.value === 7.0)) fail('god roll missing attack 7.0%');
if (!god.find((a) => a.key === 'damage_dealt_percent' && a.value === 7.0)) fail('god roll missing dealt 7.0%');
if (god.some((a) => a.drawbackKey)) fail('god roll must have no drawback');
console.log('OK: buildGodRollAffixes shape');

const db = getDb();
const player = db.prepare('SELECT user_id FROM players WHERE user_id = ?').get(TARGET_USER);
if (player) {
  const rows = db.prepare(`
    SELECT pi.affix_json, e.slot, i.rarity, i.id
    FROM player_inventory pi
    JOIN equipment e ON pi.item_id = e.item_id
    JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ?
  `).all(TARGET_USER) as Array<{ affix_json: string | null; slot: string; rarity: string; id: string }>;

  for (const r of rows) {
    if (r.slot === 'weapon' && r.affix_json) fail(`weapon ${r.id} has affix_json`);
    if (!['SSR', 'UR'].includes(r.rarity) && r.affix_json?.includes('"value":7')) {
      // only warn for non-target god rolls in dev DB
    }
    if (['SSR', 'UR'].includes(r.rarity) && isArmorOrAccessorySlot(r.slot) && r.affix_json) {
      const affixes = JSON.parse(r.affix_json) as Array<{ key: string; value: number; drawbackKey: string | null }>;
      const isGod = affixes.some((a) => a.key === 'attack_percent' && a.value === 7)
        && affixes.some((a) => a.key === 'damage_dealt_percent' && a.value === 7)
        && affixes.every((a) => !a.drawbackKey);
      if (isGod) console.log(`INFO: ${r.id} has god-roll affixes`);
    }
  }
  console.log(`OK: scanned ${rows.length} inventory equipment rows for user ${TARGET_USER}`);
} else {
  console.log(`SKIP: user ${TARGET_USER} not in local DB — static checks only`);
}

if (failed) { console.error(`\n${failed} failure(s)`); process.exit(1); }
console.log('\nAll admin-godroll-loadout-check passed.');
