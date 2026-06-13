/**
 * Phase2.4+ — 全アイテム用途分類マスタ（監査・配置判断の単一ソース）
 */
import type Database from 'better-sqlite3';
import { NORMAL_EXPLORE_POOL_EXCLUDED } from './dropBalanceMaster';
import { SRC_FORGE_MATERIAL_ID } from './forgeMaster';
import { UNI_JOB_MATERIALS, PHASE2_UNI_MATERIAL_DROPS } from './jobProgressionMaster';
import { AWAKENING_ELIGIBLE_RARITIES } from './awakeningMaster';
import { progressionTierForAreaMin } from './dropBalanceMaster';
import { AREAS } from './areas';

/** Formal item-purpose taxonomy (GPT design + playable_gear for equipment). */
export type ItemPurposeKind =
  | 'consumable'
  | 'enhance_material'
  | 'repair_material'
  | 'awaken_material'
  | 'kai_material'
  | 'src_material'
  | 'set_material'
  | 'job_material'
  | 'trial_material'
  | 'raid_material'
  | 'currency_like'
  | 'vendor_item'
  | 'collection'
  | 'reserved_future'
  | 'legacy'
  | 'needs_sink'
  | 'playable_gear';

export const FORMAL_ITEM_PURPOSE_KINDS: readonly ItemPurposeKind[] = [
  'consumable', 'enhance_material', 'repair_material', 'awaken_material', 'kai_material',
  'src_material', 'set_material', 'job_material', 'trial_material', 'raid_material',
  'currency_like', 'vendor_item', 'collection', 'reserved_future', 'legacy', 'needs_sink',
  'playable_gear',
] as const;

export type ProgressionTier =
  | 'early'
  | 'mid'
  | 'late_mid'
  | 'late'
  | 'valhalla'
  | 'raid'
  | 'none';

export type ItemPurpose = {
  id: string;
  name: string;
  rarity: string;
  purpose: ItemPurposeKind;
  progressionTier: ProgressionTier;
  shouldDropInNormalPool: boolean;
  shouldDropInBossPool: boolean;
  shouldDropInRaidPool: boolean;
  sinkDescription: string;
  risk: 'low' | 'medium' | 'high';
  notes: string;
};

/** 明示オーバーライド（推論より優先） */
export const ITEM_PURPOSE_OVERRIDES: Partial<Record<string, Omit<ItemPurpose, 'id' | 'name' | 'rarity'>>> = {
  boss_silent_page: {
    purpose: 'src_material',
    progressionTier: 'valhalla',
    shouldDropInNormalPool: false,
    shouldDropInBossPool: true,
    shouldDropInRaidPool: false,
    sinkDescription: 'Src最終強化・UR覚醒・特性保護・UR抽選（ヴァルハラ最上位触媒）',
    risk: 'high',
    notes: '無答の守護者/ヴァルハラボス専用。通常探索から除外',
  },
  valhalla_emblem: {
    purpose: 'currency_like',
    progressionTier: 'valhalla',
    shouldDropInNormalPool: false,
    shouldDropInBossPool: true,
    shouldDropInRaidPool: false,
    sinkDescription: 'ヴァルハラ徽章交換所（UI未実装）',
    risk: 'low',
    notes: 'ヴァルハラボス周回確定報酬',
  },
  mat_ur_lottery_shard: {
    purpose: 'reserved_future',
    progressionTier: 'valhalla',
    shouldDropInNormalPool: false,
    shouldDropInBossPool: true,
    shouldDropInRaidPool: false,
    sinkDescription: 'UR抽選箱（将来）',
    risk: 'medium',
    notes: 'ヴァルハラボス低確率・徽章交換150+頁3',
  },
  mat_affix_reroll_assist: {
    purpose: 'reserved_future',
    progressionTier: 'valhalla',
    shouldDropInNormalPool: false,
    shouldDropInBossPool: true,
    shouldDropInRaidPool: false,
    sinkDescription: '特性再抽選補助（将来）',
    risk: 'medium',
    notes: 'ヴァルハラボス低確率',
  },
  mat_affix_slot_protect: {
    purpose: 'reserved_future',
    progressionTier: 'valhalla',
    shouldDropInNormalPool: false,
    shouldDropInBossPool: false,
    shouldDropInRaidPool: false,
    sinkDescription: '特性1枠保護（徽章交換300+頁1・将来）',
    risk: 'high',
    notes: '交換所のみ・ドロップなし',
  },
  mat_starfall_obsidian: {
    purpose: 'legacy',
    progressionTier: 'none',
    shouldDropInNormalPool: false,
    shouldDropInBossPool: false,
    shouldDropInRaidPool: false,
    sinkDescription: '旧仕様。既存所持のみ',
    risk: 'low',
    notes: 'reserved_future→legacy',
  },
  mat_black_lantern_cinder: {
    purpose: 'legacy',
    progressionTier: 'none',
    shouldDropInNormalPool: false,
    shouldDropInBossPool: false,
    shouldDropInRaidPool: false,
    sinkDescription: '旧仕様。既存所持のみ',
    risk: 'low',
    notes: 'reserved_future→legacy',
  },
  wpn_unique_silence: {
    purpose: 'legacy',
    progressionTier: 'none',
    shouldDropInNormalPool: false,
    shouldDropInBossPool: false,
    shouldDropInRaidPool: false,
    sinkDescription: '旧Uni武器。DB残存のみ',
    risk: 'low',
    notes: 'Phase2.1 excluded',
  },
  acc_raid_random: {
    purpose: 'collection',
    progressionTier: 'raid',
    shouldDropInNormalPool: false,
    shouldDropInBossPool: false,
    shouldDropInRaidPool: true,
    sinkDescription: 'レイド収集・ランダムアクセ',
    risk: 'medium',
    notes: 'raid報酬専用',
  },
  mat_star_pilgrim_echo: {
    purpose: 'kai_material',
    progressionTier: 'valhalla',
    shouldDropInNormalPool: false,
    shouldDropInBossPool: false,
    shouldDropInRaidPool: false,
    sinkDescription: 'Kai/Uni変質',
    risk: 'medium',
    notes: '終盤変質',
  },
  src_star_mark_full: { purpose: 'src_material', progressionTier: 'valhalla', shouldDropInNormalPool: true, shouldDropInBossPool: false, shouldDropInRaidPool: true, sinkDescription: 'Src変質素材', risk: 'medium', notes: '' },
  src_old_king_echo: { purpose: 'src_material', progressionTier: 'valhalla', shouldDropInNormalPool: true, shouldDropInBossPool: false, shouldDropInRaidPool: true, sinkDescription: 'Src変質素材', risk: 'medium', notes: '' },
  src_valhalla_core: { purpose: 'src_material', progressionTier: 'valhalla', shouldDropInNormalPool: true, shouldDropInBossPool: false, shouldDropInRaidPool: true, sinkDescription: 'Src変質素材', risk: 'medium', notes: '' },
  src_machina_core: { purpose: 'src_material', progressionTier: 'valhalla', shouldDropInNormalPool: true, shouldDropInBossPool: false, shouldDropInRaidPool: true, sinkDescription: 'Src変質素材', risk: 'medium', notes: '' },
};

const UNI_MAT_IDS = new Set<string>();
for (const req of Object.values(UNI_JOB_MATERIALS)) {
  UNI_MAT_IDS.add(req.mat1);
  UNI_MAT_IDS.add(req.mat2);
}
for (const d of PHASE2_UNI_MATERIAL_DROPS) UNI_MAT_IDS.add(d.matId);

const ENHANCE_IDS = new Set([
  'upg_rough_stone', 'upg_stone', 'upg_fine_stone', 'upg_rare_stone', 'upg_old_king_stone', 'upg_deep_core_stone',
]);

const REPAIR_IDS = new Set(['rep_patch', 'rep_polish', 'rep_oil', 'rep_silver_clip', 'rep_deep_repair']);

function mapProgressionTier(code: string): ProgressionTier {
  if (code === 'late_pre') return 'late_mid';
  if (code === 'valhalla' || code === 'late' || code === 'mid' || code === 'early') return code;
  return 'none';
}

function minAreaLevelForItem(itemId: string): number {
  let min = 99;
  for (const area of AREAS) {
    if (area.rewards.includes(itemId)) min = Math.min(min, area.min);
  }
  return min === 99 ? 1 : min;
}

function inferPurpose(item: {
  id: string;
  category: string;
  rarity: string;
  sell_price: number;
  usage_text: string | null;
}): Omit<ItemPurpose, 'id' | 'name' | 'rarity'> {
  const { id, category, rarity, sell_price, usage_text } = item;

  if (ITEM_PURPOSE_OVERRIDES[id]) {
    return { ...ITEM_PURPOSE_OVERRIDES[id]! };
  }

  if (category === 'equipment') {
    const tier = mapProgressionTier(progressionTierForAreaMin(minAreaLevelForItem(id)));
    const isRaidGear = id.startsWith('wpn_valhalla') || id.includes('valhalla') || rarity === 'UR';
    return {
      purpose: 'playable_gear',
      progressionTier: isRaidGear ? 'raid' : tier,
      shouldDropInNormalPool: !['Uni', 'Src'].includes(rarity),
      shouldDropInBossPool: rarity === 'SSR' || rarity === 'UR',
      shouldDropInRaidPool: isRaidGear,
      sinkDescription: '装備として装備/強化/覚醒',
      risk: ['SSR', 'UR'].includes(rarity) ? 'high' : 'low',
      notes: '',
    };
  }

  if (category === 'consumable' || id.startsWith('cons_')) {
    return {
      purpose: 'consumable',
      progressionTier: mapProgressionTier(progressionTierForAreaMin(minAreaLevelForItem(id))),
      shouldDropInNormalPool: true,
      shouldDropInBossPool: false,
      shouldDropInRaidPool: false,
      sinkDescription: '戦闘/探索で消費',
      risk: 'low',
      notes: '',
    };
  }

  if (ENHANCE_IDS.has(id) || id.startsWith('upg_') || id.startsWith('mat_')) {
    return {
      purpose: 'enhance_material',
      progressionTier: mapProgressionTier(progressionTierForAreaMin(minAreaLevelForItem(id))),
      shouldDropInNormalPool: !NORMAL_EXPLORE_POOL_EXCLUDED.has(id),
      shouldDropInBossPool: UNI_MAT_IDS.has(id),
      shouldDropInRaidPool: false,
      sinkDescription: id.startsWith('mat_') ? '装備強化/作成素材' : '装備強化',
      risk: UNI_MAT_IDS.has(id) ? 'medium' : 'low',
      notes: UNI_MAT_IDS.has(id) ? '再戦ドロップ' : '',
    };
  }

  if (REPAIR_IDS.has(id) || id.startsWith('rep_')) {
    return {
      purpose: 'repair_material',
      progressionTier: mapProgressionTier(progressionTierForAreaMin(minAreaLevelForItem(id))),
      shouldDropInNormalPool: true,
      shouldDropInBossPool: false,
      shouldDropInRaidPool: false,
      sinkDescription: '装備修理',
      risk: 'low',
      notes: '',
    };
  }

  if (id.startsWith('dism_')) {
    return {
      purpose: 'set_material',
      progressionTier: mapProgressionTier(progressionTierForAreaMin(minAreaLevelForItem(id))),
      shouldDropInNormalPool: true,
      shouldDropInBossPool: false,
      shouldDropInRaidPool: false,
      sinkDescription: 'セット装備分解/作成',
      risk: 'low',
      notes: '',
    };
  }

  if (id.startsWith('boss_')) {
    return {
      purpose: 'src_material',
      progressionTier: 'late',
      shouldDropInNormalPool: false,
      shouldDropInBossPool: true,
      shouldDropInRaidPool: false,
      sinkDescription: 'ボス/再戦専用素材',
      risk: 'high',
      notes: '',
    };
  }

  if (id.startsWith('raid_') || id === 'acc_raid_random') {
    return {
      purpose: 'raid_material',
      progressionTier: 'raid',
      shouldDropInNormalPool: false,
      shouldDropInBossPool: false,
      shouldDropInRaidPool: true,
      sinkDescription: 'レイド/協力報酬',
      risk: 'medium',
      notes: '',
    };
  }

  if (id.startsWith('src_') || id === SRC_FORGE_MATERIAL_ID) {
    return {
      purpose: 'src_material',
      progressionTier: 'valhalla',
      shouldDropInNormalPool: id.startsWith('src_'),
      shouldDropInBossPool: false,
      shouldDropInRaidPool: true,
      sinkDescription: 'Src変質',
      risk: 'medium',
      notes: '',
    };
  }

  if (UNI_MAT_IDS.has(id)) {
    return {
      purpose: 'kai_material',
      progressionTier: 'late_mid',
      shouldDropInNormalPool: false,
      shouldDropInBossPool: true,
      shouldDropInRaidPool: false,
      sinkDescription: 'Uni/Kai変質（再戦）',
      risk: 'medium',
      notes: '',
    };
  }

  if (AWAKENING_ELIGIBLE_RARITIES.has(rarity) && category === 'material') {
    return {
      purpose: 'awaken_material',
      progressionTier: mapProgressionTier(progressionTierForAreaMin(minAreaLevelForItem(id))),
      shouldDropInNormalPool: true,
      shouldDropInBossPool: false,
      shouldDropInRaidPool: false,
      sinkDescription: '覚醒関連',
      risk: 'low',
      notes: '',
    };
  }

  if (id.startsWith('ticket_') || id.startsWith('voucher_') || id.includes('_point')) {
    return {
      purpose: 'currency_like',
      progressionTier: 'none',
      shouldDropInNormalPool: false,
      shouldDropInBossPool: false,
      shouldDropInRaidPool: false,
      sinkDescription: '交換券/ポイント',
      risk: 'low',
      notes: '',
    };
  }

  if (sell_price >= 80 && rarity === 'N' && !usage_text) {
    return {
      purpose: 'vendor_item',
      progressionTier: mapProgressionTier(progressionTierForAreaMin(minAreaLevelForItem(id))),
      shouldDropInNormalPool: true,
      shouldDropInBossPool: false,
      shouldDropInRaidPool: false,
      sinkDescription: '売却金策',
      risk: 'medium',
      notes: 'vendor_item — 低〜中レア中心',
    };
  }

  if (NORMAL_EXPLORE_POOL_EXCLUDED.has(id)) {
    return {
      purpose: 'legacy',
      progressionTier: 'none',
      shouldDropInNormalPool: false,
      shouldDropInBossPool: false,
      shouldDropInRaidPool: false,
      sinkDescription: '通常ドロップ除外',
      risk: 'low',
      notes: '',
    };
  }

  return {
    purpose: 'needs_sink',
    progressionTier: mapProgressionTier(progressionTierForAreaMin(minAreaLevelForItem(id))),
    shouldDropInNormalPool: false,
    shouldDropInBossPool: false,
    shouldDropInRaidPool: false,
    sinkDescription: '消費先要確認 — 通常pool抑制',
    risk: 'medium',
    notes: 'needs_sink — 監査で消費先候補を検討',
  };
}

export function buildItemPurposeCatalog(db: Database.Database): ItemPurpose[] {
  const items = db.prepare(`
    SELECT id, name, category, rarity, sell_price, usage_text FROM items
    WHERE category NOT IN ('skill', 'quest')
    ORDER BY id
  `).all() as Array<{ id: string; name: string; category: string; rarity: string; sell_price: number; usage_text: string | null }>;

  return items.map((item) => {
    const resolved = inferPurpose(item);
    return {
      id: item.id,
      name: item.name,
      rarity: item.rarity,
      ...resolved,
    };
  });
}

export function getItemPurposeById(db: Database.Database, itemId: string): ItemPurpose | undefined {
  const item = db.prepare(`
    SELECT id, name, category, rarity, sell_price, usage_text FROM items WHERE id = ?
  `).get(itemId) as { id: string; name: string; category: string; rarity: string; sell_price: number; usage_text: string | null } | undefined;
  if (!item) return undefined;
  const resolved = inferPurpose(item);
  return { id: item.id, name: item.name, rarity: item.rarity, ...resolved };
}
