import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { getDb } from '../db/database';
import type { UiPayload } from '../utils/townUi';
import { baseEmbed, errorEmbed, safeSelectMenu } from '../utils/embeds';
import { sanitizeComponents } from '../utils/componentSafety';
import { getPlayer } from './playerSystem';
import { getJobSkills } from './jobSystem';
import { getJobLevel } from './jobLevelSystem';
import {
  ADVANCED_JOB_UNLOCK_LEVEL,
  JOB_TRIO_MAP,
  SUB_JOB_UNLOCK_LEVEL,
  TRIAL_ENEMY_NAMES,
  TRIAL_REPEAT_CLEAR_GOLD,
  getBaseJobForAdvanced,
} from '../db/seedData/jobProgressionMaster';
import {
  BASIC_MAIN_JOBS,
  isLegacyJob,
  isPhase2AdvancedMain,
  LEGACY_ADVANCED_JOBS,
  LEGACY_HIDDEN_JOBS,
  PHASE2_SUB_JOBS,
} from '../db/seedData/jobMultiplierMaster';
import {
  canStartTrial,
  formatLegacyJobWarning,
  getSelectableMainJobs,
  getSelectableSubJobs,
  getTrialStatusText,
  isAdvancedJobUnlocked,
} from './jobProgressionSystem';
import { hasStoryFlag } from './storySystem';
import { getActiveBattle, buildBattleReply } from './battleSystem';
import { startTrialBattle } from './trialBattleSystem';

export type JobUiContext = { facilityId?: string };

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

function backToMenuButton(): ButtonBuilder {
  return new ButtonBuilder().setCustomId('job:menu').setLabel('戻る').setStyle(ButtonStyle.Secondary);
}

function backFromFacilityButton(facilityId: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`job:back:facility:${facilityId}`)
    .setLabel('戻る')
    .setStyle(ButtonStyle.Secondary);
}

function buildBackRow(ctx?: JobUiContext): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ctx?.facilityId ? backFromFacilityButton(ctx.facilityId) : backToMenuButton(),
  );
}

/** Phase2 正規職能メニュー — /job show と受付「職能を選ぶ」で共通 */
export function buildJobMenuView(userId: string, ctx?: JobUiContext): UiPayload {
  const player = getPlayer(userId);
  if (!player) {
    return { embeds: [errorEmbed('未登録です。')], components: [] };
  }

  const legacy = formatLegacyJobWarning(userId);
  const skills = getJobSkills(player.main_job) as Array<{ name: string; description: string }>;
  const skillText = skills.slice(0, 5).map((s) => `• ${s.name}: ${s.description}`).join('\n');
  const lines = [
    `メイン: **${player.main_job}**`,
    `サブ: **${player.sub_job ?? '未設定'}**`,
  ];
  if (legacy) lines.push(`\n⚠ ${legacy}`);
  if (player.main_job !== '未選択' && isLegacyJob(player.main_job)) {
    lines.push(`\n現在のメイン「${player.main_job}」は旧職です。再設定を推奨します。`);
  }
  if (player.sub_job && isLegacyJob(player.sub_job)) {
    lines.push(`\n現在のサブ「${player.sub_job}」は旧職です。再設定を推奨します。`);
  }

  const embed = baseEmbed('職能', lines.join('\n'));
  if (skillText) embed.addFields({ name: 'スキル', value: skillText });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('job:main').setLabel('メインジョブを選ぶ').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('job:sub').setLabel('サブジョブを選ぶ').setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('job:advanced').setLabel('上級職を確認').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('job:trial:list').setLabel('現身の試練に挑む').setStyle(ButtonStyle.Danger),
  );
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [row1, row2];
  if (ctx?.facilityId) rows.push(buildBackRow(ctx));

  return { embeds: [embed], components: sanitizeComponents(rows, 'job:menu') };
}

export function buildJobShowView(userId: string): UiPayload {
  return buildJobMenuView(userId);
}

export function buildMainJobSelectView(userId: string, ctx?: JobUiContext): UiPayload {
  const player = getPlayer(userId);
  if (!player) {
    return { embeds: [errorEmbed('未登録です。')], components: [] };
  }

  const legacy = formatLegacyJobWarning(userId);
  const lines = ['メインジョブを選んでください。'];
  if (legacy) lines.push(`\n⚠ ${legacy}`);
  if (player.main_job !== '未選択' && isLegacyJob(player.main_job)) {
    lines.push(`\n現在のメイン「${player.main_job}」は旧職です。基本職または解放済み上級職へ再設定してください。`);
  }

  let options: Array<{ label: string; value: string; description?: string }>;
  if (player.main_job === '未選択') {
    options = BASIC_MAIN_JOBS.map((name) => ({ label: name, value: name }));
  } else {
    options = getSelectableMainJobs(userId)
      .filter((j) => !j.locked && !isLegacyJob(j.name))
      .map((j) => ({
        label: j.name,
        value: j.name,
        description: j.kind === 'advanced' ? '上級職' : undefined,
      }));
  }

  const embed = baseEmbed('メインジョブ', lines.join('\n'));
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  const menu = safeSelectMenu('onboarding:job:main', 'メインジョブを選ぶ', options);
  if (menu) rows.push(menu);
  else embed.setDescription(`${lines.join('\n')}\n\n現在選択できるメインジョブはありません。`);
  rows.push(buildBackRow(ctx));

  return { embeds: [embed], components: sanitizeComponents(rows, 'job:main') };
}

export function buildSubJobSelectView(userId: string, ctx?: JobUiContext): UiPayload {
  const player = getPlayer(userId);
  if (!player) {
    return { embeds: [errorEmbed('未登録です。')], components: [] };
  }

  const subs = getSelectableSubJobs(userId).filter((s) => PHASE2_SUB_JOBS.includes(s.name));
  const unlocked = subs.filter((s) => !s.locked);
  const locked = subs.filter((s) => s.locked);

  const lines: string[] = [];
  if (unlocked.length > 0) {
    lines.push('解放済みサブジョブを選んでください。');
  } else {
    lines.push('まだ選択できるサブジョブはありません。');
    lines.push('');
    lines.push(`サブジョブは、対応する基本職のJobLv${SUB_JOB_UNLOCK_LEVEL}で解放されます。`);
  }
  if (player.sub_job && isLegacyJob(player.sub_job)) {
    lines.push(`\n⚠ 現在のサブ「${player.sub_job}」は旧職です。解放済みサブへ再設定してください。`);
  } else {
    const legacy = formatLegacyJobWarning(userId);
    if (legacy) lines.push(`\n⚠ ${legacy}`);
  }
  if (locked.length) {
    lines.push('', '**未解放:**', ...locked.map((s) => `・${s.name} — ${s.locked}`));
  }

  const embed = baseEmbed('サブジョブ', lines.join('\n'));
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  const menu = safeSelectMenu(
    'onboarding:job:sub',
    'サブジョブを選ぶ',
    unlocked.map((j) => ({ label: j.name, value: j.name })),
  );
  if (menu) rows.push(menu);
  rows.push(buildBackRow(ctx));

  return { embeds: [embed], components: sanitizeComponents(rows, 'job:sub') };
}

export function buildAdvancedJobsView(userId: string): UiPayload {
  const jobs = getSelectableMainJobs(userId).filter((j) => j.kind === 'advanced');
  const lines = jobs.map((j) => {
    if (j.locked) return `🔒 **${j.name}** — ${j.locked}`;
    return `✅ **${j.name}** — 解放済み（メイン選択可）`;
  });
  const embed = baseEmbed('上級職', lines.join('\n') || '上級職データがありません。');
  const components = sanitizeComponents([
    new ActionRowBuilder<ButtonBuilder>().addComponents(backToMenuButton()),
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
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(backToMenuButton()));
  return { embeds: [embed], components: sanitizeComponents(rows, 'job:trial:list') };
}

export function buildTrialDetailView(userId: string, baseJob: string): UiPayload {
  const detail = getTrialConditionDetail(userId, baseJob);
  if (!detail) {
    return {
      embeds: [errorEmbed('試練が見つかりません。')],
      components: sanitizeComponents([new ActionRowBuilder<ButtonBuilder>().addComponents(backToMenuButton())], 'job:trial:detail'),
    };
  }

  if (detail.unlocked) {
    const embed = baseEmbed(
      '現身の試練',
      [
        `「**${detail.advanced}**」は解放済みです。`,
        '何度でも再挑戦できます（挑戦料なし）。',
        `再クリア報酬: 経験値 +1 / **${TRIAL_REPEAT_CLEAR_GOLD}G** / HP・MP全回復`,
        '',
        formatConditionBlock(detail),
      ].join('\n'),
    );
    return {
      embeds: [embed],
      components: sanitizeComponents([
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`job:trial:start:${baseJob}`)
            .setLabel('再挑戦する')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!detail.canStart),
          new ButtonBuilder().setCustomId('job:trial:list').setLabel('戻る').setStyle(ButtonStyle.Secondary),
        ),
      ], 'job:trial:confirm'),
    };
  }

  if (!detail.canStart) {
    const embed = baseEmbed('現身の試練', formatConditionBlock(detail));
    return {
      embeds: [embed],
      components: sanitizeComponents([
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('job:trial:list').setLabel('一覧へ').setStyle(ButtonStyle.Secondary),
          backToMenuButton(),
        ),
      ], 'job:trial:detail'),
    };
  }

  const embed = baseEmbed(
    '現身の試練',
    [
      `**${detail.enemyName}**に挑みますか？`,
      `勝利すると、上級職「**${detail.advanced}**」が解放されます。`,
      '挑戦料はかかりません。',
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

/** Audit helper — collect select menu option counts from a UiPayload */
export function collectSelectMenuOptionCounts(payload: UiPayload): number[] {
  const counts: number[] = [];
  for (const row of payload.components) {
    const json = row.toJSON();
    for (const c of json.components) {
      if (c.type === 3 && 'options' in c && Array.isArray(c.options)) {
        counts.push(c.options.length);
      }
    }
  }
  return counts;
}

export function collectSelectMenuValues(payload: UiPayload): string[] {
  const values: string[] = [];
  for (const row of payload.components) {
    const json = row.toJSON();
    for (const c of json.components) {
      if (c.type === 3 && 'options' in c && Array.isArray(c.options)) {
        for (const o of c.options) {
          if ('value' in o && typeof o.value === 'string') values.push(o.value);
        }
      }
    }
  }
  return values;
}

export async function handleJobButton(interaction: ButtonInteraction, parts: string[]): Promise<void> {
  const userId = interaction.user.id;
  const action = parts[1];

  if (action === 'menu') {
    await interaction.update(buildJobMenuView(userId));
    return;
  }
  if (action === 'main') {
    await interaction.update(buildMainJobSelectView(userId));
    return;
  }
  if (action === 'sub') {
    await interaction.update(buildSubJobSelectView(userId));
    return;
  }
  if (action === 'back' && parts[2] === 'facility') {
    const facId = parts[3];
    if (!facId) {
      await interaction.reply({ embeds: [errorEmbed('施設が見つかりません。')], ephemeral: true });
      return;
    }
    const { buildFacilityView } = await import('./townActionSystem');
    await interaction.update(buildFacilityView(userId, facId));
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

export { LEGACY_ADVANCED_JOBS, LEGACY_HIDDEN_JOBS };
