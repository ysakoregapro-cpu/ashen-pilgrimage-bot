/** weapon-effective-balance-summary — npx tsx scripts/weapon-effective-balance-summary.ts */
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';
import {
  buildWeaponPowerComparison, judgeSrcVsUrDiff, primaryStatAt, loadWeaponEquipRow,
} from '../src/systems/weaponPowerComparison';
import { calcUpgradeStatBonuses } from '../src/systems/enhanceSystem';
import {
  MAX_SRC_WEAPON_LEVEL, UR_MAX_AWAKENING_PRIMARY_BONUS,
  SRC_UR_TARGET_DIFF_MIN, SRC_UR_TARGET_DIFF_MAX, SRC_UR_TARGET_DIFF_HARD_MAX,
} from '../src/db/seedData/weaponTierBalanceMaster';

const result = emptyResult();

function main() {
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(`DB接続不可: ${init.error}`);
    writeMdCsvPair('weapon-effective-balance-summary', ['note'], [['VPS側で要実行']], ['## SKIP']);
    exitCheckResult('weapon-effective-balance-summary', result);
    return;
  }
  const rows = buildWeaponPowerComparison(init.db, calcUpgradeStatBonuses);
  const csvRows: string[][] = [];
  for (const r of rows) {
    const urAw = r.urMax + UR_MAX_AWAKENING_PRIMARY_BONUS;
    const judge = judgeSrcVsUrDiff(r.srcMax, r.urMax);
    if (r.srcMax <= urAw) result.fails.push(`${r.label}: Src(${r.srcMax}) <= UR+aw(${urAw})`);
    if (!judge.ok) {
      if (judge.diff < SRC_UR_TARGET_DIFF_MIN) result.fails.push(`${r.label}: 差${judge.diff} < ${SRC_UR_TARGET_DIFF_MIN}`);
      else if (judge.diff > SRC_UR_TARGET_DIFF_HARD_MAX) result.fails.push(`${r.label}: 差${judge.diff} > ${SRC_UR_TARGET_DIFF_HARD_MAX}`);
      else result.warns.push(`${r.label}: ${judge.note}`);
    }
    csvRows.push([
      r.weaponType, r.label,
      String(r.srMax), String(r.ssrMax), String(r.uniMax),
      String(r.urMax), String(urAw), String(r.srcMax), String(judge.diff),
      r.verdict, judge.note,
    ]);
  }

  const bowUr = loadWeaponEquipRow(init.db, 'wpn_sky_bow_fress');
  const bowSrc = loadWeaponEquipRow(init.db, 'wpn_src_echo');
  if (bowUr && bowSrc) {
    const urEff = primaryStatAt(bowUr, 15, 0, calcUpgradeStatBonuses) + UR_MAX_AWAKENING_PRIMARY_BONUS;
    const srcEff = primaryStatAt(bowSrc, 0, MAX_SRC_WEAPON_LEVEL, calcUpgradeStatBonuses);
    csvRows.push(['bow_ref', '空塞弓 vs 残響弓', '', '', '', String(urEff), String(urEff), String(srcEff), String(srcEff - urEff), 'REF', '弓基準']);
  }

  writeMdCsvPair(
    'weapon-effective-balance-summary',
    ['weapon_type', 'label', 'sr_max', 'ssr_max', 'uni_max', 'ur_max', 'ur_aw', 'src_max', 'diff', 'verdict', 'notes'],
    csvRows,
    [
      '## 武器実効バランス',
      '',
      `- 目標差: +${SRC_UR_TARGET_DIFF_MIN}〜+${SRC_UR_TARGET_DIFF_MAX}（許容上振れ+${SRC_UR_TARGET_DIFF_HARD_MAX}）`,
      '- 主能力値は武器種別（杖=魔力、盾=防御換算）',
    ],
  );
  exitCheckResult('weapon-effective-balance-summary', result);
}

main();
