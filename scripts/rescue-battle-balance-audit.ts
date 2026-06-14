/** rescue-battle-balance-audit.ts */
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { calcEnemyDamageToPlayer, getMonsterThreatTier } from '../src/systems/combatMath';
import {
  computeRescueEnemyAttack,
  estimateRescueHitDamagePct,
  rescueLevelGapAtkBonus,
} from '../src/systems/coop/rescueBattleBalance';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'case_id', 'monster_id', 'monster_name', 'recommended_level', 'participant_count',
  'participant_avg_level', 'level_gap', 'base_enemy_damage', 'scaled_enemy_damage',
  'hp_loss_percent', 'too_easy', 'too_hard', 'match_ok', 'balance_note',
];

const MONSTER = {
  id: 'mon_furnace_defense',
  name: '炉心防衛ユニット',
  lv: 64,
  attack: 36,
};

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('rescue-battle-balance-audit', HEADERS, [], ['## DB unavailable']);
    exitCheckResult('rescue-battle-balance-audit', result);
    return;
  }
  ensurePhase2Seed(init.db);
  const rows: string[][] = [];

  const playerMaxHp = 1419;
  const playerDefense = 35;
  const participantAvgLevel = 40;
  const levelGap = MONSTER.lv - participantAvgLevel;

  for (const participantCount of [1, 2, 3, 4]) {
    const scaledAttack = computeRescueEnemyAttack(
      MONSTER.attack,
      participantCount,
      MONSTER.lv,
      Array(participantCount).fill(participantAvgLevel),
    );
    const gapMult = rescueLevelGapAtkBonus(MONSTER.lv, participantAvgLevel);
    const threat = getMonsterThreatTier(MONSTER.id);
    const baseRaw = calcEnemyDamageToPlayer({
      attack: MONSTER.attack,
      playerDefense,
      playerMaxHp,
      threatTier: threat,
      takenMult: 1,
      heavy: false,
      playerLevel: participantAvgLevel,
      monsterLevel: MONSTER.lv,
    });
    const scaledRaw = calcEnemyDamageToPlayer({
      attack: scaledAttack,
      playerDefense,
      playerMaxHp,
      threatTier: threat,
      takenMult: 1,
      heavy: false,
      playerLevel: participantAvgLevel,
      monsterLevel: MONSTER.lv,
    });
    const est = estimateRescueHitDamagePct(playerMaxHp, scaledAttack, playerDefense);
    const hpLossPercent = (scaledRaw / playerMaxHp) * 100;
    const tooEasy = hpLossPercent < 8 && participantCount <= 2;
    const tooHard = hpLossPercent > 35;
    const matchOk = !tooEasy && !tooHard;

    if (participantCount === 1 && tooEasy) {
      result.fails.push(`Lv${participantAvgLevel} vs Lv${MONSTER.lv}: 被ダメ${hpLossPercent.toFixed(1)}% (<8%)`);
    }
    if (participantCount === 1 && scaledAttack <= MONSTER.attack) {
      result.fails.push('救難1人時の攻撃補正が未適用');
    }

    rows.push([
      `lv40_gap${levelGap}_${participantCount}p`,
      MONSTER.id,
      MONSTER.name,
      String(MONSTER.lv),
      String(participantCount),
      String(participantAvgLevel),
      String(levelGap),
      String(baseRaw),
      String(scaledRaw),
      hpLossPercent.toFixed(1),
      tooEasy ? 'YES' : 'NO',
      tooHard ? 'YES' : 'NO',
      matchOk ? 'OK' : (tooEasy ? 'FAIL' : 'WARN'),
      `scaledAtk=${scaledAttack} gapMult=${gapMult.toFixed(2)} est=${est.total}`,
    ]);
  }

  writeMdCsvPair('rescue-battle-balance-audit', HEADERS, rows, [
    '## Summary', '',
    `- level gap case: Lv${participantAvgLevel} vs rec Lv${MONSTER.lv}`,
    `- fails: ${result.fails.length}`,
    '- WARN: 4人参加時は安定しやすい設計',
  ]);
  exitCheckResult('rescue-battle-balance-audit', result);
}

main();
