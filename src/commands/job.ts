import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { selectMainJob, selectSubJob } from '../systems/jobSystem';
import { buildJobShowView, buildMainJobSelectView, buildSubJobSelectView } from '../systems/jobUiSystem';
import { errorEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';

export const data = new SlashCommandBuilder()
  .setName('job')
  .setDescription('ジョブの確認・選択')
  .addSubcommand((s) => s.setName('show').setDescription('現在のジョブ'))
  .addSubcommand((s) => s.setName('select').setDescription('メインジョブを選択'))
  .addSubcommand((s) => s.setName('sub').setDescription('サブジョブを設定'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  if (!player) { await safeEdit(interaction, { embeds: [errorEmbed('未登録です。')] }); return; }

  const sub = interaction.options.getSubcommand();

  if (sub === 'show') {
    await safeEdit(interaction, buildJobShowView(userId));
    return;
  }

  if (sub === 'select') {
    await safeEdit(interaction, buildMainJobSelectView(userId));
    return;
  }

  if (sub === 'sub') {
    await safeEdit(interaction, buildSubJobSelectView(userId));
  }
}

export async function handleJobSelect(userId: string, jobName: string, isSub: boolean): Promise<string> {
  return isSub ? selectSubJob(userId, jobName) : selectMainJob(userId, jobName);
}
