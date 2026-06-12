/**
 * Phase4: スキルMPコスト設計 — 習得Lv・威力・効果種別からMPを算出。
 */
import {
  ALL_JOB_SKILLS,
  JOB_SKILL_UNLOCKS,
  resolveSkillTargetType,
  type BattleSkillDef,
} from '../db/seedData/jobSkillData';

export function learnLevelForSkill(skillId: string, job: string): number {
  const row = JOB_SKILL_UNLOCKS[job]?.find((u) => u.skillId === skillId);
  return row?.level ?? 1;
}

function isUtilitySkill(s: BattleSkillDef): boolean {
  return (
    s.skill_type === 'recovery'
    || s.skill_type === 'guard'
    || s.skill_type === 'support'
    || !!s.effect_type
    || !!s.status_effect
    || (s.break_power ?? 0) > 0 && s.power <= 0
  );
}

/** 職業スキル（bs_*）の推奨MP */
export function designSkillMpCost(s: BattleSkillDef, learnLevel?: number): number {
  const lv = learnLevel ?? learnLevelForSkill(s.id, s.job);
  const target = resolveSkillTargetType(s);
  const hits = s.hits ?? 1;
  const power = s.power;
  const utility = isUtilitySkill(s);

  let mp = 0;
  if (lv <= 10) mp = 4 + Math.floor(lv * 0.7);
  else if (lv <= 25) mp = 11 + Math.floor((lv - 10) * 0.85);
  else if (lv <= 40) mp = 24 + Math.floor((lv - 25) * 0.95);
  else if (lv <= 60) mp = 38 + Math.floor((lv - 40) * 1.05);
  else if (lv <= 70) mp = 59 + Math.floor((lv - 60) * 2.8);
  else mp = 88;

  if (power >= 1.65) mp += 18;
  else if (power >= 1.45) mp += 14;
  else if (power >= 1.25) mp += 8;
  else if (power >= 1.1 && !utility) mp += 4;

  if (hits >= 2 && target !== 'all_enemies') mp += (hits - 1) * 4;
  if (target === 'all_enemies') mp += 14 + Math.floor(lv * 0.15);

  if (s.skill_type === 'recovery' || s.effect_type === 'heal') mp += 10 + Math.floor(power * 8);
  if (s.id.includes('revive') || s.name.includes('蘇生')) mp += 28;
  if (s.effect_type === 'guard_strong') mp += 10;
  if (s.effect_type === 'guard') mp += 4;
  if (s.target_type === 'cover' || s.target_type === 'taunt' || s.effect_type === 'taunt') mp += 8;
  if (s.status_effect || s.effect_type === 'slow' || s.effect_type === 'bind') mp += 5;
  if ((s.break_power ?? 0) >= 30) mp += 6;
  if ((s.crit_bonus ?? 0) >= 0.15) mp += 5;
  if ((s.hit_bonus ?? 0) >= 0.08) mp += 4;
  if (s.skill_type === 'special' && lv >= 70) mp = Math.max(mp, 62);

  // 低Lv基本技は抑える
  if (lv <= 8 && power <= 1.05 && !s.status_effect && !s.effect_type && hits <= 1) {
    mp = Math.min(mp, 8);
  }
  if (power === 0 && !s.status_effect && !(s.break_power ?? 0)) {
    mp = Math.max(4, mp - 6);
  }

  if (lv >= 70 && s.skill_type === 'special') mp = Math.min(90, Math.max(58, mp));
  if (lv >= 60 && power >= 1.4 && target === 'single_enemy') mp = Math.max(mp, 42);

  return Math.max(3, Math.round(mp));
}

/** legacy skill_*（Src/装備）の推奨MP */
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

/** 全bs_*スキルの設計MPマップ */
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
