/** 救難バトル — HP/攻撃補正（監査・戦闘共通） */
import { requirePlayer } from '../playerSystem';

export const RESCUE_ATK_MULT_BY_PLAYERS: Record<number, number> = {
  1: 1.0,
  2: 1.10,
  3: 1.18,
  4: 1.25,
};

/** 推奨Lvより参加者平均が低いほど敵火力を上げる */
export function rescueLevelGapAtkBonus(recommendedLevel: number, participantAvgLevel: number): number {
  const gap = Math.max(0, recommendedLevel - participantAvgLevel);
  if (gap >= 30) return 1.4;
  if (gap >= 20) return 1.25;
  if (gap >= 10) return 1.1;
  return 1.0;
}

export function rescueParticipantAtkMult(participantCount: number): number {
  const n = Math.min(4, Math.max(1, participantCount));
  return RESCUE_ATK_MULT_BY_PLAYERS[n] ?? 1.25;
}

export function averageParticipantLevel(userIds: string[]): number {
  if (!userIds.length) return 1;
  let sum = 0;
  for (const id of userIds) {
    sum += requirePlayer(id).level;
  }
  return sum / userIds.length;
}

export function computeRescueEnemyAttack(
  baseAttack: number,
  participantCount: number,
  recommendedLevel: number,
  participantLevels: number[],
): number {
  const avg = participantLevels.length
    ? participantLevels.reduce((a, b) => a + b, 0) / participantLevels.length
    : recommendedLevel;
  const mult = rescueParticipantAtkMult(participantCount) * rescueLevelGapAtkBonus(recommendedLevel, avg);
  return Math.max(1, Math.floor(baseAttack * mult));
}

/** 監査用 — 被ダメ推定（防御なし・takenMult=1） */
export function estimateRescueHitDamagePct(
  playerMaxHp: number,
  enemyAttack: number,
  playerDefense: number,
  threatHpPct = 0.12,
): { hpBased: number; statBased: number; total: number; hpLossPercent: number } {
  const hpBased = Math.floor(playerMaxHp * threatHpPct * 0.32);
  const statBased = Math.floor(Math.max(1, enemyAttack - playerDefense * 0.35) * 0.68);
  const total = Math.max(1, hpBased + statBased);
  return {
    hpBased,
    statBased,
    total,
    hpLossPercent: (total / Math.max(1, playerMaxHp)) * 100,
  };
}
