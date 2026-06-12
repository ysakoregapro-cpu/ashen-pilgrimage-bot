/**
 * Phase4: 複数エンカウント生成 — area rank別出現率と編成制限。
 */
import { getMonsterThreatTier, type ThreatTier } from './combatMath';
import { getAreaRank } from './townLootSystem';
import { roll, weightedChoice } from '../utils/random';

export type EncounterSize = 1 | 2 | 3;

/** rank別 1体/2体/3体 出現率（weight） */
export const ENCOUNTER_SIZE_WEIGHTS: Record<number, { one: number; two: number; three: number }> = {
  1: { one: 90, two: 10, three: 0 },
  2: { one: 90, two: 10, three: 0 },
  3: { one: 80, two: 18, three: 2 },
  4: { one: 80, two: 18, three: 2 },
  5: { one: 70, two: 25, three: 5 },
  6: { one: 70, two: 25, three: 5 },
};

function weightsForRank(rank: number): { one: number; two: number; three: number } {
  if (rank >= 7) return { one: 65, two: 28, three: 7 };
  return ENCOUNTER_SIZE_WEIGHTS[Math.min(6, Math.max(1, rank))] ?? ENCOUNTER_SIZE_WEIGHTS[1]!;
}

export function rollEncounterSize(areaRank: number, opts?: { forceSingle?: boolean }): EncounterSize {
  if (opts?.forceSingle) return 1;
  const w = weightsForRank(areaRank);
  const pick = weightedChoice([
    { size: 1 as EncounterSize, weight: w.one },
    { size: 2 as EncounterSize, weight: w.two },
    { size: 3 as EncounterSize, weight: w.three },
  ]);
  return pick.size;
}

export function getEncounterSizeRates(areaRank: number): { one: number; two: number; three: number } {
  const w = weightsForRank(areaRank);
  const total = w.one + w.two + w.three;
  return {
    one: w.one / total,
    two: w.two / total,
    three: w.three / total,
  };
}

const FORBIDDEN_PACKS: Array<(tiers: ThreatTier[]) => boolean> = [
  (t) => t.filter((x) => x === 'rare').length >= 2,
  (t) => t.filter((x) => x === 'elite').length >= 2,
  (t) => t.some((x) => x === 'rare') && t.some((x) => x === 'elite'),
  (t) => t.some((x) => x === 'rare') && t.some((x) => x === 'tough'),
  (t) => t.filter((x) => x === 'elite').length >= 1 && t.some((x) => x === 'tough'),
  (t) => t.some((x) => x === 'boss'),
];

function isPackAllowed(monsterIds: string[]): boolean {
  const tiers = monsterIds.map((id) => getMonsterThreatTier(id));
  if (tiers.some((t) => t === 'boss')) return monsterIds.length === 1;
  for (const rule of FORBIDDEN_PACKS) {
    if (rule(tiers)) return false;
  }
  const elites = tiers.filter((t) => t === 'elite').length;
  const rares = tiers.filter((t) => t === 'rare').length;
  if (elites >= 1 && monsterIds.length > 1) {
    const others = tiers.filter((t) => t !== 'elite');
    if (others.some((t) => t !== 'normal')) return false;
    if (monsterIds.length > 2) return false;
  }
  if (rares >= 1 && monsterIds.length > 1) return false;
  const toughCount = tiers.filter((t) => t === 'tough').length;
  if (toughCount >= 2 && tiers.some((t) => t === 'normal' || t === 'tough') && monsterIds.length >= 3) {
    const minRank = 5; // enforced at pick time
    void minRank;
  }
  if (toughCount >= 2 && monsterIds.length === 2) return true;
  if (toughCount >= 1 && monsterIds.length === 3) {
    const normals = tiers.filter((t) => t === 'normal').length;
    if (normals < 1) return false;
  }
  return true;
}

function canMultiSpawn(threat: ThreatTier): boolean {
  return threat === 'normal' || threat === 'tough';
}

/** 探索用: モンスタープールから編成を生成 */
export function pickEncounterMonsters(
  pool: Array<{ monster_id: string; weight: number }>,
  areaId: string,
  opts?: { forceSingle?: boolean },
): string[] {
  if (!pool.length) return [];
  const rank = getAreaRank(areaId);
  const size = rollEncounterSize(rank, opts);
  if (size === 1) {
    const pick = weightedChoice(pool);
    return [pick.monster_id];
  }

  const primary = weightedChoice(pool);
  const primaryThreat = getMonsterThreatTier(primary.monster_id);
  if (!canMultiSpawn(primaryThreat) || primaryThreat === 'rare' || primaryThreat === 'elite') {
    return [primary.monster_id];
  }

  const pack: string[] = [primary.monster_id];
  const maxAttempts = 12;
  for (let attempt = 0; attempt < maxAttempts && pack.length < size; attempt++) {
    const candidate = weightedChoice(pool);
    const trial = [...pack, candidate.monster_id];
    const tiers = trial.map((id) => getMonsterThreatTier(id));
    if (!isPackAllowed(trial)) continue;
    if (tiers.some((t) => t === 'rare' || t === 'elite' || t === 'boss')) continue;
    if (pack.includes(candidate.monster_id) && roll(0.55)) continue;
    if (tiers.filter((t) => t === 'tough').length >= 2 && rank < 5) continue;
    if (trial.length === 3 && tiers.filter((t) => t === 'tough').length >= 1 && rank < 7) continue;
    pack.push(candidate.monster_id);
  }

  if (!isPackAllowed(pack)) return [primary.monster_id];
  return pack;
}

/** 複数敵の攻撃力倍率（各敵） */
export function perEnemyAttackMult(partySize: EncounterSize, areaRank: number): number {
  if (partySize <= 1) return 1;
  if (partySize === 2) return areaRank <= 3 ? 0.72 : 0.74;
  return areaRank <= 4 ? 0.54 : 0.57;
}

/** 複数敵のHP倍率（各敵） */
export function perEnemyHpMult(partySize: EncounterSize): number {
  if (partySize <= 1) return 1;
  if (partySize === 2) return 0.92;
  return 0.88;
}

/** 合計火力倍率（単体比） */
export function totalAttackPowerMult(partySize: EncounterSize, areaRank: number): number {
  return partySize * perEnemyAttackMult(partySize, areaRank);
}

/** 報酬倍率（単体比・合計） */
export function encounterRewardMult(partySize: EncounterSize, hasRareOrElite: boolean): number {
  if (partySize <= 1) return 1;
  if (hasRareOrElite) return 1.15;
  if (partySize === 2) return 1.45;
  return 1.75;
}

/** tough複数時の追加火力抑制 */
export function toughPackAttackPenalty(toughCount: number, partySize: EncounterSize): number {
  if (toughCount < 2 || partySize < 2) return 1;
  return partySize === 2 ? 0.88 : 0.82;
}

export function validateEncounterPack(monsterIds: string[]): { ok: boolean; reason?: string } {
  if (!monsterIds.length) return { ok: false, reason: 'empty' };
  if (!isPackAllowed(monsterIds)) return { ok: false, reason: 'forbidden_composition' };
  return { ok: true };
}
