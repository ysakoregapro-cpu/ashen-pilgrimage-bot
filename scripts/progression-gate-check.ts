/** progression-gate-check — npx tsx scripts/progression-gate-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import {
  BOSS_CHAPTER_REWARDS, STORY_BOSS_MONSTERS, MONSTER_TO_STORY_BOSS,
} from '../src/db/seedData/storyData';
import { STORY_TOWN_UNLOCKS } from '../src/db/seedData/progressionMaster';
import {
  CHAPTER_BOSS_FLAGS, TOWN_UNLOCK_BOSS_FLAGS, canAdvanceWithoutBoss, canEnterValhalla,
} from '../src/systems/progressionGates';
import { triggerBossDefeated } from '../src/systems/storySystem';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { backfillSinglePlayerProgression } from '../src/db/seedData/existingPlayerProgressionBackfill';
import { addItem } from '../src/systems/inventorySystem';

const TEST_USER = 'progression-gate-check-user';

function ensureTestPlayer(userId: string) {
  if (!getPlayer(userId)) {
    createPlayer(userId, 'test-guild', 'Test', 'test-channel');
  }
}

function clearProgression(userId: string) {
  const db = getDb();
  db.prepare('DELETE FROM story_flags WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM boss_defeat_flags WHERE user_id = ?').run(userId);
  db.prepare(`
    DELETE FROM player_town_unlocks WHERE user_id = ? AND town_id NOT IN ('start_starfield', 'old_road_village')
  `).run(userId);
}

function hasStoryFlag(userId: string, flag: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM story_flags WHERE user_id = ? AND flag = ? AND value = ?').get(userId, flag, '1');
}

function hasTownUnlock(userId: string, townId: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM player_town_unlocks WHERE user_id = ? AND town_id = ?').get(userId, townId);
}

function hasBossDefeatRow(userId: string, bossKey: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM boss_defeat_flags WHERE user_id = ? AND boss_id = ?').get(userId, bossKey);
}

function playerGold(userId: string): number {
  return (getDb().prepare('SELECT gold FROM players WHERE user_id = ?').get(userId) as { gold: number }).gold;
}

function inventoryCount(userId: string): number {
  return (getDb().prepare('SELECT COUNT(*) AS c FROM player_inventory WHERE user_id = ?').get(userId) as { c: number }).c;
}

function setCurrentTown(userId: string, townId: string) {
  getDb().prepare('UPDATE players SET current_town_id = ? WHERE user_id = ?').run(townId, userId);
}

function runStructuralChecks(issues: string[]) {
  for (const [bossKey, rewards] of Object.entries(BOSS_CHAPTER_REWARDS)) {
    if (!STORY_BOSS_MONSTERS[bossKey]) issues.push(`STORY_BOSS_MONSTERS missing ${bossKey}`);
    if (!CHAPTER_BOSS_FLAGS[rewards.chapterFlag]) {
      issues.push(`CHAPTER_BOSS_FLAGS missing ${rewards.chapterFlag}`);
    }
    if (rewards.unlockTown && TOWN_UNLOCK_BOSS_FLAGS[rewards.unlockTown] !== `boss_defeated:${bossKey}`) {
      issues.push(`町 ${rewards.unlockTown} のボス要件不一致`);
    }
  }
  for (const [flag] of Object.entries(STORY_TOWN_UNLOCKS)) {
    if (flag.startsWith('chapter_completed:') && !CHAPTER_BOSS_FLAGS[flag]) {
      issues.push(`章 ${flag} にボス要件なし`);
    }
  }
  for (const monsterId of Object.values(STORY_BOSS_MONSTERS)) {
    if (!MONSTER_TO_STORY_BOSS[monsterId]) issues.push(`MONSTER_TO_STORY_BOSS missing ${monsterId}`);
  }
}

function runBackfillCase1(issues: string[]) {
  const uid = 'pgc-case1-moon-library';
  ensureTestPlayer(uid);
  clearProgression(uid);
  setCurrentTown(uid, 'moon_library');
  const goldBefore = playerGold(uid);
  const invBefore = inventoryCount(uid);
  backfillSinglePlayerProgression(getDb(), uid);

  const chapters = ['chapter_completed:prologue', 'chapter_completed:ch1_twilight', 'chapter_completed:ch2_silver', 'chapter_completed:ch3_mist'];
  const bosses = ['boss_starfield_anomaly', 'boss_lamp_eater', 'boss_furnace_remains', 'boss_lost_guardian'];
  for (const c of chapters) if (!hasStoryFlag(uid, c)) issues.push(`case1: ${c} 未補完`);
  for (const b of bosses) {
    if (!hasStoryFlag(uid, `boss_defeated:${b}`)) issues.push(`case1: boss_defeated:${b} 未補完`);
    if (!hasBossDefeatRow(uid, b)) issues.push(`case1: boss_defeat_flags ${b} 未補完`);
  }
  if (!hasTownUnlock(uid, 'moon_library')) issues.push('case1: moon_library unlock 未補完');
  if (playerGold(uid) !== goldBefore) issues.push('case1: ゴールドが増減');
  if (inventoryCount(uid) !== invBefore) issues.push('case1: 所持品数が増減');
}

function runBackfillCase2(issues: string[]) {
  const uid = 'pgc-case2-forgotten-unlock';
  ensureTestPlayer(uid);
  clearProgression(uid);
  getDb().prepare(`INSERT OR IGNORE INTO player_town_unlocks (user_id, town_id, unlocked_at) VALUES (?, 'forgotten_market', datetime('now'))`).run(uid);
  backfillSinglePlayerProgression(getDb(), uid);

  const chapters = [
    'chapter_completed:prologue', 'chapter_completed:ch1_twilight', 'chapter_completed:ch2_silver',
    'chapter_completed:ch3_mist', 'chapter_completed:ch4_library',
  ];
  for (const c of chapters) if (!hasStoryFlag(uid, c)) issues.push(`case2: ${c} 未補完`);
  if (!hasStoryFlag(uid, 'boss_defeated:boss_page_shadow')) issues.push('case2: boss_page_shadow 未補完');
}

function runBackfillCase3(issues: string[]) {
  const uid = 'pgc-case3-ch5-only';
  ensureTestPlayer(uid);
  clearProgression(uid);
  getDb().prepare(`
    INSERT OR IGNORE INTO story_flags (user_id, flag, value, created_at, updated_at)
    VALUES (?, 'chapter_completed:ch5_market', '1', datetime('now'), datetime('now'))
  `).run(uid);
  backfillSinglePlayerProgression(getDb(), uid);

  if (!hasTownUnlock(uid, 'hourglass_city')) issues.push('case3: hourglass_city unlock 未補完');
  if (!hasStoryFlag(uid, 'boss_defeated:boss_forget_seller')) issues.push('case3: boss_forget_seller 未補完');
  if (!hasStoryFlag(uid, 'chapter_completed:ch4_library')) issues.push('case3: 先行章未補完');
}

function runBackfillCase4(issues: string[]) {
  const uid = 'pgc-case4-boss-table-only';
  ensureTestPlayer(uid);
  clearProgression(uid);
  getDb().prepare(`
    INSERT OR IGNORE INTO boss_defeat_flags (user_id, boss_id, defeated_at) VALUES (?, 'boss_furnace_remains', datetime('now'))
  `).run(uid);
  backfillSinglePlayerProgression(getDb(), uid);

  if (!hasStoryFlag(uid, 'boss_defeated:boss_furnace_remains')) issues.push('case4: story boss_defeated 未補完');
  if (!hasStoryFlag(uid, 'chapter_completed:ch2_silver')) issues.push('case4: chapter ch2 未補完');
  if (!hasTownUnlock(uid, 'mist_forest')) issues.push('case4: mist_forest unlock 未補完');
}

function runBackfillCase5(issues: string[]) {
  const uid = 'pgc-case5-valhalla';
  ensureTestPlayer(uid);
  clearProgression(uid);
  setCurrentTown(uid, 'valhalla_fortress');
  getDb().prepare(`
    INSERT OR IGNORE INTO story_flags (user_id, flag, value, created_at, updated_at)
    VALUES (?, 'valhalla_unlocked', '1', datetime('now'), datetime('now'))
  `).run(uid);
  addItem(uid, 'wpn_src_mist_lantern', 1);
  getDb().prepare('UPDATE players SET level = 80 WHERE user_id = ?').run(uid);
  backfillSinglePlayerProgression(getDb(), uid);

  if (!hasStoryFlag(uid, 'boss_defeated:boss_old_furnace_keeper')) issues.push('case5: furnace keeper 未補完');
  if (!hasStoryFlag(uid, 'chapter_completed:ch7_furnace')) issues.push('case5: ch7_furnace 未補完');
  if (!hasBossDefeatRow(uid, 'boss_old_furnace_keeper')) issues.push('case5: boss_defeat_flags furnace 未補完');
  const vh = canEnterValhalla(uid);
  if (!vh.ok) issues.push(`case5: canEnterValhalla 不可 (${vh.reason})`);
}

function runBackfillCase6(issues: string[]) {
  const uid = 'pgc-case6-new-user';
  ensureTestPlayer(uid);
  clearProgression(uid);
  backfillSinglePlayerProgression(getDb(), uid);

  const extraCh = getDb().prepare(`
    SELECT flag FROM story_flags WHERE user_id = ? AND flag LIKE 'chapter_completed:%'
  `).all(uid) as Array<{ flag: string }>;
  if (extraCh.length) issues.push(`case6: 新規ユーザーに chapter_completed が付与 (${extraCh.map((f) => f.flag).join(', ')})`);
  const extraBoss = getDb().prepare(`
    SELECT flag FROM story_flags WHERE user_id = ? AND flag LIKE 'boss_defeated:%'
  `).all(uid) as Array<{ flag: string }>;
  if (extraBoss.length) issues.push('case6: 新規ユーザーに boss_defeated が付与');
  const extraTowns = getDb().prepare(`
    SELECT town_id FROM player_town_unlocks WHERE user_id = ? AND town_id NOT IN ('start_starfield', 'old_road_village')
  `).all(uid) as Array<{ town_id: string }>;
  if (extraTowns.length) issues.push(`case6: 新規ユーザーに追加町unlock (${extraTowns.map((t) => t.town_id).join(', ')})`);
}

function main() {
  const db = getDb();
  ensurePhase2Seed(db);
  const issues: string[] = [];

  runStructuralChecks(issues);

  ensureTestPlayer(TEST_USER);
  db.prepare('DELETE FROM story_flags WHERE user_id = ?').run(TEST_USER);
  db.prepare('DELETE FROM boss_defeat_flags WHERE user_id = ?').run(TEST_USER);
  db.prepare('DELETE FROM player_town_unlocks WHERE user_id = ?').run(TEST_USER);

  const blocked = canAdvanceWithoutBoss(TEST_USER, 'twilight_port');
  if (blocked.ok) issues.push('ボス未討伐で twilight_port 進行可');

  const firstBossMonster = STORY_BOSS_MONSTERS.boss_starfield_anomaly!;
  triggerBossDefeated(TEST_USER, firstBossMonster);
  if (!hasTownUnlock(TEST_USER, 'twilight_port')) issues.push('初回ボス討伐で twilight_port 未解放');
  if (!hasStoryFlag(TEST_USER, 'chapter_completed:prologue')) issues.push('初回ボス討伐で chapter_completed 未設定');
  const repeat = triggerBossDefeated(TEST_USER, firstBossMonster);
  if (repeat.length) issues.push('再討伐相当でストーリーイベント再配布');

  runBackfillCase1(issues);
  runBackfillCase2(issues);
  runBackfillCase3(issues);
  runBackfillCase4(issues);
  runBackfillCase5(issues);
  runBackfillCase6(issues);

  console.log('progression-gate-check');
  if (issues.length) {
    console.error('FAIL');
    for (const i of issues) console.error(' -', i);
    process.exit(1);
  }
  console.log('OK — 章ボス必須導線、既存プレイヤー補完6ケース、初回/再戦分離');
}

main();
