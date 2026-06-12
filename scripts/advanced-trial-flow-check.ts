/** advanced-trial-flow-check — npx tsx scripts/advanced-trial-flow-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { setStoryFlag } from '../src/systems/storySystem';
import { canStartTrial, changeMainJob, isAdvancedJobUnlocked, recordAdvancedJobTrialVictory } from '../src/systems/jobProgressionSystem';
import { startTrialBattle } from '../src/systems/trialBattleSystem';
import { getJobLevel } from '../src/systems/jobLevelSystem';
import { ADVANCED_JOB_UNLOCK_LEVEL, JOB_TRIO_MAP } from '../src/db/seedData/jobProgressionMaster';
import { writeReport } from './audit/reportWriter';

const TEST_USER = 'advanced-trial-flow-check-user';
const BASE_JOB = '剣士';
const ADVANCED = JOB_TRIO_MAP[BASE_JOB]!.advanced;

function resetUser(db: ReturnType<typeof getDb>) {
  db.prepare('DELETE FROM player_advanced_job_unlocks WHERE user_id = ?').run(TEST_USER);
  db.prepare('DELETE FROM player_job_levels WHERE user_id = ?').run(TEST_USER);
  db.prepare('DELETE FROM battle_sessions WHERE user_id = ?').run(TEST_USER);
  db.prepare('DELETE FROM story_flags WHERE user_id = ?').run(TEST_USER);
  db.prepare('DELETE FROM players WHERE user_id = ?').run(TEST_USER);
}

function ensureUser(db: ReturnType<typeof getDb>) {
  resetUser(db);
  createPlayer(TEST_USER, 'test-guild', 'TrialTest', 'test-channel');
  db.prepare('UPDATE players SET main_job = ? WHERE user_id = ?').run(BASE_JOB, TEST_USER);
  db.prepare(`
    INSERT INTO player_job_levels (user_id, job_name, job_level, job_exp, is_main, is_sub, unlocked_at, updated_at)
    VALUES (?, ?, ?, 0, 1, 0, datetime('now'), datetime('now'))
  `).run(TEST_USER, BASE_JOB, ADVANCED_JOB_UNLOCK_LEVEL - 1);
}

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureUser(db);

  const issues: string[] = [];
  const lines: string[] = [
    '# Advanced Trial Flow Check',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
  ];

  const lowLv = canStartTrial(TEST_USER, BASE_JOB);
  if (lowLv.ok) issues.push('JobLv不足でも試練開始可になっている');
  lines.push(`- JobLv不足: ${lowLv.ok ? 'FAIL (開始可)' : `OK (${lowLv.reason})`}`);

  db.prepare('UPDATE player_job_levels SET job_level = ? WHERE user_id = ? AND job_name = ?')
    .run(ADVANCED_JOB_UNLOCK_LEVEL, TEST_USER, BASE_JOB);
  const noVal = canStartTrial(TEST_USER, BASE_JOB);
  if (noVal.ok) issues.push('Valhalla未解放でも試練開始可になっている');
  lines.push(`- Valhalla未解放: ${noVal.ok ? 'FAIL (開始可)' : `OK (${noVal.reason})`}`);

  setStoryFlag(TEST_USER, 'chapter_completed:ch7_furnace');
  const ready = canStartTrial(TEST_USER, BASE_JOB);
  if (!ready.ok) issues.push(`条件達成でも開始不可: ${ready.reason}`);
  lines.push(`- 条件達成: ${ready.ok ? 'OK (開始可)' : `FAIL (${ready.reason})`}`);

  const start = startTrialBattle(TEST_USER, BASE_JOB);
  if (!start.ok || !start.battleId) issues.push(`試練開始失敗: ${start.message}`);
  lines.push(`- startTrialBattle: ${start.ok ? `OK (${start.battleId})` : `FAIL (${start.message})`}`);

  db.prepare('UPDATE battle_sessions SET status = ? WHERE user_id = ?').run('victory', TEST_USER);
  const victoryMsg = recordAdvancedJobTrialVictory(TEST_USER, BASE_JOB);
  const unlockRow = db.prepare(`
    SELECT trial_cleared_at FROM player_advanced_job_unlocks
    WHERE user_id = ? AND advanced_job = ?
  `).get(TEST_USER, ADVANCED) as { trial_cleared_at: string | null } | undefined;
  if (!unlockRow?.trial_cleared_at) issues.push('勝利後 player_advanced_job_unlocks に記録されていない');
  lines.push(`- 勝利記録: ${unlockRow?.trial_cleared_at ? 'OK' : 'FAIL'}`);
  lines.push(`  - message: ${victoryMsg}`);

  const baseLv = getJobLevel(TEST_USER, BASE_JOB)?.job_level ?? 0;
  const advLv = getJobLevel(TEST_USER, ADVANCED)?.job_level ?? 0;
  if (advLv < baseLv) issues.push(`上級職JobLv(${advLv})が基本職(${baseLv})を引き継いでいない`);
  lines.push(`- JobLv引き継ぎ: base=${baseLv} advanced=${advLv} → ${advLv >= baseLv ? 'OK' : 'FAIL'}`);

  const mainChange = changeMainJob(TEST_USER, ADVANCED);
  const player = getPlayer(TEST_USER);
  if (player?.main_job !== ADVANCED) issues.push(`解放済み上級職をメインにできない: ${mainChange}`);
  lines.push(`- メイン選択: ${player?.main_job === ADVANCED ? 'OK' : `FAIL (${mainChange})`}`);

  const retry = canStartTrial(TEST_USER, BASE_JOB);
  if (retry.ok) issues.push('解放済み上級職で再挑戦可になっている');
  lines.push(`- 解放後再挑戦不可: ${retry.ok ? 'FAIL' : `OK (${retry.reason})`}`);

  lines.push('', '## Summary', issues.length ? `FAIL (${issues.length} issues)` : 'PASS', '');
  if (issues.length) {
    lines.push('### Issues');
    for (const i of issues) lines.push(`- ${i}`);
  }

  const path = writeReport('advanced-trial-flow-check.md', lines.join('\n'));
  console.log(`Report: ${path}`);
  if (issues.length) {
    console.error(`FAIL: ${issues.length} issue(s)`);
    process.exit(1);
  }
  console.log('PASS');
}

main();
