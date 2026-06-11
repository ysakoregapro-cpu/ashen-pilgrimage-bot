import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { claimDaily, getDailyStatus } from '../systems/dailySystem';
import { baseEmbed, errorEmbed, successEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';

export const data = new SlashCommandBuilder()
  .setName('daily')
  .setDescription('デイリーボーナス')
  .addSubcommand((s) => s.setName('claim').setDescription('本日のボーナスを受け取る'))
  .addSubcommand((s) => s.setName('status').setDescription('デイリー状況'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  const userId = interaction.user.id;
  if (!getPlayer(userId)) { await safeEdit(interaction, { embeds: [errorEmbed('未登録です。')] }); return; }

  const sub = interaction.options.getSubcommand();
  if (sub === 'status') {
    await safeEdit(interaction, { embeds: [baseEmbed('デイリー', getDailyStatus(userId))] });
    return;
  }

  const result = claimDaily(userId);
  await safeEdit(interaction, {
    embeds: [result.success ? successEmbed(result.message) : errorEmbed(result.message)],
  });
}
