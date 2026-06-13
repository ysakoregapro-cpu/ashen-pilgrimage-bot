import { getDb } from '../db/database';
import { recalculatePlayerStats, requirePlayer, spendGold } from './playerSystem';
import { consumeMaterial, getItemCount } from './inventorySystem';
import { canPerformItemAction } from './itemProtectionSystem';
import { incrementWeeklyProgress } from './weeklySystem';
import { nowIso, DURABILITY_ORDER, type DurabilityState } from '../types';
import {
  getEnhanceRequirement, getMaxUpgradeLevel, formatEnhanceDiff, formatEnhancePreview,
} from './enhanceSystem';
import { MAX_SRC_WEAPON_LEVEL } from '../db/seedData/weaponTierBalanceMaster';

export { getEnhanceRequirement, formatEnhancePreview } from './enhanceSystem';

type EnhanceReq = ReturnType<typeof getEnhanceRequirement>;

function statPreview(
  row: { attack_bonus?: number; defense_bonus?: number; magic_bonus?: number; spirit_bonus?: number; weapon_type?: string | null; slot: string; rarity: string },
  level: number,
  srcLevel: number,
): string {
  return formatEnhanceDiff(
    {
      attack_bonus: row.attack_bonus ?? 0,
      magic_bonus: row.magic_bonus ?? 0,
      defense_bonus: row.defense_bonus ?? 0,
      spirit_bonus: row.spirit_bonus ?? 0,
      speed_bonus: 0,
      hp_bonus: 0,
      weapon_type: row.weapon_type,
      slot: row.slot,
    },
    level,
    srcLevel,
    row.rarity,
  );
}

export function enhanceEquipment(userId: string, inventoryId: number): { success: boolean; message: string } {
  const check = canPerformItemAction(inventoryId, userId, 'dismantle');
  if (!check.ok && check.reason?.includes('道中')) return { success: false, message: check.reason! };

  const row = getDb().prepare(`
    SELECT pi.*, i.rarity, i.name, e.max_upgrade_level, e.weapon_type, e.slot, e.series_id,
      e.attack_bonus, e.magic_bonus, e.defense_bonus, e.spirit_bonus
    FROM player_inventory pi JOIN items i ON pi.item_id = i.id JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as {
    upgrade_level: number; src_level: number; rarity: string; name: string;
    max_upgrade_level: number; is_equipped: number;
    attack_bonus: number; magic_bonus: number; defense_bonus: number; spirit_bonus: number;
    weapon_type: string | null; slot: string;
  } | undefined;
  if (!row) return { success: false, message: '装備が見つかりません。' };
  if (row.rarity === 'Src') {
    return enhanceSrcWeapon(userId, inventoryId);
  }

  const maxLevel = getMaxUpgradeLevel(row.rarity, row.max_upgrade_level);
  const currentLevel = row.upgrade_level;
  if (currentLevel >= maxLevel) return { success: false, message: 'これ以上強化できません。' };

  const req = getEnhanceRequirement(currentLevel, row.rarity);
  if (!spendGold(userId, req.goldCost)) return { success: false, message: `ゴールドが足りません（${req.goldCost}G必要）。` };
  if (getItemCount(userId, req.stoneId) < req.stoneQty) {
    return { success: false, message: `${req.stoneName}が足りません（${req.stoneQty}個必要、所持${getItemCount(userId, req.stoneId)}）。` };
  }
  consumeMaterial(userId, req.stoneId, req.stoneQty);

  getDb().prepare('UPDATE player_inventory SET upgrade_level = upgrade_level + 1, updated_at = ? WHERE id = ?').run(nowIso(), inventoryId);

  if (row.is_equipped) recalculatePlayerStats(userId);
  incrementWeeklyProgress(userId, 'upgrade_count');
  const diff = statPreview(row, currentLevel + 1, row.src_level);
  return {
    success: true,
    message: [
      `「${row.name}」を+${currentLevel}→+${currentLevel + 1}に強化しました。`,
      formatEnhancePreview(req, currentLevel),
      diff ? `**変化**\n${diff}` : '',
    ].filter(Boolean).join('\n'),
  };
}

export function dismantleEquipment(userId: string, inventoryId: number): { success: boolean; message: string } {
  const prot = canPerformItemAction(inventoryId, userId, 'dismantle');
  if (!prot.ok) return { success: false, message: prot.reason ?? '分解できません。' };

  const row = getDb().prepare(`
    SELECT pi.*, i.rarity, i.name, e.series_id FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ? AND pi.is_equipped = 0
  `).get(inventoryId, userId) as { rarity: string; name: string; series_id: string | null } | undefined;
  if (!row) return { success: false, message: '装備が見つからないか、装備中です。' };

  const materials = getDismantleRewards(row.rarity, row.series_id);
  getDb().prepare('DELETE FROM player_inventory WHERE id = ?').run(inventoryId);

  const msgs: string[] = [];
  for (const m of materials) {
    const existing = getDb().prepare('SELECT id, quantity FROM player_inventory WHERE user_id=? AND item_id=? AND is_equipped=0 LIMIT 1').get(userId, m.id) as { id: number; quantity: number } | undefined;
    if (existing) {
      getDb().prepare('UPDATE player_inventory SET quantity=quantity+?, updated_at=? WHERE id=?').run(m.qty, nowIso(), existing.id);
    } else {
      getDb().prepare('INSERT INTO player_inventory (user_id, item_id, quantity, created_at, updated_at) VALUES (?,?,?,?,?)').run(userId, m.id, m.qty, nowIso(), nowIso());
    }
    const itemName = getDb().prepare('SELECT name FROM items WHERE id=?').get(m.id) as { name: string };
    msgs.push(`${itemName.name}x${m.qty}`);
  }
  return { success: true, message: `「${row.name}」を分解。\n入手: ${msgs.join(', ')}` };
}

function getDismantleRewards(rarity: string, seriesId: string | null): Array<{ id: string; qty: number }> {
  const rewards: Array<{ id: string; qty: number }> = [];
  if (rarity === 'N') rewards.push({ id: 'mat_iron_scrap', qty: 2 }, { id: 'dism_torn_cloth', qty: 1 });
  else if (rarity === 'R') rewards.push({ id: 'mat_iron_scrap', qty: 3 }, { id: 'dism_rust_iron', qty: 2 });
  else if (rarity === 'SR') rewards.push({ id: 'upg_fine_stone', qty: 1 }, { id: 'mat_small_mana', qty: 2 });
  else if (rarity === 'SSR') rewards.push({ id: 'upg_rare_stone', qty: 1 }, { id: 'mat_small_mana', qty: 3 });
  else if (rarity === 'UR') rewards.push({ id: 'upg_rare_stone', qty: 2 }, { id: 'mat_small_mana', qty: 5 });

  const seriesMap: Record<string, string> = {
    set_starfield: 'dism_starfield_cloth', set_silver: 'dism_silver_plate', set_mist: 'dism_mist_thread',
    set_moon: 'dism_moon_fiber', set_ash_crown: 'dism_ash_steel', set_deep_furnace: 'dism_deep_core',
    set_old_king: 'dism_old_king',
  };
  if (seriesId && seriesMap[seriesId]) rewards.push({ id: seriesMap[seriesId], qty: 1 });
  return rewards;
}

export function repairEquipment(userId: string, inventoryId: number): { success: boolean; message: string } {
  const row = getDb().prepare(`
    SELECT pi.*, i.name FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as { durability_state: DurabilityState; name: string; is_equipped: number } | undefined;
  if (!row) return { success: false, message: '装備が見つかりません。' };
  if (row.durability_state === '良好') return { success: false, message: '修理の必要はありません。' };

  const goldCost = row.durability_state === '破損' ? 500 : row.durability_state === '損傷' ? 200 : 80;
  if (!spendGold(userId, goldCost)) return { success: false, message: `ゴールドが足りません（${goldCost}G必要）。` };
  if (getItemCount(userId, 'rep_patch') < 1) return { success: false, message: '補修布が足りません。' };
  consumeMaterial(userId, 'rep_patch', 1);

  const idx = DURABILITY_ORDER.indexOf(row.durability_state);
  const newState = DURABILITY_ORDER[Math.max(0, idx - 1)]!;
  getDb().prepare('UPDATE player_inventory SET durability_state = ?, updated_at = ? WHERE id = ?').run(newState, nowIso(), inventoryId);
  if (row.is_equipped) recalculatePlayerStats(userId);
  return { success: true, message: `「${row.name}」を修理しました。（${row.durability_state}→${newState}）` };
}

export function getSrcUpgradeInfo(userId: string, inventoryId: number): string {
  const row = getDb().prepare(`
    SELECT pi.*, i.name, e.src_weapon_id FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as { src_level: number; name: string; src_weapon_id: string | null } | undefined;
  if (!row?.src_weapon_id) return 'Src武器ではありません。';

  const nextLevel = row.src_level + 1;
  if (nextLevel > MAX_SRC_WEAPON_LEVEL) return `「${row.name}」はSrc+${MAX_SRC_WEAPON_LEVEL}が最大です。`;

  const upg = getDb().prepare('SELECT * FROM src_weapon_upgrades WHERE src_weapon_id = ? AND target_src_level = ?')
    .get(row.src_weapon_id, nextLevel) as { gold_cost: number; material_requirements_json: string; effect_description: string } | undefined;
  if (!upg) return '強化情報が見つかりません。';

  const mats = JSON.parse(upg.material_requirements_json) as Array<{ id: string; qty: number }>;
  const lines = [`**${row.name}** → Src+${nextLevel}`, `効果: ${upg.effect_description}`, `必要ゴールド: ${upg.gold_cost}G`];
  for (const m of mats) {
    const item = getDb().prepare('SELECT name FROM items WHERE id = ?').get(m.id) as { name: string };
    const have = getItemCount(userId, m.id);
    const ok = have >= m.qty ? '✅' : '❌';
    lines.push(`${ok} ${item.name}: ${have}/${m.qty}`);
  }
  return lines.join('\n');
}

export function enhanceSrcWeapon(userId: string, inventoryId: number): { success: boolean; message: string } {
  const row = getDb().prepare(`
    SELECT pi.*, i.name, e.src_weapon_id FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as { src_level: number; name: string; src_weapon_id: string | null; is_equipped: number } | undefined;
  if (!row?.src_weapon_id) return { success: false, message: 'Src武器ではありません。' };

  const nextLevel = row.src_level + 1;
  if (nextLevel > MAX_SRC_WEAPON_LEVEL) return { success: false, message: '最大強化済みです。' };

  const upg = getDb().prepare('SELECT * FROM src_weapon_upgrades WHERE src_weapon_id = ? AND target_src_level = ?')
    .get(row.src_weapon_id, nextLevel) as { gold_cost: number; material_requirements_json: string; effect_description: string };
  const mats = JSON.parse(upg.material_requirements_json) as Array<{ id: string; qty: number }>;

  if (!spendGold(userId, upg.gold_cost)) return { success: false, message: `ゴールドが足りません（${upg.gold_cost}G）。` };
  for (const m of mats) {
    if (getItemCount(userId, m.id) < m.qty) {
      const item = getDb().prepare('SELECT name FROM items WHERE id = ?').get(m.id) as { name: string };
      return { success: false, message: `${item.name}が足りません（${getItemCount(userId, m.id)}/${m.qty}）。` };
    }
  }
  for (const m of mats) consumeMaterial(userId, m.id, m.qty);

  getDb().prepare('UPDATE player_inventory SET src_level = ?, updated_at = ? WHERE id = ?').run(nextLevel, nowIso(), inventoryId);
  if (row.is_equipped) recalculatePlayerStats(userId);
  incrementWeeklyProgress(userId, 'upgrade_count');
  return { success: true, message: `「${row.name}」をSrc+${nextLevel}に強化！\n${upg.effect_description}` };
}

export function listMaterials(userId: string): string {
  const rows = getDb().prepare(`
    SELECT i.name, i.category, i.rarity, SUM(pi.quantity) as total, i.description
    FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ? AND i.category != 'equipment' AND i.category != 'consumable'
    GROUP BY i.id ORDER BY i.category, i.rarity DESC
  `).all(userId) as Array<{ name: string; category: string; rarity: string; total: number }>;
  if (!rows.length) return '素材を所持していません。';
  return rows.map((r) => `[${r.rarity}] ${r.name} x${r.total}`).join('\n');
}

export function getEnhanceableEquipment(userId: string) {
  return getDb().prepare(`
    SELECT pi.id, i.name, i.rarity, pi.upgrade_level, pi.src_level, pi.durability_state, pi.is_equipped,
      pi.awakening_level, e.slot
    FROM player_inventory pi JOIN items i ON pi.item_id = i.id JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND pi.is_pending_reward = 0 ORDER BY pi.is_equipped DESC, i.rarity DESC
  `).all(userId);
}
