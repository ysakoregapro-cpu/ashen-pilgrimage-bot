import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { formatWeeklyStatus, claimWeeklyReward } from '../systems/weeklySystem';
import { baseEmbed, errorEmbed, successEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';

export const data = new SlashCommandBuilder()
  .setName('weekly')
  .setDescription('週次ミッション')
  .addSubcommand((s) => s.setName('show').setDescription('週次ミッション進捗'))
  .addSubcommand((s) => s.setName('claim').setDescription('週次報酬を受け取る'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  const userId = interaction.user.id;
  if (!getPlayer(userId)) { await safeEdit(interaction, { embeds: [errorEmbed('未登録です。')] }); return; }

  const sub = interaction.options.getSubcommand();
  if (sub === 'show') {
    await safeEdit(interaction, { embeds: [baseEmbed('週次ミッション', formatWeeklyStatus(userId))] });
    return;
  }

  const result = claimWeeklyReward(userId);
  await safeEdit(interaction, {
    embeds: [result.success ? successEmbed(result.message) : errorEmbed(result.message)],
  });
}
