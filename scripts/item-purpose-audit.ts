/** item-purpose-audit — npx tsx scripts/item-purpose-audit.ts */
import { buildItemPurposeRows } from './audit/dropEconomyIndex';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

const HEADERS = [
  'item_id', 'name', 'category', 'rarity', 'sell_price', 'current_sources',
  'used_in_enhance', 'used_in_repair', 'used_in_awaken', 'used_in_kai_unique',
  'used_in_kai_src', 'used_in_src_forge', 'used_in_shop', 'used_in_consumable',
  'used_in_quest_or_trial', 'sell_or_convert_only', 'no_current_use',
  'expected_consumption', 'recommended_purpose', 'recommended_action',
];

function main() {
  const rows = buildItemPurposeRows();
  const noUseInPool = rows.filter((r) => r.no_current_use === 'YES' && r.current_sources !== '—');
  const legacy = rows.filter((r) => r.recommended_purpose === 'legacy');

  const md = [
    '# Item Purpose Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `## Summary`,
    `- Total: ${rows.length}`,
    `- no_current_use + in pool: ${noUseInPool.length}`,
    `- legacy: ${legacy.length}`,
    '',
    '## No use but in drop pool',
    noUseInPool.length
      ? mdTable(['item_id', 'name', 'rarity', 'sources'], noUseInPool.slice(0, 25).map((r) => [r.item_id, r.name, r.rarity, r.current_sources.slice(0, 60)]))
      : '(none)',
  ].join('\n');

  writeReport('item-purpose-audit.md', md);
  writeCsv('item-purpose-audit.csv', HEADERS, rows.map((r) => HEADERS.map((h) => (r as Record<string, string>)[h] ?? '')));

  console.log(`✅ item-purpose-audit → ${rows.length} rows, ${noUseInPool.length} no-use-in-pool`);
}

main();
