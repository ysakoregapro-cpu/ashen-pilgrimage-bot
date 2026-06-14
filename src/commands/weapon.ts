import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import {
  buildEquipmentRouteLines,
  formatEquipmentStatSummary,
  formatSlotLabel,
  formatWeaponFamilyLabel,
  getWeaponBookCategories,
  getWeaponRouteBook,
  weaponsInCategory,
} from '../systems/equipmentRouteBook';
import { buildPagedCatalogSelectView } from '../systems/equipmentMenuPaging';
import { baseEmbed, errorEmbed, selectMenu } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import { stampPanelPayload } from '../utils/messageFlow';
import type { UiPayload } from '../utils/townUi';

export const data = new SlashCommandBuilder()
  .setName('weapon')
  .setDescription('武器図鑑 — 全武器の入手経路');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  const userId = interaction.user.id;
  if (!getPlayer(userId)) {
    await safeEdit(interaction, { embeds: [errorEmbed('未登録です。/start で旅を始めてください。')] });
    return;
  }
  await safeEdit(interaction, stampPanelPayload(userId, buildWeaponCategoryView()));
}

export function buildWeaponCategoryView(): UiPayload {
  const cats = getWeaponBookCategories();
  return {
    embeds: [baseEmbed('灰星巡礼録 | 武器図鑑', 'ジョブ / 武器系統を選んでください。')],
    components: [
      selectMenu('weapon:cat', '系統を選ぶ', cats.map((c) => ({
        label: c.label.slice(0, 100),
        value: c.id,
        description: c.id === 'other' ? 'Uni/Src/汎用' : '武器一覧',
      }))),
    ],
  };
}

export function buildWeaponListView(categoryId: string, page = 0): UiPayload {
  const weapons = weaponsInCategory(categoryId);
  const cat = getWeaponBookCategories().find((c) => c.id === categoryId);
  if (!weapons.length) {
    return {
      embeds: [baseEmbed('武器図鑑', `${cat?.label ?? categoryId} に登録武器がありません。`)],
      components: [selectMenu('weapon:cat', '系統を選び直す', getWeaponBookCategories().map((c) => ({
        label: c.label.slice(0, 100), value: c.id,
      })).slice(0, 25))],
    };
  }

  const view = buildPagedCatalogSelectView({
    items: weapons.map((w) => ({ id: w.item_id, label: w.name, description: `${w.rarity} / ${formatWeaponFamilyLabel(w)}` })),
    page,
    selectMenuId: `weapon:pick:${categoryId}`,
    selectLabel: '武器を選ぶ',
    pageButtonPrefix: `weapon:page:${categoryId}`,
    backContext: 'weapon',
    backPayload: 'cat',
    embedBody: `**${cat?.label ?? categoryId}** の武器一覧`,
    navTag: 'weapon-list',
  });

  return {
    embeds: [baseEmbed('灰星巡礼録 | 武器図鑑', view.embedText)],
    components: view.components,
  };
}

export function buildWeaponDetailView(itemId: string, categoryId?: string): UiPayload {
  const w = getWeaponRouteBook().find((x) => x.item_id === itemId);
  if (!w) {
    return { embeds: [errorEmbed('武器が見つかりません。')], components: [] };
  }

  const routes = buildEquipmentRouteLines(itemId);
  const body = [
    `**${w.name}**`,
    `レアリティ: ${w.rarity}`,
    `系統: ${formatWeaponFamilyLabel(w)}`,
    '',
    '【主な性能】',
    formatEquipmentStatSummary(w),
    '',
    ...routes,
    w.legacy ? '\n※ 現在の通常プレイでは入手できない装備です。' : '',
  ].filter(Boolean).join('\n');

  const catId = categoryId ?? getWeaponBookCategories().find((c) => weaponsInCategory(c.id).some((x) => x.item_id === itemId))?.id ?? 'other';

  return {
    embeds: [baseEmbed('灰星巡礼録 | 武器図鑑', body.slice(0, 4000))],
    components: [
      selectMenu('weapon:cat', '系統に戻る', getWeaponBookCategories().slice(0, 25).map((c) => ({
        label: c.label.slice(0, 100), value: c.id,
      }))),
      selectMenu(`weapon:pick:${catId}`, '同系統の別武器', weaponsInCategory(catId).slice(0, 25).map((x) => ({
        label: x.name.slice(0, 100),
        value: x.item_id,
        description: x.rarity,
      }))),
    ],
  };
}

export function findWeaponCategoryId(itemId: string): string {
  for (const cat of getWeaponBookCategories()) {
    if (weaponsInCategory(cat.id).some((w) => w.item_id === itemId)) return cat.id;
  }
  return 'other';
}
