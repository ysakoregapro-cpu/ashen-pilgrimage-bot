import { getDb } from '../db/database';
import { nowIso } from '../types';
import { uuid } from '../utils/random';
import { incrementWeeklyProgress } from './weeklySystem';
import { addGold, healPlayer } from './playerSystem';
import { addItem } from './inventorySystem';
import {
  createCoopRecruit,
  joinCoopRecruit,
  startCoopRecruit,
  setCoopRecruitMessage,
  getCoopRecruit,
  getCoopMembers,
} from './coop/coopRecruitSystem';
import type { CoopContext } from './coop/coopTypes';

export function createRescueRequest(
  guildId: string,
  requesterId: string,
  type: 'battle' | 'preemptive' | 'explore',
  opts?: { battleId?: string; areaId?: string; isPreemptive?: boolean; areaLabel?: string; monsterId?: string },
): string {
  const ctx: CoopContext = {
    rescue_type: type,
    battle_session_id: opts?.battleId,
    area_id: opts?.areaId,
    area_label: opts?.areaLabel ?? opts?.areaId,
    monster_id: opts?.monsterId,
  };

  if (opts?.battleId) {
    const sess = getDb().prepare('SELECT monster_id FROM battle_sessions WHERE id = ?').get(opts.battleId) as { monster_id: string } | undefined;
    if (sess) ctx.monster_id = sess.monster_id;
  }

  const result = createCoopRecruit(guildId, requesterId, 'rescue', ctx);
  if (!result.ok || !result.recruitId) throw new Error(result.message);

  const legacyId = uuid();
  getDb().prepare(`
    INSERT INTO rescue_requests (id, guild_id, requester_id, request_type, battle_id, area_id, participants_json, status, is_preemptive, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, '[]', 'open', ?, ?, ?)
  `).run(legacyId, guildId, requesterId, type, opts?.battleId ?? null, opts?.areaId ?? null, opts?.isPreemptive ? 1 : 0, nowIso(), nowIso());

  ctx.legacy_rescue_id = legacyId;
  getDb().prepare('UPDATE coop_recruits SET context_json = ? WHERE id = ?').run(JSON.stringify(ctx), result.recruitId);
  return result.recruitId;
}

export function getRescue(rescueId: string) {
  const coop = getCoopRecruit(rescueId);
  if (coop) {
    const helpers = getCoopMembers(rescueId).filter((m) => m.role === 'helper');
    return {
      id: rescueId,
      guild_id: coop.guild_id,
      requester_id: coop.leader_id,
      request_type: JSON.parse(coop.context_json).rescue_type ?? 'explore',
      battle_id: JSON.parse(coop.context_json).battle_session_id ?? null,
      area_id: JSON.parse(coop.context_json).area_id ?? null,
      participants_json: JSON.stringify(helpers.map((h) => h.user_id)),
      status: coop.status === 'recruiting' || coop.status === 'full' ? 'open'
        : coop.status === 'started' ? 'in_progress'
          : coop.status === 'completed' ? 'completed' : 'failed',
      is_preemptive: JSON.parse(coop.context_json).rescue_type === 'preemptive' ? 1 : 0,
      message_id: coop.message_id,
      channel_id: coop.channel_id,
    };
  }
  return getDb().prepare('SELECT * FROM rescue_requests WHERE id = ?').get(rescueId);
}

export function joinRescue(rescueId: string, userId: string): string {
  if (getCoopRecruit(rescueId)) return joinCoopRecruit(rescueId, userId);
  const req = getRescue(rescueId) as { participants_json: string; status: string; requester_id: string } | undefined;
  if (!req || req.status !== 'open') return '救難要請が見つかりません。';
  if (req.requester_id === userId) return '自分の要請には参加できません。';
  const participants = JSON.parse(req.participants_json) as string[];
  if (participants.includes(userId)) return '既に参加しています。';
  participants.push(userId);
  getDb().prepare('UPDATE rescue_requests SET participants_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(participants), nowIso(), rescueId);
  return `救難に参加しました。（${participants.length}人）`;
}

export function startPreemptiveRescue(rescueId: string, userId: string): string {
  if (getCoopRecruit(rescueId)) {
    const result = startCoopRecruit(rescueId, userId);
    return result.message;
  }
  const req = getRescue(rescueId) as { requester_id: string; is_preemptive: number; status: string; participants_json: string } | undefined;
  if (!req || req.status !== 'open') return '救難要請が見つかりません。';
  if (req.requester_id !== userId) return '募集主のみ出発できます。';
  if (!req.is_preemptive) return '事前募集ではありません。';
  getDb().prepare("UPDATE rescue_requests SET status = 'in_progress', updated_at = ? WHERE id = ?").run(nowIso(), rescueId);
  const count = (JSON.parse(req.participants_json) as string[]).length + 1;
  return `救難パーティが出発！（${count}人）`;
}

export function completeRescue(rescueId: string): string {
  const req = getRescue(rescueId) as { requester_id: string; participants_json: string; status: string } | undefined;
  if (!req) return '救難要請が見つかりません。';
  healPlayer(req.requester_id, 0.5);
  addGold(req.requester_id, 100);
  const participants = JSON.parse(req.participants_json) as string[];
  for (const pid of participants) {
    addGold(pid, 200);
    addItem(pid, 'src_bind_thread', 1);
    incrementWeeklyProgress(pid, 'rescue_success');
  }
  incrementWeeklyProgress(req.requester_id, 'rescue_success');
  getDb().prepare("UPDATE rescue_requests SET status = 'completed', updated_at = ? WHERE id = ?").run(nowIso(), rescueId);
  if (getCoopRecruit(rescueId)) {
    getDb().prepare("UPDATE coop_recruits SET status = 'completed', updated_at = ? WHERE id = ?").run(nowIso(), rescueId);
  }
  return '救難成功！救助者に報酬を付与しました。';
}

export function setRescueMessage(rescueId: string, messageId: string, channelId: string): void {
  if (getCoopRecruit(rescueId)) {
    setCoopRecruitMessage(rescueId, messageId, channelId);
    return;
  }
  getDb().prepare('UPDATE rescue_requests SET message_id = ?, channel_id = ?, updated_at = ? WHERE id = ?')
    .run(messageId, channelId, nowIso(), rescueId);
}

export function getOpenRescues(guildId: string) {
  return getDb().prepare(`
    SELECT * FROM coop_recruits WHERE guild_id = ? AND mode = 'rescue' AND status IN ('recruiting', 'full')
    ORDER BY created_at DESC LIMIT 10
  `).all(guildId);
}

export { createCoopRecruit as createCoopRescueRecruit } from './coop/coopRecruitSystem';
