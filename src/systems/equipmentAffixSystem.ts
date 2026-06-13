import type Database from 'better-sqlite3';
import { nowIso } from '../types';
import {
  AFFIX_LABELS,
  type AffixPrimaryKey,
  type AffixRollSource,
  type EquipmentAffixEntry,
  type EquipmentRollPayload,
  type EquipmentStatRoll,
  buildAffixEntry,
  buildGodRollAffixes,
  COMBAT_AFFIX_CLAMP,
  isAffixEligibleRarity,
  isArmorOrAccessorySlot,
  PARAM_AFFIX_KEYS,
  rollAffixKind,
  rollSkillCount,
  rollStatMultipliers,
  shouldRollAffixes,
} from '../db/seedData/equipmentAffixMaster';

export type { EquipmentAffixEntry, EquipmentRollPayload, EquipmentStatRoll, AffixRollSource };

export type CombatAffixMods = {
  damage_dealt_pct: number;
  damage_dealt_down_pct: number;
  damage_taken_reduction_pct: number;
  damage_taken_increase_pct: number;
};

export function parseEquipmentRoll(affixJson: string | null, statRollJson: string | null): EquipmentRollPayload | null {
  try {
    const affixes = affixJson ? JSON.parse(affixJson) as EquipmentAffixEntry[] : [];
    const statRoll = statRollJson ? JSON.parse(statRollJson) as EquipmentStatRoll : { quality: 1, multipliers: {} };
    if (!affixes.length && (!statRoll.multipliers || !Object.keys(statRoll.multipliers).length)) return null;
    return { statRoll, affixes, rollSource: 'unknown', rolledAt: '' };
  } catch {
    return null;
  }
}

export function serializeAffixes(affixes: EquipmentAffixEntry[]): string {
  return JSON.stringify(affixes);
}

export function serializeStatRoll(statRoll: EquipmentStatRoll): string {
  return JSON.stringify(statRoll);
}

function availableParamKeysFromEquipment(row: {
  hp_bonus?: number; mp_bonus?: number; attack_bonus?: number; magic_bonus?: number;
  defense_bonus?: number; speed_bonus?: number; crit_rate_bonus?: number;
}): AffixPrimaryKey[] {
  const out: AffixPrimaryKey[] = [];
  if ((row.hp_bonus ?? 0) > 0) out.push('hp_percent');
  if ((row.mp_bonus ?? 0) > 0) out.push('mp_percent');
  if ((row.attack_bonus ?? 0) > 0) out.push('attack_percent');
  if ((row.magic_bonus ?? 0) > 0) out.push('magic_percent');
  if ((row.defense_bonus ?? 0) > 0) out.push('defense_percent');
  if ((row.speed_bonus ?? 0) > 0) out.push('speed_percent');
  if ((row.crit_rate_bonus ?? 0) > 0) out.push('crit_percent');
  return out.length ? out : [...PARAM_AFFIX_KEYS];
}

export function rollEquipmentInstance(opts: {
  rarity: string;
  slot: string;
  rollSource: AffixRollSource | 'valhalla_test_godroll';
  baseStats: {
    hp_bonus?: number; mp_bonus?: number; attack_bonus?: number; magic_bonus?: number;
    defense_bonus?: number; speed_bonus?: number; crit_rate_bonus?: number;
  };
  valhallaOrRaid?: boolean;
  godRoll?: boolean;
  rng?: () => number;
}): { affix_json: string | null; stat_roll_json: string | null } {
  if (!isArmorOrAccessorySlot(opts.slot) || !isAffixEligibleRarity(opts.rarity)) {
    return { affix_json: null, stat_roll_json: null };
  }
  const rng = opts.rng ?? Math.random;
  const statRoll = rollStatMultipliers(opts.rarity, {
    hp: opts.baseStats.hp_bonus,
    mp: opts.baseStats.mp_bonus,
    attack: opts.baseStats.attack_bonus,
    magic: opts.baseStats.magic_bonus,
    defense: opts.baseStats.defense_bonus,
    speed: opts.baseStats.speed_bonus,
    crit: opts.baseStats.crit_rate_bonus,
  }, rng);

  let affixes: EquipmentAffixEntry[] = [];
  if (opts.godRoll) {
    affixes = buildGodRollAffixes();
  } else if (shouldRollAffixes(opts.rollSource)) {
    const skillCount = rollSkillCount(opts.rarity, { valhallaOrRaid: opts.valhallaOrRaid }, rng);
    const used = new Set<AffixPrimaryKey>();
    const available = availableParamKeysFromEquipment(opts.baseStats);
    for (let i = 0; i < skillCount; i++) {
      const kind = rollAffixKind(rng);
      affixes.push(buildAffixEntry(kind, opts.rarity, used, available, rng));
    }
  }

  return {
    affix_json: affixes.length ? serializeAffixes(affixes) : null,
    stat_roll_json: Object.keys(statRoll.multipliers).length ? serializeStatRoll(statRoll) : null,
  };
}

export function loadEquipmentRollFromRow(row: {
  affix_json?: string | null; stat_roll_json?: string | null;
}): EquipmentRollPayload | null {
  return parseEquipmentRoll(row.affix_json ?? null, row.stat_roll_json ?? null);
}

export function formatAffixLine(affix: EquipmentAffixEntry): string {
  const primary = `${affix.label} +${affix.value.toFixed(1)}%`;
  if (affix.drawbackKey && affix.drawbackValue > 0) {
    const dLabel = AFFIX_LABELS[affix.drawbackKey];
    return `${primary} / ${dLabel} -${affix.drawbackValue.toFixed(1)}%`;
  }
  return primary;
}

export function formatAffixSummary(affixes: EquipmentAffixEntry[]): string {
  if (!affixes.length) return '';
  const high = affixes.some((a) => a.value >= 5.0);
  return `特性${affixes.length}${high ? ' / 高補正' : ''}`;
}

export function formatStatRollLines(statRoll: EquipmentStatRoll | null | undefined): string[] {
  if (!statRoll?.multipliers) return [];
  const labelMap: Record<string, string> = {
    hp: 'HP', mp: 'MP', attack: '攻撃', magic: '魔力', defense: '防御', speed: '速度', crit: '会心',
  };
  return Object.entries(statRoll.multipliers).map(([k, v]) => {
    const pct = Math.round((v - 1) * 100);
    return `${labelMap[k] ?? k} ${pct >= 0 ? '+' : ''}${pct}%`;
  });
}

export function aggregateAffixStatPercents(affixes: EquipmentAffixEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (key: string, val: number, sign: 1 | -1) => {
    out[key] = (out[key] ?? 0) + sign * val;
  };
  for (const a of affixes) {
    add(a.key, a.value, 1);
    if (a.drawbackKey && a.drawbackValue > 0) {
      const map: Record<string, string> = {
        hp_down_percent: 'hp_percent',
        mp_down_percent: 'mp_percent',
        attack_down_percent: 'attack_percent',
        magic_down_percent: 'magic_percent',
        defense_down_percent: 'defense_percent',
        speed_down_percent: 'speed_percent',
        damage_dealt_down_percent: 'damage_dealt_percent',
        damage_taken_increase_percent: 'damage_taken_reduction_percent',
      };
      const target = map[a.drawbackKey] ?? a.drawbackKey;
      add(target, a.drawbackValue, -1);
    }
  }
  return out;
}

export function sumCombatAffixMods(affixLists: EquipmentAffixEntry[][]): CombatAffixMods {
  const total: CombatAffixMods = {
    damage_dealt_pct: 0, damage_dealt_down_pct: 0,
    damage_taken_reduction_pct: 0, damage_taken_increase_pct: 0,
  };
  for (const affixes of affixLists) {
    for (const a of affixes) {
      if (a.key === 'damage_dealt_percent') total.damage_dealt_pct += a.value;
      if (a.key === 'damage_taken_reduction_percent') total.damage_taken_reduction_pct += a.value;
      if (a.drawbackKey === 'damage_dealt_down_percent') total.damage_dealt_down_pct += a.drawbackValue;
      if (a.drawbackKey === 'damage_taken_increase_percent') total.damage_taken_increase_pct += a.drawbackValue;
    }
  }
  return total;
}

export function applyStatRollMultiplier(base: number, mult: number | undefined): number {
  if (!mult || mult === 1) return base;
  return Math.floor(base * mult);
}

export function getEquippedAffixRows(db: Database.Database, userId: string): Array<{
  affixes: EquipmentAffixEntry[]; statRoll: EquipmentStatRoll | null; slot: string; rarity: string;
}> {
  const rows = db.prepare(`
    SELECT pi.affix_json, pi.stat_roll_json, e.slot, i.rarity
    FROM player_equipment pe
    JOIN player_inventory pi ON pe.inventory_id = pi.id
    JOIN equipment e ON pi.item_id = e.item_id
    JOIN items i ON pi.item_id = i.id
    WHERE pe.user_id = ?
  `).all(userId) as Array<{ affix_json: string | null; stat_roll_json: string | null; slot: string; rarity: string }>;

  return rows
    .filter((r) => isArmorOrAccessorySlot(r.slot))
    .map((r) => ({
      affixes: r.affix_json ? JSON.parse(r.affix_json) as EquipmentAffixEntry[] : [],
      statRoll: r.stat_roll_json ? JSON.parse(r.stat_roll_json) as EquipmentStatRoll : null,
      slot: r.slot,
      rarity: r.rarity,
    }));
}

export function getEquippedCombatAffixMods(db: Database.Database, userId: string): CombatAffixMods {
  const rows = getEquippedAffixRows(db, userId);
  return sumCombatAffixMods(rows.map((r) => r.affixes));
}

export function applyGodRollToInventoryRow(
  db: Database.Database,
  inventoryId: number,
  userId: string,
): boolean {
  const row = db.prepare(`
    SELECT pi.id, e.slot, i.rarity FROM player_inventory pi
    JOIN equipment e ON pi.item_id = e.item_id
    JOIN items i ON pi.item_id = i.id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as { id: number; slot: string; rarity: string } | undefined;
  if (!row || !isArmorOrAccessorySlot(row.slot)) return false;
  if (!['SSR', 'UR'].includes(row.rarity)) return false;
  const affixes = buildGodRollAffixes();
  db.prepare(`
    UPDATE player_inventory SET affix_json = ?, stat_roll_json = NULL, updated_at = ? WHERE id = ?
  `).run(serializeAffixes(affixes), nowIso(), inventoryId);
  return true;
}

export function formatAdditionalTraitsBlock(affixJson: string | null, statRollJson: string | null): string {
  const roll = parseEquipmentRoll(affixJson, statRollJson);
  if (!roll) return '';
  const lines: string[] = [];
  const statLines = formatStatRollLines(roll.statRoll);
  if (statLines.length) {
    lines.push('**個体補正**', ...statLines.map((l) => `・${l}`), '');
  }
  if (roll.affixes.length) {
    lines.push('**追加特性**', ...roll.affixes.map((a) => `・${formatAffixLine(a)}`));
  }
  return lines.join('\n');
}

export function clampCombatAffixMultiplier(dealt: number, taken: number): { dealt: number; taken: number } {
  return {
    dealt: Math.max(COMBAT_AFFIX_CLAMP.dealtMin, Math.min(COMBAT_AFFIX_CLAMP.dealtMax, dealt)),
    taken: Math.max(COMBAT_AFFIX_CLAMP.takenMin, Math.min(COMBAT_AFFIX_CLAMP.takenMax, taken)),
  };
}
