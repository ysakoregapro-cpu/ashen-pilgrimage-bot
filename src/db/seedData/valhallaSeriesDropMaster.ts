/** Phase2.6 — ヴァルハラ/旧王シリーズ入手経路 */

export const VALHALLA_SERIES_ARMOR_IDS = [
  'arm_set_valhalla_head', 'arm_set_valhalla_body', 'arm_set_valhalla_arms',
  'arm_set_valhalla_legs', 'arm_set_valhalla_feet',
] as const;

export const OLD_KING_SERIES_ARMOR_IDS = [
  'arm_set_old_king_head', 'arm_set_old_king_body', 'arm_set_old_king_arms',
  'arm_set_old_king_legs', 'arm_set_old_king_feet',
] as const;

export const VALHALLA_SERIES_ACCESSORY_IDS = ['acc_valhalla_necklace'] as const;
export const OLD_KING_SERIES_ACCESSORY_IDS = ['acc_old_king_seal'] as const;

/** ヴァルハラ要塞の探索エリア（道中おまけドロップ対象） */
export const VALHALLA_EXPLORE_AREA_IDS = [
  'area_valhalla_outer', 'area_mech_hangar', 'area_experiment_zone',
  'area_old_throne', 'area_deep_core', 'area_sky_lift', 'area_control_room', 'area_machina_zone',
] as const;

/** 旧王シリーズ極低確率ドロップ（深層） */
export const VALHALLA_DEEP_AREA_IDS = [
  'area_old_throne', 'area_deep_core', 'area_machina_zone',
] as const;

export const VALHALLA_EXPLORE_SERIES_DROP = {
  armorOrAccessoryRateMin: 0.001,
  armorOrAccessoryRateMax: 0.004,
} as const;

export const OLD_KING_DEEP_SERIES_DROP = {
  armorOrAccessoryRateMin: 0.0003,
  armorOrAccessoryRateMax: 0.0012,
} as const;
