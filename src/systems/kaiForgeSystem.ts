import { getDb } from '../db/database';
import { nowIso } from '../types';
import {
  KAI_UNIQUE_TARGETS, MAX_AWAKENING_LEVEL, awakeningLabel, isMaxAwakening,
  SRC_FORGE_MATERIAL_ID,
} from '../db/seedData/awakeningMaster';
import { SRC_FORGE_ECHO_QTY, SRC_FORGE_GOLD_COST } from '../db/seedData/forgeMaster';
import { isJobStarterWeapon, STARTER_WEAPON_IDS, JOB_STARTER_WEAPONS } from '../db/seedData/jobStarterWeapons';
import { UNI_JOB_MATERIALS } from '../db/seedData/jobProgressionMaster';
import { requirePlayer, spendGold } from './playerSystem';
import { hasStoryFlag, setStoryFlag } from './storySystem';
import { unlockTownForPlayer } from './townSystem';
import { getItemCount, consumeMaterial } from './inventorySystem';
import { getSrcManifestInfo } from './srcWeaponSystem';
import { recalculatePlayerStats } from './playerSystem';

const STARTER_TO_JOB: Record<string, string> = Object.fromEntries(
  Object.entries(JOB_STARTER_WEAPONS).map(([job, wpn]) => [wpn, job]),
);

function matName(matId: string): string {
  return (getDb().prepare('SELECT name FROM items WHERE id = ?').get(matId) as { name: string } | undefined)?.name ?? matId;
}

function uniMaterialStatus(userId: string, starterItemId: string): { ok: boolean; reason?: string; lines: string[] } {
  const job = STARTER_TO_JOB[starterItemId];
  const req = job ? UNI_JOB_MATERIALS[job] : undefined;
  if (!req) {
    return { ok: false, reason: 'この武器の伝承素材が未設定です。', lines: [] };
  }
  const c1 = getItemCount(userId, req.mat1);
  const c2 = getItemCount(userId, req.mat2);
  const lines = [
    `**必要素材**`,
    `・${matName(req.mat1)} ${c1}/${req.qty}`,
    `・${matName(req.mat2)} ${c2}/${req.qty}`,
  ];
  if (c1 < req.qty || c2 < req.qty) {
    return { ok: false, reason: '職別伝承素材が足りない。ボス再戦で集めろ。', lines };
  }
  return { ok: true, lines };
}

export function canKaiUnique(userId: string, inventoryId: number): { ok: boolean; reason?: string } {
  if (!hasStoryFlag(userId, 'chapter_completed:ch2_silver')) {
    return { ok: false, reason: '白銀の章まで進むと、カイが応えてくれる。' };
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
  if (row.is_unique || row.rarity === 'Uni') return { ok: false, reason: 'すでにUni武器です。' };
  if (row.rarity === 'Src') return { ok: false, reason: 'Src武器は対象外です。' };
  if (row.slot !== 'weapon') return { ok: false, reason: '武器のみ伝承できます。' };
  if (!isJobStarterWeapon(row.item_id)) {
    return { ok: false, reason: '伝承できるのは職業初期武器のみです。' };
  }
  if (!KAI_UNIQUE_TARGETS[row.item_id]) {
    return { ok: false, reason: 'この武器には伝承の名がありません。' };
  }
  if (!isMaxAwakening(row.awakening_level)) {
    return { ok: false, reason: `最大覚醒（${awakeningLabel(MAX_AWAKENING_LEVEL)}）が必要です。（現在 ${awakeningLabel(row.awakening_level)}）` };
  }
  const mats = uniMaterialStatus(userId, row.item_id);
  if (!mats.ok) return { ok: false, reason: mats.reason };
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
  const mats = uniMaterialStatus(userId, row.item_id);
  const lines = [
    `**${row.name}** — ${awakeningLabel(row.awakening_level)}`,
    'カイの伝承（昇華）: 最大覚醒 + 職別素材×2種',
    ...mats.lines,
    target ? `→ **${(getDb().prepare('SELECT name FROM items WHERE id = ?').get(target) as { name: string })?.name ?? target}**（Uni）` : '→ Uni武器として刻印',
  ];
  if (!check.ok) lines.push(`\n⚠ ${check.reason}`);
  return lines.join('\n');
}

export function kaiUniqueTransform(userId: string, inventoryId: number): { success: boolean; message: string } {
  const check = canKaiUnique(userId, inventoryId);
  if (!check.ok) return { success: false, message: check.reason ?? '伝承できません。' };

  const rowMeta = getDb().prepare(`
    SELECT pi.item_id FROM player_inventory pi WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as { item_id: string };
  const job = STARTER_TO_JOB[rowMeta.item_id];
  const req = job ? UNI_JOB_MATERIALS[job] : undefined;
  if (!req) return { success: false, message: '伝承素材が未設定です。' };
  if (!consumeMaterial(userId, req.mat1, req.qty) || !consumeMaterial(userId, req.mat2, req.qty)) {
    return { success: false, message: '伝承の素材が足りません。' };
  }

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
  const targetName = targetId
    ? (getDb().prepare('SELECT name FROM items WHERE id = ?').get(targetId) as { name: string }).name
    : row.name;
  return {
    success: true,
    message: `✨ カイが静かに手を添えた。\n**${row.name}** は **${targetName}** としてUniの名を得た。\n売却・出品・分解はできない。`,
  };
}

export function canKaiSrc(userId: string, inventoryId: number): { ok: boolean; reason?: string } {
  if (!hasStoryFlag(userId, 'chapter_completed:ch7_furnace') && !hasStoryFlag(userId, 'valhalla_unlocked')) {
    return { ok: false, reason: 'ヴァルハラに到達すると、カイがSrc変質の素材を教えてくれる。' };
  }

  const row = getDb().prepare(`
    SELECT pi.*, i.name, i.rarity, e.is_unique, e.src_weapon_id
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as {
    is_unique: number; src_weapon_id: string | null; metadata_json: string | null; name: string; rarity: string;
  } | undefined;

  if (!row) return { ok: false, reason: '武器が見つかりません。' };
  const isUni = row.rarity === 'Uni' || row.is_unique || (row.metadata_json?.includes('kai_unique'));
  if (!isUni) return { ok: false, reason: 'Uni武器のみSrc変質できます。' };
  if (!row.src_weapon_id) return { ok: false, reason: 'この武器には変質の名が刻まれていません。' };

  const have = getItemCount(userId, SRC_FORGE_MATERIAL_ID);
  const player = requirePlayer(userId);
  if (have < SRC_FORGE_ECHO_QTY) {
    return { ok: false, reason: `星巡の残響が必要です。（所持 ${have}/${SRC_FORGE_ECHO_QTY}）` };
  }
  if (player.gold < SRC_FORGE_GOLD_COST) {
    return { ok: false, reason: `Src変質には${SRC_FORGE_GOLD_COST}Gが必要です。（所持 ${player.gold}G）` };
  }
  return { ok: true };
}

export function getKaiSrcInfo(userId: string, inventoryId: number): string {
  const check = canKaiSrc(userId, inventoryId);
  const info = getSrcManifestInfo(userId, inventoryId);
  const have = getItemCount(userId, SRC_FORGE_MATERIAL_ID);
  const player = requirePlayer(userId);
  const matName = (getDb().prepare('SELECT name FROM items WHERE id = ?').get(SRC_FORGE_MATERIAL_ID) as { name: string } | undefined)?.name ?? '星巡の残響';
  return [
    info,
    '',
    `**${matName}**: ${have}/${SRC_FORGE_ECHO_QTY}（ヴァルハラ周回・10%）`,
    `**ゴールド**: ${player.gold}/${SRC_FORGE_GOLD_COST}G`,
    `カイのSrc変質: 星巡の残響×${SRC_FORGE_ECHO_QTY} + ${SRC_FORGE_GOLD_COST}G`,
    check.ok ? '' : `⚠ ${check.reason}`,
  ].filter(Boolean).join('\n');
}

export function kaiSrcTransform(userId: string, inventoryId: number): { success: boolean; message: string } {
  const check = canKaiSrc(userId, inventoryId);
  if (!check.ok) return { success: false, message: check.reason ?? 'Src変質できません。' };

  if (!consumeMaterial(userId, SRC_FORGE_MATERIAL_ID, SRC_FORGE_ECHO_QTY)) {
    return { success: false, message: '星巡の残響が足りません。' };
  }
  if (!spendGold(userId, SRC_FORGE_GOLD_COST)) {
    return { success: false, message: `ゴールドが足りません。（必要 ${SRC_FORGE_GOLD_COST}G）` };
  }

  const row = getDb().prepare(`
    SELECT pi.*, e.src_weapon_id FROM player_inventory pi
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as { src_weapon_id: string | null } | undefined;
  if (!row?.src_weapon_id) return { success: false, message: '変質の名が刻まれていません。' };

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
  const ids = [...STARTER_WEAPON_IDS];
  const placeholders = ids.map(() => '?').join(',');
  return getDb().prepare(`
    SELECT pi.id, i.name, pi.awakening_level FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND e.slot = 'weapon' AND e.is_unique = 0 AND i.rarity != 'Uni'
      AND pi.item_id IN (${placeholders})
      AND pi.awakening_level >= ? AND pi.is_equipped = 0 AND pi.is_pending_reward = 0
    ORDER BY i.name LIMIT 25
  `).all(userId, ...ids, MAX_AWAKENING_LEVEL) as Array<{ id: number; name: string; awakening_level: number }>;
}

export function getKaiSrcCandidates(userId: string) {
  return getDb().prepare(`
    SELECT pi.id, i.name FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND (e.is_unique = 1 OR i.rarity = 'Uni' OR pi.metadata_json LIKE '%kai_unique%')
      AND i.rarity != 'Src' AND e.src_weapon_id IS NOT NULL
      AND pi.item_id != 'wpn_unique_silence'
      AND pi.is_equipped = 0 LIMIT 25
  `).all(userId) as Array<{ id: number; name: string }>;
}
