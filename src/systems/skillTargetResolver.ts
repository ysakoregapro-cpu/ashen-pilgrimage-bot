import type { SkillRow } from './skillSystem';

export type SkillTargetSide = 'enemy' | 'ally' | 'self' | 'none';

const ALLY_TARGETS = new Set(['ally', 'all_allies', 'cover']);
const ENEMY_TARGETS = new Set(['single_enemy', 'all_enemies', 'random_enemy', 'single', 'all']);

function normalizeTargetType(skill: SkillRow): string {
  return skill.target_type ?? 'single_enemy';
}

/** スキルが敵/味方/自分のどちら側を対象にするか */
export function resolveSkillTargetSide(skill: SkillRow): SkillTargetSide {
  const tt = normalizeTargetType(skill);
  const fx = skill.effect_type ?? '';

  if (tt === 'self' || tt === 'taunt') return 'self';
  if (ALLY_TARGETS.has(tt)) return 'ally';
  if (ENEMY_TARGETS.has(tt)) {
    if (tt === 'single' && skill.power <= 0 && !skill.break_power && !skill.status_effect) {
      if (fx === 'heal' || skill.skill_type === 'recovery') return 'ally';
      if (fx === 'guard' || fx === 'guard_strong' || skill.skill_type === 'guard') return 'self';
      return 'self';
    }
    return 'enemy';
  }

  if (skill.skill_type === 'recovery' || fx === 'heal') return 'ally';
  if (skill.skill_type === 'guard' || fx === 'guard' || fx === 'guard_strong') return 'self';
  if (skill.skill_type === 'support' && skill.power <= 0) return 'self';
  if (skill.power > 0 || (skill.break_power ?? 0) > 0 || skill.status_effect) return 'enemy';
  return 'self';
}

export function needsSkillTargetSelection(
  skill: SkillRow | undefined,
  opts?: { enemyCount?: number; action?: 'attack' | 'skill' | 'item' },
): boolean {
  if (opts?.action === 'item') return true;
  if (opts?.action === 'attack') return (opts.enemyCount ?? 1) > 1;
  if (!skill) return false;

  const side = resolveSkillTargetSide(skill);
  const tt = normalizeTargetType(skill);
  const enemies = opts?.enemyCount ?? 1;

  if (side === 'self' || side === 'none') return false;
  if (side === 'enemy') {
    if (tt === 'all_enemies' || tt === 'all') return false;
    return enemies > 1;
  }
  if (tt === 'all_allies') return false;
  return true;
}

export function allyButtonLabel(userId: string, selfUserId: string, playerName?: string | null): string {
  if (userId === selfUserId) return '自分';
  const name = (playerName ?? '').trim();
  if (name) return name.length > 20 ? `${name.slice(0, 18)}…` : name;
  return `味方${userId.slice(-4)}`;
}
