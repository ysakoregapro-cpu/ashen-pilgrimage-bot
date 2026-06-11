import { getDb } from '../db/database';
import { nowIso } from '../types';
import {
  KAI_UNIQUE_TARGETS, MAX_AWAKENING_LEVEL, SRC_FORGE_MATERIAL_ID, awakeningLabel,
} from '../db/seedData/awakeningMaster';
import { hasStoryFlag, setStoryFlag } from './storySystem';
import { unlockTownForPlayer } from './townSystem';
import { getItemCount, consumeMaterial } from './inventorySystem';
import { getSrcManifestInfo } from './srcWeaponSystem';
import { recalculatePlayerStats } from './playerSystem';

export function canKaiUnique(userId: string, inventoryId: number): { ok: boolean; reason?: string } {
  if (!hasStoryFlag(userId, 'chapter_completed:ch2_silver')) {
    return { ok: false, reason: '白銀の章まで進むと、カイが応えてくれる。' };
  }
  if (!hasStoryFlag(userId, 'kai_unique_unlocked')) {
    if (!hasStoryFlag(userId, 'chapter_completed:ch2_silver')) {
      return { ok: false, reason: 'カイとの信頼がまだ浅い。' };
    }
  }

  const row = getDb().prepare(`
    SELECT pi.*, i.name, i.rarity, e.is_unique, e.src_weapon_id, e.slot
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as {
    awakening_level: number; name: string; item_id: string; rarity: string;
    is_unique: number; src_weapon_id: string | null; slot: string;
    metadata_json: string | null;
  } | undefined;

  if (!row) return { ok: false, reason: '武器が見つかりません。' };
  if (row.is_unique) return { ok: false, reason: 'すでにユニーク武器です。' };
  if (row.rarity === 'Src') return { ok: false, reason: 'Src武器は対象外です。' };
  if (row.slot !== 'weapon') return { ok: false, reason: '武器のみユニーク昇華できます。' };
  if (row.awakening_level < MAX_AWAKENING_LEVEL) {
    return { ok: false, reason: `最大覚醒（${awakeningLabel(MAX_AWAKENING_LEVEL)}）が必要です。（現在 ${awakeningLabel(row.awakening_level)}）` };
  }
  return { ok: true };
}

export function getKaiUniqueInfo(userId: string, inventoryId: number): string {
  const check = canKaiUnique(userId, inventoryId);
  const row = getDb().prepare(`
    SELECT pi.awakening_level, i.name, pi.item_id FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as { name: string; awakening_level: number; item_id: string } | undefined;
  if (!row) return '武器が見つかりません。';

  const target = KAI_UNIQUE_TARGETS[row.item_id];
  const lines = [
    `**${row.name}** — ${awakeningLabel(row.awakening_level)}`,
    'カイの昇華: 無償（育てた証として）',
    target ? `→ **${(getDb().prepare('SELECT name FROM items WHERE id = ?').get(target) as { name: string })?.name ?? target}**` : '→ ユニーク品として刻印',
  ];
  if (!check.ok) lines.push(`\n⚠ ${check.reason}`);
  return lines.join('\n');
}

export function kaiUniqueTransform(userId: string, inventoryId: number): { success: boolean; message: string } {
  const check = canKaiUnique(userId, inventoryId);
  if (!check.ok) return { success: false, message: check.reason ?? '昇華できません。' };

  const row = getDb().prepare(`
    SELECT pi.*, i.name, pi.item_id, pi.upgrade_level, pi.metadata_json
    FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as {
    id: number; item_id: string; name: string; upgrade_level: number; metadata_json: string | null;
  };

  const targetId = KAI_UNIQUE_TARGETS[row.item_id];
  if (targetId) {
    getDb().prepare(`
      UPDATE player_inventory SET item_id = ?, awakening_level = 0, upgrade_level = ?, updated_at = ?
      WHERE id = ?
    `).run(targetId, row.upgrade_level, nowIso(), row.id);
  } else {
    const meta = row.metadata_json ? JSON.parse(row.metadata_json) : {};
    meta.kai_unique = true;
    meta.base_item_id = row.item_id;
    getDb().prepare('UPDATE player_inventory SET metadata_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(meta), nowIso(), row.id);
  }

  recalculatePlayerStats(userId);
  return {
    success: true,
    message: `✨ カイが静かに手を添えた。\n**${row.name}** はユニーク武器として名を得た。\n売却・出品・分解はできない。`,
  };
}

export function canKaiSrc(userId: string, inventoryId: number): { ok: boolean; reason?: string } {
  if (!hasStoryFlag(userId, 'boss_defeated:boss_old_furnace_keeper')) {
    return { ok: false, reason: '深層炉の番人を倒すと、カイが素材の在り処を教えてくれる。' };
  }

  const row = getDb().prepare(`
    SELECT pi.*, i.name, e.is_unique, e.src_weapon_id
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as {
    is_unique: number; src_weapon_id: string | null; metadata_json: string | null; name: string;
  } | undefined;

  if (!row) return { ok: false, reason: '武器が見つかりません。' };
  const isUnique = row.is_unique || (row.metadata_json?.includes('kai_unique'));
  if (!isUnique) return { ok: false, reason: 'ユニーク武器のみSrc化できます。' };
  if (!row.src_weapon_id) return { ok: false, reason: 'この武器には伝承の名が刻まれていません。' };

  const have = getItemCount(userId, SRC_FORGE_MATERIAL_ID);
  if (have < 1) {
    return { ok: false, reason: `昇華の素材（星巡の残響）が必要です。（所持 ${have}）` };
  }
  return { ok: true };
}

export function getKaiSrcInfo(userId: string, inventoryId: number): string {
  const check = canKaiSrc(userId, inventoryId);
  const info = getSrcManifestInfo(userId, inventoryId);
  const have = getItemCount(userId, SRC_FORGE_MATERIAL_ID);
  const matName = (getDb().prepare('SELECT name FROM items WHERE id = ?').get(SRC_FORGE_MATERIAL_ID) as { name: string } | undefined)?.name ?? '星巡の残響';
  return [
    info,
    '',
    `**${matName}**: ${have}/1（深層炉の番人から低確率）`,
    'カイのSrc昇華: 素材1個のみ（ゴールド不要）',
    check.ok ? '' : `⚠ ${check.reason}`,
  ].filter(Boolean).join('\n');
}

export function kaiSrcTransform(userId: string, inventoryId: number): { success: boolean; message: string } {
  const check = canKaiSrc(userId, inventoryId);
  if (!check.ok) return { success: false, message: check.reason ?? 'Src化できません。' };

  if (!consumeMaterial(userId, SRC_FORGE_MATERIAL_ID, 1)) {
    return { success: false, message: '星巡の残響が足りません。' };
  }

  const row = getDb().prepare(`
    SELECT pi.*, e.src_weapon_id FROM player_inventory pi
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as { src_weapon_id: string | null } | undefined;
  if (!row?.src_weapon_id) return { success: false, message: '伝承の名が刻まれていません。' };

  const src = getDb().prepare('SELECT src_item_id, name FROM src_weapons WHERE id = ?').get(row.src_weapon_id) as {
    src_item_id: string; name: string;
  };
  getDb().prepare(`
    UPDATE player_inventory SET item_id = ?, src_level = 0, awakening_level = 0, upgrade_level = 0, updated_at = ?
    WHERE id = ?
  `).run(src.src_item_id, nowIso(), inventoryId);

  setStoryFlag(userId, 'valhalla_unlocked');
  setStoryFlag(userId, 'has_src_weapon');
  unlockTownForPlayer(userId, 'valhalla_fortress');
  recalculatePlayerStats(userId);
  return {
    success: true,
    message: `✨ カイが素材と刃を重ねた。\n**${src.name}** としてSrcの名が刻まれた。\nヴァルハラへの道が、少しだけ明るくなった。`,
  };
}

export function getKaiUniqueCandidates(userId: string) {
  return getDb().prepare(`
    SELECT pi.id, i.name, pi.awakening_level FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND e.slot = 'weapon' AND e.is_unique = 0 AND i.rarity IN ('N','R')
      AND pi.awakening_level >= ? AND pi.is_equipped = 0 AND pi.is_pending_reward = 0
    ORDER BY i.name LIMIT 25
  `).all(userId, MAX_AWAKENING_LEVEL) as Array<{ id: number; name: string; awakening_level: number }>;
}

export function getKaiSrcCandidates(userId: string) {
  return getDb().prepare(`
    SELECT pi.id, i.name FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND (e.is_unique = 1 OR pi.metadata_json LIKE '%kai_unique%')
      AND i.rarity != 'Src' AND e.src_weapon_id IS NOT NULL
      AND pi.is_equipped = 0 LIMIT 25
  `).all(userId) as Array<{ id: number; name: string }>;
}
