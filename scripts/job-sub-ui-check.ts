/** job-sub-ui-check — npx tsx scripts/job-sub-ui-check.ts */
import fs from 'fs';
import path from 'path';
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { selectSubJob } from '../src/systems/jobSystem';
import { getSelectableSubJobs } from '../src/systems/jobProgressionSystem';
import { LEGACY_ADVANCED_JOBS, PHASE2_SUB_JOBS } from '../src/db/seedData/jobMultiplierMaster';
import { SUB_JOB_UNLOCK_LEVEL, JOB_TRIO_MAP } from '../src/db/seedData/jobProgressionMaster';
import { writeReport } from './audit/reportWriter';

const TEST_USER = 'job-sub-ui-check-user';

function resetUser(db: ReturnType<typeof getDb>) {
  db.prepare('DELETE FROM player_sub_job_unlocks WHERE user_id = ?').run(TEST_USER);
  db.prepare('DELETE FROM player_job_levels WHERE user_id = ?').run(TEST_USER);
  db.prepare('DELETE FROM players WHERE user_id = ?').run(TEST_USER);
}

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  resetUser(db);
  createPlayer(TEST_USER, 'g', 'SubTest', 'ch');
  db.prepare('UPDATE players SET main_job = ?, sub_job = ? WHERE user_id = ?').run('剣士', '剣豪', TEST_USER);

  const issues: string[] = [];
  const jobTs = fs.readFileSync(path.join(process.cwd(), 'src/commands/job.ts'), 'utf8');

  if (jobTs.includes("getJobs('advanced')")) {
    issues.push('/job sub still references getJobs(advanced)');
  }
  if (!jobTs.includes('getSelectableSubJobs')) {
    issues.push('/job sub does not use getSelectableSubJobs()');
  }
  if (!jobTs.includes('PHASE2_SUB_JOBS')) {
    issues.push('/job sub does not filter PHASE2_SUB_JOBS');
  }
  if (!jobTs.includes('formatLegacyJobWarning') && !jobTs.includes('isLegacyJob')) {
    issues.push('/job sub missing legacy sub warning');
  }

  for (const legacy of LEGACY_ADVANCED_JOBS) {
    if (PHASE2_SUB_JOBS.includes(legacy)) issues.push(`Legacy job in PHASE2_SUB_JOBS: ${legacy}`);
  }
  if (PHASE2_SUB_JOBS.length !== 9) issues.push(`PHASE2_SUB_JOBS count=${PHASE2_SUB_JOBS.length} (expected 9)`);

  const expectedSubs = Object.values(JOB_TRIO_MAP).map((t) => t.sub);
  for (const sub of expectedSubs) {
    if (!PHASE2_SUB_JOBS.includes(sub)) issues.push(`Missing sub in PHASE2_SUB_JOBS: ${sub}`);
  }

  db.prepare(`
    INSERT INTO player_job_levels (user_id, job_name, job_level, job_exp, is_main, is_sub, unlocked_at, updated_at)
    VALUES (?, '剣士', ?, 0, 1, 0, datetime('now'), datetime('now'))
  `).run(TEST_USER, SUB_JOB_UNLOCK_LEVEL);
  db.prepare(`
    INSERT OR IGNORE INTO player_sub_job_unlocks (user_id, sub_job, unlocked_at, unlock_source)
    VALUES (?, '刃走り', datetime('now'), 'test')
  `).run(TEST_USER);

  const subs = getSelectableSubJobs(TEST_USER);
  for (const s of subs) {
    if (!PHASE2_SUB_JOBS.includes(s.name)) issues.push(`getSelectableSubJobs returned non-Phase2: ${s.name}`);
  }
  const unlocked = subs.filter((s) => !s.locked);
  if (!unlocked.some((s) => s.name === '刃走り')) issues.push('Unlocked 刃走り not in selectable list');

  const playerBefore = getPlayer(TEST_USER);
  if (playerBefore?.sub_job !== '剣豪') issues.push('Legacy sub not preserved before change');

  const msg = selectSubJob(TEST_USER, '刃走り');
  const playerAfter = getPlayer(TEST_USER);
  if (playerAfter?.sub_job !== '刃走り') issues.push(`selectSubJob failed: ${msg}`);
  if (!msg.includes('刃走り')) issues.push(`Unexpected selectSubJob message: ${msg}`);

  const lockedOnly = getSelectableSubJobs(TEST_USER).filter((s) => s.locked);
  if (lockedOnly.length !== 8) issues.push(`Expected 8 locked subs after one unlock, got ${lockedOnly.length}`);

  const lines = [
    '# Job Sub UI Check',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `- /job sub uses getSelectableSubJobs: ${jobTs.includes('getSelectableSubJobs') ? 'OK' : 'FAIL'}`,
    `- Old advanced excluded from source: ${!jobTs.includes("getJobs('advanced')") ? 'OK' : 'FAIL'}`,
    `- PHASE2 sub count: ${PHASE2_SUB_JOBS.length}`,
    `- Legacy sub preserved then changed: ${playerBefore?.sub_job === '剣豪' && playerAfter?.sub_job === '刃走り' ? 'OK' : 'FAIL'}`,
    '',
    '## Phase2 sub jobs',
    PHASE2_SUB_JOBS.join(', '),
    '',
    '## Summary',
    issues.length ? `FAIL (${issues.length})` : 'PASS',
  ];
  if (issues.length) {
    lines.push('', '### Issues');
    for (const i of issues) lines.push(`- ${i}`);
  }

  writeReport('job-sub-ui-check.md', lines.join('\n'));
  if (issues.length) {
    console.error(`FAIL: ${issues.length} issue(s)`);
    process.exit(1);
  }
  console.log('PASS');
}

main();
