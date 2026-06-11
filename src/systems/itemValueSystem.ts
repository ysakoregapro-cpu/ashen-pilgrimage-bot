import { getDb } from '../db/database';
import { DURABILITY_PENALTY, type DurabilityState } from '../types';

type ItemPriceRow = {
  id: string;
  sell_price: number;
  base_value: number | null;
  shop_buy_price: number | null;
  shop_sell_price: number | null;
  rarity: string;
  category: string;
};

export function getItemPricing(itemId: string): ItemPriceRow | undefined {
  return getDb().prepare(`
    SELECT id, sell_price, base_value, shop_buy_price, shop_sell_price, rarity, category
    FROM items WHERE id = ?
  `).get(itemId) as ItemPriceRow | undefined;
}

export function resolveBaseValue(item: ItemPriceRow): number {
  if (item.base_value != null && item.base_value > 0) return item.base_value;
  if (item.sell_price > 0) return Math.max(1, Math.round(item.sell_price / 0.3));
  return defaultBaseByRarity(item.rarity, item.category);
}

export function resolveShopBuyPrice(item: ItemPriceRow): number {
  if (item.shop_buy_price != null && item.shop_buy_price > 0) return item.shop_buy_price;
  return Math.max(1, Math.round(resolveBaseValue(item) * 1.3));
}

export function resolveShopSellPrice(item: ItemPriceRow): number {
  if (item.shop_sell_price != null && item.shop_sell_price > 0) return item.shop_sell_price;
  return Math.max(1, Math.round(resolveBaseValue(item) * 0.3));
}

export function resolveEquipmentDynamicValue(
  baseValue: number,
  upgradeLevel: number,
  durability: DurabilityState,
  metadataJson: string | null,
): number {
  let value = baseValue * (1 + upgradeLevel * 0.15) * (DURABILITY_PENALTY[durability] ?? 1);
  if (metadataJson) {
    try {
      const meta = JSON.parse(metadataJson) as { random_bonuses?: Record<string, number> };
      if (meta.random_bonuses) {
        const bonusSum = Object.values(meta.random_bonuses).reduce((a, b) => a + Math.abs(b), 0);
        value *= 1 + bonusSum * 0.02;
      }
    } catch { /* ignore */ }
  }
  return Math.max(1, Math.round(value));
}

export function getInventorySellPrice(
  itemId: string,
  upgradeLevel: number,
  durability: DurabilityState,
  metadataJson: string | null,
): number {
  const item = getItemPricing(itemId);
  if (!item) return 0;
  const base = resolveBaseValue(item);
  const dynamic = resolveEquipmentDynamicValue(base, upgradeLevel, durability, metadataJson);
  return Math.max(1, Math.round(dynamic * 0.3));
}

export function getMarketPriceHint(itemId: string, upgradeLevel = 0): { min: number; max: number; base: number } {
  const item = getItemPricing(itemId);
  if (!item) return { min: 1, max: 999, base: 10 };
  const base = resolveEquipmentDynamicValue(resolveBaseValue(item), upgradeLevel, '良好', null);
  return { min: Math.max(1, Math.round(base * 0.7)), max: Math.round(base * 15), base };
}

function defaultBaseByRarity(rarity: string, category: string): number {
  if (category === 'consumable') {
    const map: Record<string, number> = { N: 40, R: 80, SR: 150, SSR: 300, UR: 500 };
    return map[rarity] ?? 30;
  }
  if (category === 'equipment') {
    const map: Record<string, number> = { N: 120, R: 500, SR: 1500, SSR: 5000, UR: 25000, Src: 50000 };
    return map[rarity] ?? 50;
  }
  const mat: Record<string, number> = { N: 15, R: 60, SR: 200, SSR: 600, UR: 2000, Src: 5000 };
  return mat[rarity] ?? 10;
}
