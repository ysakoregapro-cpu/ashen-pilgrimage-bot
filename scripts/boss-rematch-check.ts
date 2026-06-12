/** boss-rematch-check — npx tsx scripts/boss-rematch-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { STORY_BOSS_MONSTERS, MONSTER_TO_STORY_BOSS, BOSS_CHAPTER_REWARDS } from '../src/db/seedData/storyData';
import { REMATCH_MATERIAL_BOSSES, UNI_FORGE_DROP_RATE, MAT_STARFALL_OBSIDIAN, MAT_BLACK_LANTERN_CINDER, UNI_FORGE_MATERIAL_IDS, SRC_FORGE_MATERIAL_ID } from '../src/db/seedData/forgeMaster';
import { REMATCH_LOOT_TABLE, EQUIP_SLOT_WEIGHTS } from '../src/systems/equipmentDropSystem';
import { hasDefeatedMonster, getRematchableBosses, canStartBossRematch } from '../src/systems/bossRematchSystem';
import { triggerBossDefeated } from '../src/systems/storySystem';

const TEST_USER = 'boss-rematch-check-user';

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);

  const issues: string[] = [];

  const starMat = db.prepare('SELECT id FROM items WHERE id = ?').get(MAT_STARFALL_OBSIDIAN);
  const lanternMat = db.prepare('SELECT id FROM items WHERE id = ?').get(MAT_BLACK_LANTERN_CINDER);
  if (!starMat) issues.push('星見の残光 未seed');
  if (!lanternMat) issues.push('黒灯の残滓 未seed');

  if (UNI_FORGE_DROP_RATE !== 0.10) {
    issues.push(`Uni素材ドロップ率 ${UNI_FORGE_DROP_RATE} (expected 0.10)`);
  }

  if (UNI_FORGE_MATERIAL_IDS.length !== 2) issues.push('Uni専用素材が2種類でない');
  if (REMATCH_MATERIAL_BOSSES[MAT_STARFALL_OBSIDIAN]?.monsterId !== 'mon_moon_observer') {
    issues.push('星見の残光ボス不一致');
  }
  if (REMATCH_MATERIAL_BOSSES[MAT_BLACK_LANTERN_CINDER]?.monsterId !== 'mon_black_lantern_wraith') {
    issues.push('黒灯の残滓ボス不一致');
  }

  const rematchSum = REMATCH_LOOT_TABLE.reduce((a, e) => a + e.weight, 0);
  if (rematchSum !== 100) issues.push(`再戦loot weight sum=${rematchSum}`);
  if (EQUIP_SLOT_WEIGHTS.weapon !== 35) issues.push('部位抽選武器35%でない');

  const cinderInArea = db.prepare(`
    SELECT COUNT(*) c FROM exploration_areas WHERE reward_pool_json LIKE ?
  `).get(`%${MAT_BLACK_LANTERN_CINDER}%`) as { c: number };
  if (cinderInArea.c > 0) issues.push('黒灯の残滓が探索報酬に残存');

  const srcUsesUniMat = db.prepare(`
    SELECT COUNT(*) c FROM src_weapons WHERE manifest_requirements_json LIKE ? OR manifest_requirements_json LIKE ?
  `).get(`%${MAT_STARFALL_OBSIDIAN}%`, `%${MAT_BLACK_LANTERN_CINDER}%`) as { c: number };
  if (srcUsesUniMat.c > 0) issues.push('Src化がUni専用素材を使用');

  for (const cfg of Object.values(REMATCH_MATERIAL_BOSSES)) {
    const mon = db.prepare('SELECT id FROM monsters WHERE id = ?').get(cfg.monsterId);
    if (!mon) issues.push(`素材ボス未存在: ${cfg.monsterId}`);
  }

  for (const [bossKey, monsterId] of Object.entries(STORY_BOSS_MONSTERS)) {
    if (!MONSTER_TO_STORY_BOSS[monsterId]) issues.push(`MONSTER_TO_STORY_BOSS missing ${monsterId}`);
    if (!BOSS_CHAPTER_REWARDS[bossKey]) issues.push(`BOSS_CHAPTER_REWARDS missing ${bossKey}`);
  }

  db.prepare('DELETE FROM boss_defeat_flags WHERE user_id = ?').run(TEST_USER);
  db.prepare('DELETE FROM story_flags WHERE user_id = ? AND flag LIKE ?').run(TEST_USER, 'boss_defeated:%');
  db.prepare('DELETE FROM battle_sessions WHERE user_id = ?').run(TEST_USER);

  const firstBoss = STORY_BOSS_MONSTERS.boss_starfield_anomaly!;
  db.prepare(`
    INSERT INTO battle_sessions (id, user_id, monster_id, player_hp, player_mp, enemy_hp, status_json, is_boss, status, created_at, updated_at)
    VALUES ('test-first', ?, ?, 100, 50, 0, '{}', 1, 'victory', datetime('now'), datetime('now'))
  `).run(TEST_USER, firstBoss);

  if (!hasDefeatedMonster(TEST_USER, firstBoss)) issues.push('初回討伐検出失敗');
  const beforeRematch = canStartBossRematch(TEST_USER, firstBoss);
  if (!beforeRematch.ok) issues.push(`初回後再戦不可: ${beforeRematch.reason}`);

  triggerBossDefeated(TEST_USER, firstBoss);
  const flag = db.prepare('SELECT 1 FROM boss_defeat_flags WHERE user_id = ? AND boss_id = ?').get(TEST_USER, 'boss_starfield_anomaly');
  if (!flag) issues.push('初回討伐で章フラグ未設定');

  const repeatPayloads = triggerBossDefeated(TEST_USER, firstBoss);
  if (repeatPayloads.length) issues.push('再戦相当でストーリーイベント再配布');

  const rematchList = getRematchableBosses(TEST_USER);
  if (!rematchList.some((b) => b.monsterId === firstBoss)) issues.push('ストーリーボスが再戦リストにない');

  console.log('boss-rematch-check');
  if (issues.length) {
    console.error('FAIL');
    for (const i of issues) console.error(' -', i);
    process.exit(1);
  }
  console.log('OK — materials, rematch gate, story idempotency');
}

main();
