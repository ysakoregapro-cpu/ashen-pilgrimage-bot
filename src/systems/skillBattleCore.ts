/**
 * Solo/coop共通のスキル戦闘計算。
 * battleSystem と coopBattleSystem から利用する。
 */

/** AOE: 1体あたりダメージ倍率（同Lv単体火力の55〜75%目安） */
export const AOE_DAMAGE_MULT = 0.68;
import { roll } from '../utils/random';
import { calcPhysicalDamage } from './combatMath';
import { resolveSkillEffect } from '../db/seedData/skillEffectMaster';
import type { SkillRow } from './skillSystem';
import { requirePlayer } from './playerSystem';

export type StatBlock = {
  attack: number;
  magic: number;
  spirit: number;
  defense: number;
  speed: number;
  max_hp: number;
  crit_rate: number;
  crit_damage: number;
  level: number;
};

export function statBlockFromPlayer(userId: string): StatBlock {
  const p = requirePlayer(userId);
  return {
    attack: p.attack,
    magic: p.magic,
    spirit: p.spirit,
    defense: p.defense,
    speed: p.speed,
    max_hp: p.max_hp,
    crit_rate: p.crit_rate,
    crit_damage: p.crit_damage,
    level: p.level,
  };
}

export function getScalingStat(stats: StatBlock, stat: string): number {
  const map: Record<string, number> = {
    attack: stats.attack,
    magic: stats.magic,
    spirit: stats.spirit,
    defense: stats.defense,
    speed: stats.speed,
  };
  if (stat === 'attack_magic') return Math.floor((stats.attack + stats.magic) / 2);
  return map[stat] ?? stats.attack;
}

export function calcSkillHitDamage(
  stats: StatBlock,
  skill: SkillRow,
  enemyDefense: number,
  opts?: { hitRate?: number; atkBuff?: number; magBuff?: number; perHitMult?: number },
): { hit: boolean; damage: number; crit: boolean } {
  const isMag = ['magic', 'divine', 'machine', 'prayer'].includes(skill.skill_type);
  const def = isMag ? enemyDefense : enemyDefense;
  let stat = getScalingStat(stats, skill.scaling_stat);
  if (skill.secondary_scaling_stat) {
    stat = Math.floor((stat + getScalingStat(stats, skill.secondary_scaling_stat)) / 2);
  }
  const buff = isMag ? (opts?.magBuff ?? 0) : (opts?.atkBuff ?? 0);
  const mult = skill.power * (1 + buff) * (opts?.perHitMult ?? 1);
  const hitRate = opts?.hitRate ?? 0.92;
  if (!roll(hitRate + (skill.hit_bonus ?? 0))) return { hit: false, damage: 0, crit: false };
  const crit = roll(stats.crit_rate + (skill.crit_bonus ?? 0));
  let base = calcPhysicalDamage(stat, def, mult);
  if (crit) base = Math.floor(base * stats.crit_damage);
  return { hit: true, damage: Math.max(1, base), crit };
}

export function calcSkillHeal(stats: StatBlock, skill: SkillRow): number {
  return Math.floor(getScalingStat(stats, skill.scaling_stat) * skill.power + stats.level * 2);
}

export function resolveSkillEffectMeta(skill: SkillRow) {
  return resolveSkillEffect(skill.id, skill.effect_type, skill.status_effect);
}

/** coopで未実装のeffect_type — ログ用 */
export const COOP_PARTIAL_EFFECTS = new Set([
  'flee_buff', 'trap',
]);

export function isCoopFullySupportedSkill(skill: SkillRow): boolean {
  const fx = skill.effect_type ?? '';
  if (skill.skill_type === 'recovery' || fx === 'heal' || fx === 'guard' || fx === 'guard_strong') return true;
  if (fx === 'cure_poison' || fx === 'taunt' || skill.target_type === 'cover' || skill.target_type === 'taunt') return true;
  if (skill.power > 0 || skill.break_power > 0 || skill.status_effect) return true;
  if (COOP_PARTIAL_EFFECTS.has(fx)) return false;
  return skill.power > 0;
}
