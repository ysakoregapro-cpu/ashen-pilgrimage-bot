import { getDb } from '../db/database';
import { nowIso } from '../types';
import { canLoseOnDefeat } from './itemProtectionSystem';
import type { AffixRollSource } from '../db/seedData/equipmentAffixMaster';
import { rollEquipmentInstance } from './equipmentAffixSystem';

export function addItem(userId: string, itemId: string, quantity = 1, opts?: {
  upgradeLevel?: number; durability?: string; srcLevel?: number; pending?: boolean; metadata?: string;
  rollSource?: AffixRollSource; valhallaOrRaid?: boolean;
}): number {
  const db = getDb();
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as { category: string } | undefined;
  if (!item) throw new Error(`Item not found: ${itemId}`);

  const isEquipment = item.category === 'equipment';
  if (isEquipment) {
    const ts = nowIso();
    let affixJson: string | null = null;
    let statRollJson: string | null = null;
    if (opts?.rollSource) {
      const eq = db.prepare(`
        SELECT e.slot, e.hp_bonus, e.mp_bonus, e.attack_bonus, e.magic_bonus, e.defense_bonus,
          e.speed_bonus, e.crit_rate_bonus, i.rarity
        FROM equipment e JOIN items i ON e.item_id = i.id WHERE e.item_id = ?
      `).get(itemId) as {
        slot: string; hp_bonus: number; mp_bonus: number; attack_bonus: number; magic_bonus: number;
        defense_bonus: number; speed_bonus: number; crit_rate_bonus: number; rarity: string;
      } | undefined;
      if (eq) {
        const rolled = rollEquipmentInstance({
          rarity: eq.rarity,
          slot: eq.slot,
          rollSource: opts.rollSource,
          valhallaOrRaid: opts.valhallaOrRaid,
          baseStats: {
            hp_bonus: eq.hp_bonus, mp_bonus: eq.mp_bonus, attack_bonus: eq.attack_bonus,
            magic_bonus: eq.magic_bonus, defense_bonus: eq.defense_bonus, speed_bonus: eq.speed_bonus,
            crit_rate_bonus: eq.crit_rate_bonus,
          },
        });
        affixJson = rolled.affix_json;
        statRollJson = rolled.stat_roll_json;
      }
    }
    const r = db.prepare(`
      INSERT INTO player_inventory (user_id, item_id, quantity, upgrade_level, durability_state, src_level, is_pending_reward, metadata_json, affix_json, stat_roll_json, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, itemId, opts?.upgradeLevel ?? 0, opts?.durability ?? '良好', opts?.srcLevel ?? 0,
      opts?.pending ? 1 : 0, opts?.metadata ?? null, affixJson, statRollJson, ts, ts,
    );
    return Number(r.lastInsertRowid);
  }

  const existing = db.prepare('SELECT * FROM player_inventory WHERE user_id = ? AND item_id = ? AND is_equipped = 0 LIMIT 1')
    .get(userId, itemId) as { id: number; quantity: number } | undefined;
  if (existing) {
    db.prepare('UPDATE player_inventory SET quantity = quantity + ?, updated_at = ? WHERE id = ?')
      .run(quantity, nowIso(), existing.id);
    return existing.id;
  }

  const ts = nowIso();
  const r = db.prepare(`
    INSERT INTO player_inventory (user_id, item_id, quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
  `).run(userId, itemId, quantity, ts, ts);
  return Number(r.lastInsertRowid);
}

export function removeItem(userId: string, inventoryId: number, quantity = 1): boolean {
  const row = getDb().prepare('SELECT * FROM player_inventory WHERE id = ? AND user_id = ?').get(inventoryId, userId) as {
    quantity: number; is_equipped: number;
  } | undefined;
  if (!row || row.is_equipped) return false;
  if (row.quantity <= quantity) {
    getDb().prepare('DELETE FROM player_inventory WHERE id = ?').run(inventoryId);
  } else {
    getDb().prepare('UPDATE player_inventory SET quantity = quantity - ?, updated_at = ? WHERE id = ?')
      .run(quantity, nowIso(), inventoryId);
  }
  return true;
}

export function getInventory(userId: string) {
  return getDb().prepare(`
    SELECT pi.*, i.name, i.category, i.rarity, i.description, i.tradeable, e.slot as eq_slot, e.series_id
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    LEFT JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ?
    ORDER BY i.category, i.rarity DESC, i.name
  `).all(userId);
}

export function getInventoryByCategory(userId: string, category: string) {
  const all = getInventory(userId);
  if (category === 'all') return all;
  return all.filter((i) => {
    const row = i as { category: string };
    if (category === 'equipment') return row.category === 'equipment';
    if (category === 'consumable') return row.category === 'consumable';
    if (category === 'material') return row.category !== 'equipment' && row.category !== 'consumable';
    return true;
  });
}

export function getItemCount(userId: string, itemId: string): number {
  const rows = getDb().prepare(`
    SELECT SUM(quantity) as total FROM player_inventory WHERE user_id = ? AND item_id = ?
  `).get(userId, itemId) as { total: number | null };
  return rows.total ?? 0;
}

export function consumeMaterial(userId: string, itemId: string, quantity: number): boolean {
  const rows = getDb().prepare(`
    SELECT * FROM player_inventory WHERE user_id = ? AND item_id = ? AND is_equipped = 0 ORDER BY quantity DESC
  `).all(userId, itemId) as Array<{ id: number; quantity: number }>;

  let remaining = quantity;
  for (const row of rows) {
    if (remaining <= 0) break;
    const take = Math.min(row.quantity, remaining);
    removeItem(userId, row.id, take);
    remaining -= take;
  }
  return remaining <= 0;
}

export function confirmPendingRewards(userId: string): void {
  getDb().prepare('UPDATE player_inventory SET is_pending_reward = 0, updated_at = ? WHERE user_id = ? AND is_pending_reward = 1')
    .run(nowIso(), userId);
}

export function finalizeExplorationLoot(userId: string): { confirmed: string[]; message: string } {
  const pending = getDb().prepare(`
    SELECT pi.id, i.name FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ? AND pi.is_pending_reward = 1
  `).all(userId) as Array<{ id: number; name: string }>;
  if (!pending.length) return { confirmed: [], message: '' };
  confirmPendingRewards(userId);
  const names = pending.map((p) => p.name);
  const msg = names.length === 1
    ? '道中の荷物を整理しました。'
    : '道中の荷物を整理しました。';
  return { confirmed: names, message: `${msg}\n・${names.join('、')}` };
}

export function losePendingRewards(userId: string, ratio: number): string[] {
  const pending = getDb().prepare(`
    SELECT pi.id AS inventory_id, i.name AS item_name, i.category, i.rarity, i.id AS item_id, COALESCE(e.is_unique, 0) AS is_unique
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    LEFT JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND pi.is_pending_reward = 1
  `).all(userId) as Array<{ inventory_id: number; item_name: string; category: string; rarity: string; item_id: string; is_unique: number }>;

  const lost: string[] = [];
  for (const p of pending) {
    if (!canLoseOnDefeat(p)) {
      getDb().prepare('UPDATE player_inventory SET is_pending_reward = 0, updated_at = ? WHERE id = ?').run(nowIso(), p.inventory_id);
      continue;
    }
    if (Math.random() < ratio) {
      getDb().prepare('DELETE FROM player_inventory WHERE id = ?').run(p.inventory_id);
      lost.push(p.item_name);
    } else {
      getDb().prepare('UPDATE player_inventory SET is_pending_reward = 0, updated_at = ? WHERE id = ?').run(nowIso(), p.inventory_id);
    }
  }
  return lost;
}
