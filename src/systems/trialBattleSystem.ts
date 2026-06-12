import { getDb } from '../db/database';
import { requirePlayer, recalculatePlayerStats } from './playerSystem';
import { createBattle } from './battleSystem';
import { JOB_TRIO_MAP, TRIAL_ENEMY_NAMES } from '../db/seedData/jobProgressionMaster';
import { canStartTrial, isAdvancedJobUnlocked, recordAdvancedJobTrialVictory } from './jobProgressionSystem';
import { isUserBlockedFromTrial } from './jobUiSystem';

const TRIAL_MONSTER_PREFIX = 'mon_trial_avatar_';

export function ensureTrialMonsters(db: ReturnType<typeof getDb>): void {
  const ins = db.prepare(`
    INSERT INTO monsters (id, name, area_tag, level, hp, mp, attack, magic, defense, spirit, speed, break_max, drop_pool_json, exp_reward, gold_reward, ai_pattern_json, is_boss)
    VALUES (?, ?, 'trial', 70, 100, 0, 10, 10, 8, 8, 10, 180, '[]', 0, 0, ?, 1)
    ON CONFLICT(id) DO NOTHING
  `);
  for (const baseJob of Object.keys(JOB_TRIO_MAP)) {
    const name = TRIAL_ENEMY_NAMES[baseJob] ?? `${baseJob}の現身`;
    ins.run(`${TRIAL_MONSTER_PREFIX}${baseJob}`, name, JSON.stringify({ pattern: 'boss' }));
  }
}

export function startTrialBattle(userId: string, baseJob: string): { ok: boolean; message: string; battleId?: string } {
  const check = canStartTrial(userId, baseJob);
  if (!check.ok) return { ok: false, message: check.reason ?? '試練開始できません。' };
  const block = isUserBlockedFromTrial(userId);
  if (block.blocked) return { ok: false, message: block.reason ?? '試練開始できません。' };

  recalculatePlayerStats(userId);
  const player = requirePlayer(userId);
  const monsterId = `${TRIAL_MONSTER_PREFIX}${baseJob}`;
  ensureTrialMonsters(getDb());

  const hp = Math.floor(player.max_hp * 1.10);
  const atk = player.attack;
  const mag = player.magic;
  const def = player.defense;
  const spd = player.speed;

  getDb().prepare(`
    UPDATE monsters SET hp=?, attack=?, magic=?, defense=?, speed=?, level=?, name=?
    WHERE id=?
  `).run(hp, atk, mag, def, spd, Math.max(player.level, 70), TRIAL_ENEMY_NAMES[baseJob] ?? '現身', monsterId);

  const battleId = createBattle(userId, monsterId, null, {
    isBoss: true,
    isEvent: true,
    isTrial: true,
    trialType: 'advanced_job',
    trialJob: baseJob,
  });

  return {
    ok: true,
    battleId,
    message: `${TRIAL_ENEMY_NAMES[baseJob] ?? '現身'}が姿を現した。\n試練の戦いが始まる。`,
  };
}

export function handleTrialVictory(userId: string, baseJob: string): string {
  if (isAdvancedJobUnlocked(userId, JOB_TRIO_MAP[baseJob]?.advanced ?? '')) {
    return '既に上級職は解放済みです。';
  }
  return recordAdvancedJobTrialVictory(userId, baseJob);
}

export function isTrialBattleSession(session: { trial_type?: string | null }): boolean {
  return session.trial_type === 'advanced_job';
}

export function parseTrialBaseJob(session: { trial_job?: string | null }): string | null {
  return session.trial_job ?? null;
}

export function getTrialBaseJobsForMenu(userId: string): Array<{ baseJob: string; label: string; status: string }> {
  return Object.keys(JOB_TRIO_MAP).map((baseJob) => ({
    baseJob,
    label: TRIAL_ENEMY_NAMES[baseJob] ?? baseJob,
    status: canStartTrial(userId, baseJob).ok ? '挑戦可' : (
      isAdvancedJobUnlocked(userId, JOB_TRIO_MAP[baseJob]!.advanced) ? '解放済' : '条件未達'
    ),
  }));
}
