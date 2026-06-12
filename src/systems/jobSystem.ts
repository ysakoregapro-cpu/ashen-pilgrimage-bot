import { getDb } from '../db/database';
import { recalculatePlayerStats, requirePlayer } from './playerSystem';
import { grantJobStart, grantSubJobStart } from './skillSystem';
import { addItem } from './inventorySystem';
import { equipItem } from './equipmentSystem';
import { getStarterWeaponForJob } from '../db/seedData/jobStarterWeapons';
import { nowIso } from '../types';

export function getJobs(tier?: string) {
  if (tier) return getDb().prepare('SELECT * FROM jobs WHERE tier = ? ORDER BY name').all(tier);
  return getDb().prepare('SELECT * FROM jobs ORDER BY tier, name').all();
}

export function getJobByName(name: string) {
  return getDb().prepare('SELECT * FROM jobs WHERE name = ?').get(name);
}

export function selectMainJob(userId: string, jobName: string): string {
  const player = requirePlayer(userId);
  if (player.main_job !== '未選択') return `メインジョブは既に「${player.main_job}」です。`;
  const job = getJobByName(jobName) as { name: string; tier: string } | undefined;
  if (!job) return 'ジョブが見つかりません。';
  if (job.tier !== 'basic') return '初回は基本ジョブのみ選択できます。';
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
  const player = requirePlayer(userId);
  if (player.level < 20) return 'サブジョブはLv20以上で解放されます。';
  const job = getJobByName(jobName) as { name: string; tier: string } | undefined;
  if (!job) return 'ジョブが見つかりません。';
  if (job.tier === 'hidden') return '隠しジョブは特殊条件が必要です。';
  getDb().prepare('UPDATE players SET sub_job = ?, updated_at = ? WHERE user_id = ?').run(jobName, nowIso(), userId);
  grantSubJobStart(userId, jobName);
  recalculatePlayerStats(userId);
  return `サブジョブ「${jobName}」を設定しました。`;
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
