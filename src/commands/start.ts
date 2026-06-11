import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getPlayer, createPlayer, updatePrivateChannel } from '../systems/playerSystem';
import { setupPlayerChannel } from '../utils/channels';
import { baseEmbed, successEmbed } from '../utils/embeds';
import { safeDefer, safeEdit, commandError } from '../utils/interaction';
import { triggerStartComplete } from '../systems/storySystem';
import { getSendableChannel } from '../utils/messageFlow';

export const data = new SlashCommandBuilder()
  .setName('start')
  .setDescription('冒険者登録を行い、個人チャンネルを作成します')
  .addStringOption((o) => o.setName('name').setDescription('冒険者名').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  try {
    const guild = interaction.guild;
    if (!guild) {
      await safeEdit(interaction, commandError('サーバー内でのみ使用できます。'));
      return;
    }

    const userId = interaction.user.id;
    const existing = getPlayer(userId);

    if (existing?.private_channel_id) {
      const ch = guild.channels.cache.get(existing.private_channel_id);
      if (ch) {
        await safeEdit(interaction, {
          embeds: [baseEmbed('登録済み', `既に登録されています。\n個人チャンネル: <#${existing.private_channel_id}>`)],
        });
        return;
      }
      const member = await guild.members.fetch(userId);
      const name = interaction.options.getString('name') ?? existing.name;
      const channel = await setupPlayerChannel(guild, member, userId);
      updatePrivateChannel(userId, channel.id);
      await safeEdit(interaction, {
        embeds: [successEmbed(`チャンネルが削除されていたため再作成しました。\n<#${channel.id}>`)],
      });
      return;
    }

    const member = await guild.members.fetch(userId);
    const name = interaction.options.getString('name') ?? member.displayName;
    const channel = await setupPlayerChannel(guild, member, userId);

    if (existing) {
      updatePrivateChannel(userId, channel.id);
    } else {
      createPlayer(userId, guild.id, name, channel.id);
      const storyEvents = triggerStartComplete(userId);
      const sendChannel = getSendableChannel(channel);
      if (sendChannel) {
        for (const ev of storyEvents) {
          await sendChannel.send({ embeds: ev.embeds, components: ev.components });
        }
      }
    }

    await safeEdit(interaction, {
      embeds: [successEmbed(
        `**${name}**、灰星巡礼録へようこそ。\n\n` +
        `個人チャンネル <#${channel.id}> が作成されました。\n` +
        `アオイに会い、旅を始めましょう。\n\n` +
        `\`/town\` で町を歩き、\`/explore\` で探索へ向かえます。\n` +
        `迷ったら \`/guide\`（巡礼手帳）を開いてください。`,
      )],
    });
  } catch (e) {
    console.error('/start error:', e);
    await safeEdit(interaction, commandError('登録中にエラーが発生しました。Botの権限を確認してください。'));
  }
}
