/** Phase2 job trio mapping, trial names, Uni materials per job */

export const JOB_TRIO_MAP: Record<string, { sub: string; advanced: string }> = {
  '剣士': { sub: '刃走り', advanced: '黄昏剣聖' },
  '重騎士': { sub: '城壁番', advanced: '白銀城塞騎士' },
  '狩人': { sub: '矢痕読み', advanced: '残響弓王' },
  '魔術師': { sub: '灰術士', advanced: '星灰大魔導' },
  '祈祷師': { sub: '灯守', advanced: '巡礼聖祈師' },
  '斥候': { sub: '影足', advanced: '影渡りの夜王' },
  '機工師': { sub: '歯車工', advanced: '深層機工卿' },
  '格闘士': { sub: '勁打者', advanced: '灰拳闘王' },
  '巡礼者': { sub: '繋ぎ手', advanced: '星巡の導き手' },
};

export const TRIAL_ENEMY_NAMES: Record<string, string> = {
  '剣士': '黄昏の現身',
  '重騎士': '白銀の現身',
  '狩人': '残響の現身',
  '魔術師': '星灰の現身',
  '祈祷師': '聖祈の現身',
  '斥候': '影渡りの現身',
  '機工師': '深層機工の現身',
  '格闘士': '灰拳の現身',
  '巡礼者': '星巡の現身',
};

export const SUB_JOB_UNLOCK_LEVEL = 20;
export const ADVANCED_JOB_UNLOCK_LEVEL = 70;

/** 現身の試練 — 2回目以降クリア時のGold報酬（挑戦料ではない） */
export const TRIAL_REPEAT_CLEAR_GOLD = 250;

/** 現身の試練 — 勝利時プレイヤーEXP（初回/再戦共通） */
export const TRIAL_VICTORY_EXP = 1;

export const UNI_JOB_MATERIALS: Record<string, { mat1: string; mat2: string; qty: number }> = {
  '剣士': { mat1: 'mat_twilight_blade_shard', mat2: 'mat_starfield_old_steel', qty: 2 },
  '重騎士': { mat1: 'mat_silver_castle_core', mat2: 'mat_old_furnace_hammer_core', qty: 2 },
  '狩人': { mat1: 'mat_echo_bowstring', mat2: 'mat_moon_arrowhead', qty: 2 },
  '魔術師': { mat1: 'mat_mist_lantern_stardust', mat2: 'mat_ash_star_magic_core', qty: 2 },
  '祈祷師': { mat1: 'mat_lampkeeper_holy_oil', mat2: 'mat_pilgrim_prayer_cloth', qty: 2 },
  '斥候': { mat1: 'mat_ash_mirror_fragment', mat2: 'mat_shadowstep_black_thread', qty: 2 },
  '機工師': { mat1: 'mat_deep_furnace_gear', mat2: 'mat_black_iron_powder_case', qty: 2 },
  '格闘士': { mat1: 'mat_black_fox_clawmark', mat2: 'mat_ash_fist_bone', qty: 2 },
};

/** 深層炉前哨基地 — Uni→Src（Kai伝承）素材の唯一ドロップ源 */
export const FURNACE_KEEPER_BOSS_ID = 'mon_furnace_keeper';

/** 再戦時: 素材ドロップ発生率 → 発生時は16種から均等1個 */
export const UNI_SRC_DROP_TRIGGER_RATE = 0.28;

export const UNI_SRC_MATERIAL_IDS: readonly string[] = (() => {
  const ids = new Set<string>();
  for (const req of Object.values(UNI_JOB_MATERIALS)) {
    ids.add(req.mat1);
    ids.add(req.mat2);
  }
  return [...ids].sort();
})();

export const UNI_SRC_MATERIAL_JOB_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [job, req] of Object.entries(UNI_JOB_MATERIALS)) {
    map[req.mat1] = job;
    map[req.mat2] = job;
  }
  return map;
})();

/** 監査用 — 実行時は uniSrcMaterialDropSystem の pooled drop を使用 */
export const PHASE2_UNI_MATERIAL_DROPS: Array<{ matId: string; monsterId: string; rate: number; label: string }> =
  UNI_SRC_MATERIAL_IDS.map((matId) => ({
    matId,
    monsterId: FURNACE_KEEPER_BOSS_ID,
    rate: UNI_SRC_DROP_TRIGGER_RATE / UNI_SRC_MATERIAL_IDS.length,
    label: '深層炉前哨・炉熱の番人',
  }));

export const SRC_FORGE_GOLD_COST = 5000;
export const SRC_FORGE_ECHO_QTY = 3;

export const UNDEVELOPED_TOWN_IDS = new Set([
  'prayer_hill', 'hollow_bell_town', 'buried_aqueduct', 'iron_snow_post',
]);

export const BASIC_JOB_DESCRIPTIONS: Record<string, string> = {
  '剣士': '剣で切り開く基本の戦士。攻撃力が高く、扱いやすい前衛職。\n対応サブジョブ：刃走り\n対応上級職：黄昏剣聖',
  '重騎士': '盾と鎧で道を守る重装職。HPと防御に優れるが、速度は低い。\n対応サブジョブ：城壁番\n対応上級職：白銀城塞騎士',
  '狩人': '弓で距離を保つ狩人。攻撃と速度のバランスに優れる。\n対応サブジョブ：矢痕読み\n対応上級職：残響弓王',
  '魔術師': '星の理を操る術士。HPと物理攻撃は低いが、魔力とMPに優れる。\n対応サブジョブ：灰術士\n対応上級職：星灰大魔導',
  '祈祷師': '祈りで旅を支える職。MPと魔力に優れ、支援に向く。\n対応サブジョブ：灯守\n対応上級職：巡礼聖祈師',
  '斥候': '影のように動く斥候。速度に優れ、先手を取りやすい。\n対応サブジョブ：影足\n対応上級職：影渡りの夜王',
  '機工師': '機構で戦場を組む技師。攻撃と魔力を併せ持つ。\n対応サブジョブ：歯車工\n対応上級職：深層機工卿',
  '格闘士': '拳で敵を崩す近接職。攻撃に優れ、HPもやや高い。\n対応サブジョブ：勁打者\n対応上級職：灰拳闘王',
  '巡礼者': 'どの道にも染まりきらない旅人。補正を持たない基準職。\n対応サブジョブ：繋ぎ手\n対応上級職：星巡の導き手',
};

export const SUB_JOB_DESCRIPTIONS: Record<string, string> = {
  '刃走り': '剣筋に速さを乗せる補助職。攻撃と速度を少し高める。',
  '城壁番': '仲間の前に立つ守りの補助職。HPと防御を少し高める。',
  '矢痕読み': '敵の隙と傷跡を読む補助職。攻撃と速度を少し高める。',
  '灰術士': '灰に残る星の力を扱う補助職。魔力とMPをさらに伸ばす。',
  '灯守': '消えかけた灯を守る補助職。MPと支援力を少し高める。',
  '影足': '足音を消して先を取る補助職。速度をさらに高める。',
  '歯車工': '歯車と火薬を扱う補助職。攻撃と魔力を少し高める。',
  '勁打者': '体の芯に力を通す補助職。攻撃をさらに高める。',
  '繋ぎ手': '道と道を結ぶ補助職。補正を持たない基準サブ職。',
};

export const ADVANCED_JOB_DESCRIPTIONS: Record<string, string> = {
  '黄昏剣聖': '黄昏の剣を極めた剣士の上級職。攻撃力を大きく伸ばしつつ、耐久も崩れにくい。',
  '白銀城塞騎士': '白銀の城塞のように立ちはだかる重騎士の上級職。HPと防御に極めて優れる。',
  '残響弓王': '残響を射抜く狩人の上級職。速度と攻撃の両方に優れ、安定して敵を削る。',
  '星灰大魔導': '星と灰の理に到達した魔術師の上級職。魔力とMPが大きく伸びるが、耐久は低い。',
  '巡礼聖祈師': '祈りを巡礼の力へ変える祈祷師の上級職。MPと魔力に優れ、支援戦に強い。',
  '影渡りの夜王': '影を渡る斥候の上級職。速度が極めて高く、先手を取りやすい。',
  '深層機工卿': '深層炉の機構を読み解いた機工師の上級職。攻撃と魔力を併せ持ち、break性能に優れる。',
  '灰拳闘王': '灰の荒野を拳で進む格闘士の上級職。攻撃力とHPに優れた近接火力職。',
  '星巡の導き手': 'すべての道を繋ぐ巡礼者の上級職。突出はしないが、全能力を高い水準で整える。',
};

export function getBaseJobForAdvanced(advancedJob: string): string | null {
  const entry = Object.entries(JOB_TRIO_MAP).find(([, v]) => v.advanced === advancedJob);
  return entry?.[0] ?? null;
}

export function getSubForBaseJob(baseJob: string): string | null {
  return JOB_TRIO_MAP[baseJob]?.sub ?? null;
}

export function getAdvancedForBaseJob(baseJob: string): string | null {
  return JOB_TRIO_MAP[baseJob]?.advanced ?? null;
}
