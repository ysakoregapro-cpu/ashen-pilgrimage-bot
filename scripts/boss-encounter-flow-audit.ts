/** boss-encounter-flow-audit — npx tsx scripts/boss-encounter-flow-audit.ts */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import {
  EXPLORE_ONCE_BOSS_IDS,
  filterExplorationMonsterPool,
  formatBossBattleEmbedTitle,
  formatBossEnemyFieldName,
  getBossEncounterAuditRows,
  shouldStartExploreAsBossBattle,
} from '../src/systems/bossEncounterSystem';
import { getRematchableBosses, hasDefeatedMonster } from '../src/systems/bossRematchSystem';
import { buildBattleReply } from '../src/systems/battleSystem';
import { createBattle } from '../src/systems/battleSystem';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

const TEST_USER = 'boss-encounter-flow-audit-user';
const HEADERS = [
  'boss_id', 'boss_name', 'area_id', 'first_encounter_source', 'appears_in_exploration_before_clear',
  'appears_in_exploration_after_clear', 'rematch_available_after_clear', 'first_clear_flag',
  'rematch_reward_type', 'boss_ui_label', 'balance_note',
];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);
  if (!getPlayer(TEST_USER)) {
    createPlayer(TEST_USER, 'guild-boss-flow', 'BossFlow', 'ch-boss-flow');
  }

  const rows = getBossEncounterAuditRows();
  const issues: string[] = [];

  if (EXPLORE_ONCE_BOSS_IDS.size < 9) {
    issues.push(`EXPLORE_ONCE_BOSS_IDS too small: ${EXPLORE_ONCE_BOSS_IDS.size}`);
  }

  const area = db.prepare(`
    SELECT id, monster_pool_json FROM exploration_areas WHERE id = 'area_iron_supply'
  `).get() as { id: string; monster_pool_json: string };
  const pool = JSON.parse(area.monster_pool_json) as Array<{ monster_id: string; weight: number }>;
  if (!pool.some((p) => p.monster_id === 'mon_furnace_keeper')) {
    issues.push('furnace keeper missing from area_iron_supply pool');
  }
  if (!shouldStartExploreAsBossBattle(TEST_USER, 'mon_furnace_keeper')) {
    issues.push('undefeated furnace keeper should be explore boss');
  }
  const filteredUndefeated = filterExplorationMonsterPool(TEST_USER, pool);
  if (!filteredUndefeated.some((p) => p.monster_id === 'mon_furnace_keeper')) {
    issues.push('undefeated furnace keeper filtered out incorrectly');
  }

  db.prepare(`
    INSERT INTO battle_sessions (id, user_id, area_id, monster_id, player_hp, player_mp, enemy_hp, enemy_break, status_json, is_boss, is_raid, is_event_battle, can_flee, status, created_at, updated_at)
    VALUES ('audit-furnace-win', ?, 'area_iron_supply', 'mon_furnace_keeper', 100, 50, 0, 0, '{}', 1, 0, 0, 0, 'victory', datetime('now'), datetime('now'))
  `).run(TEST_USER);

  if (shouldStartExploreAsBossBattle(TEST_USER, 'mon_furnace_keeper')) {
    issues.push('defeated furnace keeper still flagged as explore boss');
  }
  const filteredDefeated = filterExplorationMonsterPool(TEST_USER, pool);
  if (filteredDefeated.some((p) => p.monster_id === 'mon_furnace_keeper')) {
    issues.push('defeated furnace keeper still in explore pool');
  }
  const rematch = getRematchableBosses(TEST_USER);
  if (!rematch.some((b) => b.monsterId === 'mon_furnace_keeper')) {
    issues.push('defeated furnace keeper not in rematch menu');
  }
  if (getRematchableBosses(TEST_USER).some((b) => !hasDefeatedMonster(TEST_USER, b.monsterId))) {
    issues.push('undefeated boss in rematch menu');
  }

  const battleId = createBattle(TEST_USER, 'mon_star_slime', 'area_star_outskirts');
  const normalReply = buildBattleReply(battleId, TEST_USER);
  const normalEmbed = normalReply?.embeds[0]?.data;
  if (normalEmbed?.title?.includes('BOSS')) issues.push('normal mob has BOSS in title');
  const enemyField = normalEmbed?.fields?.find((f) => f.name?.includes('BOSS'));
  if (enemyField) issues.push('normal mob has BOSS field prefix');

  if (formatBossBattleEmbedTitle(true, false) !== 'ボス戦') issues.push('boss embed title wrong');
  if (formatBossEnemyFieldName('炉熱の番人', true) !== 'BOSS: 炉熱の番人') issues.push('boss field name wrong');
  if (formatBossEnemyFieldName('星屑スライム', false) !== '星屑スライム') issues.push('mob field name wrong');

  const md = [
    '# Boss Encounter Flow Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Bosses tracked: ${rows.length}`,
    issues.length ? `Issues: ${issues.length}` : 'Runtime checks: PASS',
    '',
    mdTable(HEADERS, rows),
  ].join('\n');

  writeReport('boss-encounter-flow-audit.md', md);
  writeCsv('boss-encounter-flow-audit.csv', HEADERS, rows);
  console.log(`✅ boss-encounter-flow-audit → ${rows.length} bosses, ${issues.length} issues`);
  if (issues.length) {
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
}

main();
