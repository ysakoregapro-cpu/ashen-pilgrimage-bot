/** weapon-tier-balance-check — npx tsx scripts/weapon-tier-balance-check.ts */
import fs from 'fs';
import path from 'path';
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import {
  MAX_SRC_WEAPON_LEVEL,
  SRC_UR_TARGET_DIFF_CENTER,
  SRC_UR_TARGET_DIFF_MAX,
  SRC_UR_TARGET_DIFF_MIN,
  UR_MAX_AWAKENING_PRIMARY_BONUS,
} from '../src/db/seedData/weaponTierBalanceMaster';
import { calcUpgradeStatBonuses } from '../src/systems/enhanceSystem';
import {
  WEAPON_TYPE_SAMPLES,
  buildWeaponPowerComparison,
  judgeSrcVsUrDiff,
  loadWeaponEquipRow,
  primaryStatAt,
} from '../src/systems/weaponPowerComparison';

const REPORT_DIR = path.join(process.cwd(), 'reports');
const fails: string[] = [];
const warns: string[] = [];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);

  const rows = buildWeaponPowerComparison(db, calcUpgradeStatBonuses);
  const csvLines = [
    'weapon_type,label,sr_max,ssr_max,uni_max,ur_max,ur_max_with_awakening,src_max,diff_vs_ur_aw,verdict,notes',
  ];
  const mdLines = [
    '# weapon-tier-balance-check',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## 設計方針',
    '',
    `- 完成Src+${MAX_SRC_WEAPON_LEVEL} > 対応UR+15 + 覚醒IV (+${UR_MAX_AWAKENING_PRIMARY_BONUS})`,
    `- 目標差: +${SRC_UR_TARGET_DIFF_MIN}〜+${SRC_UR_TARGET_DIFF_MAX}（中心+${SRC_UR_TARGET_DIFF_CENTER}）`,
    '- wpn_unique_silence は監査対象外',
    '',
    '## 武器種別比較',
    '',
    '| 武器種 | UR最大 | UR+覚醒 | Src最大 | 差 | 判定 |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  let srcBelowUr = 0;
  let diffOutOfRange = 0;

  for (const r of rows) {
    const urAw = r.urMax + UR_MAX_AWAKENING_PRIMARY_BONUS;
    const judge = judgeSrcVsUrDiff(r.srcMax, r.urMax);
    csvLines.push([
      r.weaponType, r.label,
      String(r.srMax), String(r.ssrMax), String(r.uniMax),
      String(r.urMax), String(urAw), String(r.srcMax), String(judge.diff),
      r.verdict, judge.note,
    ].join(','));
    mdLines.push(`| ${r.label} | ${r.urMax} | ${urAw} | ${r.srcMax} | ${judge.diff >= 0 ? '+' : ''}${judge.diff} | ${r.verdict} |`);

    if (r.srcMax <= urAw) srcBelowUr++;
    if (r.verdict !== 'OK') fails.push(`${r.label}: ${r.verdict}`);
    if (!judge.ok) diffOutOfRange++;
    else if (judge.note.includes('上振れ')) warns.push(`${r.label}: ${judge.note}`);
  }

  // 残響弓 vs 空塞弓フレス 詳細
  const bowUr = loadWeaponEquipRow(db, 'wpn_sky_bow_fress');
  const bowSrc = loadWeaponEquipRow(db, 'wpn_src_echo');
  if (bowUr && bowSrc) {
    const urEff = primaryStatAt(bowUr, 15, 0, calcUpgradeStatBonuses) + UR_MAX_AWAKENING_PRIMARY_BONUS;
    const srcMax = primaryStatAt(bowSrc, 0, MAX_SRC_WEAPON_LEVEL, calcUpgradeStatBonuses);
    mdLines.push('', '## 参考: 空塞弓フレス vs Src:残響弓', '', `| 比較 | 攻撃実効 |`, `| --- | --- |`, `| UR+15覚醒IV | ${urEff} |`, `| Src+${MAX_SRC_WEAPON_LEVEL} | ${srcMax} |`, `| 差 | ${srcMax - urEff} |`);
    if (srcMax <= urEff) fails.push(`bow: Src(${srcMax}) <= UR+aw(${urEff})`);
  }

  // Src max level DB
  const srcMaxLv = db.prepare(`
    SELECT MIN(e.max_upgrade_level) AS minLv, MAX(e.max_upgrade_level) AS maxLv
    FROM equipment e JOIN items i ON e.item_id = i.id
    WHERE i.rarity = 'Src' AND e.slot = 'weapon' AND e.item_id != 'wpn_unique_silence'
  `).get() as { minLv: number; maxLv: number };
  if (srcMaxLv.minLv < MAX_SRC_WEAPON_LEVEL || srcMaxLv.maxLv < MAX_SRC_WEAPON_LEVEL) {
    fails.push(`Src武器 max_upgrade_level が ${MAX_SRC_WEAPON_LEVEL} 未満 (min=${srcMaxLv.minLv})`);
  }

  const playableWeapons = (db.prepare(`
    SELECT COUNT(*) c FROM equipment e JOIN items i ON e.item_id = i.id
    WHERE e.slot = 'weapon' AND i.id != 'wpn_unique_silence'
  `).get() as { c: number }).c;
  mdLines.push('', '## サマリー', '', `- 監査武器種: ${rows.length}`, `- 通常プレイ武器: ${playableWeapons}`, `- Src<=UR: ${srcBelowUr}件`, `- 判定NG: ${fails.length}件`);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'weapon-tier-balance-check.csv'), csvLines.join('\n'), 'utf8');
  fs.writeFileSync(path.join(REPORT_DIR, 'weapon-tier-balance-check.md'), mdLines.join('\n'), 'utf8');

  console.log('## weapon-tier-balance-check\n');
  if (fails.length) {
    console.error('FAIL');
    for (const f of fails) console.error(`- ${f}`);
    if (warns.length) {
      console.error('\nWARN');
      for (const w of warns) console.error(`- ${w}`);
    }
    process.exit(1);
  }
  console.log('OK');
  console.log(`- weapon types: ${rows.length} (${WEAPON_TYPE_SAMPLES.length} samples)`);
  console.log(`- Src max level: ${srcMaxLv.minLv}-${srcMaxLv.maxLv}`);
  if (warns.length) {
    console.log('\nWARN');
    for (const w of warns) console.log(`- ${w}`);
  }
  console.log(`\n→ reports/weapon-tier-balance-check.md`);
}

main();
