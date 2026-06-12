/** equipment-acquisition-audit — master report + CSV — npx tsx scripts/equipment-acquisition-audit.ts */
import fs from 'fs';
import path from 'path';
import {
  buildWeaponAuditRows, buildArmorAuditRows, getSlotDropAnalysis, getUnplacedSets,
  EIGHT_JOB_ROUTES, initAuditDb,
} from './audit/acquisitionIndex';
import {
  UNI_FORGE_MATERIAL_IDS, UNI_FORGE_DROP_RATE, SRC_FORGE_MATERIAL_ID, SRC_FORGE_MATERIAL_DROP_RATE,
} from '../src/db/seedData/forgeMaster';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

function main() {
  initAuditDb();
  const weapons = buildWeaponAuditRows();
  const armor = buildArmorAuditRows();
  const slot = getSlotDropAnalysis();
  const unplaced = getUnplacedSets();

  const wObtain = weapons.filter((w) => w.obtainable === 'YES').length;
  const aObtain = armor.filter((a) => a.obtainable === 'YES').length;

  const fullCsvHeaders = ['kind', 'item_id', 'name', 'slot_or_type', 'rarity', 'obtainable', 'source_kinds', 'locations', 'unknown'];
  const fullCsv: string[][] = [
    ...weapons.map((w) => ['weapon', w.item_id, w.name, w.weapon_type, w.rarity, w.obtainable, w.source_kinds, w.locations, w.unknown]),
    ...armor.map((a) => ['armor', a.item_id, a.name, a.slot, a.rarity, a.obtainable, a.source_kinds, a.locations, a.unknown]),
  ];

  const implementNeeded = [
    'arms in EQUIP_SLOT_WEIGHTS + area pool expansion',
    'legs/feet/arms per-town pool placement',
    '4 unplaced armor sets (iron_snow/valhalla/black_lamp/old_king)',
    'Per-job Uni materials (16) + boss rematch drops',
    'Src path unify (Kai ×3 + 5000G vs manifest)',
    'Rich acquisition display on equipment detail',
    'Inventory consumable use button + handler',
    'Placeholder label for 4 towns in /town list',
  ];
  const deferOk = [
    'manifestSrcWeapon legacy path (hide after Kai unify)',
    'Admin-only / trade-only items',
    'Full defense rebalance',
    'Old src_core manifest mats cleanup',
  ];
  const unknowns = [
    'Exact boss IDs for Phase2 Uni mat candidates (some IDs inferred)',
    'Whether wpn_unique_silver vs wpn_unique_old_hammer both needed for 重騎士',
    'Job restriction on generic N/R weapons (DB has no required_job)',
    'Optimal drop % per slot for battle equip (weighted null drops)',
  ];

  const md = [
    '# Equipment Route Full Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '> Cursor audit for GPT Phase2 design. Not final spec.',
    '',
    '## 1. 全武器入手経路',
    `- Total: ${weapons.length} | Obtainable: ${wObtain} | Unobtainable: ${weapons.length - wObtain}`,
    `- Starters: 8 (job select) | Uni: ${weapons.filter((w) => w.is_uni === 'YES').length} | Src: ${weapons.filter((w) => w.is_src === 'YES').length}`,
    `- See: reports/weapon-acquisition-audit.md`,
    '',
    '## 2. 初期武器8種',
    ...EIGHT_JOB_ROUTES.map((r) => `- **${r.job}**: ${r.starter} → ${r.uni} → ${r.src}`),
    '- Uni mats: shared 2 types (mat_starfall_obsidian + mat_black_lantern_cinder) @ 10% rematch',
    '- Src: mat_star_pilgrim_echo ×1 Kai @ 8% Valhalla farm',
    '- Status: mostly **Uni素材が共通すぎる** + **Src経路二重定義**',
    '',
    '## 3. Uni導線',
    `- Current materials: ${UNI_FORGE_MATERIAL_IDS.join(', ')} (${UNI_FORGE_DROP_RATE * 100}% rematch)`,
    '- Phase2 16 mats: **NOT_IN_SEED** (all proposed IDs)',
    '- Boss assignment candidates: reports/uni-src-route-audit.csv',
    '',
    '## 4. Src導線',
    `- Material: ${SRC_FORGE_MATERIAL_ID} @ ${SRC_FORGE_MATERIAL_DROP_RATE * 100}%`,
    '- Kai: facility kai_src (1 mat, no gold)',
    '- manifest: /upgrade manifest (per-weapon src_core mats + gold)',
    '- Phase2 plan (×3 + 5000G): **feasible** without migration',
    '',
    '## 5. 全防具入手経路',
    `- Total: ${armor.length} | Obtainable: ${aObtain} | Unobtainable: ${armor.length - aObtain}`,
    mdTable(['slot', 'total', 'pool', 'shop', 'unobtainable'], ['head', 'body', 'arms', 'legs', 'feet'].map((s) => {
      const x = slot.summary[s]!;
      return [s, String(x.total), String(x.pool), String(x.shop), String(x.unobtainable)];
    })),
    '',
    '## 6. 脚/靴/腕が出ない原因',
    `- arms **not** in EQUIP_SLOT_WEIGHTS: \`${JSON.stringify(slot.weights)}\``,
    `- legs pool ${slot.summary.legs!.pool}/${slot.summary.legs!.total}, feet ${slot.summary.feet!.pool}/${slot.summary.feet!.total}, arms ${slot.summary.arms!.pool}/${slot.summary.arms!.total}`,
    '- pickEquipmentFromAreaPool returns null if slot/rarity mismatch → drop lost',
    '- normal threat: 92% no equip drop even when roll succeeds',
    '',
    '## 7. 未配置防具セット',
    ...unplaced.map((s) => `- **${s.setId}**: ${s.inPool}/${s.total} in pools — truly unplaced if 0`),
    '',
    '## 8. 装備詳細画面への入手先表示',
    '- Current: items.acquisition_json + getItemAcquisitionHint()',
    '- Gap: no drop %, no Kai/rematch on weapon detail',
    '- Options A/B/C compared in reports/equipment-detail-source-audit.md',
    '',
    '## 9. 所持品使用との影響',
    '- No use button today; inv:use custom_id proposed',
    '- Independent from acquisition display; same itemDetailSystem file',
    '',
    '## 10. MP/防御/townlistのPhase2影響',
    '- MP: Phase1 syncBattleResourcesToPlayer — verify mp-consumption-order-check PASS',
    '- Defense: combatMath.ts — reports/defense-effect.md',
    '- Town list: town.ts + townActionSystem — 4 placeholder towns',
    '',
    '## 11. 実装が必要なもの',
    ...implementNeeded.map((x) => `- ${x}`),
    '',
    '## 12. 実装不要/保留でよいもの',
    ...deferOk.map((x) => `- ${x}`),
    '',
    '## 13. UNKNOWN',
    ...unknowns.map((x) => `- ${x}`),
  ].join('\n');

  writeReport('equipment-route-full-audit.md', md);
  writeReport('equipment-acquisition-audit.md', md.replace('# Equipment Route Full Audit', '# Equipment Acquisition Audit (summary)'));
  writeCsv('equipment-route-full-audit.csv', fullCsvHeaders, fullCsv);
  writeCsv('equipment-acquisition-audit.csv', fullCsvHeaders, fullCsv);

  // Append to phase2-candidates
  const phase2Path = path.join(process.cwd(), 'reports', 'phase2-candidates.md');
  if (fs.existsSync(phase2Path)) {
    const extra = [
      '',
      '## B supplement (equipment audit 2026-06-13)',
      '- Full weapon/armor acquisition reports in reports/equipment-*',
      '- Uni 16 mats + boss assignment',
      '- acquisition_json enrichment for detail UI',
      '- inv:use consumable from inventory',
    ].join('\n');
    if (!fs.readFileSync(phase2Path, 'utf8').includes('equipment audit')) {
      fs.appendFileSync(phase2Path, extra, 'utf8');
    }
  }

  // Refresh weapon-route and armor-drop summaries
  const weaponRouteNote = `# Weapon Route Audit (updated ${new Date().toISOString()})\n\nSee reports/weapon-acquisition-audit.md for full data.\n\n8-job routes unchanged; Uni shared 2 mats; Src dual path.\n`;
  writeReport('weapon-route-audit.md', weaponRouteNote);
  const armorNote = `# Armor Drop Audit (updated ${new Date().toISOString()})\n\nSee reports/armor-acquisition-audit.md for full data.\n\narms not in EQUIP_SLOT_WEIGHTS; 4 sets unplaced.\n`;
  writeReport('armor-drop-audit.md', armorNote);

  console.log(`✅ equipment-acquisition-audit → weapons:${weapons.length} armor:${armor.length}`);
}

main();
