/** drop-pool-probability-audit — npx tsx scripts/drop-pool-probability-audit.ts */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { buildDropPoolAuditRows } from './audit/dropPoolAuditIndex';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

const HEADERS = [
  'pool_id', 'context', 'no_drop_weight', 'common_weight', 'consumable_weight', 'weak_upgrade_weight',
  'low_gear_weight', 'rare_material_weight', 'ssr_gear_weight', 'ur_material_weight', 'ur_gear_weight',
  'total_weight', 'rare_effective_rate', 'ur_effective_rate', 'balance_note',
];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);

  const rows = buildDropPoolAuditRows();
  const ng = rows.filter((r) => r[14]?.includes('WARN') && !r[0]?.includes('uni_src'));

  const md = [
    '# Drop Pool Probability Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    mdTable(HEADERS, rows),
    '',
    `NG/WARN pools: ${ng.length}`,
  ].join('\n');

  writeReport('drop-pool-probability-audit.md', md);
  writeCsv('drop-pool-probability-audit.csv', HEADERS, rows);
  console.log(`✅ drop-pool-probability-audit → ${rows.length} pools, ${ng.length} warn`);
  if (rows.some((r) => r[0] === 'uni_src_furnace' && !r[14]?.startsWith('OK'))) {
    console.error('❌ uni_src pool audit failed');
    process.exit(1);
  }
}

main();
