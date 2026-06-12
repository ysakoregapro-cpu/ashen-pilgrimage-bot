/**
 * 装備品ドロップ — 1)装備当たり 2)部位抽選 3)候補から1つ
 */
import { getDb } from '../db/database';
import { weightedChoice } from '../utils/random';

export const EQUIP_SLOT_WEIGHTS: Record<string, number> = {
  weapon: 35,
  head: 15,
  body: 20,
  legs: 15,
  feet: 15,
};

export type LootTier = 'early' | 'mid' | 'late' | 'valhalla';

export const CHEST_LOOT_TABLES: Record<LootTier, Array<{ kind: 'material' | 'equip'; rarity?: string; weight: number }>> = {
  early: [
    { kind: 'material', weight: 55 },
    { kind: 'equip', rarity: 'N', weight: 30 },
    { kind: 'equip', rarity: 'R', weight: 13 },
    { kind: 'equip', rarity: 'SR', weight: 2 },
  ],
  mid: [
    { kind: 'material', weight: 45 },
    { kind: 'equip', rarity: 'N', weight: 12 },
    { kind: 'equip', rarity: 'R', weight: 28 },
    { kind: 'equip', rarity: 'SR', weight: 13 },
    { kind: 'equip', rarity: 'SSR', weight: 2 },
  ],
  late: [
    { kind: 'material', weight: 40 },
    { kind: 'equip', rarity: 'R', weight: 15 },
    { kind: 'equip', rarity: 'SR', weight: 30 },
    { kind: 'equip', rarity: 'SSR', weight: 15 },
  ],
  valhalla: [
    { kind: 'material', weight: 40 },
    { kind: 'equip', rarity: 'SR', weight: 15 },
    { kind: 'equip', rarity: 'SSR', weight: 30 },
    { kind: 'equip', rarity: 'UR', weight: 15 },
  ],
};

export type BattleThreatTier = 'normal' | 'tough' | 'rare' | 'elite' | 'boss';

export const BATTLE_EQUIP_TABLES: Record<BattleThreatTier, Array<{ rarity?: string; kind?: 'none'; weight: number }>> = {
  normal: [
    { kind: 'none', weight: 92 },
    { rarity: 'N', weight: 4 },
    { rarity: 'R', weight: 4 },
    { rarity: 'SR', weight: 1 },
  ],
  tough: [
    { kind: 'none', weight: 88 },
    { rarity: 'R', weight: 6 },
    { rarity: 'SR', weight: 5 },
    { rarity: 'SSR', weight: 1 },
  ],
  rare: [
    { kind: 'none', weight: 82 },
    { rarity: 'SR', weight: 10 },
    { rarity: 'SSR', weight: 5 },
    { rarity: 'UR', weight: 3 },
  ],
  elite: [
    { kind: 'none', weight: 78 },
    { rarity: 'SR', weight: 12 },
    { rarity: 'SSR', weight: 7 },
    { rarity: 'UR', weight: 3 },
  ],
  boss: [
    { kind: 'none', weight: 75 },
    { rarity: 'SR', weight: 12 },
    { rarity: 'SSR', weight: 8 },
    { rarity: 'UR', weight: 5 },
  ],
};

export const REMATCH_LOOT_TABLE = [
  { kind: 'normal_mat' as const, weight: 55 },
  { kind: 'high_mat' as const, weight: 20 },
  { kind: 'equip' as const, weight: 8 },
  { kind: 'nothing' as const, weight: 17 },
];

export function resolveEquipSlot(): string {
  return weightedChoice(
    Object.entries(EQUIP_SLOT_WEIGHTS).map(([slot, weight]) => ({ slot, weight })),
  ).slot;
}

export function getAreaLootTier(areaMinLv: number, townId: string): LootTier {
  if (townId === 'valhalla_fortress') return 'valhalla';
  if (areaMinLv >= 50) return 'late';
  if (areaMinLv >= 20) return 'mid';
  return 'early';
}

function normalizeSlot(slot: string): string {
  if (slot === 'weapon') return 'weapon';
  if (['head', 'body', 'legs', 'feet'].includes(slot)) return slot;
  return 'weapon';
}

export function pickEquipmentFromAreaPool(
  pool: Array<{ item_id: string; weight: number }>,
  rarity: string,
  equipSlot: string,
): string | null {
  const candidates: Array<{ item_id: string; weight: number }> = [];
  for (const p of pool) {
    const row = getDb().prepare(`
      SELECT i.rarity, e.slot FROM items i
      JOIN equipment e ON i.id = e.item_id
      WHERE i.id = ? AND i.category = 'equipment'
    `).get(p.item_id) as { rarity: string; slot: string } | undefined;
    if (!row || row.rarity !== rarity) continue;
    if (normalizeSlot(row.slot) !== equipSlot) continue;
    candidates.push(p);
  }
  if (!candidates.length) return null;
  return weightedChoice(candidates).item_id;
}

export function rollChestLoot(tier: LootTier): { kind: 'material' | 'equip'; rarity?: string } {
  const pick = weightedChoice(CHEST_LOOT_TABLES[tier]);
  return { kind: pick.kind, rarity: pick.rarity };
}

export function rollBattleEquipmentRarity(
  threat: BattleThreatTier,
  lootTier: LootTier,
): string | null {
  let table = [...BATTLE_EQUIP_TABLES[threat]];
  if (lootTier !== 'valhalla' && lootTier !== 'late') {
    table = table.filter((e) => e.rarity !== 'UR');
  }
  const pick = weightedChoice(table);
  if (pick.kind === 'none') return null;
  return pick.rarity ?? null;
}

export function pickMaterialFromPool(pool: Array<{ item_id: string; weight: number }>): string | null {
  const mats = pool.filter((p) => {
    const row = getDb().prepare('SELECT category FROM items WHERE id = ?').get(p.item_id) as { category: string } | undefined;
    return row && row.category !== 'equipment';
  });
  if (!mats.length) return null;
  return weightedChoice(mats).item_id;
}

export function pickHighMaterialFromPool(pool: Array<{ item_id: string; weight: number }>): string | null {
  const high = pool.filter((p) => {
    const row = getDb().prepare('SELECT category, id, rarity FROM items WHERE id = ?').get(p.item_id) as {
      category: string; id: string; rarity: string;
    } | undefined;
    if (!row || row.category === 'equipment') return false;
    if (row.id.startsWith('upg_')) return true;
    if (row.id.startsWith('boss_')) return true;
    if (row.id.startsWith('mat_') && ['SR', 'SSR', 'UR'].includes(row.rarity)) return true;
    return row.id.includes('forgotten') || row.id.includes('starfall') || row.id.includes('hourglass');
  });
  if (!high.length) return pickMaterialFromPool(pool);
  return weightedChoice(high).item_id;
}

export function rollRematchGenericLoot(): 'normal_mat' | 'high_mat' | 'equip' | 'nothing' {
  return weightedChoice(REMATCH_LOOT_TABLE).kind;
}
