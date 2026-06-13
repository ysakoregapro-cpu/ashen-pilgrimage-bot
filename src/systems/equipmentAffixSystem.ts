import type Database from 'better-sqlite3';
import { getDb } from '../db/database';
import { nowIso, SLOT_LABELS } from '../types';
import { calcUpgradeStatBonuses } from './enhanceSystem';
import { resolveEquipmentEnhanceLevels } from './equipmentEffectiveStats';
import {
  AFFIX_LABELS,
  type AffixDrawbackKey,
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

/** プロフィール表示用 — 厳選効果キーの日本語ラベル（既存 AffixPrimaryKey のみ） */
export const PROFILE_AFFIX_LABELS: Record<AffixPrimaryKey, string> = {
  hp_percent: '最大HP',
  mp_percent: '最大MP',
  attack_percent: '攻撃',
  magic_percent: '魔力',
  defense_percent: '防御',
  speed_percent: '速度',
  crit_percent: '会心',
  damage_dealt_percent: '与ダメージ',
  damage_taken_reduction_percent: '被ダメージ',
};

const PROFILE_PARAM_ORDER: AffixPrimaryKey[] = [
  'hp_percent', 'mp_percent', 'attack_percent', 'magic_percent',
  'defense_percent', 'speed_percent', 'crit_percent',
];

const PROFILE_SLOT_ORDER = ['weapon', 'head', 'body', 'arms', 'legs', 'feet', 'accessory1', 'accessory2'] as const;

const STAT_ROLL_FLAT_LABELS: Record<string, string> = {
  hp: 'HP', mp: 'MP', attack: '攻撃', magic: '魔力', defense: '防御', speed: '速度', crit: '会心',
};

const DRAWBACK_TO_PRIMARY: Record<AffixDrawbackKey, AffixPrimaryKey> = {
  hp_down_percent: 'hp_percent',
  mp_down_percent: 'mp_percent',
  attack_down_percent: 'attack_percent',
  magic_down_percent: 'magic_percent',
  defense_down_percent: 'defense_percent',
  speed_down_percent: 'speed_percent',
  damage_dealt_down_percent: 'damage_dealt_percent',
  damage_taken_increase_percent: 'damage_taken_reduction_percent',
};

const DISCORD_FIELD_MAX = 1024;
const PROFILE_DISPLAY_SOFT_MAX = 980;

export type StatRollFlatTotals = {
  hp: number; mp: number; attack: number; magic: number; defense: number; speed: number; crit: number;
};

export type DrawbackSummaryEntry = { key: AffixDrawbackKey; label: string; value: number };

export type SlotEffectSummary = {
  slot: string;
  slotLabel: string;
  itemName: string;
  parts: string[];
};

export type EquippedSummaryInput = {
  slot: string;
  itemName: string;
  upgrade_level: number;
  src_level: number;
  durability_state: string;
  attack_bonus: number;
  magic_bonus: number;
  defense_bonus: number;
  spirit_bonus: number;
  speed_bonus: number;
  hp_bonus: number;
  mp_bonus: number;
  crit_rate_bonus: number;
  weapon_type: string | null;
  rarity: string;
  affixes: EquipmentAffixEntry[];
  statRoll: EquipmentStatRoll | null;
};

export type EquippedAffixSummary = {
  equippedCount: number;
  statRollFlat: StatRollFlatTotals;
  affixBenefits: Partial<Record<AffixPrimaryKey, number>>;
  drawbacks: DrawbackSummaryEntry[];
  combatMods: CombatAffixMods;
  battleMults: { dealt: number; taken: number };
  slotBreakdown: SlotEffectSummary[];
  hasAnyEffect: boolean;
};

function emptyStatRollFlat(): StatRollFlatTotals {
  return { hp: 0, mp: 0, attack: 0, magic: 0, defense: 0, speed: 0, crit: 0 };
}

function durabilityPenalty(state: string): number {
  if (state === '破損') return 0.7;
  if (state === '損傷') return 0.85;
  if (state === '摩耗') return 0.95;
  return 1;
}

function addStatRollFlat(a: StatRollFlatTotals, b: StatRollFlatTotals): StatRollFlatTotals {
  return {
    hp: a.hp + b.hp, mp: a.mp + b.mp, attack: a.attack + b.attack, magic: a.magic + b.magic,
    defense: a.defense + b.defense, speed: a.speed + b.speed, crit: a.crit + b.crit,
  };
}

function computeItemStatRollFlatDelta(row: EquippedSummaryInput): StatRollFlatTotals {
  const mults = row.statRoll?.multipliers ?? {};
  if (!Object.keys(mults).length) return emptyStatRollFlat();

  const durPenalty = durabilityPenalty(row.durability_state);
  const levels = resolveEquipmentEnhanceLevels({
    rarity: row.rarity,
    upgrade_level: row.upgrade_level,
    src_level: row.src_level,
  });
  const stats = calcUpgradeStatBonuses(
    {
      attack_bonus: row.attack_bonus, magic_bonus: row.magic_bonus, defense_bonus: row.defense_bonus,
      spirit_bonus: row.spirit_bonus, speed_bonus: row.speed_bonus, hp_bonus: row.hp_bonus,
      slot: row.slot, weapon_type: row.weapon_type,
    },
    levels.upgrade_level,
    levels.src_level,
    durPenalty,
    row.rarity,
  );
  const baseMp = Math.floor(row.mp_bonus * durPenalty);
  const delta = emptyStatRollFlat();
  delta.attack = applyStatRollMultiplier(stats.attack, mults.attack) - stats.attack;
  delta.magic = applyStatRollMultiplier(stats.magic, mults.magic) - stats.magic;
  delta.defense = applyStatRollMultiplier(stats.defense, mults.defense) - stats.defense;
  delta.speed = applyStatRollMultiplier(stats.speed, mults.speed) - stats.speed;
  delta.hp = applyStatRollMultiplier(stats.hp, mults.hp) - stats.hp;
  delta.mp = applyStatRollMultiplier(baseMp, mults.mp) - baseMp;
  delta.crit = applyStatRollMultiplier(row.crit_rate_bonus, mults.crit) - row.crit_rate_bonus;
  return delta;
}

function sumAffixBenefits(affixLists: EquipmentAffixEntry[][]): Partial<Record<AffixPrimaryKey, number>> {
  const out: Partial<Record<AffixPrimaryKey, number>> = {};
  for (const affixes of affixLists) {
    for (const a of affixes) {
      out[a.key] = (out[a.key] ?? 0) + a.value;
    }
  }
  return out;
}

function collectDrawbackEntries(affixLists: EquipmentAffixEntry[][]): DrawbackSummaryEntry[] {
  const totals: Partial<Record<AffixDrawbackKey, number>> = {};
  for (const affixes of affixLists) {
    for (const a of affixes) {
      if (a.drawbackKey && a.drawbackValue > 0) {
        totals[a.drawbackKey] = (totals[a.drawbackKey] ?? 0) + a.drawbackValue;
      }
    }
  }
  return (Object.entries(totals) as Array<[AffixDrawbackKey, number]>).map(([key, value]) => ({
    key,
    label: PROFILE_AFFIX_LABELS[DRAWBACK_TO_PRIMARY[key]],
    value,
  }));
}

export function computeBattleAffixMultsFromMods(mods: CombatAffixMods): { dealt: number; taken: number } {
  return clampCombatAffixMultiplier(
    1 + mods.damage_dealt_pct / 100 - mods.damage_dealt_down_pct / 100,
    1 - mods.damage_taken_reduction_pct / 100 + mods.damage_taken_increase_pct / 100,
  );
}

function formatProfileSignedPercent(label: string, value: number): string {
  return `${label} ${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatProfileAffixBenefitLine(key: AffixPrimaryKey, value: number): string | null {
  if (Math.abs(value) < 0.05) return null;
  const label = PROFILE_AFFIX_LABELS[key];
  if (key === 'damage_taken_reduction_percent') {
    return formatProfileSignedPercent(label, -value);
  }
  return formatProfileSignedPercent(label, value);
}

function formatProfileAffixPart(key: AffixPrimaryKey, value: number): string {
  const label = PROFILE_AFFIX_LABELS[key];
  if (key === 'damage_taken_reduction_percent') {
    return `${label} -${value.toFixed(1)}%`;
  }
  return `${label} +${value.toFixed(1)}%`;
}

function formatProfileDrawbackPart(drawbackKey: AffixDrawbackKey, value: number): string {
  const primary = DRAWBACK_TO_PRIMARY[drawbackKey];
  const label = PROFILE_AFFIX_LABELS[primary];
  if (drawbackKey === 'damage_taken_increase_percent') {
    return `${label} +${value.toFixed(1)}%`;
  }
  if (drawbackKey === 'damage_dealt_down_percent') {
    return `${label} -${value.toFixed(1)}%`;
  }
  return `${label} -${value.toFixed(1)}%`;
}

function formatStatRollFlatLine(totals: StatRollFlatTotals): string | null {
  const parts: string[] = [];
  for (const [key, label] of Object.entries(STAT_ROLL_FLAT_LABELS)) {
    const val = totals[key as keyof StatRollFlatTotals];
    if (val !== 0) parts.push(`${label} ${val >= 0 ? '+' : ''}${val}`);
  }
  return parts.length ? parts.join(' / ') : null;
}

function buildSlotEffectParts(row: EquippedSummaryInput, flat: StatRollFlatTotals): string[] {
  const parts: string[] = [];
  for (const [key, label] of Object.entries(STAT_ROLL_FLAT_LABELS)) {
    const val = flat[key as keyof StatRollFlatTotals];
    if (val !== 0) parts.push(`${label} ${val >= 0 ? '+' : ''}${val}`);
  }
  for (const a of row.affixes) {
    parts.push(formatProfileAffixPart(a.key, a.value));
    if (a.drawbackKey && a.drawbackValue > 0) {
      parts.push(formatProfileDrawbackPart(a.drawbackKey, a.drawbackValue));
    }
  }
  return parts.slice(0, 3);
}

function statRollFlatHasValue(totals: StatRollFlatTotals): boolean {
  return Object.values(totals).some((v) => v !== 0);
}

export function getEquippedSummaryRows(db: Database.Database, userId: string): EquippedSummaryInput[] {
  const rows = db.prepare(`
    SELECT pi.upgrade_level, pi.src_level, pi.durability_state, pi.affix_json, pi.stat_roll_json,
           e.slot, e.attack_bonus, e.magic_bonus, e.defense_bonus, e.spirit_bonus, e.speed_bonus,
           e.hp_bonus, e.mp_bonus, e.crit_rate_bonus, e.weapon_type,
           i.name AS item_name, i.rarity
    FROM player_equipment pe
    JOIN player_inventory pi ON pe.inventory_id = pi.id
    JOIN equipment e ON pi.item_id = e.item_id
    JOIN items i ON pi.item_id = i.id
    WHERE pe.user_id = ?
  `).all(userId) as Array<{
    upgrade_level: number; src_level: number; durability_state: string;
    affix_json: string | null; stat_roll_json: string | null;
    slot: string; attack_bonus: number; magic_bonus: number; defense_bonus: number;
    spirit_bonus: number; speed_bonus: number; hp_bonus: number; mp_bonus: number;
    crit_rate_bonus: number; weapon_type: string | null; item_name: string; rarity: string;
  }>;

  return rows.map((r) => ({
    slot: r.slot,
    itemName: r.item_name,
    upgrade_level: r.upgrade_level,
    src_level: r.src_level,
    durability_state: r.durability_state,
    attack_bonus: r.attack_bonus,
    magic_bonus: r.magic_bonus,
    defense_bonus: r.defense_bonus,
    spirit_bonus: r.spirit_bonus,
    speed_bonus: r.speed_bonus,
    hp_bonus: r.hp_bonus,
    mp_bonus: r.mp_bonus,
    crit_rate_bonus: r.crit_rate_bonus,
    weapon_type: r.weapon_type,
    rarity: r.rarity,
    affixes: isArmorOrAccessorySlot(r.slot) && r.affix_json
      ? JSON.parse(r.affix_json) as EquipmentAffixEntry[]
      : [],
    statRoll: r.stat_roll_json ? JSON.parse(r.stat_roll_json) as EquipmentStatRoll : null,
  }));
}

export function buildEquipmentAffixSummary(rows: EquippedSummaryInput[]): EquippedAffixSummary {
  let statRollFlat = emptyStatRollFlat();
  const slotBreakdown: SlotEffectSummary[] = [];
  const armorAffixLists: EquipmentAffixEntry[][] = [];

  for (const row of rows) {
    const flat = computeItemStatRollFlatDelta(row);
    statRollFlat = addStatRollFlat(statRollFlat, flat);
    if (isArmorOrAccessorySlot(row.slot) && row.affixes.length) {
      armorAffixLists.push(row.affixes);
    }
    const parts = buildSlotEffectParts(row, flat);
    if (parts.length) {
      slotBreakdown.push({
        slot: row.slot,
        slotLabel: SLOT_LABELS[row.slot] ?? row.slot,
        itemName: row.itemName,
        parts,
      });
    }
  }

  const affixBenefits = sumAffixBenefits(armorAffixLists);
  const drawbacks = collectDrawbackEntries(armorAffixLists);
  const combatMods = sumCombatAffixMods(armorAffixLists);
  const battleMults = computeBattleAffixMultsFromMods(combatMods);
  const hasAnyEffect = statRollFlatHasValue(statRollFlat)
    || Object.keys(affixBenefits).length > 0
    || drawbacks.length > 0;

  return {
    equippedCount: rows.length,
    statRollFlat,
    affixBenefits,
    drawbacks,
    combatMods,
    battleMults,
    slotBreakdown,
    hasAnyEffect,
  };
}

export function formatAffixSummaryLines(summary: EquippedAffixSummary): string[] {
  if (!summary.hasAnyEffect) return ['なし'];

  const lines: string[] = [];
  const statLine = formatStatRollFlatLine(summary.statRollFlat);
  if (statLine) {
    lines.push('個体差ボーナス:', statLine, '');
  }

  const affixLines: string[] = [];
  for (const key of PROFILE_PARAM_ORDER) {
    const line = formatProfileAffixBenefitLine(key, summary.affixBenefits[key] ?? 0);
    if (line) affixLines.push(line);
  }
  for (const key of ['damage_dealt_percent', 'damage_taken_reduction_percent'] as const) {
    const line = formatProfileAffixBenefitLine(key, summary.affixBenefits[key] ?? 0);
    if (line) affixLines.push(line);
  }
  if (affixLines.length) {
    lines.push('ランダム特性:', ...affixLines, '');
  }

  if (summary.drawbacks.length) {
    lines.push('デメリット:', ...summary.drawbacks.map((d) => formatProfileDrawbackPart(d.key, d.value)), '');
  } else if (affixLines.length) {
    lines.push('デメリット: なし', '');
  }

  const slotLines: string[] = [];
  for (const slot of PROFILE_SLOT_ORDER) {
    const row = summary.slotBreakdown.find((s) => s.slot === slot);
    if (!row?.parts.length) continue;
    const namePrefix = row.itemName ? `${row.itemName} — ` : '';
    slotLines.push(`${row.slotLabel}: ${namePrefix}${row.parts.join(' / ')}`);
  }
  if (slotLines.length) {
    lines.push('【部位別】', ...slotLines);
  }

  return lines;
}

function trimAffixSummaryDisplay(text: string): string {
  if (text.length <= PROFILE_DISPLAY_SOFT_MAX) return text;
  const marker = '\n【部位別】';
  const idx = text.indexOf(marker);
  if (idx >= 0) {
    const head = text.slice(0, idx).trimEnd();
    if (head.length <= PROFILE_DISPLAY_SOFT_MAX) return `${head}\n\n（部位別は省略）`;
  }
  return `${text.slice(0, PROFILE_DISPLAY_SOFT_MAX - 1)}…`;
}

export function formatAffixSummaryText(summary: EquippedAffixSummary): string {
  const text = formatAffixSummaryLines(summary).join('\n').trim();
  if (text.length > DISCORD_FIELD_MAX) {
    return trimAffixSummaryDisplay(text.slice(0, DISCORD_FIELD_MAX - 1));
  }
  return trimAffixSummaryDisplay(text);
}

export function summarizeEquippedAffixEffects(userId: string): EquippedAffixSummary & { displayText: string } {
  const db = getDb();
  const rows = getEquippedSummaryRows(db, userId);
  const summary = buildEquipmentAffixSummary(rows);
  return { ...summary, displayText: formatAffixSummaryText(summary) };
}

export type EquippedAffixProfileRow = EquippedSummaryInput;

export function formatEquippedAffixProfileFromRows(rows: EquippedAffixProfileRow[]): string {
  return formatAffixSummaryText(buildEquipmentAffixSummary(rows));
}

export function formatEquippedAffixProfileBlock(userId: string): string {
  return summarizeEquippedAffixEffects(userId).displayText;
}
