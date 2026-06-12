/** drop-economy-balance-check — npx tsx scripts/drop-economy-balance-check.ts */
import { AREAS } from '../src/db/seedData/areas';
import { buildEffectiveRewardPool } from '../src/systems/townLootSystem';
import { buildDropEconomyRows, getMoonBodySupplyCheck, initDropEconomyAuditDb, NORMAL_EXPLORE_POOL_EXCLUDED } from './audit/dropEconomyIndex';
import { buildWeaponAuditRows, buildArmorAuditRows } from './audit/acquisitionIndex';
import { runPhase21AcquisitionFailures } from './audit/phase21Checks';

const fails: string[] = [];
const warns: string[] = [];

function main() {
  const db = initDropEconomyAuditDb();

  // SSR/UR装備が序盤エリアで高頻度に出ない
  for (const area of AREAS.filter((a) => a.min < 20)) {
    const pool = buildEffectiveRewardPool(area.town, area.id);
    for (const p of pool) {
      const row = db.prepare('SELECT category, rarity FROM items WHERE id = ?').get(p.item_id) as { category: string; rarity: string } | undefined;
      if (!row || row.category !== 'equipment') continue;
      if (['SSR', 'UR'].includes(row.rarity)) fails.push(`${area.id}: ${p.item_id} (${row.rarity}) in early area pool`);
    }
  }

  // UR装備が通常探索で大量に出ない
  const urGear = buildDropEconomyRows().filter((r) => r.is_equipment === 'YES' && r.rarity === 'UR' && !r.estimated_rate_band.startsWith('0/'));
  for (const r of urGear) {
    if (r.estimated_rate_band.includes('HIGH') || r.estimated_rate_band.includes('/100 mid')) {
      fails.push(`UR gear oversupplied: ${r.item_id} ${r.estimated_rate_band}`);
    }
  }

  // 月下鎧が月下で大量発生しない
  const moon = getMoonBodySupplyCheck();
  if (moon.rateBand.includes('HIGH') || moon.rateBand.includes('/100 mid')) {
    fails.push(`arm_set_moon_body oversupplied in moon areas: ${moon.rateBand} weight=${moon.totalWeight}`);
  }
  if (moon.areas.length > 1) {
    warns.push(`arm_set_moon_body appears in ${moon.areas.length} moon areas (expected 1): ${moon.areas.join(', ')}`);
  }

  // unknown用途の高レアが通常ドロップしない
  for (const r of buildDropEconomyRows()) {
    if (!['SSR', 'UR'].includes(r.rarity)) continue;
    if (r.current_purpose.includes('unknown') && r.area_sources !== '—') {
      fails.push(`unknown high-rarity in area pool: ${r.item_id}`);
    }
  }

  // legacy/reserved が通常poolに入っていない
  for (const ex of NORMAL_EXPLORE_POOL_EXCLUDED) {
    for (const area of AREAS) {
      const pool = buildEffectiveRewardPool(area.town, area.id);
      if (pool.some((p) => p.item_id === ex)) fails.push(`excluded item ${ex} in ${area.id} effective pool`);
    }
  }

  // 高レア素材に用途がある
  for (const r of buildDropEconomyRows().filter((x) => ['SSR', 'UR'].includes(x.rarity) && x.category === 'material')) {
    if (r.area_sources !== '—' && r.purpose_count === '0') warns.push(`high-rarity material no purpose: ${r.item_id}`);
  }

  // Phase2.1 obtainable
  const wOb = buildWeaponAuditRows().filter((w) => w.obtainable === 'YES').length;
  const aOb = buildArmorAuditRows().filter((a) => a.obtainable === 'YES').length;
  if (wOb < 80) warns.push(`weapons obtainable ${wOb} (low)`);
  if (aOb < 80) warns.push(`armor obtainable ${aOb} (low)`);

  const p21 = runPhase21AcquisitionFailures();
  for (const i of p21) fails.push(`Phase2.1: ${i}`);

  console.log('## drop-economy-balance-check\n');
  console.log(`moon body: ${moon.name} areas=${moon.areas.join(',')} weight=${moon.totalWeight} rate=${moon.rateBand}`);

  if (warns.length) {
    console.log('\n## WARN');
    for (const w of warns) console.log(`- ${w}`);
  } else console.log('\n## WARN\n(none)');

  if (fails.length) {
    console.error('\n## FAIL');
    for (const f of fails) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log('\n✅ drop-economy-balance-check passed');
}

main();
