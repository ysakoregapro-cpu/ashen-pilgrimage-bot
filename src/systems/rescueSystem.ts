import { getDb } from '../db/database';
import { nowIso } from '../types';
import { uuid } from '../utils/random';
import { incrementWeeklyProgress } from './weeklySystem';
import { addGold, healPlayer } from './playerSystem';
import { addItem } from './inventorySystem';

export function createRescueRequest(
  guildId: string,
  requesterId: string,
  type: 'battle' | 'preemptive' | 'explore',
  opts?: { battleId?: string; areaId?: string; isPreemptive?: boolean },
): string {
  const id = uuid();
  getDb().prepare(`
    INSERT INTO rescue_requests (id, guild_id, requester_id, request_type, battle_id, area_id, participants_json, status, is_preemptive, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, '[]', 'open', ?, ?, ?)
  `).run(id, guildId, requesterId, type, opts?.battleId ?? null, opts?.areaId ?? null, opts?.isPreemptive ? 1 : 0, nowIso(), nowIso());
  return id;
}

export function getRescue(rescueId: string) {
  return getDb().prepare('SELECT * FROM rescue_requests WHERE id = ?').get(rescueId);
}

export function joinRescue(rescueId: string, userId: string): string {
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
  const req = getRescue(rescueId) as { requester_id: string; is_preemptive: number; status: string; participants_json: string } | undefined;
  if (!req || req.status !== 'open') return '救難要請が見つかりません。';
  if (req.requester_id !== userId) return '募集主のみ出発できます。';
  if (!req.is_preemptive) return '事前募集ではありません。';

  getDb().prepare("UPDATE rescue_requests SET status = 'in_progress', updated_at = ? WHERE id = ?").run(nowIso(), rescueId);
  const count = (JSON.parse(req.participants_json) as string[]).length + 1;
  return `救難パーティが出発！（${count}人）\n人数補正: 敵HP ${100 + count * 40}%、報酬+${count * 10}%`;
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
  return '救難成功！救助者に報酬を付与しました。';
}

export function setRescueMessage(rescueId: string, messageId: string, channelId: string): void {
  getDb().prepare('UPDATE rescue_requests SET message_id = ?, channel_id = ?, updated_at = ? WHERE id = ?')
    .run(messageId, channelId, nowIso(), rescueId);
}

export function getOpenRescues(guildId: string) {
  return getDb().prepare("SELECT * FROM rescue_requests WHERE guild_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 10").all(guildId);
}
