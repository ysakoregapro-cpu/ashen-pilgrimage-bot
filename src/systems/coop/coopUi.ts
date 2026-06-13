import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  getCoopRecruit,
  getCoopMembers,
  getActiveMemberCount,
  parseCoopContext,
  getRecruitTargetLabel,
  getRecommendedLevel,
  isRecruitExpired,
} from './coopRecruitSystem';
import { formatCoopBattleStatus, getCoopBattle, needsTargetSelection } from './coopBattleSystem';
import { getUsableBattleSkills } from '../skillSystem';
import { getDb } from '../../db/database';
import { nextActionButtons } from '../../utils/nextActionButtons';
import type { CoopMode } from './coopTypes';

export function buildCoopRecruitEmbed(recruitId: string): EmbedBuilder {
  const recruit = getCoopRecruit(recruitId);
  if (!recruit) {
    return new EmbedBuilder().setTitle('募集終了').setDescription('この募集は終了しています。').setColor(0x666666);
  }
  const ctx = parseCoopContext(recruit.context_json);
  const members = getCoopMembers(recruitId);
  const count = getActiveMemberCount(recruitId);
  const modeLabel = recruit.mode === 'raid'
    ? 'レイド'
    : recruit.mode === 'valhalla_coop'
      ? 'ヴァルハラ共闘'
      : '救難要請';
  const target = getRecruitTargetLabel(recruit.mode, ctx);
  const recLv = getRecommendedLevel(recruit.mode, ctx);
  const memberList = members.map((m) => `<@${m.user_id}>${m.role === 'leader' ? '（主）' : ''}`).join('\n') || '—';
  const expires = new Date(recruit.expires_at).toLocaleString('ja-JP');
  const statusNote = ['expired', 'cancelled', 'completed', 'started'].includes(recruit.status)
    ? `\n状態: **${recruit.status}**`
    : '';

  const title = recruit.mode === 'raid'
    ? '⚔️ レイド募集'
    : recruit.mode === 'valhalla_coop'
      ? '🛡️ ヴァルハラ共闘募集'
      : '🆘 救難要請';
  const color = recruit.mode === 'raid' ? 0xaa8844 : recruit.mode === 'valhalla_coop' ? 0x6688cc : 0xff6644;

  const footerNote = recruit.mode === 'rescue'
    ? '※救難は復帰支援です。報酬は控えめに設定されています。'
    : recruit.mode === 'valhalla_coop'
      ? '※ヴァルハラ徽章・装備厳選が主目的。全員に個別報酬。'
      : '※レイドは高難度協力コンテンツ。3ターンごとに大技予兆があります。';

  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setDescription([
      `**種別:** ${modeLabel}`,
      `**募集主:** <@${recruit.leader_id}>`,
      `**対象:** ${target}`,
      `**推奨Lv:** ${recLv}`,
      `**参加人数:** ${count}/${recruit.max_players}（${recruit.min_players}人で開始可）`,
      `**参加者:**\n${memberList}`,
      `**期限:** ${expires}`,
      statusNote,
      '',
      recruit.mode === 'valhalla_coop'
        ? '**報酬概要:** 徽章4〜8 / 装備チャンス / 無答の頁4% / EXP・Job・Gold'
        : '',
      footerNote,
      '※途中参加・観戦不可。',
    ].filter(Boolean).join('\n'));
}

export type CoopRecruitButtonOptions = {
  /** Shared guild-channel recruit post — one button state for all viewers. */
  forPublicChannel?: boolean;
  viewerId?: string;
};

function parseCoopRecruitButtonOptions(viewerIdOrOptions?: string | CoopRecruitButtonOptions): CoopRecruitButtonOptions {
  if (typeof viewerIdOrOptions === 'string') return { viewerId: viewerIdOrOptions };
  return viewerIdOrOptions ?? {};
}

export function buildCoopRecruitButtons(
  recruitId: string,
  viewerIdOrOptions?: string | CoopRecruitButtonOptions,
): ActionRowBuilder<ButtonBuilder>[] {
  const recruit = getCoopRecruit(recruitId);
  if (!recruit || ['expired', 'cancelled', 'completed', 'started'].includes(recruit.status) || isRecruitExpired(recruit)) {
    return [];
  }

  const { viewerId, forPublicChannel = true } = parseCoopRecruitButtonOptions(viewerIdOrOptions);
  const count = getActiveMemberCount(recruitId);
  const isFull = count >= recruit.max_players;
  const isLeader = viewerId === recruit.leader_id;
  const isMember = viewerId ? getCoopMembers(recruitId).some((m) => m.user_id === viewerId) : false;

  // Public channel messages show a single disabled state to everyone — never bake in the leader's membership.
  const joinDisabled = forPublicChannel ? isFull : (isMember || isFull);
  const leaveDisabled = forPublicChannel ? false : (!isMember || isLeader);
  const startDisabled = forPublicChannel ? false : !isLeader;
  const cancelDisabled = forPublicChannel ? false : !isLeader;

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`coop:join:${recruitId}`).setLabel('参加する').setStyle(ButtonStyle.Primary).setDisabled(joinDisabled),
    new ButtonBuilder().setCustomId(`coop:leave:${recruitId}`).setLabel('参加取消').setStyle(ButtonStyle.Secondary).setDisabled(leaveDisabled),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`coop:start:${recruitId}`).setLabel('開始').setStyle(ButtonStyle.Success).setDisabled(startDisabled),
    new ButtonBuilder().setCustomId(`coop:cancel:${recruitId}`).setLabel('解散').setStyle(ButtonStyle.Danger).setDisabled(cancelDisabled),
  );
  return [row1, row2];
}

export function buildCoopBattleEmbed(battleId: string): EmbedBuilder {
  const body = formatCoopBattleStatus(battleId);
  const battle = getCoopBattle(battleId);
  const color = battle?.status === 'victory' ? 0x44aa66 : battle?.status === 'defeat' ? 0x666677 : 0x4488cc;
  return new EmbedBuilder().setTitle('協力戦').setDescription(body).setColor(color);
}

export function buildCoopBattleButtons(battleId: string, userId: string): ActionRowBuilder<ButtonBuilder>[] {
  const battle = getCoopBattle(battleId);
  if (!battle || !['active', 'resolving'].includes(battle.status)) {
    return buildCoopResultButtons(battle?.recruit_id ?? '', battle?.mode as CoopMode | undefined, battle?.status);
  }

  const participants = JSON.parse(battle.participant_states_json) as Array<{ user_id: string; hp: number; defeated: boolean }>;
  const self = participants.find((p) => p.user_id === userId);
  if (!self || self.defeated || self.hp <= 0) return [];

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`coop:act:${battleId}:attack`).setLabel('攻撃').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`coop:act:${battleId}:defend`).setLabel('防御').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`coop:act:${battleId}:skill_menu`).setLabel('スキル').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`coop:act:${battleId}:item_menu`).setLabel('アイテム').setStyle(ButtonStyle.Success),
    ),
  ];
}

export function buildCoopSkillMenu(battleId: string, userId: string): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const battle = getCoopBattle(battleId);
  if (!battle) return null;
  const participants = JSON.parse(battle.participant_states_json) as Array<{ user_id: string; mp: number; playerSilence: number }>;
  const self = participants.find((p) => p.user_id === userId);
  if (!self) return null;

  const skills = getUsableBattleSkills(userId).filter((s) => {
    if (s.mp_cost > self.mp) return false;
    if (self.playerSilence > 0 && ['magic', 'divine', 'prayer'].includes(s.skill_type)) return false;
    return true;
  }).slice(0, 25);

  if (!skills.length) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`coop:skill:${battleId}`)
    .setPlaceholder('使う技を選ぶ')
    .addOptions(skills.map((s) => ({
      label: s.name.slice(0, 100),
      value: s.id,
      description: `MP${s.mp_cost} / ${s.skill_type}`.slice(0, 100),
    })));

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildCoopItemMenu(battleId: string, userId: string): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const rows = getDb().prepare(`
    SELECT pi.id, i.name, pi.quantity FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ? AND i.battle_usable = 1 AND pi.quantity > 0 LIMIT 25
  `).all(userId) as Array<{ id: number; name: string; quantity: number }>;
  if (!rows.length) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`coop:item:${battleId}`)
    .setPlaceholder('使うアイテムを選ぶ')
    .addOptions(rows.map((r) => ({
      label: `${r.name} x${r.quantity}`.slice(0, 100),
      value: String(r.id),
    })));

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildCoopTargetButtons(
  battleId: string,
  actionKind: 'skill' | 'item',
  actionRef: string,
  userId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  const battle = getCoopBattle(battleId);
  if (!battle) return [];
  const participants = JSON.parse(battle.participant_states_json) as Array<{ user_id: string; hp: number; defeated: boolean }>;
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  const allyButtons = participants
    .filter((p) => !p.defeated && p.hp > 0)
    .slice(0, 4)
    .map((p) => new ButtonBuilder()
      .setCustomId(`coop:target:${battleId}:${actionKind}:${actionRef}:ally:${p.user_id}`)
      .setLabel(p.user_id === userId ? '自分' : `味方`)
      .setStyle(ButtonStyle.Primary));

  if (allyButtons.length) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...allyButtons));

  if (actionKind === 'skill') {
    const skill = getDb().prepare('SELECT target_type FROM skills WHERE id = ?').get(actionRef) as { target_type: string } | undefined;
    const tt = skill?.target_type ?? 'single';
    if (['single', 'all_enemies', 'random_enemy'].includes(tt)) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`coop:target:${battleId}:skill:${actionRef}:enemy:boss`)
          .setLabel('敵')
          .setStyle(ButtonStyle.Danger),
      ));
    }
    if (['self', 'taunt', 'all_enemies', 'all_allies'].includes(tt)) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`coop:target:${battleId}:skill:${actionRef}:auto:confirm`)
          .setLabel('確定')
          .setStyle(ButtonStyle.Success),
      ));
    }
  }

  return rows;
}

export function buildCoopResultButtons(_recruitId?: string, mode?: CoopMode, status?: string): ActionRowBuilder<ButtonBuilder>[] {
  if (status !== 'victory' && status !== 'defeat') return [];
  const ctx = mode === 'valhalla_coop'
    ? 'coop_valhalla_result'
    : mode === 'raid'
      ? 'coop_raid_result'
      : 'coop_rescue_result';
  return nextActionButtons(ctx) as ActionRowBuilder<ButtonBuilder>[];
}

export { needsTargetSelection };
