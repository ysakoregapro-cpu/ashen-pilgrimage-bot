/**
 * スキルMPコスト設計 — 通常攻撃等価値・最大MP比・習得Lv帯から算出。
 * 魔術師/祈祷師の一律軽減は行わない（必要ならMPを増やす）。
 */
import {
  ALL_JOB_SKILLS,
  JOB_SKILL_UNLOCKS,
  resolveSkillTargetType,
  type BattleSkillDef,
} from '../db/seedData/jobSkillData';
import { computeExpectedMaxMp } from './combatMp';
import { AOE_DAMAGE_MULT } from './skillBattleCore';

export const JOB_MP_MOD: Record<string, number> = {
  剣士: 5, 重騎士: -8, 狩人: 8, 魔術師: 22, 祈祷師: 18,
  斥候: 3, 機工師: 8, 格闘士: -5, 巡礼者: 10,
};

export const MAGIC_JOBS = new Set(['魔術師', '祈祷師']);
export const AOE_TARGET_MULT = 2.1;

export const MP_RESTORE_ITEMS = {
  drop: 25,
  vial: 60,
  flask: 110,
  valhalla: 170,
} as const;

export type MpCostTier = 'low' | 'main' | 'high' | 'ultimate' | 'utility';

export function learnLevelForSkill(skillId: string, job: string): number {
  const row = JOB_SKILL_UNLOCKS[job]?.find((u) => u.skillId === skillId);
  return row?.level ?? 1;
}

export function levelBandForLearnLevel(learnLv: number): { label: string; evalLevel: number } {
  if (learnLv <= 12) return { label: 'Lv30', evalLevel: 30 };
  if (learnLv <= 28) return { label: 'Lv30', evalLevel: 30 };
  if (learnLv <= 45) return { label: 'Lv50', evalLevel: 50 };
  if (learnLv <= 62) return { label: 'Lv50', evalLevel: 50 };
  if (learnLv <= 72) return { label: 'Lv70', evalLevel: 70 };
  if (learnLv <= 85) return { label: 'Lv80', evalLevel: 80 };
  return { label: 'Lv100', evalLevel: 100 };
}

export function expectedMaxMpForJob(job: string, evalLevel: number): number {
  return computeExpectedMaxMp(evalLevel, JOB_MP_MOD[job] ?? 0, 0);
}

function isUtilitySkill(s: BattleSkillDef): boolean {
  return (
    s.skill_type === 'recovery'
    || s.skill_type === 'guard'
    || s.skill_type === 'support'
    || !!s.effect_type
    || !!s.status_effect
    || ((s.break_power ?? 0) > 0 && s.power <= 0)
  );
}

/** 通常攻撃=1.0 の action value（範囲は期待対象数込み） */
export function estimateActionValue(s: BattleSkillDef): number {
  const target = resolveSkillTargetType(s);
  const hits = s.hits ?? 1;
  const power = s.power;

  if (power <= 0) {
    if (s.skill_type === 'recovery' || s.effect_type === 'heal') return 0.4 + power * 2.5;
    if (s.effect_type === 'guard_strong') return 1.8;
    if (s.effect_type === 'guard' || s.skill_type === 'guard') return 1.15;
    if ((s.break_power ?? 0) >= 25) return 1.35;
    if (s.status_effect || s.effect_type === 'slow' || s.effect_type === 'bind') return 1.0;
    if (s.target_type === 'cover' || s.effect_type === 'taunt') return 1.1;
    return 0.75;
  }

  if (target === 'all_enemies') {
    return power * hits * AOE_DAMAGE_MULT * AOE_TARGET_MULT;
  }

  let val = power * hits;
  if (s.crit_bonus) val += s.crit_bonus * 0.45;
  if (s.hit_bonus && s.hit_bonus > 0) val += s.hit_bonus * 0.35;
  if (s.break_power) val += (s.break_power / 100) * 0.75;
  return val;
}

export function classifyMpCostTier(s: BattleSkillDef, learnLv: number, actionValue: number): MpCostTier {
  if (s.skill_type === 'special' || (learnLv >= 70 && s.power >= 1.35)) return 'ultimate';
  if (isUtilitySkill(s) && s.power <= 0 && s.skill_type !== 'break') return 'utility';
  if (s.id.includes('revive') || s.name.includes('蘇生')) return 'utility';

  const target = resolveSkillTargetType(s);
  if (target === 'all_enemies') return actionValue >= 2.0 ? 'high' : 'main';
  if (actionValue >= 2.35) return 'high';
  if (actionValue >= 1.55) return 'main';
  return 'low';
}

function utilityMpPercent(s: BattleSkillDef, evalLevel: number): number {
  if (s.id.includes('revive') || s.name.includes('蘇生')) return 0.22;
  if (s.skill_type === 'recovery' || (s.effect_type === 'heal' && s.power > 0)) {
    if (s.power <= 0.3) return 0.065;
    if (s.power <= 0.45) return 0.095;
    if (s.power <= 0.55) return 0.115;
    return 0.135;
  }
  if (s.effect_type === 'guard_strong') return 0.09;
  if (s.effect_type === 'guard' || s.skill_type === 'guard') return 0.055;
  if (s.target_type === 'cover' || s.effect_type === 'taunt') return 0.065;
  if (s.status_effect || s.effect_type === 'slow') return 0.06;
  if (s.skill_type === 'break' && s.power <= 0) return 0.055;
  return 0.05 + Math.min(0.03, evalLevel / 500);
}

function baseTierMpPercent(tier: MpCostTier): number {
  switch (tier) {
    case 'low': return 0.055;
    case 'main': return 0.085;
    case 'high': return 0.15;
    case 'ultimate': return 0.24;
    case 'utility': return 0.07;
    default: return 0.08;
  }
}

function enforceMagicJobMp(
  mp: number, tier: MpCostTier, evalLevel: number, s: BattleSkillDef,
): number {
  const target = resolveSkillTargetType(s);
  if (tier === 'ultimate') return Math.min(90, Math.max(65, mp));
  if (tier === 'high' || target === 'all_enemies') {
    if (evalLevel >= 70) return Math.min(60, Math.max(40, mp));
    if (evalLevel >= 50) return Math.min(42, Math.max(28, mp));
    return Math.min(28, Math.max(18, mp));
  }
  if (tier === 'main') {
    if (evalLevel >= 70) return Math.min(34, Math.max(24, mp));
    if (evalLevel >= 50) return Math.min(24, Math.max(16, mp));
    return Math.min(16, Math.max(10, mp));
  }
  if (tier === 'low' && s.power > 0) return Math.min(14, Math.max(6, mp));
  return mp;
}

function enforcePhysicalUltimate(mp: number, tier: MpCostTier): number {
  if (tier === 'ultimate') return Math.min(90, Math.max(55, mp));
  return mp;
}

function enforceRotationFloor(
  job: string, mp: number, tier: MpCostTier, learnLv: number,
): number {
  if (tier !== 'main' && tier !== 'high') return mp;
  const perCast = tier === 'main'
    ? (MAGIC_JOBS.has(job) ? 0.078 : 0.075)
    : 0.1125;
  const capRatio = tier === 'main' ? 0.1125 : 0.1625;
  let out = mp;
  for (const usageLevel of [30, 50, 70, 80] as const) {
    if (learnLv > usageLevel + 5) continue;
    if (usageLevel < 50 && learnLv < 18) continue;
    if (usageLevel < 70 && learnLv < 32) continue;
    if (usageLevel < 80 && learnLv < 45) continue;
    const maxMp = expectedMaxMpForJob(job, usageLevel);
    const floor = Math.round(maxMp * perCast);
    const cap = Math.round(maxMp * capRatio);
    out = Math.min(cap, Math.max(out, floor));
  }
  return out;
}

function enforceEarlySkillLateScaling(
  job: string, mp: number, tier: MpCostTier, learnLv: number, s: BattleSkillDef,
): number {
  if (tier !== 'low' || s.power < 1.1 || learnLv > 25) return mp;
  if (resolveSkillTargetType(s) === 'all_enemies') return mp;
  let out = mp;
  for (const ul of [50, 70, 80] as const) {
    out = Math.max(out, Math.round(expectedMaxMpForJob(job, ul) * 0.055));
  }
  return out;
}

function enforceLateLowTierRotation(
  job: string, mp: number, tier: MpCostTier, learnLv: number, s: BattleSkillDef,
): number {
  if (tier !== 'low' || learnLv < 40 || s.power < 1.15) return mp;
  if (resolveSkillTargetType(s) === 'all_enemies') return mp;
  const perCast = MAGIC_JOBS.has(job) ? 0.078 : 0.075;
  let out = mp;
  for (const ul of [50, 70, 80] as const) {
    if (learnLv > ul + 5) continue;
    out = Math.max(out, Math.round(expectedMaxMpForJob(job, ul) * perCast));
  }
  return out;
}

function enforceEarlySkillCap(mp: number, learnLv: number, tier: MpCostTier, s: BattleSkillDef): number {
  if (learnLv <= 8 && tier === 'low' && s.power > 0 && s.power <= 1.05) {
    return Math.min(8, Math.max(4, mp));
  }
  return mp;
}

/** 職業スキル（bs_*）の設計MP */
export function designSkillMpCost(s: BattleSkillDef, learnLevel?: number): number {
  const learnLv = learnLevel ?? learnLevelForSkill(s.id, s.job);
  const band = levelBandForLearnLevel(learnLv);
  const maxMp = expectedMaxMpForJob(s.job, band.evalLevel);
  const actionValue = estimateActionValue(s);
  const tier = classifyMpCostTier(s, learnLv, actionValue);

  let pct = tier === 'utility'
    ? utilityMpPercent(s, band.evalLevel)
    : baseTierMpPercent(tier);

  if (MAGIC_JOBS.has(s.job) && tier !== 'utility' && s.power > 0) {
    pct += 0.01;
  }

  let mp = Math.round(maxMp * pct);

  if (MAGIC_JOBS.has(s.job) && s.power > 0) {
    mp = enforceMagicJobMp(mp, tier, band.evalLevel, s);
  } else {
    mp = enforcePhysicalUltimate(mp, tier);
  }

  mp = enforceEarlySkillCap(mp, learnLv, tier, s);
  mp = enforceEarlySkillLateScaling(s.job, mp, tier, learnLv, s);
  mp = enforceLateLowTierRotation(s.job, mp, tier, learnLv, s);

  if (tier === 'utility' && s.skill_type === 'break' && s.power > 0) {
    mp = Math.max(mp, Math.round(maxMp * 0.075));
  }

  if (s.skill_type === 'break' && (s.break_power ?? 0) >= 28 && s.power >= 0.75) {
    mp = Math.max(mp, Math.round(maxMp * 0.08));
  }

  mp = enforceRotationFloor(s.job, mp, tier, learnLv);

  return Math.max(3, mp);
}

/** legacy skill_*（Src/装備）の推奨MP — 変更最小 */
export function designLegacySkillMpCost(opts: {
  power: number;
  type: string;
  breakP?: number;
  isSrc?: boolean;
  isUltimate?: boolean;
}): number {
  let mp = 12;
  if (opts.isUltimate) mp = 110;
  else if (opts.isSrc) mp = opts.power >= 1.4 ? 95 : 65;
  else if (opts.power >= 1.4) mp = 45;
  else if (opts.power >= 1.2) mp = 32;
  else if (opts.power >= 1.0) mp = 22;
  else if (opts.type === 'heal') mp = 35;
  else if (opts.type === 'buff' || opts.type === 'special') mp = 28;
  if ((opts.breakP ?? 0) >= 20) mp += 8;
  if (opts.isSrc && opts.isUltimate) mp = Math.min(150, mp + 20);
  return Math.max(0, Math.round(mp));
}

export function buildDesignedMpMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of ALL_JOB_SKILLS) {
    map.set(s.id, designSkillMpCost(s));
  }
  return map;
}

export function classifySkillEffect(s: BattleSkillDef): string {
  const target = resolveSkillTargetType(s);
  if (target === 'all_enemies') return 'aoe';
  if (s.skill_type === 'recovery' || s.effect_type === 'heal') return 'heal';
  if (s.id.includes('revive') || s.name.includes('蘇生')) return 'revive';
  if (s.effect_type === 'guard_strong') return 'strong_guard';
  if (s.effect_type === 'guard' || s.skill_type === 'guard') return 'guard';
  if (s.target_type === 'cover') return 'cover';
  if (s.target_type === 'taunt' || s.effect_type === 'taunt') return 'taunt';
  if (s.status_effect || s.effect_type === 'slow' || s.effect_type === 'bind') return 'status';
  if ((s.break_power ?? 0) >= 25) return 'break';
  if (s.skill_type === 'support') return 'support';
  if (s.power >= 1.3) return 'high_damage';
  if (s.power > 0) return 'damage';
  return 'utility';
}

export function skillDesignMeta(s: BattleSkillDef, learnLevel?: number) {
  const learnLv = learnLevel ?? learnLevelForSkill(s.id, s.job);
  const band = levelBandForLearnLevel(learnLv);
  const maxMp = expectedMaxMpForJob(s.job, band.evalLevel);
  const actionValue = estimateActionValue(s);
  const tier = classifyMpCostTier(s, learnLv, actionValue);
  const mpAfter = designSkillMpCost(s, learnLv);
  return {
    learnLv,
    band,
    maxMp,
    actionValue,
    tier,
    mpAfter,
    valuePerMp: mpAfter > 0 ? actionValue / mpAfter : 0,
    mpPercent: maxMp > 0 ? (mpAfter / maxMp) * 100 : 0,
    normalAttackRatio: actionValue,
  };
}

export function pickMainSkillForJob(job: string, evalLevel: number): BattleSkillDef | null {
  type Cand = { s: BattleSkillDef; lv: number; action: number };
  const cands: Cand[] = [];
  for (const s of ALL_JOB_SKILLS) {
    if (s.job !== job || s.power <= 0) continue;
    if (resolveSkillTargetType(s) === 'all_enemies') continue;
    const lv = learnLevelForSkill(s.id, job);
    if (lv > evalLevel) continue;
    const meta = skillDesignMeta(s, lv);
    if (meta.tier === 'ultimate') continue;
    if (meta.actionValue < 1.05) continue;
    cands.push({ s, lv, action: meta.actionValue });
  }
  if (!cands.length) return null;
  const bandMin = Math.max(1, evalLevel - 22);
  const inBand = cands.filter((c) => c.lv >= bandMin);
  const pool = inBand.length ? inBand : cands;
  pool.sort((a, b) => b.lv - a.lv || b.action - a.action);
  return pool[0]!.s;
}

export function pickBurstSkillForJob(job: string, evalLevel: number): BattleSkillDef | null {
  let best: { s: BattleSkillDef; score: number } | null = null;
  for (const s of ALL_JOB_SKILLS) {
    if (s.job !== job || s.power <= 0) continue;
    const lv = learnLevelForSkill(s.id, job);
    if (lv > evalLevel) continue;
    const meta = skillDesignMeta(s, lv);
    if (meta.tier !== 'high' && meta.tier !== 'ultimate') continue;
    const score = meta.actionValue;
    if (!best || score > best.score) best = { s, score };
  }
  return best?.s ?? null;
}
