import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { formatEquipmentDisplay, getEquippableItems, equipItem, unequipSlot } from '../systems/equipmentSystem';
import { buildInventoryDetailPickView } from '../systems/itemDetailSystem';
import {
  buildEquipChangeSelectOptions,
  isEquipNoneValue,
  mapInventoryRowToEquipmentSelect,
} from '../systems/equipmentLabelSystem';
import { baseEmbed, errorEmbed, selectMenu } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import { SLOT_LABELS, type EquipmentSlot } from '../types';

export const data = new SlashCommandBuilder()
  .setName('equip')
  .setDescription('装備の確認・変更')
  .addSubcommand((s) => s.setName('show').setDescription('現在の装備'))
  .addSubcommand((s) => s.setName('change').setDescription('装備を変更').addStringOption((o) =>
    o.setName('slot').setDescription('部位').setRequired(false)
      .addChoices(
        { name: '武器', value: 'weapon' }, { name: '頭', value: 'head' }, { name: '胴', value: 'body' },
        { name: '腕', value: 'arms' }, { name: '脚', value: 'legs' }, { name: '靴', value: 'feet' },
        { name: 'アクセ1', value: 'accessory1' }, { name: 'アクセ2', value: 'accessory2' }, { name: '補助', value: 'sub' },
      )));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  const userId = interaction.user.id;
  if (!getPlayer(userId)) { await safeEdit(interaction, { embeds: [errorEmbed('未登録です。')] }); return; }

  const sub = interaction.options.getSubcommand();
  if (sub === 'show') {
    await safeEdit(interaction, {
      embeds: [baseEmbed('装備', formatEquipmentDisplay(userId))],
      components: buildInventoryDetailPickView(userId).components,
    });
    return;
  }

  const slot = (interaction.options.getString('slot') ?? 'weapon') as EquipmentSlot;
  const items = getEquippableItems(userId, slot) as Array<Record<string, unknown>>;
  const rows = items.map((i) => mapInventoryRowToEquipmentSelect({
    id: i.id as number,
    name: i.name as string,
    rarity: i.rarity as string,
    upgrade_level: i.upgrade_level as number,
    src_level: (i.src_level as number) ?? 0,
    awakening_level: (i.awakening_level as number) ?? 0,
    durability_state: (i.durability_state as string) ?? '良好',
    is_equipped: (i.is_equipped as number) ?? 0,
    slot,
  }));
  const options = buildEquipChangeSelectOptions(slot, rows);
  await safeEdit(interaction, {
    embeds: [baseEmbed('装備変更', `${SLOT_LABELS[slot]}に装備するアイテムを選択（先頭で装備を外せます）`)],
    components: [
      selectMenu(`equip:${slot}`, '装備を選択', options),
      ...buildInventoryDetailPickView(userId).components,
    ],
  });
}

export function handleEquip(userId: string, inventoryId: number): string {
  return equipItem(userId, inventoryId);
}

export function handleUnequip(userId: string, slot: EquipmentSlot): string {
  return unequipSlot(userId, slot);
}

export { isEquipNoneValue };
