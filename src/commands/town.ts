import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer, getUnlockedTowns } from '../systems/playerSystem';
import { getAllTowns } from '../systems/townSystem';
import { buildTownHub, buildTravelList, arriveAndShowHub } from '../systems/townActionSystem';
import { baseEmbed, errorEmbed, selectMenu } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import { stampPanelPayload, getSendableChannel } from '../utils/messageFlow';

export const data = new SlashCommandBuilder()
  .setName('town')
  .setDescription('町の情報・移動')
  .addSubcommand((s) => s.setName('list').setDescription('解放済み町一覧'))
  .addSubcommand((s) => s.setName('info').setDescription('現在地の町'))
  .addSubcommand((s) => s.setName('travel').setDescription('別の町へ向かう').addStringOption((o) => o.setName('town_id').setDescription('町ID').setRequired(false)));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  const userId = interaction.user.id;
  if (!getPlayer(userId)) {
    await safeEdit(interaction, { embeds: [errorEmbed('未登録です。/start で旅を始めてください。')] });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'info') {
    await safeEdit(interaction, stampPanelPayload(userId, buildTownHub(userId)));
    return;
  }

  if (sub === 'travel') {
    const townId = interaction.options.getString('town_id');
    if (townId) {
      const channel = getSendableChannel(interaction.channel);
      await safeEdit(interaction, { embeds: [], components: [] });
      if (channel) {
        await channel.send(arriveAndShowHub(userId, townId));
      }
      return;
    }
    await safeEdit(interaction, stampPanelPayload(userId, buildTravelList(userId)));
    return;
  }

  const unlocked = getUnlockedTowns(userId);
  const towns = getAllTowns() as Array<{ id: string; name: string; description: string; required_level: number }>;
  const lines = towns.map((t) => {
    const mark = unlocked.includes(t.id) ? '✅' : '🔒';
    return `${mark} **${t.name}** (Lv${t.required_level}) — ${t.description.slice(0, 40)}…`;
  });
  await safeEdit(interaction, { embeds: [baseEmbed('知られている町', lines.join('\n'))] });
}
