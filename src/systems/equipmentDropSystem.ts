/**
 * 装備品ドロップ — 1)装備当たり 2)部位抽選 3)候補から1つ
 */
import { getDb } from '../db/database';
import { weightedChoice } from '../utils/random';

export const EQUIP_SLOT_WEIGHTS: Record<string, number> = {
  weapon: 30,
  head: 14,
  body: 18,
  arms: 12,
  legs: 13,
  feet: 13,
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
    { kind: 'material', weight: 50 },
    { kind: 'equip', rarity: 'N', weight: 10 },
    { kind: 'equip', rarity: 'R', weight: 28 },
    { kind: 'equip', rarity: 'SR', weight: 10 },
    { kind: 'equip', rarity: 'SSR', weight: 1 },
  ],
  late: [
    { kind: 'material', weight: 45 },
    { kind: 'equip', rarity: 'R', weight: 18 },
    { kind: 'equip', rarity: 'SR', weight: 28 },
    { kind: 'equip', rarity: 'SSR', weight: 9 },
  ],
  valhalla: [
    { kind: 'material', weight: 45 },
    { kind: 'equip', rarity: 'SR', weight: 18 },
    { kind: 'equip', rarity: 'SSR', weight: 27 },
    { kind: 'equip', rarity: 'UR', weight: 10 },
  ],
};

export type BattleThreatTier = 'normal' | 'tough' | 'rare' | 'elite' | 'boss';

export const BATTLE_EQUIP_TABLES: Record<BattleThreatTier, Array<{ rarity?: string; kind?: 'none'; weight: number }>> = {
  normal: [
    { kind: 'none', weight: 94 },
    { rarity: 'N', weight: 3 },
    { rarity: 'R', weight: 3 },
    { rarity: 'SR', weight: 0.5 },
  ],
  tough: [
    { kind: 'none', weight: 90 },
    { rarity: 'R', weight: 5 },
    { rarity: 'SR', weight: 4 },
    { rarity: 'SSR', weight: 1 },
  ],
  rare: [
    { kind: 'none', weight: 86 },
    { rarity: 'SR', weight: 9 },
    { rarity: 'SSR', weight: 4 },
    { rarity: 'UR', weight: 1 },
  ],
  elite: [
    { kind: 'none', weight: 82 },
    { rarity: 'SR', weight: 11 },
    { rarity: 'SSR', weight: 5 },
    { rarity: 'UR', weight: 2 },
  ],
  boss: [
    { kind: 'none', weight: 78 },
    { rarity: 'SR', weight: 12 },
    { rarity: 'SSR', weight: 7 },
    { rarity: 'UR', weight: 3 },
  ],
};

export const REMATCH_LOOT_TABLE = [
  { kind: 'normal_mat' as const, weight: 58 },
  { kind: 'high_mat' as const, weight: 22 },
  { kind: 'equip' as const, weight: 5 },
  { kind: 'nothing' as const, weight: 15 },
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
  if (['head', 'body', 'arms', 'legs', 'feet'].includes(slot)) return slot;
  return 'weapon';
}

export function pickEquipmentFromAreaPool(
  pool: Array<{ item_id: string; weight: number }>,
  rarity: string,
  equipSlot: string,
): string | null {
  const buildCandidates = (slot: string) => {
    const candidates: Array<{ item_id: string; weight: number }> = [];
    for (const p of pool) {
      const row = getDb().prepare(`
        SELECT i.rarity, e.slot FROM items i
        JOIN equipment e ON i.id = e.item_id
        WHERE i.id = ? AND i.category = 'equipment'
      `).get(p.item_id) as { rarity: string; slot: string } | undefined;
      if (!row || row.rarity !== rarity) continue;
      if (normalizeSlot(row.slot) !== slot) continue;
      candidates.push(p);
    }
    return candidates;
  };

  let candidates = buildCandidates(equipSlot);
  if (!candidates.length) {
    const any: Array<{ item_id: string; weight: number }> = [];
    for (const p of pool) {
      const row = getDb().prepare(`
        SELECT i.rarity, e.slot FROM items i
        JOIN equipment e ON i.id = e.item_id
        WHERE i.id = ? AND i.category = 'equipment'
      `).get(p.item_id) as { rarity: string; slot: string } | undefined;
      if (!row || row.rarity !== rarity) continue;
      any.push(p);
    }
    candidates = any;
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
