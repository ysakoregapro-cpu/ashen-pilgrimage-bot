/** src-material-route-audit — npx tsx scripts/src-material-route-audit.ts */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { UNI_SRC_MATERIAL_IDS } from '../src/db/seedData/jobProgressionMaster';
import { buildSrcMaterialRouteRows } from './audit/dropPoolAuditIndex';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

const HEADERS = [
  'material_id', 'name', 'job_or_weapon_family', 'drop_source', 'drop_trigger_rate',
  'selection_pool_size', 'effective_specific_rate', 'shop_available', 'exploration_available',
  'normal_enemy_available', 'exchange_available', 'balance_note',
];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);

  const rows = buildSrcMaterialRouteRows();
  const ng = rows.filter((r) => r[11]?.startsWith('NG'));
  const issues: string[] = [];
  if (rows.length !== 16) issues.push(`expected 16 materials, got ${rows.length}`);
  if (new Set(UNI_SRC_MATERIAL_IDS).size !== 16) issues.push(`UNI_SRC_MATERIAL_IDS count ${UNI_SRC_MATERIAL_IDS.length}`);

  const md = [
    '# Src Material Route Audit (Uni→Src Kai materials)',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `- Materials: ${rows.length} (expected 16)`,
    `- NG routes: ${ng.length}`,
    `- Trigger rate: ${rows[0]?.[4] ?? '?'} → per-mat ${rows[0]?.[6] ?? '?'}`,
    '',
    mdTable(HEADERS, rows),
    '',
    issues.length ? `Issues:\n${issues.map((i) => `- ${i}`).join('\n')}` : 'All checks passed',
  ].join('\n');

  writeReport('src-material-route-audit.md', md);
  writeCsv('src-material-route-audit.csv', HEADERS, rows);
  console.log(`✅ src-material-route-audit → ${rows.length} mats, ${ng.length} NG`);
  if (issues.length || ng.length) {
    for (const i of [...issues, ...ng.map((r) => r[0]!)]) console.error('  -', i);
    process.exit(1);
  }
}

main();
