import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { baseEmbed, selectMenu } from './embeds';
import type { Player } from '../types';
import { getActiveSetEffectLines } from '../systems/playerSystem';
import { GUIDE_SECTIONS } from '../systems/dialogueSystem';
import { buildExploreAreaOptions } from '../systems/areaDisplaySystem';
import { nextActionButtons } from './nextActionButtons';
import type { FacilityRow } from '../systems/facilitySystem';
import type { NpcRow } from '../systems/npcConversationSystem';

export interface UiPayload {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

export function townHubEmbed(title: string, description: string): EmbedBuilder {
  return baseEmbed(title, description);
}

export function playerRecordEmbed(player: Player, userId?: string): EmbedBuilder {
  const embed = baseEmbed('旅人の記録')
    .addFields(
      { name: '名前', value: player.name, inline: true },
      { name: 'Lv', value: `${player.level}`, inline: true },
      { name: '所持金', value: `${player.gold}G`, inline: true },
      { name: '職能', value: player.main_job, inline: true },
      { name: '副職', value: player.sub_job ?? '—', inline: true },
      { name: 'HP / MP', value: `${player.hp}/${player.max_hp} / ${player.mp}/${player.max_mp}`, inline: false },
      {
        name: '基礎能力',
        value: `攻${player.attack} 魔${player.magic} 防${player.defense} 精${player.spirit} 速${player.speed}`,
        inline: false,
      },
    );
  if (userId) {
    const sets = getActiveSetEffectLines(userId);
    if (sets.length) {
      embed.addFields({ name: '発動中シリーズ効果', value: sets.join('\n').slice(0, 1024) });
    }
  }
  return embed;
}

export function townHubButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('town:facilities', '町を歩く', ButtonStyle.Primary),
    btn('town:npcs', '人と話す', ButtonStyle.Primary),
    btn('town:explore', '探索へ向かう', ButtonStyle.Success),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('town:travel', '別の町へ', ButtonStyle.Secondary),
    btn('town:guide', '巡礼手帳', ButtonStyle.Secondary),
    btn('flow:inventory', '所持品', ButtonStyle.Secondary),
  );
  return [row1, row2];
}

function btn(id: string, label: string, style: ButtonStyle): ButtonBuilder {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}

export function facilitySelectMenu(facilities: FacilityRow[]) {
  return selectMenu(
    'town:fac_pick',
    'どこへ向かう？',
    facilities.map((f) => ({ label: f.name, value: f.id, description: f.description.slice(0, 50) })),
  );
}

export function npcSelectMenu(npcs: NpcRow[]) {
  return selectMenu(
    'town:npc_pick',
    '誰に声をかける？',
    npcs.map((n) => ({ label: n.name, value: n.id, description: n.role.slice(0, 50) })),
  );
}

export function exploreSelectMenu(userId: string, areas: Array<{ id: string; name: string; recommended_min_level: number; recommended_max_level: number }>) {
  return selectMenu(
    'explore:select',
    'どこへ足を踏み入れる？',
    buildExploreAreaOptions(userId, areas),
  );
}

export function travelSelectMenu(towns: Array<{ id: string; name: string; required_level: number }>) {
  return selectMenu(
    'town:travel',
    '向かう町を選ぶ',
    towns.map((t) => ({ label: t.name, value: t.id, description: `Lv${t.required_level}〜` })),
  );
}

export function parseFacilityActionId(base: string): { facId: string; action: string } | null {
  const prefix = 'facility:act:';
  if (!base.startsWith(prefix)) return null;
  const rest = base.slice(prefix.length);
  const idx = rest.lastIndexOf(':');
  if (idx <= 0) return null;
  return { facId: rest.slice(0, idx), action: rest.slice(idx + 1) };
}

export function parseFacilityViewId(base: string): string | null {
  const prefix = 'facility:view:';
  if (!base.startsWith(prefix)) return null;
  return base.slice(prefix.length);
}

export function facilityActionButtons(facilityId: string, actions: Array<{ id: string; label: string }>) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const chunk = (arr: typeof actions, size: number) => {
    for (let i = 0; i < arr.length; i += size) rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...arr.slice(i, i + size).map((a) =>
          new ButtonBuilder().setCustomId(`facility:act:${facilityId}:${a.id}`).setLabel(a.label).setStyle(a.id === 'home' ? ButtonStyle.Secondary : ButtonStyle.Primary),
        ),
      ),
    );
  };
  chunk(actions, 3);
  return rows;
}

export function npcTalkButtons(npcId: string) {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(`npc:act:${npcId}:smalltalk`, '少し話す', ButtonStyle.Primary),
    btn(`npc:act:${npcId}:explain`, 'この町について聞く', ButtonStyle.Secondary),
    btn(`npc:act:${npcId}:request`, '頼みごとを聞く', ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('town:home', '町へ戻る', ButtonStyle.Secondary),
  );
  return [row1, row2];
}

export function postExploreButtons() {
  return nextActionButtons('explore_result');
}

export function postVictoryButtons() {
  return nextActionButtons('victory');
}

export function postDefeatButtons() {
  return nextActionButtons('defeat');
}

export function restConfirmButtons(facilityId: string, mode: 'inn' | 'shrine'): ActionRowBuilder<ButtonBuilder>[] {
  const confirmId = mode === 'inn' ? 'rest_confirm' : 'heal_confirm';
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      btn(`facility:act:${facilityId}:${confirmId}`, '利用する', ButtonStyle.Success),
      btn(`facility:view:${facilityId}`, 'やめる', ButtonStyle.Secondary),
    ),
  ];
}

export function postRestButtons(facilityId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      btn(`facility:view:${facilityId}`, '施設に戻る', ButtonStyle.Secondary),
      btn('town:home', '町へ戻る', ButtonStyle.Primary),
      btn('town:explore', '探索へ向かう', ButtonStyle.Success),
    ),
  ];
}

export function postFacilityButtons(facilityId: string) {
  return nextActionButtons('facility', { facilityId });
}

export function guideSectionButtons() {
  return selectMenu(
    'guide:section',
    '章を選ぶ',
    GUIDE_SECTIONS.map((s) => ({ label: s.label, value: s.id })),
  );
}

export function guideChapterButton(sectionId: string) {
  return btn(`guide:chapter:${sectionId}`, '読む', ButtonStyle.Secondary);
}

export function inventorySummaryEmbed(lines: string) {
  return townHubEmbed('所持品', lines);
}

export function equipSummaryEmbed(lines: string) {
  return townHubEmbed('身支度', lines);
}
