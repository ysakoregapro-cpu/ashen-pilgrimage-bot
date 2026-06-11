import { getDb } from '../db/database';
import { addGold, requirePlayer, spendGold } from './playerSystem';
import { canPerformItemAction } from './itemProtectionSystem';
import { getMarketPriceHint, resolveBaseValue, getItemPricing } from './itemValueSystem';
import { nowIso } from '../types';
import { uuid } from '../utils/random';

export function getExchangeName(townId: string): string {
  if (townId === 'forgotten_market') return '地下取引所';
  if (townId === 'valhalla_fortress') return '要塞商会';
  if (townId === 'start_starfield' || townId === 'old_road_village') return '巡礼者商会';
  return '灰星商会';
}

export function createListing(userId: string, inventoryId: number, price: number): { ok: boolean; message: string } {
  const check = canPerformItemAction(inventoryId, userId, 'market_list');
  if (!check.ok) return { ok: false, message: check.reason ?? '出品できません。' };

  if (price < 1) return { ok: false, message: '価格は1G以上にしてください。' };

  const row = getDb().prepare(`
    SELECT pi.*, i.name, i.rarity FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as {
    item_id: string; quantity: number; upgrade_level: number; name: string;
  } | undefined;
  if (!row) return { ok: false, message: '品が見つかりません。' };

  const hint = getMarketPriceHint(row.item_id, row.upgrade_level);
  if (price > hint.max * 2) {
    return { ok: false, message: `価格が高すぎます。目安: ${hint.min}〜${hint.max}G` };
  }

  const item = getItemPricing(row.item_id);
  const baseSnap = item ? resolveBaseValue(item) : hint.base;
  const id = uuid();
  getDb().prepare(`
    INSERT INTO market_listings (id, seller_id, inventory_id, item_id, quantity, price, base_value_snapshot, status, created_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, 'active', ?)
  `).run(id, userId, inventoryId, row.item_id, price, baseSnap, nowIso());
  getDb().prepare('UPDATE player_inventory SET is_listed = 1, updated_at = ? WHERE id = ?').run(nowIso(), inventoryId);
  return { ok: true, message: `「${row.name}」を${price}Gで出品した。\n目安価格: ${hint.min}〜${Math.round(hint.base * 1.5)}G` };
}

export function cancelListing(userId: string, listingId: string): { ok: boolean; message: string } {
  const listing = getDb().prepare('SELECT * FROM market_listings WHERE id = ? AND seller_id = ? AND status = ?')
    .get(listingId, userId, 'active') as { inventory_id: number } | undefined;
  if (!listing) return { ok: false, message: '出品が見つかりません。' };
  getDb().prepare("UPDATE market_listings SET status = 'cancelled' WHERE id = ?").run(listingId);
  getDb().prepare('UPDATE player_inventory SET is_listed = 0, updated_at = ? WHERE id = ?').run(nowIso(), listing.inventory_id);
  return { ok: true, message: '出品を取り下げた。' };
}

export function getActiveListings(limit = 20) {
  return getDb().prepare(`
    SELECT ml.*, i.name, i.rarity, pi.upgrade_level
    FROM market_listings ml
    JOIN items i ON ml.item_id = i.id
    JOIN player_inventory pi ON ml.inventory_id = pi.id
    WHERE ml.status = 'active'
    ORDER BY ml.created_at DESC LIMIT ?
  `).all(limit) as Array<{
    id: string; seller_id: string; price: number; name: string; rarity: string; upgrade_level: number; base_value_snapshot: number;
  }>;
}

export function getMyListings(userId: string) {
  return getDb().prepare(`
    SELECT ml.*, i.name, i.rarity, pi.upgrade_level
    FROM market_listings ml
    JOIN items i ON ml.item_id = i.id
    JOIN player_inventory pi ON ml.inventory_id = pi.id
    WHERE ml.seller_id = ? AND ml.status = 'active'
    ORDER BY ml.created_at DESC
  `).all(userId);
}

export function buyListing(buyerId: string, listingId: string): { ok: boolean; message: string } {
  const listing = getDb().prepare('SELECT * FROM market_listings WHERE id = ? AND status = ?')
    .get(listingId, 'active') as {
    seller_id: string; inventory_id: number; price: number; item_id: string;
  } | undefined;
  if (!listing) return { ok: false, message: '既に売却済みか、取り下げられています。' };
  if (listing.seller_id === buyerId) return { ok: false, message: '自分の出品は買えません。' };

  const buyer = requirePlayer(buyerId);
  if (buyer.gold < listing.price) return { ok: false, message: `ゴールドが足りません。（${listing.price}G必要）` };

  const db = getDb();
  const tx = db.transaction(() => {
    if (!spendGold(buyerId, listing.price)) throw new Error('gold');
    addGold(listing.seller_id, listing.price);
    db.prepare('UPDATE player_inventory SET user_id = ?, is_listed = 0, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(buyerId, nowIso(), listing.inventory_id, listing.seller_id);
    db.prepare("UPDATE market_listings SET status = 'sold', sold_at = ? WHERE id = ? AND status = 'active'")
      .run(nowIso(), listingId);
  });

  try {
    tx();
  } catch {
    return { ok: false, message: '購入に失敗しました。' };
  }

  const name = (getDb().prepare('SELECT name FROM items WHERE id = ?').get(listing.item_id) as { name: string }).name;
  return { ok: true, message: `「${name}」を${listing.price}Gで購入した。` };
}

export function formatListingList(listings: Array<{ id: string; name: string; rarity: string; price: number; upgrade_level: number; seller_id: string }>): string {
  if (!listings.length) return '出品はまだない。';
  return listings.map((l) => {
    const upg = l.upgrade_level > 0 ? ` +${l.upgrade_level}` : '';
    return `[${l.rarity}] ${l.name}${upg} — **${l.price}G** (${l.id.slice(0, 8)})`;
  }).join('\n');
}
