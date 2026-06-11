export interface DifficultyModifiers {
  playerHitRate: number;
  enemyHitRate: number;
  playerDamage: number;
  playerTaken: number;
  fleeRate: number;
  breakRate: number;
  playerSpeed: number;
  enemySpeed: number;
  label: string;
  levelDeficit: number;
}

export function getDifficultyModifiers(
  playerLevel: number,
  minLevel: number,
  maxLevel: number,
): DifficultyModifiers {
  const mid = (minLevel + maxLevel) / 2;

  if (playerLevel < minLevel) {
    const deficit = minLevel - playerLevel;
    const dmgLoss = Math.min(0.65, deficit * 0.12);
    const takenGain = Math.min(1.2, deficit * 0.18);
    const hitLoss = Math.min(0.6, deficit * 0.06);
    const breakLoss = Math.min(0.7, deficit * 0.10);
    const speedPenalty = Math.max(0.75, 1 - deficit * 0.05);
    const enemySpeedBonus = 1 + Math.min(0.25, deficit * 0.08);

    return {
      playerHitRate: Math.max(0.35, 0.95 - hitLoss),
      enemyHitRate: Math.min(0.99, 0.88 + deficit * 0.04),
      playerDamage: Math.max(0.35, 1 - dmgLoss),
      playerTaken: Math.min(2.2, 1 + takenGain),
      fleeRate: Math.max(0.15, 0.55 - deficit * 0.08),
      breakRate: Math.max(0.3, 1 - breakLoss),
      playerSpeed: speedPenalty,
      enemySpeed: enemySpeedBonus,
      label: deficit >= 3 ? '足取りが及ばない' : deficit >= 2 ? 'かなり危険' : '少し重い',
      levelDeficit: deficit,
    };
  }

  if (playerLevel <= mid) {
    return {
      playerHitRate: 0.88,
      enemyHitRate: 0.90,
      playerDamage: 0.88,
      playerTaken: 1.12,
      fleeRate: 0.52,
      breakRate: 0.88,
      playerSpeed: 1,
      enemySpeed: 1.05,
      label: '適正下位',
      levelDeficit: 0,
    };
  }

  if (playerLevel <= maxLevel) {
    return {
      playerHitRate: 0.93,
      enemyHitRate: 0.87,
      playerDamage: 1.0,
      playerTaken: 1.0,
      fleeRate: 0.62,
      breakRate: 1.0,
      playerSpeed: 1,
      enemySpeed: 1,
      label: '適正上位',
      levelDeficit: 0,
    };
  }

  const over = playerLevel - maxLevel;
  return {
    playerHitRate: Math.min(0.99, 0.95 + over * 0.005),
    enemyHitRate: Math.max(0.72, 0.85 - over * 0.02),
    playerDamage: Math.min(1.25, 1 + over * 0.04),
    playerTaken: Math.max(0.75, 1 - over * 0.025),
    fleeRate: Math.min(0.85, 0.68 + over * 0.02),
    breakRate: Math.min(1.15, 1 + over * 0.03),
    playerSpeed: 1,
    enemySpeed: Math.max(0.9, 1 - over * 0.02),
    label: '安定',
    levelDeficit: 0,
  };
}

export function underlevelWarning(playerLevel: number, minLevel: number): string | null {
  if (playerLevel >= minLevel) return null;
  return 'この先は、今の足取りには少し重い。\n進むことはできるが、無理をすれば灯火に戻されるだろう。';
}
