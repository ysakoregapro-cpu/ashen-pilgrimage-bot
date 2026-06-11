import { getExpMultiplier as calcExpMult } from './expSystem';

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
  statusAccBonus: number;
}

function calcUnderlevelTakenMult(deficit: number): number {
  if (deficit <= 0) return 1;
  if (deficit <= 2) return 1.10;
  if (deficit <= 5) return 1.25;
  return 1.45;
}

export function getDifficultyModifiers(
  playerLevel: number,
  minLevel: number,
  maxLevel: number,
  opts?: { isValhalla?: boolean },
): DifficultyModifiers {
  const mid = (minLevel + maxLevel) / 2;

  if (playerLevel < minLevel) {
    const deficit = minLevel - playerLevel;
    const dmgLoss = Math.min(0.55, deficit * 0.10);
    const takenGain = calcUnderlevelTakenMult(deficit);
    const hitLoss = Math.min(0.55, deficit * 0.05);
    const breakLoss = Math.min(0.65, deficit * 0.08);
    const speedPenalty = Math.max(0.78, 1 - deficit * 0.04);
    const enemySpeedBonus = 1 + Math.min(0.28, deficit * 0.06);
    const statusAccBonus = Math.min(0.15, deficit * 0.03);

    return {
      playerHitRate: Math.max(0.38, 0.92 - hitLoss),
      enemyHitRate: Math.min(0.99, 0.90 + deficit * 0.03),
      playerDamage: Math.max(0.45, 1 - dmgLoss),
      playerTaken: takenGain,
      fleeRate: Math.max(0.12, 0.50 - deficit * 0.07),
      breakRate: Math.max(0.35, 1 - breakLoss),
      playerSpeed: speedPenalty,
      enemySpeed: enemySpeedBonus,
      label: deficit >= 6 ? '足取りが及ばない' : deficit >= 3 ? 'かなり危険' : '少し重い',
      levelDeficit: deficit,
      statusAccBonus,
    };
  }

  if (playerLevel <= mid) {
    return {
      playerHitRate: 0.88,
      enemyHitRate: 0.92,
      playerDamage: 0.92,
      playerTaken: opts?.isValhalla ? 1.18 : 1.12,
      fleeRate: 0.50,
      breakRate: 0.90,
      playerSpeed: 1,
      enemySpeed: 1.06,
      label: '適正下位',
      levelDeficit: 0,
      statusAccBonus: 0,
    };
  }

  if (playerLevel <= maxLevel) {
    return {
      playerHitRate: 0.93,
      enemyHitRate: 0.90,
      playerDamage: 1.0,
      playerTaken: opts?.isValhalla ? 1.12 : 1.06,
      fleeRate: 0.58,
      breakRate: 1.0,
      playerSpeed: 1,
      enemySpeed: 1.04,
      label: '適正上位',
      levelDeficit: 0,
      statusAccBonus: 0,
    };
  }

  const over = playerLevel - maxLevel;
  return {
    playerHitRate: Math.min(0.99, 0.95 + over * 0.004),
    enemyHitRate: Math.max(0.74, 0.86 - over * 0.018),
    playerDamage: Math.min(1.08, 1 + over * 0.015),
    playerTaken: Math.max(0.88, 1 - over * 0.012),
    fleeRate: Math.min(0.82, 0.65 + over * 0.015),
    breakRate: Math.min(1.12, 1 + over * 0.025),
    playerSpeed: 1,
    enemySpeed: Math.max(0.92, 1 - over * 0.015),
    label: '安定',
    levelDeficit: 0,
    statusAccBonus: 0,
  };
}

export function underlevelWarning(playerLevel: number, minLevel: number): string | null {
  if (playerLevel >= minLevel) return null;
  const deficit = minLevel - playerLevel;
  if (deficit >= 6) {
    return 'この先は、今の足取りには重すぎる。\n一撃が深く刺さる。無理をすれば灯火に戻されるだろう。';
  }
  if (deficit >= 3) {
    return 'この先は、今の足取りには少し重い。\n敵の刃は鋭く、消耗が早い。';
  }
  return 'この先は、推奨より少し早い。\n油断すれば、思った以上に痛い。';
}

export function getExpMultiplier(playerLevel: number): number {
  return calcExpMult(playerLevel);
}
