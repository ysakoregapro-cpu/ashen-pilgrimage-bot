import type { GameElement, AffinityTier } from '../db/seedData/elementMaster';
import {
  normalizeElement, getAffinityTier, getAffinityMultiplier, affinityLogText, ELEMENT_LABELS, GAME_ELEMENTS,
} from '../db/seedData/elementMaster';
import { getDb } from '../db/database';
import { DURABILITY_PENALTY, type DurabilityState } from '../types';

export { normalizeElement, getAffinityMultiplier, affinityLogText, ELEMENT_LABELS };
export type { GameElement, AffinityTier };

/** Max total elemental damage reduction from gear (per element). */
export const PLAYER_ELEMENT_RESIST_CAP = 0.5;

const ELEMENT_SET = new Set<string>(GAME_ELEMENTS);

function durPenalty(state: string | null | undefined): number {
  return DURABILITY_PENALTY[(state as DurabilityState) ?? '良好'] ?? 1;
}

function addResist(totals: Partial<Record<GameElement, number>>, el: GameElement, amount: number): void {
  if (amount <= 0) return;
  totals[el] = (totals[el] ?? 0) + amount;
}

function parseResistKey(key: string): GameElement | null {
  if (ELEMENT_SET.has(key)) return key as GameElement;
  if (key.endsWith('_resist')) {
    const base = key.slice(0, -'_resist'.length);
    if (ELEMENT_SET.has(base)) return base as GameElement;
  }
  return null;
}

function parseSpecialEffectResists(raw: string | null): Partial<Record<GameElement, number>> {
  const out: Partial<Record<GameElement, number>> = {};
  if (!raw) return out;
  try {
    if (raw.startsWith('{')) {
      const obj = JSON.parse(raw) as Record<string, number>;
      for (const [k, v] of Object.entries(obj)) {
        const el = parseResistKey(k);
        if (el && typeof v === 'number') addResist(out, el, v);
      }
      return out;
    }
    for (const part of raw.split(',')) {
      const [k, v] = part.split(':');
      const el = parseResistKey(k?.trim() ?? '');
      const n = parseFloat(v ?? '');
      if (el && !Number.isNaN(n)) addResist(out, el, n);
    }
  } catch { /* ignore */ }
  return out;
}

function parseMetadataResists(raw: string | null): Partial<Record<GameElement, number>> {
  const out: Partial<Record<GameElement, number>> = {};
  if (!raw) return out;
  try {
    const meta = JSON.parse(raw) as Record<string, unknown>;
    const block = meta.element_resist ?? meta.resistances;
    if (block && typeof block === 'object') {
      for (const [k, v] of Object.entries(block as Record<string, number>)) {
        const el = parseResistKey(k) ?? (ELEMENT_SET.has(k) ? (k as GameElement) : null);
        if (el && typeof v === 'number') addResist(out, el, v);
      }
    }
    for (const [k, v] of Object.entries(meta)) {
      const el = parseResistKey(k);
      if (el && typeof v === 'number') addResist(out, el, v);
    }
  } catch { /* ignore */ }
  return out;
}

export type GearResistSources = {
  resistances_json?: string | null;
  special_effect_json?: string | null;
  metadata_json?: string | null;
  durability_state?: string | null;
};

/** Resistances contributed by a single gear piece (after durability). */
export function getResistancesFromGearPiece(sources: GearResistSources): Partial<Record<GameElement, number>> {
  const out: Partial<Record<GameElement, number>> = {};
  const pen = durPenalty(sources.durability_state);
  try {
    const fromJson = JSON.parse(sources.resistances_json || '{}') as Record<string, number>;
    for (const [k, v] of Object.entries(fromJson)) {
      const el = normalizeElement(k);
      if (typeof v === 'number') addResist(out, el, v * pen);
    }
  } catch { /* ignore */ }
  for (const [el, v] of Object.entries(parseSpecialEffectResists(sources.special_effect_json ?? null))) {
    if (el) addResist(out, el as GameElement, v * pen);
  }
  for (const [el, v] of Object.entries(parseMetadataResists(sources.metadata_json ?? null))) {
    if (el) addResist(out, el as GameElement, v * pen);
  }
  return out;
}

export function mergeElementResists(
  base: Partial<Record<GameElement, number>>,
  add: Partial<Record<GameElement, number>>,
): Partial<Record<GameElement, number>> {
  const out = { ...base };
  for (const [k, v] of Object.entries(add)) {
    const el = k as GameElement;
    out[el] = (out[el] ?? 0) + (v ?? 0);
  }
  return out;
}

export function capElementResists(resists: Partial<Record<GameElement, number>>): Partial<Record<GameElement, number>> {
  const out: Partial<Record<GameElement, number>> = {};
  for (const [k, v] of Object.entries(resists)) {
    out[k as GameElement] = Math.min(PLAYER_ELEMENT_RESIST_CAP, v ?? 0);
  }
  return out;
}

/** Sum of all equipped gear resistances (capped per element). */
export function getPlayerElementResistances(userId: string): Partial<Record<GameElement, number>> {
  const rows = getDb().prepare(`
    SELECT pi.durability_state, pi.metadata_json, e.resistances_json, e.special_effect_json
    FROM player_equipment pe
    JOIN player_inventory pi ON pe.inventory_id = pi.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pe.user_id = ?
  `).all(userId) as GearResistSources[];

  let totals: Partial<Record<GameElement, number>> = {};
  for (const row of rows) {
    totals = mergeElementResists(totals, getResistancesFromGearPiece(row));
  }
  return capElementResists(totals);
}

export function formatElementResistLine(resists: Partial<Record<GameElement, number>>): string {
  const parts = Object.entries(resists)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k, v]) => `${ELEMENT_LABELS[k as GameElement] ?? k}耐性+${Math.round((v ?? 0) * 100)}%`);
  return parts.length ? parts.join(' / ') : '';
}

export function applyPlayerElementResist(
  damage: number,
  attackElement: string | null | undefined,
  playerResists: Partial<Record<GameElement, number>>,
): { damage: number; mitigated: number; logText: string | null } {
  const el = normalizeElement(attackElement);
  if (el === 'neutral') return { damage, mitigated: 0, logText: null };
  const resist = playerResists[el] ?? 0;
  if (resist <= 0) return { damage, mitigated: 0, logText: null };
  const newDmg = Math.max(1, Math.floor(damage * (1 - resist)));
  const mitigated = damage - newDmg;
  if (mitigated <= 0) return { damage, mitigated: 0, logText: null };
  return {
    damage: newDmg,
    mitigated,
    logText: `${ELEMENT_LABELS[el]}属性の耐性が、ダメージを和らげた。（-${mitigated}）`,
  };
}

export function resolveAttackElement(opts: {
  skillElement?: string | null;
  weaponElement?: string | null;
  defaultElement?: GameElement;
}): GameElement {
  if (opts.skillElement) return normalizeElement(opts.skillElement);
  if (opts.weaponElement) return normalizeElement(opts.weaponElement);
  return opts.defaultElement ?? 'neutral';
}

export function resolveDefenseElements(monster: {
  element?: string | null;
  weaknesses_json?: string | null;
  resistances_json?: string | null;
}): { element: GameElement; weaknesses: GameElement[]; resistances: GameElement[] } {
  const element = normalizeElement(monster.element);
  let weaknesses: GameElement[] = [];
  let resistances: GameElement[] = [];
  try {
    if (monster.weaknesses_json) weaknesses = JSON.parse(monster.weaknesses_json).map(normalizeElement);
    if (monster.resistances_json) resistances = JSON.parse(monster.resistances_json).map(normalizeElement);
  } catch { /* ignore */ }
  return { element, weaknesses, resistances };
}

/** Combined multiplier: matrix + explicit weakness/resist lists */
export function calcElementDamageMultiplier(
  attackElement: GameElement,
  defender: { element?: string | null; weaknesses_json?: string | null; resistances_json?: string | null },
  playerResists?: Partial<Record<GameElement, number>>,
): { multiplier: number; tier: AffinityTier; logText: string | null } {
  const def = resolveDefenseElements(defender);
  let tier = getAffinityTier(attackElement, def.element);

  if (def.weaknesses.includes(attackElement)) tier = tier === 'neutral' ? 'weak' : 'major_weak';
  if (def.resistances.includes(attackElement)) tier = tier === 'neutral' ? 'resist' : 'major_resist';

  let multiplier = getAffinityMultiplier(attackElement, def.element);
  if (def.weaknesses.includes(attackElement)) multiplier = Math.max(multiplier, 1.25);
  if (def.resistances.includes(attackElement)) multiplier = Math.min(multiplier, 0.75);

  if (playerResists && attackElement in playerResists) {
    multiplier *= (1 - (playerResists[attackElement] ?? 0));
  }

  return { multiplier, tier, logText: affinityLogText(tier, attackElement) };
}

export function applyElementToDamage(baseDamage: number, mult: number): number {
  return Math.max(1, Math.floor(baseDamage * mult));
}
