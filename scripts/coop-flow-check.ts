/** coop-flow-check — npx tsx scripts/coop-flow-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { createPlayer, getPlayer, requirePlayer } from '../src/systems/playerSystem';
import {
  createCoopRecruit,
  joinCoopRecruit,
  leaveCoopRecruit,
  startCoopRecruit,
  cancelCoopRecruit,
  validateRecruitOperation,
  getCoopRecruit,
  expireStaleRecruits,
  getActiveMemberCount,
} from '../src/systems/coop/coopRecruitSystem';
import {
  createCoopBattleFromRecruit,
  submitCoopAction,
  tryResolveCoopTurn,
  getCoopBattle,
  getCoopBattleByRecruit,
  getPendingActionCount,
  autoDefendMissingActions,
  validateCoopBattleAction,
  cleanupStaleCoopBattles,
} from '../src/systems/coop/coopBattleSystem';
import { grantCoopBattleRewards, applyRescueLeaderRecovery, getCoopReward } from '../src/systems/coop/coopRewardSystem';
import { RESCUE_HP_MULT, RAID_HP_MULT } from '../src/systems/coop/coopTypes';
import { setStoryFlag } from '../src/systems/storySystem';

const GUILD = 'coop-test-guild';
const LEADER = 'coop-leader';
const H2 = 'coop-helper2';
const H3 = 'coop-helper3';
const H4 = 'coop-helper4';
const H5 = 'coop-helper5';

function ensureUser(id: string) {
  if (!getPlayer(id)) createPlayer(id, GUILD, id, 'ch');
  getDb().prepare('UPDATE players SET level = 80 WHERE user_id = ?').run(id);
  setStoryFlag(id, 'valhalla_unlocked');
  setStoryFlag(id, 'chapter_completed:ch7_furnace');
  setStoryFlag(id, 'boss_defeated:boss_old_furnace_keeper');
  const hasSrc = getDb().prepare(`
    SELECT 1 FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ? AND i.rarity = 'Src' LIMIT 1
  `).get(id);
  if (!hasSrc) {
    getDb().prepare(`
      INSERT INTO player_inventory (user_id, item_id, quantity, awakening_level, upgrade_level, src_level, durability_state, is_equipped, is_pending_reward, created_at, updated_at)
      VALUES (?, 'wpn_mist_staff', 1, 0, 0, 1, '良好', 0, 0, datetime('now'), datetime('now'))
    `).run(id);
  }
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
  [LEADER, H2, H3, H4, H5].forEach(ensureUser);

  const issues: string[] = [];

  // --- Recruit: rescue ---
  const rescue = createCoopRecruit(GUILD, LEADER, 'rescue', { monster_id: 'mon_bandit', rescue_type: 'explore' });
  if (!rescue.ok || !rescue.recruitId) issues.push(`救難募集作成: ${rescue.message}`);
  const rid = rescue.recruitId!;

  const leaderMember = db.prepare('SELECT role FROM coop_members WHERE recruit_id = ? AND user_id = ?').get(rid, LEADER) as { role: string } | undefined;
  if (leaderMember?.role !== 'leader') issues.push('募集主が自動参加していない');

  const soloStart = startCoopRecruit(rid, LEADER);
  if (soloStart.ok) issues.push('1人で開始できてしまう');

  if (joinCoopRecruit(rid, LEADER).includes('既に')) { /* ok */ } else issues.push('二重参加チェック失敗');

  joinCoopRecruit(rid, H2);
  const start2 = startCoopRecruit(rid, LEADER);
  if (!start2.ok || !start2.battleId) issues.push(`2人開始失敗: ${start2.message}`);
  else {
    cleanupCoop();
  }

  // permissions (fresh raid recruit)
  const r2 = createCoopRecruit(GUILD, LEADER, 'raid', { area_id: 'area_deep_core' });
  if (!r2.ok || !r2.recruitId) issues.push(`権限テスト用レイド募集: ${r2.message}`);
  else {
  const raidId = r2.recruitId;
  joinCoopRecruit(raidId, H2);
  if (startCoopRecruit(raidId, H2).ok) issues.push('非リーダーが開始できた');
  const nonLeaderCancel = cancelCoopRecruit(raidId, H2);
  if (!nonLeaderCancel.includes('募集主') && !nonLeaderCancel.includes('開始')) {
    issues.push(`非リーダー解散: ${nonLeaderCancel}`);
  }

  joinCoopRecruit(raidId, H3);
  joinCoopRecruit(raidId, H4);
  if (getActiveMemberCount(raidId) !== 4) {
    issues.push('4人組み立て失敗');
  }
  const fullMsg = joinCoopRecruit(raidId, H5);
  if (!fullMsg.includes('定員')) issues.push('5人目参加を弾いていない');

  leaveCoopRecruit(raidId, H4);
  joinCoopRecruit(raidId, H4);

  // expired recruit (separate)
  const rExp = createCoopRecruit(GUILD, LEADER, 'rescue');
  db.prepare("UPDATE coop_recruits SET expires_at = datetime('now', '-1 hour') WHERE id = ?").run(rExp.recruitId!);
  expireStaleRecruits();
  const expiredCheck = validateRecruitOperation(rExp.recruitId!, H2, 'join');
  if (expiredCheck.ok) issues.push('期限切れ募集が操作可能');
  cancelCoopRecruit(raidId, LEADER);
  }

  // fresh raid for battle tests
  cleanupCoop();
  const raid = createCoopRecruit(GUILD, LEADER, 'raid');
  if (!raid.ok || !raid.recruitId) issues.push(`レイド募集: ${raid.message}`);
  const raidRecruit = raid.recruitId!;
  joinCoopRecruit(raidRecruit, H2);
  joinCoopRecruit(raidRecruit, H3);
  if (getActiveMemberCount(raidRecruit) < 2) issues.push('レイド開始前人数不足');
  const raidStart = startCoopRecruit(raidRecruit, LEADER);
  if (!raidStart.ok || !raidStart.battleId) issues.push(`レイド戦闘開始失敗: ${raidStart.message}`);
  const battleId = raidStart.battleId;
  if (!battleId) {
    console.log('coop-flow-check');
    console.error('FAIL');
    for (const i of issues) console.error(' -', i);
    process.exit(1);
  }

  const battle = getCoopBattle(battleId);
  if (!battle) issues.push('coop battle session 未作成');
  const enemy = JSON.parse(battle!.enemy_json) as { max_hp: number };
  const mon = db.prepare('SELECT hp FROM monsters WHERE id = ?').get('mon_deep_core_boss') as { hp: number };
  const expectedRaidHp = Math.floor(mon.hp * (RAID_HP_MULT[3] ?? 2.6) * 1.15);
  if (Math.abs(enemy.max_hp - expectedRaidHp) > 5) {
    issues.push(`レイドHP倍率: ${enemy.max_hp} (expected ~${expectedRaidHp})`);
  }

  // actions
  const act1 = submitCoopAction(battleId, LEADER, 'attack');
  if (!act1.ok) issues.push(`行動1: ${act1.message}`);
  if (getPendingActionCount(battleId, battle!.turn_count) !== 2) issues.push('行動待ち人数不正');

  submitCoopAction(battleId, H2, 'defend');
  submitCoopAction(battleId, H3, 'defend');

  const afterTurn = getCoopBattle(battleId);
  if (afterTurn && afterTurn.turn_count <= 1 && afterTurn.status === 'active') {
    /* turn may have advanced */
  }

  // auto defend
  cleanupCoop();
  const r3 = createCoopRecruit(GUILD, LEADER, 'rescue', { monster_id: 'mon_bandit' });
  joinCoopRecruit(r3.recruitId!, H2);
  const rs = startCoopRecruit(r3.recruitId!, LEADER);
  const bid = rs.battleId!;
  db.prepare("UPDATE coop_battle_sessions SET turn_deadline_at = datetime('now', '-5 minutes') WHERE id = ?").run(bid);
  autoDefendMissingActions(bid);
  const pending = getPendingActionCount(bid, 1);
  if (pending > 0) issues.push('自動防御後も未入力が残る');

  // resolving lock / double reward
  cleanupCoop();
  const r4 = createCoopRecruit(GUILD, LEADER, 'rescue', { monster_id: 'mon_bandit' });
  joinCoopRecruit(r4.recruitId!, H2);
  startCoopRecruit(r4.recruitId!, LEADER);
  const b4 = getCoopBattleByRecruit(r4.recruitId!)!;
  const parts = JSON.parse(b4.participant_states_json) as Array<{ user_id: string; hp: number; max_hp: number; defeated: boolean; role: string }>;
  const enemyState = JSON.parse(b4.enemy_json) as { hp: number; max_hp: number; monster_id: string; exp_reward: number; gold_reward: number; name: string };
  enemyState.hp = 0;
  db.prepare('UPDATE coop_battle_sessions SET enemy_json = ?, status = ? WHERE id = ?').run(JSON.stringify(enemyState), 'active', b4.id);
  submitCoopAction(b4.id, LEADER, 'attack');
  submitCoopAction(b4.id, H2, 'attack');

  const reward1 = getCoopReward(b4.id, LEADER);
  const reward2 = getCoopReward(b4.id, H2);
  if (!reward1 || !reward2) issues.push('勝利報酬未付与');
  grantCoopBattleRewards(b4.id, parts as never, enemyState as never, LEADER, 'rescue');
  const dupCount = db.prepare('SELECT COUNT(*) c FROM coop_rewards WHERE battle_id = ?').get(b4.id) as { c: number };
  if (dupCount.c > 2) issues.push('報酬二重付与');

  // rescue recovery 50% HP
  db.prepare('UPDATE players SET hp = 0 WHERE user_id = ?').run(LEADER);
  applyRescueLeaderRecovery(LEADER, parts as never);
  const leaderAfter = requirePlayer(LEADER);
  const expectedHp = Math.max(1, Math.floor(leaderAfter.max_hp * 0.5));
  if (leaderAfter.hp !== expectedHp) issues.push(`救難復帰HP: ${leaderAfter.hp} (expected ${expectedHp})`);

  // rescue HP mult
  cleanupCoop();
  const rr = createCoopRecruit(GUILD, LEADER, 'rescue', { monster_id: 'mon_bandit' });
  joinCoopRecruit(rr.recruitId!, H2);
  startCoopRecruit(rr.recruitId!, LEADER);
  const rb = getCoopBattleByRecruit(rr.recruitId!);
  if (!rb) issues.push('救難battle未作成');
  else {
  const re = JSON.parse(rb.enemy_json) as { max_hp: number };
  const bandit = db.prepare('SELECT hp FROM monsters WHERE id = ?').get('mon_bandit') as { hp: number };
  const expectedRescue = Math.floor(bandit.hp * (RESCUE_HP_MULT[2] ?? 1.6));
  if (Math.abs(re.max_hp - expectedRescue) > 3) issues.push(`救難HP倍率: ${re.max_hp} vs ${expectedRescue}`);
  }

  // defeated can't act
  const r5 = createCoopRecruit(GUILD, LEADER, 'rescue', { monster_id: 'mon_bandit' });
  joinCoopRecruit(r5.recruitId!, H2);
  startCoopRecruit(r5.recruitId!, LEADER);
  const b5 = getCoopBattleByRecruit(r5.recruitId!);
  if (!b5) issues.push('defeat test battle missing');
  else {
  db.prepare(`
    UPDATE coop_battle_sessions SET participant_states_json = ?
    WHERE id = ?
  `).run(JSON.stringify([
    { user_id: LEADER, role: 'leader', hp: 0, defeated: true, mp: 10, max_hp: 100, max_mp: 50, attack: 10, magic: 10, defense: 10, spirit: 10, speed: 10, poisonTurns: 0, playerSilence: 0, defending: false, tauntActive: false, coverTarget: null },
    { user_id: H2, role: 'helper', hp: 50, defeated: false, mp: 10, max_hp: 100, max_mp: 50, attack: 10, magic: 10, defense: 10, spirit: 10, speed: 10, poisonTurns: 0, playerSilence: 0, defending: false, tauntActive: false, coverTarget: null },
  ]), b5.id);
  const blocked = validateCoopBattleAction(b5.id, LEADER);
  if (blocked.ok) issues.push('戦闘不能者が行動可能');

  // stale session
  db.prepare("UPDATE coop_battle_sessions SET status = 'defeat' WHERE id = ?").run(b5.id);
  const stale = validateCoopBattleAction(b5.id, H2);
  if (stale.ok) issues.push('完了済み戦闘が操作可能');
  }

  cleanupStaleCoopBattles();

  // started recruit can't join
  cleanupCoop();
  const r6 = createCoopRecruit(GUILD, LEADER, 'rescue');
  joinCoopRecruit(r6.recruitId!, H2);
  startCoopRecruit(r6.recruitId!, LEADER);
  const lateJoin = joinCoopRecruit(r6.recruitId!, H3);
  if (!lateJoin.includes('終了') && !lateJoin.includes('開始')) issues.push('開始後参加を弾いていない');

  console.log('coop-flow-check');
  if (issues.length) {
    console.error('FAIL');
    for (const i of issues) console.error(' -', i);
    process.exit(1);
  }
  console.log('OK — coop recruit, battle, rewards, HP scale, stale guards');
}

main();
