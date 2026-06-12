const RARITY_MAX: Record<string, number> = { N: 5, R: 5, SR: 7, SSR: 10, UR: 15, Uni: 7, Src: 10 };
const RARITY_GOLD_MULT: Record<string, number> = { N: 1.0, R: 1.0, SR: 1.5, SSR: 2.0, UR: 3.0, Uni: 2.0 };

export type EnhanceReq = { stoneId: string; stoneName: string; stoneQty: number; goldCost: number };

const STONE_NAMES: Record<string, string> = {
  upg_rough_stone: '粗い強化石',
  upg_stone: '強化石',
  upg_fine_stone: '上質強化石',
  upg_rare_stone: '希少強化石',
};

/** SR/SSR/UR — 5%/lv + flat +1/lv */
export const STANDARD_UPGRADE_PCT_PER_LEVEL = 0.05;
/** Uni — +1〜+4: 9%/lv、+5〜+7: 7%/lv + flat +1/lv */
export const UNI_UPGRADE_PCT_EARLY = 0.09;
export const UNI_UPGRADE_PCT_LATE = 0.07;

export function calcUniUpgradePctBonus(upgradeLevel: number): number {
  let bonus = 0;
  for (let lv = 1; lv <= upgradeLevel; lv++) {
    bonus += lv <= 4 ? UNI_UPGRADE_PCT_EARLY : UNI_UPGRADE_PCT_LATE;
  }
  return bonus;
}

/** Src — +1〜+5: 15%/lv、+6〜+10: 24%/lv */
export function calcSrcLevelPctBonus(srcLevel: number): number {
  let bonus = 0;
  for (let lv = 1; lv <= srcLevel; lv++) {
    bonus += lv <= 5 ? 0.15 : 0.24;
  }
  return bonus;
}

export function calcUpgradePctBonus(rarity: string, upgradeLevel: number, srcLevel: number): number {
  if (rarity === 'Src') return calcSrcLevelPctBonus(srcLevel);
  if (rarity === 'Uni') return calcUniUpgradePctBonus(upgradeLevel);
  return upgradeLevel * STANDARD_UPGRADE_PCT_PER_LEVEL;
}

/** Uni基礎値から Src +0 基礎（UR未強化よりやや弱い） */
export function computeSrcBaseStats(uniAtk: number, uniMag: number): { atk: number; mag: number } {
  return {
    atk: uniAtk > 0 ? Math.round(uniAtk * 1.34) : 0,
    mag: uniMag > 0 ? Math.round(uniMag * 1.38) : 0,
  };
}

export function getEnhanceRequirement(currentLevel: number, rarity: string): EnhanceReq {
  const next = currentLevel + 1;
  const mult = RARITY_GOLD_MULT[rarity] ?? 1;
  let stoneId: string;
  let baseGold: number;

  if (next <= 3) { stoneId = 'upg_rough_stone'; baseGold = 100 * next; }
  else if (next <= 6) { stoneId = 'upg_stone'; baseGold = 200 * next; }
  else if (next <= 9) { stoneId = 'upg_fine_stone'; baseGold = 350 * next; }
  else { stoneId = 'upg_rare_stone'; baseGold = 500 * next; }

  return {
    stoneId,
    stoneName: STONE_NAMES[stoneId] ?? stoneId,
    stoneQty: Math.max(1, Math.ceil(next / 2)),
    goldCost: Math.floor(baseGold * mult),
  };
}

export function getMaxUpgradeLevel(rarity: string, maxFromDb: number): number {
  return RARITY_MAX[rarity] ?? maxFromDb;
}

export type EquipStatRow = {
  attack_bonus: number; magic_bonus: number; defense_bonus: number; spirit_bonus: number;
  speed_bonus: number; hp_bonus: number;
  weapon_type?: string | null; slot: string;
};

export function getPrimaryStatKey(row: EquipStatRow): 'attack' | 'magic' | 'defense' | 'spirit' {
  const wtype = row.weapon_type ?? '';
  if (['staff', 'rod', 'spell_staff', 'seal', 'tuner', 'bind', 'robe'].includes(wtype)
    || (row.magic_bonus > row.attack_bonus && row.slot === 'weapon')) {
    return 'magic';
  }
  if (row.slot !== 'weapon' && row.slot !== 'accessory1' && row.slot !== 'accessory2') {
    if (row.defense_bonus >= row.spirit_bonus) return 'defense';
    return 'spirit';
  }
  if (row.attack_bonus >= row.magic_bonus) return 'attack';
  return 'magic';
}

/** +enhance: SR/UR 5%/lv、Uni 6%/lv、Src は src_level 段階伸び */
export function calcUpgradeStatBonuses(
  row: EquipStatRow,
  upgradeLevel: number,
  srcLevel: number,
  durPenalty: number,
  rarity = 'R',
): { attack: number; magic: number; defense: number; spirit: number; speed: number; hp: number } {
  const pct = 1 + calcUpgradePctBonus(rarity, upgradeLevel, srcLevel);
  const flat = rarity === 'Src' ? 0 : upgradeLevel;
  const primary = getPrimaryStatKey(row);

  return {
    attack: Math.floor(row.attack_bonus * durPenalty * pct) + (primary === 'attack' ? flat : 0),
    magic: Math.floor(row.magic_bonus * durPenalty * pct) + (primary === 'magic' ? flat : 0),
    defense: Math.floor(row.defense_bonus * durPenalty * pct) + (primary === 'defense' ? flat : 0),
    spirit: Math.floor(row.spirit_bonus * durPenalty * pct) + (primary === 'spirit' ? flat : 0),
    speed: Math.floor(row.speed_bonus * durPenalty * pct),
    hp: Math.floor(row.hp_bonus * durPenalty * pct),
  };
}

export function calcPrimaryStatValue(
  row: EquipStatRow,
  upgradeLevel: number,
  srcLevel: number,
  rarity: string,
  durPenalty = 1,
): number {
  const stats = calcUpgradeStatBonuses(row, upgradeLevel, srcLevel, durPenalty, rarity);
  const primary = getPrimaryStatKey(row);
  return stats[primary];
}

export function formatEnhanceDiff(
  before: EquipStatRow,
  afterLevel: number,
  srcLevel: number,
  rarity = 'R',
): string {
  const b = calcUpgradeStatBonuses(before, afterLevel - 1, srcLevel, 1, rarity);
  const a = calcUpgradeStatBonuses(before, afterLevel, srcLevel, 1, rarity);
  const primary = getPrimaryStatKey(before);
  const labels: Record<string, string> = { attack: '攻撃', magic: '魔力', defense: '防御', spirit: '精神' };
  const statKey = primary as keyof typeof b;
  const diff = a[statKey] - b[statKey];
  const lines = [`${labels[primary]} ${b[statKey]} → ${a[statKey]}（+${diff}）`];
  if (primary !== 'defense' && a.defense !== b.defense) lines.push(`防御 ${b.defense} → ${a.defense}`);
  if (primary !== 'magic' && a.magic !== b.magic && before.magic_bonus > 0) lines.push(`魔力 ${b.magic} → ${a.magic}`);
  return lines.join('\n');
}

export function formatEnhancePreview(req: EnhanceReq, currentLevel: number): string {
  return `+${currentLevel}→+${currentLevel + 1}: ${req.stoneName}×${req.stoneQty} / ${req.goldCost}G`;
}
