import { MONSTER_TO_STORY_BOSS } from '../db/seedData/storyData';

export type ThreatTier = 'normal' | 'tough' | 'rare' | 'elite' | 'boss';

/** Random exploration encounters — story boss IDs are elites unless story-triggered */
export const ELITE_MONSTER_IDS = new Set([
  'mon_silver_golem', 'mon_black_iron_guard', 'mon_crystal_spider',
  'mon_rust_miner', 'mon_cave_in_bug', 'mon_furnace_keeper',
  'mon_throne_guard', 'mon_furnace_defense', 'mon_old_king_shadow',
]);

export const RARE_MONSTER_IDS = new Set([
  'mon_night_shadow',   'mon_lighthouse_jelly', 'mon_lost_mushroom', 'mon_moon_observer', 'mon_masked_thief',
  'mon_armor_spider', 'mon_arc_residue', 'mon_lab_failure', 'mon_mine_bat',
]);

export const TOUGH_MONSTER_IDS = new Set([
  'mon_salt_crab', 'mon_ore_eater', 'mon_ship_soldier', 'mon_rust_miner',
  'mon_mine_bat', 'mon_sea_thief', 'mon_drift_undead',
]);

const AREA_MULT: Record<string, { atk: number; hp: number; mag: number; def: number }> = {
  starfield: { atk: 1.05, hp: 1.05, mag: 1.05, def: 1.0 },
  port: { atk: 1.22, hp: 1.18, mag: 1.18, def: 1.08 },
  mine: { atk: 1.58, hp: 1.48, mag: 1.42, def: 1.15 },
  forest: { atk: 1.72, hp: 1.55, mag: 1.48, def: 1.18 },
  library: { atk: 1.85, hp: 1.62, mag: 1.55, def: 1.2 },
  undermarket: { atk: 1.95, hp: 1.68, mag: 1.58, def: 1.22 },
  capital: { atk: 2.05, hp: 1.75, mag: 1.62, def: 1.25 },
  furnace: { atk: 2.2, hp: 1.88, mag: 1.72, def: 1.28 },
  valhalla: { atk: 2.45, hp: 2.05, mag: 1.85, def: 1.32 },
};

const TIER_MULT: Record<ThreatTier, { atk: number; hp: number }> = {
  normal: { atk: 1, hp: 1 },
  tough: { atk: 1.12, hp: 1.2 },
  rare: { atk: 1.18, hp: 1.35 },
  elite: { atk: 1.28, hp: 1.55 },
  boss: { atk: 1.35, hp: 1.85 },
};

const ENEMY_HIT_PCT: Record<ThreatTier, { min: number; max: number }> = {
  normal: { min: 0.04, max: 0.07 },
  tough: { min: 0.06, max: 0.10 },
  rare: { min: 0.08, max: 0.12 },
  elite: { min: 0.10, max: 0.18 },
  boss: { min: 0.08, max: 0.15 },
};

export type ScaledMonster = {
  hp: number;
  attack: number;
  magic: number;
  defense: number;
  spirit: number;
  speed: number;
  threatTier: ThreatTier;
};

export function getMonsterThreatTier(monsterId: string, opts?: { forceBoss?: boolean; isStoryBoss?: boolean }): ThreatTier {
  if (opts?.forceBoss || opts?.isStoryBoss) return 'boss';
  if (ELITE_MONSTER_IDS.has(monsterId)) return 'elite';
  if (RARE_MONSTER_IDS.has(monsterId)) return 'rare';
  if (TOUGH_MONSTER_IDS.has(monsterId)) return 'tough';
  return 'normal';
}

export function isRandomExploreBoss(monsterId: string): boolean {
  return false;
}

export function scaleMonsterForBattle(monster: {
  id: string; area_tag: string; hp: number; attack: number; magic: number;
  defense: number; spirit: number; speed: number; is_boss?: number;
}, opts?: { forceBoss?: boolean; isStoryBoss?: boolean }): ScaledMonster {
  const area = AREA_MULT[monster.area_tag] ?? { atk: 1.3, hp: 1.25, mag: 1.25, def: 1.1 };
  const threat = getMonsterThreatTier(monster.id, {
    forceBoss: opts?.forceBoss,
    isStoryBoss: opts?.isStoryBoss ?? monster.is_boss === 1,
  });
  const tier = TIER_MULT[threat];
  return {
    hp: Math.floor(monster.hp * area.hp * tier.hp),
    attack: Math.floor(monster.attack * area.atk * tier.atk),
    magic: Math.floor(monster.magic * area.mag * tier.atk),
    defense: Math.floor(monster.defense * area.def * (threat === 'elite' ? 1.1 : 1)),
    spirit: Math.floor(monster.spirit * area.def),
    speed: monster.speed,
    threatTier: threat,
  };
}

/** Ratio-based physical/magic damage — defense reduces but never nullifies */
export function calcPhysicalDamage(
  attack: number,
  defense: number,
  multiplier = 1,
  variance = 0.12,
): number {
  if (attack <= 0) return 1;
  const mitigated = attack * multiplier * (100 / (100 + defense * 0.52));
  const varMult = 1 - variance + Math.random() * variance * 2;
  return Math.max(1, Math.floor(mitigated * varMult));
}

export function calcEnemyDamageToPlayer(opts: {
  attack: number;
  playerDefense: number;
  playerMaxHp: number;
  multiplier?: number;
  threatTier: ThreatTier;
  takenMult: number;
  heavy?: boolean;
}): number {
  const mult = opts.multiplier ?? 1;
  const pct = ENEMY_HIT_PCT[opts.threatTier];
  const heavyMult = opts.heavy ? 1.45 : 1;
  const hpRoll = pct.min + Math.random() * (pct.max - pct.min);
  const hpBased = Math.floor(opts.playerMaxHp * hpRoll * heavyMult * opts.takenMult);
  const statBased = Math.floor(
    calcPhysicalDamage(opts.attack, opts.playerDefense, mult * heavyMult) * opts.takenMult,
  );
  return Math.max(1, Math.floor(hpBased * 0.45 + statBased * 0.55));
}

export function calcPlayerDamageToEnemy(
  attack: number,
  enemyDefense: number,
  multiplier: number,
): number {
  return calcPhysicalDamage(attack, enemyDefense, multiplier);
}

export function getThreatLabel(tier: ThreatTier, monsterName: string): string | null {
  if (tier === 'rare') return `レア敵: ${monsterName}`;
  if (tier === 'elite') return `危険個体: ${monsterName}`;
  if (tier === 'boss') return `強敵: ${monsterName}`;
  if (tier === 'tough') return `手強い敵: ${monsterName}`;
  return null;
}

export function storyBossMonsterIds(): Set<string> {
  return new Set(Object.values(MONSTER_TO_STORY_BOSS));
}
