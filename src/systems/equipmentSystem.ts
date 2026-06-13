import { getDb } from '../db/database';
import { recalculatePlayerStats, requirePlayer } from './playerSystem';
import { checkEquipRequirements } from './prepSystem';
import { nowIso, SLOT_LABELS, type EquipmentSlot } from '../types';
import { ButtonBuilder, ButtonStyle, ActionRowBuilder, type MessageActionRowComponentBuilder } from 'discord.js';
import { selectMenu } from '../utils/embeds';

import { buildActiveSetBonusSection } from './setBonusDisplaySystem';
import {
  buildEquipChangeSelectOptions,
  formatUpgradeTag,
  mapInventoryRowToEquipmentSelect,
  type OwnedEquipmentSelectRow,
} from './equipmentLabelSystem';

const RARITY_RANK: Record<string, number> = { UR: 70, SSR: 60, Uni: 55, Src: 50, SR: 30, R: 20, N: 10 };
export const EQUIP_SELECT_PAGE_SIZE = 24;

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
    ORDER BY i.rarity DESC, i.name
  `).all(userId, slot);
}

export function getSortedEquippableRows(userId: string, slot: EquipmentSlot): OwnedEquipmentSelectRow[] {
  const items = getEquippableItems(userId, slot) as Array<{
    id: number; name: string; rarity: string; upgrade_level: number; src_level: number;
    awakening_level: number; durability_state: string; is_equipped: number;
  }>;
  return items
    .map((i) => mapInventoryRowToEquipmentSelect({ ...i, slot }))
    .sort((a, b) => {
      const dr = (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0);
      return dr !== 0 ? dr : a.name.localeCompare(b.name, 'ja');
    });
}

export function buildEquipSlotSelectView(
  userId: string,
  slot: EquipmentSlot,
  page = 0,
  opts?: { customIdPrefix?: string; selectLabel?: string },
): { embedText: string; components: ActionRowBuilder<MessageActionRowComponentBuilder>[] } {
  const prefix = opts?.customIdPrefix ?? 'equip';
  const allRows = getSortedEquippableRows(userId, slot);
  const totalPages = Math.max(1, Math.ceil(allRows.length / EQUIP_SELECT_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const pageRows = allRows.slice(safePage * EQUIP_SELECT_PAGE_SIZE, (safePage + 1) * EQUIP_SELECT_PAGE_SIZE);
  const options = buildEquipChangeSelectOptions(slot, pageRows);
  const embedText = totalPages > 1
    ? `${SLOT_LABELS[slot] ?? slot} — ${allRows.length}件 (${safePage + 1}/${totalPages}ページ・高レア優先)`
    : `${SLOT_LABELS[slot] ?? slot}に装備するアイテムを選択（先頭で装備を外せます）`;
  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    selectMenu(`${prefix}:${slot}`, opts?.selectLabel ?? '装備を選択', options),
  ];
  if (totalPages > 1) {
    const nav = new ActionRowBuilder<ButtonBuilder>();
    if (safePage > 0) {
      nav.addComponents(
        new ButtonBuilder().setCustomId(`${prefix}:page:${slot}:${safePage - 1}`).setLabel('◀ 前').setStyle(ButtonStyle.Secondary),
      );
    }
    if (safePage < totalPages - 1) {
      nav.addComponents(
        new ButtonBuilder().setCustomId(`${prefix}:page:${slot}:${safePage + 1}`).setLabel('次 ▶').setStyle(ButtonStyle.Secondary),
      );
    }
    if (nav.components.length) components.push(nav);
  }
  return { embedText, components };
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

  const req = checkEquipRequirements(userId, inventoryId);
  if (!req.ok) return req.reason ?? '装備できません。';

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
  const db = getDb();
  const row = db.prepare('SELECT inventory_id FROM player_equipment WHERE user_id = ? AND slot = ?').get(userId, slot) as { inventory_id: number } | undefined;
  if (!row?.inventory_id) {
    return `${SLOT_LABELS[slot] ?? slot}は装備していません。`;
  }
  db.prepare('UPDATE player_inventory SET is_equipped = 0, updated_at = ? WHERE id = ?').run(nowIso(), row.inventory_id);
  db.prepare('DELETE FROM player_equipment WHERE user_id = ? AND slot = ?').run(userId, slot);
  recalculatePlayerStats(userId);
  return `${SLOT_LABELS[slot] ?? slot}の装備を外しました。`;
}

export function formatEquipmentDisplay(userId: string): string {
  const equipped = getEquipped(userId) as Array<{ slot: string; name: string | null; rarity: string | null; upgrade_level: number; durability_state: string; src_level: number }>;
  const lines: string[] = [];
  for (const s of EQUIPPABLE_SLOTS) {
    const eq = equipped.find((e) => e.slot === s);
    if (eq?.name) {
      const tag = formatUpgradeTag({
        rarity: eq.rarity ?? 'N',
        upgrade_level: eq.upgrade_level,
        src_level: eq.src_level,
      });
      const upg = tag !== '+0' ? ` ${tag}` : '';
      lines.push(`**${SLOT_LABELS[s]}**: ${eq.name}${upg} (${eq.durability_state})`);
    } else {
      lines.push(`**${SLOT_LABELS[s]}**: —`);
    }
  }
  return [...lines, '', buildActiveSetBonusSection(userId)].join('\n');
}
