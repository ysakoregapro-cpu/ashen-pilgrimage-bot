/** armor-acquisition-audit — npx tsx scripts/armor-acquisition-audit.ts */
import {
  buildArmorAuditRows, getSlotDropAnalysis, getUnplacedSets, initAuditDb,
} from './audit/acquisitionIndex';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

function main() {
  initAuditDb();
  const rows = buildArmorAuditRows();
  const { summary, weights, battleTables, normalizeNote } = getSlotDropAnalysis();
  const unplaced = getUnplacedSets();

  const headers = [
    'item_id', 'name', 'rarity', 'slot', 'series', 'jobs', 'max_hp', 'max_mp', 'attack', 'magic',
    'defense', 'speed', 'max_upgrade', 'methods', 'locations', 'source_kinds', 'drop_rates', 'shop',
    'area_pool', 'boss', 'valhalla_raid', 'obtainable', 'unknown',
  ];
  const csvRows = rows.map((r) => headers.map((h) => String((r as Record<string, unknown>)[h] ?? '')));

  const slotSummary = ['head', 'body', 'arms', 'legs', 'feet'].map((slot) => {
    const s = summary[slot]!;
    const obtainable = s.pool + s.shop;
    return [slot, String(s.total), String(obtainable), String(s.unobtainable), String(s.pool), String(s.shop), '0', '0', String(s.unobtainable)];
  });

  const md = [
    '# Armor Acquisition Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Total armor/accessory: ${rows.length}`,
    '',
    '## Slot summary (head/body/arms/legs/feet)',
    mdTable(['slot', '実装数', '入手可能', '入手不可', 'area_pool', 'shop', 'boss', 'raid', 'unobtainable'], slotSummary),
    '',
    '## Drop weight issue',
    `- EQUIP_SLOT_WEIGHTS: \`${JSON.stringify(weights)}\``,
    `- arms in weight table (Phase2): weight=${weights.arms ?? '—'}`,
    `- normalizeSlot: legs/feet/head/body/arms supported`,
    `- Battle equip drop rates (normal): ${JSON.stringify(battleTables.normal)}`,
    `- If slot roll has no matching item in pool → **null (drop vanishes)**`,
    '',
    '## Legs/feet/arms root cause',
    `- legs pool: ${summary.legs!.pool}/${summary.legs!.total}`,
    `- feet pool: ${summary.feet!.pool}/${summary.feet!.total}`,
    `- arms pool: ${summary.arms!.pool}/${summary.arms!.total}`,
    `- Shop legs/feet/arms: rare (mostly head/body in early shops)`,
    '',
    '## Unplaced sets',
    ...unplaced.map((s) => {
      const pieceList = s.pieces.map((p) => `${p.slot}:${p.id} (def${p.defense_bonus} hp${p.hp_bonus})`).join(', ');
      const status = s.inPool === s.total ? '✅ 全部位pool配置済' : `${s.inPool}/${s.total} in pool`;
      return `- **${s.setId}**: ${status} — ${pieceList}`;
    }),
    '',
    '## Phase2 endgame set placement (DB pools via ensurePhase2EquipmentRoutes)',
    '- set_iron_snow → area_red_watchtower, area_fire_training',
    '- set_valhalla → area_valhalla_outer, area_deep_core',
    '- set_black_lamp → area_cinder_passage, area_black_lantern_alley',
    '- set_old_king → area_broken_throne, area_ash_boulevard',
    '',
    '## Unobtainable armor',
    mdTable(['id', 'name', 'slot', 'series'], rows.filter((r) => r.obtainable === 'NO').slice(0, 30).map((r) => [r.item_id, r.name, r.slot, r.series])),
  ].join('\n');

  writeReport('armor-acquisition-audit.md', md);
  writeCsv('armor-acquisition-audit.csv', headers, csvRows);
  console.log(`✅ armor-acquisition-audit → ${rows.length} pieces`);
}

main();
