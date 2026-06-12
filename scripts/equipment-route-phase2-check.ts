/** equipment-route-phase2-check — npx tsx scripts/equipment-route-phase2-check.ts */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import {
  collectAuditFailures,
  runEquipmentAcquisitionAudit,
} from '../src/systems/equipmentAcquisitionAudit';
import { EXCLUDED_EQUIPMENT } from '../src/db/seedData/equipmentClassification';
import { AREAS } from '../src/db/seedData/areas';

function main(): void {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);

  const issues: string[] = [];
  const { rows, seriesSummary } = runEquipmentAcquisitionAudit(db);
  issues.push(...collectAuditFailures(rows, seriesSummary));

  for (const [id, ex] of Object.entries(EXCLUDED_EQUIPMENT)) {
    if (!ex.reason.trim()) issues.push(`legacy理由空: ${id}`);
  }

  const srcWeapons = db.prepare('SELECT src_item_id FROM src_weapons').all() as Array<{ src_item_id: string }>;
  for (const s of srcWeapons) {
    const inArea = AREAS.some((a) => a.rewards.includes(s.src_item_id));
    if (inArea) issues.push(`Src武器が探索プールに混入: ${s.src_item_id}`);
  }

  for (const id of Object.keys(EXCLUDED_EQUIPMENT)) {
    const inArea = AREAS.some((a) => a.rewards.includes(id));
    if (inArea) issues.push(`legacy装備が探索プールに残存: ${id}`);
  }

  const arms = rows.filter((r) => r.slot === 'arms' && r.should_be_obtainable === 'YES');
  const legs = rows.filter((r) => r.slot === 'legs' && r.should_be_obtainable === 'YES');
  const feet = rows.filter((r) => r.slot === 'feet' && r.should_be_obtainable === 'YES');
  const armsOk = arms.filter((r) => r.current_obtainable === 'YES').length;
  const legsOk = legs.filter((r) => r.current_obtainable === 'YES').length;
  const feetOk = feet.filter((r) => r.current_obtainable === 'YES').length;
  if (armsOk < arms.length * 0.85) issues.push(`arms配置不足: ${armsOk}/${arms.length}`);
  if (legsOk < legs.length * 0.85) issues.push(`legs配置不足: ${legsOk}/${legs.length}`);
  if (feetOk < feet.length * 0.85) issues.push(`feet配置不足: ${feetOk}/${feet.length}`);

  console.log(`arms ${armsOk}/${arms.length}, legs ${legsOk}/${legs.length}, feet ${feetOk}/${feet.length}`);

  if (issues.length) {
    console.error('❌ equipment-route-phase2-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ equipment-route-phase2-check passed');
}

main();
