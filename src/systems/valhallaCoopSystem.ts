import { getDb } from '../db/database';
import { getActiveBattle } from './battleSystem';
import {
  VALHALLA_BOSS_MONSTER_IDS,
  VALHALLA_BOSS_REMATCH_META,
  type ValhallaBossId,
  isValhallaBossMonster,
} from '../db/seedData/valhallaRewardMaster';
import { hasDefeatedMonster } from './bossRematchSystem';
import { canEnterValhalla } from './progressionGates';
import { hasStoryFlag } from './storySystem';
import { requirePlayer } from './playerSystem';

const BOSS_AREA_MAP: Record<ValhallaBossId, string> = {
  mon_machina_echo: 'area_machina_zone',
  mon_old_king_shadow: 'area_old_throne',
  mon_deep_core_boss: 'area_deep_core',
};

export function getValhallaBossAreaId(monsterId: string): string | null {
  if (!isValhallaBossMonster(monsterId)) return null;
  return BOSS_AREA_MAP[monsterId];
}

export function getUserActiveCoopRecruitId(userId: string, excludeRecruitId?: string): string | null {
  const row = getDb().prepare(`
    SELECT cr.id FROM coop_recruits cr
    JOIN coop_members cm ON cm.recruit_id = cr.id
    WHERE cm.user_id = ? AND cm.status NOT IN ('left')
      AND cr.status IN ('recruiting', 'full', 'started')
      ${excludeRecruitId ? 'AND cr.id != ?' : ''}
    LIMIT 1
  `).get(...(excludeRecruitId ? [userId, excludeRecruitId] : [userId])) as { id: string } | undefined;
  return row?.id ?? null;
}

export function getUserActiveCoopBattleId(userId: string): string | null {
  const row = getDb().prepare(`
    SELECT cb.id FROM coop_battle_sessions cb
    JOIN coop_recruits cr ON cr.id = cb.recruit_id
    JOIN coop_members cm ON cm.recruit_id = cr.id
    WHERE cm.user_id = ? AND cm.status NOT IN ('left') AND cb.status IN ('active', 'resolving', 'pending')
    LIMIT 1
  `).get(userId) as { id: string } | undefined;
  return row?.id ?? null;
}

export function canCreateValhallaCoopRecruit(
  userId: string,
  monsterId: string,
): { ok: boolean; reason?: string } {
  if (!isValhallaBossMonster(monsterId)) {
    return { ok: false, reason: 'ヴァルハラ共闘対象外のボスです。' };
  }
  const gate = canEnterValhalla(userId);
  if (!gate.ok) return gate;
  if (getActiveBattle(userId)) return { ok: false, reason: '既に戦闘中です。' };
  if (getUserActiveCoopRecruitId(userId)) return { ok: false, reason: '既に別の共闘募集に参加中です。' };
  if (getUserActiveCoopBattleId(userId)) return { ok: false, reason: '協力戦中は新しい募集を作れません。' };
  if (!hasDefeatedMonster(userId, monsterId)) {
    return { ok: false, reason: '一度討伐してから共闘再戦できます。' };
  }
  return { ok: true };
}

export function canJoinValhallaCoopRecruit(userId: string): { ok: boolean; reason?: string; warn?: string } {
  if (!hasStoryFlag(userId, 'valhalla_unlocked')) {
    return { ok: false, reason: 'ヴァルハラ未解放のため参加できません。' };
  }
  if (getActiveBattle(userId)) return { ok: false, reason: '戦闘中は参加できません。' };
  if (getUserActiveCoopBattleId(userId)) return { ok: false, reason: '協力戦中は参加できません。' };
  const player = requirePlayer(userId);
  const warn = player.level < 80 ? `推奨Lv80（現在 Lv${player.level}）` : undefined;
  return { ok: true, warn };
}

export function formatValhallaCoopRecruitSummary(monsterId: string): string {
  const meta = VALHALLA_BOSS_REMATCH_META[monsterId as ValhallaBossId];
  return [
    '**ヴァルハラ共闘ボス募集**',
    `対象: **${meta?.label ?? monsterId}**`,
    '推奨Lv: 80以上',
    '参加人数: 1〜4人（2人で開始可）',
    '',
    '**報酬概要**',
    '・ヴァルハラ徽章 4〜8',
    '・EXP / Job EXP / Gold（再戦テーブル）',
    '・ヴァルハラ/旧王装備チャンス',
    '・無答の守護者の頁 4%',
    '※全員に個別報酬（MVP独占なし）',
  ].join('\n');
}

export function isValhallaCoopBossId(monsterId: string): boolean {
  return (VALHALLA_BOSS_MONSTER_IDS as readonly string[]).includes(monsterId);
}
