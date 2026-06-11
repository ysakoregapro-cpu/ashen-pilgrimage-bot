/** Same-weapon merge / awakening — separate from +enhancement */

export const MAX_AWAKENING_LEVEL = 5;

/** Duplicates consumed for each step: 0→1 needs 1, … 4→5 needs 5 (total 15) */
export const AWAKENING_DUP_COST: Record<number, number> = {
  0: 1, 1: 2, 2: 3, 3: 4, 4: 5,
};

export const AWAKENING_LABELS: Record<number, string> = {
  0: '未覚醒',
  1: '覚醒I',
  2: '覚醒II',
  3: '覚醒III',
  4: '覚醒IV',
  5: '覚醒V',
};

export const AWAKENING_ELIGIBLE_RARITIES = new Set(['N', 'R']);

/** Base weapon → unique item_id after Kai ascension (when defined) */
export const KAI_UNIQUE_TARGETS: Record<string, string> = {
  wpn_prayer_rod: 'wpn_unique_lamp',
  wpn_twilight_bow: 'wpn_unique_twilight',
  wpn_rain_bow: 'wpn_unique_echo',
  wpn_rust_dagger: 'wpn_unique_mirror',
  wpn_silver_hammer: 'wpn_unique_silver',
  wpn_mist_staff: 'wpn_unique_silence',
  wpn_iron_scrap_barrel: 'wpn_unique_deep',
  wpn_old_road_dagger: 'wpn_unique_black_fox',
  wpn_starfall_spear: 'wpn_unique_star_scar',
};

/** Src forge material from pre-Valhalla boss farm */
export const SRC_FORGE_MATERIAL_ID = 'mat_star_pilgrim_echo';
export const PRE_VALHALA_BOSS_MONSTER = 'mon_furnace_keeper';
export const SRC_FORGE_MATERIAL_DROP_RATE = 0.08;

export function awakeningLabel(level: number): string {
  return AWAKENING_LABELS[level] ?? `覚醒${level}`;
}

export function totalDuplicatesForMaxAwakening(): number {
  return Object.values(AWAKENING_DUP_COST).reduce((a, b) => a + b, 0);
}
