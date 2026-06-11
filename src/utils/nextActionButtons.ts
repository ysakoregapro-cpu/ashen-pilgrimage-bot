import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';

export type NextActionContext =
  | 'job_done'
  | 'profile'
  | 'inventory'
  | 'equip'
  | 'explore_result'
  | 'victory'
  | 'defeat'
  | 'npc_talk'
  | 'facility'
  | 'upgrade'
  | 'guide'
  | 'story_event'
  | 'error'
  | 'explore_area'
  | 'generic';

function btn(id: string, label: string, style: ButtonStyle): ButtonBuilder {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}

function row(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
}

export function nextActionButtons(
  context: NextActionContext,
  extra?: { npcId?: string; facilityId?: string; areaId?: string },
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  switch (context) {
    case 'job_done':
      return [
        row(
          btn('flow:profile', '旅の記録', ButtonStyle.Primary),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
          btn('town:explore', '探索へ向かう', ButtonStyle.Success),
        ),
        row(
          btn('town:npcs', '人と話す', ButtonStyle.Secondary),
          btn('town:guide', '巡礼手帳', ButtonStyle.Secondary),
        ),
      ];

    case 'profile':
      return [
        row(
          btn('flow:profile', 'もう一度', ButtonStyle.Primary),
          btn('flow:equip', '身支度', ButtonStyle.Secondary),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
        ),
        row(
          btn('town:explore', '探索へ向かう', ButtonStyle.Success),
          btn('town:npcs', '人と話す', ButtonStyle.Secondary),
        ),
      ];

    case 'inventory':
      return [
        row(
          btn('flow:inventory', 'もう一度', ButtonStyle.Secondary),
          btn('flow:equip', '身支度', ButtonStyle.Secondary),
          btn('town:explore', '探索へ向かう', ButtonStyle.Success),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
        ),
      ];

    case 'equip':
      return [
        row(
          btn('flow:equip', 'もう一度', ButtonStyle.Secondary),
          btn('flow:profile', '旅の記録', ButtonStyle.Secondary),
          btn('town:explore', '探索へ向かう', ButtonStyle.Success),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
        ),
      ];

    case 'explore_result':
      return [
        row(
          btn('town:explore', 'もう一度', ButtonStyle.Success),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
          btn('flow:inventory', '所持品', ButtonStyle.Secondary),
          btn('flow:equip', '身支度', ButtonStyle.Secondary),
        ),
      ];

    case 'victory':
      return [
        row(
          btn('town:explore', '探索を続ける', ButtonStyle.Success),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
          btn('flow:inventory', '所持品', ButtonStyle.Secondary),
          btn('flow:equip', '身支度', ButtonStyle.Secondary),
        ),
      ];

    case 'defeat':
      return [
        row(
          btn('town:home', '町へ戻る', ButtonStyle.Primary),
          btn('flow:rescue', '救難を求める', ButtonStyle.Danger),
          btn('flow:equip', '身支度', ButtonStyle.Secondary),
          btn('guide:chapter:defeat', '敗北について聞く', ButtonStyle.Secondary),
        ),
      ];

    case 'npc_talk':
      return [
        row(
          btn(`npc:act:${extra?.npcId ?? 'unknown'}:smalltalk`, '少し話す', ButtonStyle.Primary),
          btn('town:npcs', '別の人と話す', ButtonStyle.Secondary),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
        ),
        row(
          btn('town:explore', '探索へ向かう', ButtonStyle.Success),
          btn('town:guide', '巡礼手帳', ButtonStyle.Secondary),
        ),
      ];

    case 'facility':
      return [
        row(
          btn(`facility:view:${extra?.facilityId ?? 'unknown'}`, 'もう一度', ButtonStyle.Primary),
          btn(`facility:act:${extra?.facilityId ?? 'unknown'}:smalltalk`, '少し話す', ButtonStyle.Secondary),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
        ),
        row(
          btn('town:explore', '探索へ向かう', ButtonStyle.Success),
          btn('flow:equip', '身支度', ButtonStyle.Secondary),
        ),
      ];

    case 'upgrade':
      return [
        row(
          btn('flow:equip', '身支度', ButtonStyle.Primary),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
          btn('town:explore', '探索へ向かう', ButtonStyle.Success),
          btn('flow:inventory', '所持品', ButtonStyle.Secondary),
        ),
      ];

    case 'guide':
      return [
        row(
          btn('town:guide', '別の章', ButtonStyle.Secondary),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
          btn('town:explore', '探索へ向かう', ButtonStyle.Success),
        ),
      ];

    case 'story_event':
      return [
        row(
          btn('town:facilities', '町を歩く', ButtonStyle.Primary),
          btn('town:npcs', '人と話す', ButtonStyle.Primary),
          btn('town:explore', '探索へ向かう', ButtonStyle.Success),
        ),
        row(
          btn('town:guide', '巡礼手帳', ButtonStyle.Secondary),
        ),
      ];

    case 'explore_area':
      return [
        row(
          btn(`flow:explore:${extra?.areaId ?? ''}`, '探索する', ButtonStyle.Success),
          btn('town:explore', '別の場所', ButtonStyle.Secondary),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
        ),
      ];

    case 'error':
      return [
        row(
          btn('town:home', '町へ戻る', ButtonStyle.Primary),
          btn('flow:profile', '旅の記録', ButtonStyle.Secondary),
          btn('flow:equip', '身支度', ButtonStyle.Secondary),
          btn('town:guide', '巡礼手帳', ButtonStyle.Secondary),
        ),
      ];

    default:
      return [
        row(
          btn('town:home', '町へ戻る', ButtonStyle.Primary),
          btn('town:explore', '探索へ向かう', ButtonStyle.Success),
          btn('flow:inventory', '所持品', ButtonStyle.Secondary),
          btn('town:guide', '巡礼手帳', ButtonStyle.Secondary),
        ),
      ];
  }
}

import { errorEmbed } from './embeds';
import type { UiPayload } from './townUi';

export function errorRecoveryPayload(message: string): UiPayload {
  return {
    embeds: [errorEmbed(message)],
    components: nextActionButtons('error'),
  };
}
