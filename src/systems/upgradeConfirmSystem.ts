import { ButtonStyle } from 'discord.js';
import { getDb } from '../db/database';
import { baseEmbed } from '../utils/embeds';
import { buildConfirmNavigationRows, upgradeBackPayload, appendSelectNavigation } from '../utils/navigationComponents';
import type { UpgradeActionKind } from '../utils/nextActionButtons';
import type { UiPayload } from '../utils/townUi';
import {
  formatEnhanceDiff, formatEnhancePreview, getEnhanceRequirement, getMaxUpgradeLevel,
} from './enhanceSystem';
import {
  formatOwnedEquipmentLabel,
  formatDurabilityBadge,
  mapInventoryRowToEquipmentSelect,
} from './equipmentLabelSystem';
import { getAwakeningInfo } from './awakeningSystem';
import { getSrcUpgradeInfo } from './upgradeSystem';
import { getSrcManifestInfo } from './srcWeaponSystem';
import { getKaiUniqueInfo, getKaiSrcInfo, canKaiUnique, canKaiSrc } from './kaiForgeSystem';
import { findFacilityInTown, getUpgradeSelectMenuOptions } from './facilitySystem';
import { getItemCount } from './inventorySystem';
import { requirePlayer } from './playerSystem';
import { DURABILITY_ORDER, type DurabilityState } from '../types';
import { selectMenu } from '../utils/embeds';
import { detailOpenButton } from './itemDetailSystem';
import { townHubEmbed } from '../utils/townUi';

const CONFIRM_LABELS: Record<UpgradeActionKind, string> = {
  enhance: '強化する',
  repair: '修理する',
  awaken: '覚醒する',
  src: 'Src強化する',
  manifest: 'Src発現する',
  kai_unique: '変質する',
  kai_src: '変質する',
  dismantle: '分解する',
};

const TITLE: Record<UpgradeActionKind, string> = {
  enhance: '強化確認',
  repair: '修理確認',
  awaken: '覚醒確認',
  src: 'Src強化確認',
  manifest: 'Src発現確認',
  kai_unique: 'カイ伝承確認',
  kai_src: 'Src昇華確認',
  dismantle: '分解確認',
};

type InvRow = {
  id: number;
  name: string;
  rarity: string;
  upgrade_level: number;
  src_level: number;
  awakening_level: number;
  durability_state: string;
  is_equipped: number;
  slot: string;
  weapon_type: string | null;
  attack_bonus: number;
  magic_bonus: number;
  defense_bonus: number;
  spirit_bonus: number;
  max_upgrade_level: number;
};

function loadInvRow(userId: string, inventoryId: number): InvRow | undefined {
  return getDb().prepare(`
    SELECT pi.id, pi.upgrade_level, pi.src_level, pi.awakening_level, pi.durability_state, pi.is_equipped,
      i.name, i.rarity, e.slot, e.weapon_type, e.max_upgrade_level,
      e.attack_bonus, e.magic_bonus, e.defense_bonus, e.spirit_bonus
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as InvRow | undefined;
}

export function resolveUpgradeFacilityId(userId: string): string {
  return findFacilityInTown(userId, 'repair_shop') ?? findFacilityInTown(userId, 'blacksmith') ?? 'unknown';
}

function canPerform(userId: string, action: UpgradeActionKind, row: InvRow): { ok: boolean; reason?: string } {
  if (action === 'enhance') {
    if (row.rarity === 'Src') return { ok: true };
    const max = getMaxUpgradeLevel(row.rarity, row.max_upgrade_level);
    if (row.upgrade_level >= max) return { ok: false, reason: 'これ以上強化できません。' };
    const req = getEnhanceRequirement(row.upgrade_level, row.rarity);
    const player = requirePlayer(userId);
    if (player.gold < req.goldCost) return { ok: false, reason: `ゴールド不足（${req.goldCost}G）` };
    if (getItemCount(userId, req.stoneId) < req.stoneQty) return { ok: false, reason: `${req.stoneName}不足` };
    return { ok: true };
  }
  if (action === 'repair') {
    if (row.durability_state === '良好') return { ok: false, reason: '修理の必要はありません。' };
    const gold = row.durability_state === '破損' ? 500 : row.durability_state === '損傷' ? 200 : 80;
    if (requirePlayer(userId).gold < gold) return { ok: false, reason: `ゴールド不足（${gold}G）` };
    if (getItemCount(userId, 'rep_patch') < 1) return { ok: false, reason: '補修布不足' };
    return { ok: true };
  }
  if (action === 'awaken') {
    const info = getAwakeningInfo(userId, row.id);
    if (info.includes('覚醒できない')) return { ok: false, reason: info.split('\n')[0] };
    return { ok: true };
  }
  if (action === 'kai_unique') {
    const c = canKaiUnique(userId, row.id);
    return c.ok ? { ok: true } : { ok: false, reason: c.reason };
  }
  if (action === 'kai_src') {
    const c = canKaiSrc(userId, row.id);
    return c.ok ? { ok: true } : { ok: false, reason: c.reason };
  }
  return { ok: true };
}

function buildBody(userId: string, action: UpgradeActionKind, row: InvRow): string {
  if (action === 'enhance') {
    if (row.rarity === 'Src') return getSrcUpgradeInfo(userId, row.id);
    const req = getEnhanceRequirement(row.upgrade_level, row.rarity);
    const diff = formatEnhanceDiff(
      {
        attack_bonus: row.attack_bonus, magic_bonus: row.magic_bonus,
        defense_bonus: row.defense_bonus, spirit_bonus: row.spirit_bonus,
        speed_bonus: 0, hp_bonus: 0, weapon_type: row.weapon_type, slot: row.slot,
      },
      row.upgrade_level + 1,
      row.src_level,
      row.rarity,
    );
    return [
      `現在: +${row.upgrade_level}`,
      `実行後: +${row.upgrade_level + 1}`,
      formatEnhancePreview(req, row.upgrade_level),
      diff ? `**変化**\n${diff}` : '',
    ].filter(Boolean).join('\n');
  }
  if (action === 'repair') {
    const gold = row.durability_state === '破損' ? 500 : row.durability_state === '損傷' ? 200 : 80;
    const idx = DURABILITY_ORDER.indexOf(row.durability_state as DurabilityState);
    const after = DURABILITY_ORDER[Math.max(0, idx - 1)]!;
    return [
      `状態: ${formatDurabilityBadge(row.durability_state)}`,
      `修理後: ${after}`,
      `費用: ${gold}G`,
      '素材: 補修布×1',
    ].join('\n');
  }
  if (action === 'awaken') return getAwakeningInfo(userId, row.id);
  if (action === 'src') return getSrcUpgradeInfo(userId, row.id);
  if (action === 'manifest') return getSrcManifestInfo(userId, row.id);
  if (action === 'kai_unique') return getKaiUniqueInfo(userId, row.id);
  if (action === 'kai_src') return getKaiSrcInfo(userId, row.id);
  return '実行内容を確認してください。';
}

export function buildUpgradeConfirmPayload(
  userId: string,
  action: UpgradeActionKind,
  inventoryId: number,
  facilityId?: string,
): UiPayload {
  const fac = facilityId ?? resolveUpgradeFacilityId(userId);
  const row = loadInvRow(userId, inventoryId);
  if (!row) {
    return { embeds: [baseEmbed('確認', '装備が見つかりません。')], components: [] };
  }
  const target = formatOwnedEquipmentLabel(mapInventoryRowToEquipmentSelect(row));
  const gate = canPerform(userId, action, row);
  const body = buildBody(userId, action, row);
  const style = action === 'dismantle' ? ButtonStyle.Danger : ButtonStyle.Success;
  const confirmId = action === 'dismantle'
    ? `upgrade:confirm_dismantle:${inventoryId}`
    : `upgrade:confirm:${action}:${inventoryId}`;

  return {
    embeds: [baseEmbed(TITLE[action], [`**対象:** ${target}`, '', body, gate.reason ? `\n⚠ ${gate.reason}` : ''].filter(Boolean).join('\n'))],
    components: buildConfirmNavigationRows({
      confirmId,
      confirmLabel: CONFIRM_LABELS[action],
      confirmStyle: style,
      backContext: 'upgrade',
      backPayload: upgradeBackPayload(action, fac),
      disabled: !gate.ok,
    }),
  };
}

export function buildUpgradeSelectPayload(userId: string, action: UpgradeActionKind, facilityId: string): UiPayload {
  const menuOpts = getUpgradeSelectMenuOptions(userId, action);
  const rows = menuOpts.length ? [
    selectMenu(`upgrade:${action}`, '装備を選ぶ', menuOpts),
    detailOpenButton('upgrade'),
  ] : [];
  return {
    embeds: [townHubEmbed('工房', `${CONFIRM_LABELS[action].replace(/する$/, '')}する装備を選んでください`)],
    components: appendSelectNavigation(rows, 'upgrade', upgradeBackPayload(action, facilityId)),
  };
}
