import type { ButtonInteraction, StringSelectMenuInteraction, Guild } from 'discord.js';
import {
  joinCoopRecruit,
  leaveCoopRecruit,
  startCoopRecruit,
  cancelCoopRecruit,
  setCoopRecruitMessage,
} from './coopRecruitSystem';
import {
  submitCoopAction,
  validateCoopBattleAction,
  getCoopBattle,
  needsTargetSelection,
} from './coopBattleSystem';
import {
  buildCoopRecruitEmbed,
  buildCoopRecruitButtons,
  buildCoopSkillMenu,
  buildCoopItemMenu,
  buildCoopTargetButtons,
} from './coopUi';
import {
  syncRecruitChannelMessage,
  syncBattleChannelMessage,
  promoteRecruitMessageToBattle,
} from './coopMessageSync';
import { getOrCreatePublicChannel } from '../../utils/channels';
import { getEnvOptional } from '../../utils/permissions';
import { successEmbed, errorEmbed } from '../../utils/embeds';
import type { CoopActionTarget, CoopContext, CoopMode } from './coopTypes';
import { createCoopRecruit } from './coopRecruitSystem';
import { getSkill } from '../skillSystem';
import { enrichRescueContext } from './rescueMonsterContext';
import { resolveSkillTargetSide } from '../skillTargetResolver';

export async function postCoopRecruitToGuild(
  guild: Guild,
  userId: string,
  mode: CoopMode,
  context?: CoopContext,
): Promise<{ ok: boolean; message: string; recruitId?: string; channelId?: string }> {
  let ctx = context ?? {};
  if (mode === 'rescue') ctx = enrichRescueContext(ctx, userId);
  const result = createCoopRecruit(guild.id, userId, mode, ctx);
  if (!result.ok || !result.recruitId) return { ok: false, message: result.message };

  const channelName = mode === 'valhalla_coop'
    ? getEnvOptional('VALHALLA_COOP_CHANNEL_NAME', 'rpg-レイド募集')
    : mode === 'raid'
      ? getEnvOptional('RAID_CHANNEL_NAME', 'rpg-レイド募集')
      : getEnvOptional('RESCUE_CHANNEL_NAME', 'rpg-救難要請');
  const channel = await getOrCreatePublicChannel(guild, channelName);
  const msg = await channel.send({
    embeds: [buildCoopRecruitEmbed(result.recruitId)],
    components: buildCoopRecruitButtons(result.recruitId, { forPublicChannel: true }),
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
    await interaction.reply({ embeds: [successEmbed(result.message)], ephemeral: true });
    if (result.battleId) {
      await promoteRecruitMessageToBattle(recruitId, result.battleId);
    } else {
      await syncRecruitChannelMessage(recruitId, userId);
    }
    return true;
  } else {
    return false;
  }

  await syncRecruitChannelMessage(recruitId, userId);
  if (interaction.message.editable) {
    try {
      await interaction.message.edit({
        embeds: [buildCoopRecruitEmbed(recruitId)],
        components: buildCoopRecruitButtons(recruitId, { forPublicChannel: true }),
      });
    } catch { /* interaction message fallback */ }
  }

  await interaction.reply({ embeds: [successEmbed(message)], ephemeral: true });
  return true;
}

export async function handleCoopBattleButton(interaction: ButtonInteraction, parts: string[]): Promise<boolean> {
  const battleId = parts[2]!;
  const expectedTurn = Number(parts[3]);
  const action = parts[4]!;
  const userId = interaction.user.id;

  const valid = validateCoopBattleAction(battleId, userId, Number.isFinite(expectedTurn) ? expectedTurn : undefined);
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
    await replyCoopBattleAck(interaction, battleId, result.message, result.resolve);
    return true;
  }

  return false;
}

export async function handleCoopTargetButton(interaction: ButtonInteraction, parts: string[]): Promise<boolean> {
  const battleId = parts[2]!;
  const expectedTurn = Number(parts[3]);
  const kind = parts[4] as 'skill' | 'item';
  const ref = parts[5]!;
  const targetKind = parts[6];
  const targetRef = parts[7];
  const userId = interaction.user.id;

  const valid = validateCoopBattleAction(battleId, userId, Number.isFinite(expectedTurn) ? expectedTurn : undefined);
  if (!valid.ok) {
    await interaction.reply({ embeds: [errorEmbed(valid.message)], ephemeral: true });
    return true;
  }

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
  await replyCoopBattleAck(interaction, battleId, result.message, result.resolve);
  return true;
}

export async function handleCoopSkillSelect(interaction: StringSelectMenuInteraction, battleId: string, expectedTurn?: number): Promise<boolean> {
  const skillId = interaction.values[0]!;
  const userId = interaction.user.id;

  const valid = validateCoopBattleAction(battleId, userId, expectedTurn);
  if (!valid.ok) {
    await interaction.reply({ embeds: [errorEmbed(valid.message)], ephemeral: true });
    return true;
  }
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
  const side = resolveSkillTargetSide(skill);
  if (side === 'self' || skill.target_type === 'taunt') target = { kind: 'self' };
  else if (side === 'ally' && skill.target_type === 'all_allies') target = { kind: 'all_allies' };
  else if (side === 'enemy') {
    if (skill.target_type === 'all_enemies' || skill.target_type === 'all') target = { kind: 'all_enemies' };
    else target = { kind: 'enemy', monster_id: 'boss' };
  }

  const result = submitCoopAction(battleId, userId, 'skill', { skillId, target });
  await replyCoopBattleAck(interaction, battleId, result.message, result.resolve);
  return true;
}

export async function handleCoopItemSelect(interaction: StringSelectMenuInteraction, battleId: string, expectedTurn?: number): Promise<boolean> {
  const itemId = Number(interaction.values[0]!);
  const userId = interaction.user.id;
  await interaction.reply({
    content: '回復対象を選んでください',
    components: buildCoopTargetButtons(battleId, 'item', String(itemId), userId),
    ephemeral: true,
  });
  return true;
}

async function replyCoopBattleAck(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  battleId: string,
  message: string,
  turnResolved?: boolean,
): Promise<void> {
  const battle = getCoopBattle(battleId);
  const finished = battle && ['victory', 'defeat'].includes(battle.status);
  const short = finished
    ? (battle.status === 'victory' ? '救難成功！報酬は戦闘欄を確認してください。' : '協力戦に敗北した…')
    : (message.includes('登録済み') ? message : message.includes('待ち') ? message : '行動を登録した。');
  await interaction.reply({ embeds: [successEmbed(short)], ephemeral: true });
  await syncBattleChannelMessage(battleId, {
    postNewOnTurnAdvance: battle?.mode === 'rescue' && !!turnResolved && !finished,
  });
}

export async function handleLegacyRaidDepart(interaction: ButtonInteraction, raidId: string, userId: string, startRaidFn: (id: string, uid: string) => { message: string; battleId?: string }): Promise<void> {
  const result = startRaidFn(raidId, userId);
  if (!result.battleId) {
    await interaction.reply({ embeds: [successEmbed(result.message)], ephemeral: true });
    return;
  }
  await interaction.reply({ embeds: [successEmbed(result.message)], ephemeral: true });
  await promoteRecruitMessageToBattle(raidId, result.battleId);
}

export async function handleLegacyRescueDepart(interaction: ButtonInteraction, rescueId: string, userId: string): Promise<void> {
  const result = startCoopRecruit(rescueId, userId);
  if (!result.ok || !result.battleId) {
    await interaction.reply({ embeds: [errorEmbed(result.message)], ephemeral: true });
    return;
  }
  await interaction.reply({ embeds: [successEmbed(result.message)], ephemeral: true });
  await promoteRecruitMessageToBattle(rescueId, result.battleId);
}
