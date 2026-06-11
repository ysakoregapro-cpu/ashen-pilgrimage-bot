import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { buildExploreList } from '../systems/townActionSystem';
import { exploreArea } from '../systems/explorationSystem';
import { buildBattleReply } from '../systems/battleSystem';
import { buildPostExplore } from '../systems/townActionSystem';
import { errorEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import { stampPanelPayload, getSendableChannel } from '../utils/messageFlow';

export const data = new SlashCommandBuilder()
  .setName('explore')
  .setDescription('探索へ向かう')
  .addStringOption((o) => o.setName('area_id').setDescription('エリアID').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  const userId = interaction.user.id;
  if (!getPlayer(userId)) { await safeEdit(interaction, { embeds: [errorEmbed('未登録です。')] }); return; }

  const areaId = interaction.options.getString('area_id');
  if (areaId) {
    const result = exploreArea(userId, areaId);
    const channel = getSendableChannel(interaction.channel);
    await safeEdit(interaction, { embeds: [], components: [] });
    if (!channel) return;
    if (result.type === 'battle' && result.battleId) {
      const reply = buildBattleReply(result.battleId, userId);
      if (reply) {
        await channel.send(reply);
        return;
      }
    }
    await channel.send(buildPostExplore(result.message));
    return;
  }

  await safeEdit(interaction, stampPanelPayload(userId, buildExploreList(userId)));
}

export async function handleExploreSelect(userId: string, areaId: string) {
  return exploreArea(userId, areaId);
}
