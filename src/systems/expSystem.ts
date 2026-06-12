/** Experience balancing — level gap, explore return, boss bonuses */

export function levelExpRequired(level: number): number {
  if (level <= 10) return Math.floor(35 * Math.pow(level, 1.35));
  if (level <= 30) return Math.floor(42 * Math.pow(level, 1.42));
  if (level <= 50) return Math.floor(48 * Math.pow(level, 1.48));
  if (level <= 80) return Math.floor(55 * Math.pow(level, 1.52));
  return Math.floor(62 * Math.pow(level, 1.55));
}

export function expToNextLevel(level: number, currentExp: number): number {
  return Math.max(0, levelExpRequired(level) - currentExp);
}

/** Player vs enemy level difference multiplier */
export function getLevelDiffExpMultiplier(playerLevel: number, enemyLevel: number): number {
  const diff = enemyLevel - playerLevel;
  if (diff >= 3) return 1.15;
  if (diff >= 1) return 1.05;
  if (diff >= -3) return 1.0;
  if (diff >= -7) return 0.45;
  return 0.18;
}

export function getExpMultiplier(playerLevel: number): number {
  if (playerLevel <= 15) return 1.22;
  if (playerLevel <= 35) return 1.26;
  if (playerLevel <= 60) return 1.22;
  return 1.15;
}

export function calcBattleExp(baseExp: number, playerLevel: number, enemyLevel: number): number {
  return Math.max(1, Math.floor(
    baseExp * getExpMultiplier(playerLevel) * getLevelDiffExpMultiplier(playerLevel, enemyLevel),
  ));
}

export function calcBossExp(baseExp: number, isFirstKill: boolean): number {
  return Math.floor(baseExp * (isFirstKill ? 12 : 0.35));
}

export function calcExploreReturnBonus(avgMonsterExp: number, actionsSinceTown: number, inRecommendedBand: boolean): number {
  if (actionsSinceTown < 2) return 0;
  const actions = Math.min(actionsSinceTown, 4);
  // ~1–1.5 normal kills worth total (not per action)
  const base = Math.floor(avgMonsterExp * (0.5 + actions * 0.25));
  return inRecommendedBand ? Math.floor(base * 1.05) : Math.floor(base * 0.85);
}

export function calcRaidExp(baseExp: number, isFirstClear: boolean, contributed: boolean): number {
  if (!contributed) return Math.max(1, Math.floor(baseExp * 0.15));
  return Math.floor(baseExp * (isFirstClear ? 2.5 : 1.15));
}

export function calcRescueExp(baseExp: number, isAssist: boolean): number {
  return Math.floor(baseExp * (isAssist ? 0.32 : 0.75));
}

export type LevelUpStatDiff = {
  hp: number; mp: number; attack: number; magic: number; defense: number; spirit: number; speed: number;
};

export function calcLevelUpStatDiff(oldLevel: number, newLevel: number): LevelUpStatDiff {
  const levels = newLevel - oldLevel;
  return {
    hp: levels * 15,
    mp: levels * 5,
    attack: levels * 2,
    magic: levels * 2,
    defense: levels * 1,
    spirit: levels * 1,
    speed: levels * 1,
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
    `精神 +${diff.spirit}`,
    `速度 +${diff.speed}`,
  ];
  if (extras?.length) {
    lines.push('', '**新しい行動**', ...extras.map((e) => `・${e}`));
  }
  return lines.join('\n');
}

export type AddExpResult = {
  leveledUp: boolean;
  newLevel: number;
  oldLevel?: number;
  levelUpMessage?: string;
  expGained: number;
  expToNext: number;
};

export function formatExpProgressBlock(expGained: number, result: AddExpResult): string {
  const lines: string[] = [`獲得EXP: +${expGained}`];
  if (result.leveledUp && result.levelUpMessage) {
    lines.push(result.levelUpMessage);
  } else {
    lines.push(`現在Lv: ${result.newLevel}`);
  }
  lines.push(`Lv${result.newLevel + 1} まであと ${result.expToNext} EXP`);
  return lines.join('\n');
}
