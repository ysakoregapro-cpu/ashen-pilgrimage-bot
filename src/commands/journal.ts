import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { getPilgrimageJournal } from '../systems/storySystem';
import { errorEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import { stampPanelPayload } from '../utils/messageFlow';

export const data = new SlashCommandBuilder()
  .setName('journal')
  .setDescription('巡礼手帳 — 現在の章と旅の記録');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  if (!getPlayer(interaction.user.id)) {
    await safeEdit(interaction, { embeds: [errorEmbed('未登録です。/start で旅を始めてください。')] });
    return;
  }
  await safeEdit(interaction, stampPanelPayload(interaction.user.id, getPilgrimageJournal(interaction.user.id)));
}
