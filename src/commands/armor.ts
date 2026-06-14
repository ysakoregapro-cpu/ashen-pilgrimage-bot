import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import {
  armorsInCategory,
  buildEquipmentRouteLines,
  formatArmorSeriesLabel,
  formatEquipmentStatSummary,
  formatSlotLabel,
  getArmorBookCategories,
  getArmorRouteBook,
} from '../systems/equipmentRouteBook';
import { buildPagedCatalogSelectView } from '../systems/equipmentMenuPaging';
import { baseEmbed, errorEmbed, selectMenu } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import { stampPanelPayload } from '../utils/messageFlow';
import type { UiPayload } from '../utils/townUi';

export const data = new SlashCommandBuilder()
  .setName('armor')
  .setDescription('防具図鑑 — 全防具の入手経路');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  const userId = interaction.user.id;
  if (!getPlayer(userId)) {
    await safeEdit(interaction, { embeds: [errorEmbed('未登録です。/start で旅を始めてください。')] });
    return;
  }
  await safeEdit(interaction, stampPanelPayload(userId, buildArmorCategoryView()));
}

export function buildArmorCategoryView(): UiPayload {
  const cats = getArmorBookCategories();
  return {
    embeds: [baseEmbed('防具図鑑', 'シリーズまたは分類を選んでください。')],
    components: [
      selectMenu('armor:cat', 'シリーズを選ぶ', cats.slice(0, 25).map((c) => ({
        label: c.label.slice(0, 100),
        value: c.id,
      }))),
    ],
  };
}

export function buildArmorListView(categoryId: string, page = 0): UiPayload {
  const armors = armorsInCategory(categoryId);
  const cat = getArmorBookCategories().find((c) => c.id === categoryId);
  if (!armors.length) {
    return {
      embeds: [baseEmbed('防具図鑑', `${cat?.label ?? categoryId} に登録防具がありません。`)],
      components: [selectMenu('armor:cat', '分類を選び直す', getArmorBookCategories().slice(0, 25).map((c) => ({
        label: c.label.slice(0, 100), value: c.id,
      })))],
    };
  }

  const view = buildPagedCatalogSelectView({
    items: armors.map((a) => ({
      id: a.item_id,
      label: a.name,
      description: `${a.rarity} / ${formatSlotLabel(a.slot)}`,
    })),
    page,
    selectMenuId: `armor:pick:${categoryId}`,
    selectLabel: '防具を選ぶ',
    pageButtonPrefix: `armor:page:${categoryId}`,
    backContext: 'armor',
    backPayload: 'cat',
    embedBody: `**${cat?.label ?? categoryId}** の防具一覧`,
    navTag: 'armor-list',
  });

  return {
    embeds: [baseEmbed('防具図鑑', view.embedText)],
    components: view.components,
  };
}

export function buildArmorDetailView(itemId: string, categoryId?: string): UiPayload {
  const a = getArmorRouteBook().find((x) => x.item_id === itemId);
  if (!a) {
    return { embeds: [errorEmbed('防具が見つかりません。')], components: [] };
  }

  const routes = buildEquipmentRouteLines(itemId);
  const body = [
    `**${a.name}**`,
    `レアリティ: ${a.rarity}`,
    `シリーズ: ${formatArmorSeriesLabel(a)}`,
    `部位: ${formatSlotLabel(a.slot)}`,
    '',
    '【主な性能】',
    formatEquipmentStatSummary(a),
    '',
    ...routes,
    a.legacy ? '\n※ 現在の通常プレイでは入手できない装備です。' : '',
  ].filter(Boolean).join('\n');

  const catId = categoryId ?? findArmorCategoryId(itemId);

  return {
    embeds: [baseEmbed('防具図鑑', body.slice(0, 4000))],
    components: [
      selectMenu('armor:cat', '分類に戻る', getArmorBookCategories().slice(0, 25).map((c) => ({
        label: c.label.slice(0, 100), value: c.id,
      }))),
      selectMenu(`armor:pick:${catId}`, '同分類の別防具', armorsInCategory(catId).slice(0, 25).map((x) => ({
        label: x.name.slice(0, 100),
        value: x.item_id,
        description: `${x.rarity} / ${formatSlotLabel(x.slot)}`,
      }))),
    ],
  };
}

export function findArmorCategoryId(itemId: string): string {
  for (const cat of getArmorBookCategories()) {
    if (armorsInCategory(cat.id).some((a) => a.item_id === itemId)) return cat.id;
  }
  return 'other_armor';
}
