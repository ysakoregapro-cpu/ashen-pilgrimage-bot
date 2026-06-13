/**
 * equipped-affix-summary-audit.ts — 装備厳選効果の集計/表示/戦闘整合監査
 * npx tsx scripts/equipped-affix-summary-audit.ts
 */
import {
  buildEquipmentAffixSummary,
  computeBattleAffixMultsFromMods,
  formatAffixSummaryText,
  getEquippedSummaryRows,
  summarizeEquippedAffixEffects,
} from '../src/systems/equipmentAffixSystem';
import { emptyResult, initAuditDb, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';

const HEADERS = [
  'user_id',
  'equipped_count',
  'stat_roll_hp',
  'stat_roll_mp',
  'stat_roll_attack',
  'stat_roll_magic',
  'stat_roll_defense',
  'stat_roll_speed',
  'affix_dealt_percent',
  'affix_taken_reduce_percent',
  'resistance_summary',
  'drawback_summary',
  'display_lines_ok',
  'battle_value_consistent',
  'balance_note',
];

function netDealtPercent(mods: ReturnType<typeof buildEquipmentAffixSummary>['combatMods']): number {
  return mods.damage_dealt_pct - mods.damage_dealt_down_pct;
}

function netTakenReducePercent(mods: ReturnType<typeof buildEquipmentAffixSummary>['combatMods']): number {
  return mods.damage_taken_reduction_pct - mods.damage_taken_increase_pct;
}

function formatDrawbackSummary(summary: ReturnType<typeof buildEquipmentAffixSummary>): string {
  if (!summary.drawbacks.length) return 'none';
  return summary.drawbacks.map((d) => `${d.label}:${d.value.toFixed(1)}`).join('; ');
}

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(`DB接続不可: ${init.error}`);
    writeMdCsvPair(
      'equipped-affix-summary-audit',
      HEADERS,
      [['', '0', '0', '0', '0', '0', '0', '0', '0', '0', '', '', 'SKIP', 'SKIP', init.error]],
      ['## DB', '', 'Application Control 等によりローカルDB不可。VPS側で要実行。'],
    );
    exitCheckResult('equipped-affix-summary-audit', result);
    return;
  }

  const { db } = init;
  const userIds = db.prepare(`
    SELECT DISTINCT user_id FROM player_equipment
  `).all() as Array<{ user_id: string }>;

  if (!userIds.length) {
    const emptySummary = buildEquipmentAffixSummary([]);
    const emptyText = formatAffixSummaryText(emptySummary);
    if (emptyText !== 'なし') result.fails.push('empty loadout should display なし');
    writeMdCsvPair(
      'equipped-affix-summary-audit',
      HEADERS,
      [['(none)', '0', '0', '0', '0', '0', '0', '0', '0', '0', 'none', 'none', 'OK', 'OK', 'no players']],
      ['## Summary', '', '装備プレイヤーなし — 空表示のみ検証'],
    );
    exitCheckResult('equipped-affix-summary-audit', result);
    return;
  }

  const rows: string[][] = [];
  let checked = 0;

  for (const { user_id: userId } of userIds) {
    checked++;
    let summary;
    let displayText = '';
    try {
      const full = summarizeEquippedAffixEffects(userId);
      summary = full;
      displayText = full.displayText;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.fails.push(`${userId}: summarize threw ${msg}`);
      rows.push([userId, '0', '0', '0', '0', '0', '0', '0', '0', '0', '', '', 'FAIL', 'FAIL', msg]);
      continue;
    }

    const displayOk = displayText.length > 0 && displayText.length <= 1024;
    if (!displayOk) result.fails.push(`${userId}: display length ${displayText.length}`);

    const netDealt = netDealtPercent(summary.combatMods);
    const netTakenReduce = netTakenReducePercent(summary.combatMods);
    const battleDealtPct = (summary.battleMults.dealt - 1) * 100;
    const battleTakenPct = (1 - summary.battleMults.taken) * 100;

    const unclampedDealtPct = netDealt;
    const unclampedTakenPct = netTakenReduce;
    const consistent = Math.abs(battleDealtPct - unclampedDealtPct) < 0.15
      || Math.abs(battleDealtPct - Math.max(-15, Math.min(15, unclampedDealtPct))) < 0.15;
    const takenConsistent = Math.abs(battleTakenPct - unclampedTakenPct) < 0.15
      || Math.abs(battleTakenPct - Math.max(-15, Math.min(15, unclampedTakenPct))) < 0.15;
    const battleConsistent = consistent && takenConsistent;
    if (!battleConsistent) {
      result.fails.push(`${userId}: battle/display mismatch dealt=${battleDealtPct.toFixed(2)} net=${netDealt.toFixed(2)} taken=${battleTakenPct.toFixed(2)} net=${netTakenReduce.toFixed(2)}`);
    }

    if (summary.drawbacks.length && !displayText.includes('デメリット:')) {
      result.fails.push(`${userId}: drawbacks not shown`);
    }

    const recomputed = buildEquipmentAffixSummary(getEquippedSummaryRows(db, userId));
    const recomputedMults = computeBattleAffixMultsFromMods(recomputed.combatMods);
    if (Math.abs(recomputedMults.dealt - summary.battleMults.dealt) > 0.0001
      || Math.abs(recomputedMults.taken - summary.battleMults.taken) > 0.0001) {
      result.fails.push(`${userId}: recompute battle mult mismatch`);
    }

    rows.push([
      userId,
      String(summary.equippedCount),
      String(summary.statRollFlat.hp),
      String(summary.statRollFlat.mp),
      String(summary.statRollFlat.attack),
      String(summary.statRollFlat.magic),
      String(summary.statRollFlat.defense),
      String(summary.statRollFlat.speed),
      netDealt.toFixed(2),
      netTakenReduce.toFixed(2),
      'n/a',
      formatDrawbackSummary(summary),
      displayOk ? 'OK' : 'FAIL',
      battleConsistent ? 'OK' : 'FAIL',
      summary.hasAnyEffect ? 'ok' : 'no rolls',
    ]);
  }

  writeMdCsvPair(
    'equipped-affix-summary-audit',
    HEADERS,
    rows,
    [
      '## Summary',
      '',
      `- players checked: ${checked}`,
      `- fails: ${result.fails.length}`,
      `- warns: ${result.warns.length}`,
      '',
      '## Notes',
      '',
      '- resistance_summary: 現行 affix キーに属性耐性は未実装のため n/a',
      '- battle_value_consistent: computeBattleAffixMultsFromMods と表示用 net % を比較（clamp 考慮）',
    ],
  );

  exitCheckResult('equipped-affix-summary-audit', result);
}

main();
