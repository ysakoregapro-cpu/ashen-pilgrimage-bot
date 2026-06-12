import { getDb } from '../db/database';
import { baseEmbed, durabilityLabel } from '../utils/embeds';
import { formatFieldTitle } from '../utils/formatters';
import type { UiPayload } from '../utils/townUi';
import { nextActionButtons } from '../utils/nextActionButtons';
import { selectMenu } from '../utils/embeds';
import {
  canPerformItemAction, getInventoryProtectRow, type ItemAction,
} from './itemProtectionSystem';
import { getInventorySellPrice, resolveShopBuyPrice, resolveShopSellPrice, getItemPricing } from './itemValueSystem';
import { getEnhanceRequirement, getMaxUpgradeLevel, formatEnhancePreview, getPrimaryStatKey, formatEnhanceDiff } from './enhanceSystem';
import { getEquipped } from './equipmentSystem';
import { getUnlockedTowns } from './playerSystem';
import { hasStoryFlag } from './storySystem';
import { JOB_SKILL_UNLOCKS } from '../db/seedData/jobSkillData';
import { getShopCatalog, getSellableInventory } from './shopSystem';
import { ELEMENT_LABELS, normalizeElement } from '../db/seedData/elementMaster';
import { getResistancesFromGearPiece, formatElementResistLine, getPlayerElementResistances } from './elementSystem';
import { formatAcquisitionHint, type AcquisitionSource, ACQUISITION_OVERRIDES } from '../db/seedData/equipmentMaster';
import { resolveSkillEffect } from '../db/seedData/skillEffectMaster';
import { getSkill, skillTypeLabel, scalingLabel } from './skillSystem';
import { AREAS } from '../db/seedData/areas';
import { DURABILITY_PENALTY, RARITY_EMOJI, SLOT_LABELS, type DurabilityState, type Rarity } from '../types';
import { awakeningLabel, MAX_AWAKENING_LEVEL, getAwakeningDupCost, AWAKENING_ELIGIBLE_RARITIES } from '../db/seedData/awakeningMaster';
import { ButtonBuilder, ButtonStyle, ActionRowBuilder, type MessageActionRowComponentBuilder } from 'discord.js';

export type DetailContext = 'inventory' | 'shop_buy' | 'shop_sell' | 'market' | 'upgrade' | 'equip' | 'skill' | 'general';

const UPGRADE_STONE_USAGE: Record<string, string> = {
  upg_rough_stone: '装備 +1〜+3 強化',
  upg_stone: '装備 +4〜+6 強化',
  upg_fine_stone: '装備 +7〜+9 強化',
  upg_rare_stone: '装備 +10 以降の強化',
  upg_deep_core_stone: '高級装備・深層強化',
};

const SPECIAL_MATERIAL_USAGE: Record<string, string> = {
  mat_star_pilgrim_echo: 'カイによるSrc昇華（売却不可）',
};

const WEAPON_TYPE_LABELS: Record<string, string> = {
  sword: '剣', dagger: '短剣', axe: '斧', bow: '弓', staff: '杖', rod: '短杖',
  fist: '拳', spear: '槍', cannon: '機工砲', shield: '盾', spell_staff: '魔導杖',
};

function parseAcquisition(itemId: string): AcquisitionSource[] {
  const row = getDb().prepare('SELECT acquisition_json FROM items WHERE id = ?').get(itemId) as { acquisition_json: string | null } | undefined;
  if (row?.acquisition_json) {
    try { return JSON.parse(row.acquisition_json) as AcquisitionSource[]; } catch { /* ignore */ }
  }
  return ACQUISITION_OVERRIDES[itemId] ?? [];
}

function townForAreaHint(detail: string): string | null {
  const area = AREAS.find((a) => detail.includes(a.name) || detail.includes(a.id));
  return area?.town ?? null;
}

export function getItemAcquisitionHint(userId: string, itemId: string): string {
  const sources = parseAcquisition(itemId);
  if (!sources.length) return '探索・店・ボスなど各所';
  const unlocked = new Set(getUnlockedTowns(userId));
  const lines: string[] = [];

  for (const s of sources) {
    if (s.type === 'trade_only') {
      lines.push('他プレイヤーの出品から入手可能');
      continue;
    }
    const town = townForAreaHint(s.detail);
    if (town && !unlocked.has(town)) {
      lines.push('物語が進むと到達できる地域で入手可能');
      continue;
    }
    if (s.type === 'boss_reward' && !hasStoryFlag(userId, 'first_victory')) {
      lines.push('強敵から入手できるとされる');
      continue;
    }
    if (s.type === 'raid_reward' && !hasStoryFlag(userId, 'chapter_completed:ch7_furnace')) {
      lines.push('共闘探索の報酬として入手できるとされる');
      continue;
    }
    const labels: Record<string, string> = {
      shop: '店', drop_monster: '敵', drop_area: '探索', boss_reward: 'ボス',
      raid_reward: 'レイド', story_reward: 'ストーリー', craft: '作成',
      upgrade_material: '強化', start: '初期',
    };
    lines.push(`${labels[s.type] ?? s.type}: ${s.detail}`);
  }
  return [...new Set(lines)].slice(0, 5).join('\n') || formatAcquisitionHint(sources);
}

export function getItemUsageHint(itemId: string, category: string): string {
  if (SPECIAL_MATERIAL_USAGE[itemId]) return SPECIAL_MATERIAL_USAGE[itemId];
  if (UPGRADE_STONE_USAGE[itemId]) return UPGRADE_STONE_USAGE[itemId];
  if (itemId.startsWith('rep_')) return '装備の修理';
  if (category === 'upgrade_stone') return '装備強化';
  if (category === 'boss_material') return '高級装備・特殊強化';
  if (category === 'raid_material' || category === 'src_upgrade') return 'Src武器強化（ヴァルハラ産）';
  if (category === 'consumable') return '回復・支援';
  return '探索・強化・取引';
}

export function canSellItem(userId: string, inventoryId: number): { ok: boolean; reason?: string; warning?: string } {
  const r = canPerformItemAction(inventoryId, userId, 'sell');
  if (!r.ok) return { ok: false, reason: r.reason };
  const warn = getActionWarnings(userId, inventoryId, 'sell');
  return { ok: true, warning: warn.length ? warn.join('\n') : undefined };
}

export function canListItem(userId: string, inventoryId: number): { ok: boolean; reason?: string; warning?: string } {
  const r = canPerformItemAction(inventoryId, userId, 'market_list');
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true, warning: getActionWarnings(userId, inventoryId, 'sell').join('\n') || undefined };
}

export function canDismantleItem(userId: string, inventoryId: number): { ok: boolean; reason?: string; warning?: string } {
  const r = canPerformItemAction(inventoryId, userId, 'dismantle');
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true, warning: getActionWarnings(userId, inventoryId, 'dismantle').join('\n') || undefined };
}

export function getActionWarnings(userId: string, inventoryId: number, action: ItemAction): string[] {
  const row = getInventoryProtectRow(inventoryId, userId);
  if (!row) return [];
  const warns: string[] = [];
  if (row.is_equipped) warns.push('装備中の品です。');
  const inv = getDb().prepare('SELECT upgrade_level, durability_state FROM player_inventory WHERE id = ?').get(inventoryId) as {
    upgrade_level: number; durability_state: DurabilityState;
  } | undefined;
  if (inv && inv.upgrade_level > 0 && (action === 'sell' || action === 'dismantle')) {
    warns.push('強化済みです。手放すと戻せません。');
  }
  if (['SR', 'SSR', 'UR', 'Src'].includes(row.rarity) && (action === 'sell' || action === 'dismantle')) {
    warns.push(`[${row.rarity}] の品です。慎重に。`);
  }
  if (row.is_unique || row.rarity === 'Src' || row.src_level > 0) {
    warns.push('ユニーク/Src品は売却・分解できません。');
  }
  if (['upgrade_stone', 'boss_material', 'src_upgrade'].includes(row.category) && action === 'sell') {
    if (row.item_id === 'upg_rough_stone' || row.item_id === 'upg_stone') {
      warns.push('序盤〜中盤の強化に使う素材です。売却非推奨。');
    } else {
      warns.push('今後の強化・修理に使う可能性があります。');
    }
  }
  if (row.item_id.startsWith('rep_') && action === 'sell') {
    warns.push('修理素材です。損傷が進む前に確保しておくと安心。');
  }
  return warns;
}

function protectionTags(row: ReturnType<typeof getInventoryProtectRow> | undefined): string {
  if (!row) return '—';
  const tags: string[] = [];
  if (row.is_unique) tags.push('ユニーク');
  if (row.rarity === 'Src' || row.src_level > 0) tags.push('Src');
  if (row.is_equipped) tags.push('装備中');
  if (!row.tradeable) tags.push('保護');
  if (row.is_pending_reward) tags.push('道中');
  return tags.length ? tags.join(' / ') : '通常';
}

function formatSeriesBlock(userId: string, seriesId: string | null, slot: string): string {
  if (!seriesId) {
    if (slot === 'weapon' || slot.startsWith('accessory')) {
      return [formatFieldTitle('シリーズ'), 'シリーズ: なし'].join('\n');
    }
    return '';
  }
  const set = getDb().prepare('SELECT name FROM equipment_sets WHERE id = ?').get(seriesId) as { name: string } | undefined;
  const countRow = getDb().prepare(`
    SELECT COUNT(*) AS c FROM player_equipment pe
    JOIN player_inventory pi ON pe.inventory_id = pi.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pe.user_id = ? AND e.series_id = ?
  `).get(userId, seriesId) as { c: number };
  const totalPieces = getDb().prepare('SELECT COUNT(*) AS c FROM equipment WHERE series_id = ?').get(seriesId) as { c: number };
  const bonuses = getDb().prepare(`
    SELECT piece_count, effect_description FROM equipment_set_bonuses WHERE set_id = ? ORDER BY piece_count
  `).all(seriesId) as Array<{ piece_count: number; effect_description: string }>;
  const effectLines = bonuses.map((b) => {
    const active = countRow.c >= b.piece_count;
    return `${b.piece_count}部位: ${b.effect_description}${active ? '' : ' — 未発動'}`;
  });
  return [
    formatFieldTitle('シリーズ'),
    `シリーズ: ${set?.name ?? seriesId}`,
    `装備中: ${countRow.c}/${totalPieces.c}部位`,
    '',
    '発動効果:',
    ...effectLines,
    '',
    'シリーズスキル: 未発現',
  ].join('\n');
}

function formatPermFlags(userId: string, inventoryId: number | null, itemId: string, category: string): string {
  const lines: string[] = [];
  if (inventoryId != null) {
    const sell = canSellItem(userId, inventoryId);
    lines.push(`売却: ${sell.ok ? '可' : '不可'}`);
    if (!sell.ok && sell.reason) lines.push(`理由: ${sell.reason}`);
    const list = canListItem(userId, inventoryId);
    lines.push(`出品: ${list.ok ? '可' : '不可'}`);
    if (!list.ok && list.reason) lines.push(`理由: ${list.reason}`);
    const dis = canDismantleItem(userId, inventoryId);
    lines.push(`分解: ${dis.ok ? '可' : '不可'}`);
    if (!dis.ok && dis.reason) lines.push(`理由: ${dis.reason}`);
    lines.push(`修理: ${category === 'equipment' ? '可（損傷時）' : '—'}`);
  } else {
    lines.push('売却: — / 出品: — / 分解: —');
  }
  return lines.join('\n');
}

export function getEquipmentComparison(userId: string, inventoryId: number): string {
  const target = getDb().prepare(`
    SELECT pi.*, i.name, i.rarity, e.slot, e.weapon_type, e.element,
      e.attack_bonus, e.magic_bonus, e.defense_bonus, e.spirit_bonus, e.speed_bonus, e.hp_bonus
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ?
  `).get(inventoryId) as {
    user_id: string;
    name: string; upgrade_level: number; slot: string; weapon_type: string | null; element: string | null;
    attack_bonus: number; magic_bonus: number; defense_bonus: number; spirit_bonus: number;
    rarity: string;
  } | undefined;
  if (!target) return '';

  const equipped = getEquipped(userId).find((e) => (e as { slot: string }).slot === target.slot) as {
    name: string | null; upgrade_level: number; inventory_id?: number;
    attack_bonus?: number; magic_bonus?: number; defense_bonus?: number; spirit_bonus?: number;
    element?: string | null;
  } | undefined;

  if (!equipped?.name) {
    return `**${SLOT_LABELS[target.slot as keyof typeof SLOT_LABELS] ?? target.slot}** は未装備。\nこの装備を付けると新たに性能が加わります。`;
  }

  const lines = [
    `現在装備: ${equipped.name}${equipped.upgrade_level ? ` +${equipped.upgrade_level}` : ''}`,
    `確認中: ${target.name}${target.upgrade_level ? ` +${target.upgrade_level}` : ''}`,
    '',
    '**差分（基礎ボーナス）:**',
  ];
  const diffs: Array<[string, number, number]> = [
    ['攻撃', target.attack_bonus, equipped.attack_bonus ?? 0],
    ['魔力', target.magic_bonus, equipped.magic_bonus ?? 0],
    ['防御', target.defense_bonus, equipped.defense_bonus ?? 0],
    ['精神', target.spirit_bonus, equipped.spirit_bonus ?? 0],
  ];
  for (const [label, nv, ov] of diffs) {
    const d = nv - ov;
    if (d !== 0) lines.push(`${label} ${d > 0 ? '+' : ''}${d}`);
  }
  const tEl = normalizeElement(target.element);
  const eEl = normalizeElement(equipped.element ?? null);
  if (tEl !== eEl) lines.push(`属性: ${ELEMENT_LABELS[eEl]} → ${ELEMENT_LABELS[tEl]}`);
  lines.push('', '装備変更でステータスが変わります。身支度所から変更できます。');
  return lines.join('\n');
}

function buildEquipmentDetail(userId: string, inventoryId: number): string {
  const row = getDb().prepare(`
    SELECT pi.*, i.name, i.rarity, i.description, i.category,
      e.slot, e.weapon_type, e.element, e.resistances_json, e.special_effect_json,
      e.attack_bonus, e.magic_bonus, e.defense_bonus, e.spirit_bonus, e.speed_bonus,
      e.hp_bonus, e.mp_bonus, e.accuracy_bonus, e.crit_rate_bonus, e.max_upgrade_level,
      e.required_level, e.required_job, e.is_unique, e.src_weapon_id, e.series_id
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ?
  `).get(inventoryId) as Record<string, unknown> | undefined;
  if (!row) return '装備が見つかりません。';

  const ownerId = row.user_id as string;
  const isOwner = ownerId === userId;

  const name = row.name as string;
  const rarity = row.rarity as string;
  const upg = row.upgrade_level as number;
  const srcLv = row.src_level as number;
  const dur = row.durability_state as DurabilityState;
  const durPen = DURABILITY_PENALTY[dur] ?? 1;
  const slot = row.slot as string;
  const wtype = row.weapon_type as string | null;
  const element = normalizeElement(row.element as string | null);
  const prot = isOwner ? getInventoryProtectRow(inventoryId, userId) : undefined;

  const statLines: string[] = [];
  const addStat = (label: string, val: number, pct = false) => {
    if (val) statLines.push(`${label} ${pct ? `+${(val * 100).toFixed(0)}%` : `+${val}`}`);
  };
  addStat('攻撃', row.attack_bonus as number);
  addStat('魔力', row.magic_bonus as number);
  addStat('防御', row.defense_bonus as number);
  addStat('精神', row.spirit_bonus as number);
  addStat('速度', row.speed_bonus as number);
  addStat('HP', row.hp_bonus as number);
  addStat('MP', row.mp_bonus as number);
  addStat('命中', row.accuracy_bonus as number, true);
  addStat('会心', row.crit_rate_bonus as number, true);

  let resistLine = formatElementResistLine(getResistancesFromGearPiece({
    resistances_json: row.resistances_json as string | null,
    special_effect_json: row.special_effect_json as string | null,
    metadata_json: row.metadata_json as string | null,
    durability_state: dur,
  }));
  if (isOwner) {
    const totalRes = getPlayerElementResistances(userId);
    const totalLine = formatElementResistLine(totalRes);
    if (totalLine) resistLine += resistLine ? `\n装備合計: ${totalLine}` : `装備合計: ${totalLine}`;
  }

  const maxLv = getMaxUpgradeLevel(rarity, row.max_upgrade_level as number);
  let enhanceBlock = `現在 +${upg} / 最大 +${maxLv}`;
  if (upg < maxLv && rarity !== 'Src') {
    const req = getEnhanceRequirement(upg, rarity);
    const primary = getPrimaryStatKey({
      attack_bonus: row.attack_bonus as number, magic_bonus: row.magic_bonus as number,
      defense_bonus: row.defense_bonus as number, spirit_bonus: row.spirit_bonus as number,
      speed_bonus: row.speed_bonus as number, hp_bonus: row.hp_bonus as number,
      weapon_type: wtype, slot,
    });
    const primaryLabel = { attack: '攻撃', magic: '魔力', defense: '防御', spirit: '精神' }[primary];
    enhanceBlock += `\n次の強化: ${primaryLabel}が上昇\n${formatEnhancePreview(req, upg)}`;
    if (upg >= 0) {
      enhanceBlock += `\n${formatEnhanceDiff({
        attack_bonus: row.attack_bonus as number, magic_bonus: row.magic_bonus as number,
        defense_bonus: row.defense_bonus as number, spirit_bonus: row.spirit_bonus as number,
        speed_bonus: row.speed_bonus as number, hp_bonus: row.hp_bonus as number,
        weapon_type: wtype, slot,
      }, upg + 1, srcLv)}`;
    }
  } else if (srcLv > 0) {
    enhanceBlock += `\nSrc +${srcLv}`;
  }

  const awLv = (row.awakening_level as number) ?? 0;
  let awakenBlock = awakeningLabel(awLv);
  if (rarity === 'Src') {
    awakenBlock += '\nSrc武器は覚醒不可';
  } else if (awLv < MAX_AWAKENING_LEVEL && AWAKENING_ELIGIBLE_RARITIES.has(rarity) && !(row.is_unique as number)) {
    const need = getAwakeningDupCost(rarity, awLv);
    awakenBlock += `\n次の覚醒: 同名武器 ${need} 本`;
  } else if (awLv >= MAX_AWAKENING_LEVEL && slot === 'weapon' && !(row.is_unique as number)) {
    awakenBlock += '\n最大覚醒 — 職業初期武器ならカイで伝承可能';
  }
  const meta = row.metadata_json as string | null;
  const kaiUnique = meta?.includes('kai_unique');
  const typeTags: string[] = [];
  if (rarity === 'Src' || srcLv > 0) typeTags.push('Src武器');
  else if ((row.is_unique as number) || kaiUnique) typeTags.push('ユニーク武器');
  const reqLv = (row.required_level as number) ?? 1;
  const reqJob = row.required_job as string | null;
  const cond = [`Lv${reqLv}以上`, reqJob ? `${reqJob}向け` : null].filter(Boolean).join(' / ');

  const sellPrice = isOwner ? getInventorySellPrice(row.item_id as string, upg, dur, row.metadata_json as string | null) : 0;

  const sections = [
    `${RARITY_EMOJI[rarity as Rarity] ?? ''} **${name}**${upg ? ` +${upg}` : ''}${srcLv ? ` Src+${srcLv}` : ''}${typeTags.length ? `（${typeTags.join('・')}）` : ''}`,
    `種別: ${slot === 'weapon' ? '武器' : '防具'}${wtype ? ` / ${WEAPON_TYPE_LABELS[wtype] ?? wtype}` : ''}`,
    `レアリティ: ${rarity} | 部位: ${SLOT_LABELS[slot as keyof typeof SLOT_LABELS] ?? slot}`,
    `属性: ${ELEMENT_LABELS[element]}`,
    `装備条件: ${cond}`,
    '',
    formatFieldTitle('性能'),
    statLines.length ? statLines.join('\n') : '—',
    durPen < 1 ? `（損傷補正: 性能×${Math.round(durPen * 100)}%）` : '',
    resistLine ? `属性耐性: ${resistLine}` : '',
    '',
    formatSeriesBlock(userId, row.series_id as string | null, slot),
    '',
    formatFieldTitle('強化'),
    enhanceBlock,
    '',
    formatFieldTitle('覚醒'),
    awakenBlock,
    '',
    formatFieldTitle('耐久'),
    `${durabilityLabel(dur)}${durPen < 1 ? `（-${Math.round((1 - durPen) * 100)}%）` : ' — ペナルティなし'}`,
    '',
    formatFieldTitle('入手'),
    getItemAcquisitionHint(userId, row.item_id as string),
    '',
    formatFieldTitle('取引'),
    isOwner ? `売却価格目安: ${sellPrice}G` : '他プレイヤーの出品品',
    isOwner ? formatPermFlags(userId, inventoryId, row.item_id as string, 'equipment') : '売却: — | 出品: — | 分解: —',
    `タグ: ${protectionTags(prot)}`,
    '',
    formatFieldTitle('説明'),
    (row.description as string) || '—',
  ];
  return sections.filter(Boolean).join('\n');
}

function buildConsumableDetail(userId: string, inventoryId: number): string {
  const row = getDb().prepare(`
    SELECT pi.quantity, pi.item_id, i.name, i.rarity, i.description, i.category,
      i.battle_usable, i.battle_effect_json, i.shop_sell_price, i.sell_price
    FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as Record<string, unknown> | undefined;
  if (!row) return 'アイテムが見つかりません。';
  return buildCatalogItemDetail(userId, row.item_id as string, {
    quantity: row.quantity as number,
    inventoryId,
  });
}

function buildMaterialDetail(userId: string, itemId: string, quantity?: number): string {
  const item = getDb().prepare('SELECT * FROM items WHERE id = ?').get(itemId) as {
    name: string; rarity: string; category: string; description: string; sell_price: number;
  } | undefined;
  if (!item) return '素材が見つかりません。';

  const sellOk = !['boss_material', 'src_core', 'src_upgrade'].includes(item.category);
  const keepHint = UPGRADE_STONE_USAGE[itemId] || item.category.includes('upgrade')
    ? '序盤は強化に使うため売却非推奨'
    : sellOk ? '売却可能' : '売却非推奨';

  return [
    `**${item.name}**${quantity != null ? ` ×${quantity}` : ''}`,
    `種別: ${item.category} | レアリティ: ${item.rarity}`,
    '',
    formatFieldTitle('用途'),
    getItemUsageHint(itemId, item.category),
    '',
    formatFieldTitle('入手'),
    getItemAcquisitionHint(userId, itemId),
    '',
    formatFieldTitle('取引'),
    `売却: ${sellOk ? `${resolveShopSellPrice(getItemPricing(itemId)!)}G程度` : '非推奨'} — ${keepHint}`,
    '',
    formatFieldTitle('説明'),
    item.description,
  ].join('\n');
}

export function buildCatalogItemDetail(userId: string, itemId: string, opts?: {
  quantity?: number; inventoryId?: number; shopBuyPrice?: number;
}): string {
  const item = getDb().prepare('SELECT * FROM items WHERE id = ?').get(itemId) as {
    name: string; rarity: string; category: string; description: string;
    battle_usable: number; battle_effect_json: string | null;
  } | undefined;
  if (!item) return '品が見つかりません。';

  if (item.category === 'equipment' && opts?.inventoryId) {
    return buildEquipmentDetail(userId, opts.inventoryId);
  }
  if (item.category !== 'equipment' && item.category !== 'consumable' && opts?.inventoryId) {
    return buildMaterialDetail(userId, itemId, opts.quantity);
  }

  let effectLine = '';
  if (item.battle_effect_json) {
    try {
      const fx = JSON.parse(item.battle_effect_json) as { type: string; value?: number };
      if (fx.type === 'heal_hp') effectLine = `HPを${fx.value ?? '?'}回復`;
      else if (fx.type === 'cure_poison') effectLine = '状態異常を治す';
      else if (fx.type === 'flee_boost') effectLine = '逃走成功率上昇';
      else effectLine = fx.type;
    } catch { effectLine = '戦闘効果あり'; }
  }

  const pricing = getItemPricing(itemId);
  const buy = opts?.shopBuyPrice ?? (pricing ? resolveShopBuyPrice(pricing) : 0);
  const sell = pricing ? resolveShopSellPrice(pricing) : 0;

  return [
    `**${item.name}**${opts?.quantity != null ? ` ×${opts.quantity}` : ''}`,
    `種別: ${item.category} | レアリティ: ${item.rarity}`,
    effectLine ? `効果: ${effectLine}` : '',
    item.battle_usable ? '使用可能: 戦闘中 / 探索中' : '使用可能: 探索・町',
    `購入: ${buy}G | 売却: ${sell}G`,
    '',
    formatFieldTitle('用途'),
    getItemUsageHint(itemId, item.category),
    '',
    formatFieldTitle('入手'),
    getItemAcquisitionHint(userId, itemId),
    '',
    formatFieldTitle('説明'),
    item.description,
  ].filter(Boolean).join('\n');
}

export function buildSkillDetailBody(skillId: string, userId?: string): string {
  const skill = getSkill(skillId);
  if (!skill) return 'スキルが見つかりません。';
  const fx = resolveSkillEffect(skill.id, skill.effect_type, skill.status_effect);
  const el = skill.element ? ELEMENT_LABELS[normalizeElement(skill.element)] : '無属性';
  const bossNote = fx.statusEffect === 'bind' || fx.implementationKey === 'bind'
    ? '通常敵は行動阻害。ボスは弱体化（速度↓/被ダメ↑）'
    : fx.statusEffect ? '状態異常あり' : '—';

  let learnCond = `職能: ${skill.job_id}`;
  const unlock = JOB_SKILL_UNLOCKS[skill.job_id]?.find((u) => u.skillId === skillId);
  if (unlock) learnCond += ` / JobLv${unlock.level}で習得`;

  return [
    `**${skill.name}**`,
    `属性: ${el} | 種別: ${skillTypeLabel(skill.skill_type)}`,
    `対象: 単体 | 消費MP: ${skill.mp_cost}`,
    `威力: ×${skill.power} | 補正: ${scalingLabel(skill.scaling_stat)}`,
    skill.status_effect || fx.statusEffect ? `状態異常: ${skill.status_effect ?? fx.statusEffect}（${fx.statusDuration ?? '?'}ターン）` : '',
    `ボスへの効き方: ${bossNote}`,
    '',
    formatFieldTitle('効果'),
    skill.description,
    fx.logTemplate ? `実効: ${fx.logTemplate}` : '',
    '',
    formatFieldTitle('習得'),
    learnCond,
  ].filter(Boolean).join('\n');
}

export function buildItemDetailView(userId: string, opts: {
  inventoryId?: number;
  itemId?: string;
  skillId?: string;
  context?: DetailContext;
  shopBuyPrice?: number;
  warnings?: string[];
  compare?: boolean;
}): UiPayload {
  let body = '';
  if (opts.skillId) {
    body = buildSkillDetailBody(opts.skillId, userId);
  } else if (opts.inventoryId != null) {
    const inv = getDb().prepare(`
      SELECT pi.item_id, i.category FROM player_inventory pi JOIN items i ON pi.item_id = i.id
      WHERE pi.id = ? AND pi.user_id = ?
    `).get(opts.inventoryId, userId) as { item_id: string; category: string } | undefined;
    if (!inv) body = '品が見つかりません。';
    else if (inv.category === 'equipment') body = buildEquipmentDetail(userId, opts.inventoryId);
    else if (inv.category === 'consumable') body = buildConsumableDetail(userId, opts.inventoryId);
    else body = buildMaterialDetail(userId, inv.item_id);
  } else if (opts.itemId) {
    body = buildCatalogItemDetail(userId, opts.itemId, { shopBuyPrice: opts.shopBuyPrice, inventoryId: opts.inventoryId });
  }

  if (opts.compare && opts.inventoryId != null) {
    body += '\n\n' + formatFieldTitle('装備比較') + '\n' + getEquipmentComparison(userId, opts.inventoryId);
  }
  if (opts.warnings?.length) {
    body += '\n\n⚠ **注意**\n' + opts.warnings.join('\n');
  }

  const embed = baseEmbed('品の詳細', body);
  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  if (opts.inventoryId != null) {
    const invRow = getDb().prepare(`
      SELECT i.category FROM player_inventory pi JOIN items i ON pi.item_id = i.id WHERE pi.id = ?
    `).get(opts.inventoryId) as { category: string } | undefined;
    if (invRow?.category === 'equipment' && !opts.compare) {
      components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`detail:compare:${opts.inventoryId}`).setLabel('装備比較').setStyle(ButtonStyle.Primary),
      ));
    }
  }

  components.push(...nextActionButtons(opts.context === 'inventory' ? 'inventory' : opts.context === 'equip' ? 'equip' : 'generic'));

  return { embeds: [embed], components };
}

export function buildInventoryDetailPickView(userId: string): UiPayload {
  const items = getDb().prepare(`
    SELECT pi.id, i.name, i.rarity, i.category, pi.quantity, pi.upgrade_level, pi.is_equipped
    FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ? AND pi.is_pending_reward = 0
    ORDER BY i.category, i.rarity DESC, i.name
    LIMIT 25
  `).all(userId) as Array<{ id: number; name: string; rarity: string; category: string; quantity: number; upgrade_level: number; is_equipped: number }>;

  if (!items.length) {
    return { embeds: [baseEmbed('所持品', '詳細を見る品がありません。')], components: nextActionButtons('inventory') };
  }

  return {
    embeds: [baseEmbed('所持品の詳細', '品を選ぶと性能・入手・用途を確認できます。')],
    components: [
      selectMenu('detail:inv', '詳細を見る品', items.map((i) => ({
        label: i.name.slice(0, 100),
        value: String(i.id),
        description: `[${i.rarity}] ${i.category}${i.quantity > 1 ? ` x${i.quantity}` : ''}${i.is_equipped ? ' 装備中' : ''}`.slice(0, 100),
      }))),
      ...nextActionButtons('inventory'),
    ],
  };
}

export function buildSkillDetailPickView(userId: string): UiPayload {
  const skills = getDb().prepare(`
    SELECT s.id, s.name, s.mp_cost, s.skill_type FROM player_skills ps
    JOIN skills s ON s.id = ps.skill_id WHERE ps.user_id = ? ORDER BY s.name LIMIT 25
  `).all(userId) as Array<{ id: string; name: string; mp_cost: number; skill_type: string }>;

  if (!skills.length) {
    return { embeds: [baseEmbed('スキル', '覚えた技がありません。')], components: nextActionButtons('generic') };
  }

  return {
    embeds: [baseEmbed('スキル詳細', '技を選ぶと属性・効果・状態異常を確認できます。')],
    components: [
      selectMenu('detail:skill', '詳細を見る技', skills.map((s) => ({
        label: s.name, value: s.id, description: `${skillTypeLabel(s.skill_type)} MP${s.mp_cost}`.slice(0, 100),
      }))),
      ...nextActionButtons('generic'),
    ],
  };
}

export function buildEquipmentDetailView(
  userId: string,
  inventoryId: number,
  opts?: { compare?: boolean; context?: DetailContext; warnings?: string[] },
): UiPayload {
  return buildItemDetailView(userId, { inventoryId, compare: opts?.compare, context: opts?.context, warnings: opts?.warnings });
}

export function buildSkillDetailView(userId: string, skillId: string): UiPayload {
  return buildItemDetailView(userId, { skillId, context: 'skill' });
}

export function assertInventoryOwned(userId: string, inventoryId: number): { ok: boolean; reason?: string } {
  const row = getDb().prepare('SELECT id FROM player_inventory WHERE id = ? AND user_id = ?').get(inventoryId, userId);
  if (!row) return { ok: false, reason: '品が見つからないか、すでに手放した。' };
  return { ok: true };
}

export function assertListingActive(listingId: string): { ok: boolean; reason?: string } {
  const row = getDb().prepare('SELECT id FROM market_listings WHERE id = ? AND status = ?').get(listingId, 'active');
  if (!row) return { ok: false, reason: '出品が見つからないか、すでに成立した。' };
  return { ok: true };
}

export function detailOpenButton(context: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`detail:open:${context}`).setLabel('品の詳細').setStyle(ButtonStyle.Secondary),
  );
}

export function buildListingDetailView(userId: string, listingId: string): UiPayload {
  const listing = getDb().prepare(`
    SELECT ml.price, ml.inventory_id, pi.user_id AS seller_id
    FROM market_listings ml
    JOIN player_inventory pi ON ml.inventory_id = pi.id
    WHERE ml.id = ? AND ml.status = 'active'
  `).get(listingId) as { price: number; inventory_id: number; seller_id: string } | undefined;
  if (!listing) {
    return { embeds: [baseEmbed('取引所', '出品が見つかりません。')], components: nextActionButtons('facility') };
  }
  const payload = buildItemDetailView(userId, {
    inventoryId: listing.inventory_id,
    context: 'market',
    compare: listing.seller_id !== userId,
  });
  const embed = payload.embeds[0]!;
  embed.setDescription(`${embed.data.description ?? ''}\n\n**出品価格:** ${listing.price}G`);
  const buyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`market:confirm_buy:${listingId}`).setLabel('購入する').setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [buyRow, ...payload.components] as ActionRowBuilder<MessageActionRowComponentBuilder>[] };
}

export function buildShopDetailPickView(userId: string, townId: string, mode: 'buy' | 'sell'): UiPayload {
  if (mode === 'buy') {
    const catalog = getShopCatalog(townId).slice(0, 25);
    return {
      embeds: [baseEmbed('店の品詳細', '商品を選んで詳細を確認できます。')],
      components: [
        selectMenu('detail:shop', '商品詳細', catalog.map((c) => ({
          label: c.name, value: c.item_id, description: `${c.buy_price}G [${c.rarity}]`.slice(0, 100),
        }))),
        ...nextActionButtons('facility'),
      ],
    };
  }
  const items = getSellableInventory(userId) as Array<{ id: number; name: string; rarity: string }>;
  return {
    embeds: [baseEmbed('売却品詳細', '売る前に詳細と警告を確認できます。')],
    components: [
      selectMenu('detail:inv', '詳細を見る', items.slice(0, 25).map((i) => ({
        label: i.name, value: String(i.id), description: i.rarity,
      }))),
      ...nextActionButtons('facility'),
    ],
  };
}
