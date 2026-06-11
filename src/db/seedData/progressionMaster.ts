/** Progression gates — when features become available in roadmap / UI */

export type FeatureKey =
  | 'blacksmith'
  | 'src_forge'
  | 'exchange'
  | 'raid'
  | 'valhalla'
  | 'prep_room'
  | 'market';

export type FeatureUnlockDef = {
  feature: FeatureKey;
  label: string;
  requiredFlag: string;
  requiredTown?: string;
  hintWhenLocked: string;
  hintWhenAvailable: string;
};

export const FEATURE_UNLOCKS: FeatureUnlockDef[] = [
  {
    feature: 'blacksmith',
    label: '鍛冶場',
    requiredFlag: 'chapter_completed:ch1_twilight',
    requiredTown: 'silver_mine',
    hintWhenLocked: '白銀鉱山街の鍛冶場（第二章以降）',
    hintWhenAvailable: '鍛冶場で装備を+1〜+3強化（粗い強化石）',
  },
  {
    feature: 'src_forge',
    label: '伝承の炉',
    requiredFlag: 'chapter_completed:ch2_silver',
    requiredTown: 'silver_mine',
    hintWhenLocked: '白銀の伝承の炉（第三章以降）',
    hintWhenAvailable: 'Src武器の発現・強化',
  },
  {
    feature: 'exchange',
    label: '取引所',
    requiredFlag: 'chapter_completed:prologue',
    requiredTown: 'start_starfield',
    hintWhenLocked: '巡礼者商会（序章クリア後）',
    hintWhenAvailable: '取引所で装備の売買',
  },
  {
    feature: 'raid',
    label: '共闘探索（レイド）',
    requiredFlag: 'chapter_completed:ch7_furnace',
    requiredTown: 'valhalla_fortress',
    hintWhenLocked: 'ヴァルハラ解放後',
    hintWhenAvailable: 'レイド募集・共闘報酬',
  },
  {
    feature: 'valhalla',
    label: 'ヴァルハラ',
    requiredFlag: 'chapter_completed:ch7_furnace',
    requiredTown: 'valhalla_fortress',
    hintWhenLocked: '深層炉クリア後に解放',
    hintWhenAvailable: '空中要塞ヴァルハラへ向かう',
  },
  {
    feature: 'prep_room',
    label: '身支度所',
    requiredFlag: 'start_complete',
    hintWhenLocked: '冒険開始後',
    hintWhenAvailable: '身支度所で装備確認',
  },
  {
    feature: 'market',
    label: '巡礼者マーケット',
    requiredFlag: 'chapter_completed:prologue',
    hintWhenLocked: '序章クリア後',
    hintWhenAvailable: '売店で回復薬・強化石を補充',
  },
];

/** Chapter → recommended level band for roadmap */
export const CHAPTER_LEVEL_BANDS: Record<string, { min: number; max: number; exploreHint: string }> = {
  prologue: { min: 1, max: 8, exploreHint: 'はじまりの星原でLv1〜6' },
  ch1_twilight: { min: 8, max: 15, exploreHint: '薄明の港周辺でLv8〜15' },
  ch2_silver: { min: 15, max: 25, exploreHint: '白銀坑道でLv15〜25' },
  ch3_mist: { min: 25, max: 35, exploreHint: '霧深き森でLv25〜35' },
  ch4_library: { min: 35, max: 45, exploreHint: '月下図書館でLv35〜45' },
  ch5_market: { min: 45, max: 55, exploreHint: '忘却地下市でLv45〜55' },
  ch6_hourglass: { min: 55, max: 65, exploreHint: '砂時計の都でLv55〜65' },
  ch7_furnace: { min: 65, max: 80, exploreHint: '深層炉でLv65〜80' },
  ch8_valhalla: { min: 80, max: 100, exploreHint: 'ヴァルハラでLv80〜100' },
};

/** Towns unlocked by story progression (for validation) */
export const STORY_TOWN_UNLOCKS: Record<string, string> = {
  'chapter_completed:prologue': 'twilight_port',
  'chapter_completed:ch1_twilight': 'silver_mine',
  'chapter_completed:ch2_silver': 'mist_forest',
  'chapter_completed:ch3_mist': 'moon_library',
  'chapter_completed:ch4_library': 'forgotten_market',
  'chapter_completed:ch5_market': 'hourglass_city',
  'chapter_completed:ch6_hourglass': 'deep_furnace_outpost',
  'chapter_completed:ch7_furnace': 'valhalla_fortress',
};

export const DEFAULT_UNLOCKED_TOWNS = ['start_starfield', 'old_road_village'];
