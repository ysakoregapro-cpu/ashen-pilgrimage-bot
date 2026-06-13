/** Phase2.5 — 防具/アクセ ランダム個体差・厳選スキル定義 */

export type AffixRollSource =
  | 'explore_drop'
  | 'chest'
  | 'battle_reward'
  | 'boss_reward'
  | 'rematch_reward'
  | 'valhalla_reward'
  | 'raid_reward'
  | 'event_reward'
  | 'valhalla_test_godroll';

export type EquipmentAffixKind = 'param' | 'damage_reduction' | 'damage_dealt';

export type AffixPrimaryKey =
  | 'hp_percent'
  | 'mp_percent'
  | 'attack_percent'
  | 'magic_percent'
  | 'defense_percent'
  | 'speed_percent'
  | 'crit_percent'
  | 'damage_dealt_percent'
  | 'damage_taken_reduction_percent';

export type AffixDrawbackKey =
  | 'hp_down_percent'
  | 'mp_down_percent'
  | 'attack_down_percent'
  | 'magic_down_percent'
  | 'defense_down_percent'
  | 'speed_down_percent'
  | 'damage_dealt_down_percent'
  | 'damage_taken_increase_percent';

export type EquipmentAffixEntry = {
  key: AffixPrimaryKey;
  label: string;
  value: number;
  drawbackKey: AffixDrawbackKey | null;
  drawbackValue: number;
};

export type EquipmentStatRoll = {
  quality: number;
  multipliers: Partial<Record<'hp' | 'mp' | 'attack' | 'magic' | 'defense' | 'speed' | 'crit', number>>;
};

export type EquipmentRollPayload = {
  statRoll: EquipmentStatRoll;
  affixes: EquipmentAffixEntry[];
  rollSource: AffixRollSource | string;
  rolledAt: string;
};

export const AFFIX_ROLL_SOURCES: AffixRollSource[] = [
  'explore_drop', 'chest', 'battle_reward', 'boss_reward', 'rematch_reward',
  'valhalla_reward', 'raid_reward', 'event_reward',
];

export const STAT_ROLL_RANGES: Record<string, [number, number]> = {
  N: [0.98, 1.02],
  R: [0.97, 1.03],
  SR: [0.95, 1.05],
  SSR: [0.92, 1.08],
  UR: [0.90, 1.10],
};

export const AFFIX_VALUE_CAPS: Record<string, number> = {
  N: 2.0, R: 3.0, SR: 4.5, SSR: 7.0, UR: 7.0,
};

export const SKILL_COUNT_WEIGHTS: Record<string, Array<{ count: number; weight: number }>> = {
  N: [{ count: 0, weight: 88 }, { count: 1, weight: 12 }],
  R: [{ count: 0, weight: 80 }, { count: 1, weight: 20 }],
  SR: [{ count: 0, weight: 68 }, { count: 1, weight: 32 }],
  SSR: [{ count: 0, weight: 40 }, { count: 1, weight: 45 }, { count: 2, weight: 15 }],
  UR: [{ count: 0, weight: 30 }, { count: 1, weight: 48 }, { count: 2, weight: 22 }],
};

export const SKILL_COUNT_WEIGHTS_VALHALLA_RAID: Record<string, Array<{ count: number; weight: number }>> = {
  SSR: [{ count: 0, weight: 35 }, { count: 1, weight: 47 }, { count: 2, weight: 18 }],
  UR: [{ count: 0, weight: 25 }, { count: 1, weight: 50 }, { count: 2, weight: 25 }],
};

export const AFFIX_KIND_WEIGHTS: Array<{ kind: EquipmentAffixKind; weight: number }> = [
  { kind: 'param', weight: 72 },
  { kind: 'damage_reduction', weight: 18 },
  { kind: 'damage_dealt', weight: 10 },
];

export const PARAM_AFFIX_KEYS: AffixPrimaryKey[] = [
  'hp_percent', 'mp_percent', 'attack_percent', 'magic_percent',
  'defense_percent', 'speed_percent', 'crit_percent',
];

export const AFFIX_LABELS: Record<AffixPrimaryKey | AffixDrawbackKey, string> = {
  hp_percent: 'HP',
  mp_percent: 'MP',
  attack_percent: '攻撃',
  magic_percent: '魔力',
  defense_percent: '防御',
  speed_percent: '速度',
  crit_percent: '会心',
  damage_dealt_percent: '与ダメージ',
  damage_taken_reduction_percent: '被ダメージ軽減',
  hp_down_percent: 'HP',
  mp_down_percent: 'MP',
  attack_down_percent: '攻撃',
  magic_down_percent: '魔力',
  defense_down_percent: '防御',
  speed_down_percent: '速度',
  damage_dealt_down_percent: '与ダメージ',
  damage_taken_increase_percent: '被ダメージ',
};

const SSR_UR_VALUE_BANDS: Array<{ min: number; max: number; weight: number }> = [
  { min: 0.1, max: 1.0, weight: 32.0 },
  { min: 1.1, max: 2.0, weight: 26.0 },
  { min: 2.1, max: 3.0, weight: 18.0 },
  { min: 3.1, max: 4.4, weight: 16.0 },
  { min: 4.5, max: 5.4, weight: 6.2 },
  { min: 5.5, max: 6.4, weight: 1.5 },
  { min: 6.5, max: 6.9, weight: 0.28 },
  { min: 7.0, max: 7.0, weight: 0.02 },
];

const DRAWBACK_VALUE_BANDS: Array<{ min: number; max: number; weight: number }> = [
  { min: 0.5, max: 2.0, weight: 45 },
  { min: 2.1, max: 3.5, weight: 35 },
  { min: 3.6, max: 4.5, weight: 17 },
  { min: 4.6, max: 5.0, weight: 3 },
];

const DRAWBACK_KEYS: AffixDrawbackKey[] = [
  'hp_down_percent', 'mp_down_percent', 'attack_down_percent', 'magic_down_percent',
  'defense_down_percent', 'speed_down_percent', 'damage_dealt_down_percent', 'damage_taken_increase_percent',
];

export function roundAffixValue(v: number): number {
  return Math.round(v * 10) / 10;
}

function pickWeighted<T extends { weight: number }>(items: T[], rng = Math.random): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1]!;
}

function rollInBand(min: number, max: number, rng = Math.random): number {
  if (min === max) return min;
  const steps = Math.round((max - min) * 10) + 1;
  const step = Math.floor(rng() * steps);
  return roundAffixValue(min + step * 0.1);
}

export function rollAffixValue(rarity: string, rng = Math.random): number {
  const cap = AFFIX_VALUE_CAPS[rarity] ?? 2.0;
  if (['SSR', 'UR'].includes(rarity)) {
    const band = pickWeighted(SSR_UR_VALUE_BANDS, rng);
    return rollInBand(band.min, Math.min(band.max, cap), rng);
  }
  const tierRoll = rng();
  let min = 0.1;
  let max = cap;
  if (tierRoll < 0.55) max = cap * 0.4 + 0.1;
  else if (tierRoll < 0.90) { min = cap * 0.35; max = cap * 0.75; }
  else { min = cap * 0.7; max = cap; }
  return Math.min(cap, rollInBand(min, max, rng));
}

export function rollDrawbackValue(primaryValue: number, rng = Math.random): number {
  const band = pickWeighted(DRAWBACK_VALUE_BANDS, rng);
  const raw = rollInBand(band.min, band.max, rng);
  return roundAffixValue(Math.min(raw, primaryValue, 5.0));
}

export function rollSkillCount(
  rarity: string,
  opts?: { valhallaOrRaid?: boolean },
  rng = Math.random,
): number {
  const table = (opts?.valhallaOrRaid && SKILL_COUNT_WEIGHTS_VALHALLA_RAID[rarity])
    ? SKILL_COUNT_WEIGHTS_VALHALLA_RAID[rarity]!
    : (SKILL_COUNT_WEIGHTS[rarity] ?? SKILL_COUNT_WEIGHTS.N!);
  return pickWeighted(table, rng).count;
}

export function rollAffixKind(rng = Math.random): EquipmentAffixKind {
  return pickWeighted(AFFIX_KIND_WEIGHTS, rng).kind;
}

export function pickParamAffixKey(
  available: AffixPrimaryKey[],
  used: Set<AffixPrimaryKey>,
  rng = Math.random,
): AffixPrimaryKey {
  const pool = available.filter((k) => !used.has(k));
  const keys = pool.length ? pool : PARAM_AFFIX_KEYS.filter((k) => !used.has(k));
  if (!keys.length) return PARAM_AFFIX_KEYS[Math.floor(rng() * PARAM_AFFIX_KEYS.length)]!;
  return keys[Math.floor(rng() * keys.length)]!;
}

export function pickDrawbackKey(primary: AffixPrimaryKey, used: Set<AffixPrimaryKey>, rng = Math.random): AffixDrawbackKey {
  const primaryToDrawback: Partial<Record<AffixPrimaryKey, AffixDrawbackKey>> = {
    hp_percent: 'speed_down_percent',
    mp_percent: 'attack_down_percent',
    attack_percent: 'defense_down_percent',
    magic_percent: 'mp_down_percent',
    defense_percent: 'attack_down_percent',
    speed_percent: 'hp_down_percent',
    crit_percent: 'defense_down_percent',
    damage_dealt_percent: 'hp_down_percent',
    damage_taken_reduction_percent: 'damage_taken_increase_percent',
  };
  const preferred = primaryToDrawback[primary];
  const pool = DRAWBACK_KEYS.filter((k) => {
    const asPrimary = k.replace('_down_', '_').replace('_increase_', '_') as AffixPrimaryKey;
    return !used.has(asPrimary) && k !== preferred;
  });
  if (preferred && !used.has(preferred as unknown as AffixPrimaryKey)) return preferred;
  return pool[Math.floor(rng() * pool.length)] ?? 'hp_down_percent';
}

export function buildAffixEntry(
  kind: EquipmentAffixKind,
  rarity: string,
  usedKeys: Set<AffixPrimaryKey>,
  availableParams: AffixPrimaryKey[],
  rng = Math.random,
): EquipmentAffixEntry {
  let key: AffixPrimaryKey;
  if (kind === 'damage_reduction') key = 'damage_taken_reduction_percent';
  else if (kind === 'damage_dealt') key = 'damage_dealt_percent';
  else key = pickParamAffixKey(availableParams, usedKeys, rng);

  usedKeys.add(key);
  const value = rollAffixValue(rarity, rng);
  let drawbackKey: AffixDrawbackKey | null = null;
  let drawbackValue = 0;
  if (value >= 4.5 && rng() < 0.8) {
    drawbackKey = pickDrawbackKey(key, usedKeys, rng);
    drawbackValue = rollDrawbackValue(value, rng);
  }
  return {
    key,
    label: AFFIX_LABELS[key],
    value,
    drawbackKey,
    drawbackValue,
  };
}

export function rollStatMultipliers(
  rarity: string,
  baseStats: Partial<Record<'hp' | 'mp' | 'attack' | 'magic' | 'defense' | 'speed' | 'crit', number>>,
  rng = Math.random,
): EquipmentStatRoll {
  const [lo, hi] = STAT_ROLL_RANGES[rarity] ?? STAT_ROLL_RANGES.R!;
  const statKeys = (Object.keys(baseStats) as Array<keyof typeof baseStats>).filter((k) => (baseStats[k] ?? 0) > 0);
  const keys = statKeys.length ? statKeys : (['defense'] as const);
  const multipliers: EquipmentStatRoll['multipliers'] = {};
  let sum = 0;
  for (const k of keys) {
    const m = lo + rng() * (hi - lo);
    multipliers[k] = Math.round(m * 1000) / 1000;
    sum += m;
  }
  const avg = sum / keys.length;
  if (avg > (lo + hi) / 2 + 0.03) {
    const trimKey = keys[Math.floor(rng() * keys.length)]!;
    multipliers[trimKey] = Math.round(((multipliers[trimKey] ?? 1) - 0.02) * 1000) / 1000;
  }
  return { quality: Math.round(avg * 1000) / 1000, multipliers };
}

export function buildGodRollAffixes(): EquipmentAffixEntry[] {
  return [
    { key: 'attack_percent', label: '攻撃', value: 7.0, drawbackKey: null, drawbackValue: 0 },
    { key: 'damage_dealt_percent', label: '与ダメージ', value: 7.0, drawbackKey: null, drawbackValue: 0 },
  ];
}

export function isArmorOrAccessorySlot(slot: string): boolean {
  return slot !== 'weapon' && slot !== 'shield' && slot !== 'sub';
}

export function isAffixEligibleRarity(rarity: string): boolean {
  return ['N', 'R', 'SR', 'SSR', 'UR'].includes(rarity);
}

export function shouldRollAffixes(rollSource?: string | null): rollSource is AffixRollSource {
  if (!rollSource) return false;
  return AFFIX_ROLL_SOURCES.includes(rollSource as AffixRollSource) || rollSource === 'valhalla_test_godroll';
}

export const COMBAT_AFFIX_CLAMP = {
  dealtMin: 0.70,
  dealtMax: 1.50,
  takenMin: 0.50,
  takenMax: 1.50,
} as const;
