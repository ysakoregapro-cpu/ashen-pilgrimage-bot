/**
 * Phase4: 最大MP成長カーブ（Lv1〜100）と職業補正。
 * 目安: Lv1 25-40 / Lv10 50-70 / Lv30 100-140 / Lv50 160-220 / Lv70 230-300 / Lv100 350-450
 */

/** レベルだけの基礎最大MP（装備・セット前） */
export function baseMaxMpFromLevel(level: number): number {
  const lv = Math.max(1, Math.min(100, level));
  // 緩やかな二次成分で終盤も伸びるが線形より控えめ
  const linear = 28 + (lv - 1) * 3.15;
  // Lv100で基礎MP≈428（目安350〜450内）。Src/奥義の消費MP設計と両立。
  const curve = Math.floor((lv - 1) * (lv - 1) * 0.009);
  return Math.floor(linear + curve);
}

/** 職業mp_modをレベルに応じてスケール（高Lvほど職差が効く） */
export function scaledJobMpMod(flatMod: number, level: number): number {
  const lv = Math.max(1, level);
  const scale = 0.65 + Math.min(1, (lv - 1) / 70) * 0.35;
  return Math.round(flatMod * scale);
}

/** 全補正後の想定最大MP（装備flat mp_bonus除く） */
export function computeExpectedMaxMp(
  level: number,
  mainJobMpMod: number,
  subJobMpMod: number,
  mpPctBonus = 0,
): number {
  let mp = baseMaxMpFromLevel(level);
  mp += scaledJobMpMod(mainJobMpMod, level);
  if (subJobMpMod) mp += Math.floor(scaledJobMpMod(subJobMpMod, level) * 0.4);
  mp = Math.floor(mp * (1 + mpPctBonus));
  return Math.max(25, mp);
}

/** 既存プレイヤーのMPを安全にクランプ（max超過はmaxへ、極端な欠損は50%回復） */
export function safeClampCurrentMp(currentMp: number, newMaxMp: number, oldMaxMp: number): number {
  if (newMaxMp <= 0) return 0;
  if (currentMp > newMaxMp) return newMaxMp;
  if (oldMaxMp > 0 && currentMp < oldMaxMp * 0.15 && newMaxMp >= 25) {
    return Math.min(newMaxMp, Math.floor(newMaxMp * 0.5));
  }
  return Math.max(0, currentMp);
}

/** レベル帯の代表最大MP（魔術師/重騎士）— 検証用 */
export function referenceMaxMpTable(): Array<{ level: number; mage: number; knight: number; scout: number }> {
  const levels = [1, 10, 30, 50, 70, 100];
  return levels.map((level) => ({
    level,
    mage: computeExpectedMaxMp(level, 22, 0),
    knight: computeExpectedMaxMp(level, -8, 0),
    scout: computeExpectedMaxMp(level, 3, 0),
  }));
}
