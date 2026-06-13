import { getDb } from '../db/database';
import { nowIso } from '../types';
import { recalculatePlayerStats, requirePlayer } from './playerSystem';
import { initSubJobLevel, getJobLevel, JOB_LEVEL_CAP } from './jobLevelSystem';
import { grantSubJobStart, grantJobStart } from './skillSystem';
import {
  JOB_TRIO_MAP, SUB_JOB_UNLOCK_LEVEL, ADVANCED_JOB_UNLOCK_LEVEL,
  getBaseJobForAdvanced, getSubForBaseJob,
} from '../db/seedData/jobProgressionMaster';
import {
  isLegacyJob, isPhase2AdvancedMain, isBasicMainJob, BASIC_MAIN_JOBS,
  PHASE2_ADVANCED_MAIN_JOBS,
} from '../db/seedData/jobMultiplierMaster';
import { hasStoryFlag } from './storySystem';

export type SubUnlockRow = { user_id: string; sub_job: string; unlocked_at: string; unlock_source: string | null };
export type AdvancedUnlockRow = {
  user_id: string; advanced_job: string; base_job: string;
  unlocked_at: string | null; trial_cleared_at: string | null; unlock_source: string | null;
};

export function getUnlockedSubJobs(userId: string): string[] {
  return (getDb().prepare('SELECT sub_job FROM player_sub_job_unlocks WHERE user_id = ?').all(userId) as Array<{ sub_job: string }>)
    .map((r) => r.sub_job);
}

export function isSubJobUnlocked(userId: string, subJob: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM player_sub_job_unlocks WHERE user_id = ? AND sub_job = ?').get(userId, subJob);
  return !!row;
}

export function getUnlockedAdvancedJobs(userId: string): string[] {
  return (getDb().prepare(`
    SELECT advanced_job FROM player_advanced_job_unlocks
    WHERE user_id = ? AND trial_cleared_at IS NOT NULL
  `).all(userId) as Array<{ advanced_job: string }>).map((r) => r.advanced_job);
}

export function isAdvancedJobUnlocked(userId: string, advancedJob: string): boolean {
  const row = getDb().prepare(`
    SELECT 1 FROM player_advanced_job_unlocks
    WHERE user_id = ? AND advanced_job = ? AND trial_cleared_at IS NOT NULL
  `).get(userId, advancedJob);
  return !!row;
}

export function unlockSubJob(userId: string, subJob: string, source: string): boolean {
  const ts = nowIso();
  const res = getDb().prepare(`
    INSERT OR IGNORE INTO player_sub_job_unlocks (user_id, sub_job, unlocked_at, unlock_source)
    VALUES (?, ?, ?, ?)
  `).run(userId, subJob, ts, source);
  if (res.changes > 0) {
    initSubJobLevel(userId, subJob);
    return true;
  }
  return false;
}

export function checkAndUnlockSubJobsForBase(userId: string, baseJob: string): string[] {
  const trio = JOB_TRIO_MAP[baseJob];
  if (!trio) return [];
  const row = getJobLevel(userId, baseJob);
  if (!row || row.job_level < SUB_JOB_UNLOCK_LEVEL) return [];
  if (isSubJobUnlocked(userId, trio.sub)) return [];
  unlockSubJob(userId, trio.sub, `job_lv${SUB_JOB_UNLOCK_LEVEL}:${baseJob}`);
  return [trio.sub];
}

export function backfillSubJobUnlocks(userId: string): string[] {
  const player = requirePlayer(userId);
  const unlocked: string[] = [];
  const bases = player.main_job !== '未選択' ? [player.main_job] : [];
  if (isPhase2AdvancedMain(player.main_job)) {
    const base = getBaseJobForAdvanced(player.main_job);
    if (base) bases.push(base);
  }
  for (const base of BASIC_MAIN_JOBS) {
    if (!bases.includes(base)) bases.push(base);
  }
  for (const base of bases) {
    unlocked.push(...checkAndUnlockSubJobsForBase(userId, base));
  }
  return unlocked;
}

export function afterJobExpGranted(userId: string, jobName: string): string[] {
  const base = isPhase2AdvancedMain(jobName) ? getBaseJobForAdvanced(jobName) : jobName;
  if (!base || !JOB_TRIO_MAP[base]) return [];
  return checkAndUnlockSubJobsForBase(userId, base);
}

export function canStartTrial(userId: string, baseJob: string): { ok: boolean; reason?: string } {
  if (!JOB_TRIO_MAP[baseJob]) return { ok: false, reason: 'この職能には現身の試練がありません。' };
  const row = getJobLevel(userId, baseJob);
  if (!row || row.job_level < ADVANCED_JOB_UNLOCK_LEVEL) {
    return { ok: false, reason: `${baseJob}のJobLv${ADVANCED_JOB_UNLOCK_LEVEL}以上が必要です。（現在 Lv${row?.job_level ?? 0}）` };
  }
  if (!hasStoryFlag(userId, 'valhalla_unlocked') && !hasStoryFlag(userId, 'chapter_completed:ch7_furnace')) {
    return { ok: false, reason: '空中要塞ヴァルハラ解放後に挑めます。' };
  }
  return { ok: true };
}

export function getTrialStatusText(userId: string, baseJob: string): string {
  const check = canStartTrial(userId, baseJob);
  const advanced = JOB_TRIO_MAP[baseJob]?.advanced ?? '—';
  if (isAdvancedJobUnlocked(userId, advanced)) {
    return check.ok ? `✅ ${advanced} — 解放済（再挑戦可）` : `✅ ${advanced} — 解放済`;
  }
  if (!check.ok) return `🔒 ${advanced} — ${check.reason}`;
  return `⚔ ${advanced} — 現身の試練に挑める`;
}

export function changeMainJob(userId: string, jobName: string): string {
  const player = requirePlayer(userId);
  if (isLegacyJob(jobName)) {
    return `「${jobName}」は旧職です。基本職または解放済み上級職を選んでください。`;
  }
  if (isBasicMainJob(jobName)) {
    getDb().prepare('UPDATE players SET main_job = ?, updated_at = ? WHERE user_id = ?').run(jobName, nowIso(), userId);
    grantJobStart(userId, jobName);
    recalculatePlayerStats(userId);
    return `メインジョブを「${jobName}」に変更した。JobLv/EXPは保持される。`;
  }
  if (isPhase2AdvancedMain(jobName)) {
    if (!isAdvancedJobUnlocked(userId, jobName)) {
      return `「${jobName}」は未解放です。現身の試練をクリアしてください。`;
    }
    getDb().prepare('UPDATE players SET main_job = ?, updated_at = ? WHERE user_id = ?').run(jobName, nowIso(), userId);
    grantJobStart(userId, jobName);
    recalculatePlayerStats(userId);
    return `メインジョブを「${jobName}」に変更した。`;
  }
  return '選択できない職能です。';
}

export function changeSubJob(userId: string, subJob: string): string {
  if (isLegacyJob(subJob)) {
    return `「${subJob}」は旧職です。解放済みサブジョブを選んでください。`;
  }
  if (!isSubJobUnlocked(userId, subJob)) {
    return `「${subJob}」は未解放です。対応基本職のJobLv${SUB_JOB_UNLOCK_LEVEL}で解放されます。`;
  }
  getDb().prepare('UPDATE players SET sub_job = ?, updated_at = ? WHERE user_id = ?').run(subJob, nowIso(), userId);
  initSubJobLevel(userId, subJob);
  grantSubJobStart(userId, subJob);
  recalculatePlayerStats(userId);
  return `サブジョブを「${subJob}」に設定した。`;
}

export function recordAdvancedJobTrialVictory(userId: string, baseJob: string): string {
  const trio = JOB_TRIO_MAP[baseJob];
  if (!trio) return '試練対象が不正です。';
  const ts = nowIso();
  const baseRow = getJobLevel(userId, baseJob);
  const inheritLv = baseRow?.job_level ?? ADVANCED_JOB_UNLOCK_LEVEL;
  const inheritExp = baseRow?.job_exp ?? 0;

  getDb().prepare(`
    INSERT INTO player_advanced_job_unlocks (user_id, advanced_job, base_job, unlocked_at, trial_cleared_at, unlock_source)
    VALUES (?, ?, ?, ?, ?, 'trial_victory')
    ON CONFLICT(user_id, advanced_job) DO UPDATE SET trial_cleared_at = excluded.trial_cleared_at
  `).run(userId, trio.advanced, baseJob, ts, ts);

  getDb().prepare(`
    INSERT OR IGNORE INTO player_job_levels (user_id, job_name, job_level, job_exp, is_main, is_sub, unlocked_at, updated_at)
    VALUES (?, ?, ?, ?, 0, 0, ?, ?)
  `).run(userId, trio.advanced, inheritLv, inheritExp, ts, ts);

  getDb().prepare(`
    UPDATE player_job_levels SET job_level = MAX(job_level, ?), job_exp = ?, updated_at = ?
    WHERE user_id = ? AND job_name = ?
  `).run(inheritLv, inheritExp, ts, userId, trio.advanced);

  return `現身に勝利し、「${trio.advanced}」が解放された。（JobLv${inheritLv}を引き継ぎ）`;
}

export function getSelectableMainJobs(userId: string): Array<{ name: string; kind: 'basic' | 'advanced'; locked?: string }> {
  backfillSubJobUnlocks(userId);
  const out: Array<{ name: string; kind: 'basic' | 'advanced'; locked?: string }> = [];
  for (const name of BASIC_MAIN_JOBS) {
    out.push({ name, kind: 'basic' });
  }
  for (const name of PHASE2_ADVANCED_MAIN_JOBS) {
    if (isAdvancedJobUnlocked(userId, name)) {
      out.push({ name, kind: 'advanced' });
    } else {
      const base = getBaseJobForAdvanced(name);
      const check = base ? canStartTrial(userId, base) : { ok: false, reason: '未解放' };
      out.push({ name, kind: 'advanced', locked: check.reason });
    }
  }
  return out;
}

export function getSelectableSubJobs(userId: string): Array<{ name: string; locked?: string }> {
  backfillSubJobUnlocks(userId);
  const player = requirePlayer(userId);
  const mainBase = isPhase2AdvancedMain(player.main_job)
    ? getBaseJobForAdvanced(player.main_job)
    : player.main_job;
  const preferredSub = mainBase ? getSubForBaseJob(mainBase) : null;
  const unlocked = new Set(getUnlockedSubJobs(userId));
  const out: Array<{ name: string; locked?: string }> = [];
  for (const [base, trio] of Object.entries(JOB_TRIO_MAP)) {
    if (unlocked.has(trio.sub)) {
      out.push({ name: trio.sub });
    } else {
      out.push({ name: trio.sub, locked: `${base} JobLv${SUB_JOB_UNLOCK_LEVEL}で解放` });
    }
  }
  if (preferredSub && unlocked.has(preferredSub)) {
    out.sort((a, b) => (a.name === preferredSub ? -1 : b.name === preferredSub ? 1 : 0));
  }
  return out;
}

export function isPlayerMainJobLegacy(userId: string): boolean {
  const player = requirePlayer(userId);
  return player.main_job !== '未選択' && isLegacyJob(player.main_job);
}

export function isPlayerSubJobLegacy(userId: string): boolean {
  const player = requirePlayer(userId);
  return !!player.sub_job && isLegacyJob(player.sub_job);
}

export function formatLegacyJobWarning(userId: string): string | null {
  const parts: string[] = [];
  if (isPlayerMainJobLegacy(userId)) parts.push('メインが旧職（再設定推奨）');
  if (isPlayerSubJobLegacy(userId)) parts.push('サブが旧職（再設定推奨）');
  return parts.length ? parts.join(' / ') : null;
}
