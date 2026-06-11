import { getDb } from '../db/database';
import { nowIso } from '../types';
import { uuid } from '../utils/random';
import { incrementWeeklyProgress } from './weeklySystem';

const MAX_RAID = 4;

export function createRaid(guildId: string, leaderId: string, areaId = 'area_deep_core'): string {
  const id = uuid();
  getDb().prepare(`
    INSERT INTO raid_sessions (id, guild_id, leader_id, raid_area_id, participants_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'recruiting', ?, ?)
  `).run(id, guildId, leaderId, areaId, JSON.stringify([leaderId]), nowIso(), nowIso());
  return id;
}

export function getRaid(raidId: string) {
  return getDb().prepare('SELECT * FROM raid_sessions WHERE id = ?').get(raidId);
}

export function joinRaid(raidId: string, userId: string): string {
  const raid = getRaid(raidId) as { participants_json: string; status: string; leader_id: string } | undefined;
  if (!raid || raid.status !== 'recruiting') return 'レイドが見つかりません。';
  const participants = JSON.parse(raid.participants_json) as string[];
  if (participants.includes(userId)) return '既に参加しています。';
  if (participants.length >= MAX_RAID) return '定員（4人）に達しています。';
  participants.push(userId);
  getDb().prepare('UPDATE raid_sessions SET participants_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(participants), nowIso(), raidId);
  return `レイドに参加しました。（${participants.length}/${MAX_RAID}）`;
}

export function leaveRaid(raidId: string, userId: string): string {
  const raid = getRaid(raidId) as { participants_json: string; status: string; leader_id: string } | undefined;
  if (!raid) return 'レイドが見つかりません。';
  let participants = JSON.parse(raid.participants_json) as string[];
  if (raid.leader_id === userId && participants.length > 1) return 'リーダーは辞退できません。出発するか解散してください。';
  participants = participants.filter((p) => p !== userId);
  getDb().prepare('UPDATE raid_sessions SET participants_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(participants), nowIso(), raidId);
  return 'レイドから辞退しました。';
}

export function startRaid(raidId: string, userId: string): string {
  const raid = getRaid(raidId) as { leader_id: string; participants_json: string; raid_area_id: string; status: string } | undefined;
  if (!raid || raid.status !== 'recruiting') return 'レイドが見つかりません。';
  if (raid.leader_id !== userId) return 'リーダーのみ出発できます。';

  const count = (JSON.parse(raid.participants_json) as string[]).length;
  const hpMod = [1, 1.8, 2.6, 3.4][count - 1] ?? 1;
  getDb().prepare("UPDATE raid_sessions SET status = 'in_progress', updated_at = ? WHERE id = ?").run(nowIso(), raidId);

  for (const pid of JSON.parse(raid.participants_json) as string[]) {
    incrementWeeklyProgress(pid, 'raid_joins');
  }

  return `レイド開始！（${count}人）\n敵HP: ${Math.round(hpMod * 100)}%\n${getRaidGimmick(count)}`;
}

function getRaidGimmick(count: number): string {
  const gimmicks = [
    '1人: 基本ギミック、報酬標準',
    '2人: 敵HP180%、報酬枠+1、連携チャンス',
    '3人: 敵HP260%、ブレイク耐久増、レア率微増',
    '4人: 敵HP340%、全体攻撃増、UR抽選微増',
  ];
  return gimmicks[count - 1] ?? gimmicks[0]!;
}

export function setRaidMessage(raidId: string, messageId: string, channelId: string): void {
  getDb().prepare('UPDATE raid_sessions SET message_id = ?, channel_id = ?, updated_at = ? WHERE id = ?')
    .run(messageId, channelId, nowIso(), raidId);
}

export function getRaidMultiplier(count: number): { hp: number; rewardBonus: number } {
  const mods = [{ hp: 1, rewardBonus: 0 }, { hp: 1.8, rewardBonus: 1 }, { hp: 2.6, rewardBonus: 1 }, { hp: 3.4, rewardBonus: 2 }];
  return mods[count - 1] ?? mods[0]!;
}
