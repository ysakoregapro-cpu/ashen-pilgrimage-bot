import { getDb } from '../db/database';
import { requirePlayer } from './playerSystem';
import { nowIso } from '../types';
import { JOB_INITIAL_SKILL, JOB_SKILL_UNLOCKS, getNextUnlock, getUnlocksUpToLevel } from '../db/seedData/jobSkillData';
import { checkJobQuests } from './storySystem';

export const JOB_LEVEL_CAP = 70;
/** メイン職能への職能経験値倍率 */
export const JOB_EXP_RATE_MAIN = 1.0;
/** サブ職能への職能経験値倍率 */
export const JOB_EXP_RATE_SUB = 0.4;

export type JobLevelRow = {
  user_id: string;
  job_name: string;
  job_level: number;
  job_exp: number;
  is_main: number;
  is_sub: number;
};

export type JobExpResult = {
  jobName: string;
  expGained: number;
  leveledUp: boolean;
  newLevel: number;
  expToNext: number;
  newSkills: string[];
};

/** 通常Lv80到達時にJobLv70程度になるよう、1レベルあたり必要EXPを調整 */
export function jobExpRequired(level: number): number {
  return Math.floor(58 * Math.pow(level, 1.48));
}

export function getJobLevel(userId: string, jobName: string): JobLevelRow | undefined {
  return getDb().prepare('SELECT * FROM player_job_levels WHERE user_id = ? AND job_name = ?').get(userId, jobName) as JobLevelRow | undefined;
}

export function initMainJobLevel(userId: string, jobName: string): void {
  const ts = nowIso();
  getDb().prepare(`
    INSERT OR IGNORE INTO player_job_levels (user_id, job_name, job_level, job_exp, is_main, is_sub, unlocked_at, updated_at)
    VALUES (?, ?, 1, 0, 1, 0, ?, ?)
  `).run(userId, jobName, ts, ts);
}

export function initSubJobLevel(userId: string, jobName: string): void {
  const ts = nowIso();
  getDb().prepare(`
    INSERT OR IGNORE INTO player_job_levels (user_id, job_name, job_level, job_exp, is_main, is_sub, unlocked_at, updated_at)
    VALUES (?, ?, 1, 0, 0, 1, ?, ?)
  `).run(userId, jobName, ts, ts);
  getDb().prepare('UPDATE player_job_levels SET is_sub = 1, updated_at = ? WHERE user_id = ? AND job_name = ?').run(ts, userId, jobName);
}

export function calcJobExpFromBattle(monsterExp: number): number {
  return Math.max(1, Math.floor(monsterExp * 0.9));
}

export function addJobExp(userId: string, jobName: string, exp: number, isMain: boolean): JobExpResult {
  if (!jobName || jobName === '未選択') {
    return { jobName, expGained: 0, leveledUp: false, newLevel: 0, expToNext: 0, newSkills: [] };
  }
  let row = getJobLevel(userId, jobName);
  if (!row) {
    if (isMain) initMainJobLevel(userId, jobName);
    else initSubJobLevel(userId, jobName);
    row = getJobLevel(userId, jobName)!;
  }

  let jobExp = row.job_exp + exp;
  let jobLevel = row.job_level;
  let leveledUp = false;
  const newSkills: string[] = [];

  while (jobLevel < JOB_LEVEL_CAP && jobExp >= jobExpRequired(jobLevel)) {
    jobExp -= jobExpRequired(jobLevel);
    jobLevel++;
    leveledUp = true;
    newSkills.push(...unlockSkillsAtLevel(userId, jobName, jobLevel));
  }

  getDb().prepare('UPDATE player_job_levels SET job_level=?, job_exp=?, updated_at=? WHERE user_id=? AND job_name=?')
    .run(jobLevel, jobExp, nowIso(), userId, jobName);

  if (leveledUp) {
    checkJobQuests(userId, jobName);
  }

  const nextReq = jobLevel >= JOB_LEVEL_CAP ? 0 : jobExpRequired(jobLevel);
  return { jobName, expGained: exp, leveledUp, newLevel: jobLevel, expToNext: Math.max(0, nextReq - jobExp), newSkills };
}

export function grantBattleJobExp(userId: string, monsterExp: number): JobExpResult[] {
  const player = requirePlayer(userId);
  const base = calcJobExpFromBattle(monsterExp);
  const results: JobExpResult[] = [];

  if (player.main_job !== '未選択') {
    results.push(addJobExp(userId, player.main_job, Math.floor(base * JOB_EXP_RATE_MAIN), true));
  }
  if (player.sub_job) {
    results.push(addJobExp(userId, player.sub_job, Math.floor(base * JOB_EXP_RATE_SUB), false));
  }
  return results;
}

/** ヴァルハラボス等 — 設計値のJob経験を直接付与（メイン100%・サブ40%） */
export function grantDirectBattleJobExp(userId: string, targetJobExp: number): JobExpResult[] {
  const player = requirePlayer(userId);
  const results: JobExpResult[] = [];

  if (player.main_job !== '未選択') {
    results.push(addJobExp(userId, player.main_job, Math.floor(targetJobExp * JOB_EXP_RATE_MAIN), true));
  }
  if (player.sub_job) {
    results.push(addJobExp(userId, player.sub_job, Math.floor(targetJobExp * JOB_EXP_RATE_SUB), false));
  }
  return results;
}

export function unlockSkillsAtLevel(userId: string, jobName: string, level: number): string[] {
  const unlocks = (JOB_SKILL_UNLOCKS[jobName] ?? []).filter((u) => u.level === level);
  const db = getDb();
  const names: string[] = [];
  for (const u of unlocks) {
    const exists = db.prepare('SELECT 1 FROM player_skills WHERE user_id = ? AND skill_id = ?').get(userId, u.skillId);
    if (exists) continue;
    db.prepare(`
      INSERT OR IGNORE INTO player_skills (user_id, skill_id, learned_at, source_type) VALUES (?, ?, ?, 'job')
    `).run(userId, u.skillId, nowIso());
    const skill = db.prepare('SELECT name FROM skills WHERE id = ?').get(u.skillId) as { name: string } | undefined;
    if (skill) names.push(skill.name);
  }
  return names;
}

export function syncJobSkillsForLevel(userId: string, jobName: string, level: number): string[] {
  const unlocks = getUnlocksUpToLevel(jobName, level);
  const db = getDb();
  const names: string[] = [];
  for (const u of unlocks) {
    const exists = db.prepare('SELECT 1 FROM player_skills WHERE user_id = ? AND skill_id = ?').get(userId, u.skillId);
    if (exists) continue;
    db.prepare(`
      INSERT OR IGNORE INTO player_skills (user_id, skill_id, learned_at, source_type) VALUES (?, ?, ?, 'job')
    `).run(userId, u.skillId, nowIso());
    const skill = db.prepare('SELECT name FROM skills WHERE id = ?').get(u.skillId) as { name: string } | undefined;
    if (skill) names.push(skill.name);
  }
  return names;
}

export function grantInitialJobSkill(userId: string, jobName: string): void {
  initMainJobLevel(userId, jobName);
  const skillId = JOB_INITIAL_SKILL[jobName];
  if (!skillId) return;
  getDb().prepare(`
    INSERT OR IGNORE INTO player_skills (user_id, skill_id, learned_at, source_type) VALUES (?, ?, ?, 'job')
  `).run(userId, skillId, nowIso());
}

export function getJobProgressText(userId: string, jobName: string): string {
  const row = getJobLevel(userId, jobName);
  if (!row) return '—';
  if (row.job_level >= JOB_LEVEL_CAP) return `${jobName} Lv${row.job_level}（極み）`;
  const need = jobExpRequired(row.job_level);
  const remain = Math.max(0, need - row.job_exp);
  return `${jobName} Lv${row.job_level + 1} まであと ${remain}`;
}

export function getUpcomingSkills(jobName: string, currentLevel: number, learnedIds: Set<string>): Array<{ level: number; hint: string }> {
  const upcoming: Array<{ level: number; hint: string }> = [];
  for (const u of JOB_SKILL_UNLOCKS[jobName] ?? []) {
    if (u.level <= currentLevel || learnedIds.has(u.skillId)) continue;
    if (u.level >= 50) {
      upcoming.push({ level: u.level, hint: 'まだ名を思い出していない技' });
    } else {
      const skill = getDb().prepare('SELECT name FROM skills WHERE id = ?').get(u.skillId) as { name: string } | undefined;
      upcoming.push({ level: u.level, hint: skill?.name ?? '？？？' });
    }
    if (upcoming.length >= 3) break;
  }
  return upcoming;
}

export function getNextUnlockLevel(jobName: string, currentLevel: number): number | null {
  const next = getNextUnlock(jobName, currentLevel);
  return next?.level ?? null;
}
