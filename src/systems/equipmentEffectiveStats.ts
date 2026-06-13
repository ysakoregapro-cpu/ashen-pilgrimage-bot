import { DURABILITY_PENALTY, type DurabilityState } from '../types';
import { calcUpgradeStatBonuses, getPrimaryStatKey, type EquipStatRow } from './enhanceSystem';
import { getAwakeningStatFlatBonus } from './awakeningSystem';
import { applyStatRollMultiplier, loadEquipmentRollFromRow } from './equipmentAffixSystem';
import {
  WEAPON_ROLE_BY_TYPE,
  armorDisplayStatKeys,
  statLabel,
  type WeaponRoleEntry,
} from '../db/seedData/weaponRoleStatMap';

export type EquipmentEffectiveStats = {
  attack: number;
  magic: number;
  defense: number;
  spirit: number;
  speed: number;
  hp: number;
  mp: number;
  accuracy: number;
  crit_rate: number;
};

export type EquipmentStatsInput = {
  rarity: string;
  upgrade_level: number;
  src_level: number;
  awakening_level: number;
  durability_state: string;
  affix_json?: string | null;
  stat_roll_json?: string | null;
  attack_bonus: number;
  magic_bonus: number;
  defense_bonus: number;
  spirit_bonus: number;
  speed_bonus: number;
  hp_bonus: number;
  mp_bonus: number;
  accuracy_bonus: number;
  crit_rate_bonus: number;
  weapon_type: string | null;
  slot: string;
};

/** Src武器は src_level が正。旧データで upgrade_level のみ入っている場合を正規化 */
export function resolveEquipmentEnhanceLevels(input: Pick<EquipmentStatsInput, 'rarity' | 'upgrade_level' | 'src_level'>): {
  upgrade_level: number;
  src_level: number;
} {
  if (input.rarity !== 'Src') {
    return { upgrade_level: input.upgrade_level ?? 0, src_level: input.src_level ?? 0 };
  }
  const srcLv = Math.max(input.src_level ?? 0, input.upgrade_level ?? 0);
  return { upgrade_level: 0, src_level: srcLv };
}

function durPenalty(state: string): number {
  return DURABILITY_PENALTY[(state as DurabilityState) ?? '良好'] ?? 1;
}

/** 装備単体の実効ステータス（職業補正・セット補正は含めない） */
export function getEquipmentEffectiveStats(input: EquipmentStatsInput): EquipmentEffectiveStats {
  const pen = durPenalty(input.durability_state);
  const levels = resolveEquipmentEnhanceLevels(input);
  const eqRow: EquipStatRow = {
    attack_bonus: input.attack_bonus,
    magic_bonus: input.magic_bonus,
    defense_bonus: input.defense_bonus,
    spirit_bonus: input.spirit_bonus,
    speed_bonus: input.speed_bonus,
    hp_bonus: input.hp_bonus,
    weapon_type: input.weapon_type,
    slot: input.slot,
  };
  const upgraded = calcUpgradeStatBonuses(
    eqRow,
    levels.upgrade_level,
    levels.src_level,
    pen,
    input.rarity,
  );
  const roll = loadEquipmentRollFromRow(input);
  const mults = roll?.statRoll?.multipliers ?? {};

  const stats: EquipmentEffectiveStats = {
    attack: applyStatRollMultiplier(upgraded.attack, mults.attack),
    magic: applyStatRollMultiplier(upgraded.magic, mults.magic),
    defense: applyStatRollMultiplier(upgraded.defense, mults.defense),
    spirit: upgraded.spirit,
    speed: applyStatRollMultiplier(upgraded.speed, mults.speed),
    hp: applyStatRollMultiplier(upgraded.hp, mults.hp),
    mp: applyStatRollMultiplier(Math.floor(input.mp_bonus * pen), mults.mp),
    accuracy: input.accuracy_bonus,
    crit_rate: applyStatRollMultiplier(input.crit_rate_bonus, mults.crit),
  };

  const primary = getPrimaryStatKey(eqRow);
  const awBonus = getAwakeningStatFlatBonus(input.awakening_level ?? 0, primary);
  if (awBonus > 0) {
    stats[primary] += awBonus;
    stats.hp += awBonus;
  }

  return stats;
}

/** 【性能】行末の注記 */
export function getEffectiveStatSuffix(input: Pick<EquipmentStatsInput, 'rarity' | 'upgrade_level' | 'src_level' | 'awakening_level'>): string {
  const levels = resolveEquipmentEnhanceLevels(input);
  if (input.rarity === 'Src' && levels.src_level > 0) return '（Src強化込み）';
  if (levels.upgrade_level > 0 && (input.awakening_level ?? 0) > 0) return '（強化・覚醒込み）';
  if (levels.upgrade_level > 0) return '（強化込み）';
  return '';
}

function displayKeysFor(input: EquipmentStatsInput, stats: EquipmentEffectiveStats): string[] {
  if (input.slot === 'weapon' && input.weapon_type) {
    const role = WEAPON_ROLE_BY_TYPE[input.weapon_type];
    if (role) {
      return role.display_stat_keys.filter((k) => {
        const v = stats[k as keyof EquipmentEffectiveStats];
        return typeof v === 'number' && v !== 0;
      });
    }
  }
  return armorDisplayStatKeys(stats as unknown as Record<string, number>);
}

/** 【性能】ブロック用の行配列 */
export function formatEffectiveStatLines(input: EquipmentStatsInput, stats?: EquipmentEffectiveStats): string[] {
  const eff = stats ?? getEquipmentEffectiveStats(input);
  const suffix = getEffectiveStatSuffix(input);
  const keys = displayKeysFor(input, eff);
  if (!keys.length) return ['—'];

  return keys.map((k) => {
    const val = eff[k as keyof EquipmentEffectiveStats];
    const label = statLabel(k);
    if (suffix) return `${label} +${val}${suffix}`;
    return `${label} +${val}`;
  });
}

export function getWeaponRoleEntry(weaponType: string | null): WeaponRoleEntry | undefined {
  if (!weaponType) return undefined;
  return WEAPON_ROLE_BY_TYPE[weaponType];
}
