/** rare-route-exclusivity-audit — npx tsx scripts/rare-route-exclusivity-audit.ts */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { buildRareRouteRows } from './audit/dropPoolAuditIndex';
import { UNI_SRC_MATERIAL_IDS } from '../src/db/seedData/jobProgressionMaster';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

const HEADERS = [
  'item_or_equipment_id', 'name', 'rarity', 'intended_route', 'found_routes',
  'is_exclusive', 'should_be_exclusive', 'balance_note',
];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);

  const rows = buildRareRouteRows();
  const uniRows = rows.filter((r) => UNI_SRC_MATERIAL_IDS.includes(r[0]!));
  const uniLeaks = uniRows.filter((r) => r[4]?.includes('explore:') || r[4]?.includes('shop:') || r[4]?.includes('exchange:'));

  const md = [
    '# Rare Route Exclusivity Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Uni→Src mats checked: ${uniRows.length}, leaks: ${uniLeaks.length}`,
    '',
    mdTable(HEADERS, rows.slice(0, 35)),
  ].join('\n');

  writeReport('rare-route-exclusivity-audit.md', md);
  writeCsv('rare-route-exclusivity-audit.csv', HEADERS, rows);
  console.log(`✅ rare-route-exclusivity-audit → ${rows.length} items, uni leaks ${uniLeaks.length}`);
  if (uniLeaks.length) {
    console.error('❌ Uni→Src materials found outside furnace keeper route');
    process.exit(1);
  }
}

main();
