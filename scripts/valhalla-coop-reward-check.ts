/** valhalla-coop-reward-check — npx tsx scripts/valhalla-coop-reward-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import {
  createCoopRecruit,
  joinCoopRecruit,
  startCoopRecruit,
} from '../src/systems/coop/coopRecruitSystem';
import { createCoopBattleFromRecruit, getCoopBattle } from '../src/systems/coop/coopBattleSystem';
import { grantCoopBattleRewards, getCoopReward } from '../src/systems/coop/coopRewardSystem';
import {
  VALHALLA_BOSS_MONSTER_IDS,
  VALHALLA_EMBLEM_ID,
  VALHALLA_REPEAT_REWARDS,
} from '../src/db/seedData/valhallaRewardMaster';
import { setStoryFlag } from '../src/systems/storySystem';
import { getValhallaBossAreaId } from '../src/systems/valhallaCoopSystem';
import type { CoopEnemyState, CoopParticipantState } from '../src/systems/coop/coopTypes';

const GUILD = 'valhalla-coop-reward-guild';
const LEADER = 'valhalla-reward-leader';
const H2 = 'valhalla-reward-h2';

const fails: string[] = [];

function assert(cond: boolean, msg: string) {
  if (!cond) fails.push(msg);
}

function itemQty(userId: string, itemId: string): number {
  const row = getDb().prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS q FROM player_inventory WHERE user_id = ? AND item_id = ?
  `).get(userId, itemId) as { q: number };
  return row.q;
}

function ensureUser(id: string) {
  if (!getPlayer(id)) createPlayer(id, GUILD, id, 'ch');
  getDb().prepare('UPDATE players SET level = 80 WHERE user_id = ?').run(id);
  setStoryFlag(id, 'valhalla_unlocked');
  setStoryFlag(id, 'chapter_completed:ch7_furnace');
  setStoryFlag(id, 'boss_defeated:boss_old_furnace_keeper');
  for (const boss of VALHALLA_BOSS_MONSTER_IDS) {
    setStoryFlag(id, `valhalla_boss_first_clear:${boss}`);
    getDb().prepare(`
      INSERT INTO battle_sessions (id, user_id, area_id, monster_id, player_hp, player_mp, enemy_hp, turn_count, status_json, is_boss, is_raid, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 100, 50, 0, 1, '{}', 1, 0, 'victory', datetime('now'), datetime('now'))
      ON CONFLICT(id) DO NOTHING
    `).run(`reward_audit_${id}_${boss}`, id, getValhallaBossAreaId(boss), boss);
  }
  getDb().prepare(`
    INSERT INTO player_inventory (user_id, item_id, quantity, awakening_level, upgrade_level, src_level, durability_state, is_equipped, is_pending_reward, created_at, updated_at)
    SELECT ?, 'wpn_mist_staff', 1, 0, 0, 1, '良好', 0, 0, datetime('now'), datetime('now')
    WHERE NOT EXISTS (SELECT 1 FROM player_inventory WHERE user_id = ? AND item_id = 'wpn_mist_staff')
  `).run(id, id);
}

function cleanupCoop() {
  const db = getDb();
  db.prepare('DELETE FROM coop_rewards').run();
  db.prepare('DELETE FROM coop_battle_actions').run();
  db.prepare('DELETE FROM coop_battle_sessions').run();
  db.prepare('DELETE FROM coop_members').run();
  db.prepare('DELETE FROM coop_recruits').run();
}

function main() {
  const db = getDb();
  ensurePhase2Seed(db);
  cleanupCoop();
  [LEADER, H2].forEach(ensureUser);

  console.log('## valhalla-coop-reward-check\n');

  const bossId = VALHALLA_BOSS_MONSTER_IDS[0]!;
  const created = createCoopRecruit(GUILD, LEADER, 'valhalla_coop', { monster_id: bossId });
  assert(created.ok && !!created.recruitId, 'recruit create');
  const rid = created.recruitId!;
  joinCoopRecruit(rid, H2);

  getDb().prepare(`
    INSERT INTO coop_battle_actions (battle_id, user_id, turn_count, action_type, skill_id, item_id, target_json, submitted_at)
    VALUES ('pending', ?, 1, 'attack', NULL, NULL, NULL, datetime('now'))
  `).run(LEADER);
  getDb().prepare('DELETE FROM coop_battle_actions WHERE battle_id = ?').run('pending');

  const started = startCoopRecruit(rid, LEADER);
  assert(started.ok && !!started.battleId, `start: ${started.message}`);
  const battleId = started.battleId!;
  const battle = getCoopBattle(battleId)!;
  const participants = JSON.parse(battle.participant_states_json) as CoopParticipantState[];
  const enemy = JSON.parse(battle.enemy_json) as CoopEnemyState;

  for (const p of participants) {
    getDb().prepare(`
      INSERT INTO coop_battle_actions (battle_id, user_id, turn_count, action_type, submitted_at)
      VALUES (?, ?, 1, 'attack', datetime('now'))
    `).run(battleId, p.user_id);
  }

  const emblemBeforeL = itemQty(LEADER, VALHALLA_EMBLEM_ID);
  const emblemBeforeH = itemQty(H2, VALHALLA_EMBLEM_ID);

  const msg = grantCoopBattleRewards(battleId, participants, enemy, LEADER, 'valhalla_coop');
  assert(msg.includes('報酬'), 'reward message');

  const rewardL = getCoopReward(battleId, LEADER);
  const rewardH = getCoopReward(battleId, H2);
  assert(!!rewardL && !!rewardH, 'both participants got reward records');
  assert((rewardL?.exp ?? 0) >= VALHALLA_REPEAT_REWARDS.expMin, 'exp min');
  assert((rewardL?.exp ?? 0) <= VALHALLA_REPEAT_REWARDS.expMax, 'exp max');
  assert((rewardL?.gold ?? 0) >= VALHALLA_REPEAT_REWARDS.goldMin, 'gold min');
  assert((rewardL?.gold ?? 0) <= VALHALLA_REPEAT_REWARDS.goldMax, 'gold max');

  const emblemAfterL = itemQty(LEADER, VALHALLA_EMBLEM_ID);
  const emblemAfterH = itemQty(H2, VALHALLA_EMBLEM_ID);
  assert(emblemAfterL - emblemBeforeL >= VALHALLA_REPEAT_REWARDS.emblemMin, 'leader emblem min');
  assert(emblemAfterH - emblemBeforeH >= VALHALLA_REPEAT_REWARDS.emblemMin, 'helper emblem min');

  const dup = grantCoopBattleRewards(battleId, participants, enemy, LEADER, 'valhalla_coop');
  assert(dup.includes('付与済み'), 'duplicate grant blocked');

  const equipWithAffix = db.prepare(`
    SELECT pi.metadata_json FROM player_inventory pi
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND pi.metadata_json LIKE '%affix%'
    ORDER BY pi.id DESC LIMIT 1
  `).get(LEADER) as { metadata_json: string } | undefined;
  if (!equipWithAffix) {
    console.log('WARN: no affix equipment dropped in sample run (probabilistic)');
  } else {
    assert(equipWithAffix.metadata_json.includes('affix'), 'Phase2.5 affix on gear drop');
  }

  if (fails.length) {
    console.error('FAIL');
    for (const f of fails) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log('OK');
  console.log('- per-participant rewards with emblem');
  console.log('- duplicate grant prevented');
}

main();
