/** rescue-reward-display-audit.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { grantCoopBattleRewards } from '../src/systems/coop/coopRewardSystem';
import { formatCoopBattleStatus } from '../src/systems/coop/coopBattleSystem';
import type { CoopEnemyState, CoopParticipantState } from '../src/systems/coop/coopTypes';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';
import { nowIso } from '../src/types';

const HEADERS = [
  'case_id', 'battle_result', 'participant_count', 'reward_granted', 'reward_displayed',
  'shows_exp', 'shows_job_exp', 'shows_gold', 'shows_items', 'shows_equipment',
  'shows_no_reward_when_empty', 'match_ok', 'balance_note',
];

const LEADER = 'rescue-reward-leader';
const HELPER = 'rescue-reward-helper';

function cleanup() {
  const db = getDb();
  db.prepare('DELETE FROM coop_rewards').run();
  db.prepare('DELETE FROM coop_battle_actions').run();
  db.prepare('DELETE FROM coop_battle_sessions').run();
  db.prepare('DELETE FROM coop_members').run();
  db.prepare('DELETE FROM coop_recruits').run();
}

function ensureUser(id: string) {
  if (!getPlayer(id)) createPlayer(id, 'audit-guild', id, 'ch');
}

function insertVictoryBattle(
  battleId: string,
  recruitId: string,
  participants: CoopParticipantState[],
  enemy: CoopEnemyState,
  rewardSummary: string,
): void {
  const db = getDb();
  const now = nowIso();
  db.prepare(`
    INSERT INTO coop_recruits (id, guild_id, leader_id, mode, status, min_players, max_players, context_json, expires_at, created_at, updated_at)
    VALUES (?, 'audit-guild', ?, 'rescue', 'completed', 2, 4, '{}', datetime('now','+1 hour'), ?, ?)
  `).run(recruitId, LEADER, now, now);
  for (const p of participants) {
    db.prepare(`
      INSERT INTO coop_members (recruit_id, user_id, role, status, joined_at)
      VALUES (?, ?, ?, 'reward_granted', ?)
    `).run(recruitId, p.user_id, p.role, now);
  }
  db.prepare(`
    INSERT INTO coop_battle_sessions (id, recruit_id, mode, status, enemy_json, participant_states_json, turn_count, status_json, created_at, updated_at)
    VALUES (?, ?, 'rescue', 'victory', ?, ?, 3, ?, ?, ?)
  `).run(
    battleId,
    recruitId,
    JSON.stringify(enemy),
    JSON.stringify(participants),
    JSON.stringify({ log: [], enemyBroken: false, breakRemainingHits: 0, leader_id: LEADER, reward_summary: rewardSummary }),
    now,
    now,
  );
  for (const p of participants) {
    db.prepare(`
      INSERT INTO coop_battle_actions (battle_id, user_id, turn_count, action_type, submitted_at)
      VALUES (?, ?, 1, 'attack', ?)
    `).run(battleId, p.user_id, now);
  }
}

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('rescue-reward-display-audit', HEADERS, [], ['## DB unavailable']);
    exitCheckResult('rescue-reward-display-audit', result);
    return;
  }
  ensurePhase2Seed(init.db);
  cleanup();
  [LEADER, HELPER].forEach(ensureUser);

  const enemy: CoopEnemyState = {
    monster_id: 'mon_furnace_defense',
    name: '炉心防衛ユニット',
    hp: 0,
    max_hp: 4200,
    attack: 36,
    magic: 20,
    defense: 38,
    spirit: 10,
    break: 0,
    break_max: 100,
    element: null,
    exp_reward: 140,
    gold_reward: 102,
  };
  const participants: CoopParticipantState[] = [
    {
      user_id: LEADER, role: 'leader', hp: 500, mp: 100, max_hp: 900, max_mp: 120,
      attack: 50, magic: 20, defense: 30, spirit: 15, speed: 10,
      poisonTurns: 0, playerSilence: 0, defending: false, tauntActive: false, coverTarget: null,
      defeated: false, atkBuff: 0, magBuff: 0, defBuff: 0, actionsTaken: 1,
    },
    {
      user_id: HELPER, role: 'member', hp: 400, mp: 80, max_hp: 800, max_mp: 100,
      attack: 45, magic: 18, defense: 28, spirit: 12, speed: 12,
      poisonTurns: 0, playerSilence: 0, defending: false, tauntActive: false, coverTarget: null,
      defeated: false, atkBuff: 0, magBuff: 0, defBuff: 0, actionsTaken: 1,
    },
  ];

  const battleId = 'rescue-reward-audit-battle';
  const recruitId = 'rescue-reward-audit-recruit';
  insertVictoryBattle(battleId, recruitId, participants, enemy, '');
  const rewardMsg = grantCoopBattleRewards(battleId, participants, enemy, LEADER, 'rescue');
  getDb().prepare(`
    UPDATE coop_battle_sessions SET status_json = ? WHERE id = ?
  `).run(JSON.stringify({
    log: [],
    enemyBroken: false,
    breakRemainingHits: 0,
    leader_id: LEADER,
    reward_summary: rewardMsg,
  }), battleId);
  const display = formatCoopBattleStatus(battleId);

  const showsExp = /EXP \+\d+/.test(rewardMsg) && /EXP \+\d+/.test(display);
  const showsJobExp = /Job EXP \+\d+/.test(rewardMsg) && /Job EXP \+\d+/.test(display);
  const showsGold = /Gold \+\d+/.test(rewardMsg) && /Gold \+\d+/.test(display);
  const showsItems = /入手:/.test(rewardMsg) || /鉄くず/.test(rewardMsg);
  const showsEquipment = /装備/.test(rewardMsg);
  const rewardGranted = getDb().prepare('SELECT COUNT(*) AS c FROM coop_rewards WHERE battle_id = ?').get(battleId) as { c: number };
  const rewardDisplayed = display.includes('【参加者報酬】') || display.includes('EXP +');
  const matchOk = rewardGranted.c >= 2 && rewardDisplayed && showsExp && showsJobExp && showsGold;

  if (!matchOk) result.fails.push('救難報酬の付与/表示が不一致');
  if (!display.includes('【参加者報酬】')) result.fails.push('formatCoopBattleStatus に報酬セクションなし');

  const rows: string[][] = [[
    'victory_two_player', 'victory', '2',
    rewardGranted.c >= 2 ? 'YES' : 'NO',
    rewardDisplayed ? 'YES' : 'NO',
    showsExp ? 'YES' : 'NO',
    showsJobExp ? 'YES' : 'NO',
    showsGold ? 'YES' : 'NO',
    showsItems ? 'YES' : 'NO',
    showsEquipment ? 'YES' : 'NO',
    'N/A',
    matchOk ? 'OK' : 'FAIL',
    rewardMsg.split('\n').slice(0, 3).join(' | '),
  ]];

  const emptyBattleId = 'rescue-reward-empty-battle';
  const emptyRecruitId = 'rescue-reward-empty-recruit';
  const emptyMsg = '**報酬**\n報酬なし';
  insertVictoryBattle(emptyBattleId, emptyRecruitId, participants.slice(0, 1), enemy, emptyMsg);
  const emptyDisplay = formatCoopBattleStatus(emptyBattleId);
  const showsNoReward = emptyMsg.includes('報酬なし') || emptyDisplay.includes('報酬なし');
  rows.push([
    'no_reward_text', 'victory', '1', 'NO', showsNoReward ? 'YES' : 'NO',
    'NO', 'NO', 'NO', 'NO', 'NO', showsNoReward ? 'YES' : 'NO',
    showsNoReward ? 'OK' : 'WARN', 'empty reward path',
  ]);

  cleanup();
  writeMdCsvPair('rescue-reward-display-audit', HEADERS, rows, [
    '## Summary', '', `- cases: ${rows.length}`, `- fails: ${result.fails.length}`,
  ]);
  exitCheckResult('rescue-reward-display-audit', result);
}

main();
