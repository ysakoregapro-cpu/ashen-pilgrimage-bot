import { getDb } from '../../db/database';
import { nowIso } from '../../types';
import { uuid } from '../../utils/random';
import {
  COOP_MAX_PLAYERS,
  COOP_MIN_PLAYERS,
  COOP_RECRUIT_TTL_MS,
  RAID_BOSS_ID,
  type CoopContext,
  type CoopMemberRole,
  type CoopMemberStatus,
  type CoopMode,
  type CoopRecruitStatus,
} from './coopTypes';
import { canEnterValhalla } from '../progressionGates';

export type CoopRecruitRow = {
  id: string;
  guild_id: string;
  leader_id: string;
  mode: CoopMode;
  status: CoopRecruitStatus;
  min_players: number;
  max_players: number;
  context_json: string;
  channel_id: string | null;
  message_id: string | null;
  expires_at: string;
  started_battle_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CoopMemberRow = {
  recruit_id: string;
  user_id: string;
  role: CoopMemberRole;
  status: CoopMemberStatus;
  joined_at: string;
  left_at: string | null;
};

export function parseCoopContext(json: string): CoopContext {
  try {
    return JSON.parse(json) as CoopContext;
  } catch {
    return {};
  }
}

export function isRecruitExpired(recruit: CoopRecruitRow): boolean {
  return new Date(recruit.expires_at).getTime() <= Date.now();
}

export function getActiveMemberCount(recruitId: string): number {
  const row = getDb().prepare(`
    SELECT COUNT(*) AS c FROM coop_members
    WHERE recruit_id = ? AND status NOT IN ('left')
  `).get(recruitId) as { c: number };
  return row.c;
}

export function getCoopMembers(recruitId: string): CoopMemberRow[] {
  return getDb().prepare(`
    SELECT * FROM coop_members WHERE recruit_id = ? AND status NOT IN ('left') ORDER BY joined_at
  `).all(recruitId) as CoopMemberRow[];
}

export function getCoopRecruit(recruitId: string): CoopRecruitRow | undefined {
  return getDb().prepare('SELECT * FROM coop_recruits WHERE id = ?').get(recruitId) as CoopRecruitRow | undefined;
}

function syncRecruitPlayerStatus(recruitId: string): void {
  const count = getActiveMemberCount(recruitId);
  const recruit = getCoopRecruit(recruitId);
  if (!recruit || !['recruiting', 'full'].includes(recruit.status)) return;
  const next: CoopRecruitStatus = count >= recruit.max_players ? 'full' : 'recruiting';
  if (next !== recruit.status) {
    getDb().prepare('UPDATE coop_recruits SET status = ?, updated_at = ? WHERE id = ?').run(next, nowIso(), recruitId);
  }
}

export function expireStaleRecruits(): number {
  const now = nowIso();
  const r = getDb().prepare(`
    UPDATE coop_recruits SET status = 'expired', updated_at = ?
    WHERE status IN ('recruiting', 'full') AND expires_at <= ?
  `).run(now, now);
  return r.changes;
}

export function validateRecruitOperation(
  recruitId: string,
  userId?: string,
  op?: 'join' | 'leave' | 'start' | 'cancel',
): { ok: boolean; message: string; recruit?: CoopRecruitRow } {
  const recruit = getCoopRecruit(recruitId);
  if (!recruit) return { ok: false, message: 'この募集は終了しています。' };
  if (isRecruitExpired(recruit) && recruit.status !== 'started') {
    if (recruit.status !== 'expired') {
      getDb().prepare("UPDATE coop_recruits SET status = 'expired', updated_at = ? WHERE id = ?").run(nowIso(), recruitId);
    }
    return { ok: false, message: 'この募集は期限切れです。' };
  }
  if (['expired', 'cancelled', 'completed'].includes(recruit.status)) {
    return { ok: false, message: 'この募集は終了しています。' };
  }
  if (recruit.status === 'started' && op !== 'start') {
    return { ok: false, message: '既に開始済みの募集です。' };
  }
  if (op === 'start' && recruit.status === 'started' && recruit.started_battle_id) {
    return { ok: false, message: '既に戦闘が開始されています。' };
  }
  return { ok: true, message: '', recruit };
}

/** Resolve coop recruit id from recruit id or legacy rescue/raid table id. */
export function resolveCoopRecruitIdForJoin(mode: CoopMode, idOrLegacy: string): string | null {
  if (getCoopRecruit(idOrLegacy)) return idOrLegacy;
  const legacyKey = mode === 'rescue' ? 'legacy_rescue_id' : 'legacy_raid_id';
  const rows = getDb().prepare('SELECT id, context_json FROM coop_recruits WHERE mode = ?').all(mode) as Array<{
    id: string; context_json: string;
  }>;
  for (const row of rows) {
    const ctx = parseCoopContext(row.context_json);
    if (ctx[legacyKey as keyof CoopContext] === idOrLegacy) return row.id;
  }
  return null;
}

export function createCoopRecruit(
  guildId: string,
  leaderId: string,
  mode: CoopMode,
  context: CoopContext = {},
): { ok: boolean; message: string; recruitId?: string } {
  if (mode === 'raid') {
    const gate = canEnterValhalla(leaderId);
    if (!gate.ok) return { ok: false, message: gate.reason ?? 'レイド参加条件を満たしていません。' };
  }

  const id = uuid();
  const expiresAt = new Date(Date.now() + COOP_RECRUIT_TTL_MS).toISOString();
  const ctx: CoopContext = {
    ...context,
    monster_id: context.monster_id ?? (mode === 'raid' ? RAID_BOSS_ID : context.monster_id),
    area_id: context.area_id ?? (mode === 'raid' ? 'area_deep_core' : context.area_id),
  };

  const db = getDb();
  db.prepare(`
    INSERT INTO coop_recruits (id, guild_id, leader_id, mode, status, min_players, max_players, context_json, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'recruiting', ?, ?, ?, ?, ?, ?)
  `).run(id, guildId, leaderId, mode, COOP_MIN_PLAYERS, COOP_MAX_PLAYERS, JSON.stringify(ctx), expiresAt, nowIso(), nowIso());

  db.prepare(`
    INSERT INTO coop_members (recruit_id, user_id, role, status, joined_at)
    VALUES (?, ?, 'leader', 'joined', ?)
  `).run(id, leaderId, nowIso());

  return { ok: true, message: '募集を作成しました。', recruitId: id };
}

export function joinCoopRecruit(recruitId: string, userId: string): string {
  const check = validateRecruitOperation(recruitId, userId, 'join');
  if (!check.ok || !check.recruit) return check.message;
  const recruit = check.recruit;

  if (!['recruiting', 'full'].includes(recruit.status)) return '参加できない状態です。';
  const existing = getDb().prepare('SELECT * FROM coop_members WHERE recruit_id = ? AND user_id = ?')
    .get(recruitId, userId) as CoopMemberRow | undefined;
  if (existing && existing.status !== 'left') return '既に参加しています。';

  const count = getActiveMemberCount(recruitId);
  if (count >= recruit.max_players) return '定員（4人）に達しています。';

  if (existing?.status === 'left') {
    getDb().prepare(`
      UPDATE coop_members SET status = 'joined', role = 'helper', joined_at = ?, left_at = NULL
      WHERE recruit_id = ? AND user_id = ?
    `).run(nowIso(), recruitId, userId);
  } else {
    getDb().prepare(`
      INSERT INTO coop_members (recruit_id, user_id, role, status, joined_at)
      VALUES (?, ?, 'helper', 'joined', ?)
    `).run(recruitId, userId, nowIso());
  }

  syncRecruitPlayerStatus(recruitId);
  const newCount = getActiveMemberCount(recruitId);
  return `参加しました。（${newCount}/${recruit.max_players}）`;
}

export function leaveCoopRecruit(recruitId: string, userId: string): string {
  const check = validateRecruitOperation(recruitId, userId, 'leave');
  if (!check.ok || !check.recruit) return check.message;
  const recruit = check.recruit;

  if (recruit.leader_id === userId) return '募集主は参加取消できません。解散してください。';
  const member = getDb().prepare('SELECT * FROM coop_members WHERE recruit_id = ? AND user_id = ? AND status NOT IN (\'left\')')
    .get(recruitId, userId) as CoopMemberRow | undefined;
  if (!member) return '参加していません。';

  getDb().prepare(`
    UPDATE coop_members SET status = 'left', left_at = ? WHERE recruit_id = ? AND user_id = ?
  `).run(nowIso(), recruitId, userId);

  if (recruit.status === 'full') {
    getDb().prepare("UPDATE coop_recruits SET status = 'recruiting', updated_at = ? WHERE id = ?").run(nowIso(), recruitId);
  }
  syncRecruitPlayerStatus(recruitId);
  return '参加を取り消しました。';
}

export function cancelCoopRecruit(recruitId: string, userId: string): string {
  const check = validateRecruitOperation(recruitId, userId, 'cancel');
  if (!check.ok || !check.recruit) return check.message;
  const recruit = check.recruit;
  if (recruit.leader_id !== userId) return '募集主のみ解散できます。';
  if (recruit.status === 'started') return '開始済みの募集は解散できません。';

  getDb().prepare("UPDATE coop_recruits SET status = 'cancelled', updated_at = ? WHERE id = ?").run(nowIso(), recruitId);
  return '募集を解散しました。';
}

export function startCoopRecruit(recruitId: string, userId: string): {
  ok: boolean;
  message: string;
  battleId?: string;
} {
  const check = validateRecruitOperation(recruitId, userId, 'start');
  if (!check.ok || !check.recruit) return { ok: false, message: check.message };
  const recruit = check.recruit;

  if (recruit.leader_id !== userId) return { ok: false, message: '募集主のみ開始できます。' };
  if (recruit.started_battle_id) return { ok: false, message: '既に戦闘が開始されています。' };

  const count = getActiveMemberCount(recruitId);
  if (count < recruit.min_players) {
    return { ok: false, message: `開始には${recruit.min_players}人以上必要です。（現在${count}人）` };
  }

  const db = getDb();
  const startResult = db.transaction(() => {
    const fresh = getCoopRecruit(recruitId);
    if (!fresh || fresh.started_battle_id) return { ok: false as const, message: '既に戦闘が開始されています。' };
    if (!['recruiting', 'full'].includes(fresh.status)) {
      return { ok: false as const, message: '開始できない状態です。' };
    }

    const { createCoopBattleFromRecruit } = require('./coopBattleSystem') as typeof import('./coopBattleSystem');

    const battle = createCoopBattleFromRecruit(recruitId);
    if (!battle.ok || !battle.battleId) return { ok: false as const, message: battle.message };

    db.prepare(`
      UPDATE coop_recruits SET status = 'started', started_battle_id = ?, updated_at = ? WHERE id = ? AND started_battle_id IS NULL
    `).run(battle.battleId, nowIso(), recruitId);

    const updated = getCoopRecruit(recruitId);
    if (updated?.started_battle_id !== battle.battleId) {
      return { ok: false as const, message: '開始処理が競合しました。もう一度確認してください。' };
    }

    for (const m of getCoopMembers(recruitId)) {
      db.prepare("UPDATE coop_members SET status = 'action_pending' WHERE recruit_id = ? AND user_id = ?")
        .run(recruitId, m.user_id);
    }

    return { ok: true as const, message: battle.message, battleId: battle.battleId };
  })();

  return startResult;
}

export function setCoopRecruitMessage(recruitId: string, messageId: string, channelId: string): void {
  getDb().prepare('UPDATE coop_recruits SET message_id = ?, channel_id = ?, updated_at = ? WHERE id = ?')
    .run(messageId, channelId, nowIso(), recruitId);
}

export function completeCoopRecruit(recruitId: string): void {
  getDb().prepare("UPDATE coop_recruits SET status = 'completed', updated_at = ? WHERE id = ?").run(nowIso(), recruitId);
}

export function getRecommendedLevel(mode: CoopMode, context: CoopContext): number {
  if (mode === 'raid') return 80;
  const monsterId = context.monster_id ?? 'mon_bandit';
  const mon = getDb().prepare('SELECT level FROM monsters WHERE id = ?').get(monsterId) as { level: number } | undefined;
  return mon?.level ?? 10;
}

export function getRecruitTargetLabel(mode: CoopMode, context: CoopContext): string {
  const monsterId = context.monster_id ?? (mode === 'raid' ? RAID_BOSS_ID : 'mon_bandit');
  const mon = getDb().prepare('SELECT name FROM monsters WHERE id = ?').get(monsterId) as { name: string } | undefined;
  if (mode === 'raid') return `レイド: ${mon?.name ?? '深層炉心'}`;
  if (context.area_label) return `救難: ${context.area_label} — ${mon?.name ?? '敵'}`;
  return `救難: ${mon?.name ?? '敵'}`;
}
