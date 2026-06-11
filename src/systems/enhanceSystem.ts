const RARITY_MAX: Record<string, number> = { N: 5, R: 5, SR: 7, SSR: 10, UR: 15, Src: 10 };
const RARITY_GOLD_MULT: Record<string, number> = { N: 1.0, R: 1.0, SR: 1.5, SSR: 2.0, UR: 3.0 };

export type EnhanceReq = { stoneId: string; stoneName: string; stoneQty: number; goldCost: number };

const STONE_NAMES: Record<string, string> = {
  upg_rough_stone: '粗い強化石',
  upg_stone: '強化石',
  upg_fine_stone: '上質強化石',
  upg_rare_stone: '希少強化石',
};

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
  if (['staff', 'rod', 'spell_staff'].includes(wtype) || (row.magic_bonus > row.attack_bonus && row.slot === 'weapon')) {
    return 'magic';
  }
  if (row.slot !== 'weapon' && row.slot !== 'accessory1' && row.slot !== 'accessory2') {
    if (row.defense_bonus >= row.spirit_bonus) return 'defense';
    return 'spirit';
  }
  if (row.attack_bonus >= row.magic_bonus) return 'attack';
  return 'magic';
}

/** +1 per level flat on primary stat + 5% per level — guarantees visible change at +1 */
export function calcUpgradeStatBonuses(
  row: EquipStatRow,
  upgradeLevel: number,
  srcLevel: number,
  durPenalty: number,
): { attack: number; magic: number; defense: number; spirit: number; speed: number; hp: number } {
  const pct = 1 + upgradeLevel * 0.05 + srcLevel * 0.08;
  const flat = upgradeLevel;
  const primary = getPrimaryStatKey(row);

  const base = {
    attack: Math.floor(row.attack_bonus * durPenalty * pct) + (primary === 'attack' ? flat : 0),
    magic: Math.floor(row.magic_bonus * durPenalty * pct) + (primary === 'magic' ? flat : 0),
    defense: Math.floor(row.defense_bonus * durPenalty * pct) + (primary === 'defense' ? flat : 0),
    spirit: Math.floor(row.spirit_bonus * durPenalty * pct) + (primary === 'spirit' ? flat : 0),
    speed: Math.floor(row.speed_bonus * durPenalty * pct),
    hp: Math.floor(row.hp_bonus * durPenalty * pct),
  };
  return base;
}

export function formatEnhanceDiff(
  before: EquipStatRow,
  afterLevel: number,
  srcLevel: number,
): string {
  const b = calcUpgradeStatBonuses(before, afterLevel - 1, srcLevel, 1);
  const a = calcUpgradeStatBonuses(before, afterLevel, srcLevel, 1);
  const primary = getPrimaryStatKey(before);
  const labels: Record<string, string> = { attack: '攻撃', magic: '魔力', defense: '防御', spirit: '精神' };
  const key = primary;
  const statKey = key as keyof typeof b;
  const diff = a[statKey] - b[statKey];
  const lines = [`${labels[key]} ${b[statKey]} → ${a[statKey]}（+${diff}）`];
  if (primary !== 'defense' && a.defense !== b.defense) lines.push(`防御 ${b.defense} → ${a.defense}`);
  if (primary !== 'magic' && a.magic !== b.magic && before.magic_bonus > 0) lines.push(`魔力 ${b.magic} → ${a.magic}`);
  return lines.join('\n');
}

export function formatEnhancePreview(req: EnhanceReq, currentLevel: number): string {
  return `+${currentLevel}→+${currentLevel + 1}: ${req.stoneName}×${req.stoneQty} / ${req.goldCost}G`;
}
