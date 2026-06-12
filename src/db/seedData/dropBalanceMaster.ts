/**
 * Phase2.4 — 探索ドロップ・経済バランス調整マスタ
 * area_pool / town loot pool の weight・出現範囲を集中管理
 */

/** 通常探索 town pool から除外（legacy・reserved）— boss素材は専用weightで極低頻度 */
export const NORMAL_EXPLORE_POOL_EXCLUDED = new Set([
  'mat_starfall_obsidian',
  'mat_black_lantern_cinder',
  'wpn_unique_silence',
]);

/** area seed / DB patch 用 — item_id → weight（未指定は 10） */
export const AREA_REWARD_WEIGHTS: Record<string, Record<string, number>> = {
  area_forbidden_section: { mat_moon_ink: 14, wpn_moon_rod: 8, arm_set_moon_arms: 4 },
  area_bookworm_corridor: { mat_moon_ink: 14, wpn_moon_rod: 8, arm_set_moon_legs: 4 },
  area_record_terminal: { wpn_moon_staff_sr: 5, arm_set_moon_head: 4 },
  area_shadow_reading: { mat_moon_ink: 12, arm_set_moon_body: 3 },
  area_unanswered_archive: { boss_silent_page: 1, wpn_moon_spell_staff: 2, arm_set_moon_feet: 4 },
  area_hourglass_ruins: { mat_hourglass_shard: 12 },
  area_memory_vault: { mat_hourglass_shard: 12 },
};

/** town loot builder 用 — base_weight / rank 範囲の上書き */
export const TOWN_LOOT_ITEM_OVERRIDES: Record<string, {
  base_weight?: number;
  min_area_rank?: number;
  max_area_rank?: number;
  value_tier?: number;
}> = {
  mat_moon_ink: { base_weight: 12, value_tier: 3 },
  arm_set_moon_arms: { base_weight: 4, min_area_rank: 1, max_area_rank: 1 },
  arm_set_moon_legs: { base_weight: 4, min_area_rank: 2, max_area_rank: 2 },
  arm_set_moon_head: { base_weight: 4, min_area_rank: 3, max_area_rank: 3 },
  arm_set_moon_body: { base_weight: 3, min_area_rank: 4, max_area_rank: 4 },
  arm_set_moon_feet: { base_weight: 4, min_area_rank: 5, max_area_rank: 5 },
  wpn_moon_rod: { base_weight: 6 },
  wpn_moon_staff_sr: { base_weight: 4, min_area_rank: 3, max_area_rank: 3 },
  wpn_moon_spell_staff: { base_weight: 2, min_area_rank: 5, max_area_rank: 5, value_tier: 5 },
  boss_silent_page: { base_weight: 1, min_area_rank: 5, max_area_rank: 5, value_tier: 5 },
  mat_starfall_obsidian: { base_weight: 0 },
  mat_black_lantern_cinder: { base_weight: 0 },
  wpn_unique_silence: { base_weight: 0 },
  src_star_mark_full: { base_weight: 2, min_area_rank: 5, max_area_rank: 5, value_tier: 5 },
  src_old_king_echo: { base_weight: 2, value_tier: 5 },
  src_valhalla_core: { base_weight: 2, value_tier: 5 },
  src_machina_core: { base_weight: 2, value_tier: 5 },
  acc_raid_random: { base_weight: 2, value_tier: 5 },
  wpn_valhalla_blade: { base_weight: 2, value_tier: 5 },
  arm_set_valhalla_head: { base_weight: 3 },
  arm_set_valhalla_body: { base_weight: 3 },
  arm_set_old_king_head: { base_weight: 3 },
  arm_set_old_king_body: { base_weight: 3 },
  mat_deep_soot: { base_weight: 8, value_tier: 5 },
  mat_starfall_shard: { base_weight: 8, value_tier: 5 },
  mat_valhalla_plate: { base_weight: 6, value_tier: 5 },
};

/** アイテム用途分類（監査・表示用） */
export type ItemPurposeKind =
  | 'consumable'
  | 'enhance_material'
  | 'repair_material'
  | 'awaken_material'
  | 'kai_material'
  | 'src_material'
  | 'set_material'
  | 'job_material'
  | 'trial_material'
  | 'raid_material'
  | 'currency_like'
  | 'vendor_item'
  | 'collection'
  | 'reserved_future'
  | 'legacy'
  | 'playable_gear'
  | 'unknown';

export const ITEM_PURPOSE_OVERRIDES: Record<string, ItemPurposeKind> = {
  mat_starfall_obsidian: 'legacy',
  mat_black_lantern_cinder: 'legacy',
  wpn_unique_silence: 'legacy',
  acc_raid_random: 'collection',
  mat_star_pilgrim_echo: 'kai_material',
  boss_silent_page: 'src_material',
};

export const PROGRESSION_TIER_BY_AREA_MIN: Array<{ minLv: number; tier: string }> = [
  { minLv: 58, tier: 'valhalla' },
  { minLv: 50, tier: 'late' },
  { minLv: 34, tier: 'late_pre' },
  { minLv: 20, tier: 'mid' },
  { minLv: 0, tier: 'early' },
];

export function progressionTierForAreaMin(minLv: number): string {
  for (const row of PROGRESSION_TIER_BY_AREA_MIN) {
    if (minLv >= row.minLv) return row.tier;
  }
  return 'early';
}
