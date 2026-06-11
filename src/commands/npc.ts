import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { buildNpcList } from '../systems/townActionSystem';
import { errorEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import { stampPanelPayload } from '../utils/messageFlow';

export const data = new SlashCommandBuilder()
  .setName('npc')
  .setDescription('町の人と話す');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  if (!getPlayer(interaction.user.id)) {
    await safeEdit(interaction, { embeds: [errorEmbed('未登録です。')] });
    return;
  }
  await safeEdit(interaction, stampPanelPayload(interaction.user.id, buildNpcList(interaction.user.id)));
}
