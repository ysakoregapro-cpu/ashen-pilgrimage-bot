/** rescue-action-lock-audit.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import {
  createCoopRecruit,
  joinCoopRecruit,
  startCoopRecruit,
} from '../src/systems/coop/coopRecruitSystem';
import {
  submitCoopAction,
  validateCoopBattleAction,
  getCoopBattle,
  hasUserSubmittedAction,
} from '../src/systems/coop/coopBattleSystem';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'case_id', 'battle_id', 'turn', 'user_id', 'first_action_accepted', 'second_action_rejected',
  'next_turn_action_accepted', 'overwrite_possible', 'match_ok', 'balance_note',
];

const GUILD = 'rescue-lock-audit-guild';
const LEADER = 'rescue-lock-leader';
const HELPER = 'rescue-lock-helper';

function cleanup() {
  const db = getDb();
  db.prepare('DELETE FROM coop_rewards').run();
  db.prepare('DELETE FROM coop_battle_actions').run();
  db.prepare('DELETE FROM coop_battle_sessions').run();
  db.prepare('DELETE FROM coop_members').run();
  db.prepare('DELETE FROM coop_recruits').run();
}

function ensureUser(id: string) {
  if (!getPlayer(id)) createPlayer(id, GUILD, id, 'ch');
  getDb().prepare('UPDATE players SET level = 40, hp = 900, max_hp = 900 WHERE user_id = ?').run(id);
}

function setupRescueBattle(): string | null {
  const recruit = createCoopRecruit(GUILD, LEADER, 'rescue', {
    monster_id: 'mon_furnace_defense',
    rescue_type: 'explore',
    source_enemy_max_hp: 4200,
    source_enemy_hp: 3200,
  });
  if (!recruit.ok || !recruit.recruitId) return null;
  joinCoopRecruit(recruit.recruitId, HELPER);
  const start = startCoopRecruit(recruit.recruitId, LEADER);
  return start.battleId ?? null;
}

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('rescue-action-lock-audit', HEADERS, [], ['## DB unavailable']);
    exitCheckResult('rescue-action-lock-audit', result);
    return;
  }
  ensurePhase2Seed(init.db);
  cleanup();
  [LEADER, HELPER].forEach(ensureUser);

  const rows: string[][] = [];
  const battleId = setupRescueBattle();
  if (!battleId) {
    result.fails.push('救難バトル開始失敗');
    writeMdCsvPair('rescue-action-lock-audit', HEADERS, rows, ['## Setup failed']);
    exitCheckResult('rescue-action-lock-audit', result);
    return;
  }

  const battle = getCoopBattle(battleId)!;
  const turn = battle.turn_count;

  const first = submitCoopAction(battleId, LEADER, 'attack');
  const second = submitCoopAction(battleId, LEADER, 'defend');
  const validateOldTurn = validateCoopBattleAction(battleId, LEADER, turn - 1);
  const validateDup = validateCoopBattleAction(battleId, LEADER, turn);

  const firstOk = first.ok;
  const secondRejected = !second.ok && second.message.includes('登録済み');
  const overwritePossible = firstOk && second.ok;
  const matchOk = firstOk && secondRejected && !overwritePossible;

  if (!matchOk) result.fails.push('同ターン再入力が拒否されていない');

  rows.push([
    'same_turn_reject', battleId, String(turn), LEADER,
    firstOk ? 'YES' : 'NO', secondRejected ? 'YES' : 'NO', 'N/A',
    overwritePossible ? 'YES' : 'NO', matchOk ? 'OK' : 'FAIL',
    second.message.replace(/\n/g, ' '),
  ]);

  const staleTurnOk = !validateOldTurn.ok && validateOldTurn.message.includes('終了');
  rows.push([
    'stale_turn_reject', battleId, String(turn - 1), LEADER,
    'N/A', staleTurnOk ? 'YES' : 'NO', 'N/A', 'NO',
    staleTurnOk ? 'OK' : 'FAIL', validateOldTurn.message.replace(/\n/g, ' '),
  ]);
  if (!staleTurnOk) result.fails.push('古いターン入力が拒否されていない');

  const dupLockOk = !validateDup.ok && validateDup.message.includes('登録済み');
  rows.push([
    'validate_dup', battleId, String(turn), LEADER,
    'YES', dupLockOk ? 'YES' : 'NO', 'N/A', 'NO',
    dupLockOk ? 'OK' : 'FAIL', 'validateCoopBattleAction',
  ]);
  if (!dupLockOk) result.fails.push('validateCoopBattleAction が重複入力を検出しない');

  submitCoopAction(battleId, HELPER, 'defend');
  const after = getCoopBattle(battleId)!;
  if (after.turn_count > turn && after.status === 'active') {
    const nextTurn = after.turn_count;
    const canSubmitNext = !hasUserSubmittedAction(battleId, LEADER, nextTurn);
    const nextFirst = submitCoopAction(battleId, LEADER, 'attack');
    const nextAccepted = canSubmitNext && nextFirst.ok;
    rows.push([
      'next_turn_accept', battleId, String(nextTurn), LEADER,
      nextAccepted ? 'YES' : 'NO', 'N/A', nextAccepted ? 'YES' : 'NO', 'NO',
      nextAccepted ? 'OK' : 'FAIL', nextFirst.message,
    ]);
    if (!nextAccepted) result.fails.push('次ターンで再入力できない');
  } else {
    result.warns.push('ターン進行未確認（2人入力後も未解決）');
  }

  cleanup();
  writeMdCsvPair('rescue-action-lock-audit', HEADERS, rows, [
    '## Summary', '', `- cases: ${rows.length}`, `- fails: ${result.fails.length}`,
  ]);
  exitCheckResult('rescue-action-lock-audit', result);
}

main();
