import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { createRaid, joinRaid, leaveRaid, startRaid, setRaidMessage } from '../systems/raidSystem';
import { getOrCreatePublicChannel } from '../utils/channels';
import { getEnvOptional } from '../utils/permissions';
import { errorEmbed, successEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import { buildCoopRecruitEmbed, buildCoopRecruitButtons } from '../systems/coop/coopUi';
import { canEnterValhalla } from '../systems/progressionGates';

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
    const gate = canEnterValhalla(userId);
    if (!gate.ok) {
      await safeEdit(interaction, { embeds: [errorEmbed(gate.reason ?? 'レイド参加条件を満たしていません。')] });
      return;
    }

    const raidId = createRaid(guild.id, userId);
    const channelName = getEnvOptional('RAID_CHANNEL_NAME', 'rpg-レイド募集');
    const raidChannel = await getOrCreatePublicChannel(guild, channelName);

    const msg = await raidChannel.send({
      embeds: [buildCoopRecruitEmbed(raidId)],
      components: buildCoopRecruitButtons(raidId, { forPublicChannel: true }),
    });
    setRaidMessage(raidId, msg.id, raidChannel.id);
    await safeEdit(interaction, { embeds: [successEmbed(`レイド募集を <#${raidChannel.id}> に投稿しました。\nID: \`${raidId}\``)] });
    return;
  }

  if (sub === 'leave') {
    const id = interaction.options.getString('id', true);
    const msg = leaveRaid(id, userId);
    await safeEdit(interaction, { embeds: [successEmbed(msg)] });
  }
}

export { joinRaid, startRaid, leaveRaid };
