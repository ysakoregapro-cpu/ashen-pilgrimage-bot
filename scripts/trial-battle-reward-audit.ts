/** trial-battle-reward-audit.ts — npx tsx scripts/trial-battle-reward-audit.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { setStoryFlag } from '../src/systems/storySystem';
import {
  ADVANCED_JOB_UNLOCK_LEVEL, JOB_TRIO_MAP, TRIAL_REPEAT_CLEAR_GOLD, TRIAL_VICTORY_EXP,
} from '../src/db/seedData/jobProgressionMaster';
import { canStartTrial, isAdvancedJobUnlocked } from '../src/systems/jobProgressionSystem';
import { startTrialBattle, processTrialVictory } from '../src/systems/trialBattleSystem';
import { applyTrialDefeat } from '../src/systems/defeatSystem';
import { writeMdCsvPair, exitCheckResult, emptyResult } from './balance/balanceHelpers';

const USER = 'trial-battle-reward-audit-user';
const BASE = '剣士';
const ADVANCED = JOB_TRIO_MAP[BASE]!.advanced;

function reset(db: ReturnType<typeof getDb>) {
  db.prepare('DELETE FROM durability_logs WHERE user_id = ?').run(USER);
  db.prepare('DELETE FROM player_advanced_job_unlocks WHERE user_id = ?').run(USER);
  db.prepare('DELETE FROM player_job_levels WHERE user_id = ?').run(USER);
  db.prepare('DELETE FROM battle_sessions WHERE user_id = ?').run(USER);
  db.prepare('DELETE FROM story_flags WHERE user_id = ?').run(USER);
  db.prepare('DELETE FROM players WHERE user_id = ?').run(USER);
}

function setup(db: ReturnType<typeof getDb>, gold = 500) {
  reset(db);
  createPlayer(USER, 'g', 'TrialReward', 'c');
  db.prepare('UPDATE players SET main_job = ?, gold = ?, hp = 50, max_hp = 200, mp = 10, max_mp = 100 WHERE user_id = ?')
    .run(BASE, gold, USER);
  db.prepare(`
    INSERT INTO player_job_levels (user_id, job_name, job_level, job_exp, is_main, is_sub, unlocked_at, updated_at)
    VALUES (?, ?, ?, 0, 1, 0, datetime('now'), datetime('now'))
  `).run(USER, BASE, ADVANCED_JOB_UNLOCK_LEVEL);
  setStoryFlag(USER, 'chapter_completed:ch7_furnace');
}

function main() {
  const result = emptyResult();
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  setup(db, 500);

  const rows: string[][] = [];

  const start1 = startTrialBattle(USER, BASE);
  const goldAfterStart1 = getPlayer(USER)!.gold;
  if (!start1.ok) result.fails.push(`初回開始失敗: ${start1.message}`);
  if (goldAfterStart1 !== 500) result.fails.push(`初回挑戦でGold消費: ${500} -> ${goldAfterStart1}`);
  rows.push(['first_start_gold_cost', goldAfterStart1 === 500 ? 'OK' : 'FAIL', String(goldAfterStart1)]);

  const first = processTrialVictory(USER, BASE);
  const p1 = getPlayer(USER)!;
  if (!first.wasFirstClear) result.fails.push('初回勝利がfirstClear判定されていない');
  if (first.goldAwarded !== 0) result.fails.push(`初回Gold報酬が0ではない: ${first.goldAwarded}`);
  if (first.expAwarded !== TRIAL_VICTORY_EXP) result.fails.push(`初回EXP: ${first.expAwarded}`);
  if (p1.gold !== 500) result.fails.push(`初回クリア後Gold: ${p1.gold}`);
  if (p1.hp !== p1.max_hp || p1.mp !== p1.max_mp) result.fails.push('初回クリア後HP/MP未回復');
  if (!isAdvancedJobUnlocked(USER, ADVANCED)) result.fails.push('初回クリア後未解放');
  rows.push(['first_clear_gold', first.goldAwarded === 0 ? 'OK' : 'FAIL', String(first.goldAwarded)]);
  rows.push(['first_clear_exp', first.expAwarded === 1 ? 'OK' : 'FAIL', String(first.expAwarded)]);
  rows.push(['first_clear_heal', p1.hp === p1.max_hp && p1.mp === p1.max_mp ? 'OK' : 'FAIL', `${p1.hp}/${p1.max_hp}`]);

  db.prepare('DELETE FROM battle_sessions WHERE user_id = ?').run(USER);
  const start2 = startTrialBattle(USER, BASE);
  const goldAfterStart2 = getPlayer(USER)!.gold;
  if (!start2.ok) result.fails.push(`再挑戦開始失敗: ${start2.message}`);
  if (goldAfterStart2 !== 500) result.fails.push(`再挑戦でGold消費: ${goldAfterStart2}`);
  rows.push(['rematch_start_gold_cost', goldAfterStart2 === 500 ? 'OK' : 'FAIL', String(goldAfterStart2)]);

  const repeat = processTrialVictory(USER, BASE);
  const p2 = getPlayer(USER)!;
  if (repeat.wasFirstClear) result.fails.push('再クリアがfirstClear扱い');
  if (repeat.goldAwarded !== TRIAL_REPEAT_CLEAR_GOLD) result.fails.push(`再クリアGold: ${repeat.goldAwarded}`);
  if (p2.gold !== 500 + TRIAL_REPEAT_CLEAR_GOLD) result.fails.push(`再クリア後Gold: ${p2.gold}`);
  if (p2.hp !== p2.max_hp || p2.mp !== p2.max_mp) result.fails.push('再クリア後HP/MP未回復');
  rows.push(['repeat_clear_gold', repeat.goldAwarded === TRIAL_REPEAT_CLEAR_GOLD ? 'OK' : 'FAIL', String(repeat.goldAwarded)]);
  rows.push(['repeat_clear_exp', repeat.expAwarded === 1 ? 'OK' : 'FAIL', String(repeat.expAwarded)]);

  db.prepare('UPDATE players SET gold = 300 WHERE user_id = ?').run(USER);
  db.prepare('DELETE FROM player_equipment WHERE user_id = ?').run(USER);
  const eqRow = db.prepare('SELECT item_id FROM equipment LIMIT 1').get() as { item_id: string } | undefined;
  if (eqRow) {
    db.prepare(`
      INSERT INTO player_inventory (user_id, item_id, quantity, durability_state, created_at, updated_at)
      VALUES (?, ?, 1, '良好', datetime('now'), datetime('now'))
    `).run(USER, eqRow.item_id);
    const inv = db.prepare('SELECT id FROM player_inventory WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(USER) as { id: number };
    db.prepare('INSERT INTO player_equipment (user_id, inventory_id, slot) VALUES (?, ?, ?)').run(USER, inv.id, 'head');
  }

  const goldBeforeDefeat = getPlayer(USER)!.gold;
  const durBefore = (db.prepare('SELECT COUNT(*) AS c FROM durability_logs WHERE user_id = ?').get(USER) as { c: number }).c;
  applyTrialDefeat(USER);
  const durAfter = (db.prepare('SELECT COUNT(*) AS c FROM durability_logs WHERE user_id = ?').get(USER) as { c: number }).c;
  if (durAfter > durBefore) result.fails.push('試練敗北で装備損傷ログあり');
  if (getPlayer(USER)!.gold !== goldBeforeDefeat) result.fails.push('試練敗北でGold変動');
  rows.push(['defeat_no_durability', durAfter === durBefore ? 'OK' : 'FAIL', `${durBefore}->${durAfter}`]);
  rows.push(['defeat_no_gold_loss', getPlayer(USER)!.gold === goldBeforeDefeat ? 'OK' : 'FAIL', String(getPlayer(USER)!.gold)]);

  const rematchOk = canStartTrial(USER, BASE);
  if (!rematchOk.ok) result.fails.push(`解放後再挑戦不可: ${rematchOk.reason}`);
  rows.push(['rematch_allowed', rematchOk.ok ? 'OK' : 'FAIL', rematchOk.reason ?? '']);

  writeMdCsvPair(
    'trial-battle-reward-audit',
    ['check', 'status', 'detail'],
    rows,
    ['## Summary', '', `- fails: ${result.fails.length}`, `- warns: ${result.warns.length}`],
  );

  exitCheckResult('trial-battle-reward-audit', result);
}

main();
