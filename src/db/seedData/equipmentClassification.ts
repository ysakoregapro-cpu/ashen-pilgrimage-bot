/** Phase2.1 — 装備分類・legacy/excluded 定義 */

export type EquipmentClassification =
  | 'playable'
  | 'collection'
  | 'progression'
  | 'endgame'
  | 'legacy'
  | 'duplicate'
  | 'admin'
  | 'test'
  | 'unused'
  | 'unknown';

export type ExcludedEquipmentEntry = {
  classification: EquipmentClassification;
  reason: string;
  shouldBeObtainable: false;
};

/** 通常プレイから除外 — IDは削除しない */
export const EXCLUDED_EQUIPMENT: Record<string, ExcludedEquipmentEntry> = {
  wpn_unique_silence: {
    classification: 'legacy',
    reason: '旧Uni「静寂の聖印」。Phase2でSR通常武器化済み。通常導線は wpn_silence_seal_sr を使用。Src基礎データ用にDB残存。',
    shouldBeObtainable: false,
  },
};

/** シリーズごと legacy 除外（5部位セット全体） */
export const EXCLUDED_SERIES: Record<string, ExcludedEquipmentEntry> = {};

/** Kai伝承で入手（Uni） */
export const KAI_FORGE_WEAPON_IDS = new Set([
  'wpn_unique_twilight', 'wpn_unique_lamp', 'wpn_unique_deep', 'wpn_unique_echo',
  'wpn_unique_mirror', 'wpn_unique_silver', 'wpn_unique_old_hammer', 'wpn_unique_mist_lantern',
  'wpn_unique_old_shield', 'wpn_unique_star_scar', 'wpn_unique_tuner', 'wpn_unique_black_fox', 'wpn_unique_bind',
]);

/** レイド専用アクセ */
export const RAID_ONLY_ITEMS = new Set(['acc_raid_random']);

export function isExcludedItem(itemId: string): ExcludedEquipmentEntry | undefined {
  return EXCLUDED_EQUIPMENT[itemId];
}

export function isExcludedSeries(seriesId: string | null): ExcludedEquipmentEntry | undefined {
  if (!seriesId) return undefined;
  return EXCLUDED_SERIES[seriesId];
}

export function inferClassification(opts: {
  itemId: string;
  rarity: string;
  seriesId: string | null;
  slot: string;
  isUnique: number;
  obtainable: boolean;
}): EquipmentClassification {
  const ex = isExcludedItem(opts.itemId) ?? isExcludedSeries(opts.seriesId);
  if (ex) return ex.classification;

  if (opts.rarity === 'Uni') return 'progression';
  if (opts.rarity === 'Src') return 'endgame';
  if (RAID_ONLY_ITEMS.has(opts.itemId)) return 'collection';
  if (opts.seriesId) return 'playable';
  if (['UR', 'SSR'].includes(opts.rarity)) return 'endgame';
  if (['SR', 'R'].includes(opts.rarity)) return 'progression';
  if (opts.rarity === 'N') return 'playable';
  return opts.obtainable ? 'playable' : 'unknown';
}

export function shouldBeObtainable(itemId: string, seriesId: string | null): boolean {
  if (isExcludedItem(itemId) || isExcludedSeries(seriesId)) return false;
  if (KAI_FORGE_WEAPON_IDS.has(itemId)) return true;
  if (RAID_ONLY_ITEMS.has(itemId)) return true;
  return true;
}
