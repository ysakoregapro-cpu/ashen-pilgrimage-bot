import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { getInventoryByCategory } from '../systems/inventorySystem';
import { baseEmbed, errorEmbed, itemLine } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import type { Rarity } from '../types';

export const data = new SlashCommandBuilder()
  .setName('inventory')
  .setDescription('所持品一覧')
  .addStringOption((o) => o.setName('category').setDescription('カテゴリ').setRequired(false)
    .addChoices(
      { name: 'すべて', value: 'all' },
      { name: '装備', value: 'equipment' },
      { name: '消耗品', value: 'consumable' },
      { name: '素材', value: 'material' },
    ));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  const userId = interaction.user.id;
  if (!getPlayer(userId)) { await safeEdit(interaction, { embeds: [errorEmbed('未登録です。')] }); return; }

  const cat = interaction.options.getString('category') ?? 'all';
  const items = cat === 'all' ? getInventoryByCategory(userId, 'all') : getInventoryByCategory(userId, cat);
  const rows = items as Array<{ name: string; rarity: string; quantity: number; category: string; upgrade_level: number; src_level: number; is_equipped: number; is_pending_reward: number }>;

  if (!rows.length) {
    await safeEdit(interaction, { embeds: [baseEmbed('インベントリ', '所持品がありません。')] });
    return;
  }

  const lines = rows.slice(0, 25).map((i) => {
    const upg = i.src_level > 0 ? ` Src+${i.src_level}` : i.upgrade_level > 0 ? ` +${i.upgrade_level}` : '';
    const flags = [i.is_equipped ? '装備中' : ''].filter(Boolean).join(', ');
    return itemLine(i.name, i.rarity as Rarity, `x${i.quantity}${upg}${flags ? ` (${flags})` : ''}`);
  });

  let footer = '';
  if (cat === 'equipment' || cat === 'all') footer += '\n装備変更: /equip change';
  if (cat === 'equipment' || cat === 'all') footer += '\n分解・強化: /upgrade';

  await safeEdit(interaction, { embeds: [baseEmbed('所持品', lines.join('\n') + footer)] });
}
