import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { buildGuideHome, buildGuideView } from '../systems/townActionSystem';
import { isValidGuideSection } from '../systems/dialogueSystem';
import { errorEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import { stampPanelPayload } from '../utils/messageFlow';

export const data = new SlashCommandBuilder()
  .setName('guide')
  .setDescription('巡礼手帳 — 旅の手引き')
  .addStringOption((o) => o.setName('chapter').setDescription('読みたい章').setRequired(false)
    .addChoices(
      { name: 'はじめに', value: 'intro' },
      { name: '職能', value: 'job' },
      { name: '探索', value: 'explore' },
      { name: '戦い方', value: 'battle' },
      { name: '装備', value: 'equip' },
      { name: '強化・分解・修理', value: 'upgrade' },
      { name: 'Src武器', value: 'src' },
      { name: '救難', value: 'rescue' },
      { name: '共闘探索', value: 'raid' },
      { name: '取引', value: 'trade' },
      { name: '日々の支度', value: 'daily' },
      { name: '敗北と帰還', value: 'defeat' },
    ));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  if (!getPlayer(interaction.user.id)) {
    await safeEdit(interaction, { embeds: [errorEmbed('未登録です。/start で旅を始めてください。')] });
    return;
  }

  const chapter = interaction.options.getString('chapter');
  if (chapter && isValidGuideSection(chapter)) {
    await safeEdit(interaction, stampPanelPayload(interaction.user.id, buildGuideView(chapter)));
    return;
  }
  await safeEdit(interaction, stampPanelPayload(interaction.user.id, buildGuideHome(interaction.user.id)));
}
