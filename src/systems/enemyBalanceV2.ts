/**
 * Phase2 enemy balance — central scaling tables (HP / offense / defense / speed / rewards).
 * Applied from scaleMonsterForBattle(); do not patch individual monster seeds ad hoc.
 */

export type BalanceThreatTier = 'normal' | 'tough' | 'rare' | 'elite' | 'boss';

export type TierScaleRow = {
  min: number;
  max: number;
  normal: number;
  tough: number;
  rare: number;
  elite: number;
  boss: number;
};

export const ENEMY_HP_SCALE_BY_LEVEL: TierScaleRow[] = [
  { min: 1, max: 10, normal: 1.25, tough: 1.35, rare: 1.45, elite: 1.60, boss: 1.80 },
  { min: 11, max: 25, normal: 1.45, tough: 1.65, rare: 1.85, elite: 2.10, boss: 2.40 },
  { min: 26, max: 40, normal: 1.75, tough: 2.05, rare: 2.35, elite: 2.70, boss: 3.10 },
  { min: 41, max: 55, normal: 2.10, tough: 2.55, rare: 3.00, elite: 3.50, boss: 4.00 },
  { min: 56, max: 70, normal: 2.50, tough: 3.10, rare: 3.70, elite: 4.40, boss: 5.00 },
  { min: 71, max: 100, normal: 3.20, tough: 4.00, rare: 4.80, elite: 5.80, boss: 6.80 },
];

export const ENEMY_OFFENSE_SCALE_BY_LEVEL: TierScaleRow[] = [
  { min: 1, max: 10, normal: 1.20, tough: 1.30, rare: 1.40, elite: 1.55, boss: 1.75 },
  { min: 11, max: 25, normal: 1.45, tough: 1.65, rare: 1.90, elite: 2.20, boss: 2.60 },
  { min: 26, max: 40, normal: 1.80, tough: 2.10, rare: 2.50, elite: 3.00, boss: 3.60 },
  { min: 41, max: 55, normal: 2.25, tough: 2.70, rare: 3.30, elite: 4.00, boss: 4.80 },
  { min: 56, max: 70, normal: 2.80, tough: 3.40, rare: 4.20, elite: 5.10, boss: 6.20 },
  { min: 71, max: 100, normal: 3.60, tough: 4.40, rare: 5.40, elite: 6.80, boss: 8.20 },
];

export const ENEMY_DEFENSE_SCALE_BY_LEVEL: TierScaleRow[] = [
  { min: 1, max: 10, normal: 1.10, tough: 1.20, rare: 1.30, elite: 1.45, boss: 1.60 },
  { min: 11, max: 25, normal: 1.25, tough: 1.45, rare: 1.65, elite: 1.90, boss: 2.20 },
  { min: 26, max: 40, normal: 1.45, tough: 1.75, rare: 2.05, elite: 2.40, boss: 2.80 },
  { min: 41, max: 55, normal: 1.70, tough: 2.10, rare: 2.50, elite: 3.00, boss: 3.50 },
  { min: 56, max: 70, normal: 2.00, tough: 2.50, rare: 3.00, elite: 3.70, boss: 4.40 },
  { min: 71, max: 100, normal: 2.40, tough: 3.00, rare: 3.70, elite: 4.60, boss: 5.50 },
];

export const ENEMY_SPEED_SCALE_BY_TYPE: Record<string, number> = {
  normal: 1.10,
  tough: 0.95,
  rare: 1.25,
  elite: 1.35,
  boss: 1.20,
  valhalla_normal: 1.25,
  valhalla_elite: 1.45,
  valhalla_boss: 1.35,
};

export const REWARD_SCALE_BY_TYPE: Record<string, number> = {
  normal: 1.10,
  tough: 1.20,
  rare: 1.35,
  elite: 1.50,
  boss: 1.60,
  valhalla: 1.75,
  raid: 2.00,
};

/** Damage formula tuning (Phase2 defense feel) */
export const DEFENSE_MITIGATION_COEFF = 0.68;
export const ENEMY_HP_DAMAGE_WEIGHT = 0.32;
export const ENEMY_STAT_DAMAGE_WEIGHT = 0.68;

export const ENEMY_HIT_PCT_V2: Record<BalanceThreatTier, { min: number; max: number }> = {
  normal: { min: 0.08, max: 0.14 },
  tough: { min: 0.10, max: 0.18 },
  rare: { min: 0.12, max: 0.22 },
  elite: { min: 0.15, max: 0.28 },
  boss: { min: 0.12, max: 0.25 },
};

function pickTierMult(level: number, threat: BalanceThreatTier, table: TierScaleRow[]): number {
  const lv = Math.max(1, Math.min(100, level));
  const row = table.find((r) => lv >= r.min && lv <= r.max) ?? table[table.length - 1]!;
  return row[threat];
}

export function getV2HpMult(level: number, threat: BalanceThreatTier): number {
  return pickTierMult(level, threat, ENEMY_HP_SCALE_BY_LEVEL);
}

export function getV2OffenseMult(level: number, threat: BalanceThreatTier): number {
  return pickTierMult(level, threat, ENEMY_OFFENSE_SCALE_BY_LEVEL);
}

export function getV2DefenseMult(level: number, threat: BalanceThreatTier): number {
  return pickTierMult(level, threat, ENEMY_DEFENSE_SCALE_BY_LEVEL);
}

export function getV2SpeedMult(threat: BalanceThreatTier, areaTag: string): number {
  const isValhalla = areaTag === 'valhalla' || areaTag === 'trial';
  if (isValhalla) {
    if (threat === 'elite') return ENEMY_SPEED_SCALE_BY_TYPE.valhalla_elite!;
    if (threat === 'boss') return ENEMY_SPEED_SCALE_BY_TYPE.valhalla_boss!;
    return ENEMY_SPEED_SCALE_BY_TYPE.valhalla_normal!;
  }
  return ENEMY_SPEED_SCALE_BY_TYPE[threat] ?? 1;
}

export function getBattleRewardMultipliers(opts: {
  threatTier: BalanceThreatTier;
  areaTag: string;
  isBoss: boolean;
  isRematch: boolean;
  isRaid?: boolean;
  partyRewardMult?: number;
}): { expMult: number; goldMult: number } {
  const party = opts.partyRewardMult ?? 1;
  if (opts.isRematch) {
    return { expMult: 0.55 * party, goldMult: 0.55 * party };
  }
  if (opts.isRaid) {
    const r = REWARD_SCALE_BY_TYPE.raid!;
    return { expMult: r * 0.85 * party, goldMult: r * party };
  }

  const isValhalla = opts.areaTag === 'valhalla';
  let base = REWARD_SCALE_BY_TYPE.normal!;
  if (opts.isBoss || opts.threatTier === 'boss') base = REWARD_SCALE_BY_TYPE.boss!;
  else if (opts.threatTier === 'elite') base = REWARD_SCALE_BY_TYPE.elite!;
  else if (opts.threatTier === 'rare') base = REWARD_SCALE_BY_TYPE.rare!;
  else if (opts.threatTier === 'tough') base = REWARD_SCALE_BY_TYPE.tough!;

  if (isValhalla) base = Math.max(base, REWARD_SCALE_BY_TYPE.valhalla!);

  // EXP slightly conservative; gold/material value emphasized
  return {
    expMult: base * 0.92 * party,
    goldMult: base * 1.15 * party,
  };
}

export type V2ScaledStats = {
  hp: number;
  attack: number;
  magic: number;
  defense: number;
  spirit: number;
  speed: number;
};

export function applyV2StatScalingFull(
  base: { hp: number; attack: number; magic: number; defense: number; spirit: number; speed: number },
  level: number,
  threat: BalanceThreatTier,
  areaTag: string,
  areaMult: { hp: number; atk: number; mag: number; def: number },
): V2ScaledStats {
  const hpM = getV2HpMult(level, threat);
  const offM = getV2OffenseMult(level, threat);
  const defM = getV2DefenseMult(level, threat);
  const spdM = getV2SpeedMult(threat, areaTag);

  return {
    hp: Math.max(1, Math.floor(base.hp * areaMult.hp * hpM)),
    attack: Math.max(1, Math.floor(base.attack * areaMult.atk * offM)),
    magic: Math.max(0, Math.floor(base.magic * areaMult.mag * offM)),
    defense: Math.max(0, Math.floor(base.defense * areaMult.def * defM)),
    spirit: Math.max(0, Math.floor(base.spirit * areaMult.def * defM * 0.95)),
    speed: Math.max(1, Math.floor(base.speed * spdM)),
  };
}
