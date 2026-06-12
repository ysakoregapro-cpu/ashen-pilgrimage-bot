import { ButtonStyle } from 'discord.js';
import { baseEmbed } from '../utils/embeds';
import { buildConfirmNavigationRows } from '../utils/navigationComponents';
import type { UiPayload } from '../utils/townUi';
import { getEquipped } from './equipmentSystem';
import { formatOwnedEquipmentLabel, mapInventoryRowToEquipmentSelect } from './equipmentLabelSystem';
import { getDb } from '../db/database';
import { SLOT_LABELS, type EquipmentSlot } from '../types';

function loadEquipRow(userId: string, inventoryId: number) {
  return getDb().prepare(`
    SELECT pi.id, pi.upgrade_level, pi.src_level, pi.awakening_level, pi.durability_state, pi.is_equipped,
      i.name, i.rarity, e.slot
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as {
    id: number; name: string; rarity: string; upgrade_level: number; src_level: number;
    awakening_level: number; durability_state: string; is_equipped: number; slot: string;
  } | undefined;
}

export function buildEquipNoneConfirmPayload(userId: string, slot: EquipmentSlot, mode: 'slash' | 'prep'): UiPayload {
  const equipped = getEquipped(userId).find((e) => (e as { slot: string }).slot === slot) as {
    name: string | null; upgrade_level: number; src_level?: number;
  } | undefined;
  const slotLabel = SLOT_LABELS[slot] ?? slot;
  const confirmId = mode === 'prep' ? `prep:confirm_none:${slot}` : `equip:confirm_none:${slot}`;
  const backContext = mode === 'prep' ? 'prep' : 'equip';
  const current = equipped?.name
    ? formatOwnedEquipmentLabel(mapInventoryRowToEquipmentSelect({
      id: 0,
      name: equipped.name,
      rarity: 'N',
      upgrade_level: equipped.upgrade_level ?? 0,
      src_level: (equipped as { src_level?: number }).src_level ?? 0,
      awakening_level: 0,
      durability_state: '良好',
      is_equipped: 1,
      slot,
    }))
    : '（なし）';

  return {
    embeds: [baseEmbed('装備解除確認', [
      `**${slotLabel}**の装備を外しますか？`,
      '',
      `現在: ${current}`,
      '',
      '外した装備は所持品に残ります。',
    ].join('\n'))],
    components: buildConfirmNavigationRows({
      confirmId,
      confirmLabel: '装備を外す',
      confirmStyle: ButtonStyle.Danger,
      backContext,
      backPayload: slot,
    }),
  };
}

export function buildEquipChangeConfirmRows(
  inventoryId: number,
  slot: EquipmentSlot,
  mode: 'slash' | 'prep',
  disabled = false,
) {
  const confirmId = mode === 'prep' ? `prep:confirm_equip:${inventoryId}` : `equip:confirm:${inventoryId}`;
  const backContext = mode === 'prep' ? 'prep' : 'equip';
  return buildConfirmNavigationRows({
    confirmId,
    confirmLabel: mode === 'prep' ? 'この装備にする' : '装備する',
    backContext,
    backPayload: slot,
    disabled,
  });
}

export function buildEquipChangeConfirmEmbed(userId: string, inventoryId: number): string {
  const row = loadEquipRow(userId, inventoryId);
  if (!row) return '装備が見つかりません。';
  const target = formatOwnedEquipmentLabel(mapInventoryRowToEquipmentSelect(row));
  const slotLabel = SLOT_LABELS[row.slot as EquipmentSlot] ?? row.slot;
  return [`**${slotLabel}**に以下を装備しますか？`, '', `**対象:** ${target}`].join('\n');
}
