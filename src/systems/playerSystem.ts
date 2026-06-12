import { getDb } from '../db/database';
import type { Player, StatModifiers } from '../types';
import { nowIso } from '../types';
import { addItem } from './inventorySystem';
import { equipItem } from './equipmentSystem';
import { calcUpgradeStatBonuses, getPrimaryStatKey } from './enhanceSystem';
import { getAwakeningStatFlatBonus } from './awakeningSystem';
import { levelExpRequired, formatLevelUpMessage, expToNextLevel, type AddExpResult } from './expSystem';
import { safeClampCurrentMp } from './combatMp';
import { computeBaseStatsFromLevel, applyJobStatMultipliers } from '../db/seedData/jobMultiplierMaster';

export function getPlayer(userId: string): Player | null {
  return getDb().prepare('SELECT * FROM players WHERE user_id = ?').get(userId) as Player | null;
}

export function requirePlayer(userId: string): Player {
  const p = getPlayer(userId);
  if (!p) throw new Error('未登録です。/start で冒険を始めてください。');
  return p;
}

export function createPlayer(userId: string, guildId: string, name: string, privateChannelId: string): Player {
  const ts = nowIso();
  getDb().prepare(`
    INSERT INTO players (user_id, guild_id, private_channel_id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, guildId, privateChannelId, name, ts, ts);

  getDb().prepare(`INSERT OR IGNORE INTO player_town_unlocks (user_id, town_id, unlocked_at) VALUES (?, 'start_starfield', ?)`).run(userId, ts);
  getDb().prepare(`INSERT OR IGNORE INTO player_town_unlocks (user_id, town_id, unlocked_at) VALUES (?, 'old_road_village', ?)`).run(userId, ts);
  getDb().prepare(`INSERT OR IGNORE INTO player_stats_tracking (user_id, login_streak, last_login_date) VALUES (?, 0, NULL)`).run(userId);

  const swordId = addItem(userId, 'wpn_traveler_sword', 1);
  addItem(userId, 'mat_iron_scrap', 5);
  addItem(userId, 'upg_rough_stone', 2);
  addItem(userId, 'cons_lamp_bottle', 1);
  equipItem(userId, swordId);

  return getPlayer(userId)!;
}

export function updatePrivateChannel(userId: string, channelId: string): void {
  getDb().prepare('UPDATE players SET private_channel_id = ?, updated_at = ? WHERE user_id = ?').run(channelId, nowIso(), userId);
}

export function recalculatePlayerStats(userId: string): Player {
  const db = getDb();
  const player = requirePlayer(userId);
  const oldMaxMp = player.max_mp;
  const base = computeBaseStatsFromLevel(player.level);

  if (player.main_job !== '未選択') {
    applyJobStatMultipliers(base, player.main_job, player.sub_job);
  }

  const equipped = db.prepare(`
    SELECT pi.*, e.*, i.rarity, pi.awakening_level
    FROM player_equipment pe
    JOIN player_inventory pi ON pe.inventory_id = pi.id
    JOIN equipment e ON pi.item_id = e.item_id
    JOIN items i ON pi.item_id = i.id
    WHERE pe.user_id = ?
  `).all(userId) as Array<{
    upgrade_level: number; awakening_level: number; durability_state: string; src_level: number;
    attack_bonus: number; magic_bonus: number; defense_bonus: number;
    spirit_bonus: number; speed_bonus: number; hp_bonus: number; mp_bonus: number;
    crit_rate_bonus: number; crit_damage_bonus: number; accuracy_bonus: number; evasion_bonus: number;
    series_id: string | null; slot: string; rarity: string; weapon_type: string | null;
  }>;

  const setCounts: Record<string, number> = {};
  for (const eq of equipped) {
    const durPenalty = eq.durability_state === '破損' ? 0.7 : eq.durability_state === '損傷' ? 0.85 : eq.durability_state === '摩耗' ? 0.95 : 1;
    const stats = calcUpgradeStatBonuses(
      {
        attack_bonus: eq.attack_bonus, magic_bonus: eq.magic_bonus, defense_bonus: eq.defense_bonus,
        spirit_bonus: eq.spirit_bonus, speed_bonus: eq.speed_bonus, hp_bonus: eq.hp_bonus,
        slot: eq.slot, weapon_type: eq.weapon_type,
      },
      eq.upgrade_level,
      eq.src_level,
      durPenalty,
      eq.rarity,
    );
    base.attack += stats.attack;
    base.magic += stats.magic;
    base.defense += stats.defense;
    base.spirit += stats.spirit;
    base.speed += stats.speed;
    base.max_hp += stats.hp;
    base.max_mp += Math.floor(eq.mp_bonus * durPenalty);
    base.crit_rate += eq.crit_rate_bonus;
    base.crit_damage += eq.crit_damage_bonus;
    base.accuracy += eq.accuracy_bonus;
    base.evasion += eq.evasion_bonus;
    const primary = getPrimaryStatKey({
      attack_bonus: eq.attack_bonus, magic_bonus: eq.magic_bonus,
      defense_bonus: eq.defense_bonus, spirit_bonus: eq.spirit_bonus,
      speed_bonus: eq.speed_bonus, hp_bonus: eq.hp_bonus,
      weapon_type: eq.weapon_type, slot: eq.slot,
    });
    const awBonus = getAwakeningStatFlatBonus(eq.awakening_level ?? 0, primary);
    if (awBonus > 0) {
      if (primary === 'attack') base.attack += awBonus;
      else if (primary === 'magic') base.magic += awBonus;
      else if (primary === 'defense') base.defense += awBonus;
      else base.spirit += awBonus;
      base.max_hp += awBonus;
    }
    if (eq.series_id) setCounts[eq.series_id] = (setCounts[eq.series_id] ?? 0) + 1;
  }

  const mods = applySetBonuses(setCounts);
  base.max_hp = Math.floor(base.max_hp * (1 + mods.hp_pct));
  base.max_mp = Math.floor(base.max_mp * (1 + mods.mp_pct));
  base.attack = Math.floor(base.attack * (1 + mods.attack_pct));
  base.magic = Math.floor(base.magic * (1 + mods.magic_pct));
  base.defense = Math.floor(base.defense * (1 + mods.defense_pct));
  base.spirit = Math.floor(base.spirit * (1 + mods.spirit_pct));
  base.speed = Math.floor(base.speed * (1 + mods.speed_pct));
  base.crit_rate = Math.min(0.8, base.crit_rate + mods.crit_rate);
  base.crit_damage += mods.crit_damage;
  base.accuracy = Math.min(0.99, base.accuracy + mods.accuracy);
  base.evasion = Math.min(0.5, base.evasion + mods.evasion);

  base.max_mp = Math.max(25, base.max_mp);
  const hp = Math.min(player.hp, base.max_hp);
  const mp = safeClampCurrentMp(player.mp, base.max_mp, oldMaxMp);

  db.prepare(`
    UPDATE players SET max_hp=?, max_mp=?, attack=?, magic=?, defense=?, spirit=?, speed=?,
    crit_rate=?, crit_damage=?, accuracy=?, evasion=?, hp=?, mp=?, updated_at=?
    WHERE user_id=?
  `).run(
    base.max_hp, base.max_mp, base.attack, base.magic, base.defense, base.spirit, base.speed,
    base.crit_rate, base.crit_damage, base.accuracy, base.evasion, hp, mp, nowIso(), userId,
  );

  return getPlayer(userId)!;
}

function applySetBonuses(setCounts: Record<string, number>): StatModifiers {
  const db = getDb();
  const mods: StatModifiers = {
    hp_pct: 0, mp_pct: 0, attack_pct: 0, magic_pct: 0, defense_pct: 0, spirit_pct: 0, speed_pct: 0,
    crit_rate: 0, crit_damage: 0, accuracy: 0, evasion: 0, heal_bonus_pct: 0, explore_drop_pct: 0, flee_bonus_pct: 0,
  };

  for (const [setId, count] of Object.entries(setCounts)) {
    const bonuses = db.prepare(`
      SELECT * FROM equipment_set_bonuses WHERE set_id = ? AND piece_count <= ? ORDER BY piece_count DESC
    `).all(setId, count) as Array<{ piece_count: number; effect_json: string }>;

    const applied = new Set<number>();
    for (const b of bonuses) {
      if (applied.has(b.piece_count)) continue;
      applied.add(b.piece_count);
      const effect = JSON.parse(b.effect_json) as Record<string, number>;
      if (effect.hp_pct) mods.hp_pct += effect.hp_pct;
      if (effect.mp_pct) mods.mp_pct += effect.mp_pct;
      if (effect.attack_pct) mods.attack_pct += effect.attack_pct;
      if (effect.magic_pct) mods.magic_pct += effect.magic_pct;
      if (effect.defense_pct) mods.defense_pct += effect.defense_pct;
      if (effect.spirit_pct) mods.spirit_pct += effect.spirit_pct;
      if (effect.speed_pct) mods.speed_pct += effect.speed_pct;
      if (effect.all_stat_pct) {
        mods.hp_pct += effect.all_stat_pct;
        mods.attack_pct += effect.all_stat_pct;
        mods.defense_pct += effect.all_stat_pct;
      }
      if (effect.crit_rate) mods.crit_rate += effect.crit_rate;
      if (effect.crit_damage) mods.crit_damage += effect.crit_damage;
      if (effect.evasion) mods.evasion += effect.evasion;
      if (effect.explore_drop_pct) mods.explore_drop_pct += effect.explore_drop_pct;
      if (effect.flee_bonus_pct) mods.flee_bonus_pct += effect.flee_bonus_pct;
      if (effect.heal_bonus_pct) mods.heal_bonus_pct += effect.heal_bonus_pct;
    }
  }
  return mods;
}

export function getActiveSetEffectLines(userId: string): string[] {
  const db = getDb();
  const equipped = db.prepare(`
    SELECT e.series_id FROM player_equipment pe
    JOIN player_inventory pi ON pe.inventory_id = pi.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pe.user_id = ? AND e.series_id IS NOT NULL
  `).all(userId) as Array<{ series_id: string }>;
  const setCounts: Record<string, number> = {};
  for (const eq of equipped) setCounts[eq.series_id] = (setCounts[eq.series_id] ?? 0) + 1;

  const lines: string[] = [];
  for (const [setId, count] of Object.entries(setCounts)) {
    const set = db.prepare('SELECT name FROM equipment_sets WHERE id = ?').get(setId) as { name: string } | undefined;
    const bonuses = db.prepare(`
      SELECT piece_count, effect_description FROM equipment_set_bonuses
      WHERE set_id = ? AND piece_count <= ? ORDER BY piece_count
    `).all(setId, count) as Array<{ piece_count: number; effect_description: string }>;
    if (!bonuses.length) continue;
    lines.push(`**${set?.name ?? setId}** (${count}部位)`);
    for (const b of bonuses) lines.push(`  ${b.piece_count}部位: ${b.effect_description}`);
  }
  return lines;
}

function collectLevelUpUnlockHints(userId: string, oldLevel: number, newLevel: number): string[] {
  const player = requirePlayer(userId);
  const hints: string[] = [];
  if (oldLevel < 20 && newLevel >= 20 && !player.sub_job) {
    hints.push('副職が選べるようになる');
  }
  return hints;
}

export function addExp(userId: string, exp: number): AddExpResult {
  const player = requirePlayer(userId);
  const oldLevel = player.level;
  let newExp = player.exp + exp;
  let newLevel = player.level;
  let totalExp = player.total_exp + exp;
  let leveledUp = false;

  while (newExp >= levelExpRequired(newLevel)) {
    newExp -= levelExpRequired(newLevel);
    newLevel++;
    leveledUp = true;
  }

  getDb().prepare('UPDATE players SET exp=?, level=?, total_exp=?, updated_at=? WHERE user_id=?')
    .run(newExp, newLevel, totalExp, nowIso(), userId);

  let levelUpMessage: string | undefined;
  if (leveledUp) {
    const p = recalculatePlayerStats(userId);
    getDb().prepare('UPDATE players SET hp=max_hp, mp=max_mp WHERE user_id=?').run(userId);
    const extras = collectLevelUpUnlockHints(userId, oldLevel, newLevel);
    levelUpMessage = formatLevelUpMessage(oldLevel, newLevel, extras);
    return {
      leveledUp: true,
      newLevel: p.level,
      oldLevel,
      levelUpMessage,
      expGained: exp,
      expToNext: expToNextLevel(p.level, newExp),
    };
  }
  return {
    leveledUp: false,
    newLevel,
    expGained: exp,
    expToNext: expToNextLevel(newLevel, newExp),
  };
}

export { levelExpRequired };

export function addGold(userId: string, amount: number): void {
  getDb().prepare('UPDATE players SET gold = gold + ?, updated_at = ? WHERE user_id = ?').run(amount, nowIso(), userId);
}

export function spendGold(userId: string, amount: number): boolean {
  const p = requirePlayer(userId);
  if (p.gold < amount) return false;
  getDb().prepare('UPDATE players SET gold = gold - ?, updated_at = ? WHERE user_id = ?').run(amount, nowIso(), userId);
  return true;
}

export function unlockTown(userId: string, townId: string): void {
  getDb().prepare('INSERT OR IGNORE INTO player_town_unlocks (user_id, town_id, unlocked_at) VALUES (?, ?, ?)')
    .run(userId, townId, nowIso());
}

export function getUnlockedTowns(userId: string): string[] {
  return (getDb().prepare('SELECT town_id FROM player_town_unlocks WHERE user_id = ?').all(userId) as { town_id: string }[])
    .map((r) => r.town_id);
}

export function setPlayerTown(userId: string, townId: string): void {
  getDb().prepare('UPDATE players SET current_town_id = ?, updated_at = ? WHERE user_id = ?').run(townId, nowIso(), userId);
}

export function healPlayer(userId: string, ratio = 1): void {
  const p = requirePlayer(userId);
  getDb().prepare('UPDATE players SET hp = ?, mp = ?, updated_at = ? WHERE user_id = ?')
    .run(Math.floor(p.max_hp * ratio), Math.floor(p.max_mp * ratio), nowIso(), userId);
}
