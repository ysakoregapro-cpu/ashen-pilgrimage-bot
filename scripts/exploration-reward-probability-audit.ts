/** exploration-reward-probability-audit — npx tsx scripts/exploration-reward-probability-audit.ts */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { buildExplorationRewardRows } from './audit/dropPoolAuditIndex';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

const HEADERS = [
  'area_id', 'area_name', 'level_band', 'has_no_drop', 'has_common_filler', 'has_weak_material',
  'has_consumable', 'has_rare_material', 'has_ssr_or_ur', 'estimated_common_rate', 'estimated_rare_rate',
  'estimated_ur_rate', 'balance_note',
];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);

  const rows = buildExplorationRewardRows();
  const warn = rows.filter((r) => r[12]?.startsWith('WARN'));

  const md = [
    '# Exploration Reward Probability Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Areas: ${rows.length}, WARN: ${warn.length}`,
    '',
    mdTable(HEADERS, rows.slice(0, 40)),
    rows.length > 40 ? `\n… +${rows.length - 40} rows in CSV` : '',
  ].join('\n');

  writeReport('exploration-reward-probability-audit.md', md);
  writeCsv('exploration-reward-probability-audit.csv', HEADERS, rows);
  console.log(`✅ exploration-reward-probability-audit → ${rows.length} areas, ${warn.length} warn`);
}

main();
