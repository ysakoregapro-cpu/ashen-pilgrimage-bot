/** Job starter weapons — used for new job selection and 伝承 (Kai unique) eligibility */

export const JOB_STARTER_WEAPONS: Record<string, string> = {
  剣士: 'wpn_traveler_sword',
  重騎士: 'wpn_training_hammer',
  狩人: 'wpn_old_bow',
  魔術師: 'wpn_mist_staff',
  祈祷師: 'wpn_prayer_rod',
  斥候: 'wpn_rust_dagger',
  機工師: 'wpn_mini_cannon',
  格闘士: 'wpn_leather_gauntlet',
};

/** Starter weapon → unique item after Kai 伝承 */
export const STARTER_UNIQUE_TARGETS: Record<string, string> = {
  wpn_traveler_sword: 'wpn_unique_twilight',
  wpn_training_hammer: 'wpn_unique_old_hammer',
  wpn_old_bow: 'wpn_unique_echo',
  wpn_mist_staff: 'wpn_unique_mist_lantern',
  wpn_prayer_rod: 'wpn_unique_lamp',
  wpn_rust_dagger: 'wpn_unique_mirror',
  wpn_mini_cannon: 'wpn_unique_deep',
  wpn_leather_gauntlet: 'wpn_unique_black_fox',
};

export const STARTER_WEAPON_IDS = new Set(Object.values(JOB_STARTER_WEAPONS));

export function isJobStarterWeapon(itemId: string): boolean {
  return STARTER_WEAPON_IDS.has(itemId);
}

export function getStarterWeaponForJob(jobName: string): string | undefined {
  return JOB_STARTER_WEAPONS[jobName];
}
