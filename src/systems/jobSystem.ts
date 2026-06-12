import { getDb } from '../db/database';
import { recalculatePlayerStats, requirePlayer } from './playerSystem';
import { grantJobStart, grantSubJobStart } from './skillSystem';
import { addItem } from './inventorySystem';
import { equipItem } from './equipmentSystem';
import { getStarterWeaponForJob } from '../db/seedData/jobStarterWeapons';
import { nowIso } from '../types';
import {
  changeMainJob as changeMainJobProgression,
  changeSubJob as changeSubJobProgression,
  backfillSubJobUnlocks,
  getSelectableMainJobs,
  getSelectableSubJobs,
  formatLegacyJobWarning,
} from './jobProgressionSystem';
import { isLegacyJob, isBasicMainJob } from '../db/seedData/jobMultiplierMaster';

export function getJobs(tier?: string) {
  if (tier === 'sub') return getDb().prepare("SELECT * FROM jobs WHERE tier = 'sub' ORDER BY name").all();
  if (tier === 'advanced_main') return getDb().prepare("SELECT * FROM jobs WHERE tier = 'advanced_main' ORDER BY name").all();
  if (tier) return getDb().prepare('SELECT * FROM jobs WHERE tier = ? ORDER BY name').all(tier);
  return getDb().prepare('SELECT * FROM jobs ORDER BY tier, name').all();
}

export function getJobByName(name: string) {
  return getDb().prepare('SELECT * FROM jobs WHERE name = ?').get(name);
}

export function selectMainJob(userId: string, jobName: string): string {
  const player = requirePlayer(userId);
  if (player.main_job !== '未選択') {
    return changeMainJobProgression(userId, jobName);
  }
  const job = getJobByName(jobName) as { name: string; tier: string } | undefined;
  if (!job) return 'ジョブが見つかりません。';
  if (!isBasicMainJob(jobName) || isLegacyJob(jobName)) {
    return '初回は基本ジョブのみ選択できます。';
  }
  getDb().prepare('UPDATE players SET main_job = ?, updated_at = ? WHERE user_id = ?').run(jobName, nowIso(), userId);
  recalculatePlayerStats(userId);
  grantJobStart(userId, jobName);

  const starterId = getStarterWeaponForJob(jobName);
  if (starterId) {
    const equipped = getDb().prepare(`
      SELECT pe.inventory_id FROM player_equipment pe
      JOIN player_inventory pi ON pe.inventory_id = pi.id
      JOIN equipment e ON pi.item_id = e.item_id
      WHERE pe.user_id = ? AND e.slot = 'weapon'
    `).get(userId) as { inventory_id: number } | undefined;
    if (equipped) {
      getDb().prepare('UPDATE player_inventory SET is_equipped = 0 WHERE id = ?').run(equipped.inventory_id);
      getDb().prepare('DELETE FROM player_equipment WHERE user_id = ? AND inventory_id = ?').run(userId, equipped.inventory_id);
    }
    const invId = addItem(userId, starterId, 1);
    equipItem(userId, invId);
    recalculatePlayerStats(userId);
    const wName = (getDb().prepare('SELECT name FROM items WHERE id = ?').get(starterId) as { name: string })?.name ?? starterId;
    return `職能「${jobName}」を選んだ。\n${wName}を手にした。`;
  }
  return `職能「${jobName}」を選んだ。`;
}

export function selectSubJob(userId: string, jobName: string): string {
  backfillSubJobUnlocks(userId);
  return changeSubJobProgression(userId, jobName);
}

export function getJobSkills(jobName: string) {
  const job = getJobByName(jobName) as { id: string } | undefined;
  if (!job) return [];
  return getDb().prepare('SELECT * FROM skills WHERE job_id = ?').all(job.id);
}

export function getPlayerSkills(userId: string) {
  const player = requirePlayer(userId);
  const skills = getJobSkills(player.main_job);
  if (player.sub_job) skills.push(...getJobSkills(player.sub_job));
  return skills;
}

export function buildJobMenuText(userId: string): string {
  const player = requirePlayer(userId);
  backfillSubJobUnlocks(userId);
  const legacy = formatLegacyJobWarning(userId);
  const lines = [
    `メイン: **${player.main_job}**`,
    `サブ: **${player.sub_job ?? '未設定'}**`,
  ];
  if (legacy) lines.push(`⚠ ${legacy}`);
  lines.push('', '**変更可能なメイン**');
  for (const j of getSelectableMainJobs(userId)) {
    if (j.locked) lines.push(`・${j.name} — ${j.locked}`);
    else lines.push(`・${j.name}${j.kind === 'advanced' ? '（上級）' : ''}`);
  }
  lines.push('', '**サブジョブ**');
  for (const s of getSelectableSubJobs(userId)) {
    lines.push(s.locked ? `・${s.name} — ${s.locked}` : `・${s.name} ✓`);
  }
  return lines.join('\n');
}

export { getSelectableMainJobs, getSelectableSubJobs, changeMainJobProgression as changeMainJob, changeSubJobProgression as changeSubJob };
