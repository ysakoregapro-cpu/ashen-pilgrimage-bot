import { getDb } from '../db/database';
import { TOWN_LOOT_POOLS, type TownLootCategory, type TownLootEntry } from '../db/seedData/townLootPools';
import { isJobStarterWeapon } from '../db/seedData/jobStarterWeapons';
import { roll, weightedChoice } from '../utils/random';
import { requirePlayer } from './playerSystem';

function canDropEquipment(userId: string, itemId: string, areaMinLv: number): boolean {
  const player = requirePlayer(userId);
  const item = getDb().prepare(`
    SELECT i.category, e.required_level FROM items i
    LEFT JOIN equipment e ON i.id = e.item_id
    WHERE i.id = ?
  `).get(itemId) as { category: string; required_level: number | null } | undefined;
  if (!item || item.category !== 'equipment') return true;
  const reqLv = item.required_level ?? 1;
  const deficit = areaMinLv - player.level;
  if (deficit <= 0) return true;
  if (deficit >= 4) return roll(0.12);
  if (deficit >= 2) return roll(0.35);
  return roll(0.55);
}

export function getAreaRank(areaId: string): number {
  const area = getDb().prepare('SELECT town_id FROM exploration_areas WHERE id = ?').get(areaId) as {
    town_id: string;
  } | undefined;
  if (!area) return 1;
  const areas = getDb().prepare(`
    SELECT id FROM exploration_areas WHERE town_id = ? ORDER BY recommended_min_level, id
  `).all(area.town_id) as Array<{ id: string }>;
  const idx = areas.findIndex((a) => a.id === areaId);
  return idx >= 0 ? idx + 1 : 1;
}

export function isEarlyAreaRank(rank: number): boolean {
  return rank <= 3;
}

function rankTierBoost(areaRank: number, valueTier: number): number {
  if (areaRank >= 4) {
    return 1 + Math.max(0, valueTier - 1) * 0.12 * (areaRank - 3);
  }
  if (isEarlyAreaRank(areaRank)) {
    return 1 + Math.max(0, 4 - valueTier) * 0.08;
  }
  return 1;
}

function effectiveWeight(entry: TownLootEntry, areaRank: number): number {
  if (areaRank < entry.min_area_rank || areaRank > entry.max_area_rank) return 0;
  if (isJobStarterWeapon(entry.item_id) && !isEarlyAreaRank(areaRank)) return 0;
  return entry.base_weight * rankTierBoost(areaRank, entry.value_tier);
}

export function buildEffectiveRewardPool(townId: string, areaId: string): Array<{ item_id: string; weight: number }> {
  const pool = TOWN_LOOT_POOLS[townId] ?? [];
  const areaRank = getAreaRank(areaId);
  const result: Array<{ item_id: string; weight: number }> = [];
  for (const entry of pool) {
    if (entry.category === 'gold') continue;
    const weight = effectiveWeight(entry, areaRank);
    if (weight > 0) result.push({ item_id: entry.item_id, weight });
  }
  return result;
}

export type TownLootPick = { kind: 'item'; itemId: string } | { kind: 'gold'; amount: number } | { kind: 'none' };

export function pickTownLoot(
  userId: string,
  townId: string,
  areaId: string,
  opts?: { categories?: TownLootCategory[]; excludeEquipment?: boolean },
): TownLootPick {
  const pool = TOWN_LOOT_POOLS[townId] ?? [];
  const areaRank = getAreaRank(areaId);
  const areaMinLv = (getDb().prepare('SELECT recommended_min_level FROM exploration_areas WHERE id = ?').get(areaId) as {
    recommended_min_level: number;
  } | undefined)?.recommended_min_level ?? 1;
  const allowed = new Set(opts?.categories);
  const candidates: Array<TownLootEntry & { weight: number }> = [];

  for (const entry of pool) {
    if (allowed.size && !allowed.has(entry.category)) continue;
    if (opts?.excludeEquipment && entry.category === 'equipment') continue;
    if (entry.category === 'equipment' && !canDropEquipment(userId, entry.item_id, areaMinLv)) continue;
    const weight = effectiveWeight(entry, areaRank);
    if (weight > 0) candidates.push({ ...entry, weight });
  }
  if (!candidates.length) return { kind: 'none' };

  const pick = weightedChoice(candidates);
  if (pick.category === 'gold') {
    const area = getDb().prepare('SELECT recommended_min_level FROM exploration_areas WHERE id = ?').get(areaId) as {
      recommended_min_level: number;
    } | undefined;
    const base = area?.recommended_min_level ?? 1;
    return { kind: 'gold', amount: Math.floor(base * 3 + Math.random() * base * 2) };
  }
  return { kind: 'item', itemId: pick.item_id };
}
