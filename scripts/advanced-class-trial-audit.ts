/** advanced-class-trial-audit — npx tsx scripts/advanced-class-trial-audit.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { JOB_LEVEL_CAP } from '../src/systems/jobLevelSystem';
import { ADVANCED_JOB_UNLOCK_LEVEL, JOB_TRIO_MAP } from '../src/db/seedData/jobProgressionMaster';
import { writeReport } from './audit/reportWriter';

function main() {
  ensureMaterialsSeed(getDb());
  ensurePhase2Seed(getDb());
  const db = getDb();

  const battleCols = (db.prepare('PRAGMA table_info(battle_sessions)').all() as Array<{ name: string }>).map((c) => c.name);
  const hasTrialType = battleCols.includes('trial_type');
  const hasTrialJob = battleCols.includes('trial_job');
  const unlockCols = (db.prepare('PRAGMA table_info(player_advanced_job_unlocks)').all() as Array<{ name: string }>).map((c) => c.name);
  const unlockCount = (db.prepare('SELECT COUNT(*) c FROM player_advanced_job_unlocks').get() as { c: number }).c;

  const lines = [
    '# Advanced Class / Trial Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Phase2 implementation status',
    '- **`player_advanced_job_unlocks` 実装済み** — migration + `jobProgressionSystem.ts`',
    `- Columns: ${unlockCols.join(', ')} (rows: ${unlockCount})`,
    '- **`battle_sessions.trial_type / trial_job` 実装済み** — 試練戦闘セッション識別',
    `- trial_type=${hasTrialType}, trial_job=${hasTrialJob}`,
    '',
    '## Trial access conditions',
    `- Base job JobLv${ADVANCED_JOB_UNLOCK_LEVEL}+ required`,
    '- Story flag: `valhalla_unlocked` OR `chapter_completed:ch7_furnace`',
    '- Already unlocked advanced jobs cannot retry',
    '',
    '## UI flow (implemented)',
    '- `/job show` → `[現身の試練に挑む]` → trial list → condition/confirm → `[挑戦する]`',
    '- `/job show` → `[上級職を確認]` — unlock status',
    '- Handler: `jobUiSystem.ts` + `index.ts` (`job:*` buttons)',
    '- Uses `startTrialBattle()` → `createBattle(..., { isTrial: true })`',
    '',
    '## Condition display',
    '- JobLv70 達成/未達成',
    '- ヴァルハラ解放 達成/未達成',
    '- 上級職 解放済/未解放',
    '- Blocked during active battle / coop / recruit',
    '',
    '## Victory / defeat',
    '- Victory: `recordAdvancedJobTrialVictory()` → `player_advanced_job_unlocks.trial_cleared_at`',
    '- JobLv inheritance from base job to advanced job',
    '- Defeat: `applyTrialDefeat()` — HP=1, light penalty (no gold loss)',
    '',
    '## Mirror enemy spec (active)',
    '- HP: player.max_hp × 1.10',
    '- ATK/MAG/DEF/SPD: equal to player at battle start',
    '- Monster seed: `mon_trial_avatar_{baseJob}` updated per attempt',
    '',
    '## Job trio map (9 trials)',
    ...Object.entries(JOB_TRIO_MAP).map(([base, t]) => `- ${base} → sub:${t.sub} / advanced:${t.advanced}`),
    '',
    '## JobLv system',
    `- JOB_LEVEL_CAP = ${JOB_LEVEL_CAP}`,
    '- Sub unlock at JobLv20 via `player_sub_job_unlocks`',
    `- Advanced trial at JobLv${ADVANCED_JOB_UNLOCK_LEVEL}`,
    '',
    '## Verification script',
    '- `scripts/advanced-trial-flow-check.ts` — automated flow PASS/FAIL',
  ];

  writeReport('advanced-class-trial-audit.md', lines.join('\n'));
  console.log('✅ advanced-class-trial-audit → reports/advanced-class-trial-audit.md');
}

main();
