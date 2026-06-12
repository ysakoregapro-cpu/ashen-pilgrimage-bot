import { getDb } from '../db/database';
import { nowIso } from '../types';
import {
  KAI_UNIQUE_TARGETS, MAX_AWAKENING_LEVEL, awakeningLabel, isMaxAwakening,
  SRC_FORGE_MATERIAL_ID, UNI_FORGE_MATERIAL_IDS, MAT_STARFALL_OBSIDIAN, MAT_BLACK_LANTERN_CINDER,
} from '../db/seedData/awakeningMaster';
import { isJobStarterWeapon, STARTER_WEAPON_IDS } from '../db/seedData/jobStarterWeapons';
import { hasStoryFlag, setStoryFlag } from './storySystem';
import { unlockTownForPlayer } from './townSystem';
import { getItemCount, consumeMaterial } from './inventorySystem';
import { getSrcManifestInfo } from './srcWeaponSystem';
import { recalculatePlayerStats } from './playerSystem';

function uniMaterialStatus(userId: string): { ok: boolean; reason?: string; lines: string[] } {
  const star = getItemCount(userId, MAT_STARFALL_OBSIDIAN);
  const lantern = getItemCount(userId, MAT_BLACK_LANTERN_CINDER);
  const starName = (getDb().prepare('SELECT name FROM items WHERE id = ?').get(MAT_STARFALL_OBSIDIAN) as { name: string } | undefined)?.name ?? '星見の残光';
  const lanternName = (getDb().prepare('SELECT name FROM items WHERE id = ?').get(MAT_BLACK_LANTERN_CINDER) as { name: string } | undefined)?.name ?? '黒灯の残滓';
  const lines = [
    `**${starName}**: ${star}/1（星落ちの観測所ボス再戦）`,
    `**${lanternName}**: ${lantern}/1（黒灯りの路地ボス再戦）`,
  ];
  if (star < 1 || lantern < 1) {
    return { ok: false, reason: '伝承の素材が足りない。星の落ちた場所と黒い灯の路地で、再戦素材を集めろ。', lines };
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
  const mats = uniMaterialStatus(userId);
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
  const mats = uniMaterialStatus(userId);
  const lines = [
    `**${row.name}** — ${awakeningLabel(row.awakening_level)}`,
    'カイの伝承（昇華）: 最大覚醒 + 星見の残光 + 黒灯の残滓',
    ...mats.lines,
    target ? `→ **${(getDb().prepare('SELECT name FROM items WHERE id = ?').get(target) as { name: string })?.name ?? target}**（Uni）` : '→ Uni武器として刻印',
  ];
  if (!check.ok) lines.push(`\n⚠ ${check.reason}`);
  return lines.join('\n');
}

export function kaiUniqueTransform(userId: string, inventoryId: number): { success: boolean; message: string } {
  const check = canKaiUnique(userId, inventoryId);
  if (!check.ok) return { success: false, message: check.reason ?? '伝承できません。' };

  for (const matId of UNI_FORGE_MATERIAL_IDS) {
    if (!consumeMaterial(userId, matId, 1)) {
      return { success: false, message: '伝承の素材が足りません。' };
    }
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
  if (have < 1) {
    return { ok: false, reason: `Src変質の素材（星巡の残響）が必要です。（所持 ${have}）` };
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
    `**${matName}**: ${have}/1（ヴァルハラ周回・低確率）`,
    'カイのSrc変質: 素材1個のみ（ゴールド不要）',
    check.ok ? '' : `⚠ ${check.reason}`,
  ].filter(Boolean).join('\n');
}

export function kaiSrcTransform(userId: string, inventoryId: number): { success: boolean; message: string } {
  const check = canKaiSrc(userId, inventoryId);
  if (!check.ok) return { success: false, message: check.reason ?? 'Src変質できません。' };

  if (!consumeMaterial(userId, SRC_FORGE_MATERIAL_ID, 1)) {
    return { success: false, message: '星巡の残響が足りません。' };
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
