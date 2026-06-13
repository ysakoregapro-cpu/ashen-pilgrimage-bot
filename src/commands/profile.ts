import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer, recalculatePlayerStats } from '../systems/playerSystem';
import { getCurrentTown } from '../systems/townSystem';
import { formatActiveSetBonusBody } from '../systems/setBonusDisplaySystem';
import { formatEquippedAffixProfileBlock } from '../systems/equipmentAffixSystem';
import { playerEmbed, errorEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('プロフィールを表示します');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  const player = getPlayer(interaction.user.id);
  if (!player) {
    await safeEdit(interaction, { embeds: [errorEmbed('未登録です。/start で始めてください。')] });
    return;
  }
  recalculatePlayerStats(interaction.user.id);
  const updated = getPlayer(interaction.user.id)!;
  const town = getCurrentTown(interaction.user.id) as { name: string } | undefined;
  const embed = playerEmbed(updated);
  embed.addFields({ name: '発動中のセット効果', value: formatActiveSetBonusBody(interaction.user.id), inline: false });
  embed.addFields({ name: '装備厳選効果', value: formatEquippedAffixProfileBlock(interaction.user.id), inline: false });
  if (town) embed.spliceFields(5, 1, { name: '現在地', value: town.name, inline: true });
  await safeEdit(interaction, { embeds: [embed] });
}
