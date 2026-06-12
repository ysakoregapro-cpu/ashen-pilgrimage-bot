/** equipment-completion-audit — npx tsx scripts/equipment-completion-audit.ts */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import {
  auditRowsToCsv,
  collectAuditFailures,
  formatAuditMarkdown,
  runEquipmentAcquisitionAudit,
} from '../src/systems/equipmentAcquisitionAudit';

function main(): void {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);

  const { rows, seriesSummary, stats } = runEquipmentAcquisitionAudit(db);
  const md = formatAuditMarkdown(stats, rows, seriesSummary);
  const csv = auditRowsToCsv(rows);
  const issues = collectAuditFailures(rows, seriesSummary);

  const reportsDir = join(process.cwd(), 'reports');
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, 'equipment-completion-audit.md'), md, 'utf8');
  writeFileSync(join(reportsDir, 'equipment-completion-audit.csv'), csv, 'utf8');

  console.log(md);
  console.log(`\nReport: reports/equipment-completion-audit.md`);
  console.log(`CSV: reports/equipment-completion-audit.csv`);

  if (issues.length) {
    console.error('\n❌ equipment-completion-audit failed:');
    for (const i of issues.slice(0, 40)) console.error('  -', i);
    if (issues.length > 40) console.error(`  ...他${issues.length - 40}件`);
    process.exit(1);
  }
  console.log('\n✅ equipment-completion-audit passed');
}

main();
