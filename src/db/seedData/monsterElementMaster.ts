import type { GameElement } from './elementMaster';

export type MonsterElementDef = {
  element: GameElement;
  weaknesses: GameElement[];
  resistances: GameElement[];
};

const TAG_DEFAULTS: Record<string, MonsterElementDef> = {
  starfield: { element: 'beast', weaknesses: ['light', 'fire'], resistances: ['neutral'] },
  port: { element: 'undead', weaknesses: ['light', 'fire'], resistances: ['dark', 'ice'] },
  mine: { element: 'machine', weaknesses: ['thunder', 'fire'], resistances: ['ice'] },
  forest: { element: 'beast', weaknesses: ['fire', 'wind'], resistances: ['wind'] },
  library: { element: 'dark', weaknesses: [], resistances: ['dark'] },
  undermarket: { element: 'dark', weaknesses: ['light', 'thunder'], resistances: ['dark', 'machine'] },
  capital: { element: 'old_king', weaknesses: ['light', 'valhalla'], resistances: ['dark', 'undead'] },
  furnace: { element: 'machine', weaknesses: ['thunder', 'ice'], resistances: ['fire', 'machine'] },
  valhalla: { element: 'valhalla', weaknesses: ['old_king', 'light'], resistances: ['dark', 'machine'] },
};

/** Per-monster overrides (bosses / special enemies) */
const MONSTER_OVERRIDES: Record<string, Partial<MonsterElementDef>> = {
  mon_night_shadow: { element: 'dark', weaknesses: ['light'], resistances: ['dark'] },
  mon_lighthouse_jelly: { element: 'ice', weaknesses: ['thunder', 'fire'], resistances: ['ice'] },
  mon_silver_golem: { element: 'machine', weaknesses: ['thunder'], resistances: ['ice', 'machine'] },
  mon_tree_guardian: { element: 'beast', weaknesses: ['fire', 'wind'], resistances: ['beast'] },
  mon_silent_guardian: { element: 'dark', weaknesses: ['light'], resistances: ['dark', 'undead'] },
  mon_black_iron_exec: { element: 'machine', weaknesses: ['thunder'], resistances: ['dark'] },
  mon_throne_shadow: { element: 'old_king', weaknesses: ['light', 'valhalla'], resistances: ['dark'] },
  mon_furnace_keeper: { element: 'fire', weaknesses: ['ice', 'thunder'], resistances: ['fire', 'machine'] },
  mon_old_king_shadow: { element: 'old_king', weaknesses: ['valhalla', 'light'], resistances: ['dark', 'old_king'] },
  mon_deep_core_boss: { element: 'valhalla', weaknesses: ['old_king', 'thunder'], resistances: ['machine', 'fire'] },
  mon_machina_echo: { element: 'machine', weaknesses: ['thunder'], resistances: ['valhalla'] },
  mon_bookworm_swarm: { element: 'beast', weaknesses: ['light'], resistances: [] },
  mon_ink_beast: { element: 'undead', weaknesses: ['fire', 'thunder'], resistances: ['light', 'dark'] },
  mon_runaway_book: { element: 'dark', weaknesses: ['light'], resistances: [] },
  mon_moon_observer: { element: 'dark', weaknesses: ['thunder'], resistances: ['light', 'dark'] },
  mon_shadow_librarian: { element: 'undead', weaknesses: ['light'], resistances: ['dark'] },
};

export function getMonsterElementDef(monsterId: string, areaTag: string): MonsterElementDef {
  const base = TAG_DEFAULTS[areaTag] ?? { element: 'neutral' as GameElement, weaknesses: [], resistances: [] };
  const ov = MONSTER_OVERRIDES[monsterId];
  if (!ov) return base;
  return {
    element: ov.element ?? base.element,
    weaknesses: ov.weaknesses ?? base.weaknesses,
    resistances: ov.resistances ?? base.resistances,
  };
}

/** EXP multiplier applied on top of base monster exp (by area tag tier) */
export const MONSTER_EXP_TIER_MULT: Record<string, number> = {
  starfield: 1.75,
  port: 1.65,
  mine: 1.5,
  forest: 1.45,
  library: 1.4,
  undermarket: 1.35,
  capital: 1.3,
  furnace: 1.25,
  valhalla: 1.2,
};

export function getMonsterExpTierMult(areaTag: string): number {
  return MONSTER_EXP_TIER_MULT[areaTag] ?? 1.2;
}
