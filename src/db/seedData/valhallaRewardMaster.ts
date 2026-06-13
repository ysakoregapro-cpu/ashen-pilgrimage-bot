/** Phase2.6 — ヴァルハラボス周回報酬テーブル */

import {
  OLD_KING_SERIES_ACCESSORY_IDS,
  OLD_KING_SERIES_ARMOR_IDS,
  VALHALLA_SERIES_ACCESSORY_IDS,
  VALHALLA_SERIES_ARMOR_IDS,
} from './valhallaSeriesDropMaster';

export const VALHALLA_EMBLEM_ID = 'valhalla_emblem';
export const SILENT_PAGE_ID = 'boss_silent_page';
export const UR_LOTTERY_SHARD_ID = 'mat_ur_lottery_shard';
export const AFFIX_REROLL_ASSIST_ID = 'mat_affix_reroll_assist';
export const AFFIX_SLOT_PROTECT_ID = 'mat_affix_slot_protect';

export const VALHALLA_BOSS_MONSTER_IDS = [
  'mon_machina_echo',
  'mon_old_king_shadow',
  'mon_deep_core_boss',
] as const;

export type ValhallaBossId = typeof VALHALLA_BOSS_MONSTER_IDS[number];

export const VALHALLA_BOSS_REMATCH_META: Record<ValhallaBossId, { label: string; areaHint: string }> = {
  mon_machina_echo: { label: 'マキナの残響', areaHint: 'マキナの残響区画' },
  mon_old_king_shadow: { label: '旧王の影', areaHint: '旧王の玉座' },
  mon_deep_core_boss: { label: '深層炉心核', areaHint: '深層炉心' },
};

export const VALHALLA_FIRST_CLEAR_REWARDS = {
  silentPage: 1,
  emblem: 10,
  expMin: 5000,
  expMax: 8000,
  jobExpMin: 2500,
  jobExpMax: 4000,
  goldMin: 5000,
  goldMax: 8000,
  storyFlagPrefix: 'valhalla_boss_first_clear',
  achievementFlagPrefix: 'achievement_valhalla_boss',
} as const;

export const VALHALLA_REPEAT_REWARDS = {
  emblemMin: 4,
  emblemMax: 8,
  expMin: 2500,
  expMax: 4000,
  jobExpMin: 1200,
  jobExpMax: 2000,
  goldMin: 2500,
  goldMax: 5000,
  materialCountMin: 1,
  materialCountMax: 3,
  armorRateMin: 0.15,
  armorRateMax: 0.25,
  accessoryRateMin: 0.08,
  accessoryRateMax: 0.15,
  silentPageRate: 0.04,
  urLotteryRateMin: 0.01,
  urLotteryRateMax: 0.03,
  affixRerollAssistRateMin: 0.005,
  affixRerollAssistRateMax: 0.015,
  oldKingArmorRateMin: 0.03,
  oldKingArmorRateMax: 0.06,
  oldKingAccessoryRateMin: 0.01,
  oldKingAccessoryRateMax: 0.03,
} as const;

/** 初回/ヴァルハラ本命枠（旧王は別レート） */
export const VALHALLA_SERIES_ARMOR_DROP_IDS = VALHALLA_SERIES_ARMOR_IDS;
export const VALHALLA_SERIES_ACCESSORY_DROP_IDS = VALHALLA_SERIES_ACCESSORY_IDS;
export const OLD_KING_SERIES_ARMOR_DROP_IDS = OLD_KING_SERIES_ARMOR_IDS;
export const OLD_KING_SERIES_ACCESSORY_DROP_IDS = OLD_KING_SERIES_ACCESSORY_IDS;

/** @deprecated 互換 — ヴァルハラ+旧王（初回以外は個別レート推奨） */
export const VALHALLA_ARMOR_DROP_IDS = [
  ...VALHALLA_SERIES_ARMOR_DROP_IDS,
  ...OLD_KING_SERIES_ARMOR_DROP_IDS,
] as const;

export const VALHALLA_ACCESSORY_DROP_IDS = [
  ...VALHALLA_SERIES_ACCESSORY_DROP_IDS,
  ...OLD_KING_SERIES_ACCESSORY_DROP_IDS,
  'acc_raid_random',
] as const;

export const VALHALLA_REPEAT_MATERIAL_POOL: Array<{ itemId: string; weight: number }> = [
  { itemId: 'rep_deep_repair', weight: 18 },
  { itemId: 'upg_fine_stone', weight: 16 },
  { itemId: 'upg_deep_core_stone', weight: 12 },
  { itemId: 'mat_valhalla_plate', weight: 14 },
  { itemId: 'src_upg_core', weight: 10 },
  { itemId: 'raid_deep_core', weight: 12 },
  { itemId: 'raid_sky_core', weight: 10 },
  { itemId: 'upg_rare_stone', weight: 8 },
];

export type ValhallaRewardRow = {
  reward_context: string;
  first_clear_or_repeat: 'first_clear' | 'repeat';
  reward_type: string;
  item_id: string;
  item_name: string;
  amount_min: number;
  amount_max: number;
  drop_rate: string;
  notes: string;
};

export function buildValhallaRewardAuditRows(): ValhallaRewardRow[] {
  const fc = VALHALLA_FIRST_CLEAR_REWARDS;
  const rp = VALHALLA_REPEAT_REWARDS;
  const soloRows: ValhallaRewardRow[] = [
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'first_clear', reward_type: 'currency', item_id: VALHALLA_EMBLEM_ID, item_name: 'ヴァルハラ徽章', amount_min: fc.emblem, amount_max: fc.emblem, drop_rate: '100%', notes: '確定' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'first_clear', reward_type: 'boss_material', item_id: SILENT_PAGE_ID, item_name: '無答の守護者の頁', amount_min: fc.silentPage, amount_max: fc.silentPage, drop_rate: '100%', notes: '確定' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'first_clear', reward_type: 'equipment', item_id: 'valhalla_armor_or_accessory', item_name: 'ヴァルハラ防具/アクセ', amount_min: 1, amount_max: 1, drop_rate: '100%', notes: 'ランダム1件・Phase2.5 affix' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'first_clear', reward_type: 'exp', item_id: '(player_exp)', item_name: '経験値', amount_min: fc.expMin, amount_max: fc.expMax, drop_rate: '100%', notes: '' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'first_clear', reward_type: 'job_exp', item_id: '(job_exp)', item_name: 'Job経験値', amount_min: fc.jobExpMin, amount_max: fc.jobExpMax, drop_rate: '100%', notes: '' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'first_clear', reward_type: 'gold', item_id: '(gold)', item_name: 'ゴールド', amount_min: fc.goldMin, amount_max: fc.goldMax, drop_rate: '100%', notes: '' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'repeat', reward_type: 'currency', item_id: VALHALLA_EMBLEM_ID, item_name: 'ヴァルハラ徽章', amount_min: rp.emblemMin, amount_max: rp.emblemMax, drop_rate: '100%', notes: '確定' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'repeat', reward_type: 'exp', item_id: '(player_exp)', item_name: '経験値', amount_min: rp.expMin, amount_max: rp.expMax, drop_rate: '100%', notes: '' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'repeat', reward_type: 'job_exp', item_id: '(job_exp)', item_name: 'Job経験値', amount_min: rp.jobExpMin, amount_max: rp.jobExpMax, drop_rate: '100%', notes: '' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'repeat', reward_type: 'gold', item_id: '(gold)', item_name: 'ゴールド', amount_min: rp.goldMin, amount_max: rp.goldMax, drop_rate: '100%', notes: '' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'repeat', reward_type: 'material', item_id: '(pool)', item_name: '高級素材', amount_min: rp.materialCountMin, amount_max: rp.materialCountMax, drop_rate: '100%', notes: 'rep/upg/valhalla素材' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'repeat', reward_type: 'equipment', item_id: '(valhalla_armor)', item_name: 'ヴァルハラ防具', amount_min: 1, amount_max: 1, drop_rate: '15-25%', notes: 'Phase2.5 affix' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'repeat', reward_type: 'equipment', item_id: '(valhalla_accessory)', item_name: 'ヴァルハラアクセ', amount_min: 1, amount_max: 1, drop_rate: '8-15%', notes: 'Phase2.5 affix' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'repeat', reward_type: 'equipment', item_id: '(old_king_armor)', item_name: '旧王防具', amount_min: 1, amount_max: 1, drop_rate: '3-6%', notes: '希少上振れ・Phase2.5 affix' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'repeat', reward_type: 'equipment', item_id: '(old_king_accessory)', item_name: '旧王アクセ', amount_min: 1, amount_max: 1, drop_rate: '1-3%', notes: '希少上振れ・Phase2.5 affix' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'repeat', reward_type: 'boss_material', item_id: SILENT_PAGE_ID, item_name: '無答の守護者の頁', amount_min: 1, amount_max: 1, drop_rate: `${rp.silentPageRate * 100}%`, notes: '再戦4%設計' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'repeat', reward_type: 'boss_material', item_id: UR_LOTTERY_SHARD_ID, item_name: 'UR抽選の欠片', amount_min: 1, amount_max: 1, drop_rate: '1-3%', notes: '将来UR抽選' },
    { reward_context: 'valhalla_boss', first_clear_or_repeat: 'repeat', reward_type: 'boss_material', item_id: AFFIX_REROLL_ASSIST_ID, item_name: '特性再抽選の触媒', amount_min: 1, amount_max: 1, drop_rate: '0.5-1.5%', notes: '将来再抽選' },
    { reward_context: 'silent_guardian', first_clear_or_repeat: 'first_clear', reward_type: 'boss_material', item_id: SILENT_PAGE_ID, item_name: '無答の守護者の頁', amount_min: 1, amount_max: 1, drop_rate: '100%', notes: 'dropBalanceMaster BOSS_VICTORY' },
    { reward_context: 'silent_guardian', first_clear_or_repeat: 'repeat', reward_type: 'boss_material', item_id: SILENT_PAGE_ID, item_name: '無答の守護者の頁', amount_min: 1, amount_max: 1, drop_rate: '4%', notes: 'dropBalanceMaster rematchRate' },
  ];
  const coopRows = soloRows
    .filter((r) => r.reward_context === 'valhalla_boss')
    .map((r) => ({
      ...r,
      reward_context: 'valhalla_coop_boss',
      notes: r.notes ? `${r.notes} / 共闘個別報酬` : '共闘個別報酬',
    }));
  return [...soloRows, ...coopRows];
}

export function isValhallaBossMonster(monsterId: string): monsterId is ValhallaBossId {
  return (VALHALLA_BOSS_MONSTER_IDS as readonly string[]).includes(monsterId);
}
