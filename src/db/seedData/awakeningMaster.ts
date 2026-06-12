/** Same-weapon merge / awakening — separate from +enhancement */

import { STARTER_UNIQUE_TARGETS } from './jobStarterWeapons';

/** Max progression tier (覚醒IV). Legacy DB rows at level 5 remain valid. */
export const MAX_AWAKENING_LEVEL = 4;
export const LEGACY_MAX_AWAKENING_LEVEL = 5;

/** N/R: 1+2+3+5 = 11 */
export const AWAKENING_DUP_COST_NR: Record<number, number> = {
  0: 1, 1: 2, 2: 3, 3: 5,
};

/** SR: 1+1+2+3 = 7 */
export const AWAKENING_DUP_COST_SR: Record<number, number> = {
  0: 1, 1: 1, 2: 2, 3: 3,
};

/** UR: 1+1+1+1 = 4 */
export const AWAKENING_DUP_COST_UR: Record<number, number> = {
  0: 1, 1: 1, 2: 1, 3: 1,
};

/** @deprecated use getAwakeningDupCost */
export const AWAKENING_DUP_COST: Record<number, number> = AWAKENING_DUP_COST_NR;

export const AWAKENING_LABELS: Record<number, string> = {
  0: '未覚醒',
  1: '覚醒I',
  2: '覚醒II',
  3: '覚醒III',
  4: '覚醒IV',
  5: '覚醒V',
};

export const AWAKENING_ELIGIBLE_RARITIES = new Set(['N', 'R', 'SR', 'UR']);

export function getAwakeningDupCost(rarity: string, level: number): number {
  if (rarity === 'Src') return 0;
  const table = rarity === 'UR' ? AWAKENING_DUP_COST_UR
    : rarity === 'SR' || rarity === 'SSR' ? AWAKENING_DUP_COST_SR
      : AWAKENING_DUP_COST_NR;
  return table[level] ?? 0;
}

export function totalDuplicatesForMaxAwakening(rarity = 'N'): number {
  const table = rarity === 'UR' ? AWAKENING_DUP_COST_UR
    : rarity === 'SR' || rarity === 'SSR' ? AWAKENING_DUP_COST_SR
      : AWAKENING_DUP_COST_NR;
  return Object.values(table).reduce((a, b) => a + b, 0);
}

/** Legacy 覚醒V (level 5) counts as max for 伝承 etc. */
export function isMaxAwakening(level: number): boolean {
  return level >= MAX_AWAKENING_LEVEL;
}

/** Legacy alias — 職業初期武器の伝承先 */
export const KAI_UNIQUE_TARGETS: Record<string, string> = { ...STARTER_UNIQUE_TARGETS };

export {
  SRC_FORGE_MATERIAL_ID,
  SRC_FORGE_MATERIAL_DROP_RATE,
  UNI_FORGE_MATERIAL_IDS,
  UNI_FORGE_DROP_RATE,
  MAT_STARFALL_OBSIDIAN,
  MAT_BLACK_LANTERN_CINDER,
  SRC_FARM_MONSTER_IDS,
  AWAKENING_MAX_HINT,
  KAI_UNI_MATERIAL_HINT,
} from './forgeMaster';

/** @deprecated ヴァルハラ以前の旧ドロップ元 */
export const PRE_VALHALA_BOSS_MONSTER = 'mon_furnace_keeper';

export function awakeningLabel(level: number): string {
  if (level >= LEGACY_MAX_AWAKENING_LEVEL) return '最大覚醒';
  return AWAKENING_LABELS[level] ?? `覚醒${level}`;
}
