import { getDb } from '../db/database';
import { recalculatePlayerStats, requirePlayer } from './playerSystem';
import { nowIso, SLOT_LABELS, type EquipmentSlot } from '../types';

const EQUIPPABLE_SLOTS: EquipmentSlot[] = [
  'weapon', 'head', 'body', 'arms', 'legs', 'feet', 'accessory1', 'accessory2', 'sub',
];

export function getEquipped(userId: string) {
  return getDb().prepare(`
    SELECT pe.slot, pi.*, i.name, i.rarity, e.slot as eq_slot, es.name as series_name
    FROM player_equipment pe
    LEFT JOIN player_inventory pi ON pe.inventory_id = pi.id
    LEFT JOIN items i ON pi.item_id = i.id
    LEFT JOIN equipment e ON pi.item_id = e.item_id
    LEFT JOIN equipment_sets es ON e.series_id = es.id
    WHERE pe.user_id = ?
  `).all(userId);
}

export function getEquippableItems(userId: string, slot: EquipmentSlot) {
  return getDb().prepare(`
    SELECT pi.*, i.name, i.rarity, e.slot
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND pi.is_equipped = 0 AND e.slot = ?
  `).all(userId, slot);
}

export function equipItem(userId: string, inventoryId: number): string {
  const inv = getDb().prepare(`
    SELECT pi.*, e.slot, i.name FROM player_inventory pi
    JOIN equipment e ON pi.item_id = e.item_id
    JOIN items i ON pi.item_id = i.id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as { id: number; slot: EquipmentSlot; name: string; is_equipped: number } | undefined;

  if (!inv) return '装備が見つかりません。';
  if (inv.is_equipped) return '既に装備中です。';

  const slot = inv.slot;
  if (!EQUIPPABLE_SLOTS.includes(slot)) return 'このスロットには装備できません。';

  const db = getDb();
  const existing = db.prepare('SELECT inventory_id FROM player_equipment WHERE user_id = ? AND slot = ?').get(userId, slot) as { inventory_id: number } | undefined;
  if (existing?.inventory_id) {
    db.prepare('UPDATE player_inventory SET is_equipped = 0, updated_at = ? WHERE id = ?').run(nowIso(), existing.inventory_id);
  }

  db.prepare('INSERT OR REPLACE INTO player_equipment (user_id, slot, inventory_id) VALUES (?, ?, ?)').run(userId, slot, inventoryId);
  db.prepare('UPDATE player_inventory SET is_equipped = 1, updated_at = ? WHERE id = ?').run(nowIso(), inventoryId);
  recalculatePlayerStats(userId);
  return `${SLOT_LABELS[slot] ?? slot}に「${inv.name}」を装備しました。`;
}

export function unequipSlot(userId: string, slot: EquipmentSlot): string {
  const row = getDb().prepare('SELECT inventory_id FROM player_equipment WHERE user_id = ? AND slot = ?').get(userId, slot) as { inventory_id: number } | undefined;
  if (!row?.inventory_id) return '何も装備していません。';
  getDb().prepare('UPDATE player_inventory SET is_equipped = 0, updated_at = ? WHERE id = ?').run(nowIso(), row.inventory_id);
  getDb().prepare('DELETE FROM player_equipment WHERE user_id = ? AND slot = ?').run(userId, slot);
  recalculatePlayerStats(userId);
  return `${SLOT_LABELS[slot] ?? slot}を外しました。`;
}

export function formatEquipmentDisplay(userId: string): string {
  const equipped = getEquipped(userId) as Array<{ slot: string; name: string | null; rarity: string | null; upgrade_level: number; durability_state: string; src_level: number }>;
  const lines: string[] = [];
  for (const s of EQUIPPABLE_SLOTS) {
    const eq = equipped.find((e) => e.slot === s);
    if (eq?.name) {
      const upg = eq.src_level > 0 ? ` Src+${eq.src_level}` : eq.upgrade_level > 0 ? ` +${eq.upgrade_level}` : '';
      lines.push(`**${SLOT_LABELS[s]}**: ${eq.name}${upg} (${eq.durability_state})`);
    } else {
      lines.push(`**${SLOT_LABELS[s]}**: —`);
    }
  }
  return lines.join('\n');
}
