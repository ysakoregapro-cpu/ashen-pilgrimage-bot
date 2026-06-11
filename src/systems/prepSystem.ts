import { getDb } from '../db/database';
import { equipItem, getEquipped, getEquippableItems } from './equipmentSystem';
import { recalculatePlayerStats, requirePlayer } from './playerSystem';
import { SLOT_LABELS, type EquipmentSlot } from '../types';

const PREP_SLOTS: EquipmentSlot[] = [
  'weapon', 'head', 'body', 'arms', 'legs', 'feet', 'accessory1', 'accessory2', 'sub',
];

export function checkEquipRequirements(userId: string, inventoryId: number): { ok: boolean; reason?: string } {
  const row = getDb().prepare(`
    SELECT pi.*, i.rarity, i.name, e.required_level, e.required_job, e.slot
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as {
    required_level: number | null; required_job: string | null; name: string; rarity: string;
  } | undefined;
  if (!row) return { ok: false, reason: '装備が見つかりません。' };

  const player = requirePlayer(userId);
  const reqLv = row.required_level ?? defaultRequiredLevel(row.rarity);
  if (player.level < reqLv) {
    return { ok: false, reason: `「${row.name}」はLv${reqLv}以上で装備できる。（現在Lv${player.level}）` };
  }
  if (row.required_job && player.main_job !== row.required_job && player.sub_job !== row.required_job) {
    return { ok: false, reason: `「${row.name}」は${row.required_job}向けの装備だ。` };
  }
  return { ok: true };
}

function defaultRequiredLevel(rarity: string): number {
  const map: Record<string, number> = { N: 1, R: 5, SR: 20, SSR: 40, UR: 58, Src: 50 };
  return map[rarity] ?? 1;
}

export function equipWithDiff(userId: string, inventoryId: number): { ok: boolean; message: string } {
  const before = getStatSnapshot(userId);
  const slotRow = getDb().prepare(`
    SELECT e.slot, i.name, pi.upgrade_level FROM player_inventory pi
    JOIN equipment e ON pi.item_id = e.item_id JOIN items i ON pi.item_id = i.id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as { slot: EquipmentSlot; name: string; upgrade_level: number } | undefined;
  if (!slotRow) return { ok: false, message: '装備が見つかりません。' };

  const req = checkEquipRequirements(userId, inventoryId);
  if (!req.ok) return { ok: false, message: req.reason ?? '装備できません。' };

  const oldEq = getEquipped(userId).find((e) => (e as { slot: string }).slot === slotRow.slot) as {
    name: string | null; upgrade_level: number; attack_bonus?: number;
  } | undefined;

  const msg = equipItem(userId, inventoryId);
  if (msg.includes('見つかりません') || msg.includes('装備中')) {
    return { ok: false, message: msg };
  }

  const after = getStatSnapshot(userId);
  const lines = [`**${SLOT_LABELS[slotRow.slot] ?? slotRow.slot}**を変更しました。`, ''];
  if (oldEq?.name) {
    lines.push('**変更前:**', `${oldEq.name}${oldEq.upgrade_level ? ` +${oldEq.upgrade_level}` : ''}`);
  }
  lines.push('**変更後:**', `${slotRow.name}${slotRow.upgrade_level ? ` +${slotRow.upgrade_level}` : ''}`, '');
  lines.push('**変化:**');
  for (const key of ['attack', 'magic', 'defense', 'spirit', 'speed'] as const) {
    const diff = after[key] - before[key];
    if (diff !== 0) lines.push(`${statLabel(key)} ${diff > 0 ? '+' : ''}${diff}`);
  }
  return { ok: true, message: lines.join('\n') };
}

function statLabel(k: string): string {
  const map: Record<string, string> = { attack: '攻撃', magic: '魔力', defense: '防御', spirit: '精神', speed: '速度' };
  return map[k] ?? k;
}

function getStatSnapshot(userId: string) {
  recalculatePlayerStats(userId);
  const p = requirePlayer(userId);
  return { attack: p.attack, magic: p.magic, defense: p.defense, spirit: p.spirit, speed: p.speed };
}

export function getPrepSlotOptions(userId: string, slot: EquipmentSlot) {
  const items = getEquippableItems(userId, slot) as Array<{
    id: number; name: string; rarity: string; upgrade_level: number;
    attack_bonus?: number; defense_bonus?: number; magic_bonus?: number;
  }>;
  const player = requirePlayer(userId);
  return items.map((i) => {
    const reqLv = defaultRequiredLevel(i.rarity);
    const canEquip = player.level >= reqLv;
    const stats: string[] = [];
    if ((i as { attack_bonus?: number }).attack_bonus) stats.push(`攻+${(i as { attack_bonus: number }).attack_bonus}`);
    return {
      inventoryId: i.id,
      label: `${i.name}${i.upgrade_level ? ` +${i.upgrade_level}` : ''}`,
      description: canEquip ? `[${i.rarity}] ${stats.join(' ')}` : `Lv${reqLv}必要`,
      disabled: !canEquip,
    };
  });
}

export function formatCurrentEquipment(userId: string): string {
  const equipped = getEquipped(userId) as Array<{ slot: string; name: string | null; upgrade_level: number; rarity: string | null }>;
  return PREP_SLOTS.map((s) => {
    const eq = equipped.find((e) => e.slot === s);
    if (eq?.name) {
      const upg = eq.upgrade_level > 0 ? ` +${eq.upgrade_level}` : '';
      return `**${SLOT_LABELS[s]}**: ${eq.name}${upg}`;
    }
    return `**${SLOT_LABELS[s]}**: —`;
  }).join('\n');
}

export { PREP_SLOTS };
