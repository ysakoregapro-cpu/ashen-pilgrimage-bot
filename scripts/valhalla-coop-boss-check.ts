/** valhalla-coop-boss-check — npx tsx scripts/valhalla-coop-boss-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import {
  createCoopRecruit,
  joinCoopRecruit,
  leaveCoopRecruit,
  startCoopRecruit,
  cancelCoopRecruit,
  getActiveMemberCount,
} from '../src/systems/coop/coopRecruitSystem';
import { VALHALLA_BOSS_MONSTER_IDS } from '../src/db/seedData/valhallaRewardMaster';
import { setStoryFlag } from '../src/systems/storySystem';
import { buildCoopRecruitButtons } from '../src/systems/coop/coopUi';
import { canCreateValhallaCoopRecruit, getValhallaBossAreaId } from '../src/systems/valhallaCoopSystem';
import { VALHALLA_COOP_HP_MULT } from '../src/systems/coop/coopTypes';
import fs from 'fs';
import path from 'path';

const GUILD = 'valhalla-coop-test-guild';
const LEADER = 'valhalla-coop-leader';
const H2 = 'valhalla-coop-h2';
const H3 = 'valhalla-coop-h3';
const H4 = 'valhalla-coop-h4';
const H5 = 'valhalla-coop-h5';
const LOCKED = 'valhalla-coop-locked';

const fails: string[] = [];

function assert(cond: boolean, msg: string) {
  if (!cond) fails.push(msg);
}

function ensureUser(id: string, opts?: { valhalla?: boolean; defeatedBosses?: string[] }) {
  if (!getPlayer(id)) createPlayer(id, GUILD, id, 'ch');
  getDb().prepare('UPDATE players SET level = 80 WHERE user_id = ?').run(id);
  if (opts?.valhalla !== false) {
    setStoryFlag(id, 'valhalla_unlocked');
    setStoryFlag(id, 'chapter_completed:ch7_furnace');
    setStoryFlag(id, 'boss_defeated:boss_old_furnace_keeper');
  }
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
  for (const boss of opts?.defeatedBosses ?? VALHALLA_BOSS_MONSTER_IDS) {
    getDb().prepare(`
      INSERT INTO battle_sessions (id, user_id, area_id, monster_id, player_hp, player_mp, enemy_hp, turn_count, status_json, is_boss, is_raid, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 100, 50, 0, 1, '{}', 1, 0, 'victory', datetime('now'), datetime('now'))
      ON CONFLICT(id) DO NOTHING
    `).run(`audit_victory_${id}_${boss}`, id, getValhallaBossAreaId(boss), boss);
  }
}

function cleanupTestBattleHistory() {
  for (const id of [LEADER, H2, H3, H4, H5, LOCKED]) {
    getDb().prepare('DELETE FROM battle_sessions WHERE user_id = ?').run(id);
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
  cleanupTestBattleHistory();
  cleanupCoop();
  [LEADER, H2, H3, H4, H5, LOCKED].forEach((id) => ensureUser(id, {
    valhalla: id !== LOCKED,
    defeatedBosses: VALHALLA_BOSS_MONSTER_IDS as unknown as string[],
  }));

  console.log('## valhalla-coop-boss-check\n');

  for (const bossId of VALHALLA_BOSS_MONSTER_IDS) {
    const check = canCreateValhallaCoopRecruit(LEADER, bossId);
    assert(check.ok, `create gate failed for ${bossId}: ${check.reason}`);
    const created = createCoopRecruit(GUILD, LEADER, 'valhalla_coop', {
      monster_id: bossId,
      area_id: getValhallaBossAreaId(bossId) ?? undefined,
    });
    assert(created.ok && !!created.recruitId, `recruit create ${bossId}: ${created.message}`);
    if (created.recruitId) {
      const joinLocked = joinCoopRecruit(created.recruitId, LOCKED);
      assert(joinLocked.includes('未解放') || joinLocked.includes('参加できません'), `locked user should be rejected on ${bossId}`);
      cancelCoopRecruit(created.recruitId, LEADER);
    }
  }

  cleanupCoop();
  const bossId = VALHALLA_BOSS_MONSTER_IDS[0]!;
  const created = createCoopRecruit(GUILD, LEADER, 'valhalla_coop', { monster_id: bossId });
  assert(created.ok && !!created.recruitId, 'main recruit create');
  const rid = created.recruitId!;

  assert(getActiveMemberCount(rid) === 1, 'leader auto-joined');
  joinCoopRecruit(rid, H2);
  joinCoopRecruit(rid, H3);
  joinCoopRecruit(rid, H4);
  assert(getActiveMemberCount(rid) === 4, 'max 4 members');
  const fullJoin = joinCoopRecruit(rid, H5);
  assert(fullJoin.includes('定員') || fullJoin.includes('4人'), `full join blocked: ${fullJoin}`);

  const soloStart = startCoopRecruit(rid, LEADER);
  if (soloStart.ok) {
    /* 4人なら開始OK */
  } else {
    assert(false, `4人開始失敗: ${soloStart.message}`);
  }

  cleanupCoop();
  const r2 = createCoopRecruit(GUILD, LEADER, 'valhalla_coop', { monster_id: bossId });
  const rid2 = r2.recruitId!;
  joinCoopRecruit(rid2, H2);
  const leaveMsg = leaveCoopRecruit(rid2, H2);
  assert(leaveMsg.includes('取り消し'), `leave: ${leaveMsg}`);
  const cancelMsg = cancelCoopRecruit(rid2, LEADER);
  assert(cancelMsg.includes('解散'), `cancel: ${cancelMsg}`);

  const buttons = buildCoopRecruitButtons(rid2, { forPublicChannel: true });
  const customIds = buttons.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert(customIds.every((id) => id?.startsWith('coop:')), 'recruit buttons must use coop: prefix');
  assert(!customIds.some((id) => id?.startsWith('facility:') || id?.startsWith('rematch:')), 'no custom_id collision');

  const srcChecks: Array<[string, string[]]> = [
    ['src/interactions/uxHandler.ts', ['valhalla_coop', 'rematch:coop']],
    ['src/index.ts', ['isValhallaCoopBossId']],
    ['src/utils/nextActionButtons.ts', ['coop_valhalla_result', 'flow:valhalla_menu']],
  ];
  for (const [f, needles] of srcChecks) {
    const content = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
    assert(needles.every((n) => content.includes(n)), `${f} missing valhalla coop wiring`);
  }

  assert(VALHALLA_COOP_HP_MULT[1] === 1.0 && VALHALLA_COOP_HP_MULT[4] === 3.1, 'HP mult table');

  if (fails.length) {
    console.error('FAIL');
    for (const f of fails) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log('OK');
  console.log(`- bosses tested: ${VALHALLA_BOSS_MONSTER_IDS.length}`);
  console.log('- locked user join rejected');
  console.log('- 4 player cap / start / leave / cancel');
}

main();
