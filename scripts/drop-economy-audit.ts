/** drop-economy-audit — npx tsx scripts/drop-economy-audit.ts */
import { buildDropEconomyRows, getNamedHighRarityAudits, getSsrGearRateByArea, getUrMaterialRateByArea } from './audit/dropEconomyIndex';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';
import { runPhase21AcquisitionFailures } from './audit/phase21Checks';

const HEADERS = [
  'item_id', 'name', 'category', 'kind', 'rarity', 'sell_price', 'is_equipment', 'equipment_slot',
  'set_id', 'area_sources', 'monster_sources', 'shop_sources', 'boss_sources', 'rematch_sources',
  'valhalla_sources', 'raid_sources', 'estimated_weight', 'estimated_rate_band', 'progression_tier',
  'current_purpose', 'purpose_count', 'expected_consumption', 'expected_surplus_risk',
  'gold_farming_risk', 'is_key_material', 'is_direct_gear_drop', 'risk', 'recommendation',
];

const NAMED_HEADERS = ['item_id', 'name', 'rarity', 'sell_price', 'sources', 'weight', 'estimated_rate_per_100', 'risk', 'recommendation', 'final_action'];

function main() {
  const rows = buildDropEconomyRows();
  const named = getNamedHighRarityAudits();
  const highRisk = rows.filter((r) => r.risk === 'balance_risk' || r.risk === 'over_supplied');
  const ssrWeapons = getSsrGearRateByArea('weapon').filter((r) => parseFloat(r.rate_per_100) >= 1).slice(0, 15);
  const urMats = getUrMaterialRateByArea().filter((r) => !r.rate_per_100.startsWith('0/')).slice(0, 10);

  const md = [
    '# Drop Economy Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `- Items audited: ${rows.length}`,
    `- balance_risk / over_supplied: ${highRisk.length}`,
    '',
    '## 名指し高レア品',
    mdTable(NAMED_HEADERS, named.map((n) => NAMED_HEADERS.map((h) => (n as Record<string, string>)[h] ?? ''))),
    '',
    '## SSR武器 — エリア別（rate≥1/100 上位）',
    ssrWeapons.length
      ? mdTable(['area', 'item', 'weight', 'rate/100'], ssrWeapons.map((r) => [r.area_id, r.name, String(r.weight), r.rate_per_100]))
      : '(該当なし — すべて trace/low)',
    '',
    '## UR素材 — 探索pool内',
    urMats.length
      ? mdTable(['area', 'item', 'weight', 'rate/100'], urMats.map((r) => [r.area_id, r.name, String(r.weight), r.rate_per_100]))
      : '(探索poolにUR素材なし — boss/valhalla/raid寄り)',
    '',
    '## High risk items (top 20)',
    mdTable(['item_id', 'name', 'rarity', 'rate', 'risk', 'action'],
      highRisk.slice(0, 20).map((r) => [r.item_id, r.name, r.rarity, r.estimated_rate_band, r.risk, r.recommendation])),
  ].join('\n');

  writeReport('drop-economy-audit.md', md);
  writeCsv('drop-economy-audit.csv', HEADERS, rows.map((r) => HEADERS.map((h) => (r as Record<string, string>)[h] ?? '')));
  writeCsv('drop-economy-named-audit.csv', NAMED_HEADERS, named.map((n) => NAMED_HEADERS.map((h) => (n as Record<string, string>)[h] ?? '')));

  console.log(`✅ drop-economy-audit → ${rows.length} rows, ${highRisk.length} high-risk`);
  for (const n of named) {
    console.log(`   ${n.item_id}: rate=${n.estimated_rate_per_100} action=${n.final_action}`);
  }
  const p21 = runPhase21AcquisitionFailures();
  if (p21.length) {
    console.error('❌ Phase2.1 obtainable check failed after drop rebalance');
    for (const i of p21.slice(0, 10)) console.error('  -', i);
    process.exit(1);
  }
}

main();
