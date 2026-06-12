import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { errorEmbed } from './embeds';
import type { UiPayload } from './townUi';

export type NextActionContext =
  | 'job_done'
  | 'profile'
  | 'inventory'
  | 'equip'
  | 'equip_done'
  | 'explore_result'
  | 'victory'
  | 'defeat'
  | 'npc_talk'
  | 'facility'
  | 'upgrade'
  | 'upgrade_done'
  | 'shop_buy_done'
  | 'shop_sell_done'
  | 'market_done'
  | 'boss_rematch_done'
  | 'guide'
  | 'story_event'
  | 'error'
  | 'explore_area'
  | 'item_detail'
  | 'coop_raid_result'
  | 'coop_rescue_result'
  | 'generic';

export type UpgradeActionKind =
  | 'enhance' | 'repair' | 'dismantle' | 'awaken' | 'src' | 'manifest' | 'kai_unique' | 'kai_src';

export type NextActionExtra = {
  npcId?: string;
  facilityId?: string;
  areaId?: string;
  slot?: string;
  detailContext?: 'inventory' | 'equip' | 'shop_buy' | 'shop_sell' | 'skill';
  inventoryId?: number;
  itemId?: string;
  qty?: number;
  monsterId?: string;
  upgradeAction?: UpgradeActionKind;
};

const UPGRADE_MENU_LABEL: Record<UpgradeActionKind, string> = {
  enhance: '強化メニューに戻る',
  repair: '修理メニューに戻る',
  dismantle: '分解メニューに戻る',
  awaken: '覚醒メニューに戻る',
  src: 'Src強化メニューに戻る',
  manifest: 'Src発現メニューに戻る',
  kai_unique: '伝承メニューに戻る',
  kai_src: '変質メニューに戻る',
};

function btn(id: string, label: string, style: ButtonStyle): ButtonBuilder {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}

function row(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
}

function exploreAfterActionRows(extra?: NextActionExtra): ActionRowBuilder<ButtonBuilder>[] {
  const areaId = extra?.areaId;
  const primary = areaId
    ? [
        btn(`explore:repeat:${areaId}`, 'もう一度探索', ButtonStyle.Success),
        btn('town:explore', '探索先を選ぶ', ButtonStyle.Secondary),
        btn('town:home', '町へ戻る', ButtonStyle.Secondary),
        btn('flow:inventory', '所持品', ButtonStyle.Secondary),
      ]
    : [
        btn('town:explore', '探索へ向かう', ButtonStyle.Success),
        btn('town:home', '町へ戻る', ButtonStyle.Secondary),
        btn('flow:inventory', '所持品', ButtonStyle.Secondary),
      ];
  return [
    row(...primary),
    row(
      btn('flow:equip', '身支度', ButtonStyle.Secondary),
      btn('detail:open:inventory', '品の詳細', ButtonStyle.Secondary),
    ),
  ];
}

function upgradeDoneRows(extra?: NextActionExtra): ActionRowBuilder<ButtonBuilder>[] {
  const fac = extra?.facilityId ?? 'unknown';
  const action = extra?.upgradeAction ?? 'enhance';
  const invId = extra?.inventoryId;
  const primary: ButtonBuilder[] = [];

  if (invId && action === 'enhance') {
    primary.push(btn(`upgrade:repeat:enhance:${invId}`, '同じ装備を強化', ButtonStyle.Success));
  }
  if (invId && action === 'awaken') {
    primary.push(btn(`upgrade:repeat:awaken:${invId}`, '同じ装備を覚醒', ButtonStyle.Success));
  }
  if (invId && action === 'repair') {
    primary.push(btn(`upgrade:repeat:repair:${invId}`, '同じ装備を修理', ButtonStyle.Secondary));
  }

  primary.push(btn(`facility:act:${fac}:${action}`, UPGRADE_MENU_LABEL[action], ButtonStyle.Primary));
  primary.push(btn(`facility:view:${fac}`, '施設に戻る', ButtonStyle.Secondary));
  primary.push(btn('town:home', '町へ戻る', ButtonStyle.Secondary));
  return [
    row(...primary.slice(0, 4)),
    row(btn('town:explore', '探索へ向かう', ButtonStyle.Success)),
  ];
}

export function nextActionButtons(
  context: NextActionContext,
  extra?: NextActionExtra,
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
          btn('flow:profile', '旅の記録を見る', ButtonStyle.Primary),
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
          btn('flow:inventory', '所持品を見る', ButtonStyle.Secondary),
          btn('detail:open:inventory', '品の詳細', ButtonStyle.Secondary),
          btn('flow:equip', '身支度', ButtonStyle.Secondary),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
        ),
        row(btn('town:explore', '探索へ向かう', ButtonStyle.Success)),
      ];

    case 'equip':
      return [
        row(
          btn('prep:back:slots', '装備変更', ButtonStyle.Primary),
          btn('flow:equip', '身支度を見る', ButtonStyle.Secondary),
          btn('flow:profile', '旅の記録', ButtonStyle.Secondary),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
        ),
        row(btn('town:explore', '探索へ向かう', ButtonStyle.Success)),
      ];

    case 'equip_done': {
      const doneRow: ButtonBuilder[] = [];
      if (extra?.slot) {
        doneRow.push(btn(`prep:back:slot:${extra.slot}`, '同じ部位を変更', ButtonStyle.Secondary));
      }
      doneRow.push(
        btn('prep:back:slots', '装備変更に戻る', ButtonStyle.Primary),
        btn('flow:equip', '身支度へ戻る', ButtonStyle.Secondary),
        btn('town:home', '町へ戻る', ButtonStyle.Secondary),
      );
      return [row(...doneRow.slice(0, 4))];
    }

    case 'explore_result':
    case 'victory':
      return exploreAfterActionRows(extra);

    case 'defeat':
      return [
        row(
          btn('town:home', '町へ戻る', ButtonStyle.Primary),
          btn('flow:rescue', '救難を求める', ButtonStyle.Danger),
          btn('flow:equip', '身支度', ButtonStyle.Secondary),
          btn('guide:chapter:defeat', '敗北について聞く', ButtonStyle.Secondary),
        ),
      ];

    case 'coop_raid_result':
      return [
        row(
          btn('flow:raid', 'レイド募集へ', ButtonStyle.Primary),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
          btn('town:explore', '探索へ向かう', ButtonStyle.Success),
        ),
        row(
          btn('coop:recruit:raid', '再募集', ButtonStyle.Success),
          btn('flow:equip', '身支度', ButtonStyle.Secondary),
        ),
      ];

    case 'coop_rescue_result':
      return [
        row(
          btn('flow:rescue', '救難を再要請', ButtonStyle.Danger),
          btn('town:home', '町へ戻る', ButtonStyle.Primary),
          btn('town:explore', '探索へ向かう', ButtonStyle.Success),
        ),
        row(
          btn('flow:equip', '身支度', ButtonStyle.Secondary),
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
          btn(`facility:view:${extra?.facilityId ?? 'unknown'}`, '施設に戻る', ButtonStyle.Primary),
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
          btn(`facility:view:${extra?.facilityId ?? 'unknown'}`, '工房に戻る', ButtonStyle.Primary),
          btn('flow:equip', '身支度', ButtonStyle.Secondary),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
          btn('flow:inventory', '所持品', ButtonStyle.Secondary),
        ),
        row(btn('town:explore', '探索へ向かう', ButtonStyle.Success)),
      ];

    case 'upgrade_done':
      return upgradeDoneRows(extra);

    case 'shop_buy_done': {
      const fac = extra?.facilityId ?? 'unknown';
      const itemId = extra?.itemId;
      const qty = extra?.qty ?? 1;
      const primary: ButtonBuilder[] = [];
      if (itemId) {
        primary.push(btn(`shop:repeat_buy:${itemId}:${qty}`, '同じ品を購入', ButtonStyle.Success));
      }
      primary.push(
        btn(`facility:act:${fac}:shop_buy`, '品を選ぶ', ButtonStyle.Secondary),
        btn(`facility:view:${fac}`, 'ショップに戻る', ButtonStyle.Secondary),
        btn('town:home', '町へ戻る', ButtonStyle.Secondary),
      );
      return [
        row(...primary.slice(0, 4)),
        row(btn('town:explore', '探索へ向かう', ButtonStyle.Success)),
      ];
    }

    case 'shop_sell_done': {
      const fac = extra?.facilityId ?? 'unknown';
      return [
        row(
          btn(`facility:act:${fac}:shop_sell`, '売る品を選ぶ', ButtonStyle.Primary),
          btn(`facility:view:${fac}`, 'ショップに戻る', ButtonStyle.Secondary),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
        ),
        row(btn('town:explore', '探索へ向かう', ButtonStyle.Success)),
      ];
    }

    case 'market_done': {
      const fac = extra?.facilityId ?? 'unknown';
      return [
        row(
          btn(`facility:act:${fac}:market_browse`, '出品を見る', ButtonStyle.Secondary),
          btn(`facility:act:${fac}:market_sell`, '出品する', ButtonStyle.Primary),
          btn(`facility:act:${fac}:market_my`, '自分の出品', ButtonStyle.Secondary),
          btn(`facility:view:${fac}`, '取引所に戻る', ButtonStyle.Secondary),
        ),
        row(btn('town:home', '町へ戻る', ButtonStyle.Secondary), btn('town:explore', '探索へ向かう', ButtonStyle.Success)),
      ];
    }

    case 'boss_rematch_done': {
      const fac = extra?.facilityId ?? 'unknown';
      const monsterId = extra?.monsterId;
      const primary: ButtonBuilder[] = [];
      if (monsterId) {
        primary.push(btn(`rematch:repeat:${monsterId}`, 'もう一度再戦', ButtonStyle.Success));
      }
      primary.push(
        btn(`facility:act:${fac}:boss_rematch`, '再戦メニューに戻る', ButtonStyle.Primary),
        btn('town:home', '町へ戻る', ButtonStyle.Secondary),
        btn('town:explore', '探索へ向かう', ButtonStyle.Success),
      );
      return [row(...primary.slice(0, 4))];
    }

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
        row(btn('town:guide', '巡礼手帳', ButtonStyle.Secondary)),
      ];

    case 'explore_area':
      return [
        row(
          btn(`flow:explore:${extra?.areaId ?? ''}`, '探索を開始する', ButtonStyle.Success),
          btn('nav:back:explore:list', 'ひとつ戻る', ButtonStyle.Secondary),
          btn('town:home', '街に戻る', ButtonStyle.Secondary),
        ),
      ];

    case 'item_detail': {
      const ctx = extra?.detailContext ?? 'inventory';
      const pickId = ctx === 'skill' ? 'detail:open:skill' : `detail:open:${ctx}`;
      const backId = ctx === 'equip'
        ? 'prep:back:slots'
        : ctx === 'skill'
          ? 'detail:open:skill'
          : ctx === 'shop_buy' || ctx === 'shop_sell'
            ? `facility:view:${extra?.facilityId ?? 'unknown'}`
            : 'flow:inventory';
      const backLabel = ctx === 'equip'
        ? '装備変更に戻る'
        : ctx === 'shop_buy' || ctx === 'shop_sell'
          ? '店に戻る'
          : ctx === 'skill'
            ? 'スキル一覧へ'
            : '所持品へ戻る';
      const rows = [
        row(
          btn(pickId, ctx === 'skill' ? '別の技を見る' : '別の品を見る', ButtonStyle.Primary),
          btn(backId, backLabel, ButtonStyle.Secondary),
          btn('town:home', '町へ戻る', ButtonStyle.Secondary),
        ),
      ];
      if (ctx === 'equip' && extra?.slot) {
        rows.unshift(row(btn(`prep:back:slot:${extra.slot}`, '同じ部位を変更', ButtonStyle.Secondary)));
      }
      return rows;
    }

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

export function errorRecoveryPayload(message: string): UiPayload {
  return {
    embeds: [errorEmbed(message)],
    components: nextActionButtons('error'),
  };
}

export type ButtonSpec = { id: string; label: string };

/** 検証スクリプト用 — post-action ボタンの custom_id / ラベル一覧 */
export function collectPostActionButtonSpecs(
  context: NextActionContext,
  extra?: NextActionExtra,
): ButtonSpec[] {
  return nextActionButtons(context, extra).flatMap((r) =>
    r.components.map((c) => {
      const data = c.data as { custom_id?: string; label?: string };
      return { id: data.custom_id ?? '', label: data.label ?? '' };
    }).filter((b) => b.id),
  );
}

export function collectPostActionButtonIds(context: NextActionContext, extra?: NextActionExtra): string[] {
  return collectPostActionButtonSpecs(context, extra).map((b) => b.id);
}
