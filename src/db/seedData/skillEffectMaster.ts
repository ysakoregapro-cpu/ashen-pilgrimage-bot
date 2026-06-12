/** Maps skill effect_type / status_effect → battle implementation keys */

export type StatusEffectKey =
  | 'poison' | 'burn' | 'slow' | 'bind' | 'silence' | 'blind'
  | 'defense_down' | 'attack_down' | 'magic_down' | 'spirit_down'
  | 'vulnerable' | 'guard_up' | 'regen';

export type SkillEffectDef = {
  implementationKey: string;
  statusEffect?: StatusEffectKey;
  statusChance?: number;
  statusDuration?: number;
  bossConversion?: 'weaken' | 'full' | 'none';
  implemented: boolean;
  logTemplate?: string;
};

/** effect_type → implementation */
export const EFFECT_TYPE_MAP: Record<string, SkillEffectDef> = {
  heal: { implementationKey: 'heal', implemented: true },
  guard: { implementationKey: 'guard', implemented: true },
  guard_strong: { implementationKey: 'guard_strong', implemented: true },
  cure_poison: { implementationKey: 'cure_poison', implemented: true },
  flee_buff: { implementationKey: 'flee_buff', implemented: true },
  mag_buff: { implementationKey: 'mag_buff', implemented: true },
  atk_buff: { implementationKey: 'atk_buff', implemented: true },
  def_buff: { implementationKey: 'def_buff', statusEffect: 'guard_up', statusDuration: 2, implemented: true },
  scan: { implementationKey: 'scan', implemented: true },
  trap: { implementationKey: 'trap', implemented: true },
  slow: { implementationKey: 'slow', statusEffect: 'slow', statusDuration: 2, implemented: true, logTemplate: '足が止まった。' },
  bind: { implementationKey: 'bind', statusEffect: 'bind', statusDuration: 1, bossConversion: 'weaken', implemented: true, logTemplate: '拘束した！' },
  taunt: { implementationKey: 'taunt', implemented: true },
};

/** status_effect column → implementation when no effect_type */
export const STATUS_EFFECT_MAP: Record<string, SkillEffectDef> = {
  poison: { implementationKey: 'poison', statusEffect: 'poison', statusDuration: 3, implemented: true, logTemplate: '毒を付与した。' },
  burn: { implementationKey: 'burn', statusEffect: 'burn', statusDuration: 3, implemented: true },
  silence: { implementationKey: 'silence', statusEffect: 'silence', statusDuration: 2, bossConversion: 'weaken', implemented: true },
  blind: { implementationKey: 'blind', statusEffect: 'blind', statusDuration: 2, implemented: true },
};

/** Per-skill overrides where desc differs from effect_type */
export const SKILL_OVERRIDES: Record<string, Partial<SkillEffectDef>> = {
  bs_bind_arrow: { implementationKey: 'bind', statusEffect: 'bind', statusDuration: 1, bossConversion: 'weaken', implemented: true, logTemplate: '足止め矢が敵の足を縛った。' },
  bs_binding_light: { implementationKey: 'bind', statusEffect: 'bind', statusDuration: 1, bossConversion: 'weaken', implemented: true, logTemplate: '光の繋ぎが敵を弱らせた。' },
  bs_shadow_stitch: { implementationKey: 'slow', statusEffect: 'slow', statusDuration: 2, implemented: true },
  bs_arc_jam: { implementationKey: 'slow', statusEffect: 'slow', statusDuration: 2, implemented: true },
  bs_ice_needle: { implementationKey: 'slow', statusEffect: 'slow', statusDuration: 1, statusChance: 0.6, implemented: true },
  bs_poison_blade: { implementationKey: 'poison', statusEffect: 'poison', statusDuration: 3, implemented: true },
};

export function resolveSkillEffect(skillId: string, effectType: string | null, statusEffect: string | null): SkillEffectDef {
  const base: SkillEffectDef = { implementationKey: 'damage', implemented: true };
  if (SKILL_OVERRIDES[skillId]) return { ...base, ...SKILL_OVERRIDES[skillId], implemented: true };
  if (effectType && EFFECT_TYPE_MAP[effectType]) return EFFECT_TYPE_MAP[effectType]!;
  if (statusEffect && STATUS_EFFECT_MAP[statusEffect]) return STATUS_EFFECT_MAP[statusEffect]!;
  return base;
}

/** Normalize legacy skill elements on seed */
export const SKILL_ELEMENT_DEFAULTS: Record<string, string> = {
  bs_ash_fire: 'fire',
  bs_ice_needle: 'ice',
  bs_star_bullet: 'light',
  bs_deep_thunder: 'thunder',
  bs_lamp_prayer: 'light',
  bs_binding_light: 'light',
  bs_shadow_strike: 'dark',
  bs_mini_cannon: 'machine',
  bs_deep_pierce: 'machine',
};
