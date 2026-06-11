import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { createRescueRequest, joinRescue, startPreemptiveRescue, completeRescue, setRescueMessage } from '../systems/rescueSystem';
import { getActiveBattle } from '../systems/battleSystem';
import { getOrCreatePublicChannel } from '../utils/channels';
import { getEnvOptional } from '../utils/permissions';
import { baseEmbed, errorEmbed, successEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';

export const data = new SlashCommandBuilder()
  .setName('rescue')
  .setDescription('救難要請')
  .addSubcommand((s) => s.setName('request').setDescription('救難要請を出す'))
  .addSubcommand((s) => s.setName('preemptive').setDescription('事前救難募集').addStringOption((o) => o.setName('area').setDescription('エリア名').setRequired(false)))
  .addSubcommand((s) => s.setName('complete').setDescription('救難成功（テスト用）').addStringOption((o) => o.setName('id').setDescription('救難ID').setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction, false);
  const userId = interaction.user.id;
  const guild = interaction.guild;
  if (!getPlayer(userId)) { await safeEdit(interaction, { embeds: [errorEmbed('未登録です。')] }); return; }
  if (!guild) { await safeEdit(interaction, { embeds: [errorEmbed('サーバー内でのみ使用できます。')] }); return; }

  const sub = interaction.options.getSubcommand();
  const channelName = getEnvOptional('RESCUE_CHANNEL_NAME', 'rpg-救難要請');
  const rescueChannel = await getOrCreatePublicChannel(guild, channelName);

  if (sub === 'request') {
    const battle = getActiveBattle(userId) as { id: string } | undefined;
    const rescueId = createRescueRequest(guild.id, userId, battle ? 'battle' : 'explore', { battleId: battle?.id });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`rescue:join:${rescueId}`).setLabel('救難に参加').setStyle(ButtonStyle.Success),
    );
    const msg = await rescueChannel.send({
      embeds: [baseEmbed('🆘 救難要請', `<@${userId}> が救難を要請しています！`).setColor(0xff6644)],
      components: [row],
    });
    setRescueMessage(rescueId, msg.id, rescueChannel.id);
    await safeEdit(interaction, { embeds: [successEmbed(`救難要請を <#${rescueChannel.id}> に投稿しました。`)] });
    return;
  }

  if (sub === 'preemptive') {
    const area = interaction.options.getString('area') ?? '高難易度探索';
    const rescueId = createRescueRequest(guild.id, userId, 'preemptive', { isPreemptive: true, areaId: area });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`rescue:join:${rescueId}`).setLabel('参加').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rescue:depart:${rescueId}`).setLabel('出発').setStyle(ButtonStyle.Success),
    );
    const msg = await rescueChannel.send({
      embeds: [baseEmbed('📢 事前救難募集', `<@${userId}> が「${area}」の事前救難を募集`).setColor(0x6688cc)],
      components: [row],
    });
    setRescueMessage(rescueId, msg.id, rescueChannel.id);
    await safeEdit(interaction, { embeds: [successEmbed(`事前救難募集を <#${rescueChannel.id}> に投稿しました。`)] });
    return;
  }

  if (sub === 'complete') {
    const id = interaction.options.getString('id', true);
    const msg = completeRescue(id);
    await safeEdit(interaction, { embeds: [successEmbed(msg)] });
  }
}

export { joinRescue, startPreemptiveRescue };
