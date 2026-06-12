import { AREAS } from './areas';
import { STARTER_WEAPON_IDS } from './jobStarterWeapons';
import { NORMAL_EXPLORE_POOL_EXCLUDED, TOWN_LOOT_ITEM_OVERRIDES } from './dropBalanceMaster';

export type TownLootCategory = 'equipment' | 'material' | 'consumable' | 'gold';

export type TownLootEntry = {
  item_id: string;
  category: TownLootCategory;
  base_weight: number;
  min_area_rank: number;
  max_area_rank: number;
  value_tier: number;
};

const EXCLUDED_FROM_POOL = new Set(['cons_lamp_bottle']);

const RARE_TOWN_CONSUMABLES: Record<string, TownLootEntry[]> = {
  twilight_port: [{
    item_id: 'cons_lamp_bottle',
    category: 'consumable',
    base_weight: 3,
    min_area_rank: 2,
    max_area_rank: 5,
    value_tier: 4,
  }],
};

function categorizeItem(itemId: string): TownLootCategory {
  if (itemId === 'gold') return 'gold';
  if (itemId.startsWith('cons_')) return 'consumable';
  if (itemId.startsWith('wpn_') || itemId.startsWith('arm_') || itemId.startsWith('acc_')) return 'equipment';
  return 'material';
}

function inferValueTier(itemId: string, areaMinLv: number): number {
  if (itemId.startsWith('raid_') || itemId.startsWith('src_valhalla') || itemId.startsWith('src_old_king')
    || itemId.startsWith('src_machina') || itemId.startsWith('boss_silent')) return 5;
  if (itemId.startsWith('boss_') || itemId.startsWith('src_')) return 4;
  if (itemId.startsWith('upg_rare') || itemId.startsWith('upg_fine') || itemId.startsWith('upg_old_king')) return 4;
  if (areaMinLv >= 40) return 4;
  if (areaMinLv >= 20 || itemId.startsWith('upg_stone')) return 3;
  if (categorizeItem(itemId) === 'equipment') return 2;
  return 1;
}

function defaultWeight(category: TownLootCategory, tier: number, rarity?: string): number {
  if (category === 'equipment') {
    if (rarity === 'UR') return 2;
    if (rarity === 'SSR') return 3;
    if (rarity === 'SR') return 5;
    return tier >= 4 ? 6 : 8;
  }
  if (category === 'consumable') return tier >= 4 ? 4 : 6;
  if (category === 'gold') return 10;
  if (rarity === 'UR') return 3;
  if (rarity === 'SSR') return 5;
  if (rarity === 'SR') return 8;
  return tier >= 4 ? 6 : 12;
}

function mergeEntry(existing: TownLootEntry | undefined, next: TownLootEntry): TownLootEntry {
  if (!existing) return next;
  return {
    ...existing,
    min_area_rank: Math.min(existing.min_area_rank, next.min_area_rank),
    max_area_rank: Math.max(existing.max_area_rank, next.max_area_rank),
    value_tier: Math.max(existing.value_tier, next.value_tier),
    base_weight: Math.max(existing.base_weight, next.base_weight),
  };
}

function buildTownLootPools(): Record<string, TownLootEntry[]> {
  const map = new Map<string, Map<string, TownLootEntry>>();

  for (const townId of new Set(AREAS.map((a) => a.town))) {
    const townAreas = AREAS.filter((a) => a.town === townId).sort((a, b) => a.min - b.min);
    const townMap = new Map<string, TownLootEntry>();
    map.set(townId, townMap);

    for (let i = 0; i < townAreas.length; i++) {
      const area = townAreas[i]!;
      const rank = i + 1;
      for (const itemId of area.rewards) {
        if (EXCLUDED_FROM_POOL.has(itemId) || NORMAL_EXPLORE_POOL_EXCLUDED.has(itemId)) continue;
        const category = categorizeItem(itemId);
        const valueTier = inferValueTier(itemId, area.min);
        const ov = TOWN_LOOT_ITEM_OVERRIDES[itemId];
        const entry: TownLootEntry = {
          item_id: itemId,
          category,
          base_weight: ov?.base_weight ?? defaultWeight(category, valueTier, undefined),
          min_area_rank: ov?.min_area_rank ?? rank,
          max_area_rank: ov?.max_area_rank ?? rank,
          value_tier: ov?.value_tier ?? valueTier,
        };
        townMap.set(itemId, mergeEntry(townMap.get(itemId), entry));
      }
    }

    if (townAreas.length >= 3) {
      for (const starterId of STARTER_WEAPON_IDS) {
        if (townMap.has(starterId)) continue;
        const hasEarlyArea = townAreas.some((_, idx) => idx < 3);
        if (!hasEarlyArea) continue;
        townMap.set(starterId, {
          item_id: starterId,
          category: 'equipment',
          base_weight: 2 + (starterId === 'wpn_traveler_sword' ? 1 : 0),
          min_area_rank: 1,
          max_area_rank: 3,
          value_tier: 2,
        });
      }
    }

    for (const extra of RARE_TOWN_CONSUMABLES[townId] ?? []) {
      townMap.set(extra.item_id, mergeEntry(townMap.get(extra.item_id), extra));
    }

    for (const [itemId, entry] of [...townMap.entries()]) {
      if (!STARTER_WEAPON_IDS.has(itemId)) continue;
      townMap.set(itemId, {
        ...entry,
        base_weight: Math.min(entry.base_weight, 3),
        min_area_rank: 1,
        max_area_rank: Math.min(entry.max_area_rank, 3),
      });
    }

    townMap.set('gold', {
      item_id: 'gold',
      category: 'gold',
      base_weight: 8,
      min_area_rank: 1,
      max_area_rank: townAreas.length,
      value_tier: 1,
    });
  }

  const out: Record<string, TownLootEntry[]> = {};
  for (const [townId, entries] of map) {
    out[townId] = [...entries.values()];
  }
  return out;
}

export const TOWN_LOOT_POOLS: Record<string, TownLootEntry[]> = buildTownLootPools();

export const TOWN_POOL_MARKER = '@town_pool';
