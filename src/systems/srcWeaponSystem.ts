import { getDb } from '../db/database';
import { getItemCount, consumeMaterial } from './inventorySystem';
import { spendGold } from './playerSystem';
import { nowIso } from '../types';

export function getSrcManifestInfo(userId: string, inventoryId: number): string {
  const row = getDb().prepare(`
    SELECT pi.*, i.name, e.is_unique, e.src_weapon_id FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ? AND e.is_unique = 1
  `).get(inventoryId, userId) as { item_id: string; name: string; src_weapon_id: string | null } | undefined;
  if (!row?.src_weapon_id) return 'ユニーク武器ではありません。';

  const src = getDb().prepare('SELECT * FROM src_weapons WHERE id = ?').get(row.src_weapon_id) as {
    name: string; manifest_requirements_json: string; innate_skill_id: string; plus10_effect: string;
  };
  const req = JSON.parse(src.manifest_requirements_json) as { gold: number; materials: Array<{ id: string; qty: number }> };
  const lines = [`**${row.name}** → **${src.name}**`, `固有スキル: ${src.innate_skill_id}`, `+10効果: ${src.plus10_effect}`, `必要ゴールド: ${req.gold}G`];
  for (const m of req.materials) {
    const item = getDb().prepare('SELECT name FROM items WHERE id = ?').get(m.id) as { name: string };
    const have = getItemCount(userId, m.id);
    lines.push(`${have >= m.qty ? '✅' : '❌'} ${item.name}: ${have}/${m.qty}`);
  }
  return lines.join('\n');
}

export function manifestSrcWeapon(userId: string, inventoryId: number): { success: boolean; message: string } {
  const row = getDb().prepare(`
    SELECT pi.*, i.name, e.is_unique, e.src_weapon_id FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ? AND e.is_unique = 1
  `).get(inventoryId, userId) as { id: number; item_id: string; name: string; src_weapon_id: string | null } | undefined;
  if (!row?.src_weapon_id) return { success: false, message: 'ユニーク武器ではありません。' };

  const src = getDb().prepare('SELECT * FROM src_weapons WHERE id = ?').get(row.src_weapon_id) as {
    src_item_id: string; name: string; manifest_requirements_json: string;
  };
  const req = JSON.parse(src.manifest_requirements_json) as { gold: number; materials: Array<{ id: string; qty: number }> };

  if (!spendGold(userId, req.gold)) return { success: false, message: `ゴールドが足りません（${req.gold}G）。` };
  for (const m of req.materials) {
    if (getItemCount(userId, m.id) < m.qty) {
      const item = getDb().prepare('SELECT name FROM items WHERE id = ?').get(m.id) as { name: string };
      return { success: false, message: `${item.name}が足りません。` };
    }
  }
  for (const m of req.materials) consumeMaterial(userId, m.id, m.qty);

  getDb().prepare('UPDATE player_inventory SET item_id = ?, src_level = 0, awakening_level = 0, upgrade_level = 0, updated_at = ? WHERE id = ?')
    .run(src.src_item_id, nowIso(), row.id);

  return { success: true, message: `✨ ${row.name}が${src.name}にSrc化した！\n伝承が始まる…` };
}

export function getUniqueWeapons(userId: string) {
  return getDb().prepare(`
    SELECT pi.id, i.name, i.rarity FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND e.is_unique = 1 AND pi.is_equipped = 0
  `).all(userId);
}

export function getSrcWeapons(userId: string) {
  return getDb().prepare(`
    SELECT pi.id, i.name, pi.src_level FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ? AND i.rarity = 'Src'
  `).all(userId);
}
