import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { formatEquipmentDisplay, buildEquipSlotSelectView, equipItem, unequipSlot } from '../systems/equipmentSystem';
import { buildInventoryDetailPickView } from '../systems/itemDetailSystem';
import { isEquipNoneValue } from '../systems/equipmentLabelSystem';
import { baseEmbed, errorEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import { type EquipmentSlot } from '../types';

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
  const view = buildEquipSlotSelectView(userId, slot, 0, { customIdPrefix: 'equip' });
  await safeEdit(interaction, {
    embeds: [baseEmbed('装備変更', view.embedText)],
    components: [
      ...view.components,
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
