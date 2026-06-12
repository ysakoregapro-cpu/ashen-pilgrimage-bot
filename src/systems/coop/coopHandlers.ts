import type { ButtonInteraction, StringSelectMenuInteraction, Guild } from 'discord.js';
import {
  joinCoopRecruit,
  leaveCoopRecruit,
  startCoopRecruit,
  cancelCoopRecruit,
  validateRecruitOperation,
  setCoopRecruitMessage,
} from './coopRecruitSystem';
import {
  submitCoopAction,
  tryResolveCoopTurn,
  validateCoopBattleAction,
  formatCoopBattleStatus,
  getCoopBattle,
  needsTargetSelection,
} from './coopBattleSystem';
import {
  buildCoopRecruitEmbed,
  buildCoopRecruitButtons,
  buildCoopBattleEmbed,
  buildCoopBattleButtons,
  buildCoopSkillMenu,
  buildCoopItemMenu,
  buildCoopTargetButtons,
  buildCoopResultButtons,
} from './coopUi';
import { getSkill } from '../skillSystem';
import { getOrCreatePublicChannel } from '../../utils/channels';
import { getEnvOptional } from '../../utils/permissions';
import { successEmbed, errorEmbed } from '../../utils/embeds';
import type { CoopActionTarget, CoopMode, CoopContext } from './coopTypes';
import { createCoopRecruit } from './coopRecruitSystem';

export async function postCoopRecruitToGuild(
  guild: Guild,
  userId: string,
  mode: CoopMode,
  context?: CoopContext,
): Promise<{ ok: boolean; message: string; recruitId?: string; channelId?: string }> {
  const result = createCoopRecruit(guild.id, userId, mode, context ?? {});
  if (!result.ok || !result.recruitId) return { ok: false, message: result.message };

  const channelName = mode === 'raid'
    ? getEnvOptional('RAID_CHANNEL_NAME', 'rpg-レイド募集')
    : getEnvOptional('RESCUE_CHANNEL_NAME', 'rpg-救難要請');
  const channel = await getOrCreatePublicChannel(guild, channelName);
  const msg = await channel.send({
    embeds: [buildCoopRecruitEmbed(result.recruitId)],
    components: buildCoopRecruitButtons(result.recruitId, userId),
  });
  setCoopRecruitMessage(result.recruitId, msg.id, channel.id);
  return { ok: true, message: `募集を <#${channel.id}> に投稿しました。`, recruitId: result.recruitId, channelId: channel.id };
}

export async function handleCoopRecruitButton(interaction: ButtonInteraction, op: string, recruitId: string): Promise<boolean> {
  const userId = interaction.user.id;
  let message = '';

  if (op === 'join') {
    message = joinCoopRecruit(recruitId, userId);
  } else if (op === 'leave') {
    message = leaveCoopRecruit(recruitId, userId);
  } else if (op === 'cancel') {
    message = cancelCoopRecruit(recruitId, userId);
  } else if (op === 'start') {
    const result = startCoopRecruit(recruitId, userId);
    if (!result.ok) {
      await interaction.reply({ embeds: [errorEmbed(result.message)], ephemeral: true });
      return true;
    }
    const battle = result.battleId ? getCoopBattle(result.battleId) : undefined;
    await interaction.reply({
      embeds: [
        successEmbed(result.message),
        ...(result.battleId ? [buildCoopBattleEmbed(result.battleId)] : []),
      ],
      components: result.battleId ? buildCoopBattleButtons(result.battleId, userId) : [],
    });
    return true;
  } else {
    return false;
  }

  const check = validateRecruitOperation(recruitId);
  if (check.recruit && interaction.message.editable) {
    try {
      await interaction.message.edit({
        embeds: [buildCoopRecruitEmbed(recruitId)],
        components: buildCoopRecruitButtons(recruitId, userId),
      });
    } catch { /* stale message */ }
  }

  await interaction.reply({ embeds: [successEmbed(message)], ephemeral: true });
  return true;
}

export async function handleCoopBattleButton(interaction: ButtonInteraction, parts: string[]): Promise<boolean> {
  const battleId = parts[2]!;
  const action = parts[3]!;
  const userId = interaction.user.id;

  const valid = validateCoopBattleAction(battleId, userId);
  if (!valid.ok) {
    await interaction.reply({ embeds: [errorEmbed(valid.message)], ephemeral: true });
    return true;
  }

  if (action === 'skill_menu') {
    const menu = buildCoopSkillMenu(battleId, userId);
    if (!menu) {
      await interaction.reply({ embeds: [errorEmbed('使える技がない。')], ephemeral: true });
      return true;
    }
    await interaction.reply({ components: [menu], ephemeral: true });
    return true;
  }

  if (action === 'item_menu') {
    const menu = buildCoopItemMenu(battleId, userId);
    if (!menu) {
      await interaction.reply({ embeds: [errorEmbed('使える品がない。')], ephemeral: true });
      return true;
    }
    await interaction.reply({ components: [menu], ephemeral: true });
    return true;
  }

  if (action === 'attack' || action === 'defend') {
    const result = submitCoopAction(battleId, userId, action as 'attack' | 'defend');
    await replyCoopBattleResult(interaction, battleId, result.message, userId);
    return true;
  }

  return false;
}

export async function handleCoopTargetButton(interaction: ButtonInteraction, parts: string[]): Promise<boolean> {
  const battleId = parts[2]!;
  const kind = parts[3] as 'skill' | 'item';
  const ref = parts[4]!;
  const targetKind = parts[5];
  const targetRef = parts[6];
  const userId = interaction.user.id;

  let target: CoopActionTarget | undefined;
  if (targetKind === 'ally') {
    target = { kind: 'ally', user_id: targetRef };
  } else if (targetKind === 'enemy') {
    target = { kind: 'enemy', monster_id: 'boss' };
  } else if (targetKind === 'auto') {
    const skill = getSkill(ref);
    const tt = skill?.target_type ?? 'self';
    if (tt === 'all_enemies') target = { kind: 'all_enemies' };
    else if (tt === 'all_allies') target = { kind: 'all_allies' };
    else target = { kind: 'self' };
  }

  const actionType = kind === 'item' ? 'item' : 'skill';
  const result = submitCoopAction(battleId, userId, actionType, {
    skillId: kind === 'skill' ? ref : undefined,
    itemId: kind === 'item' ? Number(ref) : undefined,
    target,
  });
  await replyCoopBattleResult(interaction, battleId, result.message, userId);
  return true;
}

export async function handleCoopSkillSelect(interaction: StringSelectMenuInteraction, battleId: string): Promise<boolean> {
  const skillId = interaction.values[0]!;
  const userId = interaction.user.id;
  const skill = getSkill(skillId);
  if (!skill) {
    await interaction.reply({ embeds: [errorEmbed('その技は使えません。')], ephemeral: true });
    return true;
  }
  if (needsTargetSelection(skill, 'skill')) {
    await interaction.reply({
      content: `${skill.name} — 対象を選んでください`,
      components: buildCoopTargetButtons(battleId, 'skill', skillId, userId),
      ephemeral: true,
    });
    return true;
  }
  let target: CoopActionTarget = { kind: 'enemy', monster_id: 'boss' };
  const tt = skill.target_type ?? 'single';
  if (tt === 'self' || tt === 'taunt') target = { kind: 'self' };
  if (tt === 'all_enemies' || tt === 'all') target = { kind: 'all_enemies' };
  if (tt === 'all_allies') target = { kind: 'all_allies' };

  const result = submitCoopAction(battleId, userId, 'skill', { skillId, target });
  await replyCoopBattleResult(interaction, battleId, result.message, userId);
  return true;
}

export async function handleCoopItemSelect(interaction: StringSelectMenuInteraction, battleId: string): Promise<boolean> {
  const itemId = Number(interaction.values[0]!);
  const userId = interaction.user.id;
  await interaction.reply({
    content: '回復対象を選んでください',
    components: buildCoopTargetButtons(battleId, 'item', String(itemId), userId),
    ephemeral: true,
  });
  return true;
}

async function replyCoopBattleResult(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  battleId: string,
  message: string,
  userId: string,
): Promise<void> {
  const battle = getCoopBattle(battleId);
  const finished = battle && ['victory', 'defeat'].includes(battle.status);
  const embeds = finished
    ? [buildCoopBattleEmbed(battleId)]
    : [successEmbed(`${message}\n\n${formatCoopBattleStatus(battleId)}`)];

  const components = finished
    ? buildCoopResultButtons(battle?.recruit_id, battle?.mode as CoopMode, battle?.status)
    : buildCoopBattleButtons(battleId, userId);

  await interaction.reply({ embeds, components, ephemeral: true });
}

export async function handleLegacyRaidDepart(interaction: ButtonInteraction, raidId: string, userId: string, startRaidFn: (id: string, uid: string) => { message: string; battleId?: string }): Promise<void> {
  const result = startRaidFn(raidId, userId);
  if (!result.battleId) {
    await interaction.reply({ embeds: [successEmbed(result.message)], ephemeral: true });
    return;
  }
  await interaction.reply({
    embeds: [buildCoopBattleEmbed(result.battleId)],
    components: buildCoopBattleButtons(result.battleId, userId),
  });
}

export async function handleLegacyRescueDepart(interaction: ButtonInteraction, rescueId: string, userId: string): Promise<void> {
  const result = startCoopRecruit(rescueId, userId);
  if (!result.ok || !result.battleId) {
    await interaction.reply({ embeds: [errorEmbed(result.message)], ephemeral: true });
    return;
  }
  await interaction.reply({
    embeds: [buildCoopBattleEmbed(result.battleId)],
    components: buildCoopBattleButtons(result.battleId, userId),
  });
}
