import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { createRescueRequest, joinRescue, startPreemptiveRescue, completeRescue, setRescueMessage } from '../systems/rescueSystem';
import { getActiveBattle } from '../systems/battleSystem';
import { getOrCreatePublicChannel } from '../utils/channels';
import { getEnvOptional, isAdmin } from '../utils/permissions';
import { errorEmbed, successEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import { buildCoopRecruitEmbed, buildCoopRecruitButtons } from '../systems/coop/coopUi';
import { getDb } from '../db/database';

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
    const battle = getActiveBattle(userId) as { id: string; monster_id?: string } | undefined;
    let monsterId: string | undefined;
    if (battle?.id) {
      const sess = getDb().prepare('SELECT monster_id FROM battle_sessions WHERE id = ?').get(battle.id) as { monster_id: string } | undefined;
      monsterId = sess?.monster_id;
    }
    const rescueId = createRescueRequest(guild.id, userId, battle ? 'battle' : 'explore', {
      battleId: battle?.id,
      monsterId,
    });

    const msg = await rescueChannel.send({
      embeds: [buildCoopRecruitEmbed(rescueId)],
      components: buildCoopRecruitButtons(rescueId, { forPublicChannel: true }),
    });
    setRescueMessage(rescueId, msg.id, rescueChannel.id);
    await safeEdit(interaction, { embeds: [successEmbed(`救難要請を <#${rescueChannel.id}> に投稿しました。\nID: \`${rescueId}\``)] });
    return;
  }

  if (sub === 'preemptive') {
    const area = interaction.options.getString('area') ?? '高難易度探索';
    const rescueId = createRescueRequest(guild.id, userId, 'preemptive', { isPreemptive: true, areaId: area, areaLabel: area });

    const msg = await rescueChannel.send({
      embeds: [buildCoopRecruitEmbed(rescueId)],
      components: buildCoopRecruitButtons(rescueId, { forPublicChannel: true }),
    });
    setRescueMessage(rescueId, msg.id, rescueChannel.id);
    await safeEdit(interaction, { embeds: [successEmbed(`事前救難募集を <#${rescueChannel.id}> に投稿しました。`)] });
    return;
  }

  if (sub === 'complete') {
    if (!isAdmin(interaction.member as import('discord.js').GuildMember)) {
      await safeEdit(interaction, { embeds: [errorEmbed('この操作は管理者のみ利用できます。')] });
      return;
    }
    const id = interaction.options.getString('id', true);
    const msg = completeRescue(id);
    await safeEdit(interaction, { embeds: [successEmbed(msg)] });
  }
}

export { joinRescue, startPreemptiveRescue };

/** 敗北/戦闘中から救難募集を作成 */
export async function postRescueRecruit(
  guildId: string,
  userId: string,
  opts?: { battleId?: string; channelId?: string },
): Promise<{ recruitId: string; channelId: string } | { error: string }> {
  if (!getPlayer(userId)) return { error: '未登録です。' };
  const battle = opts?.battleId
    ? getDb().prepare('SELECT id, monster_id FROM battle_sessions WHERE id = ?').get(opts.battleId) as { id: string; monster_id: string } | undefined
    : getActiveBattle(userId) as { id: string } | undefined;
  const rescueId = createRescueRequest(guildId, userId, battle ? 'battle' : 'explore', { battleId: battle?.id });
  return { recruitId: rescueId, channelId: opts?.channelId ?? '' };
}
