import { getDb } from '../db/database';
import { addItem, getInventory } from './inventorySystem';
import { requirePlayer, spendGold, addGold } from './playerSystem';
import { canPerformItemAction } from './itemProtectionSystem';
import { getInventorySellPrice, resolveShopBuyPrice, getItemPricing } from './itemValueSystem';
import { nowIso } from '../types';

export interface ShopItem {
  item_id: string;
  name: string;
  buy_price: number;
  rarity: string;
}

const SHOP_ADDITIONS: Record<string, string[]> = {
  start_starfield: ['wpn_leather_gauntlet', 'arm_set_starfield_arms', 'arm_set_starfield_legs', 'arm_set_starfield_feet'],
  old_road_village: ['wpn_training_hammer', 'wpn_old_bow', 'wpn_leather_gauntlet', 'arm_set_old_road_arms', 'arm_set_old_road_legs', 'arm_set_old_road_feet'],
  silver_mine: ['wpn_training_hammer', 'wpn_mini_cannon', 'arm_set_silver_arms', 'arm_set_silver_legs', 'arm_set_silver_feet'],
  mist_forest: ['wpn_old_bow'],
  deep_furnace_outpost: ['wpn_mini_cannon'],
};

const TOWN_SHOP_CATALOG: Record<string, string[]> = {
  start_starfield: ['cons_heal_potion', 'cons_antidote', 'cons_smoke_bomb', 'upg_rough_stone', 'rep_patch', 'wpn_traveler_sword', 'arm_set_starfield_body', ...SHOP_ADDITIONS.start_starfield!],
  old_road_village: ['cons_heal_potion', 'cons_antidote', 'upg_rough_stone', 'rep_patch', 'wpn_old_road_knife', 'arm_set_old_road_head', ...SHOP_ADDITIONS.old_road_village!],
  twilight_port: ['cons_heal_potion', 'cons_heal_medium', 'cons_antidote', 'cons_smoke_bomb', 'cons_lamp_bottle', 'upg_rough_stone', 'upg_stone', 'rep_patch', 'wpn_twilight_bow', 'arm_set_twilight_head'],
  silver_mine: ['cons_heal_medium', 'cons_antidote', 'upg_stone', 'rep_oil', 'rep_silver_clip', 'wpn_silver_hammer', 'arm_set_silver_head', 'mat_silver_ore', ...SHOP_ADDITIONS.silver_mine!],
  mist_forest: ['cons_heal_medium', 'cons_antidote', 'cons_status_cure', 'upg_stone', 'rep_patch', 'acc_traveler_ring', 'acc_mist_talisman', ...SHOP_ADDITIONS.mist_forest!],
  moon_library: ['cons_heal_medium', 'cons_heal_large', 'cons_status_cure', 'upg_fine_stone', 'rep_silver_clip'],
  forgotten_market: ['cons_heal_large', 'cons_status_cure', 'upg_fine_stone', 'rep_oil', 'acc_silver_bracelet', 'acc_moon_pendant'],
  hourglass_city: ['cons_heal_large', 'cons_status_cure', 'upg_fine_stone', 'rep_silver_clip'],
  ash_capital: ['cons_heal_large', 'cons_status_cure', 'upg_fine_stone', 'upg_rare_stone', 'rep_deep_repair'],
  deep_furnace_outpost: ['cons_heal_large', 'cons_lamp_bottle', 'upg_rare_stone', 'upg_deep_core_stone', 'rep_deep_repair', 'cons_status_cure', ...SHOP_ADDITIONS.deep_furnace_outpost!],
  valhalla_fortress: ['cons_heal_large', 'cons_lamp_bottle', 'cons_status_cure', 'upg_rare_stone', 'upg_deep_core_stone', 'rep_deep_repair'],
  rain_ruins: ['cons_heal_potion', 'cons_heal_medium', 'cons_antidote', 'upg_rough_stone', 'wpn_rain_bow'],
};

export function getShopCatalog(townId: string): ShopItem[] {
  const ids = TOWN_SHOP_CATALOG[townId] ?? TOWN_SHOP_CATALOG.start_starfield!;
  const items: ShopItem[] = [];
  for (const id of ids) {
    const item = getItemPricing(id);
    if (!item) continue;
    items.push({
      item_id: id,
      name: (getDb().prepare('SELECT name FROM items WHERE id = ?').get(id) as { name: string }).name,
      buy_price: resolveShopBuyPrice(item),
      rarity: item.rarity,
    });
  }
  return items;
}

export function formatShopCatalog(townId: string): string {
  const items = getShopCatalog(townId);
  return items.map((i) => `[${i.rarity}] ${i.name} — **${i.buy_price}G**`).join('\n');
}

export function formatShopCatalogForPlayer(userId: string, townId: string): string {
  const player = requirePlayer(userId);
  const items = getShopCatalog(townId);
  const lines = items.map((i) => `[${i.rarity}] ${i.name} — **${i.buy_price}G**`);
  return [`所持金: **${player.gold}G**`, '', ...lines].join('\n');
}

export function calcMaxBuyable(gold: number, unitPrice: number): number {
  if (unitPrice <= 0) return 0;
  return Math.floor(gold / unitPrice);
}

export function buyShopItem(userId: string, itemId: string, townId: string, quantity = 1): { ok: boolean; message: string } {
  const qty = Math.max(1, Math.floor(quantity));
  const catalog = getShopCatalog(townId);
  if (!catalog.some((c) => c.item_id === itemId)) {
    return { ok: false, message: 'この店では扱っていない品だ。' };
  }
  const item = getItemPricing(itemId);
  if (!item) return { ok: false, message: '品が見つかりません。' };
  const price = resolveShopBuyPrice(item);
  const total = price * qty;
  const player = requirePlayer(userId);
  if (player.gold < total) {
    const max = calcMaxBuyable(player.gold, price);
    return { ok: false, message: max > 0
      ? `ゴールドが足りません。（${total}G必要・最大${max}個まで）`
      : `ゴールドが足りません。（${total}G必要）` };
  }
  if (!spendGold(userId, total)) {
    return { ok: false, message: `ゴールドが足りません。（${total}G必要）` };
  }
  addItem(userId, itemId, qty);
  const name = (getDb().prepare('SELECT name FROM items WHERE id = ?').get(itemId) as { name: string }).name;
  const afterGold = requirePlayer(userId).gold;
  return {
    ok: true,
    message: qty === 1
      ? `「${name}」を${total}Gで買った。\n所持金: ${player.gold}G → ${afterGold}G`
      : `「${name}」×${qty}を${total}Gで買った。\n所持金: ${player.gold}G → ${afterGold}G`,
  };
}

export function getSellableInventory(userId: string) {
  return getInventory(userId).filter((row) => {
    const r = row as {
      id: number; is_equipped: number; is_pending_reward: number; is_listed?: number;
      category: string; rarity: string; tradeable: number; quantity: number;
    };
    if (r.is_equipped || r.is_pending_reward || r.is_listed) return false;
    if (r.category === 'equipment' && (r.rarity === 'Src' || !r.tradeable)) return false;
    if (r.category === 'key_item' || r.rarity === 'Src') return false;
    return r.quantity > 0;
  }) as Array<{
    id: number; name: string; quantity: number; rarity: string; category: string;
    upgrade_level: number; durability_state: string; metadata_json: string | null; item_id: string;
  }>;
}

export function sellInventoryItem(userId: string, inventoryId: number, quantity = 1): { ok: boolean; message: string } {
  const check = canPerformItemAction(inventoryId, userId, 'sell');
  if (!check.ok) return { ok: false, message: check.reason ?? '売却できません。' };

  const row = getDb().prepare(`
    SELECT pi.*, i.name, i.category FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as {
    quantity: number; item_id: string; name: string; category: string;
    upgrade_level: number; durability_state: string; metadata_json: string | null;
  } | undefined;
  if (!row || row.quantity < quantity) return { ok: false, message: '数量が足りません。' };

  const unitPrice = row.category === 'equipment'
    ? getInventorySellPrice(row.item_id, row.upgrade_level, row.durability_state as '良好', row.metadata_json)
    : getInventorySellPrice(row.item_id, 0, '良好', null);
  const total = unitPrice * quantity;

  if (row.quantity <= quantity) {
    getDb().prepare('DELETE FROM player_inventory WHERE id = ?').run(inventoryId);
  } else {
    getDb().prepare('UPDATE player_inventory SET quantity = quantity - ?, updated_at = ? WHERE id = ?')
      .run(quantity, nowIso(), inventoryId);
  }
  addGold(userId, total);
  return { ok: true, message: `「${row.name}」×${quantity}を${total}Gで売却した。` };
}
