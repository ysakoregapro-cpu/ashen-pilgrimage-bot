/** Phase2.6/2.7 — ヴァルハラ徽章交換テーブル */

import { AFFIX_SLOT_PROTECT_ID, SILENT_PAGE_ID, UR_LOTTERY_SHARD_ID, VALHALLA_EMBLEM_ID } from './valhallaRewardMaster';

export type ValhallaExchangeEntry = {
  exchange_id: string;
  cost_valhalla_emblem: number;
  cost_silent_page: number;
  receive_type: 'material' | 'equipment_box' | 'future_feature';
  receive_item_id: string;
  receive_item_name: string;
  receive_amount: number;
  notes: string;
  ui_implemented: boolean;
  currently_available: boolean;
};

export const VALHALLA_EXCHANGE_TABLE: ValhallaExchangeEntry[] = [
  { exchange_id: 'vex_repair_premium', cost_valhalla_emblem: 10, cost_silent_page: 0, receive_type: 'material', receive_item_id: 'rep_deep_repair', receive_item_name: '深層修復材', receive_amount: 1, notes: '高級修復', ui_implemented: true, currently_available: true },
  { exchange_id: 'vex_awaken_mat', cost_valhalla_emblem: 20, cost_silent_page: 0, receive_type: 'material', receive_item_id: 'src_upg_core', receive_item_name: 'Src強化核', receive_amount: 1, notes: '覚醒素材', ui_implemented: true, currently_available: true },
  { exchange_id: 'vex_armor_random', cost_valhalla_emblem: 30, cost_silent_page: 0, receive_type: 'equipment_box', receive_item_id: 'box_valhalla_armor_random', receive_item_name: 'ヴァルハラ防具ランダム', receive_amount: 1, notes: 'Phase2.5 affix付き・直接抽選', ui_implemented: true, currently_available: true },
  { exchange_id: 'vex_accessory_random', cost_valhalla_emblem: 40, cost_silent_page: 0, receive_type: 'equipment_box', receive_item_id: 'box_valhalla_accessory_random', receive_item_name: 'ヴァルハラアクセランダム', receive_amount: 1, notes: 'Phase2.5 affix付き・直接抽選', ui_implemented: true, currently_available: true },
  { exchange_id: 'vex_armor_select', cost_valhalla_emblem: 80, cost_silent_page: 0, receive_type: 'equipment_box', receive_item_id: 'box_valhalla_armor_select', receive_item_name: 'ヴァルハラ防具選択', receive_amount: 1, notes: '部位選択・直接付与', ui_implemented: true, currently_available: true },
  { exchange_id: 'vex_accessory_select', cost_valhalla_emblem: 120, cost_silent_page: 0, receive_type: 'equipment_box', receive_item_id: 'box_valhalla_accessory_select', receive_item_name: 'ヴァルハラアクセ選択', receive_amount: 1, notes: '部位選択・直接付与', ui_implemented: true, currently_available: true },
  { exchange_id: 'vex_mana_valhalla', cost_valhalla_emblem: 8, cost_silent_page: 0, receive_type: 'material', receive_item_id: 'cons_mana_valhalla', receive_item_name: 'ヴァルハラの青霊薬', receive_amount: 1, notes: 'MP170回復・周回保険', ui_implemented: true, currently_available: true },
  { exchange_id: 'vex_ur_lottery', cost_valhalla_emblem: 150, cost_silent_page: 3, receive_type: 'future_feature', receive_item_id: UR_LOTTERY_SHARD_ID, receive_item_name: 'UR抽選素材', receive_amount: 1, notes: '無答の頁3枚追加', ui_implemented: false, currently_available: false },
  { exchange_id: 'vex_affix_reroll', cost_valhalla_emblem: 200, cost_silent_page: 0, receive_type: 'future_feature', receive_item_id: 'mat_affix_reroll_assist', receive_item_name: '特性再抽選補助素材', receive_amount: 1, notes: '将来再抽選UI', ui_implemented: false, currently_available: false },
  { exchange_id: 'vex_affix_protect', cost_valhalla_emblem: 300, cost_silent_page: 1, receive_type: 'future_feature', receive_item_id: AFFIX_SLOT_PROTECT_ID, receive_item_name: '特性1枠保護素材', receive_amount: 1, notes: '無答の頁1枚追加', ui_implemented: false, currently_available: false },
];

export const SILENT_PAGE_USAGE: Array<{ use: string; cost_pages: string; implemented: boolean; notes: string }> = [
  { use: 'Src武器最終段階強化', cost_pages: '1〜2枚', implemented: false, notes: '将来Phase' },
  { use: 'UR装備最終覚醒/上限突破', cost_pages: '1枚', implemented: false, notes: '将来Phase' },
  { use: '防具/アクセ特性再抽選・1枠保護', cost_pages: '1枚', implemented: false, notes: '交換所vex_affix_protectと連動' },
  { use: 'UR抽選箱', cost_pages: '3枚+徽章150', implemented: false, notes: '交換所vex_ur_lottery' },
  { use: '上位レイド解放', cost_pages: '初回1枚', implemented: false, notes: '将来Phase' },
];

export function getEmblemItemId(): string {
  return VALHALLA_EMBLEM_ID;
}

export function getUiAvailableExchanges(): ValhallaExchangeEntry[] {
  return VALHALLA_EXCHANGE_TABLE.filter((e) => e.ui_implemented && e.currently_available);
}

export function getExchangeById(exchangeId: string): ValhallaExchangeEntry | undefined {
  return VALHALLA_EXCHANGE_TABLE.find((e) => e.exchange_id === exchangeId);
}
