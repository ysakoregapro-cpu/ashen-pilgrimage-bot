import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { formatEquipmentDisplay, getEquippableItems, equipItem } from '../systems/equipmentSystem';
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
    await safeEdit(interaction, { embeds: [baseEmbed('装備', formatEquipmentDisplay(userId))] });
    return;
  }

  const slot = (interaction.options.getString('slot') ?? 'weapon') as EquipmentSlot;
  const items = getEquippableItems(userId, slot) as Array<{ id: number; name: string; rarity: string; upgrade_level: number }>;
  if (!items.length) {
    await safeEdit(interaction, { embeds: [errorEmbed(`${SLOT_LABELS[slot]}に装備可能なアイテムがありません。`)] });
    return;
  }
  await safeEdit(interaction, {
    embeds: [baseEmbed('装備変更', `${SLOT_LABELS[slot]}に装備するアイテムを選択`)],
    components: [selectMenu(`equip:${slot}`, '装備を選択', items.map((i) => ({
      label: i.name, value: String(i.id), description: `${i.rarity}${i.upgrade_level ? ` +${i.upgrade_level}` : ''}`,
    })))],
  });
}

export function handleEquip(userId: string, inventoryId: number): string {
  return equipItem(userId, inventoryId);
}
