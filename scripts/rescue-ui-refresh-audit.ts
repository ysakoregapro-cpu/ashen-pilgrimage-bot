/** rescue-ui-refresh-audit.ts */
import fs from 'fs';
import path from 'path';
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
  formatCoopBattleStatus,
  getCoopBattle,
} from '../src/systems/coop/coopBattleSystem';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'case_id', 'turn', 'action_input_count', 'uses_edit', 'posts_new_ui_on_turn_advance',
  'old_buttons_rejected', 'latest_ui_contains_status', 'shows_waiting_count', 'log_growth_controlled',
  'match_ok', 'balance_note',
];

const LEADER = 'rescue-ui-leader';
const HELPER = 'rescue-ui-helper';

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

function readSrc(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8');
}

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  const rows: string[][] = [];

  const uiSrc = readSrc('src/systems/coop/coopUi.ts');
  const syncSrc = readSrc('src/systems/coop/coopMessageSync.ts');
  const handlerSrc = readSrc('src/systems/coop/coopHandlers.ts');
  const battleSrc = readSrc('src/systems/coop/coopBattleSystem.ts');
  const maintSrc = readSrc('src/systems/coop/coopMaintenance.ts');

  const turnInButtons = /coop:act:\$\{battleId\}:\$\{turn\}/.test(uiSrc);
  const postNewOnTurn = syncSrc.includes('postNewOnTurnAdvance');
  const maintUsesPostNew = maintSrc.includes('postNewOnTurnAdvance');
  const staleReject = handlerSrc.includes('expectedTurn') || battleSrc.includes('expectedTurn');
  const statusFields = battleSrc.includes('入力済') && battleSrc.includes('未入力') && battleSrc.includes('【直近ログ】');
  const logCap = battleSrc.includes('meta.log.length > 10');

  const staticOk = turnInButtons && postNewOnTurn && staleReject && statusFields && logCap;
  if (!turnInButtons) result.fails.push('custom_id に turn 未含有');
  if (!postNewOnTurn) result.fails.push('postNewOnTurnAdvance 未実装');
  if (!staleReject) result.fails.push('古いターン拒否未実装');
  if (!statusFields) result.fails.push('救難UI必須フィールド不足');

  rows.push([
    'static_code_checks', 'N/A', 'N/A', 'N/A', 'N/A',
    postNewOnTurn ? 'YES' : 'NO',
    staleReject ? 'YES' : 'NO',
    statusFields ? 'YES' : 'NO',
    battleSrc.includes('未入力') ? 'YES' : 'NO',
    logCap ? 'YES' : 'NO',
    staticOk ? 'OK' : 'FAIL',
    `maintPostNew=${maintUsesPostNew}`,
  ]);

  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('rescue-ui-refresh-audit', HEADERS, rows, ['## DB unavailable for runtime case']);
    exitCheckResult('rescue-ui-refresh-audit', result);
    return;
  }
  ensurePhase2Seed(init.db);
  cleanup();
  [LEADER, HELPER].forEach(ensureUser);

  const recruit = createCoopRecruit('audit-guild', LEADER, 'rescue', {
    monster_id: 'mon_furnace_defense',
    source_enemy_max_hp: 4200,
  });
  joinCoopRecruit(recruit.recruitId!, HELPER);
  const start = startCoopRecruit(recruit.recruitId!, LEADER);
  const battleId = start.battleId!;
  const turn = getCoopBattle(battleId)!.turn_count;

  submitCoopAction(battleId, LEADER, 'attack');
  const statusMid = formatCoopBattleStatus(battleId);
  const waitingShown = statusMid.includes('入力待ち') || statusMid.includes('未入力');
  const oldTurnReject = !validateCoopBattleAction(battleId, LEADER, turn - 1).ok;

  rows.push([
    'runtime_status_mid_turn', String(turn), '1', 'N/A', 'N/A',
    oldTurnReject ? 'YES' : 'NO',
    statusMid.includes('Turn') && statusMid.includes('【敵】') ? 'YES' : 'NO',
    waitingShown ? 'YES' : 'NO',
    statusMid.split('\n').length < 40 ? 'YES' : 'NO',
    waitingShown && oldTurnReject ? 'OK' : 'FAIL',
    'mid-turn UI snapshot',
  ]);
  if (!waitingShown) result.fails.push('入力待ち表示なし');

  cleanup();
  writeMdCsvPair('rescue-ui-refresh-audit', HEADERS, rows, [
    '## Summary', '', `- cases: ${rows.length}`, `- fails: ${result.fails.length}`,
    '- UI方式: 方式B（ターン進行時に新規投稿）',
  ]);
  exitCheckResult('rescue-ui-refresh-audit', result);
}

main();
