import { getDb } from '../db/database';

const PROTECTED_CATEGORIES = new Set(['key_item', 'src_core', 'src_upgrade_material']);
const PROTECTED_ITEM_IDS = new Set([
  'src_star_mark', 'src_star_mark_full', 'src_primordial', 'src_primordial_full',
  'src_ash_star', 'src_old_king_mark', 'src_valhalla_core',
]);

export type ItemAction = 'sell' | 'dismantle' | 'trade' | 'market_list' | 'defeat_loss';

export interface InventoryProtectRow {
  inventory_id: number;
  item_id: string;
  name: string;
  category: string;
  rarity: string;
  tradeable: number;
  is_equipped: number;
  is_pending_reward: number;
  is_listed: number;
  is_unique: number;
  src_weapon_id: string | null;
  src_level: number;
  metadata_json: string | null;
}

export function getInventoryProtectRow(inventoryId: number, userId: string): InventoryProtectRow | undefined {
  return getDb().prepare(`
    SELECT pi.id AS inventory_id, pi.item_id, i.name, i.category, i.rarity, i.tradeable,
      pi.is_equipped, pi.is_pending_reward, COALESCE(pi.is_listed, 0) AS is_listed,
      COALESCE(e.is_unique, 0) AS is_unique, e.src_weapon_id, pi.src_level, pi.metadata_json
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    LEFT JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as InventoryProtectRow | undefined;
}

export function isProtectedInventory(row: InventoryProtectRow, action: ItemAction): string | null {
  if (row.is_equipped) {
    return '装備中の品は、手放すことはできない。';
  }
  if (row.is_listed) {
    return '取引所に出品中の品は、いまは動かせない。';
  }
  if (row.is_pending_reward && action !== 'defeat_loss') {
    return '道中で得た品は、町へ戻るまで手放せない。';
  }
  if (!row.tradeable && (action === 'trade' || action === 'market_list' || action === 'sell')) {
    return 'それは、この旅に深く結びついた品だ。手放すことはできない。';
  }
  if (row.rarity === 'Src' || row.src_level > 0 || row.src_weapon_id) {
    if (action === 'sell' || action === 'dismantle' || action === 'trade' || action === 'market_list') {
      return '伝承の名が刻まれた武器は、手放すことはできない。';
    }
  }
  if (row.is_unique || row.metadata_json?.includes('kai_unique')) {
    if (action === 'sell' || action === 'dismantle' || action === 'trade' || action === 'market_list') {
      return 'それは、この旅に深く結びついた品だ。手放すことはできない。';
    }
  }
  if (PROTECTED_CATEGORIES.has(row.category)) {
    if (action === 'sell' || action === 'dismantle' || action === 'trade' || action === 'market_list') {
      return 'それは、この旅に深く結びついた品だ。手放すことはできない。';
    }
  }
  if (PROTECTED_ITEM_IDS.has(row.item_id)) {
    if (action === 'sell' || action === 'dismantle' || action === 'trade' || action === 'market_list') {
      return '星印の欠片は、手放すことはできない。';
    }
  }
  if (row.category === 'key_item') {
    return 'それは、この旅に深く結びついた品だ。手放すことはできない。';
  }
  return null;
}

export function canPerformItemAction(inventoryId: number, userId: string, action: ItemAction): { ok: boolean; reason?: string } {
  const row = getInventoryProtectRow(inventoryId, userId);
  if (!row) return { ok: false, reason: '品が見つかりません。' };
  const reason = isProtectedInventory(row, action);
  if (reason) return { ok: false, reason };
  return { ok: true };
}

export function isStoryProtectedItem(itemId: string, category: string): boolean {
  return PROTECTED_ITEM_IDS.has(itemId) || category === 'key_item';
}

export function canLoseOnDefeat(row: { item_id: string; category: string; rarity: string; is_unique: number }): boolean {
  if (row.is_unique) return false;
  if (row.rarity === 'Src') return false;
  if (PROTECTED_CATEGORIES.has(row.category)) return false;
  if (PROTECTED_ITEM_IDS.has(row.item_id)) return false;
  if (row.category === 'key_item') return false;
  return true;
}
