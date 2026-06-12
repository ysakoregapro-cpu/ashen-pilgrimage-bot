import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
} from 'discord.js';
import { getDb } from '../db/database';
import type { UiPayload } from '../utils/townUi';
import { baseEmbed, errorEmbed } from '../utils/embeds';
import { sanitizeComponents } from '../utils/componentSafety';
import { getPlayer } from './playerSystem';
import { getJobSkills } from './jobSystem';
import { getJobLevel } from './jobLevelSystem';
import {
  ADVANCED_JOB_UNLOCK_LEVEL,
  JOB_TRIO_MAP,
  TRIAL_ENEMY_NAMES,
  getBaseJobForAdvanced,
} from '../db/seedData/jobProgressionMaster';
import { isPhase2AdvancedMain } from '../db/seedData/jobMultiplierMaster';
import {
  canStartTrial,
  getSelectableMainJobs,
  getTrialStatusText,
  isAdvancedJobUnlocked,
} from './jobProgressionSystem';
import { hasStoryFlag } from './storySystem';
import { getActiveBattle, buildBattleReply } from './battleSystem';
import { startTrialBattle } from './trialBattleSystem';

export function isUserBlockedFromTrial(userId: string): { blocked: boolean; reason?: string } {
  if (getActiveBattle(userId)) {
    return { blocked: true, reason: '既に戦闘中です。' };
  }
  const coopBattle = getDb().prepare(`
    SELECT cb.id FROM coop_battle_sessions cb
    JOIN coop_recruits cr ON cr.id = cb.recruit_id
    JOIN coop_members cm ON cm.recruit_id = cr.id
    WHERE cm.user_id = ? AND cm.status NOT IN ('left') AND cb.status = 'active'
    LIMIT 1
  `).get(userId);
  if (coopBattle) return { blocked: true, reason: '協力戦中は試練を開始できません。' };

  const recruit = getDb().prepare(`
    SELECT cr.id FROM coop_recruits cr
    JOIN coop_members cm ON cm.recruit_id = cr.id
    WHERE cm.user_id = ? AND cm.status NOT IN ('left') AND cr.status IN ('recruiting', 'full', 'started')
    LIMIT 1
  `).get(userId);
  if (recruit) return { blocked: true, reason: '協力募集・参加中は試練を開始できません。' };

  return { blocked: false };
}

export type TrialConditionDetail = {
  baseJob: string;
  advanced: string;
  enemyName: string;
  jobLv: number;
  jobLvOk: boolean;
  valhallaOk: boolean;
  unlocked: boolean;
  canStart: boolean;
};

export function getTrialConditionDetail(userId: string, baseJob: string): TrialConditionDetail | null {
  const trio = JOB_TRIO_MAP[baseJob];
  if (!trio) return null;
  const row = getJobLevel(userId, baseJob);
  const jobLv = row?.job_level ?? 0;
  const jobLvOk = jobLv >= ADVANCED_JOB_UNLOCK_LEVEL;
  const valhallaOk = hasStoryFlag(userId, 'valhalla_unlocked')
    || hasStoryFlag(userId, 'chapter_completed:ch7_furnace');
  const unlocked = isAdvancedJobUnlocked(userId, trio.advanced);
  return {
    baseJob,
    advanced: trio.advanced,
    enemyName: TRIAL_ENEMY_NAMES[baseJob] ?? `${baseJob}の現身`,
    jobLv,
    jobLvOk,
    valhallaOk,
    unlocked,
    canStart: canStartTrial(userId, baseJob).ok,
  };
}

function formatConditionBlock(d: TrialConditionDetail): string {
  const jobMark = d.jobLvOk ? '達成' : '未達成';
  const valMark = d.valhallaOk ? '達成' : '未達成';
  const advMark = d.unlocked ? '解放済み' : '未解放';
  return [
    `**${d.advanced}**の試練は${d.canStart ? '挑戦可能です。' : 'まだ挑戦できません。'}`,
    '',
    '**条件：**',
    `・${d.baseJob} JobLv${ADVANCED_JOB_UNLOCK_LEVEL}：${jobMark}（現在 Lv${d.jobLv}）`,
    `・空中要塞ヴァルハラ解放：${valMark}`,
    `・${d.advanced}：${advMark}`,
  ].join('\n');
}

function backButton(): ButtonBuilder {
  return new ButtonBuilder().setCustomId('job:menu').setLabel('戻る').setStyle(ButtonStyle.Secondary);
}

function menuButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('job:advanced').setLabel('上級職を確認').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('job:trial:list').setLabel('現身の試練に挑む').setStyle(ButtonStyle.Danger),
  );
}

export function buildJobShowView(userId: string): UiPayload {
  const player = getPlayer(userId);
  if (!player) {
    return { embeds: [errorEmbed('未登録です。')], components: [] };
  }
  const skills = getJobSkills(player.main_job) as Array<{ name: string; description: string }>;
  const skillText = skills.slice(0, 5).map((s) => `• ${s.name}: ${s.description}`).join('\n');
  const embed = baseEmbed('ジョブ', `メイン: **${player.main_job}**\nサブ: **${player.sub_job ?? '未設定'}**`)
    .addFields({ name: 'スキル', value: skillText || '—' });
  const components = sanitizeComponents([menuButtons()], 'job:show');
  return { embeds: [embed], components };
}

export function buildAdvancedJobsView(userId: string): UiPayload {
  const jobs = getSelectableMainJobs(userId).filter((j) => j.kind === 'advanced');
  const lines = jobs.map((j) => {
    if (j.locked) return `🔒 **${j.name}** — ${j.locked}`;
    return `✅ **${j.name}** — 解放済み（メイン選択可）`;
  });
  const embed = baseEmbed('上級職', lines.join('\n') || '上級職データがありません。');
  const components = sanitizeComponents([
    new ActionRowBuilder<ButtonBuilder>().addComponents(backButton()),
  ], 'job:advanced');
  return { embeds: [embed], components };
}

export function buildTrialListView(userId: string): UiPayload {
  const player = getPlayer(userId);
  const mainBase = player && isPhase2AdvancedMain(player.main_job)
    ? getBaseJobForAdvanced(player.main_job)
    : player?.main_job;
  const lines = Object.keys(JOB_TRIO_MAP).map((baseJob) => {
    const prefix = baseJob === mainBase ? '▶ ' : '';
    return `${prefix}${getTrialStatusText(userId, baseJob)}`;
  });
  const intro = mainBase && JOB_TRIO_MAP[mainBase]
    ? `現在の基本職: **${mainBase}** → 上級職 **${JOB_TRIO_MAP[mainBase]!.advanced}**`
    : '挑戦する基本職を選んでください。';
  const embed = baseEmbed('現身の試練', `${intro}\n\n${lines.join('\n')}`);

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const bases = Object.keys(JOB_TRIO_MAP);
  for (let i = 0; i < bases.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const baseJob of bases.slice(i, i + 5)) {
      const advanced = JOB_TRIO_MAP[baseJob]!.advanced;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`job:trial:view:${baseJob}`)
          .setLabel(advanced.slice(0, 20))
          .setStyle(ButtonStyle.Secondary),
      );
    }
    rows.push(row);
  }
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(backButton()));
  return { embeds: [embed], components: sanitizeComponents(rows, 'job:trial:list') };
}

export function buildTrialDetailView(userId: string, baseJob: string): UiPayload {
  const detail = getTrialConditionDetail(userId, baseJob);
  if (!detail) {
    return { embeds: [errorEmbed('試練が見つかりません。')], components: sanitizeComponents([new ActionRowBuilder<ButtonBuilder>().addComponents(backButton())], 'job:trial:detail') };
  }

  if (detail.unlocked) {
    const embed = baseEmbed('現身の試練', `「**${detail.advanced}**」は解放済みです。\n再挑戦はできません。`);
    return {
      embeds: [embed],
      components: sanitizeComponents([
        new ActionRowBuilder<ButtonBuilder>().addComponents(backButton()),
      ], 'job:trial:detail'),
    };
  }

  if (!detail.canStart) {
    const embed = baseEmbed('現身の試練', formatConditionBlock(detail));
    return {
      embeds: [embed],
      components: sanitizeComponents([
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('job:trial:list').setLabel('一覧へ').setStyle(ButtonStyle.Secondary),
          backButton(),
        ),
      ], 'job:trial:detail'),
    };
  }

  const embed = baseEmbed(
    '現身の試練',
    [
      `**${detail.enemyName}**に挑みますか？`,
      `勝利すると、上級職「**${detail.advanced}**」が解放されます。`,
      '',
      formatConditionBlock(detail),
    ].join('\n'),
  );
  return {
    embeds: [embed],
    components: sanitizeComponents([
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`job:trial:start:${baseJob}`).setLabel('挑戦する').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('job:trial:list').setLabel('戻る').setStyle(ButtonStyle.Secondary),
      ),
    ], 'job:trial:confirm'),
  };
}

export async function handleJobButton(interaction: ButtonInteraction, parts: string[]): Promise<void> {
  const userId = interaction.user.id;
  const action = parts[1];

  if (action === 'menu') {
    await interaction.update(buildJobShowView(userId));
    return;
  }
  if (action === 'advanced') {
    await interaction.update(buildAdvancedJobsView(userId));
    return;
  }
  if (action === 'trial' && parts[2] === 'list') {
    await interaction.update(buildTrialListView(userId));
    return;
  }
  if (action === 'trial' && parts[2] === 'view') {
    const baseJob = parts.slice(3).join(':');
    await interaction.update(buildTrialDetailView(userId, baseJob));
    return;
  }
  if (action === 'trial' && parts[2] === 'start') {
    const baseJob = parts.slice(3).join(':');
    const block = isUserBlockedFromTrial(userId);
    if (block.blocked) {
      await interaction.reply({ embeds: [errorEmbed(block.reason ?? '試練を開始できません。')], ephemeral: true });
      return;
    }
    const result = startTrialBattle(userId, baseJob);
    if (!result.ok || !result.battleId) {
      await interaction.reply({ embeds: [errorEmbed(result.message)], ephemeral: true });
      return;
    }
    const battleReply = buildBattleReply(result.battleId, userId);
    if (!battleReply) {
      await interaction.reply({ embeds: [errorEmbed('戦闘画面を表示できません。')], ephemeral: true });
      return;
    }
    await interaction.update({
      embeds: battleReply.embeds,
      components: battleReply.components,
    });
    return;
  }

  await interaction.reply({ embeds: [errorEmbed('不明な操作です。')], ephemeral: true });
}
