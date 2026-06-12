/** equipment-detail-source-audit — npx tsx scripts/equipment-detail-source-audit.ts */
import { getDb } from '../src/db/database';
import { initAuditDb } from './audit/acquisitionIndex';
import { writeReport, mdTable } from './audit/reportWriter';
import { runPhase21DetailHintFailures } from './audit/phase21Checks';

function main() {
  initAuditDb();
  const db = getDb();

  const withAcq = db.prepare(`SELECT COUNT(*) as c FROM items WHERE acquisition_json IS NOT NULL AND acquisition_json != ''`).get() as { c: number };
  const equipTotal = db.prepare(`SELECT COUNT(*) as c FROM items WHERE category='equipment'`).get() as { c: number };
  const wrappedJson = db.prepare(`
    SELECT COUNT(*) as c FROM items WHERE category='equipment' AND acquisition_json LIKE '%"sources"%'
  `).get() as { c: number };

  const md = [
    '# Equipment Detail Source Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Current detail UI files',
    '| File | Role |',
    '| --- | --- |',
    '| `src/systems/itemDetailSystem.ts` | `formatAcquisitionSourceHint`, `buildAcquisitionHintLines`, legacy display |',
    '| `src/utils/inventoryUi.ts` | 所持品一覧、`detail:inv` select |',
    '| `src/systems/inventoryUseSystem.ts` | 所持品使用 `inv:use` |',
    '| `src/db/seedData/masterDataSeed.ts` | builds `acquisition_json` from areas + Kai/Src |',
    '| `src/db/seedData/equipmentClassification.ts` | legacy/excluded registry |',
    '',
    '## Current acquisition data',
    `- items with acquisition_json: ${withAcq.c} / equipment ${equipTotal.c}`,
    `- Wrapped { sources: [...] } format: ${wrappedJson.c}`,
    `- legacy/excluded → 「入手先：現在通常入手不可」`,
    '',
    '## Display flow',
    '1. User picks item → `buildEquipmentDetailView`',
    '2. Section「入手」→ `formatAcquisitionSourceHint(itemId, userId)`',
    '3. Parses acquisition_json + EXCLUDED_EQUIPMENT + town unlock masks',
    '',
    '## Phase2 consumable use',
    '| Item | Value |',
    '| --- | --- |',
    '| inv:use handler | index.ts + inventoryUseSystem |',
    '| Out of battle | useConsumableOutOfBattle |',
  ].join('\n');

  writeReport('equipment-detail-source-audit.md', md);
  console.log('✅ equipment-detail-source-audit report written');

  const phase21Issues = runPhase21DetailHintFailures();
  if (phase21Issues.length) {
    console.error('❌ Phase2.1 detail hint checks failed:');
    for (const i of phase21Issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ Phase2.1 detail hint checks passed');
}

main();
