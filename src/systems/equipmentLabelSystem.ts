import { awakeningLabel } from './awakeningSystem';
import { SLOT_LABELS, type DurabilityState, type EquipmentSlot } from '../types';

/** Player-owned equipment row for select menus (player_inventory.id is the instance key). */
export type OwnedEquipmentSelectRow = {
  id: number;
  name: string;
  rarity: string;
  upgrade_level: number;
  src_level: number;
  awakening_level: number;
  durability_state: DurabilityState | string;
  is_equipped: number;
  slot?: string;
  item_id?: string;
};

export const EQUIP_NONE_VALUE = 'none';

export function formatUpgradeTag(row: Pick<OwnedEquipmentSelectRow, 'upgrade_level' | 'src_level'>): string {
  if (row.src_level > 0) return `Src+${row.src_level}`;
  return `+${row.upgrade_level ?? 0}`;
}

export function formatDurabilityBadge(state: DurabilityState | string): string {
  if (state === '良好') return '修復済';
  if (state === '破損') return '破損';
  return '故障中';
}

/** Short state tokens for description lines. */
export function formatEquipmentStateBadges(row: OwnedEquipmentSelectRow): string[] {
  const badges: string[] = [];
  if (row.slot) badges.push(SLOT_LABELS[row.slot] ?? row.slot);
  badges.push(row.rarity);
  if (row.is_equipped) badges.push('装備中');
  badges.push(formatDurabilityBadge(row.durability_state));
  return badges;
}

export function formatOwnedEquipmentLabel(row: OwnedEquipmentSelectRow): string {
  const awaken = awakeningLabel(row.awakening_level ?? 0);
  return `${row.name} ${formatUpgradeTag(row)} / ${awaken}`.slice(0, 100);
}

export function formatOwnedEquipmentDescription(row: OwnedEquipmentSelectRow, extra?: string): string {
  const parts = [...formatEquipmentStateBadges(row)];
  if (extra) parts.push(extra);
  else parts.push(`#${row.id}`);
  return parts.join(' / ').slice(0, 100);
}

export function toOwnedEquipmentSelectOption(row: OwnedEquipmentSelectRow, extra?: string) {
  return {
    label: formatOwnedEquipmentLabel(row),
    value: String(row.id),
    description: formatOwnedEquipmentDescription(row, extra),
  };
}

export function buildEquipNoneOption(slot: EquipmentSlot) {
  const slotLabel = SLOT_LABELS[slot] ?? slot;
  return {
    label: '装備無し',
    value: equipNoneValueForSlot(slot),
    description: `現在の${slotLabel}装備を外します`.slice(0, 100),
  };
}

/** Prep flow embeds slot in value because custom_id is only `prep:equip`. */
export function equipNoneValueForSlot(slot: EquipmentSlot): string {
  return `${EQUIP_NONE_VALUE}:${slot}`;
}

export function isEquipNoneValue(value: string): boolean {
  return value === EQUIP_NONE_VALUE || value.startsWith(`${EQUIP_NONE_VALUE}:`);
}

export function parseEquipNoneSlot(value: string, fallbackSlot?: EquipmentSlot): EquipmentSlot | null {
  if (value === EQUIP_NONE_VALUE) return fallbackSlot ?? null;
  if (value.startsWith(`${EQUIP_NONE_VALUE}:`)) return value.slice(`${EQUIP_NONE_VALUE}:`.length) as EquipmentSlot;
  return null;
}

export function buildEquipChangeSelectOptions(
  slot: EquipmentSlot,
  items: OwnedEquipmentSelectRow[],
  opts?: { includeNone?: boolean; maxItems?: number },
): Array<{ label: string; value: string; description?: string }> {
  const maxItems = opts?.maxItems ?? 24;
  const options: Array<{ label: string; value: string; description?: string }> = [];
  if (opts?.includeNone !== false) options.push(buildEquipNoneOption(slot));
  for (const row of items.slice(0, maxItems)) {
    options.push(toOwnedEquipmentSelectOption({ ...row, slot: row.slot ?? slot }));
  }
  return options.slice(0, 25);
}

export function mapInventoryRowToEquipmentSelect(row: {
  id: number;
  name: string;
  rarity: string;
  upgrade_level: number;
  src_level: number;
  awakening_level?: number;
  durability_state?: string;
  is_equipped: number;
  slot?: string;
}): OwnedEquipmentSelectRow {
  return {
    id: row.id,
    name: row.name,
    rarity: row.rarity,
    upgrade_level: row.upgrade_level ?? 0,
    src_level: row.src_level ?? 0,
    awakening_level: row.awakening_level ?? 0,
    durability_state: (row.durability_state ?? '良好') as DurabilityState,
    is_equipped: row.is_equipped,
    slot: row.slot,
  };
}
