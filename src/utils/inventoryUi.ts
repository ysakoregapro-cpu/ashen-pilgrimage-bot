import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { getDb } from '../db/database';
import { baseEmbed, selectMenu } from './embeds';
import type { UiPayload } from './townUi';
import { inventorySummaryEmbed } from './townUi';
import { nextActionButtons } from './nextActionButtons';

function detailOpenButton(context: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`detail:open:${context}`).setLabel('品の詳細').setStyle(ButtonStyle.Secondary),
  );
}

export const INVENTORY_PAGE_SIZE = 25;

export type InventoryCategory = 'all' | 'equipment' | 'consumable' | 'material';

export type InventoryListItem = {
  id: number;
  name: string;
  rarity: string;
  category: string;
  quantity: number;
  upgrade_level: number;
  src_level: number;
  is_equipped: number;
};

const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  all: 'すべて',
  equipment: '装備',
  consumable: '消耗品',
  material: '素材',
};

type InventoryRow = InventoryListItem & { is_pending_reward: number };

function filterByCategory(rows: InventoryRow[], category: InventoryCategory): InventoryRow[] {
  if (category === 'all') return rows;
  if (category === 'equipment') return rows.filter((i) => i.category === 'equipment');
  if (category === 'consumable') return rows.filter((i) => i.category === 'consumable');
  return rows.filter((i) => i.category !== 'equipment' && i.category !== 'consumable');
}

export function getPendingInventoryCount(userId: string): number {
  const row = getDb().prepare(
    'SELECT COUNT(*) AS c FROM player_inventory WHERE user_id = ? AND is_pending_reward = 1',
  ).get(userId) as { c: number };
  return row.c;
}

export function getInventoryListItems(
  userId: string,
  opts?: { includePending?: boolean; category?: InventoryCategory; page?: number; pageSize?: number },
): { items: InventoryListItem[]; total: number; page: number; pageSize: number; totalPages: number } {
  const pageSize = opts?.pageSize ?? INVENTORY_PAGE_SIZE;
  const page = Math.max(0, opts?.page ?? 0);
  const category = opts?.category ?? 'all';

  let rows = getDb().prepare(`
    SELECT pi.id, i.name, i.rarity, i.category, pi.quantity, pi.upgrade_level, pi.src_level,
      pi.is_equipped, pi.is_pending_reward
    FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ?
    ORDER BY i.category, i.rarity DESC, i.name
  `).all(userId) as InventoryRow[];

  if (!opts?.includePending) rows = rows.filter((r) => !r.is_pending_reward);
  rows = filterByCategory(rows, category);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  const items = rows.slice(start, start + pageSize).map(({ is_pending_reward: _, ...rest }) => rest);

  return { items, total, page: safePage, pageSize, totalPages };
}

function itemSelectDescription(i: InventoryListItem): string {
  return `[${i.rarity}] ${i.category}${i.quantity > 1 ? ` x${i.quantity}` : ''}${i.is_equipped ? ' 装備中' : ''}`.slice(0, 100);
}

function buildCategoryFilterRow(totalAll: number, activeCategory: InventoryCategory): ActionRowBuilder<ButtonBuilder> | null {
  if (totalAll <= INVENTORY_PAGE_SIZE) return null;
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const cat of ['all', 'equipment', 'consumable', 'material'] as const) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`inventory:cat:${cat}`)
        .setLabel(CATEGORY_LABELS[cat])
        .setStyle(cat === activeCategory ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }
  return row;
}

function buildPageNavRow(page: number, totalPages: number, category: InventoryCategory): ActionRowBuilder<ButtonBuilder> | null {
  if (totalPages <= 1) return null;
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (page > 0) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`inventory:page:${page - 1}:${category}`)
        .setLabel('前のページ')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('inventory:page:noop')
      .setLabel(`${page + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );
  if (page < totalPages - 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`inventory:page:${page + 1}:${category}`)
        .setLabel('次のページ')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  return row;
}

function buildInventoryComponents(
  userId: string,
  page: number,
  category: InventoryCategory,
  selectId: string,
  selectPlaceholder: string,
  backButtons: ActionRowBuilder<MessageActionRowComponentBuilder>[],
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const { items, totalPages } = getInventoryListItems(userId, { page, category });
  const { total: totalAll } = getInventoryListItems(userId, { page: 0, pageSize: 1 });

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  const catRow = buildCategoryFilterRow(totalAll, category);
  if (catRow) components.push(catRow);

  if (items.length) {
    components.push(selectMenu(selectId, selectPlaceholder, items.map((i) => ({
      label: i.name.slice(0, 100),
      value: String(i.id),
      description: itemSelectDescription(i),
    }))));
  }

  const pageRow = buildPageNavRow(page, totalPages, category);
  if (pageRow) components.push(pageRow);

  return [...components, ...backButtons];
}

export function buildInventorySummaryText(userId: string): string {
  const pendingCount = getPendingInventoryCount(userId);
  const eq = getInventoryListItems(userId, { category: 'equipment' }).total;
  const con = getInventoryListItems(userId, { category: 'consumable' }).total;
  const mat = getInventoryListItems(userId, { category: 'material' }).total;
  const total = eq + con + mat;

  if (total === 0 && pendingCount === 0) return '所持品はまだない。';

  const lines: string[] = [
    `装備 ${eq} / 消耗品 ${con} / 素材 ${mat}（表示 ${total} 件）`,
  ];
  if (pendingCount > 0) {
    lines.push(`※ 道中の品 ${pendingCount} 点 — 町に戻ると受け取れます`);
  }

  const preview = getInventoryListItems(userId, { page: 0, pageSize: 15 }).items;
  if (preview.length) {
    lines.push('', preview.map((i) => {
      const upg = i.src_level > 0 ? ` Src+${i.src_level}` : i.upgrade_level > 0 ? ` +${i.upgrade_level}` : '';
      const qty = i.quantity > 1 ? ` x${i.quantity}` : '';
      return `${i.name}${qty}${upg}${i.is_equipped ? '（装備中）' : ''}`;
    }).join('\n'));
    if (total > 15) lines.push(`…他 ${total - 15} 件`);
  }

  return lines.join('\n');
}

export function buildInventoryView(userId: string, page = 0, category: InventoryCategory = 'all'): UiPayload {
  const { total } = getInventoryListItems(userId, { page, category });
  if (total === 0) {
    return {
      embeds: [inventorySummaryEmbed(buildInventorySummaryText(userId))],
      components: nextActionButtons('inventory'),
    };
  }

  return {
    embeds: [inventorySummaryEmbed(buildInventorySummaryText(userId))],
    components: buildInventoryComponents(
      userId,
      page,
      category,
      'detail:inv',
      '詳細を見る品',
      [detailOpenButton('inventory'), ...nextActionButtons('inventory')],
    ),
  };
}

export function buildInventoryPickView(userId: string, page = 0, category: InventoryCategory = 'all'): UiPayload {
  const { total } = getInventoryListItems(userId, { page, category });
  if (!total) {
    return { embeds: [baseEmbed('所持品', '詳細を見る品がありません。')], components: nextActionButtons('inventory') };
  }

  return {
    embeds: [baseEmbed('所持品の詳細', '品を選ぶと性能・入手・用途を確認できます。')],
    components: buildInventoryComponents(
      userId,
      page,
      category,
      'detail:inv',
      '詳細を見る品',
      nextActionButtons('inventory'),
    ),
  };
}
