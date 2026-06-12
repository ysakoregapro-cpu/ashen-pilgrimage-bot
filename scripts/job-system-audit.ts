/** job-system-audit — npx tsx scripts/job-system-audit.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { writeReport, mdTable } from './audit/reportWriter';

function main() {
  ensureMaterialsSeed(getDb());
  ensurePhase2Seed(getDb());
  const db = getDb();

  const jobs = db.prepare('SELECT id, name, tier, unlock_condition FROM jobs ORDER BY tier, name').all() as Array<{
    id: string; name: string; tier: string; unlock_condition: string | null;
  }>;
  const tierCounts: Record<string, number> = {};
  for (const j of jobs) tierCounts[j.tier] = (tierCounts[j.tier] ?? 0) + 1;

  const basic = jobs.filter((j) => j.tier === 'basic').map((j) => j.name);
  const advanced = jobs.filter((j) => j.tier === 'advanced').map((j) => j.name);
  const hidden = jobs.filter((j) => j.tier === 'hidden').map((j) => j.name);

  const jobLevelCols = db.prepare('PRAGMA table_info(player_job_levels)').all() as Array<{ name: string }>;
  const playerSample = db.prepare(`
    SELECT main_job, sub_job, COUNT(*) c FROM players GROUP BY main_job, sub_job ORDER BY c DESC LIMIT 10
  `).all() as Array<{ main_job: string; sub_job: string | null; c: number }>;

  const jobLevelRows = db.prepare('SELECT COUNT(*) c FROM player_job_levels').get() as { c: number };

  const lines: string[] = [
    '# Job System Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `- Total jobs: ${jobs.length}`,
    `- Tier counts: ${JSON.stringify(tierCounts)}`,
    `- player_job_levels rows: ${jobLevelRows.c}`,
    '',
    '## Basic Jobs (8)',
    basic.join(', '),
    '',
    '## Advanced Jobs (16)',
    advanced.join(', '),
    '',
    '## Hidden Jobs (8)',
    hidden.join(', '),
    '',
    '## player_job_levels columns',
    jobLevelCols.map((c) => c.name).join(', '),
    '',
    '## Current sub job unlock',
    '- `selectSubJob()` requires player.level >= 20',
    '- Allows any `advanced` tier job from jobs table',
    '- No per-main-job pairing; no `player_sub_job_unlocks` table',
    '- `initSubJobLevel()` creates row on first sub EXP',
    '',
    '## Main job change',
    '- `selectMainJob()` only when main_job === 未選択 (one-time)',
    '',
    '## Player job distribution (top 10)',
    mdTable(['main_job', 'sub_job', 'count'], playerSample.map((r) => [r.main_job, r.sub_job ?? '—', String(r.c)])),
    '',
    '## Phase2 migration candidates (proposal only)',
    '- `player_sub_job_unlocks(user_id, sub_job_id, unlocked_at)` — Lv20 per-main unlock',
    '- `player_advanced_job_unlocks(user_id, advanced_job_id, unlocked_at, trial_cleared_at)` — Lv70 + trial',
    '- `jobs` columns: stat_mult_hp/mp/attack/magic/defense/speed OR external mult table',
    '- `paired_sub_job_id`, `paired_advanced_job_id`, `base_job_id` on jobs',
    '- 巡礼者 seed + tier `pilgrim` or basic',
    '',
    '## Existing advanced/hidden conflict notes',
    '- Advanced 16 jobs overlap with Phase2「上級メイン9職」names (e.g. 剣豪 vs 黄昏剣聖)',
    '- Hidden includes 繋ぎ手 — Phase2 sub job same name',
    '- Safest Phase2 path: new job rows OR remap advanced tier to legacy + hide from /job sub menu',
    '',
    '## Phase2 proposals (not implemented)',
    '- player_sub_job_unlocks: **recommended**',
    '- player_advanced_job_unlocks: **recommended**',
    '- jobs multiplier columns: **recommended** (alternative: code-only mult table in seed)',
    '- Keep legacy 16 advanced as hidden/deprecated until migration mapping defined',
  ];

  writeReport('job-system-audit.md', lines.join('\n'));
  console.log('✅ job-system-audit → reports/job-system-audit.md');
}

main();
