import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { getJobs, selectMainJob, selectSubJob, getJobSkills } from '../systems/jobSystem';
import { baseEmbed, errorEmbed, selectMenu } from '../utils/embeds';
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
    const skills = getJobSkills(player.main_job) as Array<{ name: string; description: string }>;
    const skillText = skills.slice(0, 5).map((s) => `• ${s.name}: ${s.description}`).join('\n');
    await safeEdit(interaction, {
      embeds: [baseEmbed('ジョブ', `メイン: **${player.main_job}**\nサブ: **${player.sub_job ?? '未設定'}**`)
        .addFields({ name: 'スキル', value: skillText || '—' })],
    });
    return;
  }

  if (sub === 'select') {
    if (player.main_job !== '未選択') {
      await safeEdit(interaction, { embeds: [errorEmbed(`既に「${player.main_job}」です。`)] });
      return;
    }
    const jobs = getJobs('basic') as Array<{ name: string; description: string }>;
    await safeEdit(interaction, {
      embeds: [baseEmbed('ジョブ選択', 'メインジョブを選んでください。')],
      components: [selectMenu('onboarding:job:main', '職能を選ぶ', jobs.map((j) => ({ label: j.name, value: j.name, description: j.description.slice(0, 50) })))],
    });
    return;
  }

  if (sub === 'sub') {
    const jobs = getJobs('advanced') as Array<{ name: string }>;
    await safeEdit(interaction, {
      embeds: [baseEmbed('サブジョブ', 'サブジョブを選んでください（Lv20以上）。')],
      components: [selectMenu('onboarding:job:sub', '副職を選ぶ', jobs.map((j) => ({ label: j.name, value: j.name })))],
    });
  }
}

export async function handleJobSelect(userId: string, jobName: string, isSub: boolean): Promise<string> {
  return isSub ? selectSubJob(userId, jobName) : selectMainJob(userId, jobName);
}
