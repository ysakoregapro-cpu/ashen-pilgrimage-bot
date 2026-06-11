import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { createRaid, joinRaid, leaveRaid, startRaid, setRaidMessage } from '../systems/raidSystem';
import { getOrCreatePublicChannel } from '../utils/channels';
import { getEnvOptional } from '../utils/permissions';
import { baseEmbed, errorEmbed, successEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';

export const data = new SlashCommandBuilder()
  .setName('raid')
  .setDescription('ヴァルハラレイド募集')
  .addSubcommand((s) => s.setName('recruit').setDescription('レイド募集を出す'))
  .addSubcommand((s) => s.setName('leave').setDescription('レイドから辞退').addStringOption((o) => o.setName('id').setDescription('レイドID').setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction, false);
  const userId = interaction.user.id;
  const guild = interaction.guild;
  if (!getPlayer(userId)) { await safeEdit(interaction, { embeds: [errorEmbed('未登録です。')] }); return; }
  if (!guild) { await safeEdit(interaction, { embeds: [errorEmbed('サーバー内でのみ使用できます。')] }); return; }

  const sub = interaction.options.getSubcommand();

  if (sub === 'recruit') {
    const raidId = createRaid(guild.id, userId);
    const channelName = getEnvOptional('RAID_CHANNEL_NAME', 'rpg-レイド募集');
    const raidChannel = await getOrCreatePublicChannel(guild, channelName);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`raid:join:${raidId}`).setLabel('参加').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`raid:ready:${raidId}`).setLabel('準備完了').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`raid:depart:${raidId}`).setLabel('出発').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`raid:leave:${raidId}`).setLabel('辞退').setStyle(ButtonStyle.Danger),
    );

    const msg = await raidChannel.send({
      embeds: [baseEmbed('⚔️ ヴァルハラレイド募集', `<@${userId}> がレイドを募集（最大4人）`).setColor(0xaa8844)],
      components: [row],
    });
    setRaidMessage(raidId, msg.id, raidChannel.id);
    await safeEdit(interaction, { embeds: [successEmbed(`レイド募集を <#${raidChannel.id}> に投稿しました。\nID: \`${raidId}\``)] });
    return;
  }

  if (sub === 'leave') {
    const id = interaction.options.getString('id', true);
    const msg = leaveRaid(id, userId);
    await safeEdit(interaction, { embeds: [baseEmbed('レイド', msg)] });
  }
}

export { joinRaid, startRaid, leaveRaid };
