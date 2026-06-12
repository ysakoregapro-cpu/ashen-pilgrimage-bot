/** 伝承（N→Uni）・変質（Uni→Src）・ボス再戦素材 — 単一ソース */

/** 星落ちの観測所 — 月下の観測者 再戦ドロップ */
export const MAT_STARFALL_OBSIDIAN = 'mat_starfall_obsidian';
/** 黒灯りの路地 — 黒灯の残影 再戦ドロップ */
export const MAT_BLACK_LANTERN_CINDER = 'mat_black_lantern_cinder';

/** カイの変質（Uni→Src）に必要 — ヴァルハラ周回 */
export const SRC_FORGE_MATERIAL_ID = 'mat_star_pilgrim_echo';

/** @deprecated legacy Uni mats — kept for existing players, not used in Phase2 Kai Uni */
export const UNI_FORGE_MATERIAL_IDS = [MAT_STARFALL_OBSIDIAN, MAT_BLACK_LANTERN_CINDER] as const;

export { PHASE2_UNI_MATERIAL_DROPS } from './jobProgressionMaster';

export const UNI_FORGE_DROP_RATE = 0.10;
export const UNI_FORGE_PITY_AFTER = 12;

export const SRC_FORGE_MATERIAL_DROP_RATE = 0.10;
export const SRC_FORGE_GOLD_COST = 5000;
export const SRC_FORGE_ECHO_QTY = 3;

/** 再戦専用ボス（素材ボス） */
export const REMATCH_MATERIAL_BOSSES = {
  [MAT_STARFALL_OBSIDIAN]: {
    monsterId: 'mon_moon_observer',
    label: '月下の観測者',
    areaHint: '星落ちの観測所',
  },
  [MAT_BLACK_LANTERN_CINDER]: {
    monsterId: 'mon_black_lantern_wraith',
    label: '黒灯の残影',
    areaHint: '黒灯りの路地',
  },
} as const;

/** ヴァルハラ周回 — Src変質素材 */
export const SRC_FARM_MONSTER_IDS = [
  'mon_machina_echo',
  'mon_furnace_defense',
  'mon_old_king_shadow',
] as const;

export const AWAKENING_MAX_HINT = [
  'この武器は、まだ終わりではない。',
  '遠い星を見上げる場所で、何かが呼応するかもしれない。',
].join('\n');

export const KAI_UNI_MATERIAL_HINT = [
  'カイ:',
  '「その武器は、ただの古道具じゃない。',
  '星の落ちた場所か、黒い灯の残る路地に行ってみろ。',
  '何かが応えるかもしれん。」',
].join('\n');
