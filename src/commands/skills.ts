import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { getSkillsDisplayData, skillTypeLabel, scalingLabel } from '../systems/skillSystem';
import { buildSkillDetailPickView } from '../systems/itemDetailSystem';
import { JOB_LEVEL_CAP } from '../systems/jobLevelSystem';
import { baseEmbed, errorEmbed } from '../utils/embeds';
import { formatBulletList, formatFieldTitle } from '../utils/formatters';
import { safeDefer, safeEdit } from '../utils/interaction';

export const data = new SlashCommandBuilder()
  .setName('skills')
  .setDescription('覚えた技と術・職能の歩みを確認');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  const userId = interaction.user.id;
  if (!getPlayer(userId)) { await safeEdit(interaction, { embeds: [errorEmbed('未登録です。')] }); return; }

  const { learned, eqSkills, mainJob, mainLv, subJob, subLv, upcoming } = getSkillsDisplayData(userId);

  const learnedLines = learned.length
    ? learned.map((s) => `${s.name}（${skillTypeLabel(s.skill_type)} / MP${s.mp_cost}）`)
    : ['まだ覚えた技がない'];

  const eqLines = eqSkills.length
    ? eqSkills.map((s) => `${s.name} — ${s.sourceLabel}`)
    : ['装備から使える技はない'];

  const jobLines: string[] = [];
  if (mainJob && mainJob !== '未選択' && mainLv) {
    jobLines.push(`メイン：${mainJob} Lv${mainLv.job_level}/${JOB_LEVEL_CAP}`);
  }
  if (subJob && subLv) {
    jobLines.push(`サブ：${subJob} Lv${subLv.job_level}/${JOB_LEVEL_CAP}`);
  }

  const upcomingLines = upcoming.length
    ? upcoming.map((u) => `JobLv${u.level} — ${u.hint}`)
    : ['次に覚える技の気配は、まだ遠い'];

  const embed = baseEmbed('技と術')
    .setDescription('*覚えた技と、装備から使える技。*')
    .addFields(
      { name: formatFieldTitle('覚えた技と術'), value: formatBulletList(learnedLines.slice(0, 20)), inline: false },
      { name: formatFieldTitle('装備から使える技'), value: formatBulletList(eqLines.slice(0, 10)), inline: false },
      { name: formatFieldTitle('職能の歩み'), value: formatBulletList(jobLines.length ? jobLines : ['—']), inline: false },
      { name: formatFieldTitle('次に覚えそうな技'), value: formatBulletList(upcomingLines), inline: false },
    );

  await safeEdit(interaction, { embeds: [embed], components: buildSkillDetailPickView(userId).components });
}
