/** Experience balancing — level gap, explore return, boss bonuses */

export function levelExpRequired(level: number): number {
  if (level <= 10) return Math.floor(35 * Math.pow(level, 1.35));
  if (level <= 30) return Math.floor(42 * Math.pow(level, 1.42));
  if (level <= 50) return Math.floor(48 * Math.pow(level, 1.48));
  if (level <= 80) return Math.floor(55 * Math.pow(level, 1.52));
  return Math.floor(62 * Math.pow(level, 1.55));
}

/** Player vs enemy level difference multiplier */
export function getLevelDiffExpMultiplier(playerLevel: number, enemyLevel: number): number {
  const diff = enemyLevel - playerLevel;
  if (diff >= 3) return 1.2;
  if (diff >= 1) return 1.1;
  if (diff >= -3) return 1.0;
  if (diff >= -7) return 0.5;
  return 0.2;
}

export function getExpMultiplier(playerLevel: number): number {
  if (playerLevel <= 15) return 1.35;
  if (playerLevel <= 35) return 1.4;
  if (playerLevel <= 60) return 1.35;
  return 1.25;
}

export function calcBattleExp(baseExp: number, playerLevel: number, enemyLevel: number): number {
  return Math.max(1, Math.floor(
    baseExp * getExpMultiplier(playerLevel) * getLevelDiffExpMultiplier(playerLevel, enemyLevel),
  ));
}

export function calcBossExp(baseExp: number, isFirstKill: boolean): number {
  return Math.floor(baseExp * (isFirstKill ? 12 : 0.4));
}

export function calcExploreReturnBonus(avgMonsterExp: number, actionsSinceTown: number, inRecommendedBand: boolean): number {
  if (actionsSinceTown < 2) return 0;
  const base = Math.floor(avgMonsterExp * Math.min(actionsSinceTown, 6) * 0.35);
  return inRecommendedBand ? Math.floor(base * 1.3) : base;
}

export function calcRaidExp(baseExp: number, isFirstClear: boolean, contributed: boolean): number {
  if (!contributed) return Math.max(1, Math.floor(baseExp * 0.15));
  return Math.floor(baseExp * (isFirstClear ? 2.5 : 1.2));
}

export function calcRescueExp(baseExp: number, isAssist: boolean): number {
  return Math.floor(baseExp * (isAssist ? 0.35 : 0.8));
}

export type LevelUpStatDiff = {
  hp: number; mp: number; attack: number; magic: number; defense: number;
};

export function calcLevelUpStatDiff(oldLevel: number, newLevel: number): LevelUpStatDiff {
  const levels = newLevel - oldLevel;
  return {
    hp: levels * 15,
    mp: levels * 5,
    attack: levels * 2,
    magic: levels * 2,
    defense: levels * 1,
  };
}

export function formatLevelUpMessage(oldLevel: number, newLevel: number, extras?: string[]): string {
  const diff = calcLevelUpStatDiff(oldLevel, newLevel);
  const lines = [
    `✦ Lv ${oldLevel} → Lv ${newLevel}`,
    '',
    `HP +${diff.hp}`,
    `MP +${diff.mp}`,
    `攻撃 +${diff.attack}`,
    `魔力 +${diff.magic}`,
    `防御 +${diff.defense}`,
  ];
  if (extras?.length) {
    lines.push('', '**新しい行動**', ...extras.map((e) => `・${e}`));
  }
  return lines.join('\n');
}
