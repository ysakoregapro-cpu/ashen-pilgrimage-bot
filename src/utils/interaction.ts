import type { ChatInputCommandInteraction, StringSelectMenuInteraction, ButtonInteraction } from 'discord.js';

export async function safeDefer(interaction: ChatInputCommandInteraction, ephemeral = false): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral });
  }
}

export async function safeEdit(interaction: ChatInputCommandInteraction, content: object): Promise<void> {
  if (interaction.deferred) await interaction.editReply(content);
  else await interaction.reply(content);
}

export async function safeFollowUp(interaction: ChatInputCommandInteraction, content: object): Promise<void> {
  if (interaction.replied || interaction.deferred) await interaction.followUp(content);
  else await interaction.reply(content);
}

export async function safeButtonUpdate(interaction: ButtonInteraction, content: object): Promise<void> {
  await interaction.update(content);
}

export async function safeSelectUpdate(interaction: StringSelectMenuInteraction, content: object): Promise<void> {
  await interaction.update(content);
}

export function commandError(message: string): { embeds: ReturnType<typeof import('../utils/embeds').errorEmbed>[] } {
  const { errorEmbed } = require('../utils/embeds') as typeof import('../utils/embeds');
  return { embeds: [errorEmbed(message)] };
}
