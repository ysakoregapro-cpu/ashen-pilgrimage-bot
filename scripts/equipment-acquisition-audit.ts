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
import { runPhase21AcquisitionFailures, logPhase21Stats } from './audit/phase21Checks';

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

  const md = [
    '# Equipment Route Full Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '> Phase2 audit + Phase2.1 completion checks via equipmentAcquisitionAudit',
    '',
    '## 1. 全武器入手経路',
    `- Total: ${weapons.length} | Obtainable: ${wObtain} | Unobtainable: ${weapons.length - wObtain}`,
    `- Starters: 8 (job select) | Uni: ${weapons.filter((w) => w.is_uni === 'YES').length} | Src: ${weapons.filter((w) => w.is_src === 'YES').length}`,
    `- See: reports/weapon-acquisition-audit.md`,
    '',
    '## 2. 初期武器8種',
    ...EIGHT_JOB_ROUTES.map((r) => `- **${r.job}**: ${r.starter} → ${r.uni} → ${r.src}`),
    '',
    '## 3. Uni導線',
    `- Current materials: ${UNI_FORGE_MATERIAL_IDS.join(', ')} (${UNI_FORGE_DROP_RATE * 100}% rematch)`,
    '',
    '## 4. Src導線',
    `- Material: ${SRC_FORGE_MATERIAL_ID} @ ${SRC_FORGE_MATERIAL_DROP_RATE * 100}%`,
    '- Kai: facility kai_src | manifest: /upgrade manifest',
    '',
    '## 5. 全防具入手経路',
    `- Total: ${armor.length} | Obtainable: ${aObtain} | Unobtainable: ${armor.length - aObtain}`,
    mdTable(['slot', 'total', 'pool', 'shop', 'unobtainable'], ['head', 'body', 'arms', 'legs', 'feet'].map((s) => {
      const x = slot.summary[s]!;
      return [s, String(x.total), String(x.pool), String(x.shop), String(x.unobtainable)];
    })),
    '',
    '## 6. 未配置防具セット',
    ...unplaced.map((s) => `- **${s.setId}**: ${s.inPool}/${s.total} in pools`),
    '',
    '## 7. Phase2.1 completion',
    '- See reports/equipment-completion-audit.md',
    '- Legacy: wpn_unique_silence only',
  ].join('\n');

  writeReport('equipment-route-full-audit.md', md);
  writeReport('equipment-acquisition-audit.md', md.replace('# Equipment Route Full Audit', '# Equipment Acquisition Audit (summary)'));
  writeCsv('equipment-route-full-audit.csv', fullCsvHeaders, fullCsv);
  writeCsv('equipment-acquisition-audit.csv', fullCsvHeaders, fullCsv);

  const phase2Path = path.join(process.cwd(), 'reports', 'phase2-candidates.md');
  if (fs.existsSync(phase2Path)) {
    const extra = [
      '',
      '## B supplement (equipment audit 2026-06-13)',
      '- Full weapon/armor acquisition reports in reports/equipment-*',
      '- Phase2.1 completion audit in reports/equipment-completion-audit.md',
    ].join('\n');
    if (!fs.readFileSync(phase2Path, 'utf8').includes('equipment audit')) {
      fs.appendFileSync(phase2Path, extra, 'utf8');
    }
  }

  const weaponRouteNote = `# Weapon Route Audit (updated ${new Date().toISOString()})\n\nSee reports/weapon-acquisition-audit.md for full data.\n`;
  writeReport('weapon-route-audit.md', weaponRouteNote);
  const armorNote = `# Armor Drop Audit (updated ${new Date().toISOString()})\n\nSee reports/armor-acquisition-audit.md for full data.\n`;
  writeReport('armor-drop-audit.md', armorNote);

  console.log(`✅ equipment-acquisition-audit → weapons:${weapons.length} armor:${armor.length}`);

  logPhase21Stats();
  const phase21Issues = runPhase21AcquisitionFailures();
  if (phase21Issues.length) {
    console.error('❌ Phase2.1 acquisition checks failed:');
    for (const i of phase21Issues.slice(0, 30)) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ Phase2.1 acquisition completion checks passed');
}

main();
