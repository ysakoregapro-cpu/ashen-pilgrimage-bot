import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { buildExploreList } from '../systems/townActionSystem';
import { exploreArea } from '../systems/explorationSystem';
import { buildBattleReply } from '../systems/battleSystem';
import { buildPostExplore } from '../systems/townActionSystem';
import { triggerFirstExplore, triggerFirstBattle } from '../systems/storySystem';
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
      const { buildBossEncounterExplorePost } = await import('../systems/bossEncounterSystem');
      if (result.bossEncounter && result.message) {
        await channel.send(buildBossEncounterExplorePost(result.message));
      }
      const reply = buildBattleReply(result.battleId, userId);
      if (reply) {
        await channel.send(reply);
        return;
      }
    }
    await channel.send(buildPostExplore(result.message, areaId));
    return;
  }

  await safeEdit(interaction, stampPanelPayload(userId, buildExploreList(userId)));
}

export async function handleExploreSelect(userId: string, areaId: string) {
  triggerFirstExplore(userId);
  const result = exploreArea(userId, areaId);
  if (result.type === 'battle' && result.battleId) {
    triggerFirstBattle(userId);
  }
  return result;
}
