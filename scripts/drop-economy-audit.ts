/** drop-economy-audit — npx tsx scripts/drop-economy-audit.ts */
import { buildDropEconomyRows } from './audit/dropEconomyIndex';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';
import { runPhase21AcquisitionFailures } from './audit/phase21Checks';

const HEADERS = [
  'item_id', 'name', 'category', 'kind', 'rarity', 'sell_price', 'is_equipment', 'equipment_slot',
  'set_id', 'area_sources', 'monster_sources', 'shop_sources', 'boss_sources', 'rematch_sources',
  'valhalla_sources', 'raid_sources', 'estimated_weight', 'estimated_rate_band', 'progression_tier',
  'current_purpose', 'purpose_count', 'expected_consumption', 'expected_surplus_risk',
  'gold_farming_risk', 'is_key_material', 'is_direct_gear_drop', 'risk', 'recommendation',
];

function main() {
  const rows = buildDropEconomyRows();
  const highRisk = rows.filter((r) => r.risk === 'balance_risk' || r.risk === 'over_supplied');
  const moonBody = rows.find((r) => r.item_id === 'arm_set_moon_body');

  const md = [
    '# Drop Economy Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `- Items audited: ${rows.length}`,
    `- balance_risk / over_supplied: ${highRisk.length}`,
    '',
    '## 月下鎧 (arm_set_moon_body)',
    moonBody ? `- rate: ${moonBody.estimated_rate_band} | risk: ${moonBody.risk} | areas: ${moonBody.area_sources}` : '- not found',
    '',
    '## High risk items (top 20)',
    mdTable(['item_id', 'name', 'rarity', 'rate', 'risk', 'action'],
      highRisk.slice(0, 20).map((r) => [r.item_id, r.name, r.rarity, r.estimated_rate_band, r.risk, r.recommendation])),
  ].join('\n');

  writeReport('drop-economy-audit.md', md);
  writeCsv('drop-economy-audit.csv', HEADERS, rows.map((r) => HEADERS.map((h) => (r as Record<string, string>)[h] ?? '')));

  console.log(`✅ drop-economy-audit → ${rows.length} rows, ${highRisk.length} high-risk`);
  const p21 = runPhase21AcquisitionFailures();
  if (p21.length) {
    console.error('❌ Phase2.1 obtainable check failed after drop rebalance');
    for (const i of p21.slice(0, 10)) console.error('  -', i);
    process.exit(1);
  }
}

main();
