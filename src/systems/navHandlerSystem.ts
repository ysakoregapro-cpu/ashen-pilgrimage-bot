import { buildEquipSlotSelectView } from './equipmentSystem';
import { buildPrepSlotSelectComponents } from './prepSystem';
import { buildUpgradeSelectPayload } from './upgradeConfirmSystem';
import { buildExploreList, buildTownHub } from './townActionSystem';
import { getFacility } from './facilitySystem';
import { detailOpenButton } from './itemDetailSystem';
import { parseUpgradeBackPayload } from '../utils/navigationComponents';
import type { UpgradeActionKind } from '../utils/nextActionButtons';
import type { UiPayload } from '../utils/townUi';
import { townHubEmbed } from '../utils/townUi';
import { selectMenu } from '../utils/embeds';
import { buildConfirmNavigationRows, appendSelectNavigation } from '../utils/navigationComponents';
import { baseEmbed } from '../utils/embeds';
import { getShopCatalog } from './shopSystem';
import { getCurrentTown } from './townSystem';
import { requirePlayer } from './playerSystem';
import { calcMaxBuyable } from './shopSystem';
import type { EquipmentSlot } from '../types';
import { SLOT_LABELS } from '../types';

/** Parse `nav:back:{context}:{payload}` from full custom_id (session-stripped). */
export function parseNavBackId(base: string): { context: string; payload: string } | null {
  if (!base.startsWith('nav:back:')) return null;
  const rest = base.slice('nav:back:'.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return { context: rest, payload: '' };
  return { context: rest.slice(0, sep), payload: rest.slice(sep + 1) };
}

export function buildNavBackPayload(userId: string, base: string): UiPayload | null {
  const parsed = parseNavBackId(base);
  if (!parsed) return null;

  if (parsed.context === 'explore' && parsed.payload === 'list') {
    return buildExploreList(userId);
  }

  if (parsed.context === 'travel') {
    return buildTownHub(userId);
  }

  if (parsed.context === 'detail' && parsed.payload === 'inventory') {
    const { buildInventoryView } = require('../utils/inventoryUi') as typeof import('../utils/inventoryUi');
    return buildInventoryView(userId);
  }

  if (parsed.context === 'detail' && parsed.payload.startsWith('shop_')) {
    const mode = parsed.payload === 'shop_buy' ? 'buy' : 'sell';
    const town = getCurrentTown(userId) as { id: string } | undefined;
    const { buildShopDetailPickView } = require('./itemDetailSystem') as typeof import('./itemDetailSystem');
    return buildShopDetailPickView(userId, town?.id ?? 'start_starfield', mode);
  }

  if (parsed.context === 'weapon' && parsed.payload === 'cat') {
    const { buildWeaponCategoryView } = require('../commands/weapon') as typeof import('../commands/weapon');
    return buildWeaponCategoryView();
  }

  if (parsed.context === 'armor' && parsed.payload === 'cat') {
    const { buildArmorCategoryView } = require('../commands/armor') as typeof import('../commands/armor');
    return buildArmorCategoryView();
  }

  if (parsed.context === 'upgrade') {
    const up = parseUpgradeBackPayload(parsed.payload);
    if (!up) return null;
    return buildUpgradeSelectPayload(userId, up.action, up.facilityId);
  }

  if (parsed.context === 'equip') {
    const slot = parsed.payload as EquipmentSlot;
    const view = buildEquipSlotSelectView(userId, slot, 0, { customIdPrefix: 'equip' });
    return {
      embeds: [baseEmbed('装備変更', view.embedText)],
      components: view.components,
    };
  }

  if (parsed.context === 'prep') {
    const slot = parsed.payload as EquipmentSlot;
    return {
      embeds: [townHubEmbed('装備変更', `**${SLOT_LABELS[slot] ?? slot}** の装備候補`)],
      components: buildPrepSlotSelectComponents(userId, slot),
    };
  }

  if (parsed.context === 'shop' && parsed.payload.startsWith('buy:')) {
    const facId = parsed.payload.slice('buy:'.length);
    const town = getCurrentTown(userId) as { id: string } | undefined;
    const catalog = getShopCatalog(town?.id ?? 'start_starfield').slice(0, 25);
    return {
      embeds: [townHubEmbed(getFacility(facId)?.name ?? '店', '何を買いますか？')],
      components: catalog.length ? appendSelectNavigation([
        selectMenu('shop:buy', '品を選ぶ', catalog.map((c) => ({
          label: c.name, value: c.item_id, description: `${c.buy_price}G`,
        }))),
        selectMenu('detail:shop', '商品詳細', catalog.map((c) => ({
          label: c.name, value: c.item_id, description: `${c.buy_price}G [${c.rarity}]`.slice(0, 100),
        }))),
        detailOpenButton('shop_buy'),
      ], 'shop', `buy:${facId}`) : [],
    };
  }

  if (parsed.context === 'shop' && parsed.payload.startsWith('sell:')) {
    const facId = parsed.payload.slice('sell:'.length);
    const { getSellableInventory } = require('./shopSystem') as typeof import('./shopSystem');
    const items = getSellableInventory(userId);
    return {
      embeds: [townHubEmbed(getFacility(facId)?.name ?? '店', '何を売りますか？')],
      components: items.length ? appendSelectNavigation([
        selectMenu('shop:sell', '売る品を選ぶ', items.slice(0, 25).map((i) => ({
          label: i.name, value: String(i.id), description: `[${i.rarity}] x${i.quantity}`,
        }))),
        selectMenu('detail:inv', '詳細を見る', items.slice(0, 25).map((i) => ({
          label: i.name, value: String(i.id), description: i.rarity,
        }))),
        detailOpenButton('shop_sell'),
      ], 'shop', `sell:${facId}`) : [],
    };
  }

  if (parsed.context === 'shop' && parsed.payload.startsWith('buy_qty:')) {
    const itemId = parsed.payload.slice('buy_qty:'.length);
    const town = getCurrentTown(userId) as { id: string } | undefined;
    const townId = town?.id ?? 'start_starfield';
    const entry = getShopCatalog(townId).find((c) => c.item_id === itemId);
    if (!entry) return null;
    const player = requirePlayer(userId);
    const maxBuy = calcMaxBuyable(player.gold, entry.buy_price);
    const opts = [
      { label: '1個', value: '1' },
      { label: '3個', value: '3' },
      { label: '5個', value: '5' },
      { label: '10個', value: '10' },
      { label: '買えるだけ', value: String(maxBuy) },
    ].filter((o) => Number(o.value) >= 1 && Number(o.value) <= maxBuy).slice(0, 25);
    return {
      embeds: [baseEmbed('購入数を選ぶ', [
        `**${entry.name}**`,
        `単価: ${entry.buy_price}G`,
        `所持金: ${player.gold}G`,
      ].join('\n'))],
      components: [selectMenu(`shop:buy_qty:${itemId}`, '購入数', opts)],
    };
  }

  return buildTownHub(userId);
}

export function buildShopBuyConfirmPayload(userId: string, itemId: string, facilityId: string): UiPayload | null {
  const town = getCurrentTown(userId) as { id: string } | undefined;
  const townId = town?.id ?? 'start_starfield';
  const entry = getShopCatalog(townId).find((c) => c.item_id === itemId);
  if (!entry) return null;
  const player = requirePlayer(userId);
  return {
    embeds: [baseEmbed('購入確認', [
      `**${entry.name}** ×1`,
      `価格: ${entry.buy_price}G`,
      `所持金: ${player.gold}G`,
      '',
      '購入しますか？',
    ].join('\n'))],
    components: buildConfirmNavigationRows({
      confirmId: `shop:confirm_buy:${itemId}:1`,
      confirmLabel: '購入する',
      backContext: 'shop',
      backPayload: `buy:${facilityId}`,
    }),
  };
}

export function buildShopBuyQtyConfirmPayload(userId: string, itemId: string, qty: number): UiPayload | null {
  const town = getCurrentTown(userId) as { id: string } | undefined;
  const townId = town?.id ?? 'start_starfield';
  const entry = getShopCatalog(townId).find((c) => c.item_id === itemId);
  if (!entry) return null;
  const player = requirePlayer(userId);
  const total = entry.buy_price * qty;
  return {
    embeds: [baseEmbed('購入確認', [
      `**${entry.name}** ×${qty}`,
      `合計: ${total}G`,
      `所持金: ${player.gold}G`,
      '',
      '購入しますか？',
    ].join('\n'))],
    components: buildConfirmNavigationRows({
      confirmId: `shop:confirm_buy:${itemId}:${qty}`,
      confirmLabel: '購入する',
      backContext: 'shop',
      backPayload: `buy_qty:${itemId}`,
    }),
  };
}
