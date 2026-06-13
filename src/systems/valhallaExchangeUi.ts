import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  checkExchangeAffordability,
  formatExchangeListText,
  getEmblemBalance,
  getSilentPageBalance,
  getUiAvailableExchanges,
} from './valhallaExchangeSystem';
import { getExchangeById } from '../db/seedData/valhallaExchangeMaster';
import {
  VALHALLA_SERIES_ACCESSORY_DROP_IDS,
  VALHALLA_SERIES_ARMOR_DROP_IDS,
} from '../db/seedData/valhallaRewardMaster';
import { getDb } from '../db/database';

function itemLabel(itemId: string): string {
  const row = getDb().prepare('SELECT name FROM items WHERE id = ?').get(itemId) as { name: string } | undefined;
  return row?.name ?? itemId;
}

export function buildValhallaExchangeEmbed(userId: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('ヴァルハラ徽章交換所')
    .setColor(0x8899cc)
    .setDescription(formatExchangeListText(userId));
}

export function buildValhallaExchangeButtons(userId: string, facilityId: string): ActionRowBuilder<ButtonBuilder>[] {
  const entries = getUiAvailableExchanges();
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let current: ButtonBuilder[] = [];

  for (const e of entries) {
    const afford = checkExchangeAffordability(userId, e.exchange_id);
    const label = `${e.cost_valhalla_emblem}→${e.receive_item_name.slice(0, 12)}`.slice(0, 80);
    current.push(
      new ButtonBuilder()
        .setCustomId(`vex:pick:${e.exchange_id}:${facilityId}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!afford.ok),
    );
    if (current.length >= 4) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...current));
      current = [];
    }
  }
  if (current.length) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...current));

  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`facility:view:${facilityId}`).setLabel('戻る').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('town:home').setLabel('街に戻る').setStyle(ButtonStyle.Secondary),
  ));
  return rows;
}

export function buildValhallaExchangeConfirmEmbed(userId: string, exchangeId: string): EmbedBuilder {
  const entry = getExchangeById(exchangeId)!;
  const afford = checkExchangeAffordability(userId, exchangeId);
  const cost = [`徽章 ×${entry.cost_valhalla_emblem}`];
  if (entry.cost_silent_page > 0) cost.push(`無答の頁 ×${entry.cost_silent_page}`);

  return new EmbedBuilder()
    .setTitle('交換確認')
    .setColor(0x6688aa)
    .setDescription([
      `**受け取り:** ${entry.receive_item_name}`,
      `**支払い:** ${cost.join(' + ')}`,
      '',
      `所持: 徽章 **${getEmblemBalance(userId)}** / 頁 **${getSilentPageBalance(userId)}**`,
      afford.ok ? 'この内容で交換しますか？' : (afford.reason ?? '交換できません。'),
    ].join('\n'));
}

export function buildValhallaExchangeConfirmButtons(
  exchangeId: string,
  facilityId: string,
  userId: string,
  selectedItemId?: string,
): ActionRowBuilder<ButtonBuilder>[] {
  const afford = checkExchangeAffordability(userId, exchangeId);
  const confirmId = selectedItemId
    ? `vex:confirm:${exchangeId}:${facilityId}:${selectedItemId}`
    : `vex:confirm:${exchangeId}:${facilityId}`;
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel('交換する')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!afford.ok),
      new ButtonBuilder()
        .setCustomId(`vex:cancel:${facilityId}`)
        .setLabel('戻る')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('town:home').setLabel('街に戻る').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildValhallaExchangeSelectMenu(
  exchangeId: string,
  facilityId: string,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const entry = getExchangeById(exchangeId)!;
  const pool = entry.exchange_id === 'vex_armor_select'
    ? VALHALLA_SERIES_ARMOR_DROP_IDS
    : VALHALLA_SERIES_ACCESSORY_DROP_IDS;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`vex:sel:${exchangeId}:${facilityId}`)
    .setPlaceholder('装備を選ぶ')
    .addOptions([...pool].map((id) => ({
      label: itemLabel(id).slice(0, 100),
      value: id,
    })));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildValhallaRematchModeEmbed(monsterId: string, monsterName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`ボス再戦 — ${monsterName}`)
    .setColor(0x7788aa)
    .setDescription([
      '**ヴァルハラボス再戦**',
      'ソロで挑むか、共闘募集を作成できます。',
      '',
      '**共闘:** 1〜4人 / 徽章・装備厳選 / 全員に個別報酬',
      '**ソロ:** 従来どおり1人で再戦',
    ].join('\n'));
}

export function buildValhallaRematchModeButtons(monsterId: string, facilityId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rematch:solo:${monsterId}`)
        .setLabel('ソロで挑む')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`rematch:coop:${monsterId}:${facilityId}`)
        .setLabel('共闘募集を作成')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`facility:act:${facilityId}:boss_rematch`)
        .setLabel('戻る')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}
