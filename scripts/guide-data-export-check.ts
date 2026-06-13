/** guide-data-export-check — npx tsx scripts/guide-data-export-check.ts */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { EXCLUDED_EQUIPMENT } from '../src/db/seedData/equipmentClassification';
import { runEquipmentAcquisitionAudit } from '../src/systems/equipmentAcquisitionAudit';

const GUIDE_DIR = path.join(process.cwd(), 'reports', 'guide');
const REQUIRED = [
  'items.csv', 'equipment.csv', 'equipment_sets.csv', 'drop_routes.csv',
  'job_unlocks.csv', 'trials.csv', 'README.md',
];
const ITEM_HEADERS = [
  'item_id', 'name', 'rarity', 'purpose', 'category', 'effect_summary', 'value_sell_price',
  'is_consumable', 'is_material', 'is_legacy', 'is_reserved_future', 'normal_drop_allowed',
  'boss_drop_allowed', 'raid_drop_allowed', 'source_summary', 'progression_tier',
  'estimated_rate_per_100', 'risk', 'notes',
];
const fails: string[] = [];

function parseCsv(file: string): { headers: string[]; rows: string[][] } {
  const text = fs.readFileSync(path.join(GUIDE_DIR, file), 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = lines[0]!.split(',').map((h) => h.replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!;
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  });
  return { headers, rows };
}

function assert(cond: boolean, msg: string) {
  if (!cond) fails.push(msg);
}

function main() {
  execSync('npx tsx scripts/export-guide-data.ts', { stdio: 'inherit', cwd: process.cwd() });

  for (const f of REQUIRED) {
    assert(fs.existsSync(path.join(GUIDE_DIR, f)), `missing ${f}`);
  }

  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);

  const itemCount = (db.prepare(`
    SELECT COUNT(*) c FROM items WHERE category NOT IN ('skill', 'quest')
  `).get() as { c: number }).c;
  const items = parseCsv('items.csv');
  assert(items.headers.join(',') === ITEM_HEADERS.join(','), 'items.csv header mismatch');
  assert(items.rows.length === itemCount, `items.csv rows ${items.rows.length} !== ${itemCount}`);
  for (const row of items.rows) {
    if (!row[0]) fails.push('items.csv empty item_id row');
  }

  const equipCount = (db.prepare('SELECT COUNT(*) c FROM equipment').get() as { c: number }).c;
  const equipment = parseCsv('equipment.csv');
  assert(equipment.rows.length === equipCount, `equipment.csv ${equipment.rows.length} !== ${equipCount}`);

  const setCount = (db.prepare('SELECT COUNT(*) c FROM equipment_sets').get() as { c: number }).c;
  const sets = parseCsv('equipment_sets.csv');
  assert(sets.rows.length === setCount, `equipment_sets.csv ${sets.rows.length} !== ${setCount} (expected 18)`);

  const drops = parseCsv('drop_routes.csv');
  const dropText = drops.rows.map((r) => r.join(',')).join('\n');
  assert(dropText.includes('boss_silent_page'), 'drop_routes missing boss_silent_page');
  assert(dropText.includes('wpn_black_iron_blade'), 'drop_routes missing wpn_black_iron_blade');

  const legacyRows = equipment.rows.filter((r) => r[24] && r[24] !== 'NO');
  assert(legacyRows.length >= 1, 'equipment.csv should mark legacy/excluded rows');

  console.log('## guide-data-export-check\n');
  if (fails.length) {
    console.error('FAIL');
    for (const f of fails) console.error(`- ${f}`);
    process.exit(1);
  }
  const { stats } = runEquipmentAcquisitionAudit(db);
  console.log(`OK — items=${items.rows.length}, equipment=${equipment.rows.length}, sets=${sets.rows.length}, legacy rows=${legacyRows.length}, playable audit=${stats.obtainable_weapons}+${stats.obtainable_armor} gear`);
}

main();
