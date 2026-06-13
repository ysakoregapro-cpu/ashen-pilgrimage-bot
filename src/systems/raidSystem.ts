import { getDb } from '../db/database';
import { nowIso } from '../types';
import { uuid } from '../utils/random';
import { incrementWeeklyProgress } from './weeklySystem';
import { startRaidBattle } from './raidBattleSystem';
import {
  createCoopRecruit,
  joinCoopRecruit,
  leaveCoopRecruit,
  startCoopRecruit,
  cancelCoopRecruit,
  setCoopRecruitMessage,
  getCoopRecruit,
  resolveCoopRecruitIdForJoin,
} from './coop/coopRecruitSystem';
import type { CoopContext } from './coop/coopTypes';

const MAX_RAID = 4;

/** @deprecated legacy table — new recruits use coop_recruits */
export function createRaid(guildId: string, leaderId: string, areaId = 'area_deep_core'): string {
  const result = createCoopRecruit(guildId, leaderId, 'raid', { area_id: areaId, legacy_raid_id: undefined });
  if (!result.ok || !result.recruitId) throw new Error(result.message);

  const legacyId = uuid();
  getDb().prepare(`
    INSERT INTO raid_sessions (id, guild_id, leader_id, raid_area_id, participants_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'recruiting', ?, ?)
  `).run(legacyId, guildId, leaderId, areaId, JSON.stringify([leaderId]), nowIso(), nowIso());

  const ctx: CoopContext = { area_id: areaId, legacy_raid_id: legacyId };
  getDb().prepare('UPDATE coop_recruits SET context_json = ? WHERE id = ?').run(JSON.stringify(ctx), result.recruitId);
  return result.recruitId;
}

export function getRaid(raidId: string) {
  const coop = getCoopRecruit(raidId);
  if (coop) {
    const members = getDb().prepare(`
      SELECT user_id FROM coop_members WHERE recruit_id = ? AND status NOT IN ('left')
    `).all(raidId) as Array<{ user_id: string }>;
    return {
      id: raidId,
      guild_id: coop.guild_id,
      leader_id: coop.leader_id,
      raid_area_id: JSON.parse(coop.context_json).area_id ?? 'area_deep_core',
      participants_json: JSON.stringify(members.map((m) => m.user_id)),
      status: coop.status === 'recruiting' || coop.status === 'full' ? 'recruiting'
        : coop.status === 'started' ? 'in_progress'
          : coop.status === 'completed' ? 'completed' : 'failed',
      message_id: coop.message_id,
      channel_id: coop.channel_id,
    };
  }
  return getDb().prepare('SELECT * FROM raid_sessions WHERE id = ?').get(raidId);
}

export function joinRaid(raidId: string, userId: string): string {
  const coopId = resolveCoopRecruitIdForJoin('raid', raidId);
  if (coopId) return joinCoopRecruit(coopId, userId);
  const raid = getRaid(raidId) as { participants_json: string; status: string } | undefined;
  if (!raid || raid.status !== 'recruiting') {
    return 'この募集は見つかりません。古い形式の募集の場合は、再度レイド募集を出してください。';
  }
  const participants = JSON.parse(raid.participants_json) as string[];
  if (participants.includes(userId)) return '既に参加しています。';
  if (participants.length >= MAX_RAID) return '定員（4人）に達しています。';
  participants.push(userId);
  getDb().prepare('UPDATE raid_sessions SET participants_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(participants), nowIso(), raidId);
  return `レイドに参加しました。（${participants.length}/${MAX_RAID}）`;
}

export function leaveRaid(raidId: string, userId: string): string {
  if (getCoopRecruit(raidId)) return leaveCoopRecruit(raidId, userId);
  const raid = getRaid(raidId) as { participants_json: string; status: string; leader_id: string } | undefined;
  if (!raid) return 'レイドが見つかりません。';
  let participants = JSON.parse(raid.participants_json) as string[];
  if (raid.leader_id === userId && participants.length > 1) return 'リーダーは辞退できません。出発するか解散してください。';
  participants = participants.filter((p) => p !== userId);
  getDb().prepare('UPDATE raid_sessions SET participants_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(participants), nowIso(), raidId);
  return 'レイドから辞退しました。';
}

export function startRaid(raidId: string, userId: string): { message: string; battleId?: string } {
  if (getCoopRecruit(raidId)) {
    const result = startCoopRecruit(raidId, userId);
    const count = (JSON.parse((getRaid(raidId) as { participants_json: string }).participants_json) as string[]).length;
    if (result.ok && result.battleId) {
      for (const pid of JSON.parse((getRaid(raidId) as { participants_json: string }).participants_json) as string[]) {
        incrementWeeklyProgress(pid, 'raid_joins');
      }
    }
    return {
      message: result.ok ? `${getRaidGimmick(count)}\n${result.message}` : result.message,
      battleId: result.battleId,
    };
  }

  const raid = getRaid(raidId) as { leader_id: string; participants_json: string; status: string } | undefined;
  if (!raid || raid.status !== 'recruiting') return { message: 'レイドが見つかりません。' };
  if (raid.leader_id !== userId) return { message: 'リーダーのみ出発できます。' };
  const count = (JSON.parse(raid.participants_json) as string[]).length;
  getDb().prepare("UPDATE raid_sessions SET status = 'in_progress', updated_at = ? WHERE id = ?").run(nowIso(), raidId);
  for (const pid of JSON.parse(raid.participants_json) as string[]) incrementWeeklyProgress(pid, 'raid_joins');
  const battle = startRaidBattle(raidId);
  return { message: `${getRaidGimmick(count)}\n${battle.message}`, battleId: battle.battleId };
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
  if (getCoopRecruit(raidId)) {
    setCoopRecruitMessage(raidId, messageId, channelId);
    return;
  }
  getDb().prepare('UPDATE raid_sessions SET message_id = ?, channel_id = ?, updated_at = ? WHERE id = ?')
    .run(messageId, channelId, nowIso(), raidId);
}

export function getRaidMultiplier(count: number): { hp: number; rewardBonus: number } {
  const mods = [{ hp: 1, rewardBonus: 0 }, { hp: 1.8, rewardBonus: 1 }, { hp: 2.6, rewardBonus: 1 }, { hp: 3.4, rewardBonus: 2 }];
  return mods[count - 1] ?? mods[0]!;
}

export { createCoopRecruit as createCoopRaidRecruit } from './coop/coopRecruitSystem';
