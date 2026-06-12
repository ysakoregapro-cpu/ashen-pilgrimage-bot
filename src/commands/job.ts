import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { getJobs, selectMainJob, selectSubJob } from '../systems/jobSystem';
import { buildJobShowView } from '../systems/jobUiSystem';
import { getSelectableSubJobs, formatLegacyJobWarning } from '../systems/jobProgressionSystem';
import { isLegacyJob, PHASE2_SUB_JOBS } from '../db/seedData/jobMultiplierMaster';
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
    await safeEdit(interaction, buildJobShowView(userId));
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
    const legacy = formatLegacyJobWarning(userId);
    const subs = getSelectableSubJobs(userId).filter((s) => PHASE2_SUB_JOBS.includes(s.name));
    const unlocked = subs.filter((s) => !s.locked);
    const locked = subs.filter((s) => s.locked);
    const lines = ['解放済みサブジョブを選んでください。'];
    if (player.sub_job && isLegacyJob(player.sub_job)) {
      lines.push(`\n⚠ 現在のサブ「${player.sub_job}」は旧職です。解放済みサブへ再設定してください。`);
    } else if (legacy) {
      lines.push(`\n⚠ ${legacy}`);
    }
    if (locked.length) {
      lines.push('', '**未解放:**', ...locked.map((s) => `・${s.name} — ${s.locked}`));
    }
    if (unlocked.length === 0) {
      await safeEdit(interaction, {
        embeds: [baseEmbed('サブジョブ', `${lines.join('\n')}\n\n解放済みサブがありません。`)],
      });
      return;
    }
    await safeEdit(interaction, {
      embeds: [baseEmbed('サブジョブ', lines.join('\n'))],
      components: [selectMenu(
        'onboarding:job:sub',
        '副職を選ぶ',
        unlocked.map((j) => ({ label: j.name, value: j.name })),
      )],
    });
  }
}

export async function handleJobSelect(userId: string, jobName: string, isSub: boolean): Promise<string> {
  return isSub ? selectSubJob(userId, jobName) : selectMainJob(userId, jobName);
}
